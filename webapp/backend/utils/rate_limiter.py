"""
Per-user and per-IP rate limiting utility with configurable limits per operation.
Uses in-memory sliding window algorithm.
"""
import time
from collections import defaultdict
from typing import Dict, List, Optional
from fastapi import HTTPException, Request, status


# Storage: {"{user_id}:{operation}": [timestamp, timestamp, ...]}
_user_request_counts: Dict[str, List[float]] = defaultdict(list)

# IP-based storage for unauthenticated endpoints
_ip_request_counts: Dict[str, List[float]] = defaultdict(list)

# Configurable rate limits by operation type
RATE_LIMITS = {
    # Authentication endpoints - stricter to prevent brute force
    "auth_login": {"limit": 5, "window": 60},          # 5 attempts/min
    "auth_callback": {"limit": 10, "window": 60},      # 10 callbacks/min

    # Debug panel - restricted for security
    "debug_sql_execute": {"limit": 10, "window": 60},   # 10 queries/min
    "debug_table_read": {"limit": 60, "window": 60},    # 60 reads/min
    "debug_row_write": {"limit": 20, "window": 60},     # 20 writes/min
    "debug_bulk_delete": {"limit": 5, "window": 60},    # 5 bulk deletes/min
    "debug_bulk_update": {"limit": 10, "window": 60},   # 10 bulk updates/min
    "debug_export": {"limit": 5, "window": 300},        # 5 exports/5min

    # Bulk operations
    "bulk_assign_exercises": {"limit": 20, "window": 60},  # 20 bulk assigns/min
    "bulk_schedule_sessions": {"limit": 10, "window": 60}, # 10 bulk schedules/min

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


def get_client_ip(request: Request) -> str:
    """Extract client IP from request, handling proxies."""
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


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


def check_ip_rate_limit(request: Request, operation: str) -> None:
    """
    Check rate limit for an IP address (for unauthenticated endpoints).
    Raises HTTPException 429 if rate limit exceeded.

    Args:
        request: The FastAPI request object
        operation: The operation key (e.g., "auth_login")
    """
    config = RATE_LIMITS.get(operation, RATE_LIMITS["default"])
    limit = config["limit"]
    window = config["window"]

    client_ip = get_client_ip(request)
    key = f"{client_ip}:{operation}"
    now = time.time()

    # Clean old entries outside the window
    _ip_request_counts[key] = [
        t for t in _ip_request_counts[key] if now - t < window
    ]

    if len(_ip_request_counts[key]) >= limit:
        retry_after = int(window - (now - _ip_request_counts[key][0]))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many requests. Try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)}
        )

    _ip_request_counts[key].append(now)


def clear_rate_limits() -> None:
    """Clear all rate limit data. Useful for testing."""
    _user_request_counts.clear()
    _ip_request_counts.clear()
