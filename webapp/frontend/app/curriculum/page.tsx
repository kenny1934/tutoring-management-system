"use client";

import { useEffect, useMemo, useState } from "react";
import { Map as MapIcon, Loader2, ChevronDown, ChevronRight, Target, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useCurriculumCoverage, useCurriculumTimeline } from "@/lib/hooks";
import { computeConceptLanes, type ConceptLane } from "@/lib/curriculum-bands";
import { conceptNameForStream, sourcesText } from "@/lib/curriculum-labels";
import { CurriculumSearch } from "@/components/curriculum/CurriculumSearch";
import type { CurriculumCoverageRow, CurriculumPacingBand } from "@/types";

const selectClass =
  "text-xs px-2 py-1.5 rounded-lg border border-[#d4a574]/60 dark:border-[#8b6f47] bg-white dark:bg-[#1a1a1a] text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-teal-500";

// Width of the topic-label column inside the horizontally scrollable charts.
const LABEL_W = "11rem";
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

export default function CurriculumPage() {
  const { data: coverage, isLoading: coverageLoading } = useCurriculumCoverage();

  // Paper texture is skipped on mobile, same as the other desk pages.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    let lastIsMobile = window.innerWidth < 768;
    setIsMobile(lastIsMobile);
    const checkMobile = () => {
      const nowMobile = window.innerWidth < 768;
      if (nowMobile !== lastIsMobile) {
        lastIsMobile = nowMobile;
        setIsMobile(nowMobile);
      }
    };
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const [school, setSchool] = useState<string | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const [year, setYear] = useState<string | null>(null);
  const [gapsExpanded, setGapsExpanded] = useState(false);
  const [expandedLane, setExpandedLane] = useState<number | null>(null);
  const [compares, setCompares] = useState<Combo[]>([]);

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

  const { data: timeline, isLoading: timelineLoading } = useCurriculumTimeline(
    school,
    effectiveGrade,
    effectiveStream || null,
    year
  );
  // Comparison timelines (pacing is all-years, so no year param).
  const { data: cmp0 } = useCurriculumTimeline(
    compares[0]?.school ?? null,
    compares[0]?.grade ?? null,
    compares[0]?.stream ?? null,
    null
  );
  const { data: cmp1 } = useCurriculumTimeline(
    compares[1]?.school ?? null,
    compares[1]?.grade ?? null,
    compares[1]?.stream ?? null,
    null
  );

  const displayYear = timeline?.academic_year || year;

  const primaryCombo: Combo | null =
    school && effectiveGrade
      ? { school, grade: effectiveGrade, stream: effectiveStream || null }
      : null;

  // All known combos for the comparison picker (dominant stream only), minus
  // ones already on screen.
  const compareOptions = useMemo(() => {
    const taken = new Set(
      [primaryCombo, ...compares].filter(Boolean).map((c) => comboKey(c as Combo))
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

  // Thin current-year combos are where tutor confirmations help most
  // (dominant stream only — stray opposite-stream rows are not real gaps).
  const gaps = useMemo(() => {
    if (!coverage) return [] as CurriculumCoverageRow[];
    const latestYear = coverage.reduce(
      (max, r) => (r.academic_year > max ? r.academic_year : max),
      ""
    );
    return coverage
      .filter(
        (r) =>
          r.academic_year === latestYear &&
          r.weeks_observed < 8 &&
          (dominantStreams.get(`${r.school}||${r.grade}`) ?? null) ===
            (r.lang_stream || null)
      )
      .sort((a, b) => a.weeks_observed - b.weeks_observed);
  }, [coverage, dominantStreams]);

  const lanes = useMemo(
    () => (timeline ? computeConceptLanes(timeline.weeks) : []),
    [timeline]
  );

  const ganttMaxWeek = useMemo(() => {
    const weeks = lanes.map((l) => l.lastWeek);
    if (timeline?.current_week) weeks.push(timeline.current_week);
    return Math.max(44, ...weeks);
  }, [lanes, timeline]);

  // Pacing rows: union of concepts across the primary and compared schools,
  // ordered by the primary school's pace.
  const pacingCombos = useMemo(() => {
    const entries: { combo: Combo; pacing: CurriculumPacingBand[] | null }[] = [];
    if (primaryCombo) entries.push({ combo: primaryCombo, pacing: timeline?.pacing ?? null });
    if (compares[0]) entries.push({ combo: compares[0], pacing: cmp0?.pacing ?? null });
    if (compares[1]) entries.push({ combo: compares[1], pacing: cmp1?.pacing ?? null });
    return entries;
  }, [primaryCombo, timeline, compares, cmp0, cmp1]);

  const pacingRows = useMemo(() => {
    const rows = new Map<
      number,
      { name_en: string | null; name_zh: string | null; bands: (CurriculumPacingBand | null)[] }
    >();
    pacingCombos.forEach(({ pacing }, idx) => {
      for (const band of pacing || []) {
        let row = rows.get(band.concept_id);
        if (!row) {
          row = {
            name_en: band.name_en ?? null,
            name_zh: band.name_zh ?? null,
            bands: pacingCombos.map(() => null),
          };
          rows.set(band.concept_id, row);
        }
        row.bands[idx] = band;
      }
    });
    return Array.from(rows.entries())
      .map(([conceptId, row]) => ({ conceptId, ...row }))
      .sort((a, b) => {
        const meanOf = (r: typeof a) =>
          r.bands.find((band) => band)?.mean_week ?? Number.MAX_SAFE_INTEGER;
        return (
          (a.bands[0]?.mean_week ?? meanOf(a)) - (b.bands[0]?.mean_week ?? meanOf(b))
        );
      });
  }, [pacingCombos]);

  // Pacing labels stay single-language unless the comparison actually mixes
  // schools of different languages.
  const pacingLabelStream = useMemo(() => {
    const streams = pacingCombos.map(({ combo }) => combo.stream);
    if (streams.length === 0) return null;
    return streams.every((s) => s === streams[0]) ? streams[0] : null;
  }, [pacingCombos]);

  const pacingMaxWeek = useMemo(() => {
    const weeks = pacingRows.flatMap((r) =>
      r.bands.filter(Boolean).map((band) => (band as CurriculumPacingBand).max_week)
    );
    return Math.max(44, ...weeks);
  }, [pacingRows]);

  const axisTicks = (maxWeek: number) => {
    const ticks: number[] = [];
    for (let w = 4; w <= maxWeek; w += 4) ticks.push(w);
    return ticks;
  };

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

            <div className="h-6 w-px bg-[#d4a574]/50 hidden sm:block" />

            <select
              className={selectClass}
              value={school || ""}
              onChange={(e) => {
                setSchool(e.target.value || null);
                setGrade(null);
                setYear(null);
                setExpandedLane(null);
              }}
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
            {timeline && timeline.years_available.length > 0 && (
              <select
                className={selectClass}
                value={displayYear || ""}
                onChange={(e) => {
                  setYear(e.target.value);
                  setExpandedLane(null);
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

        {!school && !coverageLoading && (
          <div
            className={cn(
              "text-sm text-gray-600 dark:text-gray-300 bg-[#fef9f3] dark:bg-[#2d2618]",
              "border-2 border-dashed border-[#d4a574]/70 dark:border-[#8b6f47] rounded-lg p-8 text-center",
              !isMobile && "paper-texture"
            )}
          >
            <p>
              Pick a school above to see its weekly topic timeline, or search a
              topic directly.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Built from assignments, prep folders, curriculum sheets and tutor
              confirmations.
            </p>
          </div>
        )}

        {/* This year's progression (Gantt lanes) */}
        {school && timeline && lanes.length > 0 && (
          <div
            className={cn(
              "isolate bg-[#fef9f3] dark:bg-[#2d2618] rounded-lg border-2 border-[#d4a574] dark:border-[#8b6f47] overflow-hidden",
              !isMobile && "paper-texture"
            )}
          >
            <div className="flex items-center gap-2 px-4 py-2 border-b border-[#d4a574]/40 dark:border-[#8b6f47]/60 bg-gradient-to-r from-teal-50 to-[#fef9f3] dark:from-teal-900/20 dark:to-[#2d2618]">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                {timeline.school} {timeline.grade}
                {timeline.lang_stream ? ` (${timeline.lang_stream})` : ""} · {displayYear}
              </span>
              <span className="text-[10px] text-gray-400 ml-auto hidden sm:inline">
                Solid = main topic that week · Faint = also seen · Tap a row for detail
              </span>
            </div>
            <div className="overflow-auto max-h-[30rem]">
              <div className="relative" style={{ minWidth: CHART_MIN_W }}>
                {/* Now marker */}
                {timeline.current_week != null && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-rose-400/80 z-10 pointer-events-none"
                    style={{ left: weekLeft(timeline.current_week, ganttMaxWeek) }}
                  />
                )}

                {/* Week axis */}
                <div className="sticky top-0 z-20 flex h-6 bg-[#fef9f3] dark:bg-[#2d2618] border-b border-[#d4a574]/20 dark:border-[#8b6f47]/30">
                  <div
                    className="sticky left-0 z-30 shrink-0 bg-[#fef9f3] dark:bg-[#2d2618] flex items-center px-4"
                    style={{ width: LABEL_W }}
                  >
                    <span className="text-[9px] uppercase tracking-wide text-gray-400">
                      Topic
                    </span>
                  </div>
                  <div className="relative flex-1">
                    {axisTicks(ganttMaxWeek).map((w) => (
                      <span
                        key={w}
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-[9px] text-gray-400 tabular-nums"
                        style={{ left: `${((w - 0.5) / ganttMaxWeek) * 100}%` }}
                      >
                        {w}
                      </span>
                    ))}
                    {timeline.current_week != null && (
                      <span
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-[9px] font-medium text-rose-500 bg-[#fef9f3] dark:bg-[#2d2618] px-0.5"
                        style={{
                          left: `${((timeline.current_week - 0.5) / ganttMaxWeek) * 100}%`,
                        }}
                      >
                        Now
                      </span>
                    )}
                  </div>
                </div>

                {/* Lanes */}
                {lanes.map((lane: ConceptLane) => (
                  <div key={lane.conceptId}>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedLane(
                          expandedLane === lane.conceptId ? null : lane.conceptId
                        )
                      }
                      className="w-full flex h-7 items-stretch text-left group"
                    >
                      <div
                        className="sticky left-0 z-20 shrink-0 bg-[#fef9f3] dark:bg-[#2d2618] group-hover:bg-teal-50/60 dark:group-hover:bg-teal-900/10 flex items-center px-4"
                        style={{ width: LABEL_W }}
                      >
                        <span
                          className="text-[10px] text-gray-600 dark:text-gray-300 truncate"
                          title={conceptNameForStream(lane, effectiveStream)}
                        >
                          {conceptNameForStream(lane, effectiveStream)}
                        </span>
                      </div>
                      <div className="relative flex-1 group-hover:bg-teal-50/40 dark:group-hover:bg-teal-900/5">
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
                              left: `${((seg.startWeek - 1) / ganttMaxWeek) * 100}%`,
                              width: `${Math.max(
                                ((seg.endWeek - seg.startWeek + 1) / ganttMaxWeek) * 100,
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
                    </button>
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
                              title={`Weight ${w.weight.toFixed(2)}`}
                            >
                              Wk {w.week_number} · {sourcesText(w.sources)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div className="h-2" />
              </div>
            </div>
          </div>
        )}

        {school && timeline && lanes.length === 0 && !timelineLoading && (
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
        {school && pacingRows.length > 0 && (
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
                {pacingCombos.map(({ combo, pacing }, idx) => (
                  <span
                    key={comboKey(combo)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300"
                  >
                    <span className={cn("h-2 w-2 rounded-full", SLOT_STYLES[idx].dot)} />
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
                            prev.filter((c) => comboKey(c) !== comboKey(combo))
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
                      setCompares((prev) => [...prev, { school: s, grade: g, stream: st || null }]);
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
            <div className="overflow-x-auto">
              <div style={{ minWidth: CHART_MIN_W }} className="py-3 space-y-1">
                {pacingRows.map((row) => (
                  <div key={row.conceptId} className="flex items-stretch">
                    <div
                      className="sticky left-0 z-10 shrink-0 bg-[#fef9f3] dark:bg-[#2d2618] flex items-center px-4"
                      style={{ width: LABEL_W }}
                    >
                      <span
                        className="text-[10px] text-gray-600 dark:text-gray-300 truncate"
                        title={conceptNameForStream(row, pacingLabelStream)}
                      >
                        {conceptNameForStream(row, pacingLabelStream)}
                      </span>
                    </div>
                    <div className="flex-1 flex flex-col justify-center gap-0.5 pr-4 py-0.5">
                      {row.bands.map((band, idx) => (
                        <div
                          key={idx}
                          className={cn(
                            "relative",
                            pacingCombos.length > 1 ? "h-2" : "h-3.5"
                          )}
                        >
                          <div className="absolute inset-y-0.5 left-0 right-0 rounded bg-black/[0.05] dark:bg-white/[0.06]" />
                          {band && (
                            <>
                              <div
                                className={cn(
                                  "absolute inset-y-0.5 rounded",
                                  SLOT_STYLES[idx].band
                                )}
                                style={{
                                  left: `${((band.min_week - 1) / pacingMaxWeek) * 100}%`,
                                  width: `${Math.max(
                                    ((band.max_week - band.min_week + 1) / pacingMaxWeek) * 100,
                                    1.5
                                  )}%`,
                                }}
                                title={`${comboLabel(pacingCombos[idx].combo)}: weeks ${band.min_week} to ${band.max_week}, usually around week ${band.mean_week} (${band.years_observed} year${band.years_observed === 1 ? "" : "s"} observed)`}
                              />
                              <div
                                className={cn(
                                  "absolute inset-y-0 w-1 rounded",
                                  SLOT_STYLES[idx].mean
                                )}
                                style={{
                                  left: `calc(${((band.mean_week - 0.5) / pacingMaxWeek) * 100}% - 2px)`,
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
            </div>
          </div>
        )}

        {/* Coverage gaps */}
        {gaps.length > 0 && (
          <div
            className={cn(
              "bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg overflow-hidden",
              !isMobile && "paper-texture"
            )}
          >
            <button
              type="button"
              onClick={() => setGapsExpanded(!gapsExpanded)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left bg-gradient-to-r from-amber-50 to-[#fef9f3] dark:from-amber-900/20 dark:to-[#2d2618] hover:from-amber-100 dark:hover:from-amber-900/30 transition-colors"
            >
              <Target className="h-3.5 w-3.5 text-amber-600" />
              <span className="text-xs text-gray-600 dark:text-gray-300">
                Schools we know least about
              </span>
              <span className="text-[10px] text-gray-400">
                {gaps.length} school-grade{gaps.length === 1 ? "" : "s"} with thin records this year
              </span>
              {gapsExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-gray-400 ml-auto" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-gray-400 ml-auto" />
              )}
            </button>
            {gapsExpanded && (
              <div className="border-t border-[#d4a574]/40 dark:border-[#8b6f47]/60 p-3">
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-2">
                  Confirming topics for these students in the exercise window makes
                  their suggestions accurate faster.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {gaps.map((g) => (
                    <button
                      key={`${g.school}-${g.grade}-${g.lang_stream}`}
                      type="button"
                      onClick={() => {
                        setSchool(g.school);
                        setGrade(g.grade);
                        setYear(null);
                        setExpandedLane(null);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                    >
                      {g.school} {g.grade}
                      {g.lang_stream ? ` (${g.lang_stream})` : ""}
                      <span className="text-amber-600/70 dark:text-amber-400/70">
                        {g.weeks_observed} wk{g.weeks_observed === 1 ? "" : "s"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </PageTransition>
    </DeskSurface>
  );
}
