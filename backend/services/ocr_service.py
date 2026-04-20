import io
from typing import Any


class OCRService:
    def __init__(self):
        # Lazy-load PaddleOCR to avoid slow startup when not needed
        self._ocr = None

    def _get_ocr(self):
        if self._ocr is None:
            from paddleocr import PaddleOCR
            self._ocr = PaddleOCR(use_angle_cls=True, lang="ch", show_log=False)
        return self._ocr

    async def extract_text(self, image_bytes: bytes) -> list[dict]:
        """
        Accepts raw image bytes, returns list of detected text regions.
        Each item: {"bbox": [[x1,y1],[x2,y2],[x3,y3],[x4,y4]], "text": str, "confidence": float}
        """
        import numpy as np
        from PIL import Image

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_array = np.array(image)

        ocr = self._get_ocr()
        result = ocr.ocr(img_array, cls=True)

        regions = []
        if result and result[0]:
            for line in result[0]:
                bbox, (text, confidence) = line
                regions.append({
                    "bbox": bbox,
                    "text": text,
                    "confidence": float(confidence),
                })
        return regions
