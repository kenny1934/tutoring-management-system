"""Review the complete profile-branch export before downloading its workbook."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .schemas import BillingStudent

BankBranch = Literal['MSA', 'MSB']


class BankExportPreviewRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    collection_month: str = Field(pattern=r'^\d{4}-(0[1-9]|1[0-2])$')
    branch: BankBranch


class BankExportRequest(BankExportPreviewRequest):
    expected_content_hash: str = Field(pattern=r'^[a-f0-9]{64}$')


class BankExportIssue(BaseModel):
    code: str
    message: str
    student_id: int | None = None


class BankExportRow(BaseModel):
    payment_id: str
    payment_version: int
    student: BillingStudent
    # Empty values are shown only in a blocked preview with a matching issue.
    contract_no: str
    amount: str | None


class BankExportPreview(BaseModel):
    collection_month: str
    branch: BankBranch
    payment_count: int
    excluded_claimed_count: int = 0
    total_amount: str | None
    content_hash: str
    filename: str
    rows: list[BankExportRow]
    issues: list[BankExportIssue]
    can_download: bool
