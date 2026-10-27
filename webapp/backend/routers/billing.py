"""Authenticated billing scenarios. These endpoints never create records."""
from decimal import Decimal, InvalidOperation
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user, get_effective_role, resolve_viewed_tutor_id
from billing.calculator import BillingPolicy, preview_billing, previous_month
from billing.clock import today, test_date
from billing.evidence import load_contexts, source_student_ids
from billing.schemas import (
    BillingPreviewRequest, BillingPreviewResponse, BillingRosterPeriod,
    BillingRosterResponse, BillingRosterRow, ContextBasis, StudentBillingContext,
    BillingIntakeContext, BillingPreferenceCounts,
)
from database import get_db
from models import Enrollment, Holiday, Student, Tutor

router = APIRouter()
POLICY = BillingPolicy()
PREVIEW_ROLES = {'Tutor', 'Admin', 'Super Admin', 'Supervisor'}


def preview_role(request: Request, user: Tutor) -> str:
    role = get_effective_role(request, user)
    if role not in PREVIEW_ROLES:
        raise HTTPException(status_code=403, detail='Staff access is required to preview fees.')
    return role


def source_scope(request: Request, user: Tutor, tutor_id: int | None):
    role = preview_role(request, user)
    if role == 'Tutor' or tutor_id is not None:
        return resolve_viewed_tutor_id(user, tutor_id)
    return None


def holiday_dates(db: Session) -> set:
    return {row[0] for row in db.query(Holiday.holiday_date).filter(
        Holiday.holiday_date >= POLICY.academic_start,
        Holiday.holiday_date <= POLICY.regular_end,
    ).all()}


@router.get('/billing/options')
def get_billing_options(request: Request, user: Tutor = Depends(get_current_user)):
    from billing.drafts import storage_enabled
    from billing.workflow import preferences_writes_enabled, workflow_enabled, workflow_storage_enabled
    from billing.queue import queue_available
    from billing.coupon_accounting import storage_enabled as coupon_storage_enabled, writes_enabled as coupon_writes_enabled

    preview_role(request, user)
    return {
        'as_of': today(),
        'test_date': test_date(),
        'academic_start': POLICY.academic_start,
        'first_payment_from': POLICY.transition_from,
        'regular_end': POLICY.regular_end,
        'makeup_end': POLICY.makeup_end,
        'unit_fee': POLICY.unit_fee,
        'first_minimum': POLICY.first_minimum,
        'ordinary_coupon_minimum': POLICY.ordinary_minimum,
        'policy_version': POLICY.version,
        'autopay_first_collection_month': POLICY.pilot_from.strftime('%Y-%m'),
        'autopay_last_collection_month': previous_month(POLICY.regular_end).strftime('%Y-%m'),
        'draft_storage_available': storage_enabled(),
        'workflow_available': workflow_storage_enabled(),
        'workflow_writes_available': workflow_enabled(),
        'preferences_writes_available': preferences_writes_enabled(),
        'queue_available': queue_available(),
        'coupon_storage_available': coupon_storage_enabled(),
        'coupon_writes_available': coupon_writes_enabled(),
    }


@router.post('/billing/preview', response_model=BillingPreviewResponse)
def get_billing_preview(
    data: BillingPreviewRequest,
    request: Request,
    user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    role = preview_role(request, user)
    try:
        return preview_billing(data, holiday_dates(db), policy=POLICY,
                               allow_adjustment=role in {'Admin', 'Super Admin'})
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


def roster_row(context, holidays, preference=None):
    projections = {}
    method_issues = {}
    issues = list(context.issues)
    for method in ('manual', 'autopay'):
        period = None
        if context.suggested_request:
            proposal = preview_billing(context.suggested_request.model_copy(update={'payment_method': method}),
                                       holidays, policy=POLICY)
            method_issues[method] = proposal.issues
            if proposal.periods:
                period = BillingRosterPeriod(**proposal.periods[0].model_dump())
            for issue in proposal.issues:
                if not any(i.code == issue.code for i in issues):
                    issues.append(issue)
        projections[method] = period
    selected = [c for c in context.slot_candidates if c.selected]
    paid = [c.last_paid_original_date for c in selected]
    uncovered = [c.first_uncovered_date for c in selected if c.first_uncovered_date]
    return BillingRosterRow(
        recorded_payment_method=context.recorded_payment_method,
        mandate_ready=context.mandate_ready,
        preference_version=preference.version if preference else 0,
        preference_updated_at=preference.updated_at if preference else None,
        student=context.student, upcoming_original_count=context.upcoming_original_count,
        pending_bill_count=context.pending_bill_count, sent_pending_bill_count=context.sent_pending_bill_count,
        pending_makeup_count=context.pending_makeup_count, slot_candidate_count=len(context.slot_candidates),
        selected_slot_count=len(selected), last_paid_original_date=min(paid) if paid and all(paid) else None,
        first_uncovered_date=min(uncovered) if uncovered else None,
        next_manual=projections['manual'], next_autopay=projections['autopay'],
        issues=issues, requires_review=bool(issues), source_fingerprint=context.source_fingerprint,
        source_issues=context.issues, method_issues=method_issues,
    )


def student_number_order(student):
    try:
        number = Decimal((student.school_student_id or '').strip())
    except InvalidOperation:
        number = Decimal('NaN')
    name = (student.student_name or '').casefold()
    if number.is_finite():
        return (0, number, name, student.id)
    return (1, Decimal(0), name, student.id)


@router.get('/billing/students', response_model=BillingRosterResponse)
def get_billing_students(
    request: Request,
    basis: ContextBasis = 'paid_only',
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    search: str = Query('', max_length=100),
    preference_filter: Literal['all', 'not_recorded', 'manual', 'autopay', 'setup_pending'] = 'all',
    tutor_id: int | None = None,
    location: str | None = Query(None, max_length=100),
    user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scope = source_scope(request, user, tutor_id)
    as_of = today()
    candidates = source_student_ids(db, POLICY, tutor_id=scope, location=location)
    query = db.query(Student.id, Student.school_student_id, Student.student_name).filter(Student.id.in_(candidates))
    if search.strip():
        term = search.strip()
        numeric_id = int(term) if term.isdecimal() and len(term) <= 10 else None
        if numeric_id is not None and numeric_id > 2147483647:
            numeric_id = None
        query = query.filter(or_(Student.student_name.contains(term, autoescape=True),
                                 Student.school_student_id.contains(term, autoescape=True),
                                 Student.id == numeric_id if numeric_id is not None else False))
    # Sort only authorised student identifiers before paging. Python keeps numeric
    # IDs in numeric order without database-specific casts of nonnumeric IDs.
    students = sorted(query.all(), key=student_number_order)
    from billing.workflow import workflow_storage_enabled
    preferences_available = workflow_storage_enabled()
    preferences = {}
    counts = None
    if preferences_available:
        from billing.models import BillingAccount, BillingPreference
        preferences = {sid: preference for preference, sid in db.query(BillingPreference, BillingAccount.student_id).join(
            BillingAccount, BillingAccount.id == BillingPreference.account_id,
        ).filter(BillingAccount.student_id.in_([student.id for student in students]),
                 BillingAccount.academic_start == POLICY.academic_start).all()} if students else {}
        counts = BillingPreferenceCounts(total=len(students))
        for student in students:
            preference = preferences.get(student.id)
            method = preference.payment_method if preference else None
            if method in ('manual', 'autopay'):
                setattr(counts, method, getattr(counts, method) + 1)
                if method == 'autopay' and not preference.mandate_ready:
                    counts.setup_pending += 1
            else:
                counts.not_recorded += 1
        if preference_filter != 'all':
            def matches(student):
                preference = preferences.get(student.id)
                method = preference.payment_method if preference else None
                if preference_filter == 'not_recorded':
                    return method is None
                if preference_filter == 'setup_pending':
                    return method == 'autopay' and not preference.mandate_ready
                return method == preference_filter
            students = [student for student in students if matches(student)]
    elif preference_filter != 'all':
        raise HTTPException(status_code=503, detail='Payment preferences are not available yet.')
    total = len(students)
    ids = [row.id for row in students[offset:offset + limit]]
    holidays = holiday_dates(db)
    try:
        contexts = load_contexts(db, ids, holidays, as_of=as_of, basis=basis, policy=POLICY, isolate_invalid=True)
        rows = [roster_row(contexts[id_], holidays, preferences.get(id_)) for id_ in ids]
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return BillingRosterResponse(as_of=as_of, basis=basis, total=total, offset=offset, limit=limit, rows=rows,
                                 preferences_available=preferences_available, preference_counts=counts)


@router.get('/billing/students/{student_id}/context', response_model=StudentBillingContext)
def get_student_billing_context(
    student_id: int,
    request: Request,
    basis: ContextBasis = 'paid_only',
    tutor_id: int | None = None,
    selected_enrollment_ids: list[int] | None = Query(None, min_length=1, max_length=2),
    user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scope = source_scope(request, user, tutor_id)
    allowed = source_student_ids(db, POLICY, tutor_id=scope).filter(Enrollment.student_id == student_id).first()
    if not allowed:
        raise HTTPException(status_code=404, detail='No regular-course source is available in your student scope.')
    try:
        return load_contexts(db, [student_id], holiday_dates(db), as_of=today(), basis=basis,
                             selected=selected_enrollment_ids, policy=POLICY)[student_id]
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.get('/billing/students/{student_id}/intake-context', response_model=BillingIntakeContext)
def get_student_intake_context(
    student_id: int, request: Request, trial_enrollment_id: int | None = Query(None, gt=0),
    trial_session_id: int | None = Query(None, gt=0), tutor_id: int | None = None,
    user: Tutor = Depends(get_current_user), db: Session = Depends(get_db),
):
    from billing.intake import intake_source
    from routers.billing_drafts import authorise_intake_student, translated
    authorise_intake_student(db, student_id, request, user, tutor_id,
                            trial_enrollment_id=trial_enrollment_id, trial_session_id=trial_session_id)
    return translated(lambda: intake_source(
        db, student_id, as_of=today(), trial_enrollment_id=trial_enrollment_id,
        trial_session_id=trial_session_id, policy=POLICY,
    )[0])
