"""
JWT token creation and validation using python-jose.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import jwt, JWTError

# Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 4  # Reduced from 24 for security
REFRESH_THRESHOLD_MINUTES = 30  # Allow refresh if token expires within this window


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
    print(f"[JWT] Token created with SECRET_KEY (first 10 chars): {SECRET_KEY[:10]}...")
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
    except JWTError as e:
        print(f"[JWT] Verification failed: {e}")
        print(f"[JWT] SECRET_KEY (first 10 chars): {SECRET_KEY[:10]}...")
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
    - It expires within REFRESH_THRESHOLD_MINUTES minutes OR is recently expired (within 5 minutes)

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
        # - Token expires within threshold, OR
        # - Token expired less than 5 minutes ago (grace period for race conditions)
        grace_period_seconds = 5 * 60
        return time_remaining < (REFRESH_THRESHOLD_MINUTES * 60) and time_remaining > -grace_period_seconds
    except JWTError:
        return False


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
