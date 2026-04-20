from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from backend.db.connection import get_connection
from backend.services.token_store import get_token

LANG_NAMES = {
    "EN": "English", "EN-US": "English", "EN-GB": "English",
    "DE": "German",
    "JA": "Japanese",
    "KO": "Korean",
    "FR": "French",
    "ES": "Spanish",
    "IT": "Italian",
    "PT": "Portuguese",
    "TH": "Thai",
    "VI": "Vietnamese",
    "ID": "Indonesian",
}

router = APIRouter()


# ── Request / Response models ──────────────────────────────────────────────

class TranslateRequest(BaseModel):
    store_handle: str
    product_id: str
    image_url: str
    target_languages: list[str]  # e.g. ["EN-US", "DE", "JA"]


class TranslateResponse(BaseModel):
    job_id: str


# ── DB helpers ─────────────────────────────────────────────────────────────

def _get_store_id(handle: str) -> str | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM imagelingo.stores WHERE handle = %s", (handle,))
            row = cur.fetchone()
    return str(row[0]) if row else None


def _create_job(store_id: str, product_id: str, image_url: str, langs: list[str]) -> str:
    job_id = str(uuid.uuid4())
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO imagelingo.translation_jobs
                  (id, store_id, product_id, original_image_url, target_languages, status)
                VALUES (%s, %s, %s, %s, %s, 'pending')
                """,
                (job_id, store_id, product_id, image_url, langs),
            )
        conn.commit()
    return job_id


def _update_job_status(job_id: str, status: str, error_msg: str = None):
    completed_at = datetime.now(timezone.utc) if status in ("done", "failed") else None
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE imagelingo.translation_jobs
                SET status = %s, error_msg = %s, completed_at = %s
                WHERE id = %s
                """,
                (status, error_msg, completed_at, job_id),
            )
        conn.commit()


def _save_translated_image(job_id: str, language: str, output_url: str):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO imagelingo.translated_images (job_id, language, output_url)
                VALUES (%s, %s, %s)
                """,
                (job_id, language, output_url),
            )
        conn.commit()


def _increment_usage(store_id: str):
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO imagelingo.usage_logs (store_id, month, images_translated)
                VALUES (%s, %s, 1)
                ON CONFLICT (store_id, month) DO UPDATE
                  SET images_translated = imagelingo.usage_logs.images_translated + 1,
                      updated_at = NOW()
                """,
                (store_id, month),
            )
        conn.commit()


def _check_quota(store_id: str) -> bool:
    """Returns True if the store is within its monthly quota."""
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COALESCE(ul.images_translated, 0), COALESCE(s.images_limit, 5)
                FROM imagelingo.subscriptions s
                LEFT JOIN imagelingo.usage_logs ul
                  ON ul.store_id = s.store_id AND ul.month = %s
                WHERE s.store_id = %s
                """,
                (month, store_id),
            )
            row = cur.fetchone()

    if not row:
        # No subscription row yet → treat as free (limit 5)
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT COALESCE(images_translated, 0) FROM imagelingo.usage_logs "
                    "WHERE store_id = %s AND month = %s",
                    (store_id, month),
                )
                usage_row = cur.fetchone()
        used = usage_row[0] if usage_row else 0
        return used < 5

    used, limit = row
    return used < limit


# ── Background pipeline ────────────────────────────────────────────────────

async def _run_pipeline(job_id: str, store_id: str, image_url: str, target_languages: list[str]):
    from backend.services.lovart_service import LovartService
    from backend.services.cloudinary_service import CloudinaryService

    _update_job_status(job_id, "processing")

    try:
        lovart_svc = LovartService()
        cloudinary_svc = CloudinaryService()

        for lang in target_languages:
            lang_name = LANG_NAMES.get(lang.upper(), lang)
            translated_url = await lovart_svc.translate_image(image_url, lang_name)

            # Upload to Cloudinary for persistent storage
            public_id = f"{job_id}_{lang.replace('-', '_').lower()}"
            output_url = await cloudinary_svc.upload_image_from_url(translated_url, public_id)

            _save_translated_image(job_id, lang, output_url)

        _update_job_status(job_id, "done")
        _increment_usage(store_id)

    except Exception as exc:
        _update_job_status(job_id, "failed", str(exc))


# ── Routes ─────────────────────────────────────────────────────────────────

@router.post("/", response_model=TranslateResponse)
async def start_translation(req: TranslateRequest, background_tasks: BackgroundTasks):
    # Validate token
    token = get_token(req.store_handle)
    if not token:
        raise HTTPException(status_code=401, detail="Store not authenticated or token expired")

    store_id = _get_store_id(req.store_handle)
    if not store_id:
        raise HTTPException(status_code=404, detail="Store not found")

    # Check quota
    if not _check_quota(store_id):
        raise HTTPException(status_code=429, detail="Monthly translation quota exceeded")

    job_id = _create_job(store_id, req.product_id, req.image_url, req.target_languages)

    background_tasks.add_task(
        _run_pipeline, job_id, store_id, req.image_url, req.target_languages
    )

    return TranslateResponse(job_id=job_id)


@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status, error_msg FROM imagelingo.translation_jobs WHERE id = %s",
                (job_id,),
            )
            job = cur.fetchone()
            if not job:
                raise HTTPException(status_code=404, detail="Job not found")

            status, error_msg = job

            cur.execute(
                "SELECT language, output_url FROM imagelingo.translated_images WHERE job_id = %s",
                (job_id,),
            )
            rows = cur.fetchall()

    results = {lang: url for lang, url in rows}
    return {"status": status, "results": results, "error": error_msg}
