"""Phone-number normalization for prospect/application linking.

HK phone numbers are 8 digits. Users may enter them with or without the
+852 country code, with spaces, dashes, or parentheses. We normalize to a
digits-only form with HK/Macau country codes stripped so that exact-match
comparison works across these variants.

Scope is deliberately narrow: only the Hong Kong (852) and Macau (853)
country codes are stripped. Everything else is returned as digits-only so
unrelated international numbers can't collide by accident.
"""

from __future__ import annotations

import re

_NON_DIGITS_RE = re.compile(r"\D+")


def normalize_phone(phone: str | None) -> str:
    """Return a canonical digits-only form of a phone number.

    Strips non-digits, then drops a leading HK/Macau country code when the
    remaining length would be the expected 8-digit local number. Returns an
    empty string for None or non-digit input.
    """
    if not phone:
        return ""
    digits = _NON_DIGITS_RE.sub("", phone)
    if not digits:
        return ""
    # +852 / +853 prefixed: 3-digit country code + 8-digit local = 11 digits
    if len(digits) == 11 and digits[:3] in ("852", "853"):
        return digits[3:]
    # 00852 / 00853 international dialing prefix: 5 + 8 = 13 digits
    if len(digits) == 13 and digits[:5] in ("00852", "00853"):
        return digits[5:]
    return digits
