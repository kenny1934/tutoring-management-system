"""Bounded search results, with explicit history and enough context to identify a record."""
from datetime import timedelta

from sqlalchemy import String, and_, case, cast, func, or_, select
from sqlalchemy.orm import joinedload

from constants import EXAM_EVENT_TYPES, hk_now
from models import CalendarEvent, Enrollment, SessionLog, SessionExercise, Student, Tutor


def search_records(db, query, location=None, limit=5, include_history=False, can_see_phone=False, *,
                   category=None, offset=0, from_date=None, to_date=None, tutor_id=None,
                   status=None, student_id=None):
    now = hk_now()
    today = now.date()
    filtered = any(value is not None for value in [from_date, to_date, tutor_id, status, student_id])
    if len(query.strip()) < 2 and not (not query.strip() and filtered):
        return dict(students=[], sessions=[], enrollments=[], exams=[], has_more={})
    # A literal % or _ in a school/name must not turn into an unbounded wildcard.
    tokens = query.strip().split()[:12]

    def pattern(token):
        return '%' + token.replace('!', '!!').replace('%', '!%').replace('_', '!_') + '%'

    def token_match(columns, token):
        return or_(*[func.coalesce(column, '').ilike(pattern(token), escape='!') for column in columns])

    def matches(columns):
        return and_(*[token_match(columns, token) for token in tokens]) if tokens else True

    def page(statement, kind):
        if category and category != kind:
            return []
        return statement.offset(offset).limit(limit + 1).all()


    identity_columns = [Student.student_name, Student.school_student_id, Student.school, Student.grade, Student.grade + func.coalesce(Student.lang_stream, '')]
    students_query = db.query(Student)
    student_match = matches(identity_columns)
    if can_see_phone:
        # Preserve the existing contact permission boundary. JSON_SEARCH is MySQL-specific.
        phone_match = matches([Student.phone])
        contact_match = and_(*[func.json_search(
            Student.contacts, 'one', '%' + token.replace('!', '!!').replace('%', '!%').replace('_', '!_') + '%',
            '!', '$[*].phone'
        ).isnot(None) for token in tokens])
        student_match = or_(student_match, phone_match, contact_match)
    students_query = students_query.filter(student_match)
    if location:
        students_query = students_query.filter(or_(
            Student.home_location == location,
            Student.id.in_(select(Enrollment.student_id).where(Enrollment.location == location)),
        ))
    if tutor_id is not None:
        students_query = students_query.filter(Student.id.in_(select(Enrollment.student_id).where(Enrollment.tutor_id == tutor_id)))
    if student_id is not None:
        students_query = students_query.filter(Student.id == student_id)
    exact_identity = case((Student.school_student_id == query.strip(), 0),
                          (Student.student_name == query.strip(), 1), else_=2)
    students = page(students_query.order_by(exact_identity, Student.student_name, Student.id), 'students')

    session_columns = identity_columns + [Tutor.tutor_name, SessionLog.time_slot, SessionLog.location,
                                          SessionLog.session_status, cast(SessionLog.session_date, String), SessionLog.notes]
    # EXISTS keeps a lesson unique even when several assigned worksheets match.
    session_matches = and_(*[or_(
        token_match(session_columns, token),
        select(SessionExercise.id).where(
            SessionExercise.session_id == SessionLog.id,
            token_match([SessionExercise.pdf_name, SessionExercise.url_title], token),
        ).exists(),
    ) for token in tokens]) if tokens else True
    sessions_query = db.query(SessionLog).options(
        joinedload(SessionLog.student), joinedload(SessionLog.tutor)
    ).join(Student, SessionLog.student_id == Student.id).outerjoin(Tutor, SessionLog.tutor_id == Tutor.id).filter(session_matches)
    if from_date is not None:
        sessions_query = sessions_query.filter(SessionLog.session_date >= from_date)
    if to_date is not None:
        sessions_query = sessions_query.filter(SessionLog.session_date <= to_date)
    if tutor_id is not None:
        sessions_query = sessions_query.filter(SessionLog.tutor_id == tutor_id)
    if student_id is not None:
        sessions_query = sessions_query.filter(SessionLog.student_id == student_id)
    if status == 'upcoming':
        sessions_query = sessions_query.filter(SessionLog.session_status.in_(['Scheduled', 'Trial Class', 'Make-up Class']),
            or_(SessionLog.session_date > today, and_(SessionLog.session_date == today, or_(SessionLog.time_slot.is_(None), func.substr(SessionLog.time_slot, -5) >= now.strftime('%H:%M')))))
    elif status == 'unmarked':
        sessions_query = sessions_query.filter(SessionLog.session_status.in_(['Scheduled', 'Trial Class', 'Make-up Class']), SessionLog.session_date <= today)
    elif status == 'pending-makeups':
        sessions_query = sessions_query.filter(SessionLog.session_status.endswith('- Pending Make-up'))
    elif status:
        sessions_query = sessions_query.filter(SessionLog.session_status == status)
    if not include_history and from_date is None and to_date is None:
        sessions_query = sessions_query.filter(
            SessionLog.session_date >= today - timedelta(days=30),
            SessionLog.session_date <= today + timedelta(days=30),
        )
    if location:
        sessions_query = sessions_query.filter(SessionLog.location == location)
    # Today and upcoming first, nearest date first, then recent history.
    sessions = page(sessions_query.order_by(
        exact_identity,
        case((SessionLog.session_date >= today, 0), else_=1),
        case((SessionLog.session_date >= today, SessionLog.session_date), else_=None).asc(),
        SessionLog.session_date.desc(), SessionLog.time_slot, SessionLog.id,
    ), 'sessions')

    # Match explanations are fetched only for the visible page, never once per lesson.
    explanations = {row.id: [] for row in sessions[:limit]}

    def snippet(value):
        if not value:
            return None
        positions = [value.casefold().find(token.casefold()) for token in tokens]
        positions = [pos for pos in positions if pos >= 0]
        if not positions:
            return None
        start = max(0, min(positions) - 36)
        return ('…' if start else '') + value[start:start + 160] + ('…' if len(value) > start + 160 else '')

    for row in sessions[:limit]:
        text = snippet(row.notes)
        if text:
            explanations[row.id].append(dict(label='Comment', text=text))
    if explanations and tokens:
        assigned_matches = db.query(SessionExercise).filter(
            SessionExercise.session_id.in_(explanations),
            or_(*[token_match([SessionExercise.pdf_name, SessionExercise.url_title], token) for token in tokens]),
        ).order_by(SessionExercise.id).all()
        for exercise in assigned_matches:
            if len(explanations[exercise.session_id]) >= 2:
                continue
            text = snippet(exercise.url_title) or snippet(exercise.pdf_name)
            if text:
                explanations[exercise.session_id].append(dict(label='HW' if exercise.exercise_type in ['HW', 'Homework'] else 'CW', text=text))

    future_lesson = select(SessionLog.id).where(
        SessionLog.enrollment_id == Enrollment.id,
        SessionLog.session_date >= today,
        SessionLog.session_status.notin_(['Cancelled', 'Cancelled (Make-up)']),
    ).exists()
    current = and_(Enrollment.payment_status.in_(['Paid', 'Pending Payment', 'Waived']), or_(
        future_lesson, Enrollment.first_lesson_date >= today, Enrollment.first_lesson_date.is_(None),
    ))
    enrollments_query = db.query(Enrollment).options(
        joinedload(Enrollment.student), joinedload(Enrollment.tutor)
    ).join(Student, Enrollment.student_id == Student.id).outerjoin(Tutor, Enrollment.tutor_id == Tutor.id).filter(
        matches(identity_columns + [Tutor.tutor_name, Enrollment.assigned_day, Enrollment.assigned_time,
                                    Enrollment.location, Enrollment.enrollment_type,
                                    cast(Enrollment.first_lesson_date, String)])
    )
    if not include_history:
        enrollments_query = enrollments_query.filter(current)
    if location:
        enrollments_query = enrollments_query.filter(Enrollment.location == location)
    if tutor_id is not None:
        enrollments_query = enrollments_query.filter(Enrollment.tutor_id == tutor_id)
    if student_id is not None:
        enrollments_query = enrollments_query.filter(Enrollment.student_id == student_id)
    enrollments = page(enrollments_query.order_by(
        exact_identity, case((current, 0), else_=1),
        case((Enrollment.first_lesson_date <= today, 0), else_=1),
        case((Enrollment.first_lesson_date > today, Enrollment.first_lesson_date), else_=None).asc(),
        Enrollment.first_lesson_date.desc(), Enrollment.id.desc(),
    ), 'enrollments')

    exams_query = db.query(CalendarEvent).filter(
        CalendarEvent.event_type.in_(EXAM_EVENT_TYPES),
        matches([CalendarEvent.title, CalendarEvent.school, CalendarEvent.grade]),
    )
    if not include_history and from_date is None and to_date is None:
        exams_query = exams_query.filter(CalendarEvent.start_date >= today - timedelta(days=30))
    if from_date is not None:
        exams_query = exams_query.filter(CalendarEvent.end_date >= from_date)
    if to_date is not None:
        exams_query = exams_query.filter(CalendarEvent.start_date <= to_date)
    # Exams have no pupil or tutor ownership relation.
    exams = [] if tutor_id is not None or student_id is not None else page(exams_query.order_by(CalendarEvent.start_date.asc(), CalendarEvent.id), 'exams')

    def identity(student):
        return dict(student_name=student.student_name if student else None,
                    school_student_id=student.school_student_id if student else None,
                    grade=student.grade if student else None,
                    lang_stream=student.lang_stream if student else None,
                    school=student.school if student else None)

    return {
        'students': [dict(id=s.id, **identity(s), phone=s.phone if can_see_phone else None,
                          contacts=s.contacts if can_see_phone else None) for s in students[:limit]],
        'sessions': [dict(id=s.id, student_id=s.student_id, **identity(s.student),
                          session_date=s.session_date.isoformat(), time_slot=s.time_slot, location=s.location,
                          match_context=explanations[s.id], session_status=s.session_status, tutor_name=s.tutor.tutor_name if s.tutor else None)
                     for s in sessions[:limit]],
        'enrollments': [dict(id=e.id, student_id=e.student_id, **identity(e.student),
                             tutor_name=e.tutor.tutor_name if e.tutor else None, location=e.location,
                             payment_status=e.payment_status, assigned_day=e.assigned_day,
                             assigned_time=e.assigned_time, enrollment_type=e.enrollment_type,
                             first_lesson_date=e.first_lesson_date.isoformat() if e.first_lesson_date else None)
                        for e in enrollments[:limit]],
        'exams': [dict(id=e.id, event_id=e.event_id, title=e.title,
                       start_date=e.start_date.isoformat() if e.start_date else None,
                       end_date=e.end_date.isoformat() if e.end_date else None,
                       school=e.school, grade=e.grade, event_type=e.event_type) for e in exams[:limit]],
        'has_more': dict(students=len(students) > limit, sessions=len(sessions) > limit,
                         enrollments=len(enrollments) > limit, exams=len(exams) > limit),
    }
