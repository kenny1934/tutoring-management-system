"""
Tests for the Cloudflare origin-trust model.

Instead of blocking direct (non-Cloudflare) access to the backend, we keep it
reachable (login-gated data is still protected by the cookie) but only *trust*
Cloudflare-only headers — CF-Connecting-IP and Cf-Access-* — when the request
carries the Worker's X-Origin-Verify secret. This file exercises:

- the is_cloudflare_origin trust signal,
- get_client_ip ignoring a spoofed CF-Connecting-IP off-Cloudflare,
- the Access gate only honouring the email header on-Cloudflare,
- direct access still working for ordinary login-gated traffic.

All of it is fail-open until CF_ORIGIN_SECRET / CF_ACCESS_REQUIRED are set.
"""
from unittest.mock import MagicMock

from starlette.requests import Request

SECRET = "s3cret-origin"


def _req(headers: dict, client_host: str = "203.0.113.9") -> Request:
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "client": (client_host, 4321),
    }
    return Request(scope)


# ---- is_cloudflare_origin ---------------------------------------------------

def test_origin_trust_false_when_secret_unset(monkeypatch):
    monkeypatch.delenv("CF_ORIGIN_SECRET", raising=False)
    from auth.origin_guard import is_cloudflare_origin
    assert is_cloudflare_origin(_req({"X-Origin-Verify": SECRET})) is False


def test_origin_trust_true_with_matching_header(monkeypatch):
    monkeypatch.setenv("CF_ORIGIN_SECRET", SECRET)
    from auth.origin_guard import is_cloudflare_origin
    assert is_cloudflare_origin(_req({"X-Origin-Verify": SECRET})) is True


def test_origin_trust_false_with_wrong_or_missing_header(monkeypatch):
    monkeypatch.setenv("CF_ORIGIN_SECRET", SECRET)
    from auth.origin_guard import is_cloudflare_origin
    assert is_cloudflare_origin(_req({"X-Origin-Verify": "nope"})) is False
    assert is_cloudflare_origin(_req({})) is False


# ---- get_client_ip: the spoof fix ------------------------------------------

def test_cf_connecting_ip_trusted_only_from_cloudflare(monkeypatch):
    monkeypatch.setenv("CF_ORIGIN_SECRET", SECRET)
    from utils.rate_limiter import get_client_ip
    # With the Worker secret, CF-Connecting-IP is the real client IP.
    r = _req({"X-Origin-Verify": SECRET, "CF-Connecting-IP": "1.2.3.4",
              "X-Forwarded-For": "9.9.9.9, 8.8.8.8"})
    assert get_client_ip(r) == "1.2.3.4"


def test_spoofed_cf_connecting_ip_ignored_off_cloudflare(monkeypatch):
    monkeypatch.setenv("CF_ORIGIN_SECRET", SECRET)
    from utils.rate_limiter import get_client_ip
    # No X-Origin-Verify: a client-set CF-Connecting-IP must NOT be trusted;
    # fall back to the rightmost (proxy-appended) X-Forwarded-For entry.
    r = _req({"CF-Connecting-IP": "1.2.3.4", "X-Forwarded-For": "9.9.9.9, 7.7.7.7"})
    assert get_client_ip(r) == "7.7.7.7"


def test_client_ip_falls_back_to_peer(monkeypatch):
    monkeypatch.setenv("CF_ORIGIN_SECRET", SECRET)
    from utils.rate_limiter import get_client_ip
    r = _req({"CF-Connecting-IP": "1.2.3.4"}, client_host="198.51.100.5")
    assert get_client_ip(r) == "198.51.100.5"


# ---- Access gate: email only trusted on-Cloudflare -------------------------

def test_cf_access_noop_when_disabled(client, db_session):
    resp = client.get("/api/prospects?branch=MAC&year=2026")
    assert resp.json().get("detail") != "Cloudflare Access authentication required"


def test_cf_access_allows_allowlisted_email_from_cloudflare(client, db_session, monkeypatch):
    monkeypatch.setenv("CF_ORIGIN_SECRET", SECRET)
    monkeypatch.setenv("CF_ACCESS_REQUIRED", "true")
    resp = client.get(
        "/api/prospects?branch=MAC&year=2026",
        headers={"X-Origin-Verify": SECRET,
                 "Cf-Access-Authenticated-User-Email": "tutor@mathconcept.com"},
    )
    # Cleared the Access gate; the handler then enforces the branch PIN.
    assert resp.json().get("detail") != "Cloudflare Access authentication required"


def test_cf_access_blocks_disallowed_domain(client, db_session, monkeypatch):
    monkeypatch.setenv("CF_ORIGIN_SECRET", SECRET)
    monkeypatch.setenv("CF_ACCESS_REQUIRED", "true")
    resp = client.get(
        "/api/prospects?branch=MAC&year=2026",
        headers={"X-Origin-Verify": SECRET,
                 "Cf-Access-Authenticated-User-Email": "attacker@gmail.com"},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "Cloudflare Access authentication required"


def test_cf_access_rejects_spoofed_email_off_cloudflare(client, db_session, monkeypatch):
    """The key protection: a forged Cf-Access email without the Worker secret is
    not trusted, so direct callers can't bypass Access."""
    monkeypatch.setenv("CF_ORIGIN_SECRET", SECRET)
    monkeypatch.setenv("CF_ACCESS_REQUIRED", "true")
    resp = client.get(
        "/api/prospects?branch=MAC&year=2026",
        headers={"Cf-Access-Authenticated-User-Email": "tutor@mathconcept.com"},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "Cloudflare Access authentication required"


def test_cf_access_exempts_admin_subroutes(client, db_session, monkeypatch):
    monkeypatch.setenv("CF_ORIGIN_SECRET", SECRET)
    monkeypatch.setenv("CF_ACCESS_REQUIRED", "true")
    resp = client.get("/api/prospects/admin?year=2026")
    assert resp.status_code == 401  # backend cookie auth, not the Access 403


def test_cf_access_ignores_unrelated_public_paths(client, db_session, monkeypatch):
    monkeypatch.setenv("CF_ORIGIN_SECRET", SECRET)
    monkeypatch.setenv("CF_ACCESS_REQUIRED", "true")
    assert client.get("/api/holidays").status_code != 403


# ---- direct access still works (no blanket block) --------------------------

def test_direct_access_to_public_endpoint_works(client, db_session, monkeypatch):
    """With CF_ORIGIN_SECRET set, a request lacking X-Origin-Verify is NOT
    blocked — the run.app direct path keeps working for ordinary traffic."""
    monkeypatch.setenv("CF_ORIGIN_SECRET", SECRET)
    assert client.get("/api/holidays").status_code == 200


def test_login_gated_data_still_requires_cookie(client, db_session, monkeypatch):
    monkeypatch.setenv("CF_ORIGIN_SECRET", SECRET)
    resp = client.get("/api/enrollments")
    assert resp.status_code == 401


# ---- is_office_ip uses the hardened client IP ------------------------------

def test_is_office_ip_false_when_ip_unknown():
    from auth.dependencies import is_office_ip
    scope = {"type": "http", "method": "GET", "path": "/", "headers": [], "client": None}
    db = MagicMock()
    assert is_office_ip(Request(scope), db) is False
    db.query.assert_not_called()
