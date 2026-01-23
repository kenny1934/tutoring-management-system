"""
Terminations API endpoints.
Provides endpoints for quarterly termination reporting.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text, func, and_
from typing import List, Optional
from datetime import date, datetime, timedelta
from database import get_db
from models import TerminationRecord, Student, Tutor, Enrollment
from schemas import (
    TerminatedStudentResponse,
    TerminationRecordUpdate,
    TerminationRecordResponse,
    TutorTerminationStats,
    LocationTerminationStats,
    TerminationStatsResponse,
    QuarterOption
)
from auth.dependencies import require_admin

router = APIRouter()

# Quarter definitions (month ranges)
QUARTERS = {
    1: (1, 3),   # Jan - Mar
    2: (4, 6),   # Apr - Jun
    3: (7, 9),   # Jul - Sep
    4: (10, 12), # Oct - Dec
}


def get_quarter_dates(year: int, quarter: int):
    """Get key dates for a quarter."""
    start_month, end_month = QUARTERS[quarter]
    opening_start = date(year, start_month, 1)
    opening_end = date(year, start_month, 7)

    if end_month == 12:
        closing_end = date(year, 12, 31)
    else:
        closing_end = date(year, end_month + 1, 1) - timedelta(days=1)

    return opening_start, opening_end, closing_end


@router.get("/terminations/quarters", response_model=List[QuarterOption])
async def get_available_quarters(
    location: Optional[str] = Query(None, description="Filter by location"),
    db: Session = Depends(get_db)
):
    """
    Get list of quarters that have terminated students.
    Returns quarters in descending order (most recent first).
    """
    query = text("""
        SELECT termination_quarter as quarter, termination_year as year, COUNT(*) as count
        FROM terminated_students
        WHERE termination_quarter IS NOT NULL
        AND termination_year IS NOT NULL
        AND (:location IS NULL OR home_location = :location)
        GROUP BY termination_quarter, termination_year
        ORDER BY termination_year DESC, termination_quarter DESC
    """)

    result = db.execute(query, {"location": location})
    rows = result.fetchall()

    return [
        QuarterOption(quarter=row.quarter, year=row.year, count=row.count)
        for row in rows
    ]


@router.get("/terminations", response_model=List[TerminatedStudentResponse])
async def get_terminated_students(
    quarter: int = Query(..., ge=1, le=4, description="Quarter (1-4)"),
    year: int = Query(..., ge=2020, description="Year"),
    location: Optional[str] = Query(None, description="Filter by location"),
    tutor_id: Optional[int] = Query(None, description="Filter by tutor ID (for role-based filtering)"),
    db: Session = Depends(get_db)
):
    """
    Get terminated students for a specific quarter with their editable records.
    Includes reason and count_as_terminated from termination_records table.
    """
    # Query terminated students view, joining with termination_records and latest enrollment
    # Use subquery to get latest enrollment per student (not the view which only has active students)
    query = text("""
        SELECT
            ts.student_id,
            ts.student_name,
            ts.school_student_id,
            s.grade,
            ts.home_location,
            ts.termination_date,
            le.tutor_id,
            t.tutor_name,
            CONCAT('[', le.assigned_time, '], ', le.assigned_day) as schedule,
            tr.id as record_id,
            tr.reason,
            COALESCE(tr.count_as_terminated, FALSE) as count_as_terminated
        FROM terminated_students ts
        JOIN students s ON ts.student_id = s.id
        LEFT JOIN (
            SELECT e1.*
            FROM enrollments e1
            INNER JOIN (
                SELECT student_id, MAX(first_lesson_date) as max_date
                FROM enrollments
                WHERE payment_status IN ('Paid', 'Pending Payment')
                AND enrollment_type = 'Regular'
                GROUP BY student_id
            ) e2 ON e1.student_id = e2.student_id AND e1.first_lesson_date = e2.max_date
        ) le ON ts.student_id = le.student_id
        LEFT JOIN tutors t ON le.tutor_id = t.id
        LEFT JOIN termination_records tr ON ts.student_id = tr.student_id
            AND tr.quarter = :quarter AND tr.year = :year
        WHERE ts.termination_quarter = :quarter
        AND ts.termination_year = :year
        AND (:location IS NULL OR ts.home_location = :location)
        AND (:tutor_id IS NULL OR le.tutor_id = :tutor_id)
        ORDER BY t.tutor_name, ts.student_name
    """)

    result = db.execute(query, {
        "quarter": quarter,
        "year": year,
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
            count_as_terminated=bool(row.count_as_terminated)
        )
        for row in rows
    ]


@router.put("/terminations/{student_id}", response_model=TerminationRecordResponse)
async def update_termination_record(
    student_id: int,
    data: TerminationRecordUpdate,
    admin: Tutor = Depends(require_admin),
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

    # Get tutor_id from latest enrollment (by most recent first_lesson_date)
    latest_enrollment = db.execute(text("""
        SELECT tutor_id FROM enrollments
        WHERE student_id = :student_id
        AND payment_status IN ('Paid', 'Pending Payment')
        AND enrollment_type = 'Regular'
        AND first_lesson_date IS NOT NULL
        ORDER BY first_lesson_date DESC
        LIMIT 1
    """), {"student_id": student_id}).fetchone()
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
            count_as_terminated=new_record.count_as_terminated,
            tutor_id=new_record.tutor_id,
            updated_by=new_record.updated_by,
            updated_at=new_record.updated_at
        )


@router.get("/terminations/stats", response_model=TerminationStatsResponse)
async def get_termination_stats(
    quarter: int = Query(..., ge=1, le=4, description="Quarter (1-4)"),
    year: int = Query(..., ge=2020, description="Year"),
    location: Optional[str] = Query(None, description="Filter by location"),
    tutor_id: Optional[int] = Query(None, description="Filter by tutor ID (for role-based filtering)"),
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
    opening_start, opening_end, closing_end = get_quarter_dates(year, quarter)

    # Query for Opening count per tutor
    # Count distinct students active during opening week
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
        AND e.first_lesson_date <= :opening_end
        AND calculate_effective_end_date(
            e.first_lesson_date,
            e.lessons_paid,
            COALESCE(e.deadline_extension_weeks, 0)
        ) >= :opening_start
        AND (:location IS NULL OR e.location = :location)
        AND (:tutor_id IS NULL OR e.tutor_id = :tutor_id)
        GROUP BY e.tutor_id, t.tutor_name
    """)

    opening_result = db.execute(opening_query, {
        "opening_start": opening_start,
        "opening_end": opening_end,
        "location": location,
        "tutor_id": tutor_id
    })
    opening_rows = {row.tutor_id: (row.tutor_name, row.opening_count) for row in opening_result.fetchall()}

    # Query for Closing count per tutor
    # Count distinct students with lessons after quarter end
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
        AND calculate_effective_end_date(
            e.first_lesson_date,
            e.lessons_paid,
            COALESCE(e.deadline_extension_weeks, 0)
        ) > :closing_end
        AND (:location IS NULL OR e.location = :location)
        AND (:tutor_id IS NULL OR e.tutor_id = :tutor_id)
        GROUP BY e.tutor_id, t.tutor_name
    """)

    closing_result = db.execute(closing_query, {
        "closing_end": closing_end,
        "location": location,
        "tutor_id": tutor_id
    })
    closing_rows = {row.tutor_id: row.closing_count for row in closing_result.fetchall()}

    # Query for Terminated count per tutor
    # Count students marked as terminated in termination_records
    terminated_query = text("""
        SELECT
            tr.tutor_id,
            t.tutor_name,
            COUNT(*) as terminated_count
        FROM termination_records tr
        JOIN tutors t ON tr.tutor_id = t.id
        JOIN students s ON tr.student_id = s.id
        WHERE tr.quarter = :quarter
        AND tr.year = :year
        AND tr.count_as_terminated = TRUE
        AND (:location IS NULL OR s.home_location = :location)
        AND (:tutor_id IS NULL OR tr.tutor_id = :tutor_id)
        GROUP BY tr.tutor_id, t.tutor_name
    """)

    terminated_result = db.execute(terminated_query, {
        "quarter": quarter,
        "year": year,
        "location": location,
        "tutor_id": tutor_id
    })
    terminated_rows = {row.tutor_id: row.terminated_count for row in terminated_result.fetchall()}

    # Get all tutors who have any data
    all_tutor_ids = set(opening_rows.keys()) | set(closing_rows.keys()) | set(terminated_rows.keys())

    # Build tutor stats
    tutor_stats = []
    total_opening = 0
    total_terminated = 0
    total_closing = 0

    for tid in all_tutor_ids:
        tutor_name = opening_rows.get(tid, (None, 0))[0]
        if not tutor_name:
            # Get tutor name from other sources
            tutor = db.query(Tutor).filter(Tutor.id == tid).first()
            tutor_name = tutor.tutor_name if tutor else f"Tutor {tid}"

        opening = opening_rows.get(tid, (tutor_name, 0))[1]
        terminated = terminated_rows.get(tid, 0)
        closing = closing_rows.get(tid, 0)
        enrollment_transfer = closing - opening - terminated
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

        total_opening += opening
        total_terminated += terminated
        total_closing += closing

    # Sort by tutor name
    tutor_stats.sort(key=lambda x: x.tutor_name)

    # Calculate location-wide stats
    total_enrollment_transfer = total_closing - total_opening - total_terminated
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
