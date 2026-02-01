"""
Super Admin Debug Panel Router

Provides phpMyAdmin-lite functionality for Super Admins to:
- Browse database tables
- View, create, update, and delete records
- View audit logs of all debug operations

Security: All endpoints require Super Admin role.
"""

import json
from typing import Optional, Any
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import inspect, text, desc, asc
from sqlalchemy.orm import Session
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
# Pydantic Models
# ============================================================================

class TableInfo(BaseModel):
    name: str
    display_name: str
    row_count: int
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
        return value.decode('utf-8', errors='replace')
    return value


def serialize_row(row: dict) -> dict:
    """Serialize all values in a row for JSON response."""
    return {k: serialize_value(v) for k, v in row.items()}


def get_client_ip(request: Request) -> Optional[str]:
    """Extract client IP from request, handling proxies."""
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else None


def log_operation(
    db: Session,
    admin: Tutor,
    operation: str,
    table_name: str,
    row_id: Optional[int],
    before_state: Optional[dict],
    after_state: Optional[dict],
    request: Request,
) -> DebugAuditLog:
    """Log a debug operation to the audit trail."""
    changed_fields = None
    if before_state and after_state:
        changed_fields = [
            k for k in after_state.keys()
            if k in before_state and before_state.get(k) != after_state.get(k)
        ]

    log_entry = DebugAuditLog(
        admin_id=admin.id,
        admin_email=admin.user_email,
        operation=operation,
        table_name=table_name,
        row_id=row_id,
        before_state=json.dumps(before_state, default=str) if before_state else None,
        after_state=json.dumps(after_state, default=str) if after_state else None,
        changed_fields=json.dumps(changed_fields) if changed_fields else None,
        ip_address=get_client_ip(request),
    )

    db.add(log_entry)
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


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/tables", response_model=list[TableInfo])
async def list_tables(
    admin: Tutor = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """
    List all tables available for debug access.
    Returns table names, display names, row counts, and priorities.
    """
    tables = []
    inspector = inspect(engine)

    for table_name in get_allowed_tables():
        config = get_table_config(table_name)
        if not config:
            continue

        # Get row count
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

    # Sort by priority
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
            detail=f"Table '{table_name}' is not accessible",
        )

    config = get_table_config(table_name)
    inspector = inspect(engine)

    try:
        columns_info = inspector.get_columns(table_name)
        pk_constraint = inspector.get_pk_constraint(table_name)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Table '{table_name}' not found: {str(e)}",
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
    )


@router.get("/tables/{table_name}/rows", response_model=PaginatedRows)
async def list_rows(
    table_name: str,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    sort_by: Optional[str] = None,
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    search: Optional[str] = None,
    admin: Tutor = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """
    List rows from a table with pagination, sorting, and search.
    """
    if not is_table_allowed(table_name):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Table '{table_name}' is not accessible",
        )

    config = get_table_config(table_name)

    # Build query
    query = f"SELECT * FROM `{table_name}`"
    count_query = f"SELECT COUNT(*) FROM `{table_name}`"
    params = {}

    # Search filter
    if search and config.get("search_columns"):
        search_conditions = []
        for i, col in enumerate(config["search_columns"]):
            search_conditions.append(f"`{col}` LIKE :search_{i}")
            params[f"search_{i}"] = f"%{search}%"
        if search_conditions:
            where_clause = " OR ".join(search_conditions)
            query += f" WHERE ({where_clause})"
            count_query += f" WHERE ({where_clause})"

    # Sorting
    if sort_by:
        # Validate sort column exists (basic SQL injection prevention)
        inspector = inspect(engine)
        columns = [c['name'] for c in inspector.get_columns(table_name)]
        if sort_by in columns:
            order = "DESC" if sort_order == "desc" else "ASC"
            query += f" ORDER BY `{sort_by}` {order}"
    else:
        # Use default sort
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

        count_result = db.execute(text(count_query), {k: v for k, v in params.items() if k.startswith("search_")})
        total = count_result.scalar() or 0
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Query failed: {str(e)}",
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
    """
    Get a single row by ID.
    """
    if not is_table_allowed(table_name):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Table '{table_name}' is not accessible",
        )

    config = get_table_config(table_name)
    pk_col = config["primary_key"]

    try:
        result = db.execute(
            text(f"SELECT * FROM `{table_name}` WHERE `{pk_col}` = :id"),
            {"id": row_id}
        )
        row = result.fetchone()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Query failed: {str(e)}",
        )

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Row with {pk_col}={row_id} not found",
        )

    return serialize_row(dict(row._mapping))


@router.post("/tables/{table_name}/rows")
async def create_row(
    table_name: str,
    data: dict,
    request: Request,
    admin: Tutor = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """
    Create a new row in a table.
    """
    if not is_table_allowed(table_name):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Table '{table_name}' is not accessible",
        )

    config = get_table_config(table_name)
    readonly_cols = config.get("readonly_columns", [])

    # Remove readonly columns from data (except auto-increment id)
    filtered_data = {k: v for k, v in data.items() if k not in readonly_cols}

    if not filtered_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid data to insert",
        )

    # Build INSERT query
    columns = ", ".join(f"`{k}`" for k in filtered_data.keys())
    placeholders = ", ".join(f":{k}" for k in filtered_data.keys())
    query = f"INSERT INTO `{table_name}` ({columns}) VALUES ({placeholders})"

    try:
        result = db.execute(text(query), filtered_data)
        db.commit()
        new_id = result.lastrowid
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Insert failed: {str(e)}",
        )

    # Fetch the created row
    pk_col = config["primary_key"]
    result = db.execute(
        text(f"SELECT * FROM `{table_name}` WHERE `{pk_col}` = :id"),
        {"id": new_id}
    )
    new_row = serialize_row(dict(result.fetchone()._mapping))

    # Log operation
    log_operation(db, admin, "CREATE", table_name, new_id, None, new_row, request)

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
    """
    Update a row in a table.
    """
    if not is_table_allowed(table_name):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Table '{table_name}' is not accessible",
        )

    config = get_table_config(table_name)
    pk_col = config["primary_key"]
    readonly_cols = config.get("readonly_columns", [])

    # Get current row (before state)
    result = db.execute(
        text(f"SELECT * FROM `{table_name}` WHERE `{pk_col}` = :id"),
        {"id": row_id}
    )
    old_row = result.fetchone()
    if not old_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Row with {pk_col}={row_id} not found",
        )
    before_state = serialize_row(dict(old_row._mapping))

    # Filter out readonly columns
    filtered_data = {k: v for k, v in data.items() if k not in readonly_cols and k != pk_col}

    if not filtered_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid data to update",
        )

    # Build UPDATE query
    set_clause = ", ".join(f"`{k}` = :{k}" for k in filtered_data.keys())
    query = f"UPDATE `{table_name}` SET {set_clause} WHERE `{pk_col}` = :pk_value"
    filtered_data["pk_value"] = row_id

    try:
        db.execute(text(query), filtered_data)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Update failed: {str(e)}",
        )

    # Fetch updated row
    result = db.execute(
        text(f"SELECT * FROM `{table_name}` WHERE `{pk_col}` = :id"),
        {"id": row_id}
    )
    updated_row = serialize_row(dict(result.fetchone()._mapping))

    # Log operation
    log_operation(db, admin, "UPDATE", table_name, row_id, before_state, updated_row, request)

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
            detail=f"Table '{table_name}' is not accessible",
        )

    config = get_table_config(table_name)
    pk_col = config["primary_key"]

    if not config.get("allow_hard_delete", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Hard delete is not allowed for table '{table_name}'",
        )

    # Get row before deletion
    result = db.execute(
        text(f"SELECT * FROM `{table_name}` WHERE `{pk_col}` = :id"),
        {"id": row_id}
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Row with {pk_col}={row_id} not found",
        )
    before_state = serialize_row(dict(row._mapping))

    # Delete the row
    try:
        db.execute(
            text(f"DELETE FROM `{table_name}` WHERE `{pk_col}` = :id"),
            {"id": row_id}
        )
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Delete failed: {str(e)}. The row may have dependent records.",
        )

    # Log operation
    log_operation(db, admin, "DELETE", table_name, row_id, before_state, None, request)

    return {"message": f"Row {row_id} deleted from {table_name}"}


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
