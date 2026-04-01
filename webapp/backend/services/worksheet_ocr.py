"""
Worksheet OCR service — scanned PDF → TipTap JSON document via Gemini Vision.

Pipeline:
1. PDF → page images (PyMuPDF, 300 DPI)
2. Optional handwriting removal (reuse document_processing functions)
3. Per-page Gemini multimodal OCR → structured JSON
4. Merge pages → single TipTap document
5. Simplified → Traditional Chinese conversion
"""

from __future__ import annotations

import json
import logging
import re

from services.ai_client import generate_multimodal, MODEL_ID

logger = logging.getLogger(__name__)

# Lazy-loaded heavy deps
_fitz = None
_opencc_converter = None


def _ensure_fitz():
    global _fitz
    if _fitz is None:
        import fitz
        _fitz = fitz
    return _fitz


def _ensure_opencc():
    global _opencc_converter
    if _opencc_converter is None:
        from opencc import OpenCC
        _opencc_converter = OpenCC("s2t")
    return _opencc_converter


# ---------------------------------------------------------------------------
# PDF → page images
# ---------------------------------------------------------------------------

def pdf_to_page_images(pdf_bytes: bytes, dpi: int = 300) -> list[bytes]:
    """Render each page of a PDF to PNG bytes at the given DPI."""
    fitz = _ensure_fitz()
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        scale = dpi / 72
        mat = fitz.Matrix(scale, scale)
        return [page.get_pixmap(matrix=mat).tobytes("png") for page in doc]
    finally:
        doc.close()


# ---------------------------------------------------------------------------
# Gemini OCR prompt
# ---------------------------------------------------------------------------

OCR_SYSTEM_PROMPT = """You are a math worksheet OCR system. You receive a scanned page image from a Hong Kong secondary school (F1-F6) mathematics worksheet.

Your task: Extract ALL content from the image and output it as a JSON array of TipTap editor nodes.

## Output Format

Return a JSON object with a single key "nodes" containing an array of content nodes. Each node must be one of these types:

### heading
```json
{"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Title here"}]}
```
- Use level 2 for worksheet titles, level 3 for section headers, level 4 for question group headers.

### paragraph
```json
{"type": "paragraph", "content": [{"type": "text", "text": "Regular text"}]}
```
- For regular text content. Can contain mixed text and math.

### inlineMath (for math expressions within text)
```json
{"type": "inlineMath", "attrs": {"latex": "x^2 + 3x + 2 = 0"}}
```
- Use inside a paragraph's content array alongside text nodes.
- LaTeX must be KaTeX-compatible (no \\newcommand, no \\eqnarray).
- Use \\dfrac instead of \\frac for displayed fractions, \\text{} for text within math.

### blockMath (for standalone equations)
```json
{"type": "blockMath", "attrs": {"latex": "\\\\frac{-b \\\\pm \\\\sqrt{b^2 - 4ac}}{2a}"}}
```
- Use as a standalone block node for important equations.

### orderedList
```json
{"type": "orderedList", "attrs": {"start": 1}, "content": [
  {"type": "listItem", "content": [{"type": "paragraph", "content": [...]}]}
]}
```

### bulletList
```json
{"type": "bulletList", "content": [
  {"type": "listItem", "content": [{"type": "paragraph", "content": [...]}]}
]}
```

### table
```json
{"type": "table", "content": [
  {"type": "tableRow", "content": [
    {"type": "tableCell", "content": [{"type": "paragraph", "content": [...]}]}
  ]}
]}
```

## Rules

1. **Question numbering**: Each numbered question should start with a heading node (level 3) using the EXACT numbering format from the original document (e.g., "1.", "1)", "Q1", "第1題" — do NOT rewrite as "Question 1" unless the original says that).
   `{"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "1."}]}`
   Then its content follows as paragraph/math nodes. Sub-questions (a, b, c) should be regular paragraphs with the letter prefix.

2. **Math expressions**: ALL mathematical notation must be converted to KaTeX LaTeX.
   - Fractions: \\frac{a}{b}
   - Square roots: \\sqrt{x}, \\sqrt[3]{x}
   - Powers: x^{2}, x^{n}
   - Greek letters: \\alpha, \\beta, \\theta, \\pi
   - Trigonometry: \\sin, \\cos, \\tan
   - Inequalities: \\leq, \\geq, \\neq
   - Absolute value: |x| or \\lvert x \\rvert
   - Matrices: \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}
   - Systems: \\begin{cases} ... \\end{cases}
   - Aligned: \\begin{aligned} ... \\end{aligned}

3. **Geometry figures**: When you see a geometric diagram/figure, output a paragraph with the description:
   `{"type": "paragraph", "content": [{"type": "text", "text": "[Geometry figure: detailed description of the figure including all labeled points, measurements, angles, and relationships]"}]}`

4. **Language**: Output ALL Chinese text in Traditional Chinese (繁體中文). If the source is in Simplified Chinese, convert it. Keep mathematical terms and variable names in their original form.

5. **Handwriting**: If you see any handwritten text, annotations, or student answers written by hand (pen, pencil, or any ink), IGNORE them completely. Only transcribe the original printed/typed content of the worksheet.

6. **Blank answer spaces**: Preserve answer spaces as empty paragraphs to maintain the worksheet layout. For each visible answer space or blank area, output 2-3 empty paragraph nodes: `{"type": "paragraph"}`.

7. **Instructions text**: Preserve all instruction text (e.g., "Show your working", "寫出計算過程") as paragraphs.

8. **Marks allocation**: If questions show marks (e.g., "(3 marks)", "(3分)"), include them in the question text.

9. **Accuracy**: Transcribe EXACTLY the printed content on the page. Do not solve problems, simplify expressions, or add content that isn't there.

## Important
- Return ONLY the JSON object with "nodes" key. No markdown fences, no explanation.
- Every math expression, no matter how small (even a single variable like x), should be an inlineMath node if it appears within text.
"""


def _build_page_prompt(page_number: int, total_pages: int) -> str:
    """Build the per-page prompt."""
    return f"""{OCR_SYSTEM_PROMPT}

This is page {page_number} of {total_pages} of the worksheet. Extract all content from this page."""


# ---------------------------------------------------------------------------
# OCR pipeline
# ---------------------------------------------------------------------------

def _parse_ocr_response(text: str) -> list[dict]:
    """Parse Gemini's OCR response into a list of TipTap nodes."""
    text = text.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        logger.warning("Failed to parse OCR response as JSON: %s", exc)
        # Fallback: wrap raw text in a paragraph
        return [{"type": "paragraph", "content": [{"type": "text", "text": text[:500]}]}]

    # Handle both {"nodes": [...]} and direct array
    if isinstance(data, dict) and "nodes" in data:
        nodes = data["nodes"]
    elif isinstance(data, list):
        nodes = data
    else:
        logger.warning("Unexpected OCR response structure: %s", type(data))
        return [{"type": "paragraph", "content": [{"type": "text", "text": str(data)[:500]}]}]

    return nodes if isinstance(nodes, list) else []


def _convert_to_traditional(nodes: list[dict]) -> list[dict]:
    """Recursively convert all text content from Simplified to Traditional Chinese."""
    cc = _ensure_opencc()

    def convert_node(node: dict) -> dict:
        if node.get("type") == "text" and "text" in node:
            original = node["text"]
            converted = cc.convert(original)
            if converted != original:
                node = {**node, "text": converted}
        if "content" in node and isinstance(node["content"], list):
            node = {**node, "content": [convert_node(c) for c in node["content"]]}
        if "attrs" in node and isinstance(node.get("attrs"), dict):
            attrs = node["attrs"]
            latex = attrs.get("latex")
            if isinstance(latex, str) and "\\text{" in latex:
                def convert_text_cmd(m):
                    return f"\\text{{{cc.convert(m.group(1))}}}"
                new_latex = re.sub(r"\\text\{([^}]+)\}", convert_text_cmd, latex)
                if new_latex != latex:
                    node = {**node, "attrs": {**attrs, "latex": new_latex}}
        return node

    return [convert_node(n) for n in nodes]


def ocr_page(
    page_image_bytes: bytes,
    page_number: int,
    total_pages: int,
    model: str = MODEL_ID,
) -> tuple[list[dict], int, int]:
    """
    OCR a single page image and return (TipTap content nodes, input_tokens, output_tokens).

    Tries structured JSON output first; falls back to unstructured if the model
    returns empty (can happen with complex scans + JSON constraint).
    """
    prompt = _build_page_prompt(page_number, total_pages)
    call_kwargs = dict(
        prompt=prompt,
        images=[(page_image_bytes, "image/png")],
        thinking_level="low",
        max_output_tokens=8192,
        temperature=0.1,
        model=model,
    )

    from fastapi import HTTPException

    # Try with structured JSON output first
    try:
        text, input_tokens, output_tokens, is_truncated = generate_multimodal(
            **call_kwargs, response_mime_type="application/json",
        )
    except HTTPException as exc:
        if exc.status_code == 502:
            # Empty response — retry without JSON constraint
            logger.warning("OCR page %d/%d: structured output failed, retrying without JSON constraint", page_number, total_pages)
            text, input_tokens, output_tokens, is_truncated = generate_multimodal(**call_kwargs)
        else:
            raise

    logger.info(
        "OCR page %d/%d: %d input + %d output tokens, truncated=%s",
        page_number, total_pages, input_tokens, output_tokens, is_truncated,
    )

    nodes = _parse_ocr_response(text)
    return nodes, input_tokens, output_tokens


def ocr_worksheet(
    pdf_bytes: bytes,
    remove_handwriting: bool = True,
    model: str = MODEL_ID,
) -> tuple[dict, int, int]:
    """
    Full OCR pipeline: PDF → TipTap document JSON.

    Returns:
        (tiptap_doc, total_input_tokens, total_output_tokens)
    """
    page_images = pdf_to_page_images(pdf_bytes)
    total_pages = len(page_images)
    logger.info("Worksheet OCR: %d pages, remove_handwriting=%s", total_pages, remove_handwriting)

    if remove_handwriting:
        page_images = _remove_handwriting_from_pages(page_images)

    all_nodes: list[dict] = []
    total_input = 0
    total_output = 0
    for i, png_bytes in enumerate(page_images, start=1):
        try:
            nodes, inp, out = ocr_page(png_bytes, i, total_pages, model=model)
            total_input += inp
            total_output += out
            all_nodes.extend(nodes)
        except Exception as exc:
            logger.error("OCR page %d/%d failed: %s", i, total_pages, exc)
            all_nodes.append({"type": "paragraph", "content": [
                {"type": "text", "text": f"[Page {i} could not be processed]"}
            ]})
        if i < total_pages:
            all_nodes.append({"type": "pageBreak"})

    all_nodes = _convert_to_traditional(all_nodes)

    if not all_nodes:
        all_nodes = [{"type": "paragraph", "content": [{"type": "text", "text": "OCR produced no content. Please check the source PDF."}]}]

    logger.info("Worksheet OCR complete: %d input + %d output tokens", total_input, total_output)
    return {"type": "doc", "content": all_nodes}, total_input, total_output


def _remove_handwriting_from_pages(page_images: list[bytes]) -> list[bytes]:
    """Remove colored ink and pencil marks from page images."""
    try:
        import numpy as np
        import cv2
        from routers.document_processing import remove_colored_ink, remove_pencil_marks, _ensure_heavy_imports
        _ensure_heavy_imports()
    except (ImportError, RuntimeError):
        logger.warning("OpenCV not available, skipping handwriting removal")
        return page_images

    cleaned = []
    for png_bytes in page_images:
        arr = np.frombuffer(png_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            cleaned.append(png_bytes)
            continue

        img = remove_colored_ink(img, remove_blue=True, remove_red=True, remove_green=True)
        img = remove_pencil_marks(img, threshold=200)

        _, out_bytes = cv2.imencode(".png", img)
        cleaned.append(out_bytes.tobytes())

    return cleaned
