/**
 * Who is still here, and who may still be picked.
 *
 * The same two questions the backend answers in utils/employment.py, asked on
 * this side so the pickers agree with what the server will accept. A tutor
 * serving notice is still here and still teaches, so they stay in every list.
 * Once their last working day has passed they leave the lists, but never the
 * screen: whoever is reassigning their lessons still has to see their name.
 */
import { toDateString } from "@/lib/calendar-utils";
import type { DepartureLoad, Tutor } from "@/types";

/** A last working day is on file, whether it has passed or not. */
export function isLeaving(tutor: Pick<Tutor, "departure_effective_on">): boolean {
  return Boolean(tutor.departure_effective_on);
}

/**
 * Their last working day is behind them.
 *
 * The last day itself counts as still here: somebody leaving on the 22nd works
 * the 22nd. Dates are compared as YYYY-MM-DD strings against the local date,
 * which keeps the answer in the office's timezone rather than UTC's.
 */
export function hasDeparted(
  tutor: Pick<Tutor, "departure_effective_on">,
  today: Date = new Date()
): boolean {
  const last = tutor.departure_effective_on;
  return Boolean(last && last < toDateString(today));
}

/** Whether this tutor can be given work happening on `workDate` (YYYY-MM-DD). */
export function canHoldWorkOn(
  tutor: Pick<Tutor, "departure_effective_on">,
  workDate: string
): boolean {
  const last = tutor.departure_effective_on;
  return !last || workDate <= last;
}

/**
 * The tutors a picker may offer.
 *
 * Excludes anyone who has already left. Anyone serving notice stays, because
 * they are still teaching and refusing to schedule them would be wrong. What
 * stops a lesson being booked past their last day is the server, which knows
 * the date of the lesson being booked and can therefore judge it.
 */
export function assignableTutors<T extends Pick<Tutor, "departure_effective_on">>(
  tutors: T[],
  today: Date = new Date()
): T[] {
  return tutors.filter((tutor) => !hasDeparted(tutor, today));
}

/**
 * A picker's options with the tutor it is currently set to added back in.
 *
 * Without this a select whose value is a departed tutor renders with nothing
 * sensibly selected, and saving the form can write whatever the browser picked
 * instead. That would quietly reassign a lesson nobody meant to touch. The
 * same hazard already exists for a tutor at another branch, since the pickers
 * narrow by location too, so this takes the current value from the full list
 * rather than only handling leavers.
 */
export function withCurrentTutor<T extends { id: number }>(
  options: T[],
  currentId: number | null | undefined,
  all: T[]
): T[] {
  if (currentId == null || options.some((option) => option.id === currentId)) return options;
  const current = all.find((option) => option.id === currentId);
  return current ? [...options, current] : options;
}

/** "Leaving 22 Aug 2026" or "Left 22 Aug 2026", or null for everybody else. */
export function departureLabel(
  tutor: Pick<Tutor, "departure_effective_on">,
  today: Date = new Date()
): string | null {
  const last = tutor.departure_effective_on;
  if (!last) return null;
  const when = new Date(`${last}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${hasDeparted(tutor, today) ? "Left" : "Leaving"} ${when}`;
}

/**
 * Whether a departure has left anything behind that somebody has to move.
 *
 * Enrollments are counted for completeness on the profile panel but not here,
 * because an enrollment on its own schedules nothing: it is the sessions and
 * the slots that put a person in a room.
 */
export function hasOutstandingWork(load: DepartureLoad): boolean {
  return (
    load.sessions_after_last_day > 0 ||
    load.summer_slots > 0 ||
    load.regular_slots > 0 ||
    load.summer_duties > 0 ||
    load.regular_duties > 0 ||
    load.waitlist_preferences > 0
  );
}
