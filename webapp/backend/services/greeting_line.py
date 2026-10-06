"""
The line under the dashboard greeting.

Each morning the dashboard can say one thing worth noticing about the tutor's
day: a class milestone, a student's first lesson or anniversary, a test most
of their students sit, a holiday coming up, or a busier day than usual. When a
number the tutor owns happens to be interesting (their 64th class is 4 cubed
and 8 squared), the line says that too. On days with nothing to say, there's
no line, which is what keeps it worth reading.

The unit is the class: one tutor's time slot on one day, however many students
are in it. The school year runs from one regular intake's first lesson day to
the next, so its start comes from the regular course config.

Everything here gathers candidate lines with a weight and picks the heaviest.
The number facts are pure functions so they can be tested on their own.
"""
import math
from collections import defaultdict
from datetime import date, timedelta
from typing import List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from constants import SessionStatus
from models import CalendarEvent, Enrollment, Holiday, RegularCourseConfig, SessionLog, Student

# The statuses that mean a class happens (or happened) with the student in it.
# Rescheduled, cancelled and sick-leave rows are left out, because their
# make-up is counted when it takes place.
TAUGHT = (
    SessionStatus.ATTENDED.value,
    SessionStatus.ATTENDED_MAKEUP.value,
    SessionStatus.SCHEDULED.value,
    SessionStatus.MAKEUP_CLASS.value,
    SessionStatus.TRIAL_CLASS.value,
)

Candidate = Tuple[float, str]

# Lines about the tutor's own counts lose a tie to lines about people and
# dates, so two tutors on the same timetable don't see the same greeting.
NUMBER_TIE = 0.5

_WORDS = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten"}
_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def word(n: int) -> str:
    return _WORDS.get(n, f"{n:,}")


def ordinal(n: int) -> str:
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n:,}{suffix}"


# ---------------------------------------------------------------------------
# Number facts
# ---------------------------------------------------------------------------

def _is_prime(n: int) -> bool:
    return n > 1 and all(n % p for p in range(2, math.isqrt(n) + 1))


def _fibonacci_upto(limit: int) -> set:
    out, a, b = {1, 2}, 1, 2
    while b <= limit:
        a, b = b, a + b
        out.add(b)
    return out


_FIBONACCI = _fibonacci_upto(100_000)


def properties(n: int) -> List[Candidate]:
    """
    Every notable property of n, strongest first, as (weight, phrase).

    Primes come out light on purpose. At the sizes a class count reaches,
    about one number in six is prime, so a prime alone would turn up several
    times a week and stop being interesting. It's still there as a fallback
    for a day with nothing else to say.
    """
    out: List[Candidate] = []
    if n < 2:
        return out
    root = math.isqrt(n)
    cube = round(n ** (1 / 3))
    if n in (6, 28, 496, 8128):
        out.append((9, "a perfect number, because its other factors add up to it"))
    if cube ** 3 == n and n > 8:
        out.append((8, f"{cube} cubed"))
    if n in _FIBONACCI and n > 21:
        out.append((8, "a Fibonacci number"))
    if root * root == n and n > 9:
        out.append((7, f"{root} squared"))
    if n > 16 and n & (n - 1) == 0:
        out.append((7, f"2 to the power {n.bit_length() - 1}"))
    k = (math.isqrt(8 * n + 1) - 1) // 2
    if k * (k + 1) // 2 == n and n > 20:
        out.append((5, f"a triangular number, so {n} dots make a triangle {k} rows deep"))
    digits = str(n)
    if len(digits) >= 3 and digits == digits[::-1]:
        out.append((5, "a palindrome"))
    if _is_prime(n) and n > 50:
        backwards = int(digits[::-1])
        if backwards != n and _is_prime(backwards):
            out.append((3, f"a prime, and so is {backwards}, which is {n} backwards"))
        else:
            out.append((1, "a prime"))
    return sorted(out, key=lambda p: -p[0])


def number_fact(n: int) -> Optional[Candidate]:
    """One sentence about n's most interesting properties, with its weight."""
    props = properties(n)
    if not props:
        return None
    phrases = [props[0][1]]
    # A second property reads well only when neither one carries its own clause.
    if len(props) > 1 and "," not in props[0][1] and "," not in props[1][1]:
        phrases.append(props[1][1])
    weight = props[0][0] + (len(phrases) - 1)
    return weight, f"{n} is {' and '.join(phrases)}."


# ---------------------------------------------------------------------------
# Lines from the tutor's data
# ---------------------------------------------------------------------------

def school_year_start(db: Session, today: date) -> date:
    """The first lesson day of the regular intake the current school year began with."""
    start = (
        db.query(func.max(RegularCourseConfig.course_start_date))
        .filter(RegularCourseConfig.course_start_date <= today)
        .scalar()
    )
    if start:
        return start
    # No intake configured yet, which only happens on a fresh install.
    return date(today.year if today.month >= 9 else today.year - 1, 9, 1)


def _start_time(time_slot: Optional[str]) -> str:
    return (time_slot or "").split("-")[0].strip()


def _when(day: date, today: date) -> str:
    name = _WEEKDAYS[day.weekday()]
    if day.isocalendar()[1] != today.isocalendar()[1]:
        return f"next {name}"
    return f"this {name}"


def gather(db: Session, tutor_id: int, today: date) -> List[Candidate]:
    """Every line that could be said today, each with a weight."""
    cands: List[Candidate] = []
    year_start = school_year_start(db, today)
    window_start = min(year_start, today - timedelta(days=56))

    # One read of the tutor's classes, from whichever is earlier of the school
    # year's start and eight weeks ago, up to four weeks ahead. Summer
    # enrolments are a different course and don't count towards the year.
    rows = (
        db.query(
            SessionLog.session_date,
            SessionLog.time_slot,
            SessionLog.session_status,
            SessionLog.student_id,
            Student.student_name,
            Student.school,
            Student.grade,
        )
        .join(Student, Student.id == SessionLog.student_id)
        .outerjoin(Enrollment, Enrollment.id == SessionLog.enrollment_id)
        .filter(
            SessionLog.tutor_id == tutor_id,
            SessionLog.session_date >= window_start,
            SessionLog.session_date <= today + timedelta(days=28),
            SessionLog.session_status.in_(TAUGHT),
            func.coalesce(Enrollment.enrollment_type, "") != "Summer",
        )
        .all()
    )
    if not rows:
        return cands + _holiday_lines(db, today)

    today_rows = [r for r in rows if r.session_date == today]
    slots_by_day = defaultdict(set)
    for r in rows:
        slots_by_day[r.session_date].add(r.time_slot)
    today_slots = sorted(slots_by_day.get(today, ()), key=lambda t: t or "")
    active = {r.student_id for r in rows if abs((r.session_date - today).days) <= 28}

    # Class milestones this school year. Only the best one of the day is kept,
    # so a tutor with five classes doesn't get five competing lines.
    before = sum(len(v) for d, v in slots_by_day.items() if year_start <= d < today)
    best_class: Optional[Candidate] = None
    for i, slot in enumerate(today_slots, start=1):
        n = before + i
        if n % 100 == 0 or n == 50:
            line = (9, f"Your {_start_time(slot)} class is your {ordinal(n)} this school year.")
        else:
            fact = number_fact(n)
            if not fact:
                continue
            line = (fact[0], f"Your {_start_time(slot)} class is your {ordinal(n)} this school year, and {fact[1]}")
        if best_class is None or line[0] > best_class[0]:
            best_class = line
    if best_class:
        cands.append((best_class[0] - NUMBER_TIE, best_class[1]))

    # Today's own counts, when the number is interesting.
    if today_rows:
        students = len({r.student_id for r in today_rows})
        recent = defaultdict(set)
        for r in rows:
            if 0 < (today - r.session_date).days <= 56:
                recent[r.session_date].add(r.student_id)
        if recent and students > max(len(v) for v in recent.values()):
            cands.append((7, f"You have {students} students across {word(len(today_slots))} classes today, "
                             "more than on any day in the last eight weeks."))
        fact = number_fact(students)
        if fact and fact[0] >= 7:
            cands.append((fact[0] - 2 - NUMBER_TIE, f"You have {students} students today, and {fact[1]}"))

    # A student's first lesson with this tutor.
    first_seen = dict(
        db.query(SessionLog.student_id, func.min(SessionLog.session_date))
        .filter(
            SessionLog.tutor_id == tutor_id,
            SessionLog.student_id.in_(sorted({r.student_id for r in today_rows}) or [-1]),
            SessionLog.session_status.in_(TAUGHT),
        )
        .group_by(SessionLog.student_id)
        .all()
    )
    for r in sorted(today_rows, key=lambda r: r.time_slot or ""):
        if first_seen.get(r.student_id) == today and r.session_status != SessionStatus.MAKEUP_CLASS.value:
            cands.append((9, f"{r.student_name} has a first lesson with you today at {_start_time(r.time_slot)}."))

    # Anniversaries of a student's first enrolled lesson with this tutor, for
    # students who are still coming.
    names = {r.student_id: r.student_name for r in rows}
    today_ids = {r.student_id for r in today_rows}
    firsts = (
        db.query(Enrollment.student_id, func.min(Enrollment.first_lesson_date))
        .filter(Enrollment.tutor_id == tutor_id, Enrollment.first_lesson_date.isnot(None),
                Enrollment.student_id.in_(sorted(active) or [-1]))
        .group_by(Enrollment.student_id)
        .all()
    )
    for student_id, first in firsts:
        if (first.month, first.day) == (today.month, today.day) and first.year < today.year:
            years = today.year - first.year
            here = student_id in today_ids
            tail = ", and they're in today" if here else ""
            cands.append((9 if here else 8, f"{names[student_id]} started with you {word(years)} "
                                            f"year{'s' if years > 1 else ''} ago today{tail}."))

    # The test, quiz or exam in the next few days that most of the tutor's
    # students sit. Said on Mondays and Thursdays, so it doesn't repeat daily.
    if today.weekday() in (0, 3):
        roster = defaultdict(set)
        for r in rows:
            if r.student_id in active and r.school and r.grade:
                roster[(r.school, r.grade)].add(r.student_id)
        events = (
            db.query(CalendarEvent)
            .filter(CalendarEvent.start_date > today, CalendarEvent.start_date <= today + timedelta(days=5))
            .all()
        )
        soon = [(len(roster[(e.school, e.grade)]), e) for e in events if roster.get((e.school, e.grade))]
        if soon:
            n, e = max(soon, key=lambda x: (x[0], -x[1].start_date.toordinal()))
            kind = (e.event_type or "test").lower()
            who = f"{word(n)} of your students sit it" if n > 1 else "one of your students sits it"
            rest = len(soon) - 1
            more = f" Your students have {word(rest)} more in the next five days." if rest else ""
            cands.append((6 + min(n, 4) // 2, f"{e.school} {e.grade} has a {kind} {_when(e.start_date, today)}, "
                                              f"and {who}.{more}"))

    return cands + _holiday_lines(db, today)


def _holiday_lines(db: Session, today: date) -> List[Candidate]:
    """
    A holiday in the coming week, said once: on the day it comes six days into
    view, or on the Monday of its week if it came into view over a weekend.
    A holiday affects everyone's week, so it outweighs most other lines.
    """
    upcoming = (
        db.query(Holiday)
        .filter(Holiday.holiday_date > today, Holiday.holiday_date <= today + timedelta(days=6))
        .order_by(Holiday.holiday_date)
        .all()
    )
    if not upcoming:
        return []
    first = upcoming[0]
    ahead = (first.holiday_date - today).days
    if not (ahead == 6 or (today.weekday() == 0 and ahead < 6)):
        return []
    run = [h for h in upcoming if h.holiday_name == first.holiday_name]
    name = first.holiday_name or "A holiday"
    if len(run) > 1:
        return [(8.5, f"{name} starts {_when(first.holiday_date, today)}, so there are no lessons "
                    f"from then until {_WEEKDAYS[run[-1].holiday_date.weekday()]}.")]
    return [(8.5, f"{name} is {_when(first.holiday_date, today)}, so there are no lessons that day.")]


def greeting_line(db: Session, tutor_id: int, today: date) -> Optional[str]:
    """The heaviest line for today, or None when nothing is worth saying."""
    cands = gather(db, tutor_id, today)
    if not cands:
        return None
    return max(cands, key=lambda c: c[0])[1]
