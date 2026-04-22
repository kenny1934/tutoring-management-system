"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import useSWR from "swr";
import { summerAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { SUMMER_GRADE_BG, SUMMER_GRADE_BORDER, RESCHEDULED_STATUS, sessionStatusBg, formatCompactDate, formatShortDate, getDayFromDate, getStartTime } from "@/lib/summer-utils";
import { STATUS_COLORS } from "@/components/admin/SummerApplicationCard";
import { PrimaryBranchChip } from "@/components/admin/PrimaryBranchChip";
import { ArrowDown, ArrowUp, Check, Clock, AlertTriangle, RefreshCcw, X } from "lucide-react";
import type { SummerStudentLessonsRow } from "@/types";

interface SummerStudentLessonsTableProps {
  configId: number;
  location: string;
  totalLessons: number;
  /** Page-level application status filter; null = all statuses. Applied after
   * local chip filters so the header chip and this table stay in sync. */
  statusFilter?: string | null;
  /** Seq-bumped target from the page-level search. The matching row rings
   * and scrolls into view; SWR revalidation is not a dep so the highlight
   * doesn't re-fire on every 30s refresh. */
  highlightTarget?: {
    applicationId: number;
    seq: number;
  } | null;
  onClickStudent?: (applicationId: number) => void;
  onFindSlot?: (target: {
    applicationId: number;
    studentName: string;
    grade: string;
    lessonNumber: number;
    afterDate?: string;
    beforeDate?: string;
  }) => void;
  onNavigateToLesson?: (lessonDate: string) => void;
}

type SortMode = "completion" | "name" | "grade";
type SortDir = "asc" | "desc";
type ProgressBucket = "not_started" | "in_progress" | "fully_placed";
type OriginBucket = "new" | "existing";

// Warm palette constants matching WeeklyGridView / applications page
const HEADER_BG = "bg-[#fef9f3] dark:bg-[#2d2618]";
const HEADER_BORDER = "border-[#e8d4b8] dark:border-[#6b5a4a]";
const ROW_HOVER = "hover:bg-[#fef9f3]/50 dark:hover:bg-[#2d2618]/30";

const CHIP_INACTIVE =
  "bg-[#e8d4b8]/20 dark:bg-[#6b5a4a]/20 text-muted-foreground hover:bg-[#e8d4b8]/40 dark:hover:bg-[#6b5a4a]/40";
const CHIP_ACTIVE = "bg-primary text-primary-foreground";

function progressBucket(row: SummerStudentLessonsRow): ProgressBucket {
  const target = row.lessons_paid || row.total_lessons;
  if (row.placed_count === 0) return "not_started";
  if (target > 0 && row.placed_count >= target) return "fully_placed";
  return "in_progress";
}

function originBucket(row: SummerStudentLessonsRow): OriginBucket {
  if (row.linked_student || row.linked_prospect) return "existing";
  if (row.verified_branch_origin && row.verified_branch_origin !== "New") return "existing";
  if (row.claimed_branch_code && row.is_existing_student && row.is_existing_student !== "None") {
    return "existing";
  }
  return "new";
}

function attendingFillColor(attendingPct: number, isFullyPlaced: boolean): string {
  if (isFullyPlaced) return "bg-green-400 dark:bg-green-400/80";
  if (attendingPct >= 66) return "bg-primary dark:bg-primary/80";
  if (attendingPct >= 33) return "bg-amber-400 dark:bg-amber-400/80";
  return "bg-red-300 dark:bg-red-400/70";
}

function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "px-1.5 py-0.5 text-[10px] rounded-full transition-colors",
        active ? CHIP_ACTIVE : CHIP_INACTIVE,
      )}
    >
      {children}
    </button>
  );
}

function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function SortButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2 py-0.5 text-[10px] transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-transparent text-muted-foreground hover:bg-[#e8d4b8]/30 dark:hover:bg-[#6b5a4a]/30",
      )}
    >
      {children}
    </button>
  );
}

export function SummerStudentLessonsTable({
  configId,
  location,
  totalLessons,
  statusFilter = null,
  highlightTarget,
  onClickStudent,
  onFindSlot,
  onNavigateToLesson,
}: SummerStudentLessonsTableProps) {
  const [gradeFilter, setGradeFilter] = useState<string | null>(null);
  const [progressFilter, setProgressFilter] = useState<ProgressBucket | null>(null);
  const [sessionsFilter, setSessionsFilter] = useState<number | null>(null);
  const [originFilter, setOriginFilter] = useState<OriginBucket | null>(null);
  const [rescheduledOnly, setRescheduledOnly] = useState(false);
  const [sort, setSort] = useState<SortMode>("completion");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { data, isLoading, error } = useSWR(
    configId && location ? ["summer-student-lessons", configId, location] : null,
    () => summerAPI.getStudentLessons(configId, location),
    { refreshInterval: 30000 },
  );

  const students = data?.students ?? [];

  const grades = useMemo(() => {
    const set = new Set(students.map((s) => s.grade));
    return Array.from(set).sort();
  }, [students]);

  const sessionsOptions = useMemo(() => {
    const set = new Set(students.map((s) => s.sessions_per_week).filter((n) => n > 0));
    return Array.from(set).sort((a, b) => a - b);
  }, [students]);

  const filtered = useMemo(() => {
    let result = students;

    if (gradeFilter) {
      result = result.filter((s) => s.grade === gradeFilter);
    }
    if (progressFilter) {
      result = result.filter((s) => progressBucket(s) === progressFilter);
    }
    if (sessionsFilter) {
      result = result.filter((s) => s.sessions_per_week === sessionsFilter);
    }
    if (originFilter) {
      result = result.filter((s) => originBucket(s) === originFilter);
    }
    if (rescheduledOnly) {
      result = result.filter((s) => s.rescheduled_count > 0);
    }
    if (statusFilter) {
      result = result.filter((s) => s.application_status === statusFilter);
    }

    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sort === "completion") {
        cmp = a.placed_count - b.placed_count;
        if (cmp === 0) cmp = a.student_name.localeCompare(b.student_name);
      } else if (sort === "grade") {
        cmp = a.grade.localeCompare(b.grade);
        if (cmp === 0) cmp = a.student_name.localeCompare(b.student_name);
      } else {
        cmp = a.student_name.localeCompare(b.student_name);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [
    students,
    gradeFilter,
    progressFilter,
    sessionsFilter,
    originFilter,
    rescheduledOnly,
    statusFilter,
    sort,
    sortDir,
  ]);

  const lessonColumns = Array.from({ length: totalLessons }, (_, i) => i + 1);

  // Summary stats (unfiltered — the footer reports the overall picture)
  const stats = useMemo(() => {
    if (students.length === 0) return null;
    const total = students.length;
    const avgPct = Math.round(
      (students.reduce(
        (sum, s) => sum + (s.total_lessons > 0 ? s.placed_count / s.total_lessons : 0),
        0,
      ) /
        total) *
        100,
    );
    const remaining = students.reduce((sum, s) => sum + (s.total_lessons - s.placed_count), 0);
    const rescheduled = students.reduce((sum, s) => sum + s.rescheduled_count, 0);
    return { total, avgPct, remaining, rescheduled };
  }, [students]);

  // Search-jump highlight (mirrors SummerSlotCard). seq re-fires on repeat
  // selection of the same student; applicationId alone would no-op on repeat.
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const [highlightedAppId, setHighlightedAppId] = useState<number | null>(null);
  useEffect(() => {
    if (!highlightTarget) return;
    const row = rowRefs.current.get(highlightTarget.applicationId);
    if (!row) return;
    setHighlightedAppId(highlightTarget.applicationId);
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    const clearTimer = setTimeout(() => setHighlightedAppId(null), 2000);
    return () => clearTimeout(clearTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightTarget?.seq, highlightTarget?.applicationId]);

  const setRowRef = useCallback((appId: number, el: HTMLTableRowElement | null) => {
    if (el) rowRefs.current.set(appId, el);
    else rowRefs.current.delete(appId);
  }, []);

  function handleFindSlot(student: SummerStudentLessonsRow, lessonNum: number) {
    if (!onFindSlot) return;

    let afterDate: string | undefined;
    let beforeDate: string | undefined;

    for (const l of student.lessons) {
      if (l.placed && l.lesson_date) {
        if (l.lesson_number < lessonNum) {
          if (!afterDate || l.lesson_date > afterDate) {
            afterDate = l.lesson_date;
          }
        }
        if (l.lesson_number > lessonNum) {
          if (!beforeDate || l.lesson_date < beforeDate) {
            beforeDate = l.lesson_date;
          }
        }
      }
    }

    onFindSlot({
      applicationId: student.application_id,
      studentName: student.student_name,
      grade: student.grade,
      lessonNumber: lessonNum,
      afterDate,
      beforeDate,
    });
  }

  const anyLocalFilter = !!(
    gradeFilter ||
    progressFilter ||
    sessionsFilter ||
    originFilter ||
    rescheduledOnly
  );
  const clearLocal = () => {
    setGradeFilter(null);
    setProgressFilter(null);
    setSessionsFilter(null);
    setOriginFilter(null);
    setRescheduledOnly(false);
  };

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap">
        {grades.length > 1 && (
          <ChipGroup label="Grade">
            <Chip active={gradeFilter === null} onClick={() => setGradeFilter(null)}>
              All
            </Chip>
            {grades.map((g) => (
              <Chip
                key={g}
                active={gradeFilter === g}
                onClick={() => setGradeFilter(gradeFilter === g ? null : g)}
              >
                {g}
              </Chip>
            ))}
          </ChipGroup>
        )}

        <ChipGroup label="Progress">
          <Chip
            active={progressFilter === "not_started"}
            onClick={() =>
              setProgressFilter(progressFilter === "not_started" ? null : "not_started")
            }
            title="0 lessons placed"
          >
            Not started
          </Chip>
          <Chip
            active={progressFilter === "in_progress"}
            onClick={() =>
              setProgressFilter(progressFilter === "in_progress" ? null : "in_progress")
            }
          >
            In progress
          </Chip>
          <Chip
            active={progressFilter === "fully_placed"}
            onClick={() =>
              setProgressFilter(progressFilter === "fully_placed" ? null : "fully_placed")
            }
          >
            Fully placed
          </Chip>
        </ChipGroup>

        {sessionsOptions.length > 1 && (
          <ChipGroup label="Sessions">
            {sessionsOptions.map((n) => (
              <Chip
                key={n}
                active={sessionsFilter === n}
                onClick={() => setSessionsFilter(sessionsFilter === n ? null : n)}
                title={`${n} session${n > 1 ? "s" : ""} per week`}
              >
                {n}×
              </Chip>
            ))}
          </ChipGroup>
        )}

        <ChipGroup label="Origin">
          <Chip
            active={originFilter === "new"}
            onClick={() => setOriginFilter(originFilter === "new" ? null : "new")}
            title="Not linked to any existing student or prospect"
          >
            New
          </Chip>
          <Chip
            active={originFilter === "existing"}
            onClick={() => setOriginFilter(originFilter === "existing" ? null : "existing")}
            title="Linked to an existing student / prospect, or verified as existing"
          >
            Existing
          </Chip>
        </ChipGroup>

        <button
          onClick={() => setRescheduledOnly((v) => !v)}
          aria-pressed={rescheduledOnly}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-full transition-colors",
            rescheduledOnly
              ? "bg-orange-500 text-white"
              : CHIP_INACTIVE,
          )}
          title="Only show students with at least one rescheduled lesson"
        >
          <RefreshCcw className="h-2.5 w-2.5" />
          Rescheduled
        </button>

        {anyLocalFilter && (
          <button
            onClick={clearLocal}
            className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
            title="Clear local filters (status filter from header is not affected)"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}

        <div className="ml-auto inline-flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Sort</span>
          <div className="inline-flex rounded-full overflow-hidden border border-border">
            <SortButton active={sort === "completion"} onClick={() => setSort("completion")}>
              Done
            </SortButton>
            <SortButton active={sort === "name"} onClick={() => setSort("name")}>
              Name
            </SortButton>
            <SortButton active={sort === "grade"} onClick={() => setSort("grade")}>
              Grade
            </SortButton>
          </div>
          <button
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="p-0.5 text-muted-foreground hover:text-foreground"
            title={`Sort direction: ${sortDir === "asc" ? "ascending" : "descending"}`}
            aria-label={`Toggle sort direction; currently ${sortDir}`}
          >
            {sortDir === "asc" ? (
              <ArrowUp className="h-3 w-3" />
            ) : (
              <ArrowDown className="h-3 w-3" />
            )}
          </button>

          <span className="text-[10px] text-muted-foreground tabular-nums ml-1">
            {filtered.length}
            {filtered.length !== students.length && ` / ${students.length}`}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border-2 border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg flex-1">
        <table className="w-full border-collapse">
          <thead>
            <tr className={HEADER_BG}>
              <th className={cn("sticky left-0 z-10", HEADER_BG, "text-[11px] font-semibold text-gray-700 dark:text-gray-300 text-left px-2 py-2 border-b-2", HEADER_BORDER, "min-w-[96px] md:min-w-[120px]")}>
                Student
              </th>
              <th className={cn("md:sticky md:left-[120px] z-10", HEADER_BG, "text-[11px] font-semibold text-gray-700 dark:text-gray-300 text-center px-1 py-2 border-b-2", HEADER_BORDER, "w-10")}>
                Grade
              </th>
              <th className={cn("md:sticky md:left-[160px] z-10", HEADER_BG, "text-[11px] font-semibold text-gray-700 dark:text-gray-300 text-center px-1 py-2 border-b-2", HEADER_BORDER, "min-w-[72px]")}>
                Progress
              </th>
              {lessonColumns.map((n) => (
                <th
                  key={n}
                  className={cn("text-[11px] font-semibold text-gray-700 dark:text-gray-300 text-center px-1 py-2 border-b-2", HEADER_BORDER, "min-w-[52px] md:min-w-[60px]")}
                >
                  L{n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={3 + lessonColumns.length} className="px-2 py-2">
                    <div className="h-6 rounded animate-pulse bg-gray-100 dark:bg-gray-800" />
                  </td>
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={3 + lessonColumns.length} className="px-4 py-8 text-center text-xs text-red-500">
                  Failed to load students. Please refresh.
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={3 + lessonColumns.length} className="px-4 py-8 text-center text-xs text-muted-foreground">
                  {students.length === 0 ? "No student data available." : "No matches."}
                </td>
              </tr>
            ) : (
              filtered.map((student, idx) => {
                const target = student.lessons_paid || student.total_lessons;
                const attendingCount = student.placed_count - student.rescheduled_count;
                const attendingPct =
                  target > 0 ? Math.round((attendingCount / target) * 100) : 0;
                const rescheduledPct =
                  target > 0 ? Math.round((student.rescheduled_count / target) * 100) : 0;
                const isFullyPlaced = target > 0 && student.placed_count >= target;
                const isEven = idx % 2 === 1;
                const isHighlighted = highlightedAppId === student.application_id;

                return (
                  <tr
                    key={student.application_id}
                    ref={(el) => setRowRef(student.application_id, el)}
                    className={cn(
                      "border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30",
                      ROW_HOVER,
                      isEven && "bg-gray-50/30 dark:bg-gray-800/20",
                      isHighlighted && "ring-2 ring-inset ring-primary/70 bg-primary/10",
                    )}
                  >
                    {/* Student name + status dot — sticky + grade border */}
                    <td className={cn(
                      "sticky left-0 z-10 px-2 py-1.5 border-r border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30 border-l-[3px]",
                      SUMMER_GRADE_BORDER[student.grade] || "border-l-gray-300",
                      isEven ? "bg-gray-50/80 dark:bg-gray-900" : "bg-white dark:bg-gray-900",
                      isHighlighted && "bg-primary/10 dark:bg-primary/10",
                    )}>
                      <div className="flex items-center gap-1 min-w-0">
                        <button
                          onClick={() => onClickStudent?.(student.application_id)}
                          className="text-[11px] font-medium truncate text-left hover:text-primary hover:underline"
                          title={student.student_name}
                        >
                          {student.student_name}
                        </button>
                        <span className="hidden md:inline-flex shrink-0">
                          <PrimaryBranchChip app={student} />
                        </span>
                        {student.application_status && (
                          <span
                            className={cn("w-1.5 h-1.5 rounded-full shrink-0 ml-auto", STATUS_COLORS[student.application_status]?.dot || "bg-gray-400")}
                            title={student.application_status}
                          />
                        )}
                      </div>
                    </td>

                    {/* Grade badge — sticky on ≥md */}
                    <td className={cn(
                      "md:sticky md:left-[120px] z-10 text-center px-1 py-1.5 border-r border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30",
                      isEven ? "bg-gray-50/80 dark:bg-gray-900" : "bg-white dark:bg-gray-900",
                      isHighlighted && "bg-primary/10 dark:bg-primary/10",
                    )}>
                      <span className={cn("text-[10px] font-bold px-1 rounded", SUMMER_GRADE_BG[student.grade] || "bg-gray-100 dark:bg-gray-700")}>
                        {student.grade}{student.lang_stream || ""}
                      </span>
                      {student.sessions_per_week > 1 && (
                        <span className="text-[8px] font-medium text-orange-600 dark:text-orange-400 ml-0.5">
                          {student.sessions_per_week}x
                        </span>
                      )}
                    </td>

                    {/* Progress bar — sticky on ≥md */}
                    <td className={cn(
                      "md:sticky md:left-[160px] z-10 px-1 py-1.5 border-r border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30",
                      isEven ? "bg-gray-50/80 dark:bg-gray-900" : "bg-white dark:bg-gray-900",
                      isHighlighted && "bg-primary/10 dark:bg-primary/10",
                    )}>
                      <div className="flex items-center gap-1">
                        <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
                          {attendingPct > 0 && (
                            <div
                              className={cn(
                                "h-full transition-all",
                                attendingFillColor(attendingPct, isFullyPlaced),
                              )}
                              style={{ width: `${Math.min(attendingPct, 100)}%` }}
                            />
                          )}
                          {rescheduledPct > 0 && (
                            <div
                              className="h-full bg-orange-400 dark:bg-orange-400/80 transition-all"
                              style={{ width: `${Math.min(rescheduledPct, 100 - Math.min(attendingPct, 100))}%` }}
                              title={`${student.rescheduled_count} rescheduled`}
                            />
                          )}
                        </div>
                        <span className="text-[9px] text-muted-foreground w-7 text-right tabular-nums">
                          {student.placed_count}/{target}
                        </span>
                      </div>
                    </td>

                    {/* Lesson cells */}
                    {lessonColumns.map((n) => {
                      const lesson = student.lessons.find((l) => l.lesson_number === n);
                      const placed = lesson?.placed;
                      const status = lesson?.session_status;
                      const isRescheduled = status === RESCHEDULED_STATUS;

                      if (placed && lesson?.lesson_date) {
                        const day = getDayFromDate(lesson.lesson_date);
                        const startTime = lesson.time_slot ? getStartTime(lesson.time_slot) : "";
                        const dupes = lesson.duplicates ?? [];
                        const baseTooltip = `${formatShortDate(lesson.lesson_date)}, ${lesson.time_slot ?? ""} (${status ?? "Unknown"})${onNavigateToLesson ? " — click to view in calendar" : ""}`;
                        const tooltip = dupes.length > 0
                          ? `${baseTooltip}\n\n+${dupes.length} duplicate${dupes.length > 1 ? "s" : ""}:\n${dupes
                              .map((d) => `${d.lesson_date ? formatShortDate(d.lesson_date) : "—"} ${d.time_slot ?? ""} (${d.session_status ?? "Unknown"})`)
                              .join("\n")}`
                          : baseTooltip;

                        return (
                          <td
                            key={n}
                            className={cn(
                              "text-center px-0.5 py-1",
                              sessionStatusBg(status ?? ""),
                              isRescheduled && "opacity-80",
                              onNavigateToLesson && "cursor-pointer hover:ring-1 hover:ring-inset hover:ring-primary/40",
                            )}
                            title={tooltip}
                            onClick={onNavigateToLesson ? () => onNavigateToLesson(lesson.lesson_date!) : undefined}
                          >
                            <div className="flex flex-col items-center gap-0">
                              <span className={cn(
                                "text-[11px] tabular-nums flex items-center gap-0.5",
                                isRescheduled && "line-through text-orange-600 dark:text-orange-400",
                              )}>
                                {status === "Confirmed" && <Check className="h-2.5 w-2.5 text-green-500" />}
                                {status === "Tentative" && <Clock className="h-2.5 w-2.5 text-yellow-500" />}
                                {isRescheduled && <AlertTriangle className="h-2.5 w-2.5 text-orange-500" />}
                                {formatCompactDate(lesson.lesson_date)}
                                {dupes.length > 0 && (
                                  <span className="ml-0.5 px-1 rounded text-[8px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700 leading-tight">
                                    +{dupes.length}
                                  </span>
                                )}
                              </span>
                              {startTime && (
                                <span className={cn(
                                  "text-[9px] leading-none",
                                  isRescheduled ? "text-orange-500/70" : "text-muted-foreground",
                                )}>
                                  {day} {startTime}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      }

                      return (
                        <td key={n} className="text-center px-1 py-1">
                          {onFindSlot ? (
                            <button
                              onClick={() => handleFindSlot(student, n)}
                              className="text-[10px] text-muted-foreground hover:text-primary hover:bg-primary/10 rounded px-1.5 py-0.5 transition-colors"
                              title={`Find slot for L${n}`}
                            >
                              ?
                            </button>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
          {/* Summary footer */}
          {stats && !isLoading && (
            <tfoot>
              <tr className={cn(HEADER_BG, "border-t-2", HEADER_BORDER)}>
                <td
                  colSpan={3 + lessonColumns.length}
                  className="px-3 py-2 text-[11px] font-medium text-gray-600 dark:text-gray-400"
                >
                  {stats.total} students · {stats.avgPct}% avg completion · {stats.remaining} lessons remaining{stats.rescheduled > 0 && ` · ${stats.rescheduled} rescheduled`}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
