"""
Origin guard: refuse API traffic that did not transit our Cloudflare edge.

The backend Cloud Run service has a public ``*.run.app`` URL, so without this
guard an attacker can reach ``/api/*`` directly and bypass Cloudflare entirely.
That bypass defeats every edge protection we depend on:

- per-IP rate limiting (a direct caller can set ``CF-Connecting-IP`` itself and
  rotate it to get unlimited request budget — see ``utils/rate_limiter``),
- the Cloudflare WAF / bot rules, and
- any Cloudflare Access policy (which only runs at the edge).

Our Cloudflare Worker injects a shared-secret header on every request it proxies
to the backend. This middleware requires that header (constant-time compared)
for all ``/api/*`` traffic; direct hits to the ``run.app`` URL lack it and are
refused with 403.

Rollout is fail-open by design: if ``CF_ORIGIN_SECRET`` is unset the guard is a
no-op, so the backend can be deployed *before* the Worker and secret are wired
up. Once the Worker is sending the header AND the env var is set, enforcement is
live. Deploy order matters: update the Worker first, confirm the header arrives,
THEN set ``CF_ORIGIN_SECRET`` (otherwise legitimate traffic 403s).
"""
import hmac
import logging
import os

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger(__name__)

# Header the Cloudflare Worker injects with the shared secret value.
ORIGIN_HEADER = "X-Origin-Verify"


class OriginGuardMiddleware(BaseHTTPMiddleware):
    """Require the Cloudflare Worker's shared-secret header on /api/* traffic."""

    async def dispatch(self, request: Request, call_next) -> Response:
        secret = os.getenv("CF_ORIGIN_SECRET")

        # Fail-open until configured so the backend can ship ahead of the
        # Worker/secret rollout.
        if not secret:
            return await call_next(request)

        path = request.url.path

        # Only the API surface is proxied through Cloudflare. Cloud Run's own
        # health probes hit "/" and "/health" directly and must pass through.
        if not path.startswith("/api"):
            return await call_next(request)

        # Let CORS preflight reach the CORS layer untouched.
        if request.method == "OPTIONS":
            return await call_next(request)

        presented = request.headers.get(ORIGIN_HEADER, "")
        if not hmac.compare_digest(presented, secret):
            logger.warning(
                "Blocked non-Cloudflare request to %s from %s",
                path,
                request.client.host if request.client else "unknown",
            )
            return JSONResponse(status_code=403, content={"detail": "Forbidden"})

        # Mark the request as edge-verified so downstream code may trust
        # Cloudflare-injected headers (CF-Connecting-IP, Cf-Access-*).
        request.state.from_cloudflare = True
        return await call_next(request)
