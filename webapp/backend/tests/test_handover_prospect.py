"""
Tests for the P6 handover lookup that feeds the student profile card and the
first-lesson banner on the session surfaces.

A prospect reaches a student record through whichever application they actually
submitted. Plenty came through summer and stayed on for the regular year, but
plenty more skipped summer and only applied when the regular course opened, so
both routes have to resolve. When a student is somehow reachable both ways, the
summer link wins so that what a tutor already sees on screen does not change.
"""
import pytest
from datetime import date, datetime

from models import (
    Student,
    PrimaryProspect,
    SummerApplication,
    SummerCourseConfig,
    RegularApplication,
    RegularCourseConfig,
)
from utils.query_helpers import get_handover_prospect


@pytest.fixture
def student(db_session):
    s = Student(student_name="Lewis Leong", grade="F1", home_location="MSA")
    db_session.add(s)
    db_session.commit()
    return s


@pytest.fixture
def summer_config(db_session):
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
def regular_config(db_session):
    cfg = RegularCourseConfig(
        year=2026,
        title="Regular Sep 2026",
        application_open_date=datetime(2026, 8, 3),
        application_close_date=datetime(2026, 9, 30),
        course_start_date=date(2026, 9, 1),
        locations=[{"name": "MSA", "open_days": ["Tuesday"]}],
        available_grades=[{"value": "F1"}],
        time_slots=["16:45 - 18:15"],
        is_active=True,
    )
    db_session.add(cfg)
    db_session.commit()
    return cfg


def make_summer_app(db_session, config, student_id, ref="SC2026-T0001"):
    a = SummerApplication(
        config_id=config.id,
        reference_code=ref,
        student_name="Lewis Leong",
        grade="F1",
        contact_phone="11111111",
        application_status="Paid",
        sessions_per_week=1,
        lessons_paid=8,
        existing_student_id=student_id,
    )
    db_session.add(a)
    db_session.commit()
    return a


def make_regular_app(db_session, config, student_id, ref="RC2026-P0001"):
    a = RegularApplication(
        config_id=config.id,
        reference_code=ref,
        student_name="Lewis Leong",
        grade="F1",
        contact_phone="11111111",
        preferred_location="MSA",
        preference_1_day="Tuesday",
        preference_1_time="16:45 - 18:15",
        application_status="Fee Sent",
        existing_student_id=student_id,
    )
    db_session.add(a)
    db_session.commit()
    return a


def make_prospect(db_session, name, branch="MCP", **links):
    p = PrimaryProspect(
        year=2026,
        source_branch=branch,
        student_name=name,
        grade="P6",
        tutor_name="Ms Jenny Kuok",
        tutor_remark="Quiet at first, opens up later.",
        **links,
    )
    db_session.add(p)
    db_session.commit()
    return p


class TestHandoverProspectLookup:
    def test_no_prospect_returns_none(self, db_session, student):
        assert get_handover_prospect(db_session, student.id) is None

    def test_summer_route_resolves(self, db_session, student, summer_config):
        app = make_summer_app(db_session, summer_config, student.id)
        p = make_prospect(db_session, "Summer Kid", summer_application_id=app.id)
        assert get_handover_prospect(db_session, student.id).id == p.id

    def test_regular_route_resolves_when_summer_was_skipped(
        self, db_session, student, regular_config
    ):
        """The case this lookup was widened for: no summer application at all."""
        app = make_regular_app(db_session, regular_config, student.id)
        p = make_prospect(db_session, "Regular Only Kid", regular_application_id=app.id)
        assert p.summer_application_id is None
        assert get_handover_prospect(db_session, student.id).id == p.id

    def test_summer_wins_when_a_prospect_took_both_routes(
        self, db_session, student, summer_config, regular_config
    ):
        s_app = make_summer_app(db_session, summer_config, student.id)
        r_app = make_regular_app(db_session, regular_config, student.id)
        p = make_prospect(
            db_session,
            "Stayed On Kid",
            summer_application_id=s_app.id,
            regular_application_id=r_app.id,
        )
        assert get_handover_prospect(db_session, student.id).id == p.id

    def test_summer_wins_when_two_prospects_point_at_one_student(
        self, db_session, student, summer_config, regular_config
    ):
        """Mis-linked data exists in production, so the tie-break must be stable."""
        s_app = make_summer_app(db_session, summer_config, student.id)
        r_app = make_regular_app(db_session, regular_config, student.id)
        summer_prospect = make_prospect(
            db_session, "Right Kid", summer_application_id=s_app.id
        )
        make_prospect(
            db_session, "Wrong Kid", branch="MAC", regular_application_id=r_app.id
        )
        assert get_handover_prospect(db_session, student.id).id == summer_prospect.id

    def test_a_prospect_on_an_unlinked_application_reaches_nobody(
        self, db_session, student, regular_config
    ):
        """An application with no student link must not leak onto another student."""
        app = make_regular_app(db_session, regular_config, None)
        make_prospect(db_session, "Unlinked Kid", regular_application_id=app.id)
        assert get_handover_prospect(db_session, student.id) is None
