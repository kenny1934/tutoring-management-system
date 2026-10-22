"""Contracts for regular-course makeup eligibility and reviewed participation."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


ParticipationStatus = Literal['Active', 'Paused', 'Left']


class MakeupParticipationBlock(BaseModel):
    from_date: date
    through_date: date
    status: Literal['Paused', 'Left']


class MakeupEligibility(BaseModel):
    policy: Literal['academic_year'] = 'academic_year'
    status: Literal['available', 'payment_required', 'paused', 'left', 'expired', 'needs_review']
    can_book: bool
    valid_until: date | None = None
    paid_through: date | None = None
    reason: str | None = None
    advance_booking: bool = False
    reason_code: str | None = None
    root_session_id: int | None = None
    participation_blocks: list[MakeupParticipationBlock] = Field(default_factory=list)


class MakeupEligibilityResponse(BaseModel):
    as_of: date
    eligibility: dict[int, MakeupEligibility]


class PaidReturnCandidate(BaseModel):
    enrollment_id: int
    payment_id: str | None = None
    coverage_from: date
    coverage_through: date
    paid_on: date | None = None


class ParticipationHistory(BaseModel):
    id: str
    version: int
    status: ParticipationStatus
    effective_on: date
    reason: str
    return_enrollment_id: int | None = None
    released_session_ids: list[int] = Field(default_factory=list)
    actor_name: str
    created_at: datetime


class ParticipationDetail(BaseModel):
    student_id: int
    enabled: bool
    can_manage: bool = False
    policy_active: bool
    academic_start: date
    status: ParticipationStatus = 'Active'
    effective_on: date | None = None
    scheduled_status: ParticipationStatus | None = None
    scheduled_effective_on: date | None = None
    version: int = 0
    paid_through: date | None = None
    history: list[ParticipationHistory] = Field(default_factory=list)
    return_candidates: list[PaidReturnCandidate] = Field(default_factory=list)


class ParticipationChange(BaseModel):
    model_config = ConfigDict(extra='forbid')
    status: ParticipationStatus
    effective_on: date
    reason: str = Field(min_length=1, max_length=1000)
    return_enrollment_id: int | None = Field(default=None, gt=0)

    @model_validator(mode='after')
    def validate_change(self):
        self.reason = self.reason.strip()
        if not self.reason:
            raise ValueError('Explain this participation change.')
        if self.status != 'Active' and self.return_enrollment_id is not None:
            raise ValueError('Choose a paid return enrollment only when resuming lessons.')
        return self


class ParticipationBooking(BaseModel):
    session_id: int
    source_session_id: int
    root_session_id: int
    session_date: date
    time_slot: str | None
    location: str | None
    tutor_id: int
    tutor_name: str
    exam_revision_slot_id: int | None = None
    action: Literal['release_to_pending'] = 'release_to_pending'


class ParticipationPreview(BaseModel):
    student_id: int
    academic_start: date
    version: int
    change: ParticipationChange
    review_hash: str
    affected_bookings: list[ParticipationBooking]
    warnings: list[str]
    can_confirm: bool
    blocked_reasons: list[str]


class ParticipationConfirm(ParticipationChange):
    expected_version: int = Field(ge=0)
    expected_review_hash: str = Field(pattern=r'^[0-9a-f]{64}$')
    idempotency_key: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z0-9._:-]+$')
