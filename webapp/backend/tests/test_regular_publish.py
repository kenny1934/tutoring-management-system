"""
Tests for the regular application publish bridge.

Covers: hard blocks (no linked student, already published, status threshold,
invalid tutor, day validation, datetime collision), first-lesson-date
auto-compute + explicit override guards, holiday extension, is_new_student
auto-detect, payment status mapping, unpublish (revert + attended block), and
batch savepoint isolation.
"""
import pytest
from datetime import date, datetime, timedelta
from fastapi import HTTPException

from models import (
    Tutor,
    Student,
    Holiday,
    RegularCourseConfig,
    RegularApplication,
    RegularApplicationEdit,
    Enrollment,
    SessionLog,
)
from schemas import RegularPublishRequest, RegularPublishItem, RegularPublishBatchRequest


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
def tutor(db_session):
    t = Tutor(
        user_email="tutor@test.com",
        tutor_name="Teaching Tutor",
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
    # 2026-09-01 is a Tuesday — the same-day auto-compute case below relies on it.
    cfg = RegularCourseConfig(
        year=2026,
        title="Regular Sep 2026",
        application_open_date=datetime(2026, 8, 3),
        application_close_date=datetime(2026, 9, 30),
        course_start_date=date(2026, 9, 1),
        locations=[{"name": "華士古分校", "open_days": ["Tuesday", "Saturday"]}],
        available_grades=[{"value": "F1"}],
        time_slots=["16:45 - 18:15"],
        is_active=True,
    )
    db_session.add(cfg)
    db_session.commit()
    return cfg


@pytest.fixture
def app_linked(db_session, config, student):
    """Application linked to a real student, status=Fee Sent."""
    a = RegularApplication(
        config_id=config.id,
        reference_code="RC2026-P0001",
        student_name="Linked Student",
        grade="F1",
        contact_phone="11111111",
        preferred_location="華士古分校",
        preference_1_day="Tuesday",
        preference_1_time="16:45 - 18:15",
        application_status="Fee Sent",
        existing_student_id=student.id,
    )
    db_session.add(a)
    db_session.commit()
    return a


@pytest.fixture
def app_unlinked(db_session, config):
    """Application with no linked student → blocks publish."""
    a = RegularApplication(
        config_id=config.id,
        reference_code="RC2026-P0002",
        student_name="No Link",
        grade="F1",
        contact_phone="22222222",
        application_status="Fee Sent",
    )
    db_session.add(a)
    db_session.commit()
    return a


def _req(tutor, **overrides):
    base = dict(
        confirmed_day="Tuesday",
        confirmed_time="16:45 - 18:15",
        location="華士古分校",
        tutor_id=tutor.id,
    )
    base.update(overrides)
    return RegularPublishRequest(**base)


def _publish(db_session, admin, app, req):
    from routers.regular_course import publish_application
    return publish_application(app_id=app.id, req=req, admin=admin, db=db_session)


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

class TestPublishHappyPath:
    def test_publish_creates_enrollment_and_sessions(self, db_session, admin, tutor, app_linked):
        result = _publish(db_session, admin, app_linked, _req(tutor))

        assert result.application_id == app_linked.id
        assert result.sessions_created == 6
        # Tuesday student starts on course_start_date itself (Sep 1 is a Tuesday).
        assert result.first_lesson_date == date(2026, 9, 1)

        enrollment = db_session.query(Enrollment).filter(
            Enrollment.regular_application_id == app_linked.id
        ).first()
        assert enrollment is not None
        assert enrollment.enrollment_type == "Regular"
        assert enrollment.tutor_id == tutor.id
        assert enrollment.assigned_day == "Tue"
        assert enrollment.assigned_time == "16:45 - 18:15"
        # Display name normalized to the branch code.
        assert enrollment.location == "MSA"
        assert enrollment.lessons_paid == 6  # default block size
        assert enrollment.first_lesson_date == date(2026, 9, 1)
        assert enrollment.payment_status == "Pending Payment"
        assert enrollment.payment_date is None
        # Publishing is gated on Fee Sent or later, so the message has gone out.
        assert enrollment.fee_message_sent is True
        # New student (no prior enrollment) → reg fee applies.
        assert enrollment.is_new_student is True
        # Revenue snapshot: 400 × 6 (reg fee excluded from tutor revenue).
        assert float(enrollment.revenue_total) == 2400.0

        sessions = db_session.query(SessionLog).filter(
            SessionLog.enrollment_id == enrollment.id
        ).order_by(SessionLog.session_date).all()
        assert len(sessions) == 6
        assert sessions[0].session_date == date(2026, 9, 1)
        assert sessions[-1].session_date == date(2026, 9, 1) + timedelta(weeks=5)
        for s in sessions:
            assert s.session_status == "Scheduled"
            assert s.financial_status == "Unpaid"
            assert s.tutor_id == tutor.id
            assert s.location == "MSA"
            assert s.time_slot == "16:45 - 18:15"

        # App status moved to Enrolled with audit.
        db_session.refresh(app_linked)
        assert app_linked.application_status == "Enrolled"
        audit = db_session.query(RegularApplicationEdit).filter(
            RegularApplicationEdit.application_id == app_linked.id,
            RegularApplicationEdit.field_name == "application_status",
        ).first()
        assert audit.old_value == "Fee Sent"
        assert audit.new_value == "Enrolled"

    def test_later_weekday_starts_first_occurrence(self, db_session, admin, tutor, app_linked):
        result = _publish(db_session, admin, app_linked, _req(tutor, confirmed_day="Saturday"))
        # First Saturday on/after Tue 2026-09-01 is 2026-09-05.
        assert result.first_lesson_date == date(2026, 9, 5)

    def test_short_day_form_accepted(self, db_session, admin, tutor, app_linked):
        result = _publish(db_session, admin, app_linked, _req(tutor, confirmed_day="Sat"))
        assert result.first_lesson_date == date(2026, 9, 5)

    def test_holiday_skipped_and_span_extended(self, db_session, admin, tutor, app_linked):
        db_session.add(Holiday(holiday_date=date(2026, 9, 8), holiday_name="Test Holiday"))
        db_session.commit()
        result = _publish(db_session, admin, app_linked, _req(tutor, lessons_paid=3))
        assert result.sessions_created == 3
        assert result.skipped_holidays == [{"date": "2026-09-08", "name": "Test Holiday"}]
        dates = [
            s.session_date
            for s in db_session.query(SessionLog).order_by(SessionLog.session_date).all()
        ]
        assert dates == [date(2026, 9, 1), date(2026, 9, 15), date(2026, 9, 22)]

    def test_existing_student_not_marked_new(self, db_session, admin, tutor, app_linked, student):
        prior = Enrollment(
            student_id=student.id,
            tutor_id=tutor.id,
            assigned_day="Mon",
            assigned_time="10:00 - 11:30",
            location="MSA",
            lessons_paid=6,
            first_lesson_date=date(2026, 1, 5),
            payment_status="Paid",
            enrollment_type="Regular",
        )
        db_session.add(prior)
        db_session.commit()
        _publish(db_session, admin, app_linked, _req(tutor))
        enrollment = db_session.query(Enrollment).filter(
            Enrollment.regular_application_id == app_linked.id
        ).first()
        assert enrollment.is_new_student is False

    def test_paid_publish_sets_payment_fields(self, db_session, admin, tutor, app_linked):
        _publish(db_session, admin, app_linked, _req(tutor, payment_status="Paid"))
        enrollment = db_session.query(Enrollment).filter(
            Enrollment.regular_application_id == app_linked.id
        ).first()
        assert enrollment.payment_status == "Paid"
        assert enrollment.payment_date is not None
        sessions = db_session.query(SessionLog).filter(
            SessionLog.enrollment_id == enrollment.id
        ).all()
        assert all(s.financial_status == "Paid" for s in sessions)

    def test_explicit_first_lesson_date(self, db_session, admin, tutor, app_linked):
        result = _publish(
            db_session, admin, app_linked,
            _req(tutor, first_lesson_date=date(2026, 9, 15)),
        )
        assert result.first_lesson_date == date(2026, 9, 15)


# ---------------------------------------------------------------------------
# Hard blocks
# ---------------------------------------------------------------------------

def _error_code(exc_info):
    detail = exc_info.value.detail
    return detail["error_code"] if isinstance(detail, dict) else None


class TestPublishBlocks:
    def test_no_linked_student(self, db_session, admin, tutor, app_unlinked):
        with pytest.raises(HTTPException) as exc:
            _publish(db_session, admin, app_unlinked, _req(tutor))
        assert _error_code(exc) == "no_linked_student"

    def test_already_published(self, db_session, admin, tutor, app_linked):
        _publish(db_session, admin, app_linked, _req(tutor))
        # Re-confirm the schedule so only the bridge check can block.
        app_linked.application_status = "Fee Sent"
        db_session.commit()
        with pytest.raises(HTTPException) as exc:
            _publish(db_session, admin, app_linked, _req(tutor))
        assert _error_code(exc) == "already_published"

    def test_status_too_early(self, db_session, admin, tutor, app_linked):
        app_linked.application_status = "Submitted"
        db_session.commit()
        with pytest.raises(HTTPException) as exc:
            _publish(db_session, admin, app_linked, _req(tutor))
        assert _error_code(exc) == "status_too_early"

    def test_invalid_tutor(self, db_session, admin, tutor, app_linked):
        with pytest.raises(HTTPException) as exc:
            _publish(db_session, admin, app_linked, _req(tutor, tutor_id=99999))
        assert _error_code(exc) == "invalid_tutor"

    def test_invalid_day(self, db_session, admin, tutor, app_linked):
        with pytest.raises(HTTPException) as exc:
            _publish(db_session, admin, app_linked, _req(tutor, confirmed_day="Someday"))
        assert _error_code(exc) == "invalid_day"

    def test_first_lesson_before_course_start(self, db_session, admin, tutor, app_linked):
        with pytest.raises(HTTPException) as exc:
            _publish(
                db_session, admin, app_linked,
                _req(tutor, first_lesson_date=date(2026, 8, 25)),
            )
        assert _error_code(exc) == "first_lesson_too_early"

    def test_first_lesson_day_mismatch(self, db_session, admin, tutor, app_linked):
        # 2026-09-02 is a Wednesday, not the confirmed Tuesday.
        with pytest.raises(HTTPException) as exc:
            _publish(
                db_session, admin, app_linked,
                _req(tutor, first_lesson_date=date(2026, 9, 2)),
            )
        assert _error_code(exc) == "first_lesson_day_mismatch"

    def test_datetime_collision(self, db_session, admin, tutor, app_linked, student):
        other = Enrollment(
            student_id=student.id,
            tutor_id=tutor.id,
            assigned_day="Tue",
            assigned_time="16:45 - 18:15",
            location="MSA",
            lessons_paid=1,
            first_lesson_date=date(2026, 9, 1),
            payment_status="Paid",
            enrollment_type="One-Time",
        )
        db_session.add(other)
        db_session.flush()
        db_session.add(SessionLog(
            enrollment_id=other.id,
            student_id=student.id,
            tutor_id=tutor.id,
            session_date=date(2026, 9, 1),
            time_slot="16:45 - 18:15",
            location="MSA",
            session_status="Scheduled",
        ))
        db_session.commit()
        with pytest.raises(HTTPException) as exc:
            _publish(db_session, admin, app_linked, _req(tutor))
        assert _error_code(exc) == "datetime_collision"
        assert len(exc.value.detail["conflicts"]) == 1


# ---------------------------------------------------------------------------
# Unpublish
# ---------------------------------------------------------------------------

class TestUnpublish:
    def test_unpublish_deletes_and_reverts_status(self, db_session, admin, tutor, app_linked):
        from routers.regular_course import unpublish_application
        _publish(db_session, admin, app_linked, _req(tutor))
        result = unpublish_application(app_id=app_linked.id, admin=admin, db=db_session)
        assert result.sessions_deleted == 6
        assert result.application_status == "Fee Sent"
        assert db_session.query(Enrollment).filter(
            Enrollment.regular_application_id == app_linked.id
        ).first() is None
        assert db_session.query(SessionLog).count() == 0

    def test_unpublish_not_published(self, db_session, admin, app_linked):
        from routers.regular_course import unpublish_application
        with pytest.raises(HTTPException) as exc:
            unpublish_application(app_id=app_linked.id, admin=admin, db=db_session)
        assert _error_code(exc) == "not_published"

    def test_unpublish_blocked_when_attended(self, db_session, admin, tutor, app_linked):
        from routers.regular_course import unpublish_application
        _publish(db_session, admin, app_linked, _req(tutor))
        first = db_session.query(SessionLog).order_by(SessionLog.session_date).first()
        first.session_status = "Attended"
        db_session.commit()
        with pytest.raises(HTTPException) as exc:
            unpublish_application(app_id=app_linked.id, admin=admin, db=db_session)
        assert _error_code(exc) == "sessions_attended"


# ---------------------------------------------------------------------------
# Batch publish
# ---------------------------------------------------------------------------

class TestBatchPublish:
    def test_batch_savepoint_isolation(self, db_session, admin, tutor, app_linked, app_unlinked):
        from routers.regular_course import publish_applications_batch
        request = RegularPublishBatchRequest(items=[
            RegularPublishItem(
                application_id=app_linked.id,
                confirmed_day="Tuesday",
                confirmed_time="16:45 - 18:15",
                location="華士古分校",
                tutor_id=tutor.id,
            ),
            RegularPublishItem(
                application_id=app_unlinked.id,
                confirmed_day="Saturday",
                confirmed_time="16:45 - 18:15",
                location="華士古分校",
                tutor_id=tutor.id,
            ),
        ])
        response = publish_applications_batch(request=request, admin=admin, db=db_session)
        assert response.published_count == 1
        assert response.failed_count == 1
        by_id = {r.application_id: r for r in response.results}
        assert by_id[app_linked.id].success is True
        assert by_id[app_unlinked.id].success is False
        assert by_id[app_unlinked.id].error_code == "no_linked_student"
        # The good app's enrollment survived the bad app's rollback.
        assert db_session.query(Enrollment).filter(
            Enrollment.regular_application_id == app_linked.id
        ).first() is not None
