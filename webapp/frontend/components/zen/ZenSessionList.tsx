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
  type GroupedSessionsResult,
} from "./utils/sessionSorting";
import { ZenSessionDetail } from "./ZenSessionDetail";
import { useZenKeyboardFocus } from "@/contexts/ZenKeyboardFocusContext";
import { isCountableSession } from "@/lib/session-status";

interface ZenSessionListProps {
  sessions: Session[];
  selectedIds: Set<number>;
  cursorIndex: number;
  onToggleSelect: (id: number) => void;
  onCursorMove: (newIndex: number) => void;
  onAction?: (action: string, sessionIds: number[]) => void;
  onQuickMark?: (sessionId: number, status: string) => void;
  markingSessionId?: number | null;
  showStats?: boolean;
}

/**
 * Terminal-style session list with vim-like navigation
 *
 * Keyboard controls (when focused):
 * - j/↓: Move cursor down
 * - k/↑: Move cursor up
 * - Space: Toggle selection on current item
 * - a: Select all
 * - Escape: Clear selection
 * - 1: Mark current as Attended
 * - 2: Mark current as No Show
 * - 3: Mark current as Reschedule
 * - 4: Mark current as Sick Leave
 * - 5: Mark current as Weather Cancelled
 */
export function ZenSessionList({
  sessions,
  selectedIds,
  cursorIndex,
  onToggleSelect,
  onCursorMove,
  onAction,
  onQuickMark,
  markingSessionId,
  showStats = true,
}: ZenSessionListProps) {
  // Track which session has detail view expanded
  const [expandedSessionId, setExpandedSessionId] = useState<number | null>(null);

  // Keyboard focus context
  const { isFocused, setFocusedSection } = useZenKeyboardFocus();

  // Ref for auto-scroll on cursor movement
  const cursorRowRef = useRef<HTMLDivElement>(null);

  // Process sessions using the same logic as GUI
  const { groupedSessions, stats, flatSessions }: GroupedSessionsResult = useMemo(
    () => groupAndSortSessions(sessions),
    [sessions]
  );

  // Get the session at cursor position
  const currentSession = flatSessions[cursorIndex];

  // Keyboard navigation handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Only handle if not in an input
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      // Only handle if this section has focus
      if (!isFocused("sessions")) {
        return;
      }

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

        case " ": // Space
          e.preventDefault();
          if (currentSession) {
            onToggleSelect(currentSession.id);
          }
          break;

        case "a":
          // Select all actionable sessions
          e.preventDefault();
          flatSessions.forEach((s) => {
            if (canBeMarked(s) && !selectedIds.has(s.id)) {
              onToggleSelect(s.id);
            }
          });
          break;

        case "Escape":
          e.preventDefault();
          // Clear all selections
          selectedIds.forEach((id) => onToggleSelect(id));
          break;

        case "Enter":
          e.preventDefault();
          // Toggle detail view for current session
          if (currentSession) {
            if (expandedSessionId === currentSession.id) {
              setExpandedSessionId(null);
            } else {
              setExpandedSessionId(currentSession.id);
            }
          }
          break;

        // Quick action keys for marking current session
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

  // Register global keyboard handler
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Auto-scroll to keep cursor visible
  useEffect(() => {
    if (cursorRowRef.current) {
      cursorRowRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [cursorIndex]);

  // Track flat index for cursor positioning
  let flatIndex = -1;

  if (flatSessions.length === 0) {
    return (
      <div style={{ color: "var(--zen-dim)" }}>
        No sessions today
      </div>
    );
  }

  const hasFocus = isFocused("sessions");

  return (
    <div
      className="zen-session-list"
      onClick={() => setFocusedSection("sessions")}
      style={{
        outline: hasFocus ? "1px solid var(--zen-accent)" : "1px solid transparent",
        outlineOffset: "4px",
        borderRadius: "4px",
        transition: "outline-color 0.15s ease",
      }}
    >
      {/* Stats Bar */}
      {showStats && (
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
            Completed:{" "}
            <span style={{ color: "var(--zen-success)" }}>{stats.completed}</span>
          </span>
          <span style={{ color: "var(--zen-dim)" }}>
            Upcoming:{" "}
            <span style={{ color: "var(--zen-accent)" }}>{stats.upcoming}</span>
          </span>
          <span style={{ color: "var(--zen-dim)" }}>
            Cancelled:{" "}
            <span style={{ color: "var(--zen-error)" }}>{stats.cancelled}</span>
          </span>
          {selectedIds.size > 0 && (
            <span style={{ color: "var(--zen-warning)" }}>
              Selected: {selectedIds.size}
            </span>
          )}
        </div>
      )}

      {/* Grouped Sessions */}
      {groupedSessions.map((group) => (
        <div key={group.timeSlot} style={{ marginBottom: "16px" }}>
          {/* Time slot header */}
          <div
            style={{
              color: "var(--zen-accent)",
              fontWeight: "bold",
              marginBottom: "4px",
              textShadow: "var(--zen-glow)",
            }}
          >
            {group.timeSlot}{" "}
            <span style={{ color: "var(--zen-dim)", fontWeight: "normal" }}>
              ({group.sessions.filter(isCountableSession).length} session{group.sessions.filter(isCountableSession).length !== 1 ? "s" : ""})
            </span>
          </div>
          <div
            style={{
              color: "var(--zen-border)",
              marginBottom: "4px",
              letterSpacing: "0.5px",
            }}
          >
            {"─".repeat(40)}
          </div>

          {/* Sessions in this time slot */}
          {group.sessions.map((session) => {
            flatIndex++;
            const isAtCursor = flatIndex === cursorIndex;
            const isSelected = selectedIds.has(session.id);
            const statusColor = getStatusColor(session.session_status);
            const gradeColor = getGradeColor(session.grade, session.lang_stream);
            const statusChar = getStatusChar(session.session_status);
            const isActionable = canBeMarked(session);

            // Get the tutor display - check if this is first session for this tutor in group
            const tutorIndex = group.sessions.findIndex(
              (s) => s.tutor_name === session.tutor_name
            );
            const isFirstForTutor =
              group.sessions.indexOf(session) === tutorIndex;

            const isExpanded = expandedSessionId === session.id;

            return (
              <div key={session.id} ref={isAtCursor ? cursorRowRef : undefined}>
              <div
                onClick={() => {
                  setFocusedSection("sessions");
                  if (isActionable) onToggleSelect(session.id);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "2px 4px",
                  cursor: isActionable ? "pointer" : "default",
                  backgroundColor: isAtCursor
                    ? "var(--zen-selection)"
                    : "transparent",
                  borderLeft: isAtCursor
                    ? "2px solid var(--zen-accent)"
                    : "2px solid transparent",
                  opacity: isActionable ? 1 : 0.7,
                }}
              >
                {/* Cursor indicator */}
                <span
                  style={{
                    width: "12px",
                    color: isAtCursor ? "var(--zen-accent)" : "transparent",
                    textShadow: isAtCursor ? "var(--zen-glow)" : "none",
                  }}
                >
                  {isAtCursor ? ">" : " "}
                </span>

                {/* Selection checkbox */}
                <span
                  style={{
                    width: "24px",
                    color: isSelected ? "var(--zen-accent)" : "var(--zen-dim)",
                  }}
                >
                  [{isSelected ? "x" : " "}]
                </span>

                {/* Student ID */}
                <span
                  style={{
                    width: "60px",
                    color: "var(--zen-dim)",
                    fontFamily: "monospace",
                  }}
                >
                  {session.school_student_id || "—"}
                </span>

                {/* Student name with inline unpaid indicator */}
                <span
                  style={{
                    minWidth: "180px",
                    maxWidth: "180px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: "var(--zen-fg)",
                  }}
                >
                  {session.student_name || "Unknown"}
                  {session.financial_status && session.financial_status !== "Paid" && (
                    <span
                      style={{
                        color: "var(--zen-error)",
                        marginLeft: "4px",
                        fontWeight: "bold",
                      }}
                      title="Unpaid"
                    >
                      $
                    </span>
                  )}
                </span>

                {/* Grade with color hint */}
                <span
                  style={{
                    width: "40px",
                    padding: "0 4px",
                    backgroundColor: gradeColor + "40", // 25% opacity
                    color: "var(--zen-fg)",
                    borderRadius: "2px",
                    textAlign: "center",
                    fontSize: "11px",
                  }}
                >
                  {session.grade || "—"}
                  {session.lang_stream || ""}
                </span>

                {/* School */}
                <span
                  style={{
                    minWidth: "80px",
                    maxWidth: "80px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: "var(--zen-dim)",
                    fontSize: "11px",
                  }}
                >
                  {session.school || "—"}
                </span>

                {/* Status indicator */}
                <span
                  style={{
                    minWidth: "20px",
                    textAlign: "center",
                    color: markingSessionId === session.id
                      ? "var(--zen-dim)"
                      : `var(--zen-${statusColor})`,
                    textShadow:
                      markingSessionId !== session.id &&
                      (statusColor === "success" || statusColor === "accent")
                        ? "var(--zen-glow)"
                        : "none",
                  }}
                >
                  {markingSessionId === session.id ? "○" : statusChar}
                </span>

                {/* Status text */}
                <span
                  style={{
                    color: markingSessionId === session.id
                      ? "var(--zen-dim)"
                      : `var(--zen-${statusColor})`,
                    fontSize: "11px",
                    minWidth: "80px",
                  }}
                >
                  {markingSessionId === session.id
                    ? "..."
                    : getShortStatus(session.session_status)}
                </span>

                {/* Tutor name - only show for first session of each tutor */}
                <span
                  style={{
                    minWidth: "120px",
                    maxWidth: "120px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: isFirstForTutor ? "var(--zen-fg)" : "var(--zen-dim)",
                    fontStyle: isFirstForTutor ? "normal" : "italic",
                  }}
                >
                  {isFirstForTutor
                    ? session.tutor_name || "—"
                    : `└ ${getTutorFirstName(session.tutor_name || "")}`}
                </span>
              </div>

              {/* Inline detail view when expanded */}
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

      {/* Navigation hint */}
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

/**
 * Get status text for terminal display (matches GUI terminology)
 */
function getShortStatus(status: string): string {
  switch (status) {
    case "Attended":
      return "Attended";
    case "Attended (Make-up)":
      return "Attended(MU)";
    case "Attended (Trial)":
      return "Attended(T)";
    case "Scheduled":
      return "Scheduled";
    case "Trial Class":
      return "Trial";
    case "Make-up Class":
      return "Make-up";
    case "No Show":
      return "No Show";
    case "Cancelled":
      return "Cancelled";
    default:
      if (status.includes("Pending Make-up")) return "Pending MU";
      if (status.includes("Make-up Booked")) return "MU Booked";
      return status.slice(0, 10);
  }
}

export default ZenSessionList;
