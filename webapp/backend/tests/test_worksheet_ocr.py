"""
Tests for worksheet OCR feature.

Covers:
- generate_multimodal() in ai_client (mocked Gemini)
- worksheet_ocr service (mocked Gemini)
- POST /documents/import-worksheet endpoint
"""
import json
import pytest
import sys
import os
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from models import Tutor, Document
from tests.helpers import make_auth_token


def _seed_tutor(db_session) -> Tutor:
    tutor = Tutor(
        id=1, user_email="t@t.com", tutor_name="Mr T",
        role="Tutor", default_location="MSA",
    )
    db_session.add(tutor)
    db_session.commit()
    return tutor


# ---------------------------------------------------------------------------
# ai_client.generate_multimodal
# ---------------------------------------------------------------------------

class TestGenerateMultimodal:
    """Test the multimodal Gemini client function."""

    def test_constructs_parts_correctly(self):
        """Should construct Part objects for text and images."""
        from services.ai_client import generate_multimodal, reset_client

        mock_response = MagicMock()
        mock_response.text = '{"nodes": []}'
        mock_response.candidates = []
        mock_response.usage_metadata = MagicMock(candidates_token_count=50)

        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_response

        with patch("services.ai_client._get_client", return_value=mock_client):
            text, tokens, truncated = generate_multimodal(
                prompt="OCR this page",
                images=[(b"fake_png_bytes", "image/png")],
                temperature=0.1,
            )

        assert text == '{"nodes": []}'
        assert tokens == 50
        assert truncated is False

        # Verify generate_content was called with contents list
        call_args = mock_client.models.generate_content.call_args
        contents = call_args.kwargs.get("contents") or call_args[1].get("contents")
        assert isinstance(contents, list)
        assert len(contents) == 2  # text + 1 image

    def test_structured_json_output(self):
        """Should pass response_mime_type when specified."""
        from services.ai_client import generate_multimodal

        mock_response = MagicMock()
        mock_response.text = '{"nodes": [{"type": "paragraph"}]}'
        mock_response.candidates = []
        mock_response.usage_metadata = MagicMock(candidates_token_count=30)

        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_response

        with patch("services.ai_client._get_client", return_value=mock_client):
            text, _, _ = generate_multimodal(
                prompt="OCR",
                images=[(b"img", "image/png")],
                response_mime_type="application/json",
            )

        assert json.loads(text) == {"nodes": [{"type": "paragraph"}]}

        # Verify config includes response_mime_type
        call_args = mock_client.models.generate_content.call_args
        config = call_args.kwargs.get("config") or call_args[1].get("config")
        assert config.response_mime_type == "application/json"

    def test_empty_response_raises_502(self):
        """Should raise HTTPException 502 on empty response."""
        from services.ai_client import generate_multimodal
        from fastapi import HTTPException

        mock_response = MagicMock()
        mock_response.text = ""

        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_response

        with patch("services.ai_client._get_client", return_value=mock_client):
            with pytest.raises(HTTPException) as exc_info:
                generate_multimodal(prompt="OCR", images=[(b"img", "image/png")])
            assert exc_info.value.status_code == 502


# ---------------------------------------------------------------------------
# worksheet_ocr service
# ---------------------------------------------------------------------------

class TestWorksheetOcrService:
    """Test the OCR service layer (Gemini mocked)."""

    def test_parse_ocr_response_json_object(self):
        """Should extract nodes from {"nodes": [...]} format."""
        from services.worksheet_ocr import _parse_ocr_response

        resp = '{"nodes": [{"type": "paragraph", "content": [{"type": "text", "text": "Hello"}]}]}'
        nodes = _parse_ocr_response(resp)
        assert len(nodes) == 1
        assert nodes[0]["type"] == "paragraph"

    def test_parse_ocr_response_direct_array(self):
        """Should handle direct JSON array response."""
        from services.worksheet_ocr import _parse_ocr_response

        resp = '[{"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Title"}]}]'
        nodes = _parse_ocr_response(resp)
        assert len(nodes) == 1
        assert nodes[0]["type"] == "heading"

    def test_parse_ocr_response_with_code_fences(self):
        """Should strip markdown code fences."""
        from services.worksheet_ocr import _parse_ocr_response

        resp = '```json\n{"nodes": [{"type": "paragraph", "content": [{"type": "text", "text": "test"}]}]}\n```'
        nodes = _parse_ocr_response(resp)
        assert len(nodes) == 1

    def test_parse_ocr_response_invalid_json(self):
        """Should return fallback paragraph on invalid JSON."""
        from services.worksheet_ocr import _parse_ocr_response

        nodes = _parse_ocr_response("this is not json at all")
        assert len(nodes) == 1
        assert nodes[0]["type"] == "paragraph"

    def test_convert_to_traditional(self):
        """Should convert Simplified Chinese text to Traditional."""
        from services.worksheet_ocr import _convert_to_traditional

        nodes = [
            {"type": "text", "text": "数学工作纸"},  # Simplified
            {"type": "paragraph", "content": [
                {"type": "text", "text": "解方程"}
            ]},
        ]
        result = _convert_to_traditional(nodes)
        # Traditional Chinese equivalents
        assert "數學" in result[0]["text"]
        assert "解方程" in result[1]["content"][0]["text"] or "解方程" in result[1]["content"][0]["text"]

    def test_ocr_worksheet_assembles_document(self):
        """Full pipeline should produce valid TipTap doc JSON."""
        from services.worksheet_ocr import ocr_worksheet

        mock_nodes = [
            {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Test"}]},
            {"type": "paragraph", "content": [{"type": "text", "text": "Q1"}]},
        ]

        # Mock PyMuPDF to return a single fake page
        mock_page = MagicMock()
        mock_page.get_pixmap.return_value = MagicMock(
            tobytes=lambda fmt: b"fake_png",
            width=800, height=1200,
        )
        mock_doc = MagicMock()
        mock_doc.__iter__ = lambda self: iter([mock_page])
        mock_doc.__len__ = lambda self: 1

        with patch("services.worksheet_ocr._ensure_fitz") as mock_fitz, \
             patch("services.worksheet_ocr.generate_multimodal") as mock_gen:
            mock_fitz.return_value.open.return_value = mock_doc
            mock_fitz.return_value.Matrix.return_value = MagicMock()
            mock_gen.return_value = (json.dumps({"nodes": mock_nodes}), 100, False)

            doc = ocr_worksheet(b"fake_pdf_bytes", remove_handwriting=False)

        assert doc["type"] == "doc"
        assert isinstance(doc["content"], list)
        assert len(doc["content"]) == 2
        assert doc["content"][0]["type"] == "heading"


# ---------------------------------------------------------------------------
# Import endpoint
# ---------------------------------------------------------------------------

class TestImportWorksheetEndpoint:
    """POST /api/documents/import-worksheet"""

    def test_rejects_non_pdf(self, client, db_session):
        """Should return 400 for non-PDF files."""
        _seed_tutor(db_session)
        token = make_auth_token(1)

        resp = client.post(
            "/api/documents/import-worksheet",
            files={"file": ("test.txt", b"hello", "text/plain")},
            cookies={"access_token": token},
        )
        assert resp.status_code == 400
        assert "PDF" in resp.json()["detail"]

    def test_successful_import(self, client, db_session):
        """Should create a document with OCR content."""
        _seed_tutor(db_session)
        token = make_auth_token(1)

        mock_tiptap = {
            "type": "doc",
            "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "OCR result"}]}
            ],
        }

        with patch("services.worksheet_ocr.ocr_worksheet", return_value=mock_tiptap) as mock_ocr:
            resp = client.post(
                "/api/documents/import-worksheet?title=My+Worksheet",
                files={"file": ("test.pdf", b"%PDF-1.4 fake", "application/pdf")},
                cookies={"access_token": token},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "My Worksheet"
        assert data["doc_type"] == "worksheet"
        assert "imported" in data["tags"]
        assert "ocr" in data["tags"]

        # Verify document was created in DB
        doc = db_session.query(Document).filter(Document.id == data["id"]).first()
        assert doc is not None
        assert doc.content == mock_tiptap

    def test_defaults_title_from_filename(self, client, db_session):
        """Should use filename as title when no title provided."""
        _seed_tutor(db_session)
        token = make_auth_token(1)

        mock_tiptap = {"type": "doc", "content": [{"type": "paragraph"}]}

        with patch("services.worksheet_ocr.ocr_worksheet", return_value=mock_tiptap):
            resp = client.post(
                "/api/documents/import-worksheet",
                files={"file": ("F3_Quadratics.pdf", b"%PDF-1.4 fake", "application/pdf")},
                cookies={"access_token": token},
            )

        assert resp.status_code == 200
        assert resp.json()["title"] == "F3_Quadratics"
