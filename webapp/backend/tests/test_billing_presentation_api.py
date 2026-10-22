"""Keep comparison warnings separate from recorded student facts.

The fixtures below use synthetic enrolments in the normal SQLite test database.
"""
from datetime import date

from tests.test_billing_sources_api import evidence, roster, source_staff


def codes(issues):
    return {issue['code'] for issue in issues}


def test_autopay_setup_check_does_not_become_a_manual_or_source_warning(
    client, source_staff, evidence,
):
    evidence.student()
    evidence.block(dates=[date(2026, 11, 2), date(2026, 11, 9)])
    response = roster(client)
    assert response.status_code == 200, response.text
    row = response.json()['rows'][0]

    assert 'MANDATE_NOT_READY' in codes(row['method_issues']['autopay'])
    assert 'MANDATE_NOT_READY' not in codes(row['method_issues']['manual'])
    assert 'MANDATE_NOT_READY' not in codes(row['source_issues'])
    # Existing clients still receive the complete combined set of checks.
    assert 'MANDATE_NOT_READY' in codes(row['issues'])


def test_unpaid_and_sent_are_source_facts_for_both_comparisons(
    client, source_staff, evidence,
):
    evidence.student()
    evidence.block(dates=[date(2026, 11, 2), date(2026, 11, 9)],
                   status='Pending Payment', sent=True)
    response = roster(client, basis='include_pending')
    assert response.status_code == 200, response.text
    row = response.json()['rows'][0]

    assert row['pending_bill_count'] == 1
    assert row['sent_pending_bill_count'] == 1
    assert {'PENDING_BILLS', 'SENT_BILL_REVIEW', 'PENDING_COVERAGE_ASSUMED'} <= codes(row['source_issues'])
    for method in ('manual', 'autopay'):
        assert 'PENDING_BILLS' not in codes(row['method_issues'][method])
        assert 'SENT_BILL_REVIEW' not in codes(row['method_issues'][method])


def test_autopay_plan_still_exposes_manual_first_bill_and_unknown_materials(
    client, source_staff, evidence,
):
    evidence.student()
    evidence.block(dates=[date(2026, 11, 2), date(2026, 11, 9)],
                   status='Pending Payment', is_new=True)
    response = roster(client)
    assert response.status_code == 200, response.text
    row = response.json()['rows'][0]

    assert row['next_autopay']['collection']['method'] == 'manual'
    assert row['next_manual']['collection']['method'] == 'manual'
    for method in ('manual', 'autopay'):
        assert 'MATERIALS_UNCONFIRMED' in codes(row['method_issues'][method])
    assert row['pending_bill_count'] == 1
