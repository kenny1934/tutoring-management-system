import { useEffect, useRef, useCallback, useState } from "react";
import { useSWRConfig } from "swr";

interface SSECallbacks {
  onNewMessage?: (data: NewMessageEvent) => void;
  onReminderDue?: (data: ReminderDueEvent) => void;
}

interface ReminderDueEvent {
  message_id: number;
  thread_id: number;
  subject: string | null;
  preview: string;
}

interface NewMessageEvent {
  message_id: number;
  thread_id: number;
  from_tutor_id: number;
  from_tutor_name: string | null;
  subject: string | null;
  preview: string;
  category: string | null;
  priority: string;
  mentioned_tutor_ids?: number[];
}

export interface TypingUser {
  tutorId: number;
  tutorName: string;
  expiresAt: number;
}

// SWR key matchers (same as inbox/page.tsx)
const isThreadsKey = (key: unknown) =>
  Array.isArray(key) && (key[0] === "message-threads" || key[0] === "message-threads-paginated");
const isUnreadKey = (key: unknown) =>
  Array.isArray(key) && (key[0] === "unread-count" || key[0] === "unread-category-counts");
const isAnyMessageKey = (key: unknown) =>
  isThreadsKey(key) || isUnreadKey(key) || (Array.isArray(key) && (key[0] === "sent-messages" || key[0] === "mentioned-messages" || key[0] === "snoozed-messages"));

/**
 * Hook that connects to the SSE stream for real-time message updates.
 * Automatically reconnects with exponential backoff on disconnect.
 * Triggers SWR cache revalidation when events are received.
 * Returns typing users per thread for typing indicator display.
 */
export function useSSE(tutorId: number | null | undefined, callbacks?: SSECallbacks) {
  const { mutate } = useSWRConfig();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(1000);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Typing indicators: threadId -> list of typing users
  const [typingByThread, setTypingByThread] = useState<Map<number, TypingUser[]>>(new Map());

  // Cleanup expired typing indicators every 2s
  useEffect(() => {
    const interval = setInterval(() => {
      setTypingByThread(prev => {
        const now = Date.now();
        let changed = false;
        const next = new Map<number, TypingUser[]>();
        for (const [threadId, users] of prev) {
          const active = users.filter(u => u.expiresAt > now);
          if (active.length !== users.length) changed = true;
          if (active.length > 0) next.set(threadId, active);
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const connect = useCallback(() => {
    if (!tutorId) return;

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const url = `/api/messages/stream?tutor_id=${tutorId}`;
    const es = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = es;

    es.onopen = () => {
      // Reset backoff on successful connection
      backoffRef.current = 1000;
    };

    // Handle specific event types
    es.addEventListener("new_message", (event) => {
      const data: NewMessageEvent = JSON.parse(event.data);
      // Revalidate thread list and unread counts
      mutate(isAnyMessageKey);
      // Clear typing indicator for this thread (they sent the message)
      setTypingByThread(prev => {
        if (!prev.has(data.thread_id)) return prev;
        const next = new Map(prev);
        next.delete(data.thread_id);
        return next;
      });
      // Notify callback (for sound/browser notification)
      callbacksRef.current?.onNewMessage?.(data);
    });

    es.addEventListener("message_read", () => {
      // Revalidate to update read receipts
      mutate(isThreadsKey);
    });

    es.addEventListener("reaction", () => {
      // Revalidate to update reaction counts
      mutate(isThreadsKey);
    });

    es.addEventListener("message_updated", () => {
      // Revalidate thread detail to show edited content
      mutate(isThreadsKey);
    });

    es.addEventListener("message_deleted", () => {
      // Revalidate thread detail + thread list (message count changes)
      mutate(isAnyMessageKey);
    });

    es.addEventListener("reminder_due", (event) => {
      const data: ReminderDueEvent = JSON.parse(event.data);
      // Revalidate all caches (thread list, unread counts, snoozed list)
      mutate(isAnyMessageKey);
      callbacksRef.current?.onReminderDue?.(data);
    });

    es.addEventListener("typing", (event) => {
      const data = JSON.parse(event.data) as { thread_id: number; tutor_id: number; tutor_name: string };
      setTypingByThread(prev => {
        const next = new Map(prev);
        const users = (next.get(data.thread_id) || []).filter(u => u.tutorId !== data.tutor_id);
        users.push({ tutorId: data.tutor_id, tutorName: data.tutor_name, expiresAt: Date.now() + 5000 });
        next.set(data.thread_id, users);
        return next;
      });
    });

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;

      // Reconnect with exponential backoff (max 30s)
      const delay = backoffRef.current;
      backoffRef.current = Math.min(delay * 2, 30000);
      reconnectTimeoutRef.current = setTimeout(connect, delay);
    };
  }, [tutorId, mutate]);

  useEffect(() => {
    connect();

    // Disconnect SSE when tab is hidden to free backend resources / reduce CPU billing
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      } else {
        backoffRef.current = 1000;
        connect();
        mutate(isAnyMessageKey); // catch up on events missed while hidden
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [connect, mutate]);

  return { typingByThread };
}
