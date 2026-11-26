"""Reuse provider connections while keeping identity on each signed request."""
from http.cookiejar import CookieJar, DefaultCookiePolicy
from threading import Lock

import httpx


class _NoProviderCookies(DefaultCookiePolicy):
    def set_ok(self, cookie, request):
        return False


_client: httpx.Client | None = None
_lock = Lock()


def get_material_client() -> httpx.Client:
    global _client
    with _lock:
        if _client is None:
            _client = httpx.Client(
                timeout=httpx.Timeout(20, connect=5),
                limits=httpx.Limits(max_connections=20, max_keepalive_connections=10, keepalive_expiry=60),
                follow_redirects=False,
                cookies=CookieJar(policy=_NoProviderCookies()),
            )
        return _client


def close_material_client() -> None:
    global _client
    with _lock:
        client, _client = _client, None
    if client is not None:
        client.close()
