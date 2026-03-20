"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { summerAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { SUMMER_GRADE_BG, formatCompactDate, formatShortDate } from "@/lib/summer-utils";
import { ArrowUpDown, Search } from "lucide-react";
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
}

type SortMode = "completion" | "name" | "grade";

export function SummerStudentLessonsTable({
  configId,
  location,
  totalLessons,
  onClickStudent,
  onFindSlot,
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
        // ascending by placed_count so least-complete students appear first
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

  function handleFindSlot(student: SummerStudentLessonsRow, lessonNum: number) {
    if (!onFindSlot) return;

    // Find adjacent placed lessons to compute afterDate / beforeDate
    let afterDate: string | undefined;
    let beforeDate: string | undefined;

    for (const l of student.lessons) {
      if (l.placed && l.lesson_date) {
        if (l.lesson_number < lessonNum) {
          // Candidate for afterDate — keep the latest one before this lesson
          if (!afterDate || l.lesson_date > afterDate) {
            afterDate = l.lesson_date;
          }
        }
        if (l.lesson_number > lessonNum) {
          // Candidate for beforeDate — keep the earliest one after this lesson
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
    <div className="flex flex-col gap-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student..."
            className="pl-7 pr-2 py-1 text-xs border border-border dark:border-gray-700 rounded bg-background dark:bg-gray-800 w-44"
          />
        </div>

        {/* Grade filter chips */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setGradeFilter(null)}
            className={cn(
              "px-1.5 py-0.5 text-[10px] rounded-full transition-colors",
              gradeFilter === null
                ? "bg-primary text-primary-foreground"
                : "bg-gray-100 dark:bg-gray-800 text-muted-foreground hover:bg-gray-200 dark:hover:bg-gray-700"
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
                  : "bg-gray-100 dark:bg-gray-800 text-muted-foreground hover:bg-gray-200 dark:hover:bg-gray-700"
              )}
            >
              {g}
            </button>
          ))}
        </div>

        {/* Sort toggle */}
        <button
          onClick={() => setSort(sortLabel as SortMode)}
          className="ml-auto p-0.5 text-muted-foreground hover:text-foreground"
          title={`Sort by ${sortLabel}`}
        >
          <ArrowUpDown className="h-3 w-3" />
        </button>

        {/* Count */}
        <span className="text-[10px] text-muted-foreground">
          {filtered.length}
          {filtered.length !== students.length && ` / ${students.length}`}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-border dark:border-gray-700 rounded-lg">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50/80 dark:bg-gray-800/90">
              <th className="sticky left-0 z-10 bg-gray-50/80 dark:bg-gray-800/90 text-[11px] font-medium text-left px-2 py-1.5 border-b border-border dark:border-gray-700 min-w-[120px]">
                Student
              </th>
              <th className="sticky left-[120px] z-10 bg-gray-50/80 dark:bg-gray-800/90 text-[11px] font-medium text-center px-1 py-1.5 border-b border-border dark:border-gray-700 w-10">
                Grade
              </th>
              <th className="sticky left-[160px] z-10 bg-gray-50/80 dark:bg-gray-800/90 text-[11px] font-medium text-center px-1 py-1.5 border-b border-border dark:border-gray-700 min-w-[72px]">
                Progress
              </th>
              {lessonColumns.map((n) => (
                <th
                  key={n}
                  className="text-[11px] font-medium text-center px-1 py-1.5 border-b border-border dark:border-gray-700 min-w-[48px]"
                >
                  L{n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              // Loading skeleton
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td
                    colSpan={3 + lessonColumns.length}
                    className="px-2 py-2"
                  >
                    <div className="h-5 rounded animate-pulse bg-gray-100 dark:bg-gray-800" />
                  </td>
                </tr>
              ))
            ) : error ? (
              <tr>
                <td
                  colSpan={3 + lessonColumns.length}
                  className="px-4 py-6 text-center text-xs text-red-500"
                >
                  Failed to load students. Please refresh.
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={3 + lessonColumns.length}
                  className="px-4 py-6 text-center text-xs text-muted-foreground"
                >
                  {students.length === 0
                    ? "No student data available."
                    : "No matches."}
                </td>
              </tr>
            ) : (
              filtered.map((student) => {
                const pct =
                  student.total_lessons > 0
                    ? Math.round(
                        (student.placed_count / student.total_lessons) * 100
                      )
                    : 0;

                return (
                  <tr
                    key={student.application_id}
                    className="border-b border-border/50 dark:border-gray-700/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/30"
                  >
                    {/* Student name — sticky */}
                    <td className="sticky left-0 z-10 bg-white dark:bg-gray-900 px-2 py-1 border-r border-border/30 dark:border-gray-700/30">
                      <button
                        onClick={() =>
                          onClickStudent?.(student.application_id)
                        }
                        className="text-[11px] font-medium truncate max-w-[110px] block text-left hover:text-primary hover:underline"
                        title={student.student_name}
                      >
                        {student.student_name}
                      </button>
                    </td>

                    {/* Grade badge — sticky */}
                    <td className="sticky left-[120px] z-10 bg-white dark:bg-gray-900 text-center px-1 py-1 border-r border-border/30 dark:border-gray-700/30">
                      <span
                        className={cn(
                          "text-[10px] font-bold px-1 rounded",
                          SUMMER_GRADE_BG[student.grade] ||
                            "bg-gray-100 dark:bg-gray-700"
                        )}
                      >
                        {student.grade}
                      </span>
                    </td>

                    {/* Progress bar — sticky */}
                    <td className="sticky left-[160px] z-10 bg-white dark:bg-gray-900 px-1 py-1 border-r border-border/30 dark:border-gray-700/30">
                      <div className="flex items-center gap-1">
                        <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              pct === 100
                                ? "bg-green-400 dark:bg-green-400/80"
                                : pct > 0
                                  ? "bg-primary dark:bg-primary/80"
                                  : "bg-gray-300 dark:bg-gray-600"
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-muted-foreground w-7 text-right tabular-nums">
                          {student.placed_count}/{student.total_lessons}
                        </span>
                      </div>
                    </td>

                    {/* Lesson cells */}
                    {lessonColumns.map((n) => {
                      const lesson = student.lessons.find(
                        (l) => l.lesson_number === n
                      );
                      const placed = lesson?.placed;
                      const status = lesson?.session_status;

                      if (placed && lesson?.lesson_date) {
                        const bgColor =
                          status === "Confirmed"
                            ? "bg-green-50 dark:bg-green-900/20"
                            : status === "Tentative"
                              ? "bg-yellow-50 dark:bg-yellow-900/20"
                              : "bg-gray-50 dark:bg-gray-800/30";

                        return (
                          <td
                            key={n}
                            className={cn(
                              "text-center px-1 py-1",
                              bgColor
                            )}
                            title={`${formatShortDate(lesson.lesson_date)}, ${lesson.time_slot ?? ""} (${status ?? "Unknown"})`}
                          >
                            <span className="text-[11px] tabular-nums">
                              {formatCompactDate(lesson.lesson_date)}
                            </span>
                          </td>
                        );
                      }

                      // Empty / unplaced cell
                      return (
                        <td key={n} className="text-center px-1 py-1">
                          {onFindSlot ? (
                            <button
                              onClick={() => handleFindSlot(student, n)}
                              className="text-[10px] text-muted-foreground hover:text-primary hover:bg-primary/10 rounded px-1 py-0.5 transition-colors"
                              title={`Find slot for L${n}`}
                            >
                              ?
                            </button>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">
                              -
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
