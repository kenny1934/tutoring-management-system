"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSessions, useActiveTutors, usePageTitle } from "@/lib/hooks";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "@/contexts/LocationContext";
import { useRole } from "@/contexts/RoleContext";
import { useZenKeyboardFocus } from "@/contexts/ZenKeyboardFocusContext";
import { setZenStatus } from "@/components/zen/ZenStatusBar";
import { ZenSessionLogList } from "@/components/zen/ZenSessionLogList";
import { ZenCalendar } from "@/components/zen/ZenCalendar";
import { sessionsAPI } from "@/lib/api";
import { updateSessionInCache } from "@/lib/session-cache";
import { toDateString } from "@/lib/calendar-utils";
import { formatDateWithDay } from "@/lib/formatters";
import type { SessionFilters } from "@/types";

// Get Monday of the week containing the given date
function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday
  d.setDate(d.getDate() + diff);
  return toDateString(d);
}

// Get Sunday of the week containing the given date
function getWeekEnd(dateStr: string): string {
  const d = new Date(getWeekStart(dateStr) + "T00:00:00");
  d.setDate(d.getDate() + 6);
  return toDateString(d);
}

export default function ZenSessionsPage() {
  usePageTitle("Sessions - Zen Mode");
  const { user, impersonatedTutor } = useAuth();
  const { selectedLocation } = useLocation();
  const { viewMode } = useRole();
  const { setDisableSectionCycling } = useZenKeyboardFocus();
  const { data: tutors } = useActiveTutors();

  // Disable global Tab section cycling
  useEffect(() => {
    setDisableSectionCycling(true);
    return () => setDisableSectionCycling(false);
  }, [setDisableSectionCycling]);

  // Effective tutor ID for My View
  const effectiveTutorId = viewMode === "my-view"
    ? impersonatedTutor?.id ?? user?.id
    : undefined;

  // Date range state (default: current week)
  const today = toDateString(new Date());
  const [fromDate, setFromDate] = useState(getWeekStart(today));
  const [toDate, setToDate] = useState(getWeekEnd(today));
  const [showCalendar, setShowCalendar] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [tutorFilter, setTutorFilter] = useState<number | undefined>(undefined);

  // Cursor and selection (local — not ZenSessionContext)
  const [cursorIndex, setCursorIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [markingSessionId, setMarkingSessionId] = useState<number | null>(null);
  const [filterFocused, setFilterFocused] = useState(false);

  const locationFilter = selectedLocation === "All Locations" ? undefined : selectedLocation;

  // Build filters
  const filters: SessionFilters = useMemo(() => ({
    from_date: fromDate,
    to_date: toDate,
    location: locationFilter,
    tutor_id: tutorFilter || effectiveTutorId,
    status: statusFilter || undefined,
  }), [fromDate, toDate, locationFilter, tutorFilter, effectiveTutorId, statusFilter]);

  const { data: sessions, isLoading } = useSessions(filters);

  // Reset cursor on data change
  useEffect(() => {
    setCursorIndex(0);
    setSelectedIds(new Set());
  }, [fromDate, toDate, statusFilter, tutorFilter]);

  // Selection helpers
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Navigate week
  const navigateWeek = useCallback((direction: number) => {
    const d = new Date(fromDate + "T00:00:00");
    d.setDate(d.getDate() + direction * 7);
    const newFrom = toDateString(d);
    setFromDate(newFrom);
    setToDate(getWeekEnd(newFrom));
    setZenStatus(`Week: ${formatDateWithDay(newFrom)}`, "info");
  }, [fromDate]);

  const goToCurrentWeek = useCallback(() => {
    const now = toDateString(new Date());
    setFromDate(getWeekStart(now));
    setToDate(getWeekEnd(now));
    setZenStatus("Current week", "info");
  }, []);

  // Quick mark handler
  const handleQuickMark = useCallback(async (sessionId: number, status: string) => {
    setMarkingSessionId(sessionId);
    setZenStatus(`Marking session as ${status}...`, "info");
    try {
      let updatedSession;
      switch (status) {
        case "Attended":
          updatedSession = await sessionsAPI.markAttended(sessionId);
          break;
        case "No Show":
          updatedSession = await sessionsAPI.markNoShow(sessionId);
          break;
        case "Rescheduled - Pending Make-up":
          updatedSession = await sessionsAPI.markRescheduled(sessionId);
          break;
        case "Sick Leave - Pending Make-up":
          updatedSession = await sessionsAPI.markSickLeave(sessionId);
          break;
        case "Weather Cancelled - Pending Make-up":
          updatedSession = await sessionsAPI.markWeatherCancelled(sessionId);
          break;
        default:
          updatedSession = await sessionsAPI.updateSession(sessionId, { session_status: status });
      }
      updateSessionInCache(updatedSession);
      setZenStatus(`✓ Marked as ${status}`, "success");
    } catch (error) {
      setZenStatus(`Failed to mark session: ${error}`, "error");
    } finally {
      setMarkingSessionId(null);
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        if (e.key === "Escape") {
          (document.activeElement as HTMLElement)?.blur();
          setFilterFocused(false);
        }
        return;
      }

      if (showCalendar) return;

      switch (e.key) {
        case "[":
          e.preventDefault();
          navigateWeek(-1);
          break;
        case "]":
          e.preventDefault();
          navigateWeek(1);
          break;
        case "t":
          if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            goToCurrentWeek();
          }
          break;
        case "C":
          if (e.shiftKey) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setShowCalendar((prev) => !prev);
          }
          break;
        case "f":
          e.preventDefault();
          setFilterFocused(true);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showCalendar, navigateWeek, goToCurrentWeek]);

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
          SESSIONS LOG
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={() => navigateWeek(-1)}
            style={{
              background: "none",
              border: "none",
              color: "var(--zen-dim)",
              cursor: "pointer",
              fontFamily: "inherit",
              padding: "2px 6px",
            }}
            title="Previous week ([)"
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
            {formatDateWithDay(fromDate)} → {formatDateWithDay(toDate)}
          </button>
          <button
            onClick={() => navigateWeek(1)}
            style={{
              background: "none",
              border: "none",
              color: "var(--zen-dim)",
              cursor: "pointer",
              fontFamily: "inherit",
              padding: "2px 6px",
            }}
            title="Next week (])"
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
            title="Current week (t)"
          >
            t=today
          </button>
        </div>
      </div>

      {/* Calendar overlay */}
      {showCalendar && (
        <div
          style={{
            position: "relative",
            zIndex: 100,
            marginBottom: "12px",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
            }}
          >
            <ZenCalendar
              selectedDate={fromDate}
              onSelectDate={(date) => {
                setFromDate(getWeekStart(date));
                setToDate(getWeekEnd(date));
                setShowCalendar(false);
                setZenStatus(`Week of ${formatDateWithDay(getWeekStart(date))}`, "info");
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

        {/* Status filter */}
        <select
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

      {/* Session List */}
      {isLoading ? (
        <div style={{ color: "var(--zen-dim)" }}>Loading sessions...</div>
      ) : (
        <ZenSessionLogList
          sessions={sessions || []}
          cursorIndex={cursorIndex}
          selectedIds={selectedIds}
          onCursorMove={setCursorIndex}
          onToggleSelect={toggleSelect}
          onQuickMark={handleQuickMark}
          markingSessionId={markingSessionId}
          isFocused={!filterFocused && !showCalendar}
          onFocus={() => setFilterFocused(false)}
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
        <span style={{ color: "var(--zen-fg)" }}>[</span>/<span style={{ color: "var(--zen-fg)" }}>]</span> prev/next week{" "}
        <span style={{ color: "var(--zen-fg)" }}>t</span>=today{" "}
        <span style={{ color: "var(--zen-fg)" }}>C</span>=cal |{" "}
        <span style={{ color: "var(--zen-fg)" }}>f</span>=filter |{" "}
        <span style={{ color: "var(--zen-fg)" }}>d</span>=dashboard{" "}
        <span style={{ color: "var(--zen-fg)" }}>s</span>=students{" "}
        <span style={{ color: "var(--zen-fg)" }}>?</span>=help
      </div>
    </div>
  );
}
