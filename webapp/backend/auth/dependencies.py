"""
FastAPI dependencies for authentication and authorization.
"""

from typing import List, Optional

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from database import get_db
from models import Tutor, SessionLog
from .jwt_handler import verify_token


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> Tutor:
    """
    Get the currently authenticated user from JWT cookie.

    Raises HTTPException 401 if not authenticated.

    Usage:
        @router.get("/protected")
        def protected_route(current_user: Tutor = Depends(get_current_user)):
            ...
    """
    token = request.cookies.get("access_token")
    print(f"[Auth] Cookie access_token present: {bool(token)}")

    if not token:
        print(f"[Auth] No token found. All cookies: {request.cookies}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    payload = verify_token(token)
    print(f"[Auth] Token verification result: {payload}")
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    tutor_id_str = payload.get("sub")
    if not tutor_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    tutor = db.query(Tutor).filter(Tutor.id == int(tutor_id_str)).first()
    if not tutor:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    return tutor


def get_optional_user(
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[Tutor]:
    """
    Get the currently authenticated user, or None if not authenticated.

    Useful for endpoints that work differently for authenticated vs anonymous users.

    Usage:
        @router.get("/data")
        def get_data(current_user: Optional[Tutor] = Depends(get_optional_user)):
            if current_user:
                # Authenticated logic
            else:
                # Anonymous logic
    """
    try:
        return get_current_user(request, db)
    except HTTPException:
        return None


def require_admin(
    current_user: Tutor = Depends(get_current_user),
) -> Tutor:
    """
    Require the current user to be an Admin or Super Admin.

    Raises HTTPException 403 if not an admin.

    Usage:
        @router.post("/admin-only")
        def admin_route(admin: Tutor = Depends(require_admin)):
            ...
    """
    if current_user.role not in ("Admin", "Super Admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


def require_role(allowed_roles: List[str]):
    """
    Factory function to create a dependency that requires specific roles.

    Usage:
        @router.post("/special")
        def special_route(user: Tutor = Depends(require_role(["Admin", "Manager"]))):
            ...
    """
    def role_checker(current_user: Tutor = Depends(get_current_user)) -> Tutor:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {', '.join(allowed_roles)}",
            )
        return current_user

    return role_checker


def require_ownership_or_admin(tutor_id: int):
    """
    Factory function to require either ownership (matching tutor_id) or admin role.

    Usage:
        @router.patch("/sessions/{session_id}")
        def update_session(
            session_id: int,
            session: Session,  # loaded from DB
            current_user: Tutor = Depends(require_ownership_or_admin(session.tutor_id)),
        ):
            ...
    """
    def ownership_checker(current_user: Tutor = Depends(get_current_user)) -> Tutor:
        is_owner = current_user.id == tutor_id
        is_admin = current_user.role in ("Admin", "Super Admin")

        if not (is_owner or is_admin):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only modify your own data, or be an admin",
            )
        return current_user

    return ownership_checker


def get_session_with_owner_check(
    session_id: int,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionLog:
    """
    Get a session and verify the current user owns it or is an admin.

    Returns the session if authorized, raises 403 if not.

    Usage:
        @router.patch("/{session_id}/attended")
        def mark_attended(
            session: SessionLog = Depends(get_session_with_owner_check),
            db: Session = Depends(get_db),
        ):
            # session is already loaded and ownership verified
            ...
    """
    session = db.query(SessionLog).filter(SessionLog.id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    is_owner = session.tutor_id == current_user.id
    is_admin = current_user.role in ("Admin", "Super Admin")

    if not (is_owner or is_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only modify your own sessions",
        )

    return session
