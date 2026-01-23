"""
Authentication module for the tutoring management system.

Provides:
- JWT token creation and validation
- Google OAuth flow handling
- FastAPI dependencies for route protection
"""

from .jwt_handler import create_access_token, verify_token
from .dependencies import get_current_user, get_optional_user, require_admin

__all__ = [
    "create_access_token",
    "verify_token",
    "get_current_user",
    "get_optional_user",
    "require_admin",
]
