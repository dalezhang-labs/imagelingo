#!/usr/bin/env python3
"""
ImageLingo Full Pipeline Test — Image → Lovart (auto-detect + translate) → Image URL

Usage:
  # With the sample fixture image (upload to Lovart CDN first):
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
    args = parser.parse_args()

    print("=" * 60)
    print("  ImageLingo Full Pipeline Test")
    print("  Image → Lovart (auto-detect + translate) → Image URL")
    print("=" * 60)

    if not os.environ.get("LOVART_ACCESS_KEY") or not os.environ.get("LOVART_SECRET_KEY"):
        print("\n❌ LOVART_ACCESS_KEY and LOVART_SECRET_KEY required")
        print("   Set them in backend/.env")
        sys.exit(1)

    from backend.services.lovart_service import LovartService

    lovart = LovartService()
    image_url = args.image_url

    # Step 1: If no URL provided, upload the fixture image to Lovart CDN
    if not image_url:
        if not os.path.exists(FIXTURE_IMAGE):
            print(f"\n❌ Fixture image not found: {FIXTURE_IMAGE}")
            sys.exit(1)
        print(f"\n[1/2] Uploading fixture image to Lovart CDN...")
        with open(FIXTURE_IMAGE, "rb") as f:
            image_bytes = f.read()
        t0 = time.time()
        image_url = lovart.upload_file(image_bytes, "sample_chinese.jpg")
        print(f"  ✅ Uploaded in {time.time()-t0:.1f}s: {image_url}")
    else:
        print(f"\n[1/2] Using provided image URL: {image_url}")

    # Step 2: Lovart translate + render
    print(f"\n[2/2] Lovart translate to {args.target_language}...")
    t0 = time.time()
    try:
        output_url = asyncio.run(lovart.translate_image(image_url, args.target_language))
        elapsed = time.time() - t0
        print(f"  ✅ Translation completed in {elapsed:.1f}s")
        print(f"\n{'='*60}")
        print(f"  RESULT")
        print(f"{'='*60}")
        print(f"  Original:   {image_url}")
        print(f"  Translated: {output_url}")
        print(f"  Language:   {args.target_language}")
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
