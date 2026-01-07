"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useDashboardStats, useSessions, useCalendarEvents, useActivityFeed } from "@/lib/hooks";
import { useLocation } from "@/contexts/LocationContext";
import { useZenSession } from "@/contexts/ZenSessionContext";
import { ZenSessionList, ZenTestList, ZenActivityFeed, calculateStats } from "@/components/zen";
import { setZenStatus } from "@/components/zen/ZenStatusBar";
import { sessionsAPI } from "@/lib/api";
import { mutate } from "swr";

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
  const { selectedLocation } = useLocation();

  // Use session context for shared state
  const {
    setSessions,
    selectedIds,
    toggleSelect,
    cursorIndex,
    moveCursor,
    selectedDate,
    getDateLabel,
  } = useZenSession();

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
    setZenStatus(`Marking session as ${status}...`, "info");
    try {
      await sessionsAPI.updateSession(sessionId, { session_status: status });
      mutate((key) => typeof key === "string" && key.includes("/sessions"));
      setZenStatus(`✓ Marked as ${status}`, "success");
    } catch (error) {
      setZenStatus(`Failed to mark session: ${error}`, "error");
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
          <section style={{ marginBottom: "32px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "8px",
              }}
            >
              <h2
                style={{
                  fontSize: "14px",
                  fontWeight: "bold",
                  color: "var(--zen-accent)",
                  textShadow: "var(--zen-glow)",
                  margin: 0,
                }}
              >
                {getDateLabel().toUpperCase()}&apos;S SESSIONS{" "}
                <span style={{ color: "var(--zen-dim)", fontWeight: "normal", fontSize: "12px" }}>
                  ({selectedDate})
                </span>
              </h2>
              <ZenProgressBar
                completed={sessionStats.completed}
                total={sessionStats.total}
              />
            </div>
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
            Press <span style={{ color: "var(--zen-fg)" }}>s</span> for students,{" "}
            <span style={{ color: "var(--zen-fg)" }}>n</span> for sessions,{" "}
            <span style={{ color: "var(--zen-fg)" }}>/</span> for command bar,{" "}
            <span style={{ color: "var(--zen-fg)" }}>?</span> for help
          </div>
        </>
      )}
    </div>
  );
}
