"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSessions, useActiveTutors, usePageTitle } from "@/lib/hooks";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "@/contexts/LocationContext";
import { useRole } from "@/contexts/RoleContext";
import { useZenKeyboardFocus } from "@/contexts/ZenKeyboardFocusContext";
import { setZenStatus } from "@/components/zen/ZenStatusBar";
import { ZenSessionDetail } from "@/components/zen/ZenSessionDetail";
import { ZenConfirmDialog } from "@/components/zen/ZenConfirmDialog";
import { ZenCalendar } from "@/components/zen/ZenCalendar";
import { toDateString, getWeekBounds } from "@/lib/calendar-utils";
import { formatDateWithDay } from "@/lib/formatters";
import {
  groupAndSortSessions,
  getStatusChar,
  getStatusColor,
  getGradeColor,
  canBeMarked,
  getTutorFirstName,
  getShortStatus,
  buildBulkDetails,
  QUICK_MARK_STATUS_MAP,
} from "@/components/zen/utils/sessionSorting";
import { callMarkApi } from "@/components/zen/utils/sessionActions";
import { isCountableSession } from "@/lib/session-status";
import type { Session, SessionFilters } from "@/types";

type ViewMode = "week" | "day";

// ── Helpers ──

function getWeekStartStr(dateStr: string): string {
  const { start } = getWeekBounds(new Date(dateStr + "T00:00:00"));
  return toDateString(start);
}

function getWeekEndStr(dateStr: string): string {
  const { end } = getWeekBounds(new Date(dateStr + "T00:00:00"));
  return toDateString(end);
}

function getWeekDates(weekStart: string): string[] {
  const dates: string[] = [];
  const d = new Date(weekStart + "T00:00:00");
  for (let i = 0; i < 7; i++) {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    dates.push(toDateString(day));
  }
  return dates;
}

function getDayIndexForDate(weekStart: string, dateStr: string): number {
  const dates = getWeekDates(weekStart);
  const idx = dates.indexOf(dateStr);
  return idx >= 0 ? idx : 0;
}

// ── Main Page ──

export default function ZenSessionsPage() {
  usePageTitle("Sessions - Zen Mode");
  const { user, impersonatedTutor } = useAuth();
  const { selectedLocation } = useLocation();
  const { viewMode: roleViewMode } = useRole();
  const { setDisableSectionCycling } = useZenKeyboardFocus();
  const { data: tutors } = useActiveTutors();

  // Disable global Tab section cycling
  useEffect(() => {
    setDisableSectionCycling(true);
    return () => setDisableSectionCycling(false);
  }, [setDisableSectionCycling]);

  // Effective tutor ID for My View
  const effectiveTutorId = roleViewMode === "my-view"
    ? impersonatedTutor?.id ?? user?.id
    : undefined;

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>("week");

  // Week range (Sun-Sat)
  const today = toDateString(new Date());
  const [weekStart, setWeekStart] = useState(getWeekStartStr(today));
  const weekEnd = getWeekEndStr(weekStart);
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);

  // Day cursor in week view (0-6), default to today's index
  const [dayCursor, setDayCursor] = useState(() => getDayIndexForDate(getWeekStartStr(today), today));
  const selectedDate = weekDates[dayCursor] || weekDates[0];

  // Calendar
  const [showCalendar, setShowCalendar] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [tutorFilter, setTutorFilter] = useState<number | undefined>(undefined);
  const [filterFocused, setFilterFocused] = useState(false);

  // Day view state
  const [sessionCursor, setSessionCursor] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [markingSessionIds, setMarkingSessionIds] = useState<Set<number>>(new Set());
  const [expandedSessionId, setExpandedSessionId] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ ids: number[]; status: string; label: string } | null>(null);
  const cursorRowRef = useRef<HTMLDivElement>(null);

  const locationFilter = selectedLocation === "All Locations" ? undefined : selectedLocation;

  // Fetch all sessions for the week (single API call)
  const filters: SessionFilters = useMemo(() => ({
    from_date: weekStart,
    to_date: weekEnd,
    location: locationFilter,
    tutor_id: tutorFilter || effectiveTutorId,
    status: statusFilter || undefined,
    limit: 2000,
  }), [weekStart, weekEnd, locationFilter, tutorFilter, effectiveTutorId, statusFilter]);

  const { data: allSessions, isLoading } = useSessions(filters);

  // Group sessions by date for week view
  const { weekStats, daySessions } = useMemo(() => {
    const byDate: Record<string, Session[]> = {};
    weekDates.forEach((d) => { byDate[d] = []; });
    (allSessions || []).forEach((s) => {
      if (byDate[s.session_date]) byDate[s.session_date].push(s);
    });

    const stats = weekDates.map((date) => {
      const sessions = byDate[date];
      let scheduled = 0, attended = 0, noshow = 0, other = 0;
      sessions.forEach((s) => {
        const st = s.session_status;
        if (st === "Attended" || st === "Attended (Make-up)" || st === "Attended (Trial)") attended++;
        else if (st === "Scheduled" || st === "Trial Class" || st === "Make-up Class") scheduled++;
        else if (st === "No Show") noshow++;
        else other++;
      });
      return {
        date,
        total: sessions.filter(isCountableSession).length,
        scheduled,
        attended,
        noshow,
        other,
      };
    });

    return { weekStats: stats, daySessions: byDate };
  }, [allSessions, weekDates]);

  // Week totals
  const weekTotals = useMemo(() => {
    return weekStats.reduce(
      (acc, d) => ({
        total: acc.total + d.total,
        scheduled: acc.scheduled + d.scheduled,
        attended: acc.attended + d.attended,
        noshow: acc.noshow + d.noshow,
        other: acc.other + d.other,
      }),
      { total: 0, scheduled: 0, attended: 0, noshow: 0, other: 0 }
    );
  }, [weekStats]);

  // Sessions for current selected day (sorted)
  const { flatSessions: dayFlatSessions, groupedSessions: dayGroupedSessions } = useMemo(() => {
    const sessions = daySessions[selectedDate] || [];
    return groupAndSortSessions(sessions);
  }, [daySessions, selectedDate]);

  const currentSession = dayFlatSessions[sessionCursor];

  // Reset day view state when switching days
  useEffect(() => {
    setSessionCursor(0);
    setSelectedIds(new Set());
    setExpandedSessionId(null);
  }, [selectedDate]);

  // Reset day cursor when week changes
  useEffect(() => {
    const todayIdx = getDayIndexForDate(weekStart, today);
    setDayCursor(todayIdx);
  }, [weekStart, today]);

  // Auto-scroll in day view
  useEffect(() => {
    if (viewMode === "day" && cursorRowRef.current) {
      cursorRowRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [sessionCursor, viewMode]);

  // Navigation helpers
  const navigateWeek = useCallback((direction: number) => {
    const d = new Date(weekStart + "T00:00:00");
    d.setDate(d.getDate() + direction * 7);
    const newStart = getWeekStartStr(toDateString(d));
    setWeekStart(newStart);
    setZenStatus(`Week: ${formatDateWithDay(newStart)}`, "info");
  }, [weekStart]);

  const goToCurrentWeek = useCallback(() => {
    const now = toDateString(new Date());
    setWeekStart(getWeekStartStr(now));
    setDayCursor(getDayIndexForDate(getWeekStartStr(now), now));
    setZenStatus("Current week", "info");
  }, []);

  const navigateDay = useCallback((direction: number) => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + direction);
    const newDate = toDateString(d);
    const newWeekStart = getWeekStartStr(newDate);
    if (newWeekStart !== weekStart) {
      setWeekStart(newWeekStart);
    }
    setDayCursor(getDayIndexForDate(newWeekStart, newDate));
    setZenStatus(formatDateWithDay(newDate), "info");
  }, [selectedDate, weekStart]);

  // Selection helpers
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Quick mark handler
  const handleQuickMark = useCallback(async (sessionId: number, status: string) => {
    setMarkingSessionIds(new Set([sessionId]));
    setZenStatus(`Marking session as ${status}...`, "info");
    try {
      await callMarkApi(sessionId, status);
      setZenStatus(`✓ Marked as ${status}`, "success");
    } catch (error) {
      setZenStatus(`Failed to mark session: ${error}`, "error");
    } finally {
      setMarkingSessionIds(new Set());
    }
  }, []);

  // Bulk mark handler for multiple selected sessions
  const handleBulkMark = useCallback(async (sessionIds: number[], status: string) => {
    setMarkingSessionIds(new Set(sessionIds));
    setZenStatus(`Marking ${sessionIds.length} session(s) as ${status}...`, "info");

    const results = await Promise.allSettled(
      sessionIds.map((id) => callMarkApi(id, status))
    );

    const successCount = results.filter((r) => r.status === "fulfilled").length;
    const failCount = results.length - successCount;

    setMarkingSessionIds(new Set());
    setSelectedIds(new Set());

    if (failCount === 0) {
      setZenStatus(`✓ ${successCount} session(s) marked as ${status}`, "success");
    } else {
      setZenStatus(`${successCount} succeeded, ${failCount} failed`, failCount > successCount ? "error" : "warning");
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.tagName === "SELECT"
      ) {
        if (e.key === "Escape") {
          (document.activeElement as HTMLElement)?.blur();
          setFilterFocused(false);
        }
        return;
      }

      if (showCalendar) return;

      // Shared shortcuts
      switch (e.key) {
        case "v":
          e.preventDefault();
          setViewMode((v) => v === "week" ? "day" : "week");
          setZenStatus(viewMode === "week" ? "Day view" : "Week view", "info");
          return;
        case "C":
          if (e.shiftKey) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setShowCalendar((prev) => !prev);
          }
          return;
        case "t":
          if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            if (viewMode === "week") {
              goToCurrentWeek();
            } else {
              const now = toDateString(new Date());
              const newWeekStart = getWeekStartStr(now);
              setWeekStart(newWeekStart);
              setDayCursor(getDayIndexForDate(newWeekStart, now));
              setZenStatus("Today", "info");
            }
          }
          return;
        case "f":
          e.preventDefault();
          setFilterFocused(true);
          setTimeout(() => {
            const el = document.getElementById("zen-sessions-status-filter");
            el?.focus();
          }, 0);
          return;
      }

      if (viewMode === "week") {
        // Week view shortcuts
        switch (e.key) {
          case "j":
          case "ArrowDown":
            e.preventDefault();
            setDayCursor((c) => Math.min(c + 1, 6));
            break;
          case "k":
          case "ArrowUp":
            e.preventDefault();
            setDayCursor((c) => Math.max(c - 1, 0));
            break;
          case "Enter":
            e.preventDefault();
            setViewMode("day");
            setZenStatus(`${formatDateWithDay(selectedDate)}`, "info");
            break;
          case "[":
            e.preventDefault();
            navigateWeek(-1);
            break;
          case "]":
            e.preventDefault();
            navigateWeek(1);
            break;
        }
      } else {
        // Day view shortcuts
        switch (e.key) {
          case "j":
          case "ArrowDown":
            e.preventDefault();
            if (sessionCursor < dayFlatSessions.length - 1) {
              setSessionCursor((c) => c + 1);
            }
            break;
          case "k":
          case "ArrowUp":
            e.preventDefault();
            if (sessionCursor > 0) {
              setSessionCursor((c) => c - 1);
            }
            break;
          case " ":
            e.preventDefault();
            if (currentSession) toggleSelect(currentSession.id);
            break;
          case "a":
            e.preventDefault();
            dayFlatSessions.forEach((s) => {
              if (canBeMarked(s) && !selectedIds.has(s.id)) toggleSelect(s.id);
            });
            break;
          case "Enter":
            e.preventDefault();
            if (currentSession) {
              setExpandedSessionId(
                expandedSessionId === currentSession.id ? null : currentSession.id
              );
            }
            break;
          case "Escape":
            e.preventDefault();
            if (expandedSessionId) {
              setExpandedSessionId(null);
            } else if (selectedIds.size > 0) {
              setSelectedIds(new Set());
            } else {
              setViewMode("week");
              setZenStatus("Week view", "info");
            }
            break;
          case "[":
            e.preventDefault();
            navigateDay(-1);
            break;
          case "]":
            e.preventDefault();
            navigateDay(1);
            break;
          case "1":
          case "2":
          case "3":
          case "4":
          case "5": {
            e.preventDefault();
            const action = QUICK_MARK_STATUS_MAP[e.key];
            if (!action) break;

            if (selectedIds.size > 0) {
              const actionableIds = dayFlatSessions
                .filter((s) => selectedIds.has(s.id) && canBeMarked(s))
                .map((s) => s.id);
              if (actionableIds.length > 0) {
                setConfirmAction({ ids: actionableIds, status: action.status, label: action.label });
              }
            } else if (currentSession && canBeMarked(currentSession)) {
              handleQuickMark(currentSession.id, action.status);
            }
            break;
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    viewMode, showCalendar, selectedDate, weekStart, dayCursor,
    sessionCursor, dayFlatSessions, currentSession, selectedIds, expandedSessionId,
    navigateWeek, navigateDay, goToCurrentWeek, toggleSelect, handleQuickMark, handleBulkMark,
  ]);

  // Status filter options
  const statusOptions = [
    { value: "", label: "All" },
    { value: "Scheduled", label: "Scheduled" },
    { value: "Attended", label: "Attended" },
    { value: "No Show", label: "No Show" },
    { value: "Cancelled", label: "Cancelled" },
  ];

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          marginBottom: "16px",
          borderBottom: "1px solid var(--zen-border)",
          paddingBottom: "8px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1
          style={{
            fontSize: "16px",
            fontWeight: "bold",
            textTransform: "uppercase",
            color: "var(--zen-fg)",
            textShadow: "var(--zen-glow)",
            margin: 0,
          }}
        >
          SESSIONS
          {viewMode === "day" && (
            <span style={{ color: "var(--zen-accent)", fontWeight: "normal", fontSize: "13px" }}>
              {" "}— {formatDateWithDay(selectedDate)}
            </span>
          )}
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={() => viewMode === "week" ? navigateWeek(-1) : navigateDay(-1)}
            style={{
              background: "none",
              border: "none",
              color: "var(--zen-dim)",
              cursor: "pointer",
              fontFamily: "inherit",
              padding: "2px 6px",
            }}
            title={viewMode === "week" ? "Previous week ([)" : "Previous day ([)"}
          >
            [
          </button>
          <button
            onClick={() => setShowCalendar((prev) => !prev)}
            style={{
              background: "none",
              border: "1px solid var(--zen-border)",
              color: "var(--zen-fg)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "12px",
              padding: "2px 8px",
            }}
          >
            {viewMode === "week"
              ? `${formatDateWithDay(weekStart)} → ${formatDateWithDay(weekEnd)}`
              : formatDateWithDay(selectedDate)}
          </button>
          <button
            onClick={() => viewMode === "week" ? navigateWeek(1) : navigateDay(1)}
            style={{
              background: "none",
              border: "none",
              color: "var(--zen-dim)",
              cursor: "pointer",
              fontFamily: "inherit",
              padding: "2px 6px",
            }}
            title={viewMode === "week" ? "Next week (])" : "Next day (])"}
          >
            ]
          </button>
          <button
            onClick={goToCurrentWeek}
            style={{
              background: "none",
              border: "1px solid var(--zen-border)",
              color: "var(--zen-dim)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "11px",
              padding: "2px 6px",
            }}
            title="Today (t)"
          >
            t=today
          </button>
          <button
            onClick={() => setViewMode((v) => v === "week" ? "day" : "week")}
            style={{
              background: "none",
              border: "1px solid var(--zen-border)",
              color: viewMode === "day" ? "var(--zen-accent)" : "var(--zen-dim)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "11px",
              padding: "2px 6px",
            }}
            title="Toggle view (v)"
          >
            v={viewMode === "week" ? "week" : "day"}
          </button>
        </div>
      </div>

      {/* Calendar overlay */}
      {showCalendar && (
        <div style={{ position: "relative", zIndex: 100, marginBottom: "12px" }}>
          <div style={{ position: "absolute", top: 0, right: 0, boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)" }}>
            <ZenCalendar
              selectedDate={selectedDate}
              onSelectDate={(date) => {
                const newWeekStart = getWeekStartStr(date);
                setWeekStart(newWeekStart);
                setDayCursor(getDayIndexForDate(newWeekStart, date));
                setShowCalendar(false);
                if (viewMode === "week") {
                  setZenStatus(`Week of ${formatDateWithDay(newWeekStart)}`, "info");
                } else {
                  setZenStatus(formatDateWithDay(date), "info");
                }
              }}
              onClose={() => setShowCalendar(false)}
              isFocused={showCalendar}
            />
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          alignItems: "center",
          marginBottom: "16px",
          flexWrap: "wrap",
        }}
      >
        <span style={{ color: "var(--zen-dim)", fontSize: "12px" }}>Filter:</span>

        <select
          id="zen-sessions-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            backgroundColor: "var(--zen-bg)",
            border: "1px solid var(--zen-border)",
            color: "var(--zen-fg)",
            padding: "4px 8px",
            fontSize: "12px",
            fontFamily: "inherit",
          }}
          onFocus={() => setFilterFocused(true)}
          onBlur={() => setFilterFocused(false)}
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              Status: {opt.label}
            </option>
          ))}
        </select>

        {/* Tutor filter (admin center-view only) */}
        {!effectiveTutorId && tutors && tutors.length > 0 && (
          <select
            value={tutorFilter || ""}
            onChange={(e) => setTutorFilter(e.target.value ? Number(e.target.value) : undefined)}
            style={{
              backgroundColor: "var(--zen-bg)",
              border: "1px solid var(--zen-border)",
              color: "var(--zen-fg)",
              padding: "4px 8px",
              fontSize: "12px",
              fontFamily: "inherit",
            }}
            onFocus={() => setFilterFocused(true)}
            onBlur={() => setFilterFocused(false)}
          >
            <option value="">Tutor: All</option>
            {tutors.map((t) => (
              <option key={t.id} value={t.id}>
                {t.tutor_name}
              </option>
            ))}
          </select>
        )}

        {(statusFilter || tutorFilter) && (
          <button
            onClick={() => {
              setStatusFilter("");
              setTutorFilter(undefined);
              setZenStatus("Filters cleared", "info");
            }}
            style={{
              background: "none",
              border: "1px solid var(--zen-border)",
              color: "var(--zen-dim)",
              padding: "4px 8px",
              fontSize: "11px",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div style={{ color: "var(--zen-dim)", marginBottom: "8px" }}>
        {"─".repeat(60)}
      </div>

      {/* Content */}
      {isLoading ? (
        <div style={{ color: "var(--zen-dim)" }}>Loading sessions...</div>
      ) : viewMode === "week" ? (
        <WeekSummaryView
          weekStats={weekStats}
          weekTotals={weekTotals}
          dayCursor={dayCursor}
          today={today}
        />
      ) : (
        <DayDetailView
          sessions={dayGroupedSessions}
          flatSessions={dayFlatSessions}
          sessionCursor={sessionCursor}
          selectedIds={selectedIds}
          expandedSessionId={expandedSessionId}
          markingSessionIds={markingSessionIds}
          onToggleSelect={toggleSelect}
          onQuickMark={handleQuickMark}
          cursorRowRef={cursorRowRef}
          onSetExpanded={setExpandedSessionId}
        />
      )}

      {/* Bulk mark confirmation dialog */}
      {confirmAction && (
        <ZenConfirmDialog
          title={`Mark ${confirmAction.ids.length} session${confirmAction.ids.length !== 1 ? "s" : ""} as ${confirmAction.label}?`}
          details={buildBulkDetails(confirmAction.ids, dayFlatSessions)}
          onConfirm={() => {
            handleBulkMark(confirmAction.ids, confirmAction.status);
            setConfirmAction(null);
          }}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {/* Navigation hint */}
      <div
        style={{
          marginTop: "16px",
          paddingTop: "16px",
          borderTop: "1px solid var(--zen-border)",
          color: "var(--zen-dim)",
          fontSize: "12px",
        }}
      >
        {viewMode === "week" ? (
          <>
            <span style={{ color: "var(--zen-fg)" }}>j/k</span> navigate{" "}
            <span style={{ color: "var(--zen-fg)" }}>Enter</span> drill in{" "}
            <span style={{ color: "var(--zen-fg)" }}>[</span>/<span style={{ color: "var(--zen-fg)" }}>]</span> prev/next week{" "}
            <span style={{ color: "var(--zen-fg)" }}>t</span>=today{" "}
            <span style={{ color: "var(--zen-fg)" }}>v</span>=day view |{" "}
            <span style={{ color: "var(--zen-fg)" }}>f</span>=filter{" "}
            <span style={{ color: "var(--zen-fg)" }}>C</span>=cal{" "}
            <span style={{ color: "var(--zen-fg)" }}>?</span>=help
          </>
        ) : (
          <>
            <span style={{ color: "var(--zen-fg)" }}>j/k</span> navigate{" "}
            <span style={{ color: "var(--zen-fg)" }}>Space</span> select{" "}
            <span style={{ color: "var(--zen-fg)" }}>a</span>=all{" "}
            <span style={{ color: "var(--zen-fg)" }}>1</span>-<span style={{ color: "var(--zen-fg)" }}>5</span> mark{" "}
            <span style={{ color: "var(--zen-fg)" }}>Enter</span> detail{" "}
            <span style={{ color: "var(--zen-fg)" }}>Esc</span> back |{" "}
            <span style={{ color: "var(--zen-fg)" }}>[</span>/<span style={{ color: "var(--zen-fg)" }}>]</span> prev/next day{" "}
            <span style={{ color: "var(--zen-fg)" }}>f</span>=filter{" "}
            <span style={{ color: "var(--zen-fg)" }}>C</span>=cal{" "}
            <span style={{ color: "var(--zen-fg)" }}>?</span>=help
          </>
        )}
      </div>
    </div>
  );
}

// ── Week Summary View ──

interface DayStat {
  date: string;
  total: number;
  scheduled: number;
  attended: number;
  noshow: number;
  other: number;
}

function WeekSummaryView({
  weekStats,
  weekTotals,
  dayCursor,
  today,
}: {
  weekStats: DayStat[];
  weekTotals: { total: number; scheduled: number; attended: number; noshow: number; other: number };
  dayCursor: number;
  today: string;
}) {
  return (
    <div>
      {/* Column headers */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          padding: "2px 4px",
          fontSize: "11px",
          color: "var(--zen-dim)",
          marginBottom: "4px",
        }}
      >
        <span style={{ width: "12px" }} />
        <span style={{ minWidth: "160px" }}>DAY</span>
        <span style={{ width: "50px", textAlign: "right" }}>TOTAL</span>
        <span style={{ width: "50px", textAlign: "right" }}>SCHED</span>
        <span style={{ width: "50px", textAlign: "right" }}>ATT</span>
        <span style={{ width: "50px", textAlign: "right" }}>NOSHOW</span>
        <span style={{ width: "50px", textAlign: "right" }}>OTHER</span>
      </div>
      <div style={{ color: "var(--zen-border)", marginBottom: "4px" }}>
        {"─".repeat(50)}
      </div>

      {/* Day rows */}
      {weekStats.map((day, idx) => {
        const isAtCursor = idx === dayCursor;
        const isToday = day.date === today;

        return (
          <div
            key={day.date}
            style={{
              display: "flex",
              gap: "8px",
              padding: "3px 4px",
              fontSize: "12px",
              backgroundColor: isAtCursor ? "var(--zen-selection)" : "transparent",
              borderLeft: isAtCursor ? "2px solid var(--zen-accent)" : "2px solid transparent",
            }}
          >
            <span style={{ width: "12px", color: isAtCursor ? "var(--zen-accent)" : "transparent", textShadow: isAtCursor ? "var(--zen-glow)" : "none" }}>
              {isAtCursor ? ">" : " "}
            </span>
            <span style={{ minWidth: "160px", color: isToday ? "var(--zen-accent)" : "var(--zen-fg)" }}>
              {formatDateWithDay(day.date)}
              {isToday && <span style={{ color: "var(--zen-accent)", fontSize: "10px" }}> (today)</span>}
            </span>
            <span style={{ width: "50px", textAlign: "right", color: day.total > 0 ? "var(--zen-fg)" : "var(--zen-dim)" }}>
              {day.total}
            </span>
            <span style={{ width: "50px", textAlign: "right", color: day.scheduled > 0 ? "var(--zen-fg)" : "var(--zen-dim)" }}>
              {day.scheduled}
            </span>
            <span style={{ width: "50px", textAlign: "right", color: day.attended > 0 ? "var(--zen-success)" : "var(--zen-dim)" }}>
              {day.attended}
            </span>
            <span style={{ width: "50px", textAlign: "right", color: day.noshow > 0 ? "var(--zen-error)" : "var(--zen-dim)" }}>
              {day.noshow}
            </span>
            <span style={{ width: "50px", textAlign: "right", color: day.other > 0 ? "var(--zen-warning)" : "var(--zen-dim)" }}>
              {day.other}
            </span>
          </div>
        );
      })}

      {/* Totals */}
      <div style={{ color: "var(--zen-border)", marginTop: "4px", marginBottom: "4px" }}>
        {"─".repeat(50)}
      </div>
      <div
        style={{
          display: "flex",
          gap: "8px",
          padding: "3px 4px",
          fontSize: "12px",
          fontWeight: "bold",
        }}
      >
        <span style={{ width: "12px" }} />
        <span style={{ minWidth: "160px", color: "var(--zen-fg)" }}>TOTAL</span>
        <span style={{ width: "50px", textAlign: "right", color: "var(--zen-fg)" }}>{weekTotals.total}</span>
        <span style={{ width: "50px", textAlign: "right", color: "var(--zen-fg)" }}>{weekTotals.scheduled}</span>
        <span style={{ width: "50px", textAlign: "right", color: "var(--zen-success)" }}>{weekTotals.attended}</span>
        <span style={{ width: "50px", textAlign: "right", color: weekTotals.noshow > 0 ? "var(--zen-error)" : "var(--zen-dim)" }}>{weekTotals.noshow}</span>
        <span style={{ width: "50px", textAlign: "right", color: weekTotals.other > 0 ? "var(--zen-warning)" : "var(--zen-dim)" }}>{weekTotals.other}</span>
      </div>
    </div>
  );
}

// ── Day Detail View ──

interface TimeSlotGroup {
  timeSlot: string;
  sessions: Session[];
}

function DayDetailView({
  sessions: groupedSessions,
  flatSessions,
  sessionCursor,
  selectedIds,
  expandedSessionId,
  markingSessionIds,
  onToggleSelect,
  onQuickMark,
  cursorRowRef,
  onSetExpanded,
}: {
  sessions: TimeSlotGroup[];
  flatSessions: Session[];
  sessionCursor: number;
  selectedIds: Set<number>;
  expandedSessionId: number | null;
  markingSessionIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onQuickMark: (sessionId: number, status: string) => void;
  cursorRowRef: React.RefObject<HTMLDivElement | null>;
  onSetExpanded: (id: number | null) => void;
}) {
  if (flatSessions.length === 0) {
    return <div style={{ color: "var(--zen-dim)" }}>No sessions on this day</div>;
  }

  // Stats
  let attended = 0, scheduled = 0, noshow = 0;
  flatSessions.forEach((s) => {
    const st = s.session_status;
    if (st === "Attended" || st === "Attended (Make-up)" || st === "Attended (Trial)") attended++;
    else if (st === "Scheduled" || st === "Trial Class" || st === "Make-up Class") scheduled++;
    else if (st === "No Show") noshow++;
  });

  let flatIndex = -1;

  return (
    <div>
      {/* Stats */}
      <div style={{ display: "flex", gap: "24px", marginBottom: "16px", fontSize: "12px" }}>
        <span style={{ color: "var(--zen-dim)" }}>
          Total: <span style={{ color: "var(--zen-fg)" }}>{flatSessions.filter(isCountableSession).length}</span>
        </span>
        <span style={{ color: "var(--zen-dim)" }}>
          Attended: <span style={{ color: "var(--zen-success)" }}>{attended}</span>
        </span>
        <span style={{ color: "var(--zen-dim)" }}>
          Upcoming: <span style={{ color: "var(--zen-accent)" }}>{scheduled}</span>
        </span>
        <span style={{ color: "var(--zen-dim)" }}>
          No Show: <span style={{ color: "var(--zen-error)" }}>{noshow}</span>
        </span>
        {selectedIds.size > 0 && (
          <span style={{ color: "var(--zen-warning)" }}>Selected: {selectedIds.size}</span>
        )}
      </div>

      {/* Time slot groups */}
      {groupedSessions.map((slotGroup) => (
        <div key={slotGroup.timeSlot} style={{ marginBottom: "12px" }}>
          <div style={{ color: "var(--zen-accent)", fontSize: "12px", marginBottom: "2px" }}>
            {slotGroup.timeSlot}
          </div>
          <div style={{ color: "var(--zen-border)", marginBottom: "2px", letterSpacing: "0.5px" }}>
            {"─".repeat(35)}
          </div>

          {slotGroup.sessions.map((session) => {
            flatIndex++;
            const isAtCursor = flatIndex === sessionCursor;
            const isSelected = selectedIds.has(session.id);
            const statusColor = getStatusColor(session.session_status);
            const gradeColor = getGradeColor(session.grade, session.lang_stream);
            const statusChar = getStatusChar(session.session_status);
            const isActionable = canBeMarked(session);
            const isExpanded = expandedSessionId === session.id;
            const isMarking = markingSessionIds.has(session.id);

            return (
              <div key={session.id} ref={isAtCursor ? cursorRowRef : undefined}>
                <div
                  onClick={() => {
                    if (isActionable) onToggleSelect(session.id);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "2px 4px",
                    cursor: isActionable ? "pointer" : "default",
                    backgroundColor: isAtCursor ? "var(--zen-selection)" : "transparent",
                    borderLeft: isAtCursor ? "2px solid var(--zen-accent)" : "2px solid transparent",
                    opacity: isActionable ? 1 : 0.7,
                  }}
                >
                  <span style={{ width: "12px", color: isAtCursor ? "var(--zen-accent)" : "transparent", textShadow: isAtCursor ? "var(--zen-glow)" : "none" }}>
                    {isAtCursor ? ">" : " "}
                  </span>
                  <span style={{ width: "24px", color: isSelected ? "var(--zen-accent)" : "var(--zen-dim)" }}>
                    [{isSelected ? "x" : " "}]
                  </span>
                  <span style={{ width: "50px", color: "var(--zen-dim)", fontFamily: "monospace", fontSize: "12px" }}>
                    {session.school_student_id || "—"}
                  </span>
                  <span style={{ minWidth: "160px", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--zen-fg)" }}>
                    {session.student_name || "Unknown"}
                  </span>
                  <span style={{ width: "36px", padding: "0 4px", backgroundColor: gradeColor + "40", color: "var(--zen-fg)", borderRadius: "2px", textAlign: "center", fontSize: "11px" }}>
                    {session.grade || "—"}{session.lang_stream || ""}
                  </span>
                  <span style={{ minWidth: "70px", maxWidth: "70px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--zen-dim)", fontSize: "11px" }}>
                    {session.school || "—"}
                  </span>
                  <span style={{ minWidth: "20px", textAlign: "center", color: isMarking ? "var(--zen-dim)" : `var(--zen-${statusColor})` }}>
                    {isMarking ? "○" : statusChar}
                  </span>
                  <span style={{ color: isMarking ? "var(--zen-dim)" : `var(--zen-${statusColor})`, fontSize: "11px", minWidth: "70px" }}>
                    {isMarking ? "..." : getShortStatus(session.session_status)}
                  </span>
                  <span style={{ minWidth: "80px", maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--zen-fg)", fontSize: "12px" }}>
                    {session.tutor_name ? getTutorFirstName(session.tutor_name) : "—"}
                  </span>
                </div>

                {/* Inline detail */}
                {isExpanded && (
                  <ZenSessionDetail
                    session={session}
                    onClose={() => onSetExpanded(null)}
                    onMark={onQuickMark}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
