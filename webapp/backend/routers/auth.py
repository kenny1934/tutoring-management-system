"""
Authentication router for Google OAuth.
"""

import os
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models import Tutor
from auth.oauth import get_google_auth_url, exchange_code_for_user_info
from auth.jwt_handler import create_access_token
from auth.dependencies import get_current_user
from utils.rate_limiter import check_ip_rate_limit

router = APIRouter()

# Configuration
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")


class UserResponse(BaseModel):
    """Response model for current user info"""
    id: int
    email: str
    name: str
    role: str
    default_location: str | None = None
    picture: str | None = None


@router.get("/auth/google/login")
async def google_login(request: Request):
    """
    Redirect to Google OAuth consent screen.

    The user will be redirected to Google to authenticate,
    then back to /auth/google/callback with an authorization code.
    """
    # Rate limit login attempts to prevent abuse
    check_ip_rate_limit(request, "auth_login")

    auth_url = get_google_auth_url()
    return RedirectResponse(url=auth_url)


@router.get("/auth/google/callback")
async def google_callback(
    request: Request,
    code: str,
    db: Session = Depends(get_db),
):
    """
    Handle Google OAuth callback.

    Exchanges the authorization code for user info,
    finds the matching tutor, creates a JWT, and redirects to frontend.
    """
    # Rate limit callback attempts
    check_ip_rate_limit(request, "auth_callback")

    try:
        # Exchange code for user info
        user_info = await exchange_code_for_user_info(code)
        google_email = user_info.get("email")
        print(f"[OAuth] Google email: {google_email}")

        if not google_email:
            print("[OAuth] No email returned from Google")
            return RedirectResponse(
                url=f"{FRONTEND_URL}/login?error=no_email",
                status_code=status.HTTP_302_FOUND,
            )

        # Find tutor by email (whitelist approach)
        tutor = db.query(Tutor).filter(Tutor.user_email == google_email).first()
        print(f"[OAuth] Tutor found: {tutor.tutor_name if tutor else 'None'}")

        if not tutor:
            # User not in system - reject login
            return RedirectResponse(
                url=f"{FRONTEND_URL}/login?error=unauthorized",
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
            url=FRONTEND_URL,
            status_code=status.HTTP_302_FOUND,
        )

        # Set HTTP-only cookie
        response.set_cookie(
            key="access_token",
            value=token,
            httponly=True,
            secure=ENVIRONMENT == "production",  # HTTPS only in production
            samesite="lax",  # CSRF protection
            max_age=86400,  # 24 hours in seconds
        )

        print(f"[OAuth] Login successful for {tutor.tutor_name}, redirecting to {FRONTEND_URL}")
        return response

    except Exception as e:
        # Log the error in production
        print(f"OAuth callback error: {e}")
        return RedirectResponse(
            url=f"{FRONTEND_URL}/login?error=oauth_failed",
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
        secure=ENVIRONMENT == "production",
        samesite="lax",
    )
    return {"message": "Logged out successfully"}
