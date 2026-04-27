"""
Shared constants for the backend.

Centralizes session status lists and other constants used across routers.
"""
from datetime import datetime, timezone, timedelta
from enum import Enum

# Hong Kong timezone (UTC+8) — matches DB convention: CONVERT_TZ(NOW(), '+00:00', '+08:00')
HK_TZ = timezone(timedelta(hours=8))


def hk_now() -> datetime:
    """Current time in Hong Kong (UTC+8) as naive datetime, matching DB convention."""
    return datetime.now(HK_TZ).replace(tzinfo=None)


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

# Exercise type identifiers (DB always stores short form)
CW_TYPE = "CW"
HW_TYPE = "HW"

# Calendar event types that represent tests/exams
EXAM_EVENT_TYPES = ('Test', 'Quiz', 'Exam', 'Final Exam', 'Mid-term', 'Mock')

# Fee calculation
BASE_FEE_PER_LESSON = 400
REGISTRATION_FEE = 100

# Grace period: students remain in "active" lists for this many days after enrollment expires
ACTIVE_GRACE_PERIOD_DAYS = 21

# ============================================
# Summer Course Statuses
# ============================================

class SummerApplicationStatus(str, Enum):
    """Application statuses for summer course applications."""
    SUBMITTED = 'Submitted'
    UNDER_REVIEW = 'Under Review'
    PLACEMENT_OFFERED = 'Placement Offered'
    PLACEMENT_CONFIRMED = 'Placement Confirmed'
    FEE_SENT = 'Fee Sent'
    PAID = 'Paid'
    ENROLLED = 'Enrolled'
    # Side exits
    WAITLISTED = 'Waitlisted'
    WITHDRAWN = 'Withdrawn'
    REJECTED = 'Rejected'


class SummerPlacementStatus(str, Enum):
    """Placement statuses for summer course slot assignments."""
    TENTATIVE = 'Tentative'
    CONFIRMED = 'Confirmed'
    CANCELLED = 'Cancelled'
    RESCHEDULED = 'Rescheduled - Pending Make-up'

# Statuses where the student will not attend the lesson (excluded from capacity).
# Includes every Pending Make-up variant (rescheduled / sick leave / weather
# cancelled). Make-up Booked variants aren't listed here because under the
# Follow-up 3 invariant they only exist on origin rows whose summer_session_id
# has migrated away; the arrangement renders them via chain traversal.
SUMMER_NON_ATTENDING_STATUSES = (
    SessionStatus.CANCELLED.value,
    *PENDING_MAKEUP_STATUSES,
)

# Sessions that don't count toward an application's "active placements" used
# in session-plan vs placed comparisons. Excludes both pending and booked
# make-up origin rows (the booked make-up itself lives on a different row and
# is counted there).
SUMMER_INACTIVE_PLACEMENT_STATUSES = (
    *SUMMER_NON_ATTENDING_STATUSES,
    *MAKEUP_BOOKED_STATUSES,
)


class SummerSiblingVerificationStatus(str, Enum):
    """Verification status for self-declared primary-branch sibling members of a buddy group."""
    PENDING = 'Pending'
    CONFIRMED = 'Confirmed'
    REJECTED = 'Rejected'


# Primary / KidsConcept branches that secondary applicants can declare a sibling at.
# Display names are shown in the public form's branch picker. Codes match the
# existing source_branch values used in summer_buddy_members.
PRIMARY_BRANCH_OPTIONS = [
    {"code": "MAC", "name_zh": "高士德分校",   "name_en": "Costa Center"},
    {"code": "MCP", "name_zh": "水坑尾分校",   "name_en": "Campo Center"},
    {"code": "MNT", "name_zh": "東方明珠分校", "name_en": "Areia Preta Center"},
    {"code": "MTA", "name_zh": "氹仔美景I分校", "name_en": "Taipa Mei Keng Center I"},
    {"code": "MLT", "name_zh": "林茂塘分校",   "name_en": "Lam Mau Tong Center"},
    {"code": "MTR", "name_zh": "氹仔美景II分校", "name_en": "Taipa Mei Keng Center II"},
    {"code": "MOT", "name_zh": "二龍喉分校",   "name_en": "Flora Garden Center"},
    {"code": "KC",  "name_zh": "KidsConcept",  "name_en": "KidsConcept"},
]
PRIMARY_BRANCH_CODES = {b["code"] for b in PRIMARY_BRANCH_OPTIONS}


# Secondary (summer) branch display-name → short code. The summer course
# config stores locations in Chinese display form; enrollments and session_log
# normalize to the short codes (MSA/MSB) that the rest of the admin UI uses.
# Mirror of LOCATION_TO_CODE in webapp/frontend/lib/summer-utils.tsx — keep
# the two in sync when a new branch is added.
SECONDARY_LOCATION_TO_CODE = {
    "華士古分校": "MSA",
    "二龍喉分校": "MSB",
}


def normalize_secondary_location(location: str | None) -> str | None:
    """Convert a summer-config display location (Chinese) to its short code.
    Pass-through for values that aren't in the map, so admin-entered short
    codes stay as-is."""
    if not location:
        return location
    return SECONDARY_LOCATION_TO_CODE.get(location, location)


# Day-of-week short forms used throughout the enrollments / session_log
# tables. Slots on the summer side store full names ("Saturday"); the rest
# of the CSM system uses the 3-letter abbreviation.
DAY_FULL_TO_SHORT = {
    "Monday": "Mon",
    "Tuesday": "Tue",
    "Wednesday": "Wed",
    "Thursday": "Thu",
    "Friday": "Fri",
    "Saturday": "Sat",
    "Sunday": "Sun",
}


def normalize_day_short(day: str | None) -> str | None:
    """Return the 3-letter form of a weekday name; pass-through if already short."""
    if not day:
        return day
    return DAY_FULL_TO_SHORT.get(day, day)
