/**
 * Session sorting utilities for Zen mode
 * Replicates the exact sorting logic from TodaySessionsCard.tsx
 */

import type { Session } from "@/types";
import { GRADE_COLORS, getGradeColor } from "@/lib/constants";

// Re-export for consumers
export { GRADE_COLORS, getGradeColor };

// Strip honorific prefixes for tutor name sorting
export const getTutorSortName = (name: string): string =>
  name.replace(/^(Mr\.?|Ms\.?|Mrs\.?)\s*/i, '');

// Get first name only (without honorific) for compact display
export const getTutorFirstName = (name: string): string => {
  const cleaned = name.replace(/^(Mr\.?|Ms\.?|Mrs\.?)\s*/i, '');
  return cleaned.split(' ')[0] || cleaned;
};

// Check if a session can have attendance actions
export const canBeMarked = (session: Session): boolean =>
  ['Scheduled', 'Trial Class', 'Make-up Class'].includes(session.session_status);

/**
 * Returns sort order for session statuses (lower = higher priority)
 */
export const getStatusSortOrder = (status: string | undefined): number => {
  const s = status || "";

  const exactOrder: Record<string, number> = {
    "Trial Class": 1,
    "Scheduled": 2,
    "Make-up Class": 3,
    "Attended": 4,
    "Attended (Make-up)": 5,
    "Attended (Trial)": 5,
    "No Show": 6,
    "Rescheduled - Pending Make-up": 7,
    "Sick Leave - Pending Make-up": 8,
    "Weather Cancelled - Pending Make-up": 9,
    "Rescheduled - Make-up Booked": 10,
    "Sick Leave - Make-up Booked": 11,
    "Weather Cancelled - Make-up Booked": 12,
    "Cancelled": 13,
  };

  return exactOrder[s] ?? 99;
};

export interface TimeSlotGroup {
  timeSlot: string;
  startTime: string;
  sessions: Session[];
}

export interface SessionStats {
  total: number;
  completed: number;
  upcoming: number;
  cancelled: number;
}

export interface GroupedSessionsResult {
  groupedSessions: TimeSlotGroup[];
  allSessionIds: number[];
  stats: SessionStats;
  flatSessions: Session[]; // Flattened sorted list for j/k navigation
}

/**
 * Groups and sorts sessions exactly like TodaySessionsCard.tsx
 *
 * Sorting hierarchy:
 * 1. Group by time slot (chronological)
 * 2. Within each time slot, group by tutor (alphabetical, honorifics stripped)
 * 3. Within each tutor's sessions, sort by priority:
 *    - 0: Trial Class
 *    - 1: Main group + Scheduled
 *    - 2: Main group + Attended
 *    - 3: Non-main group + Scheduled
 *    - 4: Non-main group + Attended
 *    - 5: Make-up Class
 *    - 6: Attended (Make-up)
 *    - 10+: Other statuses
 * 4. Within same priority, sort by school then student ID
 */
export function groupAndSortSessions(sessions: Session[]): GroupedSessionsResult {
  if (!sessions || sessions.length === 0) {
    return {
      groupedSessions: [],
      allSessionIds: [],
      stats: { total: 0, completed: 0, upcoming: 0, cancelled: 0 },
      flatSessions: [],
    };
  }

  // Step 1: Group by time slot
  const groups: Record<string, Session[]> = {};
  sessions.forEach((session) => {
    const timeSlot = session.time_slot || "Unscheduled";
    if (!groups[timeSlot]) {
      groups[timeSlot] = [];
    }
    groups[timeSlot].push(session);
  });

  // Step 2: Sort sessions within each group
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

      // Find majority grade+lang_stream among Scheduled only (main group)
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

  // Step 3: Sort time slots chronologically
  const sortedEntries = Object.entries(groups).sort(([timeA], [timeB]) => {
    if (timeA === "Unscheduled") return 1;
    if (timeB === "Unscheduled") return -1;
    const startA = timeA.split("-")[0];
    const startB = timeB.split("-")[0];
    return startA.localeCompare(startB);
  });

  // Build grouped array
  const groupedArray: TimeSlotGroup[] = sortedEntries.map(([slot, sessionsInSlot]) => ({
    timeSlot: slot,
    startTime: slot.split("-")[0] || slot,
    sessions: sessionsInSlot,
  }));

  // Flatten for j/k navigation
  const flatSessions = groupedArray.flatMap(g => g.sessions);

  // Collect all session IDs
  const allIds = flatSessions.map(s => s.id);

  // Calculate stats
  const stats = calculateStats(sessions);

  return {
    groupedSessions: groupedArray,
    allSessionIds: allIds,
    stats,
    flatSessions,
  };
}

/**
 * Calculate session statistics matching GUI logic
 */
export function calculateStats(sessions: Session[]): SessionStats {
  if (!sessions || sessions.length === 0) {
    return { total: 0, completed: 0, upcoming: 0, cancelled: 0 };
  }

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
    total: sessions.length,
    completed,
    upcoming: sessions.length - completed - cancelled,
    cancelled,
  };
}

/**
 * Get status display character for terminal
 */
export function getStatusChar(status: string): string {
  switch (status) {
    case 'Attended':
    case 'Attended (Make-up)':
    case 'Attended (Trial)':
      return '✓';
    case 'Scheduled':
      return '○';
    case 'Trial Class':
      return '◐';
    case 'Make-up Class':
      return '↻';
    case 'No Show':
      return '✗';
    case 'Cancelled':
      return '✗';
    default:
      if (status.includes('Pending Make-up')) return '⋯';
      if (status.includes('Make-up Booked')) return '◷';
      return '•';
  }
}

/**
 * Get status color for terminal theme
 */
export function getStatusColor(status: string): 'success' | 'error' | 'warning' | 'accent' | 'dim' {
  switch (status) {
    case 'Attended':
    case 'Attended (Make-up)':
    case 'Attended (Trial)':
      return 'success';
    case 'No Show':
    case 'Cancelled':
      return 'error';
    case 'Trial Class':
      return 'accent';
    case 'Make-up Class':
      return 'warning';
    case 'Scheduled':
      return 'dim';
    default:
      if (status.includes('Pending Make-up') || status.includes('Make-up Booked')) {
        return 'warning';
      }
      return 'dim';
  }
}
