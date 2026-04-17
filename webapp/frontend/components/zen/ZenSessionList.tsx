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
  getShortStatus,
  buildBulkDetails,
  QUICK_MARK_STATUS_MAP,
  type GroupedSessionsResult,
} from "./utils/sessionSorting";
import { ZenSessionDetail } from "./ZenSessionDetail";
import { ZenConfirmDialog } from "./ZenConfirmDialog";
import { useZenKeyboardFocus } from "@/contexts/ZenKeyboardFocusContext";
import { isCountableSession } from "@/lib/session-status";
import { setZenStatus } from "./ZenStatusBar";
import { LessonNumberBadge } from "@/components/sessions/LessonNumberBadge";

interface ZenSessionListProps {
  sessions: Session[];
  selectedIds: Set<number>;
  cursorIndex: number;
  onToggleSelect: (id: number) => void;
  onCursorMove: (newIndex: number) => void;
  onAction?: (action: string, sessionIds: number[]) => void;
  onQuickMark?: (sessionId: number, status: string) => void;
  onBulkMark?: (sessionIds: number[], status: string) => void;
  markingSessionIds?: Set<number>;
  showStats?: boolean;
  onLessonMode?: (session: Session) => void;
  onLessonWideMode?: (timeSlot: string, sessions: Session[]) => void;
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
  onBulkMark,
  markingSessionIds,
  showStats = true,
  onLessonMode,
  onLessonWideMode,
}: ZenSessionListProps) {
  // Track which session has detail view expanded
  const [expandedSessionId, setExpandedSessionId] = useState<number | null>(null);
  // Confirm dialog state for bulk marking
  const [confirmAction, setConfirmAction] = useState<{ ids: number[]; status: string; label: string } | null>(null);
  // Buffer for gg (jump to first) two-key combo
  const gBufferRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

        // Quick action keys — bulk-aware when sessions are selected
        case "1":
        case "2":
        case "3":
        case "4":
        case "5": {
          e.preventDefault();
          const action = QUICK_MARK_STATUS_MAP[e.key];
          if (!action) break;

          if (selectedIds.size > 0 && onBulkMark) {
            // Bulk mode: collect all selected sessions that can be marked
            const actionableIds = flatSessions
              .filter((s) => selectedIds.has(s.id) && canBeMarked(s))
              .map((s) => s.id);
            if (actionableIds.length > 0) {
              setConfirmAction({ ids: actionableIds, status: action.status, label: action.label });
            }
          } else if (currentSession && canBeMarked(currentSession) && onQuickMark) {
            // Single mode: mark cursor session
            onQuickMark(currentSession.id, action.status);
          }
          break;
        }

        case "l":
        case "L":
          if (currentSession) {
            e.preventDefault();
            if (e.shiftKey && onLessonWideMode) {
              // Shift+L: lesson wide mode for the time slot
              const group = groupedSessions.find((g) =>
                g.sessions.some((s) => s.id === currentSession.id)
              );
              if (group) {
                onLessonWideMode(group.timeSlot, group.sessions);
                setZenStatus(`Lesson wide: ${group.timeSlot}`, "info");
              }
            } else if (!e.shiftKey && onLessonMode) {
              if (currentSession.exercises?.length) {
                onLessonMode(currentSession);
                setZenStatus(`Lesson: ${currentSession.student_name}`, "info");
              } else {
                setZenStatus("No exercises assigned", "warning");
              }
            }
          }
          break;

        case "G":
          // Shift+G: jump to last session
          e.preventDefault();
          if (flatSessions.length > 0) {
            onCursorMove(flatSessions.length - 1);
          }
          break;

        case "g":
          // gg: jump to first session (two-key combo with timeout)
          e.preventDefault();
          if (gBufferRef.current) {
            // Second g — jump to first
            clearTimeout(gBufferRef.current);
            gBufferRef.current = null;
            onCursorMove(0);
          } else {
            // First g — buffer and wait
            gBufferRef.current = setTimeout(() => {
              gBufferRef.current = null;
            }, 500);
          }
          break;
      }
    },
    [cursorIndex, flatSessions, currentSession, selectedIds, onToggleSelect, onCursorMove, onQuickMark, onBulkMark, expandedSessionId, isFocused, groupedSessions, onLessonMode, onLessonWideMode]
  );

  // Register global keyboard handler
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (gBufferRef.current) {
        clearTimeout(gBufferRef.current);
        gBufferRef.current = null;
      }
    };
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
        No sessions
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
            {flatSessions.length > 0 && (
              <span style={{ color: "var(--zen-accent)", marginLeft: "4px" }}>
                ({cursorIndex + 1}/{flatSessions.length})
              </span>
            )}
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
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>
              {group.timeSlot}{" "}
              <span style={{ color: "var(--zen-dim)", fontWeight: "normal" }}>
                ({group.sessions.filter(isCountableSession).length} session{group.sessions.filter(isCountableSession).length !== 1 ? "s" : ""})
              </span>
            </span>
            {onLessonWideMode && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onLessonWideMode(group.timeSlot, group.sessions);
                }}
                style={{
                  background: "none",
                  border: "1px solid var(--zen-border)",
                  color: "var(--zen-dim)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "10px",
                  padding: "1px 6px",
                }}
                title="Lesson wide mode (Shift+L)"
              >
                [L]esson
              </button>
            )}
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
            const isMarking = markingSessionIds?.has(session.id) ?? false;

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
                    minWidth: "28px",
                    flexShrink: 0,
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
                  <LessonNumberBadge lessonNumber={session.lesson_number} size="xs" className="ml-1" />
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
                    color: isMarking
                      ? "var(--zen-dim)"
                      : `var(--zen-${statusColor})`,
                    textShadow:
                      !isMarking &&
                      (statusColor === "success" || statusColor === "accent")
                        ? "var(--zen-glow)"
                        : "none",
                  }}
                >
                  {isMarking ? "○" : statusChar}
                </span>

                {/* Status text */}
                <span
                  style={{
                    color: isMarking
                      ? "var(--zen-dim)"
                      : `var(--zen-${statusColor})`,
                    fontSize: "11px",
                    minWidth: "80px",
                  }}
                >
                  {isMarking
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
                  onLessonMode={onLessonMode}
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
        {selectedIds.size > 0 ? (
          <>
            <span style={{ color: "var(--zen-fg)" }}>1</span>-<span style={{ color: "var(--zen-fg)" }}>5</span> mark selected •{" "}
            <span style={{ color: "var(--zen-fg)" }}>Esc</span> clear selection •{" "}
            <span style={{ color: "var(--zen-fg)" }}>Space</span> toggle •{" "}
            <span style={{ color: "var(--zen-fg)" }}>a</span> select all
          </>
        ) : (
          <>
            <span style={{ color: "var(--zen-fg)" }}>j/k</span> navigate •{" "}
            <span style={{ color: "var(--zen-fg)" }}>gg/G</span> first/last •{" "}
            <span style={{ color: "var(--zen-fg)" }}>Enter</span> detail •{" "}
            <span style={{ color: "var(--zen-fg)" }}>Space</span> select •{" "}
            <span style={{ color: "var(--zen-fg)" }}>1</span>=Attended{" "}
            <span style={{ color: "var(--zen-fg)" }}>2</span>=No Show{" "}
            <span style={{ color: "var(--zen-fg)" }}>3</span>=Reschedule{" "}
            <span style={{ color: "var(--zen-fg)" }}>4</span>=Sick{" "}
            <span style={{ color: "var(--zen-fg)" }}>5</span>=Weather •{" "}
            <span style={{ color: "var(--zen-fg)" }}>L</span>=lesson •{" "}
            <span style={{ color: "var(--zen-fg)" }}>a</span> all
          </>
        )}
      </div>

      {/* Bulk mark confirmation dialog */}
      {confirmAction && (
        <ZenConfirmDialog
          title={`Mark ${confirmAction.ids.length} session${confirmAction.ids.length !== 1 ? "s" : ""} as ${confirmAction.label}?`}
          details={buildBulkDetails(confirmAction.ids, flatSessions)}
          onConfirm={() => {
            onBulkMark?.(confirmAction.ids, confirmAction.status);
            setConfirmAction(null);
          }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}

export default ZenSessionList;
