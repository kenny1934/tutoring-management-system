"""Independent synthetic bank-result format and reconciliation acceptance cases."""
from copy import deepcopy
from decimal import Decimal
from html import escape
import json

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing.bank_results import BankReportError, parse_bank_report


@pytest.fixture(autouse=True)
def reject_external_connections():
    def reject(dialect, *_args):
        assert dialect.name == 'sqlite', 'Result verification refuses external database connections.'
    event.listen(Engine, 'do_connect', reject)
    yield
    event.remove(Engine, 'do_connect', reject)


ACCOUNT = '000778899001122'
BATCH = '000004321'
BASE_ROWS = [('MSA00021', '2400.00', 'Successed', ''), ('MSA00022', '2400.00', 'Successed', '')]
META_LABELS = [
    'Debit Batch No.', 'Company Code', 'Business No.', 'Credit Account', 'Credit Amount',
    'Service Charge Currency', 'Service Charge', 'Credit Amount', 'Debit Date',
    'Total No. of Payments', 'Total Amount', 'Successful Count', 'Successful Amount',
    'Count Fail', 'Failed Amount',
]
ZH_LABELS = [
    '收款批號', '公司代碼', '業務編號', '收款賬號', '收款金額', '手續費幣別', '手續費金額',
    '收款金額', '收款日期', '總筆數', '總金額', '成功筆數', '成功金額', '失敗筆數', '失敗金額',
]


def html_report(rows=None, *, language='en', total='4800.00', successful='4800.00', failed='0.00',
                success_count=2, failed_count=0, count=2, date='2026/11/21', currency='MOP',
                batch=BATCH, account=ACCOUNT, credit_amount=None, service_charge='0.00', prefix='', suffix='', mixed_case=False):
    rows = rows or deepcopy(BASE_ROWS)
    labels = ZH_LABELS if language == 'zh' else META_LABELS
    values = [batch, '000031', '000007', account, credit_amount if credit_amount is not None else successful, currency, service_charge, currency,
        date, str(count), total, str(success_count), successful, str(failed_count), failed]
    meta = ''.join('<tr><td>'+escape(label)+'</td><td>'+escape(value)+'</td></tr>' for label, value in zip(labels, values))
    heads = ['合同號', '金額', '備註欄', '狀態', '拒絕碼'] if language == 'zh' else ['Contract No.', 'Amount', 'Remark', 'Status', 'Reject Code']
    body = '<tr>'+''.join('<th>'+escape(value)+'</th>' for value in heads)+'</tr>'
    for contract, amount, status, code in rows:
        body += '<tr>'+''.join('<td>'+escape(value)+'</td>' for value in [contract, amount, '', status, code])+'</tr>'
    text = '<html><body>'+prefix+'<table>'+meta+'</table><table>'+body+'</table>'+suffix+'</body></html>'
    if mixed_case:
        text = text.replace('<table>', '<TaBlE>').replace('</table>', '</TaBlE>').replace('<td>', '<TD>&nbsp;').replace('</td>', '&nbsp;</TD>')
    return text.encode('utf-8')


def txt_report(rows=None, *, date='11212026', batch=BATCH, account=ACCOUNT, currency='MOP',
               success_count=2, successful_cents=480000, failed_count=0, failed_cents=0):
    rows = rows or [(contract, amount, 'P', '') for contract, amount, _status, _code in BASE_ROWS]
    header = [date, 'DD', batch, account, currency, f'{success_count:06d}', f'{successful_cents:011d}',
        f'{failed_count:06d}', f'{failed_cents:011d}', ' '*15]
    lines = [','.join(header)]
    for contract, amount, status, code in rows:
        cents = int(Decimal(amount) * 100)
        lines.append(','.join(['', contract.ljust(20), f'{cents:011d}', status, code.ljust(11), ' '*50]))
    return ('\r\n'.join(lines)+'\r\n\r\n').encode('ascii')


def test_three_native_success_forms_have_one_financial_hash_despite_language_order_and_file_bytes():
    english = parse_bank_report(html_report())
    chinese = parse_bank_report(html_report(rows=[(c,a,'交易成功','') for c,a,_,_ in reversed(BASE_ROWS)], language='zh'))
    coded = parse_bank_report(txt_report())
    assert [result['source_format'] for result in [english, chinese, coded]] == ['html_en', 'html_zh', 'txt']
    assert len({result['source_sha256'] for result in [english, chinese, coded]}) == 3
    assert len({result['report_hash'] for result in [english, chinese, coded]}) == 1
    assert len({result['bank_identity_hash'] for result in [english, chinese, coded]}) == 1
    for result in [english, chinese, coded]:
        assert result['bank_batch_no'] == BATCH and result['debit_date'] == '2026-11-21'
        assert result['currency'] == 'MOP' and result['payment_count'] == result['success_count'] == 2
        assert result['total_amount'] == result['successful_amount'] == '4800.00'
        assert result['failed_count'] == 0 and result['failed_amount'] == '0.00'
        assert {row['contract_no'] for row in result['rows']} == {'MSA00021', 'MSA00022'}
        assert all(row['outcome'] == 'collected' and row['reject_code'] == '' for row in result['rows'])
        assert not result['issues']
        assert ACCOUNT not in json.dumps(result)


def test_duplicate_credit_amount_labels_keep_monetary_value_and_currency_separate():
    result = parse_bank_report(html_report(total='4,800.00', successful='4,800.00', mixed_case=True))
    assert result['currency'] == 'MOP' and result['total_amount'] == '4800.00'
    assert result['successful_amount'] == '4800.00' and not result['issues']


def test_exact_fractional_cents_and_txt_month_day_date_are_preserved():
    rows = [('MSA00021', '0.01', 'P', ''), ('MSA00022', '1234.56', 'P', '')]
    coded = parse_bank_report(txt_report(rows, date='11042026', successful_cents=123457))
    html = parse_bank_report(html_report(rows=[(c,a,'Successed','') for c,a,_,_ in rows],
        total='1,234.57', successful='1,234.57', date='2026/11/04'))
    assert coded['debit_date'] == '2026-11-04'
    assert coded['report_hash'] == html['report_hash']
    assert [row['amount'] for row in coded['rows']] == ['0.01', '1234.56']
    assert coded['total_amount'] == '1234.57' and not coded['issues']


@pytest.mark.parametrize('alias', [' Successed ', 'SUCCESSed', '交易成功', ' p '])
def test_only_confirmed_success_aliases_are_normalised(alias):
    result = parse_bank_report(html_report(rows=[(c,a,alias,'') for c,a,_,_ in BASE_ROWS]))
    assert all(row['outcome'] == 'collected' for row in result['rows'])
    assert not result['issues']


@pytest.mark.parametrize('status', ['Success', 'Succeeded', 'Paid', 'Completed', ''])
def test_unobserved_success_spelling_cannot_become_collected(status):
    result = parse_bank_report(html_report(rows=[(c,a,status,'') for c,a,_,_ in BASE_ROWS]))
    assert all(row['outcome'] == 'unknown' for row in result['rows'])


@pytest.mark.parametrize('code,reason', [('AT0311', 'fund'), ('AT0296', 'limit'), ('AT0168', 'closed'), ('AT0167', 'checking')])
def test_known_rejection_code_explains_an_unobserved_non_success_status(code, reason):
    result = parse_bank_report(html_report(rows=[(c,a,'Unobserved bank rejection status',code) for c,a,_,_ in BASE_ROWS],
        success_count=0, successful='0.00', failed_count=2, failed='4800.00'))
    assert all(row['outcome'] == 'rejected' and row['reject_code'] == code for row in result['rows'])
    assert all(reason in row['reason'].casefold() for row in result['rows'])
    assert not result['issues']


@pytest.mark.parametrize('code', ['AT0311', 'UNKNOWN-CODE'])
def test_success_with_any_rejection_code_is_a_conflict(code):
    result = parse_bank_report(html_report(rows=[(c,a,'Successed',code) for c,a,_,_ in BASE_ROWS]))
    assert all(row['outcome'] == 'conflict' for row in result['rows'])


def test_unknown_status_and_code_remain_held_with_raw_evidence():
    result = parse_bank_report(html_report(rows=[(c,a,'Unrecognised status','AT9999') for c,a,_,_ in BASE_ROWS]))
    assert all(row['outcome'] == 'unknown' and row['raw_status'] == 'Unrecognised status'
        and row['reject_code'] == 'AT9999' for row in result['rows'])


def test_duplicate_contracts_are_not_silently_collapsed():
    result = parse_bank_report(html_report(rows=[BASE_ROWS[0], BASE_ROWS[0]]))
    assert len(result['rows']) == 2 and result['issues']


@pytest.mark.parametrize('changed', [
    {'count': 3}, {'total': '4800.01'}, {'success_count': 1}, {'successful': '4799.99'},
    {'failed_count': 1}, {'failed': '0.01'}, {'credit_amount': '4799.99'},
])
def test_inconsistent_summary_or_credit_amount_is_a_global_issue(changed):
    result = parse_bank_report(html_report(**changed))
    assert result['issues']


def test_partial_unknown_rows_allow_consistent_bounds_but_cannot_hide_known_success_above_summary():
    rows = [BASE_ROWS[0], (BASE_ROWS[1][0], '2400.00', 'Unrecognised status', '')]
    consistent = parse_bank_report(html_report(rows=rows))
    assert [row['outcome'] for row in consistent['rows']] == ['collected', 'unknown']
    inconsistent = parse_bank_report(html_report(rows=rows, success_count=0, successful='0.00', failed_count=2, failed='4800.00'))
    assert inconsistent['issues']


def test_same_bank_identity_with_changed_date_or_financial_outcome_has_a_new_report_hash():
    original = parse_bank_report(html_report())
    date_changed = parse_bank_report(html_report(date='2026/11/22'))
    failed = parse_bank_report(html_report(rows=[(c,a,'Rejected','AT0311') for c,a,_,_ in BASE_ROWS],
        success_count=0, successful='0.00', failed_count=2, failed='4800.00'))
    assert original['bank_identity_hash'] == date_changed['bank_identity_hash'] == failed['bank_identity_hash']
    assert len({result['report_hash'] for result in [original, date_changed, failed]}) == 3


def test_leading_zero_account_identity_is_not_parsed_as_an_integer():
    padded = parse_bank_report(html_report())
    shortened = parse_bank_report(html_report(account=ACCOUNT[1:]))
    assert padded['account_fingerprint'] != shortened['account_fingerprint']
    assert padded['bank_identity_hash'] != shortened['bank_identity_hash']


@pytest.mark.parametrize('currency', ['USD', 'HKD'])
def test_non_mop_currency_is_never_silent(currency):
    result = parse_bank_report(html_report(currency=currency))
    assert result['currency'] == currency and result['issues']


@pytest.mark.parametrize('amount', ['2,40.00', '24,00.00', '2400.001', '-2400.00', '0.00'])
def test_invalid_or_unrepresentable_row_amount_cannot_be_silently_repaired(amount):
    with pytest.raises(BankReportError):
        parse_bank_report(html_report(rows=[('MSA00021', amount, 'Successed', ''), BASE_ROWS[1]]))


def test_invalid_txt_date_is_not_replaced_with_any_filename_or_current_date():
    with pytest.raises(BankReportError):
        parse_bank_report(txt_report(date='02292026'))


def test_multiple_batch_tables_cannot_be_read_as_only_the_first_batch():
    first = html_report().decode('utf-8')
    second = html_report(batch='000004322').decode('utf-8')
    try:
        result = parse_bank_report((first+second).encode('utf-8'))
    except BankReportError:
        return
    assert result['issues'], 'Multiple batches must be rejected or explicitly held.'


def test_script_and_remote_markup_are_not_executed_or_used_as_financial_rows():
    ordinary = parse_bank_report(html_report())
    hostile = parse_bank_report(html_report(prefix='<script>throw new Error("not financial data");</script><img src="https://invalid.example.test/tracker">'))
    assert hostile['report_hash'] == ordinary['report_hash']
    assert hostile['rows'] == ordinary['rows'] and not hostile['issues']


@pytest.mark.parametrize('date', ['1122026', '1212026', '１１２１２０２６'])
def test_txt_date_requires_eight_ascii_digits_before_calendar_parsing(date):
    source = txt_report().decode('ascii')
    source = source.replace('11212026', date, 1).encode('utf-8')
    with pytest.raises(BankReportError):
        parse_bank_report(source)


@pytest.mark.parametrize('changed', [{'credit_amount': '4,80.00'}, {'service_charge': '0.001'},
    {'service_charge': '-1.00'}])
def test_credit_and_service_charge_fields_are_validated_even_when_tuition_totals_match(changed):
    with pytest.raises(BankReportError):
        parse_bank_report(html_report(**changed))


def test_nonzero_service_charge_is_held_without_inventing_net_tuition():
    result = parse_bank_report(html_report(service_charge='1.00', credit_amount='4799.00'))
    assert result['total_amount'] == result['successful_amount'] == '4800.00'
    assert result['issues']
