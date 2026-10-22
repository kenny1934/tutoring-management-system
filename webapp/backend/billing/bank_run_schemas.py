"""Audited saved bank files and reviewed results, independent of bank upload."""
from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator
from .bank_export_schemas import BankExportIssue, BankExportPreview, BankExportPreviewRequest
from .schemas import BillingStudent

RunStatus = Literal['prepared', 'submitted', 'processed', 'needs_attention', 'discarded']


class RunCreate(BankExportPreviewRequest):
    expected_content_hash: str = Field(pattern=r'^[a-f0-9]{64}$')
    idempotency_key: str = Field(min_length=1, max_length=64)


class RunAction(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expected_version: int = Field(ge=1)
    idempotency_key: str = Field(min_length=1, max_length=64)


class RunSubmit(RunAction):
    bank_batch_no: str | None = Field(default=None, max_length=100)

    @field_validator('bank_batch_no')
    @classmethod
    def clean_batch(cls, value):
        return value.strip() or None if value is not None else None


class RunDiscard(RunAction):
    reason: str = Field(min_length=1, max_length=1000)

    @field_validator('reason')
    @classmethod
    def clean_reason(cls, value):
        if not value.strip():
            raise ValueError('Explain why this file is being discarded.')
        return value.strip()


class ResultConfirm(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expected_review_hash: str = Field(pattern=r'^[a-f0-9]{64}$')
    idempotency_key: str = Field(min_length=1, max_length=64)


class ResultRow(BaseModel):
    contract_no: str
    amount: str
    raw_status: str
    reject_code: str
    outcome: Literal['collected', 'rejected', 'unknown', 'conflict']
    reason: str
    student: BillingStudent | None = None
    payment_id: str | None = None
    payment_version: int | None = None
    record_status: Literal['ready', 'recorded', 'review', 'unpaid']


class ResultReview(BaseModel):
    id: str
    run_id: str
    run_version: int
    source_format: str
    bank_batch_no: str
    debit_date: date | None
    currency: str
    report_hash: str
    review_hash: str
    payment_count: int
    total_amount: str | None
    success_count: int
    successful_amount: str | None
    failed_count: int
    failed_amount: str | None
    ready_count: int
    ready_amount: str
    recorded_count: int
    recorded_amount: str
    review_count: int
    issues: list[BankExportIssue]
    rows: list[ResultRow]
    can_confirm: bool


class RunSummary(BaseModel):
    id: str
    version: int
    status: RunStatus
    collection_month: str
    branch: Literal['MSA', 'MSB']
    filename: str
    payment_count: int
    total_amount: str
    content_hash: str
    created_at: datetime
    created_by_name: str
    submitted_at: datetime | None = None
    submitted_by_name: str | None = None
    bank_batch_no: str | None = None
    discarded_at: datetime | None = None
    discard_reason: str | None = None
    latest_import_id: str | None = None


class RunHistory(BaseModel):
    kind: str
    actor_name: str
    created_at: datetime


class RunDetail(RunSummary):
    export_preview: BankExportPreview
    issues: list[BankExportIssue]
    can_submit: bool
    can_discard: bool
    can_download: bool
    can_import_results: bool
    latest_import: ResultReview | None
    history: list[RunHistory]


class RunList(BaseModel):
    storage_available: bool
    writes_available: bool
    runs: list[RunSummary]
