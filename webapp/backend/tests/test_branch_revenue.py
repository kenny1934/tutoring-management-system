"""Regression tests for the branch revenue report (summer fee collection).

Focus: published applications must stay counted. Publishing flips an
application's status from 'Paid'/'Fee Sent' to 'Enrolled', after which the
collection state lives on the linked Summer enrollment's payment_status. The
report previously only bucketed raw 'Paid'/'Fee Sent' statuses, so published
applications silently dropped out of the receivable / collected totals.
"""
from datetime import date, datetime

import pytest

from models import (
    Enrollment,
    Student,
    SummerApplication,
    SummerCourseConfig,
    Tutor,
)
from services.branch_revenue_report import collect_report_data, report_to_summary


@pytest.fixture
def config(db_session):
    cfg = SummerCourseConfig(
        year=2026,
        title="Summer 2026",
        application_open_date=datetime(2026, 3, 1),
        application_close_date=datetime(2026, 6, 30),
        course_start_date=date(2026, 7, 6),
        course_end_date=date(2026, 8, 31),
        total_lessons=8,
        # base_fee drives the full-course fee; no discounts → fee == base_fee.
        pricing_config={"base_fee": 1600, "discounts": []},
        locations=[{"name": "MSA", "open_days": ["Tuesday"]}],
        available_grades=[{"value": "F1"}],
        time_slots=["10:00 - 11:30"],
        is_active=True,
    )
    db_session.add(cfg)
    db_session.commit()
    return cfg


def _make_app(db_session, config, ref, status, *, paid_at=None):
    a = SummerApplication(
        config_id=config.id,
        reference_code=ref,
        student_name=f"Student {ref}",
        grade="F1",
        contact_phone="11111111",
        application_status=status,
        sessions_per_week=1,
        lessons_paid=8,
        preferred_location="MSA",
        paid_at=paid_at,
    )
    db_session.add(a)
    db_session.commit()
    return a


def _publish(db_session, app, payment_status):
    """Mimic publish: flip the app to 'Enrolled' and create its Summer
    enrollment carrying the collection state on payment_status."""
    app.application_status = "Enrolled"
    student = Student(student_name=app.student_name, grade="F1", home_location="MSA")
    tutor = Tutor(
        user_email=f"tutor-{app.reference_code}@test.com",
        tutor_name="Tutor",
        role="Tutor",
        is_active_tutor=True,
    )
    db_session.add_all([student, tutor])
    db_session.commit()
    enr = Enrollment(
        student_id=student.id,
        tutor_id=tutor.id,
        enrollment_type="Summer",
        summer_application_id=app.id,
        payment_status=payment_status,
        lessons_paid=8,
        assigned_day="Tue",
        assigned_time="10:00 - 11:30",
        location="MSA",
        first_lesson_date=date(2026, 7, 7),
        is_new_student=False,
    )
    db_session.add(enr)
    db_session.commit()
    return enr


def _msa(db_session, config):
    data = collect_report_data(db_session, config)
    return report_to_summary(data)["branches"]["MSA"]


def test_published_paid_app_counts_as_collected(db_session, config):
    """Regression: an app published while Paid stays in receivable + collected."""
    app = _make_app(
        db_session, config, "SC-0001", "Paid",
        paid_at=datetime(2026, 6, 1),
    )
    _publish(db_session, app, payment_status="Paid")

    msa = _msa(db_session, config)
    assert msa["collected_students"] == 1
    assert msa["collected_amount"] == 1600
    assert msa["receivable_students"] == 1
    assert msa["receivable_amount"] == 1600
    assert msa["outstanding_students"] == 0


def test_published_unpaid_app_counts_as_outstanding(db_session, config):
    """An app published while Fee Sent (enrollment still Pending Payment) is
    receivable but not yet collected."""
    app = _make_app(db_session, config, "SC-0002", "Fee Sent")
    _publish(db_session, app, payment_status="Pending Payment")

    msa = _msa(db_session, config)
    assert msa["receivable_students"] == 1
    assert msa["receivable_amount"] == 1600
    assert msa["outstanding_students"] == 1
    assert msa["outstanding_amount"] == 1600
    assert msa["collected_students"] == 0


def test_unpublished_statuses_still_count(db_session, config):
    """Sanity: plain Paid / Fee Sent apps are unaffected by the published-app fix."""
    _make_app(db_session, config, "SC-0003", "Paid", paid_at=datetime(2026, 6, 1))
    _make_app(db_session, config, "SC-0004", "Fee Sent")

    msa = _msa(db_session, config)
    assert msa["collected_students"] == 1
    assert msa["outstanding_students"] == 1
    assert msa["receivable_students"] == 2
    assert msa["receivable_amount"] == 3200


def test_published_and_unpublished_mix_totals(db_session, config):
    """Published + unpublished collected apps sum together (the reported bug:
    published ones used to vanish, undercounting the total)."""
    _make_app(db_session, config, "SC-0005", "Paid", paid_at=datetime(2026, 6, 1))
    pub = _make_app(
        db_session, config, "SC-0006", "Paid", paid_at=datetime(2026, 6, 1)
    )
    _publish(db_session, pub, payment_status="Paid")

    msa = _msa(db_session, config)
    assert msa["collected_students"] == 2
    assert msa["collected_amount"] == 3200
    assert msa["receivable_students"] == 2
