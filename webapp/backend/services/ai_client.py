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
        "medium": types.ThinkingLevel.MEDIUM,
        "high": types.ThinkingLevel.HIGH,
    }
    return level_map.get(level, types.ThinkingLevel.LOW)


def _extract_response(response) -> tuple[str, int, int, bool]:
    """Extract text, input token count, output token count, and truncation flag from a Gemini response."""
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

    input_tokens = 0
    output_tokens = 0
    if hasattr(response, "usage_metadata") and response.usage_metadata:
        input_tokens = getattr(response.usage_metadata, "prompt_token_count", 0) or 0
        output_tokens = getattr(response.usage_metadata, "candidates_token_count", 0) or 0

    return text, input_tokens, output_tokens, is_truncated


def generate(
    prompt: str,
    context: str = "",
    thinking_level: ThinkingLevelStr = "medium",
    max_output_tokens: int = 4096,
    temperature: float = 0.3,
    model: str = MODEL_ID,
    response_mime_type: str | None = None,
    response_schema: dict | None = None,
) -> tuple[str, int, int, bool]:
    """
    Call Gemini (text-only) and return (response_text, input_tokens, output_tokens, is_truncated).
    Raises HTTPException(503) on API error, HTTPException(502) on empty response.
    """
    from google.genai import types

    full_prompt = f"{context}\n\n---\n\n{prompt}" if context else prompt

    config_kwargs: dict = {
        "temperature": temperature,
        "max_output_tokens": max_output_tokens,
    }
    # thinking_level is supported by 3.x models; 2.5 models use automatic thinking
    if model.startswith("gemini-3"):
        sdk_level = _get_thinking_level(thinking_level)
        config_kwargs["thinking_config"] = types.ThinkingConfig(thinking_level=sdk_level)
    if response_mime_type:
        config_kwargs["response_mime_type"] = response_mime_type
    if response_schema:
        config_kwargs["response_schema"] = response_schema

    try:
        client = _get_client()
        response = client.models.generate_content(
            model=model,
            contents=full_prompt,
            config=types.GenerateContentConfig(**config_kwargs),
        )
    except Exception as exc:
        logger.error("Gemini API error: %s", exc, exc_info=True)
        raise HTTPException(status_code=503, detail="AI service temporarily unavailable")

    return _extract_response(response)


def generate_multimodal(
    prompt: str,
    images: list[tuple[bytes, str]],
    thinking_level: ThinkingLevelStr = "medium",
    max_output_tokens: int = 8192,
    temperature: float = 0.2,
    model: str = MODEL_ID,
    response_mime_type: str | None = None,
    response_schema: dict | None = None,
) -> tuple[str, int, int, bool]:
    """
    Call Gemini with text + images and return (response_text, input_tokens, output_tokens, is_truncated).

    Args:
        prompt: Text prompt.
        images: List of (image_bytes, mime_type) tuples, e.g. [(png_bytes, "image/png")].
        thinking_level: Thinking budget for the model.
        max_output_tokens: Max response length.
        temperature: Sampling temperature.
        model: Model ID override.
        response_mime_type: Set to "application/json" for structured JSON output.
        response_schema: JSON schema dict for structured output validation.

    Raises HTTPException(503) on API error, HTTPException(502) on empty response.
    """
    from google.genai import types

    contents: list[types.Part] = [types.Part.from_text(text=prompt)]
    for image_bytes, mime_type in images:
        contents.append(types.Part.from_bytes(data=image_bytes, mime_type=mime_type))

    config_kwargs: dict = {
        "temperature": temperature,
        "max_output_tokens": max_output_tokens,
    }
    if model.startswith("gemini-3"):
        sdk_level = _get_thinking_level(thinking_level)
        config_kwargs["thinking_config"] = types.ThinkingConfig(thinking_level=sdk_level)
    if response_mime_type:
        config_kwargs["response_mime_type"] = response_mime_type
    if response_schema:
        config_kwargs["response_schema"] = response_schema

    try:
        client = _get_client()
        response = client.models.generate_content(
            model=model,
            contents=contents,
            config=types.GenerateContentConfig(**config_kwargs),
        )
    except Exception as exc:
        logger.error("Gemini multimodal API error: %s", exc, exc_info=True)
        raise HTTPException(status_code=503, detail="AI service temporarily unavailable")

    return _extract_response(response)


def reset_client():
    """Reset the client singleton (for testing)."""
    global _client
    _client = None
