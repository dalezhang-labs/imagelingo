from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routes import auth, translate, webhook

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


@app.get("/health")
async def health():
    return {"status": "ok"}
