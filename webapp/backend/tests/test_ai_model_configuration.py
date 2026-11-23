from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from services import ai_client, question_processing, worksheet_ocr


def test_models_are_separate_and_preview_is_no_longer_the_solver_default():
    assert question_processing.PROCESS_MODEL == ai_client.PROCESS_MODEL_ID
    assert worksheet_ocr.MODEL_ID == ai_client.OCR_MODEL_ID
    assert "preview" not in question_processing.PROCESS_MODEL


def test_solver_uses_medium_thinking_and_schema_without_sampling_parameters():
    client = MagicMock()
    client.models.generate_content.return_value = SimpleNamespace(text='{"solution":"Answer: $x=5$","topic":"Algebra","subtopic":"Linear","difficulty":"easy"}', candidates=[], usage_metadata=SimpleNamespace(prompt_token_count=20, candidates_token_count=30, thoughts_token_count=10))
    with patch.object(ai_client, "_get_client", return_value=client):
        result, inp, out = question_processing._process_one_question_attempt("Solve 3x+7=22", False)
    assert result["solution"] == "Answer: $x=5$"
    assert (inp, out) == (20, 40)
    config = client.models.generate_content.call_args.kwargs["config"]
    assert config.temperature is None
    assert str(config.thinking_config.thinking_level).endswith("MEDIUM")
    assert config.response_schema is not None


def test_incomplete_solution_is_retried_and_never_returned_as_complete():
    with patch.object(ai_client, "generate", return_value=('{}', 1, 1, True)) as generate:
        with pytest.raises(HTTPException) as error:
            question_processing._process_one_question_sync("Solve x=1", False)
    assert error.value.status_code == 502
    assert generate.call_count == 2


def test_literal_line_breaks_do_not_appear_in_math_editor():
    nodes = question_processing.text_to_tiptap_nodes(r"$x+1=2$\n$x=1$\nAnswer: $x=1$")
    assert len(nodes) == 3
    assert nodes[1]["content"][0]["attrs"]["latex"] == "x=1"
