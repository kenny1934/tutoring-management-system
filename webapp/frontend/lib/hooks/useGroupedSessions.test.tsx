import { renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useGroupedSessions } from "./useGroupedSessions";
import type { Session } from "@/types";
import type { ProposedSession } from "@/lib/proposal-utils";

it("attaches old unspaced proposals to the same dashboard group as real sessions", () => {
  const sessions = [{ id: 1, session_date: "2026-11-06", time_slot: "18:00 - 19:30", session_status: "Scheduled" }] as Session[];
  const proposed = [{ session_date: "2026-11-06", time_slot: "18:00-19:30" }] as ProposedSession[];
  const { result } = renderHook(() => useGroupedSessions(sessions, proposed));
  expect(result.current.groupedSessions).toHaveLength(1);
  expect(result.current.groupedSessions[0].proposedSessions).toEqual(proposed);
  expect(result.current.groupedSessions[0].timeSlot).toBe("18:00 - 19:30");
});
