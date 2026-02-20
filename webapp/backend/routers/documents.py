"""
Documents API endpoints.
CRUD operations for courseware documents (worksheets, exams, lesson plans).
"""
import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy import desc, asc, func as sa_func
from typing import List, Optional
from database import get_db
from constants import hk_now
from models import Document, DocumentFolder, Tutor
from schemas import (
    DocumentCreate,
    DocumentUpdate,
    DocumentResponse,
    DocumentListItem,
    FolderCreate,
    FolderUpdate,
    FolderResponse,
)
from auth.dependencies import get_current_user, reject_guest

logger = logging.getLogger(__name__)

router = APIRouter()

LOCK_DURATION = timedelta(minutes=5)


def _is_lock_active(doc: Document) -> bool:
    """Check if a document has an active (non-expired) lock."""
    return doc.locked_by is not None and doc.lock_expires_at is not None and doc.lock_expires_at > hk_now()


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
        "locked_by": doc.locked_by if _is_lock_active(doc) else None,
        "locked_by_name": doc.locker.tutor_name if _is_lock_active(doc) and doc.locker else "",
        "lock_expires_at": doc.lock_expires_at if _is_lock_active(doc) else None,
        "tags": doc.tags or [],
        "folder_id": doc.folder_id,
        "folder_name": doc.folder.name if doc.folder else "",
    }
    if include_content:
        data["content"] = doc.content
    return data


def _doc_query(db: Session):
    """Base document query with standard eager loads."""
    return db.query(Document).options(
        joinedload(Document.creator),
        joinedload(Document.locker),
        joinedload(Document.folder),
    )


@router.get("/documents", response_model=List[DocumentListItem])
async def list_documents(
    doc_type: Optional[str] = Query(None, pattern="^(worksheet|lesson_plan)$"),
    search: Optional[str] = Query(None),
    include_archived: bool = Query(False),
    sort_by: str = Query("updated_at", pattern="^(updated_at|created_at|title)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    tag: Optional[str] = Query(None),
    folder_id: Optional[int] = Query(None),
    _: Tutor = Depends(reject_guest),
    db: Session = Depends(get_db),
):
    """List documents with optional filters."""
    query = _doc_query(db)

    if not include_archived:
        query = query.filter(Document.is_archived == False)
    if doc_type:
        query = query.filter(Document.doc_type == doc_type)
    if search:
        query = query.filter(Document.title.ilike(f"%{search}%"))
    if tag:
        query = query.filter(sa_func.json_contains(Document.tags, f'"{tag}"'))
    if folder_id is not None:
        query = query.filter(Document.folder_id == folder_id)

    sort_col = getattr(Document, sort_by)
    order_fn = desc if sort_order == "desc" else asc
    docs = query.order_by(order_fn(sort_col)).offset(offset).limit(limit).all()
    return [_doc_to_response(d, include_content=False) for d in docs]


@router.get("/documents/tags", response_model=List[str])
async def list_all_tags(
    _: Tutor = Depends(reject_guest),
    db: Session = Depends(get_db),
):
    """Get all unique tags used across documents."""
    docs = db.query(Document.tags).filter(
        Document.tags.isnot(None),
        Document.is_archived == False,
    ).all()
    all_tags = set()
    for (tags,) in docs:
        if tags:
            all_tags.update(tags)
    return sorted(all_tags)


@router.get("/documents/{doc_id}", response_model=DocumentResponse)
async def get_document(
    doc_id: int,
    _: Tutor = Depends(reject_guest),
    db: Session = Depends(get_db),
):
    """Get a single document with full content."""
    doc = _doc_query(db).filter(Document.id == doc_id).first()
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
        page_layout=data.page_layout,
        tags=data.tags or [],
        folder_id=data.folder_id,
        created_by=current_user.id,
        created_at=now,
        updated_at=now,
    )
    db.add(doc)
    db.commit()
    doc = _doc_query(db).filter(Document.id == doc.id).first()
    return _doc_to_response(doc)


@router.put("/documents/{doc_id}", response_model=DocumentResponse)
async def update_document(
    doc_id: int,
    data: DocumentUpdate,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a document (title, content, or archive status)."""
    doc = _doc_query(db).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Only creator or admins can update
    is_owner = doc.created_by == current_user.id
    is_admin = current_user.role in ("Admin", "Super Admin")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="You can only modify your own documents")

    # Lock check: reject if locked by another user
    if _is_lock_active(doc) and doc.locked_by != current_user.id and not is_admin:
        raise HTTPException(status_code=409, detail=f"Document is locked by {doc.locker.tutor_name if doc.locker else 'another user'}")

    if data.title is not None:
        doc.title = data.title.strip() or "Untitled Document"
    if data.content is not None:
        doc.content = data.content
    if data.page_layout is not None:
        doc.page_layout = data.page_layout
        flag_modified(doc, "page_layout")
    if data.is_archived is not None:
        doc.is_archived = data.is_archived
    if data.tags is not None:
        doc.tags = data.tags
        flag_modified(doc, "tags")
    if data.folder_id is not None:
        doc.folder_id = data.folder_id if data.folder_id != 0 else None
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
    """Duplicate a document — copies content, type, page layout, and tags. New owner is current user."""
    source = _doc_query(db).filter(Document.id == doc_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Document not found")

    now = hk_now()
    copy = Document(
        title=f"{source.title} (Copy)",
        doc_type=source.doc_type,
        content=source.content,
        page_layout=source.page_layout,
        tags=list(source.tags) if source.tags else [],
        folder_id=source.folder_id,
        created_by=current_user.id,
        created_at=now,
        updated_at=now,
    )
    db.add(copy)
    db.commit()
    db.refresh(copy)
    copy = _doc_query(db).filter(Document.id == copy.id).first()
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


# ─── Document Locking ─────────────────────────────────────────────────

@router.post("/documents/{doc_id}/lock", response_model=DocumentResponse)
async def lock_document(
    doc_id: int,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Acquire or refresh a lock on a document."""
    doc = _doc_query(db).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    now = hk_now()

    # Already locked by another user and not expired
    if _is_lock_active(doc) and doc.locked_by != current_user.id:
        locker_name = doc.locker.tutor_name if doc.locker else "another user"
        raise HTTPException(status_code=409, detail=f"Document is locked by {locker_name}")

    # Acquire or refresh lock
    doc.locked_by = current_user.id
    doc.lock_expires_at = now + LOCK_DURATION
    db.commit()
    db.refresh(doc)
    return _doc_to_response(doc)


@router.post("/documents/{doc_id}/heartbeat")
async def heartbeat_document(
    doc_id: int,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Refresh the lock expiry (keep-alive)."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if not _is_lock_active(doc) or doc.locked_by != current_user.id:
        raise HTTPException(status_code=409, detail="You do not hold the lock on this document")

    doc.lock_expires_at = hk_now() + LOCK_DURATION
    db.commit()
    return {"lock_expires_at": doc.lock_expires_at}


@router.delete("/documents/{doc_id}/lock")
async def unlock_document(
    doc_id: int,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Release a lock. Owner of the lock or admins can release."""
    doc = db.query(Document).options(
        joinedload(Document.locker)
    ).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if not _is_lock_active(doc):
        return {"message": "Document is not locked"}

    is_lock_owner = doc.locked_by == current_user.id
    is_admin = current_user.role in ("Admin", "Super Admin")
    if not (is_lock_owner or is_admin):
        raise HTTPException(status_code=403, detail="Only the lock holder or admins can unlock")

    doc.locked_by = None
    doc.lock_expires_at = None
    db.commit()
    return {"message": "Lock released"}


# ─── Document Folders ────────────────────────────────────────────────

def _folder_to_response(folder: DocumentFolder, db: Session) -> dict:
    """Convert a DocumentFolder ORM object to response dict."""
    doc_count = db.query(Document).filter(
        Document.folder_id == folder.id,
        Document.is_archived == False,
    ).count()
    return {
        "id": folder.id,
        "name": folder.name,
        "parent_id": folder.parent_id,
        "created_by": folder.created_by,
        "created_by_name": folder.creator.tutor_name if folder.creator else "",
        "created_at": folder.created_at,
        "document_count": doc_count,
    }


@router.get("/document-folders", response_model=List[FolderResponse])
async def list_folders(
    _: Tutor = Depends(reject_guest),
    db: Session = Depends(get_db),
):
    """List all document folders."""
    folders = db.query(DocumentFolder).options(
        joinedload(DocumentFolder.creator)
    ).order_by(DocumentFolder.name).all()
    return [_folder_to_response(f, db) for f in folders]


@router.post("/document-folders", response_model=FolderResponse)
async def create_folder(
    data: FolderCreate,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new document folder."""
    if data.parent_id:
        parent = db.query(DocumentFolder).filter(DocumentFolder.id == data.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent folder not found")

    folder = DocumentFolder(
        name=data.name.strip(),
        parent_id=data.parent_id,
        created_by=current_user.id,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    folder = db.query(DocumentFolder).options(
        joinedload(DocumentFolder.creator)
    ).filter(DocumentFolder.id == folder.id).first()
    return _folder_to_response(folder, db)


@router.put("/document-folders/{folder_id}", response_model=FolderResponse)
async def update_folder(
    folder_id: int,
    data: FolderUpdate,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a document folder name or parent."""
    folder = db.query(DocumentFolder).options(
        joinedload(DocumentFolder.creator)
    ).filter(DocumentFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    is_owner = folder.created_by == current_user.id
    is_admin = current_user.role in ("Admin", "Super Admin")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="You can only modify your own folders")

    if data.name is not None:
        folder.name = data.name.strip()
    if data.parent_id is not None:
        if data.parent_id == folder.id:
            raise HTTPException(status_code=400, detail="A folder cannot be its own parent")
        folder.parent_id = data.parent_id if data.parent_id != 0 else None

    db.commit()
    db.refresh(folder)
    return _folder_to_response(folder, db)


@router.delete("/document-folders/{folder_id}")
async def delete_folder(
    folder_id: int,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a document folder. Documents in this folder become unfiled."""
    folder = db.query(DocumentFolder).filter(DocumentFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    is_owner = folder.created_by == current_user.id
    is_admin = current_user.role in ("Admin", "Super Admin")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="You can only delete your own folders")

    # Unfiled documents in this folder (ON DELETE SET NULL handles this via FK, but be explicit)
    db.query(Document).filter(Document.folder_id == folder_id).update({"folder_id": None})
    db.delete(folder)
    db.commit()
    return {"message": "Folder deleted"}


