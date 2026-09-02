"""A small in-process cache for reports that cost far more to build than to keep.

The case this was written for is the regular retention board: about 600ms of
database CPU to assemble, read by a handful of staff who all open it in the
same few minutes of a morning, and changed only by their own clicks. Holding
the finished report for a couple of minutes turns a room full of people opening
the board into one query rather than fifteen.

Two things to know before reaching for it.

It lives in one process. Cloud Run runs several, so a value cached on one
instance is invisible to the others and clearing it clears only the instance
that ran the code. That makes it fine for "this is expensive and rarely
different" and wrong for anything where two readers disagreeing would matter.
The way to keep it honest is to put a fingerprint of the underlying data in the
key, so a change makes a new key on every instance at once instead of relying
on anybody remembering to invalidate.

And the values are shared. Every caller gets the same object back, so cache
things nobody mutates. Pydantic models on their way to being serialised are the
intended case.
"""
from __future__ import annotations

import threading
import time
from collections import OrderedDict
from typing import Any, Hashable, Optional


class TTLCache:
    """Least-recently-used, with an expiry on every entry.

    `maxsize` is a memory guard rather than a tuning knob: these values are
    whole reports, so a handful of them is already megabytes.
    """

    def __init__(self, ttl_seconds: float, maxsize: int = 8):
        self.ttl_seconds = ttl_seconds
        self.maxsize = maxsize
        self._entries: "OrderedDict[Hashable, tuple[float, Any]]" = OrderedDict()
        self._lock = threading.Lock()
        # Only for logging and tests. Nothing branches on these.
        self.hits = 0
        self.misses = 0

    def get(self, key: Hashable) -> Optional[Any]:
        """The value, or None if it was never here or has expired."""
        now = time.monotonic()
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                self.misses += 1
                return None
            expires_at, value = entry
            if expires_at <= now:
                del self._entries[key]
                self.misses += 1
                return None
            self._entries.move_to_end(key)
            self.hits += 1
            return value

    def set(self, key: Hashable, value: Any) -> None:
        with self._lock:
            self._entries[key] = (time.monotonic() + self.ttl_seconds, value)
            self._entries.move_to_end(key)
            while len(self._entries) > self.maxsize:
                self._entries.popitem(last=False)

    def clear(self) -> None:
        """Drops everything, in this process. Tests use it to start clean."""
        with self._lock:
            self._entries.clear()
            self.hits = 0
            self.misses = 0

    def __len__(self) -> int:
        with self._lock:
            return len(self._entries)
