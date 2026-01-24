"""
Per-user rate limiting utility with configurable limits per operation.
Uses in-memory sliding window algorithm.
"""
import time
from collections import defaultdict
from typing import Dict, List
from fastapi import HTTPException, status


# Storage: {"{user_id}:{operation}": [timestamp, timestamp, ...]}
_user_request_counts: Dict[str, List[float]] = defaultdict(list)

# Configurable rate limits by operation type
RATE_LIMITS = {
    # Critical write operations - stricter limits
    "message_create": {"limit": 10, "window": 60},      # 10 msgs/min
    "message_update": {"limit": 20, "window": 60},      # 20 edits/min
    "message_delete": {"limit": 10, "window": 60},      # 10 deletes/min

    # High-frequency operations - more permissive
    "message_like": {"limit": 60, "window": 60},        # 60 likes/min
    "message_read": {"limit": 120, "window": 60},       # 120 mark-read/min

    # Default fallback
    "default": {"limit": 100, "window": 60},
}


def check_user_rate_limit(user_id: int, operation: str) -> None:
    """
    Check rate limit for a specific user and operation.
    Raises HTTPException 429 if rate limit exceeded.

    Args:
        user_id: The authenticated user's ID
        operation: The operation key (e.g., "message_create")
    """
    config = RATE_LIMITS.get(operation, RATE_LIMITS["default"])
    limit = config["limit"]
    window = config["window"]

    key = f"{user_id}:{operation}"
    now = time.time()

    # Clean old entries outside the window
    _user_request_counts[key] = [
        t for t in _user_request_counts[key] if now - t < window
    ]

    if len(_user_request_counts[key]) >= limit:
        retry_after = int(window - (now - _user_request_counts[key][0]))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)}
        )

    _user_request_counts[key].append(now)


def clear_rate_limits() -> None:
    """Clear all rate limit data. Useful for testing."""
    _user_request_counts.clear()
