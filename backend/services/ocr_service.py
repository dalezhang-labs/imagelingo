"""OCR service for extracting text from images.

EasyOCR language compatibility constraints:
- ch_sim (Chinese Simplified) is only compatible with en (English)
- ja (Japanese) is only compatible with en
- ko (Korean) is only compatible with en
We create separate readers per language group and merge results.
"""
from __future__ import annotations

import io
import logging
from typing import Any

logger = logging.getLogger(__name__)

# Language groups that EasyOCR can load together
_LANG_GROUPS = [
    ["ch_sim", "en"],
    ["ja", "en"],
    ["ko", "en"],
]


class OCRService:
    def __init__(self, lang_groups: list[list[str]] | None = None) -> None:
        self._groups = lang_groups or _LANG_GROUPS
        self._readers: list = []
        self._load_readers()

    def _load_readers(self):
        try:
            import easyocr  # type: ignore
        except Exception:
            return
        for group in self._groups:
            try:
                self._readers.append(easyocr.Reader(group, gpu=False))
            except Exception as exc:
                logger.warning("OCR reader for %s unavailable: %s", group, exc)

    async def extract_text(self, image_bytes: bytes) -> list[dict[str, Any]]:
        if not image_bytes or not self._readers:
            return []

        seen_texts: set[str] = set()
        parsed: list[dict[str, Any]] = []

        import numpy as np
        from PIL import Image
        pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_array = np.array(pil_img)

        for reader in self._readers:
            try:
                results = reader.readtext(img_array)
            except Exception as exc:
                logger.warning("OCR extraction failed: %s", exc)
                continue
            for item in results or []:
                if not item or len(item) < 3:
                    continue
                bbox, text, confidence = item[:3]
                text_str = str(text).strip()
                if not text_str or text_str in seen_texts:
                    continue
                seen_texts.add(text_str)
                parsed.append({
                    "bbox": _normalize_bbox(bbox),
                    "text": text_str,
                    "confidence": float(confidence),
                })
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
