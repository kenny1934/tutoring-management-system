"""HTML sanitization for rich text messages."""

import bleach
from bleach.css_sanitizer import CSSSanitizer

ALLOWED_TAGS = [
    "p", "br", "strong", "em", "s", "code", "pre",
    "blockquote", "h1", "h2", "h3",
    "a", "span",
    "ul", "ol", "li",
]

ALLOWED_ATTRIBUTES = {
    "a": ["href", "title", "target", "rel"],
    "span": ["style"],
}

ALLOWED_CSS_PROPERTIES = ["color"]


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
