"""
Shared constants for the backend.

Centralizes session status lists and other constants used across routers.
"""
from enum import Enum


class SessionStatus(str, Enum):
    """
    All valid session statuses.

    Using str + Enum allows direct comparison with string values and JSON serialization.
    """
    # Base statuses
    SCHEDULED = 'Scheduled'
    TRIAL_CLASS = 'Trial Class'
    MAKEUP_CLASS = 'Make-up Class'

    # Attended statuses
    ATTENDED = 'Attended'
    ATTENDED_MAKEUP = 'Attended (Make-up)'

    # No show
    NO_SHOW = 'No Show'

    # Rescheduled statuses
    RESCHEDULED_PENDING = 'Rescheduled - Pending Make-up'
    RESCHEDULED_BOOKED = 'Rescheduled - Make-up Booked'

    # Sick leave statuses
    SICK_LEAVE_PENDING = 'Sick Leave - Pending Make-up'
    SICK_LEAVE_BOOKED = 'Sick Leave - Make-up Booked'

    # Weather cancelled statuses
    WEATHER_PENDING = 'Weather Cancelled - Pending Make-up'
    WEATHER_BOOKED = 'Weather Cancelled - Make-up Booked'

    # Cancelled
    CANCELLED = 'Cancelled'


# Session statuses that represent "enrolled" sessions (student is attending)
ENROLLED_SESSION_STATUSES = [
    SessionStatus.SCHEDULED.value,
    SessionStatus.MAKEUP_CLASS.value,
    SessionStatus.ATTENDED.value,
    SessionStatus.ATTENDED_MAKEUP.value,
]

# Session statuses for pending make-ups (original session was missed/rescheduled)
PENDING_MAKEUP_STATUSES = [
    SessionStatus.RESCHEDULED_PENDING.value,
    SessionStatus.SICK_LEAVE_PENDING.value,
    SessionStatus.WEATHER_PENDING.value,
]

# Session statuses with make-up already booked
MAKEUP_BOOKED_STATUSES = [
    SessionStatus.RESCHEDULED_BOOKED.value,
    SessionStatus.SICK_LEAVE_BOOKED.value,
    SessionStatus.WEATHER_BOOKED.value,
]

# Session statuses that can be scheduled/modified
SCHEDULABLE_STATUSES = [
    SessionStatus.SCHEDULED.value,
    SessionStatus.MAKEUP_CLASS.value,
]

# Session statuses that represent completed sessions
COMPLETED_STATUSES = [
    SessionStatus.ATTENDED.value,
    SessionStatus.ATTENDED_MAKEUP.value,
]

# Session statuses valid for marking attendance
ATTENDABLE_STATUSES = [
    SessionStatus.SCHEDULED.value,
    SessionStatus.MAKEUP_CLASS.value,
    SessionStatus.TRIAL_CLASS.value,
]

# Session statuses that are "non-countable" (don't count toward session totals)
NON_COUNTABLE_STATUSES = [
    SessionStatus.CANCELLED.value,
]

# Status patterns for non-countable sessions (matched via string contains)
NON_COUNTABLE_STATUS_PATTERNS = [
    'Pending Make-up',
    'Make-up Booked',
]

# All valid session status values (for validation)
ALL_SESSION_STATUSES = [status.value for status in SessionStatus]
