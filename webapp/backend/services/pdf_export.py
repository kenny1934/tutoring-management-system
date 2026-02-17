"""PDF export service using weasyprint.

Converts HTML + CSS to PDF with full CSS Paged Media Level 3 support,
including background-size in @page margin boxes (which Chrome lacks).
"""

import logging

logger = logging.getLogger(__name__)


def generate_pdf(html_body: str, css: str, base_url: str | None = None) -> bytes:
    """Convert HTML content + CSS to PDF bytes using weasyprint.

    Args:
        html_body: The document HTML content (inner HTML of the page div).
        css: Complete CSS including @page rules for margins, headers/footers.
        base_url: Base URL for resolving relative URLs (e.g. image src).

    Returns:
        PDF file contents as bytes.
    """
    from weasyprint import CSS, HTML

    full_html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>{css}</style>
</head>
<body>{html_body}</body>
</html>"""

    html_doc = HTML(string=full_html, base_url=base_url)
    return html_doc.write_pdf()
