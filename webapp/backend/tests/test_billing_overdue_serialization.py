"""MySQL aggregate types retain the validated overdue response's JSON contract."""
from datetime import date
from decimal import Decimal
import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from billing import guards
from schemas import OverdueEnrollment


@pytest.fixture(autouse=True)
def no_database_connections(monkeypatch):
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'true')
    def reject(*_args):
        raise AssertionError('Overdue serialization checks must not connect to a database.')
    event.listen(Engine, 'do_connect', reject)
    yield
    event.remove(Engine, 'do_connect', reject)


def enrollment(enrollment_id, *, payment_id='synthetic-combined-payment', amount=687, days=1):
    return OverdueEnrollment(
        id=enrollment_id, student_id=101, student_name='Synthetic overdue student',
        school_student_id='SYN001', tutor_id=1, tutor_name='Synthetic tutor',
        first_lesson_date=date(2026, 12, 4), lessons_paid=2, days_overdue=days,
        enrollment_type='Regular', location='MSA', total_fee=amount,
        billing_payment_id=payment_id, billing_managed=payment_id is not None,
    )


def aggregate(payment_id='synthetic-combined-payment', *, amount='1437', lessons='4', lines=2):
    # MySQL returns Decimal for SUM(integer), while COUNT normally returns int.
    return SimpleNamespace(payment_id=payment_id, total_fee=Decimal(amount),
                           lesson_count=Decimal(lessons), line_count=lines)


def query_session(aggregates, payments):
    db = MagicMock(spec=Session)
    aggregate_query, payment_query = MagicMock(), MagicMock()
    aggregate_query.filter.return_value.group_by.return_value.all.return_value = aggregates
    payment_query.filter.return_value.all.return_value = payments
    db.query.side_effect = [aggregate_query, payment_query]
    return db


def payment(payment_id='synthetic-combined-payment', method='manual'):
    return SimpleNamespace(id=payment_id, snapshot={'review': {'period': {'collection': {
        'method': method, 'due_before_lesson': '2026-12-03' if method == 'manual' else None,
        'debit_to': '2026-11-22' if method == 'autopay' else None,
    }}}})


@pytest.mark.parametrize('method,deadline,overdue', [
    ('manual', '2026-12-03', 2), ('autopay', '2026-11-22', 13),
])
@pytest.mark.parametrize('reverse_rows', [False, True])
def test_decimal_aggregates_serialize_as_numbers_for_one_two_line_payment(method, deadline, overdue, reverse_rows):
    rows = [enrollment(11, amount=687), enrollment(12, amount=750)]
    if reverse_rows:
        rows.reverse()
    db = query_session([aggregate()], [payment(method=method)])
    result = guards.combine_overdue_payments(db, rows, date(2026, 12, 5))
    assert len(result) == 1
    row = result[0]
    assert row.id == rows[0].id and row.student_id == 101
    assert row.billing_payment_id == 'synthetic-combined-payment'
    assert row.billing_payment_line_count == 2
    assert row.billing_payment_method == method
    assert row.billing_payment_due_date.isoformat() == deadline and row.days_overdue == overdue
    # Assignment occurs after Pydantic validation. Serializing with warnings
    # treated as errors catches a Decimal slipping into an int response field.
    body = json.loads(row.model_dump_json(warnings='error'))
    assert {name: body[name] for name in (
        'billing_payment_total_fee', 'billing_payment_lesson_count', 'billing_payment_line_count',
    )} == {'billing_payment_total_fee': 1437, 'billing_payment_lesson_count': 4, 'billing_payment_line_count': 2}
    assert all(type(body[name]) is int for name in (
        'billing_payment_total_fee', 'billing_payment_lesson_count', 'billing_payment_line_count',
    ))
    assert row.total_fee == rows[0].total_fee


def test_distinct_combined_payments_and_legacy_debt_keep_their_own_identity():
    legacy = enrollment(15, payment_id=None, amount=800, days=60)
    rows = [enrollment(11), enrollment(12, amount=750), legacy,
            enrollment(21, payment_id='synthetic-other-payment', amount=800),
            enrollment(22, payment_id='synthetic-other-payment', amount=800)]
    db = query_session([
        aggregate(), aggregate('synthetic-other-payment', amount='1600', lessons='4'),
    ], [payment(), payment('synthetic-other-payment')])
    result = guards.combine_overdue_payments(db, rows, date(2026, 12, 5))
    assert len(result) == 3 and result[0] is legacy
    assert [row.billing_payment_id for row in result] == [
        None, 'synthetic-combined-payment', 'synthetic-other-payment',
    ]
    assert [row.id for row in result] == [15, 11, 21]
    payload = [json.loads(row.model_dump_json(warnings='error')) for row in result]
    assert payload[0]['total_fee'] == 800 and payload[0]['billing_payment_total_fee'] is None
    assert [row['billing_payment_total_fee'] for row in payload[1:]] == [1437, 1600]
    assert all(type(row['billing_payment_total_fee']) is int for row in payload[1:])


def test_all_decimal_aggregate_fields_cannot_escape_as_json_strings():
    db = query_session([aggregate(lines=Decimal('2'))], [payment()])
    row = guards.combine_overdue_payments(db, [enrollment(11), enrollment(12)], date(2026, 12, 5))[0]
    encoded = json.loads(row.model_dump_json(warnings='error'))
    assert encoded['billing_payment_line_count'] == 2
    assert type(encoded['billing_payment_line_count']) is int
