"""
Authentication router for Google OAuth.
"""

import logging
import os
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models import Tutor
from auth.oauth import get_google_auth_url, exchange_code_for_user_info
from auth.jwt_handler import create_access_token, create_refreshed_token, get_token_time_remaining, ACCESS_TOKEN_EXPIRE_HOURS
from auth.dependencies import get_current_user
from utils.rate_limiter import check_ip_rate_limit

router = APIRouter()
logger = logging.getLogger(__name__)

# Configuration
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

# Allowed origins for validating redirect targets (prevent open redirects)
_allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
ALLOWED_ORIGINS = [o.strip() for o in _allowed_origins_str.split(",") if o.strip()]


def _get_redirect_base(state: Optional[str] = None) -> str:
    """Get the frontend URL to redirect to, using OAuth state if valid."""
    if state and state in ALLOWED_ORIGINS:
        return state
    return FRONTEND_URL


def _get_callback_uri(origin: Optional[str] = None) -> Optional[str]:
    """Derive the OAuth callback URI from the caller's origin.

    Returns None to use the default GOOGLE_REDIRECT_URI when origin is not a valid allowed origin.
    """
    if origin and origin in ALLOWED_ORIGINS:
        return f"{origin}/api/auth/google/callback"
    return None


class UserResponse(BaseModel):
    """Response model for current user info"""
    id: int
    email: str
    name: str
    role: str
    default_location: str | None = None
    picture: str | None = None


@router.get("/auth/google/login")
async def google_login(
    request: Request,
    redirect_origin: Optional[str] = Query(None),
):
    """
    Redirect to Google OAuth consent screen.

    The user will be redirected to Google to authenticate,
    then back to /auth/google/callback with an authorization code.
    """
    # Rate limit login attempts to prevent abuse
    check_ip_rate_limit(request, "auth_login")

    # Pass the caller's origin through OAuth state so we can redirect back to the right domain
    state = redirect_origin if redirect_origin and redirect_origin in ALLOWED_ORIGINS else None
    # Use custom domain callback URI so the cookie is set as first-party
    callback_uri = _get_callback_uri(redirect_origin)
    auth_url = get_google_auth_url(state=state, redirect_uri=callback_uri)
    return RedirectResponse(url=auth_url)


@router.get("/auth/google/callback")
async def google_callback(
    request: Request,
    code: str,
    state: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Handle Google OAuth callback.

    Exchanges the authorization code for user info,
    finds the matching tutor, creates a JWT, and redirects to frontend.
    The state parameter carries the caller's origin so we redirect to the correct custom domain.
    """
    # Rate limit callback attempts
    check_ip_rate_limit(request, "auth_callback")

    # Determine redirect base from state (validated against ALLOWED_ORIGINS)
    redirect_base = _get_redirect_base(state)
    # Derive callback URI from state so token exchange uses the same redirect_uri as the auth request
    callback_uri = _get_callback_uri(state)

    try:
        # Exchange code for user info (redirect_uri must match what was sent to Google)
        user_info = await exchange_code_for_user_info(code, redirect_uri=callback_uri)
        google_email = user_info.get("email")
        logger.info("OAuth callback for email: %s", google_email)

        if not google_email:
            logger.warning("No email returned from Google OAuth")
            return RedirectResponse(
                url=f"{redirect_base}/login?error=no_email",
                status_code=status.HTTP_302_FOUND,
            )

        # Find tutor by email (whitelist approach)
        tutor = db.query(Tutor).filter(Tutor.user_email == google_email).first()
        logger.info("Tutor lookup result: %s", tutor.tutor_name if tutor else "not found")

        if not tutor:
            # User not in system - reject login
            return RedirectResponse(
                url=f"{redirect_base}/login?error=unauthorized",
                status_code=status.HTTP_302_FOUND,
            )

        # Create JWT token (sub must be a string per JWT spec)
        token = create_access_token({
            "sub": str(tutor.id),
            "email": tutor.user_email,
            "name": tutor.tutor_name,
            "role": tutor.role,
            "picture": user_info.get("picture"),  # Google profile picture
        })

        # Create redirect response with cookie
        response = RedirectResponse(
            url=redirect_base,
            status_code=status.HTTP_302_FOUND,
        )

        # Set HTTP-only cookie (same-origin via Cloudflare Worker proxy)
        response.set_cookie(
            key="access_token",
            value=token,
            httponly=True,
            secure=True,
            samesite="lax",
            max_age=ACCESS_TOKEN_EXPIRE_HOURS * 3600,  # Match token expiry
        )

        logger.info("Login successful for %s", tutor.tutor_name)
        return response

    except Exception as e:
        logger.error("OAuth callback error: %s", e)
        return RedirectResponse(
            url=f"{redirect_base}/login?error=oauth_failed",
            status_code=status.HTTP_302_FOUND,
        )


@router.get("/auth/me", response_model=UserResponse)
async def get_current_user_info(
    request: Request,
    current_user: Tutor = Depends(get_current_user),
):
    """
    Get the currently authenticated user's info.

    Returns user details including id, email, name, role, default location, and profile picture.
    """
    from auth.jwt_handler import verify_token

    # Get picture from JWT token (stored during OAuth)
    token = request.cookies.get("access_token")
    picture = None
    if token:
        payload = verify_token(token)
        if payload:
            picture = payload.get("picture")

    return UserResponse(
        id=current_user.id,
        email=current_user.user_email,
        name=current_user.tutor_name,
        role=current_user.role,
        default_location=current_user.default_location,
        picture=picture,
    )


@router.post("/auth/logout")
async def logout(response: Response):
    """
    Log out the current user by clearing the auth cookie.
    """
    response.delete_cookie(
        key="access_token",
        httponly=True,
        secure=True,
        samesite="lax",
    )
    return {"message": "Logged out successfully"}


class TokenRefreshResponse(BaseModel):
    """Response model for token refresh"""
    success: bool
    expires_in: int  # Seconds until new token expires
    message: str


@router.post("/auth/refresh", response_model=TokenRefreshResponse)
async def refresh_token(request: Request, response: Response):
    """
    Refresh the authentication token.

    Extends the token expiry if the current token is valid and
    within the refresh window (expires within 30 minutes or
    recently expired within 5 minute grace period).

    Returns a new token as an HTTP-only cookie.
    """
    token = request.cookies.get("access_token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No token provided"
        )

    # Try to create a refreshed token
    new_token = create_refreshed_token(token)

    if not new_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token cannot be refreshed. Please log in again."
        )

    # Get the new token's expiry time
    expires_in = get_token_time_remaining(new_token) or (ACCESS_TOKEN_EXPIRE_HOURS * 3600)

    # Set new token as HTTP-only cookie
    response.set_cookie(
        key="access_token",
        value=new_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_HOURS * 3600,  # Cookie max age in seconds
    )

    return TokenRefreshResponse(
        success=True,
        expires_in=expires_in,
        message="Token refreshed successfully"
    )
