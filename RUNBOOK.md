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

## Run Smoke Tests (no real credentials needed)

```bash
cd <repo-root>
pytest backend/tests/test_smoke_pipeline.py -v
```

## Deploy to Railway

```bash
# From repo root
railway up
```

Set all env vars in Railway dashboard under Variables.
