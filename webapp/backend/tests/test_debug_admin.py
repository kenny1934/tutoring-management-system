"""
Tests for debug admin helper functions.

Covers:
- serialize_value() — convert DB types to JSON-serializable
- serialize_row() — apply to entire row dict
- is_sensitive_column() — detect sensitive column names
- escape_like_pattern() — escape SQL LIKE special chars
- parse_db_error() — parse IntegrityError to user-friendly message
"""
import pytest
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import MagicMock
from sqlalchemy.exc import IntegrityError
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from routers.debug_admin import (
    serialize_value,
    serialize_row,
    is_sensitive_column,
    escape_like_pattern,
    parse_db_error,
)


class TestSerializeValue:
    """Test suite for serialize_value function."""

    def test_none_returns_none(self):
        assert serialize_value(None) is None

    def test_date_returns_isoformat(self):
        assert serialize_value(date(2026, 3, 12)) == "2026-03-12"

    def test_datetime_returns_isoformat(self):
        dt = datetime(2026, 3, 12, 14, 30, 0)
        assert serialize_value(dt) == "2026-03-12T14:30:00"

    def test_decimal_returns_float(self):
        assert serialize_value(Decimal("3.14")) == 3.14

    def test_bytes_returns_base64(self):
        result = serialize_value(b"hello")
        assert result.startswith("base64:")
        assert "aGVsbG8=" in result  # base64 of "hello"

    def test_string_passthrough(self):
        assert serialize_value("hello") == "hello"

    def test_int_passthrough(self):
        assert serialize_value(42) == 42

    def test_bool_passthrough(self):
        assert serialize_value(True) is True


class TestSerializeRow:
    """Test suite for serialize_row function."""

    def test_serializes_all_values(self):
        row = {
            "name": "Test",
            "created": date(2026, 1, 1),
            "amount": Decimal("100.50"),
            "active": True,
        }
        result = serialize_row(row)
        assert result["name"] == "Test"
        assert result["created"] == "2026-01-01"
        assert result["amount"] == 100.50
        assert result["active"] is True

    def test_empty_row(self):
        assert serialize_row({}) == {}


class TestIsSensitiveColumn:
    """Test suite for is_sensitive_column function."""

    def test_exact_match_password(self):
        assert is_sensitive_column("password") is True

    def test_exact_match_token(self):
        assert is_sensitive_column("token") is True

    def test_exact_match_api_key(self):
        assert is_sensitive_column("api_key") is True

    def test_pattern_match_auth_token(self):
        assert is_sensitive_column("auth_token") is True

    def test_pattern_match_refresh_token(self):
        assert is_sensitive_column("refresh_token") is True

    def test_pattern_match_user_email(self):
        assert is_sensitive_column("user_email") is True

    def test_non_sensitive_column(self):
        assert is_sensitive_column("student_name") is False

    def test_non_sensitive_id(self):
        assert is_sensitive_column("id") is False

    def test_case_insensitive(self):
        assert is_sensitive_column("PASSWORD") is True


class TestEscapeLikePattern:
    """Test suite for escape_like_pattern function."""

    def test_escapes_backslash(self):
        assert escape_like_pattern("a\\b") == "a\\\\b"

    def test_escapes_percent(self):
        assert escape_like_pattern("100%") == "100\\%"

    def test_escapes_underscore(self):
        assert escape_like_pattern("a_b") == "a\\_b"

    def test_multiple_specials(self):
        assert escape_like_pattern("a%b_c\\d") == "a\\%b\\_c\\\\d"

    def test_safe_string_passthrough(self):
        assert escape_like_pattern("hello world") == "hello world"

    def test_empty_string(self):
        assert escape_like_pattern("") == ""


class TestParseDbError:
    """Test suite for parse_db_error function."""

    def _make_integrity_error(self, message):
        """Create a mock IntegrityError with given message."""
        error = IntegrityError("statement", {}, Exception(message))
        return error

    def test_foreign_key_error(self):
        error = self._make_integrity_error("FOREIGN KEY constraint failed")
        result = parse_db_error(error)
        assert "Foreign key" in result

    def test_unique_constraint_error(self):
        error = self._make_integrity_error("UNIQUE constraint failed: students.email")
        result = parse_db_error(error)
        assert "Unique constraint" in result

    def test_duplicate_error(self):
        error = self._make_integrity_error("Duplicate entry '1' for key 'PRIMARY'")
        result = parse_db_error(error)
        assert "Unique constraint" in result

    def test_not_null_error(self):
        error = self._make_integrity_error("NOT NULL constraint failed: students.name")
        result = parse_db_error(error)
        assert "Required field" in result

    def test_generic_error(self):
        error = Exception("Something went wrong")
        result = parse_db_error(error)
        assert "Database error" in result

    def test_long_error_truncated(self):
        error = Exception("x" * 300)
        result = parse_db_error(error)
        assert len(result) < 200
