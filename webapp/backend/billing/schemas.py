"""Contracts shared by the calculator and its non-writing API."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from .student_schemas import BillingStudent
from .coupon_schemas import CouponBalance

Weekday = Literal['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
PaymentMethod = Literal['manual', 'autopay']
PreviewMode = Literal['new_student', 'transition', 'regular']


class PreviewSlot(BaseModel):
    model_config = ConfigDict(extra='forbid')
    weekday: Weekday
    time_slot: str = Field(default='', max_length=100)
    location: str = Field(default='', max_length=100)
    # Explicit scenario input, never inferred as verified payment coverage.
    covered_through: date | None = None
    holiday_exceptions: list[date] = Field(default_factory=list, max_length=30)


class CoverageAdjustment(BaseModel):
    model_config = ConfigDict(extra='forbid')
    through: date
    reason: str = Field(min_length=1, max_length=500)

    @model_validator(mode='after')
    def require_reason(self):
        if not self.reason.strip():
            raise ValueError('Explain why the first payment is being adjusted.')
        self.reason = self.reason.strip()
        return self


class PreviewCoupon(BaseModel):
    model_config = ConfigDict(extra='forbid')
    kind: Literal['ordinary', 'staff'] = 'ordinary'
    value: int = Field(gt=0, le=10000)
    verified: bool = False
    expires_on: date | None = None
    available_count: int | None = Field(default=None, ge=0)
    combine_next_month: bool = False

    @model_validator(mode='after')
    def validate_kind(self):
        if (self.kind == 'staff') != (self.value == 500):
            raise ValueError('The $500 voucher must use the staff-voucher rules.')
        return self


class BillingPreviewRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    first_lesson_date: date
    slots: list[PreviewSlot] = Field(min_length=1, max_length=2)
    mode: PreviewMode = 'new_student'
    payment_method: PaymentMethod = 'manual'
    materials_fee: int | None = Field(default=None, ge=0, le=10000)
    trial_deduction: bool = False
    coupon: PreviewCoupon | None = None
    adjustment: CoverageAdjustment | None = None
    mandate_ready: bool = False

    @model_validator(mode='after')
    def validate_choices(self):
        if self.trial_deduction and self.coupon:
            raise ValueError('The trial deduction cannot be combined with a coupon.')
        if self.trial_deduction and self.mode != 'new_student':
            raise ValueError('The trial deduction belongs to the first enrollment payment.')
        keys = [(s.weekday, s.time_slot.strip(), s.location.strip()) for s in self.slots]
        if len(set(keys)) != len(keys):
            raise ValueError('Each weekly slot must be different.')
        if self.mode == 'new_student' and any(s.covered_through for s in self.slots):
            raise ValueError('Use an existing-student preview to enter previous coverage.')
        return self


class BillingGapLesson(BaseModel):
    session_id: int
    enrollment_id: int
    date: date
    status: str
    payment_status: str
    time_slot: str | None = None
    location: str | None = None


class BillingGapEvidence(BaseModel):
    date: date
    weekday: Weekday
    time_slot: str
    location: str
    selected: bool
    enrollment_id: int
    kind: Literal['within_enrollment', 'between_enrollments', 'recorded_unpaid',
                  'recorded_cancelled', 'timetable_difference']
    before: BillingGapLesson | None = None
    after: BillingGapLesson | None = None
    matching_lessons: list[BillingGapLesson] = Field(default_factory=list)
    nearby_lessons: list[BillingGapLesson] = Field(default_factory=list)


class PreviewIssue(BaseModel):
    code: str
    message: str
    period: int | None = None
    gap_evidence: list[BillingGapEvidence] = Field(default_factory=list)


class PreviewLesson(BaseModel):
    date: date
    slot: int
    weekday: Weekday
    time_slot: str
    location: str
    holiday_exception: bool = False


class PeriodCount(BaseModel):
    month: str
    lessons: int


class PreviewDeduction(BaseModel):
    kind: Literal['trial', 'ordinary', 'staff']
    amount: int


class CollectionWindow(BaseModel):
    method: PaymentMethod
    notice_from: date | None = None
    notice_to: date | None = None
    debit_from: date | None = None
    debit_to: date | None = None
    due_before_lesson: date | None = None
    gap_min_days: int | None = None
    gap_max_days: int | None = None


class BillingPreviewPeriod(BaseModel):
    number: int
    kind: str
    explanation: str
    coverage_from: date
    coverage_through: date
    first_lesson_date: date
    last_lesson_date: date
    lesson_count: int
    counts_by_month: list[PeriodCount]
    counts_by_slot: list[int]
    lessons: list[PreviewLesson]
    gross_tuition: int
    deductions: list[PreviewDeduction]
    tuition_after_deductions: int
    materials_fee: int | None
    # Unknown materials do not silently turn into a final payable total.
    total_fee: int | None
    collection: CollectionWindow
    adjustment_reason: str | None = None
    requires_review: bool = False


class SkippedCollection(BaseModel):
    month: str
    covered_by_period: int
    reason: str


class BillingPreviewResponse(BaseModel):
    policy_version: str
    regular_end_date: date
    makeup_end_date: date
    payment_method: PaymentMethod
    monthly: bool
    periods: list[BillingPreviewPeriod]
    skipped_collections: list[SkippedCollection]
    excluded_holidays: list[date]
    issues: list[PreviewIssue]
    requires_review: bool
    is_preview: bool = True
    creates_records: bool = False


ContextBasis = Literal['paid_only', 'include_pending']


class FeeMessagePreview(BaseModel):
    template_version: str
    zh: str | None
    en: str | None
    blocked_reasons: list[str] = Field(default_factory=list)


class RecordedOriginalLesson(BaseModel):
    id: int
    date: date
    status: str
    holiday: bool = False
    time_slot: str | None = None
    location: str | None = None


class BillingSourceBlock(BaseModel):
    enrollment_id: int
    tutor_id: int
    tutor_name: str
    weekday: str | None
    time_slot: str | None
    location: str | None
    first_lesson_date: date | None
    lessons_recorded: int | None
    payment_status: str
    payment_date: date | None
    fee_message_marked_sent: bool
    renewed_from_enrollment_id: int | None
    is_new_student: bool
    originals: list[RecordedOriginalLesson]
    last_original_date: date | None
    makeup_dates: list[date]


class ContinuingSlotCandidate(BaseModel):
    enrollment_id: int
    weekday: str | None
    time_slot: str | None
    location: str | None
    tutor_name: str
    selected: bool
    last_paid_original_date: date | None
    last_retained_original_date: date | None
    first_uncovered_date: date | None


class ImportedCouponSnapshot(BaseModel):
    remaining_count: int
    cached_value: str | None
    synced_at_utc: datetime | None
    verified: bool = False
    accounting: CouponBalance | None = Field(default=None, exclude_if=lambda value: value is None)


class StudentBillingContext(BaseModel):
    student: BillingStudent
    as_of: date
    basis: ContextBasis
    source_blocks: list[BillingSourceBlock]
    slot_candidates: list[ContinuingSlotCandidate]
    selected_enrollment_ids: list[int]
    upcoming_original_count: int
    pending_bill_count: int
    sent_pending_bill_count: int
    pending_makeup_count: int
    coupon_snapshot: ImportedCouponSnapshot | None
    suggested_request: BillingPreviewRequest | None
    issues: list[PreviewIssue]
    requires_review: bool
    source_fingerprint: str
    recorded_payment_method: PaymentMethod | None = None
    mandate_ready: bool | None = None


class BillingIntakeSlot(BaseModel):
    model_config = ConfigDict(extra='forbid')
    tutor_id: int = Field(gt=0)
    renewed_from_enrollment_id: int | None = Field(default=None, gt=0)


class BillingIntakeSource(BaseModel):
    model_config = ConfigDict(extra='forbid')
    trial_enrollment_id: int | None = Field(default=None, gt=0)
    trial_session_id: int | None = Field(default=None, gt=0)
    slots: list[BillingIntakeSlot] = Field(min_length=1, max_length=2)
    materials_override_reason: str | None = Field(default=None, max_length=500)

    @model_validator(mode='after')
    def validate_source(self):
        if (self.trial_enrollment_id is None) != (self.trial_session_id is None):
            raise ValueError('Choose both the trial enrollment and its attended session.')
        if self.materials_override_reason is not None:
            self.materials_override_reason = self.materials_override_reason.strip() or None
        return self


class BillingIntakeTrial(BaseModel):
    enrollment_id: int
    session_id: int
    session_date: date
    time_slot: str
    location: str
    tutor_id: int
    tutor_name: str
    session_status: str


class BillingIntakeContext(BaseModel):
    student: BillingStudent
    source_fingerprint: str
    trial: BillingIntakeTrial | None
    is_new_student: bool
    materials_fee: int | None
    materials_basis: str
    issues: list[PreviewIssue]
    coupon_snapshot: ImportedCouponSnapshot | None
    recorded_payment_method: PaymentMethod | None = None
    mandate_ready: bool | None = None
    suggested_request: BillingPreviewRequest | None = None


class BillingRosterPeriod(BaseModel):
    lesson_count: int
    gross_tuition: int
    coverage_through: date
    first_lesson_date: date
    collection: CollectionWindow


class BillingRosterRow(BaseModel):
    student: BillingStudent
    upcoming_original_count: int
    pending_bill_count: int
    sent_pending_bill_count: int
    pending_makeup_count: int
    slot_candidate_count: int
    selected_slot_count: int
    last_paid_original_date: date | None
    first_uncovered_date: date | None
    next_manual: BillingRosterPeriod | None
    next_autopay: BillingRosterPeriod | None
    issues: list[PreviewIssue]
    requires_review: bool
    source_fingerprint: str
    source_issues: list[PreviewIssue] = Field(default_factory=list)
    method_issues: dict[PaymentMethod, list[PreviewIssue]] = Field(default_factory=dict)


class BillingRosterResponse(BaseModel):
    as_of: date
    basis: ContextBasis
    total: int
    offset: int
    limit: int
    rows: list[BillingRosterRow]


QueueStage = Literal['prepare', 'send', 'awaiting_payment', 'attention', 'no_payment']


QueueUrgency = Literal['now', 'week', 'check_dates', 'later']


class BillingQueueUrgencyCounts(BaseModel):
    now: int = 0
    week: int = 0
    check_dates: int = 0
    later: int = 0


class BillingQueueCounts(BaseModel):
    prepare: int = 0
    send: int = 0
    awaiting_payment: int = 0
    attention: int = 0
    no_payment: int = 0
    total: int = 0
    actionable: int = 0
    overdue: int = 0


class BillingQueueEnrollment(BaseModel):
    enrollment_id: int
    tutor_id: int
    tutor_name: str
    weekday: str | None = None
    time_slot: str | None = None
    location: str | None = None
    first_lesson_date: date | None = None
    effective_end_date: date | None = None
    last_original_date: date | None = None
    last_paid_original_date: date | None = None
    payment_status: str
    lesson_count: int | None = None
    sessions_remaining: int
    fee_message_marked_sent: bool


class BillingQueueRow(BaseModel):
    key: str
    student: BillingStudent
    stage: QueueStage
    origin: Literal['projection', 'draft', 'payment', 'legacy']
    payment_method: PaymentMethod | None = None
    recorded_payment_method: PaymentMethod | None = None
    mandate_ready: bool | None = None
    collection: CollectionWindow | None = None
    first_lesson_date: date | None = None
    coverage_through: date | None = None
    lesson_count: int | None = None
    total_fee: int | None = None
    amount_basis: Literal['reviewed', 'tuition_only', 'unknown'] = 'unknown'
    prepare_on: date | None = None
    due_date: date | None = None
    overdue: bool = False
    ready_now: bool = False
    urgency: QueueUrgency = 'check_dates'
    action_kind: Literal['notice', 'renewal', 'payment'] | None = None
    action_from: date | None = None
    action_by: date | None = None
    draft_id: str | None = None
    payment_id: str | None = None
    enrollment_ids: list[int] = Field(default_factory=list)
    payment_ids: list[str] = Field(default_factory=list)
    current_enrollments: list[BillingQueueEnrollment] = Field(default_factory=list)
    issues: list[PreviewIssue] = Field(default_factory=list)
    note: str
    action_url: str


class BillingQueueResponse(BaseModel):
    as_of: date
    collection_month: str
    counts: BillingQueueCounts
    urgency_counts: BillingQueueUrgencyCounts = Field(default_factory=BillingQueueUrgencyCounts)
    total: int
    offset: int
    limit: int
    rows: list[BillingQueueRow]


class BillingQueueCountResponse(BillingQueueCounts):
    as_of: date
    collection_month: str


class BillingDraftReviewRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    scenario: BillingPreviewRequest
    basis: ContextBasis = 'paid_only'
    selected_enrollment_ids: list[int] = Field(default_factory=list, max_length=2)
    intake: BillingIntakeSource | None = Field(default=None, exclude_if=lambda value: value is None)
    expected_source_fingerprint: str = Field(pattern=r'^[0-9a-f]{64}$')
    period_number: int = Field(default=1, ge=1)
    confirmed_checks: list[Literal['CONTINUING_SLOTS_REVIEW', 'CONTINUATION_UNCONFIRMED', 'HOLIDAY_OPENING_ASSUMED', 'UNPAID_PAST_DATES']] = Field(default_factory=list)

    @model_validator(mode='after')
    def validate_review_source(self):
        if self.intake:
            if self.selected_enrollment_ids:
                raise ValueError('An intake does not select continuing enrollments.')
            if len(self.intake.slots) != len(self.scenario.slots):
                raise ValueError('Choose a tutor for every weekly class.')
            if self.scenario.mode != 'new_student' or self.period_number != 1:
                raise ValueError('An intake prepares the first new-student payment.')
        elif not self.selected_enrollment_ids:
            raise ValueError('Choose the continuing enrollment before reviewing a renewal.')
        return self


class BillingDraftReview(BaseModel):
    student: BillingStudent
    source_fingerprint: str
    evidence_hash: str
    calendar_hash: str
    policy_version: str
    scenario: BillingPreviewRequest
    basis: ContextBasis
    selected_enrollment_ids: list[int]
    intake: BillingIntakeSource | None = Field(default=None, exclude_if=lambda value: value is None)
    confirmed_checks: list[Literal['CONTINUING_SLOTS_REVIEW', 'CONTINUATION_UNCONFIRMED', 'HOLIDAY_OPENING_ASSUMED', 'UNPAID_PAST_DATES']] = Field(default_factory=list)
    period: BillingPreviewPeriod
    issues: list[PreviewIssue]
    message: FeeMessagePreview
    review_hash: str


class BillingDraftSaveRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    review: BillingDraftReviewRequest
    expected_review_hash: str = Field(pattern=r'^[0-9a-f]{64}$')
    idempotency_key: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z0-9._:-]+$')
    note: str | None = Field(default=None, max_length=5000)


class BillingDraftRevisionRequest(BillingDraftSaveRequest):
    expected_revision: int = Field(ge=1)


class BillingDraftDiscardRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expected_revision: int = Field(ge=1)
    idempotency_key: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z0-9._:-]+$')


class BillingDraftSummary(BaseModel):
    id: str
    student_id: int
    current_revision: int
    period_number: int
    lesson_count: int
    total_fee: int | None
    payment_method: PaymentMethod
    coverage_from: date
    coverage_through: date
    created_at: datetime
    updated_at: datetime
    confirmed_payment_id: str | None = None
    state: Literal['active', 'discarded'] = 'active'


class BillingDraftHistory(BaseModel):
    revision: int
    note: str | None
    created_at: datetime
    created_by_name: str
    action: Literal['saved', 'discarded'] = 'saved'


class BillingDraftDetail(BaseModel):
    id: str
    student_id: int
    current_revision: int
    revision: int
    review: BillingDraftReview
    note: str | None
    created_at: datetime
    created_by_name: str
    stale_reasons: list[str]
    can_copy: bool
    history: list[BillingDraftHistory]
    confirmed_payment_id: str | None = None
    state: Literal['active', 'discarded'] = 'active'


class BillingPreferences(BaseModel):
    student_id: int
    payment_method: PaymentMethod | None = None
    mandate_ready: bool = False
    version: int = 0
    updated_at: datetime | None = None


class WorkflowAction(BaseModel):
    model_config = ConfigDict(extra='forbid')
    idempotency_key: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z0-9._:-]+$')


class BillingPreferenceUpdate(WorkflowAction):
    payment_method: PaymentMethod | None
    mandate_ready: bool
    expected_version: int = Field(ge=0)


class BillingConfirmRequest(WorkflowAction):
    expected_revision: int = Field(ge=1)
    expected_review_hash: str = Field(pattern=r'^[0-9a-f]{64}$')
    expected_preference_version: int = Field(ge=1)


class BillingSentRequest(WorkflowAction):
    expected_version: int = Field(ge=1)
    language: Literal['zh', 'en']


class BillingPaidRequest(WorkflowAction):
    expected_version: int = Field(ge=1)
    payment_date: date
    amount: int = Field(gt=0)
    method: Literal['cash', 'bank_transfer', 'autopay']
    receipt_reference: str | None = Field(default=None, max_length=100)
    note: str | None = Field(default=None, max_length=5000)
    coupon_selected: bool | None = Field(default=None, exclude_if=lambda value: value is None)
    coupon_used_on: date | None = Field(default=None, exclude_if=lambda value: value is None)
    acknowledge_duplicate_receipt: bool | None = Field(default=None, exclude_if=lambda value: value is None)


class BillingReceiptRequest(WorkflowAction):
    expected_version: int = Field(ge=1)
    receipt_reference: str = Field(min_length=1, max_length=100)
    coupon_selected: bool | None = Field(default=None, exclude_if=lambda value: value is None)
    coupon_used_on: date | None = Field(default=None, exclude_if=lambda value: value is None)
    acknowledge_duplicate_receipt: bool | None = Field(default=None, exclude_if=lambda value: value is None)


class BillingCancelRequest(WorkflowAction):
    expected_version: int = Field(ge=1)
    reason: str = Field(min_length=1, max_length=500)


class BillingPaymentLineDetail(BaseModel):
    enrollment_id: int
    slot_index: int
    tutor_id: int
    tutor_name: str
    lesson_count: int
    gross_tuition: int
    discount_amount: int
    tuition_amount: int
    materials_fee: int


class BillingPaymentHistory(BaseModel):
    kind: str
    actor_name: str
    created_at: datetime


class BillingPaymentDetail(BaseModel):
    id: str
    student_id: int
    version: int
    status: Literal['Pending Payment', 'Paid', 'Cancelled']
    review: BillingDraftReview
    lines: list[BillingPaymentLineDetail]
    created_at: datetime
    sent_at: datetime | None
    sent_language: Literal['zh', 'en'] | None
    paid_at: datetime | None
    payment_date: date | None
    received_method: str | None
    receipt_reference: str | None
    note: str | None
    coupon_status: Literal['none', 'reserved', 'awaiting_receipt', 'recorded_in_kms']
    can_copy: bool
    review_issues: list[str]
    history: list[BillingPaymentHistory]
