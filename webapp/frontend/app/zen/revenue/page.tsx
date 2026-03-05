"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useMonthlyRevenueSummary, useSessionRevenueDetails, useTutors, useActiveTutors, usePageTitle } from "@/lib/hooks";
import { useLocation } from "@/contexts/LocationContext";
import { useRole } from "@/contexts/RoleContext";
import { useAuth } from "@/contexts/AuthContext";
import { useZenKeyboardFocus } from "@/contexts/ZenKeyboardFocusContext";
import { setZenStatus } from "@/components/zen/ZenStatusBar";
import { ZenSpinner } from "@/components/zen/ZenSpinner";
import { getStatusChar, getStatusColor, getShortStatus } from "@/components/zen/utils/sessionSorting";
import { formatShortDate } from "@/lib/formatters";
import type { SessionRevenueDetail } from "@/types";

// ── Helpers ──

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatPeriodDisplay(period: string): string {
  const [year, month] = period.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function adjustPeriod(period: string, delta: number): string {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 1 + delta);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatCurrency(amount: number): string {
  return `MOP ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── ASCII Bar Chart ──

function AsciiBarChart({ data }: { data: { label: string; value: number; count: number }[] }) {
  if (data.length === 0) return null;
  const maxValue = Math.max(...data.map((d) => d.value));
  const barWidth = 20;

  return (
    <div>
      {data.map((d) => {
        const filled = maxValue > 0 ? Math.round((d.value / maxValue) * barWidth) : 0;
        const empty = barWidth - filled;
        return (
          <div key={d.label} style={{ display: "flex", gap: "8px", fontSize: "12px", lineHeight: "1.6" }}>
            <span style={{ color: "var(--zen-dim)", minWidth: "60px" }}>{d.label}</span>
            <span style={{ color: "var(--zen-accent)" }}>{"█".repeat(filled)}</span>
            <span style={{ color: "var(--zen-border)" }}>{"░".repeat(empty)}</span>
            <span style={{ color: "var(--zen-fg)", minWidth: "70px", textAlign: "right" }}>
              {d.value.toLocaleString()}
            </span>
            <span style={{ color: "var(--zen-dim)" }}>
              ({d.count} session{d.count !== 1 ? "s" : ""})
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ──

export default function ZenRevenuePage() {
  usePageTitle("Revenue - Zen Mode");
  const { user, canViewAdminPages, impersonatedTutor, isImpersonating, effectiveRole } = useAuth();
  const { selectedLocation } = useLocation();
  const { viewMode } = useRole();
  const { setDisableSectionCycling } = useZenKeyboardFocus();
  const { data: tutors = [] } = useTutors();
  const { data: activeTutors = [], isLoading: tutorsLoading } = useActiveTutors();

  // Disable global Tab section cycling
  useEffect(() => {
    setDisableSectionCycling(true);
    return () => setDisableSectionCycling(false);
  }, [setDisableSectionCycling]);

  // Period
  const [selectedPeriod, setSelectedPeriod] = useState(getCurrentPeriod);

  // Tutor selection — admin center-view can select any tutor
  const [selectedTutorId, setSelectedTutorId] = useState<number | null>(null);

  const effectiveTutorId = (canViewAdminPages && viewMode === "center-view")
    ? selectedTutorId
    : (isImpersonating && effectiveRole === "Tutor" && impersonatedTutor?.id)
      ? impersonatedTutor.id
      : (user?.id ?? null);

  // Auto-select first tutor for admins
  useEffect(() => {
    if (canViewAdminPages && selectedTutorId === null && activeTutors.length > 0) {
      const locationFilter = selectedLocation === "All Locations" ? undefined : selectedLocation;
      const filtered = locationFilter
        ? activeTutors.filter((t) => t.default_location === locationFilter)
        : activeTutors;
      if (filtered.length > 0) {
        setSelectedTutorId(filtered[0].id);
      }
    }
  }, [canViewAdminPages, selectedTutorId, activeTutors, selectedLocation]);

  // Data
  const { data: summary, isLoading: summaryLoading } = useMonthlyRevenueSummary(effectiveTutorId, selectedPeriod);
  const { data: sessions = [], isLoading: sessionsLoading } = useSessionRevenueDetails(effectiveTutorId, selectedPeriod);

  // Should salary be shown?
  const viewedTutor = tutors.find((t) => t.id === effectiveTutorId);
  const showSalary = viewedTutor?.role && !["Admin", "Super Admin"].includes(viewedTutor.role);

  const isLoading = summaryLoading || sessionsLoading || (canViewAdminPages && viewMode === "center-view" && tutorsLoading);

  // Session cursor
  const [sessionCursor, setSessionCursor] = useState(0);
  const cursorRowRef = useRef<HTMLDivElement>(null);

  // Reset cursor when data changes
  useEffect(() => {
    setSessionCursor(0);
  }, [selectedPeriod, effectiveTutorId]);

  // Auto-scroll
  useEffect(() => {
    if (cursorRowRef.current) {
      cursorRowRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [sessionCursor]);

  // Daily breakdown data
  const dailyBreakdown = useMemo(() => {
    const byDate: Record<string, { total: number; count: number }> = {};
    sessions.forEach((s) => {
      if (!byDate[s.session_date]) byDate[s.session_date] = { total: 0, count: 0 };
      byDate[s.session_date].total += s.cost_per_session;
      byDate[s.session_date].count += 1;
    });
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        label: formatShortDate(date),
        value: data.total,
        count: data.count,
      }));
  }, [sessions]);

  // Total revenue from sessions
  const totalSessionRevenue = useMemo(
    () => sessions.reduce((sum, s) => sum + s.cost_per_session, 0),
    [sessions]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.tagName === "SELECT"
      ) {
        return;
      }

      switch (e.key) {
        case "[":
          e.preventDefault();
          setSelectedPeriod((p) => {
            const prev = adjustPeriod(p, -1);
            setZenStatus(formatPeriodDisplay(prev), "info");
            return prev;
          });
          break;
        case "]":
          e.preventDefault();
          setSelectedPeriod((p) => {
            const next = adjustPeriod(p, 1);
            setZenStatus(formatPeriodDisplay(next), "info");
            return next;
          });
          break;
        case "t":
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            setSelectedPeriod(getCurrentPeriod());
            setZenStatus("Current month", "info");
          }
          break;

        case "j":
        case "ArrowDown":
          e.preventDefault();
          if (sessionCursor < sessions.length - 1) {
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
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sessionCursor, sessions.length]);

  // Tutor display name
  const tutorDisplayName = viewedTutor?.tutor_name ?? summary?.tutor_name ?? "—";

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          marginBottom: "16px",
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
          REVENUE
        </h1>
      </div>

      {/* Toolbar: Tutor + Period */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        {/* Tutor selector */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: "var(--zen-dim)", fontSize: "12px" }}>Tutor:</span>
          {canViewAdminPages && viewMode === "center-view" ? (
            <select
              value={selectedTutorId ?? ""}
              onChange={(e) => setSelectedTutorId(e.target.value ? Number(e.target.value) : null)}
              style={{
                backgroundColor: "var(--zen-bg)",
                border: "1px solid var(--zen-border)",
                color: "var(--zen-fg)",
                padding: "4px 8px",
                fontSize: "12px",
                fontFamily: "inherit",
              }}
            >
              {activeTutors.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.tutor_name}
                </option>
              ))}
            </select>
          ) : (
            <span style={{ color: "var(--zen-accent)", fontSize: "12px" }}>{tutorDisplayName}</span>
          )}
        </div>

        {/* Period navigation */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={() => setSelectedPeriod((p) => adjustPeriod(p, -1))}
            style={{
              background: "none",
              border: "none",
              color: "var(--zen-dim)",
              cursor: "pointer",
              fontFamily: "inherit",
              padding: "2px 6px",
            }}
            title="Previous month ([)"
          >
            [
          </button>
          <span style={{ color: "var(--zen-fg)", fontSize: "13px", minWidth: "140px", textAlign: "center" }}>
            {formatPeriodDisplay(selectedPeriod)}
          </span>
          <button
            onClick={() => setSelectedPeriod((p) => adjustPeriod(p, 1))}
            style={{
              background: "none",
              border: "none",
              color: "var(--zen-dim)",
              cursor: "pointer",
              fontFamily: "inherit",
              padding: "2px 6px",
            }}
            title="Next month (])"
          >
            ]
          </button>
          <button
            onClick={() => setSelectedPeriod(getCurrentPeriod())}
            style={{
              background: "none",
              border: "1px solid var(--zen-border)",
              color: "var(--zen-dim)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "11px",
              padding: "2px 6px",
            }}
            title="Current month (t)"
          >
            t=today
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ color: "var(--zen-dim)" }}><ZenSpinner /> Loading revenue data...</div>
      ) : !summary ? (
        <div style={{ color: "var(--zen-dim)" }}>No revenue data for this period</div>
      ) : (
        <>
          {/* Summary Section */}
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
              SUMMARY
            </h2>
            <div style={{ color: "var(--zen-dim)", marginBottom: "12px" }}>{"─".repeat(60)}</div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "200px 1fr",
                gap: "4px 16px",
                fontSize: "12px",
              }}
            >
              {showSalary && (
                <>
                  <span style={{ color: "var(--zen-success)", fontWeight: "bold" }}>Total Salary</span>
                  <span style={{ color: "var(--zen-success)", fontWeight: "bold" }}>{formatCurrency(summary.total_salary)}</span>

                  <span style={{ color: "var(--zen-dim)" }}>├─ Basic Salary</span>
                  <span style={{ color: "var(--zen-fg)" }}>{formatCurrency(summary.basic_salary)}</span>

                  <span style={{ color: "var(--zen-dim)" }}>└─ Monthly Bonus</span>
                  <span style={{ color: "var(--zen-fg)" }}>{formatCurrency(summary.monthly_bonus)}</span>

                  <div style={{ gridColumn: "1 / -1", height: "8px" }} />
                </>
              )}

              <span style={{ color: "var(--zen-fg)" }}>Session Revenue</span>
              <span style={{ color: "var(--zen-fg)" }}>{formatCurrency(summary.session_revenue)}</span>

              <span style={{ color: "var(--zen-dim)" }}>Sessions</span>
              <span style={{ color: "var(--zen-fg)" }}>
                {summary.sessions_count}
                {summary.avg_revenue_per_session != null && (
                  <span style={{ color: "var(--zen-dim)" }}>
                    {" "}(avg {formatCurrency(summary.avg_revenue_per_session)})
                  </span>
                )}
              </span>
            </div>
          </section>

          {/* Daily Breakdown */}
          {dailyBreakdown.length > 0 && (
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
                DAILY BREAKDOWN
              </h2>
              <div style={{ color: "var(--zen-dim)", marginBottom: "12px" }}>{"─".repeat(60)}</div>
              <AsciiBarChart data={dailyBreakdown} />
            </section>
          )}

          {/* Session Details */}
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
              SESSION DETAILS
              <span style={{ color: "var(--zen-dim)", fontWeight: "normal", fontSize: "11px", marginLeft: "8px" }}>
                ({sessions.length} sessions)
              </span>
            </h2>
            <div style={{ color: "var(--zen-dim)", marginBottom: "8px" }}>{"─".repeat(60)}</div>

            {sessions.length === 0 ? (
              <div style={{ color: "var(--zen-dim)" }}>No sessions this period</div>
            ) : (
              <>
                {sessions.map((session, idx) => {
                  const isAtCursor = idx === sessionCursor;
                  const statusColor = getStatusColor(session.session_status);
                  const statusChar = getStatusChar(session.session_status);

                  return (
                    <div
                      key={session.session_id}
                      ref={isAtCursor ? cursorRowRef : undefined}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "2px 4px",
                        backgroundColor: isAtCursor ? "var(--zen-selection)" : "transparent",
                        borderLeft: isAtCursor ? "2px solid var(--zen-accent)" : "2px solid transparent",
                      }}
                    >
                      {/* Cursor */}
                      <span style={{ width: "12px", color: isAtCursor ? "var(--zen-accent)" : "transparent" }}>
                        {isAtCursor ? ">" : " "}
                      </span>

                      {/* Date */}
                      <span style={{ color: "var(--zen-fg)", fontSize: "12px", minWidth: "80px" }}>
                        {formatShortDate(session.session_date)}
                      </span>

                      {/* Time */}
                      <span style={{ color: "var(--zen-dim)", fontSize: "12px", minWidth: "100px" }}>
                        {session.time_slot || "—"}
                      </span>

                      {/* Student */}
                      <span style={{ color: "var(--zen-fg)", fontSize: "12px", minWidth: "160px", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {session.student_name}
                      </span>

                      {/* Status */}
                      <span style={{ color: `var(--zen-${statusColor})`, minWidth: "20px", textAlign: "center" }}>
                        {statusChar}
                      </span>
                      <span style={{ color: `var(--zen-${statusColor})`, fontSize: "11px", minWidth: "60px" }}>
                        {getShortStatus(session.session_status, true)}
                      </span>

                      {/* Amount */}
                      <span style={{ color: "var(--zen-fg)", fontSize: "12px", minWidth: "80px", textAlign: "right" }}>
                        {session.cost_per_session.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  );
                })}

                {/* Total */}
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    padding: "8px 4px 4px",
                    marginTop: "8px",
                    borderTop: "1px solid var(--zen-border)",
                    fontSize: "12px",
                  }}
                >
                  <span style={{ width: "12px" }} />
                  <span style={{ color: "var(--zen-fg)", fontWeight: "bold" }}>
                    Total ({sessions.length} sessions)
                  </span>
                  <span style={{ flex: 1 }} />
                  <span style={{ color: "var(--zen-success)", fontWeight: "bold", minWidth: "80px", textAlign: "right" }}>
                    {totalSessionRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </>
            )}
          </section>
        </>
      )}

      {/* Navigation hint */}
      <div
        style={{
          marginTop: "32px",
          paddingTop: "16px",
          borderTop: "1px solid var(--zen-border)",
          color: "var(--zen-dim)",
          fontSize: "12px",
        }}
      >
        <span style={{ color: "var(--zen-fg)" }}>[</span>/<span style={{ color: "var(--zen-fg)" }}>]</span> prev/next month{" "}
        <span style={{ color: "var(--zen-fg)" }}>t</span>=current |{" "}
        <span style={{ color: "var(--zen-fg)" }}>j/k</span> navigate |{" "}
        <span style={{ color: "var(--zen-fg)" }}>?</span>=help
      </div>
    </div>
  );
}
