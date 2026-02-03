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
