"""
Parent Communications API endpoints.
Provides CRUD operations for tracking parent-tutor communications.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_, or_, desc, case
from typing import List, Optional
from datetime import date, datetime, timedelta
from constants import hk_now
from collections import defaultdict
import time
from database import get_db
from models import ParentCommunication, Student, Tutor, Enrollment, LocationSettings
from routers.enrollments import calculate_effective_end_date_bulk, get_holidays_in_range, ACTIVE_GRACE_PERIOD_DAYS
from schemas import (
    ParentCommunicationCreate,
    ParentCommunicationUpdate,
    ParentCommunicationResponse,
    StudentContactStatus,
    ParentCommunicationStats,
    LocationSettingsResponse,
    LocationSettingsUpdate
)

from auth.dependencies import reject_guest

router = APIRouter()

# Default threshold values
DEFAULT_RECENT_DAYS = 28
DEFAULT_WARNING_DAYS = 50
NEVER_CONTACTED_DAYS = 999

# TTL cache for get_active_student_ids() — avoids redundant computation
# when multiple endpoints are called in parallel on page load.
_active_ids_cache: dict[tuple, tuple[set[int], float]] = {}
_ACTIVE_IDS_CACHE_TTL = 30  # seconds


def get_location_thresholds(db: Session, location: Optional[str]) -> tuple[int, int]:
    """Get contact thresholds for a location, falling back to defaults."""
    if location:
        settings = db.query(LocationSettings).filter(
            LocationSettings.location == location
        ).first()
        if settings:
            return settings.contact_recent_days, settings.contact_warning_days
    return DEFAULT_RECENT_DAYS, DEFAULT_WARNING_DAYS


def calculate_contact_status(days: int, recent_threshold: int, warning_threshold: int) -> str:
    """Calculate contact status based on days since last contact."""
    if days >= NEVER_CONTACTED_DAYS:
        return "Never Contacted"
    elif days <= recent_threshold:
        return "Recent"
    elif days <= warning_threshold:
        return "Been a While"
    else:
        return "Contact Needed"


def get_active_student_ids(
    db: Session,
    tutor_id: Optional[int] = None,
    location: Optional[str] = None
) -> set[int]:
    """
    Get IDs of students with active enrollments.
    Results are cached for 30 seconds to avoid redundant computation
    when multiple endpoints call this in parallel on page load.
    """
    cache_key = (tutor_id, location)
    now = time.time()

    # Check cache
    if cache_key in _active_ids_cache:
        cached_result, expiry = _active_ids_cache[cache_key]
        if now < expiry:
            return cached_result

    today = date.today()
    max_possible_weeks = 60
    cutoff_date = today - timedelta(weeks=max_possible_weeks)

    enrollment_query = (
        db.query(Enrollment)
        .filter(
            Enrollment.payment_status != "Cancelled",
            Enrollment.enrollment_type == "Regular",
            Enrollment.student_id.isnot(None),
            or_(
                Enrollment.first_lesson_date == None,
                Enrollment.first_lesson_date >= cutoff_date
            )
        )
    )

    if tutor_id:
        enrollment_query = enrollment_query.filter(Enrollment.tutor_id == tutor_id)
    if location:
        enrollment_query = enrollment_query.filter(Enrollment.location == location)

    all_enrollments = enrollment_query.all()

    holidays = get_holidays_in_range(db, today - timedelta(weeks=52), today + timedelta(weeks=104))

    student_enrollments = defaultdict(list)
    for enrollment in all_enrollments:
        student_enrollments[enrollment.student_id].append(enrollment)

    active_ids = set()
    for student_id, enrollments_list in student_enrollments.items():
        latest = max(enrollments_list, key=lambda e: e.first_lesson_date or date.min)
        if latest.first_lesson_date:
            effective_end_date = calculate_effective_end_date_bulk(latest, holidays)
            if effective_end_date and effective_end_date >= today - timedelta(days=ACTIVE_GRACE_PERIOD_DAYS):
                active_ids.add(student_id)
        else:
            active_ids.add(student_id)

    # Store in cache and prune expired entries
    _active_ids_cache[cache_key] = (active_ids, now + _ACTIVE_IDS_CACHE_TTL)
    for k in [k for k, (_, exp) in _active_ids_cache.items() if now >= exp]:
        del _active_ids_cache[k]

    return active_ids


@router.get("/parent-communications", response_model=List[ParentCommunicationResponse])
async def get_communications(
    tutor_id: Optional[int] = Query(None, description="Filter by tutor ID"),
    student_id: Optional[int] = Query(None, description="Filter by student ID"),
    location: Optional[str] = Query(None, description="Filter by location (via enrollment)"),
    from_date: Optional[date] = Query(None, description="Filter contacts from this date"),
    to_date: Optional[date] = Query(None, description="Filter contacts up to this date"),
    limit: int = Query(100, ge=1, le=500, description="Maximum results"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    _: Tutor = Depends(reject_guest),
    db: Session = Depends(get_db)
):
    """
    Get list of parent communications with optional filters.
    """
    query = db.query(ParentCommunication).options(
        joinedload(ParentCommunication.student),
        joinedload(ParentCommunication.tutor)
    )

    if tutor_id:
        query = query.filter(ParentCommunication.tutor_id == tutor_id)

    if student_id:
        query = query.filter(ParentCommunication.student_id == student_id)

    if location:
        # Filter by students who have enrollments at this location
        student_ids_at_location = db.query(Enrollment.student_id).filter(
            Enrollment.location == location
        ).distinct().scalar_subquery()
        query = query.filter(ParentCommunication.student_id.in_(student_ids_at_location))

    if from_date:
        query = query.filter(func.date(ParentCommunication.contact_date) >= from_date)

    if to_date:
        query = query.filter(func.date(ParentCommunication.contact_date) <= to_date)

    query = query.order_by(desc(ParentCommunication.contact_date))
    communications = query.offset(offset).limit(limit).all()

    result = []
    for comm in communications:
        result.append(ParentCommunicationResponse(
            id=comm.id,
            student_id=comm.student_id,
            student_name=comm.student.student_name if comm.student else "Unknown",
            school_student_id=comm.student.school_student_id if comm.student else None,
            grade=comm.student.grade if comm.student else None,
            lang_stream=comm.student.lang_stream if comm.student else None,
            school=comm.student.school if comm.student else None,
            home_location=comm.student.home_location if comm.student else None,
            tutor_id=comm.tutor_id,
            tutor_name=comm.tutor.tutor_name if comm.tutor else "Unknown",
            contact_date=comm.contact_date,
            contact_method=comm.contact_method,
            contact_type=comm.contact_type,
            brief_notes=comm.brief_notes,
            follow_up_needed=comm.follow_up_needed,
            follow_up_date=comm.follow_up_date,
            created_at=comm.created_at,
            created_by=comm.created_by
        ))

    return result


@router.get("/parent-communications/students", response_model=List[StudentContactStatus])
async def get_student_contact_statuses(
    tutor_id: Optional[int] = Query(None, description="Filter by tutor ID (shows their students)"),
    location: Optional[str] = Query(None, description="Filter by location"),
    search: Optional[str] = Query(None, description="Search by student name, ID, grade, or contact notes"),
    _: Tutor = Depends(reject_guest),
    db: Session = Depends(get_db)
):
    """
    Get students with their parent contact status.
    Uses the same active enrollment filtering as "My Students" tab.
    Contact status counts contacts from ANY tutor (student-centric).
    """
    recent_threshold, warning_threshold = get_location_thresholds(db, location)

    # Get active student IDs using shared helper
    active_ids = get_active_student_ids(db, tutor_id=tutor_id, location=location)

    if not active_ids:
        return []

    students = db.query(Student).filter(Student.id.in_(active_ids)).all()

    # If search is provided, filter by name/ID/grade and also search contact notes
    if search and len(search.strip()) >= 2:
        search_lower = search.lower().strip()

        # Find student IDs with matching notes
        notes_matching_ids = set(
            row[0] for row in db.query(ParentCommunication.student_id)
            .filter(
                ParentCommunication.student_id.in_(active_ids),
                func.lower(ParentCommunication.brief_notes).contains(search_lower)
            )
            .distinct()
            .all()
        )

        students = [
            s for s in students
            if search_lower in (s.student_name or '').lower()
            or search_lower in (s.school_student_id or '').lower()
            or search_lower in (s.grade or '').lower()
            or s.id in notes_matching_ids
        ]

    # Get last contact for each student (from any tutor)
    last_contacts = {}
    subquery = db.query(
        ParentCommunication.student_id,
        func.max(ParentCommunication.contact_date).label('last_date')
    ).group_by(ParentCommunication.student_id).subquery()

    last_contact_records = db.query(
        ParentCommunication
    ).join(
        subquery,
        and_(
            ParentCommunication.student_id == subquery.c.student_id,
            ParentCommunication.contact_date == subquery.c.last_date
        )
    ).options(joinedload(ParentCommunication.tutor)).all()

    for record in last_contact_records:
        last_contacts[record.student_id] = record

    # Get pending follow-ups
    pending_followups = {}
    followup_records = db.query(ParentCommunication).filter(
        ParentCommunication.follow_up_needed == True,
        or_(
            ParentCommunication.follow_up_date == None,
            ParentCommunication.follow_up_date >= date.today()
        )
    ).options(
        joinedload(ParentCommunication.student),
        joinedload(ParentCommunication.tutor)
    ).all()
    for record in followup_records:
        if record.student_id not in pending_followups:
            pending_followups[record.student_id] = record

    # Get enrollment counts
    enrollment_counts = dict(
        db.query(Enrollment.student_id, func.count(Enrollment.id))
        .filter(Enrollment.payment_status != 'Cancelled')
        .group_by(Enrollment.student_id)
        .all()
    )

    today = date.today()
    result = []
    for student in students:
        last_contact = last_contacts.get(student.id)
        pending_fu = pending_followups.get(student.id)

        if last_contact:
            last_contact_date = last_contact.contact_date
            last_contacted_by = last_contact.tutor.tutor_name if last_contact.tutor else None
            days_since = (today - last_contact_date.date()).days
        else:
            last_contact_date = None
            last_contacted_by = None
            days_since = NEVER_CONTACTED_DAYS

        contact_status = calculate_contact_status(days_since, recent_threshold, warning_threshold)

        result.append(StudentContactStatus(
            student_id=student.id,
            student_name=student.student_name,
            school_student_id=student.school_student_id,
            grade=student.grade,
            lang_stream=student.lang_stream,
            school=student.school,
            home_location=student.home_location,
            last_contact_date=last_contact_date,
            last_contacted_by=last_contacted_by,
            days_since_contact=days_since,
            contact_status=contact_status,
            pending_follow_up=pending_fu is not None,
            follow_up_date=pending_fu.follow_up_date if pending_fu else None,
            follow_up_communication_id=pending_fu.id if pending_fu else None,
            enrollment_count=enrollment_counts.get(student.id, 0)
        ))

    # Sort by urgency: Contact Needed > Been a While > Never > Recent
    status_order = {"Contact Needed": 0, "Been a While": 1, "Never Contacted": 2, "Recent": 3}
    result.sort(key=lambda x: (status_order.get(x.contact_status, 4), -x.days_since_contact))

    return result


@router.get("/parent-communications/calendar", response_model=List[ParentCommunicationResponse])
async def get_calendar_events(
    start_date: date = Query(..., description="Start date for calendar range"),
    end_date: date = Query(..., description="End date for calendar range"),
    tutor_id: Optional[int] = Query(None, description="Filter by tutor ID"),
    location: Optional[str] = Query(None, description="Filter by location"),
    _: Tutor = Depends(reject_guest),
    db: Session = Depends(get_db)
):
    """
    Get parent communications for calendar view within a date range.
    """
    query = db.query(ParentCommunication).options(
        joinedload(ParentCommunication.student),
        joinedload(ParentCommunication.tutor)
    ).filter(
        func.date(ParentCommunication.contact_date) >= start_date,
        func.date(ParentCommunication.contact_date) <= end_date
    )

    if tutor_id:
        query = query.filter(ParentCommunication.tutor_id == tutor_id)

    if location:
        student_ids_at_location = db.query(Enrollment.student_id).filter(
            Enrollment.location == location
        ).distinct().scalar_subquery()
        query = query.filter(ParentCommunication.student_id.in_(student_ids_at_location))

    communications = query.order_by(ParentCommunication.contact_date).all()

    result = []
    for comm in communications:
        result.append(ParentCommunicationResponse(
            id=comm.id,
            student_id=comm.student_id,
            student_name=comm.student.student_name if comm.student else "Unknown",
            school_student_id=comm.student.school_student_id if comm.student else None,
            grade=comm.student.grade if comm.student else None,
            lang_stream=comm.student.lang_stream if comm.student else None,
            school=comm.student.school if comm.student else None,
            home_location=comm.student.home_location if comm.student else None,
            tutor_id=comm.tutor_id,
            tutor_name=comm.tutor.tutor_name if comm.tutor else "Unknown",
            contact_date=comm.contact_date,
            contact_method=comm.contact_method,
            contact_type=comm.contact_type,
            brief_notes=comm.brief_notes,
            follow_up_needed=comm.follow_up_needed,
            follow_up_date=comm.follow_up_date,
            created_at=comm.created_at,
            created_by=comm.created_by
        ))

    return result


@router.get("/parent-communications/pending-followups", response_model=List[StudentContactStatus])
async def get_pending_followups(
    tutor_id: Optional[int] = Query(None, description="Filter by tutor ID"),
    location: Optional[str] = Query(None, description="Filter by location"),
    _: Tutor = Depends(reject_guest),
    db: Session = Depends(get_db)
):
    """
    Get students with pending follow-ups.
    """
    recent_threshold, warning_threshold = get_location_thresholds(db, location)

    query = db.query(ParentCommunication).options(
        joinedload(ParentCommunication.student),
        joinedload(ParentCommunication.tutor)
    ).filter(
        ParentCommunication.follow_up_needed == True
    )

    if tutor_id:
        query = query.filter(ParentCommunication.tutor_id == tutor_id)

    if location:
        student_ids_at_location = db.query(Enrollment.student_id).filter(
            Enrollment.location == location
        ).distinct().scalar_subquery()
        query = query.filter(ParentCommunication.student_id.in_(student_ids_at_location))

    followups = query.order_by(ParentCommunication.follow_up_date).all()

    # Group by student, keeping only the most urgent follow-up
    student_followups = {}
    for fu in followups:
        if fu.student_id not in student_followups:
            student_followups[fu.student_id] = fu

    # Get enrollment counts
    enrollment_counts = dict(
        db.query(Enrollment.student_id, func.count(Enrollment.id))
        .filter(Enrollment.payment_status != 'Cancelled')
        .group_by(Enrollment.student_id)
        .all()
    )

    # Batch-fetch last contacts for all students with pending followups (avoid N+1)
    student_ids = list(student_followups.keys())
    last_contacts = {}
    if student_ids:
        # Subquery to get max contact date per student
        subquery = db.query(
            ParentCommunication.student_id,
            func.max(ParentCommunication.contact_date).label('last_date')
        ).filter(
            ParentCommunication.student_id.in_(student_ids)
        ).group_by(ParentCommunication.student_id).subquery()

        # Join to get full records with tutor info
        last_contact_records = db.query(
            ParentCommunication
        ).join(
            subquery,
            and_(
                ParentCommunication.student_id == subquery.c.student_id,
                ParentCommunication.contact_date == subquery.c.last_date
            )
        ).options(joinedload(ParentCommunication.tutor)).all()

        for record in last_contact_records:
            last_contacts[record.student_id] = record

    today = date.today()
    result = []
    for student_id, fu in student_followups.items():
        student = fu.student
        if not student:
            continue

        # Use pre-fetched last contact data
        last_contact = last_contacts.get(student_id)

        if last_contact:
            days_since = (today - last_contact.contact_date.date()).days
            last_contacted_by = last_contact.tutor.tutor_name if last_contact.tutor else None
        else:
            days_since = NEVER_CONTACTED_DAYS
            last_contacted_by = None

        contact_status = calculate_contact_status(days_since, recent_threshold, warning_threshold)

        result.append(StudentContactStatus(
            student_id=student.id,
            student_name=student.student_name,
            school_student_id=student.school_student_id,
            grade=student.grade,
            lang_stream=student.lang_stream,
            school=student.school,
            home_location=student.home_location,
            last_contact_date=last_contact.contact_date if last_contact else None,
            last_contacted_by=last_contacted_by,
            days_since_contact=days_since,
            contact_status=contact_status,
            pending_follow_up=True,
            follow_up_date=fu.follow_up_date,
            follow_up_communication_id=fu.id,
            enrollment_count=enrollment_counts.get(student.id, 0)
        ))

    # Sort by follow-up date (overdue first, then upcoming)
    result.sort(key=lambda x: x.follow_up_date or date.max)

    return result


@router.get("/parent-communications/contact-needed-count")
async def get_contact_needed_count(
    tutor_id: Optional[int] = Query(None, description="Filter by tutor ID"),
    location: Optional[str] = Query(None, description="Filter by location"),
    _: Tutor = Depends(reject_guest),
    db: Session = Depends(get_db)
):
    """
    Get count of students who need to be contacted (for dashboard badge).
    Uses the same active student filtering as the students list page.
    """
    _, warning_threshold = get_location_thresholds(db, location)

    # Get active student IDs using the same filtering as the page
    active_ids = get_active_student_ids(db, tutor_id=tutor_id, location=location)

    if not active_ids:
        return {"count": 0}

    cutoff_date = date.today() - timedelta(days=warning_threshold)

    # Subquery to get max contact date per student
    last_contact_subquery = db.query(
        ParentCommunication.student_id,
        func.max(ParentCommunication.contact_date).label('last_date')
    ).group_by(ParentCommunication.student_id).subquery()

    # Count active students where either:
    # 1. No contact record exists (never contacted)
    # 2. Last contact was before the cutoff date
    count = db.query(func.count(Student.id)).filter(
        Student.id.in_(active_ids)
    ).outerjoin(
        last_contact_subquery,
        Student.id == last_contact_subquery.c.student_id
    ).filter(
        or_(
            last_contact_subquery.c.last_date == None,
            last_contact_subquery.c.last_date < cutoff_date
        )
    ).scalar()

    return {"count": count or 0}


@router.get("/parent-communications/stats", response_model=ParentCommunicationStats)
async def get_communication_stats(
    tutor_id: Optional[int] = Query(None, description="Filter by tutor ID"),
    location: Optional[str] = Query(None, description="Filter by location"),
    _: Tutor = Depends(reject_guest),
    db: Session = Depends(get_db)
):
    """Get aggregated statistics for parent communications dashboard."""
    recent_threshold, _ = get_location_thresholds(db, location)
    today = date.today()

    # Active students
    active_ids = get_active_student_ids(db, tutor_id=tutor_id, location=location)
    total_active = len(active_ids)

    if total_active == 0:
        return ParentCommunicationStats()

    # Students contacted within recent threshold
    recent_cutoff = today - timedelta(days=recent_threshold)
    recently_contacted_ids = set(
        row[0] for row in db.query(ParentCommunication.student_id)
        .filter(
            ParentCommunication.student_id.in_(active_ids),
            ParentCommunication.contact_date >= recent_cutoff
        )
        .distinct()
        .all()
    )
    students_contacted = len(recently_contacted_ids)
    coverage = round(students_contacted / total_active * 100, 1) if total_active > 0 else 0

    # Build base filters for tutor/location scoping
    base_filters = []
    if tutor_id:
        base_filters.append(ParentCommunication.tutor_id == tutor_id)
    if location:
        location_student_ids = db.query(Enrollment.student_id).filter(
            Enrollment.location == location
        ).distinct().scalar_subquery()
        base_filters.append(ParentCommunication.student_id.in_(location_student_ids))

    # Combined query: type distribution (30d) + weekly activity (saves 2 round-trips)
    thirty_days_ago = today - timedelta(days=30)
    week_start = today - timedelta(days=today.weekday())  # Monday
    last_week_start = week_start - timedelta(days=7)

    combined = db.query(
        func.count(case(
            (and_(
                ParentCommunication.contact_date >= thirty_days_ago,
                ParentCommunication.contact_type == 'Progress Update'
            ), ParentCommunication.id),
        )).label('progress_count'),
        func.count(case(
            (and_(
                ParentCommunication.contact_date >= thirty_days_ago,
                ParentCommunication.contact_type == 'Concern'
            ), ParentCommunication.id),
        )).label('concern_count'),
        func.count(case(
            (and_(
                ParentCommunication.contact_date >= thirty_days_ago,
                ParentCommunication.contact_type == 'General'
            ), ParentCommunication.id),
        )).label('general_count'),
        func.count(case(
            (ParentCommunication.contact_date >= week_start, ParentCommunication.id),
        )).label('this_week'),
        func.count(case(
            (and_(
                ParentCommunication.contact_date >= last_week_start,
                ParentCommunication.contact_date < week_start
            ), ParentCommunication.id),
        )).label('last_week'),
    ).filter(
        ParentCommunication.contact_date >= thirty_days_ago,
        *base_filters
    ).first()

    # Average days since last contact (for contacted students only)
    last_contact_subq = db.query(
        ParentCommunication.student_id,
        func.max(ParentCommunication.contact_date).label('last_date')
    ).filter(
        ParentCommunication.student_id.in_(active_ids)
    ).group_by(ParentCommunication.student_id).subquery()

    avg_days_rows = db.query(last_contact_subq.c.last_date).all()
    avg_days = None
    if avg_days_rows:
        contacted_rows = [r for r in avg_days_rows if r[0]]
        if contacted_rows:
            total_days = sum((today - row[0].date()).days for row in contacted_rows)
            avg_days = round(total_days / len(contacted_rows), 1)

    # Pending follow-ups count
    followup_count = db.query(func.count(ParentCommunication.id)).filter(
        ParentCommunication.follow_up_needed == True, *base_filters
    ).scalar() or 0

    return ParentCommunicationStats(
        total_active_students=total_active,
        students_contacted_recently=students_contacted,
        contact_coverage_percent=coverage,
        progress_update_count=combined.progress_count if combined else 0,
        concern_count=combined.concern_count if combined else 0,
        general_count=combined.general_count if combined else 0,
        contacts_this_week=combined.this_week if combined else 0,
        contacts_last_week=combined.last_week if combined else 0,
        average_days_since_contact=avg_days,
        pending_followups_count=followup_count,
    )


@router.get("/parent-communications/{communication_id}", response_model=ParentCommunicationResponse)
async def get_communication(
    communication_id: int,
    _: Tutor = Depends(reject_guest),
    db: Session = Depends(get_db)
):
    """
    Get a single parent communication by ID.
    """
    comm = db.query(ParentCommunication).options(
        joinedload(ParentCommunication.student),
        joinedload(ParentCommunication.tutor)
    ).filter(ParentCommunication.id == communication_id).first()

    if not comm:
        raise HTTPException(status_code=404, detail="Communication not found")

    return ParentCommunicationResponse(
        id=comm.id,
        student_id=comm.student_id,
        student_name=comm.student.student_name if comm.student else "Unknown",
        school_student_id=comm.student.school_student_id if comm.student else None,
        grade=comm.student.grade if comm.student else None,
        lang_stream=comm.student.lang_stream if comm.student else None,
        school=comm.student.school if comm.student else None,
        home_location=comm.student.home_location if comm.student else None,
        tutor_id=comm.tutor_id,
        tutor_name=comm.tutor.tutor_name if comm.tutor else "Unknown",
        contact_date=comm.contact_date,
        contact_method=comm.contact_method,
        contact_type=comm.contact_type,
        brief_notes=comm.brief_notes,
        follow_up_needed=comm.follow_up_needed,
        follow_up_date=comm.follow_up_date,
        created_at=comm.created_at,
        created_by=comm.created_by
    )


@router.post("/parent-communications", response_model=ParentCommunicationResponse)
async def create_communication(
    data: ParentCommunicationCreate,
    tutor_id: int = Query(..., description="Tutor ID creating this record"),
    created_by: str = Query(..., description="Email of user creating this record"),
    db: Session = Depends(get_db)
):
    """
    Create a new parent communication record.
    """
    # Verify student exists
    student = db.query(Student).filter(Student.id == data.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Verify tutor exists
    tutor = db.query(Tutor).filter(Tutor.id == tutor_id).first()
    if not tutor:
        raise HTTPException(status_code=404, detail="Tutor not found")

    comm = ParentCommunication(
        student_id=data.student_id,
        tutor_id=tutor_id,
        contact_date=data.contact_date or hk_now(),
        contact_method=data.contact_method,
        contact_type=data.contact_type,
        brief_notes=data.brief_notes,
        follow_up_needed=data.follow_up_needed,
        follow_up_date=data.follow_up_date,
        created_by=created_by
    )

    db.add(comm)
    db.commit()
    db.refresh(comm)

    return ParentCommunicationResponse(
        id=comm.id,
        student_id=comm.student_id,
        student_name=student.student_name,
        school_student_id=student.school_student_id,
        grade=student.grade,
        lang_stream=student.lang_stream,
        school=student.school,
        home_location=student.home_location,
        tutor_id=comm.tutor_id,
        tutor_name=tutor.tutor_name,
        contact_date=comm.contact_date,
        contact_method=comm.contact_method,
        contact_type=comm.contact_type,
        brief_notes=comm.brief_notes,
        follow_up_needed=comm.follow_up_needed,
        follow_up_date=comm.follow_up_date,
        created_at=comm.created_at,
        created_by=comm.created_by
    )


@router.put("/parent-communications/{communication_id}", response_model=ParentCommunicationResponse)
async def update_communication(
    communication_id: int,
    data: ParentCommunicationUpdate,
    db: Session = Depends(get_db)
):
    """
    Update an existing parent communication record.
    """
    comm = db.query(ParentCommunication).options(
        joinedload(ParentCommunication.student),
        joinedload(ParentCommunication.tutor)
    ).filter(ParentCommunication.id == communication_id).first()

    if not comm:
        raise HTTPException(status_code=404, detail="Communication not found")

    # Update fields if provided
    if data.contact_method is not None:
        comm.contact_method = data.contact_method
    if data.contact_type is not None:
        comm.contact_type = data.contact_type
    if data.brief_notes is not None:
        comm.brief_notes = data.brief_notes
    if data.follow_up_needed is not None:
        comm.follow_up_needed = data.follow_up_needed
    if data.follow_up_date is not None:
        comm.follow_up_date = data.follow_up_date
    if data.contact_date is not None:
        comm.contact_date = data.contact_date

    db.commit()
    db.refresh(comm)

    return ParentCommunicationResponse(
        id=comm.id,
        student_id=comm.student_id,
        student_name=comm.student.student_name if comm.student else "Unknown",
        school_student_id=comm.student.school_student_id if comm.student else None,
        grade=comm.student.grade if comm.student else None,
        lang_stream=comm.student.lang_stream if comm.student else None,
        school=comm.student.school if comm.student else None,
        home_location=comm.student.home_location if comm.student else None,
        tutor_id=comm.tutor_id,
        tutor_name=comm.tutor.tutor_name if comm.tutor else "Unknown",
        contact_date=comm.contact_date,
        contact_method=comm.contact_method,
        contact_type=comm.contact_type,
        brief_notes=comm.brief_notes,
        follow_up_needed=comm.follow_up_needed,
        follow_up_date=comm.follow_up_date,
        created_at=comm.created_at,
        created_by=comm.created_by
    )


@router.delete("/parent-communications/{communication_id}")
async def delete_communication(
    communication_id: int,
    deleted_by: Optional[str] = Query(None, description="Email of user deleting this record"),
    db: Session = Depends(get_db)
):
    """
    Delete a parent communication record.
    Logs deletion details for audit purposes.
    """
    comm = db.query(ParentCommunication).options(
        joinedload(ParentCommunication.student),
        joinedload(ParentCommunication.tutor)
    ).filter(
        ParentCommunication.id == communication_id
    ).first()

    if not comm:
        raise HTTPException(status_code=404, detail="Communication not found")

    # Log audit information before deletion
    import logging
    logger = logging.getLogger(__name__)
    logger.info(
        f"AUDIT: Parent communication deleted - "
        f"ID: {comm.id}, "
        f"Student: {comm.student.student_name if comm.student else 'Unknown'} (ID: {comm.student_id}), "
        f"Tutor: {comm.tutor.tutor_name if comm.tutor else 'Unknown'} (ID: {comm.tutor_id}), "
        f"Date: {comm.contact_date}, "
        f"Method: {comm.contact_method}, "
        f"Type: {comm.contact_type}, "
        f"Notes: {comm.brief_notes[:100] if comm.brief_notes else 'None'}..., "
        f"Created by: {comm.created_by}, "
        f"Deleted by: {deleted_by or 'Unknown'}"
    )

    db.delete(comm)
    db.commit()

    return {"message": "Communication deleted successfully"}


# ============================================
# Location Settings Endpoints
# ============================================

@router.get("/location-settings/{location}", response_model=LocationSettingsResponse)
async def get_location_settings(
    location: str,
    _: Tutor = Depends(reject_guest),
    db: Session = Depends(get_db)
):
    """
    Get settings for a specific location.
    """
    settings = db.query(LocationSettings).filter(
        LocationSettings.location == location
    ).first()

    if not settings:
        # Return defaults if no settings exist
        return LocationSettingsResponse(
            id=0,
            location=location,
            contact_recent_days=DEFAULT_RECENT_DAYS,
            contact_warning_days=DEFAULT_WARNING_DAYS
        )

    return settings


@router.put("/location-settings/{location}", response_model=LocationSettingsResponse)
async def update_location_settings(
    location: str,
    data: LocationSettingsUpdate,
    db: Session = Depends(get_db)
):
    """
    Update settings for a specific location.
    Creates the settings if they don't exist.
    """
    settings = db.query(LocationSettings).filter(
        LocationSettings.location == location
    ).first()

    if not settings:
        # Create new settings
        settings = LocationSettings(
            location=location,
            contact_recent_days=data.contact_recent_days or DEFAULT_RECENT_DAYS,
            contact_warning_days=data.contact_warning_days or DEFAULT_WARNING_DAYS
        )
        db.add(settings)
    else:
        # Update existing settings
        if data.contact_recent_days is not None:
            settings.contact_recent_days = data.contact_recent_days
        if data.contact_warning_days is not None:
            settings.contact_warning_days = data.contact_warning_days

    db.commit()
    db.refresh(settings)

    return settings
