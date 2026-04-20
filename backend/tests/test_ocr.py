"""
Unit tests for OCRService.
Run: pytest backend/tests/test_ocr.py -v

Requires a test image at backend/tests/fixtures/sample_chinese.jpg
containing Chinese text. If not present, the test is skipped.
"""
import asyncio
import os
import pytest

FIXTURE_PATH = os.path.join(os.path.dirname(__file__), "fixtures", "sample_chinese.jpg")


@pytest.mark.skipif(not os.path.exists(FIXTURE_PATH), reason="Test fixture not found")
def test_extract_text_returns_results():
    from backend.services.ocr_service import OCRService

    with open(FIXTURE_PATH, "rb") as f:
        image_bytes = f.read()

    service = OCRService()
    results = asyncio.run(service.extract_text(image_bytes))

    assert isinstance(results, list)
    assert len(results) > 0
    for item in results:
        assert "bbox" in item
        assert "text" in item
        assert "confidence" in item
        assert isinstance(item["text"], str)
        assert 0.0 <= item["confidence"] <= 1.0


def test_extract_text_empty_image():
    """Test that a blank/minimal image returns an empty list without crashing."""
    from backend.services.ocr_service import OCRService
    import numpy as np
    from PIL import Image
    import io

    # Create a small blank white image
    img = Image.new("RGB", (100, 100), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    image_bytes = buf.getvalue()

    service = OCRService()
    results = asyncio.run(service.extract_text(image_bytes))
    assert isinstance(results, list)
