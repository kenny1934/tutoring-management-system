"use client";

import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import {
  Wand2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
  ChevronDown,
  ChevronRight,
  Info,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { summerAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import { SUMMER_GRADE_BG, SUMMER_GRADE_BORDER, DAY_ABBREV, formatCompactDate } from "@/lib/summer-utils";
import { toDateString, getMonthCalendarDates } from "@/lib/calendar-utils";
import type { SummerSuggestionItem, SummerSuggestResponse } from "@/types";

type DateRange = [string, string]; // [start YYYY-MM-DD, end YYYY-MM-DD]
const EMPTY_RANGES: DateRange[] = [];

interface DateConstraints {
  mode: "exclude" | "include";
  ranges: DateRange[];
}

function flattenRanges(ranges: DateRange[]): string[] {
  const dates: string[] = [];
  for (const [start, end] of ranges) {
    const d = new Date(start + "T00:00:00");
    const endD = new Date(end + "T00:00:00");
    while (d <= endD) {
      dates.push(toDateString(d));
      d.setDate(d.getDate() + 1);
    }
  }
  return [...new Set(dates)].sort();
}

function isDateInRanges(dateStr: string, ranges: DateRange[]): boolean {
  return ranges.some(([s, e]) => dateStr >= s && dateStr <= e);
}

function isRangeEndpoint(dateStr: string, ranges: DateRange[]): "start" | "end" | "both" | null {
  let isStart = false;
  let isEnd = false;
  for (const [s, e] of ranges) {
    if (dateStr === s) isStart = true;
    if (dateStr === e) isEnd = true;
  }
  if (isStart && isEnd) return "both";
  if (isStart) return "start";
  if (isEnd) return "end";
  return null;
}

function formatRangeLabel(start: string, end: string): string {
  const s = formatCompactDate(start);
  if (start === end) return s;
  const e = formatCompactDate(end);
  // If same month, shorten: "Jul 14 – 18"
  const sMonth = s.split(" ")[0];
  const eMonth = e.split(" ")[0];
  if (sMonth === eMonth) return `${s} – ${e.split(" ")[1]}`;
  return `${s} – ${e}`;
}

interface SummerAutoSuggestModalProps {
  isOpen: boolean;
  onClose: () => void;
  configId: number;
  location: string;
  onAccepted: () => void;
  applicationId?: number | null;
  studentName?: string;
  courseStartDate?: string;
  courseEndDate?: string;
}

const SLOT_BORDER_COLORS = [
  "border-l-amber-400 dark:border-l-amber-600",
  "border-l-blue-400 dark:border-l-blue-600",
  "border-l-emerald-400 dark:border-l-emerald-600",
];

function getQualityLabel(score: number): { text: string; className: string } {
  if (score > 0.8) return { text: "Good fit", className: "text-green-600 dark:text-green-400" };
  if (score >= 0.5) return { text: "Okay fit", className: "text-yellow-600 dark:text-yellow-400" };
  return { text: "Poor fit", className: "text-red-600 dark:text-red-400" };
}

function formatReason(reason: string, score: number): string {
  return reason
    .replace("first pref match", "Matches 1st preference")
    .replace("second pref match", "Matches 2nd preference")
    .replace("any open match", "Placed in available slot")
    .replace("mixed match", "Uses multiple preference slots")
    .replace(/buddy in (\d+)\/(\d+) lessons/, "Buddy in $1 of $2 lessons")
    .replace(
      /sequence \d+%/,
      score > 0.8 ? "Lessons are well ordered" : score >= 0.5 ? "Lessons are mostly in order" : "Some lessons may be out of order"
    )
    .replace("uses multiple slots (1x student)", "Uses multiple slots (1x student — date constraints may have forced this)")
    .replace(/, /g, " · ");
}

function getSlotSummary(assignments: SummerSuggestionItem["lesson_assignments"]): string {
  // Dedupe by slot_id to get unique slots
  const seen = new Map<number, { day: string; time: string; tutor: string }>();
  for (const a of assignments) {
    if (!seen.has(a.slot_id)) {
      const dayAbbr = DAY_ABBREV[a.slot_day] || a.slot_day?.slice(0, 3);
      const timeStart = a.time_slot?.split(" - ")[0] || a.time_slot;
      seen.set(a.slot_id, { day: dayAbbr, time: timeStart, tutor: a.tutor_name || "" });
    }
  }
  return [...seen.values()]
    .map((s) => s.tutor ? `${s.day} ${s.time} ${s.tutor}` : `${s.day} ${s.time}`)
    .join(" + ");
}

const SLOT_LEGEND_DOT_COLORS = [
  "text-amber-400 dark:text-amber-500",
  "text-blue-400 dark:text-blue-500",
  "text-emerald-400 dark:text-emerald-500",
];

function LessonRow({ assignments }: { assignments: SummerSuggestionItem["lesson_assignments"] }) {
  // Build slot-id → color index map
  const slotIds = [...new Set(assignments.map((a) => a.slot_id))];
  const slotColorMap = new Map(slotIds.map((id, i) => [id, i % SLOT_BORDER_COLORS.length]));

  // Build legend data for multi-slot
  const slotLegend = slotIds.length > 1
    ? slotIds.map((id, i) => {
        const first = assignments.find((a) => a.slot_id === id)!;
        const dayAbbr = DAY_ABBREV[first.slot_day] || first.slot_day?.slice(0, 3);
        const timeStart = first.time_slot?.split(" - ")[0] || first.time_slot;
        const tutor = first.tutor_name;
        const label = tutor ? `${dayAbbr} ${timeStart} (${tutor})` : `${dayAbbr} ${timeStart}`;
        return { label, colorIdx: i % SLOT_LEGEND_DOT_COLORS.length };
      })
    : null;

  return (
    <div className="mt-1.5">
      <div className="flex gap-0.5">
        {assignments.map((a) => {
          const dayAbbr = DAY_ABBREV[a.slot_day] || a.slot_day?.slice(0, 3);
          const slotColor = SLOT_BORDER_COLORS[slotColorMap.get(a.slot_id) ?? 0];
          return (
            <div
              key={a.lesson_id}
              className={cn(
                "flex-1 min-w-0 text-center px-0.5 py-1 rounded bg-[#fef9f3] dark:bg-[#2d2618] border-t border-r border-b border-[#e8d4b8]/50 border-l-2",
                slotColor
              )}
            >
              <div className="text-[10px] font-semibold text-foreground/80">
                L{a.lesson_number}
              </div>
              <div className="text-[9px] text-muted-foreground truncate">
                {dayAbbr} {formatCompactDate(a.lesson_date)}
              </div>
            </div>
          );
        })}
      </div>
      {slotLegend && (
        <div className="flex items-center gap-3 mt-1">
          {slotLegend.map((s, i) => (
            <span key={i} className="flex items-center gap-1 text-[9px] text-muted-foreground">
              <span className={cn("text-sm leading-none", SLOT_LEGEND_DOT_COLORS[s.colorIdx])}>&#9632;</span>
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Date constraint panel (extracted for perf — hoverDate stays local) ──

interface CourseMonthData {
  start: Date;
  end: Date;
  months: { year: number; month: number; label: string; dates: Date[] }[];
}

interface DateConstraintPanelProps {
  appId: number;
  constraints: DateConstraints | undefined;
  courseMonths: CourseMonthData;
  adjustError: string | undefined;
  onConstraintsChange: (appId: number, update: Partial<DateConstraints>) => void;
  onClearError: (appId: number) => void;
  onResuggest: (appId: number, mode: "exclude" | "include", flatDates: string[]) => Promise<void>;
}

const DAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const DateConstraintPanel = memo(function DateConstraintPanel({
  appId,
  constraints,
  courseMonths,
  adjustError,
  onConstraintsChange,
  onClearError,
  onResuggest,
}: DateConstraintPanelProps) {
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [readjusting, setReadjusting] = useState(false);
  const [resuggestFlash, setResuggestFlash] = useState(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
  }, []);

  const mode = constraints?.mode ?? "exclude";
  const ranges = constraints?.ranges ?? EMPTY_RANGES;
  const { start, end, months } = courseMonths;

  const flatDates = useMemo(() => flattenRanges(ranges), [ranges]);

  const previewStart = rangeStart && hoverDate
    ? (rangeStart <= hoverDate ? rangeStart : hoverDate) : null;
  const previewEnd = rangeStart && hoverDate
    ? (rangeStart <= hoverDate ? hoverDate : rangeStart) : null;

  const handleDateClick = useCallback((dateStr: string) => {
    if (adjustError) onClearError(appId);
    if (!rangeStart) {
      setRangeStart(dateStr);
    } else {
      const s = rangeStart <= dateStr ? rangeStart : dateStr;
      const e = rangeStart <= dateStr ? dateStr : rangeStart;
      onConstraintsChange(appId, { ranges: [...ranges, [s, e] as DateRange] });
      setRangeStart(null);
      setHoverDate(null);
    }
  }, [appId, rangeStart, ranges, adjustError, onConstraintsChange, onClearError]);

  const removeRange = useCallback((idx: number) => {
    if (adjustError) onClearError(appId);
    onConstraintsChange(appId, { ranges: ranges.filter((_, i) => i !== idx) });
  }, [appId, ranges, adjustError, onConstraintsChange, onClearError]);

  const handleResuggest = useCallback(async () => {
    setReadjusting(true);
    setRangeStart(null);
    setHoverDate(null);
    try {
      await onResuggest(appId, mode, flatDates);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      setResuggestFlash(true);
      flashTimerRef.current = setTimeout(() => setResuggestFlash(false), 1500);
    } finally {
      setReadjusting(false);
    }
  }, [appId, mode, flatDates, onResuggest]);

  return (
    <div className="shrink-0 px-3 py-2.5 md:border-l border-t md:border-t-0 border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30 space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => {
            if (mode === "exclude") return;
            if (ranges.length > 0 && !confirm("Switching modes will clear selected dates. Continue?")) return;
            onConstraintsChange(appId, { mode: "exclude", ranges: [] });
            setRangeStart(null);
          }}
          className={cn(
            "text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors",
            mode === "exclude"
              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              : "bg-[#e8d4b8]/20 text-muted-foreground hover:bg-[#e8d4b8]/40"
          )}
        >
          Not available on:
        </button>
        <button
          onClick={() => {
            if (mode === "include") return;
            if (ranges.length > 0 && !confirm("Switching modes will clear selected dates. Continue?")) return;
            onConstraintsChange(appId, { mode: "include", ranges: [] });
            setRangeStart(null);
          }}
          className={cn(
            "text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors",
            mode === "include"
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : "bg-[#e8d4b8]/20 text-muted-foreground hover:bg-[#e8d4b8]/40"
          )}
        >
          Only available on:
        </button>
        {rangeStart && (
          <span className="text-[9px] text-muted-foreground italic">Click end date...</span>
        )}
      </div>

      <div className="flex gap-3" onMouseLeave={() => setHoverDate(null)}>
        {months.map(({ year, month, label, dates }) => (
          <div key={`${year}-${month}`} className="shrink-0">
            <div className="text-[10px] font-semibold text-center mb-1 text-gray-700 dark:text-gray-300">{label}</div>
            <div className="grid grid-cols-7">
              {DAY_NAMES.map((d) => (
                <div key={d} className="w-7 h-5 flex items-center justify-center text-[9px] font-medium text-muted-foreground">{d}</div>
              ))}
              {dates.map((date, i) => {
                const isCurrentMonth = date.getMonth() === month;
                const dateStr = toDateString(date);
                const inCourseRange = date >= start && date <= end;
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                const selectable = isCurrentMonth && inCourseRange;
                const inCommitted = isDateInRanges(dateStr, ranges);
                const endpoint = isRangeEndpoint(dateStr, ranges);
                const inPreview = !inCommitted && previewStart && previewEnd && dateStr >= previewStart && dateStr <= previewEnd;
                const isPreviewEndpoint = inPreview && (dateStr === previewStart || dateStr === previewEnd);
                const isPendingStart = dateStr === rangeStart && !inCommitted;
                const isRangeStart = endpoint === "start" || endpoint === "both";
                const isRangeEnd = endpoint === "end" || endpoint === "both";
                const isInterior = inCommitted && !isRangeStart && !isRangeEnd;
                const isPreviewStart = inPreview && dateStr === previewStart;
                const isPreviewEnd = inPreview && dateStr === previewEnd;
                const isPreviewInterior = inPreview && !isPreviewStart && !isPreviewEnd;
                const modeIsExclude = mode === "exclude";
                return (
                  <button
                    key={i}
                    onClick={() => selectable && handleDateClick(dateStr)}
                    onMouseEnter={() => selectable && rangeStart && setHoverDate(dateStr)}
                    disabled={!selectable}
                    className={cn(
                      "w-7 h-7 flex items-center justify-center text-[11px] transition-colors relative",
                      !isCurrentMonth && "invisible",
                      isCurrentMonth && !inCourseRange && "opacity-20 cursor-default",
                      selectable && isWeekend && !inCommitted && !inPreview && !isPendingStart && "opacity-40",
                      selectable && !inCommitted && !inPreview && !isPendingStart && "hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer rounded-full",
                      isPendingStart && cn("rounded-full font-bold text-white", modeIsExclude ? "bg-red-500" : "bg-green-500"),
                      (isRangeStart || isRangeEnd) && !isInterior && cn(
                        "font-bold text-white z-10", modeIsExclude ? "bg-red-500" : "bg-green-500",
                        isRangeStart && !isRangeEnd && "rounded-l-full rounded-r-none",
                        isRangeEnd && !isRangeStart && "rounded-r-full rounded-l-none",
                        endpoint === "both" && "rounded-full",
                      ),
                      isInterior && cn("rounded-none font-medium", modeIsExclude ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" : "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"),
                      isPreviewEndpoint && cn("font-semibold z-10", modeIsExclude ? "bg-red-200 text-red-700 dark:bg-red-800/50 dark:text-red-200" : "bg-green-200 text-green-700 dark:bg-green-800/50 dark:text-green-200",
                        isPreviewStart && !isPreviewEnd && "rounded-l-full rounded-r-none",
                        isPreviewEnd && !isPreviewStart && "rounded-r-full rounded-l-none",
                        isPreviewStart && isPreviewEnd && "rounded-full",
                      ),
                      isPreviewInterior && cn("rounded-none", modeIsExclude ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300" : "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-300"),
                    )}
                    title={selectable ? dateStr : undefined}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {ranges.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {ranges.map(([s, e], idx) => (
            <span key={idx} className={cn("inline-flex items-center gap-0.5 text-[10px] font-medium pl-1.5 pr-0.5 py-0.5 rounded-full", mode === "exclude" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300")}>
              {formatRangeLabel(s, e)}
              <button onClick={() => removeRange(idx)} className="hover:bg-black/10 dark:hover:bg-white/10 rounded-full p-0.5"><X className="h-2.5 w-2.5" /></button>
            </span>
          ))}
          <button onClick={() => { onConstraintsChange(appId, { ranges: [] }); setRangeStart(null); }} className="text-[9px] text-muted-foreground hover:text-foreground hover:underline ml-0.5">Clear</button>
        </div>
      )}

      <button
        onClick={handleResuggest}
        disabled={readjusting}
        className={cn(
          "text-[10px] font-medium px-2.5 py-1 rounded-md text-white flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed transition-colors w-full justify-center",
          resuggestFlash ? "bg-green-600" : "bg-amber-600 hover:bg-amber-700"
        )}
      >
        {readjusting ? <Loader2 className="h-3 w-3 animate-spin" /> : resuggestFlash ? <CheckCircle2 className="h-3 w-3" /> : <Wand2 className="h-3 w-3" />}
        {resuggestFlash ? "Updated!" : ranges.length === 0 ? "Reset suggestion" : "Re-suggest"}
      </button>
    </div>
  );
});

// ── Main Modal ──

export function SummerAutoSuggestModal({
  isOpen,
  onClose,
  configId,
  location,
  onAccepted,
  applicationId,
  studentName,
  courseStartDate,
  courseEndDate,
}: SummerAutoSuggestModalProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SummerSuggestResponse | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // For students with multiple options: which option_label is chosen per app_id
  const [selectedOption, setSelectedOption] = useState<Record<number, string>>({});
  const [accepting, setAccepting] = useState(false);
  const [acceptProgress, setAcceptProgress] = useState({ current: 0, total: 0 });
  const [showAlgorithm, setShowAlgorithm] = useState(false);
  const [adjustingAppId, setAdjustingAppId] = useState<number | null>(null);
  const [dateConstraints, setDateConstraints] = useState<Record<number, DateConstraints>>({});
  const [adjustErrors, setAdjustErrors] = useState<Record<number, string>>({});

  // Stable refs for callbacks used in effects
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const setConstraintsFor = useCallback((appId: number, update: Partial<DateConstraints>) => {
    setDateConstraints(prev => ({
      ...prev,
      [appId]: {
        mode: prev[appId]?.mode ?? "exclude",
        ranges: prev[appId]?.ranges ?? [],
        ...update,
      },
    }));
  }, []);

  // Build month calendar data for the course period
  const courseMonths = useMemo(() => {
    if (!courseStartDate || !courseEndDate) return null;
    const start = new Date(courseStartDate + "T00:00:00");
    const end = new Date(courseEndDate + "T00:00:00");
    const months: { year: number; month: number; label: string; dates: Date[] }[] = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= end) {
      months.push({
        year: cur.getFullYear(),
        month: cur.getMonth(),
        label: cur.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        dates: getMonthCalendarDates(cur),
      });
      cur.setMonth(cur.getMonth() + 1);
    }
    return { start, end, months };
  }, [courseStartDate, courseEndDate]);

  // Run auto-suggest on mount (uses refs for showToast/onClose to avoid re-fires)
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setData(null);
    setSelected(new Set());
    setAccepting(false);
    setAcceptProgress({ current: 0, total: 0 });
    setAdjustingAppId(null);
    setAdjustErrors({});

    summerAPI
      .autoSuggest({ config_id: configId, location, application_id: applicationId ?? undefined })
      .then((result) => {
        setData(result);
        // Auto-select high-confidence proposals; for option groups, pick first option (Option A)
        const defaultSelected = new Set<number>();
        const defaultOptions: Record<number, string> = {};
        const seen = new Set<number>();
        for (const p of result.proposals) {
          if (seen.has(p.application_id)) continue; // skip later options for auto-select
          seen.add(p.application_id);
          if (p.confidence > 0.5) defaultSelected.add(p.application_id);
          if (p.option_label) defaultOptions[p.application_id] = p.option_label;
        }
        setSelected(defaultSelected);
        setSelectedOption(defaultOptions);
      })
      .catch((e) => {
        showToastRef.current(e.message || "Auto-suggest failed", "error");
        onCloseRef.current();
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, configId, location, applicationId]);

  const toggleItem = useCallback((appId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return next;
    });
  }, []);

  const clearError = useCallback((appId: number) => {
    setAdjustErrors(prev => { const n = { ...prev }; delete n[appId]; return n; });
  }, []);

  // Callback for DateConstraintPanel re-suggest
  const handlePanelResuggest = useCallback(async (appId: number, mode: "exclude" | "include", flatDates: string[]) => {
    clearError(appId);
    try {
      const result = await summerAPI.autoSuggest({
        config_id: configId,
        location,
        application_id: appId,
        exclude_dates: mode === "exclude" ? flatDates : undefined,
        include_dates: mode === "include" ? flatDates : undefined,
      });
      if (result.proposals.length > 0 && data) {
        const otherProposals = data.proposals.filter((ex) => ex.application_id !== appId);
        setData({ ...data, proposals: [...otherProposals, ...result.proposals] });
        if (result.proposals[0].option_label) {
          setSelectedOption(prev => ({ ...prev, [appId]: result.proposals[0].option_label! }));
        }
      } else {
        setAdjustErrors(prev => ({ ...prev, [appId]: "No placement found with these constraints" }));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Re-suggest failed";
      showToast(msg, "error");
      throw e; // re-throw so panel's finally block runs
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configId, location, data]);

  // Group proposals by student for rendering (options stay within one card)
  const studentGroups = useMemo(() => {
    if (!data) return [];
    const map = new Map<number, SummerSuggestionItem[]>();
    for (const p of data.proposals) {
      if (!map.has(p.application_id)) map.set(p.application_id, []);
      map.get(p.application_id)!.push(p);
    }
    return [...map.entries()].map(([appId, items]) => ({
      appId,
      primary: items[0],
      options: items,
      hasOptions: items.length > 1,
    }));
  }, [data]);

  const toggleAll = useCallback(() => {
    if (!studentGroups.length) return;
    setSelected(prev =>
      prev.size === studentGroups.length
        ? new Set()
        : new Set(studentGroups.map(g => g.appId))
    );
  }, [studentGroups]);

  const handleAccept = async () => {
    if (!data) return;
    // For each selected app_id, pick the matching option (or the only proposal)
    const toPlace = data.proposals.filter((p) => {
      if (!selected.has(p.application_id)) return false;
      if (p.option_label) return p.option_label === selectedOption[p.application_id];
      return true;
    });
    if (toPlace.length === 0) return;

    setAccepting(true);
    // Build bulk items from all selected proposals
    const bulkItems = toPlace.flatMap((p) =>
      p.lesson_assignments.map((a) => ({
        application_id: p.application_id,
        slot_id: a.slot_id,
        lesson_id: a.lesson_id,
      }))
    );

    setAcceptProgress({ current: 0, total: bulkItems.length });

    try {
      const result = await summerAPI.bulkCreateSessions(bulkItems);
      setAcceptProgress({ current: bulkItems.length, total: bulkItems.length });

      if (result.skipped > 0) {
        showToast(
          `Created ${result.created} sessions (${result.skipped} skipped — duplicates or full)`,
          "success"
        );
      } else {
        showToast(
          `Placed ${toPlace.length} student${toPlace.length !== 1 ? "s" : ""} (${result.created} sessions)`,
          "success"
        );
      }
      setAccepting(false);
      onAccepted();
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to place students", "error");
      setAccepting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 md:left-[var(--sidebar-width,72px)] z-50 flex items-center justify-center p-4 transition-[left] duration-350">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={cn(
        "relative bg-white dark:bg-[#1a1a1a] border-2 border-[#e8d4b8] rounded-xl shadow-xl w-full max-h-[85vh] flex flex-col mx-4 transition-[max-width] duration-200",
        adjustingAppId ? "max-w-5xl" : "max-w-3xl"
      )}>
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e8d4b8] bg-[#fef9f3] dark:bg-[#2d2618] rounded-t-xl">
          <Wand2 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <h2 className="text-base font-semibold flex-1">
            {applicationId ? `Suggest for ${studentName || "Student"}` : "Auto-Suggest Placements"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Algorithm explanation — collapsible */}
          <button
            onClick={() => setShowAlgorithm(!showAlgorithm)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left"
          >
            {showAlgorithm ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            )}
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>How does auto-suggest work?</span>
          </button>
          {showAlgorithm && (
            <div className="text-xs text-muted-foreground bg-[#fef9f3] dark:bg-[#2d2618] border border-[#e8d4b8]/50 rounded-lg p-3 space-y-1.5">
              <ul className="list-disc ml-4 space-y-0.5">
                <li>Finds the best slot for each student based on their preferred day/time</li>
                <li>Places all 8 lessons across available dates in that slot</li>
                <li>For 2x/week students, picks two compatible slots</li>
                <li>
                  Keeps lesson pairs in order — L1 before L2, L3 before L4, and so on
                  <span className="text-muted-foreground/60"> (each pair covers related topics)</span>
                </li>
                <li>
                  Prefers L1-L4 (algebra) and L5-L8 (geometry) in sequence, but not required
                </li>
                <li>Tries to place buddies together when requested</li>
              </ul>
              <div className="mt-2 pt-1.5 border-t border-[#e8d4b8]/30 space-y-0.5">
                <div><span className="text-green-600 dark:text-green-400 font-semibold">Good fit</span> = all pairs in the right order</div>
                <div><span className="text-yellow-600 dark:text-yellow-400 font-semibold">Okay fit</span> = most pairs in order, some may be swapped</div>
                <div><span className="text-red-600 dark:text-red-400 font-semibold">Poor fit</span> = several pairs out of order — consider adjusting manually</div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-amber-600 dark:text-amber-400" />
              <p className="text-sm text-muted-foreground">
                Running algorithm...
              </p>
            </div>
          ) : !data || data.proposals.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">
                No placements could be suggested.
              </p>
              {data && data.unplaceable.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  {data.unplaceable.length} student(s) could not be placed.
                </p>
              )}
            </div>
          ) : (
            <>
              {/* Select all */}
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.size === studentGroups.length}
                    onChange={toggleAll}
                    className="rounded"
                  />
                  Select all ({studentGroups.length} student{studentGroups.length !== 1 ? "s" : ""})
                </label>
                <span className="text-xs text-muted-foreground ml-auto">
                  {selected.size} selected
                </span>
              </div>

              {/* Proposal cards — one per student, options inside */}
              <div className="space-y-2">
                {studentGroups.map((group) => {
                  const p = group.primary;
                  const gradeBg =
                    SUMMER_GRADE_BG[p.student_grade] ||
                    "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
                  const gradeBorder =
                    SUMMER_GRADE_BORDER[p.student_grade] ||
                    "border-l-gray-400";
                  return (
                    <div
                      key={group.appId}
                      className={cn(
                        "rounded-lg border-2 border-l-4 transition-colors",
                        gradeBorder,
                        selected.has(group.appId)
                          ? "border-[#e8d4b8] bg-[#fef9f3]/50 dark:bg-[#2d2618]/50"
                          : "border-gray-200 dark:border-gray-700 hover:border-[#e8d4b8]/60"
                      )}
                    >
                      {/* Two-column layout when adjusting */}
                      <div className={cn(
                        adjustingAppId === group.appId && courseMonths ? "flex flex-col md:flex-row" : ""
                      )}>
                        {/* Left column: card body */}
                        <div className={cn(
                          "px-3 py-2.5",
                          adjustingAppId === group.appId && courseMonths && "md:flex-1 md:min-w-0"
                        )}>
                          {/* Header: checkbox + student info + adjust button */}
                          <div className="flex items-start gap-2.5">
                            <input
                              type="checkbox"
                              checked={selected.has(group.appId)}
                              onChange={() => toggleItem(group.appId)}
                              className="rounded mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium truncate">
                                  {p.student_name}
                                </span>
                                <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", gradeBg)}>
                                  {p.student_grade}
                                </span>
                                {p.sessions_per_week > 1 && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                    {p.sessions_per_week}x/wk
                                  </span>
                                )}
                              </div>

                              {/* Options: show all as radio-selectable rows */}
                              {group.hasOptions ? (
                                <div className="mt-2 space-y-1.5">
                                  {group.options.map((opt) => {
                                    const isChosen = selectedOption[group.appId] === opt.option_label;
                                    return (
                                      <label
                                        key={opt.option_label}
                                        className={cn(
                                          "flex items-start gap-2 p-1.5 rounded-md cursor-pointer border transition-colors",
                                          isChosen
                                            ? "border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10"
                                            : "border-transparent hover:bg-[#e8d4b8]/10"
                                        )}
                                      >
                                        <input
                                          type="radio"
                                          name={`option-${group.appId}`}
                                          checked={isChosen}
                                          onChange={() => {
                                            setSelectedOption(prev => ({ ...prev, [group.appId]: opt.option_label! }));
                                            if (!selected.has(group.appId)) {
                                              setSelected(prev => { const n = new Set(prev); n.add(group.appId); return n; });
                                            }
                                          }}
                                          className="mt-1 shrink-0"
                                        />
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 text-[11px]">
                                            <span className="font-bold text-foreground/60">{opt.option_label}</span>
                                            <span className="text-foreground/70 font-medium">
                                              {getSlotSummary(opt.lesson_assignments)}
                                            </span>
                                            <span className={cn("font-semibold", getQualityLabel(opt.sequence_score).className)}>
                                              {getQualityLabel(opt.sequence_score).text}
                                            </span>
                                          </div>
                                          <LessonRow assignments={opt.lesson_assignments} />
                                          <div className="text-[10px] text-muted-foreground mt-0.5">
                                            {formatReason(opt.reason, opt.sequence_score)}
                                          </div>
                                        </div>
                                      </label>
                                    );
                                  })}
                                </div>
                              ) : (
                                <>
                                  {/* Single proposal — slot summary + lesson row + reason */}
                                  <div className="flex items-center gap-2 mt-1 text-[11px]">
                                    <span className="text-foreground/70 font-medium">
                                      {getSlotSummary(p.lesson_assignments)}
                                    </span>
                                    <span className={cn("font-semibold", getQualityLabel(p.sequence_score).className)}>
                                      {getQualityLabel(p.sequence_score).text}
                                    </span>
                                  </div>
                                  <LessonRow assignments={p.lesson_assignments} />
                                  <div className="text-[10px] text-muted-foreground mt-1">
                                    {formatReason(p.reason, p.sequence_score)}
                                  </div>
                                </>
                              )}

                              {/* Unavailability warning (shared, from primary) */}
                              {p.unavailability_notes && (
                                <div className="flex items-start gap-1.5 mt-1.5 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 rounded px-2 py-1.5">
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                  <div>
                                    <span className="font-semibold">Unavailability note:</span>{" "}
                                    <span>{p.unavailability_notes}</span>
                                    <div className="text-[10px] text-amber-500 mt-0.5">
                                      Not parsed by algorithm — please cross-check manually
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Inline error from failed re-suggest */}
                              {adjustErrors[group.appId] && (
                                <div className="flex items-start gap-1.5 mt-1.5 text-[11px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 rounded px-2 py-1.5">
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                  <div>
                                    <span className="font-semibold">{adjustErrors[group.appId]}</span>
                                    <div className="text-[10px] text-red-500 mt-0.5">
                                      Try adjusting your date selection and re-suggest
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Adjust button */}
                            <button
                              className={cn(
                                "relative shrink-0 p-1.5 rounded-md transition-colors",
                                adjustingAppId === group.appId
                                  ? "text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30"
                                  : "text-muted-foreground hover:text-foreground hover:bg-[#e8d4b8]/30 dark:hover:bg-gray-800"
                              )}
                              title="Adjust date constraints"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAdjustingAppId(adjustingAppId === group.appId ? null : group.appId);
                              }}
                            >
                              <SlidersHorizontal className="h-3.5 w-3.5" />
                              {dateConstraints[group.appId]?.ranges.length > 0 && adjustingAppId !== group.appId && (
                                <span className={cn(
                                  "absolute -top-1 -right-1 min-w-[14px] h-[14px] flex items-center justify-center text-[8px] font-bold rounded-full text-white",
                                  dateConstraints[group.appId]?.mode === "include" ? "bg-green-500" : "bg-red-500"
                                )}>
                                  {dateConstraints[group.appId].ranges.length}
                                </span>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Right column: Date constraint panel */}
                        {adjustingAppId === group.appId && courseMonths && (
                          <DateConstraintPanel
                            appId={group.appId}
                            constraints={dateConstraints[group.appId]}
                            courseMonths={courseMonths}
                            adjustError={adjustErrors[group.appId]}
                            onConstraintsChange={setConstraintsFor}
                            onClearError={clearError}
                            onResuggest={handlePanelResuggest}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Unplaceable */}
              {data.unplaceable.length > 0 && (
                <div className="pt-4 border-t border-[#e8d4b8]/50">
                  <div className="flex items-center gap-1.5 text-sm text-orange-600 dark:text-orange-400 mb-2">
                    <AlertTriangle className="h-4 w-4" />
                    Could not place ({data.unplaceable.length})
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {data.unplaceable.map((u) => (
                      <div key={u.application_id}>
                        {u.student_name}: {u.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {data && data.proposals.length > 0 && (
          <div className="flex items-center gap-3 px-5 py-4 border-t border-[#e8d4b8] bg-[#fef9f3] dark:bg-[#2d2618] rounded-b-xl">
            {accepting && acceptProgress.total > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>
                  {acceptProgress.current}/{acceptProgress.total} lessons
                </span>
              </div>
            )}
            <button
              onClick={onClose}
              disabled={accepting}
              className="px-4 py-2 text-sm rounded-lg border border-[#e8d4b8] hover:bg-[#fef9f3] dark:hover:bg-[#2d2618] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAccept}
              disabled={selected.size === 0 || accepting}
              className="ml-auto inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {accepting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Accept {selected.size} student{selected.size !== 1 ? "s" : ""}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
