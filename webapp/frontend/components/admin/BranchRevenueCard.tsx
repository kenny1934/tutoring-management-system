"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { summerAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import { BarChart3, ExternalLink, Loader2, RefreshCw, Send } from "lucide-react";
import type { BranchRevenueReportResponse, BranchRevenueSummary } from "@/types";

const BRANCHES = ["MSA", "MSB"] as const;

function money(v: number, decimals = 0) {
  return (
    "$" +
    v.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

function pct(v: number) {
  return (v * 100).toFixed(1) + "%";
}

/** Sum a numeric field across both branches. */
function total(
  report: BranchRevenueReportResponse,
  pick: (b: BranchRevenueSummary) => number,
) {
  return BRANCHES.reduce((acc, br) => acc + pick(report.branches[br]), 0);
}

export default function BranchRevenueCard({ className }: { className?: string }) {
  const { showToast, showError } = useToast();
  const [report, setReport] = useState<BranchRevenueReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [lastPushedAt, setLastPushedAt] = useState<Date | null>(null);

  const loadReport = async () => {
    setLoading(true);
    try {
      setReport(await summerAPI.getRevenueReport());
    } catch (e) {
      showError(e, "Failed to load revenue report");
    } finally {
      setLoading(false);
    }
  };

  const handlePush = async () => {
    setPushing(true);
    try {
      const result = await summerAPI.refreshRevenueSheet();
      setLastPushedAt(new Date());
      showToast(`Sheet refreshed (${result.sheet_name ?? result.spreadsheet_id})`, "success");
    } catch (e) {
      showError(e, "Failed to refresh revenue sheet");
    } finally {
      setPushing(false);
    }
  };

  const sheetUrl = report?.spreadsheet_id
    ? `https://docs.google.com/spreadsheets/d/${report.spreadsheet_id}/edit`
    : null;

  return (
    <div
      className={cn(
        "rounded-lg border border-gray-200 dark:border-gray-700 p-3 sm:p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Branch revenue
          </div>
          <div className="hidden sm:block text-xs text-muted-foreground mt-0.5">
            Summer fee collection and July/August regular sessions per branch.
            Refreshing pushes the full workbook to the revenue Google Sheet.
            {report && (
              <>
                {" "}Data as of{" "}
                <span className="font-mono">
                  {new Date(report.as_of).toLocaleString()}
                </span>
                {sheetUrl && (
                  <a
                    href={sheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 text-primary hover:underline inline-flex items-center gap-0.5"
                  >
                    open sheet <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </>
            )}
          </div>
          {lastPushedAt && (
            <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">
              Sheet last refreshed {lastPushedAt.toLocaleTimeString()}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={loadReport}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {report ? "Reload" : "Load report"}
        </button>
        <button
          type="button"
          onClick={handlePush}
          disabled={pushing}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pushing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Refresh sheet
        </button>
      </div>

      {report && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-gray-200 dark:border-gray-700">
                <th className="text-left font-medium py-1.5 pr-2">
                  Summer {report.year}
                </th>
                {BRANCHES.map((br) => (
                  <th key={br} className="text-right font-medium py-1.5 px-2">{br}</th>
                ))}
                <th className="text-right font-semibold py-1.5 pl-2">Total</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <Row
                label="Receivable (Paid + Fee Sent)"
                bold
                cells={[
                  ...BRANCHES.map((br) => {
                    const b = report.branches[br];
                    return `${b.receivable_students} · ${money(b.receivable_amount)}`;
                  }),
                  `${total(report, (b) => b.receivable_students)} · ${money(total(report, (b) => b.receivable_amount))}`,
                ]}
              />
              <Row
                label="Collected (Paid)"
                cells={[
                  ...BRANCHES.map((br) => {
                    const b = report.branches[br];
                    return `${b.collected_students} · ${money(b.collected_amount)}`;
                  }),
                  `${total(report, (b) => b.collected_students)} · ${money(total(report, (b) => b.collected_amount))}`,
                ]}
              />
              <Row
                label="Outstanding (Fee Sent)"
                cells={[
                  ...BRANCHES.map((br) => {
                    const b = report.branches[br];
                    return `${b.outstanding_students} · ${money(b.outstanding_amount)}`;
                  }),
                  `${total(report, (b) => b.outstanding_students)} · ${money(total(report, (b) => b.outstanding_amount))}`,
                ]}
              />
              <Row
                label="Collection rate (by amount)"
                bold
                cells={[
                  ...BRANCHES.map((br) => pct(report.branches[br].collection_rate_amount)),
                  pct(
                    total(report, (b) => b.collected_amount) /
                      Math.max(1, total(report, (b) => b.receivable_amount)),
                  ),
                ]}
              />
              <Row
                label="Pipeline potential (Under Review + Submitted)"
                muted
                cells={[
                  ...BRANCHES.map((br) => money(report.branches[br].pipeline_potential_amount)),
                  money(total(report, (b) => b.pipeline_potential_amount)),
                ]}
              />

              <tr>
                <td colSpan={4} className="pt-3 pb-1.5 text-muted-foreground font-medium border-b border-gray-200 dark:border-gray-700">
                  Regular course (July / August {report.year})
                </td>
              </tr>
              <Row
                label="July sessions · revenue"
                cells={[
                  ...BRANCHES.map((br) => {
                    const r = report.branches[br].regular;
                    return `${r.jul_sessions} · ${money(r.jul_revenue, 2)}`;
                  }),
                  `${total(report, (b) => b.regular.jul_sessions)} · ${money(total(report, (b) => b.regular.jul_revenue), 2)}`,
                ]}
              />
              <Row
                label="August sessions · revenue"
                cells={[
                  ...BRANCHES.map((br) => {
                    const r = report.branches[br].regular;
                    return `${r.aug_sessions} · ${money(r.aug_revenue, 2)}`;
                  }),
                  `${total(report, (b) => b.regular.aug_sessions)} · ${money(total(report, (b) => b.regular.aug_revenue), 2)}`,
                ]}
              />

              <tr>
                <td colSpan={4} className="pt-3 pb-1.5 text-muted-foreground font-medium border-b border-gray-200 dark:border-gray-700">
                  July–August outlook (summer + regular)
                </td>
              </tr>
              <Row
                label="Confirmed"
                bold
                cells={[
                  ...BRANCHES.map((br) => money(report.branches[br].outlook_confirmed, 2)),
                  money(total(report, (b) => b.outlook_confirmed), 2),
                ]}
              />
              <Row
                label="Including pipeline potential"
                cells={[
                  ...BRANCHES.map((br) => money(report.branches[br].outlook_with_potential, 2)),
                  money(total(report, (b) => b.outlook_with_potential), 2),
                ]}
              />
            </tbody>
          </table>

          {/* Tier breakdown — receivable split by discount tier */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {BRANCHES.map((br) => {
              const b = report.branches[br];
              return (
                <div key={br} className="rounded-md border border-gray-100 dark:border-gray-800 p-2.5">
                  <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">
                    {br} fee tiers (Paid / Fee Sent)
                  </div>
                  <div className="space-y-1">
                    {b.tiers.map((t) => (
                      <div key={t.code} className="flex items-baseline justify-between gap-2 text-[11px] tabular-nums">
                        <span className="truncate" title={t.name}>
                          <span className="font-mono">{t.code}</span>
                          <span className="text-muted-foreground"> · {money(t.fee_per_student)}/student</span>
                        </span>
                        <span className="shrink-0">
                          {t.paid_count} · {money(t.paid_amount)}
                          <span className="text-muted-foreground"> / {t.fee_sent_count} · {money(t.fee_sent_amount)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  cells,
  bold,
  muted,
}: {
  label: string;
  cells: string[];
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <tr className={cn("border-b border-gray-100 dark:border-gray-800", muted && "text-muted-foreground")}>
      <td className={cn("py-1.5 pr-2", bold && "font-semibold")}>{label}</td>
      {cells.map((c, i) => (
        <td
          key={i}
          className={cn(
            "py-1.5 px-2 text-right whitespace-nowrap",
            bold && "font-semibold",
            i === cells.length - 1 && "pl-2 font-medium",
          )}
        >
          {c}
        </td>
      ))}
    </tr>
  );
}
