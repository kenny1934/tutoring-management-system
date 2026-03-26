"""
Tests for question extraction service and endpoint.

Covers:
- Layer 1: Structural parsing (parse_questions)
- Layer 2: AI enrichment (mocked Gemini)
- POST /documents/{id}/extract-questions endpoint
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
    tutor = Tutor(id=1, user_email="t@t.com", tutor_name="Mr T", role="Tutor", default_location="MSA")
    db_session.add(tutor)
    db_session.commit()
    return tutor


SAMPLE_CONTENT = {
    "type": "doc",
    "content": [
        {"type": "heading", "attrs": {"level": 2, "textAlign": "center"},
         "content": [{"type": "text", "text": "F3 Algebra Worksheet"}]},
        {"type": "paragraph",
         "content": [{"type": "text", "text": "Answer all questions."}]},
        # Question 1 (index 2)
        {"type": "heading", "attrs": {"level": 3},
         "content": [{"type": "text", "text": "1."}]},
        {"type": "paragraph",
         "content": [
             {"type": "text", "text": "Solve "},
             {"type": "inlineMath", "attrs": {"latex": "x^2 - 5x + 6 = 0"}},
         ]},
        {"type": "paragraph",
         "content": [{"type": "text", "text": "(3 marks)"}]},
        # Question 2 (index 5)
        {"type": "heading", "attrs": {"level": 3},
         "content": [{"type": "text", "text": "2."}]},
        {"type": "paragraph",
         "content": [{"type": "text", "text": "(a) Find the value of x"}]},
        {"type": "paragraph",
         "content": [{"type": "text", "text": "(b) Hence solve the equation"}]},
        {"type": "paragraph",
         "content": [{"type": "text", "text": "(5 marks)"}]},
    ],
}


class TestParseQuestions:
    """Layer 1: Structural parsing."""

    def test_basic_extraction(self):
        from services.question_extraction import parse_questions

        questions = parse_questions(SAMPLE_CONTENT)
        assert len(questions) == 2

    def test_question_boundaries(self):
        from services.question_extraction import parse_questions

        questions = parse_questions(SAMPLE_CONTENT)
        # Q1 starts at index 2 (heading), ends at index 5 (next heading)
        assert questions[0]["start_node"] == 2
        assert questions[0]["end_node"] == 5
        # Q2 starts at index 5, ends at 9 (end of content)
        assert questions[1]["start_node"] == 5
        assert questions[1]["end_node"] == 9

    def test_labels(self):
        from services.question_extraction import parse_questions

        questions = parse_questions(SAMPLE_CONTENT)
        assert questions[0]["label"] == "1."
        assert questions[1]["label"] == "2."

    def test_marks_extraction(self):
        from services.question_extraction import parse_questions

        questions = parse_questions(SAMPLE_CONTENT)
        assert questions[0]["marks"] == 3
        assert questions[1]["marks"] == 5

    def test_sub_questions(self):
        from services.question_extraction import parse_questions

        questions = parse_questions(SAMPLE_CONTENT)
        assert questions[0]["sub_questions"] == []
        assert "(a)" in questions[1]["sub_questions"]
        assert "(b)" in questions[1]["sub_questions"]

    def test_empty_content(self):
        from services.question_extraction import parse_questions

        assert parse_questions({"type": "doc", "content": []}) == []
        assert parse_questions({}) == []

    def test_no_questions(self):
        from services.question_extraction import parse_questions

        content = {
            "type": "doc",
            "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "Just text"}]},
            ],
        }
        assert parse_questions(content) == []


class TestParseQuestionsPreview:
    """Preview text extraction."""

    def test_preview_from_body(self):
        from services.question_extraction import parse_questions

        questions = parse_questions(SAMPLE_CONTENT)
        # Q1 has body nodes with math — preview should contain $...$
        assert questions[0]["preview"]
        assert "$" in questions[0]["preview"]  # math delimiters present

    def test_preview_fields_exist(self):
        from services.question_extraction import parse_questions

        questions = parse_questions(SAMPLE_CONTENT)
        for q in questions:
            assert "preview" in q
            assert q["topic"] is None  # No AI enrichment
            assert q["difficulty"] is None


class TestExtractQuestionsEndpoint:
    """POST /documents/{id}/extract-questions"""

    def test_extracts_and_saves(self, client, db_session):
        _seed_tutor(db_session)
        token = make_auth_token(1)

        doc = Document(
            id=100, title="Test", doc_type="worksheet", content=SAMPLE_CONTENT,
            created_by=1, is_template=False,
        )
        db_session.add(doc)
        db_session.commit()

        resp = client.post(
            "/api/documents/100/extract-questions",
            cookies={"access_token": token},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 2
        assert data["questions"][0]["label"] == "1."
        assert data["questions"][0]["topic"] is None  # No AI — populated by future solution gen

        db_session.refresh(doc)
        assert doc.questions is not None
        assert len(doc.questions) == 2

    def test_404_for_missing_doc(self, client, db_session):
        _seed_tutor(db_session)
        token = make_auth_token(1)

        resp = client.post(
            "/api/documents/999/extract-questions",
            cookies={"access_token": token},
        )
        assert resp.status_code == 404
