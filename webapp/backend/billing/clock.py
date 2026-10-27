"""Logical fee dates for an explicitly isolated local test environment.

Authentication expiry and audit timestamps continue to use the real clock.
The optional date file lets a tester advance the fee calendar between runs.
"""
from datetime import date, datetime, timezone
import os
from pathlib import Path
import re
from zoneinfo import ZoneInfo

HK = ZoneInfo('Asia/Hong_Kong')


def test_date() -> date | None:
    filename = os.getenv('BILLING_TEST_DATE_FILE', '').strip()
    if not filename:
        return None
    import database
    if (database.ENVIRONMENT != 'development' or os.getenv('ARK_DEMO') != '1'
            or not (database.DB_NAME or '').endswith('_test')
            or database.engine.url.database != database.DB_NAME):
        raise RuntimeError('The fee test clock requires an isolated local test database.')
    try:
        value = Path(filename).read_text().strip()
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
            raise ValueError('Use YYYY-MM-DD.')
        return date.fromisoformat(value)
    except (OSError, ValueError) as error:
        raise RuntimeError('The fee test date is unavailable or invalid.') from error


def today(current: date | None = None) -> date:
    return test_date() or current or datetime.now(HK).date()


def logical_now() -> datetime:
    now = datetime.now(HK)
    when = test_date()
    if when:
        now = now.replace(year=when.year, month=when.month, day=when.day)
    return now.astimezone(timezone.utc)


def event_time() -> datetime:
    """Time a fee message was sent, kept separate from its real audit entry."""
    return logical_now().replace(tzinfo=None)
