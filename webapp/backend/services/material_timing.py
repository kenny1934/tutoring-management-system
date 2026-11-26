"""Expose numeric, nested courseware timings without recording queries or identities."""
from contextvars import ContextVar
from time import perf_counter

from starlette.datastructures import MutableHeaders

material_timings: ContextVar[dict | None] = ContextVar("material_timings", default=None)


class MaterialTimingMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        path = scope.get("path", "")
        measured = path in ("/api/materials/sources", "/api/materials/search") or (
            path.startswith("/api/materials/") and path.endswith("/preview"))
        if scope["type"] != "http" or not measured:
            return await self.app(scope, receive, send)
        started = perf_counter()
        timings = {}
        token = material_timings.set(timings)

        async def timed_send(message):
            if message["type"] == "http.response.start":
                # These durations overlap: total contains the provider round
                # trip, which contains MCKB's reported search work.
                timings["csm_total"] = (perf_counter() - started) * 1000
                value = ", ".join(f"{name};dur={duration:.1f}" for name, duration in timings.items())
                MutableHeaders(scope=message).append("Server-Timing", value)
            await send(message)

        try:
            await self.app(scope, receive, timed_send)
        finally:
            material_timings.reset(token)
