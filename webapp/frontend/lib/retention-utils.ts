/** Filtering and ordering for the retention chase list.
 *
 *  Lives outside the component because this is where the list's behaviour
 *  actually is: which of 500-odd names you see, and in what order you work
 *  through them. It is also where the subtle bugs are — never-contacted rows
 *  carry a null rather than a large number, so any comparator that forgets
 *  them silently sorts by string and puts "96" before "9".
 */
import type { RegularRetentionChaseRow, RetentionState } from "@/types";

export type ChaseSortKey =
  | "student_code"
  | "student_name"
  | "expected_grade"
  | "branch"
  | "tutor_name"
  | "days_since_contact";

export type ContactFilter = "" | "yes" | "no" | "due";

export interface ChaseFilters {
  state: RetentionState | "all";
  branch: string;
  grade: string;
  source: string;
  contact: ContactFilter;
  tutor: string;
  q: string;
}

export const EMPTY_CHASE_FILTERS: ChaseFilters = {
  state: "no_response",
  branch: "",
  grade: "",
  source: "",
  contact: "",
  tutor: "",
  q: "",
};

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

export function filterChaseRows(
  rows: RegularRetentionChaseRow[],
  filters: ChaseFilters,
  today: string
): RegularRetentionChaseRow[] {
  const needle = filters.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (filters.state !== "all" && r.state !== filters.state) return false;
    if (filters.branch && r.branch !== filters.branch) return false;
    if (filters.grade && r.expected_grade !== filters.grade) return false;
    if (filters.source && r.source !== filters.source) return false;
    if (filters.tutor && r.tutor_name !== filters.tutor) return false;
    if (filters.contact === "yes" && !r.last_contact_date) return false;
    if (filters.contact === "no" && r.last_contact_date) return false;
    if (filters.contact === "due" && !isFollowUpDue(r, today)) return false;
    if (needle) {
      const hay = `${r.student_name} ${r.student_code ?? ""} ${r.phone ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
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
