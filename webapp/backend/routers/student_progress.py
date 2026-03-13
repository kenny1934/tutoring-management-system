"""
Student progress analytics endpoint.
Aggregates attendance, ratings, exercises, enrollment history,
parent contacts, and monthly activity for a single student.
"""
from collections import defaultdict
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, case
from sqlalchemy.orm import Session, joinedload

from auth.dependencies import get_current_user
from database import get_db
from models import Tutor, Student, SessionLog, SessionExercise, Enrollment, ParentCommunication
from constants import COMPLETED_STATUSES, PENDING_MAKEUP_STATUSES, MAKEUP_BOOKED_STATUSES
from schemas import (
    StudentProgressResponse, AttendanceSummary, RatingSummary, RatingMonth,
    ExerciseSummary, EnrollmentTimeline, ContactSummary, MonthlyActivity,
)

router = APIRouter()


@router.get("/students/{student_id}/progress", response_model=StudentProgressResponse)
def get_student_progress(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: Tutor = Depends(get_current_user),
):
    # Verify student exists
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    today = date.today()

    # --- Q1: Attendance summary ---
    all_rescheduled = PENDING_MAKEUP_STATUSES + MAKEUP_BOOKED_STATUSES
    row = db.query(
        func.sum(case(
            (SessionLog.session_status.in_(COMPLETED_STATUSES), 1), else_=0
        )).label("attended"),
        func.sum(case(
            (SessionLog.session_status == "No Show", 1), else_=0
        )).label("no_show"),
        func.sum(case(
            (SessionLog.session_status.in_(all_rescheduled), 1), else_=0
        )).label("rescheduled"),
        func.sum(case(
            (SessionLog.session_status == "Cancelled", 1), else_=0
        )).label("cancelled"),
        func.count().label("total"),
    ).filter(
        SessionLog.student_id == student_id,
        SessionLog.session_date <= today,
    ).first()

    attended = int(row.attended or 0)
    no_show = int(row.no_show or 0)
    rescheduled = int(row.rescheduled or 0)
    cancelled = int(row.cancelled or 0)
    total_past = int(row.total or 0)
    denominator = attended + no_show
    attendance_rate = round(attended / denominator * 100, 1) if denominator > 0 else 0.0

    attendance = AttendanceSummary(
        attended=attended,
        no_show=no_show,
        rescheduled=rescheduled,
        cancelled=cancelled,
        total_past_sessions=total_past,
        attendance_rate=attendance_rate,
    )

    # --- Q2: Rating trend ---
    rated_rows = db.query(
        SessionLog.session_date,
        SessionLog.performance_rating,
    ).filter(
        SessionLog.student_id == student_id,
        SessionLog.performance_rating.isnot(None),
        SessionLog.performance_rating != "",
    ).order_by(SessionLog.session_date).all()

    monthly_ratings: dict[str, list[int]] = defaultdict(list)
    all_ratings: list[int] = []
    for session_date, rating_str in rated_rows:
        stars = rating_str.count("⭐")
        if stars > 0:
            month_key = session_date.strftime("%Y-%m")
            monthly_ratings[month_key].append(stars)
            all_ratings.append(stars)

    ratings = RatingSummary(
        overall_avg=round(sum(all_ratings) / len(all_ratings), 2) if all_ratings else 0.0,
        total_rated=len(all_ratings),
        monthly_trend=[
            RatingMonth(month=m, avg_rating=round(sum(r) / len(r), 2), count=len(r))
            for m, r in sorted(monthly_ratings.items())
        ],
    )

    # --- Q3: Exercise summary ---
    ex_row = db.query(
        func.count().label("total"),
        func.sum(case(
            (SessionExercise.exercise_type.in_(["Classwork", "CW"]), 1), else_=0
        )).label("classwork"),
        func.sum(case(
            (SessionExercise.exercise_type.in_(["Homework", "HW"]), 1), else_=0
        )).label("homework"),
    ).join(SessionLog, SessionExercise.session_id == SessionLog.id).filter(
        SessionLog.student_id == student_id,
    ).first()

    exercises = ExerciseSummary(
        total=int(ex_row.total or 0),
        classwork=int(ex_row.classwork or 0),
        homework=int(ex_row.homework or 0),
    )

    # --- Q4: Enrollment timeline ---
    enrollments = db.query(Enrollment).options(
        joinedload(Enrollment.tutor)
    ).filter(
        Enrollment.student_id == student_id,
    ).order_by(Enrollment.first_lesson_date.desc()).all()

    enrollment_timeline = [
        EnrollmentTimeline(
            id=e.id,
            tutor_name=e.tutor.tutor_name if e.tutor else None,
            enrollment_type=e.enrollment_type,
            payment_status=e.payment_status or "Unknown",
            first_lesson_date=e.first_lesson_date,
            location=e.location,
            assigned_day=e.assigned_day,
            assigned_time=e.assigned_time,
            lessons_paid=e.lessons_paid,
        )
        for e in enrollments
    ]

    # --- Q5: Parent contact summary ---
    contacts_list = db.query(ParentCommunication).filter(
        ParentCommunication.student_id == student_id,
    ).order_by(ParentCommunication.contact_date.desc()).all()

    by_method: dict[str, int] = defaultdict(int)
    by_type: dict[str, int] = defaultdict(int)
    for c in contacts_list:
        if c.contact_method:
            by_method[c.contact_method] += 1
        if c.contact_type:
            by_type[c.contact_type] += 1

    contacts = ContactSummary(
        total_contacts=len(contacts_list),
        last_contact_date=contacts_list[0].contact_date if contacts_list else None,
        by_method=dict(by_method),
        by_type=dict(by_type),
    )

    # --- Q6: Monthly activity (last 12 months) ---
    # Calculate 12 months ago (first day of that month)
    m = today.month - 11
    y = today.year
    if m <= 0:
        m += 12
        y -= 1
    twelve_months_ago = date(y, m, 1)

    session_monthly = db.query(
        func.date_format(SessionLog.session_date, "%Y-%m").label("month"),
        func.count().label("sessions"),
    ).filter(
        SessionLog.student_id == student_id,
        SessionLog.session_status.in_(COMPLETED_STATUSES),
        SessionLog.session_date >= twelve_months_ago,
    ).group_by("month").all()

    exercise_monthly = db.query(
        func.date_format(SessionLog.session_date, "%Y-%m").label("month"),
        func.count().label("exercises"),
    ).join(SessionExercise, SessionExercise.session_id == SessionLog.id).filter(
        SessionLog.student_id == student_id,
        SessionLog.session_date >= twelve_months_ago,
    ).group_by("month").all()

    # Merge into a dict keyed by month, fill all 12 months
    activity_map: dict[str, dict] = {}
    d = twelve_months_ago
    while d <= today:
        key = d.strftime("%Y-%m")
        activity_map[key] = {"sessions_attended": 0, "exercises_assigned": 0}
        # Advance to next month
        if d.month == 12:
            d = date(d.year + 1, 1, 1)
        else:
            d = date(d.year, d.month + 1, 1)

    for row in session_monthly:
        if row.month in activity_map:
            activity_map[row.month]["sessions_attended"] = row.sessions
    for row in exercise_monthly:
        if row.month in activity_map:
            activity_map[row.month]["exercises_assigned"] = row.exercises

    monthly_activity = [
        MonthlyActivity(month=m, **vals)
        for m, vals in sorted(activity_map.items())
    ]

    return StudentProgressResponse(
        student_id=student_id,
        attendance=attendance,
        ratings=ratings,
        exercises=exercises,
        enrollment_timeline=enrollment_timeline,
        contacts=contacts,
        monthly_activity=monthly_activity,
    )
