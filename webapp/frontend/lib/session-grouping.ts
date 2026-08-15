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
 * React all hang off. When the list is grouped by slot alone that key is still
 * the bare time slot, exactly as it was, which is what keeps the "Now" jump
 * button finding its anchor by `slot-${timeSlot}`.
 */
import { compareSessionsInSlot, getMainGradeGroup, type SlotSortSession } from "./session-status";
import { getTutorSortName } from "@/components/zen/utils/sessionSorting";

/** The fields the grouping reads. Anything session-shaped satisfies it. */
export interface GroupableSession extends SlotSortSession {
  session_date: string;
  time_slot?: string | null;
  tutor_name?: string | null;
}

export interface SessionGroup<T extends GroupableSession> {
  /** Identity for collapse state, scroll anchors and React keys. */
  key: string;
  /** The date every session in the group falls on, as YYYY-MM-DD. */
  date: string;
  timeSlot: string;
  /** True on the first group of each date, which is where a day heading goes. */
  isFirstOfDate: boolean;
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
 * visitors after. Both of those rules live in session-status.ts, which is where
 * the other surfaces that show a slot's register read them from.
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
    const mainGroup = getMainGradeGroup(tutorSessions);
    tutorSessions.sort((a, b) => compareSessionsInSlot(a, b, mainGroup));
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
 * Pass `groupByDate` when the list can hold more than one day, which is true of
 * the after-a-last-day view and false of every date-anchored list. It is a
 * decision the caller makes rather than something to read off the data: a
 * leaver whose lessons all fall on one Thursday is still that view, and letting
 * the key shape flip with the data would move the collapse state and the DOM
 * anchors underneath a filter change.
 */
export function groupSessionsForList<T extends GroupableSession>(
  sessions: T[],
  {
    groupByDate,
    placeholderSlots = [],
  }: { groupByDate: boolean; placeholderSlots?: PlaceholderSlot[] }
): SessionGroup<T>[] {
  const groups = new Map<string, SessionGroup<T>>();

  const ensure = (date: string, timeSlot: string) => {
    const key = groupByDate ? `${date}|${timeSlot}` : timeSlot;
    let group = groups.get(key);
    if (!group) {
      group = { key, date, timeSlot, isFirstOfDate: false, sessions: [] };
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

  const ordered = [...groups.values()]
    .map((group) => ({ ...group, sessions: sortWithinGroup(group.sessions) }))
    .sort((a, b) => {
      // Grouped by slot alone every date is the same, so this falls through to
      // the slot comparison and the order is what it has always been.
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return compareSlots(a.timeSlot, b.timeSlot);
    });

  ordered.forEach((group, index) => {
    group.isFirstOfDate = index === 0 || ordered[index - 1].date !== group.date;
  });

  return ordered;
}
