"use client";

import { useEffect, useState } from "react";
import { useDashboardStats, useSessions } from "@/lib/hooks";
import { useLocation } from "@/contexts/LocationContext";
import { useRole } from "@/contexts/RoleContext";
import { Session } from "@/types";

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
  const { viewMode } = useRole();

  // Get today's date for filtering
  const today = new Date().toISOString().split("T")[0];

  const { data: stats, isLoading: statsLoading } = useDashboardStats(
    selectedLocation === "All Locations" ? undefined : selectedLocation
  );

  // Get today's sessions using filters
  const { data: todaySessions, isLoading: sessionsLoading } = useSessions({
    from_date: today,
    to_date: today,
    location: selectedLocation === "All Locations" ? undefined : selectedLocation,
  });

  const isLoading = statsLoading || sessionsLoading;

  return (
    <div
      style={{
        maxWidth: "900px",
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
          {/* Stats Section */}
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
              STATS
            </h2>
            <div style={{ color: "var(--zen-dim)", marginBottom: "8px" }}>─────</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "16px",
              }}
            >
              <div>
                <span style={{ color: "var(--zen-dim)" }}>Students: </span>
                <span style={{ color: "var(--zen-fg)" }}>
                  {stats?.total_students ?? "—"}
                </span>
              </div>
              <div>
                <span style={{ color: "var(--zen-dim)" }}>Active: </span>
                <span style={{ color: "var(--zen-fg)" }}>
                  {stats?.active_students ?? "—"}
                </span>
              </div>
              <div>
                <span style={{ color: "var(--zen-dim)" }}>Sessions (Week): </span>
                <span style={{ color: "var(--zen-fg)" }}>
                  {stats?.sessions_this_week ?? "—"}
                </span>
              </div>
              <div>
                <span style={{ color: "var(--zen-dim)" }}>Sessions (Month): </span>
                <span style={{ color: "var(--zen-fg)" }}>
                  {stats?.sessions_this_month ?? "—"}
                </span>
              </div>
              <div>
                <span style={{ color: "var(--zen-dim)" }}>Enrollments: </span>
                <span style={{ color: "var(--zen-fg)" }}>
                  {stats?.total_enrollments ?? "—"}
                </span>
              </div>
              <div>
                <span style={{ color: "var(--zen-dim)" }}>Active Enrollments: </span>
                <span style={{ color: "var(--zen-fg)" }}>
                  {stats?.active_enrollments ?? "—"}
                </span>
              </div>
            </div>
          </section>

          {/* Today's Sessions */}
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
              TODAY&apos;S SESSIONS
            </h2>
            <div style={{ color: "var(--zen-dim)", marginBottom: "8px" }}>
              ────────────────
            </div>
            {todaySessions && todaySessions.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {todaySessions.slice(0, 10).map((session: Session) => (
                  <div
                    key={session.id}
                    style={{
                      display: "flex",
                      gap: "16px",
                      color: "var(--zen-fg)",
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ color: "var(--zen-dim)", minWidth: "50px" }}>
                      {session.time_slot || "—"}
                    </span>
                    <span style={{ minWidth: "150px" }}>
                      {session.student_name || "Unknown"}
                      <span style={{ color: "var(--zen-dim)" }}>
                        {" "}
                        ({session.grade || "—"})
                      </span>
                    </span>
                    <span style={{ color: "var(--zen-dim)", minWidth: "80px" }}>
                      → {session.location || "—"}
                    </span>
                    <span
                      style={{
                        color:
                          session.session_status === "Attended"
                            ? "var(--zen-success)"
                            : session.session_status === "No Show"
                            ? "var(--zen-error)"
                            : "var(--zen-dim)",
                        minWidth: "80px",
                      }}
                    >
                      {session.session_status === "Attended"
                        ? "✓ Done"
                        : session.session_status === "No Show"
                        ? "✗ NoShow"
                        : session.session_status || "Pending"}
                    </span>
                  </div>
                ))}
                {todaySessions && todaySessions.length > 10 && (
                  <div style={{ color: "var(--zen-dim)", marginTop: "8px" }}>
                    ... and {todaySessions.length - 10} more sessions
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: "var(--zen-dim)" }}>
                No sessions scheduled for today.
              </div>
            )}
          </section>

          {/* Revenue (if available) */}
          {stats?.revenue_this_month !== undefined && stats.revenue_this_month !== null && (
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
                REVENUE
              </h2>
              <div style={{ color: "var(--zen-dim)", marginBottom: "8px" }}>───────</div>
              <div>
                <span style={{ color: "var(--zen-dim)" }}>This Month: </span>
                <span style={{ color: "var(--zen-success)" }}>
                  ${stats.revenue_this_month.toLocaleString()}
                </span>
              </div>
            </section>
          )}

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
