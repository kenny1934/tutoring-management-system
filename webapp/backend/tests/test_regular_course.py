"""
Tests for the regular course (September intake) application system.

Covers: public config fetch, apply (window, duplicate, phone normalization,
reference code), status check, applicant self-edit (whitelist + audit + status
gate), admin config CRUD (single-active, clone, delete-active block), admin
application list/stats/PATCH, and the demand summary.
"""
import pytest
from datetime import date, datetime

from models import (
    Tutor,
    RegularCourseConfig,
    RegularApplication,
    RegularApplicationEdit,
)
from routers.regular_course import (
    _normalize_phone,
    _APPLICANT_EDITABLE_FIELDS,
)
from utils import rate_limiter


@pytest.fixture(autouse=True)
def _clear_rate_limits():
    """Reset the in-memory IP rate-limit counter so tests don't 429 each other."""
    rate_limiter._ip_request_counts.clear()
    yield
    rate_limiter._ip_request_counts.clear()


# ---- Fixtures ----

@pytest.fixture
def cfg(db_session):
    config = RegularCourseConfig(
        year=2026,
        title="Regular Sep 2026",
        application_open_date=datetime(2026, 1, 1),
        application_close_date=datetime(2027, 12, 31),
        course_start_date=date(2026, 9, 1),
        locations=[{
            "name": "華士古分校",
            "open_days": ["Monday", "Saturday"],
            "time_slots": {"Monday": ["16:45 - 18:15"], "Saturday": ["10:00 - 11:30"]},
        }],
        available_grades=[{"value": "F1"}, {"value": "F2"}],
        time_slots=["16:45 - 18:15", "10:00 - 11:30"],
        text_content={"contact_by_date": "2026-08-17"},
        pricing_config={"base_fee": 2400, "lessons_per_block": 6, "registration_fee": 100},
        is_active=True,
    )
    db_session.add(config)
    db_session.commit()
    return config


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


def _make_app(db_session, cfg, *, ref="RC2026-EDIT1", phone="85299990000",
              name="Alice", status="Submitted", location="華士古分校", grade="F1",
              p1=("Monday", "16:45 - 18:15"), p2=("Saturday", "10:00 - 11:30")):
    app = RegularApplication(
        config_id=cfg.id,
        reference_code=ref,
        student_name=name,
        grade=grade,
        contact_phone=phone,
        preferred_location=location,
        preference_1_day=p1[0] if p1 else None,
        preference_1_time=p1[1] if p1 else None,
        preference_2_day=p2[0] if p2 else None,
        preference_2_time=p2[1] if p2 else None,
        application_status=status,
    )
    db_session.add(app)
    db_session.commit()
    return app


def _payload(name, phone, **overrides):
    payload = {
        "student_name": name,
        "grade": "F1",
        "contact_phone": phone,
        "preferred_location": "華士古分校",
        "preference_1_day": "Monday",
        "preference_1_time": "16:45 - 18:15",
        "preference_2_day": "Saturday",
        "preference_2_time": "10:00 - 11:30",
    }
    payload.update(overrides)
    return payload


# ---- Public config ----

class TestPublicConfig:
    def test_404_when_no_active_config(self, client):
        resp = client.get("/api/regular/public/config")
        assert resp.status_code == 404

    def test_returns_active_config(self, client, cfg):
        resp = client.get("/api/regular/public/config")
        assert resp.status_code == 200
        data = resp.json()
        assert data["year"] == 2026
        assert data["title"] == "Regular Sep 2026"
        assert data["course_start_date"] == "2026-09-01"
        assert data["text_content"]["contact_by_date"] == "2026-08-17"
        assert data["pricing_config"] == {
            "base_fee": 2400, "lessons_per_block": 6, "registration_fee": 100,
        }


# ---- Apply ----

class TestApply:
    def test_submit_returns_rc_reference_code(self, client, cfg):
        resp = client.post("/api/regular/public/apply", json=_payload("Alice", "85288880000"))
        assert resp.status_code == 200
        assert resp.json()["reference_code"].startswith("RC2026-")

    def test_window_closed_blocks(self, client, db_session, cfg):
        cfg.application_open_date = datetime(2020, 1, 1)
        cfg.application_close_date = datetime(2020, 12, 31)
        db_session.commit()
        resp = client.post("/api/regular/public/apply", json=_payload("Alice", "85288880000"))
        assert resp.status_code == 400
        assert "not open" in resp.json()["detail"]

    def test_same_parent_different_kids_allowed(self, client, cfg):
        r1 = client.post("/api/regular/public/apply", json=_payload("Alice", "85288880000"))
        assert r1.status_code == 200
        r2 = client.post("/api/regular/public/apply", json=_payload("Bob", "85288880000"))
        assert r2.status_code == 200

    def test_same_kid_same_phone_rejected(self, client, cfg):
        r1 = client.post("/api/regular/public/apply", json=_payload("Alice", "85288880001"))
        assert r1.status_code == 200
        r2 = client.post("/api/regular/public/apply", json=_payload("Alice", "85288880001"))
        assert r2.status_code == 400

    def test_phone_format_variants_collapse(self, client, cfg):
        r1 = client.post("/api/regular/public/apply", json=_payload("Alice", "(853) 8888-0002"))
        assert r1.status_code == 200
        r2 = client.post("/api/regular/public/apply", json=_payload("Alice", "85388880002"))
        assert r2.status_code == 400

    def test_normalize_phone_helper(self):
        assert _normalize_phone("(853) 1234-5678") == "85312345678"
        assert _normalize_phone("+853 1234 5678") == "+85312345678"
        assert _normalize_phone(None) == ""


# ---- Status check ----

class TestStatusCheck:
    def test_found_with_correct_phone(self, client, db_session, cfg):
        _make_app(db_session, cfg, ref="RC2026-STAT1", phone="85299990000")
        resp = client.get("/api/regular/public/status/RC2026-STAT1?phone=85299990000")
        assert resp.status_code == 200
        data = resp.json()
        assert data["student_name"] == "Alice"
        assert data["application_status"] == "Submitted"
        assert data["preference_1_day"] == "Monday"

    def test_wrong_phone_404(self, client, db_session, cfg):
        _make_app(db_session, cfg, ref="RC2026-STAT2", phone="85299990001")
        resp = client.get("/api/regular/public/status/RC2026-STAT2?phone=00000000")
        assert resp.status_code == 404

    def test_reference_code_case_insensitive(self, client, db_session, cfg):
        _make_app(db_session, cfg, ref="RC2026-STAT3", phone="85299990002")
        resp = client.get("/api/regular/public/status/rc2026-stat3?phone=85299990002")
        assert resp.status_code == 200


# ---- Applicant self-edit ----

class TestSelfEdit:
    def test_happy_path_writes_audit(self, client, db_session, cfg):
        app = _make_app(db_session, cfg, ref="RC2026-EDIT2", phone="85299990010")
        resp = client.patch(
            "/api/regular/public/application/RC2026-EDIT2?phone=85299990010",
            json={"school": "Pui Ching", "preference_1_day": "Saturday",
                  "preference_1_time": "10:00 - 11:30"},
        )
        assert resp.status_code == 200
        db_session.refresh(app)
        assert app.school == "Pui Ching"
        assert app.preference_1_day == "Saturday"
        edits = db_session.query(RegularApplicationEdit).filter(
            RegularApplicationEdit.application_id == app.id
        ).all()
        assert len(edits) == 3
        assert all(e.edited_via == "applicant" for e in edits)
        assert all(e.edited_by is None for e in edits)

    def test_whitelist_drops_unknown_fields(self, client, db_session, cfg):
        app = _make_app(db_session, cfg, ref="RC2026-EDIT3", phone="85299990011")
        resp = client.patch(
            "/api/regular/public/application/RC2026-EDIT3?phone=85299990011",
            json={"school": "New School", "student_name": "Hacker",
                  "application_status": "Enrolled"},
        )
        assert resp.status_code == 200
        db_session.refresh(app)
        assert app.school == "New School"
        assert app.student_name == "Alice"  # identity not applicant-editable
        assert app.application_status == "Submitted"

    def test_blocked_once_under_review(self, client, db_session, cfg):
        _make_app(db_session, cfg, ref="RC2026-EDIT4", phone="85299990012",
                  status="Under Review")
        resp = client.patch(
            "/api/regular/public/application/RC2026-EDIT4?phone=85299990012",
            json={"school": "X"},
        )
        assert resp.status_code == 409

    def test_wrong_phone_404(self, client, db_session, cfg):
        _make_app(db_session, cfg, ref="RC2026-EDIT5", phone="85299990013")
        resp = client.patch(
            "/api/regular/public/application/RC2026-EDIT5?phone=99999999",
            json={"school": "X"},
        )
        assert resp.status_code == 404

    def test_editable_fields_have_no_identity_or_status(self):
        assert "student_name" not in _APPLICANT_EDITABLE_FIELDS
        assert "contact_phone" not in _APPLICANT_EDITABLE_FIELDS
        assert "application_status" not in _APPLICANT_EDITABLE_FIELDS


# ---- Admin config CRUD ----

class TestAdminConfigs:
    def test_create_and_list(self, db_session, cfg):
        from routers.regular_course import list_configs, create_config
        from schemas import RegularCourseConfigCreate
        data = RegularCourseConfigCreate(
            year=2027,
            title="Regular Sep 2027",
            application_open_date=datetime(2027, 8, 1),
            application_close_date=datetime(2027, 9, 30),
            course_start_date=date(2027, 9, 1),
            locations=[], available_grades=[], time_slots=[],
        )
        created = create_config(data=data, _admin=None, db=db_session)
        assert created.year == 2027
        assert created.is_active is False
        configs = list_configs(_admin=None, db=db_session)
        assert [c.year for c in configs] == [2027, 2026]

    def test_duplicate_year_blocked(self, db_session, cfg):
        from fastapi import HTTPException
        from routers.regular_course import create_config
        from schemas import RegularCourseConfigCreate
        data = RegularCourseConfigCreate(
            year=2026, title="Dup",
            application_open_date=datetime(2026, 8, 1),
            application_close_date=datetime(2026, 9, 30),
            course_start_date=date(2026, 9, 1),
            locations=[], available_grades=[], time_slots=[],
        )
        with pytest.raises(HTTPException) as exc:
            create_config(data=data, _admin=None, db=db_session)
        assert exc.value.status_code == 400

    def test_activation_deactivates_others(self, db_session, cfg):
        from routers.regular_course import create_config, update_config
        from schemas import RegularCourseConfigCreate, RegularCourseConfigUpdate
        other = create_config(
            data=RegularCourseConfigCreate(
                year=2027, title="Regular Sep 2027",
                application_open_date=datetime(2027, 8, 1),
                application_close_date=datetime(2027, 9, 30),
                course_start_date=date(2027, 9, 1),
                locations=[], available_grades=[], time_slots=[],
            ),
            _admin=None, db=db_session,
        )
        update_config(
            config_id=other.id,
            data=RegularCourseConfigUpdate(is_active=True),
            _admin=None, db=db_session,
        )
        db_session.refresh(cfg)
        assert cfg.is_active is False

    def test_delete_active_blocked(self, db_session, cfg):
        from fastapi import HTTPException
        from routers.regular_course import delete_config
        with pytest.raises(HTTPException) as exc:
            delete_config(config_id=cfg.id, _admin=None, db=db_session)
        assert exc.value.status_code == 400

    def test_clone_shifts_dates(self, db_session, cfg):
        from routers.regular_course import clone_config
        clone = clone_config(config_id=cfg.id, target_year=2027, _admin=None, db=db_session)
        assert clone.year == 2027
        assert clone.course_start_date == date(2027, 9, 1)
        assert clone.is_active is False
        assert "2027" in clone.title


# ---- Admin applications ----

class TestAdminApplications:
    def test_status_change_writes_audit_and_reviewer(self, db_session, cfg, admin):
        from routers.regular_course import update_application
        from schemas import RegularApplicationUpdate
        app = _make_app(db_session, cfg, ref="RC2026-ADM1", phone="85299991000")
        result = update_application(
            app_id=app.id,
            data=RegularApplicationUpdate(application_status="Under Review"),
            admin=admin, db=db_session,
        )
        assert result.application_status == "Under Review"
        assert result.reviewed_by == "Admin"
        audit = db_session.query(RegularApplicationEdit).filter(
            RegularApplicationEdit.application_id == app.id,
            RegularApplicationEdit.field_name == "application_status",
        ).first()
        assert audit is not None
        assert audit.old_value == "Submitted"
        assert audit.new_value == "Under Review"
        assert audit.edited_via == "admin"

    def test_detail_edit_audited_admin_notes_direct(self, db_session, cfg, admin):
        from routers.regular_course import update_application
        from schemas import RegularApplicationUpdate
        app = _make_app(db_session, cfg, ref="RC2026-ADM2", phone="85299991001")
        update_application(
            app_id=app.id,
            data=RegularApplicationUpdate(student_name="Alice Chan", admin_notes="called parent"),
            admin=admin, db=db_session,
        )
        db_session.refresh(app)
        assert app.student_name == "Alice Chan"
        assert app.admin_notes == "called parent"
        edits = db_session.query(RegularApplicationEdit).filter(
            RegularApplicationEdit.application_id == app.id
        ).all()
        assert [e.field_name for e in edits] == ["student_name"]

    def test_list_filters_and_published(self, db_session, cfg, admin):
        from routers.regular_course import list_applications
        _make_app(db_session, cfg, ref="RC2026-L1", phone="85299991002", name="A", grade="F1")
        _make_app(db_session, cfg, ref="RC2026-L2", phone="85299991003", name="B", grade="F2")
        all_apps = list_applications(
            config_id=cfg.id, application_status=None, grade=None, location=None,
            search=None, published=None, _admin=None, db=db_session,
        )
        assert len(all_apps) == 2
        assert all(a.published_enrollment_id is None for a in all_apps)
        f2_only = list_applications(
            config_id=cfg.id, application_status=None, grade="F2", location=None,
            search=None, published=None, _admin=None, db=db_session,
        )
        assert [a.student_name for a in f2_only] == ["B"]
        unpublished = list_applications(
            config_id=cfg.id, application_status=None, grade=None, location=None,
            search=None, published="unpublished", _admin=None, db=db_session,
        )
        assert len(unpublished) == 2
        published = list_applications(
            config_id=cfg.id, application_status=None, grade=None, location=None,
            search=None, published="published", _admin=None, db=db_session,
        )
        assert published == []

    def test_search_by_name_and_ref(self, db_session, cfg):
        from routers.regular_course import list_applications
        _make_app(db_session, cfg, ref="RC2026-S1", phone="85299991004", name="Carol Wong")
        by_name = list_applications(
            config_id=cfg.id, application_status=None, grade=None, location=None,
            search="carol", published=None, _admin=None, db=db_session,
        )
        assert len(by_name) == 1
        by_ref = list_applications(
            config_id=cfg.id, application_status=None, grade=None, location=None,
            search="RC2026-S1", published=None, _admin=None, db=db_session,
        )
        assert len(by_ref) == 1

    def test_stats(self, db_session, cfg):
        from routers.regular_course import get_application_stats
        _make_app(db_session, cfg, ref="RC2026-T1", phone="85299991005", name="A", grade="F1")
        _make_app(db_session, cfg, ref="RC2026-T2", phone="85299991006", name="B", grade="F2",
                  status="Under Review")
        stats = get_application_stats(
            config_id=cfg.id, application_status=None, grade=None, location=None,
            search=None, published=None, _admin=None, db=db_session,
        )
        assert stats.total == 2
        assert stats.by_status == {"Submitted": 1, "Under Review": 1}
        assert stats.by_grade == {"F1": 1, "F2": 1}


# ---- Demand summary ----

class TestDemand:
    def test_first_vs_backup_counting(self, db_session, cfg):
        from routers.regular_course import get_demand
        # Two apps first-choose Monday 16:45; one backs it up.
        _make_app(db_session, cfg, ref="RC2026-D1", phone="85299992000", name="A",
                  p1=("Monday", "16:45 - 18:15"), p2=("Saturday", "10:00 - 11:30"))
        _make_app(db_session, cfg, ref="RC2026-D2", phone="85299992001", name="B", grade="F2",
                  p1=("Monday", "16:45 - 18:15"), p2=None)
        _make_app(db_session, cfg, ref="RC2026-D3", phone="85299992002", name="C",
                  p1=("Saturday", "10:00 - 11:30"), p2=("Monday", "16:45 - 18:15"))
        result = get_demand(config_id=cfg.id, location="華士古分校", _admin=None, db=db_session)
        cells = {(c.day, c.time_slot): c for c in result.cells}
        mon = cells[("Monday", "16:45 - 18:15")]
        assert mon.total_first_pref == 2
        assert mon.total_second_pref == 1
        assert mon.by_grade_stream_first == {"F1": 1, "F2": 1}
        sat = cells[("Saturday", "10:00 - 11:30")]
        assert sat.total_first_pref == 1
        assert sat.total_second_pref == 1

    def test_withdrawn_and_rejected_excluded(self, db_session, cfg):
        from routers.regular_course import get_demand
        _make_app(db_session, cfg, ref="RC2026-D4", phone="85299992003", name="A",
                  status="Withdrawn")
        _make_app(db_session, cfg, ref="RC2026-D5", phone="85299992004", name="B",
                  status="Rejected")
        result = get_demand(config_id=cfg.id, location="華士古分校", _admin=None, db=db_session)
        assert result.cells == []
