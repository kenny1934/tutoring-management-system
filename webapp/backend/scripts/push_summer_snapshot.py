"""Standalone entry point for the daily marketing snapshot push.

Computes today's snapshot for the active summer config and upserts a row into
the configured Google Sheet tab. Idempotent: safe to run multiple times per day.

Required env vars:
    GOOGLE_SA_KEY_B64           — base64 of the GCP service account JSON
    SUMMER_MARKETING_SHEET_ID   — target spreadsheet ID
    SUMMER_MARKETING_SHEET_TAB  — target tab name (default: 'Daily Stats')

Usage:
    cd webapp/backend && ./venv/bin/python scripts/push_summer_snapshot.py
"""
from __future__ import annotations

import logging
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from constants import hk_now
from database import SessionLocal
from services.google_sheets_service import (
    SheetsConfigError,
    upsert_snapshot_row,
)
from services.summer_marketing_snapshot import (
    build_header_row,
    compute_snapshot,
    excluded_reference_codes_from_env,
    snapshot_to_row,
)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    log = logging.getLogger("push_summer_snapshot")

    spreadsheet_id = os.environ.get("SUMMER_MARKETING_SHEET_ID")
    if not spreadsheet_id:
        log.error("SUMMER_MARKETING_SHEET_ID env var is not set")
        return 2
    tab_name = os.environ.get("SUMMER_MARKETING_SHEET_TAB", "Daily Stats")

    db = SessionLocal()
    try:
        from models import SummerCourseConfig

        config = (
            db.query(SummerCourseConfig)
            .filter(SummerCourseConfig.is_active == True)  # noqa: E712
            .first()
        )
        if config is None:
            log.error("No active summer config — nothing to snapshot")
            return 3

        today = hk_now().date()
        snapshot = compute_snapshot(
            db,
            config.id,
            today,
            excluded_reference_codes=excluded_reference_codes_from_env(),
        )

        try:
            result = upsert_snapshot_row(
                spreadsheet_id=spreadsheet_id,
                tab_name=tab_name,
                header_row=build_header_row(),
                data_row=snapshot_to_row(snapshot),
                snapshot_date=today,
            )
        except SheetsConfigError as e:
            log.error("Sheets config error: %s", e)
            return 4

        log.info(
            "Snapshot %s row %s for date %s in tab '%s' (config_id=%s)",
            result["action"],
            result["row_index"],
            today,
            tab_name,
            config.id,
        )
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
