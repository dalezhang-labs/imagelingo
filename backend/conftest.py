"""Backend test bootstrap.

Provides lightweight stubs for optional third-party packages that the test suite
patches directly, so collection does not fail when dependencies are absent.
"""
from __future__ import annotations

import io
import sys
import types
from typing import Any


# Pillow stub for tests that only need Image.new/save for generating bytes.
if "PIL" not in sys.modules:
    pil = types.ModuleType("PIL")
    image_mod = types.ModuleType("PIL.Image")

    class _StubImage:
        def save(self, buf: Any, format: str | None = None):
            if hasattr(buf, "write"):
                buf.write(b"stub-image")

    def new(mode: str, size: tuple[int, int], color=None):
        return _StubImage()

    image_mod.new = new
    pil.Image = image_mod
    sys.modules["PIL"] = pil
    sys.modules["PIL.Image"] = image_mod
