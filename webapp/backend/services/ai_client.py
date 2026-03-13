"""
Gemini AI client — singleton, Vertex AI via ADC.
Pattern adapted from /projects/ark.
"""

import os
import logging
from typing import Literal

from fastapi import HTTPException

logger = logging.getLogger(__name__)

MODEL_ID = "gemini-3.1-flash-lite-preview"

_client = None

ThinkingLevelStr = Literal["minimal", "low", "medium", "high"]


def _get_client():
    """Get or create the genai client singleton."""
    global _client
    if _client is None:
        from google import genai

        project = os.getenv("GOOGLE_CLOUD_PROJECT", "csm-database-project")
        location = os.getenv("GOOGLE_CLOUD_LOCATION", "global")
        use_vertex = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "True").lower() == "true"

        if use_vertex:
            _client = genai.Client(vertexai=True, project=project, location=location)
        else:
            _client = genai.Client()
    return _client


def _get_thinking_level(level: ThinkingLevelStr):
    """Map string level to SDK enum."""
    from google.genai import types

    level_map = {
        "minimal": types.ThinkingLevel.MINIMAL,
        "low": types.ThinkingLevel.LOW,
        "medium": types.ThinkingLevel.LOW,
        "high": types.ThinkingLevel.HIGH,
    }
    return level_map.get(level, types.ThinkingLevel.LOW)


def generate(
    prompt: str,
    context: str = "",
    thinking_level: ThinkingLevelStr = "medium",
    max_output_tokens: int = 4096,
    temperature: float = 0.3,
    model: str = MODEL_ID,
) -> tuple[str, int, bool]:
    """
    Call Gemini and return (response_text, output_token_count, is_truncated).
    Raises HTTPException(503) on API error, HTTPException(502) on empty response.
    """
    from google.genai import types

    full_prompt = f"{context}\n\n---\n\n{prompt}" if context else prompt
    sdk_level = _get_thinking_level(thinking_level)

    try:
        client = _get_client()
        response = client.models.generate_content(
            model=model,
            contents=full_prompt,
            config=types.GenerateContentConfig(
                thinking_config=types.ThinkingConfig(thinking_level=sdk_level),
                temperature=temperature,
                max_output_tokens=max_output_tokens,
            ),
        )
    except Exception as exc:
        logger.error("Gemini API error: %s", exc, exc_info=True)
        raise HTTPException(status_code=503, detail="AI service temporarily unavailable")

    text = response.text or ""
    if not text.strip():
        raise HTTPException(status_code=502, detail="AI returned an empty response")

    is_truncated = False
    try:
        if response.candidates and response.candidates[0].finish_reason:
            reason = str(response.candidates[0].finish_reason)
            if "MAX_TOKENS" in reason.upper():
                is_truncated = True
    except (AttributeError, IndexError):
        pass

    output_tokens = 0
    if hasattr(response, "usage_metadata") and response.usage_metadata:
        output_tokens = getattr(response.usage_metadata, "candidates_token_count", 0) or 0

    return text, output_tokens, is_truncated


def reset_client():
    """Reset the client singleton (for testing)."""
    global _client
    _client = None
