"""Read-only CSM collection candidates. Bank submission remains external."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from .schemas import BillingStudent, CollectionWindow, PaymentMethod

AutopayStage = Literal['ready', 'attention', 'prepare', 'skipped']


class AutopayReason(BaseModel):
    code: str
    label: str


class AutopayCounts(BaseModel):
    ready: int = 0
    attention: int = 0
    prepare: int = 0
    skipped: int = 0


class AutopayBankRun(BaseModel):
    """Only this payment's operational follow-up, without batch financial data."""
    id: str
    branch: Literal['MSA', 'MSB']
    collection_month: str
    follow_up: Literal['prepared', 'awaiting_results', 'rejected', 'review', 'record_payment', 'recorded']
    import_id: str | None = None
    reason: str


class AutopayRow(BaseModel):
    key: str
    student: BillingStudent
    stage: AutopayStage
    origin: Literal['payment', 'draft', 'projection']
    payment_id: str | None = None
    payment_version: int | None = None
    payment_status: str | None = None
    draft_id: str | None = None
    collection: CollectionWindow | None = None
    coverage_from: date | None = None
    coverage_through: date | None = None
    lesson_count: int | None = None
    total_fee: int | None = None
    amount_basis: Literal['confirmed', 'estimate', 'unknown'] = 'unknown'
    recorded_payment_method: PaymentMethod | None = None
    mandate_ready: bool | None = None
    sent_at: datetime | None = None
    reasons: list[AutopayReason] = Field(default_factory=list)
    enrollment_ids: list[int] = Field(default_factory=list)
    action_url: str
    # Presentation evidence must not change historical raw export hashes.
    bank_run: AutopayBankRun | None = Field(default=None, exclude_if=lambda value: value is None)


class AutopayResponse(BaseModel):
    as_of: date
    collection_month: str
    confirmed_storage_available: bool
    preparation_available: bool
    notice_from: date
    notice_to: date
    debit_from: date
    debit_to: date
    counts: AutopayCounts
    ready_total: int
    total: int
    offset: int
    limit: int
    rows: list[AutopayRow]
