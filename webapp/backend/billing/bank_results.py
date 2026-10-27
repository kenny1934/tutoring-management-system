"""Read the bank's result downloads without changing any payment records.

The Excel download is an HTML table in either language. The TXT download
uses comma-delimited records with amounts in cents. All three representations
share one financial identity, so a second language cannot become a new payment.
"""
import csv
import hashlib
from collections import Counter
from datetime import datetime
from decimal import Decimal, InvalidOperation, localcontext
from html.parser import HTMLParser
from io import StringIO
import json
import re

MAX_BYTES = 2 * 1024 * 1024
MAX_ROWS = 5000
ROW_AMOUNT_LIMIT = Decimal('100000000000')
TOTAL_AMOUNT_LIMIT = Decimal('1000000000000000000')
MONEY = re.compile(r'(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]{1,2})?\Z', re.ASCII)
CONTRACT = re.compile(r'[A-Za-z1-9][A-Za-z0-9-]{0,19}\Z', re.ASCII)
COLLECTED = {'successed', '交易成功', 'p'}
REJECTIONS = {
    'AT0047': 'Contract not found',
    'AT0062': 'Contract number not found',
    'AT0063': 'Direct debit agreement not found',
    'AT0064': 'Direct debit agreement already exists',
    'AT0065': 'Direct debit transaction not found',
    'AT0066': 'Direct debit transaction already exists',
    'AT0167': 'Bank record needs checking',
    'AT0168': 'Account closed',
    'AT0296': 'Amount exceeds direct debit limit',
    'AT0304': 'Direct debit agreement removed',
    'AT0311': 'Insufficient funds',
}
DETAIL_HEADERS = {
    ('contract no.', 'amount', 'remark', 'status', 'reject code'): 'html_en',
    ('合同號', '金額', '備註欄', '狀態', '拒絕碼'): 'html_zh',
}
META_LABELS = {
    'debit batch no.': 'bank_batch_no', '收款批號': 'bank_batch_no',
    'company code': 'company_code', '公司代碼': 'company_code',
    'business no.': 'business_no', '業務編號': 'business_no',
    'credit account': 'credit_account', '收款賬號': 'credit_account',
    'credit amount': 'credit_amount', '收款金額': 'credit_amount',
    'service charge currency': 'charge_currency', '手續費幣別': 'charge_currency',
    'service charge': 'service_charge', '手續費金額': 'service_charge',
    'debit date': 'debit_date', '收款日期': 'debit_date',
    'total no. of payments': 'payment_count', '總筆數': 'payment_count',
    'total amount': 'total_amount', '總金額': 'total_amount',
    'successful count': 'success_count', '成功筆數': 'success_count',
    'successful amount': 'successful_amount', '成功金額': 'successful_amount',
    'count fail': 'failed_count', '失敗筆數': 'failed_count',
    'failed amount': 'failed_amount', '失敗金額': 'failed_amount',
}


class BankReportError(ValueError):
    """The original download cannot be interpreted unambiguously."""


def _clean(value):
    return value.replace('\xa0', ' ').strip()


def _label(value):
    return ' '.join(_clean(value).split()).rstrip(':：').casefold()


def _hash(value):
    data = json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(data).hexdigest()


def _money(value, *, cents=False, positive=False):
    value = _clean(value)
    if len(value) > 32 or not (re.fullmatch(r'[0-9]+', value, re.ASCII) if cents else MONEY.fullmatch(value)):
        raise BankReportError('The report contains an invalid amount.')
    try:
        with localcontext() as context:
            context.prec = 40
            number = Decimal(value.replace(',', '')) / (100 if cents else 1)
            limit = ROW_AMOUNT_LIMIT if positive else TOTAL_AMOUNT_LIMIT
            if number < 0 or number >= limit or (positive and number == 0):
                raise BankReportError('The report contains an unsupported amount.')
            return format(number.quantize(Decimal('0.01')), '.2f')
    except InvalidOperation:
        raise BankReportError('The report contains an invalid amount.') from None


def _count(value):
    value = _clean(value)
    if not re.fullmatch(r'[0-9]{1,8}', value, re.ASCII) or int(value) > MAX_ROWS:
        raise BankReportError('The report contains an invalid payment count.')
    return int(value)


def _date(value, formats):
    for pattern in formats:
        try:
            result = datetime.strptime(_clean(value), pattern).date()
            return result.isoformat()
        except ValueError:
            pass
    raise BankReportError('The report contains an invalid debit date.')


def _identifier(value, label):
    value = _clean(value)
    if not value or len(value) > 100 or any(ord(char) < 32 for char in value):
        raise BankReportError(f'Check the report’s {label}.')
    return value


def _row(contract, amount, status, code):
    contract, status, code = _clean(contract), _clean(status), _clean(code).upper()
    if len(contract) > 100 or len(status) > 100 or len(code) > 100:
        raise BankReportError('The report contains an unsupported transaction row.')
    collected = status.casefold() in COLLECTED
    if collected and code:
        outcome, reason = 'conflict', 'Successful status has a rejection code'
    elif collected:
        outcome, reason = 'collected', 'Collected'
    elif code in REJECTIONS:
        outcome, reason = 'rejected', REJECTIONS[code]
    else:
        outcome, reason = 'unknown', 'Check the bank result'
    return {'contract_no': contract, 'amount': amount, 'raw_status': status,
            'reject_code': code, 'outcome': outcome, 'reason': reason}


class _Tables(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows = []
        self.row = None
        self.cell = None
        self.cell_size = 0
        self.in_table = False

    def handle_starttag(self, tag, attrs):
        if tag == 'table':
            if self.in_table:
                raise BankReportError('The report has an unsupported table layout.')
            self.in_table = True
        elif tag == 'tr' and self.in_table:
            if self.row is not None:
                raise BankReportError('The report contains an incomplete table row.')
            self.row = []
        elif tag in {'td', 'th'} and self.row is not None:
            if self.cell is not None:
                raise BankReportError('The report contains an incomplete table cell.')
            self.cell, self.cell_size = [], 0
        elif tag == 'br' and self.cell is not None:
            self.cell.append(' ')

    def handle_data(self, data):
        if self.cell is not None:
            self.cell_size += len(data)
            if self.cell_size > 4096:
                raise BankReportError('The report contains an oversized field.')
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag in {'td', 'th'} and self.cell is not None:
            self.row.append(_clean(''.join(self.cell)))
            self.cell = None
        elif tag == 'tr' and self.row is not None:
            if self.cell is not None:
                raise BankReportError('The report contains an incomplete table row.')
            self.rows.append(self.row)
            self.row = None
            if len(self.rows) > MAX_ROWS + 100:
                raise BankReportError('The report contains too many payments.')
        elif tag == 'table':
            if self.row is not None or self.cell is not None:
                raise BankReportError('The report contains an incomplete table.')
            self.in_table = False


def _html(text):
    parser = _Tables()
    parser.feed(text)
    parser.close()
    if parser.in_table or parser.row is not None or parser.cell is not None:
        raise BankReportError('The report contains an incomplete table.')
    rows = [row for row in parser.rows if any(row)]
    heads = [(index, DETAIL_HEADERS[tuple(_label(cell) for cell in row)])
             for index, row in enumerate(rows) if tuple(_label(cell) for cell in row) in DETAIL_HEADERS]
    if len(heads) != 1:
        raise BankReportError('Upload the original results file for one bank batch.')
    index, source_format = heads[0]
    metadata = {}
    for row in rows[:index]:
        if len(row) not in {2, 4}:
            raise BankReportError('The report has an unsupported summary layout.')
        for offset in range(0, len(row), 2):
            key = META_LABELS.get(_label(row[offset]))
            if key is None:
                raise BankReportError('The report has an unrecognised summary field.')
            value = _clean(row[offset + 1])
            # The bank repeats Credit Amount for its currency field in both
            # languages. Keep its monetary and currency values separately.
            if key == 'credit_amount' and re.fullmatch(r'[A-Za-z]{3}', value, re.ASCII):
                key = 'currency'
                value = value.upper()
            if key in metadata:
                raise BankReportError('The file contains repeated bank batch details. Upload one batch.')
            metadata[key] = value
    required = {'bank_batch_no', 'credit_account', 'credit_amount', 'service_charge', 'charge_currency', 'currency', 'debit_date', 'payment_count',
                'total_amount', 'success_count', 'successful_amount', 'failed_count', 'failed_amount'}
    if not required.issubset(metadata):
        raise BankReportError('The report is missing bank batch details or totals.')
    detail = rows[index + 1:]
    if not detail or len(detail) > MAX_ROWS or any(len(row) != 5 for row in detail):
        raise BankReportError('The report has an unsupported payment table.')
    result = {'source_format': source_format,
              'bank_batch_no': _identifier(metadata['bank_batch_no'], 'batch number'),
              'credit_account': _identifier(metadata['credit_account'], 'credit account'),
              'credit_amount': _money(metadata['credit_amount']),
              'service_charge': _money(metadata['service_charge']),
              'charge_currency': metadata['charge_currency'].upper(),
              'currency': metadata['currency'],
              'debit_date': _date(metadata['debit_date'], ('%Y/%m/%d', '%Y-%m-%d')),
              'rows': [_row(row[0], _money(row[1], positive=True), row[3], row[4]) for row in detail]}
    for key in ('payment_count', 'success_count', 'failed_count'):
        result[key] = _count(metadata[key])
    for key in ('total_amount', 'successful_amount', 'failed_amount'):
        result[key] = _money(metadata[key])
    return result


def _txt(text):
    try:
        records = [row for row in csv.reader(StringIO(text), strict=True) if any(_clean(cell) for cell in row)]
    except csv.Error:
        raise BankReportError('The bank TXT file contains an invalid record.') from None
    if len(records) < 2 or len(records) > MAX_ROWS + 1:
        raise BankReportError('The report must contain payments for one bank batch.')
    head, *detail = records
    if len(head) != 10 or _clean(head[1]) != 'DD' or _clean(head[9]):
        raise BankReportError('The TXT file has an unsupported bank batch header.')
    if not re.fullmatch(r'[0-9]{8}', _clean(head[0]), re.ASCII):
        raise BankReportError('The TXT file contains an invalid debit date.')
    if any(len(row) != 6 or _clean(row[0]) for row in detail):
        raise BankReportError('The TXT file has an unsupported payment record.')
    success_count, failed_count = _count(head[5]), _count(head[7])
    successful_amount, failed_amount = _money(head[6], cents=True), _money(head[8], cents=True)
    return {'source_format': 'txt', 'bank_batch_no': _identifier(head[2], 'batch number'),
            'credit_account': _identifier(head[3], 'credit account'), 'currency': _clean(head[4]).upper(),
            'debit_date': _date(head[0], ('%m%d%Y',)),
            'payment_count': success_count + failed_count,
            'total_amount': format(Decimal(successful_amount) + Decimal(failed_amount), '.2f'),
            'success_count': success_count, 'successful_amount': successful_amount,
            'failed_count': failed_count, 'failed_amount': failed_amount,
            'rows': [_row(row[1], _money(row[2], cents=True, positive=True), row[3], row[4]) for row in detail]}


def _issues(report):
    issues = []

    def check(condition, code, message):
        if not condition:
            issues.append({'code': code, 'message': message})

    rows = report['rows']
    check(report['currency'] == 'MOP', 'CURRENCY', 'The bank currency must be MOP.')
    if report['source_format'] != 'txt':
        fee = Decimal(report['service_charge'])
        check(fee == 0, 'SERVICE_CHARGE', 'Check this report’s bank service charge before recording payments.')
        check(report['charge_currency'] == 'MOP', 'CHARGE_CURRENCY', 'Check the bank service charge currency.')
        check(fee != 0 or Decimal(report['credit_amount']) == Decimal(report['successful_amount']),
              'CREDIT_AMOUNT', 'The bank credit amount does not match its successful payments.')
    check(all(CONTRACT.fullmatch(row['contract_no']) for row in rows),
          'CONTRACT', 'Check the report’s contract numbers.')
    check(not any(count > 1 for count in Counter(row['contract_no'] for row in rows).values()),
          'DUPLICATE_CONTRACT', 'A contract appears more than once in this bank result.')
    check(report['payment_count'] == len(rows), 'ROW_COUNT', 'The bank payment count does not match its rows.')
    total = sum((Decimal(row['amount']) for row in rows), Decimal('0'))
    check(Decimal(report['total_amount']) == total, 'ROW_TOTAL', 'The bank total does not match its payment amounts.')
    check(report['success_count'] + report['failed_count'] == report['payment_count'],
          'SUMMARY_COUNT', 'The bank success and failure counts do not match its total.')
    check(Decimal(report['successful_amount']) + Decimal(report['failed_amount']) == Decimal(report['total_amount']),
          'SUMMARY_TOTAL', 'The bank success and failure amounts do not match its total.')
    held = any(row['outcome'] in {'unknown', 'conflict'} for row in rows)
    for outcome, count_key, amount_key, label in (
        ('collected', 'success_count', 'successful_amount', 'successful'),
        ('rejected', 'failed_count', 'failed_amount', 'unsuccessful'),
    ):
        group = [row for row in rows if row['outcome'] == outcome]
        amount = sum((Decimal(row['amount']) for row in group), Decimal('0'))
        valid_count = len(group) <= report[count_key] if held else len(group) == report[count_key]
        valid_amount = amount <= Decimal(report[amount_key]) if held else amount == Decimal(report[amount_key])
        check(valid_count and valid_amount, f'{outcome.upper()}_SUMMARY',
              f'The bank {label} totals do not match the payment results.')
    return issues


def parse_bank_report(content: bytes) -> dict:
    """Return normalised, serialisable evidence for a reviewed import.

    Row outcomes do not settle payments. Global issues block confirmation;
    unknown or contradictory rows remain available for individual review.
    """
    if not isinstance(content, bytes) or not content or len(content) > MAX_BYTES:
        raise BankReportError('Choose an original bank results file smaller than 2 MB.')
    try:
        text = content.decode('utf-8-sig')
    except UnicodeDecodeError:
        raise BankReportError('Choose the original bank XLS or TXT results download.') from None
    report = _html(text) if '<table' in text.casefold() else _txt(text)
    report['issues'] = _issues(report)
    # Retain a comparison fingerprint, without persisting the raw account.
    report['account_fingerprint'] = hashlib.sha256(report.pop('credit_account').encode('utf-8')).hexdigest()
    report['bank_identity_hash'] = _hash({key: report[key] for key in ('bank_batch_no', 'account_fingerprint', 'currency')})
    financial_rows = []
    for row in report['rows']:
        canonical = {key: row[key] for key in ('contract_no', 'amount', 'outcome', 'reject_code')}
        if row['outcome'] in {'unknown', 'conflict'}:
            canonical['raw_status'] = 'collected' if row['raw_status'].casefold() in COLLECTED else row['raw_status']
        financial_rows.append(canonical)
    payload = {key: report[key] for key in ('bank_identity_hash', 'debit_date', 'payment_count', 'total_amount',
               'success_count', 'successful_amount', 'failed_count', 'failed_amount')}
    payload['rows'] = sorted(financial_rows, key=lambda row: json.dumps(row, sort_keys=True, ensure_ascii=False))
    if any(issue['code'] in {'SERVICE_CHARGE', 'CHARGE_CURRENCY', 'CREDIT_AMOUNT'} for issue in report['issues']):
        payload['credit_review'] = {key: report[key] for key in ('credit_amount', 'service_charge', 'charge_currency')}
    report['report_hash'] = _hash(payload)
    report['source_sha256'] = hashlib.sha256(content).hexdigest()
    return report
