"""
Shared constants for the backend.

Centralizes session status lists and other constants used across routers.
"""

# Session statuses that represent "enrolled" sessions (student is attending)
ENROLLED_SESSION_STATUSES = [
    'Scheduled',
    'Make-up Class',
    'Attended',
    'Attended (Make-up)',
]

# Session statuses for pending make-ups (original session was missed/rescheduled)
PENDING_MAKEUP_STATUSES = [
    'Rescheduled - Pending Make-up',
    'Sick Leave - Pending Make-up',
    'Weather Cancelled - Pending Make-up',
]

# Session statuses that can be scheduled/modified
SCHEDULABLE_STATUSES = [
    'Scheduled',
    'Make-up Class',
]

# Session statuses that represent completed sessions
COMPLETED_STATUSES = [
    'Attended',
    'Attended (Make-up)',
]

# Session statuses that are "non-countable" (don't count toward session totals)
NON_COUNTABLE_STATUSES = [
    'Cancelled',
]

# Status patterns for non-countable sessions (matched via string contains)
NON_COUNTABLE_STATUS_PATTERNS = [
    'Pending Make-up',
    'Make-up Booked',
]
