"""
Tests for HTML sanitizer utility.

Covers:
- sanitize_message_html() — XSS prevention while preserving safe formatting
- strip_html_tags() — plain text extraction
"""
import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from utils.html_sanitizer import sanitize_message_html, strip_html_tags


class TestSanitizeMessageHtml:
    """Test suite for sanitize_message_html function."""

    def test_preserves_safe_tags(self):
        """Allowed formatting tags are preserved."""
        html = "<p>Hello <strong>bold</strong> and <em>italic</em></p>"
        result = sanitize_message_html(html)
        assert "<strong>bold</strong>" in result
        assert "<em>italic</em>" in result

    def test_preserves_links(self):
        """<a> tags with href are preserved."""
        html = '<a href="https://example.com">Link</a>'
        result = sanitize_message_html(html)
        assert 'href="https://example.com"' in result

    def test_preserves_images(self):
        """<img> tags with src are preserved."""
        html = '<img src="photo.jpg" alt="test">'
        result = sanitize_message_html(html)
        assert "src=" in result
        assert "alt=" in result

    def test_strips_script_tags(self):
        """<script> tags are stripped (bleach strip=True keeps inner text but removes the tag)."""
        html = '<p>Safe</p><script>alert("xss")</script>'
        result = sanitize_message_html(html)
        assert "<script>" not in result
        assert "</script>" not in result

    def test_strips_onclick(self):
        """onclick handlers are removed."""
        html = '<p onclick="alert(1)">Click me</p>'
        result = sanitize_message_html(html)
        assert "onclick" not in result
        assert "Click me" in result

    def test_strips_onerror(self):
        """onerror handlers are removed from img."""
        html = '<img src="x" onerror="alert(1)">'
        result = sanitize_message_html(html)
        assert "onerror" not in result

    def test_preserves_data_latex(self):
        """data-latex attribute on span is preserved."""
        html = '<span data-type="math" data-latex="x^2">x²</span>'
        result = sanitize_message_html(html)
        assert "data-latex" in result
        assert "data-type" in result

    def test_preserves_data_graph_json(self):
        """data-graph-json on div is preserved."""
        html = '<div data-graph-json="{}" data-svg-thumbnail="svg">Graph</div>'
        result = sanitize_message_html(html)
        assert "data-graph-json" in result

    def test_preserves_table_structure(self):
        """Table elements are preserved."""
        html = "<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>D</td></tr></tbody></table>"
        result = sanitize_message_html(html)
        assert "<table>" in result
        assert "<th>" in result
        assert "<td>" in result

    def test_preserves_allowed_css(self):
        """Allowed CSS properties are preserved."""
        html = '<span style="color: red; text-align: center;">Styled</span>'
        result = sanitize_message_html(html)
        assert "color" in result

    def test_strips_disallowed_css(self):
        """Disallowed CSS properties are removed."""
        html = '<span style="position: absolute; z-index: 9999;">Hacked</span>'
        result = sanitize_message_html(html)
        assert "position" not in result
        assert "z-index" not in result


class TestStripHtmlTags:
    """Test suite for strip_html_tags function."""

    def test_strips_all_tags(self):
        """All HTML tags are removed, leaving plain text."""
        html = "<p>Hello <strong>world</strong></p>"
        assert strip_html_tags(html) == "Hello world"

    def test_strips_nested_tags(self):
        """Nested tags are fully stripped."""
        html = "<div><p>Text <em>with</em> <a href='#'>link</a></p></div>"
        result = strip_html_tags(html)
        assert "<" not in result
        assert "Text" in result
        assert "link" in result

    def test_empty_string(self):
        """Empty string returns empty."""
        assert strip_html_tags("") == ""

    def test_plain_text_unchanged(self):
        """Plain text without tags passes through."""
        assert strip_html_tags("Just text") == "Just text"
