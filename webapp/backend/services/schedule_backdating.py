"""Validate explicit backdated moves without changing attendance or sold counts."""
from datetime import timedelta

from constants import CONFLICTING_SESSION_STATUSES
from models import SessionLog


def first_week_start(first_date):
    """A new weekday may fall before the first lesson in the same calendar week."""
    return first_date - timedelta(days=first_date.weekday())


def validate_backdated_targets(db, enrollment, targets, effective, today, coverage_from, coverage_through):
    """Targets are (source session, final date, final time) from the reviewed plan."""
    backdated = effective < today or any(day < today for _, day, _ in targets)
    if not backdated:
        return False, []
    from billing.workflow import time_range
    from billing.guards import workflow_enabled
    issues = []
    ids = {row.id for row, _, _ in targets}
    all_sessions = db.query(SessionLog).filter_by(student_id=enrollment.student_id).all()
    for row, day, time in targets:
        if (row.session_status != 'Scheduled' or row.make_up_for_id or row.rescheduled_to_id
                or any(other.make_up_for_id == row.id for other in all_sessions)):
            issues.append('Existing attendance or make-up arrangements need review before backdating this change.')
        if not coverage_from <= day <= coverage_through:
            issues.append('Keep the changed sessions within the enrollment period.')
        start, end = time_range(time)
        for other in all_sessions:
            if other.id in ids or other.session_date != day or other.session_status not in CONFLICTING_SESSION_STATUSES:
                continue
            other_start, other_end = time_range(other.time_slot)
            if start < other_end and other_start < end:
                issues.append(f'The student already has a lesson at this time on {day}.')
        for other, other_day, other_time in targets:
            if other.id == row.id or other_day != day:
                continue
            other_start, other_end = time_range(other_time)
            if start < other_end and other_start < end:
                issues.append('The changed lessons overlap. Choose different times.')
    if workflow_enabled():
        from billing.models import BillingLessonClaim
        claims = db.query(BillingLessonClaim).filter_by(student_id=enrollment.student_id).all()
        for _, day, time in targets:
            start, end = time_range(time)
            for claim in claims:
                if claim.session_id in ids or claim.lesson_date != day:
                    continue
                other_start, other_end = time_range(claim.time_slot)
                if start < other_end and other_start < end:
                    issues.append(f'Another confirmed lesson already covers {day}.')
    return True, list(dict.fromkeys(issues))
