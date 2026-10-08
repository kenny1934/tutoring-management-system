"""
Lessons taught but not in CSM yet.

A tutor records a lesson CSM doesn't have yet, for a student who turned up
without one. Admins see the waiting ones on the Renewals page and in the bell,
and create the enrolment from there. Once the real lesson exists it fills
itself in (services/unlisted_lessons.py). The rows live in tutor_memos, the
table's old name.
"""
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from auth.dependencies import (
    ADMIN_WRITE_ROLES,
    reject_guest,
    reject_read_only,
    require_admin_view,
    require_admin_write,
)
from constants import hk_now
from database import get_db
from models import Enrollment, SessionLog, Student, Tutor, TutorMemo
from schemas import (
    UnlistedLessonCreate,
    UnlistedLessonDismiss,
    UnlistedLessonResponse,
    UnlistedLessonUpdate,
)
from services.unlisted_lessons import (
    DISMISSED,
    FILLABLE_STATUSES,
    FILLED,
    WAITING,
    exercise_type_code,
    fill_lesson,
    fill_unlisted_lessons,
    tell_tutors,
)

router = APIRouter()


def _response(lesson: TutorMemo) -> UnlistedLessonResponse:
    student = lesson.student
    return UnlistedLessonResponse(
        id=lesson.id,
        student_id=lesson.student_id,
        student_name=student.student_name if student else "Unknown",
        school_student_id=student.school_student_id if student else None,
        grade=student.grade if student else None,
        lang_stream=student.lang_stream if student else None,
        school=student.school if student else None,
        tutor_id=lesson.tutor_id,
        tutor_name=lesson.tutor.tutor_name if lesson.tutor else "Unknown",
        lesson_date=lesson.memo_date,
        time_slot=lesson.time_slot,
        location=lesson.location,
        notes=lesson.notes,
        exercises=lesson.exercises or [],
        performance_rating=lesson.performance_rating,
        status=lesson.status,
        filled_session_id=lesson.linked_session_id if lesson.status == FILLED else None,
        filled_at=lesson.filled_at,
        dismissed_at=lesson.dismissed_at,
        dismiss_reason=lesson.dismiss_reason,
        created_at=lesson.created_at,
        created_by=lesson.created_by,
    )


def _load(db: Session, lesson_id: int) -> TutorMemo:
    lesson = db.query(TutorMemo).options(
        joinedload(TutorMemo.student),
        joinedload(TutorMemo.tutor),
    ).filter(TutorMemo.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="That lesson was not found")
    return lesson


def _exercises_json(items) -> list[dict]:
    """The exercises as stored, without the ids the edit forms send, and
    with the type written as CW or HW."""
    out = []
    for item in items:
        data = item.model_dump(exclude={"id"})
        data["exercise_type"] = exercise_type_code(data.get("exercise_type"))
        out.append(data)
    return out


def _check_can_change(lesson: TutorMemo, user: Tutor) -> None:
    """Only the tutor who recorded it or an admin may change it, and only
    while it's still waiting. Once filled in, the real lesson is the record."""
    if lesson.tutor_id != user.id and user.role not in ADMIN_WRITE_ROLES:
        raise HTTPException(status_code=403, detail="You can only change lessons you recorded")
    if lesson.status != WAITING:
        raise HTTPException(status_code=409, detail="This lesson is no longer waiting, so it can't be changed")


@router.get("/unlisted-lessons", response_model=List[UnlistedLessonResponse])
def list_unlisted_lessons(
    status: Optional[str] = Query(None, pattern="^(waiting|filled|dismissed)$"),
    tutor_id: Optional[int] = Query(None),
    student_id: Optional[int] = Query(None),
    location: Optional[str] = Query(None),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    limit: int = Query(200, ge=1, le=500),
    _: Tutor = Depends(reject_guest),
    db: Session = Depends(get_db),
):
    """The Sessions list asks for a date range to show them in their time
    slots. The Renewals page asks for every waiting one in a branch."""
    query = db.query(TutorMemo).options(
        joinedload(TutorMemo.student),
        joinedload(TutorMemo.tutor),
    )
    if status:
        query = query.filter(TutorMemo.status == status)
    if tutor_id:
        query = query.filter(TutorMemo.tutor_id == tutor_id)
    if student_id:
        query = query.filter(TutorMemo.student_id == student_id)
    if location:
        query = query.filter(TutorMemo.location == location)
    if from_date:
        query = query.filter(TutorMemo.memo_date >= from_date)
    if to_date:
        query = query.filter(TutorMemo.memo_date <= to_date)
    lessons = query.order_by(TutorMemo.memo_date, TutorMemo.time_slot, TutorMemo.id).limit(limit).all()
    return [_response(lesson) for lesson in lessons]


@router.get("/unlisted-lessons/waiting-count")
def get_waiting_count(
    location: Optional[str] = Query(None),
    _: Tutor = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """For the bell: how many lessons are waiting for an enrolment."""
    query = db.query(func.count(TutorMemo.id)).filter(TutorMemo.status == WAITING)
    if location:
        query = query.filter(TutorMemo.location == location)
    return {"count": query.scalar() or 0}


@router.get("/unlisted-lessons/latest-enrolments")
def get_latest_enrolments(
    student_ids: List[int] = Query(...),
    _: Tutor = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Each student's most recent regular enrolment, so the Renewals page can
    open the enrolment form as a renewal of it. A student with none starts a
    new enrolment instead."""
    rows = (
        db.query(Enrollment.student_id, func.max(Enrollment.id))
        .filter(
            Enrollment.student_id.in_(student_ids[:200]),
            Enrollment.enrollment_type == "Regular",
            Enrollment.payment_status != "Cancelled",
        )
        .group_by(Enrollment.student_id)
        .all()
    )
    return {str(student_id): enrollment_id for student_id, enrollment_id in rows}


@router.get("/unlisted-lessons/{lesson_id}", response_model=UnlistedLessonResponse)
def get_unlisted_lesson(
    lesson_id: int,
    _: Tutor = Depends(reject_guest),
    db: Session = Depends(get_db),
):
    return _response(_load(db, lesson_id))


@router.post("/unlisted-lessons", response_model=UnlistedLessonResponse)
def create_unlisted_lesson(
    data: UnlistedLessonCreate,
    current_user: Tutor = Depends(reject_read_only),
    db: Session = Depends(get_db),
):
    """Records the lesson. If CSM already has a lesson for that student that
    day, it is filled in straight away and comes back filled."""
    if not db.query(Student.id).filter(Student.id == data.student_id).first():
        raise HTTPException(status_code=404, detail="That student was not found")

    tutor_id = current_user.id
    if data.tutor_id and data.tutor_id != current_user.id:
        if current_user.role not in ADMIN_WRITE_ROLES:
            raise HTTPException(status_code=403, detail="Only an admin can record a lesson for another tutor")
        if not db.query(Tutor.id).filter(Tutor.id == data.tutor_id).first():
            raise HTTPException(status_code=404, detail="That tutor was not found")
        tutor_id = data.tutor_id

    lesson = TutorMemo(
        student_id=data.student_id,
        tutor_id=tutor_id,
        memo_date=data.lesson_date,
        time_slot=data.time_slot,
        location=data.location,
        notes=data.notes,
        exercises=_exercises_json(data.exercises),
        performance_rating=data.performance_rating,
        status=WAITING,
        created_by=current_user.user_email,
    )
    db.add(lesson)
    fill_unlisted_lessons(db, [data.student_id], current_user.user_email)
    db.commit()
    return _response(_load(db, lesson.id))


@router.patch("/unlisted-lessons/{lesson_id}", response_model=UnlistedLessonResponse)
def update_unlisted_lesson(
    lesson_id: int,
    data: UnlistedLessonUpdate,
    current_user: Tutor = Depends(reject_read_only),
    db: Session = Depends(get_db),
):
    lesson = _load(db, lesson_id)
    _check_can_change(lesson, current_user)

    sent = data.model_fields_set
    if "student_id" in sent and data.student_id and data.student_id != lesson.student_id:
        if not db.query(Student.id).filter(Student.id == data.student_id).first():
            raise HTTPException(status_code=404, detail="That student was not found")
        lesson.student_id = data.student_id
    if "lesson_date" in sent and data.lesson_date:
        lesson.memo_date = data.lesson_date
    for field in ("time_slot", "location", "notes", "performance_rating"):
        if field in sent:
            setattr(lesson, field, getattr(data, field))
    if "exercises" in sent and data.exercises is not None:
        lesson.exercises = _exercises_json(data.exercises)

    # A change of student, date or slot can put it on a lesson CSM already has.
    fill_unlisted_lessons(db, [lesson.student_id], current_user.user_email)
    db.commit()
    return _response(_load(db, lesson.id))


@router.delete("/unlisted-lessons/{lesson_id}")
def delete_unlisted_lesson(
    lesson_id: int,
    current_user: Tutor = Depends(reject_read_only),
    db: Session = Depends(get_db),
):
    lesson = _load(db, lesson_id)
    _check_can_change(lesson, current_user)
    db.delete(lesson)
    db.commit()
    return {"message": "Deleted"}


@router.post("/unlisted-lessons/{lesson_id}/dismiss", response_model=UnlistedLessonResponse)
def dismiss_unlisted_lesson(
    lesson_id: int,
    data: UnlistedLessonDismiss,
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Sets a waiting lesson aside, for one recorded by mistake or dealt with
    some other way. A free lesson should become a Waived enrolment instead."""
    lesson = _load(db, lesson_id)
    if lesson.status != WAITING:
        raise HTTPException(status_code=409, detail="This lesson is no longer waiting")
    lesson.status = DISMISSED
    lesson.dismissed_at = hk_now()
    lesson.dismissed_by = admin.user_email
    lesson.dismiss_reason = data.reason
    db.commit()
    return _response(_load(db, lesson.id))


@router.post("/unlisted-lessons/{lesson_id}/fill/{session_id}", response_model=UnlistedLessonResponse)
def fill_into_session(
    lesson_id: int,
    session_id: int,
    current_user: Tutor = Depends(reject_read_only),
    db: Session = Depends(get_db),
):
    """The one-click fill on a lesson's page, for when CSM couldn't tell which
    lesson a record belongs to. The lesson must be the same student's, on the
    same day, and one the student could have attended."""
    lesson = _load(db, lesson_id)
    session = db.query(SessionLog).filter(SessionLog.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="That lesson was not found")
    if session.tutor_id != current_user.id and current_user.role not in ADMIN_WRITE_ROLES:
        raise HTTPException(status_code=403, detail="You can only fill in your own lessons")
    if lesson.status != WAITING:
        raise HTTPException(status_code=409, detail="This record has already been used or set aside")
    if lesson.student_id != session.student_id or lesson.memo_date != session.session_date:
        raise HTTPException(status_code=400, detail="The record is for a different student or day")
    if session.session_status not in FILLABLE_STATUSES:
        raise HTTPException(status_code=400, detail="The student wasn't at this lesson, so it can't be filled in")
    already = db.query(TutorMemo.id).filter(
        TutorMemo.linked_session_id == session.id, TutorMemo.status == FILLED,
    ).first()
    if already:
        raise HTTPException(status_code=409, detail="This lesson has already been filled in from another record")

    fill_lesson(db, lesson, session, current_user.user_email)
    tell_tutors(db, [(lesson, session)], current_user.user_email)
    db.commit()
    return _response(_load(db, lesson.id))


@router.get("/sessions/{session_id}/unlisted-lessons", response_model=List[UnlistedLessonResponse])
def get_waiting_for_session(
    session_id: int,
    _: Tutor = Depends(reject_guest),
    db: Session = Depends(get_db),
):
    """Waiting records of the same student on the same day, for the lesson
    page to offer the one-click fill."""
    session = db.query(SessionLog).filter(SessionLog.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="That lesson was not found")
    lessons = db.query(TutorMemo).options(
        joinedload(TutorMemo.student),
        joinedload(TutorMemo.tutor),
    ).filter(
        TutorMemo.student_id == session.student_id,
        TutorMemo.memo_date == session.session_date,
        TutorMemo.status == WAITING,
    ).order_by(TutorMemo.id).all()
    return [_response(lesson) for lesson in lessons]
