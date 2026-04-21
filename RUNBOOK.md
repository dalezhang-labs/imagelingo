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
  -d '{"image_url": "https://img.alicdn.com/imgextra/i4/2206686532834/O1CN01JqGSMo1TfN0XQmCIR_!!2206686532834.jpg", "target_language": "English"}'

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
| `POST /api/translate/test` | None | Dev: OCR → Lovart → return URL (no DB) |
| `POST /api/translate/test/upload` | None | Dev: upload file → OCR → Lovart → return URL |
| `POST /api/translate/` | Store token | Production: create translation job |
| `GET /api/translate/jobs/{id}` | None | Get job status + results |
| `GET /api/translate/history` | None | List translation history |

### 6. Architecture

```
Image → EasyOCR (extract text) → Lovart API (translate + re-render) → Translated image URL
```

- No Cloudinary — Lovart returns CDN URLs directly
- OCR is optional — pipeline works without it, but OCR context improves translation accuracy
- Lovart handles both translation and image rendering in one step
