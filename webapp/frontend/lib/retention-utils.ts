/** Filtering and ordering for the retention chase list.
 *
 *  Lives outside the component because this is where the list's behaviour
 *  actually is: which of 500-odd names you see, and in what order you work
 *  through them. It is also where the subtle bugs are — never-contacted rows
 *  carry a null rather than a large number, so any comparator that forgets
 *  them silently sorts by string and puts "96" before "9".
 */
import type { RegularRetentionChaseRow, RetentionSource, RetentionState } from "@/types";

export type ChaseSortKey =
  | "student_code"
  | "student_name"
  | "expected_grade"
  | "branch"
  | "tutor_name"
  | "days_since_contact";

const SORT_KEYS: ChaseSortKey[] = [
  "student_code",
  "student_name",
  "expected_grade",
  "branch",
  "tutor_name",
  "days_since_contact",
];

/** How reachable a family is, which is a different axis from what state they
 *  are in. "nophone" is on this list because a row with no number cannot be
 *  worked from the list at all: it needs somebody to go and find the number,
 *  not another caller trying. */
export type ContactFilter = "" | "yes" | "no" | "due" | "nophone";

/** Every reachability filter except "no opinion", in the order the buttons
 *  read: how far the chasing has got, then whether it can happen at all. */
export const CONTACT_FILTERS = ["no", "yes", "due", "nophone"] as const;

/** No branch here on purpose. The branch belongs to the page, which fetches
 *  one branch's report from the server, and a second branch control on the
 *  list itself could contradict it and leave somebody looking at an empty
 *  table with two controls to blame. */
export interface ChaseFilters {
  q: string;
  grade: string;
  tutor: string;
  contact: ContactFilter;
  source: string;
  state: RetentionState | "all";
}

export const EMPTY_CHASE_FILTERS: ChaseFilters = {
  q: "",
  grade: "",
  tutor: "",
  contact: "",
  source: "",
  state: "no_response",
};

/** The states the list can be narrowed to, in the order the buttons read:
 *  the work first, then the answers we have had, then everybody. */
export const CHASE_STATES: (RetentionState | "all")[] = [
  "no_response",
  "applied",
  "enrolled",
  "declined",
  "not_churn",
  "all",
];

const SOURCES: RetentionSource[] = ["regular_and_summer", "regular_only", "summer_only"];

/** Date as "12 Aug", quicker to place against today than a full date and
 *  shorter than one. The year appears only when it is not the current one. */
export function shortDate(value: string, today: Date = new Date()): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** How stale a row is, in days. Never contacted sorts as infinitely stale
 *  rather than as zero or as an empty string, so ordering by last contact
 *  puts the untouched families first — the reason to sort by it at all. */
export function staleness(row: RegularRetentionChaseRow): number {
  return row.days_since_contact ?? Number.MAX_SAFE_INTEGER;
}

/** Someone promised to ring this family back, and the date has arrived. */
export function isFollowUpDue(row: RegularRetentionChaseRow, today: string): boolean {
  return Boolean(row.follow_up_needed && row.follow_up_date && row.follow_up_date <= today);
}

/** Whether there is a number to ring. A blank string counts as no number. */
export function hasPhone(row: RegularRetentionChaseRow): boolean {
  return Boolean(row.phone && row.phone.trim());
}

/** One row against one reachability filter.
 *
 *  Separate from the filter loop below so that the count on each button and
 *  the list you get by pressing it are worked out by the same code. They drift
 *  apart the moment they are written twice. */
export function matchesContact(
  row: RegularRetentionChaseRow,
  contact: ContactFilter,
  today: string
): boolean {
  switch (contact) {
    case "yes":
      return Boolean(row.last_contact_date);
    case "no":
      return !row.last_contact_date;
    case "due":
      return isFollowUpDue(row, today);
    case "nophone":
      return !hasPhone(row);
    default:
      return true;
  }
}

export function filterChaseRows(
  rows: RegularRetentionChaseRow[],
  filters: ChaseFilters,
  today: string
): RegularRetentionChaseRow[] {
  const needle = filters.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (filters.state !== "all" && r.state !== filters.state) return false;
    if (filters.grade && r.expected_grade !== filters.grade) return false;
    if (filters.source && r.source !== filters.source) return false;
    if (filters.tutor && r.tutor_name !== filters.tutor) return false;
    if (!matchesContact(r, filters.contact, today)) return false;
    if (needle) {
      const hay = `${r.student_name} ${r.student_code ?? ""} ${r.phone ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

/** How many students each state button would show.
 *
 *  Counted with every filter applied except the state itself, which is what
 *  makes the numbers usable: they say what you would get by pressing that
 *  button now, and they hold still while you move between them. Counting the
 *  whole payload instead would have every button claim more than it delivers
 *  as soon as anything else is narrowed. */
export function countChaseStates(
  rows: RegularRetentionChaseRow[],
  filters: ChaseFilters,
  today: string
): Record<RetentionState | "all", number> {
  const pool = filterChaseRows(rows, { ...filters, state: "all" }, today);
  const counts = {
    no_response: 0,
    applied: 0,
    enrolled: 0,
    declined: 0,
    not_churn: 0,
    all: pool.length,
  } as Record<RetentionState | "all", number>;
  for (const r of pool) counts[r.state] += 1;
  return counts;
}

/** The same promise for the reachability buttons, and for the same reason. */
export function countChaseContact(
  rows: RegularRetentionChaseRow[],
  filters: ChaseFilters,
  today: string
): Record<Exclude<ContactFilter, "">, number> {
  const pool = filterChaseRows(rows, { ...filters, contact: "" }, today);
  return {
    no: pool.filter((r) => matchesContact(r, "no", today)).length,
    yes: pool.filter((r) => matchesContact(r, "yes", today)).length,
    due: pool.filter((r) => matchesContact(r, "due", today)).length,
    nophone: pool.filter((r) => matchesContact(r, "nophone", today)).length,
  };
}

export function sortChaseRows(
  rows: RegularRetentionChaseRow[],
  sortKey: ChaseSortKey | null,
  dir: "asc" | "desc"
): RegularRetentionChaseRow[] {
  if (!sortKey) return rows;
  return [...rows].sort((a, b) => {
    const c =
      sortKey === "days_since_contact"
        ? staleness(a) - staleness(b)
        : String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""));
    return dir === "asc" ? c : -c;
  });
}

/** Which order the list is in, as one value, because that is how it travels in
 *  a link and how the ordering menu on a phone offers it. */
export interface ChaseSort {
  key: ChaseSortKey | null;
  dir: "asc" | "desc";
}

export const DEFAULT_CHASE_SORT: ChaseSort = { key: null, dir: "asc" };

export function formatChaseSort(sort: ChaseSort): string {
  return sort.key ? `${sort.key}:${sort.dir}` : "";
}

/** Anything unrecognised falls back to the server's own order rather than
 *  throwing, because this arrives from a URL somebody may have edited. */
export function parseChaseSort(raw: string | null | undefined): ChaseSort {
  const [key, dir] = (raw ?? "").split(":");
  if (!SORT_KEYS.includes(key as ChaseSortKey)) return DEFAULT_CHASE_SORT;
  return { key: key as ChaseSortKey, dir: dir === "desc" ? "desc" : "asc" };
}

/** The query-string keys this list owns. The page owns everything else on the
 *  URL, and neither should touch the other's. */
export const CHASE_QUERY_KEYS = ["q", "grade", "tutor", "contact", "source", "state"] as const;

/** Filters as they should appear in the address bar. A filter at its default
 *  writes nothing, so an untouched list has a clean URL and a shared one
 *  carries only what was actually chosen. */
export function chaseFiltersToQuery(filters: ChaseFilters): Record<string, string | null> {
  return {
    q: filters.q.trim() || null,
    grade: filters.grade || null,
    tutor: filters.tutor || null,
    contact: filters.contact || null,
    source: filters.source || null,
    state: filters.state === EMPTY_CHASE_FILTERS.state ? null : filters.state,
  };
}

/** Filters as they arrive from a link.
 *
 *  Every value is checked against what the list can actually offer, because a
 *  link can be old, hand-edited or truncated by a chat client, and a value
 *  nothing matches would show an empty table with no way to tell why. A grade
 *  or a tutor that no longer exists is left alone: those are real values that
 *  have simply moved on, and the empty result is the honest answer. */
export function chaseFiltersFromQuery(params: URLSearchParams): ChaseFilters {
  const state = params.get("state");
  const contact = params.get("contact");
  const source = params.get("source");
  return {
    q: params.get("q") ?? "",
    grade: params.get("grade") ?? "",
    tutor: params.get("tutor") ?? "",
    contact: (CONTACT_FILTERS as readonly string[]).includes(contact ?? "")
      ? (contact as ContactFilter)
      : "",
    source: (SOURCES as string[]).includes(source ?? "") ? source! : "",
    state: (CHASE_STATES as string[]).includes(state ?? "")
      ? (state as RetentionState | "all")
      : EMPTY_CHASE_FILTERS.state,
  };
}
