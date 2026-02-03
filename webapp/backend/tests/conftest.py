"""
Pytest fixtures for backend tests.

Usage:
    pytest tests/ --cov=. --cov-report=html
"""
import os
import pytest
from datetime import date, datetime
from typing import Generator
from unittest.mock import MagicMock

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

# Set test environment before importing app modules
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-testing-only")

from database import Base, get_db
from main import app


# In-memory SQLite for fast tests (no external DB dependency)
SQLALCHEMY_TEST_DATABASE_URL = "sqlite:///:memory:"

test_engine = create_engine(
    SQLALCHEMY_TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="function")
def db_session() -> Generator[Session, None, None]:
    """
    Create a fresh database session for each test.
    Tables are created before and dropped after each test.
    """
    # Create all tables
    Base.metadata.create_all(bind=test_engine)

    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        # Drop all tables after test
        Base.metadata.drop_all(bind=test_engine)


@pytest.fixture(scope="function")
def client(db_session: Session) -> Generator[TestClient, None, None]:
    """
    FastAPI test client with overridden database dependency.
    """
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture
def mock_db() -> MagicMock:
    """
    Mock database session for unit tests that don't need real DB.
    """
    return MagicMock(spec=Session)


# ============================================================================
# Sample Data Fixtures
# ============================================================================

@pytest.fixture
def sample_tutor_data() -> dict:
    """Sample tutor data for testing."""
    return {
        "id": 1,
        "user_email": "tutor@example.com",
        "tutor_name": "Mr Test Tutor",
        "default_location": "Main Center",
        "role": "Tutor",
    }


@pytest.fixture
def sample_student_data() -> dict:
    """Sample student data for testing."""
    return {
        "id": 1,
        "school_student_id": "STU001",
        "student_name": "Test Student",
        "grade": "F4",
        "phone": "12345678",
        "school": "Test High School",
        "lang_stream": "English",
        "home_location": "Main Center",
    }


@pytest.fixture
def sample_enrollment_data() -> dict:
    """Sample enrollment data for testing."""
    return {
        "id": 1,
        "student_id": 1,
        "tutor_id": 1,
        "assigned_day": "Monday",
        "assigned_time": "15:00-16:00",
        "location": "Main Center",
        "lessons_paid": 10,
        "payment_date": date.today(),
        "first_lesson_date": date.today(),
        "payment_status": "Paid",
        "enrollment_type": "Regular",
    }


@pytest.fixture
def sample_session_data() -> dict:
    """Sample session data for testing."""
    return {
        "id": 1,
        "enrollment_id": 1,
        "student_id": 1,
        "tutor_id": 1,
        "session_date": date.today(),
        "time_slot": "15:00-16:00",
        "location": "Main Center",
        "session_status": "Scheduled",
        "financial_status": "Unpaid",
    }


# ============================================================================
# Holiday Fixtures
# ============================================================================

@pytest.fixture
def sample_holidays() -> list[dict]:
    """Sample holidays for testing date calculations."""
    return [
        {"holiday_date": date(2026, 1, 1), "holiday_name": "New Year's Day"},
        {"holiday_date": date(2026, 1, 29), "holiday_name": "Chinese New Year"},
        {"holiday_date": date(2026, 1, 30), "holiday_name": "Chinese New Year Day 2"},
        {"holiday_date": date(2026, 1, 31), "holiday_name": "Chinese New Year Day 3"},
        {"holiday_date": date(2026, 12, 25), "holiday_name": "Christmas Day"},
    ]
