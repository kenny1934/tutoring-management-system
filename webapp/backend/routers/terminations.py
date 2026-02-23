"""
Terminations API endpoints.
Provides endpoints for quarterly termination reporting.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import text, func, and_
from typing import List, Optional
from collections import defaultdict
from datetime import date, datetime, timedelta
from database import get_db
from models import TerminationRecord, Student, Tutor, Enrollment
import calendar
from schemas import (
    TerminatedStudentResponse,
    TerminationRecordUpdate,
    TerminationRecordResponse,
    TutorTerminationStats,
    LocationTerminationStats,
    TerminationStatsResponse,
    QuarterOption,
    QuarterTrendPoint,
    TerminationReviewCount,
    StatDetailStudent
)
from auth.dependencies import require_admin_write, get_current_user, get_effective_role

router = APIRouter()

# Custom Quarter definitions (start_month, start_day, end_month, end_day)
# Q4 crosses the year boundary: Oct 22 - Jan 21 of next year
QUARTERS = {
    1: (1, 22, 4, 21),   # Jan 22 - Apr 21
    2: (4, 22, 7, 21),   # Apr 22 - Jul 21
    3: (7, 22, 10, 21),  # Jul 22 - Oct 21
    4: (10, 22, 1, 21),  # Oct 22 - Jan 21 (next year)
}

OPENING_PERIOD_DAYS = 7  # Jan 22-28, Apr 22-28, Jul 22-28, Oct 22-28


def get_quarter_dates(year: int, quarter: int):
    """
    Get key dates for a quarter.

    Args:
        year: The reporting year for the quarter
        quarter: Quarter number (1-4)

    Returns:
        tuple: (opening_start, opening_end, closing_end)

    Note: For Q4, the year parameter is the start year.
          Q4 2025 runs from Oct 22, 2025 to Jan 21, 2026.
    """
    start_month, start_day, end_month, end_day = QUARTERS[quarter]

    # Opening period start and end
    opening_start = date(year, start_month, start_day)
    opening_end = date(year, start_month, start_day + OPENING_PERIOD_DAYS - 1)

    # Closing end date
    if quarter == 4:
        # Q4 ends in January of the NEXT year
        closing_end = date(year + 1, end_month, end_day)
    else:
        closing_end = date(year, end_month, end_day)

    return opening_start, opening_end, closing_end


def get_quarter_for_date(d: date) -> tuple:
    """
    Get the custom quarter and reporting year for a given date.

    Args:
        d: The date to classify

    Returns:
        tuple: (quarter_number, reporting_year)

    Examples:
        - Jan 15, 2026 -> (4, 2025)  # Part of Q4 2025
        - Jan 25, 2026 -> (1, 2026)  # Part of Q1 2026
        - Oct 25, 2025 -> (4, 2025)  # Part of Q4 2025
    """
    month = d.month
    day = d.day
    year = d.year

    # Oct 22 or later -> Q4 of current year
    if (month == 10 and day >= 22) or month > 10:
        return 4, year
    # Jul 22 to Oct 21 -> Q3
    elif (month == 7 and day >= 22) or (month > 7 and month < 10) or (month == 10 and day < 22):
        return 3, year
    # Apr 22 to Jul 21 -> Q2
    elif (month == 4 and day >= 22) or (month > 4 and month < 7) or (month == 7 and day < 22):
        return 2, year
    # Jan 22 to Apr 21 -> Q1
    elif (month == 1 and day >= 22) or (month > 1 and month < 4) or (month == 4 and day < 22):
        return 1, year
    # Jan 1-21 -> Q4 of PREVIOUS year
    else:
        return 4, year - 1


@router.get("/terminations/quarters", response_model=List[QuarterOption])
async def get_available_quarters(
    request: Request,
    location: Optional[str] = Query(None, description="Filter by location"),
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get list of quarters that have terminated students.
    Returns quarters in descending order (most recent first).

    Scans enrollments directly instead of using the terminated_students view,
    so that comeback students don't erase historical quarter data.
    """
    if get_effective_role(request, current_user) == "Guest":
        raise HTTPException(status_code=403, detail="Guest access not permitted for termination data")
    query = text("""
        SELECT DISTINCT
            calculate_effective_end_date(
                e.first_lesson_date,
                e.lessons_paid,
                COALESCE(e.deadline_extension_weeks, 0)
            ) as eff_end_date
        FROM enrollments e
        JOIN students s ON e.student_id = s.id
        WHERE e.payment_status IN ('Paid', 'Pending Payment')
        AND e.enrollment_type = 'Regular'
        AND e.first_lesson_date IS NOT NULL
        AND (:location IS NULL OR s.home_location = :location)
    """)

    result = db.execute(query, {"location": location})
    rows = result.fetchall()

    # Collect distinct quarters from enrollment end dates
    seen_quarters: set = set()
    for row in rows:
        if row.eff_end_date:
            q, y = get_quarter_for_date(row.eff_end_date)
            seen_quarters.add((q, y))

    # Filter out current and future quarters (not yet ready for review)
    current_q, current_y = get_quarter_for_date(date.today())

    quarters = [
        QuarterOption(quarter=q, year=y)
        for q, y in sorted(seen_quarters, key=lambda x: (x[1], x[0]), reverse=True)
        if (y, q) < (current_y, current_q)
    ]

    return quarters


@router.get("/terminations", response_model=List[TerminatedStudentResponse])
async def get_terminated_students(
    request: Request,
    quarter: int = Query(..., ge=1, le=4, description="Quarter (1-4)"),
    year: int = Query(..., ge=2020, description="Year"),
    location: Optional[str] = Query(None, description="Filter by location"),
    tutor_id: Optional[int] = Query(None, description="Filter by tutor ID (for role-based filtering)"),
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get terminated students for a specific quarter with their editable records.
    Includes reason and count_as_terminated from termination_records table.

    Uses direct enrollment query instead of terminated_students view to ensure
    historical stability: comeback students don't erase past quarter data.
    Enrollments starting >30 days after quarter end are ignored (comebacks).
    """
    if get_effective_role(request, current_user) == "Guest":
        raise HTTPException(status_code=403, detail="Guest access not permitted for termination data")

    opening_start, _, closing_end = get_quarter_dates(year, quarter)

    query = text("""
        WITH quarter_enrollments AS (
            SELECT e.*,
                   calculate_effective_end_date(
                       e.first_lesson_date,
                       e.lessons_paid,
                       COALESCE(e.deadline_extension_weeks, 0)
                   ) as eff_end_date,
                   ROW_NUMBER() OVER (
                       PARTITION BY e.student_id
                       ORDER BY e.first_lesson_date DESC
                   ) as rn
            FROM enrollments e
            WHERE e.payment_status IN ('Paid', 'Pending Payment')
            AND e.enrollment_type = 'Regular'
            AND e.first_lesson_date IS NOT NULL
            AND e.first_lesson_date <= DATE_ADD(:closing_end, INTERVAL 30 DAY)
        ),
        termed AS (
            SELECT qe.student_id, qe.tutor_id,
                   qe.eff_end_date as termination_date,
                   qe.assigned_time, qe.assigned_day
            FROM quarter_enrollments qe
            WHERE qe.rn = 1
            AND qe.eff_end_date >= :opening_start
            AND qe.eff_end_date <= :closing_end
        )
        SELECT
            te.student_id,
            s.student_name,
            s.school_student_id,
            s.grade,
            s.home_location,
            te.termination_date,
            te.tutor_id,
            t.tutor_name,
            CONCAT('[', te.assigned_time, '], ', te.assigned_day) as schedule,
            tr.id as record_id,
            tr.reason,
            tr.reason_category,
            COALESCE(tr.count_as_terminated, FALSE) as count_as_terminated
        FROM termed te
        JOIN students s ON te.student_id = s.id
        LEFT JOIN tutors t ON te.tutor_id = t.id
        LEFT JOIN termination_records tr ON te.student_id = tr.student_id
            AND tr.quarter = :quarter AND tr.year = :year
        WHERE (:location IS NULL OR s.home_location = :location)
        AND (:tutor_id IS NULL OR te.tutor_id = :tutor_id)
        ORDER BY t.tutor_name, s.student_name
    """)

    result = db.execute(query, {
        "quarter": quarter,
        "year": year,
        "opening_start": opening_start,
        "closing_end": closing_end,
        "location": location,
        "tutor_id": tutor_id
    })
    rows = result.fetchall()

    return [
        TerminatedStudentResponse(
            student_id=row.student_id,
            student_name=row.student_name,
            school_student_id=row.school_student_id,
            grade=row.grade,
            home_location=row.home_location,
            termination_date=row.termination_date,
            tutor_id=row.tutor_id,
            tutor_name=row.tutor_name,
            schedule=row.schedule,
            record_id=row.record_id,
            reason=row.reason,
            reason_category=row.reason_category,
            count_as_terminated=bool(row.count_as_terminated)
        )
        for row in rows
    ]


@router.put("/terminations/{student_id}", response_model=TerminationRecordResponse)
async def update_termination_record(
    student_id: int,
    data: TerminationRecordUpdate,
    admin: Tutor = Depends(require_admin_write),
    updated_by: str = Query(..., description="Email of user making the update"),
    db: Session = Depends(get_db)
):
    """
    Create or update a termination record for a student. Admin only.
    Uses UPSERT behavior - creates if not exists, updates if exists.
    """
    # Verify student exists
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Get tutor_id from latest enrollment within the quarter window
    # (scoped to quarter_end + 30 days to ignore comeback enrollments)
    _, _, closing_end = get_quarter_dates(data.year, data.quarter)
    latest_enrollment = db.execute(text("""
        SELECT tutor_id FROM enrollments
        WHERE student_id = :student_id
        AND payment_status IN ('Paid', 'Pending Payment')
        AND enrollment_type = 'Regular'
        AND first_lesson_date IS NOT NULL
        AND first_lesson_date <= DATE_ADD(:closing_end, INTERVAL 30 DAY)
        ORDER BY first_lesson_date DESC
        LIMIT 1
    """), {"student_id": student_id, "closing_end": closing_end}).fetchone()
    tutor_id = latest_enrollment.tutor_id if latest_enrollment else None

    # Check if record exists
    existing = db.query(TerminationRecord).filter(
        TerminationRecord.student_id == student_id,
        TerminationRecord.quarter == data.quarter,
        TerminationRecord.year == data.year
    ).first()

    if existing:
        # Update existing record
        existing.reason = data.reason
        existing.reason_category = data.reason_category
        existing.count_as_terminated = data.count_as_terminated
        existing.updated_by = updated_by
        existing.tutor_id = tutor_id
        db.commit()
        db.refresh(existing)
        return TerminationRecordResponse(
            id=existing.id,
            student_id=existing.student_id,
            quarter=existing.quarter,
            year=existing.year,
            reason=existing.reason,
            reason_category=existing.reason_category,
            count_as_terminated=existing.count_as_terminated,
            tutor_id=existing.tutor_id,
            updated_by=existing.updated_by,
            updated_at=existing.updated_at
        )
    else:
        # Create new record
        new_record = TerminationRecord(
            student_id=student_id,
            quarter=data.quarter,
            year=data.year,
            reason=data.reason,
            reason_category=data.reason_category,
            count_as_terminated=data.count_as_terminated,
            tutor_id=tutor_id,
            updated_by=updated_by
        )
        db.add(new_record)
        db.commit()
        db.refresh(new_record)
        return TerminationRecordResponse(
            id=new_record.id,
            student_id=new_record.student_id,
            quarter=new_record.quarter,
            year=new_record.year,
            reason=new_record.reason,
            reason_category=new_record.reason_category,
            count_as_terminated=new_record.count_as_terminated,
            tutor_id=new_record.tutor_id,
            updated_by=new_record.updated_by,
            updated_at=new_record.updated_at
        )


@router.get("/terminations/stats", response_model=TerminationStatsResponse)
async def get_termination_stats(
    request: Request,
    quarter: int = Query(..., ge=1, le=4, description="Quarter (1-4)"),
    year: int = Query(..., ge=2020, description="Year"),
    location: Optional[str] = Query(None, description="Filter by location"),
    tutor_id: Optional[int] = Query(None, description="Filter by tutor ID (for role-based filtering)"),
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get aggregated termination stats per tutor and for the location.

    Stats calculation:
    - Opening: Students with active enrollments during first week of quarter (days 1-7)
    - Terminated: Students marked with count_as_terminated=true for this quarter
    - Closing: Students with enrollments having effective_end_date > quarter end
    - Term Rate: Terminated / Opening (0 if opening is 0)
    """
    if get_effective_role(request, current_user) == "Guest":
        raise HTTPException(status_code=403, detail="Guest access not permitted for termination data")
    opening_start, opening_end, closing_end = get_quarter_dates(year, quarter)
    prev_closing_end = opening_start - timedelta(days=1)

    # Query for Opening count per tutor
    # Count distinct students active during opening week (new + continuing),
    # plus continuing students whose renewal starts within 21 days after
    # opening_end (accounts for holidays delaying renewals).
    opening_query = text("""
        SELECT
            e.tutor_id,
            t.tutor_name,
            COUNT(DISTINCT e.student_id) as opening_count
        FROM enrollments e
        JOIN tutors t ON e.tutor_id = t.id
        JOIN students s ON e.student_id = s.id
        WHERE e.payment_status IN ('Paid', 'Pending Payment')
        AND e.enrollment_type = 'Regular'
        AND e.first_lesson_date IS NOT NULL
        AND e.first_lesson_date <= DATE_ADD(:opening_end, INTERVAL 21 DAY)
        AND calculate_effective_end_date(
            e.first_lesson_date,
            e.lessons_paid,
            COALESCE(e.deadline_extension_weeks, 0)
        ) >= :opening_start
        AND (
            e.first_lesson_date <= :opening_end
            OR e.student_id IN (
                SELECT DISTINCT e2.student_id
                FROM enrollments e2
                WHERE e2.payment_status IN ('Paid', 'Pending Payment')
                AND e2.enrollment_type = 'Regular'
                AND e2.first_lesson_date IS NOT NULL
                AND e2.first_lesson_date <= :opening_end
                AND calculate_effective_end_date(
                    e2.first_lesson_date,
                    e2.lessons_paid,
                    COALESCE(e2.deadline_extension_weeks, 0)
                ) >= DATE_SUB(:prev_closing_end, INTERVAL 21 DAY)
            )
        )
        AND (:location IS NULL OR e.location = :location)
        AND (:tutor_id IS NULL OR e.tutor_id = :tutor_id)
        GROUP BY e.tutor_id, t.tutor_name
    """)

    opening_result = db.execute(opening_query, {
        "opening_start": opening_start,
        "opening_end": opening_end,
        "prev_closing_end": prev_closing_end,
        "location": location,
        "tutor_id": tutor_id
    })
    opening_rows = {row.tutor_id: (row.tutor_name, row.opening_count) for row in opening_result.fetchall()}

    # Query for Closing count per tutor
    # Count distinct students still active at quarter end (or renewing right after).
    # Includes renewals starting within 21 days after quarter end (accounts for
    # holidays and consecutive holidays where students may not return for weeks),
    # but only if the student had an enrollment during this quarter (not brand new).
    closing_query = text("""
        SELECT
            e.tutor_id,
            t.tutor_name,
            COUNT(DISTINCT e.student_id) as closing_count
        FROM enrollments e
        JOIN tutors t ON e.tutor_id = t.id
        JOIN students s ON e.student_id = s.id
        WHERE e.payment_status IN ('Paid', 'Pending Payment')
        AND e.enrollment_type = 'Regular'
        AND e.first_lesson_date IS NOT NULL
        AND e.first_lesson_date <= DATE_ADD(:closing_end, INTERVAL 21 DAY)
        AND calculate_effective_end_date(
            e.first_lesson_date,
            e.lessons_paid,
            COALESCE(e.deadline_extension_weeks, 0)
        ) > :closing_end
        AND e.student_id IN (
            SELECT DISTINCT e2.student_id
            FROM enrollments e2
            WHERE e2.payment_status IN ('Paid', 'Pending Payment')
            AND e2.enrollment_type = 'Regular'
            AND e2.first_lesson_date IS NOT NULL
            AND e2.first_lesson_date <= :closing_end
            AND calculate_effective_end_date(
                e2.first_lesson_date,
                e2.lessons_paid,
                COALESCE(e2.deadline_extension_weeks, 0)
            ) >= :opening_start
        )
        AND (:location IS NULL OR e.location = :location)
        AND (:tutor_id IS NULL OR e.tutor_id = :tutor_id)
        GROUP BY e.tutor_id, t.tutor_name
    """)

    closing_result = db.execute(closing_query, {
        "opening_start": opening_start,
        "closing_end": closing_end,
        "location": location,
        "tutor_id": tutor_id
    })
    closing_rows = {row.tutor_id: row.closing_count for row in closing_result.fetchall()}

    # Query for Terminated count per tutor
    # Uses same CTE logic as the terminated students list to ensure consistency:
    # only counts students who actually appear in the list AND are marked count_as_terminated
    terminated_query = text("""
        WITH quarter_enrollments AS (
            SELECT e.*,
                   calculate_effective_end_date(
                       e.first_lesson_date,
                       e.lessons_paid,
                       COALESCE(e.deadline_extension_weeks, 0)
                   ) as eff_end_date,
                   ROW_NUMBER() OVER (
                       PARTITION BY e.student_id
                       ORDER BY e.first_lesson_date DESC
                   ) as rn
            FROM enrollments e
            WHERE e.payment_status IN ('Paid', 'Pending Payment')
            AND e.enrollment_type = 'Regular'
            AND e.first_lesson_date IS NOT NULL
            AND e.first_lesson_date <= DATE_ADD(:closing_end, INTERVAL 30 DAY)
        ),
        termed AS (
            SELECT qe.student_id, qe.tutor_id
            FROM quarter_enrollments qe
            WHERE qe.rn = 1
            AND qe.eff_end_date >= :opening_start
            AND qe.eff_end_date <= :closing_end
        )
        SELECT
            te.tutor_id,
            t.tutor_name,
            COUNT(*) as terminated_count
        FROM termed te
        JOIN students s ON te.student_id = s.id
        JOIN termination_records tr ON te.student_id = tr.student_id
            AND tr.quarter = :quarter AND tr.year = :year
        JOIN tutors t ON te.tutor_id = t.id
        WHERE tr.count_as_terminated = TRUE
        AND (:location IS NULL OR s.home_location = :location)
        AND (:tutor_id IS NULL OR te.tutor_id = :tutor_id)
        GROUP BY te.tutor_id, t.tutor_name
    """)

    terminated_result = db.execute(terminated_query, {
        "quarter": quarter,
        "year": year,
        "opening_start": opening_start,
        "closing_end": closing_end,
        "location": location,
        "tutor_id": tutor_id
    })
    terminated_rows = {row.tutor_id: row.terminated_count for row in terminated_result.fetchall()}

    # Get all tutors who have any data
    all_tutor_ids = set(opening_rows.keys()) | set(closing_rows.keys()) | set(terminated_rows.keys())

    # Build tutor stats
    tutor_stats = []
    for tid in all_tutor_ids:
        tutor_name = opening_rows.get(tid, (None, 0))[0]
        if not tutor_name:
            tutor = db.query(Tutor).filter(Tutor.id == tid).first()
            tutor_name = tutor.tutor_name if tutor else f"Tutor {tid}"

        opening = opening_rows.get(tid, (tutor_name, 0))[1]
        terminated = terminated_rows.get(tid, 0)
        closing = closing_rows.get(tid, 0)
        enrollment_transfer = closing - opening + terminated
        term_rate = round(terminated / opening * 100, 1) if opening > 0 else 0.0

        tutor_stats.append(TutorTerminationStats(
            tutor_id=tid,
            tutor_name=tutor_name,
            opening=opening,
            enrollment_transfer=enrollment_transfer,
            terminated=terminated,
            closing=closing,
            term_rate=term_rate
        ))

    tutor_stats.sort(key=lambda x: x.tutor_name)

    # Location-wide totals: count unique students (not sum of per-tutor counts,
    # which double-counts students enrolled with multiple tutors)
    location_opening_query = text("""
        SELECT COUNT(DISTINCT e.student_id) as cnt
        FROM enrollments e
        JOIN students s ON e.student_id = s.id
        WHERE e.payment_status IN ('Paid', 'Pending Payment')
        AND e.enrollment_type = 'Regular'
        AND e.first_lesson_date IS NOT NULL
        AND e.first_lesson_date <= DATE_ADD(:opening_end, INTERVAL 21 DAY)
        AND calculate_effective_end_date(
            e.first_lesson_date, e.lessons_paid,
            COALESCE(e.deadline_extension_weeks, 0)
        ) >= :opening_start
        AND (
            e.first_lesson_date <= :opening_end
            OR e.student_id IN (
                SELECT DISTINCT e2.student_id
                FROM enrollments e2
                WHERE e2.payment_status IN ('Paid', 'Pending Payment')
                AND e2.enrollment_type = 'Regular'
                AND e2.first_lesson_date IS NOT NULL
                AND e2.first_lesson_date <= :opening_end
                AND calculate_effective_end_date(
                    e2.first_lesson_date, e2.lessons_paid,
                    COALESCE(e2.deadline_extension_weeks, 0)
                ) >= DATE_SUB(:prev_closing_end, INTERVAL 21 DAY)
            )
        )
        AND (:location IS NULL OR e.location = :location)
        AND (:tutor_id IS NULL OR e.tutor_id = :tutor_id)
    """)
    total_opening = db.execute(location_opening_query, {
        "opening_start": opening_start, "opening_end": opening_end,
        "prev_closing_end": prev_closing_end,
        "location": location, "tutor_id": tutor_id
    }).scalar()

    location_closing_query = text("""
        SELECT COUNT(DISTINCT e.student_id) as cnt
        FROM enrollments e
        JOIN students s ON e.student_id = s.id
        WHERE e.payment_status IN ('Paid', 'Pending Payment')
        AND e.enrollment_type = 'Regular'
        AND e.first_lesson_date IS NOT NULL
        AND e.first_lesson_date <= DATE_ADD(:closing_end, INTERVAL 21 DAY)
        AND calculate_effective_end_date(
            e.first_lesson_date, e.lessons_paid,
            COALESCE(e.deadline_extension_weeks, 0)
        ) > :closing_end
        AND e.student_id IN (
            SELECT DISTINCT e2.student_id
            FROM enrollments e2
            WHERE e2.payment_status IN ('Paid', 'Pending Payment')
            AND e2.enrollment_type = 'Regular'
            AND e2.first_lesson_date IS NOT NULL
            AND e2.first_lesson_date <= :closing_end
            AND calculate_effective_end_date(
                e2.first_lesson_date, e2.lessons_paid,
                COALESCE(e2.deadline_extension_weeks, 0)
            ) >= :opening_start
        )
        AND (:location IS NULL OR e.location = :location)
        AND (:tutor_id IS NULL OR e.tutor_id = :tutor_id)
    """)
    total_closing = db.execute(location_closing_query, {
        "opening_start": opening_start, "closing_end": closing_end,
        "location": location, "tutor_id": tutor_id
    }).scalar()

    location_terminated_query = text("""
        WITH quarter_enrollments AS (
            SELECT e.*,
                   calculate_effective_end_date(
                       e.first_lesson_date, e.lessons_paid,
                       COALESCE(e.deadline_extension_weeks, 0)
                   ) as eff_end_date,
                   ROW_NUMBER() OVER (
                       PARTITION BY e.student_id
                       ORDER BY e.first_lesson_date DESC
                   ) as rn
            FROM enrollments e
            WHERE e.payment_status IN ('Paid', 'Pending Payment')
            AND e.enrollment_type = 'Regular'
            AND e.first_lesson_date IS NOT NULL
            AND e.first_lesson_date <= DATE_ADD(:closing_end, INTERVAL 30 DAY)
        ),
        termed AS (
            SELECT qe.student_id
            FROM quarter_enrollments qe
            WHERE qe.rn = 1
            AND qe.eff_end_date >= :opening_start
            AND qe.eff_end_date <= :closing_end
        )
        SELECT COUNT(DISTINCT te.student_id) as cnt
        FROM termed te
        JOIN students s ON te.student_id = s.id
        JOIN termination_records tr ON te.student_id = tr.student_id
            AND tr.quarter = :quarter AND tr.year = :year
        WHERE tr.count_as_terminated = TRUE
        AND (:location IS NULL OR s.home_location = :location)
        AND (:tutor_id IS NULL OR tr.tutor_id = :tutor_id)
    """)
    total_terminated = db.execute(location_terminated_query, {
        "quarter": quarter, "year": year,
        "opening_start": opening_start, "closing_end": closing_end,
        "location": location, "tutor_id": tutor_id
    }).scalar()

    total_enrollment_transfer = total_closing - total_opening + total_terminated
    location_term_rate = round(total_terminated / total_opening * 100, 1) if total_opening > 0 else 0.0
    location_stats = LocationTerminationStats(
        opening=total_opening,
        enrollment_transfer=total_enrollment_transfer,
        terminated=total_terminated,
        closing=total_closing,
        term_rate=location_term_rate
    )

    return TerminationStatsResponse(
        tutor_stats=tutor_stats,
        location_stats=location_stats
    )


def _compute_location_stats(
    db: Session,
    quarter: int,
    year: int,
    location: Optional[str],
    tutor_id: Optional[int]
) -> dict:
    """
    Compute location-wide opening, terminated, closing stats for a single quarter.
    Returns dict with keys: opening, terminated, closing, term_rate, reason_breakdown.
    """
    opening_start, opening_end, closing_end = get_quarter_dates(year, quarter)
    prev_closing_end = opening_start - timedelta(days=1)

    # Opening count
    opening_query = text("""
        SELECT COUNT(DISTINCT e.student_id) as cnt
        FROM enrollments e
        JOIN students s ON e.student_id = s.id
        WHERE e.payment_status IN ('Paid', 'Pending Payment')
        AND e.enrollment_type = 'Regular'
        AND e.first_lesson_date IS NOT NULL
        AND e.first_lesson_date <= DATE_ADD(:opening_end, INTERVAL 21 DAY)
        AND calculate_effective_end_date(
            e.first_lesson_date, e.lessons_paid,
            COALESCE(e.deadline_extension_weeks, 0)
        ) >= :opening_start
        AND (
            e.first_lesson_date <= :opening_end
            OR e.student_id IN (
                SELECT DISTINCT e2.student_id
                FROM enrollments e2
                WHERE e2.payment_status IN ('Paid', 'Pending Payment')
                AND e2.enrollment_type = 'Regular'
                AND e2.first_lesson_date IS NOT NULL
                AND e2.first_lesson_date <= :opening_end
                AND calculate_effective_end_date(
                    e2.first_lesson_date, e2.lessons_paid,
                    COALESCE(e2.deadline_extension_weeks, 0)
                ) >= DATE_SUB(:prev_closing_end, INTERVAL 21 DAY)
            )
        )
        AND (:location IS NULL OR e.location = :location)
        AND (:tutor_id IS NULL OR e.tutor_id = :tutor_id)
    """)
    total_opening = db.execute(opening_query, {
        "opening_start": opening_start, "opening_end": opening_end,
        "prev_closing_end": prev_closing_end,
        "location": location, "tutor_id": tutor_id
    }).scalar() or 0

    # Closing count
    closing_query = text("""
        SELECT COUNT(DISTINCT e.student_id) as cnt
        FROM enrollments e
        JOIN students s ON e.student_id = s.id
        WHERE e.payment_status IN ('Paid', 'Pending Payment')
        AND e.enrollment_type = 'Regular'
        AND e.first_lesson_date IS NOT NULL
        AND e.first_lesson_date <= DATE_ADD(:closing_end, INTERVAL 21 DAY)
        AND calculate_effective_end_date(
            e.first_lesson_date, e.lessons_paid,
            COALESCE(e.deadline_extension_weeks, 0)
        ) > :closing_end
        AND e.student_id IN (
            SELECT DISTINCT e2.student_id
            FROM enrollments e2
            WHERE e2.payment_status IN ('Paid', 'Pending Payment')
            AND e2.enrollment_type = 'Regular'
            AND e2.first_lesson_date IS NOT NULL
            AND e2.first_lesson_date <= :closing_end
            AND calculate_effective_end_date(
                e2.first_lesson_date, e2.lessons_paid,
                COALESCE(e2.deadline_extension_weeks, 0)
            ) >= :opening_start
        )
        AND (:location IS NULL OR e.location = :location)
        AND (:tutor_id IS NULL OR e.tutor_id = :tutor_id)
    """)
    total_closing = db.execute(closing_query, {
        "opening_start": opening_start, "closing_end": closing_end,
        "location": location, "tutor_id": tutor_id
    }).scalar() or 0

    # Terminated count
    terminated_query = text("""
        WITH quarter_enrollments AS (
            SELECT e.*,
                   calculate_effective_end_date(
                       e.first_lesson_date, e.lessons_paid,
                       COALESCE(e.deadline_extension_weeks, 0)
                   ) as eff_end_date,
                   ROW_NUMBER() OVER (
                       PARTITION BY e.student_id
                       ORDER BY e.first_lesson_date DESC
                   ) as rn
            FROM enrollments e
            WHERE e.payment_status IN ('Paid', 'Pending Payment')
            AND e.enrollment_type = 'Regular'
            AND e.first_lesson_date IS NOT NULL
            AND e.first_lesson_date <= DATE_ADD(:closing_end, INTERVAL 30 DAY)
        ),
        termed AS (
            SELECT qe.student_id
            FROM quarter_enrollments qe
            WHERE qe.rn = 1
            AND qe.eff_end_date >= :opening_start
            AND qe.eff_end_date <= :closing_end
        )
        SELECT COUNT(DISTINCT te.student_id) as cnt
        FROM termed te
        JOIN students s ON te.student_id = s.id
        JOIN termination_records tr ON te.student_id = tr.student_id
            AND tr.quarter = :quarter AND tr.year = :year
        WHERE tr.count_as_terminated = TRUE
        AND (:location IS NULL OR s.home_location = :location)
        AND (:tutor_id IS NULL OR tr.tutor_id = :tutor_id)
    """)
    total_terminated = db.execute(terminated_query, {
        "quarter": quarter, "year": year,
        "opening_start": opening_start, "closing_end": closing_end,
        "location": location, "tutor_id": tutor_id
    }).scalar() or 0

    term_rate = round(total_terminated / total_opening * 100, 1) if total_opening > 0 else 0.0

    # Reason category breakdown
    reason_query = text("""
        WITH quarter_enrollments AS (
            SELECT e.*,
                   calculate_effective_end_date(
                       e.first_lesson_date, e.lessons_paid,
                       COALESCE(e.deadline_extension_weeks, 0)
                   ) as eff_end_date,
                   ROW_NUMBER() OVER (
                       PARTITION BY e.student_id
                       ORDER BY e.first_lesson_date DESC
                   ) as rn
            FROM enrollments e
            WHERE e.payment_status IN ('Paid', 'Pending Payment')
            AND e.enrollment_type = 'Regular'
            AND e.first_lesson_date IS NOT NULL
            AND e.first_lesson_date <= DATE_ADD(:closing_end, INTERVAL 30 DAY)
        ),
        termed AS (
            SELECT qe.student_id
            FROM quarter_enrollments qe
            WHERE qe.rn = 1
            AND qe.eff_end_date >= :opening_start
            AND qe.eff_end_date <= :closing_end
        )
        SELECT COALESCE(tr.reason_category, 'Uncategorized') as category, COUNT(*) as cnt
        FROM termed te
        JOIN students s ON te.student_id = s.id
        JOIN termination_records tr ON te.student_id = tr.student_id
            AND tr.quarter = :quarter AND tr.year = :year
        WHERE tr.count_as_terminated = TRUE
        AND (:location IS NULL OR s.home_location = :location)
        AND (:tutor_id IS NULL OR tr.tutor_id = :tutor_id)
        GROUP BY tr.reason_category
    """)
    reason_rows = db.execute(reason_query, {
        "quarter": quarter, "year": year,
        "opening_start": opening_start, "closing_end": closing_end,
        "location": location, "tutor_id": tutor_id
    }).fetchall()
    reason_breakdown = {row.category: row.cnt for row in reason_rows}

    return {
        "opening": total_opening,
        "terminated": total_terminated,
        "closing": total_closing,
        "term_rate": term_rate,
        "reason_breakdown": reason_breakdown,
    }


@router.get("/terminations/review-needed-count", response_model=TerminationReviewCount)
async def get_review_needed_count(
    request: Request,
    location: Optional[str] = Query(None, description="Filter by location"),
    tutor_id: Optional[int] = Query(None, description="Filter by tutor ID"),
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get count of terminated students needing reason review.
    Only returns a non-zero count during the review period (quarter start to end of month).
    Reviews the PREVIOUS quarter's terminated students.
    """
    if get_effective_role(request, current_user) == "Guest":
        raise HTTPException(status_code=403, detail="Guest access not permitted for termination data")
    today = date.today()
    current_q, current_y = get_quarter_for_date(today)
    opening_start, _, _ = get_quarter_dates(current_y, current_q)

    # Review period: quarter start date to end of that starting month
    _, last_day = calendar.monthrange(opening_start.year, opening_start.month)
    review_end = date(opening_start.year, opening_start.month, last_day)

    if today < opening_start or today > review_end:
        return TerminationReviewCount()

    # Determine previous quarter
    if current_q == 1:
        prev_q, prev_y = 4, current_y - 1
    else:
        prev_q, prev_y = current_q - 1, current_y

    prev_opening_start, _, prev_closing_end = get_quarter_dates(prev_y, prev_q)

    # Count terminated students from previous quarter missing both reason and category
    query = text("""
        WITH quarter_enrollments AS (
            SELECT e.*,
                   calculate_effective_end_date(
                       e.first_lesson_date,
                       e.lessons_paid,
                       COALESCE(e.deadline_extension_weeks, 0)
                   ) as eff_end_date,
                   ROW_NUMBER() OVER (
                       PARTITION BY e.student_id
                       ORDER BY e.first_lesson_date DESC
                   ) as rn
            FROM enrollments e
            WHERE e.payment_status IN ('Paid', 'Pending Payment')
            AND e.enrollment_type = 'Regular'
            AND e.first_lesson_date IS NOT NULL
            AND e.first_lesson_date <= DATE_ADD(:closing_end, INTERVAL 30 DAY)
        ),
        termed AS (
            SELECT qe.student_id, qe.tutor_id,
                   qe.eff_end_date as termination_date
            FROM quarter_enrollments qe
            WHERE qe.rn = 1
            AND qe.eff_end_date >= :opening_start
            AND qe.eff_end_date <= :closing_end
        )
        SELECT COUNT(*) as cnt
        FROM termed te
        JOIN students s ON te.student_id = s.id
        LEFT JOIN termination_records tr ON te.student_id = tr.student_id
            AND tr.quarter = :quarter AND tr.year = :year
        WHERE (:location IS NULL OR s.home_location = :location)
        AND (:tutor_id IS NULL OR te.tutor_id = :tutor_id)
        AND (tr.reason IS NULL OR tr.reason = '')
        AND (tr.reason_category IS NULL OR tr.reason_category = '')
    """)

    result = db.execute(query, {
        "quarter": prev_q,
        "year": prev_y,
        "opening_start": prev_opening_start,
        "closing_end": prev_closing_end,
        "location": location,
        "tutor_id": tutor_id,
    })
    count = result.scalar() or 0

    return TerminationReviewCount(
        count=count,
        in_review_period=True,
        review_quarter=prev_q,
        review_year=prev_y,
    )


@router.get("/terminations/stats/trends", response_model=List[QuarterTrendPoint])
async def get_termination_trends(
    request: Request,
    location: Optional[str] = Query(None, description="Filter by location"),
    tutor_id: Optional[int] = Query(None, description="Filter by tutor ID"),
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get termination stats across all available quarters for trend analysis.
    Returns data points ordered chronologically (oldest first).
    Capped at 8 most recent quarters.
    """
    if get_effective_role(request, current_user) == "Guest":
        raise HTTPException(status_code=403, detail="Guest access not permitted for termination data")
    # Get available quarters (already in descending order)
    # Exclude current in-progress quarter — its data is incomplete
    quarters_result = await get_available_quarters(request=request, location=location, current_user=current_user, db=db)
    current_q, current_y = get_quarter_for_date(date.today())
    quarters = [q for q in quarters_result
                if not (q.quarter == current_q and q.year == current_y)][:8]

    trend_points = []
    for q in reversed(quarters):  # Oldest first
        stats = _compute_location_stats(db, q.quarter, q.year, location, tutor_id)
        trend_points.append(QuarterTrendPoint(
            quarter=q.quarter,
            year=q.year,
            label=f"Q{q.quarter} {q.year}",
            opening=stats["opening"],
            terminated=stats["terminated"],
            closing=stats["closing"],
            term_rate=stats["term_rate"],
            reason_breakdown=stats["reason_breakdown"],
        ))

    return trend_points


@router.get("/terminations/stats/details", response_model=List[StatDetailStudent])
async def get_stat_details(
    request: Request,
    stat_type: str = Query(..., description="Type of stat: opening, terminated, or closing"),
    quarter: int = Query(..., ge=1, le=4, description="Quarter (1-4)"),
    year: int = Query(..., ge=2020, description="Year"),
    location: Optional[str] = Query(None, description="Filter by location"),
    tutor_id: Optional[int] = Query(None, description="Filter by tutor ID"),
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get the list of students counted in a specific stat (opening, terminated, closing).
    Used for drill-down when clicking stat numbers in the UI.
    """
    if get_effective_role(request, current_user) == "Guest":
        raise HTTPException(status_code=403, detail="Guest access not permitted for termination data")
    if stat_type not in ("opening", "terminated", "closing"):
        raise HTTPException(status_code=400, detail="stat_type must be opening, terminated, or closing")

    opening_start, opening_end, closing_end = get_quarter_dates(year, quarter)
    prev_closing_end = opening_start - timedelta(days=1)

    # Common SELECT fields for all stat types
    select_fields = """
                e.id as enrollment_id,
                e.student_id,
                s.student_name,
                s.school_student_id,
                s.grade,
                s.school,
                s.lang_stream,
                s.home_location,
                t.tutor_name,
                e.assigned_day,
                e.assigned_time"""

    if stat_type == "opening":
        # Use CTE with ROW_NUMBER to pick one enrollment per student
        query = text(f"""
            WITH ranked AS (
                SELECT
                    {select_fields},
                    ROW_NUMBER() OVER (
                        PARTITION BY e.student_id ORDER BY e.first_lesson_date DESC
                    ) as rn
                FROM enrollments e
                JOIN tutors t ON e.tutor_id = t.id
                JOIN students s ON e.student_id = s.id
                WHERE e.payment_status IN ('Paid', 'Pending Payment')
                AND e.enrollment_type = 'Regular'
                AND e.first_lesson_date IS NOT NULL
                AND e.first_lesson_date <= DATE_ADD(:opening_end, INTERVAL 21 DAY)
                AND calculate_effective_end_date(
                    e.first_lesson_date, e.lessons_paid,
                    COALESCE(e.deadline_extension_weeks, 0)
                ) >= :opening_start
                AND (
                    e.first_lesson_date <= :opening_end
                    OR e.student_id IN (
                        SELECT DISTINCT e2.student_id
                        FROM enrollments e2
                        WHERE e2.payment_status IN ('Paid', 'Pending Payment')
                        AND e2.enrollment_type = 'Regular'
                        AND e2.first_lesson_date IS NOT NULL
                        AND e2.first_lesson_date <= :opening_end
                        AND calculate_effective_end_date(
                            e2.first_lesson_date, e2.lessons_paid,
                            COALESCE(e2.deadline_extension_weeks, 0)
                        ) >= DATE_SUB(:prev_closing_end, INTERVAL 21 DAY)
                    )
                )
                AND (:location IS NULL OR e.location = :location)
                AND (:tutor_id IS NULL OR e.tutor_id = :tutor_id)
            )
            SELECT * FROM ranked WHERE rn = 1
            ORDER BY tutor_name, student_name
        """)
        params = {
            "opening_start": opening_start,
            "opening_end": opening_end,
            "prev_closing_end": prev_closing_end,
            "location": location,
            "tutor_id": tutor_id
        }

    elif stat_type == "closing":
        query = text(f"""
            WITH ranked AS (
                SELECT
                    {select_fields},
                    ROW_NUMBER() OVER (
                        PARTITION BY e.student_id ORDER BY e.first_lesson_date DESC
                    ) as rn
                FROM enrollments e
                JOIN tutors t ON e.tutor_id = t.id
                JOIN students s ON e.student_id = s.id
                WHERE e.payment_status IN ('Paid', 'Pending Payment')
                AND e.enrollment_type = 'Regular'
                AND e.first_lesson_date IS NOT NULL
                AND e.first_lesson_date <= DATE_ADD(:closing_end, INTERVAL 21 DAY)
                AND calculate_effective_end_date(
                    e.first_lesson_date, e.lessons_paid,
                    COALESCE(e.deadline_extension_weeks, 0)
                ) > :closing_end
                AND e.student_id IN (
                    SELECT DISTINCT e2.student_id
                    FROM enrollments e2
                    WHERE e2.payment_status IN ('Paid', 'Pending Payment')
                    AND e2.enrollment_type = 'Regular'
                    AND e2.first_lesson_date IS NOT NULL
                    AND e2.first_lesson_date <= :closing_end
                    AND calculate_effective_end_date(
                        e2.first_lesson_date, e2.lessons_paid,
                        COALESCE(e2.deadline_extension_weeks, 0)
                    ) >= :opening_start
                )
                AND (:location IS NULL OR e.location = :location)
                AND (:tutor_id IS NULL OR e.tutor_id = :tutor_id)
            )
            SELECT * FROM ranked WHERE rn = 1
            ORDER BY tutor_name, student_name
        """)
        params = {
            "opening_start": opening_start,
            "closing_end": closing_end,
            "location": location,
            "tutor_id": tutor_id
        }

    else:  # terminated
        query = text(f"""
            WITH quarter_enrollments AS (
                SELECT e.*,
                       calculate_effective_end_date(
                           e.first_lesson_date, e.lessons_paid,
                           COALESCE(e.deadline_extension_weeks, 0)
                       ) as eff_end_date,
                       ROW_NUMBER() OVER (
                           PARTITION BY e.student_id
                           ORDER BY e.first_lesson_date DESC
                       ) as rn
                FROM enrollments e
                WHERE e.payment_status IN ('Paid', 'Pending Payment')
                AND e.enrollment_type = 'Regular'
                AND e.first_lesson_date IS NOT NULL
                AND e.first_lesson_date <= DATE_ADD(:closing_end, INTERVAL 30 DAY)
            ),
            termed AS (
                SELECT qe.id as enrollment_id, qe.student_id, qe.tutor_id,
                       qe.assigned_day, qe.assigned_time
                FROM quarter_enrollments qe
                WHERE qe.rn = 1
                AND qe.eff_end_date >= :opening_start
                AND qe.eff_end_date <= :closing_end
            )
            SELECT
                te.enrollment_id,
                te.student_id,
                s.student_name,
                s.school_student_id,
                s.grade,
                s.school,
                s.lang_stream,
                s.home_location,
                t.tutor_name,
                te.assigned_day,
                te.assigned_time
            FROM termed te
            JOIN students s ON te.student_id = s.id
            JOIN termination_records tr ON te.student_id = tr.student_id
                AND tr.quarter = :quarter AND tr.year = :year
            JOIN tutors t ON te.tutor_id = t.id
            WHERE tr.count_as_terminated = TRUE
            AND (:location IS NULL OR s.home_location = :location)
            AND (:tutor_id IS NULL OR te.tutor_id = :tutor_id)
            ORDER BY t.tutor_name, s.student_name
        """)
        params = {
            "quarter": quarter,
            "year": year,
            "opening_start": opening_start,
            "closing_end": closing_end,
            "location": location,
            "tutor_id": tutor_id
        }

    result = db.execute(query, params)
    return [
        StatDetailStudent(
            student_id=row.student_id,
            student_name=row.student_name,
            school_student_id=row.school_student_id,
            tutor_name=row.tutor_name,
            grade=row.grade,
            school=row.school,
            lang_stream=row.lang_stream,
            home_location=row.home_location,
            enrollment_id=row.enrollment_id,
            assigned_day=row.assigned_day,
            assigned_time=row.assigned_time
        )
        for row in result.fetchall()
    ]
