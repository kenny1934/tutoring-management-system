"""Read-only KMS coupon checks. These are not spendable coupon stock."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .coupon_schemas import CouponIssue
from .student_schemas import BillingStudent


class KmsCoupon(BaseModel):
    model_config = ConfigDict(extra='forbid')
    number: str = Field(min_length=1, max_length=80)
    company_id: str = Field(pattern=r'^(MSA|MSB)[0-9]+$')
    value: int = Field(gt=0, le=10000)
    state: Literal['active', 'used']
    issued_on: date | None = None
    expires_on: date | None = None
    used_on: date | None = None
    receipt_reference: str | None = Field(default=None, max_length=100)

    @model_validator(mode='after')
    def complete_coupon(self):
        if self.state == 'active':
            if not self.issued_on or not self.expires_on or self.expires_on < self.issued_on:
                raise ValueError('An active KMS coupon needs valid issue and expiry dates.')
        elif not self.used_on or not (self.receipt_reference or '').strip():
            raise ValueError('A used KMS coupon needs its date and receipt number.')
        return self


class KmsSnapshot(BaseModel):
    model_config = ConfigDict(extra='forbid')
    branch: Literal['MSA', 'MSB']
    fetched_at: datetime
    used_years: list[int]
    active_count: int = Field(ge=0, le=10000)
    coupons: list[KmsCoupon] = Field(max_length=30000)

    @model_validator(mode='after')
    def complete_source(self):
        if self.fetched_at.utcoffset() is None:
            raise ValueError('KMS check time must include its time zone.')
        if (not self.used_years or len(set(self.used_years)) != len(self.used_years)
                or any(not 2000 <= year <= 2200 for year in self.used_years)):
            raise ValueError('Check the KMS usage years.')
        if len({c.number for c in self.coupons}) != len(self.coupons):
            raise ValueError('KMS coupon numbers must be unique within a branch.')
        if sum(c.state == 'active' for c in self.coupons) != self.active_count:
            raise ValueError('The KMS active coupon list is incomplete.')
        for coupon in self.coupons:
            if not coupon.company_id.startswith(self.branch):
                raise ValueError('The KMS coupon belongs to another branch.')
            if coupon.state == 'active':
                if not coupon.issued_on or not coupon.expires_on or coupon.expires_on < coupon.issued_on:
                    raise ValueError('Check the KMS coupon issue and expiry dates.')
            elif not coupon.used_on or coupon.used_on.year not in self.used_years or not coupon.receipt_reference:
                raise ValueError('The KMS usage record needs a date and receipt number.')
        return self


class KmsCouponChange(BaseModel):
    coupon: KmsCoupon
    change: Literal['active', 'new', 'changed', 'used', 'expired', 'missing']
    previous: KmsCoupon | None = None
    newly_used: bool = False
    listed_active: bool = False


class KmsUseMatch(BaseModel):
    use_id: str
    payment_id: str | None = None
    legacy_enrollment_id: int | None = None
    value: int
    receipt_reference: str | None = None
    state: Literal['reserved', 'awaiting_receipt', 'receipt_recorded', 'released']
    result: Literal['reserved', 'awaiting_receipt', 'matched', 'link_receipt', 'review']
    coupon_number: str | None = None
    enrollment_ids: list[int] = Field(default_factory=list)
    payment_date: date | None = Field(default=None, exclude_if=lambda v: v is None)


class KmsStudentReview(BaseModel):
    company_id: str
    student: BillingStudent | None = None
    status: Literal['matched', 'unmatched', 'review']
    active_count: int
    previous_count: int | None = None
    csm_count: int | None = None
    coupons: list[KmsCouponChange]
    uses: list[KmsUseMatch] = Field(default_factory=list)
    issues: list[CouponIssue] = Field(default_factory=list)
    update_status: Literal['ready', 'unchanged', 'review', 'unmatched'] | None = Field(default=None, exclude_if=lambda v: v is None)
    update_issues: list[CouponIssue] = Field(default_factory=list, exclude_if=lambda v: not v)
    available_after: int | None = Field(default=None, exclude_if=lambda v: v is None)


class KmsUpdateSummary(BaseModel):
    review_hash: str
    ready_count: int
    held_count: int
    unchanged_count: int
    can_apply: bool
    issues: list[CouponIssue] = Field(default_factory=list)


class KmsCheckReview(BaseModel):
    id: str
    branch: Literal['MSA', 'MSB']
    fetched_at: datetime
    previous_fetched_at: datetime | None = None
    source_sha256: str
    used_years: list[int]
    active_count: int
    new_count: int
    changed_count: int
    used_count: int
    newly_used_count: int
    expired_count: int
    missing_count: int
    review_count: int
    unmatched_count: int
    students: list[KmsStudentReview]
    update: KmsUpdateSummary | None = Field(default=None, exclude_if=lambda v: v is None)


class KmsCheckSummary(BaseModel):
    id: str
    branch: Literal['MSA', 'MSB']
    fetched_at: datetime
    active_count: int


class KmsPreviewStatus(BaseModel):
    historical_receipts_enabled: bool = Field(default=False, exclude_if=lambda v: not v)
    enabled: bool
    branches: list[Literal['MSA', 'MSB']]
    latest: list[KmsCheckSummary] = Field(default_factory=list)


class KmsCheckRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    branch: Literal['MSA', 'MSB']


class KmsApplyRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expected_review_hash: str = Field(pattern=r'^[a-f0-9]{64}$')
    idempotency_key: str = Field(min_length=1, max_length=64)


class KmsApplyResult(BaseModel):
    check_id: str
    updated_count: int
    held_count: int
    skipped_count: int
    review: KmsCheckReview
