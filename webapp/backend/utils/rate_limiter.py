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

    # AI operations - strict to control external API costs
    "progress_insights": {"limit": 5, "window": 60},    # 5 AI calls/min

    # Public endpoints - IP-based, prevent scraping
    "report_share_view": {"limit": 30, "window": 60},   # 30 views/min per IP
    # Summer course public endpoints
    "summer_apply": {"limit": 3, "window": 600},        # 3 submissions/10min
    "summer_config": {"limit": 30, "window": 60},       # 30 config reads/min
    "summer_status": {"limit": 10, "window": 60},       # 10 status checks/min
    "summer_buddy": {"limit": 10, "window": 60},        # 10 buddy ops/min

    # Buddy tracker endpoints (verify_pin keys are per-branch via f"buddy_verify_pin:{branch}")
    "buddy_verify_pin": {"limit": 5, "window": 300},      # 5 attempts/5min per branch
    "buddy_pin_header": {"limit": 10, "window": 60},      # 10 bad header PINs/min per branch
    "buddy_list": {"limit": 30, "window": 60},            # 30 list ops/min
    "buddy_create": {"limit": 10, "window": 60},          # 10 creates/min
    "buddy_update": {"limit": 20, "window": 60},          # 20 edits/min
    "buddy_delete": {"limit": 10, "window": 60},          # 10 deletes/min
    "buddy_lookup": {"limit": 20, "window": 60},          # 20 lookups/min

    # Prospect PIN endpoints (verify_pin keys are per-branch via f"prospects_verify_pin:{branch}")
    "prospects_verify_pin": {"limit": 15, "window": 300},  # 15 attempts/5min per branch (shared WiFi: 10 staff + retries)
    "prospects_pin_header": {"limit": 10, "window": 60},   # 10 bad header PINs/min per branch
    "prospects_bulk_create": {"limit": 10, "window": 60},  # 10 bulk creates/min (shared WiFi: 1 per staff)
    "prospects_list": {"limit": 30, "window": 60},         # 30 list ops/min
    "prospects_update": {"limit": 20, "window": 60},       # 20 edits/min
    "prospects_delete": {"limit": 10, "window": 60},       # 10 deletes/min

    # Default fallback
    "default": {"limit": 100, "window": 60},
}


def get_client_ip(request: Request) -> str:
    """Extract client IP from request, handling proxies.
    Prefers CF-Connecting-IP (set by Cloudflare, not spoofable by clients),
    then rightmost X-Forwarded-For (last trusted proxy append), then direct."""
    cf_ip = request.headers.get("CF-Connecting-IP")
    if cf_ip:
        return cf_ip.strip()
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    if forwarded_for:
        return forwarded_for.split(",")[-1].strip()
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
    entries = [t for t in _user_request_counts[key] if now - t < window]
    if entries:
        _user_request_counts[key] = entries
    else:
        _user_request_counts.pop(key, None)

    if len(entries) >= limit:
        retry_after = int(window - (now - entries[0]))
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
        operation: The operation key (e.g., "auth_login", "buddy_verify_pin:MAC")
    """
    # Support per-branch keys like "buddy_verify_pin:MAC" — look up base key for config
    base_op = operation.split(":")[0] if ":" in operation else operation
    config = RATE_LIMITS.get(base_op, RATE_LIMITS["default"])
    limit = config["limit"]
    window = config["window"]

    client_ip = get_client_ip(request)
    key = f"{client_ip}:{operation}"
    now = time.time()

    # Clean old entries outside the window
    entries = [t for t in _ip_request_counts[key] if now - t < window]
    if entries:
        _ip_request_counts[key] = entries
    else:
        _ip_request_counts.pop(key, None)

    if len(entries) >= limit:
        retry_after = int(window - (now - entries[0]))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many requests. Try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)}
        )

    _ip_request_counts[key].append(now)


def clear_ip_rate_limit(request: Request, operation: str) -> None:
    """Clear the rate limit counter for a specific IP + operation (e.g., on successful PIN verify)."""
    client_ip = get_client_ip(request)
    key = f"{client_ip}:{operation}"
    _ip_request_counts.pop(key, None)


def clear_rate_limits() -> None:
    """Clear all rate limit data. Useful for testing."""
    _user_request_counts.clear()
    _ip_request_counts.clear()
