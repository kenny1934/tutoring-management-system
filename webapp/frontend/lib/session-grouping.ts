/**
 * How the sessions list breaks itself into groups.
 *
 * Every ordinary list on this page covers a single day, so a time slot was
 * enough to tell one group from another and the code grouped on nothing else.
 * The view that shows lessons still booked past a tutor's last working day
 * covers as many days as it has to, and there a slot on its own put five
 * different dates into one pile of twenty-six lessons. So a group is a date and
 * a time slot together.
 *
 * The key each group carries is what the collapse state, the scroll anchors and
 * React all hang off. When the list covers one day that key is still the bare
 * time slot, exactly as it was, so none of that behaviour shifts underneath the
 * everyday list.
 */
import { getStatusSortOrder } from "./session-status";
import { getTutorSortName } from "@/components/zen/utils/sessionSorting";

/** The fields the grouping reads. Anything session-shaped satisfies it. */
export interface GroupableSession {
  session_date: string;
  time_slot?: string | null;
  tutor_name?: string | null;
  grade?: string | null;
  lang_stream?: string | null;
  session_status?: string | null;
  school?: string | null;
  school_student_id?: string | null;
}

export interface SessionGroup<T extends GroupableSession> {
  /** Identity for collapse state, scroll anchors and React keys. */
  key: string;
  /** The date every session in the group falls on, as YYYY-MM-DD. */
  date: string;
  timeSlot: string;
  sessions: T[];
}

/** What a session with no time slot is filed under, and it sorts last. */
export const UNSCHEDULED = "Unscheduled";

/**
 * A slot that should get a group of its own even with no sessions in it.
 *
 * Proposed make-up slots render as ghost rows, and a ghost whose slot holds no
 * real lessons still needs somewhere to appear.
 */
export interface PlaceholderSlot {
  date: string;
  timeSlot: string;
}

/**
 * Order the sessions inside one group.
 *
 * Tutors come in name order. Within a tutor, the grade and language stream they
 * are scheduled to teach most of that hour is the main group, and it sits above
 * whoever else is in the room, so the register reads as the class first and the
 * visitors after. Trials lead because they are the ones somebody has to greet.
 */
function sortWithinGroup<T extends GroupableSession>(groupSessions: T[]): T[] {
  const byTutor = new Map<string, T[]>();
  groupSessions.forEach((session) => {
    const tutor = session.tutor_name || "";
    if (!byTutor.has(tutor)) byTutor.set(tutor, []);
    byTutor.get(tutor)!.push(session);
  });

  const sorted: T[] = [];
  const tutorNames = [...byTutor.keys()].sort((a, b) =>
    getTutorSortName(a).localeCompare(getTutorSortName(b))
  );

  for (const tutor of tutorNames) {
    const tutorSessions = byTutor.get(tutor)!;

    const gradeCounts = new Map<string, number>();
    tutorSessions
      .filter((s) => s.session_status === "Scheduled")
      .forEach((s) => {
        const key = `${s.grade || ""}${s.lang_stream || ""}`;
        gradeCounts.set(key, (gradeCounts.get(key) || 0) + 1);
      });
    const mainGroup = [...gradeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";

    tutorSessions.sort((a, b) => {
      const getPriority = (s: T) => {
        const gradeKey = `${s.grade || ""}${s.lang_stream || ""}`;
        const isMainGroup = gradeKey === mainGroup && mainGroup !== "";
        const status = s.session_status || "";

        if (status === "Trial Class" || status === "Attended (Trial)") return 0;
        if (isMainGroup && (status === "Scheduled" || status === "Attended" || status === "No Show")) return 1;
        if (status === "Scheduled" || status === "Attended" || status === "No Show") return 3;
        if (status === "Make-up Class" || status === "Attended (Make-up)") return 5;
        return 10 + getStatusSortOrder(status);
      };

      const priorityA = getPriority(a);
      const priorityB = getPriority(b);
      if (priorityA !== priorityB) return priorityA - priorityB;

      // Within the same priority, and especially within the main group, the
      // register is easiest to read down by school and then by student number.
      if (priorityA <= 2) {
        const schoolCompare = (a.school || "").localeCompare(b.school || "");
        if (schoolCompare !== 0) return schoolCompare;
      }
      return (a.school_student_id || "").localeCompare(b.school_student_id || "");
    });

    sorted.push(...tutorSessions);
  }

  return sorted;
}

/** Order two time slots within a day by start time, unscheduled work last. */
function compareSlots(a: string, b: string): number {
  if (a === b) return 0;
  if (a === UNSCHEDULED) return 1;
  if (b === UNSCHEDULED) return -1;
  return a.split("-")[0].localeCompare(b.split("-")[0]);
}

/**
 * Break a list of sessions into the groups the list view renders.
 *
 * Pass `spansDates` when the list can hold more than one day, which is true of
 * the after-a-last-day view and false of every date-anchored list. It decides
 * both the shape of the key and whether two identical time slots on different
 * days are one group or two.
 */
export function groupSessionsForList<T extends GroupableSession>(
  sessions: T[],
  {
    spansDates,
    placeholderSlots = [],
  }: { spansDates: boolean; placeholderSlots?: PlaceholderSlot[] }
): SessionGroup<T>[] {
  const groups = new Map<string, SessionGroup<T>>();

  const keyFor = (date: string, timeSlot: string) =>
    spansDates ? `${date}|${timeSlot}` : timeSlot;

  const ensure = (date: string, timeSlot: string) => {
    const key = keyFor(date, timeSlot);
    let group = groups.get(key);
    if (!group) {
      group = { key, date, timeSlot, sessions: [] };
      groups.set(key, group);
    }
    return group;
  };

  sessions.forEach((session) => {
    ensure(session.session_date, session.time_slot || UNSCHEDULED).sessions.push(session);
  });

  placeholderSlots.forEach(({ date, timeSlot }) => {
    if (timeSlot) ensure(date, timeSlot);
  });

  return [...groups.values()]
    .map((group) => ({ ...group, sessions: sortWithinGroup(group.sessions) }))
    .sort((a, b) => {
      // On a single-day list every date is the same, so this falls through to
      // the slot comparison and the order is what it has always been.
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return compareSlots(a.timeSlot, b.timeSlot);
    });
}
