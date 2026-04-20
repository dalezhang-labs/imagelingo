import io
import os

import cloudinary
import cloudinary.uploader


class CloudinaryService:
    def __init__(self):
        from backend.config import validate_cloudinary
        validate_cloudinary()
        cloudinary.config(
            cloud_name=os.environ["CLOUDINARY_CLOUD_NAME"],
            api_key=os.environ["CLOUDINARY_API_KEY"],
            api_secret=os.environ["CLOUDINARY_API_SECRET"],
        )

    async def upload_image(self, image_bytes: bytes, public_id: str = None) -> str:
        """Upload image bytes to Cloudinary under imagelingo/ folder. Returns the secure URL."""
        upload_kwargs = {"folder": "imagelingo"}
        if public_id:
            upload_kwargs["public_id"] = public_id
        result = cloudinary.uploader.upload(io.BytesIO(image_bytes), **upload_kwargs)
        return result["secure_url"]

    async def upload_image_from_url(self, url: str, public_id: str = None) -> str:
        """Upload image from URL to Cloudinary. Returns the secure URL."""
        upload_kwargs = {"folder": "imagelingo"}
        if public_id:
            upload_kwargs["public_id"] = public_id
        result = cloudinary.uploader.upload(url, **upload_kwargs)
        return result["secure_url"]
