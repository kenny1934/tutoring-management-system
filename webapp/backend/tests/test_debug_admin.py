"""
Tests for debug admin helper functions.

Covers:
- serialize_value() — convert DB types to JSON-serializable
- serialize_row() — apply to entire row dict
- is_sensitive_column() — detect sensitive column names
- escape_like_pattern() — escape SQL LIKE special chars
- parse_db_error() — parse IntegrityError to user-friendly message
- get_sqlalchemy_type_name() — SQLAlchemy type to string
- parse_filter_string() — filter string parsing
- coerce_filter_value() — type coercion for filter values
- assert_valid_identifier() — SQL identifier validation
- strip_sql_comments() — SQL comment removal
- is_safe_query() — SQL query safety check
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
    get_sqlalchemy_type_name,
    parse_filter_string,
    coerce_filter_value,
    assert_valid_identifier,
    strip_sql_comments,
    is_safe_query,
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


class TestGetSqlalchemyTypeName:
    """Test suite for get_sqlalchemy_type_name function."""

    def test_integer_types(self):
        assert get_sqlalchemy_type_name("INTEGER") == "integer"
        assert get_sqlalchemy_type_name("BIGINT") == "integer"
        assert get_sqlalchemy_type_name("SMALLINT") == "integer"

    def test_string_types(self):
        assert get_sqlalchemy_type_name("VARCHAR(255)") == "string"
        assert get_sqlalchemy_type_name("TEXT") == "string"
        assert get_sqlalchemy_type_name("CHAR(10)") == "string"

    def test_decimal_types(self):
        assert get_sqlalchemy_type_name("DECIMAL(10,2)") == "decimal"
        assert get_sqlalchemy_type_name("FLOAT") == "decimal"
        assert get_sqlalchemy_type_name("DOUBLE") == "decimal"

    def test_date_type(self):
        assert get_sqlalchemy_type_name("DATE") == "date"

    def test_datetime_types(self):
        assert get_sqlalchemy_type_name("DATETIME") == "datetime"
        assert get_sqlalchemy_type_name("TIMESTAMP") == "datetime"

    def test_boolean_types(self):
        assert get_sqlalchemy_type_name("BOOLEAN") == "boolean"
        # TINYINT(1) matches INT before BOOL check, so returns integer
        assert get_sqlalchemy_type_name("TINYINT(1)") == "integer"

    def test_binary_types(self):
        assert get_sqlalchemy_type_name("BLOB") == "binary"
        assert get_sqlalchemy_type_name("BINARY(16)") == "binary"

    def test_unknown_defaults_to_string(self):
        assert get_sqlalchemy_type_name("ENUM('a','b')") == "string"


class TestParseFilterString:
    """Test suite for parse_filter_string function."""

    def test_empty_returns_empty(self):
        assert parse_filter_string("") == []
        assert parse_filter_string(None) == []

    def test_simple_eq_filter(self):
        result = parse_filter_string("status:active")
        assert result == [("status", "eq", "active")]

    def test_explicit_operator(self):
        result = parse_filter_string("created_at__gte:2024-01-01")
        assert result == [("created_at", "gte", "2024-01-01")]

    def test_like_operator(self):
        result = parse_filter_string("name__like:john")
        assert result == [("name", "like", "john")]

    def test_null_operator_true(self):
        result = parse_filter_string("email__null:true")
        assert result == [("email", "null", "true")]

    def test_null_operator_invalid_value(self):
        with pytest.raises(ValueError, match="Invalid null operator value"):
            parse_filter_string("email__null:maybe")

    def test_multiple_filters(self):
        result = parse_filter_string("status:active,grade__eq:F4")
        assert len(result) == 2
        assert result[0] == ("status", "eq", "active")
        assert result[1] == ("grade", "eq", "F4")

    def test_invalid_operator_defaults_to_eq(self):
        result = parse_filter_string("status__invalid:active")
        assert result == [("status", "eq", "active")]

    def test_too_long_string_raises(self):
        with pytest.raises(ValueError, match="too long"):
            parse_filter_string("x" * 2001)

    def test_max_filters_exceeded(self):
        # 11 filters should raise (MAX_FILTERS = 10)
        filters = ",".join(f"col{i}:val{i}" for i in range(11))
        with pytest.raises(ValueError, match="Too many filters"):
            parse_filter_string(filters)


class TestCoerceFilterValue:
    """Test suite for coerce_filter_value function."""

    def test_integer_coercion(self):
        assert coerce_filter_value("42", "integer") == 42

    def test_decimal_coercion(self):
        assert coerce_filter_value("3.14", "decimal") == 3.14

    def test_boolean_true(self):
        assert coerce_filter_value("true", "boolean") is True
        assert coerce_filter_value("1", "boolean") is True

    def test_boolean_false(self):
        assert coerce_filter_value("no", "boolean") is False

    def test_string_passthrough(self):
        assert coerce_filter_value("hello", "string") == "hello"

    def test_invalid_integer_fallback(self):
        assert coerce_filter_value("abc", "integer") == "abc"


class TestAssertValidIdentifier:
    """Test suite for assert_valid_identifier function."""

    def test_valid_identifier_passes(self):
        assert_valid_identifier("name", {"name", "id"}, "column")

    def test_invalid_identifier_raises(self):
        with pytest.raises(ValueError, match="Invalid column"):
            assert_valid_identifier("hacked", {"name", "id"}, "column")


class TestStripSqlComments:
    """Test suite for strip_sql_comments function."""

    def test_strips_line_comment(self):
        result = strip_sql_comments("SELECT * FROM t -- this is a comment\nWHERE 1=1")
        assert "--" not in result
        assert "WHERE 1=1" in result

    def test_strips_block_comment(self):
        result = strip_sql_comments("SELECT /* secret */ * FROM t")
        assert "secret" not in result
        assert "SELECT" in result
        assert "FROM t" in result

    def test_preserves_string_contents(self):
        result = strip_sql_comments("SELECT * FROM t WHERE name = '-- not a comment'")
        assert "-- not a comment" in result

    def test_no_comments_passthrough(self):
        query = "SELECT id, name FROM students"
        assert strip_sql_comments(query) == query


class TestIsSafeQuery:
    """Test suite for is_safe_query function."""

    def test_select_allowed(self):
        is_safe, msg = is_safe_query("SELECT * FROM students")
        assert is_safe is True

    def test_with_cte_allowed(self):
        is_safe, msg = is_safe_query("WITH cte AS (SELECT 1) SELECT * FROM cte")
        assert is_safe is True

    def test_insert_blocked(self):
        is_safe, msg = is_safe_query("INSERT INTO students (name) VALUES ('test')")
        assert is_safe is False

    def test_delete_blocked(self):
        is_safe, msg = is_safe_query("DELETE FROM students")
        assert is_safe is False

    def test_drop_blocked(self):
        is_safe, msg = is_safe_query("DROP TABLE students")
        assert is_safe is False

    def test_update_blocked(self):
        is_safe, msg = is_safe_query("UPDATE students SET name='x'")
        assert is_safe is False

    def test_comment_bypass_blocked(self):
        # Try to hide INSERT after a comment
        is_safe, msg = is_safe_query("SELECT 1; -- \nINSERT INTO t VALUES(1)")
        assert is_safe is False

    def test_semicolon_stacking_blocked(self):
        is_safe, msg = is_safe_query("SELECT 1; DROP TABLE students")
        assert is_safe is False

    def test_trailing_semicolon_allowed(self):
        is_safe, msg = is_safe_query("SELECT * FROM students;")
        assert is_safe is True

    def test_sleep_blocked(self):
        is_safe, msg = is_safe_query("SELECT SLEEP(10)")
        assert is_safe is False

    def test_benchmark_blocked(self):
        is_safe, msg = is_safe_query("SELECT BENCHMARK(1000000, SHA1('test'))")
        assert is_safe is False
