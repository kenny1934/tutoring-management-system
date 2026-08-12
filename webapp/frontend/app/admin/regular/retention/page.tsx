"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { regularAPI } from "@/lib/api";
import { AlertTriangle, ChevronDown, Download, Link2, Loader2, Users } from "lucide-react";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import {
  RegularRetentionBreakdowns,
  RegularRetentionChaseList,
  StudentLink,
} from "@/components/admin/RegularRetentionSections";
import { RegularRetentionTrend } from "@/components/admin/RegularRetentionTrend";
import { RegularLinkSuggestionsModal } from "@/components/admin/RegularLinkSuggestionsModal";
import { currentQuery, useQuerySync } from "@/lib/url-filters";
import type { RegularRetentionResponse, RegularRetentionRow } from "@/types";

const selectClass = "px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card text-foreground";

/** The intake at a glance, the analysis axes, and the list staff actually work. */
type RetentionTab = "overview" | "breakdowns" | "chase";

const RETENTION_TABS: RetentionTab[] = ["overview", "breakdowns", "chase"];

/** Whole-number percent, guarding a zero denominator. */
function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "-";
}

/** Quote a CSV cell only when it contains a comma, quote, or newline. */
function csvCell(v: string | number | null | undefined | boolean): string {
  const s = typeof v === "boolean" ? (v ? "Yes" : "") : String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Flatten the whole report into one CSV with a titled block per axis. */
function buildRetentionCsv(data: RegularRetentionResponse): string {
  const rows: (string | number | null | undefined | boolean)[][] = [];
  const axisHeader = [
    "Key", "Students", "Applied", "Enrolled", "Not returning", "Contacted",
    "No response", "No response contacted", "Apply %",
  ];
  const axisLine = (r: RegularRetentionRow) => [
    r.label ?? r.key, r.cohort, r.applied, r.enrolled, r.declined, r.contacted,
    r.no_response, r.no_response_contacted, pct(r.applied, r.cohort),
  ];

  const block = (title: string, axis: RegularRetentionRow[]) => {
    rows.push([title]);
    rows.push(axisHeader);
    axis.forEach((r) => rows.push(axisLine(r)));
    rows.push([]);
  };

  rows.push(["Retention overall"]);
  rows.push(axisHeader);
  rows.push(axisLine(data.totals));
  rows.push([]);

  // The groups held out of the rate, named rather than counted, so a reader
  // can reconcile the total against the centre's own headcount and see who.
  rows.push(["Students we are not counting"]);
  rows.push(["Code", "Student", "Branch", "Why"]);
  data.chase
    .filter((r) => r.state === "not_churn")
    .forEach((r) =>
      rows.push([r.student_code, r.student_name, r.branch, "Moved branch or finished school"])
    );
  data.chase
    .filter((r) => r.rung === "none" && r.state !== "not_churn")
    .forEach((r) =>
      rows.push([
        r.student_code, r.student_name, r.branch,
        `No class at ${r.expected_grade ?? "their entering grade"}`,
      ])
    );
  data.reconciliation.applied_outside.forEach((r) =>
    rows.push([
      r.student_code, r.student_name, r.branch,
      `Applied for ${r.applied_grade ?? "a place"} but was not with us last year`,
    ])
  );
  rows.push([]);

  block("By branch", data.by_branch);
  block("By entering grade", data.by_expected_grade);
  block("By source", data.by_source);
  block("By tutor", data.by_tutor);

  rows.push(["Not returning reason", "Students"]);
  data.by_decline_reason.forEach((r) => rows.push([r.key, r.declined]));
  rows.push([]);

  // Day by day, so the intake curve can be replotted outside the app.
  rows.push(["Day by day"]);
  rows.push([
    "Date", "Applications", "Contacts", "Not returning",
    "Applications total", "Contacts total", "Not returning total",
  ]);
  data.trend.forEach((p) =>
    rows.push([
      p.date, p.applied, p.contacted, p.declined,
      p.applied_total, p.contacted_total, p.declined_total,
    ])
  );
  rows.push([]);

  rows.push([
    "Student", "Code", "Branch", "Grade now", "Entering", "Rung", "Stream", "School",
    "Phone", "Tutor", "Source", "On prospect board", "State", "Reference",
    "Last contact", "Days since", "Follow up", "Not returning reason", "Last note",
  ]);
  data.chase.forEach((r) =>
    rows.push([
      r.student_name, r.student_code, r.branch, r.grade, r.expected_grade, r.rung,
      r.lang_stream, r.school, r.phone, r.tutor_name, r.source, r.on_prospect_board,
      r.state, r.reference_code, r.last_contact_date, r.days_since_contact,
      r.follow_up_date, r.decline_reason_category, r.last_contact_note,
    ])
  );

  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/** A headline metric card in the summary strip above the funnel. */
function KpiCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 bg-white/40 dark:bg-white/[0.02] px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-xl font-semibold tabular-nums leading-tight mt-0.5", tone ?? "text-foreground")}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">{sub}</div>}
    </div>
  );
}

/** The cohort split into what actually happened to it.
 *
 *  Not a nested funnel like the conversion board's: these are four terminal
 *  outcomes of one cohort, so the bars are a single stacked row that sums to
 *  the whole. Enrolled sits inside applied, which is why applied is drawn as
 *  the remainder rather than its own total. */
function OutcomeBar({ totals }: { totals: RegularRetentionRow }) {
  const base = totals.cohort || 1;
  const appliedNotEnrolled = Math.max(0, totals.applied - totals.enrolled);
  const segments = [
    { label: "Enrolled", value: totals.enrolled, fill: "bg-purple-500" },
    { label: "Applied", value: appliedNotEnrolled, fill: "bg-indigo-500" },
    { label: "Not returning", value: totals.declined, fill: "bg-rose-500" },
    { label: "No response", value: totals.no_response, fill: "bg-amber-400 dark:bg-amber-500" },
  ].filter((s) => s.value > 0);

  return (
    <div className="border border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50 rounded-xl bg-white/30 dark:bg-white/[0.01] p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-foreground">Where these students stand</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          This is every student we taught last year or this summer, and what we know about
          each of them now.
        </p>
      </div>

      {/* A year with no data would draw an empty bar and four zeroes, which
          reads as a broken chart rather than an empty one. */}
      {totals.cohort === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          We taught nobody in the year before this intake, so there is nobody to follow up
          yet.
        </p>
      ) : (
        <>
          {/* Widths are grown from the counts rather than set outright, so a
              three-in-eight-hundred outcome still shows as a sliver instead of
              rounding away to nothing. */}
          <div className="flex h-7 rounded overflow-hidden bg-[#f0e6d8]/40 dark:bg-[#2a2520]">
            {segments.map((s) => (
              <div
                key={s.label}
                role="img"
                aria-label={`${s.label}: ${s.value} of ${base} (${pct(s.value, base)})`}
                className={cn("h-full", s.fill)}
                style={{ flexGrow: s.value, flexBasis: 0, minWidth: "0.35rem" }}
                title={`${s.label}: ${s.value} (${pct(s.value, base)})`}
              />
            ))}
          </div>

          {/* Labelled legend, so colour is never the only cue. */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
            {segments.map((s) => (
              <div key={s.label} className="flex items-center gap-1.5 text-xs">
                <span className={cn("h-2 w-2 rounded-sm shrink-0", s.fill)} />
                <span className="text-foreground">{s.label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {s.value} · {pct(s.value, base)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** The students behind one of the held-out counts, named.
 *
 *  Each of these groups is small by construction, and every member of one has
 *  their own story: a count says two students are not being chased, a pair of
 *  names says both are leaving for sixth form. Scrolls rather than truncating,
 *  so a bad year cannot hide anyone.
 *
 *  Fixed column widths, because the groups sit one under the other and three
 *  tables that size themselves independently read as three ragged lists
 *  rather than one panel. */
function OutsideTable({
  rows,
}: {
  rows: {
    row: { student_id: number; student_name: string };
    code?: string | null;
    detail?: string;
  }[];
}) {
  return (
    <div className="mt-1.5 max-h-40 overflow-y-auto rounded-lg border border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50">
      <table className="w-full text-[11px] table-fixed">
        <colgroup>
          <col className="w-24" />
          <col />
          <col className="w-1/3" />
        </colgroup>
        <tbody className="divide-y divide-[#e8d4b8]/30 dark:divide-[#6b5a4a]/30">
          {rows.map(({ row, code, detail }) => (
            <tr key={row.student_id} className="hover:bg-[#f0e6d8]/30 dark:hover:bg-[#2a2520]/50">
              {/* Code first: it is the fixed-width column, and it is what
                  staff search the office system by. */}
              <td className="px-2.5 py-1.5 text-muted-foreground whitespace-nowrap">
                {code ?? ""}
              </td>
              <td className="px-2.5 py-1.5 truncate">
                <StudentLink row={row} className="text-foreground font-medium" />
              </td>
              <td className="px-2.5 py-1.5 text-muted-foreground truncate">{detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The two branches side by side, which is a difference big enough to act on
 *  and was previously two tabs deep. Each card filters the board to itself. */
function BranchCompare({
  rows,
  onPick,
}: {
  rows: RegularRetentionRow[];
  onPick: (branch: string) => void;
}) {
  const best = Math.max(...rows.map((r) => (r.cohort > 0 ? r.applied / r.cohort : 0)));

  return (
    <div className="border border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50 rounded-xl bg-white/30 dark:bg-white/[0.01] p-4">
      <h2 className="text-sm font-semibold text-foreground">How the branches compare</h2>
      <p className="text-xs text-muted-foreground mt-0.5">
        Each branch is measured against its own students, not against the whole centre.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 mt-3">
        {rows.map((r) => {
          const rate = r.cohort > 0 ? r.applied / r.cohort : 0;
          const leads = rows.length > 1 && rate === best && best > 0;
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => onPick(r.key)}
              title={`Show only ${r.label ?? r.key}`}
              className="text-left rounded-lg border border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 bg-white/40 dark:bg-white/[0.02] px-3 py-2.5 hover:border-[#a0704b]/60 transition-colors"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{r.label ?? r.key}</span>
                <span className="text-lg font-semibold tabular-nums text-indigo-600 dark:text-indigo-400">
                  {pct(r.applied, r.cohort)}
                </span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-[#f0e6d8]/60 dark:bg-[#2a2520] overflow-hidden">
                <div
                  className={cn("h-full rounded-full", leads ? "bg-indigo-500" : "bg-indigo-400/70")}
                  style={{ width: `${Math.round(rate * 100)}%` }}
                />
              </div>
              {/* A caption under the number, so it stays a label. */}
              <div className="text-[11px] text-muted-foreground tabular-nums mt-1.5">
                {r.applied} of {r.cohort} applied
                {r.no_response > 0 && ` · ${r.no_response} still to chase`}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function RegularRetentionPage() {
  usePageTitle("Regular Retention");
  const { canViewAdminPages, isReadOnly, user } = useAuth();
  const [year, setYear] = useState<number | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [tab, setTab] = useState<RetentionTab>("overview");
  // Branch options come from the unfiltered view and persist while a single
  // branch is selected, so the dropdown never collapses to one option.
  const [branchOptions, setBranchOptions] = useState<string[]>([]);
  const [linkingOpen, setLinkingOpen] = useState(false);
  const [restored, setRestored] = useState(false);

  // Which year, which branch and which tab all belong in the link, so that
  // "the MSB list, for this September" is something you can send to somebody.
  // Read after mounting rather than during the first render, which keeps the
  // server's HTML and the browser's first paint identical.
  useEffect(() => {
    const params = currentQuery();
    const tabParam = params.get("tab");
    if (RETENTION_TABS.includes(tabParam as RetentionTab)) setTab(tabParam as RetentionTab);
    const yearParam = Number(params.get("year"));
    if (Number.isInteger(yearParam) && yearParam > 2000) setYear(yearParam);
    const branchParam = params.get("branch");
    if (branchParam) setBranch(branchParam);
    setRestored(true);
  }, []);

  useQuerySync(
    {
      tab: tab === "overview" ? null : tab,
      year: year == null ? null : String(year),
      branch,
    },
    restored
  );

  const { data: configs } = useSWR(
    canViewAdminPages ? "regular-configs" : null,
    () => regularAPI.getConfigs()
  );

  useEffect(() => {
    if (configs && configs.length > 0 && year === null) {
      const active = configs.find((c) => c.is_active);
      setYear(active?.year ?? configs[0].year);
    }
  }, [configs, year]);

  const years = useMemo(
    () => Array.from(new Set((configs ?? []).map((c) => c.year))).sort((a, b) => b - a),
    [configs]
  );

  // The report is a few hundred KB and about 600ms of database work, and it
  // only changes when somebody logs a contact or marks a family as leaving.
  // Both of those already call mutate(), so refetching every time the window
  // regains focus bought nothing and cost a query per tab switch.
  const { data, isLoading, mutate } = useSWR(
    year != null ? ["regular-retention", year, branch] : null,
    () => regularAPI.getRetention(year!, branch),
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    if (data && branch === null) setBranchOptions(data.by_branch.map((b) => b.key));
  }, [data, branch]);

  // A link that arrives already narrowed to one branch has never seen the
  // unfiltered report, so the only branch it knows about is its own. The
  // chosen one is folded in and "All branches" is always on the menu, so
  // whoever opened the link can always get back to the whole centre.
  const branchChoices = useMemo(
    () => [...new Set([...branchOptions, ...(branch ? [branch] : [])])].sort(),
    [branchOptions, branch]
  );

  const handleExport = () => {
    if (!data) return;
    const BOM = String.fromCharCode(0xfeff); // so Excel reads the UTF-8 file
    const csv = BOM + buildRetentionCsv(data);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `retention-${year}${branch ? `-${branch}` : ""}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const noResponse = data?.totals.no_response ?? 0;

  // Both groups are already in the chase payload, held out of the totals but
  // never named on the overview until now.
  const notChurnRows = useMemo(
    () => (data?.chase ?? []).filter((r) => r.state === "not_churn"),
    [data]
  );
  const noRungRows = useMemo(
    () => (data?.chase ?? []).filter((r) => r.rung === "none" && r.state !== "not_churn"),
    [data]
  );
  const configId = useMemo(
    () => configs?.find((c) => c.year === year)?.id ?? null,
    [configs, year]
  );

  if (!canViewAdminPages) {
    return (
      <DeskSurface fullHeight>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          You do not have access to this page.
        </div>
      </DeskSurface>
    );
  }

  return (
    <DeskSurface fullHeight>
      <PageTransition className="flex flex-col h-full p-4 sm:p-6">
        <div className="flex flex-col h-full bg-[#faf8f5] dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-sm paper-texture overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <div className="w-9 h-9 shrink-0 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                <Users className="h-5 w-5 text-sky-600 dark:text-sky-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-base sm:text-lg font-semibold text-foreground">Retention</h1>
                <p className="hidden sm:block text-xs text-muted-foreground">
                  Have the students we already teach applied for this September?
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                {(branchChoices.length > 1 || branch !== null) && (
                  <DropdownMenu
                    align="right"
                    trigger={({ triggerProps }) => (
                      <button
                        type="button"
                        {...triggerProps}
                        title="Every tab on this page, including the chase list, follows this"
                        className={cn(selectClass, "inline-flex items-center gap-1.5")}
                      >
                        <span className="font-medium">{branch ?? "All branches"}</span>
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    )}
                  >
                    {(close) => (
                      <div className="py-1">
                        <button
                          type="button"
                          onClick={() => { setBranch(null); close(); }}
                          className={cn(
                            "w-full text-left px-3 py-1.5 text-sm hover:bg-primary/10",
                            branch === null && "font-semibold text-primary"
                          )}
                        >
                          All branches
                        </button>
                        {branchChoices.map((b) => (
                          <button
                            key={b}
                            type="button"
                            onClick={() => { setBranch(b); close(); }}
                            className={cn(
                              "w-full text-left px-3 py-1.5 text-sm hover:bg-primary/10",
                              b === branch && "font-semibold text-primary"
                            )}
                          >
                            {b}
                          </button>
                        ))}
                      </div>
                    )}
                  </DropdownMenu>
                )}
                <DropdownMenu
                  align="right"
                  trigger={({ triggerProps }) => (
                    <button type="button" {...triggerProps} className={cn(selectClass, "inline-flex items-center gap-1.5")}>
                      <span className="font-medium">{year ?? "Year"}</span>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  )}
                >
                  {(close) => (
                    <div className="py-1">
                      {years.map((y) => (
                        <button
                          key={y}
                          type="button"
                          onClick={() => { setYear(y); setBranch(null); close(); }}
                          className={cn(
                            "w-full text-left px-3 py-1.5 text-sm hover:bg-primary/10",
                            y === year && "font-semibold text-primary"
                          )}
                        >
                          {y}
                        </button>
                      ))}
                    </div>
                  )}
                </DropdownMenu>
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={!data || data.totals.cohort === 0}
                  className={cn(selectClass, "inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed")}
                  title="Download this report as CSV"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Export</span>
                </button>
              </div>
            </div>
          </div>

          {/* Tab bar */}
          <div className="px-4 sm:px-6 py-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
            <div className="inline-flex bg-muted rounded-full p-0.5">
              {([
                { key: "overview", label: "Overview" },
                { key: "breakdowns", label: "Breakdowns" },
                { key: "chase", label: `To chase${data ? ` (${noResponse})` : ""}` },
              ] as { key: RetentionTab; label: string }[]).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-full transition-all duration-200",
                    tab === t.key
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          {isLoading || !data ? (
            <div className="flex items-center justify-center flex-1 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div
              className={cn(
                "flex-1 min-h-0 p-4 sm:p-6",
                // The chase tab sizes its table to the space and scrolls inside
                // it; the other tabs scroll the body as one page.
                tab === "chase" ? "flex flex-col overflow-hidden" : "overflow-auto space-y-6"
              )}
            >
              {tab === "overview" && (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* These captions are labels under a number, not prose, so
                        they stay short and take no full stop. The sentences
                        live in the panels below. */}
                    <KpiCard
                      // Not "here at the end of last year": a good third of
                      // them came through the summer course instead.
                      label="Students"
                      value={String(data.totals.cohort)}
                      sub="taught last year or this summer"
                    />
                    <KpiCard
                      label="Applied"
                      value={String(data.totals.applied)}
                      sub={
                        data.totals.applied > 0
                          ? `${pct(data.totals.applied, data.totals.cohort)} of them`
                          : "none yet"
                      }
                      tone="text-indigo-600 dark:text-indigo-400"
                    />
                    <KpiCard
                      label="Not returning"
                      value={String(data.totals.declined)}
                      // A caption written for the usual case reads as nonsense
                      // under a zero, and on day one they are all zero.
                      sub={
                        data.totals.declined > 0 ? "told us they are leaving" : "none so far"
                      }
                      tone="text-rose-600 dark:text-rose-400"
                    />
                    <KpiCard
                      label="No response"
                      value={String(noResponse)}
                      // Scoped to the unresponsive: under this heading a
                      // centre-wide figure reads as "of these, N were called".
                      sub={
                        noResponse === 0
                          ? "everybody has answered"
                          : data.totals.no_response_contacted > 0
                            ? `${data.totals.no_response_contacted} of them contacted`
                            : "none contacted yet"
                      }
                      tone="text-amber-700 dark:text-amber-400"
                    />
                  </div>

                  {/* Unlinked applications first: until these are cleared, some
                      of the students below have applied and would be chased
                      anyway. */}
                  {data.reconciliation.unlinked_secondary > 0 && (
                    <div className="flex items-start gap-2 rounded-lg border border-sky-300/70 dark:border-sky-700/50 bg-sky-50/70 dark:bg-sky-900/15 px-3 py-2 text-xs text-sky-900 dark:text-sky-300">
                      <Link2 className="h-4 w-4 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <span className="font-medium">
                          {data.reconciliation.unlinked_secondary === 1
                            ? "One application has not been matched to a student record."
                            : `${data.reconciliation.unlinked_secondary} applications have not been matched to a student record.`}
                        </span>
                        <p className="text-sky-800/80 dark:text-sky-400/80 mt-0.5">
                          Each of them says the student already studies here, so some of them
                          are being counted below as having given us no answer. Matching them
                          settles the numbers.
                        </p>
                      </div>
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() => setLinkingOpen(true)}
                          className="shrink-0 underline font-medium hover:no-underline"
                        >
                          Match now
                        </button>
                      )}
                    </div>
                  )}

                  {noResponse > 0 && (
                    <button
                      type="button"
                      onClick={() => setTab("chase")}
                      className="w-full flex items-center gap-2 rounded-lg border border-amber-300/70 dark:border-amber-700/50 bg-amber-50/70 dark:bg-amber-900/15 px-3 py-2 text-left text-xs text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/25 transition-colors"
                    >
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span className="font-medium">
                        {noResponse === 1
                          ? "One student has not applied and has not answered."
                          : `${noResponse} students have not applied and have not answered.`}
                      </span>
                      <span className="ml-auto underline shrink-0">View the list</span>
                    </button>
                  )}

                  <OutcomeBar totals={data.totals} />

                  <RegularRetentionTrend data={data} />

                  {/* Only worth the space when there is something to compare:
                      one branch is already the whole board above. */}
                  {data.by_branch.length > 1 && (
                    <BranchCompare rows={data.by_branch} onPick={setBranch} />
                  )}

                  {/* Nothing has been published for the new year yet, which
                      reads as a broken chart rather than an empty one unless
                      the page says so. */}
                  {data.totals.applied > 0 && data.totals.enrolled === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No places have been confirmed yet. An application becomes an enrolment
                      when you publish it from the arrangement page.
                    </p>
                  )}

                  {/* Everything held out of the rate. Without these lines the
                      total just looks smaller than the centre is and nobody
                      can tell why, and without the names nobody can act on
                      any of it. */}
                  {(notChurnRows.length > 0 ||
                    noRungRows.length > 0 ||
                    data.reconciliation.applied_outside.length > 0) && (
                    <div className="rounded-lg border border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 bg-white/40 dark:bg-white/[0.02] px-3 py-2.5 space-y-3">
                      <div className="text-xs font-medium text-foreground">
                        Students we are not counting
                      </div>

                      {notChurnRows.length > 0 && (
                        <div>
                          <p className="text-[11px] text-muted-foreground">
                            {notChurnRows.length === 1
                              ? "One student has left for a reason that was never our loss."
                              : `${notChurnRows.length} students have left for reasons that were never our loss.`}{" "}
                            They moved to another branch or finished school, so we do not count
                            them against ourselves.
                          </p>
                          {/* All three groups put the same thing in the last
                              column, phrased the same way: why this student is
                              not being counted. */}
                          <OutsideTable
                            rows={notChurnRows.map((r) => ({
                              row: r,
                              code: r.student_code,
                              detail: r.decline_reason_category ?? "moved branch or finished school",
                            }))}
                          />
                        </div>
                      )}

                      {noRungRows.length > 0 && (
                        <div>
                          <p className="text-[11px] text-muted-foreground">
                            {noRungRows.length === 1
                              ? "One student has no class to apply for."
                              : `${noRungRows.length} students have no class to apply for.`}{" "}
                            We do not teach the grade they are entering, so nobody should be
                            chasing them.
                          </p>
                          <OutsideTable
                            rows={noRungRows.map((r) => ({
                              row: r,
                              code: r.student_code,
                              detail: r.expected_grade ? `entering ${r.expected_grade}` : "",
                            }))}
                          />
                        </div>
                      )}

                      {data.reconciliation.applied_outside.length > 0 && (
                        <div>
                          <p className="text-[11px] text-muted-foreground">
                            {data.reconciliation.applied_outside.length === 1
                              ? "One student has applied who was not studying with us last year or this summer."
                              : `${data.reconciliation.applied_outside.length} students have applied who were not studying with us last year or this summer.`}{" "}
                            Their applications are real and count on the applications page. They
                            are left out here because this page measures the students we already
                            had.
                          </p>
                          <OutsideTable
                            rows={data.reconciliation.applied_outside.map((r) => ({
                              row: r,
                              code: r.student_code,
                              detail: `was ${r.grade ?? "not recorded"}, applied for ${r.applied_grade ?? "a place"}`,
                            }))}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {tab === "breakdowns" && <RegularRetentionBreakdowns data={data} />}

              {tab === "chase" && (
                <RegularRetentionChaseList
                  data={data}
                  isReadOnly={isReadOnly}
                  currentUserEmail={user?.email ?? ""}
                  onChanged={() => mutate()}
                />
              )}
            </div>
          )}

          {/* Same matching flow the applications page uses, so an application
              only ever gets linked one way. */}
          <RegularLinkSuggestionsModal
            isOpen={linkingOpen}
            onClose={() => setLinkingOpen(false)}
            year={year}
            configId={configId}
            onDone={() => mutate()}
          />
        </div>
      </PageTransition>
    </DeskSurface>
  );
}
