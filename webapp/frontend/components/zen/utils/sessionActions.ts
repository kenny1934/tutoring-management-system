/**
 * Session action utilities (API calls) — separated from sessionSorting.ts
 * to avoid pulling SWR dependencies into server component module resolution.
 */

import type { Session } from "@/types";
import { sessionsAPI } from "@/lib/api";
import { updateSessionInCache } from "@/lib/session-cache";

/**
 * Call the appropriate mark API for a given session status string.
 * Centralizes the status-to-API mapping used by quick mark and bulk mark.
 */
export async function callMarkApi(sessionId: number, status: string): Promise<Session> {
  let updatedSession: Session;
  switch (status) {
    case "Attended":
      updatedSession = await sessionsAPI.markAttended(sessionId);
      break;
    case "No Show":
      updatedSession = await sessionsAPI.markNoShow(sessionId);
      break;
    case "Rescheduled - Pending Make-up":
      updatedSession = await sessionsAPI.markRescheduled(sessionId);
      break;
    case "Sick Leave - Pending Make-up":
      updatedSession = await sessionsAPI.markSickLeave(sessionId);
      break;
    case "Weather Cancelled - Pending Make-up":
      updatedSession = await sessionsAPI.markWeatherCancelled(sessionId);
      break;
    default:
      updatedSession = await sessionsAPI.updateSession(sessionId, { session_status: status });
  }
  updateSessionInCache(updatedSession);
  return updatedSession;
}
