"""
JWT token creation and validation using python-jose.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import jwt, JWTError

# Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-key-change-in-production")
CROSS_APP_SECRET = os.getenv("CROSS_APP_HANDOFF_SECRET", "")
ALGORITHM = "HS256"

# Security validation: Fail startup in production if using default secret key
_ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
if _ENVIRONMENT == "production" and SECRET_KEY == "dev-secret-key-change-in-production":
    raise RuntimeError(
        "SECURITY ERROR: JWT_SECRET_KEY environment variable must be set in production. "
        "Generate a secure key with: python -c \"import secrets; print(secrets.token_hex(32))\""
    )
ACCESS_TOKEN_EXPIRE_HOURS = 4  # Reduced from 24 for security
REFRESH_THRESHOLD_MINUTES = 30  # Frontend proactive refresh threshold (refresh before this)
REFRESH_GRACE_PERIOD_MINUTES = 15  # Backend grace period for expired tokens

# How long someone stays signed in without opening CSM. Every renewal starts
# the 30 days again, so a tutor who opens the app at least once a month never
# sees the sign-in page. The 4-hour token above still carries every request;
# this longer one only ever buys a new 4-hour token.
SESSION_EXPIRE_DAYS = 30
# Session tokens are signed with their own key. A session token in the
# access_token cookie then fails verify_token like any forgery, so the
# long-lived token can only ever be traded in at /auth/refresh, where the
# tutor is looked up and a departed one refused.
_SESSION_KEY = SECRET_KEY + ":session"


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT access token.

    Args:
        data: Dictionary containing token payload (sub, email, name, role, etc.)
        expires_delta: Optional custom expiration time

    Returns:
        Encoded JWT token string
    """
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)

    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    })

    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_token(token: str) -> Optional[dict]:
    """
    Verify and decode a JWT token.

    Args:
        token: The JWT token string to verify

    Returns:
        Decoded payload dict if valid, None if invalid or expired
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


def get_token_time_remaining(token: str) -> Optional[int]:
    """
    Get the remaining time in seconds until token expires.

    Args:
        token: The JWT token string

    Returns:
        Seconds until expiry, or None if token is invalid
    """
    try:
        # Decode without verification to get exp claim even if expired
        payload = jwt.decode(
            token, SECRET_KEY, algorithms=[ALGORITHM],
            options={"verify_exp": False}
        )
        exp = payload.get("exp")
        if exp:
            now = datetime.now(timezone.utc).timestamp()
            return int(exp - now)
        return None
    except JWTError:
        return None


def can_refresh_token(token: str) -> bool:
    """
    Check if a token can be refreshed.

    A token can be refreshed if:
    - It's valid (not tampered)
    - It's not yet expired, OR expired within 15-minute grace period

    This enables a "sliding window" pattern where any valid token
    can be refreshed to extend the session.

    Args:
        token: The JWT token string

    Returns:
        True if token can be refreshed
    """
    try:
        # Decode without expiry check to allow recently expired tokens
        payload = jwt.decode(
            token, SECRET_KEY, algorithms=[ALGORITHM],
            options={"verify_exp": False}
        )
        exp = payload.get("exp")
        if not exp:
            return False

        now = datetime.now(timezone.utc).timestamp()
        time_remaining = exp - now

        # Allow refresh if:
        # - Token is still valid (time_remaining > 0), OR
        # - Token expired within grace period (for 401 retries)
        grace_period_seconds = REFRESH_GRACE_PERIOD_MINUTES * 60
        return time_remaining > -grace_period_seconds
    except JWTError:
        return False


def create_handoff_token(email: str, name: str, role: Optional[str] = None) -> str:
    """
    Create a short-lived JWT for cross-app SSO handoff.

    Signed with CROSS_APP_HANDOFF_SECRET (shared between CSM and ARK)
    so the receiving app can validate without calling back.

    Args:
        email: User's email address (identity key in both systems)
        name: User's display name
        role: Optional CSM role (e.g. "Supervisor"). ARK uses this to
            auto-provision a passport record on first cross-app login for
            users who aren't MathConcept employees.

    Returns:
        Encoded JWT token string (60s TTL)
    """
    payload = {
        "email": email,
        "name": name,
        "type": "cross-app-handoff",
        "exp": datetime.now(timezone.utc) + timedelta(seconds=60),
        "iat": datetime.now(timezone.utc),
    }
    if role:
        payload["role"] = role
    return jwt.encode(payload, CROSS_APP_SECRET, algorithm=ALGORITHM)


def create_refreshed_token(old_token: str) -> Optional[str]:
    """
    Create a new token with extended expiry based on an existing valid token.

    Preserves all claims from the original token but updates exp and iat.

    Args:
        old_token: The existing JWT token to refresh

    Returns:
        New token string, or None if refresh not allowed
    """
    if not can_refresh_token(old_token):
        return None

    try:
        # Decode without expiry check
        payload = jwt.decode(
            old_token, SECRET_KEY, algorithms=[ALGORITHM],
            options={"verify_exp": False}
        )

        # Remove old timing claims
        payload.pop("exp", None)
        payload.pop("iat", None)

        # Create new token with fresh expiry
        return create_access_token(payload)
    except JWTError:
        return None

def create_session_token(tutor_id: int) -> str:
    """
    Create the 30-day token that keeps someone signed in between visits.

    It holds only the tutor's id. The name, role and picture in the 4-hour
    token it is traded for come from the database at that moment, so a role
    change or a departure made in the meantime takes effect.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(tutor_id),
        "type": "session",
        "exp": now + timedelta(days=SESSION_EXPIRE_DAYS),
        "iat": now,
    }
    return jwt.encode(payload, _SESSION_KEY, algorithm=ALGORITHM)


def verify_session_token(token: str) -> Optional[int]:
    """Return the tutor id in a valid, unexpired session token, or None."""
    try:
        payload = jwt.decode(token, _SESSION_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
    if payload.get("type") != "session":
        return None
    try:
        return int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        return None
