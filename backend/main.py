from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent / ".env")

import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routes import auth, translate, webhook

logger = logging.getLogger(__name__)

app = FastAPI(title="ImageLingo API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth")
app.include_router(translate.router, prefix="/api/translate")
app.include_router(webhook.router, prefix="/api/webhooks")


@app.on_event("startup")
async def _startup_env_check():
    from backend.config import validate_env
    try:
        validate_env()
    except RuntimeError as exc:
        # Log clearly but don't crash the server — allow partial operation
        # (e.g. health check still works; translate routes will fail fast per-request)
        logger.warning("Startup env check: %s", exc)


@app.get("/health")
async def health():
    return {"status": "ok"}
