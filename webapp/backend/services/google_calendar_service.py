"""
Google Calendar service for fetching and caching test/exam events.
Parses event titles to extract school, grade, and event type information.
Supports both read (API key) and write (OAuth refresh token) operations.
"""

import os
import re
import time
import json
import threading
import logging
from datetime import datetime, timedelta, timezone, date
from typing import List, Optional, Dict
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from sqlalchemy.orm import Session
from sqlalchemy import text

logger = logging.getLogger(__name__)

# Thread lock to prevent concurrent sync operations
_sync_lock = threading.Lock()

# Calendar configuration from environment
CALENDAR_ID = os.getenv("GOOGLE_CALENDAR_ID", "msamacau01@gmail.com")
API_KEY = os.getenv("GOOGLE_CALENDAR_API_KEY")
SYNC_TTL_MINUTES = int(os.getenv("CALENDAR_SYNC_TTL_MINUTES", "15"))

# OAuth credentials for write access (reuses existing OAuth client)
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_CALENDAR_REFRESH_TOKEN = os.getenv("GOOGLE_CALENDAR_REFRESH_TOKEN")
SCOPES = ['https://www.googleapis.com/auth/calendar.events']

# Regex patterns for parsing event titles
# Format: SCHOOL GRADE EVENT_TYPE
# Examples: "TIS F2 Test", "PCMS F4(A) Exam", "SRL-E F3 Quiz", "嶺南 F2 Test"
# Supports: F4(A), F4A, F4 Art, F4 Science, F4 Commerce

# Main pattern - accepts Unicode school names (Chinese etc.) via \w
EVENT_TITLE_PATTERN = re.compile(
    r'^([\w\-]+)\s+(F[1-6](?:\([ASC]\))?(?:[ASC])?(?:\s+(?:Art|Science|Commerce))?)\s+(.+)$',
    re.IGNORECASE | re.UNICODE
)

# Fallback: Compact format "SCHOOL-F4 Event" (no space before grade)
COMPACT_GRADE_PATTERN = re.compile(
    r'^([\w]+)-(F[1-6])\s+(.+)$',
    re.IGNORECASE | re.UNICODE
)

# Fallback: School with stream indicator + grade "SRL-E F4 Test" or "SRL-E (S) F4 Test"
STREAM_GRADE_PATTERN = re.compile(
    r'^([\w]+-[A-Z])\s*(?:\([A-Z]\)\s*)?(F[1-6])\s+(.+)$',
    re.IGNORECASE | re.UNICODE
)

# Fallback: No grade format "SCHOOL EventType" (e.g., "CDSJ5-E Exam", "PCMS-CO Test")
NO_GRADE_PATTERN = re.compile(
    r'^([\w\-]+)\s+(.+)$',
    re.IGNORECASE | re.UNICODE
)


class GoogleCalendarService:
    """Service for interacting with Google Calendar API.

    Supports two authentication modes:
    - API Key (read-only): For fetching events from public calendars
    - OAuth Refresh Token (read/write): For creating, updating, deleting events
    """

    def __init__(self, api_key: Optional[str] = None, use_oauth: bool = False):
        """
        Initialize the Google Calendar service.

        Args:
            api_key: Google Calendar API key for public calendar access
            use_oauth: If True, use OAuth refresh token for write access
        """
        self.calendar_id = CALENDAR_ID
        self.use_oauth = use_oauth

        if use_oauth:
            if not all([GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALENDAR_REFRESH_TOKEN]):
                raise ValueError(
                    "Calendar write requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and "
                    "GOOGLE_CALENDAR_REFRESH_TOKEN environment variables"
                )

            # Create credentials from refresh token
            credentials = Credentials(
                token=None,  # Will be refreshed automatically
                refresh_token=GOOGLE_CALENDAR_REFRESH_TOKEN,
                token_uri="https://oauth2.googleapis.com/token",
                client_id=GOOGLE_CLIENT_ID,
                client_secret=GOOGLE_CLIENT_SECRET,
                scopes=SCOPES
            )

            # Refresh to get a valid access token
            credentials.refresh(Request())

            self.service = build('calendar', 'v3', credentials=credentials)
        else:
            self.api_key = api_key or API_KEY
            if not self.api_key:
                raise ValueError("GOOGLE_CALENDAR_API_KEY environment variable is required")
            self.service = build('calendar', 'v3', developerKey=self.api_key)

    def fetch_upcoming_events(
        self,
        days_ahead: int = 90,
        days_behind: int = 0,
        max_results_per_page: int = 250
    ) -> List[Dict]:
        """
        Fetch ALL events from Google Calendar using pagination.

        Args:
            days_ahead: Number of days ahead to fetch events
            days_behind: Number of days in the past to fetch events (0 = today onwards)
            max_results_per_page: Number of events per API page (max 2500)

        Returns:
            List of calendar events with parsed information
        """
        now = datetime.now(timezone.utc)

        # Calculate time range
        if days_behind > 0:
            time_min = (now - timedelta(days=days_behind)).isoformat()
        else:
            time_min = now.isoformat()

        time_max = (now + timedelta(days=days_ahead)).isoformat()

        all_events = []
        page_token = None

        try:
            while True:
                events_result = self.service.events().list(
                    calendarId=self.calendar_id,
                    timeMin=time_min,
                    timeMax=time_max,
                    maxResults=max_results_per_page,
                    singleEvents=True,
                    orderBy='startTime',
                    pageToken=page_token
                ).execute()

                events = events_result.get('items', [])
                all_events.extend([self._parse_event(event) for event in events])

                # Check for more pages
                page_token = events_result.get('nextPageToken')
                if not page_token:
                    break

                # Safety limit to prevent infinite loops
                if len(all_events) > 10000:
                    print(f"[SYNC] Warning: Pagination safety limit reached ({len(all_events)} events)")
                    break

            return all_events

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

        Supports multiple formats:
            - Standard: "TIS F2 Test" -> school=TIS, grade=F2, event_type=Test
            - With stream: "PCMS F4(A) Exam" -> school=PCMS, grade=F4, academic_stream=A
            - Chinese: "嶺南 F2 Test" -> school=嶺南, grade=F2, event_type=Test
            - Compact: "SYMS-F4 Quiz" -> school=SYMS, grade=F4, event_type=Quiz
            - No grade: "CDSJ5-E Exam" -> school=CDSJ5-E, grade=None, event_type=Exam

        Args:
            title: Event title string

        Returns:
            Dictionary with school, grade, academic_stream, and event_type
        """
        title = title.strip()

        # Strategy 1: Standard pattern with grade (handles Unicode school names)
        match = EVENT_TITLE_PATTERN.match(title)
        if match:
            school = match.group(1)
            grade_with_stream = match.group(2).upper()
            event_type_raw = match.group(3).strip()

            # Extract academic stream if present
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
                        stream_map = {'ART': 'A', 'SCIENCE': 'S', 'COMMERCE': 'C'}
                        academic_stream = stream_map.get(stream_name)
                    else:
                        grade = grade_with_stream

            event_type = self._normalize_event_type(event_type_raw)
            return {
                'school': school,
                'grade': grade,
                'academic_stream': academic_stream,
                'event_type': event_type
            }

        # Strategy 2: Compact format "SCHOOL-F4 Event"
        compact = COMPACT_GRADE_PATTERN.match(title)
        if compact:
            return {
                'school': compact.group(1),
                'grade': compact.group(2).upper(),
                'academic_stream': None,
                'event_type': self._normalize_event_type(compact.group(3))
            }

        # Strategy 3: School with stream indicator + grade "SRL-E F4 Test"
        stream = STREAM_GRADE_PATTERN.match(title)
        if stream:
            return {
                'school': stream.group(1).upper(),
                'grade': stream.group(2).upper(),
                'academic_stream': None,
                'event_type': self._normalize_event_type(stream.group(3))
            }

        # Strategy 4: No grade format "CDSJ5-E Exam" (school + event type only)
        no_grade = NO_GRADE_PATTERN.match(title)
        if no_grade:
            event_type = self._normalize_event_type(no_grade.group(2))
            # Only accept if event_type is valid (not just any words)
            if event_type in ('Test', 'Quiz', 'Exam'):
                return {
                    'school': no_grade.group(1),
                    'grade': None,
                    'academic_stream': None,
                    'event_type': event_type
                }

        # No match found
        return {
            'school': None,
            'grade': None,
            'academic_stream': None,
            'event_type': None
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

        # Quiz variations (including CCP)
        if any(q in event_type_lower for q in ['quiz', 'ccp']):
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

    # ============================================
    # Write Operations (require Service Account)
    # ============================================

    def create_event(
        self,
        title: str,
        start_date: date,
        end_date: Optional[date] = None,
        description: Optional[str] = None
    ) -> str:
        """
        Create an event in Google Calendar.

        Args:
            title: Event title/summary
            start_date: Start date of the event
            end_date: End date (defaults to start_date for single-day events)
            description: Optional event description

        Returns:
            Google Calendar event ID

        Raises:
            ValueError: If Service Account is not configured
        """
        if not self.use_oauth:
            raise ValueError("Write operations require Service Account authentication")

        # For all-day events, Google Calendar expects end_date to be the day AFTER
        # the actual end (exclusive). For single-day events, set end to next day.
        actual_end = (end_date or start_date) + timedelta(days=1)

        event = {
            'summary': title,
            'start': {'date': start_date.isoformat()},
            'end': {'date': actual_end.isoformat()},
        }

        if description:
            event['description'] = description

        result = self.service.events().insert(
            calendarId=self.calendar_id,
            body=event
        ).execute()

        logger.info(f"Created Google Calendar event: {result['id']} - {title}")
        return result['id']

    def update_event(
        self,
        event_id: str,
        title: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        description: Optional[str] = None
    ) -> None:
        """
        Update an existing event in Google Calendar.

        Args:
            event_id: Google Calendar event ID
            title: New title (optional)
            start_date: New start date (optional)
            end_date: New end date (optional)
            description: New description (optional, pass empty string to clear)

        Raises:
            ValueError: If Service Account is not configured
        """
        if not self.use_oauth:
            raise ValueError("Write operations require Service Account authentication")

        # Fetch current event
        event = self.service.events().get(
            calendarId=self.calendar_id,
            eventId=event_id
        ).execute()

        # Apply updates
        if title is not None:
            event['summary'] = title

        if description is not None:
            event['description'] = description

        if start_date is not None:
            event['start'] = {'date': start_date.isoformat()}
            # If only start changed but not end, adjust end to match
            if end_date is None and 'date' in event.get('end', {}):
                # Get current end, adjust based on new start
                current_end = datetime.strptime(event['end']['date'], '%Y-%m-%d').date()
                current_start = datetime.strptime(event['start']['date'], '%Y-%m-%d').date() if 'date' in event.get('start', {}) else start_date
                # Keep duration
                duration = current_end - current_start
                event['end'] = {'date': (start_date + duration).isoformat()}

        if end_date is not None:
            # Google Calendar expects exclusive end date
            event['end'] = {'date': (end_date + timedelta(days=1)).isoformat()}

        self.service.events().update(
            calendarId=self.calendar_id,
            eventId=event_id,
            body=event
        ).execute()

        logger.info(f"Updated Google Calendar event: {event_id}")

    def delete_event(self, event_id: str) -> None:
        """
        Delete an event from Google Calendar.

        Args:
            event_id: Google Calendar event ID

        Raises:
            ValueError: If Service Account is not configured
        """
        if not self.use_oauth:
            raise ValueError("Write operations require Service Account authentication")

        self.service.events().delete(
            calendarId=self.calendar_id,
            eventId=event_id
        ).execute()

        logger.info(f"Deleted Google Calendar event: {event_id}")


def sync_calendar_events(db: Session, force_sync: bool = False, days_behind: int = 0) -> dict:
    """
    Sync calendar events from Google Calendar to database.
    Only syncs if last sync was more than TTL minutes ago, unless force_sync=True.
    Also detects and deletes orphaned events (deleted from Google Calendar).

    Uses a threading lock to prevent concurrent sync operations.
    Transaction order: upserts FIRST, then orphan deletion (for data safety).

    Args:
        db: Database session
        force_sync: Force sync regardless of TTL
        days_behind: Number of days in the past to sync (0 = today onwards)

    Returns:
        Dict with 'synced' and 'deleted' counts
    """
    from models import CalendarEvent

    # Prevent concurrent sync operations
    if not _sync_lock.acquire(blocking=False):
        print("[SYNC] Skipping - another sync is already in progress")
        return {"synced": 0, "deleted": 0, "message": "Sync already in progress"}

    try:
        # Check if sync is needed (within the lock to prevent race conditions)
        if not force_sync:
            last_sync = db.query(CalendarEvent).order_by(
                CalendarEvent.last_synced_at.desc()
            ).first()

            if last_sync and last_sync.last_synced_at:
                # Make comparison timezone-aware
                now_utc = datetime.now(timezone.utc)
                last_sync_utc = last_sync.last_synced_at.replace(tzinfo=timezone.utc) if last_sync.last_synced_at.tzinfo is None else last_sync.last_synced_at
                time_since_sync = now_utc - last_sync_utc
                if time_since_sync.total_seconds() / 60 < SYNC_TTL_MINUTES:
                    print(f"[SYNC] Skipping - last sync was {time_since_sync.total_seconds() / 60:.1f} minutes ago")
                    return {"synced": 0, "deleted": 0}

        # Fetch events from Google Calendar
        print(f"[SYNC] Starting Google Calendar fetch (days_behind={days_behind}, days_ahead=90)...")
        api_start = time.time()
        service = GoogleCalendarService()
        events = service.fetch_upcoming_events(days_behind=days_behind)
        print(f"[SYNC] Google API fetch: {time.time() - api_start:.2f}s, {len(events)} events")

        # Collect fetched event IDs for orphan detection
        fetched_event_ids = {e['event_id'] for e in events}

        # Calculate date range being synced
        now = datetime.now(timezone.utc)
        if days_behind > 0:
            sync_start = (now - timedelta(days=days_behind)).date()
        else:
            sync_start = now.date()
        sync_end = (now + timedelta(days=90)).date()

        # ============================================================
        # STEP 1: UPSERT events FIRST (before orphan deletion for safety)
        # ============================================================
        print(f"[SYNC] Starting DB upserts for {len(events)} events...")
        db_start = time.time()

        # Filter to valid events and log rejected ones (only school is required, grade is optional)
        valid_events = [e for e in events if e.get('school')]
        rejected_count = len(events) - len(valid_events)
        print(f"[SYNC] Valid events: {len(valid_events)}, rejected: {rejected_count}")

        if rejected_count > 0:
            # Log rejected events for visibility
            for e in events:
                if not e.get('school'):
                    print(f"[SYNC] Rejected event (missing school): '{e.get('title', 'Unknown')}'")

        synced_count = 0
        if valid_events:
            sync_timestamp = datetime.now(timezone.utc)
            commit_start = time.time()

            # Process in chunks to avoid SQL statement size limits
            CHUNK_SIZE = 100
            for i in range(0, len(valid_events), CHUNK_SIZE):
                chunk = valid_events[i:i + CHUNK_SIZE]

                # Build VALUES clause with placeholders
                values_parts = []
                params = {}
                for j, e in enumerate(chunk):
                    prefix = f"p{j}_"
                    values_parts.append(f"(:{prefix}event_id, :{prefix}title, :{prefix}description, :{prefix}start_date, :{prefix}end_date, :{prefix}school, :{prefix}grade, :{prefix}academic_stream, :{prefix}event_type, :{prefix}last_synced_at)")
                    params[f"{prefix}event_id"] = e['event_id']
                    params[f"{prefix}title"] = e['title']
                    params[f"{prefix}description"] = e.get('description')
                    params[f"{prefix}start_date"] = e['start_date']
                    params[f"{prefix}end_date"] = e.get('end_date')
                    params[f"{prefix}school"] = e['school']
                    params[f"{prefix}grade"] = e['grade']
                    params[f"{prefix}academic_stream"] = e.get('academic_stream')
                    params[f"{prefix}event_type"] = e.get('event_type')
                    params[f"{prefix}last_synced_at"] = sync_timestamp

                # Build and execute single INSERT with all VALUES
                sql = text(f"""
                    INSERT INTO calendar_events
                        (event_id, title, description, start_date, end_date, school, grade, academic_stream, event_type, last_synced_at)
                    VALUES {', '.join(values_parts)}
                    ON DUPLICATE KEY UPDATE
                        title = VALUES(title),
                        description = VALUES(description),
                        start_date = VALUES(start_date),
                        end_date = VALUES(end_date),
                        school = VALUES(school),
                        grade = VALUES(grade),
                        academic_stream = VALUES(academic_stream),
                        event_type = VALUES(event_type),
                        last_synced_at = VALUES(last_synced_at)
                """)
                db.execute(sql, params)

            print(f"[SYNC] Bulk upsert: {time.time() - commit_start:.2f}s")
            synced_count = len(valid_events)

        # ============================================================
        # STEP 2: Delete orphans AFTER successful upsert (for data safety)
        # ============================================================
        MIN_EVENTS_FOR_ORPHAN_CHECK = 10
        deleted_count = 0

        fetched_count = len(fetched_event_ids)
        if fetched_count >= MIN_EVENTS_FOR_ORPHAN_CHECK:
            # Find orphaned events (in DB but not in Google Calendar anymore)
            orphaned = db.query(CalendarEvent).filter(
                CalendarEvent.start_date >= sync_start,
                CalendarEvent.start_date <= sync_end,
                ~CalendarEvent.event_id.in_(fetched_event_ids)
            ).all()

            for event in orphaned:
                if len(event.revision_slots) == 0:
                    db.delete(event)
                    deleted_count += 1
                    print(f"[SYNC] Deleted orphaned event {event.id}: {event.title}")
                else:
                    # Try to find a matching real event to migrate slots to
                    matching_event = db.query(CalendarEvent).filter(
                        CalendarEvent.id != event.id,
                        CalendarEvent.title == event.title,
                        CalendarEvent.start_date == event.start_date,
                        CalendarEvent.event_id.in_(fetched_event_ids)
                    ).first()

                    if matching_event:
                        # Migrate revision slots to the real event
                        slot_count = len(event.revision_slots)
                        for slot in event.revision_slots:
                            slot.calendar_event_id = matching_event.id
                        db.delete(event)
                        deleted_count += 1
                        print(f"[SYNC] Migrated {slot_count} slot(s) from orphan {event.id} to {matching_event.id}, deleted orphan")
                    else:
                        # Log with details for manual review - DO NOT delete to preserve revision slot data
                        slot_info = [(s.id, s.student_id) for s in event.revision_slots]
                        print(f"[SYNC] WARNING: Orphaned event {event.id} '{event.title}' (date: {event.start_date}) has {len(event.revision_slots)} revision slot(s): {slot_info} - preserving for manual review")
        else:
            print(f"[SYNC] Skipping orphan detection - only {fetched_count} events fetched (minimum: {MIN_EVENTS_FOR_ORPHAN_CHECK})")

        # Single commit at the end (after both upserts and orphan handling)
        db.commit()
        print(f"[SYNC] DB operations total: {time.time() - db_start:.2f}s, synced {synced_count}, deleted {deleted_count}")
        return {"synced": synced_count, "deleted": deleted_count}

    except Exception as e:
        db.rollback()
        print(f"[SYNC] Error during sync: {e}")
        raise
    finally:
        _sync_lock.release()


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
