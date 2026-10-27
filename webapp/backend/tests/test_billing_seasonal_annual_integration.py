"""Seasonal and annual handlers coexist with a prior grouped billing account.

Every write is confined to the imported disposable SQLite fixture. The fixture's
connection guard rejects application databases, including accidental connections.
"""
import asyncio
from copy import deepcopy
from datetime import date, datetime

import pytest
from fastapi import HTTPException

from billing.models import BillingAccount, BillingPayment, BillingPaymentLine
from models import (
    Enrollment, RegularApplication, RegularCourseConfig, SessionLog,
    SummerApplication, SummerCourseConfig, SummerCourseSlot,
)
from routers import enrollments, regular_course, summer_course
from schemas import EnrollmentCreate, EnrollmentUpdate, RegularPublishRequest
from tests.test_billing_legacy_guards import env, no_external_connections  # noqa: F401
from tests.test_summer_publish import _materialize_lessons, _place_all


def run(coroutine):
    # Existing seasonal tests use the thread's default loop. Keep it intact.
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coroutine)
    finally:
        loop.close()


@pytest.fixture
def grouped_env(env, monkeypatch):
    monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED', 'true')
    return env


def grouped_state(db):
    payment = db.get(BillingPayment, 'payment-1')
    account = db.get(BillingAccount, 1)
    return (
        payment.status, deepcopy(payment.snapshot), account.active, account.academic_start,
        db.query(BillingAccount).count(), db.query(BillingPayment).count(),
        [(r.id, r.payment_status, r.lessons_paid, r.fee_message_sent)
         for r in db.query(Enrollment).filter(Enrollment.id.in_([11, 12])).order_by(Enrollment.id)],
        [(r.enrollment_id, r.tuition_amount) for r in db.query(BillingPaymentLine).order_by(BillingPaymentLine.id)],
    )


def test_one_time_create_and_payment_preserve_the_active_grouped_payment(grouped_env):
    db, admin = grouped_env
    before = grouped_state(db)
    created = run(enrollments.create_enrollment(EnrollmentCreate(
        student_id=101, tutor_id=admin.id, assigned_day='Wednesday',
        assigned_time='10:00 - 11:30', location='MSA',
        first_lesson_date=date(2027, 1, 6), lessons_paid=2,
        enrollment_type='One-Time',
    ), admin, db))
    assert created.enrollment_type == 'One-Time'
    assert created.payment_status == 'Pending Payment'
    sessions = db.query(SessionLog).filter_by(enrollment_id=created.id).order_by(SessionLog.session_date).all()
    assert [s.session_date for s in sessions] == [date(2027, 1, 6), date(2027, 1, 13)]
    assert {s.financial_status for s in sessions} == {'Unpaid'}
    paid = run(enrollments.update_enrollment(created.id, EnrollmentUpdate(
        payment_status='Paid', payment_date=date(2027, 1, 5)), admin, db))
    assert paid.payment_status == 'Paid'
    assert paid.billing_payment_id is None
    assert paid.billing_managed is False
    db.expire_all()
    assert {s.financial_status for s in db.query(SessionLog).filter_by(enrollment_id=created.id)} == {'Paid'}
    assert grouped_state(db) == before


def test_summer_publish_and_payment_preserve_the_active_grouped_payment(grouped_env):
    db, admin = grouped_env
    before = grouped_state(db)
    config = SummerCourseConfig(
        year=2027, title='Synthetic summer compatibility',
        application_open_date=datetime(2027, 3, 1), application_close_date=datetime(2027, 6, 30),
        course_start_date=date(2027, 7, 6), course_end_date=date(2027, 8, 31),
        total_lessons=8, pricing_config={'base': 400}, locations=[],
        available_grades=[], time_slots=['10:00 - 11:30'], is_active=True,
    )
    db.add(config); db.flush()
    slot = SummerCourseSlot(config_id=config.id, slot_day='Tuesday', time_slot='10:00 - 11:30',
                            location='MSA', grade='F1', course_type='A', max_students=8, tutor_id=admin.id)
    application = SummerApplication(
        config_id=config.id, reference_code='SYNTHETIC-SUMMER-2027', student_name='Synthetic seasonal student',
        grade='F1', contact_phone='00000000', application_status='Fee Sent', sessions_per_week=1,
        lessons_paid=8, existing_student_id=101,
    )
    db.add_all([slot, application]); db.commit()
    lessons = _materialize_lessons(db, slot)
    _place_all(db, application, slot, lessons)
    published = summer_course.publish_application(application.id, admin, db)
    row = db.get(Enrollment, published.enrollment_id)
    assert row.enrollment_type == 'Summer'
    assert row.summer_application_id == application.id
    assert row.payment_status == 'Pending Payment'
    assert published.sessions_created == 8
    assert {s.financial_status for s in db.query(SessionLog).filter_by(enrollment_id=row.id)} == {'Unpaid'}
    paid = run(enrollments.update_enrollment(row.id, EnrollmentUpdate(
        payment_status='Paid', payment_date=date(2027, 7, 1)), admin, db))
    assert paid.payment_status == 'Paid'
    assert paid.billing_payment_id is None
    assert paid.billing_managed is False
    db.expire_all()
    assert {s.financial_status for s in db.query(SessionLog).filter_by(enrollment_id=row.id)} == {'Paid'}
    assert db.get(SummerApplication, application.id).paid_at.date() == date(2027, 7, 1)
    assert grouped_state(db) == before


def annual_application(db, year, status):
    config = RegularCourseConfig(
        year=year, title='Synthetic annual compatibility', course_start_date=date(year, 9, 1),
        application_open_date=datetime(year, 8, 1), application_close_date=datetime(year, 9, 30),
    )
    db.add(config); db.flush()
    application = RegularApplication(
        config_id=config.id, reference_code=f'SYNTHETIC-ANNUAL-{year}', student_name='Synthetic annual student',
        contact_phone='00000000', grade='F2', preferred_location='MSA', preference_1_day='Wednesday',
        preference_1_time='10:00 - 11:30', existing_student_id=101, application_status=status,
    )
    db.add(application); db.commit()
    return application


@pytest.mark.parametrize('status,expected_payment,expected_financial', [
    ('Fee Sent', 'Pending Payment', 'Unpaid'), ('Paid', 'Paid', 'Paid'),
])
def test_next_year_annual_publish_is_allowed_and_preserves_prior_year(grouped_env, status, expected_payment, expected_financial):
    db, admin = grouped_env
    before = grouped_state(db)
    application = annual_application(db, 2027, status)
    request = RegularPublishRequest(confirmed_day='Wednesday', confirmed_time='10:00 - 11:30',
                                    tutor_id=admin.id, first_lesson_date=date(2027, 9, 1),
                                    lessons_paid=6, location='MSA')
    result = regular_course.publish_application(application.id, request, admin, db)
    row = db.get(Enrollment, result.enrollment_id)
    assert result.sessions_created == 6
    assert row.first_lesson_date == date(2027, 9, 1)
    assert row.regular_application_id == application.id
    assert row.payment_status == expected_payment
    assert row.enrollment_type == 'Regular'
    assert row.is_new_student is False
    assert row.fee_message_sent is True
    assert {s.financial_status for s in db.query(SessionLog).filter_by(enrollment_id=row.id)} == {expected_financial}
    assert db.get(RegularApplication, application.id).application_status == 'Enrolled'
    assert grouped_state(db) == before


def test_current_year_annual_publish_remains_blocked_without_teaching_writes(grouped_env):
    db, admin = grouped_env
    before = grouped_state(db)
    application = annual_application(db, 2026, 'Fee Sent')
    enrollment_count = db.query(Enrollment).count()
    session_count = db.query(SessionLog).count()
    request = RegularPublishRequest(confirmed_day='Wednesday', confirmed_time='10:00 - 11:30',
                                    tutor_id=admin.id, first_lesson_date=date(2026, 9, 2),
                                    lessons_paid=6, location='MSA')
    with pytest.raises(HTTPException) as caught:
        regular_course.publish_application(application.id, request, admin, db)
    assert caught.value.status_code == 409
    assert caught.value.detail['code'] == 'BILLING_WORKFLOW_REQUIRED'
    assert db.query(Enrollment).count() == enrollment_count
    assert db.query(SessionLog).count() == session_count
    assert db.get(RegularApplication, application.id).application_status == 'Fee Sent'
    assert grouped_state(db) == before
