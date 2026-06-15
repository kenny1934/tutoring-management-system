"""
Cloudflare origin trust signal.

The backend Cloud Run service has a public ``*.run.app`` URL and is reached two
legitimate ways:

1. Through Cloudflare (``csm.``/``csm-pro.``) — the Worker proxies the request
   and injects a shared-secret header (``X-Origin-Verify``).
2. Directly via the frontend ``*.run.app`` URL — used deliberately to avoid
   spending Cloudflare Worker invocations. These requests carry no secret.

We do NOT block path 2 (it is a real workflow, and login-gated data is already
protected by the auth cookie). Instead, this module answers a narrower question:
"did this request come through *our* Cloudflare edge?" Only then may downstream
code trust headers that only Cloudflare can set truthfully:

- ``CF-Connecting-IP`` for rate limiting (a direct caller can forge it, so we
  ignore it off-Cloudflare and use the real connecting IP instead), and
- ``Cf-Access-Authenticated-User-Email`` for the Cloudflare Access gate (a
  direct caller can forge it, so the Access check only honours it on-Cloudflare).

When ``CF_ORIGIN_SECRET`` is unset (local dev), this returns False — nothing
relies on the trust signal in that case, so the app behaves normally.
"""
import hmac
import os

# Header the Cloudflare Worker injects with the shared secret value.
ORIGIN_HEADER = "X-Origin-Verify"


def is_cloudflare_origin(request) -> bool:
    """True iff the request carries the Worker-injected shared secret."""
    secret = os.getenv("CF_ORIGIN_SECRET")
    if not secret:
        return False
    presented = request.headers.get(ORIGIN_HEADER, "")
    return bool(presented) and hmac.compare_digest(presented, secret)
