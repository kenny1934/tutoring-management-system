"""HTML sanitization for rich text messages."""

import bleach
from bleach.css_sanitizer import CSSSanitizer

ALLOWED_TAGS = [
    "p", "br", "strong", "em", "s", "code", "pre",
    "blockquote", "h1", "h2", "h3",
    "a", "span", "div", "img",
    "ul", "ol", "li",
    "table", "thead", "tbody", "tr", "td", "th",
]

ALLOWED_ATTRIBUTES = {
    "a": ["href", "title", "target", "rel"],
    "span": ["style", "data-type", "data-latex", "class"],
    "div": ["style", "data-type", "data-latex", "data-graph-json", "data-svg-thumbnail"],
    "img": ["src", "alt", "style"],
    "td": ["colspan", "rowspan", "data-colwidth", "style"],
    "th": ["colspan", "rowspan", "data-colwidth", "style"],
    "code": ["class"],
    "pre": ["class"],
}

ALLOWED_CSS_PROPERTIES = [
    "color", "cursor", "text-align",
    "padding", "padding-top", "padding-bottom",
    "margin", "margin-top", "margin-bottom",
    "max-width", "max-height", "height", "width",
    "border-radius", "border", "object-fit",
]


def sanitize_message_html(html: str) -> str:
    """Sanitize HTML to prevent XSS while preserving safe formatting tags."""
    return bleach.clean(
        html,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        css_sanitizer=CSSSanitizer(
            allowed_css_properties=ALLOWED_CSS_PROPERTIES
        ),
        strip=True,
    )


def strip_html_tags(html: str) -> str:
    """Strip all HTML tags, returning plain text. Useful for previews."""
    return bleach.clean(html, tags=[], strip=True)
