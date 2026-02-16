"""
Server-Sent Events (SSE) connection manager for real-time messaging.

Manages per-tutor async queues so that backend events (new messages,
read receipts, reactions, typing, presence) are pushed instantly to
connected frontend clients.
"""
import asyncio
import json
import logging
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages SSE connections per tutor using asyncio.Queue."""

    def __init__(self):
        # tutor_id -> list of queues (one per browser tab / device)
        self._connections: dict[int, list[asyncio.Queue]] = {}
        # tutor_id -> last_seen timestamp (for presence)
        self._presence: dict[int, datetime] = {}

    def connect(self, tutor_id: int) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        self._connections.setdefault(tutor_id, []).append(queue)
        self._presence[tutor_id] = datetime.utcnow()
        logger.info("SSE connect: tutor %d (total connections: %d)", tutor_id, len(self._connections[tutor_id]))
        return queue

    def disconnect(self, tutor_id: int, queue: asyncio.Queue):
        queues = self._connections.get(tutor_id, [])
        if queue in queues:
            queues.remove(queue)
        if not queues:
            self._connections.pop(tutor_id, None)
            self._presence.pop(tutor_id, None)
        logger.info("SSE disconnect: tutor %d (remaining: %d)", tutor_id, len(self._connections.get(tutor_id, [])))

    def update_presence(self, tutor_id: int):
        self._presence[tutor_id] = datetime.utcnow()

    def get_online_tutors(self, within_seconds: int = 300) -> dict[int, datetime]:
        """Return tutors with activity within the given window."""
        now = datetime.utcnow()
        return {
            tid: last_seen
            for tid, last_seen in self._presence.items()
            if (now - last_seen).total_seconds() < within_seconds
            and tid in self._connections and len(self._connections[tid]) > 0
        }

    async def broadcast(self, event_type: str, data: Any, recipient_tutor_ids: list[int] | None = None):
        """Push an event to specified tutors, or all connected tutors if None."""
        payload = json.dumps(data, default=str)
        message = f"event: {event_type}\ndata: {payload}\n\n"

        targets = recipient_tutor_ids if recipient_tutor_ids is not None else list(self._connections.keys())

        for tutor_id in targets:
            for queue in self._connections.get(tutor_id, []):
                try:
                    queue.put_nowait(message)
                except asyncio.QueueFull:
                    logger.warning("SSE queue full for tutor %d, dropping event", tutor_id)


# Module-level singleton
sse_manager = ConnectionManager()
