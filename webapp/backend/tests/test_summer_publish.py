"""
Tests for the Summer publish bridge (Phase 5).

Covers: publish endpoint hard blocks + happy path, majority-slot tiebreaker,
payment status mapping, session status preservation, cancelled-placement skip,
unpublish (allowed and attended-block), batch publish, and downstream
special-casing (effective_end_date, renewal exclusion, overdue inclusion,
schedule-change block, cancel block, fee-message block).
"""
import pytest
from datetime import date, datetime, timedelta
from fastapi import HTTPException

from models import (
    Tutor,
    Student,
    SummerCourseConfig,
    SummerCourseSlot,
    SummerLesson,
    SummerSession,
    SummerApplication,
    Enrollment,
    SessionLog,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def admin(db_session):
    t = Tutor(
        user_email="admin@test.com",
        tutor_name="Admin",
        role="Admin",
        is_active_tutor=True,
    )
    db_session.add(t)
    db_session.commit()
    return t


@pytest.fixture
def slot_tutor(db_session):
    t = Tutor(
        user_email="slottutor@test.com",
        tutor_name="Slot Tutor",
        role="Tutor",
        is_active_tutor=True,
    )
    db_session.add(t)
    db_session.commit()
    return t


@pytest.fixture
def other_tutor(db_session):
    t = Tutor(
        user_email="other@test.com",
        tutor_name="Other Tutor",
        role="Tutor",
        is_active_tutor=True,
    )
    db_session.add(t)
    db_session.commit()
    return t


@pytest.fixture
def student(db_session):
    s = Student(
        student_name="Linked Student",
        grade="F1",
        home_location="MSA",
    )
    db_session.add(s)
    db_session.commit()
    return s


@pytest.fixture
def config(db_session):
    cfg = SummerCourseConfig(
        year=2026,
        title="Summer 2026",
        application_open_date=datetime(2026, 3, 1),
        application_close_date=datetime(2026, 6, 30),
        course_start_date=date(2026, 7, 6),
        course_end_date=date(2026, 8, 31),
        total_lessons=8,
        pricing_config={"base": 400},
        locations=[{"name": "MSA", "open_days": ["Tuesday"]}],
        available_grades=[{"value": "F1"}],
        time_slots=["10:00 - 11:30"],
        is_active=True,
    )
    db_session.add(cfg)
    db_session.commit()
    return cfg


@pytest.fixture
def slot(db_session, config, slot_tutor):
    s = SummerCourseSlot(
        config_id=config.id,
        slot_day="Tuesday",
        time_slot="10:00 - 11:30",
        location="MSA",
        grade="F1",
        course_type="A",
        max_students=8,
        tutor_id=slot_tutor.id,
    )
    db_session.add(s)
    db_session.commit()
    return s


@pytest.fixture
def slot_b(db_session, config, other_tutor):
    """A second slot for majority-tiebreaker tests (Friday)."""
    s = SummerCourseSlot(
        config_id=config.id,
        slot_day="Friday",
        time_slot="14:00 - 15:30",
        location="MSA",
        grade="F1",
        course_type="A",
        max_students=8,
        tutor_id=other_tutor.id,
    )
    db_session.add(s)
    db_session.commit()
    return s


def _materialize_lessons(db_session, slot):
    """Create 8 weekly lessons starting from config.course_start_date."""
    cfg = db_session.query(SummerCourseConfig).filter(SummerCourseConfig.id == slot.config_id).first()
    weekday_map = {"Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3,
                   "Friday": 4, "Saturday": 5, "Sunday": 6}
    target_wd = weekday_map[slot.slot_day]
    cur = cfg.course_start_date
    while cur.weekday() != target_wd:
        cur = date.fromordinal(cur.toordinal() + 1)
    lessons = []
    for i in range(8):
        lesson_date = date.fromordinal(cur.toordinal() + i * 7)
        lesson = SummerLesson(
            slot_id=slot.id,
            lesson_date=lesson_date,
            lesson_number=i + 1,
            lesson_status="Scheduled",
        )
        db_session.add(lesson)
        lessons.append(lesson)
    db_session.commit()
    return lessons


@pytest.fixture
def app_full(db_session, config, student):
    """Application linked to a real student, status=Paid, lessons_paid=8."""
    a = SummerApplication(
        config_id=config.id,
        reference_code="SC2026-T0001",
        student_name="Linked Student",
        grade="F1",
        contact_phone="11111111",
        application_status="Paid",
        sessions_per_week=1,
        lessons_paid=8,
        existing_student_id=student.id,
    )
    db_session.add(a)
    db_session.commit()
    return a


@pytest.fixture
def app_unlinked(db_session, config):
    """Application with no linked student → blocks publish."""
    a = SummerApplication(
        config_id=config.id,
        reference_code="SC2026-T0002",
        student_name="No Link",
        grade="F1",
        contact_phone="22222222",
        application_status="Paid",
        sessions_per_week=1,
        lessons_paid=8,
    )
    db_session.add(a)
    db_session.commit()
    return a


def _place_all(db_session, app, slot, lessons, status="Confirmed"):
    """Place the application across all 8 lessons of a slot."""
    for lesson in lessons:
        s = SummerSession(
            application_id=app.id,
            slot_id=slot.id,
            lesson_id=lesson.id,
            lesson_number=lesson.lesson_number,
            session_status=status,
        )
        db_session.add(s)
    db_session.commit()


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

class TestPublishHappyPath:
    def test_publish_creates_enrollment_and_sessions(
        self, db_session, admin, app_full, slot
    ):
        from routers.summer_course import publish_application
        lessons = _materialize_lessons(db_session, slot)
        _place_all(db_session, app_full, slot, lessons)

        result = publish_application(app_id=app_full.id, admin=admin, db=db_session)

        assert result.application_id == app_full.id
        assert result.sessions_created == 8

        enrollment = db_session.query(Enrollment).filter(
            Enrollment.summer_application_id == app_full.id
        ).first()
        assert enrollment is not None
        assert enrollment.enrollment_type == "Summer"
        assert enrollment.tutor_id == slot.tutor_id
        # Normalized to short weekday form ("Tuesday" → "Tue").
        assert enrollment.assigned_day == "Tue"
        assert enrollment.assigned_time == slot.time_slot
        # Slot location "MSA" already matches the short code — pass-through.
        assert enrollment.location == slot.location
        assert enrollment.lessons_paid == 8
        assert enrollment.first_lesson_date == lessons[0].lesson_date
        assert enrollment.payment_status == "Paid"  # app status was Paid
        assert enrollment.fee_message_sent is True
        assert enrollment.is_new_student is False

        sessions = db_session.query(SessionLog).filter(
            SessionLog.enrollment_id == enrollment.id
        ).all()
        assert len(sessions) == 8
        for s in sessions:
            assert s.session_status == "Scheduled"
            assert s.financial_status == "Paid"
            assert s.tutor_id == slot.tutor_id
            assert s.summer_session_id is not None

        # lesson_number is denormalized from SummerSession onto session_log so
        # session UIs can show an "L3" badge without joining back to summer.
        sessions_by_date = {s.session_date: s for s in sessions}
        for lesson in lessons:
            sess = sessions_by_date[lesson.lesson_date]
            assert sess.lesson_number == lesson.lesson_number

        # App status moved to Enrolled.
        db_session.refresh(app_full)
        assert app_full.application_status == "Enrolled"

    def test_publish_pending_payment_when_status_fee_sent(
        self, db_session, admin, app_full, slot
    ):
        """Fee Sent → enrollment is Pending Payment, sessions Unpaid, fee_message_sent=True."""
        app_full.application_status = "Fee Sent"
        db_session.commit()
        lessons = _materialize_lessons(db_session, slot)
        _place_all(db_session, app_full, slot, lessons)

        from routers.summer_course import publish_application
        publish_application(app_id=app_full.id, admin=admin, db=db_session)

        enrollment = db_session.query(Enrollment).filter(
            Enrollment.summer_application_id == app_full.id
        ).first()
        assert enrollment.payment_status == "Pending Payment"
        assert enrollment.fee_message_sent is True
        sessions = db_session.query(SessionLog).filter(
            SessionLog.enrollment_id == enrollment.id
        ).all()
        assert all(s.financial_status == "Unpaid" for s in sessions)


# ---------------------------------------------------------------------------
# Hard blocks
# ---------------------------------------------------------------------------

class TestPublishHardBlocks:
    def test_block_no_linked_student(self, db_session, admin, app_unlinked, slot):
        from routers.summer_course import publish_application
        lessons = _materialize_lessons(db_session, slot)
        _place_all(db_session, app_unlinked, slot, lessons)

        with pytest.raises(HTTPException) as exc:
            publish_application(app_id=app_unlinked.id, admin=admin, db=db_session)
        assert exc.value.status_code == 400
        assert exc.value.detail["error_code"] == "no_linked_student"

    def test_block_already_published(self, db_session, admin, app_full, slot):
        from routers.summer_course import publish_application
        lessons = _materialize_lessons(db_session, slot)
        _place_all(db_session, app_full, slot, lessons)
        publish_application(app_id=app_full.id, admin=admin, db=db_session)

        # Reset app status so the status check doesn't fire first.
        app_full.application_status = "Paid"
        db_session.commit()

        with pytest.raises(HTTPException) as exc:
            publish_application(app_id=app_full.id, admin=admin, db=db_session)
        assert exc.value.status_code == 400
        assert exc.value.detail["error_code"] == "already_published"
        assert "enrollment_id" in exc.value.detail

    def test_block_status_too_early(self, db_session, admin, app_full, slot):
        from routers.summer_course import publish_application
        app_full.application_status = "Placement Confirmed"
        db_session.commit()
        lessons = _materialize_lessons(db_session, slot)
        _place_all(db_session, app_full, slot, lessons)

        with pytest.raises(HTTPException) as exc:
            publish_application(app_id=app_full.id, admin=admin, db=db_session)
        assert exc.value.status_code == 400
        assert exc.value.detail["error_code"] == "status_too_early"

    def test_block_no_placements(self, db_session, admin, app_full):
        from routers.summer_course import publish_application
        with pytest.raises(HTTPException) as exc:
            publish_application(app_id=app_full.id, admin=admin, db=db_session)
        assert exc.value.detail["error_code"] == "no_placements"

    def test_block_tentative_placement(self, db_session, admin, app_full, slot):
        from routers.summer_course import publish_application
        lessons = _materialize_lessons(db_session, slot)
        _place_all(db_session, app_full, slot, lessons, status="Confirmed")
        # Flip one to Tentative.
        first = db_session.query(SummerSession).filter(
            SummerSession.application_id == app_full.id
        ).first()
        first.session_status = "Tentative"
        db_session.commit()

        with pytest.raises(HTTPException) as exc:
            publish_application(app_id=app_full.id, admin=admin, db=db_session)
        assert exc.value.detail["error_code"] == "tentative_placements"

    def test_block_lesson_count_mismatch(self, db_session, admin, app_full, slot):
        """app.lessons_paid=8 but only 4 placements → mismatch."""
        from routers.summer_course import publish_application
        lessons = _materialize_lessons(db_session, slot)
        for lesson in lessons[:4]:
            db_session.add(SummerSession(
                application_id=app_full.id,
                slot_id=slot.id,
                lesson_id=lesson.id,
                lesson_number=lesson.lesson_number,
                session_status="Confirmed",
            ))
        db_session.commit()

        with pytest.raises(HTTPException) as exc:
            publish_application(app_id=app_full.id, admin=admin, db=db_session)
        assert exc.value.detail["error_code"] == "lesson_count_mismatch"
        assert exc.value.detail["expected"] == 8
        assert exc.value.detail["actual"] == 4

    def test_block_datetime_collision(
        self, db_session, admin, app_full, slot, student, other_tutor
    ):
        """Existing active session at same date/time blocks publish."""
        from routers.summer_course import publish_application
        lessons = _materialize_lessons(db_session, slot)
        _place_all(db_session, app_full, slot, lessons)

        # Inject a colliding session_log row for this student at lesson[0]'s slot.
        clash = SessionLog(
            student_id=student.id,
            tutor_id=other_tutor.id,
            session_date=lessons[0].lesson_date,
            time_slot=slot.time_slot,
            location=slot.location,
            session_status="Scheduled",
            financial_status="Unpaid",
        )
        db_session.add(clash)
        db_session.commit()

        with pytest.raises(HTTPException) as exc:
            publish_application(app_id=app_full.id, admin=admin, db=db_session)
        assert exc.value.detail["error_code"] == "datetime_collision"
        assert len(exc.value.detail["conflicts"]) == 1


# ---------------------------------------------------------------------------
# Mapping behaviors
# ---------------------------------------------------------------------------

class TestPublishMapping:
    def test_majority_slot_tiebreaker_earliest_lesson_date(
        self, db_session, admin, app_full, config, slot, slot_b
    ):
        """Even split across two slots → earliest lesson-date slot wins."""
        from routers.summer_course import publish_application
        lessons_a = _materialize_lessons(db_session, slot)
        lessons_b = _materialize_lessons(db_session, slot_b)
        # lessons_a[0] is Tuesday Jul 7 2026, lessons_b[0] is Friday Jul 10 2026.
        assert lessons_a[0].lesson_date < lessons_b[0].lesson_date

        # 4 placements in each slot (8 total to match lessons_paid=8).
        for lesson in lessons_a[:4]:
            db_session.add(SummerSession(
                application_id=app_full.id, slot_id=slot.id,
                lesson_id=lesson.id, lesson_number=lesson.lesson_number,
                session_status="Confirmed",
            ))
        for lesson in lessons_b[:4]:
            db_session.add(SummerSession(
                application_id=app_full.id, slot_id=slot_b.id,
                lesson_id=lesson.id, lesson_number=lesson.lesson_number,
                session_status="Confirmed",
            ))
        db_session.commit()

        publish_application(app_id=app_full.id, admin=admin, db=db_session)

        enrollment = db_session.query(Enrollment).filter(
            Enrollment.summer_application_id == app_full.id
        ).first()
        # Slot A wins on tiebreaker (earliest lesson date).
        assert enrollment.tutor_id == slot.tutor_id
        assert enrollment.assigned_day == "Tue"

        # But each session_log keeps its own slot's tutor.
        sessions = db_session.query(SessionLog).filter(
            SessionLog.enrollment_id == enrollment.id
        ).all()
        tutor_ids = {s.tutor_id for s in sessions}
        assert slot.tutor_id in tutor_ids
        assert slot_b.tutor_id in tutor_ids

    def test_rescheduled_pending_status_preserved(
        self, db_session, admin, app_full, slot
    ):
        from routers.summer_course import publish_application
        lessons = _materialize_lessons(db_session, slot)
        _place_all(db_session, app_full, slot, lessons)
        # Mark one as Rescheduled - Pending Make-up.
        first = db_session.query(SummerSession).filter(
            SummerSession.application_id == app_full.id
        ).first()
        first.session_status = "Rescheduled - Pending Make-up"
        db_session.commit()

        publish_application(app_id=app_full.id, admin=admin, db=db_session)

        rescheduled = db_session.query(SessionLog).filter(
            SessionLog.summer_session_id == first.id
        ).first()
        assert rescheduled.session_status == "Rescheduled - Pending Make-up"

    def test_cancelled_placements_skipped(
        self, db_session, admin, app_full, slot
    ):
        """Cancelled placements don't create session_log rows; lessons_paid
        must equal NON-cancelled count to satisfy the count check."""
        from routers.summer_course import publish_application
        lessons = _materialize_lessons(db_session, slot)
        # 8 placements; one cancelled. Adjust app.lessons_paid to 7 so check passes.
        _place_all(db_session, app_full, slot, lessons)
        first = db_session.query(SummerSession).filter(
            SummerSession.application_id == app_full.id
        ).first()
        first.session_status = "Cancelled"
        app_full.lessons_paid = 7
        db_session.commit()

        publish_application(app_id=app_full.id, admin=admin, db=db_session)

        sessions = db_session.query(SessionLog).filter(
            SessionLog.summer_session_id == first.id
        ).all()
        assert sessions == []  # no row for the cancelled placement
        enrollment = db_session.query(Enrollment).filter(
            Enrollment.summer_application_id == app_full.id
        ).first()
        assert enrollment.lessons_paid == 7


# ---------------------------------------------------------------------------
# Unpublish
# ---------------------------------------------------------------------------

class TestUnpublish:
    def test_unpublish_happy_path(self, db_session, admin, app_full, slot):
        from routers.summer_course import publish_application, unpublish_application
        lessons = _materialize_lessons(db_session, slot)
        _place_all(db_session, app_full, slot, lessons)
        publish_application(app_id=app_full.id, admin=admin, db=db_session)

        result = unpublish_application(app_id=app_full.id, admin=admin, db=db_session)

        assert result.sessions_deleted == 8
        assert db_session.query(Enrollment).filter(
            Enrollment.summer_application_id == app_full.id
        ).first() is None
        # Status reverted to Paid (the previous status before publish moved
        # it to Enrolled).
        db_session.refresh(app_full)
        assert app_full.application_status == "Paid"

    def test_unpublish_blocked_by_attended_session(
        self, db_session, admin, app_full, slot
    ):
        from routers.summer_course import publish_application, unpublish_application
        lessons = _materialize_lessons(db_session, slot)
        _place_all(db_session, app_full, slot, lessons)
        publish_application(app_id=app_full.id, admin=admin, db=db_session)

        # Mark one session as attended.
        enrollment = db_session.query(Enrollment).filter(
            Enrollment.summer_application_id == app_full.id
        ).first()
        sess = db_session.query(SessionLog).filter(
            SessionLog.enrollment_id == enrollment.id
        ).first()
        sess.session_status = "Attended"
        db_session.commit()

        with pytest.raises(HTTPException) as exc:
            unpublish_application(app_id=app_full.id, admin=admin, db=db_session)
        assert exc.value.detail["error_code"] == "sessions_attended"

    def test_unpublish_not_published_returns_404_style(
        self, db_session, admin, app_full
    ):
        from routers.summer_course import unpublish_application
        with pytest.raises(HTTPException) as exc:
            unpublish_application(app_id=app_full.id, admin=admin, db=db_session)
        assert exc.value.detail["error_code"] == "not_published"


# ---------------------------------------------------------------------------
# Batch publish
# ---------------------------------------------------------------------------

class TestBatchPublish:
    def test_batch_partial_success(
        self, db_session, admin, app_full, app_unlinked, slot, config
    ):
        """One valid app + one app with no linked student → 1 success, 1 fail."""
        from routers.summer_course import publish_applications_batch
        from schemas import SummerPublishBatchRequest

        # Need separate slots so placements don't double-book the same lesson.
        slot2 = SummerCourseSlot(
            config_id=config.id,
            slot_day="Tuesday", time_slot="14:00 - 15:30",
            location="MSA", grade="F1", course_type="A", max_students=8,
            tutor_id=slot.tutor_id,
        )
        db_session.add(slot2)
        db_session.commit()

        lessons1 = _materialize_lessons(db_session, slot)
        lessons2 = _materialize_lessons(db_session, slot2)
        _place_all(db_session, app_full, slot, lessons1)
        _place_all(db_session, app_unlinked, slot2, lessons2)

        req = SummerPublishBatchRequest(application_ids=[app_full.id, app_unlinked.id])
        resp = publish_applications_batch(request=req, admin=admin, db=db_session)

        assert resp.published_count == 1
        assert resp.failed_count == 1
        results_by_id = {r.application_id: r for r in resp.results}
        assert results_by_id[app_full.id].success is True
        assert results_by_id[app_unlinked.id].success is False
        assert results_by_id[app_unlinked.id].error_code == "no_linked_student"


# ---------------------------------------------------------------------------
# Downstream behavior on Summer enrollments
# ---------------------------------------------------------------------------

class TestDownstreamSummerHandling:
    def _publish_one(self, db_session, admin, app, slot):
        from routers.summer_course import publish_application
        lessons = _materialize_lessons(db_session, slot)
        _place_all(db_session, app, slot, lessons)
        publish_application(app_id=app.id, admin=admin, db=db_session)
        return db_session.query(Enrollment).filter(
            Enrollment.summer_application_id == app.id
        ).first()

    def test_effective_end_date_uses_course_end_date(
        self, db_session, admin, app_full, slot, config
    ):
        from routers.enrollments import calculate_effective_end_date
        enrollment = self._publish_one(db_session, admin, app_full, slot)
        assert calculate_effective_end_date(enrollment, db_session) == config.course_end_date

    def test_schedule_change_blocked(
        self, db_session, admin, app_full, slot
    ):
        from routers.enrollments import preview_schedule_change
        from schemas import ScheduleChangeRequest
        enrollment = self._publish_one(db_session, admin, app_full, slot)

        req = ScheduleChangeRequest(
            assigned_day="Wednesday",
            assigned_time="15:00 - 16:30",
            location="MSA",
            tutor_id=slot.tutor_id,
        )
        # The endpoint is async; call its sync internals via the function reference.
        # preview_schedule_change is async, so use httpx via the test client instead.
        # Easier: call the cancel endpoint using the same auth dep override pattern
        # via TestClient when needed. Here we just verify the early raise by
        # invoking the function with asyncio.
        import asyncio
        with pytest.raises(HTTPException) as exc:
            asyncio.get_event_loop().run_until_complete(
                preview_schedule_change(
                    enrollment_id=enrollment.id,
                    new_schedule=req,
                    db=db_session,
                    current_user=admin,
                )
            )
        assert exc.value.status_code == 400
        assert "Summer enrollments" in exc.value.detail

    def test_cancel_blocked(self, db_session, admin, app_full, slot):
        from routers.enrollments import cancel_enrollment
        enrollment = self._publish_one(db_session, admin, app_full, slot)

        import asyncio
        with pytest.raises(HTTPException) as exc:
            asyncio.get_event_loop().run_until_complete(
                cancel_enrollment(
                    enrollment_id=enrollment.id,
                    db=db_session,
                    current_user=admin,
                )
            )
        assert exc.value.status_code == 400
        assert "Unpublish" in exc.value.detail

    def test_fee_message_blocked(self, db_session, admin, app_full, slot):
        from routers.enrollments import get_fee_message
        enrollment = self._publish_one(db_session, admin, app_full, slot)

        import asyncio
        with pytest.raises(HTTPException) as exc:
            asyncio.get_event_loop().run_until_complete(
                get_fee_message(
                    enrollment_id=enrollment.id,
                    lang="zh",
                    lessons_paid=6,
                    is_new_student=None,
                    current_user=admin,
                    db=db_session,
                )
            )
        assert exc.value.status_code == 400

    def test_overdue_includes_summer_pending_payment(
        self, db_session, admin, app_full, slot
    ):
        """A Summer enrollment in Pending Payment with first_lesson_date in
        the past should appear in the overdue list."""
        from routers.enrollments import get_overdue_enrollments
        # Set application to Fee Sent so publish creates Pending Payment.
        app_full.application_status = "Fee Sent"
        db_session.commit()
        enrollment = self._publish_one(db_session, admin, app_full, slot)
        assert enrollment.payment_status == "Pending Payment"

        # Fast-forward: bump first_lesson_date into the past.
        from datetime import timedelta
        enrollment.first_lesson_date = date.today() - timedelta(days=3)
        db_session.commit()

        import asyncio
        result = asyncio.get_event_loop().run_until_complete(
            get_overdue_enrollments(location=None, tutor_id=None, db=db_session)
        )
        assert any(o.id == enrollment.id for o in result)

    def test_renewals_excludes_summer(
        self, db_session, admin, app_full, slot
    ):
        from routers.enrollments import get_enrollments_needing_renewal
        enrollment = self._publish_one(db_session, admin, app_full, slot)

        import asyncio
        result = asyncio.get_event_loop().run_until_complete(
            get_enrollments_needing_renewal(
                location=None, tutor_id=None, include_expired=True,
                current_user=admin, db=db_session,
            )
        )
        assert all(r.id != enrollment.id for r in result)


# ---------------------------------------------------------------------------
# Summer linkage migration through reschedule → schedule-makeup → cancel-makeup
# ---------------------------------------------------------------------------

class TestSummerRescheduleLinkage:
    """
    When a published summer session is rescheduled and a make-up scheduled,
    the SummerSession pointer (summer_session_id) and lesson_number must
    follow the active session — otherwise arrangement views render from the
    stale original instead of the live make-up date.
    """

    def _publish(self, db_session, admin, app_full, slot):
        from routers.summer_course import publish_application
        lessons = _materialize_lessons(db_session, slot)
        _place_all(db_session, app_full, slot, lessons)
        publish_application(app_id=app_full.id, admin=admin, db=db_session)
        return lessons

    def _active_summer_session(self, db_session, lesson_number):
        return db_session.query(SessionLog).filter(
            SessionLog.lesson_number == lesson_number,
            SessionLog.summer_session_id.isnot(None),
        ).first()

    def _reschedule_and_makeup(self, db_session, admin, session, makeup_date, slot_tutor):
        """Drive the full reschedule → schedule-makeup flow and return the makeup row."""
        from routers.sessions import mark_session_rescheduled, schedule_makeup
        from schemas import ScheduleMakeupRequest
        import asyncio

        # Super Admin bypasses the 60-day rule, keeping the test free of that concern.
        admin.role = "Super Admin"
        slot_tutor.default_location = "MSA"
        db_session.commit()

        loop = asyncio.get_event_loop()
        loop.run_until_complete(
            mark_session_rescheduled(session_id=session.id, current_user=admin, db=db_session)
        )

        req = ScheduleMakeupRequest(
            session_date=makeup_date,
            time_slot="10:00 - 11:30",
            location="MSA",
            tutor_id=slot_tutor.id,
        )
        loop.run_until_complete(
            schedule_makeup(
                session_id=session.id, request=req,
                current_user=admin, db=db_session,
            )
        )

        db_session.refresh(session)
        return db_session.query(SessionLog).filter(
            SessionLog.make_up_for_id == session.id
        ).first()

    def test_linkage_migrates_to_makeup(
        self, db_session, admin, app_full, slot, slot_tutor
    ):
        self._publish(db_session, admin, app_full, slot)
        session = self._active_summer_session(db_session, lesson_number=3)
        original_summer_id = session.summer_session_id
        original_lesson_number = session.lesson_number
        assert original_summer_id is not None
        assert original_lesson_number == 3

        # Pick a Wednesday (summer lessons are Tuesdays) so there's no slot conflict.
        makeup_date = session.session_date + timedelta(days=1)
        makeup = self._reschedule_and_makeup(
            db_session, admin, session, makeup_date, slot_tutor,
        )

        assert makeup is not None
        assert makeup.summer_session_id == original_summer_id
        assert makeup.lesson_number == original_lesson_number
        assert session.summer_session_id is None
        assert session.lesson_number is None

    def test_linkage_restores_on_cancel_makeup(
        self, db_session, admin, app_full, slot, slot_tutor
    ):
        from routers.sessions import cancel_makeup
        import asyncio

        self._publish(db_session, admin, app_full, slot)
        session = self._active_summer_session(db_session, lesson_number=5)
        original_summer_id = session.summer_session_id
        original_lesson_number = session.lesson_number

        makeup_date = session.session_date + timedelta(days=1)
        makeup = self._reschedule_and_makeup(
            db_session, admin, session, makeup_date, slot_tutor,
        )

        asyncio.get_event_loop().run_until_complete(
            cancel_makeup(
                makeup_session_id=makeup.id,
                current_user=admin, db=db_session,
            )
        )

        db_session.refresh(session)
        assert session.summer_session_id == original_summer_id
        assert session.lesson_number == original_lesson_number
        assert db_session.query(SessionLog).filter(SessionLog.id == makeup.id).first() is None

    def test_linkage_follows_chained_makeup(
        self, db_session, admin, app_full, slot, slot_tutor
    ):
        """Makeup of a makeup: linkage should hop to the second makeup."""
        self._publish(db_session, admin, app_full, slot)
        session = self._active_summer_session(db_session, lesson_number=1)
        original_summer_id = session.summer_session_id
        original_lesson_number = session.lesson_number

        makeup_date_1 = session.session_date + timedelta(days=1)
        makeup1 = self._reschedule_and_makeup(
            db_session, admin, session, makeup_date_1, slot_tutor,
        )
        assert makeup1.summer_session_id == original_summer_id

        makeup_date_2 = session.session_date + timedelta(days=2)
        makeup2 = self._reschedule_and_makeup(
            db_session, admin, makeup1, makeup_date_2, slot_tutor,
        )

        db_session.refresh(makeup1)
        assert makeup2 is not None
        assert makeup2.summer_session_id == original_summer_id
        assert makeup2.lesson_number == original_lesson_number
        assert makeup1.summer_session_id is None
        assert makeup1.lesson_number is None


# ---------------------------------------------------------------------------
# Arrangement views (students table + calendar) read session_log for published
# ---------------------------------------------------------------------------

class TestArrangementReadsSessionLog:
    """
    After publish + reschedule, the arrangement endpoints must read from
    session_log, not the frozen SummerSession/SummerLesson snapshot.
    Otherwise capacity counts mislead and admins double-book slots.
    """

    def _publish(self, db_session, admin, app_full, slot):
        from routers.summer_course import publish_application
        lessons = _materialize_lessons(db_session, slot)
        _place_all(db_session, app_full, slot, lessons)
        publish_application(app_id=app_full.id, admin=admin, db=db_session)
        return lessons

    def _reschedule_active(self, db_session, admin, session, makeup_date, tutor, time_slot, location):
        from routers.sessions import mark_session_rescheduled, schedule_makeup
        from schemas import ScheduleMakeupRequest
        import asyncio

        admin.role = "Super Admin"
        tutor.default_location = location
        db_session.commit()

        loop = asyncio.get_event_loop()
        loop.run_until_complete(
            mark_session_rescheduled(session_id=session.id, current_user=admin, db=db_session)
        )
        req = ScheduleMakeupRequest(
            session_date=makeup_date,
            time_slot=time_slot,
            location=location,
            tutor_id=tutor.id,
        )
        loop.run_until_complete(
            schedule_makeup(
                session_id=session.id, request=req,
                current_user=admin, db=db_session,
            )
        )
        return db_session.query(SessionLog).filter(
            SessionLog.make_up_for_id == session.id
        ).first()

    def test_students_endpoint_reflects_live_date_and_status(
        self, db_session, admin, app_full, slot, slot_tutor
    ):
        from routers.summer_course import get_student_lessons

        self._publish(db_session, admin, app_full, slot)

        # Pre-reschedule: lesson 3's entry shows the frozen SummerLesson date.
        # (location filter maps to SummerApplication.preferred_location, which
        # the fixture leaves unset — don't pass it here.)
        resp_before = get_student_lessons(
            config_id=slot.config_id, location=None,
            _admin=None, db=db_session,
        )
        row = next(r for r in resp_before.students if r.application_id == app_full.id)
        entry3_before = next(e for e in row.lessons if e.lesson_number == 3)
        original_date = entry3_before.lesson_date

        # Reschedule lesson 3 to an ad-hoc Wednesday (off-grid for calendar,
        # but students table should still report the live date).
        session = db_session.query(SessionLog).filter(
            SessionLog.lesson_number == 3,
            SessionLog.summer_session_id.isnot(None),
        ).first()
        new_date = session.session_date + timedelta(days=1)
        self._reschedule_active(
            db_session, admin, session, new_date,
            slot_tutor, "10:00 - 11:30", "MSA",
        )

        resp_after = get_student_lessons(
            config_id=slot.config_id, location=None,
            _admin=None, db=db_session,
        )
        row_after = next(r for r in resp_after.students if r.application_id == app_full.id)
        entry3_after = next(e for e in row_after.lessons if e.lesson_number == 3)

        assert entry3_after.lesson_date == new_date
        assert entry3_after.lesson_date != original_date
        # summer_session_id now rides the makeup row, so live.session_status
        # comes from the new "Make-up Class" row.
        assert entry3_after.session_status == "Make-up Class"

    def test_calendar_regroups_on_grid_reschedule(
        self, db_session, admin, app_full, slot, slot_b, other_tutor
    ):
        """Moving a session from slot A to a materialised lesson on slot B
        should make the card shift from origin card to destination card."""
        from routers.summer_course import get_lesson_calendar

        lessons_a = self._publish(db_session, admin, app_full, slot)
        # Materialise slot B's lessons so the makeup has a target cell on the grid.
        lessons_b = _materialize_lessons(db_session, slot_b)

        session1 = db_session.query(SessionLog).filter(
            SessionLog.lesson_number == 1,
            SessionLog.summer_session_id.isnot(None),
        ).first()
        target = lessons_b[0]

        self._reschedule_active(
            db_session, admin, session1, target.lesson_date,
            other_tutor, slot_b.time_slot, slot_b.location,
        )

        # Destination: week containing slot B's target lesson — active card lives here.
        dest_week_start = target.lesson_date - timedelta(days=target.lesson_date.weekday())
        dest_resp = get_lesson_calendar(
            config_id=slot.config_id, location=slot.location,
            week_start=dest_week_start, _admin=None, db=db_session,
        )
        dest_entry = next(l for l in dest_resp.lessons if l.lesson_id == target.id)
        assert len(dest_entry.sessions) == 1
        assert dest_entry.sessions[0].application_id == app_full.id
        assert dest_entry.sessions[0].session_status == "Make-up Class"

        # Origin: ghost card (Rescheduled - Make-up Booked) still renders on the
        # seat the student was moved away from, so admins see the history without
        # it counting toward capacity.
        origin_week_start = lessons_a[0].lesson_date - timedelta(days=lessons_a[0].lesson_date.weekday())
        origin_resp = get_lesson_calendar(
            config_id=slot.config_id, location=slot.location,
            week_start=origin_week_start, _admin=None, db=db_session,
        )
        origin_entry = next(l for l in origin_resp.lessons if l.lesson_id == lessons_a[0].id)
        assert len(origin_entry.sessions) == 1
        assert origin_entry.sessions[0].application_id == app_full.id
        assert origin_entry.sessions[0].session_status == "Rescheduled - Make-up Booked"

    def test_calendar_renders_adhoc_card_for_off_grid_makeup(
        self, db_session, admin, app_full, slot, slot_tutor
    ):
        """Makeup on an ad-hoc date (no matching SummerLesson cell) emits a
        synthetic `is_adhoc` card at its live (date, time, tutor) tuple, while
        the origin ghost still renders on the seat the student was moved from."""
        from routers.summer_course import get_lesson_calendar

        lessons = self._publish(db_session, admin, app_full, slot)
        session = db_session.query(SessionLog).filter(
            SessionLog.lesson_number == 4,
            SessionLog.summer_session_id.isnot(None),
        ).first()
        origin_date = session.session_date

        # Reschedule to a Wednesday (the slot is Tuesday-only) → no materialized
        # SummerLesson at that (slot, date) coordinate.
        ad_hoc_date = origin_date + timedelta(days=1)
        self._reschedule_active(
            db_session, admin, session, ad_hoc_date,
            slot_tutor, "10:00 - 11:30", "MSA",
        )

        week_start = origin_date - timedelta(days=origin_date.weekday())
        resp = get_lesson_calendar(
            config_id=slot.config_id, location=slot.location,
            week_start=week_start, _admin=None, db=db_session,
        )

        # Lesson 4's card still holds the ghost of the moved-away student.
        origin_entry = next(l for l in resp.lessons if l.lesson_id == lessons[3].id)
        assert len(origin_entry.sessions) == 1
        assert origin_entry.sessions[0].session_status == "Rescheduled - Make-up Booked"

        # A synthetic ad-hoc card now lives at the live (date, time, tutor).
        adhoc = [l for l in resp.lessons if l.is_adhoc]
        assert len(adhoc) == 1
        card = adhoc[0]
        assert card.date == ad_hoc_date
        assert card.time_slot == "10:00 - 11:30"
        assert card.tutor_id == slot_tutor.id
        assert card.lesson_status == "Make-up"
        assert card.lesson_id < 0  # synthetic marker
        assert card.slot_id == 0
        assert len(card.sessions) == 1
        assert card.sessions[0].application_id == app_full.id
        assert card.sessions[0].session_status == "Make-up Class"
        # Capacity bar is effectively meaningless; max_students mirrors count.
        assert card.max_students == len(card.sessions)

    def test_calendar_synthetic_entry_for_different_tutor(
        self, db_session, admin, app_full, slot, other_tutor
    ):
        """Ad-hoc makeup booked with a tutor who has no summer slot on this
        date/time renders as a synthetic card with that tutor's info."""
        from routers.summer_course import get_lesson_calendar

        lessons = self._publish(db_session, admin, app_full, slot)
        session = db_session.query(SessionLog).filter(
            SessionLog.lesson_number == 2,
            SessionLog.summer_session_id.isnot(None),
        ).first()
        origin_date = session.session_date

        # Wednesday is not a slot day for either tutor; other_tutor has no
        # SummerLesson at (10:00, MSA, other_tutor) → synthetic cell.
        ad_hoc_date = origin_date + timedelta(days=1)
        self._reschedule_active(
            db_session, admin, session, ad_hoc_date,
            other_tutor, "10:00 - 11:30", "MSA",
        )

        week_start = origin_date - timedelta(days=origin_date.weekday())
        resp = get_lesson_calendar(
            config_id=slot.config_id, location=slot.location,
            week_start=week_start, _admin=None, db=db_session,
        )

        adhoc = [l for l in resp.lessons if l.is_adhoc]
        assert len(adhoc) == 1
        card = adhoc[0]
        assert card.tutor_id == other_tutor.id
        assert card.tutor_name == other_tutor.tutor_name
        assert card.date == ad_hoc_date
        assert len(card.sessions) == 1
        assert card.sessions[0].application_id == app_full.id

    def test_calendar_no_synthetic_for_cross_branch_makeup(
        self, db_session, admin, app_full, slot, slot_tutor
    ):
        """Makeup at a different branch must not surface on the origin branch's
        calendar — only the origin ghost renders. The ad-hoc card belongs on
        the destination branch's view."""
        from routers.summer_course import get_lesson_calendar

        lessons = self._publish(db_session, admin, app_full, slot)
        session = db_session.query(SessionLog).filter(
            SessionLog.lesson_number == 3,
            SessionLog.summer_session_id.isnot(None),
        ).first()
        origin_date = session.session_date

        # Reschedule to a different branch code; still this week.
        ad_hoc_date = origin_date + timedelta(days=1)
        self._reschedule_active(
            db_session, admin, session, ad_hoc_date,
            slot_tutor, "10:00 - 11:30", "HSK",
        )

        week_start = origin_date - timedelta(days=origin_date.weekday())
        resp = get_lesson_calendar(
            config_id=slot.config_id, location=slot.location,
            week_start=week_start, _admin=None, db=db_session,
        )

        # Origin ghost renders on lesson 3's cell, as before.
        origin_entry = next(l for l in resp.lessons if l.lesson_id == lessons[2].id)
        assert len(origin_entry.sessions) == 1
        assert origin_entry.sessions[0].session_status == "Rescheduled - Make-up Booked"

        # No synthetic card on the MSA view — ad-hoc belongs to HSK's grid.
        assert not any(l.is_adhoc for l in resp.lessons)

    def test_calendar_unchanged_without_reschedule(
        self, db_session, admin, app_full, slot
    ):
        """Baseline: a published session that hasn't been rescheduled still
        renders on its original lesson card with the placement intact."""
        from routers.summer_course import get_lesson_calendar

        lessons = self._publish(db_session, admin, app_full, slot)

        week_start = lessons[0].lesson_date - timedelta(days=lessons[0].lesson_date.weekday())
        resp = get_lesson_calendar(
            config_id=slot.config_id, location=slot.location,
            week_start=week_start, _admin=None, db=db_session,
        )

        lesson1_entry = next(l for l in resp.lessons if l.lesson_id == lessons[0].id)
        assert len(lesson1_entry.sessions) == 1
        assert lesson1_entry.sessions[0].application_id == app_full.id

    def test_sick_leave_pending_counts_as_non_attending(
        self, db_session, admin, app_full, slot
    ):
        """Sick Leave - Pending Make-up should free capacity on the students
        endpoint the same way Rescheduled - Pending Make-up does."""
        from routers.sessions import mark_session_sick_leave
        from routers.summer_course import get_student_lessons
        import asyncio

        self._publish(db_session, admin, app_full, slot)
        session = db_session.query(SessionLog).filter(
            SessionLog.lesson_number == 2,
            SessionLog.summer_session_id.isnot(None),
        ).first()

        asyncio.get_event_loop().run_until_complete(
            mark_session_sick_leave(session_id=session.id, current_user=admin, db=db_session)
        )

        resp = get_student_lessons(
            config_id=slot.config_id, location=None,
            _admin=None, db=db_session,
        )
        row = next(r for r in resp.students if r.application_id == app_full.id)
        # Sick leave is non-attending → counted in rescheduled_count.
        assert row.rescheduled_count >= 1
        entry2 = next(e for e in row.lessons if e.lesson_number == 2)
        assert entry2.session_status == "Sick Leave - Pending Make-up"

    def test_calendar_ghost_for_chained_makeup(
        self, db_session, admin, app_full, slot, slot_tutor
    ):
        """Chained make-ups render a ghost on each ancestor cell, so the seat
        the student was moved through shows as resolved, not occupied."""
        from routers.summer_course import get_lesson_calendar

        lessons = self._publish(db_session, admin, app_full, slot)
        session = db_session.query(SessionLog).filter(
            SessionLog.lesson_number == 5,
            SessionLog.summer_session_id.isnot(None),
        ).first()
        origin_date = session.session_date

        # First reschedule: origin → makeup1 (ad-hoc Wed, off-grid).
        ad_hoc_1 = origin_date + timedelta(days=1)
        makeup1 = self._reschedule_active(
            db_session, admin, session, ad_hoc_1,
            slot_tutor, "10:00 - 11:30", "MSA",
        )
        # Second reschedule: makeup1 → makeup2 (another ad-hoc Thu, off-grid too).
        ad_hoc_2 = origin_date + timedelta(days=2)
        self._reschedule_active(
            db_session, admin, makeup1, ad_hoc_2,
            slot_tutor, "10:00 - 11:30", "MSA",
        )

        week_start = origin_date - timedelta(days=origin_date.weekday())
        resp = get_lesson_calendar(
            config_id=slot.config_id, location=slot.location,
            week_start=week_start, _admin=None, db=db_session,
        )
        origin_entry = next(l for l in resp.lessons if l.lesson_id == lessons[4].id)
        # The root origin is on-grid and renders as a ghost. makeup1 is off-grid
        # (ad-hoc Wednesday) so its ghost wouldn't appear anywhere on this week.
        assert len(origin_entry.sessions) == 1
        assert origin_entry.sessions[0].session_status == "Rescheduled - Make-up Booked"

    def test_calendar_normalizes_chinese_location_in_matching(
        self, db_session, admin, app_full, slot, config
    ):
        """Regression: slots configured with Chinese display names (e.g.
        "華士古分校") are stored normalised ("MSA") on session_log at publish.
        The calendar must normalise both sides or every published session
        falls off the grid."""
        from routers.summer_course import get_lesson_calendar

        # Flip this slot (and its config's locations metadata) to the Chinese
        # display name used in real configs.
        slot.location = "華士古分校"
        config.locations = [{"name": "華士古分校", "open_days": ["Tuesday"]}]
        db_session.commit()

        lessons = self._publish(db_session, admin, app_full, slot)

        week_start = lessons[0].lesson_date - timedelta(days=lessons[0].lesson_date.weekday())
        resp = get_lesson_calendar(
            config_id=slot.config_id, location="華士古分校",
            week_start=week_start, _admin=None, db=db_session,
        )

        lesson1_entry = next(l for l in resp.lessons if l.lesson_id == lessons[0].id)
        assert len(lesson1_entry.sessions) == 1
        assert lesson1_entry.sessions[0].application_id == app_full.id
