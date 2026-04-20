import os
import deepl


class TranslateService:
    def __init__(self):
        api_key = os.getenv("DEEPL_API_KEY", "")
        self._translator = deepl.Translator(api_key)

    async def translate_texts(self, texts: list[str], target_lang: str) -> list[str]:
        """
        Translate a list of texts to target_lang.
        target_lang format: 'EN-US', 'DE', 'JA', 'KO', 'FR', etc.
        Returns translated strings in the same order.
        """
        if not texts:
            return []
        results = self._translator.translate_text(texts, target_lang=target_lang)
        if isinstance(results, list):
            return [r.text for r in results]
        return [results.text]
