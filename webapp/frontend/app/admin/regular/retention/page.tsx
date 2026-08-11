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
} from "@/components/admin/RegularRetentionSections";
import type { RegularRetentionResponse, RegularRetentionRow } from "@/types";

const selectClass = "px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card text-foreground";

/** The intake at a glance, the analysis axes, and the list staff actually work. */
type RetentionTab = "overview" | "breakdowns" | "chase";

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
  const axisHeader = ["Key", "Cohort", "Applied", "Enrolled", "Not returning", "Contacted", "No response", "Apply %"];
  const axisLine = (r: RegularRetentionRow) => [
    r.key, r.cohort, r.applied, r.enrolled, r.declined, r.contacted, r.no_response,
    pct(r.applied, r.cohort),
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

  block("By branch", data.by_branch);
  block("By entering grade", data.by_expected_grade);
  block("By source", data.by_source);
  block("By tutor", data.by_tutor);

  rows.push(["Not returning — reason", "Students"]);
  data.by_decline_reason.forEach((r) => rows.push([r.key, r.declined]));
  rows.push([]);

  rows.push([
    "Student", "Code", "Branch", "Grade now", "Entering", "Rung", "Stream", "School",
    "Phone", "Tutor", "Source", "On prospect board", "State", "Reference",
    "Last contact", "Days since", "Follow up", "Not returning reason",
  ]);
  data.chase.forEach((r) =>
    rows.push([
      r.student_name, r.student_code, r.branch, r.grade, r.expected_grade, r.rung,
      r.lang_stream, r.school, r.phone, r.tutor_name, r.source, r.on_prospect_board,
      r.state, r.reference_code, r.last_contact_date, r.days_since_contact,
      r.follow_up_date, r.decline_reason_category,
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
        <h2 className="text-sm font-semibold text-foreground">Where the cohort stands</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Every student who was here at the end of last year, and what we know about them now.
        </p>
      </div>

      <div className="flex h-7 rounded overflow-hidden bg-[#f0e6d8]/40 dark:bg-[#2a2520]">
        {segments.map((s) => (
          <div
            key={s.label}
            className={cn("h-full", s.fill)}
            style={{ width: `${(s.value / base) * 100}%` }}
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

  const { data, isLoading, mutate } = useSWR(
    year != null ? ["regular-retention", year, branch] : null,
    () => regularAPI.getRetention(year!, branch)
  );

  useEffect(() => {
    if (data && branch === null) setBranchOptions(data.by_branch.map((b) => b.key));
  }, [data, branch]);

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
                  Whether last year&apos;s students have applied for this year&apos;s course.
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                {branchOptions.length > 1 && (
                  <DropdownMenu
                    align="right"
                    trigger={({ triggerProps }) => (
                      <button type="button" {...triggerProps} className={cn(selectClass, "inline-flex items-center gap-1.5")}>
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
                        {branchOptions.map((b) => (
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
                    <KpiCard
                      label="Cohort"
                      value={String(data.totals.cohort)}
                      sub="here at the end of last year"
                    />
                    <KpiCard
                      label="Applied"
                      value={String(data.totals.applied)}
                      sub={`${pct(data.totals.applied, data.totals.cohort)} of the cohort`}
                      tone="text-indigo-600 dark:text-indigo-400"
                    />
                    <KpiCard
                      label="Not returning"
                      value={String(data.totals.declined)}
                      sub="told us they are leaving"
                      tone="text-rose-600 dark:text-rose-400"
                    />
                    <KpiCard
                      label="No response"
                      value={String(noResponse)}
                      sub={`${data.totals.contacted} contacted so far`}
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
                          {data.reconciliation.unlinked_secondary} application
                          {data.reconciliation.unlinked_secondary === 1 ? "" : "s"} not matched to a student record
                        </span>
                        <p className="text-sky-800/80 dark:text-sky-400/80 mt-0.5">
                          These families say they already study here, so some of them are counted as
                          no response below. Match them on the applications page and the numbers
                          settle.
                        </p>
                      </div>
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
                        {noResponse} student{noResponse === 1 ? "" : "s"} still to chase
                      </span>
                      <span className="text-amber-700/80 dark:text-amber-400/80">
                        no application and no answer yet
                      </span>
                      <span className="ml-auto underline">View list</span>
                    </button>
                  )}

                  <OutcomeBar totals={data.totals} />

                  {/* Nothing has been published for the new year yet, which
                      reads as a broken chart rather than an empty one unless
                      the page says so. */}
                  {data.totals.applied > 0 && data.totals.enrolled === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No places have been confirmed yet. Applications become enrolments once you
                      publish them from the arrangement page.
                    </p>
                  )}

                  {data.no_rung.cohort > 0 && (
                    <div className="rounded-lg border border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 bg-white/40 dark:bg-white/[0.02] px-3 py-2.5">
                      <div className="text-xs font-medium text-foreground">
                        {data.no_rung.cohort} student{data.no_rung.cohort === 1 ? "" : "s"} with no
                        place to apply
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        The course does not run at the grade they are entering, so they are counted
                        separately and never treated as unresponsive.
                      </p>
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
        </div>
      </PageTransition>
    </DeskSurface>
  );
}
