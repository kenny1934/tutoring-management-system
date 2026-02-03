"""
Tests for Google Calendar service and related endpoints.

Tests cover:
- Title parsing with various formats (schools, grades, streams, event types)
- Event type normalization
- Event parsing from API responses
- Fetch events functionality
"""
import pytest
from datetime import date, datetime, timezone
from unittest.mock import MagicMock, patch

from tests.fixtures.calendar_fixtures import (
    SAMPLE_GOOGLE_CALENDAR_EVENTS,
    TITLE_PARSING_TEST_CASES,
    make_google_api_response,
)


class TestTitleParsing:
    """Tests for _parse_title method - extracting school, grade, stream, event_type."""

    @pytest.mark.parametrize(
        "title,expected_school,expected_grade,expected_stream,expected_type",
        TITLE_PARSING_TEST_CASES
    )
    def test_parse_title_formats(
        self,
        mock_calendar_env,
        mock_google_calendar_build,
        mock_google_credentials,
        title,
        expected_school,
        expected_grade,
        expected_stream,
        expected_type
    ):
        """Test various title formats are parsed correctly."""
        from services.google_calendar_service import GoogleCalendarService

        service = GoogleCalendarService(api_key="test-key")
        result = service._parse_title(title)

        assert result["school"] == expected_school
        assert result["grade"] == expected_grade
        assert result["academic_stream"] == expected_stream
        assert result["event_type"] == expected_type


class TestEventTypeNormalization:
    """Tests for _normalize_event_type method."""

    @pytest.mark.parametrize("input_type,expected", [
        ("Quiz", "Quiz"),
        ("quiz", "Quiz"),
        ("CCP", "Quiz"),
        ("ccp quiz", "Quiz"),
        ("Test", "Test"),
        ("test", "Test"),
        ("Chapter Test", "Test"),
        ("Exam", "Exam"),
        ("exam", "Exam"),
        ("Midterm", "Exam"),
        ("Mid Term", "Exam"),
        ("Mid-term", "Exam"),
        ("Final", "Exam"),
        ("Final Exam", "Exam"),
        ("Something Else", "Test"),  # Default to Test
    ])
    def test_normalize_event_type(
        self,
        mock_calendar_env,
        mock_google_calendar_build,
        mock_google_credentials,
        input_type,
        expected
    ):
        """Test event type normalization."""
        from services.google_calendar_service import GoogleCalendarService

        service = GoogleCalendarService(api_key="test-key")
        result = service._normalize_event_type(input_type)
        assert result == expected


class TestEventParsing:
    """Tests for _parse_event method - full event parsing."""

    def test_parse_event_with_date(
        self,
        mock_calendar_env,
        mock_google_calendar_build,
        mock_google_credentials
    ):
        """Test parsing event with date-only format."""
        from services.google_calendar_service import GoogleCalendarService

        service = GoogleCalendarService(api_key="test-key")
        event = {
            "id": "test123",
            "summary": "TIS F4 Test",
            "description": "Math test",
            "start": {"date": "2026-02-10"},
            "end": {"date": "2026-02-10"},
        }

        result = service._parse_event(event)

        assert result["event_id"] == "test123"
        assert result["title"] == "TIS F4 Test"
        assert result["description"] == "Math test"
        assert result["school"] == "TIS"
        assert result["grade"] == "F4"
        assert result["event_type"] == "Test"

    def test_parse_event_with_datetime(
        self,
        mock_calendar_env,
        mock_google_calendar_build,
        mock_google_credentials
    ):
        """Test parsing event with datetime format."""
        from services.google_calendar_service import GoogleCalendarService

        service = GoogleCalendarService(api_key="test-key")
        event = {
            "id": "test456",
            "summary": "PCMS F5(S) Exam",
            "description": "",
            "start": {"dateTime": "2026-02-15T09:00:00+08:00"},
            "end": {"dateTime": "2026-02-15T12:00:00+08:00"},
        }

        result = service._parse_event(event)

        assert result["event_id"] == "test456"
        assert result["school"] == "PCMS"
        assert result["grade"] == "F5"
        assert result["academic_stream"] == "S"
        assert result["event_type"] == "Exam"

    def test_parse_event_empty(
        self,
        mock_calendar_env,
        mock_google_calendar_build,
        mock_google_credentials
    ):
        """Test parsing empty/None event returns defaults."""
        from services.google_calendar_service import GoogleCalendarService

        service = GoogleCalendarService(api_key="test-key")
        result = service._parse_event(None)

        assert result["event_id"] == ""
        assert result["title"] == ""
        assert result["school"] is None
        assert result["grade"] is None

    def test_parse_event_missing_fields(
        self,
        mock_calendar_env,
        mock_google_calendar_build,
        mock_google_credentials
    ):
        """Test parsing event with missing optional fields."""
        from services.google_calendar_service import GoogleCalendarService

        service = GoogleCalendarService(api_key="test-key")
        event = {
            "id": "test789",
            "start": {"date": "2026-03-01"},
        }

        result = service._parse_event(event)

        assert result["event_id"] == "test789"
        assert result["title"] == ""
        assert result["description"] == ""


class TestFetchEvents:
    """Tests for fetch_upcoming_events method."""

    def test_fetch_events_single_page(
        self,
        mock_calendar_env,
        mock_google_calendar_build,
        mock_google_credentials
    ):
        """Test fetching events with single page response."""
        from services.google_calendar_service import GoogleCalendarService

        # Configure mock to return events
        mock_execute = MagicMock(return_value=make_google_api_response(
            SAMPLE_GOOGLE_CALENDAR_EVENTS[:3]
        ))
        mock_google_calendar_build.events.return_value.list.return_value.execute = mock_execute

        service = GoogleCalendarService(api_key="test-key")
        events = service.fetch_upcoming_events(days_ahead=30)

        assert len(events) == 3
        assert events[0]["title"] == "TIS F2 Test"

    def test_fetch_events_pagination(
        self,
        mock_calendar_env,
        mock_google_calendar_build,
        mock_google_credentials
    ):
        """Test fetching events with pagination."""
        from services.google_calendar_service import GoogleCalendarService

        # First page with nextPageToken, second page without
        responses = [
            make_google_api_response(SAMPLE_GOOGLE_CALENDAR_EVENTS[:3], next_page_token="page2"),
            make_google_api_response(SAMPLE_GOOGLE_CALENDAR_EVENTS[3:5]),
        ]
        mock_execute = MagicMock(side_effect=responses)
        mock_google_calendar_build.events.return_value.list.return_value.execute = mock_execute

        service = GoogleCalendarService(api_key="test-key")
        events = service.fetch_upcoming_events(days_ahead=30)

        assert len(events) == 5
        assert mock_execute.call_count == 2


class TestServiceInitialization:
    """Tests for GoogleCalendarService initialization."""

    def test_init_with_api_key(
        self,
        mock_calendar_env,
        mock_google_calendar_build,
        mock_google_credentials
    ):
        """Test initialization with API key."""
        from services.google_calendar_service import GoogleCalendarService

        service = GoogleCalendarService(api_key="custom-api-key")
        assert service.api_key == "custom-api-key"
        assert service.use_oauth is False

    def test_init_with_oauth(
        self,
        mock_calendar_env,
        mock_google_calendar_build,
        mock_google_credentials
    ):
        """Test initialization with OAuth."""
        from services.google_calendar_service import GoogleCalendarService

        service = GoogleCalendarService(use_oauth=True)
        assert service.use_oauth is True


class TestUpcomingTestsQuery:
    """Tests for get_upcoming_tests_for_session function."""

    def test_get_upcoming_tests_filters_by_school_grade(self, db_session):
        """Test that upcoming tests are filtered by school and grade."""
        from models import CalendarEvent
        from services.google_calendar_service import get_upcoming_tests_for_session

        # Create test events in DB
        event1 = CalendarEvent(
            event_id="test1",
            title="TIS F4 Test",
            start_date=date(2026, 2, 10),
            end_date=date(2026, 2, 10),
            school="TIS",
            grade="F4",
            event_type="Test",
        )
        event2 = CalendarEvent(
            event_id="test2",
            title="TIS F5 Test",  # Different grade
            start_date=date(2026, 2, 10),
            end_date=date(2026, 2, 10),
            school="TIS",
            grade="F5",
            event_type="Test",
        )
        event3 = CalendarEvent(
            event_id="test3",
            title="PCMS F4 Test",  # Different school
            start_date=date(2026, 2, 10),
            end_date=date(2026, 2, 10),
            school="PCMS",
            grade="F4",
            event_type="Test",
        )
        db_session.add_all([event1, event2, event3])
        db_session.commit()

        # Query for TIS F4
        results = get_upcoming_tests_for_session(
            db=db_session,
            school="TIS",
            grade="F4",
            academic_stream=None,
            session_date=date(2026, 2, 1),
            days_ahead=30
        )

        # Should only return TIS F4 event
        assert len(results) == 1
        assert results[0]["school"] == "TIS"
        assert results[0]["grade"] == "F4"

    def test_get_upcoming_tests_filters_by_stream(self, db_session):
        """Test that academic stream filtering works correctly."""
        from models import CalendarEvent
        from services.google_calendar_service import get_upcoming_tests_for_session

        # Create events with different streams
        event_art = CalendarEvent(
            event_id="art1",
            title="TIS F4(A) Test",
            start_date=date(2026, 2, 10),
            end_date=date(2026, 2, 10),
            school="TIS",
            grade="F4",
            academic_stream="A",
            event_type="Test",
        )
        event_science = CalendarEvent(
            event_id="sci1",
            title="TIS F4(S) Test",
            start_date=date(2026, 2, 10),
            end_date=date(2026, 2, 10),
            school="TIS",
            grade="F4",
            academic_stream="S",
            event_type="Test",
        )
        event_no_stream = CalendarEvent(
            event_id="no1",
            title="TIS F4 Test",  # No stream - applies to all
            start_date=date(2026, 2, 10),
            end_date=date(2026, 2, 10),
            school="TIS",
            grade="F4",
            academic_stream=None,
            event_type="Test",
        )
        db_session.add_all([event_art, event_science, event_no_stream])
        db_session.commit()

        # Query for Science stream student
        results = get_upcoming_tests_for_session(
            db=db_session,
            school="TIS",
            grade="F4",
            academic_stream="S",
            session_date=date(2026, 2, 1),
            days_ahead=30
        )

        # Should return Science-specific and no-stream events (not Art)
        assert len(results) == 2
        event_ids = [r["event_id"] for r in results]
        assert "sci1" in event_ids
        assert "no1" in event_ids
        assert "art1" not in event_ids
