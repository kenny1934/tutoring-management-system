"""
Default-deny authentication gate.

Every ``/api/*`` request must carry a valid ``access_token`` cookie, EXCEPT for
an explicit allowlist of endpoints that are public by design or that
self-authenticate via a non-cookie mechanism (OAuth, token refresh, public
summer forms, X-Branch-Pin prospect/buddy pages, token-gated report shares,
and X-Cron-Secret cron endpoints).

This is a *baseline* gate, not a replacement for per-endpoint authorization.
Endpoints that need finer control (role checks, ownership, field stripping)
still declare their own dependencies; the gate never relaxes those — it only
adds a blanket login requirement to everything not explicitly exempted. As a
result, allowlisting a path is safe even when some methods under it are
sensitive, because those handlers keep their own ``get_current_user``
dependency (e.g. ``POST``/``DELETE`` under ``/api/report-shares``).
"""
import logging
import os
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from auth.jwt_handler import verify_token

logger = logging.getLogger(__name__)


# Exact paths that do not require an access_token cookie.
PUBLIC_PATHS = frozenset({
    # OAuth + session lifecycle (no/!valid access_token is the whole point here)
    "/api/auth/google/login",
    "/api/auth/google/callback",
    "/api/auth/logout",
    "/api/auth/refresh",
    # Web Push public key — designed to be exposed to clients
    "/api/push/vapid-key",
    # Public holiday calendar — non-sensitive dates, consumed by external pages
    "/api/holidays",
    # Public summer-course form metadata
    "/api/summer/pre-grade-window",
    # Cron-or-admin endpoints: self-validate X-Cron-Secret OR an admin cookie
    "/api/admin/promote-grades",
    "/api/summer/marketing/snapshot",
    "/api/summer/revenue/sheet-refresh",
})

# Path prefixes that do not require an access_token cookie. Handlers underneath
# that need auth still enforce it via their own dependencies.
PUBLIC_PREFIXES = (
    "/api/summer/public/",   # public application + buddy-group forms
    "/api/report-shares/",   # token-gated parent report links (POST/DELETE self-auth)
    "/api/prospects",        # X-Branch-Pin gated primary-prospect pages
    "/api/buddy-tracker",    # X-Branch-Pin gated buddy tracker
)


def is_public_path(path: str) -> bool:
    """True if the path is exempt from the blanket login requirement."""
    if path in PUBLIC_PATHS:
        return True
    return any(path.startswith(prefix) for prefix in PUBLIC_PREFIXES)


# Public branch-staff tools whose non-/admin endpoints are gated by Cloudflare
# Access (Google SSO at the edge) instead of a login cookie. Their /admin
# sub-routes keep cookie auth via their own require_admin_* dependencies and are
# therefore NOT Access-gated here.
CF_ACCESS_PREFIXES = (
    "/api/prospects",
    "/api/buddy-tracker",
)


def _cf_access_enabled() -> bool:
    return os.getenv("CF_ACCESS_REQUIRED", "").strip().lower() in ("1", "true", "yes", "on")


def _cf_access_allowed_domains() -> tuple[str, ...]:
    raw = os.getenv(
        "CF_ACCESS_ALLOWED_DOMAINS",
        "mathconcept.com,mathconceptsecondary.academy",
    )
    return tuple(d.strip().lower() for d in raw.split(",") if d.strip())


def cf_access_denial(request: Request, path: str) -> Optional[Response]:
    """Return a 403 Response if ``path`` requires a Cloudflare Access identity
    and the request lacks an allowlisted one; otherwise None.

    Cloudflare injects ``Cf-Access-Authenticated-User-Email`` after the user
    passes the Access login. That header is only trustworthy when the request
    actually came through our Cloudflare edge — a caller hitting the Cloud Run
    URL directly could otherwise forge it — so we only read it when
    ``is_cloudflare_origin`` confirms the Worker's shared secret. As a result,
    these endpoints are reachable only via Cloudflare (where Access lives), which
    is exactly the intent: the public prospect/buddy pages are served on
    ``csm.``/``csm-pro.``, not the direct ``*.run.app`` URL.

    No-op unless ``CF_ACCESS_REQUIRED`` is set, so it is safe to deploy before
    the Cloudflare Access application is configured.
    """
    if not _cf_access_enabled():
        return None
    if not any(path.startswith(prefix) for prefix in CF_ACCESS_PREFIXES):
        return None
    # /admin sub-routes belong to CSM staff in the main (cookie-authed) app, not
    # the Access-gated public pages, so they are exempt from the Access check.
    if "/admin" in path:
        return None

    from auth.origin_guard import is_cloudflare_origin

    email = ""
    if is_cloudflare_origin(request):
        email = (request.headers.get("cf-access-authenticated-user-email") or "").strip().lower()
    domain = email.rsplit("@", 1)[-1] if "@" in email else ""
    if not email or domain not in _cf_access_allowed_domains():
        logger.warning("Blocked non-Access request to %s (email=%r)", path, email or None)
        return JSONResponse(
            status_code=403,
            content={"detail": "Cloudflare Access authentication required"},
        )
    return None


class AuthGateMiddleware(BaseHTTPMiddleware):
    """Require a valid access_token cookie for all /api/* routes by default."""

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path

        # Only guard the API surface. Frontend assets, docs and the health
        # check ("/") are served outside the /api prefix and pass through.
        if not path.startswith("/api"):
            return await call_next(request)

        # Let CORS preflight reach the CORS layer untouched.
        if request.method == "OPTIONS":
            return await call_next(request)

        if is_public_path(path):
            denied = cf_access_denial(request, path)
            if denied is not None:
                return denied
            return await call_next(request)

        token = request.cookies.get("access_token")
        if not token or not verify_token(token):
            return JSONResponse(
                status_code=401,
                content={"detail": "Not authenticated"},
            )

        return await call_next(request)
