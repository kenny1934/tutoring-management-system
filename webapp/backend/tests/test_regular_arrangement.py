"""
Tests for the regular arrangement layer: slots CRUD, application-to-slot
assignment (capacity + audit), capacity-strict suggestions, publish-from-slot
schedule resolution, and discount (coupon) application at publish.
"""
import pytest
from datetime import date, datetime
from fastapi import HTTPException

from models import (
    Tutor,
    Student,
    Discount,
    RegularCourseConfig,
    RegularApplication,
    RegularApplicationEdit,
    RegularCourseSlot,
    Enrollment,
)
from schemas import (
    RegularPublishRequest,
    RegularSlotCreate,
    RegularSlotUpdate,
    RegularSlotAssignRequest,
)
from routers.regular_course import (
    list_slots,
    create_slot,
    update_slot,
    delete_slot,
    assign_application_slot,
    suggest_slots,
    publish_application,
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
    cfg = RegularCourseConfig(
        year=2026,
        title="Regular Sep 2026",
        application_open_date=datetime(2026, 8, 3),
        application_close_date=datetime(2026, 9, 30),
        course_start_date=date(2026, 9, 1),  # a Tuesday
        locations=[{"name": "華士古分校", "open_days": ["Tuesday", "Saturday"]}],
        available_grades=[{"value": "F1"}, {"value": "F2"}],
        time_slots=["16:45 - 18:15", "10:00 - 11:30"],
        is_active=True,
    )
    db_session.add(cfg)
    db_session.commit()
    return cfg


def _make_slot(db_session, config, *, day="Tuesday", time="16:45 - 18:15",
               location="華士古分校", grade=None, tutor_id=None, max_students=6):
    slot = RegularCourseSlot(
        config_id=config.id,
        slot_day=day,
        time_slot=time,
        location=location,
        grade=grade,
        tutor_id=tutor_id,
        max_students=max_students,
    )
    db_session.add(slot)
    db_session.commit()
    return slot


_APP_SEQ = iter(range(1000, 9999))


def _make_app(db_session, config, *, name="Applicant", grade="F1", stream=None,
              school=None, location="華士古分校", status="Submitted",
              student_id=None, slot_id=None,
              p1=("Tuesday", "16:45 - 18:15"), p2=None):
    a = RegularApplication(
        config_id=config.id,
        reference_code=f"RC2026-A{next(_APP_SEQ)}",
        student_name=name,
        grade=grade,
        lang_stream=stream,
        school=school,
        contact_phone="85212345678",
        preferred_location=location,
        preference_1_day=p1[0] if p1 else None,
        preference_1_time=p1[1] if p1 else None,
        preference_2_day=p2[0] if p2 else None,
        preference_2_time=p2[1] if p2 else None,
        application_status=status,
        existing_student_id=student_id,
        assigned_slot_id=slot_id,
    )
    db_session.add(a)
    db_session.commit()
    return a


def _assign(db_session, admin, app, slot_id):
    return assign_application_slot(
        app_id=app.id,
        req=RegularSlotAssignRequest(slot_id=slot_id),
        admin=admin,
        db=db_session,
    )


def _suggest(db_session, config, app):
    return suggest_slots(
        config_id=config.id,
        application_id=app.id,
        _admin=None,
        db=db_session,
    )


# ---------------------------------------------------------------------------
# Slots CRUD
# ---------------------------------------------------------------------------

class TestSlotsCrud:
    def test_create_and_list(self, db_session, config, tutor):
        created = create_slot(
            data=RegularSlotCreate(
                config_id=config.id,
                slot_day="Saturday",
                time_slot="10:00 - 11:30",
                location="華士古分校",
                grade="F1",
                tutor_id=tutor.id,
            ),
            _admin=None,
            db=db_session,
        )
        assert created.max_students == 6
        assert created.tutor_name == "Teaching Tutor"
        assert created.assigned_count == 0

        slots = list_slots(config_id=config.id, location="華士古分校", _admin=None, db=db_session)
        assert [s.id for s in slots] == [created.id]

    def test_create_rejects_unknown_config_and_tutor(self, db_session, config):
        with pytest.raises(HTTPException) as exc:
            create_slot(
                data=RegularSlotCreate(
                    config_id=99999, slot_day="Tuesday",
                    time_slot="16:45 - 18:15", location="華士古分校",
                ),
                _admin=None, db=db_session,
            )
        assert exc.value.status_code == 404

        with pytest.raises(HTTPException) as exc:
            create_slot(
                data=RegularSlotCreate(
                    config_id=config.id, slot_day="Tuesday",
                    time_slot="16:45 - 18:15", location="華士古分校",
                    tutor_id=99999,
                ),
                _admin=None, db=db_session,
            )
        assert exc.value.status_code == 404

    def test_list_includes_assigned_students(self, db_session, config, admin):
        slot = _make_slot(db_session, config)
        _make_app(db_session, config, name="Zoe", slot_id=slot.id, stream="EMI", school="Pui Ching")
        slots = list_slots(config_id=config.id, location=None, _admin=None, db=db_session)
        assert slots[0].assigned_count == 1
        assert slots[0].students[0].student_name == "Zoe"
        assert slots[0].students[0].lang_stream == "EMI"
        assert slots[0].students[0].published is False

    def test_update_capacity_below_assigned_blocked(self, db_session, config, admin):
        slot = _make_slot(db_session, config, max_students=3)
        for i in range(2):
            _make_app(db_session, config, name=f"S{i}", slot_id=slot.id)
        with pytest.raises(HTTPException) as exc:
            update_slot(
                slot_id=slot.id,
                data=RegularSlotUpdate(max_students=1),
                _admin=None, db=db_session,
            )
        assert exc.value.detail["error_code"] == "capacity_below_assigned"

        updated = update_slot(
            slot_id=slot.id,
            data=RegularSlotUpdate(max_students=2, grade="F2"),
            _admin=None, db=db_session,
        )
        assert updated.max_students == 2
        assert updated.grade == "F2"

    def test_delete_blocked_while_assigned(self, db_session, config, admin):
        slot = _make_slot(db_session, config)
        app = _make_app(db_session, config, slot_id=slot.id)
        with pytest.raises(HTTPException) as exc:
            delete_slot(slot_id=slot.id, _admin=None, db=db_session)
        assert exc.value.detail["error_code"] == "slot_has_assignments"

        _assign(db_session, admin, app, None)
        assert delete_slot(slot_id=slot.id, _admin=None, db=db_session) == {"success": True}


# ---------------------------------------------------------------------------
# Assignment
# ---------------------------------------------------------------------------

class TestAssign:
    def test_assign_writes_audit_and_sets_slot(self, db_session, config, admin):
        slot = _make_slot(db_session, config)
        app = _make_app(db_session, config)
        resp = _assign(db_session, admin, app, slot.id)
        assert resp.assigned_slot_id == slot.id
        # Assignment never touches the application status.
        assert resp.application_status == "Submitted"

        audit = (
            db_session.query(RegularApplicationEdit)
            .filter(
                RegularApplicationEdit.application_id == app.id,
                RegularApplicationEdit.field_name == "assigned_slot_id",
            )
            .all()
        )
        assert len(audit) == 1
        assert audit[0].old_value is None
        assert audit[0].new_value == str(slot.id)
        assert audit[0].edited_via == "admin"

    def test_unassign_and_reassign(self, db_session, config, admin):
        slot_a = _make_slot(db_session, config)
        slot_b = _make_slot(db_session, config, day="Saturday", time="10:00 - 11:30")
        app = _make_app(db_session, config, slot_id=slot_a.id)

        resp = _assign(db_session, admin, app, slot_b.id)
        assert resp.assigned_slot_id == slot_b.id
        resp = _assign(db_session, admin, app, None)
        assert resp.assigned_slot_id is None

        audits = (
            db_session.query(RegularApplicationEdit)
            .filter(RegularApplicationEdit.field_name == "assigned_slot_id")
            .order_by(RegularApplicationEdit.id)
            .all()
        )
        assert [(a.old_value, a.new_value) for a in audits] == [
            (str(slot_a.id), str(slot_b.id)),
            (str(slot_b.id), None),
        ]

    def test_same_slot_is_noop_without_audit(self, db_session, config, admin):
        slot = _make_slot(db_session, config)
        app = _make_app(db_session, config, slot_id=slot.id)
        resp = _assign(db_session, admin, app, slot.id)
        assert resp.assigned_slot_id == slot.id
        count = db_session.query(RegularApplicationEdit).count()
        assert count == 0

    def test_capacity_guard(self, db_session, config, admin):
        slot = _make_slot(db_session, config, max_students=1)
        _make_app(db_session, config, name="First", slot_id=slot.id)
        late = _make_app(db_session, config, name="Late")
        with pytest.raises(HTTPException) as exc:
            _assign(db_session, admin, late, slot.id)
        assert exc.value.detail["error_code"] == "slot_full"

    def test_config_mismatch_rejected(self, db_session, config, admin):
        other = RegularCourseConfig(
            year=2027,
            title="Regular Sep 2027",
            application_open_date=datetime(2027, 8, 3),
            application_close_date=datetime(2027, 9, 30),
            course_start_date=date(2027, 9, 1),
            locations=[], available_grades=[], time_slots=[],
            is_active=False,
        )
        db_session.add(other)
        db_session.commit()
        foreign_slot = _make_slot(db_session, other)
        app = _make_app(db_session, config)
        with pytest.raises(HTTPException) as exc:
            _assign(db_session, admin, app, foreign_slot.id)
        assert exc.value.detail["error_code"] == "slot_config_mismatch"


# ---------------------------------------------------------------------------
# Suggestions
# ---------------------------------------------------------------------------

class TestSuggest:
    def test_pref_match_beats_grade_match(self, db_session, config):
        pref2_slot = _make_slot(db_session, config, day="Saturday", time="10:00 - 11:30", grade="F1")
        grade_slot = _make_slot(db_session, config, day="Tuesday", time="18:25 - 19:55", grade="F1")
        pref1_slot = _make_slot(db_session, config, day="Tuesday", time="16:45 - 18:15")
        app = _make_app(
            db_session, config,
            p1=("Tuesday", "16:45 - 18:15"), p2=("Saturday", "10:00 - 11:30"),
        )
        resp = _suggest(db_session, config, app)
        ids = [s.slot_id for s in resp.suggestions]
        assert ids[0] == pref1_slot.id
        assert ids[1] == pref2_slot.id
        assert ids[2] == grade_slot.id
        assert "pref_1_match" in resp.suggestions[0].reasons
        assert "pref_2_match" in resp.suggestions[1].reasons
        assert resp.suggestions[2].reasons == ["same_grade"]

    def test_full_and_incompatible_slots_excluded(self, db_session, config):
        full = _make_slot(db_session, config, max_students=1)
        _make_app(db_session, config, name="Occupant", slot_id=full.id)
        wrong_grade = _make_slot(db_session, config, day="Saturday", time="10:00 - 11:30", grade="F2")
        wrong_location = _make_slot(db_session, config, location="二龍喉分校")
        app = _make_app(db_session, config, grade="F1")
        resp = _suggest(db_session, config, app)
        ids = {s.slot_id for s in resp.suggestions}
        assert full.id not in ids
        assert wrong_grade.id not in ids
        assert wrong_location.id not in ids

    def test_stream_and_schoolmate_bonuses(self, db_session, config):
        plain = _make_slot(db_session, config, day="Saturday", time="10:00 - 11:30", grade="F1")
        social = _make_slot(db_session, config, day="Saturday", time="11:45 - 13:15", grade="F1")
        _make_app(db_session, config, name="Peer", slot_id=social.id,
                  stream="EMI", school="Pui Ching")
        app = _make_app(db_session, config, stream="EMI", school="  pui ching ",
                        p1=None, p2=None)
        resp = _suggest(db_session, config, app)
        assert resp.suggestions[0].slot_id == social.id
        assert "stream_match" in resp.suggestions[0].reasons
        assert "schoolmates:1" in resp.suggestions[0].reasons
        assert resp.suggestions[1].slot_id == plain.id

    def test_current_slot_excluded(self, db_session, config, admin):
        slot = _make_slot(db_session, config)
        app = _make_app(db_session, config, slot_id=slot.id)
        resp = _suggest(db_session, config, app)
        assert all(s.slot_id != slot.id for s in resp.suggestions)


# ---------------------------------------------------------------------------
# Publish from slot + discounts
# ---------------------------------------------------------------------------

class TestPublishFromSlot:
    def _linked_app(self, db_session, config, student, slot_id=None):
        return _make_app(
            db_session, config,
            name="Linked Student",
            status="Schedule Confirmed",
            student_id=student.id,
            slot_id=slot_id,
        )

    def test_publish_resolves_schedule_from_slot(self, db_session, config, admin, tutor, student):
        slot = _make_slot(db_session, config, day="Tuesday", time="16:45 - 18:15",
                          tutor_id=tutor.id)
        app = self._linked_app(db_session, config, student, slot_id=slot.id)
        resp = publish_application(
            app_id=app.id, req=RegularPublishRequest(), admin=admin, db=db_session
        )
        assert resp.first_lesson_date == date(2026, 9, 1)
        enrollment = db_session.get(Enrollment, resp.enrollment_id)
        assert enrollment.assigned_day == "Tue"
        assert enrollment.assigned_time == "16:45 - 18:15"
        assert enrollment.tutor_id == tutor.id
        assert enrollment.location == "MSA"

    def test_explicit_fields_override_slot(self, db_session, config, admin, tutor, student):
        other_tutor = Tutor(
            user_email="other@test.com", tutor_name="Other",
            role="Tutor", is_active_tutor=True,
        )
        db_session.add(other_tutor)
        db_session.commit()
        slot = _make_slot(db_session, config, day="Tuesday", time="16:45 - 18:15",
                          tutor_id=tutor.id)
        app = self._linked_app(db_session, config, student, slot_id=slot.id)
        resp = publish_application(
            app_id=app.id,
            req=RegularPublishRequest(
                confirmed_day="Saturday",
                confirmed_time="10:00 - 11:30",
                tutor_id=other_tutor.id,
            ),
            admin=admin, db=db_session,
        )
        enrollment = db_session.get(Enrollment, resp.enrollment_id)
        assert enrollment.assigned_day == "Sat"
        assert enrollment.assigned_time == "10:00 - 11:30"
        assert enrollment.tutor_id == other_tutor.id
        # Location still falls back to the slot.
        assert enrollment.location == "MSA"

    def test_slot_without_tutor_blocks(self, db_session, config, admin, student):
        slot = _make_slot(db_session, config, tutor_id=None)
        app = self._linked_app(db_session, config, student, slot_id=slot.id)
        with pytest.raises(HTTPException) as exc:
            publish_application(
                app_id=app.id, req=RegularPublishRequest(), admin=admin, db=db_session
            )
        assert exc.value.detail["error_code"] == "slot_no_tutor"

    def test_no_slot_no_fields_blocks(self, db_session, config, admin, student):
        app = self._linked_app(db_session, config, student)
        with pytest.raises(HTTPException) as exc:
            publish_application(
                app_id=app.id, req=RegularPublishRequest(), admin=admin, db=db_session
            )
        assert exc.value.detail["error_code"] == "no_schedule"


class TestPublishDiscount:
    @pytest.fixture
    def coupon_discount(self, db_session):
        d = Discount(
            discount_name="Coupon $300",
            discount_type="fixed",
            discount_value=300,
            is_active=True,
        )
        db_session.add(d)
        db_session.commit()
        return d

    def _publish(self, db_session, config, admin, tutor, student, **req_overrides):
        app = _make_app(
            db_session, config,
            name="Linked Student",
            status="Schedule Confirmed",
            student_id=student.id,
        )
        req = RegularPublishRequest(
            confirmed_day="Tuesday",
            confirmed_time="16:45 - 18:15",
            location="華士古分校",
            tutor_id=tutor.id,
            **req_overrides,
        )
        return publish_application(app_id=app.id, req=req, admin=admin, db=db_session)

    def test_discount_applied_to_revenue(self, db_session, config, admin, tutor, student, coupon_discount):
        resp = self._publish(
            db_session, config, admin, tutor, student,
            discount_id=coupon_discount.id,
        )
        enrollment = db_session.get(Enrollment, resp.enrollment_id)
        assert enrollment.discount_id == coupon_discount.id
        # 400 x 6 - 300 (revenue_total excludes the reg fee by definition)
        assert float(enrollment.revenue_total) == 2100.0

    def test_unknown_discount_blocks(self, db_session, config, admin, tutor, student):
        with pytest.raises(HTTPException) as exc:
            self._publish(
                db_session, config, admin, tutor, student, discount_id=99999
            )
        assert exc.value.detail["error_code"] == "invalid_discount"

    def test_discount_min_lessons_blocks(self, db_session, config, admin, tutor, student, coupon_discount):
        with pytest.raises(HTTPException) as exc:
            self._publish(
                db_session, config, admin, tutor, student,
                discount_id=coupon_discount.id, lessons_paid=4,
            )
        assert exc.value.detail["error_code"] == "discount_min_lessons"
