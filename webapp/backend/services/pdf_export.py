"""PDF export service using Playwright headless Chromium.

Renders HTML in the same engine as the browser for 100% content fidelity.
Header/footer templates use Playwright's built-in overlay mechanism, which
allows images and page numbers to coexist in the same rendering context.
External URLs not loadable in Playwright templates are pre-fetched as base64.
"""
import base64
import logging
from datetime import datetime

import httpx

logger = logging.getLogger(__name__)


async def _fetch_base64(url: str) -> str | None:
    """Fetch image URL, return as base64 data URI.

    Required because Playwright's headerTemplate/footerTemplate cannot load
    external URLs — images must be embedded as data URIs.
    """
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                mime = resp.headers.get("content-type", "image/png").split(";")[0]
                data = base64.b64encode(resp.content).decode()
                return f"data:{mime};base64,{data}"
    except Exception:
        logger.warning("Failed to fetch image for PDF header/footer: %s", url)
    return None


def _resolve_text(template: str, title: str) -> str:
    today = datetime.now().strftime("%b %-d, %Y")
    return template.replace("{title}", title).replace("{date}", today)


def _build_hf_template(section: dict | None, is_header: bool, lr_margin_mm: float) -> str:
    """Build a Playwright headerTemplate/footerTemplate HTML string.

    Both image and page number render in the same overlay zone (same line).
    `<span class="pageNumber">` is replaced by Playwright with the actual page number.
    """
    if not section or not section.get("enabled"):
        return "<span></span>"

    border = (
        "border-bottom:0.5px solid #ddd;padding-bottom:3px;"
        if is_header
        else "border-top:0.5px solid #ddd;padding-top:3px;"
    )
    image_b64 = section.get("_image_b64")
    image_pos = section.get("imagePosition")
    title = section.get("_title", "")

    def cell_html(text: str | None, pos: str) -> str:
        parts = []
        if image_b64 and image_pos == pos:
            margin = "margin-left:4px;" if pos == "right" else "margin-right:4px;"
            parts.append(
                f'<img src="{image_b64}" '
                f'style="height:8mm;width:auto;vertical-align:middle;{margin}" />'
            )
        if text:
            resolved = _resolve_text(text, title)
            page_parts = resolved.split("{page}")
            parts.append('<span class="pageNumber"></span>'.join(page_parts))
        if not parts:
            return ""
        justify = {"left": "flex-start", "center": "center", "right": "flex-end"}.get(pos, "flex-start")
        return (
            f'<span style="flex:1;display:flex;align-items:center;justify-content:{justify};">'
            + "".join(parts)
            + "</span>"
        )

    cells = "".join([
        cell_html(section.get("left") or "", "left"),
        cell_html(section.get("center") or "", "center"),
        cell_html(section.get("right") or "", "right"),
    ])
    return (
        f'<div style="font-size:9px;color:#888;display:flex;width:100%;'
        f'box-sizing:border-box;padding:0 {lr_margin_mm}mm;{border}">'
        f"{cells}</div>"
    )


async def generate_pdf(
    html_body: str,
    css: str,
    page_layout: dict | None = None,
    doc_title: str = "",
) -> bytes:
    """Generate PDF using Playwright headless Chromium.

    Args:
        html_body: Document content HTML (editor content + watermark).
        css: Page CSS (margins, typography, watermark positioning).
        page_layout: Document page_layout from DB (margins, header, footer, watermark).
        doc_title: Document title for {title} template variable resolution.

    Returns:
        PDF file as bytes.
    """
    from playwright.async_api import async_playwright

    layout = page_layout or {}
    margins = layout.get("margins") or {}
    top_mm = margins.get("top", 25.4)
    right_mm = margins.get("right", 25.4)
    bottom_mm = margins.get("bottom", 25.4)
    left_mm = margins.get("left", 25.4)

    header_cfg = dict(layout.get("header") or {})
    footer_cfg = dict(layout.get("footer") or {})
    watermark_cfg = layout.get("watermark") or {}

    # Pre-fetch header/footer images as base64 (Playwright templates cannot load external URLs)
    for cfg in [header_cfg, footer_cfg]:
        cfg["_title"] = doc_title
        if cfg.get("imageUrl"):
            cfg["_image_b64"] = await _fetch_base64(cfg["imageUrl"])

    has_hf = bool(header_cfg.get("enabled") or footer_cfg.get("enabled"))
    header_template = _build_hf_template(header_cfg, is_header=True, lr_margin_mm=left_mm)
    footer_template = _build_hf_template(footer_cfg, is_header=False, lr_margin_mm=left_mm)

    # Watermark: position:fixed repeats on every page in Chromium's print engine
    watermark_html = ""
    if watermark_cfg.get("enabled"):
        opacity = watermark_cfg.get("opacity", 0.15)
        if watermark_cfg.get("type") == "text" and watermark_cfg.get("text"):
            text = watermark_cfg["text"].replace("<", "&lt;").replace(">", "&gt;")
            watermark_html = (
                f'<div style="position:fixed;top:50%;left:50%;'
                f'transform:translate(-50%,-50%) rotate(-45deg);'
                f'font-size:80px;font-weight:bold;color:#000;opacity:{opacity};'
                f'white-space:nowrap;z-index:-1;pointer-events:none;">{text}</div>'
            )
        elif watermark_cfg.get("type") == "image" and watermark_cfg.get("imageUrl"):
            size = watermark_cfg.get("imageSize", 60)
            url = watermark_cfg["imageUrl"].replace('"', "&quot;")
            watermark_html = (
                f'<img src="{url}" style="position:fixed;top:50%;left:50%;'
                f'transform:translate(-50%,-50%);width:{size}%;'
                f'opacity:{opacity};z-index:-1;" />'
            )

    full_html = f"""<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css" crossorigin="anonymous">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700&family=Noto+Serif+TC:wght@300;400;700&display=swap" rel="stylesheet">
<style>{css}</style>
</head><body>
{watermark_html}
{html_body}
</body></html>"""

    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        page = await browser.new_page()
        await page.set_content(full_html, wait_until="networkidle")
        pdf_bytes = await page.pdf(
            format="A4",
            margin={
                "top": f"{top_mm}mm",
                "right": f"{right_mm}mm",
                "bottom": f"{bottom_mm}mm",
                "left": f"{left_mm}mm",
            },
            print_background=True,
            display_header_footer=has_hf,
            header_template=header_template,
            footer_template=footer_template,
        )
        await browser.close()

    return pdf_bytes
