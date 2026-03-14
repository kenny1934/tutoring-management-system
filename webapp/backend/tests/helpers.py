"""Shared test helpers."""
from auth.jwt_handler import create_access_token


def make_auth_token(tutor_id: int) -> str:
    """Create a JWT token for a test tutor."""
    return create_access_token({"sub": str(tutor_id)})
