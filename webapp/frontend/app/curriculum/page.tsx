"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useSearchParams } from "next/navigation";
import { Map as MapIcon, FileText, Loader2, Target, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useCurriculumConcepts, useCurriculumCoverage, useCurriculumTimeline } from "@/lib/hooks";
import {
  computeConceptLanes,
  mergePacingRows,
  parseWeekJumpInput,
  type ConceptLane,
  type PacingRow,
} from "@/lib/curriculum-bands";
import { conceptNameForStream, sourcesText } from "@/lib/curriculum-labels";
import {
  ATLAS_GRADES,
  previousAcademicYear,
  toAtlasInputs,
} from "@/lib/curriculum-atlas";
import { CurriculumAtlas } from "@/components/curriculum/CurriculumAtlas";
import { CurriculumExamStrip } from "@/components/curriculum/CurriculumExamStrip";
import { CurriculumSearch } from "@/components/curriculum/CurriculumSearch";
import { CurriculumTopicFiles } from "@/components/curriculum/CurriculumTopicFiles";
import type { CurriculumPacingBand } from "@/types";

const selectClass =
  "text-xs px-2 py-1.5 rounded-lg border border-[#d4a574]/60 dark:border-[#8b6f47] bg-white dark:bg-[#1a1a1a] text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-teal-500";

// Width of the topic-label column inside the horizontally scrollable charts.
const LABEL_W = "11rem";
const LABEL_W_PX = 176;
const CHART_MIN_W = 640;

// Fixed colour per comparison slot: the colour follows the school, never its
// position in a filtered list.
const SLOT_STYLES = [
  {
    band: "bg-teal-300 dark:bg-teal-800/80",
    mean: "bg-teal-600 dark:bg-teal-400",
    dot: "bg-teal-500",
  },
  {
    band: "bg-amber-300 dark:bg-amber-700/80",
    mean: "bg-amber-600 dark:bg-amber-400",
    dot: "bg-amber-500",
  },
  {
    band: "bg-violet-300 dark:bg-violet-700/80",
    mean: "bg-violet-600 dark:bg-violet-400",
    dot: "bg-violet-500",
  },
];

interface Combo {
  school: string;
  grade: string;
  stream: string | null;
}

function comboKey(c: Combo): string {
  return `${c.school}||${c.grade}||${c.stream || ""}`;
}

function comboLabel(c: Combo): string {
  return `${c.school} ${c.grade}${c.stream ? ` (${c.stream})` : ""}`;
}

function weekLeft(week: number, maxWeek: number): string {
  return `calc(${LABEL_W} + (100% - ${LABEL_W}) * ${(week - 0.5) / maxWeek})`;
}

function axisTicks(maxWeek: number): number[] {
  const ticks: number[] = [];
  for (let w = 4; w <= maxWeek; w += 4) ticks.push(w);
  return ticks;
}

interface PacingComboEntry {
  combo: Combo;
  pacing: CurriculumPacingBand[] | null;
  slot: number;
}

/** Sticky week-number header shared by the Gantt and pacing charts; the
 * Gantt passes its clickable week-lookup layer as children. */
function WeekAxis({
  maxWeek,
  currentWeek,
  children,
}: {
  maxWeek: number;
  currentWeek: number | null | undefined;
  children?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-30 flex h-6 bg-[#fef9f3] dark:bg-[#2d2618] border-b border-[#d4a574]/20 dark:border-[#8b6f47]/30">
      <div
        className="sticky left-0 z-30 shrink-0 bg-[#fef9f3] dark:bg-[#2d2618] flex items-center px-4"
        style={{ width: LABEL_W }}
      >
        <span className="text-[9px] uppercase tracking-wide text-gray-400">
          Topic
        </span>
      </div>
      <div className="relative flex-1">
        {axisTicks(maxWeek).map((w) => (
          <span
            key={w}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-[9px] text-gray-400 tabular-nums"
            style={{ left: `${((w - 0.5) / maxWeek) * 100}%` }}
          >
            {w}
          </span>
        ))}
        {currentWeek != null && (
          <span
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-[9px] font-medium text-rose-500 bg-[#fef9f3] dark:bg-[#2d2618] px-0.5"
            style={{ left: `${((currentWeek - 0.5) / maxWeek) * 100}%` }}
          >
            Now
          </span>
        )}
        {children}
      </div>
    </div>
  );
}

// The two chart bodies are memoized so typing in the week-jump box (state in
// the page component) does not re-render hundreds of positioned divs.

const GanttLanes = memo(function GanttLanes({
  lanes,
  maxWeek,
  stream,
  expandedLane,
  setExpandedLane,
  onTopicFiles,
}: {
  lanes: ConceptLane[];
  maxWeek: number;
  stream: string | null;
  expandedLane: number | null;
  setExpandedLane: Dispatch<SetStateAction<number | null>>;
  onTopicFiles: (t: { conceptId: number; name: string }) => void;
}) {
  const toggleLane = (conceptId: number) =>
    setExpandedLane((prev) => (prev === conceptId ? null : conceptId));
  return (
    <>
      {lanes.map((lane: ConceptLane) => (
        <div key={lane.conceptId}>
          {/* Two side-by-side buttons rather than one row-wide button,
              so the worksheets shortcut is not a nested button. */}
          <div className="w-full flex h-7 items-stretch group">
            <div
              className="sticky left-0 z-20 shrink-0 bg-[#fef9f3] dark:bg-[#2d2618] group-hover:bg-teal-50/60 dark:group-hover:bg-teal-900/10 flex items-center gap-1 pl-4 pr-2"
              style={{ width: LABEL_W }}
            >
              <button
                type="button"
                aria-expanded={expandedLane === lane.conceptId}
                onClick={() => toggleLane(lane.conceptId)}
                className="flex-1 min-w-0 h-full flex items-center text-left"
              >
                <span
                  className="text-[10px] text-gray-600 dark:text-gray-300 truncate"
                  title={conceptNameForStream(lane, stream)}
                >
                  {conceptNameForStream(lane, stream)}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Worksheets for ${conceptNameForStream(lane, stream)}`}
                title="See the worksheets for this topic"
                onClick={() =>
                  onTopicFiles({
                    conceptId: lane.conceptId,
                    name: conceptNameForStream(lane, stream),
                  })
                }
                className="p-0.5 rounded shrink-0 text-gray-400 opacity-60 group-hover:opacity-100 hover:text-teal-600 dark:hover:text-teal-400 transition-opacity"
              >
                <FileText className="h-3 w-3" />
              </button>
            </div>
            <div
              className="relative flex-1 cursor-pointer group-hover:bg-teal-50/40 dark:group-hover:bg-teal-900/5"
              onClick={() => toggleLane(lane.conceptId)}
            >
              {lane.segments.map((seg) => (
                <div
                  key={`${seg.startWeek}-${seg.primary}`}
                  className={cn(
                    "absolute top-1/2 -translate-y-1/2 h-3 rounded",
                    seg.primary
                      ? "bg-teal-500/90 dark:bg-teal-500/80"
                      : "bg-teal-200 dark:bg-teal-900/60"
                  )}
                  style={{
                    left: `${((seg.startWeek - 1) / maxWeek) * 100}%`,
                    width: `${Math.max(
                      ((seg.endWeek - seg.startWeek + 1) / maxWeek) * 100,
                      0.8
                    )}%`,
                  }}
                  title={`${
                    seg.startWeek === seg.endWeek
                      ? `Week ${seg.startWeek}`
                      : `Weeks ${seg.startWeek} to ${seg.endWeek}`
                  }${seg.primary ? " · main topic" : " · also seen"}`}
                />
              ))}
            </div>
          </div>
          {expandedLane === lane.conceptId && (
            <div className="flex bg-teal-50/40 dark:bg-teal-900/10">
              <div
                className="sticky left-0 z-20 shrink-0 bg-[#fef9f3] dark:bg-[#2d2618]"
                style={{ width: LABEL_W }}
              />
              <div className="flex-1 flex flex-wrap gap-1 px-1 py-1.5">
                {lane.weeks.map((w) => (
                  <span
                    key={w.week_number}
                    className={cn(
                      "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] border",
                      w.rank === 1
                        ? "border-teal-300 dark:border-teal-700 bg-white dark:bg-teal-900/30 text-teal-800 dark:text-teal-300"
                        : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 text-gray-500 dark:text-gray-400"
                    )}
                    title={
                      w.weight >= 0.7
                        ? "Strong signal this week"
                        : "Weaker signal this week"
                    }
                  >
                    Wk {w.week_number} · {sourcesText(w.sources)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </>
  );
});

const PacingChartRows = memo(function PacingChartRows({
  rows,
  combos,
  maxWeek,
  labelStream,
  onTopicFiles,
}: {
  rows: PacingRow[];
  combos: PacingComboEntry[];
  maxWeek: number;
  labelStream: string | null;
  onTopicFiles: (t: { conceptId: number; name: string }) => void;
}) {
  return (
    <div className="py-2 space-y-1">
      {rows.map((row) => (
        <div key={row.conceptId} className="flex items-stretch group">
          <div
            className="sticky left-0 z-10 shrink-0 bg-[#fef9f3] dark:bg-[#2d2618] flex items-center gap-1 pl-4 pr-2"
            style={{ width: LABEL_W }}
          >
            <span
              className="flex-1 min-w-0 text-[10px] text-gray-600 dark:text-gray-300 truncate"
              title={conceptNameForStream(row, labelStream)}
            >
              {conceptNameForStream(row, labelStream)}
            </span>
            <button
              type="button"
              aria-label={`Worksheets for ${conceptNameForStream(row, labelStream)}`}
              title="See the worksheets for this topic"
              onClick={() =>
                onTopicFiles({
                  conceptId: row.conceptId,
                  name: conceptNameForStream(row, labelStream),
                })
              }
              className="p-0.5 rounded shrink-0 text-gray-400 opacity-60 group-hover:opacity-100 hover:text-teal-600 dark:hover:text-teal-400 transition-opacity"
            >
              <FileText className="h-3 w-3" />
            </button>
          </div>
          <div className="flex-1 flex flex-col justify-center gap-0.5 py-0.5">
            {row.cells.map((cell, idx) => (
              <div
                key={idx}
                className={cn("relative", combos.length > 1 ? "h-2" : "h-3.5")}
              >
                <div className="absolute inset-y-0.5 left-0 right-0 rounded bg-black/[0.05] dark:bg-white/[0.06]" />
                {cell && (
                  <>
                    <div
                      className={cn(
                        "absolute inset-y-0.5 rounded",
                        SLOT_STYLES[combos[idx].slot].band,
                        cell.fromEquivalent &&
                          "bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,0.45)_3px,rgba(255,255,255,0.45)_5px)]"
                      )}
                      style={{
                        left: `${((cell.band.min_week - 1) / maxWeek) * 100}%`,
                        width: `${Math.max(
                          ((cell.band.max_week - cell.band.min_week + 1) / maxWeek) * 100,
                          1.5
                        )}%`,
                      }}
                      title={`${comboLabel(combos[idx].combo)}: weeks ${cell.band.min_week} to ${cell.band.max_week}, usually around week ${cell.band.mean_week} (${cell.band.years_observed} year${cell.band.years_observed === 1 ? "" : "s"} observed)${
                        cell.fromEquivalent
                          ? ` · their matching chapter: ${conceptNameForStream(cell.band, combos[idx].combo.stream)}`
                          : ""
                      }`}
                    />
                    <div
                      className={cn(
                        "absolute inset-y-0 w-1 rounded",
                        SLOT_STYLES[combos[idx].slot].mean
                      )}
                      style={{
                        left: `calc(${((cell.band.mean_week - 0.5) / maxWeek) * 100}% - 2px)`,
                      }}
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
});

export default function CurriculumPage() {
  const {
    data: coverage,
    isLoading: coverageLoading,
    error: coverageError,
  } = useCurriculumCoverage();

  // Paper texture is skipped on mobile, same as the other desk pages.
  const isMobile = useIsMobile();

  // Pickers hydrate from the URL so session pages can deep-link a
  // school-grade-week and tutors can share what they're looking at.
  const searchParams = useSearchParams();
  const [school, setSchool] = useState<string | null>(() => searchParams.get("school"));
  const [grade, setGrade] = useState<string | null>(() => searchParams.get("grade"));
  const [year, setYear] = useState<string | null>(() => searchParams.get("year"));
  // Timeline charts or the concept-map atlas — same pickers drive both.
  const [view, setView] = useState<"timeline" | "atlas">(() =>
    searchParams.get("view") === "atlas" ? "atlas" : "timeline"
  );
  const [expandedLane, setExpandedLane] = useState<number | null>(null);
  const [topicFiles, setTopicFiles] = useState<{ conceptId: number; name: string } | null>(null);
  // Week the tutor jumped to (highlight column + week card on the Gantt).
  const [focusWeek, setFocusWeek] = useState<number | null>(() => {
    const w = parseInt(searchParams.get("week") || "", 10);
    return Number.isFinite(w) && w >= 1 ? w : null;
  });
  const [weekQuery, setWeekQuery] = useState("");
  const [weekQueryInvalid, setWeekQueryInvalid] = useState(false);
  const ganttScrollRef = useRef<HTMLDivElement>(null);
  // Each comparison keeps the colour slot it claimed when added, so removing
  // one never repaints the survivors (slot 0 is the primary school).
  const [compares, setCompares] = useState<{ combo: Combo; slot: number }[]>([]);

  const schools = useMemo(
    () => Array.from(new Set((coverage || []).map((r) => r.school))).sort(),
    [coverage]
  );
  const grades = useMemo(
    () =>
      Array.from(
        new Set((coverage || []).filter((r) => r.school === school).map((r) => r.grade))
      ).sort(),
    [coverage, school]
  );
  // Schools are single-language in practice; the odd opposite-stream row is
  // labelling noise, so each school-grade resolves to its dominant stream by
  // observation weight (no stream picker).
  const dominantStreams = useMemo(() => {
    const weights = new Map<string, Map<string, number>>();
    for (const r of coverage || []) {
      const key = `${r.school}||${r.grade}`;
      const byStream = weights.get(key) || new Map<string, number>();
      const s = r.lang_stream || "";
      byStream.set(s, (byStream.get(s) || 0) + r.total_weight);
      weights.set(key, byStream);
    }
    const out = new Map<string, string | null>();
    for (const [key, byStream] of weights) {
      let best = "";
      let bestWeight = -1;
      for (const [s, w] of byStream) {
        if (w > bestWeight) {
          bestWeight = w;
          best = s;
        }
      }
      out.set(key, best || null);
    }
    return out;
  }, [coverage]);

  const effectiveGrade = grade && grades.includes(grade) ? grade : grades[0] || null;
  const effectiveStream =
    school && effectiveGrade
      ? dominantStreams.get(`${school}||${effectiveGrade}`) ?? null
      : null;

  // The atlas always tracks the current year (its overlay and cohort
  // history hang off "now"); year browsing is a timeline-view feature.
  const {
    data: timeline,
    isLoading: timelineLoading,
    error: timelineError,
  } = useCurriculumTimeline(
    school,
    effectiveGrade,
    effectiveStream || null,
    view === "atlas" ? null : year
  );
  // Comparison timelines (pacing is all-years, so no year param).
  const { data: cmp0 } = useCurriculumTimeline(
    compares[0]?.combo.school ?? null,
    compares[0]?.combo.grade ?? null,
    compares[0]?.combo.stream ?? null,
    null
  );
  const { data: cmp1 } = useCurriculumTimeline(
    compares[1]?.combo.school ?? null,
    compares[1]?.combo.grade ?? null,
    compares[1]?.combo.stream ?? null,
    null
  );

  const displayYear = timeline?.academic_year || year;

  // Cohort history for the atlas: the selected class was the grade below in
  // the previous year (F3 2025-2026 was F2 2024-2025), so the earlier
  // columns can show what this cohort actually covered. Only fetched for
  // the atlas view on a current-year timeline.
  const atlasGradeIdx = effectiveGrade
    ? (ATLAS_GRADES as string[]).indexOf(effectiveGrade)
    : -1;
  const cohortEligible =
    view === "atlas" && !!school && timeline?.current_week != null && atlasGradeIdx > 0;
  const cohortYear1 =
    cohortEligible && displayYear ? previousAcademicYear(displayYear) : null;
  const cohortYear2 =
    cohortYear1 && atlasGradeIdx > 1 ? previousAcademicYear(cohortYear1) : null;
  const { data: cohortPrev1 } = useCurriculumTimeline(
    cohortYear1 ? school : null,
    cohortYear1 ? ATLAS_GRADES[atlasGradeIdx - 1] : null,
    effectiveStream || null,
    cohortYear1
  );
  const { data: cohortPrev2 } = useCurriculumTimeline(
    cohortYear2 ? school : null,
    cohortYear2 ? ATLAS_GRADES[atlasGradeIdx - 2] : null,
    effectiveStream || null,
    cohortYear2
  );

  // Memoised: pacingCombos/pacingRows and the memoised pacing chart key off
  // this object's identity, so a fresh literal every render would defeat them.
  const primaryCombo: Combo | null = useMemo(
    () =>
      school && effectiveGrade
        ? { school, grade: effectiveGrade, stream: effectiveStream || null }
        : null,
    [school, effectiveGrade, effectiveStream]
  );
  const primaryKey = primaryCombo ? comboKey(primaryCombo) : null;

  // A comparison that becomes the primary school would show twice in two
  // colours, so drop it from the comparison list.
  useEffect(() => {
    if (!primaryKey) return;
    setCompares((prev) => prev.filter((c) => comboKey(c.combo) !== primaryKey));
  }, [primaryKey]);

  // All known combos for the comparison picker (dominant stream only), minus
  // ones already on screen.
  const compareOptions = useMemo(() => {
    const taken = new Set(
      [primaryCombo, ...compares.map((c) => c.combo)]
        .filter(Boolean)
        .map((c) => comboKey(c as Combo))
    );
    const options: Combo[] = [];
    for (const [key, s] of dominantStreams) {
      const [schoolName, gradeName] = key.split("||");
      const combo = { school: schoolName, grade: gradeName, stream: s };
      if (taken.has(comboKey(combo))) continue;
      options.push(combo);
    }
    return options.sort((a, b) => comboLabel(a).localeCompare(comboLabel(b)));
  }, [dominantStreams, primaryCombo, compares]);

  // Thin current-year records are where tutor confirmations help most.
  // Warn on the picked school only (Kenny 2026-07-16, replacing the
  // page-level "schools we know least about" list); dominant stream only —
  // stray opposite-stream rows are not real gaps.
  const thinWeeks = useMemo(() => {
    if (!coverage || !school || !effectiveGrade) return null;
    const latestYear = coverage.reduce(
      (max, r) => (r.academic_year > max ? r.academic_year : max),
      ""
    );
    const row = coverage.find(
      (r) =>
        r.academic_year === latestYear &&
        r.school === school &&
        r.grade === effectiveGrade &&
        (r.lang_stream || null) === (effectiveStream || null)
    );
    return row && row.weeks_observed < 8 ? row.weeks_observed : null;
  }, [coverage, school, effectiveGrade, effectiveStream]);

  const lanes = useMemo(
    () => (timeline ? computeConceptLanes(timeline.weeks) : []),
    [timeline]
  );

  const ganttMaxWeek = useMemo(() => {
    const weeks = lanes.map((l) => l.lastWeek);
    if (timeline?.current_week) weeks.push(timeline.current_week);
    return Math.max(44, ...weeks);
  }, [lanes, timeline]);

  // "16–22 Mar" / "30 Mar – 5 Apr" per week, computed once per timeline —
  // the axis renders two labels per week button, so per-render Date parsing
  // is real work at 44+ columns.
  const weekLabelsByNumber = useMemo(() => {
    const m = new Map<number, string>();
    const dayMonth = (d: Date) =>
      d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    for (const w of timeline?.week_dates || []) {
      const start = new Date(`${w.start_date}T12:00:00`);
      const end = new Date(`${w.end_date}T12:00:00`);
      m.set(
        w.week_number,
        start.getMonth() === end.getMonth()
          ? `${start.getDate()}–${dayMonth(end)}`
          : `${dayMonth(start)} – ${dayMonth(end)}`
      );
    }
    return m;
  }, [timeline]);

  const weekDateLabel = useCallback(
    (week: number): string | null => weekLabelsByNumber.get(week) ?? null,
    [weekLabelsByNumber]
  );

  const scrollToWeek = useCallback(
    (week: number, behavior: ScrollBehavior = "smooth") => {
      const el = ganttScrollRef.current;
      if (!el) return;
      const chartWidth = el.scrollWidth - LABEL_W_PX;
      const target =
        LABEL_W_PX + (chartWidth * (week - 0.5)) / ganttMaxWeek - el.clientWidth / 2;
      el.scrollTo({ left: Math.max(0, target), behavior });
    },
    [ganttMaxWeek]
  );

  // First load of a school-grade-year lands on the deep-linked week if there
  // is one, else "now" instead of week 1 (in spring the interesting region is
  // otherwise off-screen).
  const autoScrolledKey = useRef<string | null>(null);
  useEffect(() => {
    const target = focusWeek ?? timeline?.current_week;
    if (target == null || lanes.length === 0) return;
    // In atlas view the Gantt is unmounted; bail before burning the one-shot
    // key so the scroll still happens when the user switches to Timeline.
    if (view !== "timeline" || !ganttScrollRef.current) return;
    const key = `${school}||${effectiveGrade}||${displayYear}`;
    if (autoScrolledKey.current === key) return;
    autoScrolledKey.current = key;
    scrollToWeek(target, "auto");
  }, [timeline, lanes, school, effectiveGrade, displayYear, focusWeek, scrollToWeek, view]);

  // Reflect the current view in the URL (guarded: Next patches replaceState,
  // so an unconditional call would loop via useSearchParams).
  useEffect(() => {
    const params = new URLSearchParams();
    if (view === "atlas") params.set("view", "atlas");
    if (school) {
      params.set("school", school);
      if (effectiveGrade) params.set("grade", effectiveGrade);
      if (displayYear) params.set("year", displayYear);
      if (focusWeek != null) params.set("week", String(focusWeek));
    }
    const qs = params.toString();
    const newUrl = qs ? `/curriculum?${qs}` : "/curriculum";
    if (newUrl !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, "", newUrl);
    }
  }, [view, school, effectiveGrade, displayYear, focusWeek]);

  // Everything week-related is scoped to one school-grade, so any school
  // change (dropdown or gap chip) must reset the whole lot together.
  const changeSchool = useCallback(
    (nextSchool: string | null, nextGrade: string | null = null) => {
      setSchool(nextSchool);
      setGrade(nextGrade);
      setYear(null);
      setExpandedLane(null);
      setFocusWeek(null);
      setWeekQuery("");
      setWeekQueryInvalid(false);
    },
    []
  );

  const jumpToWeek = useCallback(
    (week: number | null) => {
      setFocusWeek(week);
      if (week != null) scrollToWeek(week);
    },
    [scrollToWeek]
  );

  const handleWeekQuerySubmit = useCallback(() => {
    const week = parseWeekJumpInput(weekQuery, timeline?.week_dates || [], ganttMaxWeek);
    if (week == null) {
      setWeekQueryInvalid(weekQuery.trim().length > 0);
      return;
    }
    setWeekQueryInvalid(false);
    jumpToWeek(week);
  }, [weekQuery, timeline, ganttMaxWeek, jumpToWeek]);

  const focusWeekConcepts = useMemo(() => {
    if (focusWeek == null || !timeline) return null;
    return timeline.weeks.find((w) => w.week_number === focusWeek)?.concepts || [];
  }, [focusWeek, timeline]);

  // Pacing rows: union of concepts across the primary and compared schools,
  // ordered by the primary school's pace.
  const pacingCombos = useMemo(() => {
    const entries: PacingComboEntry[] = [];
    if (primaryCombo)
      entries.push({ combo: primaryCombo, pacing: timeline?.pacing ?? null, slot: 0 });
    if (compares[0])
      entries.push({ combo: compares[0].combo, pacing: cmp0?.pacing ?? null, slot: compares[0].slot });
    if (compares[1])
      entries.push({ combo: compares[1].combo, pacing: cmp1?.pacing ?? null, slot: compares[1].slot });
    return entries;
  }, [primaryCombo, timeline, compares, cmp0, cmp1]);

  // Cross-series equivalence: lets an MAS school's chapter share a lane with
  // the matching HK chapter when the comparison mixes series.
  const { data: conceptVocab, error: conceptVocabError } = useCurriculumConcepts();
  const equivalentIds = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const c of conceptVocab || []) {
      if (c.equivalent_ids?.length) m.set(c.id, c.equivalent_ids);
    }
    return m;
  }, [conceptVocab]);

  const atlasInputs = useMemo(() => toAtlasInputs(conceptVocab || []), [conceptVocab]);

  const pacingRows = useMemo(
    () =>
      mergePacingRows(
        pacingCombos.map(({ pacing }) => pacing),
        equivalentIds
      ),
    [pacingCombos, equivalentIds]
  );

  // Pacing labels stay single-language unless the comparison actually mixes
  // schools of different languages.
  const pacingLabelStream = useMemo(() => {
    const streams = pacingCombos.map(({ combo }) => combo.stream);
    if (streams.length === 0) return null;
    return streams.every((s) => s === streams[0]) ? streams[0] : null;
  }, [pacingCombos]);

  const pacingMaxWeek = useMemo(() => {
    const weeks = pacingRows.flatMap((r) =>
      r.cells.filter(Boolean).map((cell) => cell!.band.max_week)
    );
    return Math.max(44, ...weeks);
  }, [pacingRows]);

  return (
    <DeskSurface>
      <PageTransition className="flex flex-col gap-3 p-2 sm:p-4">
        {/* Toolbar */}
        <div className="sticky top-0 z-30">
          <div
            className={cn(
              "flex flex-wrap items-center gap-2 sm:gap-3",
              "bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47]",
              "rounded-lg px-3 sm:px-4 py-2",
              !isMobile && "paper-texture"
            )}
          >
            <div className="flex items-center gap-2">
              <MapIcon className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">
                Curriculum
              </h1>
            </div>

            <div
              className="flex rounded-lg border border-[#d4a574]/60 dark:border-[#8b6f47] overflow-hidden"
              role="group"
              aria-label="View"
            >
              {(["timeline", "atlas"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={cn(
                    "text-xs px-3 py-1.5 font-medium transition-colors",
                    view === v
                      ? "bg-teal-600 dark:bg-teal-500 text-white"
                      : "text-gray-500 dark:text-gray-400 hover:text-teal-600 dark:hover:text-teal-400"
                  )}
                >
                  {v === "timeline" ? "Timeline" : "Atlas"}
                </button>
              ))}
            </div>

            <div className="h-6 w-px bg-[#d4a574]/50 hidden sm:block" />

            <select
              className={selectClass}
              value={school || ""}
              onChange={(e) => changeSchool(e.target.value || null)}
            >
              <option value="">Pick a school…</option>
              {schools.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {school && (
              <select
                className={selectClass}
                value={effectiveGrade || ""}
                onChange={(e) => {
                  setGrade(e.target.value);
                  setYear(null);
                  setExpandedLane(null);
                  setFocusWeek(null);
                }}
              >
                {grades.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            )}
            {school && effectiveStream && (
              <span className="text-xs px-2 py-1.5 rounded-lg border border-[#d4a574]/40 dark:border-[#8b6f47]/60 text-gray-500 dark:text-gray-400">
                {effectiveStream}
              </span>
            )}
            {view === "timeline" && timeline && timeline.years_available.length > 0 && (
              <select
                className={selectClass}
                value={displayYear || ""}
                onChange={(e) => {
                  setYear(e.target.value);
                  setExpandedLane(null);
                  setFocusWeek(null);
                }}
              >
                {timeline.years_available.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            )}
            {(coverageLoading || timelineLoading) && (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            )}
          </div>
        </div>

        {/* Free search */}
        <CurriculumSearch
          scope={
            primaryCombo
              ? {
                  school: primaryCombo.school,
                  grade: primaryCombo.grade,
                  lang_stream: primaryCombo.stream,
                }
              : null
          }
        />

        {/* Tests and exams with their revision packs */}
        {school && effectiveGrade && (
          <CurriculumExamStrip
            school={school}
            grade={effectiveGrade}
            langStream={effectiveStream || null}
            isMobile={isMobile}
          />
        )}

        {/* Thin-records warning for the picked school */}
        {view === "timeline" && thinWeeks != null && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-[11px] text-amber-900 dark:text-amber-200">
            <Target className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <span>
              Only {thinWeeks} week{thinWeeks === 1 ? "" : "s"} of records for
              this school year so far. Confirming topics in the exercise window
              builds this timeline.
            </span>
          </div>
        )}

        {view === "timeline" && !school && !coverageLoading && (
          <div
            className={cn(
              "text-sm text-gray-600 dark:text-gray-300 bg-[#fef9f3] dark:bg-[#2d2618]",
              "border-2 border-dashed border-[#d4a574]/70 dark:border-[#8b6f47] rounded-lg p-8 text-center",
              !isMobile && "paper-texture"
            )}
          >
            {coverageError && !coverage ? (
              // The school picker is empty in this state — don't tell the
              // user to pick from it.
              <p>The school list could not load. Refresh the page to try again.</p>
            ) : (
              <>
                <p>
                  Pick a school above to see its weekly topic timeline, or search a
                  topic directly.
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Built from assignments, prep folders, curriculum sheets and tutor
                  confirmations.
                </p>
              </>
            )}
          </div>
        )}

        {/* Concept-map atlas (grade x strand, prerequisite arrows) */}
        {view === "atlas" && (
          <div
            className={cn(
              "isolate bg-[#fef9f3] dark:bg-[#2d2618] rounded-lg border-2 border-[#d4a574] dark:border-[#8b6f47] overflow-hidden",
              !isMobile && "paper-texture"
            )}
          >
            {atlasInputs.concepts.length === 0 ? (
              <p className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                {conceptVocabError
                  ? "The concept map could not load. Refresh the page to try again."
                  : "The concept map is still loading."}
              </p>
            ) : (
              <CurriculumAtlas
                concepts={atlasInputs.concepts}
                edges={atlasInputs.edges}
                timeline={school ? (timeline ?? null) : null}
                timelineLoading={!!school && timelineLoading}
                cohortTimelines={
                  cohortEligible
                    ? [
                        cohortYear1 ? cohortPrev1 : null,
                        cohortYear2 ? cohortPrev2 : null,
                      ]
                    : undefined
                }
                stream={school ? effectiveStream : null}
                selectedGrade={school ? effectiveGrade : null}
                isMobile={isMobile}
                onOpenFiles={setTopicFiles}
              />
            )}
          </div>
        )}

        {/* This year's progression (Gantt lanes) */}
        {view === "timeline" && school && timeline && lanes.length > 0 && (
          <div
            className={cn(
              "isolate bg-[#fef9f3] dark:bg-[#2d2618] rounded-lg border-2 border-[#d4a574] dark:border-[#8b6f47] overflow-hidden",
              !isMobile && "paper-texture"
            )}
          >
            <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-[#d4a574]/40 dark:border-[#8b6f47]/60 bg-gradient-to-r from-teal-50 to-[#fef9f3] dark:from-teal-900/20 dark:to-[#2d2618]">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                {timeline.school} {timeline.grade}
                {timeline.lang_stream ? ` (${timeline.lang_stream})` : ""} · {displayYear}
              </span>
              <span className="text-[10px] text-gray-400 hidden lg:inline">
                Solid = main topic that week · Faint = also seen · Tap a row for detail
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                <input
                  type="text"
                  aria-label="Go to week"
                  value={weekQuery}
                  onChange={(e) => {
                    setWeekQuery(e.target.value);
                    setWeekQueryInvalid(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleWeekQuerySubmit();
                  }}
                  placeholder="Week 30 or 18 Mar"
                  className={cn(
                    "w-32 text-[11px] px-2 py-1 rounded-lg border bg-white dark:bg-[#1a1a1a] text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-teal-500",
                    weekQueryInvalid
                      ? "border-rose-300 dark:border-rose-700"
                      : "border-[#d4a574]/60 dark:border-[#8b6f47]"
                  )}
                  title="Type a week number or a date and press Enter"
                />
                {timeline.current_week != null && (
                  <button
                    type="button"
                    onClick={() => jumpToWeek(timeline.current_week)}
                    className="text-[10px] px-1.5 py-1 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                  >
                    Today
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-auto max-h-[30rem]" ref={ganttScrollRef}>
              <div className="relative" style={{ minWidth: CHART_MIN_W }}>
                {/* Focused-week column */}
                {focusWeek != null && (
                  <div
                    className="absolute top-0 bottom-0 bg-teal-400/15 dark:bg-teal-300/10 border-x border-teal-400/40 dark:border-teal-500/40 z-[4] pointer-events-none"
                    style={{
                      left: `calc(${LABEL_W} + (100% - ${LABEL_W}) * ${(focusWeek - 1) / ganttMaxWeek})`,
                      width: `calc((100% - ${LABEL_W}) / ${ganttMaxWeek})`,
                    }}
                  />
                )}
                {/* Now marker */}
                {timeline.current_week != null && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-rose-400/80 z-10 pointer-events-none"
                    style={{ left: weekLeft(timeline.current_week, ganttMaxWeek) }}
                  />
                )}

                {/* Week axis. Sits above the lane label cells (z-20) so topic
                    labels scrolling past can never paint over the header. */}
                <WeekAxis maxWeek={ganttMaxWeek} currentWeek={timeline.current_week}>
                  {/* Every axis column is a week-lookup target */}
                  <div className="absolute inset-0 flex">
                    {Array.from({ length: ganttMaxWeek }, (_, i) => i + 1).map((w) => (
                      <button
                        key={w}
                        type="button"
                        aria-label={`Week ${w}`}
                        title={`Week ${w}${weekDateLabel(w) ? ` · ${weekDateLabel(w)}` : ""}`}
                        onClick={() => jumpToWeek(focusWeek === w ? null : w)}
                        className="flex-1 h-full hover:bg-teal-400/15 dark:hover:bg-teal-300/10"
                      />
                    ))}
                  </div>
                </WeekAxis>

                <GanttLanes
                  lanes={lanes}
                  maxWeek={ganttMaxWeek}
                  stream={effectiveStream}
                  expandedLane={expandedLane}
                  setExpandedLane={setExpandedLane}
                  onTopicFiles={setTopicFiles}
                />
                <div className="h-2" />
              </div>
            </div>

            {/* Week card: what this school was doing in the focused week */}
            {focusWeek != null && focusWeekConcepts && (
              <div className="border-t border-[#d4a574]/40 dark:border-[#8b6f47]/60 px-4 py-2 bg-teal-50/40 dark:bg-teal-900/10">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                      Week {focusWeek}
                      {weekDateLabel(focusWeek) ? ` · ${weekDateLabel(focusWeek)}` : ""}
                      {focusWeek === timeline.current_week && (
                        <span className="ml-1.5 text-[9px] font-medium text-rose-500">
                          this week
                        </span>
                      )}
                    </div>
                    {focusWeekConcepts.length === 0 ? (
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                        No records for this week yet.
                      </p>
                    ) : (
                      <div className="mt-1 space-y-0.5">
                        {focusWeekConcepts.map((c) => (
                          <div key={c.concept_id} className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                "text-[11px] truncate",
                                c.rank === 1
                                  ? "font-medium text-teal-800 dark:text-teal-300"
                                  : "text-gray-600 dark:text-gray-400"
                              )}
                            >
                              {conceptNameForStream(c, effectiveStream)}
                            </span>
                            <span className="text-[9px] text-gray-400 shrink-0">
                              {c.rank === 1 ? "Main topic" : "Also covered"}
                            </span>
                            <button
                              type="button"
                              aria-label={`Worksheets for ${conceptNameForStream(c, effectiveStream)}`}
                              title="See the worksheets for this topic"
                              onClick={() =>
                                setTopicFiles({
                                  conceptId: c.concept_id,
                                  name: conceptNameForStream(c, effectiveStream),
                                })
                              }
                              className="p-0.5 rounded shrink-0 text-gray-400 hover:text-teal-600 dark:hover:text-teal-400"
                            >
                              <FileText className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="Close week detail"
                    onClick={() => setFocusWeek(null)}
                    className="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* A failed fetch must not render as convincing emptiness: every
            block below gates on `timeline`, so without this card an error
            would leave just the toolbar with no explanation. */}
        {view === "timeline" && school && !timeline && !timelineLoading && timelineError && (
          <div
            className={cn(
              "text-sm text-gray-600 dark:text-gray-300 bg-[#fef9f3] dark:bg-[#2d2618]",
              "border-2 border-dashed border-[#d4a574]/70 dark:border-[#8b6f47] rounded-lg p-6 text-center",
              !isMobile && "paper-texture"
            )}
          >
            The timeline for this school could not load. Refresh the page to
            try again.
          </div>
        )}

        {view === "timeline" && school && timeline && lanes.length === 0 && !timelineLoading && (
          <div
            className={cn(
              "text-sm text-gray-600 dark:text-gray-300 bg-[#fef9f3] dark:bg-[#2d2618]",
              "border-2 border-dashed border-[#d4a574]/70 dark:border-[#8b6f47] rounded-lg p-6 text-center",
              !isMobile && "paper-texture"
            )}
          >
            No weekly records for this year yet. Confirming topics in the exercise
            window builds this timeline.
          </div>
        )}

        {/* Typical pace, with optional school comparison */}
        {view === "timeline" && school && pacingRows.length > 0 && (
          <div
            className={cn(
              "isolate bg-[#fef9f3] dark:bg-[#2d2618] rounded-lg border-2 border-[#d4a574] dark:border-[#8b6f47] overflow-hidden",
              !isMobile && "paper-texture"
            )}
          >
            <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-[#d4a574]/40 dark:border-[#8b6f47]/60">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                Typical pace
              </span>
              <span className="text-[10px] text-gray-400">across all observed years</span>
              <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                {pacingCombos.map(({ combo, pacing, slot }, idx) => (
                  <span
                    key={comboKey(combo)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300"
                  >
                    <span className={cn("h-2 w-2 rounded-full", SLOT_STYLES[slot].dot)} />
                    {comboLabel(combo)}
                    {pacing === null && idx > 0 && (
                      <Loader2 className="h-2.5 w-2.5 animate-spin text-gray-400" />
                    )}
                    {idx > 0 && (
                      <button
                        type="button"
                        aria-label={`Stop comparing ${comboLabel(combo)}`}
                        onClick={() =>
                          setCompares((prev) =>
                            prev.filter((c) => comboKey(c.combo) !== comboKey(combo))
                          )
                        }
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </span>
                ))}
                {compares.length < 2 && compareOptions.length > 0 && (
                  <select
                    className="text-[10px] px-1.5 py-1 rounded-lg border border-[#d4a574]/60 dark:border-[#8b6f47] bg-white dark:bg-[#1a1a1a] text-gray-600 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const [s, g, st] = e.target.value.split("||");
                      setCompares((prev) => {
                        // Claim the lowest free colour slot; slots are never
                        // reshuffled when another comparison is removed.
                        const slot = prev.some((c) => c.slot === 1) ? 2 : 1;
                        return [
                          ...prev,
                          { combo: { school: s, grade: g, stream: st || null }, slot },
                        ];
                      });
                    }}
                  >
                    <option value="">Compare with…</option>
                    {compareOptions.map((c) => (
                      <option key={comboKey(c)} value={comboKey(c)}>
                        {comboLabel(c)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            <div className="overflow-auto max-h-[30rem]">
              <div className="relative" style={{ minWidth: CHART_MIN_W }}>
                {/* Now marker */}
                {timeline?.current_week != null && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-rose-400/80 z-[5] pointer-events-none"
                    style={{ left: weekLeft(timeline.current_week, pacingMaxWeek) }}
                  />
                )}

                {/* Week axis */}
                <WeekAxis maxWeek={pacingMaxWeek} currentWeek={timeline?.current_week} />

                <PacingChartRows
                  rows={pacingRows}
                  combos={pacingCombos}
                  maxWeek={pacingMaxWeek}
                  labelStream={pacingLabelStream}
                  onTopicFiles={setTopicFiles}
                />
              </div>
            </div>
          </div>
        )}

        {topicFiles && (
          <CurriculumTopicFiles
            conceptId={topicFiles.conceptId}
            conceptName={topicFiles.name}
            scope={
              primaryCombo
                ? {
                    school: primaryCombo.school,
                    grade: primaryCombo.grade,
                    lang_stream: primaryCombo.stream,
                  }
                : null
            }
            onClose={() => setTopicFiles(null)}
          />
        )}
      </PageTransition>
    </DeskSurface>
  );
}
