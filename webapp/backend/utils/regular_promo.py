"""Seasonal promotion for the regular course (September intake).

Regular has no discount *tiers* the way summer does — there is at most one
promotion running at a time, defined in ``regular_course_configs.pricing_config``
under a ``promo`` key. The money itself rides the ordinary ``discounts`` table
(the promo names the row via ``discount_id``), so publishing, revenue snapshots
and the enrollment detail page price it through the same path as any coupon.
What lives here is everything the discount row cannot express: when the offer is
advertised, who qualifies, whether it waives the one-off fee, and how it is
named to a parent.

Eligibility is deliberately admin-verified rather than derived. The form asks
whether the student is *currently* studying at a MathConcept centre, which a
family that left last year answers "none" to in good faith, and a derived
"no prior enrollment" flag only knows about the Secondary Academy. Neither
answers "has never attended any of our courses", so an admin confirms the
applicant's origin and the promo keys off that.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Optional


# verified_branch_origin value meaning "has never attended any MathConcept
# centre". Matches the summer application's vocabulary so the two intakes stay
# readable side by side.
NEW_STUDENT_ORIGIN = "New"


@dataclass(frozen=True)
class RegularPromo:
    """A running promotion, parsed out of ``pricing_config.promo``."""

    code: str
    name_zh: str
    name_en: str
    #: Short form used inside the fee message, where the surrounding text has
    #: already established the centre and the course.
    short_name_zh: str
    short_name_en: str
    #: Headline value quoted to parents. Prose only — the arithmetic is the
    #: tuition discount plus whatever the waiver is worth, which may differ if
    #: a returning student ever became eligible.
    total_value: int
    #: ``discounts.id`` holding the tuition reduction.
    discount_id: Optional[int]
    #: Dollar value of that row, kept here so the admin fee preview can quote
    #: the offer before a discount has been attached.
    tuition_amount: int
    waives_registration_fee: bool
    from_date: Optional[date]
    until_date: Optional[date]


def _parse_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except (ValueError, TypeError):
        return None


def parse_promo(config) -> Optional[RegularPromo]:
    """Pull the promo out of a config's ``pricing_config``. None when unset.

    A promo with no code is treated as absent: the code is what an admin puts
    on the receipt, so an entry without one is a half-filled config rather than
    a live offer.
    """
    if config is None:
        return None
    raw = (getattr(config, "pricing_config", None) or {}).get("promo")
    if not isinstance(raw, dict):
        return None
    code = (raw.get("code") or "").strip()
    if not code:
        return None
    name_zh = raw.get("name_zh") or ""
    name_en = raw.get("name_en") or ""
    return RegularPromo(
        code=code,
        name_zh=name_zh,
        name_en=name_en,
        short_name_zh=raw.get("short_name_zh") or name_zh,
        short_name_en=raw.get("short_name_en") or name_en,
        total_value=int(raw.get("total_value") or 0),
        discount_id=raw.get("discount_id"),
        tuition_amount=int(raw.get("tuition_amount") or 0),
        waives_registration_fee=bool(raw.get("waives_registration_fee")),
        from_date=_parse_date(raw.get("from_date")),
        until_date=_parse_date(raw.get("until_date")),
    )


def promo_active(promo: Optional[RegularPromo], today: date) -> bool:
    """Whether the offer is being advertised on ``today``.

    The window is inclusive at both ends, and an absent bound means unbounded —
    a promo with no ``until_date`` runs until the config says otherwise. The
    application form opens before the marketing does, so ``from_date`` is what
    keeps the offer off the form during those first days.
    """
    if promo is None:
        return False
    if promo.from_date and today < promo.from_date:
        return False
    if promo.until_date and today > promo.until_date:
        return False
    return True


def is_verified_new(app) -> bool:
    """Whether an admin has confirmed the applicant has attended no MathConcept
    centre. Unverified applications are not eligible — silence is not a yes."""
    return (getattr(app, "verified_branch_origin", None) or "") == NEW_STUDENT_ORIGIN


def application_promo(
    app, config, today: date
) -> Optional[RegularPromo]:
    """The promo this application qualifies for right now, or None.

    Requires all three of: a promo configured, its window open, and the
    applicant verified as new.
    """
    promo = parse_promo(config)
    if not promo_active(promo, today):
        return None
    if not is_verified_new(app):
        return None
    return promo


def promo_for_code(config, code: Optional[str]) -> Optional[RegularPromo]:
    """Look a promo up by the code snapshotted on an enrollment.

    Published enrollments store the code rather than the whole offer, so a
    fee message re-copied after publishing still names the promotion. Returns
    None when the config has moved on to a different promo, in which case the
    message falls back to plain discount wording rather than quoting an offer
    that no longer exists.
    """
    if not code:
        return None
    promo = parse_promo(config)
    if promo is None or promo.code != code:
        return None
    return promo


def intake_charges_registration_fee(config) -> bool:
    """Whether this intake collects the one-off materials fee at all.

    Defaults to True, so every existing config keeps charging it and only an
    intake that opts out changes. The September 2026 intake opts out: the fee
    is not collected from anyone, whether they are new to us, moving up from a
    MathConcept primary branch, or returning.

    Distinct from a promo's ``waives_registration_fee``, which is about
    advertising rather than money: it decides whether the offer *mentions* the
    fee as part of what it saved, and only a genuinely new student sees that.
    """
    if config is None:
        return True
    pricing = getattr(config, "pricing_config", None) or {}
    return pricing.get("registration_fee_charged", True) is not False


def promo_message_fields(promo: Optional[RegularPromo], registration_fee: int = 0) -> Optional[dict]:
    """Shape a promo into the dict ``format_fee_message`` expects.

    Keeps the message formatter free of this module's dataclass so it stays a
    pure string builder usable from any caller.

    ``registration_fee`` is the intake's standard materials fee, passed through
    as ``waived_fee`` when the offer claims to waive it. That is the nudge: a
    genuinely new student is told the fee normally exists and that the offer
    covered it. It is wording only and never enters the total.
    """
    if promo is None:
        return None
    return {
        "name_zh": promo.short_name_zh,
        "name_en": promo.short_name_en,
        "total_value": promo.total_value,
        "waived_fee": int(registration_fee or 0) if promo.waives_registration_fee else 0,
    }


def intake_registration_fee(config) -> int:
    """The intake's standard materials fee, whether or not it is collected.

    Quoted in the offer's original-price clause, so it is read even by an
    intake that charges nobody.
    """
    if config is None:
        return 0
    pricing = getattr(config, "pricing_config", None) or {}
    return int(pricing.get("registration_fee") or 0)
