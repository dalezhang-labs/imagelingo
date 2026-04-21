#!/usr/bin/env python3
"""
ImageLingo Full Pipeline Test — OCR → Translate → Lovart Render → Image URL

Usage:
  # With the sample fixture image (local OCR + live Lovart):
    python backend/tests/test_full_pipeline.py

  # With a custom public image URL:
    python backend/tests/test_full_pipeline.py --image-url https://example.com/product.jpg

  # Specify target language:
    python backend/tests/test_full_pipeline.py --target-language Japanese

Requires: LOVART_ACCESS_KEY, LOVART_SECRET_KEY in backend/.env
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

FIXTURE_IMAGE = os.path.join(os.path.dirname(__file__), "fixtures", "sample_chinese.jpg")


def main():
    parser = argparse.ArgumentParser(description="ImageLingo Full Pipeline Test")
    parser.add_argument("--image-url", default=None, help="Public image URL (skips local file upload)")
    parser.add_argument("--target-language", default="English")
    parser.add_argument("--source-hint", default="zh")
    args = parser.parse_args()

    print("=" * 60)
    print("  ImageLingo Full Pipeline Test")
    print("  OCR → Translate → Lovart Render → Image URL")
    print("=" * 60)

    # Check credentials
    if not os.environ.get("LOVART_ACCESS_KEY") or not os.environ.get("LOVART_SECRET_KEY"):
        print("\n❌ LOVART_ACCESS_KEY and LOVART_SECRET_KEY required")
        print("   Set them in backend/.env")
        sys.exit(1)

    from backend.services.ocr_service import OCRService
    from backend.services.lovart_service import LovartService

    lovart = LovartService()
    image_url = args.image_url

    # Step 1: If no URL provided, upload the fixture image to Lovart CDN
    image_bytes = None
    if not image_url:
        if not os.path.exists(FIXTURE_IMAGE):
            print(f"\n❌ Fixture image not found: {FIXTURE_IMAGE}")
            sys.exit(1)
        print(f"\n[1/3] Uploading fixture image to Lovart CDN...")
        with open(FIXTURE_IMAGE, "rb") as f:
            image_bytes = f.read()
        t0 = time.time()
        image_url = lovart.upload_file(image_bytes, "sample_chinese.jpg")
        print(f"  ✅ Uploaded in {time.time()-t0:.1f}s: {image_url}")
    else:
        print(f"\n[1/3] Using provided image URL: {image_url}")

    # Step 2: OCR
    print(f"\n[2/3] Running OCR...")
    ocr_texts: list[str] = []
    try:
        ocr = OCRService(lang_groups=[["ch_sim", "en"]])
        if image_bytes is None:
            import urllib.request
            req = urllib.request.Request(image_url, headers={"User-Agent": "ImageLingo/1.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                image_bytes = resp.read()
        results = asyncio.run(ocr.extract_text(image_bytes))
        ocr_texts = [r["text"] for r in results if r.get("confidence", 0) > 0.3]
        print(f"  Found {len(results)} text regions, {len(ocr_texts)} high-confidence:")
        for r in results:
            marker = "✓" if r.get("confidence", 0) > 0.3 else "·"
            print(f"    {marker} [{r['confidence']:.2f}] {r['text']}")
    except Exception as e:
        print(f"  ⚠ OCR failed (continuing without): {e}")

    # Step 3: Lovart translate + render
    print(f"\n[3/3] Lovart translate to {args.target_language}...")
    t0 = time.time()
    try:
        output_url = asyncio.run(lovart.translate_image(
            image_url, args.target_language,
            source_hint=args.source_hint,
            ocr_texts=ocr_texts or None,
        ))
        elapsed = time.time() - t0
        print(f"  ✅ Translation completed in {elapsed:.1f}s")
        print(f"\n{'='*60}")
        print(f"  RESULT")
        print(f"{'='*60}")
        print(f"  Original:   {image_url}")
        print(f"  Translated: {output_url}")
        print(f"  Language:   {args.target_language}")
        print(f"  OCR texts:  {len(ocr_texts)} regions")
        print(f"  Time:       {elapsed:.1f}s")
        print(f"{'='*60}")
        print(f"  ✅ FULL PIPELINE PASSED")
        print(f"{'='*60}")
    except Exception as e:
        elapsed = time.time() - t0
        print(f"  ❌ Translation failed after {elapsed:.1f}s: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
