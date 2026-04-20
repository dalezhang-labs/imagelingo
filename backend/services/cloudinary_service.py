"""Cloudinary service wrapper."""
from __future__ import annotations

import io
import os
import sys
import types

try:
    import cloudinary as _cloudinary
    import cloudinary.uploader  # noqa: F401
except ModuleNotFoundError:
    _cloudinary = types.ModuleType("cloudinary")
    _cloudinary.config = lambda *args, **kwargs: None
    _uploader = types.ModuleType("cloudinary.uploader")

    def _placeholder_upload(*args, **kwargs):
        return {"secure_url": args[0] if args else ""}

    _uploader.upload = _placeholder_upload
    _cloudinary.uploader = _uploader
    sys.modules["cloudinary"] = _cloudinary
    sys.modules["cloudinary.uploader"] = _uploader

cloudinary = _cloudinary


class CloudinaryService:
    """Cloudinary wrapper with local fallback."""

    def __init__(self):
        self.enabled = bool(
            os.environ.get("CLOUDINARY_CLOUD_NAME")
            and os.environ.get("CLOUDINARY_API_KEY")
            and os.environ.get("CLOUDINARY_API_SECRET")
        )

        if self.enabled:
            global cloudinary
            import cloudinary as _cloudinary
            import cloudinary.uploader  # noqa: F401

            cloudinary = _cloudinary
            cloudinary.config(
                cloud_name=os.environ["CLOUDINARY_CLOUD_NAME"],
                api_key=os.environ["CLOUDINARY_API_KEY"],
                api_secret=os.environ["CLOUDINARY_API_SECRET"],
            )

    async def upload_image(self, image_bytes: bytes, public_id: str = None) -> str:
        if not self.enabled:
            return f"data:image/*;base64,{len(image_bytes)}"

        upload_kwargs = {"folder": "imagelingo"}
        if public_id:
            upload_kwargs["public_id"] = public_id
        result = cloudinary.uploader.upload(io.BytesIO(image_bytes), **upload_kwargs)
        return result["secure_url"]

    async def upload_image_from_url(self, url: str, public_id: str = None) -> str:
        if not self.enabled:
            return url

        upload_kwargs = {"folder": "imagelingo"}
        if public_id:
            upload_kwargs["public_id"] = public_id
        result = cloudinary.uploader.upload(url, **upload_kwargs)
        return result["secure_url"]
