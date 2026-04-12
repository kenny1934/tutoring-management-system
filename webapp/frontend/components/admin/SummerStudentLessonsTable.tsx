"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { summerAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { SUMMER_GRADE_BG, SUMMER_GRADE_BORDER, RESCHEDULED_STATUS, sessionStatusBg, formatCompactDate, formatShortDate, getDayFromDate, getStartTime } from "@/lib/summer-utils";
import { ArrowUpDown, Search, Check, Clock, AlertTriangle } from "lucide-react";
import type { SummerStudentLessonsRow } from "@/types";

interface SummerStudentLessonsTableProps {
  configId: number;
  location: string;
  totalLessons: number;
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

// Warm palette constants matching WeeklyGridView / applications page
const HEADER_BG = "bg-[#fef9f3] dark:bg-[#2d2618]";
const HEADER_BORDER = "border-[#e8d4b8] dark:border-[#6b5a4a]";
const ROW_HOVER = "hover:bg-[#fef9f3]/50 dark:hover:bg-[#2d2618]/30";

export function SummerStudentLessonsTable({
  configId,
  location,
  totalLessons,
  onClickStudent,
  onFindSlot,
  onNavigateToLesson,
}: SummerStudentLessonsTableProps) {
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("completion");

  const { data, isLoading, error } = useSWR(
    configId && location
      ? ["summer-student-lessons", configId, location]
      : null,
    () => summerAPI.getStudentLessons(configId, location),
    { refreshInterval: 30000 }
  );

  const students = data?.students ?? [];

  const grades = useMemo(() => {
    const set = new Set(students.map((s) => s.grade));
    return Array.from(set).sort();
  }, [students]);

  const filtered = useMemo(() => {
    let result = students;

    if (gradeFilter) {
      result = result.filter((s) => s.grade === gradeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((s) => s.student_name.toLowerCase().includes(q));
    }

    result = [...result].sort((a, b) => {
      if (sort === "completion") {
        const cmp = a.placed_count - b.placed_count;
        return cmp !== 0 ? cmp : a.student_name.localeCompare(b.student_name);
      }
      if (sort === "grade") {
        const cmp = a.grade.localeCompare(b.grade);
        return cmp !== 0 ? cmp : a.student_name.localeCompare(b.student_name);
      }
      return a.student_name.localeCompare(b.student_name);
    });

    return result;
  }, [students, gradeFilter, search, sort]);

  const lessonColumns = Array.from(
    { length: totalLessons },
    (_, i) => i + 1
  );

  // Summary stats
  const stats = useMemo(() => {
    if (students.length === 0) return null;
    const total = students.length;
    const avgPct = Math.round(
      students.reduce((sum, s) => sum + (s.total_lessons > 0 ? s.placed_count / s.total_lessons : 0), 0) / total * 100
    );
    const remaining = students.reduce((sum, s) => sum + (s.total_lessons - s.placed_count), 0);
    const rescheduled = students.reduce((sum, s) => sum + s.rescheduled_count, 0);
    return { total, avgPct, remaining, rescheduled };
  }, [students]);

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

  const sortLabel =
    sort === "completion"
      ? "name"
      : sort === "name"
        ? "grade"
        : "completion";

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student..."
            className="pl-7 pr-2 py-1 text-xs border border-border dark:border-gray-700 rounded bg-white dark:bg-gray-800 w-44"
          />
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setGradeFilter(null)}
            className={cn(
              "px-1.5 py-0.5 text-[10px] rounded-full transition-colors",
              gradeFilter === null
                ? "bg-primary text-primary-foreground"
                : "bg-[#e8d4b8]/20 dark:bg-[#6b5a4a]/20 text-muted-foreground hover:bg-[#e8d4b8]/40 dark:hover:bg-[#6b5a4a]/40"
            )}
          >
            All
          </button>
          {grades.map((g) => (
            <button
              key={g}
              onClick={() => setGradeFilter(gradeFilter === g ? null : g)}
              className={cn(
                "px-1.5 py-0.5 text-[10px] rounded-full transition-colors",
                gradeFilter === g
                  ? "bg-primary text-primary-foreground"
                  : "bg-[#e8d4b8]/20 dark:bg-[#6b5a4a]/20 text-muted-foreground hover:bg-[#e8d4b8]/40 dark:hover:bg-[#6b5a4a]/40"
              )}
            >
              {g}
            </button>
          ))}
        </div>

        <button
          onClick={() => setSort(sortLabel as SortMode)}
          className="ml-auto p-0.5 text-muted-foreground hover:text-foreground"
          title={`Sort by ${sortLabel}`}
        >
          <ArrowUpDown className="h-3 w-3" />
        </button>

        <span className="text-[10px] text-muted-foreground">
          {filtered.length}
          {filtered.length !== students.length && ` / ${students.length}`}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border-2 border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg flex-1">
        <table className="w-full border-collapse">
          <thead>
            <tr className={HEADER_BG}>
              <th className={cn("sticky left-0 z-10", HEADER_BG, "text-[11px] font-semibold text-gray-700 dark:text-gray-300 text-left px-2 py-2 border-b-2", HEADER_BORDER, "min-w-[120px]")}>
                Student
              </th>
              <th className={cn("sticky left-[120px] z-10", HEADER_BG, "text-[11px] font-semibold text-gray-700 dark:text-gray-300 text-center px-1 py-2 border-b-2", HEADER_BORDER, "w-10")}>
                Grade
              </th>
              <th className={cn("sticky left-[160px] z-10", HEADER_BG, "text-[11px] font-semibold text-gray-700 dark:text-gray-300 text-center px-1 py-2 border-b-2", HEADER_BORDER, "min-w-[72px]")}>
                Progress
              </th>
              {lessonColumns.map((n) => (
                <th
                  key={n}
                  className={cn("text-[11px] font-semibold text-gray-700 dark:text-gray-300 text-center px-1 py-2 border-b-2", HEADER_BORDER, "min-w-[60px]")}
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
                const attendingCount = student.placed_count - student.rescheduled_count;
                const attendingPct = student.total_lessons > 0
                  ? Math.round((attendingCount / student.total_lessons) * 100)
                  : 0;
                const rescheduledPct = student.total_lessons > 0
                  ? Math.round((student.rescheduled_count / student.total_lessons) * 100)
                  : 0;
                const isEven = idx % 2 === 1;

                return (
                  <tr
                    key={student.application_id}
                    className={cn(
                      "border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30",
                      ROW_HOVER,
                      isEven && "bg-gray-50/30 dark:bg-gray-800/20"
                    )}
                  >
                    {/* Student name — sticky + grade border */}
                    <td className={cn(
                      "sticky left-0 z-10 px-2 py-1.5 border-r border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30 border-l-[3px]",
                      SUMMER_GRADE_BORDER[student.grade] || "border-l-gray-300",
                      isEven ? "bg-gray-50/80 dark:bg-gray-900" : "bg-white dark:bg-gray-900"
                    )}>
                      <button
                        onClick={() => onClickStudent?.(student.application_id)}
                        className="text-[11px] font-medium truncate max-w-[110px] block text-left hover:text-primary hover:underline"
                        title={student.student_name}
                      >
                        {student.student_name}
                      </button>
                    </td>

                    {/* Grade badge — sticky */}
                    <td className={cn(
                      "sticky left-[120px] z-10 text-center px-1 py-1.5 border-r border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30",
                      isEven ? "bg-gray-50/80 dark:bg-gray-900" : "bg-white dark:bg-gray-900"
                    )}>
                      <span className={cn("text-[10px] font-bold px-1 rounded", SUMMER_GRADE_BG[student.grade] || "bg-gray-100 dark:bg-gray-700")}>
                        {student.grade}
                      </span>
                      {student.sessions_per_week > 1 && (
                        <span className="text-[8px] font-medium text-orange-600 dark:text-orange-400 ml-0.5">
                          {student.sessions_per_week}x
                        </span>
                      )}
                    </td>

                    {/* Progress bar — sticky */}
                    <td className={cn(
                      "sticky left-[160px] z-10 px-1 py-1.5 border-r border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30",
                      isEven ? "bg-gray-50/80 dark:bg-gray-900" : "bg-white dark:bg-gray-900"
                    )}>
                      <div className="flex items-center gap-1">
                        <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
                          {attendingPct > 0 && (
                            <div
                              className={cn(
                                "h-full transition-all",
                                attendingPct + rescheduledPct >= 100
                                  ? "bg-green-400 dark:bg-green-400/80"
                                  : "bg-primary dark:bg-primary/80"
                              )}
                              style={{ width: `${attendingPct}%` }}
                            />
                          )}
                          {rescheduledPct > 0 && (
                            <div
                              className="h-full bg-orange-400 dark:bg-orange-400/80 transition-all"
                              style={{ width: `${rescheduledPct}%` }}
                              title={`${student.rescheduled_count} rescheduled`}
                            />
                          )}
                        </div>
                        <span className="text-[9px] text-muted-foreground w-7 text-right tabular-nums">
                          {student.placed_count}/{student.total_lessons}
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

                        return (
                          <td
                            key={n}
                            className={cn(
                              "text-center px-0.5 py-1",
                              sessionStatusBg(status ?? ""),
                              isRescheduled && "opacity-80",
                              onNavigateToLesson && "cursor-pointer hover:ring-1 hover:ring-inset hover:ring-primary/40"
                            )}
                            title={`${formatShortDate(lesson.lesson_date)}, ${lesson.time_slot ?? ""} (${status ?? "Unknown"})${onNavigateToLesson ? " — click to view in calendar" : ""}`}
                            onClick={onNavigateToLesson ? () => onNavigateToLesson(lesson.lesson_date!) : undefined}
                          >
                            <div className="flex flex-col items-center gap-0">
                              <span className={cn(
                                "text-[11px] tabular-nums flex items-center gap-0.5",
                                isRescheduled && "line-through text-orange-600 dark:text-orange-400"
                              )}>
                                {status === "Confirmed" && <Check className="h-2.5 w-2.5 text-green-500" />}
                                {status === "Tentative" && <Clock className="h-2.5 w-2.5 text-yellow-500" />}
                                {isRescheduled && <AlertTriangle className="h-2.5 w-2.5 text-orange-500" />}
                                {formatCompactDate(lesson.lesson_date)}
                              </span>
                              {startTime && (
                                <span className={cn(
                                  "text-[9px] leading-none",
                                  isRescheduled ? "text-orange-500/70" : "text-muted-foreground"
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
