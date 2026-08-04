"""Feature 2 tests: P6 prospect journey into the regular intake.

Covers the regular-side matching cascade (shared student, phone 1:1, name
review), attended_summer computation, link/unlink from the application, and the
per-branch conversion counts.
"""
from __future__ import annotations

from datetime import date, datetime

import pytest
from fastapi import HTTPException

from models import (
    PrimaryProspect,
    RegularApplication,
    RegularApplicationEdit,
    RegularCourseConfig,
    SummerApplication,
    SummerCourseConfig,
    Student,
    Tutor,
    Enrollment,
)
from schemas import RegularProspectLinkRequest, PrimaryProspectAdminUpdate
from routers.primary_prospects import (
    admin_find_regular_matches,
    admin_regular_auto_match,
    admin_list_prospects,
    admin_prospect_stats,
    admin_update_prospect,
)
from routers.regular_course import (
    link_application_prospect,
    get_application,
    get_conversion,
    suggest_prospects_for_application,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def admin(db_session):
    t = Tutor(user_email="admin@test.com", tutor_name="Admin", role="Admin", is_active_tutor=True)
    db_session.add(t)
    db_session.commit()
    return t


@pytest.fixture
def tutor(db_session):
    t = Tutor(user_email="tutor@test.com", tutor_name="Tutor", role="Tutor", is_active_tutor=True)
    db_session.add(t)
    db_session.commit()
    return t


@pytest.fixture
def reg_cfg(db_session):
    cfg = RegularCourseConfig(
        year=2026,
        title="Regular Sep 2026",
        application_open_date=datetime(2026, 8, 3),
        application_close_date=datetime(2026, 9, 30),
        course_start_date=date(2026, 9, 1),
        locations=[{"name": "華士古分校", "open_days": ["Tuesday"]}],
        available_grades=[{"value": "F1"}],
        time_slots=["16:45 - 18:15"],
        is_active=True,
    )
    db_session.add(cfg)
    db_session.commit()
    return cfg


@pytest.fixture
def sum_cfg(db_session):
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


_SEQ = iter(range(1, 9999))


def _student(db_session, name="Chan Tai Man"):
    s = Student(student_name=name, grade="F1", home_location="MSA")
    db_session.add(s)
    db_session.commit()
    return s


def _reg_app(db_session, reg_cfg, *, name="Chan Tai Man", phone="85212340000",
             student_id=None, status="Submitted"):
    a = RegularApplication(
        config_id=reg_cfg.id,
        reference_code=f"RC2026-P{next(_SEQ)}",
        student_name=name,
        grade="F1",
        contact_phone=phone,
        preferred_location="華士古分校",
        application_status=status,
        existing_student_id=student_id,
    )
    db_session.add(a)
    db_session.commit()
    return a


def _sum_app(db_session, sum_cfg, *, name="Chan Tai Man", phone="85212340000",
             student_id=None, status="Enrolled"):
    a = SummerApplication(
        config_id=sum_cfg.id,
        reference_code=f"SC2026-P{next(_SEQ)}",
        student_name=name,
        grade="F1",
        contact_phone=phone,
        preferred_location="MSA",
        application_status=status,
        sessions_per_week=1,
        existing_student_id=student_id,
    )
    db_session.add(a)
    db_session.commit()
    return a


def _prospect(db_session, *, name="Chan Tai Man", branch="MAC", phone_1="85212340000",
              summer_app_id=None, regular_app_id=None, wants_summer="Considering",
              wants_regular="Considering", year=2026, tutor_name=None, school=None,
              grade=None, preferred_branches=None, outreach_status="Not Started"):
    p = PrimaryProspect(
        year=year,
        source_branch=branch,
        student_name=name,
        phone_1=phone_1,
        summer_application_id=summer_app_id,
        regular_application_id=regular_app_id,
        wants_summer=wants_summer,
        wants_regular=wants_regular,
        tutor_name=tutor_name,
        school=school,
        grade=grade,
        preferred_branches=preferred_branches or [],
        outreach_status=outreach_status,
    )
    db_session.add(p)
    db_session.commit()
    return p


def _enrollment(db_session, tutor, *, student_id, summer_app_id=None, regular_app_id=None,
                etype="Summer", location=None):
    e = Enrollment(
        student_id=student_id,
        tutor_id=tutor.id,
        enrollment_type=etype,
        summer_application_id=summer_app_id,
        regular_application_id=regular_app_id,
        location=location,
    )
    db_session.add(e)
    db_session.commit()
    return e


# Called outside FastAPI, Query(None) defaults would otherwise reach the
# query as sentinel objects — so both helpers pass every filter explicitly.

def _stats(db_session, **overrides):
    kwargs = dict(
        year=2026, status=None, outreach_status=None, wants_summer=None,
        wants_regular=None, summer_state=None, regular_state=None,
        has_wechat=None, search=None,
    )
    kwargs.update(overrides)
    return admin_prospect_stats(db=db_session, _admin=None, **kwargs)


def _admin_list(db_session, **overrides):
    kwargs = dict(
        year=2026, branch=None, status=None, outreach_status=None,
        wants_summer=None, wants_regular=None, summer_state=None,
        regular_state=None, has_wechat=None, search=None,
    )
    kwargs.update(overrides)
    return admin_list_prospects(db=db_session, _admin=None, **kwargs)


# ---------------------------------------------------------------------------
# Matching cascade
# ---------------------------------------------------------------------------

class TestRegularMatching:
    def test_exact_match_via_shared_student(self, db_session, reg_cfg, sum_cfg):
        student = _student(db_session)
        sa = _sum_app(db_session, sum_cfg, student_id=student.id, phone="85200000001")
        ra = _reg_app(db_session, reg_cfg, student_id=student.id, phone="85299999999")
        # Different phones — only the shared student links them.
        p = _prospect(db_session, summer_app_id=sa.id, phone_1="85200000001")
        result = admin_find_regular_matches(p.id, db=db_session, _admin=None)
        top = result.matches[0]
        assert top["application_id"] == ra.id
        assert top["match_type"] == "student"

    def test_auto_match_links_shared_student_cohort(self, db_session, reg_cfg, sum_cfg):
        student = _student(db_session)
        sa = _sum_app(db_session, sum_cfg, student_id=student.id, phone="85200000002")
        ra = _reg_app(db_session, reg_cfg, student_id=student.id, phone="85288888888")
        p = _prospect(db_session, summer_app_id=sa.id, phone_1="85200000002")
        result = admin_regular_auto_match(year=2026, dry_run=False, db=db_session, _admin=None)
        assert len(result["matches"]) == 1
        db_session.refresh(p)
        assert p.regular_application_id == ra.id
        # Applied is derived from the link now; the manual relationship
        # stage is left alone.
        assert p.status == "New"

    def test_phone_1to1_auto_links(self, db_session, reg_cfg):
        ra = _reg_app(db_session, reg_cfg, phone="85277776666")
        p = _prospect(db_session, phone_1="85277776666")
        result = admin_regular_auto_match(year=2026, dry_run=False, db=db_session, _admin=None)
        assert len(result["matches"]) == 1
        db_session.refresh(p)
        assert p.regular_application_id == ra.id

    def test_name_candidate_surfaced_not_linked(self, db_session, reg_cfg):
        _reg_app(db_session, reg_cfg, name="Chan Tai Man", phone="85200000000")
        # No shared student, mismatched phone — only the name is close.
        p = _prospect(db_session, name="Chan Tai Man", phone_1="85211112222")
        result = admin_regular_auto_match(year=2026, dry_run=False, db=db_session, _admin=None)
        assert result["matches"] == []
        reasons = {s["reason"] for s in result["skipped"]}
        assert "name_similarity" in reasons
        db_session.refresh(p)
        assert p.regular_application_id is None


# ---------------------------------------------------------------------------
# attended_summer + journey enrichment
# ---------------------------------------------------------------------------

class TestJourney:
    def test_attended_true_for_published_non_withdrawn(self, db_session, reg_cfg, sum_cfg, tutor):
        student = _student(db_session)
        sa = _sum_app(db_session, sum_cfg, student_id=student.id, status="Enrolled")
        _enrollment(db_session, tutor, student_id=student.id, summer_app_id=sa.id)
        ra = _reg_app(db_session, reg_cfg, student_id=student.id)
        _prospect(db_session, summer_app_id=sa.id, regular_app_id=ra.id, branch="MAC")
        resp = get_application(app_id=ra.id, _admin=None, db=db_session)
        assert resp.prospect_journey is not None
        assert resp.prospect_journey.source_branch == "MAC"
        assert resp.prospect_journey.attended_summer is True

    def test_attended_false_when_withdrawn(self, db_session, reg_cfg, sum_cfg, tutor):
        student = _student(db_session)
        sa = _sum_app(db_session, sum_cfg, student_id=student.id, status="Withdrawn")
        _enrollment(db_session, tutor, student_id=student.id, summer_app_id=sa.id)
        ra = _reg_app(db_session, reg_cfg, student_id=student.id)
        _prospect(db_session, summer_app_id=sa.id, regular_app_id=ra.id)
        resp = get_application(app_id=ra.id, _admin=None, db=db_session)
        assert resp.prospect_journey.attended_summer is False

    def test_attended_false_with_no_enrollment(self, db_session, reg_cfg, sum_cfg):
        student = _student(db_session)
        sa = _sum_app(db_session, sum_cfg, student_id=student.id, status="Enrolled")
        ra = _reg_app(db_session, reg_cfg, student_id=student.id)
        _prospect(db_session, summer_app_id=sa.id, regular_app_id=ra.id)
        resp = get_application(app_id=ra.id, _admin=None, db=db_session)
        assert resp.prospect_journey.attended_summer is False

    def test_no_journey_when_no_prospect(self, db_session, reg_cfg):
        ra = _reg_app(db_session, reg_cfg)
        resp = get_application(app_id=ra.id, _admin=None, db=db_session)
        assert resp.prospect_journey is None


# ---------------------------------------------------------------------------
# Link / unlink from the regular application
# ---------------------------------------------------------------------------

class TestLinkFromApplication:
    def test_link_writes_prospect_and_audit(self, db_session, reg_cfg, admin):
        ra = _reg_app(db_session, reg_cfg)
        p = _prospect(db_session)
        link_application_prospect(
            app_id=ra.id, req=RegularProspectLinkRequest(prospect_id=p.id),
            admin=admin, db=db_session,
        )
        db_session.refresh(p)
        assert p.regular_application_id == ra.id
        audit = (
            db_session.query(RegularApplicationEdit)
            .filter(RegularApplicationEdit.application_id == ra.id,
                    RegularApplicationEdit.field_name == "prospect_link")
            .one()
        )
        assert audit.new_value == str(p.id)

    def test_unlink_clears_the_prospect(self, db_session, reg_cfg, admin):
        ra = _reg_app(db_session, reg_cfg)
        p = _prospect(db_session, regular_app_id=ra.id)
        link_application_prospect(
            app_id=ra.id, req=RegularProspectLinkRequest(prospect_id=None),
            admin=admin, db=db_session,
        )
        db_session.refresh(p)
        assert p.regular_application_id is None

    def test_linking_replaces_a_prior_prospect(self, db_session, reg_cfg, admin):
        ra = _reg_app(db_session, reg_cfg)
        old = _prospect(db_session, name="Old", regular_app_id=ra.id)
        new = _prospect(db_session, name="New", phone_1="85233334444")
        link_application_prospect(
            app_id=ra.id, req=RegularProspectLinkRequest(prospect_id=new.id),
            admin=admin, db=db_session,
        )
        db_session.refresh(old)
        db_session.refresh(new)
        assert old.regular_application_id is None
        assert new.regular_application_id == ra.id

    def test_admin_update_links_and_validates(self, db_session, reg_cfg, admin):
        ra = _reg_app(db_session, reg_cfg)
        p = _prospect(db_session)
        admin_update_prospect(
            prospect_id=p.id,
            payload=PrimaryProspectAdminUpdate(regular_application_id=ra.id),
            db=db_session, _admin=None,
        )
        db_session.refresh(p)
        assert p.regular_application_id == ra.id


# ---------------------------------------------------------------------------
# Conversion report + dashboard stats
# ---------------------------------------------------------------------------

class TestConversion:
    def test_per_branch_funnel_counts(self, db_session, reg_cfg, sum_cfg, tutor):
        student = _student(db_session)
        sa = _sum_app(db_session, sum_cfg, student_id=student.id, status="Enrolled")
        _enrollment(db_session, tutor, student_id=student.id, summer_app_id=sa.id)
        ra = _reg_app(db_session, reg_cfg, student_id=student.id, status="Enrolled")
        _enrollment(db_session, tutor, student_id=student.id, regular_app_id=ra.id, etype="Regular")
        _prospect(db_session, summer_app_id=sa.id, regular_app_id=ra.id, branch="MAC",
                  wants_summer="Yes", wants_regular="Yes")
        # A second MAC prospect who never applied to regular.
        _prospect(db_session, name="No Regular", branch="MAC", phone_1="85200000009")

        resp = get_conversion(year=2026, _admin=None, db=db_session)
        mac = next(r for r in resp.branches if r.branch == "MAC")
        assert mac.prospects == 2
        assert mac.wants_regular_yes == 1
        assert mac.attended_summer == 1
        assert mac.applied_regular == 1
        assert mac.enrolled_regular == 1
        assert resp.totals.prospects == 2
        assert resp.by_grade_stream_applied.get("F1") == 1

    def test_stats_expose_regular_columns(self, db_session, reg_cfg, tutor):
        student = _student(db_session)
        ra = _reg_app(db_session, reg_cfg, student_id=student.id)
        _enrollment(db_session, tutor, student_id=student.id, regular_app_id=ra.id, etype="Regular")
        _prospect(db_session, regular_app_id=ra.id, branch="MAC")
        # A second prospect whose application is live but not yet enrolled.
        ra2 = _reg_app(db_session, reg_cfg, name="Only Applied", phone="85200000010")
        _prospect(db_session, name="Only Applied", regular_app_id=ra2.id, branch="MAC",
                  phone_1="85200000010")
        rows = _stats(db_session)
        mac = next(r for r in rows if r.branch == "MAC")
        # Applied and Enrolled are exclusive: the enrolled prospect counts
        # only in enrolled_regular.
        assert mac.applied_regular == 1
        assert mac.enrolled_regular == 1


class TestConversionAxes:
    """The deeper conversion axes: submitting tutor, stated intention, feeder
    school, wanted-vs-enrolled branch, and the lost-prospects list."""

    def _enrolled(self, db_session, reg_cfg, tutor, *, branch, location, preferred, phone,
                  wants_regular="Yes", grade="F1", school=None, tutor_name=None):
        student = _student(db_session)
        ra = _reg_app(db_session, reg_cfg, student_id=student.id, status="Enrolled", phone=phone)
        _enrollment(db_session, tutor, student_id=student.id, regular_app_id=ra.id,
                    etype="Regular", location=location)
        return _prospect(db_session, branch=branch, regular_app_id=ra.id, phone_1=phone,
                         preferred_branches=preferred, wants_regular=wants_regular,
                         grade=grade, school=school, tutor_name=tutor_name)

    def test_by_tutor_groups_within_branch(self, db_session, reg_cfg, tutor):
        # Ada brought in a prospect who enrolled; an unattributed prospect never applied.
        self._enrolled(db_session, reg_cfg, tutor, branch="MAC", location="華士古分校",
                       preferred=["MSA"], phone="85211110000", tutor_name="Ada")
        _prospect(db_session, branch="MAC", phone_1="85211110001", tutor_name=None)

        resp = get_conversion(year=2026, _admin=None, db=db_session)
        ada = next(r for r in resp.by_tutor if r.tutor_name == "Ada")
        assert (ada.branch, ada.prospects, ada.applied_regular, ada.enrolled_regular) == ("MAC", 1, 1, 1)
        unattr = next(r for r in resp.by_tutor if r.tutor_name == "Unattributed")
        assert unattr.prospects == 1 and unattr.applied_regular == 0
        # Unattributed sorts last within its branch.
        assert resp.by_tutor[-1].tutor_name == "Unattributed"

    def test_regular_intention_vs_outcome(self, db_session, reg_cfg, tutor):
        self._enrolled(db_session, reg_cfg, tutor, branch="MAC", location="華士古分校",
                       preferred=["MSA"], phone="85222220000", wants_regular="Yes")
        _prospect(db_session, branch="MAC", phone_1="85222220001", wants_regular="No")

        resp = get_conversion(year=2026, _admin=None, db=db_session)
        yes = next(r for r in resp.by_regular_intention if r.intention == "Yes")
        assert yes.prospects == 1 and yes.applied_regular == 1 and yes.enrolled_regular == 1
        no = next(r for r in resp.by_regular_intention if r.intention == "No")
        assert no.prospects == 1 and no.applied_regular == 0
        # Ladder order: Yes before No.
        order = [r.intention for r in resp.by_regular_intention]
        assert order.index("Yes") < order.index("No")

    def test_by_school_and_unknown_bucket(self, db_session, reg_cfg, tutor):
        self._enrolled(db_session, reg_cfg, tutor, branch="MAC", location="華士古分校",
                       preferred=["MSA"], phone="85233330000", school="St Paul")
        _prospect(db_session, branch="MAC", phone_1="85233330001", school=None)

        resp = get_conversion(year=2026, _admin=None, db=db_session)
        stp = next(r for r in resp.by_school if r.school == "St Paul")
        assert stp.prospects == 1 and stp.enrolled_regular == 1
        unknown = next(r for r in resp.by_school if r.school == "Unknown")
        assert unknown.prospects == 1
        # Unknown always sorts last regardless of count.
        assert resp.by_school[-1].school == "Unknown"

    def test_by_school_groups_casing_variants(self, db_session, reg_cfg, tutor):
        # Same school, spellings differing by case + spacing collapse to one row;
        # the most common original spelling is shown.
        _prospect(db_session, branch="MAC", phone_1="85236360001", school="St Paul")
        _prospect(db_session, branch="MAC", phone_1="85236360002", school="St Paul")
        _prospect(db_session, branch="MAC", phone_1="85236360003", school="st paul")
        _prospect(db_session, branch="MAC", phone_1="85236360004", school="St  Paul")

        resp = get_conversion(year=2026, _admin=None, db=db_session)
        paul = [r for r in resp.by_school if r.prospects == 4]
        assert len(paul) == 1
        assert paul[0].school == "St Paul"  # the spelling seen most often

    def test_branch_filter_scopes_whole_report(self, db_session, reg_cfg, tutor):
        # Two source branches; filtering to one scopes every axis, not just the funnel.
        _prospect(db_session, name="Mac Kid", branch="MAC", phone_1="85237370001", school="Alpha")
        _prospect(db_session, name="Mcp Kid", branch="MCP", phone_1="85237370002", school="Beta")

        all_resp = get_conversion(year=2026, branch=None, _admin=None, db=db_session)
        assert {r.branch for r in all_resp.branches} == {"MAC", "MCP"}
        assert all_resp.totals.prospects == 2

        mac = get_conversion(year=2026, branch="MAC", _admin=None, db=db_session)
        assert [r.branch for r in mac.branches] == ["MAC"]
        assert mac.totals.prospects == 1
        assert {r.school for r in mac.by_school} == {"Alpha"}
        assert {r.branch for r in mac.by_tutor} == {"MAC"}

    def test_branch_movement_flags_crossing(self, db_session, reg_cfg, tutor):
        # Wanted MSA, enrolled at MSB (二龍喉分校 -> MSB): a crossing.
        self._enrolled(db_session, reg_cfg, tutor, branch="MAC", location="二龍喉分校",
                       preferred=["MSA"], phone="85244440000")
        # Wanted MSA, enrolled at MSA: matched.
        self._enrolled(db_session, reg_cfg, tutor, branch="MAC", location="華士古分校",
                       preferred=["MSA"], phone="85244440001")

        resp = get_conversion(year=2026, _admin=None, db=db_session)
        crossed = next(r for r in resp.branch_movement
                       if r.wanted_branch == "MSA" and r.enrolled_branch == "MSB")
        assert crossed.count == 1
        matched = next(r for r in resp.branch_movement
                       if r.wanted_branch == "MSA" and r.enrolled_branch == "MSA")
        assert matched.count == 1

    def test_lost_prospects_excludes_applicants_yes_first(self, db_session, reg_cfg, tutor):
        # One who applied (not lost); two who did not, one keen, one not.
        self._enrolled(db_session, reg_cfg, tutor, branch="MAC", location="華士古分校",
                       preferred=["MSA"], phone="85255550000")
        _prospect(db_session, name="Keen Chan", branch="MAC", phone_1="85255550001",
                  wants_regular="Yes")
        _prospect(db_session, name="Cold Wong", branch="MTA", phone_1="85255550002",
                  wants_regular="No")

        resp = get_conversion(year=2026, _admin=None, db=db_session)
        names = [r.student_name for r in resp.lost_prospects]
        assert "Keen Chan" in names and "Cold Wong" in names
        # The enrolled applicant is not on the chase list.
        assert all(r.wants_regular is not None for r in resp.lost_prospects)
        assert len(resp.lost_prospects) == 2
        # wants_regular == Yes sorts ahead of the rest.
        assert resp.lost_prospects[0].student_name == "Keen Chan"


class TestReverseSuggestions:
    def test_shared_student_prospect_suggested_first(self, db_session, reg_cfg, sum_cfg):
        student = _student(db_session)
        sa = _sum_app(db_session, sum_cfg, student_id=student.id, phone="85200000021")
        ra = _reg_app(db_session, reg_cfg, student_id=student.id, phone="85299990000")
        p = _prospect(db_session, summer_app_id=sa.id, phone_1="85200000021")
        resp = suggest_prospects_for_application(app_id=ra.id, _admin=None, db=db_session)
        assert resp.suggestions[0].prospect_id == p.id
        assert resp.suggestions[0].match_type == "student"


# ---------------------------------------------------------------------------
# Derived course states
# ---------------------------------------------------------------------------

class TestCourseStates:
    """summer_state / regular_state carry the journey truth the manual status
    field no longer holds: derived from links + enrollment rows, never stored."""

    def test_states_derive_from_links_and_enrollments(self, db_session, reg_cfg, sum_cfg, tutor):
        student = _student(db_session)
        sa = _sum_app(db_session, sum_cfg, student_id=student.id)
        _enrollment(db_session, tutor, student_id=student.id, summer_app_id=sa.id)
        ra = _reg_app(db_session, reg_cfg, student_id=student.id)
        _prospect(db_session, summer_app_id=sa.id, regular_app_id=ra.id)

        row = _admin_list(db_session)[0]
        assert row["summer_state"] == "enrolled"
        assert row["regular_state"] == "applied"

    def test_withdrawn_and_unlinked_states(self, db_session, sum_cfg):
        dead = _sum_app(db_session, sum_cfg, status="Withdrawn")
        _prospect(db_session, summer_app_id=dead.id)
        _prospect(db_session, name="Never Applied", phone_1="85200000030")

        rows = {r["student_name"]: r for r in _admin_list(db_session)}
        assert rows["Chan Tai Man"]["summer_state"] == "withdrawn"
        assert rows["Never Applied"]["summer_state"] is None
        assert rows["Never Applied"]["regular_state"] is None

    def test_state_filters_slice_the_list(self, db_session, sum_cfg, tutor):
        student = _student(db_session)
        enrolled_app = _sum_app(db_session, sum_cfg, student_id=student.id)
        _enrollment(db_session, tutor, student_id=student.id, summer_app_id=enrolled_app.id)
        _prospect(db_session, summer_app_id=enrolled_app.id)
        live_app = _sum_app(db_session, sum_cfg, name="Only Applied",
                            phone="85200000031", status="Submitted")
        _prospect(db_session, name="Only Applied", summer_app_id=live_app.id,
                  phone_1="85200000031")
        _prospect(db_session, name="Never Applied", phone_1="85200000032")

        assert [r["student_name"] for r in _admin_list(db_session, summer_state="enrolled")] == ["Chan Tai Man"]
        assert [r["student_name"] for r in _admin_list(db_session, summer_state="applied")] == ["Only Applied"]
        assert [r["student_name"] for r in _admin_list(db_session, summer_state="none")] == ["Never Applied"]

    def test_stats_summer_funnel_is_exclusive(self, db_session, sum_cfg, tutor):
        student = _student(db_session)
        enrolled_app = _sum_app(db_session, sum_cfg, student_id=student.id)
        _enrollment(db_session, tutor, student_id=student.id, summer_app_id=enrolled_app.id)
        _prospect(db_session, summer_app_id=enrolled_app.id, branch="MAC")
        live_app = _sum_app(db_session, sum_cfg, name="Only Applied",
                            phone="85200000033", status="Submitted")
        _prospect(db_session, name="Only Applied", summer_app_id=live_app.id,
                  branch="MAC", phone_1="85200000033")

        mac = next(r for r in _stats(db_session) if r.branch == "MAC")
        assert mac.applied_summer == 1
        assert mac.enrolled_summer == 1

    def test_manual_status_rejects_derived_values(self, db_session):
        p = _prospect(db_session)
        with pytest.raises(HTTPException):
            admin_update_prospect(
                p.id, PrimaryProspectAdminUpdate(status="Applied"),
                db=db_session, _admin=None,
            )
        resp = admin_update_prospect(
            p.id, PrimaryProspectAdminUpdate(status="Contacted"),
            db=db_session, _admin=None,
        )
        assert resp["status"] == "Contacted"
