"""OCR service for extracting text from images.

This implementation keeps the backend test-friendly:
- It has no hard dependency on a specific OCR engine at import time.
- If OCR libraries are unavailable, it degrades gracefully and returns [].
- It can still be monkeypatched in tests through the expected module path.
"""
from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class OCRResult:
    bbox: list[int]
    text: str
    confidence: float


class OCRService:
    def __init__(self) -> None:
        self._engine = self._load_engine()

    def _load_engine(self):
        try:
            import easyocr  # type: ignore
        except Exception:
            return None

        try:
            return easyocr.Reader(["en", "ch_sim", "ja", "ko"], gpu=False)
        except Exception as exc:
            logger.warning("OCR engine unavailable: %s", exc)
            return None

    async def extract_text(self, image_bytes: bytes) -> list[dict[str, Any]]:
        if not image_bytes:
            return []

        if self._engine is None:
            return []

        try:
            results = self._engine.readtext(io.BytesIO(image_bytes))
        except Exception as exc:
            logger.warning("OCR extraction failed: %s", exc)
            return []

        parsed: list[dict[str, Any]] = []
        for item in results or []:
            if not item or len(item) < 3:
                continue
            bbox, text, confidence = item[:3]
            parsed.append(
                {
                    "bbox": _normalize_bbox(bbox),
                    "text": str(text),
                    "confidence": float(confidence),
                }
            )
        return parsed


def _normalize_bbox(bbox: Any) -> list[int]:
    try:
        points = bbox.tolist() if hasattr(bbox, "tolist") else bbox
        flat: list[int] = []
        for point in points:
            if isinstance(point, (list, tuple)) and len(point) >= 2:
                flat.extend([int(point[0]), int(point[1])])
        return flat
    except Exception:
        return []
