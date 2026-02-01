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

# Columns that should be redacted in audit logs
SENSITIVE_COLUMNS = {
    "password", "password_hash", "api_key", "token", "secret",
    "access_token", "refresh_token", "private_key", "credential"
}


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


class TableSchema(BaseModel):
    table_name: str
    display_name: str
    columns: list[ColumnInfo]
    primary_key: str
    search_columns: list[str]
    allow_hard_delete: bool


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


class BulkDeleteResponse(BaseModel):
    deleted_count: int
    failed_ids: list[int]
    message: str


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


def redact_sensitive(data: Optional[dict]) -> Optional[dict]:
    """Redact sensitive columns from data before logging."""
    if not data:
        return data
    return {
        k: "[REDACTED]" if k.lower() in SENSITIVE_COLUMNS else v
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
    """
    if not filter_str:
        return []

    filters = []
    for part in filter_str.split(","):
        part = part.strip()
        if not part or ":" not in part:
            continue

        key, value = part.split(":", 1)

        # Check for operator suffix
        if "__" in key:
            col, op = key.rsplit("__", 1)
            op = op.lower()
        else:
            col, op = key, "eq"

        if op not in ("eq", "ne", "gt", "gte", "lt", "lte", "like", "null"):
            op = "eq"

        filters.append((col, op, value))

    return filters


def build_filter_clause(
    filters: list[tuple[str, str, str]],
    valid_columns: set[str],
    params: dict,
    param_prefix: str = "filter"
) -> str:
    """Build SQL WHERE clause from filters."""
    conditions = []

    for i, (col, op, value) in enumerate(filters):
        # Validate column name exists
        if col not in valid_columns:
            continue

        param_name = f"{param_prefix}_{i}"

        if op == "eq":
            conditions.append(f"`{col}` = :{param_name}")
            params[param_name] = value
        elif op == "ne":
            conditions.append(f"`{col}` != :{param_name}")
            params[param_name] = value
        elif op == "gt":
            conditions.append(f"`{col}` > :{param_name}")
            params[param_name] = value
        elif op == "gte":
            conditions.append(f"`{col}` >= :{param_name}")
            params[param_name] = value
        elif op == "lt":
            conditions.append(f"`{col}` < :{param_name}")
            params[param_name] = value
        elif op == "lte":
            conditions.append(f"`{col}` <= :{param_name}")
            params[param_name] = value
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
            except Exception:
                row_count = 0

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
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Table `{table_name}` not found",
        )

    pk_columns = pk_constraint.get('constrained_columns', []) if pk_constraint else []
    readonly_cols = config.get("readonly_columns", [])

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
    )


@router.get("/tables/{table_name}/rows", response_model=PaginatedRows)
async def list_rows(
    table_name: str,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    sort_by: Optional[str] = None,
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    search: Optional[str] = None,
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

    # Build query
    query = f"SELECT * FROM `{table_name}`"
    count_query = f"SELECT COUNT(*) FROM `{table_name}`"
    params = {}
    where_conditions = []

    # Search filter (text search across configured columns)
    if search and config.get("search_columns"):
        search_conditions = []
        escaped_search = escape_like_pattern(search)
        for i, col in enumerate(config["search_columns"]):
            if col in valid_columns:
                search_conditions.append(f"`{col}` LIKE :search_{i}")
                params[f"search_{i}"] = f"%{escaped_search}%"
        if search_conditions:
            where_conditions.append(f"({' OR '.join(search_conditions)})")

    # Advanced filters
    if filter:
        filters = parse_filter_string(filter)
        filter_clause = build_filter_clause(filters, valid_columns, params)
        if filter_clause:
            where_conditions.append(f"({filter_clause})")

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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Query failed. Please check your filter syntax.",
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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Insert failed. Check data types and constraints.",
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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Update failed. Check data types and constraints.",
        )

    return updated_row


@router.delete("/tables/{table_name}/rows/{row_id}")
async def delete_row(
    table_name: str,
    row_id: int,
    request: Request,
    confirm: str = Query(..., description="Type 'DELETE' to confirm"),
    admin: Tutor = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """
    Delete a row from a table.
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

    if not config.get("allow_hard_delete", False):
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
        db.execute(
            text(f"DELETE FROM `{table_name}` WHERE `{pk_col}` = :id"),
            {"id": row_id}
        )

        # Log operation (within same transaction)
        log_operation(db, admin, "DELETE", table_name, row_id, before_state, None, request)

        # Single commit for both operation and log
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Delete failed. The row may have dependent records.",
        )

    return {"message": f"Row {row_id} deleted from {table_name}"}


@router.delete("/tables/{table_name}/rows/bulk")
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

    if not config.get("allow_hard_delete", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Hard delete is not allowed for table `{table_name}`",
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

    deleted_count = 0
    failed_ids = []

    for row_id in body.ids:
        try:
            # Get row before deletion
            before_state = fetch_row_by_id(db, table_name, pk_col, row_id)
            if not before_state:
                failed_ids.append(row_id)
                continue

            db.execute(
                text(f"DELETE FROM `{table_name}` WHERE `{pk_col}` = :id"),
                {"id": row_id}
            )

            # Log each deletion
            log_operation(db, admin, "DELETE", table_name, row_id, before_state, None, request)
            deleted_count += 1
        except Exception:
            failed_ids.append(row_id)

    # Commit all successful deletions
    db.commit()

    return BulkDeleteResponse(
        deleted_count=deleted_count,
        failed_ids=failed_ids,
        message=f"Deleted {deleted_count} rows" + (f", {len(failed_ids)} failed" if failed_ids else ""),
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

    # Build query
    query = f"SELECT * FROM `{table_name}`"
    params = {}

    # Advanced filters
    if filter:
        filters = parse_filter_string(filter)
        filter_clause = build_filter_clause(filters, valid_columns, params)
        if filter_clause:
            query += f" WHERE {filter_clause}"

    # Default sort and limit
    default_sort = config.get("default_sort", ("id", "desc"))
    order = "DESC" if default_sort[1] == "desc" else "ASC"
    query += f" ORDER BY `{default_sort[0]}` {order} LIMIT :limit"
    params["limit"] = limit

    try:
        result = db.execute(text(query), params)
        rows = [serialize_row(dict(row._mapping)) for row in result]
    except Exception:
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
        # CSV format
        output = io.StringIO()
        columns = list(rows[0].keys())
        writer = csv.DictWriter(output, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)

        return StreamingResponse(
            io.StringIO(output.getvalue()),
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
