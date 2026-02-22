"""
Documents API endpoints.
CRUD operations for courseware documents (worksheets, exams, lesson plans).
"""
import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.orm.exc import StaleDataError
from sqlalchemy import desc, asc, or_, func as sa_func
from typing import List, Optional
from database import get_db
from constants import hk_now
from models import Document, DocumentFolder, DocumentVersion, Tutor
from schemas import (
    DocumentCreate,
    DocumentUpdate,
    DocumentResponse,
    DocumentListItem,
    DocumentVersionResponse,
    DocumentVersionDetailResponse,
    CreateCheckpointRequest,
    FolderCreate,
    FolderUpdate,
    FolderResponse,
)
from auth.dependencies import get_current_user, reject_guest

logger = logging.getLogger(__name__)

router = APIRouter()

LOCK_DURATION = timedelta(minutes=5)
VERSION_GAP_MINUTES = 10
MAX_VERSIONS_PER_DOC = 100


def _next_version_number(db: Session, document_id: int) -> int:
    """Get the next version number for a document."""
    max_num = db.query(sa_func.max(DocumentVersion.version_number)).filter(
        DocumentVersion.document_id == document_id
    ).scalar()
    return (max_num or 0) + 1


def _create_version_snapshot(db: Session, doc: Document, user_id: int, version_type: str, label: str | None = None) -> DocumentVersion:
    """Create a version snapshot of the document's current state."""
    ver = DocumentVersion(
        document_id=doc.id,
        version_number=_next_version_number(db, doc.id),
        title=doc.title,
        content=doc.content,
        page_layout=doc.page_layout,
        created_by=user_id,
        created_at=hk_now(),
        version_type=version_type,
        label=label,
    )
    db.add(ver)
    doc.last_version_at = ver.created_at
    return ver


def _maybe_create_auto_version(db: Session, doc: Document, user_id: int, version_type: str = "auto") -> DocumentVersion | None:
    """Create an auto version if enough time has passed since the last one."""
    now = hk_now()
    if doc.last_version_at and (now - doc.last_version_at).total_seconds() < VERSION_GAP_MINUTES * 60:
        return None
    # Only snapshot if document has content
    if not doc.content:
        return None
    ver = _create_version_snapshot(db, doc, user_id, version_type)
    _prune_old_versions(db, doc.id)
    return ver


def _prune_old_versions(db: Session, document_id: int) -> None:
    """Delete oldest auto versions if total exceeds MAX_VERSIONS_PER_DOC."""
    total = db.query(DocumentVersion).filter(DocumentVersion.document_id == document_id).count()
    if total <= MAX_VERSIONS_PER_DOC:
        return
    excess = total - MAX_VERSIONS_PER_DOC
    # Delete oldest auto versions first
    oldest_auto = db.query(DocumentVersion.id).filter(
        DocumentVersion.document_id == document_id,
        DocumentVersion.version_type == "auto",
    ).order_by(DocumentVersion.created_at.asc()).limit(excess).all()
    if oldest_auto:
        ids_to_delete = [row[0] for row in oldest_auto]
        db.query(DocumentVersion).filter(DocumentVersion.id.in_(ids_to_delete)).delete(synchronize_session=False)


def _resolve_unique_title(
    db: Session,
    base_title: str,
    folder_id: int | None,
    is_template: bool,
    exclude_id: int | None = None,
) -> str:
    """Auto-number a title to be unique within a folder + is_template namespace."""
    query = db.query(Document.title).filter(
        Document.title.like(f"{base_title}%"),
        Document.is_archived == False,
        Document.is_template == is_template,
    )
    if folder_id is not None:
        query = query.filter(Document.folder_id == folder_id)
    else:
        query = query.filter(Document.folder_id.is_(None))
    if exclude_id is not None:
        query = query.filter(Document.id != exclude_id)
    existing_titles = {r.title for r in query.all()}

    title = base_title
    if title in existing_titles:
        n = 2
        while f"{base_title} ({n})" in existing_titles:
            n += 1
        title = f"{base_title} ({n})"
    return title


def _check_title_conflict(
    db: Session,
    title: str,
    folder_id: int | None,
    is_template: bool,
    exclude_id: int | None = None,
) -> bool:
    """Return True if title already exists in the same folder/namespace."""
    query = db.query(Document.id).filter(
        Document.title == title,
        Document.is_archived == False,
        Document.is_template == is_template,
    )
    if folder_id is not None:
        query = query.filter(Document.folder_id == folder_id)
    else:
        query = query.filter(Document.folder_id.is_(None))
    if exclude_id is not None:
        query = query.filter(Document.id != exclude_id)
    return query.first() is not None


def _version_to_response(ver: DocumentVersion, include_content: bool = False) -> dict:
    """Convert a DocumentVersion ORM object to response dict."""
    data = {
        "id": ver.id,
        "document_id": ver.document_id,
        "version_number": ver.version_number,
        "title": ver.title,
        "created_by": ver.created_by,
        "created_by_name": ver.creator.tutor_name if ver.creator else "Unknown",
        "created_at": ver.created_at,
        "version_type": ver.version_type,
        "label": ver.label,
    }
    if include_content:
        data["content"] = ver.content
        data["page_layout"] = ver.page_layout
    return data


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
        "updated_by": doc.updated_by,
        "updated_by_name": doc.updater.tutor_name if doc.updater else "",
        "is_archived": doc.is_archived,
        "is_template": doc.is_template,
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
        joinedload(Document.updater),
        joinedload(Document.locker),
        joinedload(Document.folder),
    )


@router.get("/documents", response_model=List[DocumentListItem])
async def list_documents(
    doc_type: Optional[str] = Query(None, pattern="^(worksheet|lesson_plan)$"),
    search: Optional[str] = Query(None),
    include_archived: bool = Query(False),
    is_template: Optional[bool] = Query(None),
    sort_by: str = Query("updated_at", pattern="^(updated_at|created_at|title)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    tag: Optional[str] = Query(None),
    folder_id: Optional[int] = Query(None),
    my_docs: bool = Query(False),
    ids: Optional[str] = Query(None),
    current_user: Tutor = Depends(reject_guest),
    db: Session = Depends(get_db),
):
    """List documents with optional filters."""
    query = _doc_query(db)

    if not include_archived:
        query = query.filter(Document.is_archived == False)
    # Filter by is_template: explicit true/false, or default to excluding templates
    if is_template is not None:
        query = query.filter(Document.is_template == is_template)
    else:
        query = query.filter(Document.is_template == False)
    if doc_type:
        query = query.filter(Document.doc_type == doc_type)
    if search:
        query = query.filter(Document.title.ilike(f"%{search}%"))
    if tag:
        query = query.filter(sa_func.json_contains(Document.tags, f'"{tag}"'))
    if folder_id is not None:
        query = query.filter(Document.folder_id == folder_id)
    if my_docs:
        query = query.filter(
            or_(Document.created_by == current_user.id, Document.updated_by == current_user.id)
        )
    if ids:
        id_list = [int(x) for x in ids.split(",") if x.strip().isdigit()]
        if id_list:
            query = query.filter(Document.id.in_(id_list))

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
        Document.is_template == False,
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

    base_title = data.title.strip() or "Untitled Document"
    title = _resolve_unique_title(db, base_title, data.folder_id, data.is_template)

    doc = Document(
        title=title,
        doc_type=data.doc_type,
        content=data.content if data.content else {"type": "doc", "content": [{"type": "paragraph"}]},
        page_layout=data.page_layout,
        tags=data.tags or [],
        folder_id=data.folder_id,
        is_template=data.is_template,
        created_by=current_user.id,
        created_at=now,
        updated_at=now,
        updated_by=current_user.id,
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

    # Auto-version: snapshot current state if content is changing and enough time has passed
    if data.content is not None:
        _maybe_create_auto_version(db, doc, current_user.id)

    # Determine target folder (may change if folder_id is in the update)
    target_folder = doc.folder_id
    if data.folder_id is not None:
        target_folder = data.folder_id if data.folder_id != 0 else None

    # Title conflict check (rename or folder move)
    new_title = (data.title.strip() or "Untitled Document") if data.title is not None else doc.title
    title_changed = data.title is not None and new_title != doc.title
    folder_changed = data.folder_id is not None and target_folder != doc.folder_id
    if title_changed or folder_changed:
        if _check_title_conflict(db, new_title, target_folder, doc.is_template, exclude_id=doc.id):
            raise HTTPException(status_code=409, detail="A document with this name already exists in this folder")

    if data.title is not None:
        doc.title = new_title
    if data.content is not None:
        doc.content = data.content
    if data.page_layout is not None:
        doc.page_layout = data.page_layout
        flag_modified(doc, "page_layout")
    if data.is_archived is not None:
        doc.is_archived = data.is_archived
    if data.is_template is not None:
        doc.is_template = data.is_template
    if data.tags is not None:
        doc.tags = data.tags
        flag_modified(doc, "tags")
    if data.folder_id is not None:
        doc.folder_id = target_folder
    doc.updated_at = hk_now()
    doc.updated_by = current_user.id

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
    copy_title = _resolve_unique_title(db, f"{source.title} (Copy)", source.folder_id, False)
    copy = Document(
        title=copy_title,
        doc_type=source.doc_type,
        content=source.content,
        page_layout=source.page_layout,
        tags=list(source.tags) if source.tags else [],
        folder_id=source.folder_id,
        is_template=False,
        created_by=current_user.id,
        created_at=now,
        updated_at=now,
        updated_by=current_user.id,
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

    # New lock acquisition (not just a refresh) → session_start version
    is_new_lock = not _is_lock_active(doc) or doc.locked_by != current_user.id
    if is_new_lock and doc.content:
        _maybe_create_auto_version(db, doc, current_user.id, version_type="session_start")

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
        return {"message": "Document not found, no lock to release"}

    if not _is_lock_active(doc):
        return {"message": "Document is not locked"}

    is_lock_owner = doc.locked_by == current_user.id
    is_admin = current_user.role in ("Admin", "Super Admin")
    if not (is_lock_owner or is_admin):
        raise HTTPException(status_code=403, detail="Only the lock holder or admins can unlock")

    doc.locked_by = None
    doc.lock_expires_at = None
    try:
        db.commit()
    except StaleDataError:
        db.rollback()
        return {"message": "Document was deleted, lock released"}
    return {"message": "Lock released"}


# ─── Document Versions ───────────────────────────────────────────────

@router.get("/documents/{doc_id}/versions", response_model=List[DocumentVersionResponse])
async def list_versions(
    doc_id: int,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _: Tutor = Depends(reject_guest),
    db: Session = Depends(get_db),
):
    """List version history for a document (newest first)."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    versions = db.query(DocumentVersion).options(
        joinedload(DocumentVersion.creator)
    ).filter(
        DocumentVersion.document_id == doc_id
    ).order_by(
        DocumentVersion.created_at.desc()
    ).offset(offset).limit(limit).all()

    return [_version_to_response(v) for v in versions]


@router.get("/documents/{doc_id}/versions/{ver_id}", response_model=DocumentVersionDetailResponse)
async def get_version(
    doc_id: int,
    ver_id: int,
    _: Tutor = Depends(reject_guest),
    db: Session = Depends(get_db),
):
    """Get a single version with full content (for preview)."""
    ver = db.query(DocumentVersion).options(
        joinedload(DocumentVersion.creator)
    ).filter(
        DocumentVersion.id == ver_id,
        DocumentVersion.document_id == doc_id,
    ).first()
    if not ver:
        raise HTTPException(status_code=404, detail="Version not found")
    return _version_to_response(ver, include_content=True)


@router.post("/documents/{doc_id}/versions", response_model=DocumentVersionResponse)
async def create_checkpoint(
    doc_id: int,
    data: CreateCheckpointRequest = CreateCheckpointRequest(),
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a manual checkpoint of the current document state."""
    doc = _doc_query(db).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    is_owner = doc.created_by == current_user.id
    is_admin = current_user.role in ("Admin", "Super Admin")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="You can only create checkpoints for your own documents")

    if not doc.content:
        raise HTTPException(status_code=400, detail="Cannot create checkpoint for empty document")

    ver = _create_version_snapshot(db, doc, current_user.id, "manual", label=data.label)
    _prune_old_versions(db, doc_id)
    db.commit()
    db.refresh(ver)
    ver = db.query(DocumentVersion).options(
        joinedload(DocumentVersion.creator)
    ).filter(DocumentVersion.id == ver.id).first()
    return _version_to_response(ver)


@router.post("/documents/{doc_id}/versions/{ver_id}/restore", response_model=DocumentResponse)
async def restore_version(
    doc_id: int,
    ver_id: int,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Restore a document to a previous version. Snapshots current state first."""
    doc = _doc_query(db).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    is_owner = doc.created_by == current_user.id
    is_admin = current_user.role in ("Admin", "Super Admin")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="You can only restore your own documents")

    # Lock check
    if _is_lock_active(doc) and doc.locked_by != current_user.id and not is_admin:
        raise HTTPException(status_code=409, detail="Document is locked by another user")

    ver = db.query(DocumentVersion).filter(
        DocumentVersion.id == ver_id,
        DocumentVersion.document_id == doc_id,
    ).first()
    if not ver:
        raise HTTPException(status_code=404, detail="Version not found")

    # Snapshot current state before restoring
    if doc.content:
        _create_version_snapshot(db, doc, current_user.id, "auto", label="Before restore")

    # Apply version content
    doc.title = _resolve_unique_title(db, ver.title, doc.folder_id, doc.is_template, exclude_id=doc.id)
    doc.content = ver.content
    doc.page_layout = ver.page_layout
    flag_modified(doc, "page_layout")
    doc.updated_at = hk_now()
    doc.updated_by = current_user.id
    _prune_old_versions(db, doc_id)
    db.commit()
    db.refresh(doc)
    return _doc_to_response(doc)


@router.delete("/documents/{doc_id}/versions/{ver_id}")
async def delete_version(
    doc_id: int,
    ver_id: int,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a single version."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    is_owner = doc.created_by == current_user.id
    is_admin = current_user.role in ("Admin", "Super Admin")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="You can only delete versions of your own documents")

    ver = db.query(DocumentVersion).filter(
        DocumentVersion.id == ver_id,
        DocumentVersion.document_id == doc_id,
    ).first()
    if not ver:
        raise HTTPException(status_code=404, detail="Version not found")

    db.delete(ver)
    db.commit()
    return {"message": "Version deleted"}


# ─── Document Folders ────────────────────────────────────────────────

def _folder_to_response(folder: DocumentFolder, db: Session) -> dict:
    """Convert a DocumentFolder ORM object to response dict."""
    doc_count = db.query(Document).filter(
        Document.folder_id == folder.id,
        Document.is_archived == False,
        Document.is_template == False,
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


