"""DeepL translation service wrapper."""
from __future__ import annotations

import asyncio
import os
from typing import Iterable

try:
    import deepl
except ModuleNotFoundError:  # pragma: no cover - fallback for test environments
    deepl = None  # type: ignore[assignment]

from backend.config import validate_env


class TranslateService:
    def __init__(self):
        validate_env(["DEEPL_API_KEY"])
        self.api_key = os.environ["DEEPL_API_KEY"]
        self.enabled = deepl is not None
        self.client = deepl.Translator(self.api_key) if self.enabled else None

    def _translate_sync(self, texts: Iterable[str], target_lang: str) -> list[str]:
        if not self.enabled:
            return [f"[{target_lang}] {text}" for text in texts]
        results = self.client.translate_text(list(texts), target_lang=target_lang)
        if isinstance(results, list):
            return [item.text for item in results]
        return [results.text]

    async def translate_texts(self, texts: list[str], target_lang: str) -> list[str]:
        return await asyncio.to_thread(self._translate_sync, texts, target_lang)
