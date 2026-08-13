/** Filtering, ordering and link-sharing for the conversion chase list.
 *
 *  The sister of `retention-utils`, and here for the same reason: what you see
 *  when you open the still-to-chase tab, and in what order you work through it,
 *  is behaviour worth testing on its own rather than behaviour buried in a
 *  component. Both boards are worked the same way, by somebody with a phone in
 *  their hand, so both of them narrow the same way and both of them put what
 *  they are showing in the address bar.
 */
import { formatProspectCode } from "@/lib/summer-utils";
import { OUTREACH_STATUS_HINTS } from "@/types";
import type { RegularConversionLostRow } from "@/types";

/** What the wanted-branch filter stands for when the parent named no branch at
 *  all. It has to be a real value rather than an empty one, because empty
 *  already means "do not filter by this". */
export const NO_BRANCH_WANTED = "none";

/** What a prospect who never answered the regular question is grouped under.
 *  The column shows a dash, but the filter needs something to match on. */
export const UNKNOWN_INTENTION = "Unknown";

/** The wants-regular ladder, in the order the filter offers it. */
export const INTENTION_ORDER = ["Yes", "Considering", "No", UNKNOWN_INTENTION];

/** Every outreach status there is, taken from the hints so that adding one in
 *  `types` cannot leave this list quietly a status short. */
const OUTREACH_VALUES = Object.keys(OUTREACH_STATUS_HINTS);

/** No year here, and no branch the prospect came from, on purpose.
 *
 *  Both of those belong to the page, which fetches one year and one branch's
 *  report from the server, and the list is only ever narrowing what it has
 *  already been given. The list used to carry a second branch control of its
 *  own, which meant the chase tab showed two dropdowns both reading "All
 *  branches" and both meaning the same thing. Somebody looking at an empty
 *  table then had two controls to blame. Searching for "MAC" still narrows to
 *  one branch's prospects anyway, because the branch code is the front of every
 *  prospect code and the search reads those. */
export interface ConversionChaseFilters {
  q: string;
  /** A secondary branch the parent named, or NO_BRANCH_WANTED for the ones who
   *  named none. This is where the family wants to go, which is a different
   *  question from where they came from. */
  wantsBranch: string;
  /** The stated regular intention, with UNKNOWN_INTENTION for no answer. */
  wantsRegular: string;
  outreach: string;
}

export const EMPTY_CONVERSION_FILTERS: ConversionChaseFilters = {
  q: "",
  wantsBranch: "",
  wantsRegular: "",
  outreach: "",
};

/** The query-string keys this list owns. The page owns the year, the branch the
 *  whole report is scoped to and which tab is open, and neither should write
 *  the other's keys. */
export const CONVERSION_QUERY_KEYS = [
  "q",
  "wantsBranch",
  "wantsRegular",
  "outreach",
] as const;

/** Everything a search should look through, as one lower-cased string.
 *
 *  The same fields the prospects page searches on the server, so looking
 *  somebody up means the same thing in both places, plus the summer code this
 *  table shows in its own first column. The branch code goes in twice on
 *  purpose: the table displays "MAC-2140" while the record holds "MAC2140", and
 *  whoever is typing may have either one in front of them. */
function haystack(row: RegularConversionLostRow): string {
  return [
    row.student_name,
    formatProspectCode(row.source_branch, row.primary_student_id),
    row.primary_student_id,
    row.summer_student_code,
    row.phone_1,
    row.phone_2,
    row.school,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function filterLostProspects(
  rows: RegularConversionLostRow[],
  filters: ConversionChaseFilters
): RegularConversionLostRow[] {
  const needle = filters.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (filters.wantsBranch) {
      const named =
        filters.wantsBranch === NO_BRANCH_WANTED
          ? r.preferred_branches.length === 0
          : r.preferred_branches.includes(filters.wantsBranch);
      if (!named) return false;
    }
    if (
      filters.wantsRegular &&
      (r.wants_regular ?? UNKNOWN_INTENTION) !== filters.wantsRegular
    ) {
      return false;
    }
    if (filters.outreach && r.outreach_status !== filters.outreach) return false;
    if (needle && !haystack(r).includes(needle)) return false;
    return true;
  });
}

/** Filters as they should appear in the address bar. A filter still at its
 *  default writes nothing, so an untouched list has a clean URL and a shared
 *  one carries only what was actually chosen. */
export function conversionFiltersToQuery(
  filters: ConversionChaseFilters
): Record<string, string | null> {
  return {
    q: filters.q.trim() || null,
    wantsBranch: filters.wantsBranch || null,
    wantsRegular: filters.wantsRegular || null,
    outreach: filters.outreach || null,
  };
}

/** Filters as they arrive from a link.
 *
 *  The two closed sets are checked against what the list can actually offer,
 *  because a link can be old, hand-edited or truncated by a chat client, and a
 *  value nothing matches would empty the table while its own control still read
 *  "all". The wanted branch is left alone: branch codes are an open set, so an
 *  unrecognised one is a real branch nobody is asking for any more, and an empty
 *  list is the honest answer. The list folds a value like that back into its
 *  dropdown so the cause stays on screen. */
export function conversionFiltersFromQuery(
  params: URLSearchParams
): ConversionChaseFilters {
  const wantsRegular = params.get("wantsRegular") ?? "";
  const outreach = params.get("outreach") ?? "";
  return {
    q: params.get("q") ?? "",
    wantsBranch: params.get("wantsBranch") ?? "",
    wantsRegular: INTENTION_ORDER.includes(wantsRegular) ? wantsRegular : "",
    outreach: OUTREACH_VALUES.includes(outreach) ? outreach : "",
  };
}

/** The columns the chase table can be ordered by. Anything else in a link is
 *  ignored, so an edited URL falls back to the order the server sent rather
 *  than sorting on a field that is not on screen. */
const SORT_KEYS = [
  "student_name",
  "grade",
  "school",
  "wants_regular",
  "attended_summer",
  "outreach_status",
] as const;

export type ConversionSortKey = (typeof SORT_KEYS)[number];

export interface ConversionSort {
  key: ConversionSortKey | null;
  dir: "asc" | "desc";
}

/** Untouched means the order the report arrived in, which puts the parents who
 *  said Yes to regular at the top. That is already the order to work in, so
 *  nothing is sorted until somebody asks. */
export const DEFAULT_CONVERSION_SORT: ConversionSort = { key: null, dir: "desc" };

export function formatConversionSort(sort: ConversionSort): string {
  return sort.key ? `${sort.key}:${sort.dir}` : "";
}

export function parseConversionSort(raw: string | null | undefined): ConversionSort {
  const [key, dir] = (raw ?? "").split(":");
  if (!(SORT_KEYS as readonly string[]).includes(key)) return DEFAULT_CONVERSION_SORT;
  return { key: key as ConversionSortKey, dir: dir === "asc" ? "asc" : "desc" };
}
