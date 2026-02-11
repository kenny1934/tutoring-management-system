"""
Configuration for the Super Admin debug panel.
Defines which tables can be accessed and their specific settings.
"""

# Tables that can be accessed via the debug panel
# Priority determines display order (lower = higher priority)
DEBUG_TABLE_CONFIG = {
    # Priority 1: Most commonly needed tables
    "session_log": {
        "display_name": "Sessions",
        "primary_key": "id",
        "priority": 1,
        "readonly_columns": ["id"],
        "hidden_columns": [],
        "search_columns": ["notes", "session_status"],
        "default_sort": ("session_date", "desc"),
        "allow_hard_delete": True,
    },
    "enrollments": {
        "display_name": "Enrollments",
        "primary_key": "id",
        "priority": 2,
        "readonly_columns": ["id"],
        "hidden_columns": [],
        "search_columns": ["remark", "payment_status"],
        "default_sort": ("id", "desc"),
        "allow_hard_delete": True,
    },
    "students": {
        "display_name": "Students",
        "primary_key": "id",
        "priority": 3,
        "readonly_columns": ["id"],
        "hidden_columns": [],
        "search_columns": ["student_name", "school_student_id", "phone", "school"],
        "default_sort": ("student_name", "asc"),
        "allow_hard_delete": True,
    },

    # Priority 2: Reference tables
    "tutors": {
        "display_name": "Tutors",
        "primary_key": "id",
        "priority": 10,
        "readonly_columns": ["id"],
        "hidden_columns": [],
        "search_columns": ["tutor_name", "user_email"],
        "default_sort": ("tutor_name", "asc"),
        "allow_hard_delete": True,
    },
    "discounts": {
        "display_name": "Discounts",
        "primary_key": "id",
        "priority": 11,
        "readonly_columns": ["id"],
        "hidden_columns": [],
        "search_columns": ["discount_name"],
        "default_sort": ("id", "desc"),
        "allow_hard_delete": True,
    },
    "holidays": {
        "display_name": "Holidays",
        "primary_key": "id",
        "priority": 12,
        "readonly_columns": ["id"],
        "hidden_columns": [],
        "search_columns": ["location"],
        "default_sort": ("holiday_date", "desc"),
        "allow_hard_delete": True,
    },

    # Priority 3: Supporting tables
    "calendar_events": {
        "display_name": "Calendar Events",
        "primary_key": "id",
        "priority": 20,
        "readonly_columns": ["id", "created_at", "updated_at"],
        "hidden_columns": [],
        "search_columns": ["title", "description", "school"],
        "default_sort": ("start_date", "desc"),
        "allow_hard_delete": True,
    },
    "exam_revision_slots": {
        "display_name": "Exam Revision Slots",
        "primary_key": "id",
        "priority": 21,
        "readonly_columns": ["id", "created_at"],
        "hidden_columns": [],
        "search_columns": ["notes", "location"],
        "default_sort": ("session_date", "desc"),
        "allow_hard_delete": True,
    },
    "extension_requests": {
        "display_name": "Extension Requests",
        "primary_key": "id",
        "priority": 22,
        "readonly_columns": ["id", "created_at"],
        "hidden_columns": [],
        "search_columns": ["reason", "status"],
        "default_sort": ("created_at", "desc"),
        "allow_hard_delete": True,
    },
    "parent_communications": {
        "display_name": "Parent Communications",
        "primary_key": "id",
        "priority": 23,
        "readonly_columns": ["id", "created_at"],
        "hidden_columns": [],
        "search_columns": ["notes", "contact_method"],
        "default_sort": ("contact_date", "desc"),
        "allow_hard_delete": True,
    },
    "termination_records": {
        "display_name": "Termination Records",
        "primary_key": "id",
        "priority": 24,
        "readonly_columns": ["id", "created_at"],
        "hidden_columns": [],
        "search_columns": ["termination_reason", "notes"],
        "default_sort": ("created_at", "desc"),
        "allow_hard_delete": True,
    },
    "tutor_memos": {
        "display_name": "Tutor Memos",
        "primary_key": "id",
        "priority": 25,
        "readonly_columns": ["id", "created_at", "updated_at"],
        "hidden_columns": [],
        "search_columns": ["notes", "status", "created_by"],
        "default_sort": ("memo_date", "desc"),
        "allow_hard_delete": True,
    },

    # Priority 4: Messaging tables
    "tutor_messages": {
        "display_name": "Tutor Messages",
        "primary_key": "id",
        "priority": 30,
        "readonly_columns": ["id", "created_at"],
        "hidden_columns": [],
        "search_columns": ["content"],
        "default_sort": ("created_at", "desc"),
        "allow_hard_delete": True,
    },
    "message_read_receipts": {
        "display_name": "Message Read Receipts",
        "primary_key": "id",
        "priority": 31,
        "readonly_columns": ["id"],
        "hidden_columns": [],
        "search_columns": [],
        "default_sort": ("read_at", "desc"),
        "allow_hard_delete": True,
    },
    "message_likes": {
        "display_name": "Message Likes",
        "primary_key": "id",
        "priority": 32,
        "readonly_columns": ["id"],
        "hidden_columns": [],
        "search_columns": [],
        "default_sort": ("id", "desc"),
        "allow_hard_delete": True,
    },
    "message_archives": {
        "display_name": "Message Archives",
        "primary_key": "id",
        "priority": 33,
        "readonly_columns": ["id"],
        "hidden_columns": [],
        "search_columns": [],
        "default_sort": ("archived_at", "desc"),
        "allow_hard_delete": True,
    },

    # Priority 5: Makeup and scheduling
    "makeup_proposals": {
        "display_name": "Makeup Proposals",
        "primary_key": "id",
        "priority": 40,
        "readonly_columns": ["id", "created_at"],
        "hidden_columns": [],
        "search_columns": ["reason", "status"],
        "default_sort": ("created_at", "desc"),
        "allow_hard_delete": True,
    },
    "makeup_proposal_slots": {
        "display_name": "Makeup Proposal Slots",
        "primary_key": "id",
        "priority": 41,
        "readonly_columns": ["id"],
        "hidden_columns": [],
        "search_columns": [],
        "default_sort": ("id", "desc"),
        "allow_hard_delete": True,
    },
    "planned_reschedules": {
        "display_name": "Planned Reschedules",
        "primary_key": "id",
        "priority": 42,
        "readonly_columns": ["id", "created_at"],
        "hidden_columns": [],
        "search_columns": ["notes"],
        "default_sort": ("created_at", "desc"),
        "allow_hard_delete": True,
    },

    # Priority 6: Session-related tables
    "session_exercises": {
        "display_name": "Session Exercises",
        "primary_key": "id",
        "priority": 50,
        "readonly_columns": ["id"],
        "hidden_columns": [],
        "search_columns": ["stable_id"],
        "default_sort": ("id", "desc"),
        "allow_hard_delete": True,
    },
    "homework_completion": {
        "display_name": "Homework Completion",
        "primary_key": "id",
        "priority": 51,
        "readonly_columns": ["id"],
        "hidden_columns": [],
        "search_columns": [],
        "default_sort": ("id", "desc"),
        "allow_hard_delete": True,
    },
    "homework_to_check": {
        "display_name": "Homework To Check",
        "primary_key": "id",
        "priority": 52,
        "readonly_columns": ["id"],
        "hidden_columns": [],
        "search_columns": ["stable_id"],
        "default_sort": ("id", "desc"),
        "allow_hard_delete": True,
    },
    "session_curriculum_suggestions": {
        "display_name": "Curriculum Suggestions",
        "primary_key": "id",
        "priority": 53,
        "readonly_columns": ["id"],
        "hidden_columns": [],
        "search_columns": [],
        "default_sort": ("id", "desc"),
        "allow_hard_delete": True,
    },

    # Priority 7: Student-related
    "student_coupons": {
        "display_name": "Student Coupons",
        "primary_key": "id",
        "priority": 60,
        "readonly_columns": ["id"],
        "hidden_columns": [],
        "search_columns": ["notes"],
        "default_sort": ("id", "desc"),
        "allow_hard_delete": True,
    },

    # Priority 8: System/config tables
    "location_settings": {
        "display_name": "Location Settings",
        "primary_key": "id",
        "priority": 70,
        "readonly_columns": ["id"],
        "hidden_columns": [],
        "search_columns": ["location"],
        "default_sort": ("location", "asc"),
        "allow_hard_delete": True,
    },
    "office_ip_whitelist": {
        "display_name": "Office IP Whitelist",
        "primary_key": "id",
        "priority": 71,
        "readonly_columns": ["id"],
        "hidden_columns": [],
        "search_columns": ["ip_address", "description"],
        "default_sort": ("id", "desc"),
        "allow_hard_delete": True,
    },

    # Audit log (read-only for debugging)
    "debug_audit_logs": {
        "display_name": "Debug Audit Logs",
        "primary_key": "id",
        "priority": 99,
        "readonly_columns": ["id", "admin_id", "admin_email", "operation", "table_name", "row_id", "before_state", "after_state", "changed_fields", "ip_address", "created_at"],
        "hidden_columns": [],
        "search_columns": ["admin_email", "table_name", "operation"],
        "default_sort": ("created_at", "desc"),
        "allow_hard_delete": False,
    },
}


def get_table_config(table_name: str) -> dict | None:
    """Get configuration for a specific table, or None if not allowed."""
    return DEBUG_TABLE_CONFIG.get(table_name)


def get_allowed_tables() -> list[str]:
    """Get list of all allowed table names."""
    return list(DEBUG_TABLE_CONFIG.keys())


def is_table_allowed(table_name: str) -> bool:
    """Check if a table is allowed for debug access."""
    return table_name in DEBUG_TABLE_CONFIG
