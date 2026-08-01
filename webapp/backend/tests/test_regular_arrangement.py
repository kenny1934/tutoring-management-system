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
    RegularTutorDuty,
    Enrollment,
)
from schemas import (
    RegularPublishRequest,
    TutorDutyBulkSet,
    TutorDutyItem,
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
    list_applications,
    suggest_slots,
    get_demand,
    publish_application,
    get_tutor_duties,
    bulk_set_tutor_duties,
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
def freeze_promo_window(monkeypatch):
    """Pin 'now' inside the campaign window so promo tests do not depend on the
    day they are run."""
    import routers.regular_course as rc
    monkeypatch.setattr(rc, "hk_now", lambda: datetime(2026, 8, 20, 10, 0))


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
               location="華士古分校", grade=None, stream=None, tutor_id=None,
               max_students=6):
    slot = RegularCourseSlot(
        config_id=config.id,
        slot_day=day,
        time_slot=time,
        location=location,
        grade=grade,
        lang_stream=stream,
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
        assert created.max_students == 8  # default slot capacity
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
        _make_app(db_session, config, name="Zoe", slot_id=slot.id, stream="E", school="Pui Ching")
        slots = list_slots(config_id=config.id, location=None, _admin=None, db=db_session)
        assert slots[0].assigned_count == 1
        assert slots[0].students[0].student_name == "Zoe"
        assert slots[0].students[0].lang_stream == "E"
        assert slots[0].students[0].published is False
        # No linked student record, so no student code to show in the grid.
        assert slots[0].students[0].school_student_id is None

    def test_list_carries_linked_student_code(self, db_session, config, admin, student):
        student.school_student_id = "MSA-1024"
        db_session.commit()
        slot = _make_slot(db_session, config)
        _make_app(db_session, config, name="Zoe", slot_id=slot.id, student_id=student.id)
        slots = list_slots(config_id=config.id, location=None, _admin=None, db=db_session)
        assert slots[0].students[0].school_student_id == "MSA-1024"

    def test_exit_status_student_stays_listed_but_frees_its_place(
        self, db_session, config, admin
    ):
        """The row stays so the admin can see the placement that was given up,
        while the fill count reads as one place free."""
        slot = _make_slot(db_session, config, max_students=2)
        _make_app(db_session, config, name="Staying", slot_id=slot.id)
        _make_app(db_session, config, name="Gone", slot_id=slot.id, status="Withdrawn")
        slots = list_slots(config_id=config.id, location=None, _admin=None, db=db_session)
        assert slots[0].assigned_count == 1
        assert [s.student_name for s in slots[0].students] == ["Gone", "Staying"]

    def test_capacity_can_drop_to_the_seats_actually_held(self, db_session, config, admin):
        slot = _make_slot(db_session, config, max_students=3)
        _make_app(db_session, config, name="Staying", slot_id=slot.id)
        _make_app(db_session, config, name="Gone", slot_id=slot.id, status="Withdrawn")
        updated = update_slot(
            slot_id=slot.id,
            data=RegularSlotUpdate(max_students=1),
            _admin=None, db=db_session,
        )
        assert updated.max_students == 1

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
        assert audit[0].edited_at is not None

    def test_audit_edited_at_has_a_python_side_default(self):
        """The live audit tables were created with no DEFAULT on edited_at, so an
        insert that omits it is rejected under strict mode. SQLite builds the table
        from the model (server_default included) and would hide that, so assert the
        client-side default the real database depends on."""
        from models import SummerApplicationEdit

        for model in (RegularApplicationEdit, SummerApplicationEdit):
            assert model.__table__.c.edited_at.default is not None

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

    @pytest.mark.parametrize("exit_status", ["Withdrawn", "Rejected"])
    def test_exit_status_releases_the_seat(self, db_session, config, admin, exit_status):
        """A student who leaves the intake must not hold a place the class can
        offer to somebody else."""
        slot = _make_slot(db_session, config, max_students=1)
        _make_app(db_session, config, name="Gone", slot_id=slot.id, status=exit_status)
        late = _make_app(db_session, config, name="Late")
        resp = _assign(db_session, admin, late, slot.id)
        assert resp.assigned_slot_id == slot.id

    def test_waitlisted_keeps_its_seat(self, db_session, config, admin):
        """Waitlisted is a holding rung, not an exit: the placement stands."""
        slot = _make_slot(db_session, config, max_students=1)
        _make_app(db_session, config, name="Held", slot_id=slot.id, status="Waitlisted")
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


class TestAssignedSlotOnApplication:
    """The application list carries its slot inline, so the card and the detail
    modal can show the placement without fetching every slot in the config."""

    def _list(self, db_session, config):
        return list_applications(
            config_id=config.id,
            application_status=None,
            grade=None,
            location=None,
            search=None,
            published=None,
            _admin=None,
            db=db_session,
        )

    def test_assigned_slot_is_inlined_with_tutor_name(self, db_session, config, tutor, admin):
        slot = _make_slot(db_session, config, day="Saturday", time="10:00 - 11:30",
                          grade="F1", tutor_id=tutor.id)
        app = _make_app(db_session, config, slot_id=slot.id)

        [resp] = self._list(db_session, config)
        assert resp.id == app.id
        assert resp.assigned_slot is not None
        assert resp.assigned_slot.id == slot.id
        assert resp.assigned_slot.slot_day == "Saturday"
        assert resp.assigned_slot.time_slot == "10:00 - 11:30"
        assert resp.assigned_slot.location == "華士古分校"
        assert resp.assigned_slot.grade == "F1"
        assert resp.assigned_slot.tutor_name == "Teaching Tutor"
        assert resp.assigned_slot.max_students == 6

    def test_unassigned_application_has_no_slot(self, db_session, config):
        _make_app(db_session, config)
        [resp] = self._list(db_session, config)
        assert resp.assigned_slot_id is None
        assert resp.assigned_slot is None

    def test_slot_without_tutor_reports_no_name(self, db_session, config):
        slot = _make_slot(db_session, config)
        _make_app(db_session, config, slot_id=slot.id)
        [resp] = self._list(db_session, config)
        assert resp.assigned_slot is not None
        assert resp.assigned_slot.tutor_id is None
        assert resp.assigned_slot.tutor_name is None

    def test_assign_response_carries_the_new_slot(self, db_session, config, tutor, admin):
        slot = _make_slot(db_session, config, tutor_id=tutor.id)
        app = _make_app(db_session, config)

        resp = _assign(db_session, admin, app, slot.id)
        assert resp.assigned_slot is not None
        assert resp.assigned_slot.tutor_name == "Teaching Tutor"

        resp = _assign(db_session, admin, app, None)
        assert resp.assigned_slot is None


class TestNewStudentOnApplication:
    """The response carries the registration-fee verdict so the admin fee
    preview quotes the same total the fee message and publishing do."""

    def _list(self, db_session, config):
        return list_applications(
            config_id=config.id,
            application_status=None,
            grade=None,
            location=None,
            search=None,
            published=None,
            _admin=None,
            db=db_session,
        )

    def test_unlinked_application_counts_as_new(self, db_session, config):
        _make_app(db_session, config)
        [resp] = self._list(db_session, config)
        assert resp.is_new_student is True

    def test_linked_student_with_no_history_is_new(self, db_session, config, student):
        _make_app(db_session, config, student_id=student.id)
        [resp] = self._list(db_session, config)
        assert resp.is_new_student is True

    def test_prior_enrollment_clears_the_fee(self, db_session, config, tutor, student):
        db_session.add(Enrollment(
            student_id=student.id, tutor_id=tutor.id, assigned_day="Tue",
            assigned_time="16:45 - 18:15", location="MSA", lessons_paid=6,
            first_lesson_date=date(2026, 1, 6), payment_status="Paid",
            enrollment_type="Regular",
        ))
        db_session.commit()
        _make_app(db_session, config, student_id=student.id)
        [resp] = self._list(db_session, config)
        assert resp.is_new_student is False

    def test_trial_enrollment_still_counts_as_new(self, db_session, config, tutor, student):
        db_session.add(Enrollment(
            student_id=student.id, tutor_id=tutor.id, assigned_day="Tue",
            assigned_time="16:45 - 18:15", location="MSA", lessons_paid=1,
            first_lesson_date=date(2026, 1, 6), payment_status="Paid",
            enrollment_type="Trial",
        ))
        db_session.commit()
        _make_app(db_session, config, student_id=student.id)
        [resp] = self._list(db_session, config)
        assert resp.is_new_student is True

    def test_publishing_does_not_flip_its_own_verdict(
        self, db_session, config, admin, tutor, student
    ):
        """The enrollment publishing creates must not make the applicant look
        like a returning student, or the fee message would quote $100 less
        than the parent was already told."""
        app = _make_app(db_session, config, status="Fee Sent", student_id=student.id)
        publish_application(
            app_id=app.id,
            req=RegularPublishRequest(
                confirmed_day="Tuesday", confirmed_time="16:45 - 18:15",
                location="華士古分校", tutor_id=tutor.id,
            ),
            admin=admin, db=db_session,
        )

        [resp] = self._list(db_session, config)
        assert resp.is_new_student is True

        from routers.regular_course import get_application_messages
        msgs = get_application_messages(
            app_id=app.id, lessons_paid=6, discount_id=None,
            first_lesson_date=None, _admin=None, db=db_session,
        )
        assert msgs.is_new_student is True
        assert msgs.total_fee == 2500

    def test_a_second_application_sees_the_first_enrollment(
        self, db_session, config, admin, tutor, student
    ):
        first = _make_app(db_session, config, status="Fee Sent", student_id=student.id)
        publish_application(
            app_id=first.id,
            req=RegularPublishRequest(
                confirmed_day="Tuesday", confirmed_time="16:45 - 18:15",
                location="華士古分校", tutor_id=tutor.id,
            ),
            admin=admin, db=db_session,
        )
        second = _make_app(db_session, config, name="Second Round", student_id=student.id)

        by_id = {r.id: r for r in self._list(db_session, config)}
        assert by_id[first.id].is_new_student is True
        assert by_id[second.id].is_new_student is False


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
                  stream="E", school="Pui Ching")
        app = _make_app(db_session, config, stream="E", school="  pui ching ",
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
# Language-stream placement (Feature 1)
# ---------------------------------------------------------------------------

class TestStreamPlacement:
    def test_stream_incompatible_slot_excluded(self, db_session, config):
        c_slot = _make_slot(db_session, config, grade="F1", stream="C")
        e_slot = _make_slot(db_session, config, day="Saturday",
                            time="10:00 - 11:30", grade="F1", stream="E")
        app = _make_app(db_session, config, grade="F1", stream="E", p1=None, p2=None)
        ids = {s.slot_id for s in _suggest(db_session, config, app).suggestions}
        assert c_slot.id not in ids  # hard filter drops the wrong stream
        assert e_slot.id in ids

    def test_unset_stream_slot_is_never_filtered_out(self, db_session, config):
        any_slot = _make_slot(db_session, config, grade="F1")  # stream unset = any
        app = _make_app(db_session, config, grade="F1", stream="C", p1=None, p2=None)
        ids = {s.slot_id for s in _suggest(db_session, config, app).suggestions}
        assert any_slot.id in ids

    def test_int_applicant_matches_an_e_slot(self, db_session, config):
        e_slot = _make_slot(db_session, config, grade="F1", stream="E")
        c_slot = _make_slot(db_session, config, day="Saturday",
                            time="10:00 - 11:30", grade="F1", stream="C")
        app = _make_app(db_session, config, grade="F1", stream="Int", p1=None, p2=None)
        resp = _suggest(db_session, config, app)
        ids = {s.slot_id for s in resp.suggestions}
        assert e_slot.id in ids  # Int folds into E
        assert c_slot.id not in ids
        e_sug = next(s for s in resp.suggestions if s.slot_id == e_slot.id)
        assert "stream_match" in e_sug.reasons  # and earns the exact-match bonus

    def test_linked_student_record_wins_over_submitted_stream(self, db_session, config, student):
        # Submitted E, but the linked student record says C — the record wins.
        student.lang_stream = "C"
        db_session.commit()
        c_slot = _make_slot(db_session, config, grade="F1", stream="C")
        e_slot = _make_slot(db_session, config, day="Saturday",
                            time="10:00 - 11:30", grade="F1", stream="E")
        app = _make_app(db_session, config, grade="F1", stream="E",
                        student_id=student.id, p1=None, p2=None)
        ids = {s.slot_id for s in _suggest(db_session, config, app).suggestions}
        assert c_slot.id in ids
        assert e_slot.id not in ids

    def test_exact_slot_stream_match_earns_the_bonus(self, db_session, config):
        e_slot = _make_slot(db_session, config, grade="F1", stream="E")
        app = _make_app(db_session, config, grade="F1", stream="E", p1=None, p2=None)
        resp = _suggest(db_session, config, app)
        sug = next(s for s in resp.suggestions if s.slot_id == e_slot.id)
        assert "stream_match" in sug.reasons

    def test_assignment_to_mismatched_stream_succeeds(self, db_session, config, admin):
        # Decision 3: manual assignment warns, never blocks.
        e_slot = _make_slot(db_session, config, grade="F1", stream="E")
        app = _make_app(db_session, config, grade="F1", stream="C")
        resp = _assign(db_session, admin, app, e_slot.id)
        assert resp.assigned_slot_id == e_slot.id

    def test_demand_buckets_by_grade_stream(self, db_session, config):
        _make_app(db_session, config, grade="F1", stream="C",
                  p1=("Tuesday", "16:45 - 18:15"), p2=None)
        _make_app(db_session, config, grade="F1", stream="E",
                  p1=("Tuesday", "16:45 - 18:15"), p2=None)
        _make_app(db_session, config, grade="F1", stream="Int",
                  p1=("Tuesday", "16:45 - 18:15"), p2=None)  # folds into F1E
        resp = get_demand(config_id=config.id, location="華士古分校",
                          _admin=None, db=db_session)
        cell = next(c for c in resp.cells
                    if c.day == "Tuesday" and c.time_slot == "16:45 - 18:15")
        assert cell.by_grade_stream_first.get("F1C") == 1
        assert cell.by_grade_stream_first.get("F1E") == 2  # C-stream apart from E


# ---------------------------------------------------------------------------
# Publish from slot + discounts
# ---------------------------------------------------------------------------

class TestPublishFromSlot:
    def _linked_app(self, db_session, config, student, slot_id=None):
        return _make_app(
            db_session, config,
            name="Linked Student",
            status="Fee Sent",
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
            status="Fee Sent",
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


# ---------------------------------------------------------------------------
# Parent messages (schedule + fee)
# ---------------------------------------------------------------------------

class TestApplicationMessages:
    def _messages(self, db_session, app, *, lessons_paid=6, discount_id=None,
                  first_lesson_date=None):
        from routers.regular_course import get_application_messages
        return get_application_messages(
            app_id=app.id,
            lessons_paid=lessons_paid,
            discount_id=discount_id,
            first_lesson_date=first_lesson_date,
            _admin=None,
            db=db_session,
        )

    def test_schedule_and_fee_from_assigned_slot(self, db_session, config, tutor, student):
        student.school_student_id = "MSA-1024"
        db_session.commit()
        slot = _make_slot(db_session, config, day="Saturday", time="10:00 - 11:30",
                          tutor_id=tutor.id)
        app = _make_app(db_session, config, name="Applicant",
                        student_id=student.id, slot_id=slot.id)

        msgs = self._messages(db_session, app)

        assert msgs.schedule_source == "slot"
        assert msgs.assigned_day == "Sat"
        assert msgs.first_lesson_date == date(2026, 9, 5)
        # Identity + schedule in the schedule message, no money.
        assert "MSA-1024" in msgs.schedule_zh
        assert "逢星期六 10:00 - 11:30 (90分鐘)" in msgs.schedule_zh
        assert "費用" not in msgs.schedule_zh
        assert "Every Saturday 10:00 - 11:30 (90 minutes)" in msgs.schedule_en
        # Fee message quotes the real total: 400 x 6 + 100 registration.
        assert msgs.total_fee == 2500
        assert "$2,500" in msgs.fee_zh
        assert "$2,500" in msgs.fee_en

    def test_falls_back_to_first_preference(self, db_session, config, student):
        app = _make_app(db_session, config, student_id=student.id)
        msgs = self._messages(db_session, app)
        assert msgs.schedule_source == "preference"
        assert msgs.assigned_day == "Tue"

    def test_discount_and_lesson_count_reach_the_fee(self, db_session, config, student):
        discount = Discount(
            discount_name="Coupon $300", discount_type="fixed",
            discount_value=300, is_active=True,
        )
        db_session.add(discount)
        db_session.commit()
        app = _make_app(db_session, config, student_id=student.id)
        msgs = self._messages(db_session, app, lessons_paid=6, discount_id=discount.id)
        assert msgs.discount_value == 300
        # 400 x 6 - 300 + 100 registration fee
        assert msgs.total_fee == 2200
        assert "$2,200" in msgs.fee_zh

    def test_existing_student_pays_no_registration_fee(self, db_session, config, tutor, student):
        db_session.add(Enrollment(
            student_id=student.id, tutor_id=tutor.id, assigned_day="Tue",
            assigned_time="16:45 - 18:15", location="MSA", lessons_paid=6,
            first_lesson_date=date(2026, 1, 6), payment_status="Paid",
            enrollment_type="Regular",
        ))
        db_session.commit()
        app = _make_app(db_session, config, student_id=student.id)
        msgs = self._messages(db_session, app)
        assert msgs.is_new_student is False
        assert msgs.total_fee == 2400

    def test_unlinked_application_drops_the_student_id_line(self, db_session, config):
        app = _make_app(db_session, config, name="No Link")
        msgs = self._messages(db_session, app)
        assert msgs.has_student_link is False
        assert "學生編號" not in msgs.fee_zh
        assert "Student ID" not in msgs.fee_en
        assert "No Link" in msgs.schedule_zh

    def test_no_schedule_at_all_blocks(self, db_session, config, student):
        app = _make_app(db_session, config, student_id=student.id, p1=None)
        app.preferred_location = None
        db_session.commit()
        with pytest.raises(HTTPException) as exc:
            self._messages(db_session, app)
        assert exc.value.detail["error_code"] == "no_schedule"


class TestPublishPaymentStatus:
    def _publish(self, db_session, config, admin, tutor, student, status):
        app = _make_app(db_session, config, name="Payer", status=status,
                        student_id=student.id)
        return publish_application(
            app_id=app.id,
            req=RegularPublishRequest(
                confirmed_day="Tuesday", confirmed_time="16:45 - 18:15",
                location="華士古分校", tutor_id=tutor.id,
            ),
            admin=admin, db=db_session,
        )

    def test_paid_application_publishes_as_paid(self, db_session, config, admin, tutor, student):
        resp = self._publish(db_session, config, admin, tutor, student, "Paid")
        enrollment = db_session.get(Enrollment, resp.enrollment_id)
        assert enrollment.payment_status == "Paid"
        assert enrollment.payment_date is not None

    def test_fee_sent_application_publishes_as_pending(self, db_session, config, admin, tutor, student):
        resp = self._publish(db_session, config, admin, tutor, student, "Fee Sent")
        enrollment = db_session.get(Enrollment, resp.enrollment_id)
        assert enrollment.payment_status == "Pending Payment"
        assert enrollment.payment_date is None

    def test_explicit_payment_status_wins(self, db_session, config, admin, tutor, student):
        app = _make_app(db_session, config, name="Override", status="Fee Sent",
                        student_id=student.id)
        resp = publish_application(
            app_id=app.id,
            req=RegularPublishRequest(
                confirmed_day="Tuesday", confirmed_time="16:45 - 18:15",
                location="華士古分校", tutor_id=tutor.id, payment_status="Paid",
            ),
            admin=admin, db=db_session,
        )
        enrollment = db_session.get(Enrollment, resp.enrollment_id)
        assert enrollment.payment_status == "Paid"


# ---------------------------------------------------------------------------
# Tutor duties (shared roster helpers, exercised through the regular endpoints)
# ---------------------------------------------------------------------------

class TestTutorDuties:
    def _get(self, db_session, config, location="華士古分校"):
        return get_tutor_duties(
            config_id=config.id, location=location, _admin=None, db=db_session,
        )

    def _set(self, db_session, admin, config, duties, location="華士古分校"):
        return bulk_set_tutor_duties(
            data=TutorDutyBulkSet(
                config_id=config.id, location=location, duties=duties,
            ),
            admin=admin, db=db_session,
        )

    def test_empty_roster_reads_as_no_duties(self, db_session, config):
        assert self._get(db_session, config) == []

    def test_set_then_read_back_with_tutor_name(self, db_session, config, admin, tutor):
        result = self._set(db_session, admin, config, [
            TutorDutyItem(tutor_id=tutor.id, duty_day="Tuesday", time_slot="16:45 - 18:15"),
            TutorDutyItem(tutor_id=tutor.id, duty_day="Saturday", time_slot="10:00 - 11:30"),
        ])
        assert result == {"success": True, "count": 2}

        duties = self._get(db_session, config)
        assert {(d.duty_day, d.time_slot) for d in duties} == {
            ("Tuesday", "16:45 - 18:15"),
            ("Saturday", "10:00 - 11:30"),
        }
        assert all(d.tutor_name == "Teaching Tutor" for d in duties)

    def test_save_replaces_the_whole_roster(self, db_session, config, admin, tutor):
        self._set(db_session, admin, config, [
            TutorDutyItem(tutor_id=tutor.id, duty_day="Tuesday", time_slot="16:45 - 18:15"),
        ])
        self._set(db_session, admin, config, [
            TutorDutyItem(tutor_id=tutor.id, duty_day="Saturday", time_slot="10:00 - 11:30"),
        ])
        duties = self._get(db_session, config)
        assert [(d.duty_day, d.time_slot) for d in duties] == [("Saturday", "10:00 - 11:30")]

    def test_clearing_every_tick_empties_the_roster(self, db_session, config, admin, tutor):
        self._set(db_session, admin, config, [
            TutorDutyItem(tutor_id=tutor.id, duty_day="Tuesday", time_slot="16:45 - 18:15"),
        ])
        assert self._set(db_session, admin, config, []) == {"success": True, "count": 0}
        assert self._get(db_session, config) == []

    def test_branches_keep_separate_rosters(self, db_session, config, admin, tutor):
        self._set(db_session, admin, config, [
            TutorDutyItem(tutor_id=tutor.id, duty_day="Tuesday", time_slot="16:45 - 18:15"),
        ], location="華士古分校")
        self._set(db_session, admin, config, [
            TutorDutyItem(tutor_id=tutor.id, duty_day="Saturday", time_slot="10:00 - 11:30"),
        ], location="二龍喉分校")

        assert len(self._get(db_session, config, "華士古分校")) == 1
        assert len(self._get(db_session, config, "二龍喉分校")) == 1
        # Saving one branch must not wipe the other.
        assert self._get(db_session, config, "華士古分校")[0].duty_day == "Tuesday"

    def test_duties_belong_to_their_own_config(self, db_session, config, admin, tutor):
        other = RegularCourseConfig(
            year=2027, title="Regular Sep 2027",
            application_open_date=datetime(2027, 8, 3),
            application_close_date=datetime(2027, 9, 30),
            course_start_date=date(2027, 9, 7),
            locations=[{"name": "華士古分校", "open_days": ["Tuesday"]}],
            is_active=False,
        )
        db_session.add(other)
        db_session.commit()

        self._set(db_session, admin, config, [
            TutorDutyItem(tutor_id=tutor.id, duty_day="Tuesday", time_slot="16:45 - 18:15"),
        ])
        assert len(self._get(db_session, config)) == 1
        assert self._get(db_session, other) == []

    def test_rows_land_in_the_regular_table(self, db_session, config, admin, tutor):
        self._set(db_session, admin, config, [
            TutorDutyItem(tutor_id=tutor.id, duty_day="Tuesday", time_slot="16:45 - 18:15"),
        ])
        rows = db_session.query(RegularTutorDuty).all()
        assert len(rows) == 1
        assert rows[0].config_id == config.id
        assert rows[0].location == "華士古分校"


# ---------------------------------------------------------------------------
# Seasonal offer (26BTSSA): eligibility gating and what it does to the money
# ---------------------------------------------------------------------------

PROMO_CONFIG = {
    "code": "26BTSSA",
    "name_zh": "2026 中學教室 Back to School 新生優惠",
    "name_en": "2026 Secondary Academy Back to School New Student Offer",
    "short_name_zh": "2026 Back to School 新生優惠",
    "short_name_en": "2026 Back to School new student offer",
    "total_value": 400,
    "tuition_amount": 300,
    "waives_registration_fee": True,
    "from_date": "2026-08-12",
    "until_date": None,
}


class TestRegularPromo:
    """The offer is worth $400 to a verified new student: $300 off tuition via
    an ordinary discounts row, plus the $100 materials fee waived."""

    @pytest.fixture
    def promo_config(self, db_session, config):
        """The season's config with the offer running and a discount row."""
        discount = Discount(
            discount_name="2026 Back to School 新生優惠",
            discount_type="fixed",
            discount_value=300,
            is_active=True,
        )
        db_session.add(discount)
        db_session.commit()
        config.pricing_config = {
            "base_fee": 2400,
            "lessons_per_block": 6,
            # Still the standard fee, quoted by the offer, but this intake
            # collects it from nobody.
            "registration_fee": 100,
            "registration_fee_charged": False,
            "promo": {**PROMO_CONFIG, "discount_id": discount.id},
        }
        db_session.commit()
        return config, discount

    def _publish(self, db_session, config, admin, tutor, student, *, origin,
                 discount_id=None):
        """Publish an application whose verified origin is `origin`.

        A student record is always linked: publishing requires one, and a
        genuinely new applicant gets a fresh record with no prior enrollments,
        which is what keeps is_new_student true.
        """
        app = _make_app(
            db_session, config,
            name="New Applicant",
            status="Fee Sent",
            student_id=student.id,
        )
        app.verified_branch_origin = origin
        db_session.commit()
        req = RegularPublishRequest(
            confirmed_day="Tuesday",
            confirmed_time="16:45 - 18:15",
            location="華士古分校",
            tutor_id=tutor.id,
            discount_id=discount_id,
        )
        resp = publish_application(app_id=app.id, req=req, admin=admin, db=db_session)
        return app, db_session.get(Enrollment, resp.enrollment_id)

    def test_verified_new_student_gets_the_offer_stamped(self, db_session, promo_config, admin, tutor, student, freeze_promo_window):
        config, discount = promo_config
        _app, enrollment = self._publish(
            db_session, config, admin, tutor, student, origin="New", discount_id=discount.id
        )
        assert enrollment.promo_code == "26BTSSA"

    def test_returning_student_does_not(self, db_session, promo_config, admin, tutor, student, freeze_promo_window):
        """A verified branch origin is proof of history, so no offer applies
        even though the campaign is running."""
        config, discount = promo_config
        _app, enrollment = self._publish(
            db_session, config, admin, tutor, student, origin="MTA", discount_id=discount.id
        )
        assert enrollment.promo_code is None

    def test_unverified_applicant_does_not(self, db_session, promo_config, admin, tutor, student, freeze_promo_window):
        """Silence is not a yes: nobody has confirmed this applicant is new."""
        config, discount = promo_config
        _app, enrollment = self._publish(
            db_session, config, admin, tutor, student, origin=None, discount_id=discount.id
        )
        assert enrollment.promo_code is None

    def test_offer_is_not_stamped_before_its_launch_day(self, db_session, promo_config, admin, tutor, student, monkeypatch):
        """The form opens before the campaign does, so an application published
        in that window must not collect the offer."""
        import routers.regular_course as rc
        monkeypatch.setattr(rc, "hk_now", lambda: datetime(2026, 8, 6, 10, 0))
        config, discount = promo_config
        _app, enrollment = self._publish(
            db_session, config, admin, tutor, student, origin="New", discount_id=discount.id
        )
        assert enrollment.promo_code is None

    def test_offer_recipient_pays_tuition_only(
        self, db_session, promo_config, admin, tutor, student, freeze_promo_window
    ):
        """The parent pays 2400 - 300 = 2100, all of it tuition.

        Guards the encoding choice: a single $400 discount with the fee still
        charged reaches the same 2100 but would report only 2000 of revenue and
        claim a materials fee nobody paid.
        """
        from routers.enrollments import (
            compute_enrollment_total_fee,
            enrollment_registration_fee,
        )
        config, discount = promo_config
        _app, enrollment = self._publish(
            db_session, config, admin, tutor, student, origin="New", discount_id=discount.id
        )
        assert enrollment.is_new_student is True
        assert enrollment_registration_fee(enrollment, db_session) == 0
        assert compute_enrollment_total_fee(enrollment, db_session) == 2100
        assert float(enrollment.revenue_total) == 2100.0

    def test_an_ordinary_regular_enrollment_still_charges_the_fee(
        self, db_session, promo_config, admin, tutor, student
    ):
        """The intake's waiver must not leak past the intake.

        An enrollment created outside the application flow carries no
        regular_application_id, so it never reaches the intake config and a new
        student owes the fee exactly as before. This is the seam that keeps
        post-September enrollments and renewals working unchanged.
        """
        from routers.enrollments import (
            compute_enrollment_total_fee,
            enrollment_registration_fee,
        )
        plain = Enrollment(
            student_id=student.id, tutor_id=tutor.id,
            assigned_day="Tue", assigned_time="16:45 - 18:15", location="MSA",
            lessons_paid=6, first_lesson_date=date(2026, 10, 6),
            payment_status="Pending Payment", enrollment_type="Regular",
            is_new_student=True,
        )
        db_session.add(plain)
        db_session.commit()
        assert plain.regular_application_id is None
        assert enrollment_registration_fee(plain, db_session) == 100
        assert compute_enrollment_total_fee(plain, db_session) == 2500

    def test_primary_branch_transfer_pays_plain_tuition_and_gets_no_offer(
        self, db_session, promo_config, admin, tutor, student, freeze_promo_window
    ):
        """A MathConcept primary student moving up to Secondary.

        New to us, so is_new_student stands and the reporting stays honest,
        but this intake collects the materials fee from nobody, so they pay
        plain tuition. They are an existing MathConcept family, so no offer.
        """
        from routers.enrollments import compute_enrollment_total_fee
        config, _discount = promo_config
        _app, enrollment = self._publish(
            db_session, config, admin, tutor, student, origin="MTA"
        )
        assert enrollment.promo_code is None
        assert enrollment.is_new_student is True
        assert compute_enrollment_total_fee(enrollment, db_session) == 2400

    def test_returning_secondary_student_owes_no_materials_fee(
        self, db_session, promo_config, admin, tutor, student, freeze_promo_window
    ):
        """An existing Secondary Academy student pays plain tuition.

        The materials fee follows enrolment history, not the verified origin,
        so a prior enrollment is what removes it.
        """
        from routers.enrollments import compute_enrollment_total_fee
        config, _discount = promo_config
        prior = Enrollment(
            student_id=student.id, tutor_id=tutor.id,
            assigned_day="Mon", assigned_time="16:45 - 18:15", location="MSA",
            lessons_paid=6, first_lesson_date=date(2026, 3, 2),
            payment_status="Paid", enrollment_type="Regular",
        )
        db_session.add(prior)
        db_session.commit()

        _app, enrollment = self._publish(
            db_session, config, admin, tutor, student, origin="MSA"
        )
        assert enrollment.is_new_student is False
        assert compute_enrollment_total_fee(enrollment, db_session) == 2400

    def test_public_config_hides_the_offer_before_launch(self, db_session, promo_config, monkeypatch):
        """Stripped server-side, so an unannounced offer is never sitting in
        the page's network response waiting to be read."""
        import routers.regular_course as rc
        monkeypatch.setattr(rc, "hk_now", lambda: datetime(2026, 8, 6, 10, 0))
        config, _discount = promo_config
        pricing = rc._public_pricing_config(config)
        assert "promo" not in pricing
        assert pricing["base_fee"] == 2400

    def test_public_config_exposes_the_offer_once_live_without_internal_ids(
        self, db_session, promo_config, freeze_promo_window
    ):
        import routers.regular_course as rc
        config, _discount = promo_config
        pricing = rc._public_pricing_config(config)
        assert pricing["promo"]["code"] == "26BTSSA"
        # The discounts row id addresses internal data and does nothing for the form.
        assert "discount_id" not in pricing["promo"]

    def test_application_response_reports_eligibility(self, db_session, promo_config, admin, freeze_promo_window):
        config, _discount = promo_config
        new = _make_app(db_session, config, name="New One")
        new.verified_branch_origin = "New"
        returning = _make_app(db_session, config, name="Returning One")
        returning.verified_branch_origin = "MSA"
        db_session.commit()

        by_name = {
            r.student_name: r
            for r in list_applications(config_id=config.id, _admin=None, db=db_session)
        }
        assert by_name["New One"].promo_eligible is True
        assert by_name["New One"].promo_code == "26BTSSA"
        assert by_name["Returning One"].promo_eligible is False
        assert by_name["Returning One"].promo_code is None
