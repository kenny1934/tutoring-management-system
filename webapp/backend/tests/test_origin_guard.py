"""
Tests for the OriginGuard middleware, the Cloudflare Access gate, and the
client-IP hardening that backs them.

All three features are fail-open until their env vars are set, so the rest of
the suite is unaffected; here we flip the env vars on and assert enforcement.
"""
from unittest.mock import MagicMock

from starlette.requests import Request


def _req(headers: dict, client_host: str = "203.0.113.9") -> Request:
    """Build a minimal Starlette Request with the given headers."""
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "client": (client_host, 4321),
    }
    return Request(scope)


# ---- OriginGuard middleware -------------------------------------------------

def test_origin_guard_noop_when_secret_unset(client, db_session):
    """With CF_ORIGIN_SECRET unset, traffic is not gated by origin (no 403)."""
    resp = client.get("/api/holidays")
    assert resp.status_code != 403


def test_origin_guard_blocks_request_without_header(client, db_session, monkeypatch):
    monkeypatch.setenv("CF_ORIGIN_SECRET", "s3cret")
    resp = client.get("/api/holidays")
    assert resp.status_code == 403
    assert resp.json()["detail"] == "Forbidden"


def test_origin_guard_allows_request_with_correct_header(client, db_session, monkeypatch):
    monkeypatch.setenv("CF_ORIGIN_SECRET", "s3cret")
    resp = client.get("/api/holidays", headers={"X-Origin-Verify": "s3cret"})
    assert resp.status_code != 403  # reaches the public holidays handler


def test_origin_guard_blocks_request_with_wrong_header(client, db_session, monkeypatch):
    monkeypatch.setenv("CF_ORIGIN_SECRET", "s3cret")
    resp = client.get("/api/holidays", headers={"X-Origin-Verify": "wrong"})
    assert resp.status_code == 403


def test_origin_guard_ignores_non_api_paths(client, db_session, monkeypatch):
    """Cloud Run health probes hit "/health" directly (no Cloudflare) and must
    not be blocked even when the guard is enabled."""
    monkeypatch.setenv("CF_ORIGIN_SECRET", "s3cret")
    resp = client.get("/health")
    assert resp.status_code != 403


# ---- Cloudflare Access gate (auth/gate.cf_access_denial) --------------------

def test_cf_access_noop_when_disabled(client, db_session):
    """With CF_ACCESS_REQUIRED unset, prospect endpoints are not Access-gated;
    the request reaches the PIN handler (403 'Invalid or missing branch PIN')."""
    resp = client.get("/api/prospects?branch=MAC&year=2026")
    assert resp.json().get("detail") != "Cloudflare Access authentication required"


def test_cf_access_blocks_without_email(client, db_session, monkeypatch):
    monkeypatch.setenv("CF_ACCESS_REQUIRED", "true")
    resp = client.get("/api/prospects?branch=MAC&year=2026")
    assert resp.status_code == 403
    assert resp.json()["detail"] == "Cloudflare Access authentication required"


def test_cf_access_blocks_disallowed_domain(client, db_session, monkeypatch):
    monkeypatch.setenv("CF_ACCESS_REQUIRED", "true")
    resp = client.get(
        "/api/prospects?branch=MAC&year=2026",
        headers={"Cf-Access-Authenticated-User-Email": "attacker@gmail.com"},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "Cloudflare Access authentication required"


def test_cf_access_allows_allowlisted_domain(client, db_session, monkeypatch):
    """An allowlisted Access email clears the gate and reaches the handler,
    which then enforces the branch PIN (different 403 message)."""
    monkeypatch.setenv("CF_ACCESS_REQUIRED", "true")
    resp = client.get(
        "/api/prospects?branch=MAC&year=2026",
        headers={"Cf-Access-Authenticated-User-Email": "tutor@mathconcept.com"},
    )
    assert resp.json().get("detail") != "Cloudflare Access authentication required"


def test_cf_access_allows_second_domain(client, db_session, monkeypatch):
    monkeypatch.setenv("CF_ACCESS_REQUIRED", "true")
    resp = client.get(
        "/api/prospects?branch=MAC&year=2026",
        headers={"Cf-Access-Authenticated-User-Email": "x@mathconceptsecondary.academy"},
    )
    assert resp.json().get("detail") != "Cloudflare Access authentication required"


def test_cf_access_exempts_admin_subroutes(client, db_session, monkeypatch):
    """/admin sub-routes keep cookie auth and are NOT Access-gated: with no
    Access email and no cookie they fail on the login check (401), not the
    Access check (403)."""
    monkeypatch.setenv("CF_ACCESS_REQUIRED", "true")
    resp = client.get("/api/prospects/admin?year=2026")
    assert resp.status_code == 401


def test_cf_access_ignores_unrelated_public_paths(client, db_session, monkeypatch):
    """Parent-facing public endpoints (summer forms, holidays) are not branch
    tools and must stay reachable without an Access identity."""
    monkeypatch.setenv("CF_ACCESS_REQUIRED", "true")
    resp = client.get("/api/holidays")
    assert resp.status_code != 403


# ---- client IP hardening (the spoof fix behind both features) ---------------

def test_get_client_ip_prefers_cf_connecting_ip():
    """CF-Connecting-IP (set by Cloudflare, unspoofable) wins over any
    client-supplied X-Forwarded-For."""
    from utils.rate_limiter import get_client_ip

    r = _req({"CF-Connecting-IP": "1.2.3.4", "X-Forwarded-For": "9.9.9.9, 8.8.8.8"})
    assert get_client_ip(r) == "1.2.3.4"


def test_get_client_ip_does_not_use_leftmost_xff():
    """Without CF-Connecting-IP, the *right-most* XFF entry (appended by the
    trusted proxy) is used — never the spoofable left-most one."""
    from utils.rate_limiter import get_client_ip

    r = _req({"X-Forwarded-For": "1.1.1.1, 2.2.2.2, 3.3.3.3"})
    assert get_client_ip(r) == "3.3.3.3"


def test_is_office_ip_false_when_ip_unknown():
    from auth.dependencies import is_office_ip

    scope = {"type": "http", "method": "GET", "path": "/", "headers": [], "client": None}
    req = Request(scope)
    db = MagicMock()
    assert is_office_ip(req, db) is False
    db.query.assert_not_called()
