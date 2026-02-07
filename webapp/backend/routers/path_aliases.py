"""
Path Aliases API endpoints.
Provides CRUD for path alias definitions (admin-controlled).
Users map these aliases to their local drive letters for consistent file path sharing.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List
from pydantic import BaseModel
from database import get_db
from models import Tutor
from auth.dependencies import require_admin_write

router = APIRouter()


class PathAliasDefinition(BaseModel):
    id: int
    alias: str
    description: str | None


class CreatePathAliasRequest(BaseModel):
    alias: str
    description: str | None = None


@router.get("/path-aliases", response_model=List[PathAliasDefinition])
async def get_path_aliases(db: Session = Depends(get_db)):
    """
    Get all path alias definitions.
    These are admin-defined aliases that users can map to their local drive letters.
    """
    query = text("""
        SELECT id, alias, description
        FROM path_alias_definitions
        ORDER BY alias
    """)

    results = db.execute(query).fetchall()

    return [
        PathAliasDefinition(
            id=row.id,
            alias=row.alias,
            description=row.description
        )
        for row in results
    ]


@router.post("/path-aliases", response_model=PathAliasDefinition)
async def create_path_alias(
    request: CreatePathAliasRequest,
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db)
):
    """
    Create a new path alias definition.
    Admin only.
    """
    # Check if alias already exists
    check_query = text("SELECT id FROM path_alias_definitions WHERE alias = :alias")
    existing = db.execute(check_query, {"alias": request.alias}).fetchone()

    if existing:
        raise HTTPException(status_code=400, detail="Alias already exists")

    # Insert new alias
    insert_query = text("""
        INSERT INTO path_alias_definitions (alias, description)
        VALUES (:alias, :description)
    """)
    db.execute(insert_query, {"alias": request.alias, "description": request.description})
    db.commit()

    # Get the created record
    get_query = text("""
        SELECT id, alias, description
        FROM path_alias_definitions
        WHERE alias = :alias
    """)
    result = db.execute(get_query, {"alias": request.alias}).fetchone()

    return PathAliasDefinition(
        id=result.id,
        alias=result.alias,
        description=result.description
    )


@router.delete("/path-aliases/{alias_id}")
async def delete_path_alias(
    alias_id: int,
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db)
):
    """
    Delete a path alias definition.
    Admin only.
    """
    # Check if exists
    check_query = text("SELECT id FROM path_alias_definitions WHERE id = :id")
    existing = db.execute(check_query, {"id": alias_id}).fetchone()

    if not existing:
        raise HTTPException(status_code=404, detail="Alias not found")

    # Delete
    delete_query = text("DELETE FROM path_alias_definitions WHERE id = :id")
    db.execute(delete_query, {"id": alias_id})
    db.commit()

    return {"message": "Alias deleted successfully"}
