"""Reports use grouped originals while unlinked weekly packs keep their bounds."""
from datetime import date
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import select, text

from models import Enrollment
from utils.effective_end import effective_end_sql, ends_within_prefilter_sql, reaches_clause, reaches_sql

# SELECT-only fixtures can also be executed unchanged on isolated native MySQL.
FIXTURES = """
WITH enrollments AS (
 SELECT 1 AS id, '2026-11-06' AS first_lesson_date, 3 AS lessons_paid, 0 AS deadline_extension_weeks
 UNION ALL SELECT 2, '2026-11-06', 2, 0
 UNION ALL SELECT 3, '2026-11-06', 2, 0
 UNION ALL SELECT 4, '2026-11-06', 6, 0
 UNION ALL SELECT 5, '2026-11-06', 2, 0
), billing_payment_lines AS (
 SELECT 1 AS id, 1 AS enrollment_id UNION ALL SELECT 2, 2 UNION ALL SELECT 4, 4 UNION ALL SELECT 5, 5
), session_log AS (
 SELECT 1 AS id, 1 AS enrollment_id, '2026-11-06' AS session_date, NULL AS make_up_for_id, 'Scheduled' AS session_status
 UNION ALL SELECT 2, 1, '2026-11-07', NULL, 'Scheduled'
 UNION ALL SELECT 3, 1, '2026-11-08', NULL, 'Cancelled'
 UNION ALL SELECT 4, 1, '2027-06-01', 1, 'Make-up Class'
 UNION ALL SELECT 5, 2, '2026-11-06', NULL, 'Scheduled'
 UNION ALL SELECT 6, 2, '2027-05-01', NULL, 'Scheduled'
 UNION ALL SELECT 7, 3, '2027-05-01', NULL, 'Scheduled'
 UNION ALL SELECT 8, 5, '2026-11-06', NULL, 'Cancelled'
)
"""


@pytest.fixture(autouse=True)
def storage(monkeypatch):
    monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED', 'true')
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'false')


def rows(db, expression):
    return dict(db.execute(text(FIXTURES + f'SELECT e.id, {expression} FROM enrollments e')).all())


def test_exact_dates_match_detail_with_makeups_cancelled_roots_and_missing_originals(db_session):
    assert rows(db_session, effective_end_sql('e')) == {
        1: '2026-11-08', 2: '2027-05-01', 3: '2026-11-13',
        4: '2026-11-06', 5: '2026-11-06',
    }


@pytest.mark.parametrize('strict,expected', [
    (False, {1: 1, 2: 1, 3: 1, 4: 0, 5: 0}),
    (True, {1: 0, 2: 1, 3: 1, 4: 0, 5: 0}),
])
def test_raw_cutoffs_use_exact_dates_in_both_directions(db_session, strict, expected):
    assert rows(db_session, reaches_sql('e', "'2026-11-08'", strict=strict)) == expected


def test_grouped_dates_are_not_dropped_by_legacy_prefilter(db_session):
    assert rows(db_session, ends_within_prefilter_sql('e', "'2026-11-07'", "'2026-11-08'")) == {
        1: 1, 2: 0, 3: 0, 4: 0, 5: 0,
    }
    # The late exact date sits far beyond the legacy holiday-slack window.
    assert rows(db_session, ends_within_prefilter_sql('e', "'2027-05-01'", "'2027-05-02'")) == {
        1: 0, 2: 1, 3: 0, 4: 0, 5: 0,
    }


def test_retention_orm_cutoff_matches_exact_raw_comparison(db_session):
    query = select(Enrollment.id, reaches_clause(date(2026, 11, 9))).compile(
        db_session.bind, compile_kwargs={'literal_binds': True})
    actual = dict(db_session.execute(text(FIXTURES + str(query))).all())
    assert actual == {1: 0, 2: 1, 3: 1, 4: 0, 5: 0}


def test_storage_off_never_references_unavailable_billing_tables(db_session, monkeypatch):
    monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED', 'false')
    expressions = [effective_end_sql('e'), reaches_sql('e', "'2026-11-09'"),
                   ends_within_prefilter_sql('e', "'2026-11-01'", "'2026-11-30'"),
                   str(select(Enrollment.id).where(reaches_clause(date(2026, 11, 9))))]
    assert all('billing_payment_lines' not in expression and 'session_log' not in expression for expression in expressions)
    assert rows(db_session, effective_end_sql('e'))[1] == '2026-11-20'


def quarters_query():
    from routers import terminations
    db = MagicMock()
    db.execute.return_value.fetchall.return_value = []
    with patch.object(terminations, 'get_summer_pauses', return_value={}):
        terminations.get_available_quarters(None, location=None, current_user=None, db=db)
    return str(db.execute.call_args.args[0])


def quarter_fixtures():
    return FIXTURES.replace('WITH enrollments AS', 'WITH raw_enrollments AS').replace(
        '), billing_payment_lines AS',
        "), enrollments AS (SELECT raw_enrollments.*, id AS student_id, 'Regular' AS enrollment_type, 'Paid' AS payment_status FROM raw_enrollments), students AS (SELECT id, 'MSA' AS home_location FROM raw_enrollments), billing_payment_lines AS")


@pytest.mark.parametrize('enabled,expected', [
    (True, {'2026-11-08', '2027-05-01', '2026-11-13', '2026-11-06'}),
    (False, {'2026-11-20', '2026-11-13', '2026-12-11'}),
])
def test_quarters_route_preserves_identity_before_deduplicating_exact_dates(db_session, monkeypatch, enabled, expected):
    monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED', str(enabled).lower())
    query = quarters_query()
    assert ('SELECT DISTINCT e.id,' in query) is enabled
    actual = db_session.execute(text(quarter_fixtures() + query), {'location': None}).scalars().all()
    assert set(actual) == expected
