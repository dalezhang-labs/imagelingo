# ImageLingo Runbook

## Quick Start

### 1. Environment Setup

```bash
cd backend
cp .env.example .env
# Fill in: LOVART_ACCESS_KEY, LOVART_SECRET_KEY, DATABASE_URL
```

Required env vars:
- `LOVART_ACCESS_KEY` / `LOVART_SECRET_KEY` — from Lovart partner portal
- `DATABASE_URL` — Neon PostgreSQL connection string
- `SHOPLINE_APP_KEY` / `SHOPLINE_APP_SECRET` — for production (not needed for /test endpoints)

### 2. Install Dependencies

```bash
pip install -r backend/requirements.txt
```

### 3. Run Backend

```bash
cd <project-root>
uvicorn backend.main:app --reload --port 8000
```

### 4. Test the Full Pipeline

#### Option A: CLI test script (no server needed)
```bash
# Uses the fixture image (backend/tests/fixtures/sample_chinese.jpg)
python backend/tests/test_full_pipeline.py

# With a custom image URL
python backend/tests/test_full_pipeline.py --image-url https://example.com/product.jpg --target-language Japanese
```

#### Option B: API endpoint (server must be running)
```bash
# With a public image URL
curl -X POST http://localhost:8000/api/translate/test \
  -H "Content-Type: application/json" \
  -d '{"image_url": "https://example.com/product.jpg", "target_language": "English"}'

# Upload a local file
curl -X POST http://localhost:8000/api/translate/test/upload \
  -F "file=@backend/tests/fixtures/sample_chinese.jpg" \
  -F "target_language=English"
```

#### Option C: Unit tests (no credentials needed)
```bash
pytest backend/tests/test_smoke_pipeline.py -v
```

### 5. API Endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `GET /health` | None | Health check |
| `POST /api/translate/test` | None | Dev: image → Lovart → return URL (no DB) |
| `POST /api/translate/test/upload` | None | Dev: upload file → Lovart → return URL |
| `POST /api/translate/` | Store token | Production: create translation job |
| `GET /api/translate/jobs/{id}` | None | Get job status + results |
| `GET /api/translate/history` | None | List translation history |

### 6. Architecture

```
Original image → Lovart API (auto-detect text + translate + re-render) → Translated image URL
```

- No OCR step — Lovart handles text detection, translation, and rendering in one step
- No Cloudinary — Lovart returns CDN URLs directly
