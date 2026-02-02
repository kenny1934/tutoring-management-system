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
import re
from typing import Optional, Any
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import inspect, text, desc
from sqlalchemy.orm import Session
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel

from database import get_db, engine
from models import Tutor, DebugAuditLog
from auth.dependencies import require_super_admin
from config.debug_tables import (
    DEBUG_TABLE_CONFIG,
    get_table_config,
    get_allowed_tables,
    is_table_allowed,
)


router = APIRouter(prefix="/debug", tags=["Debug Admin"])


# ============================================================================
# Constants
# ============================================================================

# Columns that should be redacted in audit logs (exact matches)
SENSITIVE_COLUMNS = {
    "password", "password_hash", "api_key", "token", "secret",
    "access_token", "refresh_token", "private_key", "credential",
    "ssn", "social_security", "credit_card", "card_number",
}

# Patterns for sensitive column detection (partial matches)
SENSITIVE_PATTERNS = {"_token", "_key", "_secret", "_password", "_credential"}

# Maximum number of filters allowed in a single query
MAX_FILTERS = 10

import logging
logger = logging.getLogger(__name__)


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
    ids: list[int]

    class Config:
        max_anystr_length = 1000


class BulkDeleteResponse(BaseModel):
    deleted_count: int
    failed_ids: list[int]
    message: str


class BulkUpdateRequest(BaseModel):
    ids: list[int]
    column: str
    value: Any

    class Config:
        max_anystr_length = 10000


class BulkUpdateResponse(BaseModel):
    updated_count: int
    message: str


class RowDataRequest(BaseModel):
    """Request body for row create/update with size limits."""
    data: dict[str, Any]

    class Config:
        # Limit string length to prevent abuse
        max_anystr_length = 10000

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
            except Exception as e:
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
    except Exception as e:
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
    except Exception as e:
        logger.error(f"Query failed for table {table_name}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Query failed: {str(e)[:200]}",
        )

    return PaginatedRows(
        rows=rows,
        total=total,
        limit=limit,
        offset=offset,
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
    except Exception as e:
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
    except Exception as e:
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
    except Exception as e:
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

    # Validate all rows exist first (before any deletions)
    rows_to_delete = []
    not_found_ids = []

    for row_id in body.ids:
        before_state = fetch_row_by_id(db, table_name, pk_col, row_id)
        if not before_state:
            not_found_ids.append(row_id)
        else:
            rows_to_delete.append((row_id, before_state))

    if not_found_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Rows not found: {not_found_ids}",
        )

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
    except Exception as e:
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

    # Validate all rows exist first
    rows_to_update = []
    not_found_ids = []

    for row_id in body.ids:
        before_state = fetch_row_by_id(db, table_name, pk_col, row_id)
        if not before_state:
            not_found_ids.append(row_id)
        else:
            rows_to_update.append((row_id, before_state))

    if not_found_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Rows not found: {not_found_ids}",
        )

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
    except Exception as e:
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
    admin: Tutor = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """
    Export table data as CSV or JSON.
    Maximum 100,000 rows per export.
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
    params = {}
    where_conditions = []

    # Exclude soft-deleted rows by default
    if 'deleted_at' in valid_columns:
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
    except Exception as e:
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
