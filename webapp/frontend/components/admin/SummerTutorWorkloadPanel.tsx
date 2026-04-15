"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { SUMMER_GRADE_BG } from "@/lib/summer-utils";
import type { SummerSlot } from "@/types";

interface Props {
  slots: SummerSlot[];
  open: boolean;
}

type TutorRow = {
  tutorId: number | null;
  tutorName: string;
  lessonCount: number;
  students: number;
  capacity: number;
  gradeCounts: Map<string, number>;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function fillTone(pct: number, hasCapacity: boolean): string {
  if (!hasCapacity) return "text-muted-foreground";
  if (pct >= 75) return "text-green-600 dark:text-green-400";
  if (pct >= 40) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

export function SummerTutorWorkloadPanel({ slots, open }: Props) {
  const { rows, summary } = useMemo(() => {
    if (!open) return { rows: [] as TutorRow[], summary: null };

    const byTutor = new Map<number | null, TutorRow>();
    for (const s of slots) {
      const key = s.tutor_id ?? null;
      let row = byTutor.get(key);
      if (!row) {
        row = {
          tutorId: key,
          tutorName: key == null ? "Unassigned" : (s.tutor_name || `Tutor #${s.tutor_id}`),
          lessonCount: 0,
          students: 0,
          capacity: 0,
          gradeCounts: new Map(),
        };
        byTutor.set(key, row);
      }
      row.lessonCount += 1;
      row.students += s.session_count ?? 0;
      row.capacity += s.max_students ?? 0;
      const g = s.grade ?? "—";
      row.gradeCounts.set(g, (row.gradeCounts.get(g) ?? 0) + 1);
    }

    const allRows = Array.from(byTutor.values());
    allRows.sort((a, b) => {
      if (a.tutorId == null && b.tutorId != null) return 1;
      if (b.tutorId == null && a.tutorId != null) return -1;
      if (b.lessonCount !== a.lessonCount) return b.lessonCount - a.lessonCount;
      return a.tutorName.localeCompare(b.tutorName);
    });

    const assignedCounts = allRows
      .filter((r) => r.tutorId != null)
      .map((r) => r.lessonCount);
    const summary = assignedCounts.length
      ? {
          min: Math.min(...assignedCounts),
          med: median(assignedCounts),
          max: Math.max(...assignedCounts),
          tutors: assignedCounts.length,
        }
      : null;

    return { rows: allRows, summary };
  }, [slots, open]);

  if (!open) return null;

  return (
    <div className="border-t border-[#e8d4b8]/70 dark:border-[#6b5a4a]/70 pt-2">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2">
        <span className="font-medium text-foreground">Workload</span>
        {summary ? (
          <>
            <span>·</span>
            <span>
              min <span className="text-foreground font-medium">{summary.min}</span> / median{" "}
              <span className="text-foreground font-medium">{summary.med}</span> / max{" "}
              <span className="text-foreground font-medium">{summary.max}</span> lessons
            </span>
            <span>·</span>
            <span>{summary.tutors} {summary.tutors === 1 ? "tutor" : "tutors"} assigned</span>
          </>
        ) : (
          <span>No slots yet</span>
        )}
      </div>
      {rows.length > 0 && (
        <div className="flex flex-col gap-1">
          {rows.map((r) => {
            const hasCapacity = r.capacity > 0;
            const pct = hasCapacity ? Math.round((r.students / r.capacity) * 100) : 0;
            const isUnassigned = r.tutorId == null;
            return (
              <div
                key={r.tutorId ?? "unassigned"}
                className={cn(
                  "flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1 rounded-md text-xs",
                  isUnassigned
                    ? "bg-red-50/60 dark:bg-red-900/10 border border-red-200/70 dark:border-red-900/30"
                    : "bg-white/60 dark:bg-gray-800/40 border border-[#e8d4b8]/50 dark:border-[#6b5a4a]/40",
                )}
              >
                <span
                  className={cn(
                    "font-medium min-w-[8rem] truncate",
                    isUnassigned ? "text-red-700 dark:text-red-300" : "text-foreground",
                  )}
                  title={r.tutorName}
                >
                  {r.tutorName}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  <span className="text-foreground font-medium">{r.lessonCount}</span>{" "}
                  {r.lessonCount === 1 ? "lesson" : "lessons"}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  <span className="text-foreground">{r.students}</span>
                  <span className="text-muted-foreground">/{r.capacity || "—"}</span> stu
                </span>
                <span className={cn("tabular-nums", fillTone(pct, hasCapacity))}>
                  {hasCapacity ? `${pct}%` : "—"}
                </span>
                <div className="flex flex-wrap items-center gap-1 ml-auto">
                  {Array.from(r.gradeCounts.entries())
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([grade, count]) => (
                      <span
                        key={grade}
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-medium",
                          SUMMER_GRADE_BG[grade] ??
                            "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
                        )}
                      >
                        {grade}×{count}
                      </span>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
