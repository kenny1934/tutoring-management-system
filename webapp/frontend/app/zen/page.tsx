"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useDashboardStats, useSessions, useCalendarEvents, useActivityFeed, usePageTitle } from "@/lib/hooks";
import { useLocation } from "@/contexts/LocationContext";
import { useZenSession } from "@/contexts/ZenSessionContext";
import { useZenKeyboardFocus } from "@/contexts/ZenKeyboardFocusContext";
import { ZenSessionList, ZenTestList, ZenActivityFeed, ZenCalendar, ZenDistributionChart, calculateStats } from "@/components/zen";
import { setZenStatus } from "@/components/zen/ZenStatusBar";
import { sessionsAPI } from "@/lib/api";
import { updateSessionInCache } from "@/lib/session-cache";
import { mutate } from "swr";
import { toDateString } from "@/lib/calendar-utils";

// ASCII progress bar component
function ZenProgressBar({ completed, total }: { completed: number; total: number }) {
  const barWidth = 10;
  const filled = total > 0 ? Math.round((completed / total) * barWidth) : 0;
  const empty = barWidth - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);

  return (
    <span style={{ fontFamily: "monospace" }}>
      <span style={{ color: "var(--zen-dim)" }}>[</span>
      <span style={{ color: completed === total && total > 0 ? "var(--zen-success)" : "var(--zen-accent)" }}>
        {bar}
      </span>
      <span style={{ color: "var(--zen-dim)" }}>] </span>
      <span style={{ color: "var(--zen-fg)" }}>{completed}</span>
      <span style={{ color: "var(--zen-dim)" }}>/</span>
      <span style={{ color: "var(--zen-fg)" }}>{total}</span>
      <span style={{ color: "var(--zen-dim)" }}> done</span>
    </span>
  );
}

// ASCII spinner frames
const SPINNER_FRAMES = ["|", "/", "-", "\\"];

function ZenSpinner() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return <span>{SPINNER_FRAMES[frame]}</span>;
}

export default function ZenDashboardPage() {
  usePageTitle("Zen Mode");
  const { selectedLocation } = useLocation();
  const { isFocused } = useZenKeyboardFocus();
  const [showCalendar, setShowCalendar] = useState(false);
  const [activeChart, setActiveChart] = useState<"grade" | "school">("grade");
  const [markingSessionId, setMarkingSessionId] = useState<number | null>(null);

  // Use session context for shared state
  const {
    setSessions,
    selectedIds,
    toggleSelect,
    cursorIndex,
    moveCursor,
    selectedDate,
    setSelectedDate,
    getDateLabel,
  } = useZenSession();

  // Date navigation helpers
  const navigateDate = useCallback((days: number) => {
    const current = new Date(selectedDate + "T00:00:00");
    current.setDate(current.getDate() + days);
    setSelectedDate(toDateString(current));
  }, [selectedDate, setSelectedDate]);

  const goToToday = useCallback(() => {
    setSelectedDate(toDateString(new Date()));
  }, [setSelectedDate]);

  // Keyboard shortcuts for date navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in input or command bar
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Don't handle if calendar is open (it has its own handlers)
      if (showCalendar) return;

      switch (e.key) {
        case "[":
          e.preventDefault();
          navigateDate(-1);
          setZenStatus(`← ${toDateString(new Date(new Date(selectedDate + "T00:00:00").getTime() - 86400000))}`, "info");
          break;
        case "]":
          e.preventDefault();
          navigateDate(1);
          setZenStatus(`→ ${toDateString(new Date(new Date(selectedDate + "T00:00:00").getTime() + 86400000))}`, "info");
          break;
        case "t":
          if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            goToToday();
            setZenStatus("Jumped to today", "info");
          }
          break;
        case "c":
        case "C":
          // Shift+C for calendar (handles both browser behaviors)
          if (e.shiftKey) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setShowCalendar((prev) => !prev);
          }
          break;
        // Chart navigation when distribution is focused
        case "h":
        case "ArrowLeft":
          if (isFocused("distribution")) {
            e.preventDefault();
            setActiveChart("grade");
          }
          break;
        case "l":
        case "ArrowRight":
          if (isFocused("distribution")) {
            e.preventDefault();
            setActiveChart("school");
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showCalendar, navigateDate, goToToday, selectedDate, isFocused]);

  const { data: stats, isLoading: statsLoading } = useDashboardStats(
    selectedLocation === "All Locations" ? undefined : selectedLocation
  );

  // Get sessions for selected date using filters
  const { data: dateSessions, isLoading: sessionsLoading } = useSessions({
    from_date: selectedDate,
    to_date: selectedDate,
    location: selectedLocation === "All Locations" ? undefined : selectedLocation,
  });

  // Get upcoming calendar events (tests/exams)
  const { data: calendarEvents, isLoading: eventsLoading } = useCalendarEvents(30);

  // Get recent activity
  const { data: activityEvents, isLoading: activityLoading } = useActivityFeed(
    selectedLocation === "All Locations" ? undefined : selectedLocation
  );

  const isLoading = statsLoading || sessionsLoading;

  // Sync sessions to context when data loads
  useEffect(() => {
    if (dateSessions) {
      setSessions(dateSessions);
    }
  }, [dateSessions, setSessions]);

  // Calculate session stats for progress bar
  const sessionStats = useMemo(
    () => calculateStats(dateSessions || []),
    [dateSessions]
  );

  // Action handler
  const handleAction = (action: string, sessionIds: number[]) => {
    setZenStatus(
      `Action '${action}' on ${sessionIds.length} session(s) - use command bar`,
      "info"
    );
  };

  // Quick mark handler for single session
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

  return (
    <div
      style={{
        maxWidth: "1000px",
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          marginBottom: "24px",
          borderBottom: "1px solid var(--zen-border)",
          paddingBottom: "8px",
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
          DASHBOARD
        </h1>
      </div>

      {isLoading ? (
        <div style={{ color: "var(--zen-dim)" }}>
          <ZenSpinner /> Loading data...
        </div>
      ) : (
        <>
          {/* Stats Row (matches GUI header) */}
          <section style={{ marginBottom: "32px" }}>
            <div
              style={{
                display: "flex",
                gap: "24px",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <span>
                <span style={{ color: "var(--zen-fg)", fontWeight: "bold" }}>
                  {stats?.active_students ?? "—"}
                </span>
                <span style={{ color: "var(--zen-dim)" }}> Students</span>
              </span>
              <span style={{ color: "var(--zen-border)" }}>•</span>
              <span>
                <span style={{ color: "var(--zen-fg)", fontWeight: "bold" }}>
                  {stats?.sessions_this_week ?? "—"}
                </span>
                <span style={{ color: "var(--zen-dim)" }}> This Week</span>
              </span>
              <span style={{ color: "var(--zen-border)" }}>•</span>
              <span>
                <span style={{ color: "var(--zen-success)", fontWeight: "bold" }}>
                  ${stats?.revenue_this_month?.toLocaleString() ?? "—"}
                </span>
                <span style={{ color: "var(--zen-dim)" }}> This Month</span>
              </span>
            </div>
          </section>

          {/* Sessions for selected date */}
          <section style={{ marginBottom: "32px", position: "relative" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <h2
                  style={{
                    fontSize: "14px",
                    fontWeight: "bold",
                    color: "var(--zen-accent)",
                    textShadow: "var(--zen-glow)",
                    margin: 0,
                  }}
                >
                  SESSIONS FOR{" "}
                  <button
                    onClick={() => setShowCalendar((prev) => !prev)}
                    style={{
                      background: "none",
                      border: "1px solid var(--zen-border)",
                      color: "var(--zen-fg)",
                      cursor: "pointer",
                      padding: "2px 8px",
                      fontFamily: "inherit",
                      fontSize: "inherit",
                      fontWeight: "bold",
                    }}
                    title="Open calendar (Shift+C)"
                  >
                    {getDateLabel().toUpperCase()}
                  </button>
                </h2>
                {/* Date navigation hints */}
                <span style={{ color: "var(--zen-dim)", fontSize: "11px" }}>
                  <button
                    onClick={() => navigateDate(-1)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--zen-dim)",
                      cursor: "pointer",
                      padding: "2px 4px",
                      fontFamily: "inherit",
                    }}
                    title="Previous day ([)"
                  >
                    [
                  </button>
                  <button
                    onClick={() => navigateDate(1)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--zen-dim)",
                      cursor: "pointer",
                      padding: "2px 4px",
                      fontFamily: "inherit",
                    }}
                    title="Next day (])"
                  >
                    ]
                  </button>
                  <button
                    onClick={goToToday}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--zen-dim)",
                      cursor: "pointer",
                      padding: "2px 4px",
                      fontFamily: "inherit",
                    }}
                    title="Jump to today (t)"
                  >
                    t=today
                  </button>
                  <button
                    onClick={() => setShowCalendar((prev) => !prev)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--zen-dim)",
                      cursor: "pointer",
                      padding: "2px 4px",
                      fontFamily: "inherit",
                    }}
                    title="Toggle calendar (Shift+C)"
                  >
                    C=cal
                  </button>
                </span>
              </div>
              <ZenProgressBar
                completed={sessionStats.completed}
                total={sessionStats.total}
              />
            </div>

            {/* Calendar overlay */}
            {showCalendar && (
              <div
                style={{
                  position: "absolute",
                  top: "40px",
                  left: "0",
                  zIndex: 100,
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
                }}
              >
                <ZenCalendar
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                  onClose={() => setShowCalendar(false)}
                  isFocused={showCalendar}
                />
              </div>
            )}

            <div style={{ color: "var(--zen-dim)", marginBottom: "8px" }}>
              ────────────────
            </div>
            <ZenSessionList
              sessions={dateSessions || []}
              selectedIds={selectedIds}
              cursorIndex={cursorIndex}
              onToggleSelect={toggleSelect}
              onCursorMove={moveCursor}
              onAction={handleAction}
              onQuickMark={handleQuickMark}
              markingSessionId={markingSessionId}
              showStats={true}
            />
          </section>

          {/* Upcoming Tests/Exams */}
          <section style={{ marginBottom: "32px" }}>
            <h2
              style={{
                fontSize: "14px",
                fontWeight: "bold",
                color: "var(--zen-accent)",
                marginBottom: "8px",
                textShadow: "var(--zen-glow)",
              }}
            >
              TESTS &amp; EXAMS
            </h2>
            <div style={{ color: "var(--zen-dim)", marginBottom: "8px" }}>
              ──────────────
            </div>
            <ZenTestList
              events={calendarEvents || []}
              isLoading={eventsLoading}
              maxItems={5}
            />
          </section>

          {/* Distribution Charts */}
          <section
            style={{
              marginBottom: "32px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "24px",
            }}
          >
            <ZenDistributionChart type="grade" isActive={activeChart === "grade"} />
            <ZenDistributionChart type="school" isActive={activeChart === "school"} />
          </section>

          {/* Recent Activity */}
          <section style={{ marginBottom: "32px" }}>
            <h2
              style={{
                fontSize: "14px",
                fontWeight: "bold",
                color: "var(--zen-accent)",
                marginBottom: "8px",
                textShadow: "var(--zen-glow)",
              }}
            >
              RECENT ACTIVITY
            </h2>
            <div style={{ color: "var(--zen-dim)", marginBottom: "8px" }}>
              ───────────────
            </div>
            <ZenActivityFeed
              events={activityEvents || []}
              isLoading={activityLoading}
              maxItems={5}
            />
          </section>

          {/* Quick Actions Hint */}
          <div
            style={{
              marginTop: "32px",
              paddingTop: "16px",
              borderTop: "1px solid var(--zen-border)",
              color: "var(--zen-dim)",
              fontSize: "12px",
            }}
          >
            <span style={{ color: "var(--zen-fg)" }}>[</span>/<span style={{ color: "var(--zen-fg)" }}>]</span> prev/next{" "}
            <span style={{ color: "var(--zen-fg)" }}>t</span>=today{" "}
            <span style={{ color: "var(--zen-fg)" }}>C</span>=cal |{" "}
            <span style={{ color: "var(--zen-fg)" }}>Tab</span>: sessions→tests→charts→activity→cmd |{" "}
            <span style={{ color: "var(--zen-fg)" }}>!</span>=alerts{" "}
            <span style={{ color: "var(--zen-fg)" }}>T</span>=tools{" "}
            <span style={{ color: "var(--zen-fg)" }}>P</span>=puzzle{" "}
            <span style={{ color: "var(--zen-fg)" }}>o</span>=settings{" "}
            <span style={{ color: "var(--zen-fg)" }}>?</span>=help
          </div>
        </>
      )}
    </div>
  );
}
