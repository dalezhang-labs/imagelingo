FROM python:3.11-slim

WORKDIR /app

# System deps for easyocr (opencv, libgl)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
# Install CPU-only torch first to avoid pulling CUDA (~2GB savings)
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/

# Pre-download EasyOCR models at build time (avoids runtime download)
RUN python -c "import easyocr; easyocr.Reader(['ch_sim', 'en'], gpu=False)" 2>/dev/null || true

EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
