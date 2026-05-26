"""
Tests for the default-deny AuthGate middleware.

Verifies that /api/* requires a valid access_token cookie by default, while the
explicit public allowlist (OAuth, refresh, public summer forms, token report
shares, PIN-gated prospect/buddy pages, holidays, cron endpoints) stays
reachable without one.
"""
from tests.helpers import make_auth_token
from auth.gate import is_public_path


# ---- unit-level allowlist checks -------------------------------------------

def test_protected_paths_are_not_public():
    for path in (
        "/api/enrollments",
        "/api/sessions",
        "/api/students/check-duplicates",
        "/api/courseware/popularity",
        "/api/tutors",
        "/api/revenue/tutor-year-matrix",
        "/api/paperless/search",
        "/api/path-aliases",
    ):
        assert is_public_path(path) is False, path


def test_allowlisted_paths_are_public():
    for path in (
        "/api/auth/google/login",
        "/api/auth/refresh",
        "/api/holidays",
        "/api/push/vapid-key",
        "/api/summer/pre-grade-window",
        "/api/admin/promote-grades",
        "/api/summer/marketing/snapshot",
        "/api/summer/public/config",
        "/api/report-shares/some-token",
        "/api/prospects",
        "/api/prospects/verify-pin",
        "/api/buddy-tracker/members",
    ):
        assert is_public_path(path) is True, path


# ---- middleware behaviour through the app ----------------------------------

def test_protected_endpoint_blocked_without_cookie(client):
    """A previously-open data endpoint now returns 401 with no cookie."""
    resp = client.get("/api/enrollments")
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Not authenticated"


def test_protected_endpoint_blocked_with_garbage_cookie(client):
    resp = client.get("/api/enrollments", cookies={"access_token": "not-a-jwt"})
    assert resp.status_code == 401


def test_protected_endpoint_passes_gate_with_valid_cookie(client, db_session):
    """A valid cookie clears the gate; reaching the handler is success here
    (no 401 from the middleware)."""
    resp = client.get("/api/enrollments", cookies={"access_token": make_auth_token(1)})
    assert resp.status_code != 401


def test_public_endpoint_reachable_without_cookie(client, db_session):
    """Allowlisted endpoint is not blocked by the gate (no 401)."""
    resp = client.get("/api/holidays")
    assert resp.status_code != 401


def test_report_share_get_reachable_without_cookie(client, db_session):
    """Token-gated report share GET is allowlisted; an unknown token yields a
    handler response (e.g. 404), never a gate 401."""
    resp = client.get("/api/report-shares/nonexistent-token")
    assert resp.status_code != 401
