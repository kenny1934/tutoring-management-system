"""Compact outstanding KMS receipt tasks, without private payment snapshots."""
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from .schemas import BillingStudent, PreviewIssue


class ReceiptRow(BaseModel):
    payment_id: str
    student: BillingStudent
    first_lesson_date: date | None = None
    last_lesson_date: date | None = None
    lesson_count: int | None = None
    total_amount: int | None = None
    received_amount: int | None = None
    payment_date: date | None = None
    received_method: Literal['cash', 'bank_transfer', 'autopay'] | None = None
    coupon_value: int = 0
    coupon_status: str = 'none'
    receipt_reference: str | None = None
    needs_checking: bool = False
    issues: list[PreviewIssue] = Field(default_factory=list)


class ReceiptCount(BaseModel):
    count: int
    storage_available: bool
    writes_available: bool


class ReceiptList(BaseModel):
    as_of: date
    storage_available: bool
    writes_available: bool
    total: int
    offset: int
    limit: int
    rows: list[ReceiptRow]
