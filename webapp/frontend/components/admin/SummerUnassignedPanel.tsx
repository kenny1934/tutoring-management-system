"use client";

import { useState, useMemo } from "react";
import { Search, Users, PanelRightClose, PanelRightOpen, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { DAY_ABBREV, SUMMER_GRADE_BG, SUMMER_GRADE_BORDER } from "@/lib/summer-utils";
import type { SummerApplication } from "@/types";

interface SummerUnassignedPanelProps {
  applications: SummerApplication[];
  grades: string[];
  loading?: boolean;
  onClickStudent?: (applicationId: number) => void;
  onDragStart?: (app: SummerApplication) => void;
  onDragEnd?: () => void;
  className?: string;
  hideCollapse?: boolean;
  totalLessons?: number;
}


type SortMode = "name" | "grade" | "pref";

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
  className,
  hideCollapse,
  totalLessons = 8,
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
      if (sort === "pref") {
        // Students with preferences first, then by grade
        const aPref = a.preference_1_day ? 0 : 1;
        const bPref = b.preference_1_day ? 0 : 1;
        if (aPref !== bPref) return aPref - bPref;
        const cmp = a.grade.localeCompare(b.grade);
        return cmp !== 0 ? cmp : a.student_name.localeCompare(b.student_name);
      }
      if (sort === "grade") {
        const cmp = a.grade.localeCompare(b.grade);
        return cmp !== 0 ? cmp : a.student_name.localeCompare(b.student_name);
      }
      return a.student_name.localeCompare(b.student_name);
    });
    return result;
  }, [applications, gradeFilter, search, sort]);

  return (
    <div className={cn(
      "relative flex-shrink-0 flex flex-col border-2 border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-[#fef9f3] dark:bg-[#1a1a1a] overflow-hidden transition-[width] duration-300 ease-in-out",
      collapsed ? "w-8" : "w-64",
      className
    )}>
      {/* Collapsed state overlay */}
      <div className={cn(
        "absolute inset-0 flex flex-col items-center py-3 gap-2 transition-opacity duration-200",
        collapsed ? "opacity-100 delay-100" : "opacity-0 pointer-events-none"
      )}>
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

      {/* Expanded content */}
      <div className={cn(
        "flex flex-col flex-1 min-h-0 min-w-[256px] transition-opacity duration-200",
        collapsed ? "opacity-0 pointer-events-none" : "opacity-100 delay-100"
      )}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a] space-y-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Unassigned</span>
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length}
            {filtered.length !== applications.length && ` / ${applications.length}`}
          </span>
          {!hideCollapse && (
            <button
              onClick={() => setCollapsed(true)}
              className="p-0.5 text-muted-foreground hover:text-foreground"
              title="Collapse panel"
            >
              <PanelRightClose className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full pl-7 pr-2 py-1 text-xs border border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 rounded bg-white dark:bg-gray-800"
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
          <button
            onClick={() => setSort(sort === "name" ? "grade" : sort === "grade" ? "pref" : "name")}
            className="ml-auto p-0.5 text-muted-foreground hover:text-foreground"
            title={`Sort by ${sort === "name" ? "grade" : sort === "grade" ? "preference" : "name"}`}
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
                className={cn(
                  "rounded border border-l-[3px] border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 bg-white dark:bg-[#1a1a1a] px-2 py-1.5 cursor-grab active:cursor-grabbing hover:bg-[#fef9f3]/80 dark:hover:bg-[#2d2618]/50 transition-colors",
                  SUMMER_GRADE_BORDER[app.grade] || "border-l-gray-300"
                )}
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
                  {(app.sessions_per_week ?? 1) > 1 && (
                    <span className="text-[8px] font-medium text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30 px-0.5 rounded">
                      {app.sessions_per_week}x
                    </span>
                  )}
                  {(app.placed_count ?? 0) > 0 && (
                    <span className="text-[9px] font-medium text-primary bg-primary/10 px-1 rounded">
                      {app.placed_count}/{totalLessons}
                    </span>
                  )}
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
    </div>
  );
}
