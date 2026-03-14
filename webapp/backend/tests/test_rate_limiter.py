"""
Tests for rate limiter utility.

Covers:
- check_user_rate_limit() — sliding window per-user rate limiting
- check_ip_rate_limit() — sliding window per-IP rate limiting
- get_client_ip() — IP extraction from proxy headers
- clear_rate_limits() — state reset
"""
import pytest
import time
from unittest.mock import MagicMock
from fastapi import HTTPException
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from utils.rate_limiter import (
    check_user_rate_limit,
    check_ip_rate_limit,
    get_client_ip,
    clear_rate_limits,
    RATE_LIMITS,
)


@pytest.fixture(autouse=True)
def clean_rate_limits():
    """Clear rate limits before and after each test."""
    clear_rate_limits()
    yield
    clear_rate_limits()


class TestGetClientIp:
    """Test suite for get_client_ip function."""

    def test_cf_connecting_ip_preferred(self):
        """Prefers CF-Connecting-IP over X-Forwarded-For."""
        request = MagicMock()
        request.headers = {"CF-Connecting-IP": "9.9.9.9", "X-Forwarded-For": "1.2.3.4, 5.6.7.8"}
        assert get_client_ip(request) == "9.9.9.9"

    def test_with_forwarded_for(self):
        """Extracts rightmost (last trusted proxy) IP from X-Forwarded-For."""
        request = MagicMock()
        request.headers = {"X-Forwarded-For": "1.2.3.4, 5.6.7.8"}
        assert get_client_ip(request) == "5.6.7.8"

    def test_without_forwarded_for(self):
        """Falls back to request.client.host."""
        request = MagicMock()
        request.headers = {}
        request.client.host = "10.0.0.1"
        assert get_client_ip(request) == "10.0.0.1"

    def test_no_client(self):
        """Returns 'unknown' when no client info."""
        request = MagicMock()
        request.headers = {}
        request.client = None
        assert get_client_ip(request) == "unknown"


class TestCheckUserRateLimit:
    """Test suite for check_user_rate_limit function."""

    def test_within_limit_no_exception(self):
        """Requests within limit should not raise."""
        # auth_login has limit 5/min
        for _ in range(5):
            check_user_rate_limit(1, "auth_login")

    def test_exceeding_limit_raises_429(self):
        """Exceeding limit should raise 429."""
        for _ in range(5):
            check_user_rate_limit(1, "auth_login")

        with pytest.raises(HTTPException) as exc_info:
            check_user_rate_limit(1, "auth_login")
        assert exc_info.value.status_code == 429
        assert "Retry-After" in exc_info.value.headers

    def test_different_users_independent(self):
        """Rate limits are per-user."""
        for _ in range(5):
            check_user_rate_limit(1, "auth_login")
        # User 2 should not be affected
        check_user_rate_limit(2, "auth_login")  # Should not raise

    def test_different_operations_independent(self):
        """Rate limits are per-operation."""
        for _ in range(5):
            check_user_rate_limit(1, "auth_login")
        # Different operation should not be affected
        check_user_rate_limit(1, "message_create")  # Should not raise

    def test_unknown_operation_uses_default(self):
        """Unknown operation uses default limit (100/min)."""
        default_limit = RATE_LIMITS["default"]["limit"]
        for _ in range(default_limit):
            check_user_rate_limit(1, "some_unknown_op")

        with pytest.raises(HTTPException) as exc_info:
            check_user_rate_limit(1, "some_unknown_op")
        assert exc_info.value.status_code == 429


class TestCheckIpRateLimit:
    """Test suite for check_ip_rate_limit function."""

    def _mock_request(self, ip="1.2.3.4"):
        request = MagicMock()
        request.headers = {"X-Forwarded-For": ip}
        return request

    def test_within_limit_no_exception(self):
        """IP requests within limit should not raise."""
        request = self._mock_request()
        for _ in range(5):
            check_ip_rate_limit(request, "auth_login")

    def test_exceeding_limit_raises_429(self):
        """IP exceeding limit should raise 429."""
        request = self._mock_request()
        for _ in range(5):
            check_ip_rate_limit(request, "auth_login")

        with pytest.raises(HTTPException) as exc_info:
            check_ip_rate_limit(request, "auth_login")
        assert exc_info.value.status_code == 429

    def test_different_ips_independent(self):
        """Different IPs have independent limits."""
        req1 = self._mock_request("1.1.1.1")
        req2 = self._mock_request("2.2.2.2")

        for _ in range(5):
            check_ip_rate_limit(req1, "auth_login")

        # Different IP should not be affected
        check_ip_rate_limit(req2, "auth_login")


class TestClearRateLimits:
    """Test suite for clear_rate_limits function."""

    def test_resets_counters(self):
        """After clearing, previously exhausted limits should work again."""
        for _ in range(5):
            check_user_rate_limit(1, "auth_login")

        # Should be rate limited now
        with pytest.raises(HTTPException):
            check_user_rate_limit(1, "auth_login")

        clear_rate_limits()

        # Should work again
        check_user_rate_limit(1, "auth_login")
