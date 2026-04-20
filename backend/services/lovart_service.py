import os
import httpx
import base64

LOVART_BASE_URL = "https://api.lovart.ai"


class LovartService:
    def __init__(self):
        self._api_key = os.getenv("LOVART_API_KEY", "")

    async def render_text_on_image(
        self,
        original_image_bytes: bytes,
        text_regions: list[dict],
        # text_regions: [{"bbox": [[x1,y1],...], "text": "translated", "original_text": "原文"}]
    ) -> bytes:
        """
        Call Lovart API to render translated text onto the original image.
        Returns the rendered image as bytes.

        TODO: Confirm exact endpoint path and request schema with Lovart API docs.
        Current implementation uses /v1/render/text-on-image as a placeholder.
        """
        image_b64 = base64.b64encode(original_image_bytes).decode()

        payload = {
            "image": image_b64,
            "text_regions": [
                {
                    "bbox": region["bbox"],
                    "text": region["text"],
                    # TODO: confirm if original_text is needed by Lovart for style matching
                    "original_text": region.get("original_text", ""),
                }
                for region in text_regions
            ],
        }

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            # TODO: confirm exact endpoint with Lovart API documentation
            resp = await client.post(
                f"{LOVART_BASE_URL}/v1/render/text-on-image",
                json=payload,
                headers=headers,
            )
            resp.raise_for_status()

        data = resp.json()
        # TODO: confirm response field name (may be "image", "result", "output", etc.)
        result_b64 = data.get("image") or data.get("result") or data.get("output")
        if result_b64 is None:
            raise ValueError(f"Unexpected Lovart response: {data}")

        return base64.b64decode(result_b64)
