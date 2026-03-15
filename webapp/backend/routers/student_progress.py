"""
Student progress analytics endpoint.
Aggregates attendance, ratings, exercises, enrollment history,
parent contacts, and monthly activity for a single student.
"""
from collections import defaultdict
from datetime import date, timedelta
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, case
from sqlalchemy.orm import Session, joinedload

from auth.dependencies import get_current_user
from database import get_db
from utils.rate_limiter import check_user_rate_limit
from models import Tutor, Student, SessionLog, SessionExercise, Enrollment, ParentCommunication, CalendarEvent, StudentRadarConfig
from constants import SessionStatus, COMPLETED_STATUSES, PENDING_MAKEUP_STATUSES, MAKEUP_BOOKED_STATUSES, CW_TYPE, HW_TYPE, EXAM_EVENT_TYPES
from schemas import (
    StudentProgressResponse, AttendanceSummary, RatingSummary, RatingMonth,
    ExerciseSummary, ExerciseDetail, EnrollmentTimeline, ContactSummary, MonthlyActivity,
    TestEvent, ProgressInsights, RadarChartConfig, StudentRadarConfigResponse,
)

router = APIRouter()


@router.get("/students/{student_id}/progress", response_model=StudentProgressResponse)
def get_student_progress(
    student_id: int,
    start_date: Optional[date] = Query(None, description="Filter sessions from this date"),
    end_date: Optional[date] = Query(None, description="Filter sessions up to this date"),
    generate_insights: bool = Query(False, description="Generate AI insights (costs tokens)"),
    force_refresh: bool = Query(False, description="Bypass AI cache and regenerate"),
    exclude_from_ai: Optional[str] = Query(None, description="Comma-separated sections to exclude from AI context"),
    language: Literal["en", "zh-hant"] = Query("en", description="Language for AI narrative"),
    db: Session = Depends(get_db),
    current_user: Tutor = Depends(get_current_user),
):
    # Verify student exists
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    today = date.today()
    # Use end_date as the anchor for trend windows when date range is specified
    anchor = end_date or today

    # --- Q1: Attendance summary (includes 30/60-day trend windows) ---
    all_rescheduled = PENDING_MAKEUP_STATUSES + MAKEUP_BOOKED_STATUSES
    thirty_days_ago = anchor - timedelta(days=30)
    sixty_days_ago = anchor - timedelta(days=60)
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
        SessionLog.session_date <= anchor,
        *([SessionLog.session_date >= start_date] if start_date else []),
    ).first()

    attended = int(row.attended or 0)
    no_show = int(row.no_show or 0)
    rescheduled = int(row.rescheduled or 0)
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
        *([SessionLog.session_date >= start_date] if start_date else []),
        *([SessionLog.session_date <= end_date] if end_date else []),
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

    # --- Q3: Exercise details + counts (single query) ---
    exercise_rows = db.query(
        SessionLog.session_date,
        SessionExercise.exercise_type,
        SessionExercise.pdf_name,
        SessionExercise.page_start,
        SessionExercise.page_end,
    ).join(SessionLog, SessionExercise.session_id == SessionLog.id).filter(
        SessionLog.student_id == student_id,
        SessionLog.session_status.in_(COMPLETED_STATUSES),
        *([SessionLog.session_date >= start_date] if start_date else []),
        *([SessionLog.session_date <= end_date] if end_date else []),
    ).order_by(SessionLog.session_date.desc()).all()

    classwork = sum(1 for r in exercise_rows if r.exercise_type == CW_TYPE)
    homework = sum(1 for r in exercise_rows if r.exercise_type == HW_TYPE)

    exercises = ExerciseSummary(
        total=len(exercise_rows),
        classwork=classwork,
        homework=homework,
        details=[
            ExerciseDetail(
                session_date=r.session_date,
                exercise_type=r.exercise_type or CW_TYPE,
                pdf_name=r.pdf_name or "",
                page_start=r.page_start,
                page_end=r.page_end,
            )
            for r in exercise_rows
        ],
    )

    # --- Q4: Enrollment timeline ---
    enrollments = db.query(Enrollment).options(
        joinedload(Enrollment.tutor)
    ).filter(
        Enrollment.student_id == student_id,
        *([Enrollment.first_lesson_date >= start_date] if start_date else []),
        *([Enrollment.first_lesson_date <= end_date] if end_date else []),
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

    # --- Q6: Monthly activity ---
    # Use date range if provided, otherwise default to last 12 months
    if start_date:
        activity_start = date(start_date.year, start_date.month, 1)
    else:
        m = today.month - 11
        y = today.year
        if m <= 0:
            m += 12
            y -= 1
        activity_start = date(y, m, 1)
    activity_end = end_date or today

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
        SessionLog.session_date >= activity_start,
        SessionLog.session_date <= activity_end,
    ).group_by(month_col).all()

    # Fill all months in range
    activity_map: dict[str, dict] = {}
    d = activity_start
    while d <= activity_end:
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

    # --- Q8: Tests/exams during period ---
    test_events = []
    if student.school and student.grade:
        test_start = start_date or activity_start
        test_end = end_date or today
        test_rows = db.query(CalendarEvent).filter(
            CalendarEvent.school == student.school,
            CalendarEvent.grade == student.grade,
            CalendarEvent.event_type.in_(EXAM_EVENT_TYPES),
            CalendarEvent.start_date >= test_start,
            CalendarEvent.start_date <= test_end,
        ).order_by(CalendarEvent.start_date).all()

        test_events = [
            TestEvent(
                title=t.title,
                start_date=t.start_date,
                end_date=t.end_date,
                event_type=t.event_type,
                description=t.description,
            )
            for t in test_rows
        ]

    # --- Q9: AI insights (optional, on-demand) ---
    insights = None
    if generate_insights:
        from services.progress_insights import generate_progress_insights

        check_user_rate_limit(current_user.id, "progress_insights")

        date_range = (start_date, end_date) if start_date and end_date else None
        exclude = frozenset(exclude_from_ai.split(",")) if exclude_from_ai else frozenset()

        # Extract scalars before releasing DB — ORM objects expire after close()
        s_id = student.id
        s_name = student.student_name
        s_grade = student.grade
        s_school = student.school

        # Release DB connection before calling external AI API to prevent pool exhaustion
        db.close()

        insights = generate_progress_insights(
            student_id=s_id,
            student_name=s_name,
            student_grade=s_grade,
            student_school=s_school,
            exercises=exercises.details,
            test_events=test_events,
            attendance=attendance,
            ratings=ratings,
            date_range=date_range,
            language=language,
            force_refresh=force_refresh,
            exclude=exclude,
        )

    return StudentProgressResponse(
        student_id=student_id,
        attendance=attendance,
        ratings=ratings,
        exercises=exercises,
        enrollment_timeline=enrollment_timeline,
        contacts=contacts,
        monthly_activity=monthly_activity,
        test_events=test_events,
        insights=insights,
    )


@router.get("/students/{student_id}/radar-config", response_model=StudentRadarConfigResponse)
def get_radar_config(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: Tutor = Depends(get_current_user),
):
    config = db.query(StudentRadarConfig).filter(
        StudentRadarConfig.student_id == student_id
    ).first()
    if not config:
        return StudentRadarConfigResponse(student_id=student_id, config=RadarChartConfig())
    return StudentRadarConfigResponse(
        student_id=student_id,
        config=RadarChartConfig(**config.config),
        updated_at=config.updated_at,
    )


@router.put("/students/{student_id}/radar-config")
def upsert_radar_config(
    student_id: int,
    body: RadarChartConfig,
    db: Session = Depends(get_db),
    current_user: Tutor = Depends(get_current_user),
):
    if len(body.axes) < 4 or len(body.axes) > 8:
        raise HTTPException(status_code=400, detail="Radar chart requires 4-8 axes")
    if any(not a.label.strip() for a in body.axes):
        raise HTTPException(status_code=400, detail="All axis labels must be non-empty")
    labels = [a.label.strip().lower() for a in body.axes]
    if len(set(labels)) != len(labels):
        raise HTTPException(status_code=400, detail="Axis labels must be unique")

    existing = db.query(StudentRadarConfig).filter(
        StudentRadarConfig.student_id == student_id
    ).first()
    if existing:
        existing.config = body.model_dump()
        existing.tutor_id = current_user.id
    else:
        db.add(StudentRadarConfig(
            student_id=student_id,
            tutor_id=current_user.id,
            config=body.model_dump(),
        ))
    db.commit()
    return {"ok": True}
