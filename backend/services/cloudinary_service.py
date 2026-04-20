import os
import cloudinary
import cloudinary.uploader
import io


class CloudinaryService:
    def __init__(self):
        cloudinary.config(
            cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME", ""),
            api_key=os.getenv("CLOUDINARY_API_KEY", ""),
            api_secret=os.getenv("CLOUDINARY_API_SECRET", ""),
        )

    async def upload_image(self, image_bytes: bytes, public_id: str = None) -> str:
        """Upload image bytes to Cloudinary under imagelingo/ folder. Returns the secure URL."""
        upload_kwargs = {"folder": "imagelingo"}
        if public_id:
            upload_kwargs["public_id"] = public_id

        result = cloudinary.uploader.upload(
            io.BytesIO(image_bytes),
            **upload_kwargs,
        )
        return result["secure_url"]
