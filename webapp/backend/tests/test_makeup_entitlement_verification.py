"""Independent makeup acceptance checks using invented SQLite records only.

These checks exercise policy boundaries and failed operations. SQLite cannot
establish InnoDB lock behaviour, which needs its own disposable target.
"""
from datetime import date, timedelta
from collections import Counter
from copy import deepcopy
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from auth.dependencies import get_current_user
from database import Base, get_db
from billing.drafts import DraftConflict
from billing.models import BillingAccount, BillingDraft, BillingPayment, BillingPaymentLine
from billing.schemas import BillingPreviewPeriod
from makeup_models import MakeupParticipation, MakeupParticipationEvent
from makeup_schemas import ParticipationChange, ParticipationConfirm
from models import Enrollment, Holiday, SessionLog, Student, Tutor
from services import makeup_entitlement as service


NOW = date(2027, 3, 20)


@pytest.fixture(autouse=True)
def forbid_external_connections():
    def reject(dialect, *_args):
        assert dialect.name == 'sqlite', 'Makeup verification refuses external database connections.'
    event.listen(Engine, 'do_connect', reject)
    yield
    event.remove(Engine, 'do_connect', reject)


def course(db, enrollment_id, first, *, student_id=101, tutor_id=2, count=6,
           payment='Paid', kind='Regular', status='Scheduled'):
    enrollment = Enrollment(id=enrollment_id, student_id=student_id, tutor_id=tutor_id,
        first_lesson_date=first, assigned_day=first.strftime('%a'),
        assigned_time='16:00 - 17:30', location='MSA', lessons_paid=count,
        payment_status=payment, payment_date=first - timedelta(days=1),
        enrollment_type=kind, revenue_total=count * 400)
    db.add(enrollment)
    db.flush()
    for i in range(count):
        db.add(SessionLog(id=enrollment_id * 10 + i, enrollment_id=enrollment_id,
            student_id=student_id, tutor_id=tutor_id,
            session_date=first + timedelta(weeks=i), time_slot='16:00 - 17:30',
            location='MSA', session_status=status,
            financial_status=payment if payment in {'Paid', 'Waived'} else 'Unpaid'))
    db.flush()
    return enrollment


@pytest.fixture
def records(monkeypatch):
    monkeypatch.setenv('MAKEUP_ENTITLEMENT_ENABLED', 'true')
    monkeypatch.delenv('MAKEUP_ENTITLEMENT_STORAGE_ENABLED', raising=False)
    monkeypatch.setattr(service, '_today', lambda: NOW)
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    db = Session(engine, expire_on_commit=False)
    actor = SimpleNamespace(id=1, user_email='makeup-admin@example.test', tutor_name='Synthetic admin', role='Admin')
    db.add_all([Tutor(**vars(actor)),
        Tutor(id=2, user_email='makeup-owner@example.test', tutor_name='Owning tutor', role='Tutor', default_location='MSA'),
        Tutor(id=3, user_email='makeup-other@example.test', tutor_name='Other tutor', role='Tutor', default_location='MSA'),
        Student(id=101, student_name='Synthetic makeup student', home_location='MSA'),
        Student(id=102, student_name='Other synthetic student', home_location='MSA')])
    db.flush()
    course(db, 11, date(2026, 9, 4), status='Attended')
    db.get(SessionLog, 110).session_status = 'Sick Leave - Pending Make-up'
    course(db, 12, date(2027, 3, 1), count=5)
    course(db, 21, date(2027, 3, 2), student_id=102, tutor_id=3, count=5)
    db.add(BillingAccount(student_id=101, academic_start=date(2026, 9, 1),
                          policy_version=service.POLICY.version, active=True))
    db.commit()
    yield db, actor
    db.close()
    engine.dispose()


def eligibility(db, session_id=110, *, target=date(2027, 4, 10), as_of=NOW):
    return service.eligibility_for_sessions(db, [session_id], target_date=target, as_of=as_of).get(session_id)


def preview(db, status='Paused', effective=NOW, **changes):
    return service.preview_participation(db, 101, ParticipationChange(
        status=status, effective_on=effective, reason='Synthetic reviewed participation change.', **changes), as_of=NOW)


def confirmation(review, key='independent-participation-1'):
    return ParticipationConfirm(**review.change.model_dump(), expected_version=review.version,
        expected_review_hash=review.review_hash, idempotency_key=key)


def commit_change(db, actor, review, key='independent-participation-1'):
    result = service.confirm_participation(db, 101, confirmation(review, key), actor, as_of=NOW)
    db.commit()
    return result


def future_booking(db, *, session_id=901, source_id=110, when=date(2027, 4, 10), status='Make-up Class'):
    source = db.get(SessionLog, source_id)
    source.session_status = source.session_status.replace('Pending Make-up', 'Make-up Booked')
    source.rescheduled_to_id = session_id
    booking = SessionLog(id=session_id, enrollment_id=source.enrollment_id,
        student_id=source.student_id, tutor_id=3, session_date=when,
        time_slot='10:00 - 11:30', location='MSA', session_status=status,
        financial_status=source.financial_status, make_up_for_id=source_id)
    db.add(booking)
    db.commit()
    return booking


def grouped_payment(db, enrollment_id, through, *, kind='regular'):
    account = db.query(BillingAccount).one()
    draft_id, payment_id = f'calendar-draft-{enrollment_id}', f'calendar-payment-{enrollment_id}'
    db.add(BillingDraft(id=draft_id, account_id=account.id, current_revision=1))
    db.flush()
    originals = db.query(SessionLog).filter_by(enrollment_id=enrollment_id, make_up_for_id=None).all()
    amount = 400 * len(originals)
    first = min(row.session_date for row in originals)
    last = max(row.session_date for row in originals)
    months = Counter(row.session_date.strftime('%Y-%m') for row in originals)
    period = BillingPreviewPeriod(number=1, kind=kind, explanation='Synthetic reviewed payment.',
        coverage_from=first, coverage_through=through,
        first_lesson_date=first, last_lesson_date=last, lesson_count=len(originals),
        counts_by_month=[{'month': month, 'lessons': count} for month, count in sorted(months.items())],
        counts_by_slot=[len(originals)],
        lessons=[{'date': row.session_date, 'weekday': row.session_date.strftime('%a'),
                  'time_slot': row.time_slot, 'location': row.location, 'slot': 0} for row in originals],
        gross_tuition=amount, deductions=[], tuition_after_deductions=amount, materials_fee=0,
        total_fee=amount, collection={'method': 'autopay'}).model_dump(mode='json')
    db.add(BillingPayment(id=payment_id, account_id=account.id, draft_id=draft_id,
        draft_revision=1, status='Paid', snapshot={'review': {'student': {'id': 101}, 'period': period}}))
    db.flush()
    db.add(BillingPaymentLine(payment_id=payment_id, enrollment_id=enrollment_id, slot_index=0,
        lesson_count=len(originals), gross_tuition=amount, discount_amount=0,
        tuition_amount=amount, materials_fee=0))
    db.commit()


def test_feature_off_performs_no_188_or_189_reads(records, monkeypatch):
    db, _ = records
    monkeypatch.delenv('MAKEUP_ENTITLEMENT_ENABLED')
    statements = []
    def reject_new_tables(_connection, _cursor, statement, *_args):
        statements.append(statement)
        assert not any(table in statement.lower() for table in (
            'makeup_participation', 'billing_payments', 'billing_payment_lines', 'billing_lesson_claims'))
    event.listen(db.bind, 'before_cursor_execute', reject_new_tables)
    try:
        assert service.eligibility_for_sessions(db, [110], as_of=NOW) == {}
        assert service.academic_policy_students(db, [101]) == set()
        detail = service.participation_detail(db, 101, as_of=NOW)
        assert not detail.enabled and not detail.policy_active and detail.history == []
        assert not service.assert_makeup_entitlement(db, db.get(SessionLog, 110), date(2027, 4, 10), as_of=NOW)
    finally:
        event.remove(db.bind, 'before_cursor_execute', reject_new_tables)
    assert all(statement.lstrip().upper().startswith('SELECT') for statement in statements)


def test_old_six_lesson_root_carries_without_changing_source_or_revenue(records):
    db, _ = records
    source = db.get(SessionLog, 110)
    before = (source.enrollment_id, source.financial_status, db.get(Enrollment, 11).revenue_total,
              db.query(Enrollment).count(), db.query(SessionLog).count())
    result = eligibility(db)
    assert result.can_book and result.valid_until == date(2027, 6, 30)
    assert result.root_session_id == 110
    assert result.advance_booking and result.reason_code == 'MAKEUP_ADVANCE_BOOKING'
    assert (source.enrollment_id, source.financial_status, db.get(Enrollment, 11).revenue_total,
            db.query(Enrollment).count(), db.query(SessionLog).count()) == before


@pytest.mark.parametrize('target,can_book', [(date(2027, 6, 30), True), (date(2027, 7, 1), False)])
def test_makeup_deadline_is_june_not_regular_july_end(records, target, can_book):
    result = eligibility(records[0], target=target)
    assert result.can_book is can_book
    if not can_book:
        assert result.status == 'expired' and result.reason_code == 'MAKEUP_YEAR_ENDED'


@pytest.mark.parametrize('kind,first', [('Summer', date(2026, 9, 4)),
    ('Trial', date(2026, 9, 4)), ('One-Time', date(2026, 9, 4)), ('Regular', date(2025, 9, 5))])
def test_non_cohort_sources_keep_legacy_policy(records, kind, first):
    db, _ = records
    course(db, 31, first, kind=kind)
    db.get(SessionLog, 310).session_status = 'Rescheduled - Pending Make-up'
    db.commit()
    assert eligibility(db, 310) is None


@pytest.mark.parametrize('academic_start,active', [(date(2025, 9, 1), True), (date(2026, 9, 1), False)])
def test_account_must_be_active_for_the_matching_academic_year(records, academic_start, active):
    db, _ = records
    account = db.query(BillingAccount).one()
    account.academic_start, account.active = academic_start, active
    db.commit()
    assert eligibility(db) is None


@pytest.mark.parametrize('payment', ['Pending Payment', 'Overdue', 'Cancelled'])
def test_no_grace_or_active_label_can_replace_current_settlement(records, payment):
    db, _ = records
    db.get(Enrollment, 12).payment_status = payment
    db.commit()
    result = eligibility(db)
    assert not result.can_book and result.status == 'payment_required'
    assert service.participation_detail(db, 101, as_of=NOW).status == 'Active'


def test_authorised_waived_regular_period_counts_as_settled(records):
    db, _ = records
    db.get(Enrollment, 12).payment_status = 'Waived'
    for row in db.query(SessionLog).filter_by(enrollment_id=12):
        row.financial_status = 'Waived'
    db.commit()
    assert eligibility(db).can_book


def test_legacy_extension_weeks_do_not_cover_a_new_unpaid_period(records):
    db, _ = records
    db.get(Enrollment, 12).deadline_extension_weeks = 52
    course(db, 13, date(2027, 4, 5), count=4, payment='Overdue')
    db.commit()
    result = eligibility(db, as_of=date(2027, 4, 6))
    assert not result.can_book and result.status == 'payment_required'


def test_legacy_paid_block_does_not_bridge_months_to_a_later_matching_course(records):
    db, _ = records
    course(db, 31, date(2027, 3, 5), count=4)
    db.commit()
    result = eligibility(db, as_of=date(2027, 1, 15))
    assert not result.can_book and result.status == 'payment_required'


def test_distant_unpaid_next_course_does_not_extend_current_participation(records):
    db, _ = records
    course(db, 31, date(2027, 6, 7), count=4, payment='Overdue')
    db.commit()
    result = eligibility(db, as_of=date(2027, 5, 20))
    assert not result.can_book and result.status == 'payment_required'


def test_normal_weekly_holiday_continuity_keeps_actual_paid_through_date(records):
    db, _ = records
    db.add(Holiday(holiday_date=date(2027, 4, 5), holiday_name='Synthetic Monday closure'))
    db.commit()
    result = eligibility(db, as_of=date(2027, 4, 6))
    assert result.can_book and result.paid_through == date(2027, 3, 29)
    assert not eligibility(db, as_of=date(2027, 4, 12)).can_book


def test_grouped_month_uses_its_reviewed_boundary_without_weekly_grace(records):
    db, _ = records
    grouped_payment(db, 12, date(2027, 3, 31))
    final_day = eligibility(db, as_of=date(2027, 3, 31))
    assert final_day.can_book and final_day.paid_through == date(2027, 3, 31)
    assert not eligibility(db, as_of=date(2027, 4, 1)).can_book


def test_contiguous_prepaid_month_is_covered_before_its_first_teaching_day(records):
    db, _ = records
    grouped_payment(db, 12, date(2027, 3, 31))
    course(db, 13, date(2027, 4, 5), count=4)
    grouped_payment(db, 13, date(2027, 4, 30))
    already_prepaid = eligibility(db, target=date(2027, 4, 15))
    assert already_prepaid.can_book and not already_prepaid.advance_booking
    assert already_prepaid.paid_through == date(2027, 4, 30)
    before_first_class = eligibility(db, as_of=date(2027, 4, 2))
    assert before_first_class.can_book and before_first_class.paid_through == date(2027, 4, 30)


def test_partial_regular_period_cannot_backdate_payment_before_uncovered_lesson(records):
    db, _ = records
    course(db, 13, date(2027, 4, 12), count=3)
    grouped_payment(db, 13, date(2027, 4, 30))
    gap = eligibility(db, as_of=date(2027, 4, 6))
    assert not gap.can_book and gap.status == 'payment_required'
    assert eligibility(db, as_of=date(2027, 4, 13)).can_book


def test_situation_two_first_period_does_not_prepay_earlier_december_lessons(records):
    db, _ = records
    course(db, 13, date(2026, 12, 20), count=7)
    grouped_payment(db, 13, date(2027, 1, 31), kind='situation_two')
    gap = eligibility(db, as_of=date(2026, 12, 10))
    assert not gap.can_book and gap.status == 'payment_required'
    assert eligibility(db, as_of=date(2026, 12, 21)).can_book


def test_corrupted_paid_snapshot_counts_require_review_without_crashing(records):
    db, _ = records
    grouped_payment(db, 12, date(2027, 3, 31))
    payment = db.query(BillingPayment).one()
    snapshot = deepcopy(payment.snapshot)
    snapshot['review']['period']['counts_by_slot'] = []
    payment.snapshot = snapshot
    db.commit()
    result = eligibility(db)
    assert not result.can_book and result.status == 'needs_review'
    assert result.reason_code == 'MAKEUP_PAYMENT_REVIEW'


@pytest.mark.parametrize('corruption', ['missing', 'cycle', 'other_student', 'other_enrollment', 'cancelled'])
def test_invalid_root_chains_require_review_without_guessing_year(records, corruption):
    db, _ = records
    source = db.get(SessionLog, 110)
    child = SessionLog(id=901, enrollment_id=11, student_id=101, tutor_id=2,
        session_date=date(2027, 3, 1), time_slot=source.time_slot, location='MSA',
        session_status='Rescheduled - Pending Make-up', financial_status='Paid', make_up_for_id=110)
    db.add(child)
    if corruption == 'missing':
        child.make_up_for_id = 999
    elif corruption == 'cycle':
        source.make_up_for_id = child.id
    elif corruption == 'other_student':
        source.student_id = 102
    elif corruption == 'other_enrollment':
        source.enrollment_id = 12
    else:
        source.session_status = 'Cancelled'
    db.commit()
    result = eligibility(db, 901)
    assert not result.can_book and result.status == 'needs_review'
    assert result.reason_code == 'MAKEUP_SOURCE_REVIEW'


def test_an_attended_descendant_cannot_be_consumed_again(records):
    db, _ = records
    future_booking(db, status='Attended')
    db.get(SessionLog, 110).session_status = 'Rescheduled - Pending Make-up'
    db.get(SessionLog, 110).rescheduled_to_id = None
    db.commit()
    result = eligibility(db)
    assert not result.can_book and result.reason_code == 'MAKEUP_ALREADY_USED'


def test_only_latest_pending_descendant_can_use_an_unused_root(records):
    db, _ = records
    child = future_booking(db)
    child.session_status = 'Rescheduled - Pending Make-up'
    db.commit()
    assert eligibility(db, 901).can_book
    assert eligibility(db).reason_code == 'MAKEUP_ALREADY_BOOKED'


def test_future_pause_blocks_its_target_while_today_is_still_paid(records):
    db, actor = records
    review = preview(db, effective=date(2027, 4, 1))
    result = commit_change(db, actor, review)
    assert result.status == 'Active' and result.scheduled_status == 'Paused'
    assert eligibility(db, target=date(2027, 3, 25)).can_book
    assert eligibility(db, target=date(2027, 4, 10)).status == 'paused'


def test_pause_preview_is_query_only_and_confirmation_retains_released_history(records):
    db, actor = records
    booking = future_booking(db)
    financial = [(e.id, e.payment_status, e.payment_date, e.revenue_total)
                 for e in db.query(Enrollment).order_by(Enrollment.id)]
    review = preview(db)
    assert review.can_confirm and [b.session_id for b in review.affected_bookings] == [901]
    assert booking.session_status == 'Make-up Class' and db.query(MakeupParticipationEvent).count() == 0
    data = confirmation(review)
    result = service.confirm_participation(db, 101, data, actor, as_of=NOW)
    db.commit()
    assert result.status == 'Paused' and result.history[0].released_session_ids == [901]
    assert booking.session_status == 'Cancelled' and booking.previous_session_status == 'Make-up Class'
    assert booking.make_up_for_id == 110 and booking.financial_status == 'Paid'
    assert db.get(SessionLog, 110).session_status == 'Sick Leave - Pending Make-up'
    assert db.get(SessionLog, 110).rescheduled_to_id is None
    assert [(e.id, e.payment_status, e.payment_date, e.revenue_total)
            for e in db.query(Enrollment).order_by(Enrollment.id)] == financial
    replay = service.confirm_participation(db, 101, data, actor, as_of=NOW)
    assert replay.model_dump() == result.model_dump()
    assert db.query(MakeupParticipationEvent).count() == 1


def test_changed_booking_invalidates_review_without_releasing_anything(records):
    db, actor = records
    booking = future_booking(db)
    review = preview(db)
    booking.time_slot = '11:30 - 13:00'
    db.commit()
    with pytest.raises(DraftConflict):
        service.confirm_participation(db, 101, confirmation(review), actor, as_of=NOW)
    db.rollback()
    assert db.get(SessionLog, 901).session_status == 'Make-up Class'
    assert db.query(MakeupParticipationEvent).count() == 0


def test_failed_event_persistence_rolls_back_release_and_header(records):
    db, actor = records
    future_booking(db)
    review = preview(db)
    def fail_event(_connection, _cursor, statement, *_args):
        if statement.lstrip().lower().startswith('insert into makeup_participation_events'):
            raise RuntimeError('Synthetic late audit persistence failure.')
    event.listen(db.bind, 'before_cursor_execute', fail_event)
    try:
        with pytest.raises(RuntimeError, match='late audit'):
            service.confirm_participation(db, 101, confirmation(review), actor, as_of=NOW)
        db.rollback()
    finally:
        event.remove(db.bind, 'before_cursor_execute', fail_event)
    assert db.get(SessionLog, 901).session_status == 'Make-up Class'
    assert db.get(SessionLog, 110).rescheduled_to_id == 901
    assert db.get(SessionLog, 110).session_status == 'Sick Leave - Make-up Booked'
    assert db.query(MakeupParticipation).count() == db.query(MakeupParticipationEvent).count() == 0


def test_pause_preserves_existing_debt_receipt_and_attendance(records):
    db, actor = records
    pending = course(db, 13, date(2027, 4, 5), count=4, payment='Overdue')
    account = db.query(BillingAccount).one()
    draft = BillingDraft(id='independent-existing-draft', account_id=account.id, current_revision=1)
    db.add(draft)
    db.flush()
    payment = BillingPayment(id='independent-existing-debt', account_id=account.id,
        draft_id=draft.id, draft_revision=1, status='Overdue', version=7,
        snapshot={'synthetic': 'Existing unpaid collection evidence'}, receipt_reference='KMS-HISTORY',
        note='Existing collection note')
    db.add(payment)
    db.flush()
    db.add(BillingPaymentLine(payment_id=payment.id, enrollment_id=pending.id, slot_index=0,
        lesson_count=4, gross_tuition=1600, discount_amount=0, tuition_amount=1600, materials_fee=0))
    taught = future_booking(db, status='Attended')
    review = preview(db, effective=date(2027, 3, 1))
    assert not review.affected_bookings
    assert any('Attendance' in warning for warning in review.warnings)
    commit_change(db, actor, review)
    db.expire_all()
    assert db.get(SessionLog, taught.id).session_status == 'Attended'
    preserved = db.get(BillingPayment, payment.id)
    assert (preserved.status, preserved.version, preserved.receipt_reference, preserved.note) == (
        'Overdue', 7, 'KMS-HISTORY', 'Existing collection note')
    assert preserved.snapshot == {'synthetic': 'Existing unpaid collection evidence'}
    assert db.get(Enrollment, 13).payment_status == 'Overdue'
    assert db.get(Enrollment, 13).revenue_total == 1600


def test_competing_review_and_reused_key_cannot_overwrite_participation(records):
    db, actor = records
    review = preview(db)
    first = commit_change(db, actor, review)
    with pytest.raises(DraftConflict):
        service.confirm_participation(db, 101, confirmation(review, 'competing-review'), actor, as_of=NOW)
    changed = confirmation(review).model_copy(update={'reason': 'A different action under the same key.'})
    with pytest.raises(DraftConflict):
        service.confirm_participation(db, 101, changed, actor, as_of=NOW)
    assert service.participation_detail(db, 101, as_of=NOW).version == first.version == 1


def test_settling_old_debt_does_not_prove_a_new_return_period(records):
    db, actor = records
    commit_change(db, actor, preview(db, status='Left', effective=date(2027, 3, 10)))
    old = db.get(Enrollment, 12)
    old.payment_date = NOW
    db.commit()
    review = preview(db, status='Active', effective=NOW, return_enrollment_id=12)
    assert not review.can_confirm
    assert eligibility(db).status == 'left'


def test_reviewed_new_paid_return_restores_unused_original_june_rights(records):
    db, actor = records
    commit_change(db, actor, preview(db, status='Left', effective=date(2027, 3, 10)))
    course(db, 13, NOW, count=5)
    db.commit()
    review = preview(db, status='Active', effective=NOW, return_enrollment_id=13)
    assert review.can_confirm, review.blocked_reasons
    result = commit_change(db, actor, review, 'independent-return')
    assert result.status == 'Active' and result.history[0].return_enrollment_id == 13
    restored = eligibility(db)
    assert restored.can_book and restored.root_session_id == 110
    assert restored.valid_until == date(2027, 6, 30)


def test_july_payment_cannot_restore_an_expired_academic_right(records):
    db, actor = records
    commit_change(db, actor, preview(db, status='Left', effective=date(2027, 3, 10)))
    course(db, 13, date(2027, 7, 1), count=1)
    db.commit()
    review = preview(db, status='Active', effective=date(2027, 7, 1), return_enrollment_id=13)
    assert not review.can_confirm


def test_source_cannot_be_booked_before_its_original_date(records):
    result = eligibility(records[0], target=date(2026, 9, 3))
    assert not result.can_book and result.reason_code == 'MAKEUP_BEFORE_ORIGINAL'


@pytest.fixture
def http(records, monkeypatch):
    from routers import makeup_entitlement as routes
    db, actor = records
    monkeypatch.setattr(routes, 'today', lambda: NOW)
    app = FastAPI()
    app.include_router(routes.router, prefix='/api')
    app.dependency_overrides[get_current_user] = lambda: actor
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as client:
        yield client, db, actor


@pytest.mark.parametrize('role', ['Tutor', 'Supervisor'])
def test_read_only_staff_can_inspect_but_cannot_change_participation(http, role):
    client, db, actor = http
    actor.id, actor.role = 2, role
    response = client.get('/api/billing/students/101/participation')
    assert response.status_code == 200, response.text
    assert not response.json()['can_manage']
    body = {'status': 'Paused', 'effective_on': NOW.isoformat(), 'reason': 'Forged change.'}
    assert client.post('/api/billing/students/101/participation/preview', json=body).status_code == 403
    review = preview(db)
    assert client.post('/api/billing/students/101/participation',
        json=confirmation(review).model_dump(mode='json')).status_code == 403
    assert db.query(MakeupParticipationEvent).count() == 0


def test_unrelated_tutor_and_forged_tutor_scope_cannot_read_student_facts(http):
    client, _, actor = http
    actor.id, actor.role = 3, 'Tutor'
    assert client.get('/api/billing/students/101/participation').status_code == 404
    assert client.get('/api/makeup/eligibility', params={'session_ids': 110}).status_code == 404
    assert client.get('/api/makeup/eligibility', params={'session_ids': 110, 'tutor_id': 2}).status_code == 403
    assert client.get('/api/billing/students/101/participation', params={'tutor_id': 2}).status_code == 403


def test_mixed_eligibility_batch_does_not_leak_an_unrelated_student(http):
    client, _, actor = http
    actor.id, actor.role = 2, 'Tutor'
    own = client.get('/api/makeup/eligibility', params={'session_ids': 110})
    assert own.status_code == 200 and own.json()['eligibility']['110']['can_book']
    mixed = client.get('/api/makeup/eligibility', params=[('session_ids', 110), ('session_ids', 210)])
    assert mixed.status_code == 404
    assert 'eligibility' not in mixed.json()


def test_http_confirm_replay_and_changed_key_payload_are_safe(http):
    client, db, _ = http
    future_booking(db)
    body = {'status': 'Paused', 'effective_on': NOW.isoformat(), 'reason': 'Reviewed departure.'}
    reviewed = client.post('/api/billing/students/101/participation/preview', json=body)
    assert reviewed.status_code == 200, reviewed.text
    review = reviewed.json()
    data = {**body, 'expected_version': review['version'],
            'expected_review_hash': review['review_hash'], 'idempotency_key': 'independent-http-pause'}
    response = client.post('/api/billing/students/101/participation', json=data)
    assert response.status_code == 200, response.text
    replay = client.post('/api/billing/students/101/participation', json=data)
    assert replay.status_code == 200 and replay.json() == response.json()
    conflict = client.post('/api/billing/students/101/participation', json={**data, 'reason': 'Different reason.'})
    assert conflict.status_code == 409
    assert db.query(MakeupParticipationEvent).count() == 1


def test_disabled_http_reads_work_without_participation_or_payment_storage(http, monkeypatch):
    client, db, _ = http
    monkeypatch.delenv('MAKEUP_ENTITLEMENT_ENABLED')
    def reject_new_storage(_connection, _cursor, statement, *_args):
        assert not any(table in statement.lower() for table in (
            'makeup_participation', 'billing_payments', 'billing_payment_lines', 'billing_lesson_claims'))
    event.listen(db.bind, 'before_cursor_execute', reject_new_storage)
    try:
        response = client.get('/api/billing/students/101/participation')
        assert response.status_code == 200 and not response.json()['enabled']
        response = client.get('/api/makeup/eligibility', params={'session_ids': 110})
        assert response.status_code == 200 and response.json()['eligibility'] == {}
        response = client.post('/api/billing/students/101/participation/preview', json={
            'status': 'Paused', 'effective_on': NOW.isoformat(), 'reason': 'Disabled change.'})
        assert response.status_code == 503
    finally:
        event.remove(db.bind, 'before_cursor_execute', reject_new_storage)
