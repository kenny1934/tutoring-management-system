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
import { formatDayFirstDate } from "@/lib/formatters";
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

/**
 * The tutors a picker may offer.
 *
 * Both halves of the rule in one place: somebody who does not teach at all,
 * which is every Supervisor and Guest, and somebody who has already left.
 * Anyone serving notice stays, because they are still teaching and refusing to
 * schedule them would be wrong. What stops a lesson being booked past their
 * last day is the server, which knows the date of the lesson and can judge it.
 *
 * Both halves together on purpose. When this filtered on departure alone every
 * call site had to remember to write the teaching half itself, and three of
 * them did not.
 */
export function pickableTutors<
  T extends Pick<Tutor, "departure_effective_on" | "is_active_tutor">
>(tutors: T[], today: Date = new Date()): T[] {
  return tutors.filter(
    (tutor) => tutor.is_active_tutor !== false && !hasDeparted(tutor, today)
  );
}

/**
 * The tutors a picker may offer for work that has no end date.
 *
 * A regular slot or a waitlist preference carries on until somebody changes
 * it, so the server refuses anyone with a leaving date at all, however far off
 * (see NO_LEAVERS in services/departure_guard.py). Offering a name the save
 * will reject is worse than not offering it.
 */
export function pickableForOpenEndedWork<
  T extends Pick<Tutor, "departure_effective_on" | "is_active_tutor">
>(tutors: T[], today: Date = new Date()): T[] {
  return pickableTutors(tutors, today).filter((tutor) => !isLeaving(tutor));
}

/**
 * The tutors a control may name when the subject is a departure.
 *
 * A filter that exists to work through somebody's leftovers has to be able to
 * name them, and pickableTutors drops them the day after they go. So this is
 * everyone who can still be given work, plus everyone with a last working day
 * on file whether it has passed or not. It is for looking, never for assigning:
 * the pickers that hand out work still use pickableTutors, and the server would
 * refuse a departed tutor anyway.
 */
export function pickableWithLeavers<
  T extends Pick<Tutor, "departure_effective_on" | "is_active_tutor">
>(tutors: T[], today: Date = new Date()): T[] {
  return tutors.filter(
    (tutor) => isLeaving(tutor) || (tutor.is_active_tutor !== false && !hasDeparted(tutor, today))
  );
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

/**
 * Whether a filter set to this tutor should be moved off them.
 *
 * Pass everyone at the branch currently on screen, leavers included. Changing
 * branch is a reason to move the filter, because that tutor's work is not on
 * this screen at all while another branch is selected. A departure is not a
 * reason: they are exactly who you came to look at, and quietly swapping in
 * somebody else would show you a different tutor's data under a link you had
 * shared as theirs.
 *
 * An empty list means the roster has not arrived yet, so nothing is released.
 */
export function shouldReleaseTutorFilter<T extends { id: number }>(
  atBranch: T[],
  currentId: number | null
): boolean {
  if (currentId == null || atBranch.length === 0) return false;
  return !atBranch.some((tutor) => tutor.id === currentId);
}

/** "22 Aug 2026", or null for somebody who is not leaving. */
export function departureDateLabel(
  tutor: Pick<Tutor, "departure_effective_on">
): string | null {
  const last = tutor.departure_effective_on;
  return last ? formatDayFirstDate(last) : null;
}

/** "Leaving 22 Aug 2026" or "Left 22 Aug 2026", or null for everybody else. */
export function departureLabel(
  tutor: Pick<Tutor, "departure_effective_on">,
  today: Date = new Date()
): string | null {
  const when = departureDateLabel(tutor);
  if (!when) return null;
  return `${hasDeparted(tutor, today) ? "Left" : "Leaving"} ${when}`;
}

/**
 * Whether a departure has left anything behind that somebody has to move.
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
