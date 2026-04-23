"""Integration tests for prospect/application matching endpoints.

Covers the SQL-level filters (year, exit statuses, existing_student_id)
applied by admin_find_matches and admin_auto_match.
"""
from __future__ import annotations

from datetime import date, datetime

import pytest

from models import PrimaryProspect, SummerApplication, SummerCourseConfig
from routers.primary_prospects import admin_auto_match, admin_find_matches


@pytest.fixture
def config(db_session):
    cfg = SummerCourseConfig(
        year=2026,
        title="Summer 2026",
        application_open_date=datetime(2026, 3, 1),
        application_close_date=datetime(2026, 6, 30),
        course_start_date=date(2026, 7, 5),
        course_end_date=date(2026, 8, 29),
        total_lessons=8,
        pricing_config={"base": 400},
        locations=[{"name": "MSA"}],
        available_grades=[{"value": "F1"}],
        time_slots=["10:00 - 11:30"],
        is_active=True,
    )
    db_session.add(cfg)
    db_session.commit()
    return cfg


def _make_app(db_session, config, *, ref, name, phone, status="Submitted"):
    app = SummerApplication(
        config_id=config.id,
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


def _make_prospect(db_session, *, name, phone_1=None, phone_2=None, year=2026):
    p = PrimaryProspect(
        year=year,
        source_branch="MAC",
        student_name=name,
        phone_1=phone_1,
        phone_2=phone_2,
    )
    db_session.add(p)
    db_session.commit()
    return p


class TestExitStateExclusion:
    def test_find_matches_skips_withdrawn_app(self, db_session, config):
        """A Withdrawn app with a perfect phone+name match must not appear as a candidate."""
        _make_app(db_session, config, ref="W", name="Chan Tai Man",
                  phone="12345678", status="Withdrawn")
        prospect = _make_prospect(db_session, name="Chan Tai Man", phone_1="12345678")

        result = admin_find_matches(prospect.id, db=db_session, _admin=None)
        assert result.matches == []

    def test_find_matches_skips_rejected_app(self, db_session, config):
        _make_app(db_session, config, ref="R", name="Chan Tai Man",
                  phone="12345678", status="Rejected")
        prospect = _make_prospect(db_session, name="Chan Tai Man", phone_1="12345678")

        result = admin_find_matches(prospect.id, db=db_session, _admin=None)
        assert result.matches == []

    def test_find_matches_keeps_live_app(self, db_session, config):
        """Sanity check: a live (Submitted) app with the same signal still surfaces."""
        app = _make_app(db_session, config, ref="S", name="Chan Tai Man",
                        phone="12345678", status="Submitted")
        prospect = _make_prospect(db_session, name="Chan Tai Man", phone_1="12345678")

        result = admin_find_matches(prospect.id, db=db_session, _admin=None)
        assert len(result.matches) == 1
        assert result.matches[0]["application_id"] == app.id

    def test_find_matches_keeps_waitlisted_app(self, db_session, config):
        """Waitlisted is still a live applicant — not an exit state."""
        app = _make_app(db_session, config, ref="WL", name="Chan Tai Man",
                        phone="12345678", status="Waitlisted")
        prospect = _make_prospect(db_session, name="Chan Tai Man", phone_1="12345678")

        result = admin_find_matches(prospect.id, db=db_session, _admin=None)
        assert len(result.matches) == 1
        assert result.matches[0]["application_id"] == app.id

    def test_auto_match_does_not_link_withdrawn_app(self, db_session, config):
        _make_app(db_session, config, ref="W", name="Chan Tai Man",
                  phone="12345678", status="Withdrawn")
        prospect = _make_prospect(db_session, name="Chan Tai Man", phone_1="12345678")

        result = admin_auto_match(year=2026, dry_run=False, db=db_session, _admin=None)
        assert result["matches"] == []
        assert result["skipped"] == []
        db_session.refresh(prospect)
        assert prospect.summer_application_id is None

    def test_auto_match_pass3_skips_withdrawn_app(self, db_session, config):
        """Name-only candidates (Pass 3) must also ignore exit-state apps."""
        _make_app(db_session, config, ref="W", name="Chan Tai Man",
                  phone="99999999", status="Withdrawn")
        # Different phone → only name could match.
        prospect = _make_prospect(db_session, name="Chan Tai Man", phone_1="11111111")

        result = admin_auto_match(year=2026, dry_run=True, db=db_session, _admin=None)
        # No phone bucket would have apps either, so skipped remains empty.
        assert result["matches"] == []
        assert result["skipped"] == []


class TestNormalizedPhoneMatching:
    def test_real_failure_case_auto_links(self, db_session, config):
        """+853 country code on app vs bare 8-digit on prospect.phone_2 should link."""
        app = _make_app(db_session, config, ref="X", name="Wong Tai Man Alex",
                        phone="+85398765432")
        prospect = _make_prospect(
            db_session,
            name="Alex Wong",
            phone_1="99999999",
            phone_2="98765432",
        )

        result = admin_auto_match(year=2026, dry_run=False, db=db_session, _admin=None)
        assert len(result["matches"]) == 1
        assert result["matches"][0]["application"]["id"] == app.id
        db_session.refresh(prospect)
        assert prospect.summer_application_id == app.id
