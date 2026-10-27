"""Actual grouped confirmation/payment preserves teaching and net tuition."""
from datetime import date
import json

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing.models import BillingLessonClaim, BillingPayment, BillingPaymentLine
from models import Enrollment, SessionExercise, SessionLog, StudentCoupon, TutorMemo, TutorMessage
from tests.test_billing_drafts import env as draft_env
from tests.test_billing_workflow import (
    env as workflow_env, confirmed, coupon_payload, next_review, pay_payload, second_class,
)
from tests.test_billing_intake_verification import (
    intake_records, intake_request, saved_intake, setup_preference, confirmation_data,
)


@pytest.fixture(autouse=True)
def isolated_connections():
    def reject(dialect, *_args):
        assert dialect.name == 'sqlite', 'Integration fixtures cannot connect to application data.'
    event.listen(Engine, 'do_connect', reject)
    yield
    event.remove(Engine, 'do_connect', reject)


def test_grouped_confirmation_fills_both_taught_classes_once_then_records_payment(workflow_env, monkeypatch):
    from routers import billing, billing_drafts, billing_workflow
    client, session, user = workflow_env
    for router in (billing, billing_drafts, billing_workflow):
        monkeypatch.setattr(router, 'today', lambda: date(2026, 11, 15))
    deliveries = []
    # Exercise actual inbox creation without sending live notifications.
    monkeypatch.setattr('services.unlisted_lessons._deliver_after_commit', lambda db, messages, actor: deliveries.extend(messages))
    second_class(session)
    memos = []
    for tutor_id, when, slot in [(1, date(2026, 11, 13), '16:00 - 17:30'), (2, date(2026, 11, 14), '10:00 - 11:30')]:
        memo = TutorMemo(student_id=101, tutor_id=tutor_id, memo_date=when, time_slot=slot, location='MSA',
                         status='waiting', notes=f'Taught class {tutor_id}', performance_rating='4',
                         exercises=[{'exercise_type':'CW', 'pdf_name':'synthetic-work.pdf', 'page_start':2},
                                    {'exercise_type':'HW', 'url':'https://example.test/homework'}],
                         created_by=f'teacher-{tutor_id}@example.test')
        session.add(memo);memos.append(memo)
    session.commit()
    payload = next_review(client, [11, 12])
    payload['confirmed_checks'].append('UNPAID_PAST_DATES')
    draft, body, payment = confirmed(client, payload=payload)
    assert payment['review_issues'] == []
    assert session.query(BillingPayment).count() == 1
    assert session.query(BillingPaymentLine).count() == 2
    assert len({m.linked_session_id for m in memos}) == 2
    linked_ids = {line['enrollment_id'] for line in payment['lines']}
    for memo in memos:
        session.refresh(memo)
        assert memo.status == 'filled' and memo.filled_by == user.user_email
        lesson = session.get(SessionLog, memo.linked_session_id)
        assert lesson.enrollment_id in linked_ids and lesson.tutor_id == memo.tutor_id
        assert (lesson.session_date, lesson.time_slot, lesson.location) == (memo.memo_date, memo.time_slot, memo.location)
        assert lesson.session_status == 'Attended' and lesson.financial_status == 'Unpaid'
        assert lesson.notes == memo.notes and lesson.performance_rating == memo.performance_rating
        assert lesson.attendance_marked_by == memo.created_by
        exercises = session.query(SessionExercise).filter_by(session_id=lesson.id).all()
        assert sorted(e.exercise_type for e in exercises) == ['CW', 'HW']
        cw = next(e for e in exercises if e.exercise_type == 'CW')
        hw = next(e for e in exercises if e.exercise_type == 'HW')
        assert (cw.pdf_name, cw.page_start) == ('synthetic-work.pdf', 2)
        assert hw.url == 'https://example.test/homework'
        assert all(e.created_by == memo.created_by for e in exercises)
        assert session.query(BillingLessonClaim).filter_by(session_id=lesson.id).count() == 1
    assert session.query(TutorMessage).count() == 1 and len(deliveries) == 1
    before = (session.query(SessionLog).count(), session.query(SessionExercise).count())
    replay = client.post(f"/api/billing/drafts/{draft['id']}/confirm", json=body)
    assert replay.status_code == 200, replay.text
    assert (session.query(SessionLog).count(), session.query(SessionExercise).count()) == before
    paid_body = pay_payload(payment, payment_date='2026-11-15')
    paid = client.post(f"/api/billing/payments/{payment['id']}/paid", json=paid_body)
    assert paid.status_code == 200, paid.text
    for memo in memos:
        session.refresh(session.get(SessionLog, memo.linked_session_id))
        lesson = session.get(SessionLog, memo.linked_session_id)
        assert lesson.session_status == 'Attended' and lesson.financial_status == 'Paid'
        assert lesson.notes == memo.notes and lesson.attendance_marked_by == memo.created_by
    assert client.post(f"/api/billing/payments/{payment['id']}/paid", json=paid_body).status_code == 200
    assert session.query(TutorMessage).count() == 1
    assert (session.query(SessionLog).count(), session.query(SessionExercise).count()) == before


def export_fixture(session, payment, path):
    enrollment_ids = [line['enrollment_id'] for line in payment['lines']]
    enrollments = session.query(Enrollment).filter(Enrollment.id.in_(enrollment_ids)).all()
    lessons = session.query(SessionLog).filter(SessionLog.enrollment_id.in_(enrollment_ids)).all()
    def fields(row, names):
        return {name: getattr(row, name) for name in names}
    result = {
        'payment': payment,
        'enrollments': [fields(row, ['id','student_id','tutor_id','lessons_paid','is_new_student','payment_status','first_lesson_date','discount_id','revenue_total']) for row in enrollments],
        'sessions': [fields(row, ['id','student_id','tutor_id','enrollment_id','session_date','time_slot','location','session_status','financial_status','make_up_for_id']) for row in lessons],
    }
    path.write_text(json.dumps(result, default=str, indent=2))


@pytest.mark.parametrize('materials', [0, 37, 100])
def test_actual_two_class_intake_keeps_trial_deduction_and_materials_outside_tutor_revenue(intake_records, tmp_path, materials):
    client, session, _ = intake_records
    setup_preference(client)
    payload = intake_request(client)
    payload['scenario']['slots'].append({'weekday':'Sat','time_slot':'10:00 - 11:30','location':'MSA'})
    payload['intake']['slots'].append({'tutor_id':2})
    payload['scenario']['materials_fee'] = materials
    if materials != 100:
        payload['intake']['materials_override_reason'] = 'Materials already supplied in this synthetic acceptance case.'
    _, draft = saved_intake(client, payload)
    response = client.post(f"/api/billing/drafts/{draft['id']}/confirm", json=confirmation_data(draft))
    assert response.status_code == 200, response.text
    payment = response.json()
    lines = payment['lines'];period = payment['review']['period']
    assert sum(line['discount_amount'] for line in lines) == 150
    assert sum(line['materials_fee'] for line in lines) == materials
    assert sum(line['tuition_amount'] for line in lines) == period['gross_tuition'] - 150
    assert period['total_fee'] == period['gross_tuition'] - 150 + materials
    for line in lines:
        enrollment = session.get(Enrollment, line['enrollment_id'])
        assert enrollment.revenue_total == line['tuition_amount']
    export_fixture(session, payment, tmp_path / 'financial-fixture.json')


def test_actual_renewal_coupon_allocations_preserve_net_tuition(workflow_env, tmp_path):
    client, session, _ = workflow_env
    second_class(session)
    session.add(StudentCoupon(student_id=101, available_coupons=1, coupon_value=300))
    session.commit()
    payload = coupon_payload(client, ids=(11,12), value=300)
    _, _, payment = confirmed(client, payload=payload)
    assert sum(line['discount_amount'] for line in payment['lines']) == 300
    assert sum(line['materials_fee'] for line in payment['lines']) == 0
    export_fixture(session, payment, tmp_path / 'financial-fixture.json')
