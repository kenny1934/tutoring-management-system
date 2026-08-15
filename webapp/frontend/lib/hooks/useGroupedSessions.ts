/**
 * Hook for grouping and sorting sessions by time slot.
 *
 * The grouping and the order within a slot are the shared ones in
 * lib/session-grouping.ts, so the dashboard's list reads exactly the way the
 * sessions page does and there is one place to change if that order ever moves.
 * What this adds on top is the proposed make-up rows hung off each slot, the
 * parsed start time, and the counts along the top of the card.
 */

import { useMemo } from 'react';
import { parseTimeSlot } from '@/lib/calendar-utils';
import { groupSessionsForList, UNSCHEDULED } from '@/lib/session-grouping';
import type { Session } from '@/types';
import type { ProposedSession } from '@/lib/proposal-utils';

export interface TimeSlotGroup {
  timeSlot: string;
  startTime: string;
  sessions: Session[];
  proposedSessions: ProposedSession[];
}

export interface SessionStats {
  total: number;
  completed: number;
  upcoming: number;
  cancelled: number;
}

interface UseGroupedSessionsResult {
  groupedSessions: TimeSlotGroup[];
  stats: SessionStats;
  allSessionIds: number[];
}

export function useGroupedSessions(
  sessions: Session[],
  proposedSessions: ProposedSession[]
): UseGroupedSessionsResult {
  return useMemo(() => {
    // Proposed make-up rows, by the slot they would land in.
    const proposedBySlot = new Map<string, ProposedSession[]>();
    proposedSessions.forEach((ps) => {
      const slot = ps.time_slot || UNSCHEDULED;
      const existing = proposedBySlot.get(slot);
      if (existing) existing.push(ps);
      else proposedBySlot.set(slot, [ps]);
    });

    const groupedArray: TimeSlotGroup[] = groupSessionsForList(sessions, {
      groupByDate: false,
      // A slot holding nothing but a proposal still needs a group to render
      // into. The date is what tells two groups apart only when grouping by
      // date, and this card covers a single day, so it has none to give.
      placeholderSlots: [...proposedBySlot.keys()].map((timeSlot) => ({ date: '', timeSlot })),
    }).map((group) => ({
      timeSlot: group.timeSlot,
      startTime: parseTimeSlot(group.timeSlot)?.start || group.timeSlot,
      sessions: group.sessions,
      proposedSessions: proposedBySlot.get(group.timeSlot) ?? [],
    }));

    // Collect all session IDs for select all
    const allIds = sessions.map(s => s.id);

    // Calculate stats (proposed sessions don't count toward stats)
    const completed = sessions.filter(s =>
      s.session_status === 'Attended' ||
      s.session_status === 'Attended (Make-up)'
    ).length;

    const cancelled = sessions.filter(s =>
      s.session_status === 'Cancelled' ||
      s.session_status === 'No Show' ||
      s.session_status.includes('Pending Make-up') ||
      s.session_status.includes('Make-up Booked')
    ).length;

    return {
      groupedSessions: groupedArray,
      allSessionIds: allIds,
      stats: {
        total: sessions.length,
        completed,
        upcoming: sessions.length - completed - cancelled,
        cancelled,
      }
    };
  }, [sessions, proposedSessions]);
}
