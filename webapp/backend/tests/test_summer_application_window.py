"""
Tests for the summer application window: how it is reported to the public form
and which parent-facing endpoints it closes.

Outside the window the entire parent-facing side of summer is shut. The form
refuses submissions, as it always has, and now the status page is shut too:
once the course has finished there is nothing left for a parent to look up or
amend. These tests pin both halves, plus the hint that points a parent who
arrives too late at the September intake instead.
"""
import pytest
from datetime import date, datetime

from models import (
    SummerCourseConfig,
    RegularCourseConfig,
    SummerApplication,
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
    """An active summer config whose window is open right now."""
    config = SummerCourseConfig(
        year=2026,
        title="Summer 2026",
        application_open_date=datetime(2020, 1, 1),
        application_close_date=datetime(2099, 12, 31),
        course_start_date=date(2026, 7, 5),
        course_end_date=date(2026, 8, 29),
        total_lessons=8,
        pricing_config={"base_fee": 3200},
        locations=[{"name": "華士古分校", "open_days": ["Monday"]}],
        available_grades=[{"value": "F1"}],
        time_slots=["10:00 - 11:30"],
        is_active=True,
    )
    db_session.add(config)
    db_session.commit()
    return config


@pytest.fixture
def regular_cfg(db_session):
    """An active regular config whose window is open right now."""
    config = RegularCourseConfig(
        year=2026,
        title="Regular Sep 2026",
        application_open_date=datetime(2020, 1, 1),
        application_close_date=datetime(2099, 12, 31),
        course_start_date=date(2026, 9, 1),
        locations=[{"name": "華士古分校", "open_days": ["Monday"]}],
        available_grades=[{"value": "F1"}],
        time_slots=["16:45 - 18:15"],
        pricing_config={"base_fee": 2400},
        is_active=True,
    )
    db_session.add(config)
    db_session.commit()
    return config


def _close_window(db_session, cfg):
    cfg.application_open_date = datetime(2020, 1, 1)
    cfg.application_close_date = datetime(2020, 12, 31)
    db_session.commit()


def _make_app(db_session, cfg, *, ref="SC2026-WIN1", phone="85299990000"):
    app = SummerApplication(
        config_id=cfg.id,
        reference_code=ref,
        student_name="Alice",
        grade="F1",
        contact_phone=phone,
        preferred_location="華士古分校",
        application_status="Submitted",
        sessions_per_week=1,
    )
    db_session.add(app)
    db_session.commit()
    return app


def _payload(name="Alice", phone="85288880000"):
    return {
        "student_name": name,
        "grade": "F1",
        "contact_phone": phone,
        "preferred_location": "華士古分校",
        "preference_1_day": "Monday",
        "preference_1_time": "10:00 - 11:30",
        "sessions_per_week": 1,
    }


# ---- What the public config reports ----

class TestPublicConfigWindow:
    def test_open_while_inside_the_window(self, client, cfg):
        resp = client.get("/api/summer/public/config")
        assert resp.status_code == 200
        assert resp.json()["application_window"] == "open"

    def test_before_when_it_has_not_opened_yet(self, client, cfg, db_session):
        cfg.application_open_date = datetime(2099, 1, 1)
        cfg.application_close_date = datetime(2099, 12, 31)
        db_session.commit()
        resp = client.get("/api/summer/public/config")
        # The config still ships. The closed pages need the branch list and the
        # course dates to say anything useful.
        assert resp.status_code == 200
        assert resp.json()["application_window"] == "before"

    def test_closed_once_the_window_has_passed(self, client, cfg, db_session):
        _close_window(db_session, cfg)
        resp = client.get("/api/summer/public/config")
        assert resp.status_code == 200
        assert resp.json()["application_window"] == "closed"


class TestRegularIntakeHint:
    def test_absent_while_summer_is_open(self, client, cfg, regular_cfg):
        # Summer has its own form to offer, so there is nothing to redirect to.
        resp = client.get("/api/summer/public/config")
        assert resp.json()["regular_intake"] is None

    def test_present_when_summer_is_shut_and_regular_is_open(
        self, client, db_session, cfg, regular_cfg
    ):
        _close_window(db_session, cfg)
        hint = client.get("/api/summer/public/config").json()["regular_intake"]
        assert hint is not None
        assert hint["year"] == 2026
        assert hint["application_close_date"].startswith("2099-12-31")

    def test_absent_when_regular_is_shut_too(self, client, db_session, cfg, regular_cfg):
        _close_window(db_session, cfg)
        _close_window(db_session, regular_cfg)
        assert client.get("/api/summer/public/config").json()["regular_intake"] is None

    def test_absent_when_there_is_no_regular_config(self, client, db_session, cfg):
        _close_window(db_session, cfg)
        assert client.get("/api/summer/public/config").json()["regular_intake"] is None


# ---- What the window closes ----

class TestSubmissionGate:
    def test_submit_allowed_while_open(self, client, cfg):
        resp = client.post("/api/summer/public/apply", json=_payload())
        assert resp.status_code == 200

    def test_submit_refused_once_closed(self, client, db_session, cfg):
        _close_window(db_session, cfg)
        resp = client.post("/api/summer/public/apply", json=_payload())
        assert resp.status_code == 400
        assert "not open" in resp.json()["detail"]


class TestStatusGate:
    def test_lookup_works_while_open(self, client, db_session, cfg):
        _make_app(db_session, cfg, ref="SC2026-WIN2", phone="85299990001")
        resp = client.get("/api/summer/public/status/SC2026-WIN2?phone=85299990001")
        assert resp.status_code == 200
        assert resp.json()["student_name"] == "Alice"

    def test_lookup_refused_once_closed(self, client, db_session, cfg):
        _make_app(db_session, cfg, ref="SC2026-WIN3", phone="85299990002")
        _close_window(db_session, cfg)
        resp = client.get("/api/summer/public/status/SC2026-WIN3?phone=85299990002")
        assert resp.status_code == 400
        assert "not open" in resp.json()["detail"]

    def test_self_edit_refused_once_closed(self, client, db_session, cfg):
        _make_app(db_session, cfg, ref="SC2026-WIN4", phone="85299990003")
        _close_window(db_session, cfg)
        resp = client.patch(
            "/api/summer/public/application/SC2026-WIN4?phone=85299990003",
            json={"school": "New School"},
        )
        assert resp.status_code == 400
        assert "not open" in resp.json()["detail"]

    def test_sibling_declare_refused_once_closed(self, client, db_session, cfg):
        _make_app(db_session, cfg, ref="SC2026-WIN5", phone="85299990004")
        _close_window(db_session, cfg)
        resp = client.post(
            "/api/summer/public/application/SC2026-WIN5/sibling?phone=85299990004",
            json={"name_en": "Bobby", "source_branch": "MCA"},
        )
        assert resp.status_code == 400
        assert "not open" in resp.json()["detail"]

    def test_buddy_change_refused_once_closed(self, client, db_session, cfg):
        _make_app(db_session, cfg, ref="SC2026-WIN6", phone="85299990005")
        _close_window(db_session, cfg)
        resp = client.patch(
            "/api/summer/public/application/SC2026-WIN6/buddy?phone=85299990005",
            json={"action": "create"},
        )
        assert resp.status_code == 400
        assert "not open" in resp.json()["detail"]
