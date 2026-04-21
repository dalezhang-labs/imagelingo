"""Lovart Service — direct Lovart Agent API integration for image translation rendering.
Uses AK/SK HMAC-SHA256 auth and is aligned to the documented /v1/openapi endpoints.

Prompt optimization notes (2026-04-21):
- Including OCR-extracted text in the prompt significantly improves translation accuracy
- Explicit instructions about preserving layout/colors/fonts are critical
- Specifying "product image" context helps Lovart understand the use case
- tool_config with include_tools can steer toward image editing vs generation
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import os
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request

logger = logging.getLogger(__name__)

LOVART_BASE_URL = os.environ.get("LOVART_BASE_URL", "https://lgw.lovart.ai")
LOVART_PREFIX = "/v1/openapi"

_ssl_ctx = ssl.create_default_context()
if os.environ.get("LOVART_INSECURE_SSL") == "1":
    _ssl_ctx.check_hostname = False
    _ssl_ctx.verify_mode = ssl.CERT_NONE

# ── Optimized prompt templates for product image translation ──────────
# V2: includes OCR context for better accuracy
PROMPT_TEMPLATE_WITH_OCR = (
    "This is a product image containing text in {source_lang}. "
    "The OCR-detected text regions are:\n{ocr_text}\n\n"
    "Task: Generate a new version of this exact image where ALL text has been "
    "accurately translated into {target_lang}. Requirements:\n"
    "1. Translate every piece of text faithfully — do not omit any text region\n"
    "2. Keep the EXACT same image layout, background, colors, and visual design\n"
    "3. Match the original font style, size, and positioning as closely as possible\n"
    "4. Preserve all non-text elements (logos, icons, product photos) unchanged\n"
    "5. Output the final translated image"
)

# V2 fallback: no OCR context available
PROMPT_TEMPLATE_NO_OCR = (
    "This is a product image containing text. "
    "Generate a new version of this exact image where ALL visible text has been "
    "accurately translated into {target_lang}. Requirements:\n"
    "1. Translate every piece of text faithfully\n"
    "2. Keep the EXACT same image layout, background, colors, and visual design\n"
    "3. Match the original font style, size, and positioning as closely as possible\n"
    "4. Preserve all non-text elements unchanged\n"
    "5. Output the final translated image"
)

SOURCE_LANG_MAP = {
    "zh": "Chinese", "zh-CN": "Chinese", "zh-TW": "Chinese (Traditional)",
    "en": "English", "ja": "Japanese", "ko": "Korean",
}


class LovartService:
    def __init__(self):
        from backend.config import validate_lovart
        validate_lovart()
        self.access_key = os.environ["LOVART_ACCESS_KEY"]
        self.secret_key = os.environ["LOVART_SECRET_KEY"]
        self.base_url = LOVART_BASE_URL
        self.prefix = LOVART_PREFIX

    def _sign(self, method: str, path: str) -> dict:
        ts = str(int(time.time()))
        sig = hmac.new(
            self.secret_key.encode(),
            f"{method}\n{path}\n{ts}".encode(),
            hashlib.sha256,
        ).hexdigest()
        return {
            "X-Access-Key": self.access_key,
            "X-Timestamp": ts,
            "X-Signature": sig,
            "X-Signed-Method": method,
            "X-Signed-Path": path,
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 LovartImageLingo/1.0",
        }

    def _request(self, method: str, path: str, body=None, params=None, retries: int = 3) -> dict:
        url = f"{self.base_url}{path}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        data = json.dumps(body).encode() if body is not None else None

        for attempt in range(retries):
            headers = self._sign(method, path)
            req = urllib.request.Request(url, data=data, headers=headers, method=method)
            try:
                with urllib.request.urlopen(req, timeout=120, context=_ssl_ctx) as resp:
                    result = json.loads(resp.read().decode())
                break
            except urllib.error.HTTPError as e:
                err_body = e.read().decode()
                if e.code in (429, 502, 503) and attempt < retries - 1:
                    time.sleep(2 * (attempt + 1))
                    continue
                raise ValueError(f"Lovart HTTP {e.code}: {err_body[:200]}")
            except (urllib.error.URLError, ssl.SSLError, OSError) as e:
                if attempt < retries - 1:
                    time.sleep(2 * (attempt + 1))
                    continue
                raise ValueError(f"Lovart connection failed after {retries} attempts: {e}")
        else:
            raise ValueError("Lovart connection failed")

        if isinstance(result, dict) and result.get("code", 0) != 0:
            raise ValueError(f"Lovart API error: {result.get('message', result)}")
        return result.get("data", result) if isinstance(result, dict) else result

    def _get_or_create_project(self) -> str:
        result = self._request("POST", f"{self.prefix}/project/save", body={
            "project_id": "",
            "canvas": "",
            "project_cover_list": [],
            "pic_count": 0,
            "project_type": 3,
            "project_name": "imagelingo-translations",
        })
        return result.get("project_id", "")

    def _build_prompt(self, target_language: str, source_hint: str, ocr_texts: list[str] | None) -> str:
        source_lang = SOURCE_LANG_MAP.get(source_hint, "the source language")
        if ocr_texts:
            ocr_block = "\n".join(f"- \"{t}\"" for t in ocr_texts)
            return PROMPT_TEMPLATE_WITH_OCR.format(
                source_lang=source_lang, target_lang=target_language, ocr_text=ocr_block,
            )
        return PROMPT_TEMPLATE_NO_OCR.format(target_lang=target_language)

    @staticmethod
    def _extract_image_url(result: dict) -> str | None:
        """Extract image URL from Lovart result, trying multiple field patterns."""
        # Primary: items[].artifacts[] with type=image
        for item in result.get("items", []):
            for artifact in item.get("artifacts", []):
                if artifact.get("type") == "image":
                    url = artifact.get("content", "")
                    if url:
                        return url
        # Fallback: any artifact with a URL-like content
        for item in result.get("items", []):
            for artifact in item.get("artifacts", []):
                url = artifact.get("url") or artifact.get("content") or artifact.get("data")
                if url and isinstance(url, str) and url.startswith("http"):
                    return url
            # Check item-level fields
            for key in ("image_url", "image", "url"):
                val = item.get(key)
                if val and isinstance(val, str) and val.startswith("http"):
                    return val
            for att in item.get("attachments", []):
                if isinstance(att, str) and att.startswith("http"):
                    return att
                if isinstance(att, dict):
                    url = att.get("url") or att.get("content")
                    if url and isinstance(url, str) and url.startswith("http"):
                        return url
        return None

    async def translate_image(
        self,
        image_url: str,
        target_language: str,
        source_hint: str = "zh",
        ocr_texts: list[str] | None = None,
    ) -> str:
        project_id = self._get_or_create_project()
        prompt = self._build_prompt(target_language, source_hint, ocr_texts)

        chat_body: dict = {
            "prompt": prompt,
            "project_id": project_id,
            "attachments": [image_url],
        }

        thread_id = self._request("POST", f"{self.prefix}/chat", body=chat_body)["thread_id"]
        logger.info("Lovart chat started: thread_id=%s, target=%s", thread_id, target_language)

        for _ in range(100):
            await asyncio.sleep(3)
            status_data = self._request("GET", f"{self.prefix}/chat/status", params={"thread_id": thread_id})
            status = status_data.get("status")
            if status == "done":
                result = self._request("GET", f"{self.prefix}/chat/result", params={"thread_id": thread_id})
                url = self._extract_image_url(result)
                if url:
                    return url
                # Log structure for debugging without leaking full payload
                item_types = [
                    {k: type(v).__name__ for k, v in item.items()}
                    for item in result.get("items", [])
                ]
                logger.error("Lovart done but no image found. Item structure: %s", item_types)
                raise ValueError("Lovart done but no image artifact found")
            if status == "abort":
                raise ValueError("Lovart task aborted")
        raise TimeoutError("Lovart translation timed out after 5 minutes")
