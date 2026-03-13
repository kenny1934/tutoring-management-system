"use client";

import { useState, useMemo } from "react";
import { Search, Users, PanelRightClose, PanelRightOpen, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SUMMER_GRADE_BG } from "@/lib/summer-utils";
import type { SummerApplication } from "@/types";

interface SummerUnassignedPanelProps {
  applications: SummerApplication[];
  grades: string[];
  loading?: boolean;
  onClickStudent?: (applicationId: number) => void;
  onDragStart?: (app: SummerApplication) => void;
  onDragEnd?: () => void;
}

const DAY_ABBREV: Record<string, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

type SortMode = "name" | "grade";

function formatPref(day?: string | null, time?: string | null): string {
  if (!day || !time) return "-";
  return `${DAY_ABBREV[day] || day} ${time}`;
}

export function SummerUnassignedPanel({
  applications,
  grades,
  loading,
  onClickStudent,
  onDragStart,
  onDragEnd,
}: SummerUnassignedPanelProps) {
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [sort, setSort] = useState<SortMode>("grade");

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
    // Sort
    result = [...result].sort((a, b) => {
      if (sort === "grade") {
        const cmp = a.grade.localeCompare(b.grade);
        return cmp !== 0 ? cmp : a.student_name.localeCompare(b.student_name);
      }
      return a.student_name.localeCompare(b.student_name);
    });
    return result;
  }, [applications, gradeFilter, search, sort]);

  // Collapsed state: thin vertical strip
  if (collapsed) {
    return (
      <div className="w-8 flex-shrink-0 flex flex-col items-center border border-border dark:border-gray-700 rounded-lg bg-card dark:bg-gray-900 py-3 gap-2">
        <button
          onClick={() => setCollapsed(false)}
          className="p-1 text-muted-foreground hover:text-foreground"
          title="Expand panel"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
        <span className="text-[10px] text-muted-foreground font-medium [writing-mode:vertical-lr] rotate-180">
          {applications.length}
        </span>
      </div>
    );
  }

  return (
    <div className="w-64 flex-shrink-0 flex flex-col border border-border dark:border-gray-700 rounded-lg bg-card dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border dark:border-gray-700 space-y-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Unassigned</span>
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length}
            {filtered.length !== applications.length && ` / ${applications.length}`}
          </span>
          <button
            onClick={() => setCollapsed(true)}
            className="p-0.5 text-muted-foreground hover:text-foreground"
            title="Collapse panel"
          >
            <PanelRightClose className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full pl-7 pr-2 py-1 text-xs border border-border dark:border-gray-700 rounded bg-background dark:bg-gray-800"
          />
        </div>

        {/* Grade filter chips + sort */}
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
          <button
            onClick={() => setSort(sort === "name" ? "grade" : "name")}
            className="ml-auto p-0.5 text-muted-foreground hover:text-foreground"
            title={`Sort by ${sort === "name" ? "grade" : "name"}`}
          >
            <ArrowUpDown className="h-3 w-3" />
          </button>
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
                  onDragStart?.(app);
                }}
                onDragEnd={() => onDragEnd?.()}
                className="rounded border border-border px-2 py-1.5 cursor-grab active:cursor-grabbing hover:bg-primary/5 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onClickStudent?.(app.id)}
                    className="text-xs font-medium truncate flex-1 text-left hover:text-primary hover:underline"
                    title="View application details"
                  >
                    {app.student_name}
                  </button>
                  <span
                    className={cn(
                      "text-[10px] font-bold px-1 rounded",
                      SUMMER_GRADE_BG[app.grade] || "bg-gray-100 dark:bg-gray-700"
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
                  <div className="text-[9px] text-primary/70 mt-0.5">
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
