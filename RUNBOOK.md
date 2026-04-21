# ImageLingo Runbook

## Required Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in all values:

| Key | Where to get it |
|-----|----------------|
| `SHOPLINE_APP_KEY` | Shopline Partner Dashboard → App → Credentials |
| `SHOPLINE_APP_SECRET` | Same as above |
| `SHOPLINE_APP_URL` | Your deployed backend URL (e.g. `https://your-app.railway.app`) |
| `SHOPLINE_REDIRECT_URI` | `{SHOPLINE_APP_URL}/api/auth/callback` |
| `LOVART_ACCESS_KEY` | https://lovart.ai → AK/SK Management |
| `LOVART_SECRET_KEY` | Same as above |
| `CLOUDINARY_CLOUD_NAME` | https://cloudinary.com → Dashboard |
| `CLOUDINARY_API_KEY` | Same as above |
| `CLOUDINARY_API_SECRET` | Same as above |
| `DATABASE_URL` | Neon console → Connection string (postgres://...) |

## Local Backend Setup

```bash
cd backend
pip install -r requirements.txt

# Copy and fill env
cp .env.example .env
# edit .env with your keys

# Initialize DB schema (requires DATABASE_URL)
python -m backend.db.models

# Start server
uvicorn backend.main:app --reload --port 8000
```

Health check: `curl http://localhost:8000/health`

## Run Tests

```bash
# Smoke tests (no credentials needed, all mocked):
pytest backend/tests/test_smoke_pipeline.py -v

# E2E dry run (tests OCR + prompt templates + result parsing, no API calls):
python backend/tests/test_e2e.py

# E2E live (requires valid LOVART_ACCESS_KEY/SECRET_KEY):
python backend/tests/test_e2e.py --live

# E2E live with custom image:
python backend/tests/test_e2e.py --live --image-url https://your-image-url.jpg
```

## Shopline Install → Translate Flow (shortest path)

1. **Install app** — Shopline admin visits:
   ```
   https://{store}.myshopline.com/admin/apps/install?appKey={SHOPLINE_APP_KEY}
   ```
   This triggers `GET /api/auth/install` → OAuth redirect → `GET /api/auth/callback` → token saved.

2. **Start translation job**:
   ```bash
   curl -X POST http://localhost:8000/api/translate/ \
     -H "Content-Type: application/json" \
     -d '{
       "store_handle": "your-store",
       "product_id": "123",
       "image_url": "https://example.com/product.jpg",
       "target_languages": ["EN-US", "DE", "JA"]
     }'
   # Returns: {"job_id": "..."}
   ```

3. **Poll job status**:
   ```bash
   curl http://localhost:8000/api/translate/jobs/{job_id}
   # Returns: {"status": "done", "results": {"EN-US": "https://...", "DE": "https://..."}, "error": null}
   ```
   Statuses: `pending` → `processing` → `done` / `failed`

## Deploy to Railway

Railway uses a Dockerfile (CPU-only PyTorch + pre-downloaded EasyOCR models).

**Memory requirement**: ~1GB RAM minimum (EasyOCR + PyTorch CPU). Railway free tier (512MB) is insufficient — use a paid plan.

```bash
# From repo root
railway up
```

Set all env vars in Railway dashboard under Variables.

## Architecture: Translation Pipeline

```
Upload image URL
    ↓
OCR (EasyOCR: ch_sim+en, ja+en, ko+en)
    ↓ extracted text regions
Lovart API (prompt includes OCR context for accuracy)
    ↓ translated image URL
Cloudinary (persistent hosting)
    ↓ final URL
Save to DB (imagelingo.translated_images)
```
