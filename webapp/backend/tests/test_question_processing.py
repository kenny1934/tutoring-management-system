"""
Tests for question processing service and endpoints.

Covers:
- text_to_tiptap_nodes converter
- apply_solutions_to_content logic
- build_variant_document
- POST /documents/{id}/process-questions (mocked Gemini)
- POST /documents/{id}/apply-solutions
- POST /documents/{id}/create-variant-document
"""
import json
import pytest
import sys
import os
from unittest.mock import patch, MagicMock, AsyncMock

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

SAMPLE_QUESTIONS = [
    {"index": 0, "label": "1.", "start_node": 2, "end_node": 5,
     "preview": "Solve $x^2 - 5x + 6 = 0$ (3 marks)", "topic": None,
     "subtopic": None, "difficulty": None, "marks": 3, "sub_questions": []},
    {"index": 1, "label": "2.", "start_node": 5, "end_node": 9,
     "preview": "(a) Find the value of x (b) Hence solve the equation (5 marks)",
     "topic": None, "subtopic": None, "difficulty": None, "marks": 5,
     "sub_questions": ["(a)", "(b)"]},
]


# ─── text_to_tiptap_nodes ─────────────────────────────────────────────

class TestTextToTipTapNodes:
    def test_plain_text(self):
        from services.question_processing import text_to_tiptap_nodes

        nodes = text_to_tiptap_nodes("Hello world")
        assert len(nodes) == 1
        assert nodes[0]["type"] == "paragraph"
        assert nodes[0]["content"][0] == {"type": "text", "text": "Hello world"}

    def test_inline_math(self):
        from services.question_processing import text_to_tiptap_nodes

        nodes = text_to_tiptap_nodes("Solve $x^2 = 4$ for x")
        para = nodes[0]
        assert len(para["content"]) == 3
        assert para["content"][0] == {"type": "text", "text": "Solve "}
        assert para["content"][1] == {"type": "inlineMath", "attrs": {"latex": "x^2 = 4"}}
        assert para["content"][2] == {"type": "text", "text": " for x"}

    def test_multiple_lines(self):
        from services.question_processing import text_to_tiptap_nodes

        nodes = text_to_tiptap_nodes("Step 1: $a = 1$\nStep 2: $b = 2$")
        assert len(nodes) == 2
        assert nodes[0]["content"][0] == {"type": "text", "text": "Step 1: "}
        assert nodes[1]["content"][0] == {"type": "text", "text": "Step 2: "}

    def test_empty_line_becomes_empty_paragraph(self):
        from services.question_processing import text_to_tiptap_nodes

        nodes = text_to_tiptap_nodes("Line 1\n\nLine 2")
        assert len(nodes) == 3
        assert nodes[1] == {"type": "paragraph"}

    def test_empty_string(self):
        from services.question_processing import text_to_tiptap_nodes

        nodes = text_to_tiptap_nodes("")
        assert nodes == [{"type": "paragraph"}]


# ─── apply_solutions_to_content ────────────────────────────────────────

class TestApplySolutions:
    def test_inserts_answer_section(self):
        from services.question_processing import apply_solutions_to_content

        results = [{
            "index": 0,
            "label": "1.",
            "solution_nodes": [{"type": "paragraph", "content": [{"type": "text", "text": "x = 2 or x = 3"}]}],
        }]

        new_content = apply_solutions_to_content(SAMPLE_CONTENT, SAMPLE_QUESTIONS, results)
        nodes = new_content["content"]

        # answerSection should be inserted at index 5 (end of Q1)
        answer = nodes[5]
        assert answer["type"] == "answerSection"
        assert answer["attrs"]["label"] == "1"
        assert answer["content"][0]["content"][0]["text"] == "x = 2 or x = 3"

    def test_skips_existing_answer_section(self):
        from services.question_processing import apply_solutions_to_content

        # Add an existing answerSection in Q1's range
        content_with_answer = {
            "type": "doc",
            "content": list(SAMPLE_CONTENT["content"]),
        }
        content_with_answer["content"].insert(5, {
            "type": "answerSection",
            "attrs": {"open": False, "align": "left", "label": "1"},
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": "old answer"}]}],
        })

        # Adjust Q2 boundaries for the inserted node
        questions = [
            {**SAMPLE_QUESTIONS[0], "end_node": 6},
            {**SAMPLE_QUESTIONS[1], "start_node": 6, "end_node": 10},
        ]

        results = [{
            "index": 0,
            "label": "1.",
            "solution_nodes": [{"type": "paragraph", "content": [{"type": "text", "text": "new answer"}]}],
        }]

        new_content = apply_solutions_to_content(content_with_answer, questions, results, replace_existing=False)
        # Should keep old answer, not insert new one
        answer_count = sum(1 for n in new_content["content"] if n.get("type") == "answerSection")
        assert answer_count == 1
        assert new_content["content"][5]["content"][0]["content"][0]["text"] == "old answer"

    def test_replaces_existing_when_flag_set(self):
        from services.question_processing import apply_solutions_to_content

        content_with_answer = {
            "type": "doc",
            "content": list(SAMPLE_CONTENT["content"]),
        }
        content_with_answer["content"].insert(5, {
            "type": "answerSection",
            "attrs": {"open": False, "align": "left", "label": "1"},
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": "old answer"}]}],
        })

        questions = [
            {**SAMPLE_QUESTIONS[0], "end_node": 6},
            {**SAMPLE_QUESTIONS[1], "start_node": 6, "end_node": 10},
        ]

        results = [{
            "index": 0,
            "label": "1.",
            "solution_nodes": [{"type": "paragraph", "content": [{"type": "text", "text": "new answer"}]}],
        }]

        new_content = apply_solutions_to_content(content_with_answer, questions, results, replace_existing=True)
        answer_sections = [n for n in new_content["content"] if n.get("type") == "answerSection"]
        assert len(answer_sections) == 1
        assert answer_sections[0]["content"][0]["content"][0]["text"] == "new answer"


# ─── build_variant_document ────────────────────────────────────────────

class TestBuildVariantDocument:
    def test_builds_doc_with_variants(self):
        from services.question_processing import build_variant_document

        results = [
            {
                "index": 0,
                "label": "1.",
                "variant_nodes": [{"type": "paragraph", "content": [{"type": "text", "text": "Solve $x^2 - 3x + 2 = 0$"}]}],
                "variant_solution_nodes": [{"type": "paragraph", "content": [{"type": "text", "text": "x = 1 or x = 2"}]}],
            },
            {
                "index": 1,
                "label": "2.",
                "variant_nodes": [{"type": "paragraph", "content": [{"type": "text", "text": "Find y"}]}],
                "variant_solution_nodes": [{"type": "paragraph", "content": [{"type": "text", "text": "y = 5"}]}],
            },
        ]

        doc = build_variant_document(results, include_solutions=True)
        assert doc["type"] == "doc"
        nodes = doc["content"]

        # Q1: heading + variant para + answerSection
        assert nodes[0]["type"] == "heading"
        assert nodes[0]["content"][0]["text"] == "1."
        assert nodes[1]["type"] == "paragraph"
        assert nodes[2]["type"] == "answerSection"

        # Q2: heading + variant para + answerSection
        assert nodes[3]["type"] == "heading"
        assert nodes[3]["content"][0]["text"] == "2."

    def test_without_solutions(self):
        from services.question_processing import build_variant_document

        results = [{
            "index": 0,
            "label": "1.",
            "variant_nodes": [{"type": "paragraph", "content": [{"type": "text", "text": "variant Q"}]}],
            "variant_solution_nodes": [{"type": "paragraph", "content": [{"type": "text", "text": "answer"}]}],
        }]

        doc = build_variant_document(results, include_solutions=False)
        answer_sections = [n for n in doc["content"] if n.get("type") == "answerSection"]
        assert len(answer_sections) == 0

    def test_skips_results_without_variants(self):
        from services.question_processing import build_variant_document

        results = [
            {"index": 0, "label": "1.", "variant_nodes": None, "variant_solution_nodes": None},
        ]
        doc = build_variant_document(results)
        # Should have empty doc fallback
        assert doc["content"] == [{"type": "paragraph"}]


# ─── Endpoint tests ───────────────────────────────────────────────────

MOCK_GEMINI_SOLVE_RESPONSE = json.dumps({
    "solution": "Step 1: Factor $x^2 - 5x + 6 = (x-2)(x-3)$\nStep 2: $x = 2$ or $x = 3$",
    "topic": "Algebra",
    "subtopic": "Quadratic Equations",
    "difficulty": "easy",
})

MOCK_GEMINI_VARY_RESPONSE = json.dumps({
    "solution": "Step 1: Factor\nAnswer: $x = 2$ or $x = 3$",
    "variant": "Solve $x^2 - 7x + 12 = 0$",
    "variant_solution": "Step 1: Factor\nAnswer: $x = 3$ or $x = 4$",
    "topic": "Algebra",
    "subtopic": "Quadratic Equations",
    "difficulty": "easy",
})


def _seed_doc_with_questions(db_session) -> Document:
    """Create a document with extracted questions."""
    doc = Document(
        id=100, title="Test Worksheet", doc_type="worksheet",
        content=SAMPLE_CONTENT, created_by=1, is_template=False,
        questions=SAMPLE_QUESTIONS,
    )
    db_session.add(doc)
    db_session.commit()
    return doc


class TestProcessQuestionsEndpoint:
    """POST /documents/{id}/process-questions"""

    @patch("services.question_processing._process_one_question_sync")
    def test_solve_all(self, mock_process, client, db_session):
        _seed_tutor(db_session)
        _seed_doc_with_questions(db_session)
        token = make_auth_token(1)

        mock_process.return_value = (
            json.loads(MOCK_GEMINI_SOLVE_RESPONSE), 1500, 1000
        )

        resp = client.post(
            "/api/documents/100/process-questions",
            json={"actions": ["solve"]},
            cookies={"access_token": token},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert len(data["results"]) == 2
        assert data["results"][0]["topic"] == "Algebra"
        assert data["results"][0]["solution_nodes"] is not None
        assert data["results"][0]["variant_nodes"] is None
        assert data["usage"]["input_tokens"] == 3000  # 1500 * 2

    @patch("services.question_processing._process_one_question_sync")
    def test_vary(self, mock_process, client, db_session):
        _seed_tutor(db_session)
        _seed_doc_with_questions(db_session)
        token = make_auth_token(1)

        mock_process.return_value = (
            json.loads(MOCK_GEMINI_VARY_RESPONSE), 2000, 3000
        )

        resp = client.post(
            "/api/documents/100/process-questions",
            json={"actions": ["solve", "vary"]},
            cookies={"access_token": token},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert len(data["results"]) == 2
        assert data["results"][0]["variant_nodes"] is not None
        assert data["results"][0]["variant_solution_nodes"] is not None

    @patch("services.question_processing._process_one_question_sync")
    def test_selective_indices(self, mock_process, client, db_session):
        _seed_tutor(db_session)
        _seed_doc_with_questions(db_session)
        token = make_auth_token(1)

        mock_process.return_value = (
            json.loads(MOCK_GEMINI_SOLVE_RESPONSE), 1500, 1000
        )

        resp = client.post(
            "/api/documents/100/process-questions",
            json={"actions": ["solve"], "question_indices": [0]},
            cookies={"access_token": token},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert len(data["results"]) == 1
        assert data["results"][0]["index"] == 0

    def test_no_questions_extracted(self, client, db_session):
        _seed_tutor(db_session)
        doc = Document(
            id=100, title="Test", doc_type="worksheet",
            content=SAMPLE_CONTENT, created_by=1, is_template=False,
        )
        db_session.add(doc)
        db_session.commit()
        token = make_auth_token(1)

        resp = client.post(
            "/api/documents/100/process-questions",
            json={"actions": ["solve"]},
            cookies={"access_token": token},
        )
        assert resp.status_code == 400

    @patch("services.question_processing._process_one_question_sync")
    def test_updates_question_metadata(self, mock_process, client, db_session):
        _seed_tutor(db_session)
        _seed_doc_with_questions(db_session)
        token = make_auth_token(1)

        mock_process.return_value = (
            json.loads(MOCK_GEMINI_SOLVE_RESPONSE), 1500, 1000
        )

        resp = client.post(
            "/api/documents/100/process-questions",
            json={"actions": ["solve"]},
            cookies={"access_token": token},
        )

        data = resp.json()
        # questions metadata should be updated with topic/difficulty
        assert data["questions"][0]["topic"] == "Algebra"
        assert data["questions"][0]["difficulty"] == "easy"

    @patch("services.question_processing._process_one_question_sync")
    def test_persists_solutions_column(self, mock_process, client, db_session):
        _seed_tutor(db_session)
        _seed_doc_with_questions(db_session)
        token = make_auth_token(1)

        mock_process.return_value = (
            json.loads(MOCK_GEMINI_SOLVE_RESPONSE), 1500, 1000
        )

        client.post(
            "/api/documents/100/process-questions",
            json={"actions": ["solve"]},
            cookies={"access_token": token},
        )

        doc = db_session.query(Document).get(100)
        assert doc.solutions is not None
        assert "0" in doc.solutions
        assert doc.solutions["0"]["topic"] == "Algebra"
        assert "Factor" in doc.solutions["0"]["text"]

    @patch("services.question_processing._process_one_question_sync")
    def test_persists_variants_column(self, mock_process, client, db_session):
        _seed_tutor(db_session)
        _seed_doc_with_questions(db_session)
        token = make_auth_token(1)

        mock_process.return_value = (
            json.loads(MOCK_GEMINI_VARY_RESPONSE), 2000, 3000
        )

        client.post(
            "/api/documents/100/process-questions",
            json={"actions": ["solve", "vary"]},
            cookies={"access_token": token},
        )

        doc = db_session.query(Document).get(100)
        assert doc.solutions is not None
        assert doc.variants is not None
        assert "0" in doc.variants
        assert "x^2 - 7x + 12" in doc.variants["0"]["text"]
        assert doc.variants["0"]["solution_text"]

    @patch("services.question_processing._process_one_question_sync")
    def test_solve_only_does_not_overwrite_variants(self, mock_process, client, db_session):
        _seed_tutor(db_session)
        doc = _seed_doc_with_questions(db_session)
        doc.variants = {"0": {"text": "existing variant", "solution_text": "existing"}}
        db_session.commit()
        token = make_auth_token(1)

        mock_process.return_value = (
            json.loads(MOCK_GEMINI_SOLVE_RESPONSE), 1500, 1000
        )

        client.post(
            "/api/documents/100/process-questions",
            json={"actions": ["solve"]},
            cookies={"access_token": token},
        )

        db_session.refresh(doc)
        # Variants should still be there (solve-only doesn't touch variants)
        assert doc.variants["0"]["text"] == "existing variant"


class TestApplySolutionsEndpoint:
    """POST /documents/{id}/apply-solutions"""

    def test_applies_solutions(self, client, db_session):
        _seed_tutor(db_session)
        _seed_doc_with_questions(db_session)
        token = make_auth_token(1)

        results = [{
            "index": 0,
            "label": "1.",
            "solution_nodes": [{"type": "paragraph", "content": [{"type": "text", "text": "x = 2 or x = 3"}]}],
        }]

        resp = client.post(
            "/api/documents/100/apply-solutions",
            json={"results": results},
            cookies={"access_token": token},
        )

        assert resp.status_code == 200
        data = resp.json()
        # Check answerSection was inserted
        answer_sections = [n for n in data["content"]["content"] if n.get("type") == "answerSection"]
        assert len(answer_sections) == 1

    def test_404_for_missing_doc(self, client, db_session):
        _seed_tutor(db_session)
        token = make_auth_token(1)

        resp = client.post(
            "/api/documents/999/apply-solutions",
            json={"results": [{"index": 0, "solution_nodes": []}]},
            cookies={"access_token": token},
        )
        assert resp.status_code == 404


class TestCreateVariantDocumentEndpoint:
    """POST /documents/{id}/create-variant-document"""

    def test_creates_variant_doc(self, client, db_session):
        _seed_tutor(db_session)
        _seed_doc_with_questions(db_session)
        token = make_auth_token(1)

        results = [{
            "index": 0,
            "label": "1.",
            "variant_nodes": [{"type": "paragraph", "content": [{"type": "text", "text": "Solve $x^2 = 9$"}]}],
            "variant_solution_nodes": [{"type": "paragraph", "content": [{"type": "text", "text": "x = 3 or x = -3"}]}],
        }]

        resp = client.post(
            "/api/documents/100/create-variant-document",
            json={"results": results, "title": "Variant Worksheet"},
            cookies={"access_token": token},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Variant Worksheet"
        assert data["id"] != 100
        # Should have variant content
        nodes = data["content"]["content"]
        headings = [n for n in nodes if n.get("type") == "heading"]
        assert len(headings) == 1

    def test_no_variant_results(self, client, db_session):
        _seed_tutor(db_session)
        _seed_doc_with_questions(db_session)
        token = make_auth_token(1)

        resp = client.post(
            "/api/documents/100/create-variant-document",
            json={"results": [{"index": 0, "variant_nodes": None}]},
            cookies={"access_token": token},
        )
        assert resp.status_code == 400
