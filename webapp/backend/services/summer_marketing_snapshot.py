"""
Summer marketing snapshot: classify current-year applications into marketing
buckets split by preferred location (MSA/MSB), with pending/converted status
breakdown. Written to a Google Sheet tab as one row per snapshot date.

Bucket taxonomy:
- 中學部回歸 (summer_rt):    verified MSA/MSB + linked student with zero enrollments
- 小學部舊生 (old_primary):  verified primary code + no P6 prospect link
- 現讀中學 (current_sec):    verified MSA/MSB + linked student with >=1 enrollment
- 現讀P6 (p6_feeder):        verified primary code + has P6 prospect link
- 全新生 (new):              verified_branch_origin = 'New'
- 未核對 (unverified):       verified_branch_origin IS NULL

Status groups (Withdrawn/Rejected excluded entirely):
- 已填表 (pending):  Submitted / Under Review / Placement Offered /
                    Placement Confirmed / Fee Sent / Waitlisted
- 成功報讀 (converted): Paid / Enrolled
"""
from __future__ import annotations

import os
from datetime import date
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from constants import (
    PRIMARY_BRANCH_CODES,
    SECONDARY_LOCATION_TO_CODE,
    SummerApplicationStatus,
)
from models import Enrollment, PrimaryProspect, SummerApplication


def excluded_reference_codes_from_env() -> set[str]:
    """Parse SUMMER_MARKETING_EXCLUDED_REFS as comma-separated reference codes.

    Used to drop tester/dev applications (e.g., 'SC2026-UQWH7') from snapshots
    without changing their application status.
    """
    raw = os.environ.get("SUMMER_MARKETING_EXCLUDED_REFS", "")
    return {code.strip() for code in raw.split(",") if code.strip()}


BUCKET_SUMMER_RT = "summer_rt"
BUCKET_OLD_PRIMARY = "old_primary"
BUCKET_CURRENT_SEC = "current_secondary"
BUCKET_P6_FEEDER = "p6_feeder"
BUCKET_NEW = "new"
BUCKET_UNVERIFIED = "unverified"

# Order drives column order in the sheet.
BUCKETS: list[str] = [
    BUCKET_SUMMER_RT,
    BUCKET_OLD_PRIMARY,
    BUCKET_CURRENT_SEC,
    BUCKET_P6_FEEDER,
    BUCKET_NEW,
    BUCKET_UNVERIFIED,
]

BUCKET_LABELS: dict[str, str] = {
    BUCKET_SUMMER_RT: "中學部回歸",
    BUCKET_OLD_PRIMARY: "小學部舊生",
    BUCKET_CURRENT_SEC: "現讀中學",
    BUCKET_P6_FEEDER: "現讀P6",
    BUCKET_NEW: "全新生",
    BUCKET_UNVERIFIED: "未核對",
}

LOCATIONS: list[str] = ["MSA", "MSB"]
SECONDARY_BRANCH_CODES: set[str] = set(LOCATIONS)

_S = SummerApplicationStatus
STATUS_PENDING: set[str] = {
    _S.SUBMITTED.value,
    _S.UNDER_REVIEW.value,
    _S.PLACEMENT_OFFERED.value,
    _S.PLACEMENT_CONFIRMED.value,
    _S.FEE_SENT.value,
    _S.WAITLISTED.value,
}
STATUS_CONVERTED: set[str] = {_S.PAID.value, _S.ENROLLED.value}
STATUS_EXCLUDED: set[str] = {_S.WITHDRAWN.value, _S.REJECTED.value}


def _classify(
    app: SummerApplication,
    student_enrollment_count: int,
    has_prospect_link: bool,
) -> str:
    branch = app.verified_branch_origin
    if branch is None:
        return BUCKET_UNVERIFIED
    if branch == "New":
        return BUCKET_NEW
    if branch in SECONDARY_BRANCH_CODES:
        # Treat secondary-verified-without-link as current-secondary so we
        # don't over-count returning students from data-entry edge cases.
        if app.existing_student_id is None:
            return BUCKET_CURRENT_SEC
        return BUCKET_SUMMER_RT if student_enrollment_count == 0 else BUCKET_CURRENT_SEC
    if branch in PRIMARY_BRANCH_CODES:
        return BUCKET_P6_FEEDER if has_prospect_link else BUCKET_OLD_PRIMARY
    # Unrecognized verified_branch_origin value — surface as unverified so
    # admin is nudged to fix it.
    return BUCKET_UNVERIFIED


def _empty_cells() -> dict[str, dict[str, dict[str, int]]]:
    return {
        loc: {bucket: {"total": 0, "pending": 0, "converted": 0} for bucket in BUCKETS}
        for loc in LOCATIONS
    }


def compute_snapshot(
    db: Session,
    config_id: int,
    as_of_date: date,
    excluded_reference_codes: set[str] | None = None,
) -> dict[str, Any]:
    """Build the snapshot dict for one (config, date) pair.

    excluded_reference_codes: applications with these reference codes are
    dropped before bucketing. Use for test/dev applications that should not
    show up in marketing counts.

    Shape:
        {
            "as_of_date": date,
            "config_id": int,
            "cells": { "MSA": { "summer_rt": {total, pending, converted}, ... }, "MSB": {...} }
        }
    """
    query = (
        db.query(SummerApplication)
        .filter(SummerApplication.config_id == config_id)
        .filter(~SummerApplication.application_status.in_(STATUS_EXCLUDED))
    )
    if excluded_reference_codes:
        query = query.filter(
            ~SummerApplication.reference_code.in_(excluded_reference_codes)
        )
    apps: list[SummerApplication] = query.all()

    linked_student_ids = {
        a.existing_student_id for a in apps if a.existing_student_id is not None
    }
    enrollment_counts: dict[int, int] = {}
    if linked_student_ids:
        rows = (
            db.query(Enrollment.student_id, func.count(Enrollment.id))
            .filter(Enrollment.student_id.in_(linked_student_ids))
            .group_by(Enrollment.student_id)
            .all()
        )
        enrollment_counts = {sid: cnt for sid, cnt in rows}

    app_ids = [a.id for a in apps]
    prospect_linked_app_ids: set[int] = set()
    if app_ids:
        rows = (
            db.query(PrimaryProspect.summer_application_id)
            .filter(PrimaryProspect.summer_application_id.in_(app_ids))
            .all()
        )
        prospect_linked_app_ids = {r[0] for r in rows if r[0] is not None}

    cells = _empty_cells()
    for app in apps:
        location_code = SECONDARY_LOCATION_TO_CODE.get(
            app.preferred_location, app.preferred_location
        )
        if location_code not in LOCATIONS:
            # Form guarantees MSA/MSB, so this should only hit test/legacy data.
            continue

        enrollment_count = 0
        if app.existing_student_id is not None:
            enrollment_count = enrollment_counts.get(app.existing_student_id, 0)

        bucket = _classify(app, enrollment_count, app.id in prospect_linked_app_ids)
        cell = cells[location_code][bucket]
        cell["total"] += 1
        if app.application_status in STATUS_PENDING:
            cell["pending"] += 1
        elif app.application_status in STATUS_CONVERTED:
            cell["converted"] += 1

    return {
        "as_of_date": as_of_date,
        "config_id": config_id,
        "cells": cells,
    }


def build_header_row() -> list[str]:
    """37-column header: 日期 + MSA block (18) + MSB block (18)."""
    header: list[str] = ["日期"]
    for loc in LOCATIONS:
        for bucket in BUCKETS:
            label = BUCKET_LABELS[bucket]
            header.append(f"{loc} {label} 總數")
            header.append(f"{loc} {label} 已填表")
            header.append(f"{loc} {label} 成功報讀")
    return header


def snapshot_to_row(snapshot: dict[str, Any]) -> list[Any]:
    """Flatten a snapshot into a row matching build_header_row()'s column order.

    Column 0 is a `date` object — callers writing to Sheets should use
    USER_ENTERED input mode so the value is stored as a date, not a string.
    """
    row: list[Any] = [snapshot["as_of_date"]]
    for loc in LOCATIONS:
        for bucket in BUCKETS:
            cell = snapshot["cells"][loc][bucket]
            row.extend([cell["total"], cell["pending"], cell["converted"]])
    return row
