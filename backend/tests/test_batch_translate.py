"""
Tests for POST /api/translate/batch endpoint.

Run:
    cd <repo-root>
    pytest backend/tests/test_batch_translate.py -v
"""
import os
import uuid
from contextlib import ExitStack
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

FAKE_STORE_ID = str(uuid.uuid4())


def _mock_deps():
    """Return an ExitStack context manager that patches DB + auth dependencies."""
    stack = ExitStack()
    stack.enter_context(patch("backend.routes.translate._resolve_store", return_value=(FAKE_STORE_ID, "test-shop")))
    stack.enter_context(patch("backend.routes.translate.get_token", return_value="fake-token"))
    stack.enter_context(patch("backend.routes.translate._check_quota", return_value=(True, 0, 100)))
    m_create = stack.enter_context(patch("backend.routes.translate._create_job", side_effect=lambda *a: str(uuid.uuid4())))
    m_pipeline = stack.enter_context(patch("backend.routes.translate._run_pipeline", new=AsyncMock()))
    return stack, m_create, m_pipeline


@pytest.fixture
def client():
    from backend.main import app
    return TestClient(app)


class TestBatchEndpoint:
    def test_batch_returns_job_ids(self, client):
        stack, mock_create, _ = _mock_deps()
        with stack:
            ids = [str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())]
            mock_create.side_effect = ids
            res = client.post("/api/translate/batch", json={
                "store_handle": "test-shop",
                "product_id": "manual",
                "image_urls": [
                    "https://example.com/img1.jpg",
                    "https://example.com/img2.jpg",
                    "https://example.com/img3.jpg",
                ],
                "target_languages": ["EN-US", "DE"],
            })
        assert res.status_code == 200
        data = res.json()
        assert data["job_ids"] == ids
        assert len(data["job_ids"]) == 3

    def test_batch_empty_urls_returns_400(self, client):
        stack, _, _ = _mock_deps()
        with stack:
            res = client.post("/api/translate/batch", json={
                "store_handle": "test-shop",
                "product_id": "manual",
                "image_urls": [],
                "target_languages": ["EN-US"],
            })
        assert res.status_code == 400

    def test_batch_no_auth_returns_401(self, client):
        with (
            patch("backend.routes.translate._resolve_store", return_value=(FAKE_STORE_ID, "test-shop")),
            patch("backend.routes.translate.get_token", return_value=None),
        ):
            res = client.post("/api/translate/batch", json={
                "store_handle": "test-shop",
                "product_id": "manual",
                "image_urls": ["https://example.com/img.jpg"],
                "target_languages": ["EN-US"],
            })
        assert res.status_code == 401

    def test_batch_quota_exceeded_returns_402(self, client):
        with (
            patch("backend.routes.translate._resolve_store", return_value=(FAKE_STORE_ID, "test-shop")),
            patch("backend.routes.translate.get_token", return_value="fake-token"),
            patch("backend.routes.translate._check_quota", return_value=(False, 5, 5)),
        ):
            res = client.post("/api/translate/batch", json={
                "store_handle": "test-shop",
                "product_id": "manual",
                "image_urls": ["https://example.com/img.jpg"],
                "target_languages": ["EN-US"],
            })
        assert res.status_code == 402

    def test_batch_creates_one_job_per_image(self, client):
        stack, mock_create, mock_pipeline = _mock_deps()
        with stack:
            mock_create.side_effect = [str(uuid.uuid4()) for _ in range(2)]
            res = client.post("/api/translate/batch", json={
                "store_handle": "test-shop",
                "product_id": "manual",
                "image_urls": [
                    "https://example.com/img1.jpg",
                    "https://example.com/img2.jpg",
                ],
                "target_languages": ["EN-US"],
            })
        assert res.status_code == 200
        assert mock_create.call_count == 2
        urls = [call.args[2] for call in mock_create.call_args_list]
        assert urls == ["https://example.com/img1.jpg", "https://example.com/img2.jpg"]

    def test_batch_single_image_works(self, client):
        stack, mock_create, _ = _mock_deps()
        with stack:
            jid = str(uuid.uuid4())
            mock_create.side_effect = [jid]
            res = client.post("/api/translate/batch", json={
                "store_handle": "test-shop",
                "product_id": "manual",
                "image_urls": ["https://example.com/img.jpg"],
                "target_languages": ["EN-US", "DE", "JA"],
            })
        assert res.status_code == 200
        assert res.json()["job_ids"] == [jid]


class TestBatchPipelineIntegration:
    """Verify that the batch endpoint schedules _run_pipeline for each image."""

    def test_pipeline_scheduled_per_image(self, client):
        stack, mock_create, mock_pipeline = _mock_deps()
        with stack:
            ids = [str(uuid.uuid4()), str(uuid.uuid4())]
            mock_create.side_effect = ids
            client.post("/api/translate/batch", json={
                "store_handle": "test-shop",
                "product_id": "manual",
                "image_urls": [
                    "https://example.com/a.jpg",
                    "https://example.com/b.jpg",
                ],
                "target_languages": ["KO"],
            })
        assert mock_pipeline.call_count == 2
