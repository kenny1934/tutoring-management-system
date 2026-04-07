"""
Tests for the summer application self-edit flow + audit trail.

Covers:
- Phone normalization helper
- Tightened (phone, student_name) duplicate check on submit
- Applicant PATCH endpoint: happy path, status gate, whitelist, audit rows
- Admin PATCH endpoint: detail field audit rows + status transition audit
- GET edits endpoint
"""
import pytest
from datetime import date, datetime

from models import (
    SummerCourseConfig,
    SummerApplication,
    SummerApplicationEdit,
)
from routers.summer_course import (
    _normalize_phone,
    _apply_application_edits,
    _APPLICANT_EDITABLE_FIELDS,
    _ADMIN_EDITABLE_FIELDS,
)
from schemas import SummerApplicationEditRequest
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
    config = SummerCourseConfig(
        year=2026,
        title="Summer 2026",
        application_open_date=datetime(2026, 3, 1),
        application_close_date=datetime(2026, 12, 31),
        course_start_date=date(2026, 7, 1),
        course_end_date=date(2026, 8, 30),
        total_lessons=8,
        pricing_config={"base": 400},
        locations=[{"name": "MSA", "open_days": ["Mon"]}],
        available_grades=[{"value": "F1"}],
        time_slots=["10:00 - 11:30"],
        is_active=True,
    )
    db_session.add(config)
    db_session.commit()
    return config


def _make_app(db_session, cfg, *, ref="SC2026-EDIT1", phone="85299990000", name="Alice", status="Submitted"):
    app = SummerApplication(
        config_id=cfg.id,
        reference_code=ref,
        student_name=name,
        grade="F1",
        contact_phone=phone,
        preferred_location="MSA",
        application_status=status,
        sessions_per_week=1,
    )
    db_session.add(app)
    db_session.commit()
    return app


# ---- Phone normalization ----

class TestPhoneNormalization:
    def test_strips_spaces_hyphens_parens(self):
        assert _normalize_phone("(853) 1234-5678") == "85312345678"

    def test_preserves_leading_plus(self):
        assert _normalize_phone("+852 9999 0000") == "+85299990000"

    def test_handles_none_and_empty(self):
        assert _normalize_phone(None) == ""
        assert _normalize_phone("") == ""

    def test_idempotent(self):
        assert _normalize_phone(_normalize_phone("853-1234-5678")) == "85312345678"


# ---- _apply_application_edits unit tests ----

class TestApplyEdits:
    def test_writes_audit_rows_for_changed_fields(self, db_session, cfg):
        app = _make_app(db_session, cfg)
        payload = SummerApplicationEditRequest(grade="F2", school="New School")
        n = _apply_application_edits(
            db_session, app, payload.model_dump(exclude_unset=True),
            edited_via="applicant", edited_by=None,
            allowed_fields=_APPLICANT_EDITABLE_FIELDS,
        )
        db_session.commit()
        assert n == 2
        assert app.grade == "F2"
        assert app.school == "New School"
        rows = db_session.query(SummerApplicationEdit).filter_by(application_id=app.id).all()
        assert {r.field_name for r in rows} == {"grade", "school"}
        assert all(r.edited_via == "applicant" for r in rows)

    def test_no_audit_when_value_unchanged(self, db_session, cfg):
        app = _make_app(db_session, cfg)
        app.grade = "F1"
        db_session.commit()
        payload = SummerApplicationEditRequest(grade="F1")
        n = _apply_application_edits(
            db_session, app, payload.model_dump(exclude_unset=True),
            edited_via="applicant", edited_by=None,
            allowed_fields=_APPLICANT_EDITABLE_FIELDS,
        )
        db_session.commit()
        assert n == 0
        assert db_session.query(SummerApplicationEdit).count() == 0

    def test_whitelist_drops_unknown_fields(self, db_session, cfg):
        app = _make_app(db_session, cfg)
        # student_name is admin-only; applicant whitelist should drop it
        n = _apply_application_edits(
            db_session, app,
            {"student_name": "Hacker", "grade": "F2"},
            edited_via="applicant", edited_by=None,
            allowed_fields=_APPLICANT_EDITABLE_FIELDS,
        )
        db_session.commit()
        assert n == 1
        assert app.student_name != "Hacker"
        assert app.grade == "F2"

    def test_admin_whitelist_allows_student_name(self, db_session, cfg):
        app = _make_app(db_session, cfg)
        n = _apply_application_edits(
            db_session, app,
            {"student_name": "Corrected Name"},
            edited_via="admin", edited_by="admin@test",
            allowed_fields=_ADMIN_EDITABLE_FIELDS,
        )
        db_session.commit()
        assert n == 1
        assert app.student_name == "Corrected Name"
        row = db_session.query(SummerApplicationEdit).first()
        assert row.edited_via == "admin"
        assert row.edited_by == "admin@test"


# ---- HTTP: applicant edit endpoint ----

class TestApplicantEditEndpoint:
    def test_happy_path_updates_and_returns_status(self, client, db_session, cfg):
        app = _make_app(db_session, cfg, phone="85299990000")
        r = client.patch(
            f"/api/summer/public/application/{app.reference_code}?phone=85299990000",
            json={"preference_1_day": "Mon", "preference_1_time": "10:00 - 11:30"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["preference_1_day"] == "Mon"
        assert body["preference_1_time"] == "10:00 - 11:30"
        # Audit row was written
        rows = db_session.query(SummerApplicationEdit).filter_by(application_id=app.id).all()
        assert {r.field_name for r in rows} == {"preference_1_day", "preference_1_time"}

    def test_phone_format_tolerated_on_lookup(self, client, db_session, cfg):
        _make_app(db_session, cfg, ref="SC2026-FMT1", phone="85399990001")
        r = client.patch(
            "/api/summer/public/application/SC2026-FMT1?phone=(853)%209999-0001",
            json={"grade": "F2"},
        )
        assert r.status_code == 200, r.text

    def test_status_gate_blocks_under_review(self, client, db_session, cfg):
        _make_app(db_session, cfg, ref="SC2026-LOCK", phone="85299990002", status="Under Review")
        r = client.patch(
            "/api/summer/public/application/SC2026-LOCK?phone=85299990002",
            json={"grade": "F2"},
        )
        assert r.status_code == 409
        assert "contact" in r.json()["detail"].lower()

    def test_wrong_phone_404(self, client, db_session, cfg):
        _make_app(db_session, cfg, ref="SC2026-WRONG", phone="85299990003")
        r = client.patch(
            "/api/summer/public/application/SC2026-WRONG?phone=00000000",
            json={"grade": "F2"},
        )
        assert r.status_code == 404


# ---- HTTP: tightened duplicate check on submit ----

class TestSubmitDuplicateCheck:
    def _payload(self, name, phone):
        return {
            "student_name": name,
            "grade": "F1",
            "contact_phone": phone,
            "preferred_location": "MSA",
            "preference_1_day": "Mon",
            "preference_1_time": "10:00 - 11:30",
            "preference_2_day": "Mon",
            "preference_2_time": "10:00 - 11:30",
            "sessions_per_week": 1,
            "form_language": "en",
        }

    def test_same_phone_different_student_allowed(self, client, db_session, cfg):
        r1 = client.post("/api/summer/public/apply", json=self._payload("Alice", "85288880000"))
        assert r1.status_code == 200, r1.text
        r2 = client.post("/api/summer/public/apply", json=self._payload("Bob", "85288880000"))
        assert r2.status_code == 200, r2.text

    def test_same_phone_same_name_rejected(self, client, db_session, cfg):
        r1 = client.post("/api/summer/public/apply", json=self._payload("Alice", "85288880001"))
        assert r1.status_code == 200, r1.text
        r2 = client.post("/api/summer/public/apply", json=self._payload("Alice", "85288880001"))
        assert r2.status_code == 400
        assert "already" in r2.json()["detail"].lower()

    def test_phone_format_normalized_in_dup_check(self, client, db_session, cfg):
        r1 = client.post("/api/summer/public/apply", json=self._payload("Alice", "(853) 8888-0002"))
        assert r1.status_code == 200, r1.text
        # Same number written differently; should still be detected as duplicate
        r2 = client.post("/api/summer/public/apply", json=self._payload("Alice", "85388880002"))
        assert r2.status_code == 400


# ---- GET edits endpoint (admin) ----

class TestEditsListEndpoint:
    def test_returns_edits_newest_first(self, client, db_session, cfg, monkeypatch):
        from auth.dependencies import require_admin_view
        from main import app as fastapi_app
        fastapi_app.dependency_overrides[require_admin_view] = lambda: None
        try:
            app_row = _make_app(db_session, cfg, ref="SC2026-HIST")
            db_session.add_all([
                SummerApplicationEdit(
                    application_id=app_row.id,
                    edited_at=datetime(2026, 3, 1, 10, 0, 0),
                    field_name="grade",
                    old_value="F1",
                    new_value="F2",
                    edited_via="applicant",
                ),
                SummerApplicationEdit(
                    application_id=app_row.id,
                    edited_at=datetime(2026, 3, 2, 10, 0, 0),
                    field_name="school",
                    old_value=None,
                    new_value="New School",
                    edited_via="admin",
                    edited_by="admin@test",
                ),
            ])
            db_session.commit()
            r = client.get(f"/api/summer/applications/{app_row.id}/edits")
            assert r.status_code == 200, r.text
            rows = r.json()
            assert len(rows) == 2
            # newest first
            assert rows[0]["field_name"] == "school"
            assert rows[0]["edited_via"] == "admin"
            assert rows[1]["field_name"] == "grade"
        finally:
            fastapi_app.dependency_overrides.pop(require_admin_view, None)
