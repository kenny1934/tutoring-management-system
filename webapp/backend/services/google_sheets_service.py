"""
Thin Google Sheets client for the marketing snapshot pipeline.

Auth: reuses GOOGLE_SA_KEY_B64 (the existing Drive service account). Marketing
must share the target sheet with that SA's email as Editor, and the GCP project
must have Sheets API enabled (`gcloud services enable sheets.googleapis.com`).
"""
from __future__ import annotations

import base64
import http.client
import json
import logging
import os
import ssl
import time
from datetime import date
from typing import Any, Callable, TypeVar

logger = logging.getLogger(__name__)

_SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
_sheets_service = None  # cached googleapiclient discovery resource

# On Cloud Run, idle instances get CPU-throttled and intermediaries drop idle
# sockets. The cached httplib2 connection inside _sheets_service then surfaces
# as BrokenPipeError / SSL EOF on the next call. Retry + reset the cache so the
# next attempt builds a fresh TLS connection.
_TRANSIENT_EXCEPTIONS: tuple[type[BaseException], ...] = (
    ConnectionError,  # BrokenPipeError, ConnectionResetError, RemoteDisconnected
    ssl.SSLError,  # UNEXPECTED_EOF_WHILE_READING, etc.
    TimeoutError,
    http.client.BadStatusLine,  # HTTPException, not a ConnectionError
)
_MAX_ATTEMPTS = 3
_BACKOFF_SECONDS = (0.5, 2.0)  # sleeps between attempts 1→2 and 2→3

T = TypeVar("T")


class SheetsConfigError(RuntimeError):
    """Raised when required env vars are missing or auth fails."""


def _get_sheets_service():
    """Build (and cache) a Sheets v4 service using the SA key from env."""
    global _sheets_service
    if _sheets_service is not None:
        return _sheets_service

    sa_key_b64 = os.environ.get("GOOGLE_SA_KEY_B64")
    if not sa_key_b64:
        raise SheetsConfigError("GOOGLE_SA_KEY_B64 env var is not set")

    from google.oauth2 import service_account as sa_module
    from googleapiclient.discovery import build

    try:
        sa_info = json.loads(base64.b64decode(sa_key_b64))
    except Exception as e:
        raise SheetsConfigError(f"GOOGLE_SA_KEY_B64 is not valid base64 JSON: {e}") from e

    creds = sa_module.Credentials.from_service_account_info(
        sa_info, scopes=_SHEETS_SCOPES
    )
    _sheets_service = build("sheets", "v4", credentials=creds, cache_discovery=False)
    return _sheets_service


def _reset_sheets_service() -> None:
    global _sheets_service
    _sheets_service = None


def _execute_with_retry(op: Callable[[Any], T]) -> T:
    """Run op(service) with retry + cache reset on transient connection errors.

    op receives a fresh service each attempt, so a reset forces a new TLS
    connection before the retry. Non-transient errors (4xx/5xx HttpError from
    the API, auth errors, bad input) propagate immediately.
    """
    last_exc: BaseException | None = None
    for attempt in range(_MAX_ATTEMPTS):
        try:
            return op(_get_sheets_service())
        except _TRANSIENT_EXCEPTIONS as e:
            last_exc = e
            logger.warning(
                "[sheets] transient connection error on attempt %d/%d (%s: %s); resetting cached service",
                attempt + 1,
                _MAX_ATTEMPTS,
                type(e).__name__,
                e,
            )
            _reset_sheets_service()
            if attempt < _MAX_ATTEMPTS - 1:
                time.sleep(_BACKOFF_SECONDS[attempt])
    assert last_exc is not None
    raise last_exc


def _quote_tab(tab_name: str) -> str:
    """Wrap tab name in single quotes (Sheets A1 syntax) and escape inner quotes."""
    escaped = tab_name.replace("'", "''")
    return f"'{escaped}'"


def _find_tab_id(spreadsheet_id: str, tab_name: str) -> int | None:
    """Look up a tab's sheetId by title; return None if absent."""
    meta = _execute_with_retry(
        lambda service: service.spreadsheets()
        .get(spreadsheetId=spreadsheet_id, fields="sheets.properties(sheetId,title)")
        .execute()
    )
    for sheet in meta.get("sheets", []):
        props = sheet.get("properties", {})
        if props.get("title") == tab_name:
            return props["sheetId"]
    return None


def _create_tab_with_date_format(spreadsheet_id: str, tab_name: str) -> int:
    """Create the tab and apply a column-A yyyy/M/d format so future appended
    date cells render correctly without a per-push format request."""
    resp = _execute_with_retry(
        lambda service: service.spreadsheets()
        .batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={
                "requests": [
                    {"addSheet": {"properties": {"title": tab_name}}},
                ]
            },
        )
        .execute()
    )
    sheet_id = resp["replies"][0]["addSheet"]["properties"]["sheetId"]
    _execute_with_retry(
        lambda service: service.spreadsheets()
        .batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={
                "requests": [
                    {
                        "repeatCell": {
                            "range": {
                                "sheetId": sheet_id,
                                "startColumnIndex": 0,
                                "endColumnIndex": 1,
                            },
                            "cell": {
                                "userEnteredFormat": {
                                    "numberFormat": {"type": "DATE", "pattern": "yyyy/M/d"}
                                }
                            },
                            "fields": "userEnteredFormat.numberFormat",
                        }
                    }
                ]
            },
        )
        .execute()
    )
    logger.info("[sheets] Created new tab '%s' (id=%s)", tab_name, sheet_id)
    return sheet_id


def _read_column_a(spreadsheet_id: str, tab_name: str) -> list[str]:
    """Return column-A formatted strings (used to find existing date rows)."""
    rng = f"{_quote_tab(tab_name)}!A:A"
    resp = _execute_with_retry(
        lambda service: service.spreadsheets()
        .values()
        .get(
            spreadsheetId=spreadsheet_id,
            range=rng,
            valueRenderOption="FORMATTED_VALUE",
            dateTimeRenderOption="FORMATTED_STRING",
        )
        .execute()
    )
    values = resp.get("values", [])
    return [(row[0] if row else "") for row in values]


def _format_date_for_lookup(d: date) -> str:
    """Match Sheets' default `yyyy/M/d` rendering of a date value (no zero-padding)."""
    return f"{d.year}/{d.month}/{d.day}"


def upsert_snapshot_row(
    spreadsheet_id: str,
    tab_name: str,
    header_row: list[str],
    data_row: list[Any],
    snapshot_date: date,
) -> dict[str, Any]:
    """Write the data_row into the tab, keyed by snapshot_date in column A.

    Behavior:
    - Creates the tab if missing.
    - If the tab is empty, writes header_row first.
    - If a row with snapshot_date exists in column A, updates it in place.
    - Otherwise, appends a new row at the bottom.
    - Date in column A is written via USER_ENTERED so Sheets stores it as a
      real date value, then formatted as yyyy/M/d for display.

    Returns: { "action": "appended" | "updated", "row_index": int (1-based) }
    """
    sheet_id = _find_tab_id(spreadsheet_id, tab_name)
    if sheet_id is None:
        sheet_id = _create_tab_with_date_format(spreadsheet_id, tab_name)
        column_a: list[str] = []
    else:
        column_a = _read_column_a(spreadsheet_id, tab_name)

    if not column_a:
        _execute_with_retry(
            lambda service: service.spreadsheets()
            .values()
            .update(
                spreadsheetId=spreadsheet_id,
                range=f"{_quote_tab(tab_name)}!A1",
                valueInputOption="RAW",
                body={"values": [header_row]},
            )
            .execute()
        )
        column_a = [header_row[0]]

    target_lookup = _format_date_for_lookup(snapshot_date)
    target_row_index: int | None = None
    for i, cell in enumerate(column_a[1:], start=2):  # skip header, 1-based row
        if cell == target_lookup:
            target_row_index = i
            break

    # Write date as ISO so USER_ENTERED parses it as a real date value; the
    # column format applied at tab creation renders it as yyyy/M/d.
    serialized_row: list[Any] = [snapshot_date.isoformat()] + list(data_row[1:])

    if target_row_index is not None:
        _execute_with_retry(
            lambda service: service.spreadsheets()
            .values()
            .update(
                spreadsheetId=spreadsheet_id,
                range=f"{_quote_tab(tab_name)}!A{target_row_index}",
                valueInputOption="USER_ENTERED",
                body={"values": [serialized_row]},
            )
            .execute()
        )
        return {"action": "updated", "row_index": target_row_index}

    resp = _execute_with_retry(
        lambda service: service.spreadsheets()
        .values()
        .append(
            spreadsheetId=spreadsheet_id,
            range=f"{_quote_tab(tab_name)}!A:A",
            valueInputOption="USER_ENTERED",
            insertDataOption="INSERT_ROWS",
            body={"values": [serialized_row]},
        )
        .execute()
    )
    # updates.updatedRange looks like "'Daily Stats'!A42:AK42" — pull the row.
    updated_range = resp.get("updates", {}).get("updatedRange", "")
    try:
        written_row = int(updated_range.rsplit("!", 1)[1].split(":")[0][1:])
    except (IndexError, ValueError):
        written_row = -1
    return {"action": "appended", "row_index": written_row}
