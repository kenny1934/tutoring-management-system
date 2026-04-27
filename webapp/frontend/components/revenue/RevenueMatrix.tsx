"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import { Crown, Loader2, Search } from "lucide-react";
import { useTutorYearMatrix, useTutors } from "@/lib/hooks";
import { StickyNote } from "@/lib/design-system";
import { cn } from "@/lib/utils";
import { getTutorFirstName } from "@/components/zen/utils/sessionSorting";
import type { TutorYearMatrixCell } from "@/types";

type SortDir = "asc" | "desc";
// "total" or "tutor" or a "YYYY-MM" period string.
export type MatrixSortKey = "total" | "tutor" | string;

interface RevenueMatrixProps {
  year: number;
  location: string | null;
  isMobile?: boolean;
  sortKey: MatrixSortKey;
  sortDir: SortDir;
  onSortChange: (key: MatrixSortKey, dir: SortDir) => void;
  onCellClick: (tutorId: number, period: string) => void;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Cells show plain numbers; "MOP" lives in totals + tooltip + the corner header.
function formatNumber(amount: number): string {
  if (amount === 0) return "—";
  return amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatMOPTotal(amount: number): string {
  if (amount === 0) return "—";
  return `MOP ${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatMOPDetailed(amount: number): string {
  return `MOP ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPeriodLabel(period: string): string {
  const [, month] = period.split("-");
  return MONTH_LABELS[parseInt(month, 10) - 1] ?? period;
}

// Heatmap shading: light amber (low) → deep amber (high). Matches the page's
// warm tan/amber palette. Returns transparent for zero / missing values so
// they read as empty cells. `intensity` is in [0, 1].
function heatColor(intensity: number, isDark: boolean): string {
  if (intensity <= 0) return "transparent";
  const clamped = Math.min(1, Math.max(0, intensity));
  const eased = Math.pow(clamped, 0.7);
  if (isDark) {
    return `rgba(205, 133, 63, ${0.12 + eased * 0.55})`;
  }
  return `rgba(208, 135, 50, ${0.08 + eased * 0.55})`;
}

interface HoverState {
  tutorName: string;
  tutorRole?: string | null;
  period: string;
  cell: TutorYearMatrixCell;
  rect: DOMRect;
}

// Mirrors the detail page: Admin / Super Admin tutors don't earn basic
// salary or bonuses, so the salary rows are hidden in the tooltip too.
function tutorEarnsSalary(role: string | null | undefined): boolean {
  return !!role && !["Admin", "Super Admin"].includes(role);
}

export function RevenueMatrix({ year, location, isMobile = false, sortKey, sortDir, onSortChange, onCellClick }: RevenueMatrixProps) {
  const { data, isLoading, error } = useTutorYearMatrix(year, location);
  const { data: tutorMeta = [] } = useTutors();
  const [hover, setHover] = useState<HoverState | null>(null);
  const [mounted, setMounted] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => setMounted(true), []);

  const roleById = useMemo(() => {
    const m = new Map<number, string | null | undefined>();
    for (const t of tutorMeta) m.set(t.id, t.role);
    return m;
  }, [tutorMeta]);

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const { rowTotals, colTotals, grandTotal, maxCell, maxByPeriod } = useMemo(() => {
    const rt: Record<number, number> = {};
    const ct: Record<string, number> = {};
    const mp: Record<string, number> = {};
    let gt = 0;
    let mx = 0;
    if (!data) return { rowTotals: rt, colTotals: ct, grandTotal: gt, maxCell: mx, maxByPeriod: mp };
    for (const tutor of data.tutors) {
      const cells = data.cells[String(tutor.id)] ?? {};
      let rowSum = 0;
      for (const period of data.periods) {
        const cell = cells[period];
        const val = cell?.session_revenue ?? 0;
        rowSum += val;
        ct[period] = (ct[period] ?? 0) + val;
        if (val > (mp[period] ?? 0)) mp[period] = val;
        if (val > mx) mx = val;
      }
      rt[tutor.id] = rowSum;
      gt += rowSum;
    }
    return { rowTotals: rt, colTotals: ct, grandTotal: gt, maxCell: mx, maxByPeriod: mp };
  }, [data]);

  const sortedTutors = useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    const tutors = q
      ? data.tutors.filter((t) => t.name.toLowerCase().includes(q))
      : [...data.tutors];
    const dirMul = sortDir === "asc" ? 1 : -1;
    const nameKey = (n: string) => getTutorFirstName(n).toLowerCase();
    if (sortKey === "tutor") {
      tutors.sort((a, b) => nameKey(a.name).localeCompare(nameKey(b.name)) * dirMul);
    } else if (sortKey === "total") {
      tutors.sort((a, b) => {
        const diff = (rowTotals[a.id] ?? 0) - (rowTotals[b.id] ?? 0);
        if (diff !== 0) return diff * dirMul;
        return nameKey(a.name).localeCompare(nameKey(b.name));
      });
    } else {
      // Period sort key: "YYYY-MM"
      tutors.sort((a, b) => {
        const va = data.cells[String(a.id)]?.[sortKey]?.session_revenue ?? 0;
        const vb = data.cells[String(b.id)]?.[sortKey]?.session_revenue ?? 0;
        if (va !== vb) return (va - vb) * dirMul;
        return nameKey(a.name).localeCompare(nameKey(b.name));
      });
    }
    return tutors;
  }, [data, sortKey, sortDir, rowTotals, filter]);

  const handleHeaderClick = (key: MatrixSortKey) => {
    if (key === sortKey) {
      onSortChange(key, sortDir === "desc" ? "asc" : "desc");
    } else {
      // New column: tutor defaults to asc (alphabetical), numerics to desc.
      onSortChange(key, key === "tutor" ? "asc" : "desc");
    }
  };

  const sortArrow = (key: MatrixSortKey) => {
    if (key !== sortKey) return null;
    return <span className="ml-0.5 text-[#a0704b] dark:text-[#cd853f]">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#a0704b] dark:text-[#cd853f]" />
          <p className="text-sm text-gray-600 dark:text-gray-400">Loading tutor matrix…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center py-12">
        <StickyNote variant="pink" size="lg" showTape>
          <div className="text-center">
            <p className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">Error</p>
            <p className="text-sm text-gray-900 dark:text-gray-100">
              {error instanceof Error ? error.message : "Failed to load revenue matrix"}
            </p>
          </div>
        </StickyNote>
      </div>
    );
  }

  if (!data || data.tutors.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <StickyNote variant="yellow" size="lg" showTape>
          <div className="text-center">
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">No tutor activity</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              No attended sessions found for {year}
              {location && location !== "All Locations" ? ` at ${location}` : ""}.
            </p>
          </div>
        </StickyNote>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex-1 min-h-[400px] flex flex-col rounded-lg border-2 border-[#d4a574] dark:border-[#8b6f47] bg-white dark:bg-[#1a1a1a] overflow-hidden",
      !isMobile && "paper-texture",
    )}>
      <div className="flex-1 min-h-0 overflow-auto" onScroll={() => setHover(null)}>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky top-0 left-0 z-30 bg-[#f5ede3] dark:bg-[#3d3628] border-b border-r border-[#d4a574]/40 px-2 sm:px-3 py-2 text-left font-semibold text-gray-900 dark:text-gray-100 min-w-[120px] sm:min-w-[200px]"
              >
                <div
                  onClick={() => handleHeaderClick("tutor")}
                  className="flex items-baseline gap-1.5 cursor-pointer select-none rounded hover:bg-[#efe3d3]/60 dark:hover:bg-[#4a3f2c]/60 -mx-1 px-1"
                >
                  <span>Tutor{sortArrow("tutor")}</span>
                  <span className="hidden sm:inline text-[10px] font-normal uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Session revenue · MOP
                  </span>
                </div>
                <div className="relative mt-1">
                  <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-500 dark:text-gray-400" />
                  <input
                    type="search"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Filter…"
                    className={cn(
                      "w-full pl-7 pr-2 py-1 text-xs font-normal",
                      "bg-white dark:bg-[#1a1a1a] border border-[#d4a574]/60 dark:border-[#6b5a4a] rounded",
                      "text-gray-900 dark:text-gray-100 placeholder:text-gray-400",
                      "focus:outline-none focus:ring-1 focus:ring-[#a0704b]/50 focus:border-[#a0704b]",
                    )}
                  />
                </div>
              </th>
              {data.periods.map((period) => (
                <th
                  key={period}
                  scope="col"
                  onClick={() => handleHeaderClick(period)}
                  className={cn(
                    "sticky top-0 z-20 bg-[#f5ede3] dark:bg-[#3d3628] border-b border-[#d4a574]/40 px-2 py-2 text-right font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap min-w-[88px]",
                    "cursor-pointer select-none hover:bg-[#efe3d3] dark:hover:bg-[#4a3f2c]",
                  )}
                >
                  {formatPeriodLabel(period)}{sortArrow(period)}
                </th>
              ))}
              <th
                scope="col"
                onClick={() => handleHeaderClick("total")}
                className={cn(
                  "sticky top-0 z-20 border-b border-l border-[#d4a574]/40 px-3 py-2 text-right font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap min-w-[110px] bg-[#efe3d3] dark:bg-[#4a3f2c]",
                  "cursor-pointer select-none hover:bg-[#e3d2b8] dark:hover:bg-[#5a4d36]",
                )}
              >
                <div>Total{sortArrow("total")}</div>
                <div className="text-[10px] font-normal uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  click to sort
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedTutors.length === 0 && (
              <tr>
                <td
                  colSpan={data.periods.length + 2}
                  className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  No tutors match &ldquo;{filter}&rdquo;
                </td>
              </tr>
            )}
            {sortedTutors.map((tutor) => {
              const tutorCells = data.cells[String(tutor.id)] ?? {};
              return (
                <tr key={tutor.id} className="hover:bg-[#fbf6ee] dark:hover:bg-[#2a2418]">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-white dark:bg-[#1a1a1a] border-b border-r border-[#d4a574]/30 px-3 py-2 text-left font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap align-middle"
                  >
                    <div className="leading-tight">{tutor.name}</div>
                    {tutor.default_location && (
                      <div className="text-[11px] font-normal text-gray-500 dark:text-gray-400 leading-tight">
                        {tutor.default_location}
                      </div>
                    )}
                  </th>
                  {data.periods.map((period) => {
                    const cell = tutorCells[period];
                    const value = cell?.session_revenue ?? 0;
                    const intensity = maxCell > 0 ? value / maxCell : 0;
                    const bg = heatColor(intensity, isDark);
                    const hasValue = value > 0;
                    const isColMax = hasValue && value === maxByPeriod[period];
                    return (
                      <td
                        key={period}
                        className={cn(
                          "relative border-b border-[#d4a574]/20 px-2 py-1.5 text-right tabular-nums whitespace-nowrap transition-shadow",
                          hasValue
                            ? "cursor-pointer text-gray-900 dark:text-gray-100 hover:shadow-[inset_0_0_0_2px_#a0704b] dark:hover:shadow-[inset_0_0_0_2px_#cd853f]"
                            : "text-gray-400 dark:text-gray-600",
                          isColMax && "font-semibold",
                        )}
                        style={{ backgroundColor: bg }}
                        onClick={hasValue ? () => onCellClick(tutor.id, period) : undefined}
                        onMouseEnter={(e) => {
                          if (!cell) {
                            setHover(null);
                            return;
                          }
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHover({ tutorName: tutor.name, tutorRole: roleById.get(tutor.id), period, cell, rect });
                        }}
                        onMouseLeave={() => setHover(null)}
                      >
                        {isColMax && (
                          <Crown
                            className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[#a0704b] dark:text-[#cd853f]"
                            aria-label="Top earner for this month"
                          />
                        )}
                        {formatNumber(value)}
                      </td>
                    );
                  })}
                  <td className="border-b border-l border-[#d4a574]/30 px-3 py-1.5 text-right font-semibold tabular-nums whitespace-nowrap bg-[#efe3d3]/40 dark:bg-[#4a3f2c]/40 text-gray-900 dark:text-gray-100">
                    {formatMOPTotal(rowTotals[tutor.id] ?? 0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th
                scope="row"
                className="sticky bottom-0 left-0 z-30 bg-[#efe3d3] dark:bg-[#4a3f2c] border-t border-r border-[#d4a574]/40 px-3 py-2 text-left font-semibold text-gray-900 dark:text-gray-100"
              >
                Total
              </th>
              {data.periods.map((period) => (
                <td
                  key={period}
                  className="sticky bottom-0 z-20 bg-[#efe3d3] dark:bg-[#4a3f2c] border-t border-[#d4a574]/40 px-2 py-2 text-right font-semibold tabular-nums whitespace-nowrap text-gray-900 dark:text-gray-100"
                >
                  {formatMOPTotal(colTotals[period] ?? 0)}
                </td>
              ))}
              <td className="sticky bottom-0 z-20 border-t border-l border-[#d4a574]/40 px-3 py-2 text-right font-bold tabular-nums whitespace-nowrap text-gray-900 dark:text-gray-100 bg-[#e3d2b8] dark:bg-[#5a4d36]">
                {formatMOPTotal(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {mounted && hover && createPortal(<CellTooltip {...hover} />, document.body)}
    </div>
  );
}

function CellTooltip({ tutorName, tutorRole, period, cell, rect }: HoverState) {
  const showSalary = tutorEarnsSalary(tutorRole);
  const rows: Array<{ label: string; value: string; bold?: boolean }> = [
    { label: "Sessions", value: String(cell.sessions_count) },
    { label: "Session revenue", value: formatMOPDetailed(cell.session_revenue), bold: !showSalary },
    ...(showSalary
      ? [
          { label: "Basic salary", value: formatMOPDetailed(cell.basic_salary) },
          { label: "Monthly bonus", value: formatMOPDetailed(cell.monthly_bonus) },
          { label: "Total salary", value: formatMOPDetailed(cell.total_salary), bold: true },
        ]
      : []),
  ];
  // Place below + right-aligned to the cell. If the cell is in the lower
  // half of the viewport, flip above so the tooltip never goes off-screen.
  const placeAbove = rect.bottom > window.innerHeight / 2;
  const style: React.CSSProperties = {
    position: "fixed",
    right: Math.max(8, window.innerWidth - rect.right),
    ...(placeAbove
      ? { top: rect.top - 6, transform: "translateY(-100%)" }
      : { top: rect.bottom + 6 }),
    zIndex: 10000,
  };
  return (
    <div
      style={style}
      className={cn(
        "pointer-events-none px-3 py-2 text-xs font-normal text-left leading-normal",
        "bg-[#3d3628] dark:bg-[#fef9f3] text-white dark:text-[#3d3628]",
        "rounded-md shadow-lg whitespace-nowrap min-w-[240px]",
      )}
    >
      <div className="font-semibold pb-1.5 mb-1.5 border-b border-white/15 dark:border-[#3d3628]/15">
        {tutorName} · {formatPeriodLabel(period)} {period.split("-")[0]}
      </div>
      <div className="flex flex-col gap-1">
        {rows.map((row) => (
          <div
            key={row.label}
            className={cn(
              "flex items-baseline justify-between gap-6",
              row.bold && "font-semibold pt-1 border-t border-white/15 dark:border-[#3d3628]/15",
            )}
          >
            <span className={cn(!row.bold && "opacity-70")}>{row.label}</span>
            <span className="tabular-nums">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
