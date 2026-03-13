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
from constants import SessionStatus, COMPLETED_STATUSES, PENDING_MAKEUP_STATUSES, MAKEUP_BOOKED_STATUSES
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

    # --- Q1: Attendance summary (includes 30/60-day trend windows) ---
    all_rescheduled = PENDING_MAKEUP_STATUSES + MAKEUP_BOOKED_STATUSES
    thirty_days_ago = today - timedelta(days=30)
    sixty_days_ago = today - timedelta(days=60)
    attended_or_noshow = COMPLETED_STATUSES + [SessionStatus.NO_SHOW.value]

    row = db.query(
        func.sum(case(
            (SessionLog.session_status.in_(COMPLETED_STATUSES), 1), else_=0
        )).label("attended"),
        func.sum(case(
            (SessionLog.session_status == SessionStatus.NO_SHOW.value, 1), else_=0
        )).label("no_show"),
        func.sum(case(
            (SessionLog.session_status.in_(all_rescheduled), 1), else_=0
        )).label("rescheduled"),
        func.sum(case(
            (SessionLog.session_status == SessionStatus.CANCELLED.value, 1), else_=0
        )).label("cancelled"),
        func.count().label("total"),
        # Trend: recent 30 days
        func.sum(case(
            (SessionLog.session_date > thirty_days_ago, case(
                (SessionLog.session_status.in_(COMPLETED_STATUSES), 1), else_=0
            )), else_=0
        )).label("recent_attended"),
        func.sum(case(
            (SessionLog.session_date > thirty_days_ago, case(
                (SessionLog.session_status.in_(attended_or_noshow), 1), else_=0
            )), else_=0
        )).label("recent_total"),
        # Trend: previous 30 days (31-60 days ago)
        func.sum(case(
            (SessionLog.session_date.between(sixty_days_ago, thirty_days_ago), case(
                (SessionLog.session_status.in_(COMPLETED_STATUSES), 1), else_=0
            )), else_=0
        )).label("prev_attended"),
        func.sum(case(
            (SessionLog.session_date.between(sixty_days_ago, thirty_days_ago), case(
                (SessionLog.session_status.in_(attended_or_noshow), 1), else_=0
            )), else_=0
        )).label("prev_total"),
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

    recent_attended = int(row.recent_attended or 0)
    recent_total = int(row.recent_total or 0)
    prev_attended = int(row.prev_attended or 0)
    prev_total = int(row.prev_total or 0)
    recent_rate = round(recent_attended / recent_total * 100, 1) if recent_total > 0 else None
    previous_rate = round(prev_attended / prev_total * 100, 1) if prev_total > 0 else None

    attendance = AttendanceSummary(
        attended=attended,
        no_show=no_show,
        rescheduled=rescheduled,
        cancelled=cancelled,
        total_past_sessions=total_past,
        attendance_rate=attendance_rate,
        recent_rate=recent_rate,
        previous_rate=previous_rate,
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
    recent_ratings: list[int] = []
    for session_date, rating_str in rated_rows:
        stars = rating_str.count("⭐")
        if stars > 0:
            month_key = session_date.strftime("%Y-%m")
            monthly_ratings[month_key].append(stars)
            all_ratings.append(stars)
            if session_date > thirty_days_ago:
                recent_ratings.append(stars)

    ratings = RatingSummary(
        overall_avg=round(sum(all_ratings) / len(all_ratings), 2) if all_ratings else 0.0,
        total_rated=len(all_ratings),
        monthly_trend=[
            RatingMonth(month=m, avg_rating=round(sum(r) / len(r), 2), count=len(r))
            for m, r in sorted(monthly_ratings.items())
        ],
        recent_avg=round(sum(recent_ratings) / len(recent_ratings), 2) if recent_ratings else None,
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

    # --- Q5: Parent contact summary (SQL aggregation, no full ORM load) ---
    contact_totals = db.query(
        func.count().label("total"),
        func.max(ParentCommunication.contact_date).label("last_date"),
    ).filter(ParentCommunication.student_id == student_id).first()

    method_rows = db.query(
        ParentCommunication.contact_method, func.count().label("cnt"),
    ).filter(
        ParentCommunication.student_id == student_id,
        ParentCommunication.contact_method.isnot(None),
    ).group_by(ParentCommunication.contact_method).all()

    type_rows = db.query(
        ParentCommunication.contact_type, func.count().label("cnt"),
    ).filter(
        ParentCommunication.student_id == student_id,
        ParentCommunication.contact_type.isnot(None),
    ).group_by(ParentCommunication.contact_type).all()

    contacts = ContactSummary(
        total_contacts=contact_totals.total or 0,
        last_contact_date=contact_totals.last_date,
        by_method={r.contact_method: r.cnt for r in method_rows},
        by_type={r.contact_type: r.cnt for r in type_rows},
    )

    # --- Q6: Monthly activity (last 12 months) ---
    # Calculate 12 months ago (first day of that month)
    m = today.month - 11
    y = today.year
    if m <= 0:
        m += 12
        y -= 1
    twelve_months_ago = date(y, m, 1)

    # Single query: sessions attended + exercises per month (LEFT JOIN)
    month_col = func.date_format(SessionLog.session_date, "%Y-%m").label("month")
    activity_rows = db.query(
        month_col,
        func.count(case(
            (SessionLog.session_status.in_(COMPLETED_STATUSES), SessionLog.id), else_=None
        ).distinct()).label("sessions"),
        func.count(SessionExercise.id).label("exercises"),
    ).outerjoin(SessionExercise, SessionExercise.session_id == SessionLog.id).filter(
        SessionLog.student_id == student_id,
        SessionLog.session_date >= twelve_months_ago,
    ).group_by(month_col).all()

    # Fill all 12 months
    activity_map: dict[str, dict] = {}
    d = twelve_months_ago
    while d <= today:
        key = d.strftime("%Y-%m")
        activity_map[key] = {"sessions_attended": 0, "exercises_assigned": 0}
        if d.month == 12:
            d = date(d.year + 1, 1, 1)
        else:
            d = date(d.year, d.month + 1, 1)

    for row in activity_rows:
        if row.month in activity_map:
            activity_map[row.month]["sessions_attended"] = row.sessions
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
