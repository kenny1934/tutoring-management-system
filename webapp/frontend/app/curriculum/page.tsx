"use client";

import { useMemo, useState } from "react";
import { Map, Loader2, ChevronDown, ChevronRight, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurriculumCoverage, useCurriculumTimeline } from "@/lib/hooks";
import type { CurriculumTimelineConcept, CurriculumCoverageRow } from "@/types";

const SOURCE_LABELS: Record<string, string> = {
  assignment: "assignments",
  prep_folder: "prep folders",
  sheet: "curriculum sheets",
  exam_scope: "exam scopes",
  tutor_confirm: "tutor confirmations",
};

function conceptName(c: { name_en?: string | null; name_zh?: string | null }): string {
  if (c.name_en && c.name_zh) return `${c.name_en} · ${c.name_zh}`;
  return c.name_en || c.name_zh || "Unknown topic";
}

function sourcesTitle(sources: string[]): string {
  return `Seen in ${sources.map((s) => SOURCE_LABELS[s] || s).join(", ")}`;
}

const selectClass =
  "text-xs px-2 py-1.5 rounded-lg border border-[#d4a574]/60 dark:border-[#8b6f47] bg-white dark:bg-[#1a1a1a] text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-teal-500";

export default function CurriculumPage() {
  const { data: coverage, isLoading: coverageLoading } = useCurriculumCoverage();

  const [school, setSchool] = useState<string | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const [stream, setStream] = useState<string | null>(null);
  const [year, setYear] = useState<string | null>(null);
  const [gapsExpanded, setGapsExpanded] = useState(false);

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
  const streams = useMemo(
    () =>
      Array.from(
        new Set(
          (coverage || [])
            .filter((r) => r.school === school && r.grade === grade)
            .map((r) => r.lang_stream || "")
        )
      ).sort(),
    [coverage, school, grade]
  );

  const effectiveGrade = grade && grades.includes(grade) ? grade : grades[0] || null;
  const effectiveStream =
    stream !== null && streams.includes(stream) ? stream : streams[0] ?? null;

  const { data: timeline, isLoading: timelineLoading } = useCurriculumTimeline(
    school,
    effectiveGrade,
    effectiveStream || null,
    year
  );

  const displayYear = timeline?.academic_year || year;

  // Thin current-year combos are where tutor confirmations help most.
  const gaps = useMemo(() => {
    if (!coverage) return [] as CurriculumCoverageRow[];
    const latestYear = coverage.reduce(
      (max, r) => (r.academic_year > max ? r.academic_year : max),
      ""
    );
    return coverage
      .filter((r) => r.academic_year === latestYear && r.weeks_observed < 8)
      .sort((a, b) => a.weeks_observed - b.weeks_observed);
  }, [coverage]);

  const maxWeek = useMemo(() => {
    const weeks = [
      ...(timeline?.weeks.map((w) => w.week_number) || []),
      ...(timeline?.pacing.map((p) => p.max_week) || []),
    ];
    return Math.max(44, ...weeks);
  }, [timeline]);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Map className="h-5 w-5 text-teal-600 dark:text-teal-400" />
        <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">
          Curriculum
        </h1>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        What each school covers, week by week. Built from assignments, prep folders,
        curriculum sheets and tutor confirmations.
      </p>

      {/* Pickers */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          className={selectClass}
          value={school || ""}
          onChange={(e) => {
            setSchool(e.target.value || null);
            setGrade(null);
            setStream(null);
            setYear(null);
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
              setStream(null);
              setYear(null);
            }}
          >
            {grades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        )}
        {school && streams.filter(Boolean).length > 0 && (
          <select
            className={selectClass}
            value={effectiveStream || ""}
            onChange={(e) => {
              setStream(e.target.value);
              setYear(null);
            }}
          >
            {streams.map((s) => (
              <option key={s || "none"} value={s}>
                {s ? `${s} stream` : "No stream"}
              </option>
            ))}
          </select>
        )}
        {timeline && timeline.years_available.length > 0 && (
          <select
            className={selectClass}
            value={displayYear || ""}
            onChange={(e) => setYear(e.target.value)}
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

      {!school && !coverageLoading && (
        <div className="text-sm text-gray-500 dark:text-gray-400 border border-dashed border-[#d4a574]/60 dark:border-[#8b6f47] rounded-lg p-8 text-center">
          Pick a school above to see its weekly topic timeline.
        </div>
      )}

      {/* Weekly timeline */}
      {school && timeline && timeline.weeks.length > 0 && (
        <div className="bg-white dark:bg-[#1a1a1a] rounded-lg border-2 border-[#d4a574] dark:border-[#8b6f47] overflow-hidden mb-4">
          <div className="px-4 py-2 border-b border-[#d4a574]/40 dark:border-[#8b6f47]/60 bg-gradient-to-r from-teal-50 to-white dark:from-teal-900/20 dark:to-[#1a1a1a]">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
              {timeline.school} {timeline.grade}
              {timeline.lang_stream ? ` (${timeline.lang_stream})` : ""} · {displayYear}
            </span>
          </div>
          <div className="divide-y divide-[#d4a574]/20 dark:divide-[#8b6f47]/30 max-h-[28rem] overflow-y-auto">
            {timeline.weeks.map((week) => (
              <div key={week.week_number} className="flex items-start gap-3 px-4 py-1.5">
                <span className="text-[10px] text-gray-400 w-12 shrink-0 pt-1 tabular-nums">
                  Wk {week.week_number}
                </span>
                <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                  {week.concepts.map((c: CurriculumTimelineConcept) => (
                    <span
                      key={c.concept_id}
                      title={`${sourcesTitle(c.sources)} · weight ${c.weight.toFixed(2)}`}
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border",
                        c.rank === 1
                          ? "bg-teal-100 dark:bg-teal-900/40 border-teal-300 dark:border-teal-700 text-teal-900 dark:text-teal-200 font-medium"
                          : "bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400"
                      )}
                    >
                      {conceptName(c)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {school && timeline && timeline.weeks.length === 0 && !timelineLoading && (
        <div className="text-sm text-gray-500 dark:text-gray-400 border border-dashed border-[#d4a574]/60 dark:border-[#8b6f47] rounded-lg p-6 text-center mb-4">
          No weekly records for this year yet. Confirming topics in the exercise
          window builds this timeline.
        </div>
      )}

      {/* Pacing bands (all years) */}
      {school && timeline && timeline.pacing.length > 0 && (
        <div className="bg-white dark:bg-[#1a1a1a] rounded-lg border-2 border-[#d4a574] dark:border-[#8b6f47] overflow-hidden mb-4">
          <div className="px-4 py-2 border-b border-[#d4a574]/40 dark:border-[#8b6f47]/60">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
              Typical pace
            </span>
            <span className="text-[10px] text-gray-400 ml-2">
              across all observed years
            </span>
          </div>
          <div className="p-4 space-y-1.5">
            {timeline.pacing.map((p) => (
              <div key={p.concept_id} className="flex items-center gap-2">
                <span
                  className="text-[10px] text-gray-600 dark:text-gray-300 w-40 sm:w-56 truncate shrink-0"
                  title={conceptName(p)}
                >
                  {conceptName(p)}
                </span>
                <div className="relative flex-1 h-3.5">
                  <div className="absolute inset-y-1 left-0 right-0 rounded bg-gray-100 dark:bg-gray-800" />
                  <div
                    className="absolute inset-y-1 rounded bg-teal-200 dark:bg-teal-800/70"
                    style={{
                      left: `${((p.min_week - 1) / maxWeek) * 100}%`,
                      width: `${Math.max(((p.max_week - p.min_week + 1) / maxWeek) * 100, 1.5)}%`,
                    }}
                    title={`Weeks ${p.min_week} to ${p.max_week}, usually around week ${p.mean_week} (${p.years_observed} year${p.years_observed === 1 ? "" : "s"} observed)`}
                  />
                  <div
                    className="absolute top-0 h-3.5 w-1 rounded bg-teal-600 dark:bg-teal-400"
                    style={{ left: `calc(${((p.mean_week - 0.5) / maxWeek) * 100}% - 2px)` }}
                  />
                </div>
                <span className="text-[10px] text-gray-400 w-14 shrink-0 tabular-nums text-right">
                  ~wk {p.mean_week}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Coverage gaps */}
      {gaps.length > 0 && (
        <div className="border border-[#d4a574]/60 dark:border-[#8b6f47] rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setGapsExpanded(!gapsExpanded)}
            className="w-full flex items-center gap-2 px-3 py-2 text-left bg-gradient-to-r from-amber-50 to-white dark:from-amber-900/20 dark:to-[#1a1a1a] hover:from-amber-100 dark:hover:from-amber-900/30 transition-colors"
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
                      setStream(g.lang_stream || "");
                      setYear(null);
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
    </div>
  );
}
