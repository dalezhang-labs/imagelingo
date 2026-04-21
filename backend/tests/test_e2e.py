#!/usr/bin/env python3
"""
ImageLingo End-to-End Pipeline Test

Tests the full translation pipeline: Image → Lovart → translated image URL

Usage:
  # Dry run (mocked external services):
    python backend/tests/test_e2e.py

  # Live run (requires LOVART_ACCESS_KEY, LOVART_SECRET_KEY):
    python backend/tests/test_e2e.py --live

  # Live run with a custom image URL:
    python backend/tests/test_e2e.py --live --image-url https://example.com/product.jpg
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

TARGET_LANGUAGES = ["English", "Japanese"]


def step(name: str):
    print(f"\n{'='*60}")
    print(f"  STEP: {name}")
    print(f"{'='*60}")


def test_lovart_prompt_building():
    step("Lovart — Prompt template validation")
    from backend.services.lovart_service import LovartService

    prompt = LovartService._build_prompt("English")
    assert "English" in prompt
    print(f"  Prompt ({len(prompt)} chars): OK")

    prompt_ja = LovartService._build_prompt("Japanese")
    assert "Japanese" in prompt_ja
    print(f"  Prompt Japanese ({len(prompt_ja)} chars): OK")
    print("  ✅ PROMPT TEMPLATES PASSED")


def test_lovart_result_parsing():
    step("Lovart — Result parsing validation")
    from backend.services.lovart_service import LovartService

    result1 = {"items": [{"artifacts": [{"type": "image", "content": "https://cdn.lovart.ai/img.png"}]}]}
    assert LovartService._extract_image_url(result1) == "https://cdn.lovart.ai/img.png"

    result2 = {"items": [{"artifacts": [{"type": "file", "url": "https://cdn.lovart.ai/img2.png"}]}]}
    assert LovartService._extract_image_url(result2) == "https://cdn.lovart.ai/img2.png"

    assert LovartService._extract_image_url({}) is None
    assert LovartService._extract_image_url({"items": []}) is None

    print("  ✅ RESULT PARSING PASSED")


def test_lovart_live(image_url: str):
    step("Lovart — LIVE API translation test")
    from backend.services.lovart_service import LovartService

    svc = LovartService()
    results = {}

    for lang in TARGET_LANGUAGES:
        print(f"\n  Translating to {lang}...")
        t0 = time.time()
        try:
            url = asyncio.run(svc.translate_image(image_url, lang))
            elapsed = time.time() - t0
            results[lang] = url
            print(f"    ✅ {lang}: {url} ({elapsed:.1f}s)")
        except Exception as e:
            elapsed = time.time() - t0
            results[lang] = f"FAILED: {e}"
            print(f"    ❌ {lang}: {e} ({elapsed:.1f}s)")

    print(f"\n  Results summary:")
    for lang, url in results.items():
        status = "✅" if url.startswith("http") else "❌"
        print(f"    {status} {lang}: {url[:100]}")

    successes = sum(1 for v in results.values() if v.startswith("http"))
    print(f"\n  {successes}/{len(TARGET_LANGUAGES)} translations succeeded")
    return results


def main():
    parser = argparse.ArgumentParser(description="ImageLingo E2E Pipeline Test")
    parser.add_argument("--live", action="store_true", help="Run live API tests (requires credentials)")
    parser.add_argument("--image-url", default=None, help="Custom image URL for live test")
    args = parser.parse_args()

    print("=" * 60)
    print("  ImageLingo E2E Pipeline Test")
    print(f"  Mode: {'LIVE' if args.live else 'DRY RUN (mocked)'}")
    print("=" * 60)

    test_lovart_prompt_building()
    test_lovart_result_parsing()

    if args.live:
        if not os.environ.get("LOVART_ACCESS_KEY") or not os.environ.get("LOVART_SECRET_KEY"):
            print("\n❌ LOVART_ACCESS_KEY and LOVART_SECRET_KEY required for live test")
            sys.exit(1)

        image_url = args.image_url
        if not image_url:
            print("\n  No --image-url provided. Using a public Chinese product image for testing.")
            image_url = "https://img.alicdn.com/imgextra/i4/2206686532834/O1CN01JqGSMo1TfN0XQmCIR_!!2206686532834.jpg"

        test_lovart_live(image_url)

    print("\n" + "=" * 60)
    print("  ALL TESTS PASSED ✅" if not args.live else "  LIVE TESTS COMPLETED")
    print("=" * 60)


if __name__ == "__main__":
    main()
