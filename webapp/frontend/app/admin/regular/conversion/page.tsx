"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { regularAPI } from "@/lib/api";
import { getGradeColor, splitGradeStream } from "@/lib/regular-utils";
import { TrendingUp, Loader2, ChevronDown } from "lucide-react";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { RegularConversionSections } from "@/components/admin/RegularConversionSections";
import type { RegularConversionBranchRow } from "@/types";

const selectClass = "px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card text-foreground";

/** Columns of the per-branch funnel, in flow order. Colours ramp along each
 *  path (summer: teal -> emerald; regular: sky -> indigo -> purple) so no two
 *  stages read as the same tone. */
const COLUMNS: { key: keyof RegularConversionBranchRow; label: string; title: string; tone: string }[] = [
  { key: "prospects", label: "Prospects", title: "P6 prospects submitted for this year", tone: "text-foreground" },
  { key: "wants_summer_yes", label: "Wants summer", title: "Prospects who said Yes to summer", tone: "text-teal-600" },
  { key: "wants_regular_yes", label: "Wants regular", title: "Prospects who said Yes to regular", tone: "text-sky-600" },
  { key: "attended_summer", label: "Did summer", title: "Prospects whose summer application published an enrollment", tone: "text-emerald-600" },
  { key: "applied_regular", label: "Applied regular", title: "Prospects linked to a regular application", tone: "text-indigo-600" },
  { key: "enrolled_regular", label: "Enrolled regular", title: "Prospects whose regular application published an enrollment", tone: "text-purple-600" },
];

/** Whole-number percent, guarding a zero denominator. */
function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "-";
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

export default function RegularConversionPage() {
  usePageTitle("Regular Conversion");
  const { canViewAdminPages } = useAuth();
  const [year, setYear] = useState<number | null>(null);

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

  const { data, isLoading } = useSWR(
    year != null ? ["regular-conversion", year] : null,
    () => regularAPI.getConversion(year!)
  );

  const gradeStreams = useMemo(() => {
    if (!data) return [];
    const keys = new Set([
      ...Object.keys(data.by_grade_stream_applied),
      ...Object.keys(data.by_grade_stream_enrolled),
    ]);
    return Array.from(keys).sort();
  }, [data]);

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
              <div className="w-9 h-9 shrink-0 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-base sm:text-lg font-semibold text-foreground">Conversion</h1>
                <p className="hidden sm:block text-xs text-muted-foreground">
                  How P6 prospects flow through summer into the regular intake.
                </p>
              </div>
              <div className="shrink-0">
                <DropdownMenu
                  align="right"
                  trigger={({ triggerProps }) => (
                    <button type="button" {...triggerProps} className={cn(selectClass, "inline-flex items-center gap-1.5")}>
                      <span className="font-medium">{year ?? "Year"}</span>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  )}
                >
                  {() => (
                    <div className="py-1">
                      {years.map((y) => (
                        <button
                          key={y}
                          type="button"
                          onClick={() => setYear(y)}
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
              </div>
            </div>
          </div>

          {/* Body */}
          {isLoading || !data ? (
            <div className="flex items-center justify-center flex-1 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto p-4 sm:p-6 space-y-6">
              {/* Headline conversion metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard label="Prospects" value={String(data.totals.prospects)} sub="P6 prospects this year" />
                <KpiCard
                  label="Applied regular"
                  value={String(data.totals.applied_regular)}
                  sub={`${pct(data.totals.applied_regular, data.totals.prospects)} of prospects`}
                  tone="text-indigo-600"
                />
                <KpiCard
                  label="Enrolled regular"
                  value={String(data.totals.enrolled_regular)}
                  sub={`${pct(data.totals.enrolled_regular, data.totals.prospects)} of prospects`}
                  tone="text-purple-600"
                />
                <KpiCard
                  label="Apply to enrol"
                  value={pct(data.totals.enrolled_regular, data.totals.applied_regular)}
                  sub="of applicants enrolled"
                />
              </div>

              {/* Per-branch funnel */}
              <div className="border border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50 rounded-lg overflow-x-auto">
                <table className="w-full text-xs min-w-[860px]">
                  <thead className="bg-[#f0e6d8]/50 dark:bg-[#2a2520]">
                    <tr className="border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30">
                      <th className="px-3 py-2 text-left font-medium text-foreground">Branch</th>
                      {COLUMNS.map((c) => (
                        <th key={c.key} className="px-3 py-2 text-right font-medium text-foreground cursor-help" title={c.title}>
                          {c.label}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right font-medium text-foreground cursor-help border-l border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40" title="Applied as a share of prospects">
                        Apply %
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-foreground cursor-help" title="Enrolled as a share of prospects">
                        Enrol %
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8d4b8]/30 dark:divide-[#6b5a4a]/30">
                    {data.branches.map((row, i) => (
                      <tr key={row.branch} className={i % 2 === 1 ? "bg-[#f5efe7]/30 dark:bg-[#222]" : ""}>
                        <td className="px-3 py-2 font-semibold text-foreground">{row.branch}</td>
                        {COLUMNS.map((c) => (
                          <td key={c.key} className={cn("px-3 py-2 text-right", c.tone)}>{row[c.key]}</td>
                        ))}
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground border-l border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40">
                          {pct(row.applied_regular, row.prospects)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {pct(row.enrolled_regular, row.prospects)}
                        </td>
                      </tr>
                    ))}
                    {data.branches.length === 0 && (
                      <tr>
                        <td colSpan={COLUMNS.length + 3} className="px-3 py-6 text-center text-muted-foreground italic">
                          No prospects recorded for {year}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {data.branches.length > 0 && (
                    <tfoot className="bg-[#f0e6d8]/50 dark:bg-[#2a2520] font-semibold border-t border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50">
                      <tr>
                        <td className="px-3 py-2 text-foreground">Total</td>
                        {COLUMNS.map((c) => (
                          <td key={c.key} className={cn("px-3 py-2 text-right", c.tone)}>{data.totals[c.key]}</td>
                        ))}
                        <td className="px-3 py-2 text-right tabular-nums border-l border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40">
                          {pct(data.totals.applied_regular, data.totals.prospects)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {pct(data.totals.enrolled_regular, data.totals.prospects)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Grade-stream breakdown of regular applicants */}
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-2">Regular applicants by grade and stream</h2>
                {gradeStreams.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No regular applications linked to prospects yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {gradeStreams.map((gs) => {
                      const { grade, stream } = splitGradeStream(gs);
                      const applied = data.by_grade_stream_applied[gs] ?? 0;
                      const enrolled = data.by_grade_stream_enrolled[gs] ?? 0;
                      return (
                        <div
                          key={gs}
                          className="rounded-lg border border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 px-3 py-2 min-w-[104px]"
                        >
                          <span
                            className="inline-block text-[11px] font-bold text-gray-800 px-1.5 py-0.5 rounded mb-1"
                            style={{ backgroundColor: getGradeColor(grade, stream ?? undefined) }}
                          >
                            {gs}
                          </span>
                          <div className="text-xs text-foreground tabular-nums">
                            <span className="font-semibold">{applied}</span> applied
                          </div>
                          <div className="text-[11px] text-muted-foreground tabular-nums">
                            <span className="font-medium text-purple-600">{enrolled}</span> enrolled
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <RegularConversionSections data={data} />
            </div>
          )}
        </div>
      </PageTransition>
    </DeskSurface>
  );
}
