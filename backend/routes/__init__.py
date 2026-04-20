"""Compatibility package for backend routes.

Tests patch backend.routes.translate, so the submodule must be imported
at package import time and exposed as an attribute.
"""
from . import translate

__all__ = ["translate"]
