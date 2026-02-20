"""
Documents API endpoints.
CRUD operations for courseware documents (worksheets, exams, lesson plans).
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy import desc
from typing import List, Optional
from database import get_db
from constants import hk_now
from models import Document, Tutor
from schemas import (
    DocumentCreate,
    DocumentUpdate,
    DocumentResponse,
    DocumentListItem,
)
from auth.dependencies import get_current_user, reject_guest

logger = logging.getLogger(__name__)

router = APIRouter()


def _doc_to_response(doc: Document, include_content: bool = True) -> dict:
    """Convert a Document ORM object to response dict."""
    data = {
        "id": doc.id,
        "title": doc.title,
        "doc_type": doc.doc_type,
        "page_layout": doc.page_layout,
        "created_by": doc.created_by,
        "created_by_name": doc.creator.tutor_name if doc.creator else "Unknown",
        "created_at": doc.created_at,
        "updated_at": doc.updated_at,
        "is_archived": doc.is_archived,
    }
    if include_content:
        data["content"] = doc.content
    return data


@router.get("/documents", response_model=List[DocumentListItem])
async def list_documents(
    doc_type: Optional[str] = Query(None, pattern="^(worksheet|lesson_plan)$"),
    search: Optional[str] = Query(None),
    include_archived: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _: Tutor = Depends(reject_guest),
    db: Session = Depends(get_db),
):
    """List documents with optional filters."""
    query = db.query(Document).options(joinedload(Document.creator))

    if not include_archived:
        query = query.filter(Document.is_archived == False)
    if doc_type:
        query = query.filter(Document.doc_type == doc_type)
    if search:
        query = query.filter(Document.title.ilike(f"%{search}%"))

    docs = query.order_by(desc(Document.updated_at)).offset(offset).limit(limit).all()
    return [_doc_to_response(d, include_content=False) for d in docs]


@router.get("/documents/{doc_id}", response_model=DocumentResponse)
async def get_document(
    doc_id: int,
    _: Tutor = Depends(reject_guest),
    db: Session = Depends(get_db),
):
    """Get a single document with full content."""
    doc = db.query(Document).options(
        joinedload(Document.creator)
    ).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return _doc_to_response(doc)


@router.post("/documents", response_model=DocumentResponse)
async def create_document(
    data: DocumentCreate,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new document."""
    now = hk_now()
    doc = Document(
        title=(data.title.strip() or "Untitled Document"),
        doc_type=data.doc_type,
        content={"type": "doc", "content": [{"type": "paragraph"}]},
        created_by=current_user.id,
        created_at=now,
        updated_at=now,
    )
    db.add(doc)
    db.commit()
    doc = db.query(Document).options(
        joinedload(Document.creator)
    ).filter(Document.id == doc.id).first()
    return _doc_to_response(doc)


@router.put("/documents/{doc_id}", response_model=DocumentResponse)
async def update_document(
    doc_id: int,
    data: DocumentUpdate,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a document (title, content, or archive status)."""
    doc = db.query(Document).options(
        joinedload(Document.creator)
    ).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Only creator or admins can update
    is_owner = doc.created_by == current_user.id
    is_admin = current_user.role in ("Admin", "Super Admin")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="You can only modify your own documents")

    if data.title is not None:
        doc.title = data.title.strip() or "Untitled Document"
    if data.content is not None:
        doc.content = data.content
    if data.page_layout is not None:
        doc.page_layout = data.page_layout
        flag_modified(doc, "page_layout")
    if data.is_archived is not None:
        doc.is_archived = data.is_archived
    doc.updated_at = hk_now()

    db.commit()
    db.refresh(doc)
    return _doc_to_response(doc)


@router.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: int,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Soft-delete a document (archive it)."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    is_owner = doc.created_by == current_user.id
    is_admin = current_user.role in ("Admin", "Super Admin")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="You can only delete your own documents")

    doc.is_archived = True
    db.commit()
    return {"message": "Document archived successfully"}


@router.delete("/documents/{doc_id}/permanent")
async def permanently_delete_document(
    doc_id: int,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Hard-delete an archived document permanently."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if not doc.is_archived:
        raise HTTPException(status_code=400, detail="Document must be archived before permanent deletion")

    is_owner = doc.created_by == current_user.id
    is_admin = current_user.role in ("Admin", "Super Admin")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="You can only delete your own documents")

    db.delete(doc)
    db.commit()
    return {"message": "Document permanently deleted"}


@router.post("/documents/{doc_id}/duplicate", response_model=DocumentResponse)
async def duplicate_document(
    doc_id: int,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Duplicate a document — copies content, type, and page layout. New owner is current user."""
    source = db.query(Document).options(
        joinedload(Document.creator)
    ).filter(Document.id == doc_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Document not found")

    now = hk_now()
    copy = Document(
        title=f"{source.title} (Copy)",
        doc_type=source.doc_type,
        content=source.content,
        page_layout=source.page_layout,
        created_by=current_user.id,
        created_at=now,
        updated_at=now,
    )
    db.add(copy)
    db.commit()
    db.refresh(copy)
    copy = db.query(Document).options(
        joinedload(Document.creator)
    ).filter(Document.id == copy.id).first()
    return _doc_to_response(copy)


@router.post("/documents/upload-image")
async def upload_document_image(
    file: UploadFile = File(...),
    _: Tutor = Depends(get_current_user),
):
    """Upload an image for use in document content. Returns the public URL."""
    from services.image_storage import upload_image

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    contents = await file.read()
    try:
        url = upload_image(contents, file.filename, prefix="documents")
        return {"url": url, "filename": file.filename}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
