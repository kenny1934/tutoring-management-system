"""Legacy batch renewals must respect the calendar-policy cutover.

These exercise actual handlers with disposable SQLite. Both a saved preference
and a stale batch screen must remain unable to bypass the new renewal workflow.
"""
import asyncio
from datetime import date, timedelta

import pytest

from tests.test_billing_legacy_guards import env, no_external_connections  # noqa: F401
from billing.models import BillingAccount
from billing.coupon_models import CouponAccount, CouponImport, CouponObservation, CouponUse
from models import Enrollment, SessionLog, Student
from routers import enrollments
from schemas import BatchEnrollmentRequest, BatchRenewRequest


@pytest.fixture
def unconverted(env, monkeypatch):
    db, admin = env
    for key in ('BILLING_COUPON_STORAGE_ENABLED', 'BILLING_COUPON_ENABLED',
                'BILLING_TEST_DATE_FILE', 'BILLING_DEMO_DATE'):
        monkeypatch.delenv(key, raising=False)
    # Preference collection creates an account without activating the student.
    db.add(BillingAccount(id=2, student_id=102, academic_start=date(2026, 9, 1),
                          policy_version='synthetic-v1', active=False))
    db.commit()
    return db, admin


def prepare_source(db, first_lesson):
    source = db.get(Enrollment, 14)
    source.first_lesson_date = first_lesson - timedelta(days=14)
    source.assigned_day = first_lesson.strftime('%a')
    source.payment_status = 'Paid'
    source.extension_weeks = 0
    db.commit()
    return source


def enable_zero_coupon_stock(db, monkeypatch):
    monkeypatch.setenv('BILLING_COUPON_STORAGE_ENABLED', 'true')
    monkeypatch.setenv('BILLING_COUPON_ENABLED', 'true')
    db.add(CouponImport(id='synthetic-import', branch='MSA',
                        observed_on=date(2026, 11, 7), source_sha256='a' * 64,
                        source_filename='synthetic.xlsx', parsed_rows=[],
                        created_by_name='Synthetic admin'))
    db.flush()
    db.add(CouponObservation(id='synthetic-observation', student_id=102,
                             import_id='synthetic-import', remaining_count=0,
                             observed_on=date(2026, 11, 7), source_sha256='a' * 64,
                             source_filename='synthetic.xlsx'))
    db.flush()
    db.add(CouponAccount(student_id=102, observation_id='synthetic-observation', version=1))
    db.commit()


def financial_counts(db):
    return tuple(db.query(model).count() for model in (Enrollment, SessionLog, CouponUse))


DATES = [(date(2026, 10, 29), False), (date(2026, 10, 30), True),
         (date(2026, 11, 6), True), (date(2027, 9, 3), False)]


@pytest.mark.parametrize('first_lesson,requires_billing', DATES)
@pytest.mark.parametrize('coupon_enabled', [False, True])
def test_eligibility_routes_unconverted_students_without_override(
        unconverted, monkeypatch, first_lesson, requires_billing, coupon_enabled):
    db, admin = unconverted
    prepare_source(db, first_lesson)
    if coupon_enabled:
        enable_zero_coupon_stock(db, monkeypatch)
    before = financial_counts(db)
    result = asyncio.run(enrollments.batch_renew_check(
        BatchEnrollmentRequest(enrollment_ids=[14]), admin, db))
    assert financial_counts(db) == before
    if requires_billing:
        assert not result.eligible
        assert len(result.ineligible) == 1
        item = result.ineligible[0]
        assert item.reason == 'billing_workflow'
        assert item.overridable is False
        assert item.billing_managed is False
        assert item.student_id == 102
        assert item.suggested_first_lesson_date == first_lesson
        assert 'Enrollment renewals' in item.details
    else:
        assert [item.enrollment_id for item in result.eligible] == [14]
        assert not result.ineligible


@pytest.mark.parametrize('first_lesson,requires_billing', DATES)
@pytest.mark.parametrize('coupon_enabled', [False, True])
def test_direct_batch_write_enforces_cutover_before_teaching_or_coupon_writes(
        unconverted, monkeypatch, first_lesson, requires_billing, coupon_enabled):
    db, admin = unconverted
    source = prepare_source(db, first_lesson)
    if coupon_enabled:
        enable_zero_coupon_stock(db, monkeypatch)
    before = financial_counts(db)
    # Deliberately skip batch-renew-check to model a stale or direct request.
    result = asyncio.run(enrollments.batch_renew(
        BatchRenewRequest(enrollment_ids=[14], lessons_paid=6), admin, db))
    if requires_billing:
        assert result.created_count == 0
        assert result.failed_count == 1
        assert result.results[0].success is False
        assert result.results[0].new_enrollment_id is None
        assert 'Enrollment renewals' in result.results[0].error
        assert financial_counts(db) == before
    else:
        assert result.created_count == 1
        assert result.failed_count == 0
        renewed = db.get(Enrollment, result.results[0].new_enrollment_id)
        assert renewed.first_lesson_date == first_lesson
        assert renewed.lessons_paid == 6
        assert db.query(SessionLog).filter_by(enrollment_id=renewed.id).count() == 6
    assert source.payment_status == 'Paid'
    assert source.lessons_paid == 2
    assert db.get(BillingAccount, 2).active is False


@pytest.mark.parametrize('storage_enabled', [False, True])
def test_storage_without_activation_preserves_current_batch_workflow(
        unconverted, monkeypatch, storage_enabled):
    db, admin = unconverted
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'false')
    monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED', str(storage_enabled).lower())
    prepare_source(db, date(2026, 11, 6))
    check = asyncio.run(enrollments.batch_renew_check(
        BatchEnrollmentRequest(enrollment_ids=[14]), admin, db))
    assert [item.enrollment_id for item in check.eligible] == [14]
    result = asyncio.run(enrollments.batch_renew(
        BatchRenewRequest(enrollment_ids=[14]), admin, db))
    assert result.created_count == 1


def test_activation_between_check_and_confirmation_rejects_stale_selection(unconverted, monkeypatch):
    db, admin = unconverted
    prepare_source(db, date(2026, 11, 6))
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'false')
    checked = asyncio.run(enrollments.batch_renew_check(
        BatchEnrollmentRequest(enrollment_ids=[14]), admin, db))
    assert [item.enrollment_id for item in checked.eligible] == [14]
    before = financial_counts(db)
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'true')
    result = asyncio.run(enrollments.batch_renew(
        BatchRenewRequest(enrollment_ids=[14]), admin, db))
    assert result.created_count == 0
    assert result.failed_count == 1
    assert financial_counts(db) == before


def test_mixed_batch_keeps_valid_pre_cutover_item_and_rejects_policy_item(unconverted):
    db, admin = unconverted
    prepare_source(db, date(2026, 10, 23))
    db.add(Student(id=103, student_name='Another synthetic student'))
    db.flush()
    db.add(Enrollment(id=15, student_id=103, tutor_id=1, assigned_day='Fri',
                      assigned_time='16:00 - 17:30', location='MSA',
                      first_lesson_date=date(2026, 10, 23), lessons_paid=2,
                      enrollment_type='Regular', payment_status='Paid'))
    db.commit()
    result = asyncio.run(enrollments.batch_renew(
        BatchRenewRequest(enrollment_ids=[14, 15]), admin, db))
    assert result.created_count == 1
    assert result.failed_count == 1
    assert result.results[0].success is True
    assert result.results[1].success is False
    assert db.query(Enrollment).filter_by(renewed_from_enrollment_id=15).count() == 0
    assert db.query(SessionLog).filter_by(student_id=103).count() == 0
