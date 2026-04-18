"""Tests for the marketing snapshot classifier and row builder."""
from __future__ import annotations

from datetime import date, datetime

import pytest

from models import (
    Enrollment,
    PrimaryProspect,
    Student,
    SummerApplication,
    SummerCourseConfig,
    Tutor,
)
from services.summer_marketing_snapshot import (
    BUCKET_CURRENT_SEC,
    BUCKET_NEW,
    BUCKET_OLD_PRIMARY,
    BUCKET_P6_FEEDER,
    BUCKET_SUMMER_RT,
    BUCKET_UNVERIFIED,
    BUCKETS,
    LOCATIONS,
    build_header_row,
    compute_snapshot,
    snapshot_to_row,
)


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
        locations=[{"name": "MSA"}, {"name": "MSB"}],
        available_grades=[{"value": "F1"}],
        time_slots=["10:00 - 11:30"],
        is_active=True,
    )
    db_session.add(cfg)
    db_session.commit()
    return cfg


@pytest.fixture
def tutor(db_session):
    t = Tutor(
        user_email="t@test.com",
        tutor_name="T",
        role="Admin",
        is_active_tutor=True,
    )
    db_session.add(t)
    db_session.commit()
    return t


def _make_app(
    db_session,
    config,
    *,
    ref: str,
    location: str = "MSA",
    status: str = "Submitted",
    verified: str | None = None,
    existing_student_id: int | None = None,
) -> SummerApplication:
    app = SummerApplication(
        config_id=config.id,
        reference_code=ref,
        student_name=f"Student {ref}",
        grade="F1",
        contact_phone="123",
        preferred_location=location,
        application_status=status,
        sessions_per_week=1,
        verified_branch_origin=verified,
        existing_student_id=existing_student_id,
    )
    db_session.add(app)
    db_session.commit()
    return app


def _make_student(db_session, *, name: str, home: str | None = None) -> Student:
    s = Student(
        student_name=name,
        home_location=home,
    )
    db_session.add(s)
    db_session.commit()
    return s


def _make_enrollment(db_session, student: Student, tutor: Tutor) -> Enrollment:
    e = Enrollment(
        student_id=student.id,
        tutor_id=tutor.id,
        enrollment_type="Regular",
    )
    db_session.add(e)
    db_session.commit()
    return e


class TestClassification:
    """Each test creates one application and checks which bucket it lands in."""

    def test_unverified(self, db_session, config):
        _make_app(db_session, config, ref="A", verified=None)
        snap = compute_snapshot(db_session, config.id, date(2026, 4, 18))
        assert snap["cells"]["MSA"][BUCKET_UNVERIFIED]["total"] == 1

    def test_new(self, db_session, config):
        _make_app(db_session, config, ref="A", verified="New")
        snap = compute_snapshot(db_session, config.id, date(2026, 4, 18))
        assert snap["cells"]["MSA"][BUCKET_NEW]["total"] == 1

    def test_summer_rt_linked_no_enrollments(self, db_session, config):
        student = _make_student(db_session, name="Old MSA Student", home="MSA")
        _make_app(
            db_session, config, ref="A",
            verified="MSA", existing_student_id=student.id,
        )
        snap = compute_snapshot(db_session, config.id, date(2026, 4, 18))
        assert snap["cells"]["MSA"][BUCKET_SUMMER_RT]["total"] == 1
        assert snap["cells"]["MSA"][BUCKET_CURRENT_SEC]["total"] == 0

    def test_current_secondary_when_student_has_enrollment(
        self, db_session, config, tutor
    ):
        student = _make_student(db_session, name="Current MSA Student", home="MSA")
        _make_enrollment(db_session, student, tutor)
        _make_app(
            db_session, config, ref="A",
            verified="MSA", existing_student_id=student.id,
        )
        snap = compute_snapshot(db_session, config.id, date(2026, 4, 18))
        assert snap["cells"]["MSA"][BUCKET_CURRENT_SEC]["total"] == 1
        assert snap["cells"]["MSA"][BUCKET_SUMMER_RT]["total"] == 0

    def test_secondary_verified_without_linked_student_treated_as_current(
        self, db_session, config
    ):
        # Location MSA (default), verified branch MSB, no linked student.
        # Bucketing is by preferred_location, classification by verified branch.
        _make_app(
            db_session, config, ref="A",
            location="MSA", verified="MSB", existing_student_id=None,
        )
        snap = compute_snapshot(db_session, config.id, date(2026, 4, 18))
        assert snap["cells"]["MSA"][BUCKET_CURRENT_SEC]["total"] == 1
        assert snap["cells"]["MSA"][BUCKET_SUMMER_RT]["total"] == 0
        assert snap["cells"]["MSB"][BUCKET_CURRENT_SEC]["total"] == 0

    def test_old_primary_no_prospect(self, db_session, config):
        _make_app(db_session, config, ref="A", verified="MAC")
        snap = compute_snapshot(db_session, config.id, date(2026, 4, 18))
        assert snap["cells"]["MSA"][BUCKET_OLD_PRIMARY]["total"] == 1
        assert snap["cells"]["MSA"][BUCKET_P6_FEEDER]["total"] == 0

    def test_p6_feeder_when_prospect_link_exists(self, db_session, config):
        app = _make_app(db_session, config, ref="A", verified="MCP")
        prospect = PrimaryProspect(
            year=2026,
            source_branch="MCP",
            student_name="P6 Kid",
            summer_application_id=app.id,
        )
        db_session.add(prospect)
        db_session.commit()
        snap = compute_snapshot(db_session, config.id, date(2026, 4, 18))
        assert snap["cells"]["MSA"][BUCKET_P6_FEEDER]["total"] == 1
        assert snap["cells"]["MSA"][BUCKET_OLD_PRIMARY]["total"] == 0


class TestStatusFiltering:
    def test_excluded_statuses_dropped(self, db_session, config):
        _make_app(db_session, config, ref="A", verified="New", status="Withdrawn")
        _make_app(db_session, config, ref="B", verified="New", status="Rejected")
        _make_app(db_session, config, ref="C", verified="New", status="Submitted")
        snap = compute_snapshot(db_session, config.id, date(2026, 4, 18))
        assert snap["cells"]["MSA"][BUCKET_NEW]["total"] == 1
        assert snap["cells"]["MSA"][BUCKET_NEW]["pending"] == 1
        assert snap["cells"]["MSA"][BUCKET_NEW]["converted"] == 0

    def test_excluded_reference_codes_dropped(self, db_session, config):
        _make_app(db_session, config, ref="SC-KEEP", verified="New")
        _make_app(db_session, config, ref="SC-TEST-1", verified="New")
        _make_app(db_session, config, ref="SC-TEST-2", verified="New")
        snap = compute_snapshot(
            db_session, config.id, date(2026, 4, 18),
            excluded_reference_codes={"SC-TEST-1", "SC-TEST-2"},
        )
        assert snap["cells"]["MSA"][BUCKET_NEW]["total"] == 1

    def test_pending_vs_converted_split(self, db_session, config):
        # 2 pending (Submitted, Waitlisted), 2 converted (Paid, Enrolled)
        _make_app(db_session, config, ref="A", verified="New", status="Submitted")
        _make_app(db_session, config, ref="B", verified="New", status="Waitlisted")
        _make_app(db_session, config, ref="C", verified="New", status="Paid")
        _make_app(db_session, config, ref="D", verified="New", status="Enrolled")
        snap = compute_snapshot(db_session, config.id, date(2026, 4, 18))
        cell = snap["cells"]["MSA"][BUCKET_NEW]
        assert cell["total"] == 4
        assert cell["pending"] == 2
        assert cell["converted"] == 2


class TestLocationSplit:
    def test_msa_msb_separated(self, db_session, config):
        _make_app(db_session, config, ref="A", location="MSA", verified="New")
        _make_app(db_session, config, ref="B", location="MSB", verified="New")
        _make_app(db_session, config, ref="C", location="MSB", verified="New")
        snap = compute_snapshot(db_session, config.id, date(2026, 4, 18))
        assert snap["cells"]["MSA"][BUCKET_NEW]["total"] == 1
        assert snap["cells"]["MSB"][BUCKET_NEW]["total"] == 2

    def test_unrecognized_location_dropped(self, db_session, config):
        _make_app(
            db_session, config, ref="A",
            location="某分校", verified="New",
        )
        snap = compute_snapshot(db_session, config.id, date(2026, 4, 18))
        for loc in LOCATIONS:
            for bucket in BUCKETS:
                assert snap["cells"][loc][bucket]["total"] == 0

    def test_chinese_location_normalized(self, db_session, config):
        _make_app(
            db_session, config, ref="A",
            location="華士古分校", verified="New",
        )
        _make_app(
            db_session, config, ref="B",
            location="二龍喉分校", verified="New",
        )
        snap = compute_snapshot(db_session, config.id, date(2026, 4, 18))
        assert snap["cells"]["MSA"][BUCKET_NEW]["total"] == 1
        assert snap["cells"]["MSB"][BUCKET_NEW]["total"] == 1


class TestRowSerialization:
    def test_header_shape(self):
        header = build_header_row()
        assert header[0] == "日期"
        # 1 date column + 2 locations × 6 buckets × 3 stats
        assert len(header) == 1 + 2 * 6 * 3
        assert "MSA 中學部回歸 總數" in header
        assert "MSB 未核對 成功報讀" in header

    def test_row_aligns_with_header(self, db_session, config):
        _make_app(db_session, config, ref="A", verified="New")
        snap = compute_snapshot(db_session, config.id, date(2026, 4, 18))
        row = snapshot_to_row(snap)
        assert len(row) == len(build_header_row())
        assert row[0] == date(2026, 4, 18)

    def test_other_year_config_excluded(self, db_session, config):
        # An application for a different config_id must not contaminate counts.
        other = SummerCourseConfig(
            year=2025,
            title="Summer 2025",
            application_open_date=datetime(2025, 3, 1),
            application_close_date=datetime(2025, 6, 30),
            course_start_date=date(2025, 7, 5),
            course_end_date=date(2025, 8, 29),
            total_lessons=8,
            pricing_config={"base": 400},
            locations=[{"name": "MSA"}],
            available_grades=[{"value": "F1"}],
            time_slots=["10:00 - 11:30"],
            is_active=False,
        )
        db_session.add(other)
        db_session.commit()

        _make_app(db_session, config, ref="A", verified="New")
        # Old-year app — should be ignored when snapshotting current config.
        old_app = SummerApplication(
            config_id=other.id,
            reference_code="OLD",
            student_name="Old",
            grade="F1",
            contact_phone="x",
            preferred_location="MSA",
            application_status="Submitted",
            sessions_per_week=1,
            verified_branch_origin="New",
        )
        db_session.add(old_app)
        db_session.commit()

        snap = compute_snapshot(db_session, config.id, date(2026, 4, 18))
        assert snap["cells"]["MSA"][BUCKET_NEW]["total"] == 1
