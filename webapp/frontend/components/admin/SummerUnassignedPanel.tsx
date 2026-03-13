"use client";

import { useState, useMemo } from "react";
import { Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SummerApplication } from "@/types";

interface SummerUnassignedPanelProps {
  applications: SummerApplication[];
  grades: string[];
  loading?: boolean;
}

const GRADE_BG: Record<string, string> = {
  F1: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  F2: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  F3: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
};

const DAY_ABBREV: Record<string, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

function formatPref(day?: string | null, time?: string | null): string {
  if (!day || !time) return "-";
  return `${DAY_ABBREV[day] || day} ${time}`;
}

export function SummerUnassignedPanel({
  applications,
  grades,
  loading,
}: SummerUnassignedPanelProps) {
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = applications;
    if (gradeFilter) {
      result = result.filter((a) => a.grade === gradeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) =>
          a.student_name.toLowerCase().includes(q) ||
          a.reference_code?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [applications, gradeFilter, search]);

  return (
    <div className="w-72 flex-shrink-0 flex flex-col border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 space-y-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Unassigned</span>
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length}
            {filtered.length !== applications.length && ` / ${applications.length}`}
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full pl-7 pr-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-800"
          />
        </div>

        {/* Grade filter chips */}
        <div className="flex gap-1">
          <button
            onClick={() => setGradeFilter(null)}
            className={cn(
              "px-1.5 py-0.5 text-[10px] rounded-full transition-colors",
              gradeFilter === null
                ? "bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900"
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
                  ? "bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900"
                  : "bg-gray-100 dark:bg-gray-800 text-muted-foreground hover:bg-gray-200 dark:hover:bg-gray-700"
              )}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Student list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-3 space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 rounded animate-pulse bg-gray-100 dark:bg-gray-800" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            {applications.length === 0 ? "All students placed!" : "No matches."}
          </div>
        ) : (
          <div className="p-1.5 space-y-1">
            {filtered.map((app) => (
              <div
                key={app.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application-id", String(app.id));
                  e.dataTransfer.effectAllowed = "move";
                }}
                className="rounded border border-gray-200 dark:border-gray-700 px-2 py-1.5 cursor-grab active:cursor-grabbing hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium truncate flex-1">
                    {app.student_name}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-bold px-1 rounded",
                      GRADE_BG[app.grade] || "bg-gray-100 dark:bg-gray-700"
                    )}
                  >
                    {app.grade}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 space-x-2">
                  <span title="1st preference">
                    ① {formatPref(app.preference_1_day, app.preference_1_time)}
                  </span>
                  <span title="2nd preference">
                    ② {formatPref(app.preference_2_day, app.preference_2_time)}
                  </span>
                </div>
                {app.buddy_code && (
                  <div className="text-[9px] text-amber-600 dark:text-amber-400 mt-0.5">
                    Buddy: {app.buddy_code}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
