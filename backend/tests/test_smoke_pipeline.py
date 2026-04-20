"""
Smoke tests for the ImageLingo translation pipeline.

These tests mock all external services (Lovart, Cloudinary, DB) so they run
without any real credentials or network access.

Run:
    cd <repo-root>
    pytest backend/tests/test_smoke_pipeline.py -v
"""
import asyncio
import os
import sys
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

FAKE_JOB_ID = str(uuid.uuid4())
FAKE_STORE_ID = str(uuid.uuid4())
FAKE_TRANSLATED_URL = "https://res.cloudinary.com/demo/image/upload/imagelingo/test.png"
FAKE_LOVART_URL = "https://cdn.lovart.ai/result/test.png"


# ---------------------------------------------------------------------------
# Unit: LovartService result parsing
# ---------------------------------------------------------------------------

class TestLovartResultParsing:
    """Verify that the image artifact extraction logic works for the expected structure."""

    def _make_result(self, artifact_type="image", content=FAKE_LOVART_URL):
        return {
            "items": [
                {
                    "type": "message",
                    "text": "Done",
                    "artifacts": [
                        {"type": artifact_type, "content": content}
                    ],
                }
            ]
        }

    def test_finds_image_artifact(self):
        result = self._make_result("image", FAKE_LOVART_URL)
        found = None
        for item in result.get("items", []):
            for artifact in item.get("artifacts", []):
                if artifact.get("type") == "image":
                    found = artifact.get("content", "")
        assert found == FAKE_LOVART_URL

    def test_no_image_artifact_returns_none(self):
        result = self._make_result("video", "https://cdn.lovart.ai/video.mp4")
        found = None
        for item in result.get("items", []):
            for artifact in item.get("artifacts", []):
                if artifact.get("type") == "image":
                    found = artifact.get("content", "")
        assert found is None

    def test_empty_items(self):
        result = {"items": []}
        found = None
        for item in result.get("items", []):
            for artifact in item.get("artifacts", []):
                if artifact.get("type") == "image":
                    found = artifact.get("content", "")
        assert found is None


# ---------------------------------------------------------------------------
# Unit: CloudinaryService URL parsing
# ---------------------------------------------------------------------------

class TestCloudinaryServiceMocked:
    """Mock Cloudinary uploader and verify URL extraction."""

    def test_upload_from_url_returns_secure_url(self):
        with patch.dict(os.environ, {
            "CLOUDINARY_CLOUD_NAME": "demo",
            "CLOUDINARY_API_KEY": "fake_key",
            "CLOUDINARY_API_SECRET": "fake_secret",
        }):
            with patch("cloudinary.uploader.upload") as mock_upload:
                mock_upload.return_value = {"secure_url": FAKE_TRANSLATED_URL}

                from backend.services.cloudinary_service import CloudinaryService
                svc = CloudinaryService()
                result = asyncio.run(svc.upload_image_from_url(FAKE_LOVART_URL, "test_id"))

                mock_upload.assert_called_once()
                assert result == FAKE_TRANSLATED_URL

    def test_upload_bytes_returns_secure_url(self):
        with patch.dict(os.environ, {
            "CLOUDINARY_CLOUD_NAME": "demo",
            "CLOUDINARY_API_KEY": "fake_key",
            "CLOUDINARY_API_SECRET": "fake_secret",
        }):
            with patch("cloudinary.uploader.upload") as mock_upload:
                mock_upload.return_value = {"secure_url": FAKE_TRANSLATED_URL}

                from backend.services.cloudinary_service import CloudinaryService
                svc = CloudinaryService()
                result = asyncio.run(svc.upload_image(b"fake_bytes", "test_id"))

                assert result == FAKE_TRANSLATED_URL


# ---------------------------------------------------------------------------
# Integration: full pipeline (all external calls mocked)
# ---------------------------------------------------------------------------

class TestPipelineMocked:
    """
    Simulate the background pipeline:
      POST /api/translate → creates job → background task runs →
      job status = done → GET /api/translate/jobs/{id} returns output_url
    """

    def _run_pipeline(self, job_id, store_id, image_url, langs):
        """Run _run_pipeline synchronously with all external deps mocked."""
        # In-memory store for translated images
        translated_images: list[tuple] = []
        job_status: dict = {"status": "pending", "error_msg": None}

        def fake_update_status(jid, status, error_msg=None):
            job_status["status"] = status
            job_status["error_msg"] = error_msg

        def fake_save_translated(jid, lang, url):
            translated_images.append((lang, url))

        def fake_increment_usage(sid):
            pass

        with (
            patch("backend.routes.translate._update_job_status", side_effect=fake_update_status),
            patch("backend.routes.translate._save_translated_image", side_effect=fake_save_translated),
            patch("backend.routes.translate._increment_usage", side_effect=fake_increment_usage),
            patch.dict(os.environ, {
                "LOVART_ACCESS_KEY": "ak_fake",
                "LOVART_SECRET_KEY": "sk_fake",
                "CLOUDINARY_CLOUD_NAME": "demo",
                "CLOUDINARY_API_KEY": "fake_key",
                "CLOUDINARY_API_SECRET": "fake_secret",
            }),
        ):
            with patch("backend.services.lovart_service.LovartService.translate_image",
                       new=AsyncMock(return_value=FAKE_LOVART_URL)):
                with patch("cloudinary.uploader.upload",
                           return_value={"secure_url": FAKE_TRANSLATED_URL}):
                    from backend.routes.translate import _run_pipeline
                    asyncio.run(_run_pipeline(job_id, store_id, image_url, langs))

        return job_status, translated_images

    def test_pipeline_sets_done_and_saves_results(self):
        job_id = str(uuid.uuid4())
        store_id = str(uuid.uuid4())

        status, images = self._run_pipeline(
            job_id, store_id, "https://example.com/product.jpg", ["EN-US", "DE"]
        )

        assert status["status"] == "done"
        assert status["error_msg"] is None
        assert len(images) == 2
        langs = {lang for lang, _ in images}
        assert langs == {"EN-US", "DE"}
        for _, url in images:
            assert url == FAKE_TRANSLATED_URL

    def test_pipeline_sets_failed_on_lovart_error(self):
        job_id = str(uuid.uuid4())
        store_id = str(uuid.uuid4())

        job_status: dict = {"status": "pending", "error_msg": None}

        def fake_update_status(jid, status, error_msg=None):
            job_status["status"] = status
            job_status["error_msg"] = error_msg

        with (
            patch("backend.routes.translate._update_job_status", side_effect=fake_update_status),
            patch("backend.routes.translate._save_translated_image"),
            patch("backend.routes.translate._increment_usage"),
            patch.dict(os.environ, {
                "LOVART_ACCESS_KEY": "ak_fake",
                "LOVART_SECRET_KEY": "sk_fake",
                "CLOUDINARY_CLOUD_NAME": "demo",
                "CLOUDINARY_API_KEY": "fake_key",
                "CLOUDINARY_API_SECRET": "fake_secret",
            }),
        ):
            with patch("backend.services.lovart_service.LovartService.translate_image",
                       new=AsyncMock(side_effect=ValueError("Lovart task aborted"))):
                from backend.routes.translate import _run_pipeline
                asyncio.run(_run_pipeline(job_id, store_id, "https://example.com/img.jpg", ["EN-US"]))

        assert job_status["status"] == "failed"
        assert "Lovart task aborted" in (job_status["error_msg"] or "")


# ---------------------------------------------------------------------------
# Unit: env validation
# ---------------------------------------------------------------------------

class TestEnvValidation:
    def test_missing_keys_raises_with_names(self):
        from backend.config import validate_env
        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(RuntimeError) as exc_info:
                validate_env(["LOVART_ACCESS_KEY", "LOVART_SECRET_KEY"])
        msg = str(exc_info.value)
        assert "LOVART_ACCESS_KEY" in msg
        assert "LOVART_SECRET_KEY" in msg
        # Must NOT contain actual values (there are none, but ensure no leakage pattern)
        assert "ak_" not in msg
        assert "sk_" not in msg

    def test_all_keys_present_passes(self):
        from backend.config import validate_env
        env = {
            "LOVART_ACCESS_KEY": "ak_test",
            "LOVART_SECRET_KEY": "sk_test",
        }
        with patch.dict(os.environ, env):
            validate_env(["LOVART_ACCESS_KEY", "LOVART_SECRET_KEY"])  # should not raise
