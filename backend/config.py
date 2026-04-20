"""
Fail-fast environment variable validation.
Call validate_env() at startup or before using external services.
"""
from __future__ import annotations

import os
from typing import Dict, List, Optional

# Keys required for the full pipeline
_REQUIRED: Dict[str, str] = {
    "SHOPLINE_APP_KEY": "Shopline app key",
    "SHOPLINE_APP_SECRET": "Shopline app secret",
    "SHOPLINE_APP_URL": "Shopline app URL",
    "SHOPLINE_REDIRECT_URI": "Shopline OAuth redirect URI",
    "LOVART_ACCESS_KEY": "Lovart access key (AK)",
    "LOVART_SECRET_KEY": "Lovart secret key (SK)",
    "CLOUDINARY_CLOUD_NAME": "Cloudinary cloud name",
    "CLOUDINARY_API_KEY": "Cloudinary API key",
    "CLOUDINARY_API_SECRET": "Cloudinary API secret",
    "DATABASE_URL": "Neon/PostgreSQL connection string",
}


def validate_env(keys: Optional[List[str]] = None) -> None:
    """
    Raise RuntimeError listing every missing key (no values exposed).
    Pass a subset of keys to check only those.
    """
    check = keys or list(_REQUIRED.keys())
    missing = [k for k in check if not os.environ.get(k)]
    if missing:
        descriptions = [f"  {k} — {_REQUIRED.get(k, 'required')}" for k in missing]
        raise RuntimeError(
            "Missing required environment variables:\n" + "\n".join(descriptions)
        )


def validate_lovart() -> None:
    validate_env(["LOVART_ACCESS_KEY", "LOVART_SECRET_KEY"])


def validate_cloudinary() -> None:
    validate_env(["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"])


def validate_database() -> None:
    validate_env(["DATABASE_URL"])
