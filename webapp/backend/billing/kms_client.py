"""Read the same KMS coupon queries used by Module > E-Coupon.

There is no public KMS API. Keep this adapter restricted to the inspected
login/navigation and named SELECT requests. Never log upstream bodies/headers.
"""
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
import os
import re
from xml.etree import ElementTree as ET

import httpx
from dotenv import dotenv_values

from .kms_schemas import KmsCoupon, KmsSnapshot

ORIGIN = 'https://kms.kidsconcept.net'
ERP = '/erp/servlet/ERP'
XML = '/erp/servlet/XMLHttpServer'
MAX_RESPONSE = 5 * 1024 * 1024
MAX_ROWS = 10000
QUERIES = {'loadStaffSite', 'searchSite', 'searchActiveCouponCount', 'searchActiveCoupon', 'searchUsedCoupon'}


class KmsReadError(ValueError):
    """A safe staff-facing error with no upstream response or credentials."""


def credentials(branch):
    values = {}
    filename = os.getenv('KMS_ACCOUNTS_FILE', '')
    if filename:
        try:
            values = dotenv_values(filename)
        except OSError:
            return None
    username = os.getenv(f'KMS_{branch}_USERNAME') or values.get(f'{branch}_USERNAME')
    password = os.getenv(f'KMS_{branch}_PASSWORD') or values.get(f'{branch}_PASSWORD')
    if not username or not password or any(c in username + password for c in '\r\n'):
        return None
    return username, password


def _xml(content):
    if len(content) > MAX_RESPONSE or b'<!DOCTYPE' in content.upper() or b'<!ENTITY' in content.upper():
        raise KmsReadError('KMS returned an unexpected report. No coupon balances were changed.')
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        raise KmsReadError('KMS did not return the coupon report. Try again later.') from None
    if root.tag != 'dataset':
        raise KmsReadError('KMS returned an unexpected report. Try again later.')
    records = root.findall('record')
    if len(records) > MAX_ROWS:
        raise KmsReadError('The KMS report has too many rows. Check it before continuing.')
    return [{child.tag: child.text or '' for child in record} for record in records]


def _date(value):
    # KMS date fields may include a time after the ISO calendar date.
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?', value):
        raise KmsReadError('Check the dates in the KMS coupon report.')
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        raise KmsReadError('Check the dates in the KMS coupon report.') from None


def _amount(value):
    try:
        amount = Decimal(value)
        if not amount.is_finite() or amount != amount.to_integral_value() or not 0 < amount <= 10000:
            raise InvalidOperation
        return int(amount)
    except (InvalidOperation, ValueError, TypeError):
        raise KmsReadError('Check the amounts in the KMS coupon report.') from None


def parse_coupon_rows(active, used, *, branch, active_count, fetched_at, years):
    if len(active) != active_count or active_count > MAX_ROWS:
        raise KmsReadError('The KMS coupon list is incomplete. Try the check again.')
    coupons = []
    seen = set()
    for state, rows in (('active', active), ('used', used)):
        for row in rows:
            # KMS decorates CP# with a leading '#'. Preserve all digits,
            # including leading zeroes, while comparing the actual number.
            number = row.get('couponnum', '').strip().removeprefix('#')
            company = row.get('studentcode' if state == 'active' else 'code', '').strip()
            # Used rows expose the bare school ID. Its branch comes from the
            # account/site verified above, never from a user-supplied prefix.
            if state == 'used' and re.fullmatch(r'[0-9]+', company):
                company = branch + company
            if (not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._/-]{0,79}', number)
                    or not re.fullmatch(branch + r'[0-9]+', company) or number in seen):
                raise KmsReadError('Check duplicate coupon numbers and student branches in KMS.')
            seen.add(number)
            values = dict(number=number, company_id=company, value=_amount(row.get('amount', '')), state=state)
            if state == 'active':
                issued, expiry = _date(row.get('date', '')), _date(row.get('expiry', ''))
                if issued > fetched_at.date() or expiry < issued:
                    raise KmsReadError('Check the issue and expiry dates in KMS.')
                values.update(issued_on=issued, expires_on=expiry)
            else:
                used_on, receipt = _date(row.get('date', '')), row.get('fullinvoice', '').strip()
                if used_on.year not in years or used_on > fetched_at.date() or not receipt or len(receipt) > 100:
                    raise KmsReadError('Check the receipt dates and numbers in the KMS Used list.')
                values.update(used_on=used_on, receipt_reference=receipt)
            coupons.append(KmsCoupon(**values))
    return KmsSnapshot(branch=branch, fetched_at=fetched_at, used_years=sorted(years),
                       active_count=active_count, coupons=sorted(coupons, key=lambda c: (c.company_id, c.number)))


class KmsClient:
    def __init__(self, branch, *, client=None):
        self.branch = branch
        self.login = credentials(branch)
        if not self.login:
            raise KmsReadError(f'The {branch} KMS account has not been configured.')
        self.client = client or httpx.Client(base_url=ORIGIN, timeout=httpx.Timeout(30, connect=10),
                                             follow_redirects=False, trust_env=False)
        self.username = self.login[0]
        self.company = None

    def _request(self, method, path, **kwargs):
        try:
            # Stream and bound every response before parsing, including HTML.
            with self.client.stream(method, path, **kwargs) as response:
                if response.status_code != 200:
                    raise KmsReadError('KMS could not complete the coupon check. Try again later.')
                result = bytearray()
                for chunk in response.iter_bytes():
                    result.extend(chunk)
                    if len(result) > MAX_RESPONSE:
                        raise KmsReadError('The KMS response is too large. Check the report manually.')
                return bytes(result)
        except httpx.HTTPError:
            raise KmsReadError('KMS could not be reached. No coupon balances were changed.') from None

    def _query(self, module, query, values):
        if query not in QUERIES:
            raise KmsReadError('This KMS action is not supported.')
        root = ET.Element('body')
        body = ET.SubElement(root, module)
        for name, value in values.items():
            ET.SubElement(body, name).text = str(value)
        return _xml(self._request('POST', XML, headers={
            'action': 'SEARCHQUERY', 'username': self.username, 'compid': self.company,
            'module': 'coupon', 'modgroup': 'Module', 'workmodule': module, 'query': query,
            'content-type': 'text/xml', 'charset': 'utf-8',
        }, content=ET.tostring(root)))

    def read(self, *, fetched_at=None):
        supplied_time = fetched_at
        fetched_at = fetched_at or datetime.now(timezone.utc)
        # Use actual KMS calendar years, independent of the demo billing clock.
        from zoneinfo import ZoneInfo
        local = fetched_at.astimezone(ZoneInfo('Asia/Hong_Kong'))
        years = [local.year - 1, local.year]
        try:
            self._request('GET', ERP)
            result = self._request('POST', XML, headers={
                'action': 'DOLOGIN', 'username': self.username, 'password': self.login[1],
                'resolution': 'fts', 'type': 'username', 'content-type': 'text/xml',
            }, content=b'<xml/>').decode('utf-8')
            # Mirror KMS's xmlUserLogin username reconstruction. Never accept
            # an HTTP200 login failure page as an empty coupon inventory.
            pieces = result.split('-')
            canonical = '-'.join(pieces[1:-1])
            if canonical.lower() != self.username.lower():
                canonical += ('-' if canonical else '') + pieces[-1]
            if len(pieces) < 2 or canonical.lower() != self.username.lower():
                raise KmsReadError(f'The {self.branch} KMS login failed. Check the saved account.')
            html = self._request('POST', ERP, data={
                'USER': canonical, 'ACTION': 'changemodule', 'MODULE': 'coupon',
                'MODULEGROUP': 'Module', 'resolutionVersion': 'fts', 'MODE': 'd',
            }).decode('utf-8')
            company = re.search(r'''\bgComID\s*=\s*['"]([0-9]+)['"]''', html)
            if not company or 'E-Coupon' not in html:
                raise KmsReadError('The KMS session expired. Start a new coupon check.')
            self.company = company.group(1)
            staff = self._query('staff', 'loadStaffSite', {'username': self.username})
            sites = self._query('site', 'searchSite', {})
            selected = [s for s in sites if s.get('code') == self.branch]
            if len(staff) != 1 or len(selected) != 1 or staff[0].get('site') != selected[0].get('id'):
                raise KmsReadError(f'The KMS account does not belong to {self.branch}.')
            args = {'site': selected[0]['id'], 'year': local.year, 'limit': 'all', 'offset': 0, 'order': ''}
            before = self._query('coupon', 'searchActiveCouponCount', args)
            active = self._query('coupon', 'searchActiveCoupon', args)
            used = []
            for year in years:
                used.extend(self._query('coupon', 'searchUsedCoupon', {**args, 'year': year}))
            after = self._query('coupon', 'searchActiveCouponCount', args)
            if len(before) != 1 or before != after or not re.fullmatch(r'[0-9]+', before[0].get('count', '')):
                raise KmsReadError('The KMS coupon list changed during the check. Try again.')
            completed = local if supplied_time else datetime.now(timezone.utc).astimezone(ZoneInfo('Asia/Hong_Kong'))
            return parse_coupon_rows(active, used, branch=self.branch, active_count=int(before[0]['count']),
                                     fetched_at=completed, years=years)
        except (UnicodeError, KeyError, IndexError):
            raise KmsReadError('KMS returned an unexpected report. No coupon balances were changed.') from None
        finally:
            self.client.close()
