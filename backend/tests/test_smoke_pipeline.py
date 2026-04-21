"""
Smoke tests for the ImageLingo translation pipeline.

Mock all external services (Lovart, Cloudinary, DB) — no real credentials needed.

Run:
    cd <repo-root>
    pytest backend/tests/test_smoke_pipeline.py -v
"""
import asyncio
import os
import uuid
from unittest.mock import AsyncMock, patch

import pytest

FAKE_JOB_ID = str(uuid.uuid4())
FAKE_STORE_ID = str(uuid.uuid4())
FAKE_TRANSLATED_URL = "https://res.cloudinary.com/demo/image/upload/imagelingo/test.png"
FAKE_LOVART_URL = "https://cdn.lovart.ai/result/test.png"


class TestLovartResultParsing:
    def _make_result(self, artifact_type="image", content=FAKE_LOVART_URL):
        return {"items": [{"artifacts": [{"type": artifact_type, "content": content}]}]}

    def test_finds_image_artifact(self):
        result = self._make_result()
        found = None
        for item in result.get("items", []):
            for a in item.get("artifacts", []):
                if a.get("type") == "image":
                    found = a.get("content")
        assert found == FAKE_LOVART_URL

    def test_no_image_artifact(self):
        result = self._make_result("video", "https://cdn.lovart.ai/video.mp4")
        found = None
        for item in result.get("items", []):
            for a in item.get("artifacts", []):
                if a.get("type") == "image":
                    found = a.get("content")
        assert found is None


class TestCloudinaryServiceMocked:
    def test_upload_from_url(self):
        with patch.dict(os.environ, {"CLOUDINARY_CLOUD_NAME": "demo", "CLOUDINARY_API_KEY": "k", "CLOUDINARY_API_SECRET": "s"}):
            with patch("cloudinary.uploader.upload", return_value={"secure_url": FAKE_TRANSLATED_URL}):
                from backend.services.cloudinary_service import CloudinaryService
                svc = CloudinaryService()
                result = asyncio.run(svc.upload_image_from_url(FAKE_LOVART_URL, "test_id"))
                assert result == FAKE_TRANSLATED_URL


class TestPipelineMocked:
    def _run(self, job_id, store_id, image_url, langs):
        translated: list[tuple] = []
        status: dict = {"status": "pending", "error_msg": None}

        def upd(jid, s, e=None):
            status["status"] = s
            status["error_msg"] = e

        def save(jid, lang, url):
            translated.append((lang, url))

        with (
            patch("backend.routes.translate._update_job_status", side_effect=upd),
            patch("backend.routes.translate._save_translated_image", side_effect=save),
            patch("backend.routes.translate._increment_usage"),
            patch.dict(os.environ, {
                "LOVART_ACCESS_KEY": "ak", "LOVART_SECRET_KEY": "sk",
                "CLOUDINARY_CLOUD_NAME": "d", "CLOUDINARY_API_KEY": "k", "CLOUDINARY_API_SECRET": "s",
            }),
            patch("backend.services.lovart_service.LovartService.translate_image", new=AsyncMock(return_value=FAKE_LOVART_URL)),
            patch("cloudinary.uploader.upload", return_value={"secure_url": FAKE_TRANSLATED_URL}),
        ):
            from backend.routes.translate import _run_pipeline
            asyncio.run(_run_pipeline(job_id, store_id, image_url, langs))
        return status, translated

    def test_pipeline_done(self):
        s, imgs = self._run(str(uuid.uuid4()), str(uuid.uuid4()), "https://example.com/img.jpg", ["EN-US", "DE"])
        assert s["status"] == "done"
        assert len(imgs) == 2
        assert {l for l, _ in imgs} == {"EN-US", "DE"}

    def test_pipeline_failed(self):
        status: dict = {"status": "pending", "error_msg": None}

        def upd(jid, s, e=None):
            status["status"] = s
            status["error_msg"] = e

        with (
            patch("backend.routes.translate._update_job_status", side_effect=upd),
            patch("backend.routes.translate._save_translated_image"),
            patch("backend.routes.translate._increment_usage"),
            patch.dict(os.environ, {
                "LOVART_ACCESS_KEY": "ak", "LOVART_SECRET_KEY": "sk",
                "CLOUDINARY_CLOUD_NAME": "d", "CLOUDINARY_API_KEY": "k", "CLOUDINARY_API_SECRET": "s",
            }),
            patch("backend.services.lovart_service.LovartService.translate_image", new=AsyncMock(side_effect=ValueError("aborted"))),
        ):
            from backend.routes.translate import _run_pipeline
            asyncio.run(_run_pipeline(str(uuid.uuid4()), str(uuid.uuid4()), "https://example.com/img.jpg", ["EN-US"]))
        assert status["status"] == "failed"
        assert "aborted" in (status["error_msg"] or "")


class TestEnvValidation:
    def test_missing_keys(self):
        from backend.config import validate_env
        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(RuntimeError) as exc:
                validate_env(["LOVART_ACCESS_KEY"])
        assert "LOVART_ACCESS_KEY" in str(exc.value)

    def test_present_keys(self):
        from backend.config import validate_env
        with patch.dict(os.environ, {"LOVART_ACCESS_KEY": "x", "LOVART_SECRET_KEY": "y"}):
            validate_env(["LOVART_ACCESS_KEY", "LOVART_SECRET_KEY"])


class TestQuotaCheck:
    """Test the 402 quota logic."""

    def test_check_quota_returns_tuple(self):
        """Verify _check_quota returns (bool, int, int)."""
        from backend.routes.translate import _check_quota
        # Mock DB to return used=4, limit=5
        with patch("backend.routes.translate.get_connection") as mock_conn:
            ctx = mock_conn.return_value.__enter__.return_value
            cur = ctx.cursor.return_value.__enter__.return_value
            cur.fetchone.return_value = (4, 5)
            ok, used, limit = _check_quota("fake-store-id")
            assert ok is True
            assert used == 4
            assert limit == 5

    def test_check_quota_exceeded(self):
        from backend.routes.translate import _check_quota
        with patch("backend.routes.translate.get_connection") as mock_conn:
            ctx = mock_conn.return_value.__enter__.return_value
            cur = ctx.cursor.return_value.__enter__.return_value
            cur.fetchone.return_value = (5, 5)
            ok, used, limit = _check_quota("fake-store-id")
            assert ok is False

    def test_check_quota_no_subscription(self):
        from backend.routes.translate import _check_quota
        with patch("backend.routes.translate.get_connection") as mock_conn:
            ctx = mock_conn.return_value.__enter__.return_value
            cur = ctx.cursor.return_value.__enter__.return_value
            cur.fetchone.return_value = None
            ok, used, limit = _check_quota("fake-store-id")
            assert ok is True
            assert limit == 5
