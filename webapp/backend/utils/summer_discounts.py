"""Payment-aware summer discount tier computation.

Mirror of `webapp/frontend/lib/summer-discounts.ts`, extended so that tier
qualification uses the applicant's effective payment date (their actual
paid_at if set, today otherwise) against the tier's `before_date` deadline.

Callers use this to:
- Stamp the locked tier onto an Enrollment at publish time.
- Recompute the tier on read (for enrollment detail / overdue page displays).
- Run the nightly sweep that downgrades unpaid applications past the deadline.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Iterable, Optional

from models import SummerApplication, SummerBuddyMember, SummerCourseConfig

EXIT_STATUSES = {"Withdrawn", "Rejected"}
REJECTED_SIBLING_STATUSES = {"Rejected"}

NONE_CODE = "NONE"


@dataclass
class DiscountEntry:
    code: str
    amount: int
    name_zh: str = ""
    name_en: str = ""
    before_date: Optional[date] = None
    min_group_size: Optional[int] = None


@dataclass
class DiscountResult:
    best: Optional[DiscountEntry]
    amount: int
    final_fee: int
    base_fee: int

    @property
    def code(self) -> str:
        return self.best.code if self.best else NONE_CODE


def _parse_date(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


def parse_discounts(config: SummerCourseConfig) -> list[DiscountEntry]:
    """Pull the discount list out of pricing_config JSON."""
    raw = (config.pricing_config or {}).get("discounts") or []
    out: list[DiscountEntry] = []
    for d in raw:
        cond = d.get("conditions") or {}
        out.append(DiscountEntry(
            code=d.get("code") or "",
            amount=int(d.get("amount") or 0),
            name_zh=d.get("name_zh") or "",
            name_en=d.get("name_en") or "",
            before_date=_parse_date(cond.get("before_date")),
            min_group_size=cond.get("min_group_size"),
        ))
    return out


def _is_partial(app: SummerApplication) -> bool:
    return (app.lessons_paid or 0) < 8  # total_lessons is 8 in config


def _non_rejected_siblings(members: Iterable[SummerBuddyMember]) -> list[SummerBuddyMember]:
    return [
        m for m in members
        if (m.verification_status or "") not in REJECTED_SIBLING_STATUSES
    ]


def _active_member_count(
    group_apps: list[SummerApplication],
    siblings: list[SummerBuddyMember],
) -> int:
    apps = [
        a for a in group_apps
        if a.application_status not in EXIT_STATUSES and not _is_partial(a)
    ]
    return len(apps) + len(siblings)


def _nth_joined_at(
    group_apps: list[SummerApplication],
    siblings: list[SummerBuddyMember],
    n: int,
) -> Optional[datetime]:
    times: list[datetime] = []
    for a in group_apps:
        if a.application_status in EXIT_STATUSES or _is_partial(a):
            continue
        if a.buddy_joined_at:
            times.append(a.buddy_joined_at)
    for s in siblings:
        if s.created_at:
            times.append(s.created_at)
    if len(times) < n:
        return None
    times.sort()
    return times[n - 1]


def _effective_date(app: SummerApplication, today: date) -> date:
    """The date the applicant 'paid', for deadline comparison.

    - If paid_at is set, use that date (they paid on that date).
    - Else use today (they haven't paid yet — the deadline may have lapsed).
    """
    if app.paid_at:
        return app.paid_at.date() if isinstance(app.paid_at, datetime) else app.paid_at
    return today


def _qualifies(
    d: DiscountEntry,
    app: SummerApplication,
    group_apps: list[SummerApplication],
    siblings: list[SummerBuddyMember],
    today: date,
) -> bool:
    min_size = d.min_group_size
    if isinstance(min_size, int) and min_size > 1:
        if _active_member_count(group_apps, siblings) < min_size:
            return False
        if d.before_date:
            # Group must have reached size by deadline.
            reach_at = _nth_joined_at(group_apps, siblings, min_size)
            if not reach_at or reach_at.date() >= d.before_date:
                return False
            # AND this applicant must have paid by the deadline.
            if _effective_date(app, today) >= d.before_date:
                return False
    elif d.before_date:
        # Solo early-bird — this applicant's effective date must beat deadline.
        if _effective_date(app, today) >= d.before_date:
            return False
    return True


def compute_best_discount(
    app: SummerApplication,
    group_apps: list[SummerApplication],
    siblings: list[SummerBuddyMember],
    config: SummerCourseConfig,
    today: Optional[date] = None,
) -> DiscountResult:
    today = today or date.today()
    base_fee = int((config.pricing_config or {}).get("base_fee") or 0)

    if _is_partial(app):
        rate = int((config.pricing_config or {}).get("partial_per_lesson_rate") or 400)
        return DiscountResult(
            best=None,
            amount=0,
            final_fee=(app.lessons_paid or 0) * rate,
            base_fee=base_fee,
        )

    best: Optional[DiscountEntry] = None
    for d in parse_discounts(config):
        if not _qualifies(d, app, group_apps, siblings, today):
            continue
        if best is None or d.amount > best.amount:
            best = d

    amount = best.amount if best else 0
    return DiscountResult(
        best=best,
        amount=amount,
        final_fee=base_fee - amount,
        base_fee=base_fee,
    )


def compute_payment_deadline(
    discount: DiscountResult,
    first_lesson_date: Optional[date],
) -> Optional[date]:
    """min(tier.before_date, first_lesson_date) when a tier has a deadline.

    When the locked tier has no before_date (e.g. plain 3P or no discount),
    fall back to first_lesson_date — the overdue page can still surface the
    unpaid enrollment by the start-of-lessons urgency.
    """
    tier_deadline = discount.best.before_date if discount.best else None
    candidates = [d for d in (tier_deadline, first_lesson_date) if d is not None]
    if not candidates:
        return None
    return min(candidates)


def load_group_context(
    db,
    app: SummerApplication,
) -> tuple[list[SummerApplication], list[SummerBuddyMember]]:
    """Load the applicant's buddy group apps + non-rejected siblings.

    Solo applicants return ([app], []). Keeps the compute helper pure so it
    can be unit-tested without DB fixtures.
    """
    if app.buddy_group_id is None:
        return [app], []
    group_apps = (
        db.query(SummerApplication)
        .filter(SummerApplication.buddy_group_id == app.buddy_group_id)
        .all()
    )
    siblings = _non_rejected_siblings(
        db.query(SummerBuddyMember)
        .filter(
            SummerBuddyMember.buddy_group_id == app.buddy_group_id,
            SummerBuddyMember.is_sibling.is_(True),
        )
        .all()
    )
    return group_apps, siblings


def effective_tier_code(enrollment) -> str:
    """Returns override code if set, else the locked tier code, else NONE."""
    if enrollment.discount_override_code:
        return enrollment.discount_override_code
    return enrollment.locked_discount_code or NONE_CODE
