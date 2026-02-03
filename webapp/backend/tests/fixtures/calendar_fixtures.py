"""
Google Calendar test fixtures.

Sample data for mocking Google Calendar API responses in tests.
"""
from datetime import date, datetime, timezone


# Sample Google Calendar API responses (raw format from Google API)
SAMPLE_GOOGLE_CALENDAR_EVENTS = [
    {
        "id": "event_001",
        "summary": "TIS F2 Test",
        "description": "Chapter 5 Mathematics Test",
        "start": {"date": "2026-02-10"},
        "end": {"date": "2026-02-10"},
    },
    {
        "id": "event_002",
        "summary": "PCMS F4(A) Exam",
        "description": "Mid-term Examination",
        "start": {"date": "2026-02-15"},
        "end": {"date": "2026-02-15"},
    },
    {
        "id": "event_003",
        "summary": "CSWCSS F5 Science Quiz",
        "description": "Physics Quiz",
        "start": {"dateTime": "2026-02-20T09:00:00+08:00"},
        "end": {"dateTime": "2026-02-20T10:00:00+08:00"},
    },
    {
        "id": "event_004",
        "summary": "SRL-E F3 Test",
        "description": "English Test",
        "start": {"date": "2026-02-25"},
        "end": {"date": "2026-02-25"},
    },
    {
        "id": "event_005",
        "summary": "嶺南 F2 Test",
        "description": "Chinese school test",
        "start": {"date": "2026-03-01"},
        "end": {"date": "2026-03-01"},
    },
    {
        "id": "event_006",
        "summary": "SYMS-F4 Quiz",
        "description": "Compact format test",
        "start": {"date": "2026-03-05"},
        "end": {"date": "2026-03-05"},
    },
    {
        "id": "event_007",
        "summary": "PCMS F4S Midterm",
        "description": "Science stream midterm",
        "start": {"date": "2026-03-10"},
        "end": {"date": "2026-03-10"},
    },
]


# Parsed events (what the service returns after parsing)
SAMPLE_PARSED_EVENTS = [
    {
        "event_id": "event_001",
        "title": "TIS F2 Test",
        "description": "Chapter 5 Mathematics Test",
        "start_date": date(2026, 2, 10),
        "end_date": date(2026, 2, 10),
        "school": "TIS",
        "grade": "F2",
        "academic_stream": None,
        "event_type": "Test",
    },
    {
        "event_id": "event_002",
        "title": "PCMS F4(A) Exam",
        "description": "Mid-term Examination",
        "start_date": date(2026, 2, 15),
        "end_date": date(2026, 2, 15),
        "school": "PCMS",
        "grade": "F4",
        "academic_stream": "A",
        "event_type": "Exam",
    },
]


# Title parsing test cases: (title, expected_school, expected_grade, expected_stream, expected_type)
TITLE_PARSING_TEST_CASES = [
    # Standard format
    ("TIS F2 Test", "TIS", "F2", None, "Test"),
    ("PCMS F4 Exam", "PCMS", "F4", None, "Exam"),
    ("CSWCSS F5 Quiz", "CSWCSS", "F5", None, "Quiz"),

    # With academic stream in parentheses
    ("PCMS F4(A) Exam", "PCMS", "F4", "A", "Exam"),
    ("TIS F5(S) Test", "TIS", "F5", "S", "Test"),
    ("CSWCSS F4(C) Quiz", "CSWCSS", "F4", "C", "Quiz"),

    # Compact stream format (F4A, F4S, F4C)
    ("PCMS F4A Midterm", "PCMS", "F4", "A", "Exam"),
    ("TIS F5S Test", "TIS", "F5", "S", "Test"),

    # Spelled out stream format
    ("PCMS F4 Art Test", "PCMS", "F4", "A", "Test"),
    ("TIS F5 Science Exam", "TIS", "F5", "S", "Exam"),
    ("CSWCSS F4 Commerce Quiz", "CSWCSS", "F4", "C", "Quiz"),

    # Chinese school names
    ("嶺南 F2 Test", "嶺南", "F2", None, "Test"),
    ("培正 F3 Exam", "培正", "F3", None, "Exam"),

    # Compact format (SCHOOL-F4)
    ("SYMS-F4 Quiz", "SYMS", "F4", None, "Quiz"),

    # Stream indicator in school name
    ("SRL-E F3 Test", "SRL-E", "F3", None, "Test"),

    # Event type normalization
    ("TIS F2 CCP", "TIS", "F2", None, "Quiz"),  # CCP -> Quiz
    ("PCMS F4 Midterm", "PCMS", "F4", None, "Exam"),  # Midterm -> Exam
    ("TIS F3 Final", "TIS", "F3", None, "Exam"),  # Final -> Exam

    # Edge cases
    ("", None, None, None, None),  # Empty string
    ("Single", None, None, None, None),  # Single word - no match
]


def make_google_api_response(events: list, next_page_token: str = None) -> dict:
    """Create a mock Google Calendar API response."""
    response = {"items": events}
    if next_page_token:
        response["nextPageToken"] = next_page_token
    return response
