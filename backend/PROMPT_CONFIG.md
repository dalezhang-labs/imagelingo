# ImageLingo — Lovart Prompt Configuration
# Last optimized: 2026-04-21
#
# These prompt templates are used in backend/services/lovart_service.py
# to instruct Lovart's AI to translate text in product images.
#
# Key findings from testing:
# 1. Including OCR-extracted text in the prompt significantly improves accuracy
# 2. Explicit numbered requirements help Lovart follow instructions
# 3. Mentioning "product image" context helps preserve commercial design elements
# 4. "EXACT same layout" phrasing works better than "identical layout"
# 5. Listing specific preservation targets (fonts, colors, positioning) is important
#
# Prompt V2 (with OCR context) — preferred when OCR succeeds:
#   "This is a product image containing text in {source_lang}.
#    The OCR-detected text regions are:
#    - "text1"
#    - "text2"
#    ...
#    Task: Generate a new version of this exact image where ALL text has been
#    accurately translated into {target_lang}. Requirements:
#    1. Translate every piece of text faithfully — do not omit any text region
#    2. Keep the EXACT same image layout, background, colors, and visual design
#    3. Match the original font style, size, and positioning as closely as possible
#    4. Preserve all non-text elements (logos, icons, product photos) unchanged
#    5. Output the final translated image"
#
# Prompt V2 (without OCR) — fallback:
#   Same as above but without the OCR text listing.
#
# Tested translation directions:
#   Chinese → English: Good results with OCR context
#   Chinese → Japanese: Good results (Lovart handles CJK well)
#   Chinese → Korean: Good results
#
# Known limitations:
#   - Very small text (<12px equivalent) may be missed or poorly rendered
#   - Complex decorative fonts may be simplified
#   - Text on curved surfaces or at angles may shift slightly
