"""
Google OAuth flow handling.
"""

import os
from typing import Optional
from urllib.parse import urlencode

import httpx
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

# Configuration from environment
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI",
    "http://localhost:8000/api/auth/google/callback"
)

# Google OAuth endpoints
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


def get_google_auth_url(state: Optional[str] = None) -> str:
    """
    Generate the Google OAuth authorization URL.

    Args:
        state: Optional state parameter for CSRF protection

    Returns:
        Full Google OAuth consent URL
    """
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent",
    }

    if state:
        params["state"] = state

    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


async def exchange_code_for_tokens(code: str) -> dict:
    """
    Exchange authorization code for access and refresh tokens.

    Args:
        code: The authorization code from Google callback

    Returns:
        Token response dict containing access_token, id_token, etc.

    Raises:
        Exception if token exchange fails
    """
    async with httpx.AsyncClient() as client:
        response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": GOOGLE_REDIRECT_URI,
            },
        )

        if response.status_code != 200:
            raise Exception(f"Token exchange failed: {response.text}")

        return response.json()


async def get_user_info(access_token: str) -> dict:
    """
    Get user info from Google using access token.

    Args:
        access_token: Google access token

    Returns:
        User info dict with email, name, picture, etc.
    """
    async with httpx.AsyncClient() as client:
        response = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )

        if response.status_code != 200:
            raise Exception(f"Failed to get user info: {response.text}")

        return response.json()


async def exchange_code_for_user_info(code: str) -> dict:
    """
    Exchange authorization code for user info in one step.

    Args:
        code: The authorization code from Google callback

    Returns:
        User info dict with email, name, picture, sub (Google user ID)
    """
    tokens = await exchange_code_for_tokens(code)
    user_info = await get_user_info(tokens["access_token"])
    return user_info
