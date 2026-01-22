"""
Google Calendar service for fetching and caching test/exam events.
Parses event titles to extract school, grade, and event type information.
"""

import os
import re
from datetime import datetime, timedelta
from typing import List, Optional, Dict
from googleapiclient.discovery import build
from google.oauth2 import service_account
from sqlalchemy.orm import Session

# Calendar configuration from environment
CALENDAR_ID = os.getenv("GOOGLE_CALENDAR_ID", "msamacau01@gmail.com")
API_KEY = os.getenv("GOOGLE_CALENDAR_API_KEY")
SYNC_TTL_MINUTES = int(os.getenv("CALENDAR_SYNC_TTL_MINUTES", "15"))

# Regex pattern for parsing event titles
# Format: SCHOOL GRADE EVENT_TYPE
# Examples: "TIS F2 Test", "PCMS F4(A) Exam", "SRL-E F3 Quiz"
# Supports: F4(A), F4A, F4 Art, F4 Science, F4 Commerce
EVENT_TITLE_PATTERN = re.compile(
    r'^([A-Z0-9\-]+)\s+(F[1-6](?:\([ASC]\))?(?:[ASC])?(?:\s+(?:Art|Science|Commerce))?)\s+(.+)$',
    re.IGNORECASE
)


class GoogleCalendarService:
    """Service for interacting with Google Calendar API"""

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize the Google Calendar service.

        Args:
            api_key: Google Calendar API key for public calendar access
        """
        self.api_key = api_key or API_KEY
        if not self.api_key:
            raise ValueError("GOOGLE_CALENDAR_API_KEY environment variable is required")

        self.service = build('calendar', 'v3', developerKey=self.api_key)
        self.calendar_id = CALENDAR_ID

    def fetch_upcoming_events(
        self,
        days_ahead: int = 90,
        days_behind: int = 0,
        max_results: int = 250
    ) -> List[Dict]:
        """
        Fetch events from Google Calendar.

        Args:
            days_ahead: Number of days ahead to fetch events
            days_behind: Number of days in the past to fetch events (0 = today onwards)
            max_results: Maximum number of events to retrieve

        Returns:
            List of calendar events with parsed information
        """
        now = datetime.utcnow()

        # Calculate time range
        if days_behind > 0:
            time_min = (now - timedelta(days=days_behind)).isoformat() + 'Z'
        else:
            time_min = now.isoformat() + 'Z'

        time_max = (now + timedelta(days=days_ahead)).isoformat() + 'Z'

        try:
            events_result = self.service.events().list(
                calendarId=self.calendar_id,
                timeMin=time_min,
                timeMax=time_max,
                maxResults=max_results,
                singleEvents=True,
                orderBy='startTime'
            ).execute()

            events = events_result.get('items', [])
            return [self._parse_event(event) for event in events]

        except Exception as e:
            print(f"Error fetching calendar events: {e}")
            raise

    def _parse_event(self, event: Dict) -> Dict:
        """
        Parse a Google Calendar event and extract structured information.

        Args:
            event: Raw event data from Google Calendar API

        Returns:
            Dictionary with parsed event information
        """
        title = event.get('summary', '')
        description = event.get('description', '')

        # Extract dates
        start = event['start'].get('dateTime', event['start'].get('date'))
        end = event['end'].get('dateTime', event['end'].get('date'))

        # Parse date strings
        start_date = self._parse_date(start)
        end_date = self._parse_date(end) if end else start_date

        # Parse title to extract school, grade, and event type
        parsed_info = self._parse_title(title)

        return {
            'event_id': event['id'],
            'title': title,
            'description': description,
            'start_date': start_date,
            'end_date': end_date,
            **parsed_info
        }

    def _parse_title(self, title: str) -> Dict:
        """
        Parse event title to extract school, grade, academic stream, and event type.

        Expected format: "SCHOOL GRADE EVENT_TYPE"
        Examples:
            - "TIS F2 Test" -> school=TIS, grade=F2, event_type=Test
            - "PCMS F4(A) Exam" -> school=PCMS, grade=F4, academic_stream=A, event_type=Exam
            - "PCMS F4A Exam" -> school=PCMS, grade=F4, academic_stream=A, event_type=Exam
            - "SRL-E F6 Science Final Exam" -> school=SRL-E, grade=F6, academic_stream=S, event_type=Exam

        Args:
            title: Event title string

        Returns:
            Dictionary with school, grade, academic_stream, and event_type
        """
        match = EVENT_TITLE_PATTERN.match(title)

        if not match:
            # If title doesn't match pattern, return empty parsed info
            return {
                'school': None,
                'grade': None,
                'academic_stream': None,
                'event_type': None
            }

        school = match.group(1).upper()
        grade_with_stream = match.group(2).upper()
        event_type_raw = match.group(3).strip()

        # Extract academic stream if present
        # Handle multiple formats:
        # 1. F4(A) - parentheses format
        # 2. F4A - compact format
        # 3. F4 ART/SCIENCE/COMMERCE - spelled out format
        academic_stream = None
        grade = None

        # Try parentheses format: F4(A)
        stream_match = re.match(r'(F[1-6])\(([ASC])\)', grade_with_stream)
        if stream_match:
            grade = stream_match.group(1)
            academic_stream = stream_match.group(2)
        else:
            # Try compact format: F4A
            stream_match = re.match(r'(F[1-6])([ASC])$', grade_with_stream)
            if stream_match:
                grade = stream_match.group(1)
                academic_stream = stream_match.group(2)
            else:
                # Try spelled out format: F4 ART/SCIENCE/COMMERCE
                stream_match = re.match(r'(F[1-6])\s+(ART|SCIENCE|COMMERCE)', grade_with_stream, re.IGNORECASE)
                if stream_match:
                    grade = stream_match.group(1)
                    stream_name = stream_match.group(2).upper()
                    # Map full names to letters
                    stream_map = {'ART': 'A', 'SCIENCE': 'S', 'COMMERCE': 'C'}
                    academic_stream = stream_map.get(stream_name)
                else:
                    # No stream specified
                    grade = grade_with_stream

        # Normalize event type to Quiz, Test, or Exam
        event_type = self._normalize_event_type(event_type_raw)

        return {
            'school': school,
            'grade': grade,
            'academic_stream': academic_stream,
            'event_type': event_type
        }

    def _normalize_event_type(self, event_type: str) -> str:
        """
        Normalize event type to one of three categories: Quiz, Test, or Exam.

        Args:
            event_type: Raw event type string

        Returns:
            Normalized event type: "Quiz", "Test", or "Exam"
        """
        event_type_lower = event_type.lower().strip()

        # Quiz variations
        if 'quiz' in event_type_lower:
            return 'Quiz'

        # Exam variations
        exam_keywords = ['exam', 'midterm', 'mid term', 'mid-term', 'final']
        if any(keyword in event_type_lower for keyword in exam_keywords):
            return 'Exam'

        # Default to Test
        return 'Test'

    def _parse_date(self, date_str: str) -> datetime:
        """
        Parse date string from Google Calendar to datetime object.

        Args:
            date_str: Date string (ISO format)

        Returns:
            datetime object
        """
        # Handle both datetime and date formats
        if 'T' in date_str:
            # DateTime format: "2025-10-27T10:00:00+08:00"
            return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        else:
            # Date format: "2025-10-27"
            return datetime.strptime(date_str, '%Y-%m-%d')


def sync_calendar_events(db: Session, force_sync: bool = False, days_behind: int = 0) -> int:
    """
    Sync calendar events from Google Calendar to database.
    Only syncs if last sync was more than TTL minutes ago, unless force_sync=True.

    Args:
        db: Database session
        force_sync: Force sync regardless of TTL
        days_behind: Number of days in the past to sync (0 = today onwards)

    Returns:
        Number of events synced
    """
    from models import CalendarEvent

    # Check if sync is needed
    if not force_sync:
        last_sync = db.query(CalendarEvent).order_by(
            CalendarEvent.last_synced_at.desc()
        ).first()

        if last_sync:
            time_since_sync = datetime.utcnow() - last_sync.last_synced_at
            if time_since_sync.total_seconds() / 60 < SYNC_TTL_MINUTES:
                print(f"Skipping sync - last sync was {time_since_sync.total_seconds() / 60:.1f} minutes ago")
                return 0

    # Fetch events from Google Calendar
    service = GoogleCalendarService()
    events = service.fetch_upcoming_events(days_behind=days_behind)

    # Update or insert events in database
    synced_count = 0
    for event_data in events:
        # Skip events without parsed information
        if not event_data['school'] or not event_data['grade']:
            continue

        # Check if event already exists
        existing = db.query(CalendarEvent).filter(
            CalendarEvent.event_id == event_data['event_id']
        ).first()

        if existing:
            # Update existing event
            for key, value in event_data.items():
                if key != 'event_id':
                    setattr(existing, key, value)
            existing.last_synced_at = datetime.utcnow()
        else:
            # Insert new event
            new_event = CalendarEvent(
                **event_data,
                last_synced_at=datetime.utcnow()
            )
            db.add(new_event)

        synced_count += 1

    db.commit()
    return synced_count


def get_upcoming_tests_for_session(
    db: Session,
    school: str,
    grade: str,
    academic_stream: Optional[str],
    session_date: datetime,
    days_ahead: int = 14
) -> List[Dict]:
    """
    Get upcoming tests/exams for a student based on their school and grade.

    Args:
        db: Database session
        school: Student's school
        grade: Student's grade (e.g., F1, F2, F3, F4, F5, F6)
        academic_stream: Student's academic stream (A/S/C) - only for F4-F6
        session_date: Date of the session
        days_ahead: Number of days ahead to check for tests

    Returns:
        List of upcoming tests with countdown information
    """
    from models import CalendarEvent

    # Calculate date range
    start_date = session_date.date() if isinstance(session_date, datetime) else session_date
    end_date = start_date + timedelta(days=days_ahead)

    # Base query: match school and grade within date range
    query = db.query(CalendarEvent).filter(
        CalendarEvent.school == school.upper(),
        CalendarEvent.grade == grade.upper(),
        CalendarEvent.start_date >= start_date,
        CalendarEvent.start_date <= end_date
    )

    # For F4-F6 students with academic stream, include both:
    # 1. Events specific to their stream (e.g., "F4(A) Test")
    # 2. General grade events without stream (e.g., "F4 Test" matches all F4 students)
    if academic_stream and grade in ['F4', 'F5', 'F6']:
        query = query.filter(
            (CalendarEvent.academic_stream == academic_stream.upper()) |
            (CalendarEvent.academic_stream == None)
        )
    elif grade in ['F4', 'F5', 'F6']:
        # If student doesn't have academic stream specified, only show general events
        query = query.filter(CalendarEvent.academic_stream == None)

    # Order by date
    events = query.order_by(CalendarEvent.start_date).all()

    # Add countdown information
    results = []
    for event in events:
        days_until = (event.start_date - start_date).days
        results.append({
            'id': event.id,
            'event_id': event.event_id,
            'title': event.title,
            'description': event.description,
            'start_date': event.start_date.isoformat(),
            'end_date': event.end_date.isoformat() if event.end_date else None,
            'school': event.school,
            'grade': event.grade,
            'academic_stream': event.academic_stream,
            'event_type': event.event_type,
            'days_until': days_until
        })

    return results
