"""
Tests for the summer buddy group capacity cap.

Public apply/change endpoints enforce a 3-member cap; admin PATCH enforces
the same cap by default and only bypasses it when the caller sets
`allow_buddy_overflow=True` (explicit opt-in for manual overflow pairing).
Every buddy_code change writes a SummerApplicationEdit audit row.
"""
import pytest
from datetime import date, datetime, timedelta
from unittest.mock import MagicMock
from fastapi import HTTPException

from models import (
    Tutor, SummerCourseConfig, SummerBuddyGroup, SummerApplication,
    SummerApplicationEdit,
)
from utils.rate_limiter import clear_rate_limits


@pytest.fixture(autouse=True)
def _clean_rate_limits():
    clear_rate_limits()
    yield
    clear_rate_limits()


def _mock_request(ip="10.0.0.1"):
    req = MagicMock()
    req.headers = {"X-Forwarded-For": ip}
    return req


@pytest.fixture
def admin_tutor(db_session):
    tutor = Tutor(
        user_email="admin@test.com",
        tutor_name="Admin",
        role="Admin",
        is_active_tutor=True,
    )
    db_session.add(tutor)
    db_session.commit()
    return tutor


@pytest.fixture
def active_config(db_session):
    """Active config with a window that includes 'now'."""
    config = SummerCourseConfig(
        year=datetime.now().year,
        title="Summer Cap Test",
        application_open_date=datetime.now() - timedelta(days=1),
        application_close_date=datetime.now() + timedelta(days=30),
        course_start_date=date.today() + timedelta(days=60),
        course_end_date=date.today() + timedelta(days=120),
        total_lessons=8,
        pricing_config={"base_fee": 400},
        locations=[{"name": "MSA"}],
        available_grades=[{"value": "F1"}],
        time_slots=["10:00 - 11:30"],
        is_active=True,
    )
    db_session.add(config)
    db_session.commit()
    return config


@pytest.fixture
def full_group(db_session, active_config):
    """A buddy group already at the 3-member public cap."""
    group = SummerBuddyGroup(config_id=active_config.id, buddy_code="BG-FULL")
    db_session.add(group)
    db_session.flush()

    for i in range(3):
        app = SummerApplication(
            config_id=active_config.id,
            reference_code=f"SC{active_config.year}-FULL{i}",
            student_name=f"Member {i}",
            grade="F1",
            contact_phone=f"8000000{i}",
            application_status="Submitted",
            buddy_group_id=group.id,
            sessions_per_week=1,
        )
        db_session.add(app)
    db_session.commit()
    return group


@pytest.fixture
def half_full_group(db_session, active_config):
    """A buddy group with 1 member (room for 2 more)."""
    group = SummerBuddyGroup(config_id=active_config.id, buddy_code="BG-HALF")
    db_session.add(group)
    db_session.flush()
    app = SummerApplication(
        config_id=active_config.id,
        reference_code=f"SC{active_config.year}-HALF0",
        student_name="Lone Member",
        grade="F1",
        contact_phone="80099900",
        application_status="Submitted",
        buddy_group_id=group.id,
        sessions_per_week=1,
    )
    db_session.add(app)
    db_session.commit()
    return group


@pytest.fixture
def solo_applicant(db_session, active_config):
    """An application not yet in any buddy group."""
    app = SummerApplication(
        config_id=active_config.id,
        reference_code=f"SC{active_config.year}-SOLO1",
        student_name="Solo",
        grade="F1",
        contact_phone="90000001",
        application_status="Submitted",
        sessions_per_week=1,
    )
    db_session.add(app)
    db_session.commit()
    return app


class TestPublicSubmitCap:
    """Cap enforcement on POST /summer/public/apply."""

    def test_submit_rejected_when_group_full(self, db_session, active_config, full_group):
        from routers.summer_course import submit_application
        from schemas import SummerApplicationCreate

        data = SummerApplicationCreate(
            student_name="Overflow Kid",
            grade="F1",
            contact_phone="90909090",
            buddy_code=full_group.buddy_code,
        )
        with pytest.raises(HTTPException) as exc:
            submit_application(request=_mock_request(), data=data, db=db_session)
        assert exc.value.status_code == 400
        assert "full" in exc.value.detail.lower()

    def test_submit_allowed_when_group_has_room(self, db_session, active_config, half_full_group):
        from routers.summer_course import submit_application
        from schemas import SummerApplicationCreate

        data = SummerApplicationCreate(
            student_name="New Friend",
            grade="F1",
            contact_phone="91111111",
            buddy_code=half_full_group.buddy_code,
        )
        result = submit_application(request=_mock_request(), data=data, db=db_session)
        assert result.buddy_code == half_full_group.buddy_code


class TestPublicChangeCap:
    """Cap enforcement on PATCH /summer/public/application/{ref}/buddy."""

    def test_join_rejected_when_group_full(self, db_session, active_config, full_group, solo_applicant):
        from routers.summer_course import change_buddy_group
        from schemas import SummerBuddyChangeRequest

        data = SummerBuddyChangeRequest(
            action="join",
            buddy_code=full_group.buddy_code,
            buddy_referrer_name="Friend",
        )
        with pytest.raises(HTTPException) as exc:
            change_buddy_group(
                request=_mock_request(ip="10.0.0.2"),
                reference_code=solo_applicant.reference_code,
                data=data,
                phone=solo_applicant.contact_phone,
                db=db_session,
            )
        assert exc.value.status_code == 400
        assert "full" in exc.value.detail.lower()

    def test_rejoin_same_group_is_noop(self, db_session, active_config, full_group):
        """A member re-joining their own full group should not hit the cap."""
        from routers.summer_course import change_buddy_group
        from schemas import SummerBuddyChangeRequest

        existing = (
            db_session.query(SummerApplication)
            .filter(SummerApplication.buddy_group_id == full_group.id)
            .first()
        )
        data = SummerBuddyChangeRequest(
            action="join",
            buddy_code=full_group.buddy_code,
            buddy_referrer_name="Myself",
        )
        result = change_buddy_group(
            request=_mock_request(ip="10.0.0.3"),
            reference_code=existing.reference_code,
            data=data,
            phone=existing.contact_phone,
            db=db_session,
        )
        assert result.buddy_code == full_group.buddy_code

    def test_join_allowed_when_half_full(self, db_session, active_config, half_full_group, solo_applicant):
        from routers.summer_course import change_buddy_group
        from schemas import SummerBuddyChangeRequest

        data = SummerBuddyChangeRequest(
            action="join",
            buddy_code=half_full_group.buddy_code,
            buddy_referrer_name="Friend",
        )
        result = change_buddy_group(
            request=_mock_request(ip="10.0.0.4"),
            reference_code=solo_applicant.reference_code,
            data=data,
            phone=solo_applicant.contact_phone,
            db=db_session,
        )
        assert result.buddy_code == half_full_group.buddy_code
        assert result.member_count == 2


class TestGetBuddyGroupIsFull:
    """GET /summer/public/buddy-group/{code} should expose is_full."""

    def test_is_full_true_at_cap(self, db_session, active_config, full_group):
        from routers.summer_course import get_buddy_group

        result = get_buddy_group(
            request=_mock_request(ip="10.0.0.5"),
            code=full_group.buddy_code,
            db=db_session,
        )
        assert result.is_full is True
        assert result.member_count == 3
        assert result.max_members == 3

    def test_is_full_false_below_cap(self, db_session, active_config, half_full_group):
        from routers.summer_course import get_buddy_group

        result = get_buddy_group(
            request=_mock_request(ip="10.0.0.6"),
            code=half_full_group.buddy_code,
            db=db_session,
        )
        assert result.is_full is False
        assert result.member_count == 1


class TestAdminCapEnforcement:
    """Admin PATCH enforces the public cap by default; override is opt-in."""

    def test_admin_blocked_without_override(self, db_session, active_config, full_group, solo_applicant, admin_tutor):
        from routers.summer_course import update_application
        from schemas import SummerApplicationUpdate

        data = SummerApplicationUpdate(buddy_code=full_group.buddy_code)
        with pytest.raises(HTTPException) as exc:
            update_application(
                app_id=solo_applicant.id,
                data=data,
                admin=admin_tutor,
                db=db_session,
            )
        assert exc.value.status_code == 400
        assert isinstance(exc.value.detail, dict)
        assert exc.value.detail["error_code"] == "buddy_cap_exceeded"
        assert exc.value.detail["cap"] == 3
        assert exc.value.detail["current"] == 3
        # App must remain unchanged
        db_session.refresh(solo_applicant)
        assert solo_applicant.buddy_group_id is None

    def test_admin_override_adds_fourth_member(self, db_session, active_config, full_group, solo_applicant, admin_tutor):
        from routers.summer_course import update_application
        from schemas import SummerApplicationUpdate

        data = SummerApplicationUpdate(
            buddy_code=full_group.buddy_code,
            allow_buddy_overflow=True,
        )
        result = update_application(
            app_id=solo_applicant.id,
            data=data,
            admin=admin_tutor,
            db=db_session,
        )
        assert result.buddy_code == full_group.buddy_code
        total = (
            db_session.query(SummerApplication)
            .filter(SummerApplication.buddy_group_id == full_group.id)
            .count()
        )
        assert total == 4


def _buddy_audits(db_session, app_id):
    return (
        db_session.query(SummerApplicationEdit)
        .filter(
            SummerApplicationEdit.application_id == app_id,
            SummerApplicationEdit.field_name == "buddy_code",
        )
        .all()
    )


class TestBuddyAudit:
    """Every buddy_code change writes a SummerApplicationEdit row."""

    def test_admin_join_writes_audit(self, db_session, active_config, half_full_group, solo_applicant, admin_tutor):
        from routers.summer_course import update_application
        from schemas import SummerApplicationUpdate

        update_application(
            app_id=solo_applicant.id,
            data=SummerApplicationUpdate(buddy_code=half_full_group.buddy_code),
            admin=admin_tutor,
            db=db_session,
        )
        rows = _buddy_audits(db_session, solo_applicant.id)
        assert len(rows) == 1
        assert rows[0].old_value is None
        assert rows[0].new_value == half_full_group.buddy_code
        assert rows[0].edited_via == "admin"
        assert rows[0].edited_by == admin_tutor.tutor_name

    def test_admin_override_audit_records_the_full_group_join(
        self, db_session, active_config, full_group, solo_applicant, admin_tutor
    ):
        from routers.summer_course import update_application
        from schemas import SummerApplicationUpdate

        update_application(
            app_id=solo_applicant.id,
            data=SummerApplicationUpdate(
                buddy_code=full_group.buddy_code,
                allow_buddy_overflow=True,
            ),
            admin=admin_tutor,
            db=db_session,
        )
        rows = _buddy_audits(db_session, solo_applicant.id)
        assert len(rows) == 1
        assert rows[0].new_value == full_group.buddy_code
        assert rows[0].edited_by == admin_tutor.tutor_name

    def test_public_join_writes_audit(self, db_session, active_config, half_full_group, solo_applicant):
        from routers.summer_course import change_buddy_group
        from schemas import SummerBuddyChangeRequest

        change_buddy_group(
            request=_mock_request(ip="10.0.0.7"),
            reference_code=solo_applicant.reference_code,
            data=SummerBuddyChangeRequest(
                action="join",
                buddy_code=half_full_group.buddy_code,
                buddy_referrer_name="Friend",
            ),
            phone=solo_applicant.contact_phone,
            db=db_session,
        )
        rows = _buddy_audits(db_session, solo_applicant.id)
        assert len(rows) == 1
        assert rows[0].new_value == half_full_group.buddy_code
        assert rows[0].edited_via == "applicant"
        assert rows[0].edited_by is None

    def test_public_leave_writes_audit(self, db_session, active_config, half_full_group):
        from routers.summer_course import change_buddy_group
        from schemas import SummerBuddyChangeRequest

        existing = (
            db_session.query(SummerApplication)
            .filter(SummerApplication.buddy_group_id == half_full_group.id)
            .first()
        )
        prev_code = half_full_group.buddy_code
        change_buddy_group(
            request=_mock_request(ip="10.0.0.8"),
            reference_code=existing.reference_code,
            data=SummerBuddyChangeRequest(action="leave"),
            phone=existing.contact_phone,
            db=db_session,
        )
        rows = _buddy_audits(db_session, existing.id)
        assert len(rows) == 1
        assert rows[0].old_value == prev_code
        assert rows[0].new_value is None
        assert rows[0].edited_via == "applicant"

    def test_public_create_writes_audit(self, db_session, active_config, solo_applicant):
        from routers.summer_course import change_buddy_group
        from schemas import SummerBuddyChangeRequest

        result = change_buddy_group(
            request=_mock_request(ip="10.0.0.9"),
            reference_code=solo_applicant.reference_code,
            data=SummerBuddyChangeRequest(action="create"),
            phone=solo_applicant.contact_phone,
            db=db_session,
        )
        rows = _buddy_audits(db_session, solo_applicant.id)
        assert len(rows) == 1
        assert rows[0].old_value is None
        assert rows[0].new_value == result.buddy_code
        assert rows[0].edited_via == "applicant"
