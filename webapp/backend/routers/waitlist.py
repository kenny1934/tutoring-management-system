"""
Waitlist router: track prospective students and slot change requests.
All endpoints are admin-protected.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import WaitlistEntry, WaitlistSlotPreference, Enrollment, Student, Tutor
from schemas import (
    WaitlistEntryCreate,
    WaitlistEntryBulkCreate,
    WaitlistEntryUpdate,
    WaitlistEntryResponse,
    WaitlistSlotPreferenceResponse,
    EnrollmentContextInfo,
)
from auth.dependencies import require_admin_view, require_admin_write, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


class _EnrollmentInfo:
    __slots__ = ("id", "type", "status", "day", "time", "location", "tutor_name")

    def __init__(self, id, type, status, day=None, time=None, location=None, tutor_name=None):
        self.id = id
        self.type = type
        self.status = status
        self.day = day
        self.time = time
        self.location = location
        self.tutor_name = tutor_name


def _get_enrollment_map_for_student(
    student_id: int, db: Session
) -> dict[int, _EnrollmentInfo]:
    """Fetch the most recent non-cancelled enrollment for a single student."""
    row = (
        db.query(
            Enrollment.student_id,
            Enrollment.id,
            Enrollment.enrollment_type,
            Enrollment.payment_status,
            Enrollment.assigned_day,
            Enrollment.assigned_time,
            Enrollment.location,
            Tutor.tutor_name,
        )
        .outerjoin(Tutor, Enrollment.tutor_id == Tutor.id)
        .filter(
            Enrollment.student_id == student_id,
            Enrollment.payment_status != "Cancelled",
        )
        .order_by(Enrollment.id.desc())
        .first()
    )
    if row:
        return {row[0]: _EnrollmentInfo(row[1], row[2], row[3], row[4], row[5], row[6], row[7])}
    return {}


def _derive_enrollment_context(
    entry: WaitlistEntry, subsequent_map: dict[int, _EnrollmentInfo]
) -> EnrollmentContextInfo:
    """Derive enrollment context label for a waitlist entry."""
    if not entry.student_id:
        return EnrollmentContextInfo(label="No student record")

    info = subsequent_map.get(entry.student_id)
    if not info:
        return EnrollmentContextInfo(label="Student created")

    base = {"enrollment_id": info.id}

    # Add current slot info for Slot Change entries
    if entry.entry_type == "Slot Change":
        base.update(
            current_day=info.day,
            current_time=info.time,
            current_location=info.location,
            current_tutor=info.tutor_name,
        )

    if info.status == "Cancelled":
        return EnrollmentContextInfo(label="Cancelled", **base)

    if info.type == "Trial":
        return EnrollmentContextInfo(label="Trial scheduled", **base)

    return EnrollmentContextInfo(label="Enrolled", **base)


def _build_response(entry: WaitlistEntry, enrollment_context: Optional[EnrollmentContextInfo] = None) -> dict:
    """Build response dict from a WaitlistEntry ORM object."""
    data = {
        "id": entry.id,
        "student_name": entry.student_name,
        "school": entry.school,
        "grade": entry.grade,
        "lang_stream": entry.lang_stream,
        "phone": entry.phone,
        "parent_name": entry.parent_name,
        "notes": entry.notes,
        "is_active": entry.is_active,
        "entry_type": entry.entry_type,
        "student_id": entry.student_id,
        "school_student_id": entry.student.school_student_id if entry.student else None,
        "created_by": entry.created_by,
        "created_by_name": entry.creator.tutor_name if entry.creator else None,
        "created_at": entry.created_at,
        "updated_at": entry.updated_at,
        "slot_preferences": [
            WaitlistSlotPreferenceResponse.model_validate(sp)
            for sp in entry.slot_preferences
        ],
        "enrollment_context": enrollment_context,
    }
    return data


@router.get("/waitlist", response_model=list[WaitlistEntryResponse])
def list_waitlist(
    is_active: Optional[bool] = Query(None),
    location: Optional[str] = Query(None),
    grade: Optional[str] = Query(None),
    entry_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    sort_by: Optional[str] = Query("created_at"),
    sort_order: Optional[str] = Query("desc"),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """List waitlist entries with filters."""
    query = (
        db.query(WaitlistEntry)
        .options(
            joinedload(WaitlistEntry.slot_preferences),
            joinedload(WaitlistEntry.creator),
            joinedload(WaitlistEntry.student),
        )
    )

    if is_active is not None:
        query = query.filter(WaitlistEntry.is_active == is_active)
    if grade:
        query = query.filter(WaitlistEntry.grade == grade)
    if entry_type:
        query = query.filter(WaitlistEntry.entry_type == entry_type)
    if location:
        query = query.filter(
            WaitlistEntry.slot_preferences.any(
                WaitlistSlotPreference.location == location
            )
        )
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                WaitlistEntry.student_name.ilike(pattern),
                WaitlistEntry.school.ilike(pattern),
                WaitlistEntry.phone.ilike(pattern),
                WaitlistEntry.parent_name.ilike(pattern),
            )
        )

    sort_columns = {
        "created_at": WaitlistEntry.created_at,
        "student_name": WaitlistEntry.student_name,
        "grade": WaitlistEntry.grade,
        "school": WaitlistEntry.school,
    }
    sort_col = sort_columns.get(sort_by, WaitlistEntry.created_at)
    query = query.order_by(sort_col.asc() if sort_order == "asc" else sort_col.desc())

    entries = query.offset(offset).limit(limit).all()
    # Deduplicate from joinedload
    seen = set()
    unique_entries = []
    for e in entries:
        if e.id not in seen:
            seen.add(e.id)
            unique_entries.append(e)

    # Batch derive enrollment context for entries with student_id
    student_ids = {e.student_id for e in unique_entries if e.student_id}
    subsequent_map: dict[int, _EnrollmentInfo] = {}
    if student_ids:
        enrollments = (
            db.query(
                Enrollment.student_id,
                Enrollment.id,
                Enrollment.enrollment_type,
                Enrollment.payment_status,
                Enrollment.assigned_day,
                Enrollment.assigned_time,
                Enrollment.location,
                Tutor.tutor_name,
            )
            .outerjoin(Tutor, Enrollment.tutor_id == Tutor.id)
            .filter(
                Enrollment.student_id.in_(student_ids),
                Enrollment.payment_status != "Cancelled",
            )
            .order_by(Enrollment.id.desc())
            .all()
        )
        # Keep the most recent enrollment per student
        for student_id, eid, etype, pstatus, day, time, loc, tname in enrollments:
            if student_id not in subsequent_map:
                subsequent_map[student_id] = _EnrollmentInfo(eid, etype, pstatus, day, time, loc, tname)

    results = []
    for entry in unique_entries:
        ctx = _derive_enrollment_context(entry, subsequent_map)
        results.append(_build_response(entry, ctx))

    return results


@router.get("/waitlist/{entry_id}", response_model=WaitlistEntryResponse)
def get_waitlist_entry(
    entry_id: int,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Get a single waitlist entry."""
    entry = (
        db.query(WaitlistEntry)
        .options(
            joinedload(WaitlistEntry.slot_preferences),
            joinedload(WaitlistEntry.creator),
            joinedload(WaitlistEntry.student),
        )
        .filter(WaitlistEntry.id == entry_id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Waitlist entry not found")

    emap = _get_enrollment_map_for_student(entry.student_id, db) if entry.student_id else {}
    return _build_response(entry, _derive_enrollment_context(entry, emap))


@router.post("/waitlist", response_model=WaitlistEntryResponse)
def create_waitlist_entry(
    payload: WaitlistEntryCreate,
    current_user: Tutor = Depends(get_current_user),
    _admin: None = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Create a new waitlist entry with optional slot preferences."""
    entry = WaitlistEntry(
        student_name=payload.student_name,
        school=payload.school,
        grade=payload.grade,
        lang_stream=payload.lang_stream,
        phone=payload.phone,
        parent_name=payload.parent_name,
        notes=payload.notes,
        entry_type=payload.entry_type,
        student_id=payload.student_id,
        created_by=current_user.id,
    )
    db.add(entry)
    db.flush()

    for sp in payload.slot_preferences:
        pref = WaitlistSlotPreference(
            waitlist_entry_id=entry.id,
            location=sp.location,
            day_of_week=sp.day_of_week,
            time_slot=sp.time_slot,
        )
        db.add(pref)

    db.commit()
    db.refresh(entry)

    return _build_response(entry, _derive_enrollment_context(entry, {}))


@router.post("/waitlist/bulk")
def bulk_create_waitlist(
    payload: WaitlistEntryBulkCreate,
    current_user: Tutor = Depends(get_current_user),
    _admin: None = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Bulk create waitlist entries from paste (no slot preferences)."""
    if len(payload.entries) > 200:
        raise HTTPException(status_code=400, detail="Cannot submit more than 200 entries per request")

    created = []
    for item in payload.entries:
        entry = WaitlistEntry(
            student_name=item.student_name,
            school=item.school,
            grade=item.grade,
            lang_stream=item.lang_stream,
            phone=item.phone,
            parent_name=item.parent_name,
            created_by=current_user.id,
        )
        db.add(entry)
        created.append(entry)

    db.commit()
    return {"created": len(created)}


@router.patch("/waitlist/{entry_id}", response_model=WaitlistEntryResponse)
def update_waitlist_entry(
    entry_id: int,
    payload: WaitlistEntryUpdate,
    _admin: None = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Update a waitlist entry. Slot preferences are replaced if provided."""
    entry = (
        db.query(WaitlistEntry)
        .options(
            joinedload(WaitlistEntry.slot_preferences),
            joinedload(WaitlistEntry.creator),
            joinedload(WaitlistEntry.student),
        )
        .filter(WaitlistEntry.id == entry_id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Waitlist entry not found")

    update_data = payload.model_dump(exclude_unset=True)

    # Handle slot preferences replacement separately
    slot_prefs = update_data.pop("slot_preferences", None)
    for field, value in update_data.items():
        setattr(entry, field, value)

    if slot_prefs is not None:
        # Replace all slot preferences
        for sp in entry.slot_preferences:
            db.delete(sp)
        db.flush()
        for sp_data in slot_prefs:
            pref = WaitlistSlotPreference(
                waitlist_entry_id=entry.id,
                location=sp_data["location"],
                day_of_week=sp_data.get("day_of_week"),
                time_slot=sp_data.get("time_slot"),
            )
            db.add(pref)

    db.commit()
    db.refresh(entry)

    emap = _get_enrollment_map_for_student(entry.student_id, db) if entry.student_id else {}
    return _build_response(entry, _derive_enrollment_context(entry, emap))


@router.delete("/waitlist/{entry_id}")
def delete_waitlist_entry(
    entry_id: int,
    _admin: None = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Delete a waitlist entry."""
    entry = db.query(WaitlistEntry).filter(WaitlistEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Waitlist entry not found")

    db.delete(entry)
    db.commit()
    return {"deleted": True}
