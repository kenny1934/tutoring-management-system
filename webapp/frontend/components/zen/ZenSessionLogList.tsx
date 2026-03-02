"use client";

import { useEffect, useCallback, useMemo, useState, useRef } from "react";
import type { Session } from "@/types";
import {
  groupAndSortSessions,
  getStatusChar,
  getStatusColor,
  getGradeColor,
  canBeMarked,
  getTutorFirstName,
} from "./utils/sessionSorting";
import { ZenSessionDetail } from "./ZenSessionDetail";
import { formatDateWithDay } from "@/lib/formatters";
import { isCountableSession } from "@/lib/session-status";

interface ZenSessionLogListProps {
  sessions: Session[];
  cursorIndex: number;
  selectedIds: Set<number>;
  onCursorMove: (newIndex: number) => void;
  onToggleSelect: (id: number) => void;
  onQuickMark?: (sessionId: number, status: string) => void;
  markingSessionId?: number | null;
  isFocused: boolean;
  onFocus: () => void;
}

interface DateGroup {
  date: string;
  dateLabel: string;
  sessions: Session[];
}

/**
 * Multi-date session list with date group headers and a single flat cursor.
 * Groups sessions by date, then by time slot within each date.
 */
export function ZenSessionLogList({
  sessions,
  cursorIndex,
  selectedIds,
  onCursorMove,
  onToggleSelect,
  onQuickMark,
  markingSessionId,
  isFocused,
  onFocus,
}: ZenSessionLogListProps) {
  const [expandedSessionId, setExpandedSessionId] = useState<number | null>(null);
  const cursorRowRef = useRef<HTMLDivElement>(null);

  // Group sessions by date, then sort within each date
  const { dateGroups, flatSessions, stats } = useMemo(() => {
    // Group by date
    const byDate: Record<string, Session[]> = {};
    sessions.forEach((s) => {
      if (!byDate[s.session_date]) byDate[s.session_date] = [];
      byDate[s.session_date].push(s);
    });

    // Sort dates descending (most recent first)
    const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

    const groups: DateGroup[] = [];
    const flat: Session[] = [];

    sortedDates.forEach((date) => {
      const { flatSessions: sorted } = groupAndSortSessions(byDate[date]);
      groups.push({
        date,
        dateLabel: formatDateWithDay(date),
        sessions: sorted,
      });
      flat.push(...sorted);
    });

    // Stats
    let completed = 0, upcoming = 0, cancelled = 0, noshow = 0;
    sessions.forEach((s) => {
      const status = s.session_status;
      if (status === "Attended" || status === "Attended (Make-up)" || status === "Attended (Trial)") completed++;
      else if (status === "No Show") noshow++;
      else if (status === "Cancelled") cancelled++;
      else if (canBeMarked(s)) upcoming++;
    });

    return {
      dateGroups: groups,
      flatSessions: flat,
      stats: { total: sessions.length, completed, upcoming, noshow, cancelled },
    };
  }, [sessions]);

  const currentSession = flatSessions[cursorIndex];

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (!isFocused) return;

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          if (cursorIndex < flatSessions.length - 1) {
            onCursorMove(cursorIndex + 1);
          }
          break;

        case "k":
        case "ArrowUp":
          e.preventDefault();
          if (cursorIndex > 0) {
            onCursorMove(cursorIndex - 1);
          }
          break;

        case " ":
          e.preventDefault();
          if (currentSession) {
            onToggleSelect(currentSession.id);
          }
          break;

        case "a":
          e.preventDefault();
          flatSessions.forEach((s) => {
            if (canBeMarked(s) && !selectedIds.has(s.id)) {
              onToggleSelect(s.id);
            }
          });
          break;

        case "Escape":
          e.preventDefault();
          if (expandedSessionId) {
            setExpandedSessionId(null);
          } else {
            selectedIds.forEach((id) => onToggleSelect(id));
          }
          break;

        case "Enter":
          e.preventDefault();
          if (currentSession) {
            setExpandedSessionId(
              expandedSessionId === currentSession.id ? null : currentSession.id
            );
          }
          break;

        case "1":
          e.preventDefault();
          if (currentSession && canBeMarked(currentSession) && onQuickMark) {
            onQuickMark(currentSession.id, "Attended");
          }
          break;
        case "2":
          e.preventDefault();
          if (currentSession && canBeMarked(currentSession) && onQuickMark) {
            onQuickMark(currentSession.id, "No Show");
          }
          break;
        case "3":
          e.preventDefault();
          if (currentSession && canBeMarked(currentSession) && onQuickMark) {
            onQuickMark(currentSession.id, "Rescheduled - Pending Make-up");
          }
          break;
        case "4":
          e.preventDefault();
          if (currentSession && canBeMarked(currentSession) && onQuickMark) {
            onQuickMark(currentSession.id, "Sick Leave - Pending Make-up");
          }
          break;
        case "5":
          e.preventDefault();
          if (currentSession && canBeMarked(currentSession) && onQuickMark) {
            onQuickMark(currentSession.id, "Weather Cancelled - Pending Make-up");
          }
          break;
      }
    },
    [cursorIndex, flatSessions, currentSession, selectedIds, onToggleSelect, onCursorMove, onQuickMark, expandedSessionId, isFocused]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Auto-scroll
  useEffect(() => {
    if (cursorRowRef.current) {
      cursorRowRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [cursorIndex]);

  if (flatSessions.length === 0) {
    return <div style={{ color: "var(--zen-dim)" }}>No sessions in this period</div>;
  }

  // Track flat index for cursor positioning
  let flatIndex = -1;

  return (
    <div
      className="zen-session-log-list"
      onClick={onFocus}
      style={{
        outline: isFocused ? "1px solid var(--zen-accent)" : "1px solid transparent",
        outlineOffset: "4px",
        borderRadius: "4px",
        transition: "outline-color 0.15s ease",
      }}
    >
      {/* Stats */}
      <div
        style={{
          display: "flex",
          gap: "24px",
          marginBottom: "16px",
          fontSize: "12px",
        }}
      >
        <span style={{ color: "var(--zen-dim)" }}>
          Total: <span style={{ color: "var(--zen-fg)" }}>{stats.total}</span>
        </span>
        <span style={{ color: "var(--zen-dim)" }}>
          Attended: <span style={{ color: "var(--zen-success)" }}>{stats.completed}</span>
        </span>
        <span style={{ color: "var(--zen-dim)" }}>
          Upcoming: <span style={{ color: "var(--zen-accent)" }}>{stats.upcoming}</span>
        </span>
        <span style={{ color: "var(--zen-dim)" }}>
          No Show: <span style={{ color: "var(--zen-error)" }}>{stats.noshow}</span>
        </span>
        <span style={{ color: "var(--zen-dim)" }}>
          Cancelled: <span style={{ color: "var(--zen-error)" }}>{stats.cancelled}</span>
        </span>
        {selectedIds.size > 0 && (
          <span style={{ color: "var(--zen-warning)" }}>
            Selected: {selectedIds.size}
          </span>
        )}
      </div>

      {/* Date groups */}
      {dateGroups.map((group) => {
        // Group by time slot within this date
        const { groupedSessions } = groupAndSortSessions(group.sessions);

        return (
          <div key={group.date} style={{ marginBottom: "20px" }}>
            {/* Date header */}
            <div
              style={{
                color: "var(--zen-fg)",
                fontWeight: "bold",
                fontSize: "13px",
                marginBottom: "8px",
                textShadow: "var(--zen-glow)",
              }}
            >
              === {group.dateLabel} ===
              <span style={{ color: "var(--zen-dim)", fontWeight: "normal", fontSize: "11px", marginLeft: "8px" }}>
                ({group.sessions.filter(isCountableSession).length} session{group.sessions.filter(isCountableSession).length !== 1 ? "s" : ""})
              </span>
            </div>

            {/* Time slot groups */}
            {groupedSessions.map((slotGroup) => (
              <div key={slotGroup.timeSlot} style={{ marginBottom: "12px", marginLeft: "8px" }}>
                {/* Time slot header */}
                <div style={{ color: "var(--zen-accent)", fontSize: "12px", marginBottom: "2px" }}>
                  {slotGroup.timeSlot}
                </div>
                <div style={{ color: "var(--zen-border)", marginBottom: "2px", letterSpacing: "0.5px" }}>
                  {"─".repeat(35)}
                </div>

                {/* Sessions in this slot */}
                {slotGroup.sessions.map((session) => {
                  flatIndex++;
                  const isAtCursor = flatIndex === cursorIndex;
                  const isSelected = selectedIds.has(session.id);
                  const statusColor = getStatusColor(session.session_status);
                  const gradeColor = getGradeColor(session.grade, session.lang_stream);
                  const statusChar = getStatusChar(session.session_status);
                  const isActionable = canBeMarked(session);
                  const isExpanded = expandedSessionId === session.id;

                  return (
                    <div key={session.id} ref={isAtCursor ? cursorRowRef : undefined}>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          onFocus();
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
                        {/* Cursor */}
                        <span style={{ width: "12px", color: isAtCursor ? "var(--zen-accent)" : "transparent", textShadow: isAtCursor ? "var(--zen-glow)" : "none" }}>
                          {isAtCursor ? ">" : " "}
                        </span>

                        {/* Selection */}
                        <span style={{ width: "24px", color: isSelected ? "var(--zen-accent)" : "var(--zen-dim)" }}>
                          [{isSelected ? "x" : " "}]
                        </span>

                        {/* Student ID */}
                        <span style={{ width: "50px", color: "var(--zen-dim)", fontFamily: "monospace", fontSize: "12px" }}>
                          {session.school_student_id || "—"}
                        </span>

                        {/* Student name */}
                        <span style={{ minWidth: "160px", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--zen-fg)" }}>
                          {session.student_name || "Unknown"}
                        </span>

                        {/* Grade */}
                        <span style={{ width: "36px", padding: "0 4px", backgroundColor: gradeColor + "40", color: "var(--zen-fg)", borderRadius: "2px", textAlign: "center", fontSize: "11px" }}>
                          {session.grade || "—"}{session.lang_stream || ""}
                        </span>

                        {/* School */}
                        <span style={{ minWidth: "70px", maxWidth: "70px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--zen-dim)", fontSize: "11px" }}>
                          {session.school || "—"}
                        </span>

                        {/* Status */}
                        <span style={{ minWidth: "20px", textAlign: "center", color: markingSessionId === session.id ? "var(--zen-dim)" : `var(--zen-${statusColor})` }}>
                          {markingSessionId === session.id ? "○" : statusChar}
                        </span>
                        <span style={{ color: markingSessionId === session.id ? "var(--zen-dim)" : `var(--zen-${statusColor})`, fontSize: "11px", minWidth: "70px" }}>
                          {markingSessionId === session.id ? "..." : getShortStatus(session.session_status)}
                        </span>

                        {/* Tutor */}
                        <span style={{ minWidth: "80px", maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--zen-fg)", fontSize: "12px" }}>
                          {session.tutor_name ? getTutorFirstName(session.tutor_name) : "—"}
                        </span>
                      </div>

                      {/* Inline detail */}
                      {isExpanded && onQuickMark && (
                        <ZenSessionDetail
                          session={session}
                          onClose={() => setExpandedSessionId(null)}
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
      })}

      {/* Hint */}
      <div
        style={{
          marginTop: "16px",
          paddingTop: "8px",
          borderTop: "1px solid var(--zen-border)",
          color: "var(--zen-dim)",
          fontSize: "11px",
        }}
      >
        <span style={{ color: "var(--zen-fg)" }}>j/k</span> navigate •{" "}
        <span style={{ color: "var(--zen-fg)" }}>Enter</span> detail •{" "}
        <span style={{ color: "var(--zen-fg)" }}>Space</span> select •{" "}
        <span style={{ color: "var(--zen-fg)" }}>1</span>=Attended{" "}
        <span style={{ color: "var(--zen-fg)" }}>2</span>=No Show{" "}
        <span style={{ color: "var(--zen-fg)" }}>3</span>=Reschedule{" "}
        <span style={{ color: "var(--zen-fg)" }}>4</span>=Sick{" "}
        <span style={{ color: "var(--zen-fg)" }}>5</span>=Weather •{" "}
        <span style={{ color: "var(--zen-fg)" }}>a</span> all •{" "}
        <span style={{ color: "var(--zen-fg)" }}>Esc</span> clear
      </div>
    </div>
  );
}

function getShortStatus(status: string): string {
  switch (status) {
    case "Attended": return "Attended";
    case "Attended (Make-up)": return "Att(MU)";
    case "Attended (Trial)": return "Att(T)";
    case "Scheduled": return "Scheduled";
    case "Trial Class": return "Trial";
    case "Make-up Class": return "Make-up";
    case "No Show": return "No Show";
    case "Cancelled": return "Cancelled";
    default:
      if (status.includes("Pending Make-up")) return "Pending MU";
      if (status.includes("Make-up Booked")) return "MU Booked";
      return status.slice(0, 10);
  }
}

export default ZenSessionLogList;
