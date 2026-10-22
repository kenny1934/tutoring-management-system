"""Synthetic legacy-route checks for confirmed grouped payments.

These tests call handlers directly so no server or external connection is used.
SQLite checks the routing and writes; MySQL lock semantics need separate checks.
"""
import asyncio
from datetime import date, datetime

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from database import Base
from billing import guards
from billing.models import BillingAccount, BillingDraft, BillingPayment, BillingPaymentLine, BillingLessonClaim
from models import (Enrollment, SessionLog, Student, Tutor, RegularApplication, RegularCourseConfig,
                    MakeupProposal, MakeupProposalSlot, CalendarEvent, ExamRevisionSlot, TutorMemo)
from routers import enrollments, regular_course, sessions, makeup_proposals, exam_revision
from schemas import (
    EnrollmentCreate, EnrollmentUpdate, BatchEnrollmentRequest, BatchRenewRequest,
    ApplyScheduleChangeRequest, DiscountOverrideRequest, SessionUpdate,
    RegularPublishRequest, ScheduleMakeupRequest, EnrollStudentRequest,
)


@pytest.fixture(autouse=True)
def no_external_connections():
    def reject(dialect, *_args):
        assert dialect.name == "sqlite", "These checks must never connect to application data."
    event.listen(Engine, "do_connect", reject)
    yield
    event.remove(Engine, "do_connect", reject)


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("BILLING_WORKFLOW_ENABLED", "true")
    monkeypatch.setenv("BILLING_WORKFLOW_STORAGE_ENABLED", "false")
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    db = Session(engine, expire_on_commit=False)
    admin = Tutor(id=1, user_email="synthetic@example.test", tutor_name="Synthetic admin", role="Admin", default_location="MSA")
    db.add_all([admin, Student(id=101, student_name="Synthetic student"),
                Student(id=102, student_name="Legacy student")])
    db.flush()
    for eid, sid, when in [(11, 101, date(2026, 12, 4)), (12, 101, date(2026, 12, 5)),
                           (13, 101, date(2026, 10, 2)), (14, 102, date(2026, 10, 2))]:
        db.add(Enrollment(id=eid, student_id=sid, tutor_id=1, assigned_day="Fri",
                          assigned_time="16:00 - 17:30", location="MSA", first_lesson_date=when,
                          lessons_paid=2, enrollment_type="Regular", payment_status="Pending Payment"))
    db.add(BillingAccount(id=1, student_id=101, academic_start=date(2026, 9, 1),
                          policy_version="synthetic-v1", active=True))
    db.flush()
    db.add(BillingDraft(id="draft-1", account_id=1, current_revision=1))
    db.flush()
    db.add(BillingPayment(id="payment-1", account_id=1, draft_id="draft-1", draft_revision=1,
                          status="Pending Payment", snapshot={}))
    db.flush()
    for eid, slot, deduction, materials in [(11, 0, 150, 37), (12, 1, 50, 0)]:
        db.add(BillingPaymentLine(payment_id="payment-1", enrollment_id=eid, slot_index=slot,
                                 lesson_count=2, gross_tuition=800, discount_amount=deduction,
                                 tuition_amount=800-deduction, materials_fee=materials))
    db.add(SessionLog(id=111, enrollment_id=11, student_id=101, tutor_id=1,
                      session_date=date(2026, 12, 4), time_slot="16:00 - 17:30", location="MSA",
                      session_status="Scheduled", financial_status="Unpaid"))
    db.add(SessionLog(id=112, enrollment_id=11, student_id=101, tutor_id=1,
                      session_date=date(2026, 12, 18), time_slot="16:00 - 17:30", location="MSA",
                      session_status="Scheduled", financial_status="Unpaid"))
    db.flush()
    for session_id, day in [(111, 4), (112, 18)]:
        db.add(BillingLessonClaim(payment_id="payment-1", student_id=101, enrollment_id=11,
                                  session_id=session_id, lesson_date=date(2026, 12, day),
                                  time_slot="16:00 - 17:30", location="MSA"))
    db.commit()
    yield db, admin
    db.close()
    engine.dispose()


def assert_blocked(call):
    with pytest.raises(HTTPException) as caught:
        result = call()
        if asyncio.iscoroutine(result):
            asyncio.run(result)
    assert caught.value.status_code == 409
    assert caught.value.detail["code"] == "BILLING_WORKFLOW_REQUIRED"
    assert caught.value.detail["student_id"] == 101


@pytest.mark.parametrize("action", ["update_paid", "update_sent", "update_discount", "batch_paid", "batch_sent",
                                   "cancel", "schedule", "clear_override", "set_override", "renew"])
def test_legacy_routes_cannot_split_grouped_payment(env, action):
    db, admin = env
    before = [(e.id, e.payment_status, e.fee_message_sent, e.lessons_paid) for e in db.query(Enrollment).all()]
    calls = {
        "update_paid": lambda: enrollments.update_enrollment(11, EnrollmentUpdate(payment_status="Paid"), admin, db),
        "update_sent": lambda: enrollments.update_enrollment(11, EnrollmentUpdate(fee_message_sent=True), admin, db),
        "update_discount": lambda: enrollments.update_enrollment(11, EnrollmentUpdate(discount_id=None), admin, db),
        "batch_paid": lambda: enrollments.batch_mark_paid(BatchEnrollmentRequest(enrollment_ids=[14, 11]), db, admin),
        "batch_sent": lambda: enrollments.batch_mark_sent(BatchEnrollmentRequest(enrollment_ids=[14, 11]), db, admin),
        "cancel": lambda: enrollments.cancel_enrollment(11, db, admin),
        "schedule": lambda: enrollments.apply_schedule_change(11, ApplyScheduleChangeRequest(
            assigned_day="Sat", assigned_time="16:00 - 17:30", tutor_id=1, location="MSA", apply_to_sessions=True
        ), db, admin),
        "clear_override": lambda: enrollments.clear_discount_override(11, admin, db),
        "set_override": lambda: enrollments.set_discount_override(11, DiscountOverrideRequest(code="NONE", reason="Synthetic"), admin, db),
        "renew": lambda: enrollments.batch_renew(BatchRenewRequest(enrollment_ids=[14, 11], lessons_paid=6), admin, db),
    }
    assert_blocked(calls[action])
    assert before == [(e.id, e.payment_status, e.fee_message_sent, e.lessons_paid) for e in db.query(Enrollment).all()]
    assert {s.financial_status for s in db.query(SessionLog).all()} == {"Unpaid"}


def test_legacy_creation_requires_billing_for_active_student_year(env):
    db, admin = env
    payload = EnrollmentCreate(student_id=101, tutor_id=1, assigned_day="Fri", assigned_time="16:00 - 17:30",
                               location="MSA", first_lesson_date=date(2027, 1, 8), lessons_paid=6, enrollment_type="Regular")
    assert_blocked(lambda: enrollments.create_enrollment(payload, admin, db))
    assert db.query(Enrollment).count() == 4
    guards.assert_legacy_creation_allowed(db, 102, date(2027, 1, 8))
    guards.assert_legacy_creation_allowed(db, 101, date(2027, 9, 3))
    guards.assert_legacy_creation_allowed(db, 101, date(2027, 1, 8), "Summer")
    guards.assert_legacy_creation_allowed(db, 101, date(2027, 1, 8), "Trial")


def test_old_unlinked_payment_can_be_settled_after_conversion(env):
    db, admin = env
    result = asyncio.run(enrollments.update_enrollment(13, EnrollmentUpdate(payment_status="Paid"), admin, db))
    assert result.payment_status == "Paid"
    assert result.billing_managed is True
    assert result.billing_payment_id is None
    assert db.get(Enrollment, 11).payment_status == "Pending Payment"


def test_old_unlinked_schedule_cannot_be_stretched_after_conversion(env):
    db, admin = env
    assert_blocked(lambda: enrollments.update_enrollment(13, EnrollmentUpdate(lessons_paid=24), admin, db))
    assert db.get(Enrollment, 13).lessons_paid == 2


@pytest.mark.parametrize("changes", [dict(session_date=date(2027, 1, 1)), dict(time_slot="10:00 - 11:30"),
                                    dict(location="MSB"), dict(session_status="Cancelled")])
def test_direct_original_session_structural_edits_are_blocked(env, changes):
    db, admin = env
    assert_blocked(lambda: sessions.update_session(111, SessionUpdate(**changes), admin, db))
    assert db.get(SessionLog, 111).session_status == "Scheduled"
    assert db.get(SessionLog, 111).session_date == date(2026, 12, 4)


def test_status_redo_cannot_cancel_claimed_session(env):
    db, admin = env
    assert_blocked(lambda: sessions.redo_session_status(111, "Cancelled", admin, db))


def test_notes_and_attendance_remain_available(env):
    db, admin = env
    result = asyncio.run(sessions.update_session(111, SessionUpdate(notes="Synthetic note", session_status="Attended"), admin, db))
    assert result.notes == "Synthetic note"
    assert result.session_status == "Attended"
    assert db.get(SessionLog, 111).financial_status == "Unpaid"


def test_fee_message_uses_combined_workflow_and_renewal_data_routes_to_it(env):
    db, admin = env
    assert_blocked(lambda: enrollments.get_fee_message(11, "en", 6, None, admin, db))
    result = enrollments.get_renewal_data(11, admin, db)
    assert result.billing_managed is True
    assert result.billing_payment_id == "payment-1"
    assert result.previous_effective_end_date == date(2026, 12, 18)


def test_fee_and_revenue_helpers_use_allocated_amounts_and_exact_dates(env):
    db, _ = env
    row = db.get(Enrollment, 11)
    assert enrollments.compute_enrollment_total_fee(row, db) == 687
    assert enrollments.enrollment_registration_fee(row, db) == 37
    assert enrollments.compute_enrollment_revenue_total(row, db) == 650
    assert enrollments.calculate_effective_end_date(row, db) == date(2026, 12, 18)
    assert enrollments.calculate_effective_end_date_bulk(row, {}) == date(2026, 12, 18)
    response = enrollments.get_enrollment_detail(11, db)
    assert response.total_fee == 687
    assert response.billing_payment_id == "payment-1"


def test_metadata_is_batched_and_never_queries_new_tables_when_disabled(env, monkeypatch):
    db, _ = env
    rows = db.query(Enrollment).all()
    statements = []
    def capture(_conn, _cursor, statement, *_args):
        statements.append(statement)
    event.listen(db.bind, "before_cursor_execute", capture)
    try:
        metadata = guards.billing_metadata(db, rows)
        assert len(statements) == 4
        assert metadata[13] == {"billing_managed": True, "billing_payment_id": None, "billing_payment_method": None}
        assert metadata[14] == {"billing_managed": False, "billing_payment_id": None, "billing_payment_method": None}
        statements.clear()
        monkeypatch.setenv("BILLING_WORKFLOW_ENABLED", "false")
        guards.billing_metadata(db, rows)
        guards.assert_legacy_enrollments_mutable(db, [11])
        guards.assert_legacy_creation_allowed(db, 101, date(2027, 1, 1))
        assert guards.payment_line(db, rows[0]) is None
        assert statements == []
    finally:
        event.remove(db.bind, "before_cursor_execute", capture)


def test_regular_intake_publish_cannot_create_parallel_legacy_enrollment(env):
    db, admin = env
    db.add(RegularCourseConfig(id=1, year=2026, title="Synthetic intake", course_start_date=date(2026, 9, 1),
                               application_open_date=datetime(2026, 8, 1),
                               application_close_date=datetime(2026, 9, 30)))
    db.flush()
    db.add(RegularApplication(id=1, config_id=1, reference_code="TEST-1", student_name="Synthetic",
                              contact_phone="00000000", grade="F1", preferred_location="MSA",
                              preference_1_day="Friday", preference_1_time="16:00 - 17:30",
                              existing_student_id=101, application_status="Fee Sent"))
    db.commit()
    request = RegularPublishRequest(confirmed_day="Friday", confirmed_time="16:00 - 17:30", tutor_id=1,
                                    first_lesson_date=date(2026, 12, 4), lessons_paid=6, location="MSA")
    assert_blocked(lambda: regular_course.publish_application(1, request, admin, db))
    assert db.query(Enrollment).count() == 4


def test_old_fee_message_and_new_draft_only_account_keep_legacy_behaviour(env):
    db, admin = env
    message = enrollments.get_fee_message(13, "en", 2, None, admin, db)
    assert "Dear Parent" in message["message"]
    account = db.get(BillingAccount, 1)
    account.active = False
    db.commit()
    guards.assert_legacy_creation_allowed(db, 101, date(2027, 1, 1))
    # A linked component remains protected even if an account is deactivated.
    assert_blocked(lambda: guards.assert_legacy_enrollments_mutable(db, [11]))


def test_batch_renew_check_cannot_override_billing_routing(env):
    db, admin = env
    response = asyncio.run(enrollments.batch_renew_check(BatchEnrollmentRequest(enrollment_ids=[11, 13]), admin, db))
    assert response.eligible == []
    assert {row.enrollment_id for row in response.ineligible} == {11, 13}
    assert all(row.billing_managed and not row.overridable and row.reason == "billing_workflow"
               for row in response.ineligible)


def test_renewal_list_metadata_tracks_the_linked_successor(env):
    from schemas import RenewalListItem
    db, _ = env
    row = RenewalListItem(id=13, student_id=101, student_name="Synthetic", tutor_id=1, tutor_name="Synthetic",
                          assigned_day="Fri", assigned_time="16:00 - 17:30", location="MSA",
                          first_lesson_date=date(2026, 10, 2), lessons_paid=2,
                          effective_end_date=date(2026, 10, 9), days_until_expiry=0,
                          payment_status="Paid", renewal_enrollment_id=11)
    response = guards.annotate_billing_response(db, [row])[0]
    assert response.billing_payment_id is None
    assert response.billing_managed is True
    assert response.renewal_billing_payment_id == "payment-1"


def test_earlier_start_cannot_create_lessons_across_active_year_boundary(env):
    db, admin = env
    payload = EnrollmentCreate(student_id=101, tutor_id=1, assigned_day="Fri", assigned_time="10:00 - 11:30",
                               location="MSA", first_lesson_date=date(2026, 8, 21), lessons_paid=6,
                               enrollment_type="Regular")
    assert_blocked(lambda: enrollments.create_enrollment(payload, admin, db))
    assert db.query(Enrollment).count() == 4


def test_earlier_start_with_recorded_roots_in_active_year_is_managed(env):
    db, _ = env
    row = db.get(Enrollment, 13)
    row.first_lesson_date = date(2026, 8, 21)
    db.add(SessionLog(enrollment_id=13, student_id=101, tutor_id=1, session_date=date(2026, 9, 4),
                      time_slot="16:00 - 17:30", location="MSA", session_status="Scheduled"))
    db.commit()
    assert guards.billing_metadata(db, [row])[13]["billing_managed"] is True


@pytest.mark.parametrize("action", ["update", "undo", "redo"])
def test_cancelled_original_cannot_be_restored_outside_billing(env, action):
    db, admin = env
    row = db.get(SessionLog, 111)
    row.session_status = "Cancelled"
    row.previous_session_status = "Scheduled"
    db.commit()
    calls = {
        "update": lambda: sessions.update_session(111, SessionUpdate(session_status="Scheduled"), admin, db),
        "undo": lambda: sessions.undo_session_status(111, admin, db),
        "redo": lambda: sessions.redo_session_status(111, "Scheduled", admin, db),
    }
    assert_blocked(calls[action])
    assert db.get(SessionLog, 111).session_status == "Cancelled"


def test_cancelled_history_keeps_its_boundary_after_claims_are_released(env):
    db, _ = env
    db.query(BillingLessonClaim).delete()
    db.query(SessionLog).update({SessionLog.session_status: "Cancelled"})
    db.commit()
    row = db.get(Enrollment, 11)
    assert enrollments.calculate_effective_end_date(row, db) == date(2026, 12, 18)


@pytest.mark.parametrize("route", ["session", "proposal", "revision"])
def test_all_descendant_creators_lock_and_inherit_grouped_paid_state(env, monkeypatch, route):
    db, admin = env
    original = db.get(SessionLog, 111)
    original.session_status = "Rescheduled - Pending Make-up"
    original.financial_status = "Paid"
    db.get(BillingPayment, "payment-1").status = "Paid"
    db.commit()
    lock_calls = []
    real_lock = guards.lock_student_billing
    def record_lock(session, ids):
        lock_calls.append(ids)
        return real_lock(session, ids)
    monkeypatch.setattr(guards, "lock_student_billing", record_lock)
    if route == "session":
        request = ScheduleMakeupRequest(session_date=date(2026, 12, 5), time_slot="10:00 - 11:30", tutor_id=1, location="MSA")
        asyncio.run(sessions.schedule_makeup(111, request, admin, db))
    elif route == "proposal":
        db.add(MakeupProposal(id=1, original_session_id=111, proposed_by_tutor_id=1, proposal_type="specific_slots"))
        db.flush()
        db.add(MakeupProposalSlot(id=1, proposal_id=1, proposed_date=date(2026, 12, 5),
                                  proposed_time_slot="10:00 - 11:30", proposed_tutor_id=1, proposed_location="MSA"))
        db.commit()
        asyncio.run(makeup_proposals.approve_slot(1, admin, db))
    else:
        db.add(CalendarEvent(id=1, event_id="synthetic", title="Synthetic exam", start_date=date(2026, 12, 6)))
        db.flush()
        db.add(ExamRevisionSlot(id=1, calendar_event_id=1, session_date=date(2026, 12, 5),
                               time_slot="10:00 - 11:30", tutor_id=1, location="MSA"))
        db.commit()
        asyncio.run(exam_revision.enroll_student(1, EnrollStudentRequest(student_id=101, consume_session_id=111), admin, db))
    descendant = db.query(SessionLog).filter(SessionLog.make_up_for_id == 111).one()
    assert descendant.financial_status == "Paid"
    assert descendant.enrollment_id == 11
    assert lock_calls and all(set(ids) == {101} for ids in lock_calls)


def test_cancelled_payment_cannot_gain_makeup_descendants(env):
    db, _ = env
    db.get(BillingPayment, "payment-1").status = "Cancelled"
    db.commit()
    assert_blocked(lambda: guards.lock_billing_session(db, 111))


def test_pausing_new_writes_keeps_existing_grouped_protection_and_amounts(env, monkeypatch):
    db, admin = env
    monkeypatch.setenv("BILLING_WORKFLOW_ENABLED", "false")
    monkeypatch.setenv("BILLING_WORKFLOW_STORAGE_ENABLED", "true")
    assert_blocked(lambda: enrollments.update_enrollment(11, EnrollmentUpdate(payment_status="Paid"), admin, db))
    assert_blocked(lambda: guards.assert_legacy_creation_allowed(db, 101, date(2027, 1, 1)))
    assert enrollments.compute_enrollment_total_fee(db.get(Enrollment, 11), db) == 687


def test_overdue_has_one_combined_task_with_the_collection_deadline(env, monkeypatch):
    db, _ = env
    monkeypatch.setattr(enrollments, "hk_now", lambda: datetime(2026, 11, 23))
    db.get(BillingPayment, "payment-1").snapshot = {
        "review": {"period": {"collection": {"method": "autopay", "debit_to": "2026-11-22"}}}
    }
    for eid in (11, 12):
        db.get(Enrollment, eid).payment_deadline = date(2026, 11, 22)
    db.commit()
    results = enrollments.get_overdue_enrollments(None, None, db)
    assert len(results) == 3
    grouped = [row for row in results if row.billing_payment_id]
    assert len(grouped) == 1
    row = grouped[0]
    assert row.billing_payment_total_fee == 1437
    assert row.billing_payment_lesson_count == 4
    assert row.billing_payment_line_count == 2
    assert row.billing_payment_due_date == date(2026, 11, 22)
    assert row.billing_payment_method == "autopay"
    assert row.days_overdue == 1
    assert row.total_fee in (687, 750)


def test_response_annotation_reuses_primed_metadata(env):
    from schemas import EnrollmentResponse
    db, _ = env
    rows = db.query(Enrollment).all()
    guards.billing_metadata(db, rows)
    responses = [EnrollmentResponse.model_validate(row) for row in rows]
    def no_more_queries(*_args):
        pytest.fail("Response metadata should reuse the list's batch queries.")
    event.listen(db.bind, "before_cursor_execute", no_more_queries)
    try:
        guards.annotate_billing_response(db, responses)
    finally:
        event.remove(db.bind, "before_cursor_execute", no_more_queries)
    assert responses[0].total_fee == 687


def test_grouped_overdue_filter_uses_collection_deadline_when_present(env, monkeypatch):
    db, _ = env
    monkeypatch.setattr(enrollments, "hk_now", lambda: datetime(2026, 11, 23))
    for eid in (11, 12):
        row = db.get(Enrollment, eid)
        row.first_lesson_date = date(2026, 11, 24)
        row.payment_deadline = date(2026, 12, 20)
    db.commit()
    result = enrollments.get_overdue_enrollments(None, None, db)
    assert all(row.billing_payment_id is None for row in result)


@pytest.mark.parametrize("handler", [sessions.mark_session_attended, sessions.mark_session_no_show,
                                     sessions.mark_session_rescheduled, sessions.mark_session_sick_leave,
                                     sessions.mark_session_weather_cancelled])
def test_status_actions_cannot_use_a_cancelled_payment_even_with_stale_scheduled_status(env, handler):
    db, admin = env
    db.get(BillingPayment, "payment-1").status = "Cancelled"
    db.commit()
    assert_blocked(lambda: handler(111, admin, db))
    assert db.get(SessionLog, 111).session_status == "Scheduled"


def test_unlisted_fill_locks_students_and_keeps_cancelled_lessons_waiting(env, monkeypatch):
    from services import unlisted_lessons
    from routers.unlisted_lessons import fill_into_session
    db, admin = env
    db.get(BillingPayment, "payment-1").status = "Cancelled"
    db.get(SessionLog, 111).session_status = "Cancelled"
    memo = TutorMemo(id=1, student_id=101, tutor_id=1, memo_date=date(2026, 12, 4),
                     time_slot="16:00 - 17:30", location="MSA", status="waiting")
    db.add(memo)
    db.commit()
    calls = []
    real_lock = guards.lock_student_billing
    def record_lock(session, ids):
        calls.append(set(ids))
        return real_lock(session, ids)
    monkeypatch.setattr(unlisted_lessons, "lock_student_billing", record_lock)
    assert unlisted_lessons.fill_unlisted_lessons(db, [101], admin.user_email) == []
    assert calls == [{101}]
    assert memo.status == "waiting"
    assert_blocked(lambda: fill_into_session(1, 111, admin, db))


@pytest.mark.parametrize("start", [date(2026, 7, 3), date(2027, 9, 3)])
def test_unlinked_structural_changes_outside_active_year_remain_available(env, start):
    db, admin = env
    row = db.get(Enrollment, 13)
    row.first_lesson_date = start
    db.commit()
    result = asyncio.run(enrollments.update_enrollment(13, EnrollmentUpdate(lessons_paid=3), admin, db))
    assert result.lessons_paid == 3
    assert result.billing_managed is False


def test_backdated_count_expansion_into_active_year_is_blocked(env):
    db, admin = env
    row = db.get(Enrollment, 13)
    row.first_lesson_date = date(2026, 8, 21)
    db.commit()
    assert_blocked(lambda: enrollments.update_enrollment(13, EnrollmentUpdate(lessons_paid=6), admin, db))
    db.rollback()
    assert db.get(Enrollment, 13).lessons_paid == 2


@pytest.mark.parametrize("route", ["session", "schedule"])
def test_old_original_cannot_be_moved_into_active_year(env, monkeypatch, route):
    db, admin = env
    db.get(Enrollment, 13).first_lesson_date = date(2026, 8, 21)
    db.add(SessionLog(id=130, enrollment_id=13, student_id=101, tutor_id=1,
                      session_date=date(2026, 8, 21), time_slot="16:00 - 17:30", location="MSA",
                      session_status="Scheduled", financial_status="Unpaid"))
    db.commit()
    monkeypatch.setattr(enrollments, "hk_now", lambda: datetime(2026, 8, 1))
    if route == "session":
        call = lambda: sessions.update_session(130, SessionUpdate(session_date=date(2026, 9, 4)), admin, db)
    else:
        call = lambda: enrollments.apply_schedule_change(13, ApplyScheduleChangeRequest(
            assigned_day="Fri", assigned_time="16:00 - 17:30", tutor_id=1, location="MSA",
            apply_to_sessions=True, date_overrides={130: "2026-09-04"}), db, admin)
    assert_blocked(call)
    db.rollback()
    assert db.get(SessionLog, 130).session_date == date(2026, 8, 21)


def test_actual_collection_method_overrides_autopay_preference_in_detail_metadata(env):
    db, _ = env
    account = db.get(BillingAccount, 1)
    account.payment_method = "autopay"
    payment = db.get(BillingPayment, "payment-1")
    payment.snapshot = {"review": {"period": {"collection": {"method": "manual"}}}}
    db.commit()
    metadata = guards.billing_metadata(db, db.query(Enrollment).all())
    assert metadata[11]["billing_payment_method"] == "manual"
    assert metadata[13]["billing_payment_method"] is None
    response = enrollments.get_enrollment_detail(11, db)
    assert response.billing_payment_method == "manual"
