import hashlib
import hmac
import os
import httpx

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

router = APIRouter()

APP_KEY = os.getenv("SHOPLINE_APP_KEY", "")
APP_SECRET = os.getenv("SHOPLINE_APP_SECRET", "")
APP_URL = os.getenv("SHOPLINE_APP_URL", "")
REDIRECT_URI = os.getenv("SHOPLINE_REDIRECT_URI", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

SCOPES = "read_products,write_products"


def verify_hmac(params: dict) -> bool:
    """Verify Shopline HMAC-SHA256 signature."""
    sign = params.get("sign", "")
    filtered = {k: v for k, v in params.items() if k != "sign"}
    message = "&".join(f"{k}={v}" for k, v in sorted(filtered.items()))
    expected = hmac.new(APP_SECRET.encode(), message.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sign)


@router.get("/install")
async def install(request: Request):
    params = dict(request.query_params)
    if not verify_hmac(params):
        raise HTTPException(status_code=401, detail="Invalid signature")

    handle = params.get("handle", "")
    auth_url = (
        f"https://{handle}.myshopline.com/admin/oauth-web/#/oauth/authorize"
        f"?appKey={APP_KEY}&responseType=code&scope={SCOPES}&redirectUri={REDIRECT_URI}"
    )
    return RedirectResponse(auth_url)


@router.get("/callback")
async def callback(code: str, handle: str):
    token_url = f"https://{handle}.myshopline.com/admin/oauth/token/create"
    async with httpx.AsyncClient() as client:
        resp = await client.post(token_url, json={
            "appKey": APP_KEY,
            "appSecret": APP_SECRET,
            "code": code,
        })
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to exchange token")

    data = resp.json()
    access_token = data.get("accessToken") or data.get("access_token")
    expires_in = data.get("expiresIn") or data.get("expires_in", 36000)
    scopes = data.get("scope", SCOPES)

    from datetime import datetime, timezone, timedelta
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))

    from backend.services.token_store import save_token
    save_token(handle, access_token, expires_at, scopes)

    return RedirectResponse(f"{FRONTEND_URL}?shop={handle}")
