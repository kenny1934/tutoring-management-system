"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { ArrowRight, ArrowUpDown, Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { prospectsAPI } from "@/lib/api";
import { formatProspectCode } from "@/lib/summer-utils";
import { STAGE_TONES } from "@/lib/regular-utils";
import {
  CopyableCell, IntentionBadge, OutreachBadge, INTENTION_LABELS, OUTREACH_OPTIONS,
} from "@/components/summer/prospect-badges";
import { ProspectDetailModal } from "@/components/summer/prospect-detail-modal";
import type { PrimaryProspect, ProspectIntention, ProspectOutreachStatus, RegularConversionResponse } from "@/types";

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

/** Client-side column sort that keeps the server's curated order until the user
 *  clicks a header, then toggles asc/desc on repeat clicks of the same column. */
function useSortable<T>(rows: T[]) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [dir, setDir] = useState<SortDir>("desc");
  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const get = (o: T) => (o as Record<string, unknown>)[sortKey];
    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      let c: number;
      if (typeof av === "number" && typeof bv === "number") c = av - bv;
      else if (typeof av === "boolean" && typeof bv === "boolean") c = (av ? 1 : 0) - (bv ? 1 : 0);
      else c = String(av ?? "").localeCompare(String(bv ?? ""));
      return dir === "asc" ? c : -c;
    });
  }, [rows, sortKey, dir]);
  const onSort = (k: string) => {
    if (sortKey === k) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setDir("desc");
    }
  };
  return { sorted, sortKey, dir, onSort };
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
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50 bg-white/30 dark:bg-white/[0.01] p-4">
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
  const { sorted, sortKey, dir, onSort } = useSortable(data.by_school);
  const hp = { sortKey, dir, onSort };
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
  const { sorted, sortKey, dir, onSort } = useSortable(data.by_tutor);
  const hp = { sortKey, dir, onSort };
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

// The wants-regular ladder, for the filter's option order.
const INTENTION_ORDER = ["Yes", "Considering", "No", "Unknown"];

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

  const [branchFilter, setBranchFilter] = useState("");
  const [wantsFilter, setWantsFilter] = useState("");
  const [outreachFilter, setOutreachFilter] = useState("");

  // Filter options only offer values that actually occur in the list, each
  // in its canonical order.
  const { branchOptions, wantsOptions, outreachOptions } = useMemo(() => {
    const branches = new Set<string>();
    const wants = new Set<string>();
    const outreach = new Set<string | null>();
    for (const r of data.lost_prospects) {
      branches.add(r.source_branch);
      wants.add(r.wants_regular ?? "Unknown");
      outreach.add(r.outreach_status);
    }
    return {
      branchOptions: [...branches].sort(),
      wantsOptions: INTENTION_ORDER.filter((v) => wants.has(v)),
      outreachOptions: OUTREACH_OPTIONS.filter((v) => outreach.has(v)),
    };
  }, [data.lost_prospects]);

  // The prospect code is derived up front so it sorts like any other column.
  const rows = useMemo(
    () =>
      data.lost_prospects
        .filter(
          (r) =>
            (!branchFilter || r.source_branch === branchFilter) &&
            (!wantsFilter || (r.wants_regular ?? "Unknown") === wantsFilter) &&
            (!outreachFilter || r.outreach_status === outreachFilter)
        )
        .map((r) => ({ ...r, code: formatProspectCode(r.source_branch, r.primary_student_id) })),
    [data.lost_prospects, branchFilter, wantsFilter, outreachFilter]
  );
  const { sorted, sortKey, dir, onSort } = useSortable(rows);
  const hp = { sortKey, dir, onSort };

  // In-place modal; prev/next walks the list in its displayed order. Only
  // the id is state — the record derives from the fetched list, so a save's
  // refetch can never leave the open modal on stale fields.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = selectedId != null ? prospectById.get(selectedId) ?? null : null;
  const siblings = useMemo(
    () => sorted.map((r) => prospectById.get(r.prospect_id)).filter(Boolean) as PrimaryProspect[],
    [sorted, prospectById]
  );

  const isFiltered = Boolean(branchFilter || wantsFilter || outreachFilter);

  return (
    <Section
      title={`Still to chase (${data.lost_prospects.length})`}
      subtitle="Prospects with no regular application yet. Click one to record outreach without leaving this page."
    >
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          className={filterSelect}
          aria-label="Filter by branch"
        >
          <option value="">All branches</option>
          {branchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select
          value={wantsFilter}
          onChange={(e) => setWantsFilter(e.target.value)}
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
          value={outreachFilter}
          onChange={(e) => setOutreachFilter(e.target.value)}
          className={filterSelect}
          aria-label="Filter by outreach status"
        >
          <option value="">Outreach: all</option>
          {outreachOptions.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        {isFiltered && (
          <span className="text-xs text-muted-foreground">
            Showing {sorted.length} of {data.lost_prospects.length}
          </span>
        )}
      </div>
      <div className={wrap}>
        <div className={cn(scroll, "max-h-[65vh] overflow-y-auto")}>
          <table className="w-full text-xs min-w-[880px]">
            <thead className={cn(thead, "sticky top-0")}>
              <tr className={theadRow}>
                <SortHeader label="Name" colKey="student_name" className={th} {...hp} />
                <SortHeader label="Code" colKey="code" className={th} {...hp} />
                <SortHeader label="Grade" colKey="grade" className={th} {...hp} />
                <SortHeader label="School" colKey="school" className={th} {...hp} />
                <th className={th}>Phone</th>
                <th className={th}>WeChat</th>
                <SortHeader label="Wants regular" colKey="wants_regular" className={th} {...hp} />
                <SortHeader label="Did summer" colKey="attended_summer" className={th} {...hp} />
                <SortHeader label="Outreach" colKey="outreach_status" className={th} {...hp} />
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
                  <td className="px-3 py-2 font-semibold text-foreground">{r.student_name}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{r.code}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.grade || "-"}</td>
                  <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate" title={r.school || undefined}>{r.school || "-"}</td>
                  <td className="px-3 py-2 tabular-nums text-foreground whitespace-nowrap">
                    <CopyableCell text={r.phone_1 || ""} />
                    {r.phone_2 && (
                      <div className="text-muted-foreground">
                        <CopyableCell text={r.phone_2} />
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-foreground max-w-[140px]">
                    <CopyableCell text={r.wechat_id || ""} />
                  </td>
                  <td className="px-3 py-2">
                    {r.wants_regular
                      ? <IntentionBadge value={r.wants_regular} />
                      : <span className="text-muted-foreground/50">-</span>}
                  </td>
                  <td className="px-3 py-2">
                    {r.attended_summer
                      ? <Check className={cn("h-3.5 w-3.5", STAGE_TONES.didSummer)} aria-label="Did summer" />
                      : <span className="text-muted-foreground/50">-</span>}
                  </td>
                  <td className="px-3 py-2">
                    {r.outreach_status
                      ? <OutreachBadge status={r.outreach_status as ProspectOutreachStatus} />
                      : <span className="text-muted-foreground/50">-</span>}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <EmptyRow span={9}>
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
