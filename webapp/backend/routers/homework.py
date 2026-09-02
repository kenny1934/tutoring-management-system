"""
Homework checking endpoints.

Homework is assigned in one session and checked in a later one, so a check is
keyed to the assignment rather than to the session the tutor happened to be
sitting in. The homework_to_check view decides what is still open for a given
session, looking back up to three sat sessions.
"""
from typing import List, NamedTuple, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import case, func
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from auth.dependencies import get_current_user, reject_read_only
from constants import hk_now
from database import get_db
from models import (
    HomeworkCompletion,
    HomeworkFile,
    HomeworkToCheck,
    SessionExercise,
    SessionLog,
    Tutor,
)
from schemas import (
    HomeworkCompletionResponse,
    HomeworkCountResponse,
    HomeworkFileResponse,
    HomeworkMarkRequest,
    SessionHomeworkResponse,
)
from services.image_storage import (
    MAX_DOC_SIZE,
    MAX_FILE_SIZE,
    delete_image,
    upload_document,
    upload_image_with_thumbnail,
)

router = APIRouter()

# completion_status values that mean a tutor has actually assessed the work.
# 'Submitted' is deliberately absent: the work came back but nobody has marked
# it, so it stays in the backlog and keeps ageing.
CHECKED_STATUSES = ('Completed', 'Partially Completed', 'Not Completed')

# Kept in sync with completion_status for the legacy reporting queries. Anything
# with a recorded state other than Not Completed came back.
SUBMITTED_STATUSES = ('Submitted', 'Completed', 'Partially Completed')

MAX_BULK_SESSIONS = 200

# A student's whole homework record. Generous enough to cover years of lessons,
# bounded so one request cannot pull an unbounded list.
DEFAULT_STUDENT_HOMEWORK_LIMIT = 500
MAX_STUDENT_HOMEWORK = 2000

# Everything lands under one folder in the shared bucket.
STORAGE_PREFIX = "homework"


def _parse_session_ids(raw: str) -> List[int]:
    """Read a comma-separated session id list, rejecting junk and huge requests."""
    try:
        ids = [int(part) for part in raw.split(",") if part.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="session_ids must be integers")

    if len(ids) > MAX_BULK_SESSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Too many sessions requested. Maximum is {MAX_BULK_SESSIONS}",
        )
    return ids


def _load_files(db: Session, completion_ids: List[int]) -> dict:
    """
    Uploaded files for the given completion records, keyed by record.

    Only called for records the view says have attachments, so the usual case
    of nothing handed in costs no query at all.
    """
    if not completion_ids:
        return {}

    files = db.query(HomeworkFile).filter(
        HomeworkFile.homework_completion_id.in_(completion_ids)
    ).order_by(HomeworkFile.file_order, HomeworkFile.id).all()

    by_completion: dict = {}
    for file in files:
        by_completion.setdefault(file.homework_completion_id, []).append(
            HomeworkFileResponse.model_validate(file)
        )
    return by_completion


def load_homework_to_check(db: Session, session_ids: List[int]) -> dict:
    """
    Open homework for each of the given sessions, keyed by session id.

    Shared with the session detail endpoint so both read the same shape.
    """
    if not session_ids:
        return {}

    rows = db.query(HomeworkToCheck).filter(
        HomeworkToCheck.current_session_id.in_(session_ids)
    ).all()

    files_by_completion = _load_files(db, [
        row.completion_id for row in rows
        if row.completion_id and (row.attachment_count or 0) > 0
    ])

    by_session: dict = {}
    for row in rows:
        item = HomeworkCompletionResponse.model_validate(row)
        item.files = files_by_completion.get(row.completion_id, [])
        by_session.setdefault(row.current_session_id, []).append(item)

    # Oldest assignment first, so the longest-outstanding homework leads.
    for items in by_session.values():
        items.sort(key=lambda hw: (-(hw.sessions_ago or 0), hw.pdf_name or hw.url or ''))

    return by_session


@router.get("/homework/to-check", response_model=List[SessionHomeworkResponse])
async def get_homework_to_check(
    session_ids: str = Query(..., description="Comma-separated session IDs"),
    db: Session = Depends(get_db),
    current_user: Tutor = Depends(get_current_user),
):
    """
    Homework still open across many sessions, for surfaces holding several at
    once: the bulk rate modal and wide lesson mode.
    """
    ids = _parse_session_ids(session_ids)
    by_session = load_homework_to_check(db, ids)

    return [
        SessionHomeworkResponse(session_id=session_id, homework=by_session.get(session_id, []))
        for session_id in ids
    ]


@router.get("/homework/counts", response_model=List[HomeworkCountResponse])
async def get_homework_counts(
    session_ids: str = Query(..., description="Comma-separated session IDs"),
    db: Session = Depends(get_db),
    current_user: Tutor = Depends(get_current_user),
):
    """
    How much homework is open per session, for list badges.

    Counts only. The full detail comes from the session itself when a tutor
    opens it, which keeps this cheap enough to call for a screen of rows.
    """
    ids = _parse_session_ids(session_ids)
    if not ids:
        return []

    # Counted off completion_status, the same field the panels read, so a badge
    # and the rows behind it can never disagree.
    rows = db.query(
        HomeworkToCheck.current_session_id.label("session_id"),
        func.count().label("total"),
        func.sum(
            case((HomeworkToCheck.completion_status.in_(CHECKED_STATUSES), 1), else_=0)
        ).label("checked"),
    ).filter(
        HomeworkToCheck.current_session_id.in_(ids)
    ).group_by(HomeworkToCheck.current_session_id).all()

    return [
        HomeworkCountResponse(
            session_id=row.session_id,
            total=row.total or 0,
            checked=int(row.checked or 0),
        )
        for row in rows
    ]


@router.get("/students/{student_id}/homework", response_model=List[HomeworkCompletionResponse])
async def get_student_homework(
    student_id: int,
    limit: int = Query(DEFAULT_STUDENT_HOMEWORK_LIMIT, ge=1, le=MAX_STUDENT_HOMEWORK),
    db: Session = Depends(get_db),
    current_user: Tutor = Depends(get_current_user),
):
    """
    Every homework assignment a student has been set, with its check state.

    The whole record, not the rolling backlog. homework_to_check only looks
    back three sat sessions, so anything that fell out of that window unmarked
    is unreachable from every lesson surface; this is what makes it reachable
    again, and what puts a student's history in one place.

    Read straight off the tables rather than through the view: no lookback, no
    correlated subqueries, one indexed pass over the student's sessions.
    """
    rows = db.query(
        SessionExercise,
        SessionLog,
        Tutor.tutor_name,
        HomeworkCompletion,
    ).join(
        SessionLog, SessionLog.id == SessionExercise.session_id
    ).outerjoin(
        Tutor, Tutor.id == SessionLog.tutor_id
    ).outerjoin(
        HomeworkCompletion, HomeworkCompletion.session_exercise_id == SessionExercise.id
    ).filter(
        SessionLog.student_id == student_id,
        SessionExercise.exercise_type.in_(('HW', 'Homework')),
    ).order_by(
        SessionLog.session_date.desc(), SessionLog.id.desc(), SessionExercise.id
    ).limit(limit).all()

    files_by_completion = _load_files(db, [
        completion.id for _, _, _, completion in rows if completion
    ])

    # Where each still-open assignment would next be seen, straight from the
    # view rather than by reimplementing its window. Measured at ~220 ms for
    # the busiest student in prod, and it is what stops this page and the
    # lesson surfaces disagreeing about which lesson owns an item.
    open_in_session = {
        row.session_exercise_id: row.target
        for row in db.query(
            HomeworkToCheck.session_exercise_id,
            func.max(HomeworkToCheck.current_session_id).label("target"),
        ).filter(
            HomeworkToCheck.student_id == student_id
        ).group_by(HomeworkToCheck.session_exercise_id).all()
    }

    items = []
    for exercise, session, tutor_name, completion in rows:
        files = files_by_completion.get(completion.id, []) if completion else []
        assessed = completion and completion.completion_status in CHECKED_STATUSES
        items.append(HomeworkCompletionResponse(
            session_exercise_id=exercise.id,
            # This page is not a lesson, so a mark from it needs one to land on.
            # An assessed item keeps the lesson that assessed it. Otherwise the
            # latest lesson still listing it, so the verdict shows up there
            # instead of vanishing from a panel a tutor is about to open. Only
            # when no lesson can still reach it does the lesson that set it
            # stand in, which is the case this whole surface exists for.
            current_session_id=(
                completion.current_session_id if assessed
                else open_in_session.get(exercise.id) or session.id
            ),
            student_id=student_id,
            assigned_session_id=session.id,
            homework_assigned_date=session.session_date,
            assigned_time_slot=session.time_slot,
            assigned_by_tutor_id=session.tutor_id,
            assigned_by_tutor=tutor_name,
            # Ageing is a property of a backlog, and this list is not one.
            sessions_ago=0,
            pdf_name=exercise.pdf_name,
            page_start=exercise.page_start,
            page_end=exercise.page_end,
            url=exercise.url,
            url_title=exercise.url_title,
            assignment_remarks=exercise.remarks,
            completion_id=completion.id if completion else None,
            completion_status=(
                completion.completion_status if completion else None
            ) or 'Not Checked',
            homework_rating=completion.homework_rating if completion else None,
            tutor_comments=completion.tutor_comments if completion else None,
            checked_by=completion.checked_by if completion else None,
            checked_at=completion.checked_at if completion else None,
            checked_in_session_id=completion.current_session_id if completion else None,
            attachment_count=len(files),
            files=files,
        ))

    return items


class Assignment(NamedTuple):
    """One homework assignment, resolved against the session marking it."""
    session: SessionLog
    exercise: SessionExercise
    assigning_session: Optional[SessionLog]
    assigned_by_tutor: Optional[str]


def _resolve_assignment(db: Session, session_id: int, session_exercise_id: int) -> Assignment:
    """
    The session being marked from, the homework, and the lesson that set it.

    Raises the same errors for every write path, so marking and uploading
    cannot disagree about what counts as a valid target.
    """
    session = db.query(SessionLog).filter(SessionLog.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail=f"Session with ID {session_id} not found")

    # The exercise, the session that set it and that session's tutor in one trip.
    assignment = db.query(SessionExercise, SessionLog, Tutor.tutor_name).outerjoin(
        SessionLog, SessionLog.id == SessionExercise.session_id
    ).outerjoin(
        Tutor, Tutor.id == SessionLog.tutor_id
    ).filter(SessionExercise.id == session_exercise_id).first()

    if not assignment:
        raise HTTPException(
            status_code=404, detail=f"Homework with ID {session_exercise_id} not found"
        )
    exercise, assigning_session, assigned_by_tutor = assignment

    if exercise.exercise_type not in ('HW', 'Homework'):
        raise HTTPException(
            status_code=400, detail="That exercise is classwork, not homework"
        )

    # The assignment has to belong to the same student, or this is the wrong row.
    if assigning_session and assigning_session.student_id != session.student_id:
        raise HTTPException(
            status_code=400,
            detail="That homework belongs to a different student",
        )

    return Assignment(session, exercise, assigning_session, assigned_by_tutor)


def _upsert_completion(db: Session, assignment: Assignment) -> HomeworkCompletion:
    """
    Find or create the record for this assignment and refresh its snapshot.

    Attaching a photo before picking a status has to create the record too, so
    this is shared rather than repeated.
    """
    session, exercise = assignment.session, assignment.exercise
    assigning_session = assignment.assigning_session

    completion = db.query(HomeworkCompletion).filter(
        HomeworkCompletion.session_exercise_id == exercise.id
    ).first()

    if not completion:
        completion = HomeworkCompletion(
            session_exercise_id=exercise.id,
            student_id=session.student_id,
            # Explicit rather than NULL, so a rating-only or photo-only first
            # save still reads as unchecked everywhere.
            completion_status='Not Checked',
            created_at=hk_now(),
        )
        db.add(completion)

    completion.current_session_id = session.id

    # Snapshot the assignment so the record survives the exercise being edited.
    completion.pdf_name = exercise.pdf_name
    completion.page_start = exercise.page_start
    completion.page_end = exercise.page_end
    completion.url = exercise.url
    completion.exercise_remarks = exercise.remarks
    if assigning_session:
        completion.assigned_date = assigning_session.session_date
        completion.assigned_by_tutor_id = assigning_session.tutor_id

    return completion


def _completion_response(
    db: Session,
    assignment: Assignment,
    completion: HomeworkCompletion,
) -> HomeworkCompletionResponse:
    """
    The saved state, as the view sees it where it has a row.

    Every write path returns this one shape, so the client folds a mark and an
    upload back into its cache the same way. Call after the commit: everything
    read here is re-read, so the response reflects what was stored.
    """
    session_id = assignment.session.id
    exercise = assignment.exercise

    # Counted from the files themselves rather than the view's own column, so
    # an upload's response cannot disagree with the list it just changed.
    files = _load_files(db, [completion.id]).get(completion.id, [])

    row = db.query(HomeworkToCheck).filter(
        HomeworkToCheck.current_session_id == session_id,
        HomeworkToCheck.session_exercise_id == exercise.id,
    ).first()

    if row:
        response = HomeworkCompletionResponse.model_validate(row)
        response.files = files
        response.attachment_count = len(files)
        return response

    # The view only lists homework set in an earlier session, so this is reached
    # when the assignment and the check share one. Everything needed is already
    # in hand, which is what the record's snapshot is for.
    return HomeworkCompletionResponse(
        session_exercise_id=exercise.id,
        current_session_id=session_id,
        student_id=completion.student_id,
        assigned_session_id=exercise.session_id,
        homework_assigned_date=completion.assigned_date,
        assigned_time_slot=(
            assignment.assigning_session.time_slot if assignment.assigning_session else None
        ),
        assigned_by_tutor_id=completion.assigned_by_tutor_id,
        assigned_by_tutor=assignment.assigned_by_tutor,
        sessions_ago=0,
        pdf_name=completion.pdf_name,
        page_start=completion.page_start,
        page_end=completion.page_end,
        url=completion.url,
        url_title=exercise.url_title,
        assignment_remarks=completion.exercise_remarks,
        completion_id=completion.id,
        completion_status=completion.completion_status,
        homework_rating=completion.homework_rating,
        tutor_comments=completion.tutor_comments,
        checked_by=completion.checked_by,
        checked_at=completion.checked_at,
        checked_in_session_id=completion.current_session_id,
        attachment_count=len(files),
        files=files,
    )


@router.patch(
    "/sessions/{session_id}/homework/{session_exercise_id}",
    response_model=HomeworkCompletionResponse,
)
async def mark_homework(
    session_id: int,
    session_exercise_id: int,
    request: HomeworkMarkRequest,
    current_user: Tutor = Depends(reject_read_only),
    db: Session = Depends(get_db),
):
    """
    Mark one homework assignment as checked in this session.

    Creates the completion record on first mark and updates it afterwards.
    Marking from a different session than the original check moves the record
    to the new session, since that is where the tutor actually saw the work.
    """
    assignment = _resolve_assignment(db, session_id, session_exercise_id)
    session = assignment.session
    completion = _upsert_completion(db, assignment)

    if request.completion_status is not None:
        completion.completion_status = request.completion_status
        completion.submitted = request.completion_status in SUBMITTED_STATUSES
    if request.homework_rating is not None:
        completion.homework_rating = request.homework_rating or None
    if request.tutor_comments is not None:
        completion.tutor_comments = request.tutor_comments or None

    status = completion.completion_status
    if status and status != 'Not Checked':
        # Stamped for 'Submitted' as well as the verdicts: taking the work in is
        # something a tutor did, and losing who took it in is worse than the
        # field reading a little loosely. Whether it was assessed is what
        # completion_status says.
        completion.checked_by = current_user.id
        completion.checked_at = hk_now()
    else:
        # Back to nothing recorded: drop the stamp so it reads as never touched.
        completion.checked_by = None
        completion.checked_at = None

    session.last_modified_by = current_user.user_email
    session.last_modified_time = hk_now()

    db.commit()

    return _completion_response(db, assignment, completion)


@router.post(
    "/sessions/{session_id}/homework/{session_exercise_id}/files",
    response_model=HomeworkCompletionResponse,
)
async def upload_homework_file(
    session_id: int,
    session_exercise_id: int,
    file: UploadFile = File(...),
    current_user: Tutor = Depends(reject_read_only),
    db: Session = Depends(get_db),
):
    """
    Attach a photo or PDF of what the student handed in.

    Creates the completion record if the tutor photographs the work before
    picking a status, which is the usual order at the desk.
    """
    assignment = _resolve_assignment(db, session_id, session_exercise_id)
    session = assignment.session

    content_type = (file.content_type or "").split(";")[0].strip()
    is_image = content_type.startswith("image/")
    if not is_image and content_type != "application/pdf":
        raise HTTPException(
            status_code=400, detail="Only photos and PDFs can be attached"
        )

    # An animated GIF would be flattened by the resize, so it is stored as-is
    # like a PDF. Everything else photographic goes through resize and compress:
    # a page shot on a phone is several megabytes otherwise.
    reprocess = is_image and content_type != "image/gif"
    size_cap = MAX_FILE_SIZE if reprocess else MAX_DOC_SIZE

    # Reject on the declared size before pulling the body into memory.
    if file.size and file.size > size_cap:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {size_cap // (1024 * 1024)}MB",
        )

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="That file is empty")

    filename = file.filename or ("photo.jpg" if is_image else "homework.pdf")
    thumbnail_url = None

    try:
        # Resizing and the upload itself are blocking, and this process serves
        # every other tutor while a lesson is running.
        if reprocess:
            # A thumbnail as well: these render at 48px in the row, and the
            # full upload is 1920px.
            url, thumbnail_url = await run_in_threadpool(
                upload_image_with_thumbnail, contents, filename, STORAGE_PREFIX
            )
        else:
            url = await run_in_threadpool(
                upload_document, contents, filename, content_type, STORAGE_PREFIX
            )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

    completion = _upsert_completion(db, assignment)
    db.flush()

    next_order = db.query(func.coalesce(func.max(HomeworkFile.file_order), 0)).filter(
        HomeworkFile.homework_completion_id == completion.id
    ).scalar()

    db.add(HomeworkFile(
        homework_completion_id=completion.id,
        file_path=url,
        thumbnail_path=thumbnail_url,
        file_type='image' if is_image else 'pdf',
        file_name=file.filename,
        file_size_kb=len(contents) // 1024,
        file_order=(next_order or 0) + 1,
        uploaded_at=hk_now(),
        uploaded_by=current_user.user_email,
    ))

    session.last_modified_by = current_user.user_email
    session.last_modified_time = hk_now()

    db.commit()

    return _completion_response(db, assignment, completion)


@router.delete(
    "/sessions/{session_id}/homework/{session_exercise_id}/files/{file_id}",
    response_model=HomeworkCompletionResponse,
)
async def delete_homework_file(
    session_id: int,
    session_exercise_id: int,
    file_id: int,
    current_user: Tutor = Depends(reject_read_only),
    db: Session = Depends(get_db),
):
    """Remove one attachment, and the stored file behind it."""
    assignment = _resolve_assignment(db, session_id, session_exercise_id)
    session = assignment.session

    completion = db.query(HomeworkCompletion).filter(
        HomeworkCompletion.session_exercise_id == session_exercise_id
    ).first()
    if not completion:
        raise HTTPException(status_code=404, detail="Nothing has been handed in for this homework")

    file = db.query(HomeworkFile).filter(
        HomeworkFile.id == file_id,
        HomeworkFile.homework_completion_id == completion.id,
    ).first()
    if not file:
        raise HTTPException(status_code=404, detail=f"File with ID {file_id} not found")

    # Best effort on the stored files: one left behind is harmless, but a row
    # kept because the delete failed leaves a thumbnail that cannot load.
    delete_image(file.file_path)
    if file.thumbnail_path:
        delete_image(file.thumbnail_path)
    db.delete(file)

    session.last_modified_by = current_user.user_email
    session.last_modified_time = hk_now()

    db.commit()

    return _completion_response(db, assignment, completion)
