"""
Tests for authentication endpoints and JWT handling.

Tests cover:
- GET /auth/me - Current user info
- POST /auth/logout - Logout (clear cookie)
- POST /auth/refresh - Token refresh with sliding window
- JWT token creation, verification, and expiry
- Access control without authentication
"""
import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, MagicMock

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from models import Tutor
from auth.jwt_handler import (
    create_access_token,
    verify_token,
    get_token_time_remaining,
    can_refresh_token,
    create_refreshed_token,
    ACCESS_TOKEN_EXPIRE_HOURS,
    REFRESH_GRACE_PERIOD_MINUTES,
)


# ============================================================================
# JWT Token Unit Tests
# ============================================================================

class TestCreateAccessToken:
    """Tests for JWT token creation."""

    def test_creates_valid_token(self):
        """Token should be decodable and contain payload."""
        payload = {"sub": "123", "email": "test@example.com", "role": "Tutor"}
        token = create_access_token(payload)

        decoded = verify_token(token)
        assert decoded is not None
        assert decoded["sub"] == "123"
        assert decoded["email"] == "test@example.com"
        assert decoded["role"] == "Tutor"

    def test_token_has_expiry(self):
        """Token should have exp claim set."""
        payload = {"sub": "123"}
        token = create_access_token(payload)

        decoded = verify_token(token)
        assert "exp" in decoded
        assert "iat" in decoded

    def test_custom_expiry_delta(self):
        """Token expiry should respect custom delta."""
        payload = {"sub": "123"}
        custom_delta = timedelta(hours=1)
        token = create_access_token(payload, expires_delta=custom_delta)

        remaining = get_token_time_remaining(token)
        # Should be about 1 hour (3600 seconds), with some tolerance
        assert remaining is not None
        assert 3500 < remaining <= 3600

    def test_default_expiry(self):
        """Token should default to ACCESS_TOKEN_EXPIRE_HOURS."""
        payload = {"sub": "123"}
        token = create_access_token(payload)

        remaining = get_token_time_remaining(token)
        expected_seconds = ACCESS_TOKEN_EXPIRE_HOURS * 3600
        assert remaining is not None
        # Allow 60 seconds tolerance for test execution time
        assert expected_seconds - 60 < remaining <= expected_seconds


class TestVerifyToken:
    """Tests for JWT token verification."""

    def test_valid_token_returns_payload(self):
        """Valid token should return decoded payload."""
        token = create_access_token({"sub": "123", "name": "Test"})
        payload = verify_token(token)

        assert payload is not None
        assert payload["sub"] == "123"
        assert payload["name"] == "Test"

    def test_expired_token_returns_none(self):
        """Expired token should return None."""
        # Create token that expired 1 hour ago
        token = create_access_token(
            {"sub": "123"},
            expires_delta=timedelta(hours=-1)
        )
        payload = verify_token(token)
        assert payload is None

    def test_invalid_token_returns_none(self):
        """Invalid/tampered token should return None."""
        payload = verify_token("invalid.token.here")
        assert payload is None

    def test_malformed_token_returns_none(self):
        """Malformed token should return None."""
        payload = verify_token("not-even-close")
        assert payload is None


class TestGetTokenTimeRemaining:
    """Tests for token time remaining calculation."""

    def test_valid_token_returns_seconds(self):
        """Should return positive seconds for valid token."""
        token = create_access_token({"sub": "123"})
        remaining = get_token_time_remaining(token)

        assert remaining is not None
        assert remaining > 0

    def test_expired_token_returns_negative(self):
        """Should return negative for expired token."""
        token = create_access_token(
            {"sub": "123"},
            expires_delta=timedelta(hours=-1)
        )
        remaining = get_token_time_remaining(token)

        assert remaining is not None
        assert remaining < 0

    def test_invalid_token_returns_none(self):
        """Invalid token should return None."""
        remaining = get_token_time_remaining("invalid.token")
        assert remaining is None


class TestCanRefreshToken:
    """Tests for token refresh eligibility."""

    def test_valid_token_can_refresh(self):
        """Valid non-expired token should be refreshable."""
        token = create_access_token({"sub": "123"})
        assert can_refresh_token(token) is True

    def test_recently_expired_can_refresh(self):
        """Token within grace period should be refreshable."""
        # Expired 5 minutes ago (within 15-minute grace)
        token = create_access_token(
            {"sub": "123"},
            expires_delta=timedelta(minutes=-5)
        )
        assert can_refresh_token(token) is True

    def test_old_expired_cannot_refresh(self):
        """Token beyond grace period should not be refreshable."""
        # Expired 30 minutes ago (beyond 15-minute grace)
        token = create_access_token(
            {"sub": "123"},
            expires_delta=timedelta(minutes=-30)
        )
        assert can_refresh_token(token) is False

    def test_invalid_token_cannot_refresh(self):
        """Invalid token should not be refreshable."""
        assert can_refresh_token("invalid.token") is False


class TestCreateRefreshedToken:
    """Tests for token refresh functionality."""

    def test_refresh_creates_new_token(self):
        """Refreshing should create a new valid token."""
        # Create token expiring soon so refresh gives different expiry
        original = create_access_token(
            {"sub": "123", "email": "test@example.com"},
            expires_delta=timedelta(minutes=10)
        )
        refreshed = create_refreshed_token(original)

        assert refreshed is not None
        # Refreshed token should have different expiry (full duration vs 10 min)
        original_remaining = get_token_time_remaining(original)
        refreshed_remaining = get_token_time_remaining(refreshed)
        assert refreshed_remaining > original_remaining

        # Verify new token is valid
        payload = verify_token(refreshed)
        assert payload is not None
        assert payload["sub"] == "123"
        assert payload["email"] == "test@example.com"

    def test_refresh_preserves_claims(self):
        """Refreshed token should preserve original claims."""
        original = create_access_token({
            "sub": "42",
            "email": "user@example.com",
            "name": "Test User",
            "role": "Admin"
        })
        refreshed = create_refreshed_token(original)

        payload = verify_token(refreshed)
        assert payload["sub"] == "42"
        assert payload["email"] == "user@example.com"
        assert payload["name"] == "Test User"
        assert payload["role"] == "Admin"

    def test_refresh_extends_expiry(self):
        """Refreshed token should have fresh expiry."""
        # Create token expiring in 10 minutes
        original = create_access_token(
            {"sub": "123"},
            expires_delta=timedelta(minutes=10)
        )
        original_remaining = get_token_time_remaining(original)

        refreshed = create_refreshed_token(original)
        refreshed_remaining = get_token_time_remaining(refreshed)

        # New token should have full expiry (much more than 10 minutes)
        assert refreshed_remaining > original_remaining
        assert refreshed_remaining > 3 * 3600  # More than 3 hours

    def test_refresh_within_grace_period(self):
        """Should refresh recently expired token within grace period."""
        # Expired 5 minutes ago
        expired = create_access_token(
            {"sub": "123"},
            expires_delta=timedelta(minutes=-5)
        )
        refreshed = create_refreshed_token(expired)

        assert refreshed is not None
        payload = verify_token(refreshed)
        assert payload is not None
        assert payload["sub"] == "123"

    def test_refresh_fails_beyond_grace_period(self):
        """Should not refresh token expired beyond grace period."""
        # Expired 30 minutes ago
        old_expired = create_access_token(
            {"sub": "123"},
            expires_delta=timedelta(minutes=-30)
        )
        refreshed = create_refreshed_token(old_expired)
        assert refreshed is None


# ============================================================================
# Auth Endpoint Integration Tests
# ============================================================================

class TestAuthMeEndpoint:
    """Tests for GET /api/auth/me endpoint."""

    def test_returns_401_without_token(self, client):
        """Should return 401 when no auth cookie present."""
        response = client.get("/api/auth/me")
        assert response.status_code == 401
        assert "Not authenticated" in response.json()["detail"]

    def test_returns_401_with_invalid_token(self, client):
        """Should return 401 with invalid token."""
        client.cookies.set("access_token", "invalid.token.here")
        response = client.get("/api/auth/me")
        assert response.status_code == 401

    def test_returns_401_with_expired_token(self, client, db_session):
        """Should return 401 with expired token."""
        # Create tutor first
        tutor = Tutor(
            id=1,
            user_email="test@example.com",
            tutor_name="Test Tutor",
            role="Tutor"
        )
        db_session.add(tutor)
        db_session.commit()

        # Create expired token
        token = create_access_token(
            {"sub": "1", "email": "test@example.com"},
            expires_delta=timedelta(hours=-1)
        )
        client.cookies.set("access_token", token)

        response = client.get("/api/auth/me")
        assert response.status_code == 401

    def test_returns_user_info_with_valid_token(self, client, db_session):
        """Should return user info with valid token."""
        # Create tutor
        tutor = Tutor(
            id=1,
            user_email="test@example.com",
            tutor_name="Test Tutor",
            role="Admin",
            default_location="Main Center"
        )
        db_session.add(tutor)
        db_session.commit()

        # Create valid token
        token = create_access_token({
            "sub": "1",
            "email": "test@example.com",
            "name": "Test Tutor",
            "role": "Admin",
            "picture": "https://example.com/pic.jpg"
        })
        client.cookies.set("access_token", token)

        response = client.get("/api/auth/me")
        assert response.status_code == 200

        data = response.json()
        assert data["id"] == 1
        assert data["email"] == "test@example.com"
        assert data["name"] == "Test Tutor"
        assert data["role"] == "Admin"
        assert data["default_location"] == "Main Center"
        assert data["picture"] == "https://example.com/pic.jpg"


class TestLogoutEndpoint:
    """Tests for POST /api/auth/logout endpoint."""

    def test_logout_clears_cookie(self, client):
        """Logout should clear the auth cookie."""
        # Set a cookie first
        client.cookies.set("access_token", "some-token")

        response = client.post("/api/auth/logout")
        assert response.status_code == 200
        assert response.json()["message"] == "Logged out successfully"

        # Cookie should be cleared (set to empty with past expiry)
        # Note: TestClient doesn't perfectly simulate cookie deletion
        # but the endpoint returns success

    def test_logout_works_without_cookie(self, client):
        """Logout should work even without existing cookie."""
        response = client.post("/api/auth/logout")
        assert response.status_code == 200


class TestRefreshEndpoint:
    """Tests for POST /api/auth/refresh endpoint."""

    def test_returns_401_without_token(self, client):
        """Should return 401 when no token present."""
        response = client.post("/api/auth/refresh")
        assert response.status_code == 401
        assert "No token provided" in response.json()["detail"]

    def test_returns_401_with_old_expired_token(self, client):
        """Should return 401 when token is too old to refresh."""
        # Expired 30 minutes ago (beyond grace period)
        token = create_access_token(
            {"sub": "1"},
            expires_delta=timedelta(minutes=-30)
        )
        client.cookies.set("access_token", token)

        response = client.post("/api/auth/refresh")
        assert response.status_code == 401
        assert "Please log in again" in response.json()["detail"]

    def test_refreshes_valid_token(self, client):
        """Should refresh a valid token successfully."""
        # Create valid token
        token = create_access_token({
            "sub": "1",
            "email": "test@example.com",
            "name": "Test User",
            "role": "Tutor"
        })
        client.cookies.set("access_token", token)

        response = client.post("/api/auth/refresh")
        assert response.status_code == 200

        data = response.json()
        assert data["success"] is True
        assert data["expires_in"] > 0
        assert "refreshed successfully" in data["message"]

    def test_refreshes_recently_expired_token(self, client):
        """Should refresh token within grace period."""
        # Expired 5 minutes ago (within 15-minute grace)
        token = create_access_token(
            {"sub": "1", "email": "test@example.com"},
            expires_delta=timedelta(minutes=-5)
        )
        client.cookies.set("access_token", token)

        response = client.post("/api/auth/refresh")
        assert response.status_code == 200

        data = response.json()
        assert data["success"] is True


class TestProtectedEndpointsRequireAuth:
    """Tests that protected endpoints require authentication."""

    def test_sessions_update_requires_auth(self, client):
        """Sessions update endpoint should require auth."""
        response = client.patch("/api/sessions/1", json={"notes": "test"})
        assert response.status_code == 401

    def test_students_requires_auth(self, client):
        """Students endpoint should require auth for mutations."""
        response = client.post("/api/students", json={"student_name": "Test"})
        assert response.status_code == 401

    def test_enrollments_requires_auth(self, client):
        """Enrollments endpoint should require auth for mutations."""
        response = client.post("/api/enrollments", json={})
        assert response.status_code == 401


class TestRoleBasedAccess:
    """Tests for role-based access control."""

    def test_admin_endpoint_rejects_tutor(self, client, db_session):
        """Admin-only endpoints should reject regular tutors."""
        # Create tutor with non-admin role
        tutor = Tutor(
            id=1,
            user_email="tutor@example.com",
            tutor_name="Regular Tutor",
            role="Tutor"
        )
        db_session.add(tutor)
        db_session.commit()

        token = create_access_token({
            "sub": "1",
            "email": "tutor@example.com",
            "role": "Tutor"
        })
        client.cookies.set("access_token", token)

        # Try to access admin endpoint (debug panel)
        response = client.get("/api/debug/tables")
        assert response.status_code == 403

    def test_admin_endpoint_accepts_admin(self, client, db_session):
        """Admin-only endpoints should accept admin users."""
        # Create admin user
        admin = Tutor(
            id=1,
            user_email="admin@example.com",
            tutor_name="Admin User",
            role="Super Admin"
        )
        db_session.add(admin)
        db_session.commit()

        token = create_access_token({
            "sub": "1",
            "email": "admin@example.com",
            "role": "Super Admin"
        })
        client.cookies.set("access_token", token)

        # Try to access admin endpoint (debug panel)
        response = client.get("/api/debug/tables")
        assert response.status_code == 200


# ============================================================================
# Impersonation: who a request counts as
# ============================================================================

class TestEffectiveRole:
    """A Super Admin can view the app as somebody else, and the gates have to
    believe it. The role rides on a header, so the server decides who is
    allowed to send one rather than trusting what arrives."""

    @staticmethod
    def _request(**headers):
        from starlette.requests import Request
        raw = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
        return Request({"type": "http", "method": "GET", "path": "/", "headers": raw})

    def test_a_super_admin_becomes_whoever_the_header_says(self):
        from auth.dependencies import get_effective_role
        boss = Tutor(id=1, role="Super Admin")
        assert get_effective_role(self._request(**{"X-Effective-Role": "Tutor"}), boss) == "Tutor"

    def test_everybody_else_stays_themselves(self):
        """Without this an ordinary tutor could send the header and read the
        admin pages."""
        from auth.dependencies import get_effective_role
        tutor = Tutor(id=2, role="Tutor")
        assert get_effective_role(self._request(**{"X-Effective-Role": "Admin"}), tutor) == "Tutor"

    def test_a_role_nobody_has_is_ignored(self):
        from auth.dependencies import get_effective_role
        boss = Tutor(id=1, role="Super Admin")
        assert get_effective_role(self._request(**{"X-Effective-Role": "Owner"}), boss) == "Super Admin"

    def test_viewing_as_a_tutor_closes_the_admin_pages(self):
        """What makes the prospect board testable: impersonate a tutor and the
        endpoints behind it refuse, exactly as they would for that tutor."""
        from fastapi import HTTPException
        from auth.dependencies import require_admin_view
        boss = Tutor(id=1, role="Super Admin")
        with pytest.raises(HTTPException) as refused:
            require_admin_view(self._request(**{"X-Effective-Role": "Tutor"}), boss)
        assert refused.value.status_code == 403

    def test_a_supervisor_still_reads_the_admin_pages(self):
        """The read-only admin role, which is why the page gate is
        canViewAdminPages rather than an Admin-only check."""
        from auth.dependencies import require_admin_view
        boss = Tutor(id=1, role="Super Admin")
        assert require_admin_view(self._request(**{"X-Effective-Role": "Supervisor"}), boss) is boss


# ============================================================================
# The 30-day session that keeps someone signed in between visits
# ============================================================================

from datetime import date
from auth.jwt_handler import create_session_token, verify_session_token, SESSION_EXPIRE_DAYS


def _add_tutor(db_session, **extra):
    tutor = Tutor(id=7, user_email="bella@example.com", tutor_name="Ms Bella Chang", role="Tutor", **extra)
    db_session.add(tutor)
    db_session.commit()
    return tutor


def _set_cookie_headers(response):
    return response.headers.get_list("set-cookie")


class TestSessionToken:
    def test_round_trips_the_tutor_id(self):
        assert verify_session_token(create_session_token(7)) == 7

    def test_an_access_token_is_not_a_session_token(self):
        assert verify_session_token(create_access_token({"sub": "7"})) is None

    def test_a_session_token_is_not_an_access_token(self):
        # Signed with its own key, so it can't stand in for the 4-hour token.
        assert verify_token(create_session_token(7)) is None

    def test_a_session_token_in_the_access_cookie_is_refused(self, client, db_session):
        _add_tutor(db_session)
        client.cookies.set("access_token", create_session_token(7))
        assert client.get("/api/auth/me").status_code == 401


class TestRefreshWithSession:
    def test_signs_back_in_when_the_4_hour_cookie_has_gone(self, client, db_session):
        _add_tutor(db_session)
        client.cookies.set("session_token", create_session_token(7))

        response = client.post("/api/auth/refresh")
        assert response.status_code == 200

        cookies = _set_cookie_headers(response)
        access = next(c for c in cookies if c.startswith("access_token="))
        token = access.split(";")[0].split("=", 1)[1]
        payload = verify_token(token)
        assert payload["sub"] == "7"
        assert payload["name"] == "Ms Bella Chang"
        assert payload["role"] == "Tutor"

    def test_starts_the_30_days_again(self, client, db_session):
        _add_tutor(db_session)
        client.cookies.set("session_token", create_session_token(7))

        cookies = _set_cookie_headers(client.post("/api/auth/refresh"))
        session = next(c for c in cookies if c.startswith("session_token="))
        assert f"Max-Age={SESSION_EXPIRE_DAYS * 24 * 3600}" in session
        assert "Path=/api/auth/refresh" in session
        assert "HttpOnly" in session

    def test_gives_someone_signed_in_before_sessions_existed_a_session(self, client, db_session):
        _add_tutor(db_session)
        client.cookies.set("access_token", create_access_token({"sub": "7", "name": "Ms Bella Chang"}))

        cookies = _set_cookie_headers(client.post("/api/auth/refresh"))
        assert any(c.startswith("session_token=") for c in cookies)

    def test_the_access_cookie_outlives_its_token_by_the_grace_period(self, client, db_session):
        _add_tutor(db_session)
        client.cookies.set("session_token", create_session_token(7))

        cookies = _set_cookie_headers(client.post("/api/auth/refresh"))
        access = next(c for c in cookies if c.startswith("access_token="))
        expected = ACCESS_TOKEN_EXPIRE_HOURS * 3600 + REFRESH_GRACE_PERIOD_MINUTES * 60
        assert f"Max-Age={expected}" in access

    def test_refuses_a_tutor_who_no_longer_exists(self, client, db_session):
        client.cookies.set("session_token", create_session_token(7))
        response = client.post("/api/auth/refresh")
        assert response.status_code == 401
        assert "Please log in again" in response.json()["detail"]

    def test_refuses_a_departed_tutor_and_clears_both_cookies(self, client, db_session):
        _add_tutor(db_session, departure_effective_on=date(2020, 1, 31))
        client.cookies.set("session_token", create_session_token(7))

        response = client.post("/api/auth/refresh")
        assert response.status_code == 401
        assert response.json()["detail"] == "This account is no longer active"
        cookies = _set_cookie_headers(response)
        assert any(c.startswith('access_token=""') or c.startswith("access_token=;") for c in cookies)
        assert any(c.startswith("session_token=") and "Max-Age=0" in c for c in cookies)

    def test_refuses_a_forged_session_token(self, client, db_session):
        _add_tutor(db_session)
        client.cookies.set("session_token", "not-a-token")
        assert client.post("/api/auth/refresh").status_code == 401


class TestLogoutClearsSession:
    def test_logout_clears_the_session_cookie_on_its_path(self, client):
        cookies = _set_cookie_headers(client.post("/api/auth/logout"))
        session = next(c for c in cookies if c.startswith("session_token="))
        assert "Max-Age=0" in session
        assert "Path=/api/auth/refresh" in session
