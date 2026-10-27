"""Asking about an enrollment's end date without paying for it on every row.

`calculate_effective_end_date(first_lesson_date, lessons_paid, extension_weeks)`
is a MySQL stored function that walks forward one week at a time, looking up the
holiday table at every step, until it has counted out the paid lessons. That is
about 0.1ms of database CPU per row, which is nothing for one enrollment and
real money across the ~3,500 the centre has ever taken. The database is a
shared-core instance in the same region as the application, so this is CPU and
not network: it does not get better on deploy, and the only fix is to run the
function fewer times.

The way out is that holidays only ever push an end date *later*. The plain
weekly span

    first_lesson_date + (lessons_paid + extension_weeks - 1) weeks

is therefore a lower bound on a legacy pack's real end date. It uses only
arithmetic. An enrollment that clears a cutoff on its lower bound alone clears it
outright, and the function never has to run. Only the rows sitting just short of
the cutoff can still be dragged over it by holidays, and only those pay.

"Just short" is bounded rather than guessed. The gap between the lower bound and
the real end date is exactly the holiday weeks falling inside the span, and a
holiday lands on any given weekday at most five times a year, so twelve weeks of
slack is generous by a wide margin. Measured on prod, the answer stops changing
at two.

Grouped billing enrollments use their recorded original lesson dates instead.
Their dates can be irregular, so the weekly lower bound does not apply. These
branches are emitted only when billing storage is available.

One more detail: the arithmetic is written with `TO_DAYS` rather than
`DATE_ADD ... INTERVAL`, because `to_days` is a one-line stand-in in SQLite
(tests/conftest.py) and the queries stay testable.
"""
from __future__ import annotations

from datetime import date as date_type

from sqlalchemy import Date, and_, case, func, literal, or_, select

from models import Enrollment

# How far past its plain weekly span a lesson pack is allowed to stretch before
# these filters stop considering it. See the module docstring for why twelve
# weeks is provably generous rather than merely measured.
HOLIDAY_SLACK_WEEKS = 12
HOLIDAY_SLACK_DAYS = HOLIDAY_SLACK_WEEKS * 7


def _billing_storage_available() -> bool:
    from billing.guards import workflow_enabled
    return workflow_enabled()


def _grouped_sql(alias: str) -> tuple[str, str]:
    linked = (
        f"EXISTS (SELECT 1 FROM billing_payment_lines billing_end_line"
        f" WHERE billing_end_line.enrollment_id = {alias}.id)"
    )
    exact = (
        f"COALESCE((SELECT MAX(billing_end_root.session_date) FROM session_log billing_end_root"
        f" WHERE billing_end_root.enrollment_id = {alias}.id"
        f" AND billing_end_root.make_up_for_id IS NULL), {alias}.first_lesson_date)"
    )
    return linked, exact


def _legacy_end_sql(alias: str) -> str:
    return (
        f"calculate_effective_end_date({alias}.first_lesson_date, {alias}.lessons_paid,"
        f" COALESCE({alias}.deadline_extension_weeks, 0))"
    )


def effective_end_sql(alias: str) -> str:
    """Match the enrollment detail's exact grouped or weekly legacy end date."""
    legacy = _legacy_end_sql(alias)
    if not _billing_storage_available():
        return legacy
    linked, exact = _grouped_sql(alias)
    return f"(CASE WHEN {linked} THEN {exact} ELSE {legacy} END)"


def _lower_bound_days(alias: str) -> str:
    """The plain weekly span as a day number: the end date's lower bound."""
    return (
        f"(TO_DAYS({alias}.first_lesson_date)"
        f" + ({alias}.lessons_paid + COALESCE({alias}.deadline_extension_weeks, 0) - 1) * 7)"
    )


def reaches_sql(alias: str, cutoff: str, *, strict: bool = False) -> str:
    """`effective_end_date >= cutoff`, with the function kept off most rows.

    `cutoff` is a SQL date expression, usually a bind parameter like
    `:judged_from`. Pass `strict=True` for `>` instead of `>=`.

    SQL's OR short-circuits left to right, which is what keeps the function away
    from the rows that have already answered on arithmetic alone.
    """
    op = ">" if strict else ">="
    lower = _lower_bound_days(alias)
    legacy = (
        f"({lower} {op} TO_DAYS({cutoff})"
        f" OR ({lower} >= TO_DAYS({cutoff}) - {HOLIDAY_SLACK_DAYS}"
        f" AND {_legacy_end_sql(alias)} {op} {cutoff}))"
    )
    if not _billing_storage_available():
        return legacy
    linked, exact = _grouped_sql(alias)
    return f"(CASE WHEN {linked} THEN ({exact} {op} {cutoff}) ELSE {legacy} END)"


def ends_within_prefilter_sql(alias: str, start: str, end: str) -> str:
    """Cheap bounds for "this pack ended between `start` and `end`".

    Legacy packs use a prefilter: it can let a row through that the real end
    date rules out, so the exact comparison still has to happen on the projected
    value. What it will never do is drop a row that belongs, which is what makes
    it safe to apply before the function runs.

    The upper bound is exact and free, because the real end date is never
    earlier than the lower bound. The lower bound gets the slack window.
    Grouped enrollments use the exact original dates for both boundaries.
    """
    lower = _lower_bound_days(alias)
    legacy = (
        f"({lower} >= TO_DAYS({start}) - {HOLIDAY_SLACK_DAYS}"
        f" AND {lower} <= TO_DAYS({end}))"
    )
    if not _billing_storage_available():
        return legacy
    linked, exact = _grouped_sql(alias)
    return f"(CASE WHEN {linked} THEN ({exact} BETWEEN {start} AND {end}) ELSE {legacy} END)"


def reaches_clause(active_from: date_type):
    """`reaches_sql` as a SQLAlchemy clause, for queries built with the ORM."""
    total_dates = Enrollment.lessons_paid + func.coalesce(Enrollment.deadline_extension_weeks, 0)
    lower_bound = func.to_days(Enrollment.first_lesson_date) + (total_dates - 1) * 7
    cutoff = func.to_days(literal(active_from, Date))
    legacy = or_(
        lower_bound >= cutoff,
        and_(
            lower_bound >= cutoff - HOLIDAY_SLACK_DAYS,
            func.calculate_effective_end_date(
                Enrollment.first_lesson_date,
                Enrollment.lessons_paid,
                func.coalesce(Enrollment.deadline_extension_weeks, 0),
            ) >= active_from,
        ),
    )

    if not _billing_storage_available():
        return legacy
    from billing.models import BillingPaymentLine
    from models import SessionLog
    linked = select(BillingPaymentLine.id).where(
        BillingPaymentLine.enrollment_id == Enrollment.id
    ).correlate(Enrollment).exists()
    exact = func.coalesce(select(func.max(SessionLog.session_date)).where(
        SessionLog.enrollment_id == Enrollment.id,
        SessionLog.make_up_for_id.is_(None),
    ).correlate(Enrollment).scalar_subquery(), Enrollment.first_lesson_date)
    return case((linked, exact >= active_from), else_=legacy)
