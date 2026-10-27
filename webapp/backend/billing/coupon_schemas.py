"""Explicit KMS observations, checked coupon groups and reviewed reconciliation."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .student_schemas import BillingStudent


class CouponIssue(BaseModel):
    code: str
    message: str


class CouponGroupInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    kind: Literal['ordinary', 'staff']
    value: int = Field(gt=0, le=10000, strict=True)
    expires_on: date
    quantity: int = Field(gt=0, le=10000, strict=True)

    @model_validator(mode='after')
    def kind_matches_value(self):
        if (self.kind == 'staff') != (self.value == 500):
            raise ValueError('Use the staff coupon group for MOP500 coupons.')
        return self


class CouponGroup(CouponGroupInput):
    key: str
    usable_count: int


class CouponObservationDetail(BaseModel):
    id: str
    remaining_count: int
    observed_on: date
    processed_at: datetime
    source_filename: str
    source_sha256: str


class CouponUseDetail(BaseModel):
    id: str
    payment_id: str | None
    legacy_enrollment_id: int | None = None
    value: int
    expires_on: date | None
    state: Literal['reserved', 'awaiting_receipt', 'receipt_recorded', 'released']
    accounted_in_observation: bool
    receipt_reference: str | None = None
    coupon_used_on: date | None = None
    payment_date: date | None = Field(default=None, exclude_if=lambda value: value is None)
    received_amount: int | None = Field(default=None, exclude_if=lambda value: value is None)
    first_lesson_date: date | None = Field(default=None, exclude_if=lambda value: value is None)
    last_lesson_date: date | None = Field(default=None, exclude_if=lambda value: value is None)
    lesson_count: int | None = Field(default=None, exclude_if=lambda value: value is None)


class CouponBalance(BaseModel):
    student_id: int
    storage_available: bool
    writes_available: bool
    version: int
    observation: CouponObservationDetail | None = None
    reserved_count: int = 0
    receipt_pending_count: int = 0
    used_awaiting_sync_count: int = 0
    usable_count: int | None = None
    groups: list[CouponGroup] = Field(default_factory=list)
    checked_at: datetime | None = None
    checked_by: str | None = None
    issues: list[CouponIssue] = Field(default_factory=list)
    uses: list[CouponUseDetail] = Field(default_factory=list)
    can_verify: bool = False
    legacy_display: dict | None = None


class CouponReconciliation(BaseModel):
    model_config = ConfigDict(extra='forbid')
    use_id: str
    included_in_observation: bool


class CouponVerificationRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expected_version: int = Field(ge=0)
    observation_id: str
    checked_at: datetime
    groups: list[CouponGroupInput] = Field(max_length=100)
    reconciliations: list[CouponReconciliation] = Field(default_factory=list, max_length=1000)
    reason: str = Field(default='', max_length=5000)

    @model_validator(mode='after')
    def trim_note(self):
        self.reason = self.reason.strip()
        return self


class CouponVerificationConfirm(CouponVerificationRequest):
    expected_review_hash: str = Field(pattern=r'^[a-f0-9]{64}$')
    idempotency_key: str = Field(min_length=1, max_length=64)


class CouponVerificationReview(BaseModel):
    student_id: int
    expected_version: int
    review_hash: str
    balance: CouponBalance
    can_confirm: bool
    issues: list[CouponIssue]


class CouponImportRow(BaseModel):
    row_number: int
    company_id: str
    student: BillingStudent | None = None
    remaining_count: int | None = None
    previous_count: int | None = None
    status: Literal['changed', 'unchanged', 'unmatched', 'invalid']
    coupon_check_required: bool | None = Field(default=None, exclude_if=lambda value: value is None)
    issues: list[CouponIssue] = Field(default_factory=list)


class CouponImportReview(BaseModel):
    id: str
    branch: Literal['MSA', 'MSB']
    observed_on: date
    filename: str
    source_sha256: str
    review_hash: str
    changed_count: int
    unchanged_count: int
    unmatched_count: int
    invalid_count: int
    rows: list[CouponImportRow]
    issues: list[CouponIssue]
    can_confirm: bool
    applied: bool


class CouponImportConfirm(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expected_review_hash: str = Field(pattern=r'^[a-f0-9]{64}$')
    idempotency_key: str = Field(min_length=1, max_length=64)
    acknowledge_unmatched: bool = False
    acknowledge_same_day: bool = False
