import { mutate } from 'swr';
import type { Session } from '@/types';

/**
 * Update a session across all SWR caches optimistically.
 * This finds the session by ID and updates it in-place without refetching.
 *
 * Use this after any session status change (Attended, No Show, etc.) to
 * instantly update all views without causing page flicker or refetch delays.
 */
export function updateSessionInCache(updatedSession: Session) {
  const sessionId = updatedSession.id;

  // Update single session cache (for /sessions/[id] pages)
  mutate(['session', sessionId], updatedSession, { revalidate: false });

  // Update all list caches that might contain this session
  // Using a matcher function to find all relevant cache keys
  mutate(
    (key) => {
      if (!Array.isArray(key)) return false;
      const [type] = key;
      return type === 'sessions' ||
             type === 'student-sessions' ||
             type === 'enrollment-sessions';
    },
    // Updater function: find and replace the session in the list
    (currentData: Session[] | undefined) => {
      if (!currentData) return currentData;
      return currentData.map((s) =>
        s.id === sessionId ? updatedSession : s
      );
    },
    { revalidate: false }
  );
}

/**
 * Trigger background revalidation for session-related caches.
 * Call this after optimistic update to ensure eventual consistency.
 *
 * Note: Usually not needed since the API returns the updated session,
 * but useful if you want to sync with server state after some time.
 */
export function revalidateSessionCaches() {
  mutate(
    (key) => {
      if (!Array.isArray(key)) return false;
      const [type] = key;
      return type === 'sessions' ||
             type === 'student-sessions' ||
             type === 'enrollment-sessions';
    },
    undefined,
    { revalidate: true }
  );
}
