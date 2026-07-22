"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { regularAPI } from "@/lib/api";
import {
  LOCATION_TO_CODE, WEEK_DAY_ORDER, DAY_ABBREV, SUMMER_GRADE_TEXT,
} from "@/lib/regular-utils";
import { BarChart3, Loader2 } from "lucide-react";
import type { RegularDemandCell } from "@/types";

function GradeBreakdown({ counts, muted }: { counts: Record<string, number>; muted?: boolean }) {
  const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 flex-wrap justify-center">
      {entries.map(([grade, n]) => (
        <span
          key={grade}
          className={cn(
            "text-[10px] font-medium tabular-nums",
            muted ? "text-muted-foreground" : SUMMER_GRADE_TEXT[grade] || "text-foreground"
          )}
        >
          {grade}&times;{n}
        </span>
      ))}
    </span>
  );
}

export default function RegularDemandPage() {
  usePageTitle("Regular Demand");
  const { canViewAdminPages } = useAuth();

  const [configId, setConfigId] = useState<number | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [expandedCell, setExpandedCell] = useState<string | null>(null);

  const { data: configs } = useSWR(
    canViewAdminPages ? "regular-configs" : null,
    () => regularAPI.getConfigs()
  );

  useEffect(() => {
    if (configs && configs.length > 0 && configId === null) {
      const active = configs.find((c) => c.is_active);
      setConfigId(active?.id ?? configs[0].id);
    }
  }, [configs, configId]);

  const activeConfig = useMemo(
    () => configs?.find((c) => c.id === configId) ?? null,
    [configs, configId]
  );

  // Default to the first configured branch once the config loads.
  useEffect(() => {
    if (activeConfig && activeConfig.locations.length > 0 && locationName === null) {
      setLocationName(activeConfig.locations[0].name);
    }
  }, [activeConfig, locationName]);

  const locObj = activeConfig?.locations.find((l) => l.name === locationName) ?? null;

  // Applications store the branch display name, so getDemand takes the name.
  const { data: demand, isLoading } = useSWR(
    configId && locationName ? ["regular-demand", configId, locationName] : null,
    () => regularAPI.getDemand(configId!, locationName!)
  );

  // Columns: week order restricted to this branch's open days.
  const days = useMemo(
    () => (locObj ? WEEK_DAY_ORDER.filter((d) => locObj.open_days.includes(d)) : []),
    [locObj]
  );

  // Rows: union of every slot offered on any open day (weekday and weekend
  // slot ladders differ), ordered by start time. HH:MM strings sort correctly.
  const slots = useMemo(() => {
    if (!locObj) return [];
    const set = new Set<string>();
    for (const day of locObj.open_days) {
      for (const s of locObj.time_slots?.[day] || []) set.add(s);
    }
    return [...set].sort();
  }, [locObj]);

  const cellMap = useMemo(() => {
    const map = new Map<string, RegularDemandCell>();
    for (const c of demand?.cells || []) map.set(`${c.day}|${c.time_slot}`, c);
    return map;
  }, [demand]);

  if (!canViewAdminPages) {
    return (
      <DeskSurface fullHeight>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          Access denied
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
              <div className="w-9 h-9 shrink-0 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-base sm:text-lg font-semibold text-foreground truncate">
                  Slot Demand
                </h1>
                <p className="hidden sm:block text-xs text-muted-foreground">
                  Preference counts per weekly slot. Bold is first choice, muted is backup.
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {(activeConfig?.locations || []).map((l) => {
                  const code = LOCATION_TO_CODE[l.name] || l.name;
                  const active = locationName === l.name;
                  return (
                    <button
                      key={l.name}
                      type="button"
                      onClick={() => { setLocationName(l.name); setExpandedCell(null); }}
                      className={cn(
                        "px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg border transition-colors",
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-foreground border-border hover:bg-muted"
                      )}
                      title={l.name}
                    >
                      {code} <span className="hidden sm:inline font-normal">{l.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Grid */}
          <div className="flex-1 min-h-0 overflow-auto px-4 sm:px-6 py-4">
            {isLoading || !locObj ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="border-collapse text-sm min-w-full">
                  <thead>
                    <tr>
                      <th className="text-left text-xs font-medium text-muted-foreground px-2 py-1.5 sticky left-0 bg-[#faf8f5] dark:bg-[#1a1a1a]">
                        Time slot
                      </th>
                      {days.map((d) => (
                        <th key={d} className="text-center text-xs font-medium text-muted-foreground px-2 py-1.5 min-w-[84px]">
                          {DAY_ABBREV[d] || d}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {slots.map((slot) => (
                      <tr key={slot} className="border-t border-gray-200/70 dark:border-gray-700/70">
                        <td className="px-2 py-2 font-mono text-xs text-foreground whitespace-nowrap sticky left-0 bg-[#faf8f5] dark:bg-[#1a1a1a]">
                          {slot}
                        </td>
                        {days.map((day) => {
                          const offered = (locObj.time_slots?.[day] || []).includes(slot);
                          if (!offered) {
                            return (
                              <td key={day} className="px-2 py-2 text-center text-muted-foreground/40">
                                &ndash;
                              </td>
                            );
                          }
                          const cell = cellMap.get(`${day}|${slot}`);
                          const first = cell?.total_first_pref ?? 0;
                          const second = cell?.total_second_pref ?? 0;
                          const key = `${day}|${slot}`;
                          const expanded = expandedCell === key;
                          const hasAny = first > 0 || second > 0;
                          const tooltip = cell
                            ? [
                                first > 0
                                  ? `First choice: ${Object.entries(cell.by_grade_first).map(([g, n]) => `${g} x ${n}`).join(", ")}`
                                  : null,
                                second > 0
                                  ? `Backup: ${Object.entries(cell.by_grade_second).map(([g, n]) => `${g} x ${n}`).join(", ")}`
                                  : null,
                              ].filter(Boolean).join(" | ")
                            : "No preferences for this slot";
                          return (
                            <td key={day} className="px-1 py-1 text-center align-top">
                              <button
                                type="button"
                                onClick={() => hasAny && setExpandedCell(expanded ? null : key)}
                                title={tooltip}
                                className={cn(
                                  "w-full rounded-lg px-1.5 py-1.5 transition-colors",
                                  hasAny
                                    ? "hover:bg-muted cursor-pointer"
                                    : "cursor-default",
                                  first >= 4
                                    ? "bg-emerald-50 dark:bg-emerald-900/20"
                                    : first > 0
                                      ? "bg-amber-50/70 dark:bg-amber-900/10"
                                      : "",
                                  expanded && "ring-1 ring-primary/40"
                                )}
                              >
                                <span className="inline-flex items-baseline gap-1 tabular-nums">
                                  <span className={cn("font-semibold", first > 0 ? "text-foreground" : "text-muted-foreground/50")}>
                                    {first}
                                  </span>
                                  {second > 0 && (
                                    <span className="text-[11px] text-muted-foreground">+{second}</span>
                                  )}
                                </span>
                                {expanded && cell && (
                                  <span className="block mt-1 space-y-0.5">
                                    <GradeBreakdown counts={cell.by_grade_first} />
                                    {second > 0 && <GradeBreakdown counts={cell.by_grade_second} muted />}
                                  </span>
                                )}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Counts include every application except withdrawn and rejected ones. A dash marks
                  slots the branch does not offer on that day. Click a cell for the per-grade split.
                </p>
              </div>
            )}
          </div>
        </div>
      </PageTransition>
    </DeskSurface>
  );
}
