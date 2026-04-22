"use client";

import { useState, useMemo } from "react";
import { Search, Users, User, PanelRightClose, PanelRightOpen, ArrowUpDown, AlertTriangle, CheckCircle2, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SUMMER_GRADE_BORDER, MIN_GROUP_SIZE, PlacementDotStrip, DAY_ABBREV, getLinkedStudentId } from "@/lib/summer-utils";
import { STATUS_COLORS, STATUS_ICONS } from "@/components/admin/SummerApplicationCard";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import { PrimaryBranchChip } from "@/components/admin/PrimaryBranchChip";
import { classifyPrefs } from "@/lib/summer-preferences";
import type { DemandBarFilter } from "@/components/admin/SummerSlotCell";
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
  onSuggestStudent?: (applicationId: number, studentName: string) => void;
  prefFilter?: DemandBarFilter | null;
  onClearPrefFilter?: () => void;
  /** When set, the panel is scoped to apps matching this workflow status rather
   * than the default incomplete list. Heading + banner reflect the active chip. */
  statusFilter?: string | null;
  onClearStatusFilter?: () => void;
}

type SortMode = "name" | "grade" | "pref" | "completion";

const SORT_CYCLE: SortMode[] = ["grade", "pref", "completion", "name"];
const SORT_LABELS: Record<SortMode, string> = {
  name: "name", grade: "grade", pref: "preference", completion: "completion",
};

function FilterBanner({
  children,
  onClear,
  clearTitle,
}: {
  children: React.ReactNode;
  onClear?: () => void;
  clearTitle: string;
}) {
  return (
    <div className="flex items-center gap-1 text-[10px]">
      {children}
      <button
        onClick={onClear}
        className="ml-auto p-0.5 text-muted-foreground hover:text-foreground rounded hover:bg-[#e8d4b8]/30"
        title={clearTitle}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function emptyStateMessage(statusFilter?: string | null, prefFilter?: DemandBarFilter | null): string {
  if (statusFilter) return `No applications at ${statusFilter}.`;
  if (prefFilter) return "No applications match this demand.";
  return "All students fully placed!";
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
  onSuggestStudent,
  prefFilter,
  onClearPrefFilter,
  statusFilter,
  onClearStatusFilter,
}: SummerUnassignedPanelProps) {
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState<string | null>(null);
  const [buddiesOnly, setBuddiesOnly] = useState(false);
  const [noNotesOnly, setNoNotesOnly] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [sort, setSort] = useState<SortMode>("grade");

  const StatusHeaderIcon = statusFilter ? STATUS_ICONS[statusFilter] : null;
  const statusHeaderColors = statusFilter ? STATUS_COLORS[statusFilter] : null;

  const filtered = useMemo(() => {
    let result = applications;
    if (gradeFilter) {
      result = result.filter((a) => a.grade === gradeFilter);
    }
    if (buddiesOnly) {
      result = result.filter((a) => !!a.buddy_group_id);
    }
    if (noNotesOnly) {
      result = result.filter((a) => !a.unavailability_notes);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) =>
          a.student_name.toLowerCase().includes(q) ||
          a.reference_code?.toLowerCase().includes(q) ||
          getLinkedStudentId(a)?.toLowerCase().includes(q)
      );
    }
    result = [...result].sort((a, b) => {
      if (sort === "completion") {
        const diff = (a.placed_count ?? 0) - (b.placed_count ?? 0);
        return diff !== 0 ? diff : a.student_name.localeCompare(b.student_name);
      }
      if (sort === "pref") {
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
  }, [applications, gradeFilter, buddiesOnly, noNotesOnly, search, sort]);

  const nextSort = SORT_CYCLE[(SORT_CYCLE.indexOf(sort) + 1) % SORT_CYCLE.length];

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
        "flex flex-col flex-1 min-h-0 min-w-0 sm:min-w-[256px] transition-opacity duration-200",
        collapsed ? "opacity-0 pointer-events-none" : "opacity-100 delay-100"
      )}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a] space-y-2">
        <div className="flex items-center gap-2">
          {StatusHeaderIcon && statusHeaderColors
            ? <StatusHeaderIcon className={cn("h-4 w-4", statusHeaderColors.text)} />
            : <Users className="h-4 w-4 text-muted-foreground" />}
          <span className="text-sm font-medium truncate">
            {prefFilter ? "Demand" : statusFilter ?? "Incomplete"}
          </span>
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
            placeholder="Search name, ref code, student ID..."
            className="w-full pl-7 pr-2 py-1 text-xs border border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 rounded bg-white dark:bg-gray-800"
          />
        </div>

        {prefFilter && (
          <FilterBanner onClear={onClearPrefFilter} clearTitle="Clear filter">
            <span className="text-muted-foreground">Showing</span>
            <span className="font-semibold">{prefFilter.grade}</span>
            <span className="text-muted-foreground">{prefFilter.tier === "first" ? "1st" : "2nd"} pref for</span>
            <span className="font-semibold">{DAY_ABBREV[prefFilter.day] || prefFilter.day} {prefFilter.timeSlot}</span>
          </FilterBanner>
        )}

        {!prefFilter && statusFilter && (
          <FilterBanner onClear={onClearStatusFilter} clearTitle="Clear workflow filter">
            <span className="text-muted-foreground">Workflow:</span>
            <span className={cn("font-semibold", statusHeaderColors?.text)}>
              {statusFilter}
            </span>
            <span className="text-muted-foreground">· includes placed</span>
          </FilterBanner>
        )}

        {/* Grade filter chips + buddy toggle + sort */}
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
            onClick={() => setNoNotesOnly(!noNotesOnly)}
            className={cn(
              "ml-auto px-1.5 py-0.5 text-[10px] rounded-full transition-colors",
              noNotesOnly
                ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                : "bg-[#e8d4b8]/20 dark:bg-[#6b5a4a]/20 text-muted-foreground hover:bg-[#e8d4b8]/40 dark:hover:bg-[#6b5a4a]/40"
            )}
            title={noNotesOnly ? "Showing only students with no unavailability notes" : "Show only students with no unavailability notes"}
          >
            <CheckCircle2 className="h-3 w-3 inline -mt-px" />
          </button>
          <button
            onClick={() => setBuddiesOnly(!buddiesOnly)}
            className={cn(
              "px-1.5 py-0.5 text-[10px] rounded-full transition-colors",
              buddiesOnly
                ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300"
                : "bg-[#e8d4b8]/20 dark:bg-[#6b5a4a]/20 text-muted-foreground hover:bg-[#e8d4b8]/40 dark:hover:bg-[#6b5a4a]/40"
            )}
            title={buddiesOnly ? "Showing buddies only" : "Show buddies only"}
          >
            <Users className="h-3 w-3 inline -mt-px" />
          </button>
          <button
            onClick={() => setSort(nextSort)}
            className="p-0.5 text-muted-foreground hover:text-foreground"
            title={`Sort by ${SORT_LABELS[nextSort]}`}
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
              <div key={i} className="h-14 rounded animate-pulse bg-gray-100 dark:bg-gray-800" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            {applications.length === 0 ? emptyStateMessage(statusFilter, prefFilter) : "No matches."}
          </div>
        ) : (
          <div className="p-1.5 space-y-1">
            {filtered.map((app) => {
              const statusColors = STATUS_COLORS[app.application_status] || STATUS_COLORS["Submitted"];
              const buddyGroupSize = app.buddy_group_id ? (app.buddy_group_member_count ?? 1) : 0;
              const buddyUnlocked = buddyGroupSize >= MIN_GROUP_SIZE;
              const classified = classifyPrefs(app);
              const placedCount = app.placed_count ?? 0;
              const sessionsPerWeek = app.sessions_per_week ?? 1;

              return (
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
                  {/* Row 1: identity — matches applications card layout */}
                  <div className="flex items-center gap-1 min-w-0">
                    <div className="min-w-0 flex-1" onClick={() => onClickStudent?.(app.id)}>
                      <StudentInfoBadges
                        student={{
                          student_name: app.student_name,
                          grade: app.grade,
                          lang_stream: app.lang_stream ?? undefined,
                        }}
                        trailing={
                          <>
                            <PrimaryBranchChip app={app} />
                            {buddyGroupSize > 0 && (
                              <span
                                className={cn(
                                  "shrink-0 inline-flex items-center gap-0.5 px-0.5 py-0.5 rounded",
                                  buddyUnlocked
                                    ? "bg-green-100 dark:bg-green-900/30"
                                    : "bg-amber-100 dark:bg-amber-900/30"
                                )}
                                title={
                                  (app.buddy_names || `Buddy group of ${buddyGroupSize}`) +
                                  (buddyUnlocked ? " — discount unlocked" : ` — needs ${MIN_GROUP_SIZE - buddyGroupSize} more`)
                                }
                              >
                                {Array.from({ length: MIN_GROUP_SIZE }).map((_, i) => (
                                  <User
                                    key={i}
                                    className={cn(
                                      "h-2.5 w-2.5",
                                      i < buddyGroupSize
                                        ? (buddyUnlocked
                                            ? "text-green-600 dark:text-green-400 fill-green-600 dark:fill-green-400"
                                            : "text-amber-600 dark:text-amber-400 fill-amber-600 dark:fill-amber-400")
                                        : "text-muted-foreground/40"
                                    )}
                                  />
                                ))}
                              </span>
                            )}
                          </>
                        }
                      />
                    </div>
                    {/* Status dot — compact version of the full status badge */}
                    <span
                      className={cn("shrink-0 w-2 h-2 rounded-full", statusColors.dot)}
                      title={app.application_status}
                    />
                  </div>

                  {/* Row 2: preferences — same pill style as applications card */}
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    <Clock className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
                    {sessionsPerWeek > 1 && (
                      <span className="shrink-0 text-[9px] font-bold px-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                        2×
                      </span>
                    )}
                    {classified.primary.length > 0 ? (
                      <>
                        {classified.primary.map((s, i) => (
                          <span
                            key={`p${i}`}
                            className="shrink-0 font-mono text-[9px] px-1 py-0 rounded bg-gray-100 dark:bg-gray-800 text-foreground"
                          >
                            {s.day} {s.time}
                          </span>
                        ))}
                        {classified.backup.length > 0 && (
                          <>
                            <span className="shrink-0 text-[8px] text-muted-foreground/60 uppercase tracking-wide">alt</span>
                            {classified.backup.map((s, i) => (
                              <span
                                key={`b${i}`}
                                className="shrink-0 font-mono text-[9px] px-1 py-0 rounded border border-dashed border-gray-300 dark:border-gray-700 text-muted-foreground"
                              >
                                {s.day} {s.time}
                              </span>
                            ))}
                          </>
                        )}
                      </>
                    ) : (
                      <span className="text-[9px] text-red-500">No prefs</span>
                    )}
                  </div>

                  {/* Row 3: placement dots + unavailability + suggest */}
                  <div className="flex items-center gap-1 mt-1">
                    <PlacementDotStrip sessions={app.sessions} totalLessons={totalLessons} />
                    <span className="text-[9px] text-muted-foreground tabular-nums">
                      {placedCount}/{totalLessons}
                    </span>
                    {app.unavailability_notes && (
                      <span title={app.unavailability_notes} className="shrink-0">
                        <AlertTriangle className="h-3 w-3 text-amber-500" />
                      </span>
                    )}
                    {onSuggestStudent && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onSuggestStudent(app.id, app.student_name); }}
                        className="ml-auto text-[9px] font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:underline"
                        title="Auto-suggest placement for this student"
                      >
                        Suggest
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
