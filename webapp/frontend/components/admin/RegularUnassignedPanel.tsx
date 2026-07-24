"use client";

import { useState, useMemo, useRef } from "react";
import useSWR from "swr";
import {
  Search, Users, PanelRightClose, PanelRightOpen, Loader2, X, Info, CheckCircle2,
  ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SUMMER_GRADE_BORDER, DAY_ABBREV, effectiveStream } from "@/lib/regular-utils";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import {
  REGULAR_ALL_STATUSES, REGULAR_STATUS_COLORS, REGULAR_STATUS_ICONS,
} from "./RegularApplicationCard";
import { regularAPI } from "@/lib/api";
import type { RegularApplication, RegularSuggestion } from "@/types";

interface RegularUnassignedPanelProps {
  applications: RegularApplication[];
  grades: string[];
  /** Selectable language streams (C/E) for the panel's stream filter. Empty
   *  hides the stream chips — a branch with no declared streams filters on
   *  grade alone. */
  streams?: string[];
  configId: number | null;
  loading?: boolean;
  readOnly?: boolean;
  onAssign: (applicationId: number, slotId: number) => void;
  onDragStart?: (app: RegularApplication) => void;
  onDragEnd?: () => void;
  className?: string;
  hideCollapse?: boolean;
  /** "drag" (default): cards are drag sources only. "select": card tap selects
   * the student for tap-to-place (mobile drawer). */
  tapMode?: "drag" | "select";
  onSelectStudent?: (applicationId: number) => void;
  /** Opens the application detail modal. In drag mode a card click fires this
   * when the pointer barely moved, so dragging still wins over clicking. */
  onClickStudent?: (applicationId: number) => void;
  /** Describes the demand-bar filter the grid applied to `applications`, so
   * the panel can say why the list is narrowed and offer a way out. */
  demandFilterLabel?: string | null;
  onClearDemandFilter?: () => void;
  /** Set when a header status chip scoped `applications` to one status; the
   * heading and its icon follow the chip. */
  statusFilter?: string | null;
  onClearStatusFilter?: () => void;
}

type SortMode = "grade" | "pref" | "status" | "name";

const SORT_CYCLE: SortMode[] = ["grade", "pref", "status", "name"];
const SORT_LABELS: Record<SortMode, string> = {
  grade: "grade", pref: "preference", status: "status", name: "name",
};
// Ladder position, so "sort by status" reads as progress through the workflow.
const STATUS_ORDER = new Map(REGULAR_ALL_STATUSES.map((s, i) => [s, i] as const));

/** Reason tokens from the suggest endpoint mapped to admin-facing labels. */
function reasonLabel(reason: string): string {
  if (reason === "pref_1_match") return "Matches 1st choice";
  if (reason === "pref_2_match") return "Matches 2nd choice";
  if (reason === "same_grade") return "Same grade";
  if (reason === "stream_match") return "Same stream";
  const schoolmates = /^schoolmates:(\d+)$/.exec(reason);
  if (schoolmates) return `Schoolmates ×${schoolmates[1]}`;
  return reason;
}

function SuggestionList({
  configId,
  applicationId,
  readOnly,
  onPick,
}: {
  configId: number;
  applicationId: number;
  readOnly: boolean;
  onPick: (slotId: number) => void;
}) {
  const { data, error } = useSWR(
    ["regular-suggestions", configId, applicationId],
    () => regularAPI.getSuggestions(configId, applicationId)
  );

  if (error) {
    return <div className="p-2 text-[10px] text-red-500">Failed to load suggestions.</div>;
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center gap-1 p-2 text-[10px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Finding slots...
      </div>
    );
  }
  if (data.suggestions.length === 0) {
    return (
      <div className="p-2 text-[10px] text-muted-foreground">
        No open slots match. Create a slot with free capacity first.
      </div>
    );
  }
  return (
    <div className="divide-y divide-[#e8d4b8]/40 dark:divide-[#6b5a4a]/40">
      {data.suggestions.map((s: RegularSuggestion) => (
        <button
          key={s.slot_id}
          type="button"
          disabled={readOnly}
          onClick={(e) => {
            e.stopPropagation();
            onPick(s.slot_id);
          }}
          className="w-full text-left px-2 py-1.5 hover:bg-primary/10 transition-colors disabled:cursor-default disabled:hover:bg-transparent"
          title="Assign to this slot"
        >
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="font-semibold font-mono">
              {DAY_ABBREV[s.slot_day] || s.slot_day} {s.time_slot}
            </span>
            {(s.grade || s.lang_stream) && (
              <span className="text-muted-foreground">{s.grade ?? ""}{s.lang_stream ?? ""}</span>
            )}
            <span className="text-muted-foreground truncate">
              {s.tutor_name || "No tutor"}
            </span>
            <span className="ml-auto tabular-nums text-muted-foreground shrink-0">
              {s.assigned_count}/{s.max_students}
            </span>
          </div>
          {s.reasons.length > 0 && (
            <div className="mt-0.5 flex items-center gap-1 flex-wrap">
              {s.reasons.map((r) => (
                <span
                  key={r}
                  className="text-[8px] px-1 py-0 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300"
                >
                  {reasonLabel(r)}
                </span>
              ))}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

/** A pill toggle in the panel's grade/stream filter row. */
function FilterChip({
  label,
  active,
  onClick,
  title,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "px-1.5 py-0.5 text-[10px] rounded-full transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-[#e8d4b8]/20 dark:bg-[#6b5a4a]/20 text-muted-foreground hover:bg-[#e8d4b8]/40 dark:hover:bg-[#6b5a4a]/40"
      )}
    >
      {label}
    </button>
  );
}

export function RegularUnassignedPanel({
  applications,
  grades,
  streams = [],
  configId,
  loading,
  readOnly = false,
  onAssign,
  onDragStart,
  onDragEnd,
  className,
  hideCollapse,
  tapMode = "drag",
  onSelectStudent,
  onClickStudent,
  demandFilterLabel,
  onClearDemandFilter,
  statusFilter,
  onClearStatusFilter,
}: RegularUnassignedPanelProps) {
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState<string | null>(null);
  const [streamFilter, setStreamFilter] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [sort, setSort] = useState<SortMode>("grade");
  const [suggestForId, setSuggestForId] = useState<number | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  const filtered = useMemo(() => {
    let result = applications;
    if (gradeFilter) {
      result = result.filter((a) => a.grade === gradeFilter);
    }
    if (streamFilter) {
      // Effective stream so an Int applicant filters under English, matching
      // the badge colour and how the grid buckets demand.
      result = result.filter((a) => effectiveStream(a) === streamFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) =>
          a.student_name.toLowerCase().includes(q) ||
          a.reference_code?.toLowerCase().includes(q) ||
          a.school?.toLowerCase().includes(q)
      );
    }
    const byName = (a: RegularApplication, b: RegularApplication) =>
      a.student_name.localeCompare(b.student_name);
    return [...result].sort((a, b) => {
      if (sort === "pref") {
        // Applications with no first choice float up: they need a decision.
        const aPref = a.preference_1_day ? 0 : 1;
        const bPref = b.preference_1_day ? 0 : 1;
        if (aPref !== bPref) return aPref - bPref;
        const cmp = a.grade.localeCompare(b.grade);
        return cmp !== 0 ? cmp : byName(a, b);
      }
      if (sort === "status") {
        const diff =
          (STATUS_ORDER.get(a.application_status) ?? 99) -
          (STATUS_ORDER.get(b.application_status) ?? 99);
        return diff !== 0 ? diff : byName(a, b);
      }
      if (sort === "grade") {
        const cmp = a.grade.localeCompare(b.grade);
        if (cmp !== 0) return cmp;
        // Within a grade, group by stream (F1C before F1E) so the list reads
        // the same way the grid's grade-stream demand bars are ordered.
        const sc = (effectiveStream(a) ?? "").localeCompare(effectiveStream(b) ?? "");
        return sc !== 0 ? sc : byName(a, b);
      }
      return byName(a, b);
    });
  }, [applications, gradeFilter, streamFilter, search, sort]);

  const nextSort = SORT_CYCLE[(SORT_CYCLE.indexOf(sort) + 1) % SORT_CYCLE.length];
  const StatusHeaderIcon = statusFilter ? REGULAR_STATUS_ICONS[statusFilter] : null;
  const statusHeaderColors = statusFilter ? REGULAR_STATUS_COLORS[statusFilter] : null;

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
            {StatusHeaderIcon && statusHeaderColors ? (
              <StatusHeaderIcon className={cn("h-4 w-4", statusHeaderColors.text)} />
            ) : (
              <Users className="h-4 w-4 text-muted-foreground" />
            )}
            {/* A demand-bar or status filter shows everyone it matches, placed
                or not, so the heading stops claiming they are all unassigned. */}
            <span className="text-sm font-medium truncate">
              {demandFilterLabel ? "Demand" : statusFilter ?? "Unassigned"}
            </span>
            <span className="text-xs text-muted-foreground ml-auto">
              {filtered.length}
              {filtered.length !== applications.length && ` / ${applications.length}`}
            </span>
            {statusFilter && onClearStatusFilter && (
              <button
                onClick={onClearStatusFilter}
                className="p-0.5 text-muted-foreground hover:text-foreground"
                title={`Clear the ${statusFilter} filter`}
                aria-label="Clear status filter"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
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
              placeholder="Search name, ref code, school..."
              className="w-full pl-7 pr-2 py-1 text-xs border border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 rounded bg-white dark:bg-gray-800"
            />
          </div>

          {/* Grade filter chips */}
          <div className="flex items-center gap-1 flex-wrap">
            <FilterChip label="All" active={gradeFilter === null} onClick={() => setGradeFilter(null)} />
            {grades.map((g) => (
              <FilterChip
                key={g}
                label={g}
                active={gradeFilter === g}
                onClick={() => setGradeFilter(gradeFilter === g ? null : g)}
              />
            ))}
            {/* Stream chips — orthogonal to grade, so an admin can narrow to
                e.g. every F-grade Chinese applicant at once. */}
            {streams.length > 0 && (
              <span
                className="mx-0.5 h-3 w-px bg-[#e8d4b8] dark:bg-[#6b5a4a]"
                aria-hidden
              />
            )}
            {streams.map((s) => (
              <FilterChip
                key={s}
                label={s}
                active={streamFilter === s}
                onClick={() => setStreamFilter(streamFilter === s ? null : s)}
                title={s === "C" ? "Chinese stream" : s === "E" ? "English stream" : s}
              />
            ))}
            <button
              onClick={() => setSort(nextSort)}
              className="ml-auto p-0.5 text-muted-foreground hover:text-foreground"
              title={`Sorted by ${SORT_LABELS[sort]} — click to sort by ${SORT_LABELS[nextSort]}`}
              aria-label={`Sort by ${SORT_LABELS[nextSort]}`}
            >
              <ArrowUpDown className="h-3 w-3" />
            </button>
          </div>

          {/* Demand-bar filter, set by clicking a sparkline in the grid */}
          {demandFilterLabel && (
            <div className="flex items-center gap-1 rounded bg-primary/10 px-1.5 py-1">
              <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-primary">
                {demandFilterLabel}
              </span>
              <button
                onClick={() => onClearDemandFilter?.()}
                className="shrink-0 p-0.5 text-primary/70 hover:text-primary"
                title="Clear demand filter"
                aria-label="Clear demand filter"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        {/* Application list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-14 rounded animate-pulse bg-gray-100 dark:bg-gray-800" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              {applications.length > 0
                ? "No matches."
                : demandFilterLabel
                  ? "No applications behind this bar."
                  : statusFilter
                    ? `No applications at ${statusFilter}.`
                    : "All applications assigned."}
            </div>
          ) : (
            <div className="p-1.5 space-y-1">
              {filtered.map((app) => {
                const suggestOpen = suggestForId === app.id;
                const statusColors =
                  REGULAR_STATUS_COLORS[app.application_status] || REGULAR_STATUS_COLORS["Submitted"];
                return (
                  <div
                    key={app.id}
                    draggable={!readOnly && tapMode === "drag"}
                    onPointerDown={readOnly ? undefined : (e) => {
                      pointerStartRef.current = { x: e.clientX, y: e.clientY };
                    }}
                    onDragStart={readOnly ? undefined : (e) => {
                      pointerStartRef.current = null;
                      e.dataTransfer.setData("application-id", String(app.id));
                      e.dataTransfer.effectAllowed = "move";
                      onDragStart?.(app);
                    }}
                    onDragEnd={readOnly ? undefined : () => onDragEnd?.()}
                    onClick={(e) => {
                      // A drag ends in a click too, so only treat it as a click
                      // when the pointer barely moved between down and up.
                      const start = pointerStartRef.current;
                      pointerStartRef.current = null;
                      if (readOnly) {
                        onClickStudent?.(app.id);
                        return;
                      }
                      if (!start) return;
                      const dx = e.clientX - start.x;
                      const dy = e.clientY - start.y;
                      if (dx * dx + dy * dy > 16) return;
                      if (tapMode === "select") {
                        onSelectStudent?.(app.id);
                      } else {
                        onClickStudent?.(app.id);
                      }
                    }}
                    className={cn(
                      "rounded border border-l-[3px] border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 bg-white dark:bg-[#1a1a1a] px-2 py-1.5 hover:bg-[#fef9f3]/80 dark:hover:bg-[#2d2618]/50 transition-colors",
                      tapMode === "select"
                        ? "cursor-pointer"
                        : readOnly ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
                      SUMMER_GRADE_BORDER[app.grade] || "border-l-gray-300"
                    )}
                  >
                    {/* Row 1: identity — same renderer as every other student surface */}
                    <div className="flex items-center gap-1 min-w-0">
                      <div className="min-w-0 flex-1">
                        <StudentInfoBadges
                          gradeIsEntering
                          student={{
                            student_name: app.student_name,
                            school_student_id: app.linked_student?.school_student_id || undefined,
                            grade: app.grade,
                            // Effective stream so Int colours as English, never grey.
                            lang_stream: effectiveStream(app) ?? undefined,
                          }}
                        />
                      </div>
                      {/* In tap-to-place mode, the card surface tap selects for
                          placement, so the detail modal needs its own affordance. */}
                      {tapMode === "select" && onClickStudent && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onClickStudent(app.id);
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          className="shrink-0 p-0.5 -m-0.5 text-muted-foreground/70 hover:text-foreground"
                          title="View application details"
                          aria-label="View application details"
                        >
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {/* Already in a slot — only reachable through the demand
                          filter, where the list is not the unassigned cohort. */}
                      {app.assigned_slot_id != null && (
                        <span className="shrink-0 flex items-center" title="Already assigned to a slot">
                          <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
                        </span>
                      )}
                      {/* Status dot — compact version of the full status badge */}
                      <span
                        className={cn("shrink-0 w-2 h-2 rounded-full", statusColors.dot)}
                        title={app.application_status}
                      />
                    </div>
                    {/* School stays on its own line: the suggest ranking scores
                        schoolmates, so it earns the room a chip would not. */}
                    {app.school && (
                      <div className="mt-0.5 text-[9px] text-muted-foreground truncate" title={app.school}>
                        {app.school}
                      </div>
                    )}

                    {/* Row 2: preferences */}
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {app.preference_1_day && app.preference_1_time ? (
                        <span className="shrink-0 font-mono text-[9px] px-1 py-0 rounded bg-gray-100 dark:bg-gray-800 text-foreground" title="First choice">
                          {DAY_ABBREV[app.preference_1_day] || app.preference_1_day} {app.preference_1_time}
                        </span>
                      ) : (
                        <span className="text-[9px] text-red-500">No preference</span>
                      )}
                      {app.preference_2_day && app.preference_2_time && (
                        <>
                          <span className="shrink-0 text-[8px] text-muted-foreground/60 uppercase tracking-wide">alt</span>
                          <span className="shrink-0 font-mono text-[9px] px-1 py-0 rounded border border-dashed border-gray-300 dark:border-gray-700 text-muted-foreground" title="Backup choice">
                            {DAY_ABBREV[app.preference_2_day] || app.preference_2_day} {app.preference_2_time}
                          </span>
                        </>
                      )}
                      {!readOnly && configId && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSuggestForId(suggestOpen ? null : app.id);
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          className="ml-auto text-[9px] font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:underline"
                          title="Suggest matching slots"
                        >
                          Suggest
                        </button>
                      )}
                    </div>

                    {/* Suggest popover: anchored under the card so it scrolls
                        with the list and never clips against the panel edge. */}
                    {suggestOpen && configId && (
                      <div
                        className="mt-1 rounded border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] shadow-md overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between px-2 py-1 bg-[#fef9f3] dark:bg-[#2d2618] border-b border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60">
                          <span className="text-[9px] font-medium text-muted-foreground">Suggested slots</span>
                          <button
                            onClick={() => setSuggestForId(null)}
                            className="p-0.5 text-muted-foreground hover:text-foreground"
                            title="Close suggestions"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                        <SuggestionList
                          configId={configId}
                          applicationId={app.id}
                          readOnly={readOnly}
                          onPick={(slotId) => {
                            setSuggestForId(null);
                            onAssign(app.id, slotId);
                          }}
                        />
                      </div>
                    )}
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
