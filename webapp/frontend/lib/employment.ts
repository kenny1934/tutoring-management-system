/**
 * Who is still here, where they work, and who may still be picked.
 *
 * The same questions the backend answers in utils/employment.py, asked on
 * this side so the pickers agree with what the server will accept. The one
 * place the two part company is the date window below, which only screens have
 * a use for: no endpoint narrows a roster by a stretch of days, so the server
 * keeps the simpler single-day form. A tutor serving notice is still here and
 * still teaches, so they stay in every list.
 * Once their last working day has passed they leave the lists, but never the
 * screen: whoever is reassigning their lessons still has to see their name.
 */
import { toDateString } from "@/lib/calendar-utils";
import { DAY_NAMES, LOCATION_TO_CODE } from "@/lib/constants";
import { formatDayFirstDate } from "@/lib/formatters";
import type { DepartureLoad, Tutor, TutorBranchCoverage } from "@/types";

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

// ---------------------------------------------------------------------------
// Which branch a tutor may be offered at
// ---------------------------------------------------------------------------
// Until now every picker wrote this itself as `t.default_location === location`,
// twenty times over, and not all of them agreed: some compared against a short
// branch code and some against the Chinese name the summer and regular configs
// store. One helper, asked the same way everywhere, replaces the lot.

/**
 * The two fields the branch questions below need.
 *
 * Written structurally rather than as `Pick<Tutor, ...>` because the callers
 * do not all hold a full Tutor. The summer active-tutor endpoint returns a
 * trimmed shape whose default_location is nullable, and both forms have to
 * work without a cast at the call site.
 */
export type TutorBranchFields = {
  default_location?: string | null;
  branch_coverage?: TutorBranchCoverage[] | null;
};

/**
 * The order a person reads a week in, which is not the order `Date.getDay()`
 * counts it. DAY_NAMES is Sunday-first because it indexes that, so the editor
 * needs its own list rather than reusing it and starting the week on a Sunday.
 */
export const COVERAGE_WEEKDAYS: readonly string[] = [
  "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun",
];

/** The same list, for sorting a set of chosen days back into week order. */
const WEEK_ORDER = COVERAGE_WEEKDAYS;

/**
 * A branch name in the short-code form everything else compares against.
 *
 * Callers reach this helper holding whichever form their own screen works in,
 * so both are accepted and anything unrecognised is passed through untouched.
 */
export function normaliseLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  const trimmed = location.trim();
  return LOCATION_TO_CODE[trimmed] ?? trimmed;
}

/**
 * The stretch of days a screen is showing. Either end may be left open.
 *
 * Screens ask this question in three different shapes and they are all the
 * same shape underneath. A page sitting on one day is a window of one day, a
 * week or month grid is a window with both ends set, and a page with no dates
 * in it at all is a window with both ends open. Having one shape means the
 * coverage rule below is written once instead of once per kind of screen.
 */
export type DateWindow = { from?: string | null; until?: string | null };

/** Whichever of the three ways a caller asked, as a window. */
function asWindow(when: string | DateWindow | null | undefined): DateWindow {
  if (!when) return {};
  if (typeof when === "string") return { from: when, until: when };
  return when;
}

/** The later of two days, treating an open end as no answer at all. */
function latest(a?: string | null, b?: string | null): string | null {
  if (a && b) return a > b ? a : b;
  return a || b || null;
}

/** The earlier of two days, on the same terms. */
function earliest(a?: string | null, b?: string | null): string | null {
  if (a && b) return a < b ? a : b;
  return a || b || null;
}

/**
 * Whether a stretch of days contains at least one of a given weekday.
 *
 * Seven days in a row contain every day of the week, so the walk never takes
 * more than seven steps and usually stops on the first. A stretch left open at
 * either end runs on long enough to come round to any day, so it always does.
 */
function stretchHasWeekday(
  from: string | null,
  until: string | null,
  weekday: string
): boolean {
  if (!from || !until) return true;
  const day = new Date(`${from}T00:00:00`);
  for (let step = 0; step < 7; step++) {
    if (toDateString(day) > until) return false;
    if (DAY_NAMES[day.getDay()] === weekday) return true;
    day.setDate(day.getDate() + 1);
  }
  return true;
}

/**
 * Whether one coverage row applies to the days a screen is showing.
 *
 * Ask with a day when you are about to assign a lesson, with a window when the
 * screen is showing a week or a month, and with nothing when it has no dates
 * in it at all. The last case is the permissive one: with no days to judge
 * against, the only question left is whether the arrangement has already run
 * out, which is what a filter over a whole list wants to know.
 *
 * Otherwise the arrangement and the screen have to share at least one day, and
 * if the arrangement names a weekday then one of the shared days has to fall
 * on it. An empty bound is not a restriction: a row with nothing filled in
 * means they simply also work there.
 */
function coversOn(
  coverage: TutorBranchCoverage,
  when?: string | DateWindow | null,
  today: Date = new Date()
): boolean {
  const shown = asWindow(when);
  if (!shown.from && !shown.until) {
    return !coverage.effective_until || coverage.effective_until >= toDateString(today);
  }

  // The days the arrangement and the screen have in common. An open end on
  // either side never rules anything out, it just leaves that edge to the
  // other one.
  const from = latest(coverage.effective_from, shown.from);
  const until = earliest(coverage.effective_until, shown.until);
  if (from && until && from > until) return false;

  return !coverage.weekday || stretchHasWeekday(from, until, coverage.weekday);
}

/**
 * Whether this tutor may be offered at a branch.
 *
 * Their own branch always counts. Beyond that it takes a coverage row that
 * applies, which is what lets an MSA tutor be put on an MSB lesson while they
 * are covering there.
 *
 * Pass the day when the control knows it, which every picker that assigns a
 * lesson does. Pass the window when the screen is showing a stretch of days,
 * which the session grids are. Leave it out only when there are no dates on
 * screen at all, and the answer comes out permissive.
 *
 * No location, or the "All Locations" sentinel, means no narrowing is being
 * applied at all, so everybody is offerable. That keeps the check out of every
 * call site.
 */
export function worksAt(
  tutor: TutorBranchFields,
  location: string | null | undefined,
  when?: string | DateWindow | null,
  today: Date = new Date()
): boolean {
  if (!location || location === "All Locations") return true;
  const wanted = normaliseLocation(location);
  if (normaliseLocation(tutor.default_location) === wanted) return true;
  return (tutor.branch_coverage ?? []).some(
    (row) => normaliseLocation(row.location) === wanted && coversOn(row, when, today)
  );
}

/**
 * Whether this branch is the tutor's own, ignoring any coverage.
 *
 * The narrower question, and the one the pickers outside the session and
 * make-up screens still ask. Covering another branch lets somebody be put on a
 * lesson there, but it deliberately does not make them assignable to a regular
 * enrolment, a duty roster or an open-ended slot at that branch, because those
 * are standing commitments rather than one person filling in.
 *
 * It exists as its own named function so that which policy a picker follows is
 * visible at the call site. Widening one later is a one-word change.
 */
export function isHomeBranch(
  tutor: TutorBranchFields,
  location: string | null | undefined
): boolean {
  if (!location || location === "All Locations") return true;
  return normaliseLocation(tutor.default_location) === normaliseLocation(location);
}

/**
 * Split a list a picker is already going to offer into home and visiting.
 *
 * Takes whatever narrowing the caller has already done and only decides how to
 * present it, so it never changes who is in the list. That matters, because the
 * four session pickers each build their list slightly differently and none of
 * them should start offering a different set of people just to get a heading.
 *
 * A dropdown that mixes the two is how somebody ends up handing a lesson to a
 * tutor who is normally at the other branch without noticing, so every picker
 * that can assign work renders them apart.
 */
export function partitionByBranch<T extends TutorBranchFields>(
  tutors: T[],
  location: string | null | undefined
): { home: T[]; visiting: T[] } {
  if (!location || location === "All Locations") return { home: tutors, visiting: [] };
  return {
    home: tutors.filter((t) => isHomeBranch(t, location)),
    visiting: tutors.filter((t) => !isHomeBranch(t, location)),
  };
}

/**
 * The tutors a picker may offer at a branch, in the same two groups.
 *
 * Does the narrowing as well as the split: employment first, then the branch
 * question. Every picker needs both answers and asking for them separately is
 * how three call sites came to forget one of them.
 */
export function tutorsForLocation<
  T extends TutorBranchFields & Pick<Tutor, "departure_effective_on" | "is_active_tutor">
>(
  tutors: T[],
  location: string | null | undefined,
  when?: string | DateWindow | null,
  today: Date = new Date()
): { home: T[]; visiting: T[] } {
  const offerable = pickableTutors(tutors, today).filter((t) =>
    worksAt(t, location, when, today)
  );
  return partitionByBranch(offerable, location);
}

/**
 * How a visiting tutor reads in a plain option list.
 *
 * The four session pickers are native selects, where there is nowhere to hang
 * a chip, so the branch goes in the text: "Ms Bella Chang (MSA)". Returns the
 * name alone for the branch's own people, who need no explaining.
 */
export function tutorOptionLabel(
  tutor: TutorBranchFields & { tutor_name: string },
  location: string | null | undefined
): string {
  if (isHomeBranch(tutor, location)) return tutor.tutor_name;
  const home = normaliseLocation(tutor.default_location);
  return home ? `${tutor.tutor_name} (${home})` : tutor.tutor_name;
}

/**
 * The dates of an arrangement in words, or null when it has none.
 *
 * Shared by the row label and the editor's summary line so a period never gets
 * described two different ways on two different screens.
 */
function coveragePeriodPhrase(
  from: string | null | undefined,
  until: string | null | undefined
): string | null {
  if (from && until && from === until) return `on ${formatDayFirstDate(from)}`;
  if (from && until) return `${formatDayFirstDate(from)} to ${formatDayFirstDate(until)}`;
  if (from) return `from ${formatDayFirstDate(from)}`;
  if (until) return `until ${formatDayFirstDate(until)}`;
  return null;
}

/** "MSB", "MSB Sats", "MSB Sats, 1 Sep 2026 to 31 Oct 2026". */
function describeCoverage(branch: string, weekdays: string[], period: string | null): string {
  const when = [...weekdays.map((day) => `${day}s`), period].filter(Boolean);
  return when.length ? `${branch} ${when.join(", ")}` : branch;
}

/**
 * How a coverage row reads on screen, for the tutor list and the editor.
 *
 * "MSB" on its own for a standing arrangement, and the bounds spelled out when
 * there are any, so nobody has to open the editor to find out whether somebody
 * is there permanently or for one Saturday.
 */
export function coverageLabel(coverage: TutorBranchCoverage): string {
  const code = normaliseLocation(coverage.location) ?? coverage.location;
  return describeCoverage(
    code,
    coverage.weekday ? [coverage.weekday] : [],
    coveragePeriodPhrase(coverage.effective_from, coverage.effective_until)
  );
}


// ---------------------------------------------------------------------------
// Editing coverage
// ---------------------------------------------------------------------------
// The table stores one row per weekday, matching the duty tables, but nobody
// thinks in rows. Somebody setting this up thinks "Bella covers MSB on Tuesdays
// and Saturdays until the end of October", which is one arrangement per branch.
// These two functions translate between the two, so the editor can offer the
// sentence and the table can keep the rows.

/** One branch's arrangement as the editor holds it. Dates are "" when unset. */
export type CoverageDraft = {
  /** Empty means every day, stored as a single row with no weekday. */
  weekdays: string[];
  from: string;
  until: string;
};

export const EMPTY_DRAFT: CoverageDraft = { weekdays: [], from: "", until: "" };

/**
 * Coverage rows as one draft per branch, for the editor to work on.
 *
 * Rows for a branch are folded together: the weekdays are collected and the
 * dates come from the first row, because every row this editor writes for a
 * branch carries the same dates. A row with no weekday means every day, and it
 * wins over any named day sitting beside it, since it already includes them.
 */
export function coverageDraftsFromRows(
  rows: TutorBranchCoverage[] | null | undefined
): Record<string, CoverageDraft> {
  const drafts: Record<string, CoverageDraft> = {};
  // Branches that turned out to have a row with no weekday on them. Noted as
  // the rows go past, because that is where the fact is visible: a row with no
  // weekday says the arrangement runs on any day, which makes any named days
  // beside it redundant.
  const anyDay = new Set<string>();

  for (const row of rows ?? []) {
    const branch = normaliseLocation(row.location);
    if (!branch) continue;
    const draft = drafts[branch] ?? {
      weekdays: [],
      from: row.effective_from ?? "",
      until: row.effective_until ?? "",
    };
    if (!row.weekday) {
      anyDay.add(branch);
    } else if (!draft.weekdays.includes(row.weekday)) {
      draft.weekdays.push(row.weekday);
    }
    drafts[branch] = draft;
  }

  for (const [branch, draft] of Object.entries(drafts)) {
    if (anyDay.has(branch)) draft.weekdays = [];
    else draft.weekdays.sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b));
  }
  return drafts;
}

/**
 * Drafts back into rows to send to the server.
 *
 * One row per chosen weekday, all carrying the same dates, or a single row with
 * no weekday when the arrangement runs on any day. An empty date is sent as
 * null, which is what "no bound" means in the table.
 */
export function coverageRowsFromDrafts(
  drafts: Record<string, CoverageDraft>
): TutorBranchCoverage[] {
  const rows: TutorBranchCoverage[] = [];
  for (const [location, draft] of Object.entries(drafts)) {
    const bounds = {
      effective_from: draft.from || null,
      effective_until: draft.until || null,
    };
    if (draft.weekdays.length === 0) {
      rows.push({ location, weekday: null, ...bounds });
      continue;
    }
    for (const weekday of draft.weekdays) {
      rows.push({ location, weekday, ...bounds });
    }
  }
  return rows;
}

/**
 * What is wrong with a draft, or null when it is fine.
 *
 * Only one thing can be, which is a range that ends before it starts. Everything
 * else the form can express is a legitimate arrangement, an empty one included.
 */
export function coverageDraftProblem(draft: CoverageDraft): string | null {
  if (draft.from && draft.until && draft.until < draft.from) {
    return "The end date is before the start date.";
  }
  return null;
}

/**
 * A draft as a sentence, for the line under the controls.
 *
 * Built from the same pieces as coverageLabel, so what the editor says while
 * you are setting it up matches what the tutor list says afterwards. The one
 * difference is that several weekdays share a single set of dates here, rather
 * than the dates being repeated once per row.
 */
export function coverageDraftLabel(branch: string, draft: CoverageDraft): string {
  return describeCoverage(
    normaliseLocation(branch) ?? branch,
    draft.weekdays,
    coveragePeriodPhrase(draft.from || null, draft.until || null)
  );
}
