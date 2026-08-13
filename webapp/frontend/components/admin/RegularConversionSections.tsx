"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { ArrowRight, ArrowUpDown, Check, ChevronDown, ChevronUp, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { prospectsAPI } from "@/lib/api";
import { formatProspectCode } from "@/lib/summer-utils";
import { STAGE_TONES } from "@/lib/regular-utils";
import { useDebouncedValue } from "@/lib/hooks";
import { currentQuery, useQuerySync } from "@/lib/url-filters";
import {
  CONVERSION_QUERY_KEYS,
  EMPTY_CONVERSION_FILTERS,
  INTENTION_ORDER,
  NO_BRANCH_WANTED,
  UNKNOWN_INTENTION,
  conversionFiltersFromQuery,
  conversionFiltersToQuery,
  filterLostProspects,
  formatConversionSort,
  parseConversionSort,
  type ConversionChaseFilters,
  type ConversionSortKey,
} from "@/lib/conversion-utils";
import {
  BranchBadges, CopyableCell, IntentionBadge, OutreachBadge, StudentCodeBadge,
  INTENTION_LABELS, OUTREACH_OPTIONS,
} from "@/components/summer/prospect-badges";
import { ProspectDetailModal } from "@/components/summer/prospect-detail-modal";
import type {
  PrimaryProspect, ProspectIntention, ProspectOutreachStatus,
  RegularConversionLostRow, RegularConversionResponse,
} from "@/types";

// Shared table styling, matching the funnel table already on the page.
const wrap = "border border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50 rounded-lg overflow-hidden";
const scroll = "overflow-x-auto";
const thead = "bg-[#f0e6d8]/50 dark:bg-[#2a2520]";
const theadRow = "border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30";
const th = "px-3 py-2 text-left font-medium text-foreground";
const thNum = "px-3 py-2 text-right font-medium text-foreground";
const tdNum = "px-3 py-2 text-right tabular-nums";
const rowDivide = "divide-y divide-[#e8d4b8]/30 dark:divide-[#6b5a4a]/30";

/** Whole-number percent, guarding a zero denominator. */
function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "-";
}

function EmptyRow({ span, children }: { span: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={span} className="px-3 py-4 text-center text-muted-foreground italic">{children}</td>
    </tr>
  );
}

type SortDir = "asc" | "desc";

/** Which column a table is ordered by, and which way. One value rather than two
 *  pieces of state, because that is how it travels in a link. */
type Sort<K extends string = string> = { key: K | null; dir: SortDir };

/** Client-side column sort that keeps the server's curated order until the user
 *  clicks a header, then toggles asc/desc on repeat clicks of the same column.
 *
 *  `setSort` comes back out for the chase list, whose order arrives in the URL
 *  and so has to be seeded once the component has mounted. It is the only
 *  reason this is not a closed hook: the toggle rule itself lives here alone,
 *  so the three tables on this page cannot drift apart on what a first click
 *  does. */
function useSortable<T, K extends string = string>(rows: T[]) {
  const [sort, setSort] = useState<Sort<K>>({ key: null, dir: "desc" });
  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    // Numbers and booleans sort as themselves; everything else, including a
    // missing value, goes through localeCompare as a string. No column here
    // counts days or anything else where a null would mean something loud, so
    // an empty string is a fair reading of "we do not know" and it lands at
    // one end.
    const get = (o: T) => (o as Record<string, unknown>)[sort.key as string];
    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      let c: number;
      if (typeof av === "number" && typeof bv === "number") c = av - bv;
      else if (typeof av === "boolean" && typeof bv === "boolean") c = (av ? 1 : 0) - (bv ? 1 : 0);
      else c = String(av ?? "").localeCompare(String(bv ?? ""));
      return sort.dir === "asc" ? c : -c;
    });
  }, [rows, sort]);
  const onSort = (k: string) =>
    setSort((s) =>
      s.key === k
        ? { key: s.key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key: k as K, dir: "desc" }
    );
  return { sorted, sort, setSort, onSort };
}

/** A clickable, sort-aware table header cell. */
function SortHeader({
  label,
  colKey,
  sortKey,
  dir,
  onSort,
  className,
}: {
  label: string;
  colKey: string;
  sortKey: string | null;
  dir: SortDir;
  onSort: (k: string) => void;
  className: string;
}) {
  const active = sortKey === colKey;
  return (
    <th
      className={cn(className, "cursor-pointer select-none")}
      onClick={() => onSort(colKey)}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      title="Sort by this column"
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {active ? (
          dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 text-muted-foreground/40" />
        )}
      </span>
    </th>
  );
}

function Section({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50 bg-white/30 dark:bg-white/[0.01] p-4",
        className
      )}
    >
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="text-xs text-muted-foreground mt-0.5 mb-2">{subtitle}</p>
      {children}
    </section>
  );
}

function IntentionTables({ data }: { data: RegularConversionResponse }) {
  return (
    <Section
      title="Stated intention vs outcome"
      subtitle="How many prospects at each stated intention went on to apply and enrol."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Regular intention -> applied / enrolled regular */}
        <div className={wrap}>
          <div className={scroll}>
            <table className="w-full text-xs min-w-[360px]">
              <thead className={thead}>
                <tr className={theadRow}>
                  <th className={th}>Wants regular</th>
                  <th className={thNum}>Prospects</th>
                  <th className={thNum}>Applied</th>
                  <th className={thNum}>Enrolled</th>
                  <th className={thNum} title="Applied as a share of prospects at this intention">Apply %</th>
                  <th className={thNum} title="Enrolled as a share of prospects at this intention">Enrol %</th>
                </tr>
              </thead>
              <tbody className={rowDivide}>
                {data.by_regular_intention.map((r) => (
                  <tr key={r.intention}>
                    <td className="px-3 py-2 font-medium text-foreground">{r.intention}</td>
                    <td className={tdNum}>{r.prospects}</td>
                    <td className={cn(tdNum, STAGE_TONES.applied)}>{r.applied_regular}</td>
                    <td className={cn(tdNum, STAGE_TONES.enrolled)}>{r.enrolled_regular}</td>
                    <td className={cn(tdNum, "text-muted-foreground")}>{pct(r.applied_regular, r.prospects)}</td>
                    <td className={cn(tdNum, "text-muted-foreground")}>{pct(r.enrolled_regular, r.prospects)}</td>
                  </tr>
                ))}
                {data.by_regular_intention.length === 0 && <EmptyRow span={6}>No prospects.</EmptyRow>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summer intention -> attended summer */}
        <div className={wrap}>
          <div className={scroll}>
            <table className="w-full text-xs min-w-[360px]">
              <thead className={thead}>
                <tr className={theadRow}>
                  <th className={th}>Wants summer</th>
                  <th className={thNum}>Prospects</th>
                  <th className={thNum}>Did summer</th>
                  <th className={thNum} title="Did summer as a share of prospects at this intention">Rate</th>
                </tr>
              </thead>
              <tbody className={rowDivide}>
                {data.by_summer_intention.map((r) => (
                  <tr key={r.intention}>
                    <td className="px-3 py-2 font-medium text-foreground">{r.intention}</td>
                    <td className={tdNum}>{r.prospects}</td>
                    <td className={cn(tdNum, STAGE_TONES.didSummer)}>{r.attended_summer}</td>
                    <td className={cn(tdNum, "text-muted-foreground")}>{pct(r.attended_summer, r.prospects)}</td>
                  </tr>
                ))}
                {data.by_summer_intention.length === 0 && <EmptyRow span={4}>No prospects.</EmptyRow>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Section>
  );
}

function SchoolTable({ data }: { data: RegularConversionResponse }) {
  const { sorted, sort, onSort } = useSortable(data.by_school);
  const hp = { sortKey: sort.key, dir: sort.dir, onSort };
  return (
    <Section title="Feeder schools" subtitle="Which schools the prospects come from, and how far each school converts.">
      <div className={wrap}>
        <div className={cn(scroll, "max-h-72 overflow-y-auto")}>
          <table className="w-full text-xs min-w-[420px]">
            <thead className={cn(thead, "sticky top-0")}>
              <tr className={theadRow}>
                <SortHeader label="School" colKey="school" className={th} {...hp} />
                <SortHeader label="Prospects" colKey="prospects" className={thNum} {...hp} />
                <SortHeader label="Applied" colKey="applied_regular" className={thNum} {...hp} />
                <SortHeader label="Enrolled" colKey="enrolled_regular" className={thNum} {...hp} />
              </tr>
            </thead>
            <tbody className={rowDivide}>
              {sorted.map((r) => (
                <tr key={r.school}>
                  <td className="px-3 py-2 text-foreground max-w-[280px] truncate" title={r.school}>{r.school}</td>
                  <td className={tdNum}>{r.prospects}</td>
                  <td className={cn(tdNum, STAGE_TONES.applied)}>{r.applied_regular}</td>
                  <td className={cn(tdNum, STAGE_TONES.enrolled)}>{r.enrolled_regular}</td>
                </tr>
              ))}
              {sorted.length === 0 && <EmptyRow span={4}>No prospects.</EmptyRow>}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}

function TutorTable({ data }: { data: RegularConversionResponse }) {
  const { sorted, sort, onSort } = useSortable(data.by_tutor);
  const hp = { sortKey: sort.key, dir: sort.dir, onSort };
  return (
    <Section title="By submitting tutor" subtitle="Which P6 tutors bring in prospects that go on to apply and enrol.">
      <div className={wrap}>
        <div className={cn(scroll, "max-h-72 overflow-y-auto")}>
          <table className="w-full text-xs min-w-[460px]">
            <thead className={cn(thead, "sticky top-0")}>
              <tr className={theadRow}>
                <SortHeader label="Branch" colKey="branch" className={th} {...hp} />
                <SortHeader label="Tutor" colKey="tutor_name" className={th} {...hp} />
                <SortHeader label="Prospects" colKey="prospects" className={thNum} {...hp} />
                <SortHeader label="Applied" colKey="applied_regular" className={thNum} {...hp} />
                <SortHeader label="Enrolled" colKey="enrolled_regular" className={thNum} {...hp} />
              </tr>
            </thead>
            <tbody className={rowDivide}>
              {sorted.map((r, i) => (
                <tr key={`${r.branch}-${r.tutor_name}-${i}`}>
                  <td className="px-3 py-2 font-semibold text-foreground">{r.branch}</td>
                  <td className={cn("px-3 py-2", r.tutor_name === "Unattributed" ? "text-muted-foreground italic" : "text-foreground")}>{r.tutor_name}</td>
                  <td className={tdNum}>{r.prospects}</td>
                  <td className={cn(tdNum, STAGE_TONES.applied)}>{r.applied_regular}</td>
                  <td className={cn(tdNum, STAGE_TONES.enrolled)}>{r.enrolled_regular}</td>
                </tr>
              ))}
              {sorted.length === 0 && <EmptyRow span={5}>No prospects.</EmptyRow>}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}

function MovementTable({ data }: { data: RegularConversionResponse }) {
  // A crossing is a concrete named branch that differs from where they enrolled.
  const isCrossing = (wanted: string, enrolled: string) =>
    wanted !== "None" && wanted !== enrolled && enrolled !== "Unknown";
  // Summary over prospects who named a branch (exclude the "None" bucket).
  const named = data.branch_movement.filter((r) => r.wanted_branch !== "None");
  const namedTotal = named.reduce((s, r) => s + r.count, 0);
  const crossed = named
    .filter((r) => isCrossing(r.wanted_branch, r.enrolled_branch))
    .reduce((s, r) => s + r.count, 0);
  const matched = namedTotal - crossed;
  return (
    <Section
      title="Branch preference vs where they enrolled"
      subtitle="Enrolled prospects by the branch they named against the branch they actually joined. Highlighted rows crossed to a branch they did not name."
    >
      {namedTotal > 0 && (
        <p className="text-xs text-muted-foreground mb-2">
          <span className="font-semibold text-foreground">{matched}</span> of {namedTotal} landed at a branch they named
          {crossed > 0 && (
            <>
              {" · "}
              <span className="font-semibold text-amber-700 dark:text-amber-400">{crossed}</span> crossed elsewhere
            </>
          )}
        </p>
      )}
      <div className={wrap}>
        <div className={scroll}>
          <table className="w-full text-xs min-w-[360px]">
            <thead className={thead}>
              <tr className={theadRow}>
                <th className={th}>Wanted</th>
                <th className="px-1 py-2" aria-hidden />
                <th className={th}>Enrolled at</th>
                <th className={thNum}>Students</th>
              </tr>
            </thead>
            <tbody className={rowDivide}>
              {data.branch_movement.map((r, i) => {
                const crossing = isCrossing(r.wanted_branch, r.enrolled_branch);
                return (
                  <tr key={`${r.wanted_branch}-${r.enrolled_branch}-${i}`} className={crossing ? "bg-amber-50/60 dark:bg-amber-900/15" : ""}>
                    <td className="px-3 py-2 font-medium text-foreground">{r.wanted_branch}</td>
                    <td className="px-1 py-2 text-muted-foreground"><ArrowRight className="h-3 w-3" /></td>
                    <td className={cn("px-3 py-2 font-medium", crossing ? "text-amber-700 dark:text-amber-400" : "text-foreground")}>{r.enrolled_branch}</td>
                    <td className={tdNum}>{r.count}</td>
                  </tr>
                );
              })}
              {data.branch_movement.length === 0 && <EmptyRow span={4}>No enrolled prospects yet.</EmptyRow>}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}

// Native select styling for the chase-list filters, sized to the table text.
const filterSelect =
  "text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30";

// Tighter header padding than the shared `th`, matching the chase table's
// px-2 cells.
const thTight = cn(th, "px-2");

/** The analysis tab: stated intention vs outcome, branch preference vs where
 *  they landed, and the feeder-school / submitting-tutor pair side by side on
 *  wide screens. */
export function RegularConversionBreakdowns({ data }: { data: RegularConversionResponse }) {
  return (
    <>
      <IntentionTables data={data} />
      <MovementTable data={data} />
      <div className="grid gap-6 xl:grid-cols-2 items-start">
        <SchoolTable data={data} />
        <TutorTable data={data} />
      </div>
    </>
  );
}

/** The still-to-chase tab: contact columns, filters, and an in-place detail
 *  modal so working the list never leaves the page. */
export function RegularConversionChaseList({
  data,
  readOnly,
  onChanged,
}: {
  data: RegularConversionResponse;
  readOnly: boolean;
  onChanged: () => void;
}) {
  // Full prospect records back the in-place modal. Fetched when this tab
  // first mounts, so the other tabs never pay for it. regular_state "none"
  // is exactly the chase list's own predicate (no linked regular
  // application), so the fetch skips every prospect who already applied.
  // Tab flips remount this component; the cached list is served as-is
  // rather than refetched, and saves refresh it through mutate below.
  const { data: prospects, mutate: mutateProspects } = useSWR(
    ["conversion-chase-prospects", data.year],
    () => prospectsAPI.adminList({ year: data.year, regular_state: "none" }),
    { revalidateIfStale: false }
  );
  const prospectById = useMemo(
    () => new Map((prospects ?? []).map((p) => [p.id, p])),
    [prospects]
  );

  const [filters, setFilters] = useState<ConversionChaseFilters>(EMPTY_CONVERSION_FILTERS);
  const [restored, setRestored] = useState(false);
  const set = <K extends keyof ConversionChaseFilters>(key: K, value: ConversionChaseFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const rows = useMemo(
    () => filterLostProspects(data.lost_prospects, filters),
    [data.lost_prospects, filters]
  );
  const { sorted, sort, setSort, onSort } = useSortable<
    RegularConversionLostRow,
    ConversionSortKey
  >(rows);
  const hp = { sortKey: sort.key, dir: sort.dir, onSort };

  // Read on mount rather than in useState, so the server's HTML and the
  // browser's first paint agree and hydration stays quiet. Switching tabs
  // unmounts this list, so this is also what brings a narrowed list back when
  // you come to it from the overview.
  useEffect(() => {
    const params = currentQuery();
    setFilters(conversionFiltersFromQuery(params));
    setSort(parseConversionSort(params.get("sort")));
    setRestored(true);
  }, [setSort]);

  // A narrowed list is worth handing to whoever is making the calls, and the
  // way you hand over a browser view is to hand over its URL. Nothing is
  // written until the read above has happened, or the defaults would wipe the
  // link that was just followed. The search box waits for a pause in the
  // typing, since every write is a navigation and a name is a dozen of them.
  const settledQuery = useDebouncedValue(filters.q, 300);
  useQuerySync(
    {
      ...conversionFiltersToQuery({ ...filters, q: settledQuery }),
      sort: formatConversionSort(sort) || null,
    },
    restored
  );

  // Filter options only offer values that actually occur in the list, each in
  // its canonical order.
  const { wantedOptions, hasNoWanted, wantsOptions, outreachOptions } = useMemo(() => {
    const wanted = new Set<string>();
    let noWanted = filters.wantsBranch === NO_BRANCH_WANTED;
    const wants = new Set<string>();
    const outreach = new Set<string | null>();
    for (const r of data.lost_prospects) {
      if (r.preferred_branches.length === 0) noWanted = true;
      for (const b of r.preferred_branches) wanted.add(b);
      wants.add(r.wants_regular ?? UNKNOWN_INTENTION);
      outreach.add(r.outreach_status);
    }
    // Whatever is being filtered by stays on its own dropdown even when this
    // slice of the report holds nobody with that value, which is what a link
    // from a colleague can easily arrive as. Without this the control would
    // read "all" while the table sat empty underneath it, and the reason for
    // the empty table would be nowhere on screen.
    if (filters.wantsBranch && filters.wantsBranch !== NO_BRANCH_WANTED) {
      wanted.add(filters.wantsBranch);
    }
    if (filters.wantsRegular) wants.add(filters.wantsRegular);
    if (filters.outreach) outreach.add(filters.outreach);
    return {
      wantedOptions: [...wanted].sort(),
      hasNoWanted: noWanted,
      wantsOptions: INTENTION_ORDER.filter((v) => wants.has(v)),
      outreachOptions: OUTREACH_OPTIONS.filter((v) => outreach.has(v)),
    };
  }, [data.lost_prospects, filters.wantsBranch, filters.wantsRegular, filters.outreach]);

  // In-place modal; prev/next walks the list in its displayed order. Only
  // the id is state — the record derives from the fetched list, so a save's
  // refetch can never leave the open modal on stale fields.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = selectedId != null ? prospectById.get(selectedId) ?? null : null;
  const siblings = useMemo(
    () => sorted.map((r) => prospectById.get(r.prospect_id)).filter(Boolean) as PrimaryProspect[],
    [sorted, prospectById]
  );

  const isFiltered = CONVERSION_QUERY_KEYS.some((k) => filters[k] !== EMPTY_CONVERSION_FILTERS[k]);

  return (
    <Section
      title={`Still to chase (${data.lost_prospects.length})`}
      subtitle="Prospects with no regular application yet. Click one to record outreach without leaving this page."
      className="flex-1 min-h-0 flex flex-col"
    >
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {/* Looking one family up is the thing done constantly, so it leads the
            row and takes the whole width on a phone. The field is w-56 rather
            than w-52 because the hint runs to about 165px and the icon eats
            another 28px, so anything narrower cut it off mid-word. */}
        <div className="relative w-full sm:w-56">
          <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={filters.q}
            onChange={(e) => set("q", e.target.value)}
            placeholder="Name, code, phone or school"
            aria-label="Search this list"
            className={cn(filterSelect, "pl-7 w-full")}
          />
        </div>
        <select
          value={filters.wantsBranch}
          onChange={(e) => set("wantsBranch", e.target.value)}
          className={filterSelect}
          aria-label="Filter by the branch the prospect wants"
        >
          <option value="">Wants branch: all</option>
          {wantedOptions.map((b) => <option key={b} value={b}>{b}</option>)}
          {hasNoWanted && <option value={NO_BRANCH_WANTED}>Not specified</option>}
        </select>
        <select
          value={filters.wantsRegular}
          onChange={(e) => set("wantsRegular", e.target.value)}
          className={filterSelect}
          aria-label="Filter by regular intention"
        >
          <option value="">Wants regular: all</option>
          {wantsOptions.map((v) => (
            <option key={v} value={v}>
              {INTENTION_LABELS[v as ProspectIntention] ?? v}
            </option>
          ))}
        </select>
        <select
          value={filters.outreach}
          onChange={(e) => set("outreach", e.target.value)}
          className={filterSelect}
          aria-label="Filter by outreach status"
        >
          <option value="">Outreach: all</option>
          {outreachOptions.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        {isFiltered && (
          <>
            <span className="text-xs text-muted-foreground tabular-nums">
              Showing {sorted.length} of {data.lost_prospects.length}
            </span>
            {/* This list can now arrive already narrowed by somebody else's
                link, so there has to be a way back to the whole of it that is
                not clearing four controls one at a time. */}
            <button
              type="button"
              onClick={() => setFilters(EMPTY_CONVERSION_FILTERS)}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Reset
            </button>
          </>
        )}
      </div>
      <div className={cn(wrap, "flex-1 min-h-0 flex flex-col")}>
        <div className={cn(scroll, "flex-1 min-h-0 overflow-y-auto")}>
          <table className="w-full text-xs min-w-[720px]">
            <thead className={cn(thead, "sticky top-0")}>
              <tr className={theadRow}>
                <SortHeader label="Name" colKey="student_name" className={thTight} {...hp} />
                <SortHeader label="Grade" colKey="grade" className={thTight} {...hp} />
                <SortHeader label="School" colKey="school" className={thTight} {...hp} />
                <th className={thTight}>Contact</th>
                <SortHeader label="Wants" colKey="wants_regular" className={thTight} {...hp} />
                <SortHeader label="Did summer" colKey="attended_summer" className={thTight} {...hp} />
                <SortHeader label="Outreach" colKey="outreach_status" className={thTight} {...hp} />
              </tr>
            </thead>
            <tbody className={rowDivide}>
              {sorted.map((r) => (
                <tr
                  key={r.prospect_id}
                  className={cn("hover:bg-primary/[0.04]", prospectById.size > 0 && "cursor-pointer")}
                  onClick={() => {
                    if (prospectById.has(r.prospect_id)) setSelectedId(r.prospect_id);
                  }}
                >
                  <td className="px-2 py-2">
                    <div className="font-semibold text-foreground whitespace-nowrap">
                      {r.student_name}
                      {r.summer_student_code && (
                        <span className="ml-1.5 align-middle">
                          <StudentCodeBadge code={r.summer_student_code} />
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground">
                      {formatProspectCode(r.source_branch, r.primary_student_id)}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">{r.grade || "-"}</td>
                  <td className="px-2 py-2 text-muted-foreground max-w-[160px] truncate" title={r.school || undefined}>{r.school || "-"}</td>
                  <td className="px-2 py-2">
                    <div className="tabular-nums text-foreground"><CopyableCell text={r.phone_1 || ""} /></div>
                    {r.phone_2 && (
                      <div className="tabular-nums text-muted-foreground"><CopyableCell text={r.phone_2} /></div>
                    )}
                    {r.wechat_id && (
                      <div className="text-muted-foreground max-w-[150px]">
                        <CopyableCell text={r.wechat_id} title={`WeChat: ${r.wechat_id}`} />
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <span className="flex items-center gap-1 flex-wrap">
                      {r.wants_regular
                        ? <IntentionBadge value={r.wants_regular} />
                        : <span className="text-muted-foreground/50">-</span>}
                      {r.preferred_branches.length > 0 && <BranchBadges branches={r.preferred_branches} />}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    {r.attended_summer
                      ? <Check className={cn("h-3.5 w-3.5", STAGE_TONES.didSummer)} aria-label="Did summer" />
                      : <span className="text-muted-foreground/50">-</span>}
                  </td>
                  <td className="px-2 py-2">
                    {r.outreach_status
                      ? <OutreachBadge status={r.outreach_status as ProspectOutreachStatus} />
                      : <span className="text-muted-foreground/50">-</span>}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <EmptyRow span={7}>
                  {isFiltered ? "No prospects match these filters." : "Every prospect has a regular application."}
                </EmptyRow>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {selected && (
        <ProspectDetailModal
          prospect={selected}
          onClose={() => setSelectedId(null)}
          onSave={() => { mutateProspects(); onChanged(); }}
          siblings={siblings}
          onNavigate={(p) => setSelectedId(p.id)}
          readOnly={readOnly}
        />
      )}
    </Section>
  );
}
