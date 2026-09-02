"""
Custom reporting quarters, and how the summer course period narrows them.

Pure date logic with no database or framework dependency, so the terminations
API, its tests, and the standalone quarterly report script all work from one
copy of the rules. Anything needing the database (reading a year's summer course
dates) lives in routers/terminations.py.

Custom quarter definitions (non-standard):
  Q1: Jan 22 - Apr 21
  Q2: Apr 22 - Jul 21
  Q3: Jul 22 - Oct 21
  Q4: Oct 22 - Jan 21 (crosses the year boundary)
"""
from dataclasses import dataclass, replace
from datetime import date, timedelta
from typing import Optional

# Custom Quarter definitions (start_month, start_day, end_month, end_day)
# Q4 crosses the year boundary: Oct 22 - Jan 21 of next year
QUARTERS = {
    1: (1, 22, 4, 21),   # Jan 22 - Apr 21
    2: (4, 22, 7, 21),   # Apr 22 - Jul 21
    3: (7, 22, 10, 21),  # Jul 22 - Oct 21
    4: (10, 22, 1, 21),  # Oct 22 - Jan 21 (next year)
}

OPENING_PERIOD_DAYS = 7  # Jan 22-28, Apr 22-28, Jul 22-28, Oct 22-28

# Regular lessons pause while the summer course runs, so that stretch belongs to
# no quarter: the quarter running into the pause is measured up to it, and the
# next quarter resumes when regular lessons do. Without this, every student whose
# paid lessons finished before the pause reads as terminated, because their next
# enrolment does not exist until the school year restarts.
PRE_SUMMER_GRACE_DAYS = 28  # lessons ending this close to the pause are judged in the quarter after it
REGULAR_RESUME_MONTH_DAY = (9, 1)  # regular lessons resume 1 Sep, once the pause is over

# How late a renewal can start and still count as the same student carrying on.
# Holidays delay renewals, so a pack beginning a few weeks after the window is
# the continuation of the one before it.
RENEWAL_GRACE_DAYS = 21
# And how long after a quarter closed a new pack stops being a renewal at all.
# Past this it is a student coming back, and the quarter they left in has to keep
# reading as the quarter they left in.
COMEBACK_GRACE_DAYS = 30


def get_quarter_dates(year: int, quarter: int):
    """
    Get key dates for a quarter.

    Args:
        year: The reporting year for the quarter
        quarter: Quarter number (1-4)

    Returns:
        tuple: (opening_start, opening_end, closing_end)

    Note: For Q4, the year parameter is the start year.
          Q4 2025 runs from Oct 22, 2025 to Jan 21, 2026.
    """
    start_month, start_day, end_month, end_day = QUARTERS[quarter]

    # Opening period start and end
    opening_start = date(year, start_month, start_day)
    opening_end = date(year, start_month, start_day + OPENING_PERIOD_DAYS - 1)

    # Closing end date
    if quarter == 4:
        # Q4 ends in January of the NEXT year
        closing_end = date(year + 1, end_month, end_day)
    else:
        closing_end = date(year, end_month, end_day)

    return opening_start, opening_end, closing_end


def get_quarter_for_date(d: date) -> tuple:
    """
    Get the custom quarter and reporting year for a given date.

    Args:
        d: The date to classify

    Returns:
        tuple: (quarter_number, reporting_year)

    Examples:
        - Jan 15, 2026 -> (4, 2025)  # Part of Q4 2025
        - Jan 25, 2026 -> (1, 2026)  # Part of Q1 2026
        - Oct 25, 2025 -> (4, 2025)  # Part of Q4 2025
    """
    month = d.month
    day = d.day
    year = d.year

    # Oct 22 or later -> Q4 of current year
    if (month == 10 and day >= 22) or month > 10:
        return 4, year
    # Jul 22 to Oct 21 -> Q3
    elif (month == 7 and day >= 22) or (month > 7 and month < 10) or (month == 10 and day < 22):
        return 3, year
    # Apr 22 to Jul 21 -> Q2
    elif (month == 4 and day >= 22) or (month > 4 and month < 7) or (month == 7 and day < 22):
        return 2, year
    # Jan 22 to Apr 21 -> Q1
    elif (month == 1 and day >= 22) or (month > 1 and month < 4) or (month == 4 and day < 22):
        return 1, year
    # Jan 1-21 -> Q4 of PREVIOUS year
    else:
        return 4, year - 1


@dataclass(frozen=True)
class QuarterWindow:
    """The dates a quarter's figures are measured over, adjusted for the summer pause.

    For quarters that never meet the pause, every field matches the plain calendar
    quarter and the queries behave exactly as they did before summer awareness.

    Fields:
        opening_start/opening_end: the week the roster is counted at the start.
        closing_end: the last day of the measured window.
        churn_cutoff: the last lesson end date that counts as this quarter's churn.
            Earlier than closing_end for the quarter running into the pause, so
            students who simply finished before the summer are not counted as lost.
        judged_from: the boundary this quarter starts judging from. It is both the
            earliest lesson end date the quarter counts as its own churn and the
            point the roster is carried in from, so its opening equals the previous
            quarter's closing. Reaches back before opening_start for the quarter
            after the pause, which inherits everyone handed over from the run-up
            and the pause itself.
        prev_closing_end: the previous quarter's last measured day.
        summer: the pause this quarter was adjusted around, or None.
    """
    opening_start: date
    opening_end: date
    closing_end: date
    churn_cutoff: date
    judged_from: date
    prev_closing_end: date
    summer: Optional[tuple] = None

    @property
    def handover_from(self) -> Optional[date]:
        """First lesson end date handed over to the quarter after the pause."""
        if not self.summer:
            return None
        return self.summer[0] - timedelta(days=PRE_SUMMER_GRACE_DAYS)

    def params(self) -> dict:
        """Bind values shared by every quarter-scoped query.

        The last three are the grace periods the termination queries used to
        write inline as `DATE_ADD(:closing_end, INTERVAL 21 DAY)`. They are
        computed here instead for two reasons: the reader sees what the number
        means rather than a bare interval, and SQLite has no DATE_ADD, so the
        queries that use them can now be tested rather than only measured.
        """
        return {
            "opening_end": self.opening_end,
            "closing_end": self.closing_end,
            "churn_cutoff": self.churn_cutoff,
            "judged_from": self.judged_from,
            "prev_closing_end": self.prev_closing_end,
            # A renewal that starts a few weeks late is the same student
            # continuing, not a new one: holidays delay renewals.
            "opening_end_grace": self.opening_end + timedelta(days=RENEWAL_GRACE_DAYS),
            "closing_end_grace": self.closing_end + timedelta(days=RENEWAL_GRACE_DAYS),
            "prev_closing_end_grace": self.prev_closing_end - timedelta(days=RENEWAL_GRACE_DAYS),
            # A pack starting more than a month after the window closed is a
            # student coming back, and must not rewrite the quarter's history.
            "comeback_cutoff": self.closing_end + timedelta(days=COMEBACK_GRACE_DAYS),
        }


def build_quarter_window(year: int, quarter: int, pause: Optional[tuple] = None) -> QuarterWindow:
    """Measured window for a quarter, with the summer pause taken out.

    Two quarters get adjusted each summer:
      - the one running into the pause is measured up to the day before it, and
        hands over every student whose lessons ended within PRE_SUMMER_GRACE_DAYS
        of it (they finished for the summer rather than left);
      - the one starting inside the pause opens when regular lessons resume, and
        judges the handed-over students together with its own.

    A pause sitting wholly inside one quarter needs no handover, and a year with
    no summer course leaves every date on the plain calendar quarter.
    """
    opening_start, opening_end, closing_end = get_quarter_dates(year, quarter)
    window = QuarterWindow(
        opening_start=opening_start,
        opening_end=opening_end,
        closing_end=closing_end,
        churn_cutoff=closing_end,
        judged_from=opening_start,
        prev_closing_end=opening_start - timedelta(days=1),
    )

    if not pause:
        return window
    pause_start, pause_end = pause
    handover_from = pause_start - timedelta(days=PRE_SUMMER_GRACE_DAYS)

    # Runs into the pause: measure up to it.
    if opening_start < pause_start <= closing_end < pause_end:
        return replace(
            window,
            closing_end=pause_start - timedelta(days=1),
            churn_cutoff=handover_from - timedelta(days=1),
            summer=pause,
        )

    # Starts inside the pause: open when regular lessons resume.
    if pause_start <= opening_start <= pause_end:
        resume = max(date(year, *REGULAR_RESUME_MONTH_DAY), pause_end + timedelta(days=1))
        return replace(
            window,
            opening_start=resume,
            opening_end=resume + timedelta(days=OPENING_PERIOD_DAYS - 1),
            judged_from=handover_from,
            prev_closing_end=pause_start - timedelta(days=1),
            summer=pause,
        )

    return window


def attribute_quarter(d: date, pause: Optional[tuple]) -> tuple:
    """The quarter a lesson end date is judged in, given that year's summer pause.

    Ends in the run-up to the pause, and inside the pause itself, are judged in the
    quarter that resumes afterwards.
    """
    if pause:
        pause_start, pause_end = pause
        if pause_start - timedelta(days=PRE_SUMMER_GRACE_DAYS) <= d <= pause_end:
            return get_quarter_for_date(pause_end + timedelta(days=1))
    return get_quarter_for_date(d)
