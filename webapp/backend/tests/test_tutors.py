"""
Tests for the tutors endpoint, focused on authentication and role-based
field exposure (basic_salary must never reach non-admin roles).
"""
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from main import app
from models import Tutor
from auth.dependencies import get_current_user
from tests.helpers import make_auth_token

# A valid cookie is required to clear the AuthGate middleware (which checks the
# JWT directly, independent of dependency overrides). The override below then
# drives which role the handler sees.
AUTH_COOKIE = {"access_token": make_auth_token(99)}


def _seed_tutors(db):
    db.add_all([
        Tutor(
            id=1, user_email="admin@example.com", tutor_name="Mr Admin",
            role="Admin", basic_salary=Decimal("35000.00"), is_active_tutor=True,
        ),
        Tutor(
            id=2, user_email="tutor@example.com", tutor_name="Ms Tutor",
            role="Tutor", basic_salary=Decimal("25000.00"), is_active_tutor=True,
        ),
    ])
    db.commit()


def _as_role(role: str) -> Tutor:
    return Tutor(id=99, user_email="me@example.com", tutor_name="Me", role=role,
                 basic_salary=Decimal("0.00"), is_active_tutor=True)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def test_tutors_requires_authentication(client: TestClient, db_session):
    """No session cookie -> 401, no data leaked."""
    _seed_tutors(db_session)
    resp = client.get("/api/tutors")
    assert resp.status_code == 401


def test_tutor_role_does_not_receive_basic_salary(client: TestClient, db_session):
    """Non-admin role gets the roster but never the basic_salary field."""
    _seed_tutors(db_session)
    app.dependency_overrides[get_current_user] = lambda: _as_role("Tutor")

    resp = client.get("/api/tutors", cookies=AUTH_COOKIE)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 2
    for row in body:
        # Key must be entirely absent, not present-as-null.
        assert "basic_salary" not in row, f"basic_salary leaked to Tutor role: {row}"
        # user_email is intentionally kept for authenticated users (email->name lookups).
        assert row["user_email"]
        assert row["tutor_name"]


def test_guest_role_does_not_receive_basic_salary(client: TestClient, db_session):
    _seed_tutors(db_session)
    app.dependency_overrides[get_current_user] = lambda: _as_role("Guest")

    resp = client.get("/api/tutors", cookies=AUTH_COOKIE)
    assert resp.status_code == 200
    for row in resp.json():
        assert "basic_salary" not in row


def test_admin_role_receives_basic_salary(client: TestClient, db_session):
    """Admin-level roles still get compensation data."""
    _seed_tutors(db_session)
    app.dependency_overrides[get_current_user] = lambda: _as_role("Admin")

    resp = client.get("/api/tutors", cookies=AUTH_COOKIE)
    assert resp.status_code == 200
    body = resp.json()
    assert any("basic_salary" in row for row in body)
    by_email = {r["user_email"]: r for r in body}
    assert by_email["tutor@example.com"]["basic_salary"] == "25000.00"


def test_supervisor_role_receives_basic_salary(client: TestClient, db_session):
    """Supervisor is an admin-view role, consistent with revenue gating."""
    _seed_tutors(db_session)
    app.dependency_overrides[get_current_user] = lambda: _as_role("Supervisor")

    resp = client.get("/api/tutors", cookies=AUTH_COOKIE)
    assert resp.status_code == 200
    assert any("basic_salary" in row for row in resp.json())
