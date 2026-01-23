/**
 * Hook for grouping and sorting sessions by time slot.
 * Implements the same sorting logic as the main sessions page.
 */

import { useMemo } from 'react';
import { parseTimeSlot } from '@/lib/calendar-utils';
import { getStatusSortOrder } from '@/lib/session-status';
import { getTutorSortName } from '@/components/zen/utils/sessionSorting';
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
    // First, group by time slot
    const groups: Record<string, Session[]> = {};
    sessions.forEach((session) => {
      const timeSlot = session.time_slot || "Unscheduled";
      if (!groups[timeSlot]) {
        groups[timeSlot] = [];
      }
      groups[timeSlot].push(session);
    });

    // Sort sessions within each group using main group priority
    Object.values(groups).forEach((groupSessions) => {
      // Group by tutor first
      const byTutor = new Map<string, Session[]>();
      groupSessions.forEach(s => {
        const tutor = s.tutor_name || '';
        if (!byTutor.has(tutor)) byTutor.set(tutor, []);
        byTutor.get(tutor)!.push(s);
      });

      // For each tutor, find main group and sort
      const sortedSessions: Session[] = [];
      const tutorNames = [...byTutor.keys()].sort((a, b) =>
        getTutorSortName(a).localeCompare(getTutorSortName(b))
      );

      for (const tutor of tutorNames) {
        const tutorSessions = byTutor.get(tutor)!;

        // Find majority grade+lang_stream among Scheduled only
        const scheduledSessions = tutorSessions.filter(s => s.session_status === 'Scheduled');
        const gradeCounts = new Map<string, number>();
        scheduledSessions.forEach(s => {
          const key = `${s.grade || ''}${s.lang_stream || ''}`;
          gradeCounts.set(key, (gradeCounts.get(key) || 0) + 1);
        });
        const mainGroup = [...gradeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';

        // Sort with main group priority
        tutorSessions.sort((a, b) => {
          const getPriority = (s: Session) => {
            const gradeKey = `${s.grade || ''}${s.lang_stream || ''}`;
            const isMainGroup = gradeKey === mainGroup && mainGroup !== '';
            const status = s.session_status || '';

            if (status === 'Trial Class') return 0;
            if (isMainGroup && status === 'Scheduled') return 1;
            if (isMainGroup && status === 'Attended') return 2;
            if (status === 'Scheduled') return 3;
            if (status === 'Attended') return 4;
            if (status === 'Make-up Class') return 5;
            if (status === 'Attended (Make-up)') return 6;
            return 10 + getStatusSortOrder(status);
          };

          const priorityA = getPriority(a);
          const priorityB = getPriority(b);
          if (priorityA !== priorityB) return priorityA - priorityB;

          // Within same priority (especially main group), sort by school then student_id
          if (priorityA <= 2) {
            const schoolCompare = (a.school || '').localeCompare(b.school || '');
            if (schoolCompare !== 0) return schoolCompare;
          }
          return (a.school_student_id || '').localeCompare(b.school_student_id || '');
        });

        sortedSessions.push(...tutorSessions);
      }

      // Replace original array contents
      groupSessions.length = 0;
      groupSessions.push(...sortedSessions);
    });

    // Group proposed sessions by time slot
    const proposedBySlot: Record<string, ProposedSession[]> = {};
    proposedSessions.forEach((ps) => {
      const slot = ps.time_slot || "Unscheduled";
      if (!proposedBySlot[slot]) {
        proposedBySlot[slot] = [];
      }
      proposedBySlot[slot].push(ps);
    });

    // Add time slots from proposed sessions that don't have real sessions
    Object.keys(proposedBySlot).forEach((slot) => {
      if (!groups[slot]) {
        groups[slot] = [];
      }
    });

    // Re-sort including new proposed-only time slots
    const allSortedEntries = Object.entries(groups).sort(([timeA], [timeB]) => {
      if (timeA === "Unscheduled") return 1;
      if (timeB === "Unscheduled") return -1;
      const startA = timeA.split("-")[0];
      const startB = timeB.split("-")[0];
      return startA.localeCompare(startB);
    });

    const groupedArray: TimeSlotGroup[] = allSortedEntries.map(([slot, sessionsInSlot]) => {
      const parsed = parseTimeSlot(slot);
      return {
        timeSlot: slot,
        startTime: parsed?.start || slot,
        sessions: sessionsInSlot,
        proposedSessions: proposedBySlot[slot] || [],
      };
    });

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
