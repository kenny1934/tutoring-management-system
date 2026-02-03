"""
Super Admin Debug Panel Router

Provides phpMyAdmin-lite functionality for Super Admins to:
- Browse database tables
- View, create, update, and delete records
- Export data as CSV/JSON
- Bulk operations
- View audit logs of all debug operations

Security: All endpoints require Super Admin role.
"""

import csv
import io
import json
import os
import re
from typing import Optional, Any
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import inspect, text, desc
from sqlalchemy.orm import Session
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from pydantic import BaseModel, ConfigDict

from database import get_db, engine
from models import Tutor, DebugAuditLog
from auth.dependencies import require_super_admin
from config.debug_tables import (
    DEBUG_TABLE_CONFIG,
    get_table_config,
    get_allowed_tables,
    is_table_allowed,
)
from utils.rate_limiter import check_user_rate_limit


router = APIRouter(prefix="/debug", tags=["Debug Admin"])


# ============================================================================
# Constants
# ============================================================================

# Columns that should be redacted in audit logs (exact matches)
SENSITIVE_COLUMNS = {
    # Auth/credentials
    "password", "password_hash", "api_key", "token", "secret",
    "access_token", "refresh_token", "private_key", "credential",
    # Financial
    "ssn", "social_security", "credit_card", "card_number", "bank_account",
    "cvv", "pin", "routing_number",
    # PII - contact info
    "phone", "phone_number", "mobile", "email", "address", "home_address",
    "emergency_contact", "parent_phone", "parent_email",
    # PII - identity
    "date_of_birth", "dob", "birth_date", "national_id", "passport",
    "drivers_license", "school_student_id",
    # Location
    "home_location", "ip_address",
}

# Patterns for sensitive column detection (partial matches)
SENSITIVE_PATTERNS = {
    "_token", "_key", "_secret", "_password", "_credential",
    "_phone", "_email", "_address", "_ssn", "_pin",
}

# SQL query execution timeout in seconds
SQL_QUERY_TIMEOUT_SECONDS = 30

# Maximum number of filters allowed in a single query
MAX_FILTERS = 10

import logging
logger = logging.getLogger(__name__)

# Environment flag to enable/disable raw SQL execution endpoint
# Default: disabled in production, enabled elsewhere
_ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
ENABLE_RAW_SQL_EXECUTION = os.getenv("ENABLE_RAW_SQL_EXECUTION", "false").lower() == "true"
if _ENVIRONMENT == "production" and not ENABLE_RAW_SQL_EXECUTION:
    logger.warning(
        "Raw SQL execution endpoint is DISABLED in production. "
        "Set ENABLE_RAW_SQL_EXECUTION=true to enable (NOT recommended)."
    )


# ============================================================================
# Pydantic Models
# ============================================================================

class TableInfo(BaseModel):
    name: str
    display_name: str
    row_count: Optional[int]  # Optional for performance
    priority: int
    allow_hard_delete: bool


class ColumnInfo(BaseModel):
    name: str
    type: str
    nullable: bool
    readonly: bool
    primary_key: bool
    default: Optional[str] = None


class ForeignKeyInfo(BaseModel):
    table: str
    column: str


class TableSchema(BaseModel):
    table_name: str
    display_name: str
    columns: list[ColumnInfo]
    primary_key: str
    search_columns: list[str]
    allow_hard_delete: bool
    has_soft_delete: bool = False  # True if table has deleted_at column
    foreign_keys: dict[str, ForeignKeyInfo] = {}  # column_name -> FK info


class PaginatedRows(BaseModel):
    rows: list[dict]
    total: int
    limit: int
    offset: int
    active_count: Optional[int] = None  # Count of non-deleted rows (for soft-delete tables)
    deleted_count: Optional[int] = None  # Count of soft-deleted rows


class AuditLogEntry(BaseModel):
    id: int
    admin_email: str
    operation: str
    table_name: str
    row_id: Optional[int]
    before_state: Optional[dict]
    after_state: Optional[dict]
    changed_fields: Optional[list[str]]
    ip_address: Optional[str]
    created_at: datetime


class PaginatedAuditLogs(BaseModel):
    logs: list[AuditLogEntry]
    total: int
    limit: int
    offset: int


class BulkDeleteRequest(BaseModel):
    model_config = ConfigDict(str_max_length=1000)
    ids: list[int]


class BulkDeleteResponse(BaseModel):
    deleted_count: int
    failed_ids: list[int]
    message: str


class BulkUpdateRequest(BaseModel):
    model_config = ConfigDict(str_max_length=10000)
    ids: list[int]
    column: str
    value: Any


class BulkUpdateResponse(BaseModel):
    updated_count: int
    message: str


class RowDataRequest(BaseModel):
    """Request body for row create/update with size limits."""
    model_config = ConfigDict(str_max_length=10000)
    data: dict[str, Any]

    @classmethod
    def validate_data_size(cls, data: dict) -> None:
        """Validate data dict isn't too large."""
        if len(data) > 100:
            raise ValueError("Too many fields (max 100)")
        for key, value in data.items():
            if isinstance(value, str) and len(value) > 100000:
                raise ValueError(f"Field '{key}' is too large (max 100KB)")


# ============================================================================
# Helper Functions
# ============================================================================

def serialize_value(value: Any) -> Any:
    """Convert database values to JSON-serializable format."""
    if value is None:
        return None
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, bytes):
        # Return base64 for binary data instead of lossy decode
        import base64
        return f"base64:{base64.b64encode(value).decode('ascii')}"
    return value


def serialize_row(row: dict) -> dict:
    """Serialize all values in a row for JSON response."""
    return {k: serialize_value(v) for k, v in row.items()}


def is_sensitive_column(col_name: str) -> bool:
    """Check if a column should be redacted based on name."""
    col_lower = col_name.lower()
    # Exact match
    if col_lower in SENSITIVE_COLUMNS:
        return True
    # Pattern match (e.g., auth_token, api_key, etc.)
    return any(pattern in col_lower for pattern in SENSITIVE_PATTERNS)


def redact_sensitive(data: Optional[dict]) -> Optional[dict]:
    """Redact sensitive columns from data before logging."""
    if not data:
        return data
    return {
        k: "[REDACTED]" if is_sensitive_column(k) else v
        for k, v in data.items()
    }


def get_client_ip(request: Request) -> Optional[str]:
    """Extract client IP from request, handling proxies."""
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else None


def get_valid_columns(table_name: str) -> set[str]:
    """Get set of valid column names for a table."""
    inspector = inspect(engine)
    return {c['name'] for c in inspector.get_columns(table_name)}


def assert_valid_identifier(name: str, valid_set: set[str], context: str) -> None:
    """
    Assert that an identifier exists in the valid set.
    Raises ValueError if not found - critical security check before SQL construction.
    """
    if name not in valid_set:
        raise ValueError(f"Invalid {context}: {name}")


def validate_column_names(data: dict, table_name: str, readonly_cols: list[str]) -> dict:
    """
    Validate and filter column names against actual table schema.
    Returns only columns that exist in the table and are not readonly.
    """
    valid_columns = get_valid_columns(table_name)
    return {
        k: v for k, v in data.items()
        if k in valid_columns and k not in readonly_cols
    }


def escape_like_pattern(search: str) -> str:
    """Escape special characters for SQL LIKE patterns."""
    return (
        search
        .replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_")
    )


def parse_db_error(e: Exception) -> str:
    """Parse database exception to user-friendly message."""
    error_str = str(e).lower()

    if isinstance(e, IntegrityError):
        if "foreign key" in error_str or "fk_" in error_str:
            return "Foreign key constraint violated. Referenced record may not exist."
        if "unique" in error_str or "duplicate" in error_str:
            return "Unique constraint violated. A record with this value already exists."
        if "not null" in error_str or "cannot be null" in error_str:
            return "Required field is missing. Check for null values."

    # Truncate for safety
    return f"Database error: {str(e)[:150]}"


def fetch_row_by_id(
    db: Session,
    table_name: str,
    pk_col: str,
    row_id: int
) -> Optional[dict]:
    """Fetch a single row by primary key. Returns None if not found."""
    result = db.execute(
        text(f"SELECT * FROM `{table_name}` WHERE `{pk_col}` = :id"),
        {"id": row_id}
    )
    row = result.fetchone()
    return serialize_row(dict(row._mapping)) if row else None


def fetch_rows_by_ids(
    db: Session,
    table_name: str,
    pk_col: str,
    row_ids: list[int]
) -> dict[int, dict]:
    """
    Fetch multiple rows by primary keys in a single query.
    Returns a dict mapping row_id -> row_data. Missing IDs won't be in the result.
    """
    if not row_ids:
        return {}

    # Build parameterized IN clause
    placeholders = ", ".join([f":id_{i}" for i in range(len(row_ids))])
    params = {f"id_{i}": rid for i, rid in enumerate(row_ids)}

    result = db.execute(
        text(f"SELECT * FROM `{table_name}` WHERE `{pk_col}` IN ({placeholders})"),
        params
    )

    return {
        row._mapping[pk_col]: serialize_row(dict(row._mapping))
        for row in result
    }


def log_operation(
    db: Session,
    admin: Tutor,
    operation: str,
    table_name: str,
    row_id: Optional[int],
    before_state: Optional[dict],
    after_state: Optional[dict],
    request: Request,
    auto_commit: bool = False,
) -> DebugAuditLog:
    """
    Log a debug operation to the audit trail.
    Sensitive data is automatically redacted.

    Args:
        auto_commit: If True, commits the transaction. Default False to allow
                     caller to commit both operation and log together.
    """
    # Redact sensitive data before logging
    redacted_before = redact_sensitive(before_state)
    redacted_after = redact_sensitive(after_state)

    changed_fields = None
    if redacted_before and redacted_after:
        changed_fields = [
            k for k in redacted_after.keys()
            if k in redacted_before and redacted_before.get(k) != redacted_after.get(k)
        ]

    log_entry = DebugAuditLog(
        admin_id=admin.id,
        admin_email=admin.user_email,
        operation=operation,
        table_name=table_name,
        row_id=row_id,
        before_state=json.dumps(redacted_before, default=str) if redacted_before else None,
        after_state=json.dumps(redacted_after, default=str) if redacted_after else None,
        changed_fields=json.dumps(changed_fields) if changed_fields else None,
        ip_address=get_client_ip(request),
    )

    db.add(log_entry)
    if auto_commit:
        db.commit()
    return log_entry


def get_sqlalchemy_type_name(col_type) -> str:
    """Convert SQLAlchemy column type to simple type name."""
    type_str = str(col_type).upper()
    if 'INT' in type_str:
        return 'integer'
    if 'VARCHAR' in type_str or 'CHAR' in type_str or 'TEXT' in type_str:
        return 'string'
    if 'DECIMAL' in type_str or 'NUMERIC' in type_str or 'FLOAT' in type_str or 'DOUBLE' in type_str:
        return 'decimal'
    if 'DATE' in type_str and 'TIME' not in type_str:
        return 'date'
    if 'DATETIME' in type_str or 'TIMESTAMP' in type_str:
        return 'datetime'
    if 'BOOL' in type_str or 'TINYINT(1)' in type_str:
        return 'boolean'
    if 'BLOB' in type_str or 'BINARY' in type_str:
        return 'binary'
    return 'string'


def parse_filter_string(filter_str: str) -> list[tuple[str, str, str]]:
    """
    Parse filter string into list of (column, operator, value) tuples.

    Format: column:value,column__op:value
    Operators: eq (default), ne, gt, gte, lt, lte, like, null

    Examples:
        status:active -> (status, eq, active)
        created_at__gte:2024-01-01 -> (created_at, gte, 2024-01-01)
        name__like:john -> (name, like, john)

    Raises:
        ValueError: If too many filters or invalid null operator value
    """
    if not filter_str:
        return []

    # Limit filter string length to prevent DoS
    if len(filter_str) > 2000:
        raise ValueError("Filter string too long")

    filters = []
    for part in filter_str.split(","):
        part = part.strip()
        if not part or ":" not in part:
            continue

        # Enforce max filter count
        if len(filters) >= MAX_FILTERS:
            raise ValueError(f"Too many filters (max {MAX_FILTERS})")

        key, value = part.split(":", 1)

        # Check for operator suffix
        if "__" in key:
            col, op = key.rsplit("__", 1)
            op = op.lower()
        else:
            col, op = key, "eq"

        if op not in ("eq", "ne", "gt", "gte", "lt", "lte", "like", "null"):
            op = "eq"

        # Validate null operator value
        if op == "null" and value.lower() not in ("true", "false", "1", "0", "yes", "no"):
            raise ValueError(f"Invalid null operator value: {value}")

        filters.append((col, op, value))

    return filters


def get_column_types(table_name: str) -> dict[str, str]:
    """Get a mapping of column names to their types."""
    inspector = inspect(engine)
    return {
        col['name']: get_sqlalchemy_type_name(col['type'])
        for col in inspector.get_columns(table_name)
    }


def coerce_filter_value(value: str, col_type: str):
    """
    Coerce filter value to appropriate Python type based on column type.
    Returns the coerced value or the original string if coercion fails.
    """
    try:
        if col_type == "integer":
            return int(value)
        elif col_type == "decimal":
            return float(value)
        elif col_type == "boolean":
            return value.lower() in ("true", "1", "yes")
    except (ValueError, TypeError):
        pass
    return value


def build_filter_clause(
    filters: list[tuple[str, str, str]],
    valid_columns: set[str],
    column_types: dict[str, str],
    params: dict,
    param_prefix: str = "filter"
) -> str:
    """Build SQL WHERE clause from filters with proper type coercion."""
    conditions = []

    for i, (col, op, value) in enumerate(filters):
        # Validate column name exists
        if col not in valid_columns:
            continue

        param_name = f"{param_prefix}_{i}"
        col_type = column_types.get(col, "string")

        if op == "eq":
            conditions.append(f"`{col}` = :{param_name}")
            params[param_name] = coerce_filter_value(value, col_type)
        elif op == "ne":
            conditions.append(f"`{col}` != :{param_name}")
            params[param_name] = coerce_filter_value(value, col_type)
        elif op == "gt":
            conditions.append(f"`{col}` > :{param_name}")
            params[param_name] = coerce_filter_value(value, col_type)
        elif op == "gte":
            conditions.append(f"`{col}` >= :{param_name}")
            params[param_name] = coerce_filter_value(value, col_type)
        elif op == "lt":
            conditions.append(f"`{col}` < :{param_name}")
            params[param_name] = coerce_filter_value(value, col_type)
        elif op == "lte":
            conditions.append(f"`{col}` <= :{param_name}")
            params[param_name] = coerce_filter_value(value, col_type)
        elif op == "like":
            conditions.append(f"`{col}` LIKE :{param_name}")
            params[param_name] = f"%{escape_like_pattern(value)}%"
        elif op == "null":
            if value.lower() in ("true", "1", "yes"):
                conditions.append(f"`{col}` IS NULL")
            else:
                conditions.append(f"`{col}` IS NOT NULL")

    return " AND ".join(conditions) if conditions else ""


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/tables", response_model=list[TableInfo])
async def list_tables(
    include_counts: bool = Query(True, description="Include row counts (slower)"),
    admin: Tutor = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """
    List all tables available for debug access.
    Returns table names, display names, row counts (optional), and priorities.
    """
    tables = []

    for table_name in get_allowed_tables():
        config = get_table_config(table_name)
        if not config:
            continue

        row_count = None
        if include_counts:
            try:
                result = db.execute(text(f"SELECT COUNT(*) FROM `{table_name}`"))
                row_count = result.scalar() or 0
            except SQLAlchemyError as e:
                # Leave as None to indicate count failed (frontend shows "?")
                logger.warning(f"Failed to count rows in {table_name}: {e}")

        tables.append(TableInfo(
            name=table_name,
            display_name=config["display_name"],
            row_count=row_count,
            priority=config["priority"],
            allow_hard_delete=config["allow_hard_delete"],
        ))

    tables.sort(key=lambda t: t.priority)
    return tables


@router.get("/tables/{table_name}/schema", response_model=TableSchema)
async def get_table_schema(
    table_name: str,
    admin: Tutor = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """
    Get schema information for a table.
    Returns column names, types, and constraints.
    """
    if not is_table_allowed(table_name):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Table `{table_name}` is not accessible",
        )

    config = get_table_config(table_name)
    inspector = inspect(engine)

    try:
        columns_info = inspector.get_columns(table_name)
        pk_constraint = inspector.get_pk_constraint(table_name)
        fk_constraints = inspector.get_foreign_keys(table_name)
    except SQLAlchemyError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Table `{table_name}` not found",
        )

    pk_columns = pk_constraint.get('constrained_columns', []) if pk_constraint else []
    readonly_cols = config.get("readonly_columns", [])

    # Detect soft delete capability (has deleted_at column)
    column_names = {col['name'] for col in columns_info}
    has_soft_delete = 'deleted_at' in column_names

    # Build foreign key mapping (only single-column FKs)
    foreign_keys = {}
    for fk in fk_constraints:
        if len(fk.get('constrained_columns', [])) == 1:
            col_name = fk['constrained_columns'][0]
            # Only include FK if the referred table is also accessible
            referred_table = fk.get('referred_table')
            if referred_table and is_table_allowed(referred_table):
                foreign_keys[col_name] = ForeignKeyInfo(
                    table=referred_table,
                    column=fk['referred_columns'][0] if fk.get('referred_columns') else 'id'
                )

    columns = []
    for col in columns_info:
        columns.append(ColumnInfo(
            name=col['name'],
            type=get_sqlalchemy_type_name(col['type']),
            nullable=col.get('nullable', True),
            readonly=col['name'] in readonly_cols or col['name'] in pk_columns,
            primary_key=col['name'] in pk_columns,
            default=str(col.get('default')) if col.get('default') is not None else None,
        ))

    return TableSchema(
        table_name=table_name,
        display_name=config["display_name"],
        columns=columns,
        primary_key=config["primary_key"],
        search_columns=config.get("search_columns", []),
        allow_hard_delete=config.get("allow_hard_delete", False),
        has_soft_delete=has_soft_delete,
        foreign_keys=foreign_keys,
    )


@router.get("/tables/{table_name}/rows", response_model=PaginatedRows)
async def list_rows(
    table_name: str,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    sort_by: Optional[str] = None,
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    search: Optional[str] = None,
    search_all: bool = Query(False, description="Search all text columns instead of configured ones"),
    include_deleted: bool = Query(False, description="Include soft-deleted rows (where deleted_at IS NOT NULL)"),
    filter: Optional[str] = Query(None, description="Filters: col:val,col__op:val"),
    admin: Tutor = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """
    List rows from a table with pagination, sorting, search, and filtering.

    Filter format: column:value,column__operator:value
    Operators: eq, ne, gt, gte, lt, lte, like, null
    Example: ?filter=status:active,created_at__gte:2024-01-01
    """
    if not is_table_allowed(table_name):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Table `{table_name}` is not accessible",
        )

    config = get_table_config(table_name)
    valid_columns = get_valid_columns(table_name)
    column_types = get_column_types(table_name)

    # Build query
    query = f"SELECT * FROM `{table_name}`"
    count_query = f"SELECT COUNT(*) FROM `{table_name}`"
    params = {}
    where_conditions = []

    # Soft delete filtering: exclude deleted rows by default
    if not include_deleted and 'deleted_at' in valid_columns:
        where_conditions.append("`deleted_at` IS NULL")

    # Search filter (text search across columns)
    if search:
        # Determine which columns to search
        if search_all:
            # Search all text columns (VARCHAR, TEXT, CHAR)
            inspector = inspect(engine)
            search_cols = [
                c['name'] for c in inspector.get_columns(table_name)
                if any(t in str(c['type']).upper() for t in ('VARCHAR', 'TEXT', 'CHAR'))
            ]
        else:
            # Search only configured columns
            search_cols = config.get("search_columns", [])

        if search_cols:
            search_conditions = []
            escaped_search = escape_like_pattern(search)
            for i, col in enumerate(search_cols):
                if col in valid_columns:
                    search_conditions.append(f"`{col}` LIKE :search_{i}")
                    params[f"search_{i}"] = f"%{escaped_search}%"
            if search_conditions:
                where_conditions.append(f"({' OR '.join(search_conditions)})")

    # Advanced filters
    if filter:
        try:
            filters = parse_filter_string(filter)
            filter_clause = build_filter_clause(filters, valid_columns, column_types, params)
            if filter_clause:
                where_conditions.append(f"({filter_clause})")
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )

    # Add WHERE clause
    if where_conditions:
        where_sql = " AND ".join(where_conditions)
        query += f" WHERE {where_sql}"
        count_query += f" WHERE {where_sql}"

    # Sorting (validate column exists)
    if sort_by and sort_by in valid_columns:
        order = "DESC" if sort_order == "desc" else "ASC"
        query += f" ORDER BY `{sort_by}` {order}"
    else:
        default_sort = config.get("default_sort", ("id", "desc"))
        order = "DESC" if default_sort[1] == "desc" else "ASC"
        query += f" ORDER BY `{default_sort[0]}` {order}"

    # Pagination
    query += f" LIMIT :limit OFFSET :offset"
    params["limit"] = limit
    params["offset"] = offset

    # Execute queries
    try:
        result = db.execute(text(query), params)
        rows = [serialize_row(dict(row._mapping)) for row in result]

        # Count query uses only filter params (not limit/offset)
        count_params = {k: v for k, v in params.items() if k not in ("limit", "offset")}
        count_result = db.execute(text(count_query), count_params)
        total = count_result.scalar() or 0

        # Get active/deleted counts for soft-delete tables
        active_count = None
        deleted_count = None
        if 'deleted_at' in valid_columns:
            active_result = db.execute(
                text(f"SELECT COUNT(*) FROM `{table_name}` WHERE `deleted_at` IS NULL")
            )
            active_count = active_result.scalar() or 0
            deleted_result = db.execute(
                text(f"SELECT COUNT(*) FROM `{table_name}` WHERE `deleted_at` IS NOT NULL")
            )
            deleted_count = deleted_result.scalar() or 0
    except SQLAlchemyError as e:
        logger.error(f"Query failed for table {table_name}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch table data. Check server logs for details.",
        )

    return PaginatedRows(
        rows=rows,
        total=total,
        limit=limit,
        offset=offset,
        active_count=active_count,
        deleted_count=deleted_count,
    )


@router.get("/tables/{table_name}/rows/{row_id}")
async def get_row(
    table_name: str,
    row_id: int,
    admin: Tutor = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Get a single row by ID."""
    if not is_table_allowed(table_name):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Table `{table_name}` is not accessible",
        )

    config = get_table_config(table_name)
    pk_col = config["primary_key"]

    row = fetch_row_by_id(db, table_name, pk_col, row_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Row with {pk_col}={row_id} not found",
        )

    return row


@router.post("/tables/{table_name}/rows")
async def create_row(
    table_name: str,
    data: dict,
    request: Request,
    admin: Tutor = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Create a new row in a table."""
    if not is_table_allowed(table_name):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Table `{table_name}` is not accessible",
        )

    # Validate request body size
    try:
        RowDataRequest.validate_data_size(data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    config = get_table_config(table_name)
    readonly_cols = config.get("readonly_columns", [])
    pk_col = config["primary_key"]

    # Validate column names against schema (security fix)
    filtered_data = validate_column_names(data, table_name, readonly_cols)

    if not filtered_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid data to insert. Check column names.",
        )

    # Build INSERT query
    columns = ", ".join(f"`{k}`" for k in filtered_data.keys())
    placeholders = ", ".join(f":{k}" for k in filtered_data.keys())
    query = f"INSERT INTO `{table_name}` ({columns}) VALUES ({placeholders})"

    try:
        result = db.execute(text(query), filtered_data)
        new_id = result.lastrowid

        # Fetch the created row
        new_row = fetch_row_by_id(db, table_name, pk_col, new_id)

        # Log operation (within same transaction)
        log_operation(db, admin, "CREATE", table_name, new_id, None, new_row, request)

        # Single commit for both operation and log
        db.commit()
    except (SQLAlchemyError, IntegrityError) as e:
        db.rollback()
        logger.error(f"Insert failed for table {table_name}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=parse_db_error(e),
        )

    return new_row


@router.put("/tables/{table_name}/rows/{row_id}")
async def update_row(
    table_name: str,
    row_id: int,
    data: dict,
    request: Request,
    admin: Tutor = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Update a row in a table."""
    if not is_table_allowed(table_name):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Table `{table_name}` is not accessible",
        )

    # Validate request body size
    try:
        RowDataRequest.validate_data_size(data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    config = get_table_config(table_name)
    pk_col = config["primary_key"]
    readonly_cols = config.get("readonly_columns", [])

    # Get current row (before state)
    before_state = fetch_row_by_id(db, table_name, pk_col, row_id)
    if not before_state:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Row with {pk_col}={row_id} not found",
        )

    # Validate column names against schema (security fix)
    # Also exclude primary key from updates
    filtered_data = validate_column_names(data, table_name, readonly_cols + [pk_col])

    if not filtered_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid data to update. Check column names.",
        )

    # Build UPDATE query
    set_clause = ", ".join(f"`{k}` = :{k}" for k in filtered_data.keys())
    query = f"UPDATE `{table_name}` SET {set_clause} WHERE `{pk_col}` = :pk_value"
    filtered_data["pk_value"] = row_id

    try:
        db.execute(text(query), filtered_data)

        # Fetch updated row
        updated_row = fetch_row_by_id(db, table_name, pk_col, row_id)

        # Log operation (within same transaction)
        log_operation(db, admin, "UPDATE", table_name, row_id, before_state, updated_row, request)

        # Single commit for both operation and log
        db.commit()
    except (SQLAlchemyError, IntegrityError) as e:
        db.rollback()
        logger.error(f"Update failed for table {table_name}, row {row_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=parse_db_error(e),
        )

    return updated_row


@router.delete("/tables/{table_name}/rows/{row_id}")
async def delete_row(
    table_name: str,
    row_id: int,
    request: Request,
    confirm: str = Query(..., description="Type 'DELETE' to confirm"),
    hard: bool = Query(False, description="Force hard delete even if soft delete is available"),
    admin: Tutor = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """
    Delete a row from a table.
    Requires confirmation by passing confirm='DELETE'.
    Uses soft delete (sets deleted_at) if table has deleted_at column.
    Pass hard=true to force hard delete.
    """
    if confirm != "DELETE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Confirmation required. Pass confirm='DELETE' to proceed.",
        )

    if not is_table_allowed(table_name):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Table `{table_name}` is not accessible",
        )

    config = get_table_config(table_name)
    pk_col = config["primary_key"]

    # Check if table has soft delete capability
    valid_columns = get_valid_columns(table_name)
    has_soft_delete = 'deleted_at' in valid_columns

    # Determine delete strategy
    use_soft_delete = has_soft_delete and not hard

    # For hard delete, check if allowed
    if not use_soft_delete and not config.get("allow_hard_delete", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Hard delete is not allowed for table `{table_name}`",
        )

    # Get row before deletion
    before_state = fetch_row_by_id(db, table_name, pk_col, row_id)
    if not before_state:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Row with {pk_col}={row_id} not found",
        )

    try:
        if use_soft_delete:
            # Soft delete: set deleted_at timestamp
            db.execute(
                text(f"UPDATE `{table_name}` SET `deleted_at` = NOW() WHERE `{pk_col}` = :id"),
                {"id": row_id}
            )
            # Fetch updated row for logging
            after_state = fetch_row_by_id(db, table_name, pk_col, row_id)
            log_operation(db, admin, "DELETE", table_name, row_id, before_state, after_state, request)
        else:
            # Hard delete
            db.execute(
                text(f"DELETE FROM `{table_name}` WHERE `{pk_col}` = :id"),
                {"id": row_id}
            )
            log_operation(db, admin, "DELETE", table_name, row_id, before_state, None, request)

        # Single commit for both operation and log
        db.commit()
    except (SQLAlchemyError, IntegrityError) as e:
        db.rollback()
        logger.error(f"Delete failed for table {table_name}, row {row_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=parse_db_error(e),
        )

    return {"message": f"Row {row_id} deleted from {table_name}"}


@router.delete("/tables/{table_name}/bulk-delete")
async def bulk_delete_rows(
    table_name: str,
    body: BulkDeleteRequest,
    request: Request,
    confirm: str = Query(..., description="Type 'DELETE' to confirm"),
    admin: Tutor = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """
    Bulk delete multiple rows from a table.
    Requires confirmation by passing confirm='DELETE'.
    """
    # Rate limit bulk deletes
    check_user_rate_limit(admin.id, "debug_bulk_delete")

    if confirm != "DELETE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Confirmation required. Pass confirm='DELETE' to proceed.",
        )

    if not is_table_allowed(table_name):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Table `{table_name}` is not accessible",
        )

    config = get_table_config(table_name)
    pk_col = config["primary_key"]

    # Check if table has soft delete capability
    valid_columns = get_valid_columns(table_name)
    has_soft_delete = 'deleted_at' in valid_columns

    # Determine delete strategy (same logic as single delete)
    use_soft_delete = has_soft_delete

    # For hard delete, check if allowed
    if not use_soft_delete and not config.get("allow_hard_delete", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Delete is not allowed for table `{table_name}`",
        )

    if not body.ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No IDs provided for deletion",
        )

    if len(body.ids) > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete more than 100 rows at once",
        )

    # Fetch all rows in a single query (N+1 fix)
    existing_rows = fetch_rows_by_ids(db, table_name, pk_col, body.ids)

    # Find which IDs don't exist
    not_found_ids = [rid for rid in body.ids if rid not in existing_rows]
    if not_found_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Rows not found: {not_found_ids}",
        )

    # Build list of rows to delete with their before state
    rows_to_delete = [(rid, existing_rows[rid]) for rid in body.ids]

    # All-or-nothing deletion with rollback on any failure
    try:
        for row_id, before_state in rows_to_delete:
            if use_soft_delete:
                # Soft delete: set deleted_at timestamp
                db.execute(
                    text(f"UPDATE `{table_name}` SET `deleted_at` = NOW() WHERE `{pk_col}` = :id"),
                    {"id": row_id}
                )
                after_state = fetch_row_by_id(db, table_name, pk_col, row_id)
                log_operation(db, admin, "DELETE", table_name, row_id, before_state, after_state, request)
            else:
                # Hard delete
                db.execute(
                    text(f"DELETE FROM `{table_name}` WHERE `{pk_col}` = :id"),
                    {"id": row_id}
                )
                log_operation(db, admin, "DELETE", table_name, row_id, before_state, None, request)

        # Commit all deletions together
        db.commit()
    except (SQLAlchemyError, IntegrityError) as e:
        db.rollback()
        logger.error(f"Bulk delete failed for table {table_name}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Bulk delete failed, all changes rolled back: {parse_db_error(e)}",
        )

    return BulkDeleteResponse(
        deleted_count=len(rows_to_delete),
        failed_ids=[],
        message=f"Deleted {len(rows_to_delete)} rows",
    )


@router.patch("/tables/{table_name}/bulk-update", response_model=BulkUpdateResponse)
async def bulk_update_rows(
    table_name: str,
    body: BulkUpdateRequest,
    request: Request,
    admin: Tutor = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """
    Bulk update a single column for multiple rows.
    All-or-nothing transaction with rollback on failure.
    """
    # Rate limit bulk updates
    check_user_rate_limit(admin.id, "debug_bulk_update")

    if not is_table_allowed(table_name):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Table `{table_name}` is not accessible",
        )

    config = get_table_config(table_name)
    pk_col = config["primary_key"]
    readonly_cols = config.get("readonly_columns", [])
    valid_columns = get_valid_columns(table_name)

    # Validate column
    if body.column not in valid_columns:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Column `{body.column}` does not exist",
        )

    if body.column == pk_col:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot bulk update primary key column",
        )

    if body.column in readonly_cols:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Column `{body.column}` is read-only",
        )

    if not body.ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No IDs provided for update",
        )

    if len(body.ids) > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot update more than 100 rows at once",
        )

    # Fetch all rows in a single query (N+1 fix)
    existing_rows = fetch_rows_by_ids(db, table_name, pk_col, body.ids)

    # Find which IDs don't exist
    not_found_ids = [rid for rid in body.ids if rid not in existing_rows]
    if not_found_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Rows not found: {not_found_ids}",
        )

    # Build list of rows to update with their before state
    rows_to_update = [(rid, existing_rows[rid]) for rid in body.ids]

    # All-or-nothing update with rollback on any failure
    try:
        for row_id, before_state in rows_to_update:
            db.execute(
                text(f"UPDATE `{table_name}` SET `{body.column}` = :value WHERE `{pk_col}` = :id"),
                {"value": body.value, "id": row_id}
            )
            # Fetch updated state and log
            after_state = fetch_row_by_id(db, table_name, pk_col, row_id)
            log_operation(db, admin, "UPDATE", table_name, row_id, before_state, after_state, request)

        # Commit all updates together
        db.commit()
    except (SQLAlchemyError, IntegrityError) as e:
        db.rollback()
        logger.error(f"Bulk update failed for table {table_name}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Bulk update failed, all changes rolled back: {parse_db_error(e)}",
        )

    return BulkUpdateResponse(
        updated_count=len(rows_to_update),
        message=f"Updated {len(rows_to_update)} rows",
    )


@router.get("/tables/{table_name}/export")
async def export_table(
    table_name: str,
    format: str = Query("csv", pattern="^(csv|json)$"),
    limit: int = Query(10000, ge=1, le=100000),
    filter: Optional[str] = Query(None, description="Filters: col:val,col__op:val"),
    include_deleted: bool = Query(False, description="Include soft-deleted rows"),
    admin: Tutor = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """
    Export table data as CSV or JSON.
    Maximum 100,000 rows per export.
    """
    # Rate limit exports (5 per 5 minutes)
    check_user_rate_limit(admin.id, "debug_export")

    if not is_table_allowed(table_name):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Table `{table_name}` is not accessible",
        )

    config = get_table_config(table_name)
    valid_columns = get_valid_columns(table_name)
    column_types = get_column_types(table_name)

    # Build query
    query = f"SELECT * FROM `{table_name}`"
    params = {}
    where_conditions = []

    # Exclude soft-deleted rows by default (unless include_deleted is True)
    if not include_deleted and 'deleted_at' in valid_columns:
        where_conditions.append("`deleted_at` IS NULL")

    # Advanced filters
    if filter:
        try:
            filters = parse_filter_string(filter)
            filter_clause = build_filter_clause(filters, valid_columns, column_types, params)
            if filter_clause:
                where_conditions.append(f"({filter_clause})")
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )

    # Add WHERE clause if any conditions
    if where_conditions:
        query += f" WHERE {' AND '.join(where_conditions)}"

    # Default sort and limit
    default_sort = config.get("default_sort", ("id", "desc"))
    order = "DESC" if default_sort[1] == "desc" else "ASC"
    query += f" ORDER BY `{default_sort[0]}` {order} LIMIT :limit"
    params["limit"] = limit

    try:
        result = db.execute(text(query), params)
        rows = [serialize_row(dict(row._mapping)) for row in result]
    except SQLAlchemyError as e:
        logger.error(f"Export query failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Export query failed",
        )

    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No data to export",
        )

    if format == "json":
        content = json.dumps(rows, indent=2, default=str)
        return StreamingResponse(
            io.StringIO(content),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename={table_name}.json"},
        )
    else:
        # CSV format - use generator for streaming
        def generate_csv():
            columns = list(rows[0].keys())
            output = io.StringIO()
            writer = csv.DictWriter(output, fieldnames=columns)

            # Write header
            writer.writeheader()
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

            # Write rows in chunks
            for row in rows:
                writer.writerow(row)
                yield output.getvalue()
                output.seek(0)
                output.truncate(0)

        return StreamingResponse(
            generate_csv(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={table_name}.csv"},
        )


@router.get("/audit-logs", response_model=PaginatedAuditLogs)
async def get_audit_logs(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    table_name: Optional[str] = None,
    operation: Optional[str] = None,
    admin_email: Optional[str] = None,
    admin: Tutor = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """
    View debug panel audit logs.
    Filter by table name, operation type, or admin email.
    """
    query = db.query(DebugAuditLog)

    if table_name:
        query = query.filter(DebugAuditLog.table_name == table_name)
    if operation:
        query = query.filter(DebugAuditLog.operation == operation)
    if admin_email:
        query = query.filter(DebugAuditLog.admin_email.contains(admin_email))

    total = query.count()
    logs = query.order_by(desc(DebugAuditLog.created_at)).offset(offset).limit(limit).all()

    return PaginatedAuditLogs(
        logs=[
            AuditLogEntry(
                id=log.id,
                admin_email=log.admin_email,
                operation=log.operation,
                table_name=log.table_name,
                row_id=log.row_id,
                before_state=json.loads(log.before_state) if log.before_state else None,
                after_state=json.loads(log.after_state) if log.after_state else None,
                changed_fields=json.loads(log.changed_fields) if log.changed_fields else None,
                ip_address=log.ip_address,
                created_at=log.created_at,
            )
            for log in logs
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


# ============================================================================
# SQL Query Executor (Read-Only)
# ============================================================================

class SqlQueryRequest(BaseModel):
    """Request body for SQL query execution."""
    model_config = ConfigDict(str_max_length=10000)
    query: str


class SqlQueryResponse(BaseModel):
    """Response for SQL query execution."""
    columns: list[str]
    rows: list[dict]
    row_count: int
    execution_time_ms: float


# Disallowed SQL keywords for safety
DISALLOWED_SQL_KEYWORDS = {
    "INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER", "TRUNCATE",
    "GRANT", "REVOKE", "EXECUTE", "CALL", "SET", "LOAD", "INTO OUTFILE",
    "INTO DUMPFILE", "REPLACE", "MERGE", "UPSERT", "RENAME", "LOCK",
    "UNLOCK", "FLUSH", "RESET", "PURGE", "HANDLER", "DO", "PREPARE",
    "DEALLOCATE", "XA", "SAVEPOINT", "ROLLBACK", "COMMIT", "START",
}


def strip_sql_comments(query: str) -> str:
    """
    Remove SQL comments from a query to prevent bypass attacks.
    Handles both -- line comments and /* */ block comments.
    """
    result = []
    i = 0
    in_string = False
    string_char = None

    while i < len(query):
        # Track string literals to avoid stripping comments inside strings
        if not in_string and query[i] in ("'", '"'):
            in_string = True
            string_char = query[i]
            result.append(query[i])
            i += 1
        elif in_string and query[i] == string_char:
            # Check for escaped quote
            if i + 1 < len(query) and query[i + 1] == string_char:
                result.append(query[i:i+2])
                i += 2
            else:
                in_string = False
                string_char = None
                result.append(query[i])
                i += 1
        elif not in_string and query[i:i+2] == '--':
            # Skip until end of line
            while i < len(query) and query[i] != '\n':
                i += 1
            result.append(' ')  # Replace with space to preserve word boundaries
        elif not in_string and query[i:i+2] == '/*':
            # Skip until end of block comment
            i += 2
            while i < len(query) - 1 and query[i:i+2] != '*/':
                i += 1
            i += 2  # Skip the closing */
            result.append(' ')  # Replace with space
        else:
            result.append(query[i])
            i += 1

    return ''.join(result)


def is_safe_query(query: str) -> tuple[bool, str]:
    """
    Check if a SQL query is safe to execute (read-only).
    Returns (is_safe, error_message).
    """
    # First, strip all comments to prevent bypass attacks
    clean_query = strip_sql_comments(query)

    # Normalize query for checking
    normalized = clean_query.upper().strip()

    # Remove extra whitespace
    normalized = ' '.join(normalized.split())

    # Must start with SELECT or WITH (for CTEs)
    if not (normalized.startswith("SELECT") or normalized.startswith("WITH")):
        return False, "Only SELECT queries are allowed"

    # Check for disallowed keywords (with word boundaries)
    for keyword in DISALLOWED_SQL_KEYWORDS:
        # Look for keyword as a standalone word
        pattern = rf'\b{keyword}\b'
        if re.search(pattern, normalized):
            return False, f"Query contains disallowed keyword: {keyword}"

    # Check for semicolons (could be used for query stacking)
    # Strip trailing semicolons first, then check for any remaining
    stripped = clean_query.strip().rstrip(";").strip()
    if ";" in stripped:
        return False, "Only single statements are allowed"

    # Check for suspicious patterns that might indicate injection
    suspicious_patterns = [
        r';\s*--',           # Semicolon followed by comment
        r'UNION\s+ALL\s+SELECT.*INTO',  # UNION SELECT INTO
        r'INTO\s+@',         # Variable assignment
        r'BENCHMARK\s*\(',   # Timing attacks
        r'SLEEP\s*\(',       # Timing attacks
        r'@@\w+',            # System variables access
    ]
    for pattern in suspicious_patterns:
        if re.search(pattern, normalized, re.IGNORECASE):
            return False, "Query contains suspicious pattern"

    return True, ""


@router.post("/sql/execute", response_model=SqlQueryResponse)
async def execute_sql_query(
    body: SqlQueryRequest,
    request: Request,
    admin: Tutor = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """
    Execute a read-only SQL query.

    Only SELECT queries are allowed. Queries are limited to 1000 rows.
    This endpoint is for debugging purposes only.

    SECURITY: Disabled by default in production. Set ENABLE_RAW_SQL_EXECUTION=true to enable.
    """
    import time

    # Security check: Disable in production unless explicitly enabled
    if _ENVIRONMENT == "production" and not ENABLE_RAW_SQL_EXECUTION:
        logger.warning(
            f"SQL execution blocked in production. Admin: {admin.user_email}, "
            f"Query (first 100 chars): {body.query[:100]}"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Raw SQL execution is disabled in production for security. "
                   "Contact system administrator if this feature is required.",
        )

    # Rate limit SQL execution
    check_user_rate_limit(admin.id, "debug_sql_execute")

    # Security audit log - always log SQL execution attempts
    logger.warning(
        f"SQL_EXECUTION_AUDIT: Admin={admin.user_email} ({admin.id}), "
        f"Query length={len(body.query)}, First 200 chars: {body.query[:200]}"
    )

    query = body.query.strip()

    if not query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query is empty",
        )

    # Validate query safety
    is_safe, error = is_safe_query(query)
    if not is_safe:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error,
        )

    # Add LIMIT if not present
    if "LIMIT" not in query.upper():
        query = f"{query.rstrip(';')} LIMIT 1000"

    try:
        # Set query timeout to prevent long-running queries
        db.execute(text(f"SET SESSION max_execution_time = {SQL_QUERY_TIMEOUT_SECONDS * 1000}"))

        start_time = time.perf_counter()
        result = db.execute(text(query))
        execution_time = (time.perf_counter() - start_time) * 1000

        # Get column names
        columns = list(result.keys()) if result.keys() else []

        # Fetch and serialize rows
        rows = []
        for row in result:
            row_dict = dict(row._mapping)
            rows.append(serialize_row(row_dict))

        # Log the query execution
        log_operation(
            db, admin, "SQL_QUERY", "debug_sql",
            None,
            None,
            {"query": body.query, "row_count": len(rows)},
            request
        )
        db.commit()

        return SqlQueryResponse(
            columns=columns,
            rows=rows,
            row_count=len(rows),
            execution_time_ms=round(execution_time, 2),
        )

    except SQLAlchemyError as e:
        db.rollback()
        error_str = str(e)

        # Sanitize error messages to avoid leaking database structure
        # Map MySQL error codes to generic messages
        error_map = {
            "1064": "SQL syntax error in query",
            "1146": "Referenced table does not exist",
            "1054": "Referenced column does not exist",
            "1045": "Database access denied",
            "1142": "Insufficient privileges for this operation",
            "1044": "Access denied to database",
            "1049": "Unknown database",
            "1317": "Query execution was interrupted (timeout)",
            "3024": "Query execution was interrupted (timeout)",
            "2013": "Connection lost during query",
            "1205": "Query timeout - lock wait exceeded",
        }

        # Find matching error code
        error_msg = "Query execution failed"
        for code, msg in error_map.items():
            if code in error_str:
                error_msg = msg
                break

        # Log the actual error for debugging (server-side only)
        logger.warning(f"SQL query error for admin {admin.user_email}: {error_str[:200]}")

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg,
        )


# ============================================================================
# Audit Log Revert
# ============================================================================

class RevertResponse(BaseModel):
    """Response for revert operation."""
    success: bool
    message: str
    row_id: Optional[int]


@router.post("/audit-logs/{log_id}/revert", response_model=RevertResponse)
async def revert_audit_log(
    log_id: int,
    request: Request,
    admin: Tutor = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """
    Revert a change from the audit log.
    For UPDATE operations: restores the before_state.
    For DELETE operations: recreates the row with before_state.
    For CREATE operations: deletes the created row.
    """
    # Fetch the audit log entry
    log_entry = db.query(DebugAuditLog).filter(DebugAuditLog.id == log_id).first()
    if not log_entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Audit log entry #{log_id} not found",
        )

    table_name = log_entry.table_name
    operation = log_entry.operation

    # Check if table is still accessible
    if not is_table_allowed(table_name):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Table `{table_name}` is not accessible for revert",
        )

    config = get_table_config(table_name)
    pk_col = config["primary_key"]

    before_state = json.loads(log_entry.before_state) if log_entry.before_state else None
    after_state = json.loads(log_entry.after_state) if log_entry.after_state else None
    row_id = log_entry.row_id

    try:
        if operation == "UPDATE":
            # Restore the before_state
            if not before_state:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot revert UPDATE: no before_state available",
                )
            if not row_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot revert UPDATE: no row_id available",
                )

            # Check if row still exists
            current_state = fetch_row_by_id(db, table_name, pk_col, row_id)
            if not current_state:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Row #{row_id} no longer exists in {table_name}",
                )

            # Update row to before_state
            update_data = {k: v for k, v in before_state.items() if k != pk_col}
            set_clauses = [f"`{k}` = :{k}" for k in update_data.keys()]
            query = f"UPDATE `{table_name}` SET {', '.join(set_clauses)} WHERE `{pk_col}` = :pk_value"
            update_data["pk_value"] = row_id
            db.execute(text(query), update_data)

            # Log the revert operation
            final_state = fetch_row_by_id(db, table_name, pk_col, row_id)
            log_operation(db, admin, "UPDATE", table_name, row_id, current_state, final_state, request)
            db.commit()

            return RevertResponse(
                success=True,
                message=f"Reverted UPDATE on {table_name} #{row_id}",
                row_id=row_id,
            )

        elif operation == "DELETE":
            # Recreate the deleted row
            if not before_state:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot revert DELETE: no before_state available",
                )

            # Check if row was truly deleted (not soft delete)
            if row_id:
                existing = fetch_row_by_id(db, table_name, pk_col, row_id)
                if existing:
                    # Row exists - might be soft deleted, try to restore it
                    if 'deleted_at' in existing and existing['deleted_at'] is not None:
                        db.execute(
                            text(f"UPDATE `{table_name}` SET `deleted_at` = NULL WHERE `{pk_col}` = :id"),
                            {"id": row_id}
                        )
                        final_state = fetch_row_by_id(db, table_name, pk_col, row_id)
                        log_operation(db, admin, "UPDATE", table_name, row_id, existing, final_state, request)
                        db.commit()
                        return RevertResponse(
                            success=True,
                            message=f"Restored soft-deleted row {table_name} #{row_id}",
                            row_id=row_id,
                        )
                    else:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Row #{row_id} already exists in {table_name}",
                        )

            # Hard delete revert - recreate the row
            columns = list(before_state.keys())
            col_str = ", ".join(f"`{c}`" for c in columns)
            val_str = ", ".join(f":{c}" for c in columns)
            query = f"INSERT INTO `{table_name}` ({col_str}) VALUES ({val_str})"
            db.execute(text(query), before_state)

            new_row_id = before_state.get(pk_col, row_id)
            log_operation(db, admin, "CREATE", table_name, new_row_id, None, before_state, request)
            db.commit()

            return RevertResponse(
                success=True,
                message=f"Recreated deleted row in {table_name}",
                row_id=new_row_id,
            )

        elif operation == "CREATE":
            # Delete the created row
            if not row_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot revert CREATE: no row_id available",
                )

            current_state = fetch_row_by_id(db, table_name, pk_col, row_id)
            if not current_state:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Row #{row_id} no longer exists in {table_name}",
                )

            # Check if table has soft delete
            has_soft_delete = 'deleted_at' in get_valid_columns(table_name)
            if has_soft_delete:
                db.execute(
                    text(f"UPDATE `{table_name}` SET `deleted_at` = NOW() WHERE `{pk_col}` = :id"),
                    {"id": row_id}
                )
                final_state = fetch_row_by_id(db, table_name, pk_col, row_id)
                log_operation(db, admin, "DELETE", table_name, row_id, current_state, final_state, request)
            else:
                if not config.get("allow_hard_delete", False):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Cannot revert CREATE: hard delete not allowed for {table_name}",
                    )
                db.execute(
                    text(f"DELETE FROM `{table_name}` WHERE `{pk_col}` = :id"),
                    {"id": row_id}
                )
                log_operation(db, admin, "DELETE", table_name, row_id, current_state, None, request)

            db.commit()

            return RevertResponse(
                success=True,
                message=f"Deleted created row {table_name} #{row_id}",
                row_id=row_id,
            )

        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot revert operation type: {operation}",
            )

    except HTTPException:
        db.rollback()
        raise
    except (SQLAlchemyError, IntegrityError) as e:
        db.rollback()
        logger.error(f"Revert failed for audit log #{log_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Revert failed: {parse_db_error(e)}",
        )
