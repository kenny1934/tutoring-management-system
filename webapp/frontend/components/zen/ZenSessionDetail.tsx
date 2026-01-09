"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import type { Session, SessionExercise } from "@/types";
import { canBeMarked, getStatusChar, getStatusColor } from "./utils/sessionSorting";
import { openFileFromPathWithFallback, printFileFromPathWithFallback } from "@/lib/file-system";
import { sessionsAPI, api } from "@/lib/api";
import { ZenEditSession } from "./ZenEditSession";
import { ZenExerciseAssign } from "./ZenExerciseAssign";
import { useZenKeyboardFocus, type ZenFocusSection } from "@/contexts/ZenKeyboardFocusContext";

interface ZenSessionDetailProps {
  session: Session;
  onClose: () => void;
  onMark: (sessionId: number, status: string) => void;
  onRefresh?: () => void;
}

/**
 * Inline session detail view shown when pressing Enter on a session
 * Shows all session info and quick action buttons
 *
 * Keyboard shortcuts:
 * - 1: Mark Attended
 * - 2: Mark No Show
 * - 3: Mark Reschedule
 * - 4: Mark Sick Leave
 * - 5: Mark Weather Cancelled
 * - c: Open CW assignment
 * - h: Open HW assignment
 * - e: Edit session (opens GUI modal)
 * - r: Rate session (inline)
 * - o: Open first exercise PDF
 * - p: Print first exercise PDF
 * - y: Copy first exercise path
 * - Esc: Close
 */
export function ZenSessionDetail({
  session,
  onClose,
  onMark,
  onRefresh,
}: ZenSessionDetailProps) {
  const [isMarking, setIsMarking] = useState(false);
  const [isRating, setIsRating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [exerciseAssignType, setExerciseAssignType] = useState<"CW" | "HW" | null>(null);
  const [ratingValue, setRatingValue] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const isActionable = canBeMarked(session);
  const statusChar = getStatusChar(session.session_status);
  const statusColor = getStatusColor(session.session_status);

  // Focus context - set focus to "detail" when mounted, restore on close
  const { focusedSection, setFocusedSection } = useZenKeyboardFocus();
  const previousFocusRef = useRef<ZenFocusSection>(focusedSection);
  const hasSetFocusRef = useRef(false);

  useEffect(() => {
    // Only capture and set focus once on mount
    if (!hasSetFocusRef.current) {
      previousFocusRef.current = focusedSection;
      setFocusedSection("detail");
      hasSetFocusRef.current = true;
    }

    // Restore previous focus when unmounting
    return () => {
      if (previousFocusRef.current && previousFocusRef.current !== "detail") {
        setFocusedSection(previousFocusRef.current);
      } else {
        setFocusedSection("sessions");
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount/unmount

  // Get exercises from session
  const exercises = session.exercises || [];
  const classwork = exercises.filter((e) => e.exercise_type === "CW");
  const homework = exercises.filter((e) => e.exercise_type === "HW");

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if a sub-view is open
      if (isMarking || isRating || isEditing || exerciseAssignType) return;

      // Skip if typing in input
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          e.stopImmediatePropagation();
          onClose();
          break;

        case "1":
          if (isActionable) {
            e.preventDefault();
            e.stopImmediatePropagation();
            handleMark("Attended");
          }
          break;

        case "2":
          if (isActionable) {
            e.preventDefault();
            e.stopImmediatePropagation();
            handleMark("No Show");
          }
          break;

        case "3":
          if (isActionable) {
            e.preventDefault();
            e.stopImmediatePropagation();
            handleMark("Rescheduled - Pending Make-up");
          }
          break;

        case "4":
          if (isActionable) {
            e.preventDefault();
            e.stopImmediatePropagation();
            handleMark("Sick Leave - Pending Make-up");
          }
          break;

        case "5":
          if (isActionable) {
            e.preventDefault();
            e.stopImmediatePropagation();
            handleMark("Weather Cancelled - Pending Make-up");
          }
          break;

        case "c":
        case "C":
          e.preventDefault();
          e.stopImmediatePropagation();
          setExerciseAssignType("CW");
          break;

        case "h":
        case "H":
          e.preventDefault();
          e.stopImmediatePropagation();
          setExerciseAssignType("HW");
          break;

        case "e":
        case "E":
          e.preventDefault();
          e.stopImmediatePropagation();
          setIsEditing(true);
          break;

        case "r":
        case "R":
          e.preventDefault();
          e.stopImmediatePropagation();
          setIsRating(true);
          break;

        case "o":
        case "O":
          e.preventDefault();
          e.stopImmediatePropagation();
          if (exercises.length > 0) {
            handleOpenExercise(exercises[0]);
          }
          break;

        case "p":
        case "P":
          e.preventDefault();
          e.stopImmediatePropagation();
          if (exercises.length > 0) {
            handlePrintExercise(exercises[0]);
          }
          break;

        case "y":
        case "Y":
          e.preventDefault();
          e.stopImmediatePropagation();
          if (exercises.length > 0) {
            handleCopyPath(exercises[0]);
          }
          break;
      }
    };

    // Use capture phase so this handler fires BEFORE ZenLayout's bubble phase handler
    // This ensures 'c' opens CW modal instead of navigating to Courseware page
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [isActionable, isMarking, isRating, isEditing, exerciseAssignType, onClose, exercises]);

  const handleMark = useCallback(
    async (status: string) => {
      setIsMarking(true);
      await onMark(session.id, status);
      setIsMarking(false);
      onClose();
    },
    [session.id, onMark, onClose]
  );

  // Handle rating submission
  const handleRate = useCallback(
    async (rating: number) => {
      try {
        await sessionsAPI.updateSession(session.id, {
          performance_rating: rating.toString(),
        });
        setStatusMessage(`Rating saved: ${rating}/5`);
        setIsRating(false);
        onRefresh?.();
      } catch (error) {
        setStatusMessage("Failed to save rating");
      }
    },
    [session.id, onRefresh]
  );

  // Paperless search callback for fallback when local file access fails
  const searchPaperlessByPath = useCallback(async (searchPath: string): Promise<number | null> => {
    try {
      const response = await api.paperless.search(searchPath, 1, 'all');
      if (response.results.length > 0) {
        return response.results[0].id;
      }
    } catch (error) {
      console.warn('Paperless search failed:', error);
    }
    return null;
  }, []);

  // Exercise operations
  const handleOpenExercise = useCallback(async (exercise: SessionExercise) => {
    const error = await openFileFromPathWithFallback(exercise.pdf_name, searchPaperlessByPath);
    if (error) {
      setStatusMessage(`Failed to open: ${error}`);
    } else {
      setStatusMessage("Opening PDF...");
    }
  }, [searchPaperlessByPath]);

  const handlePrintExercise = useCallback(
    async (exercise: SessionExercise) => {
      const stamp = {
        location: session.location,
        schoolStudentId: session.school_student_id,
        studentName: session.student_name,
        sessionDate: session.session_date,
        sessionTime: session.time_slot,
      };
      const error = await printFileFromPathWithFallback(
        exercise.pdf_name,
        exercise.page_start,
        exercise.page_end,
        undefined,
        stamp,
        searchPaperlessByPath
      );
      if (error) {
        setStatusMessage(`Failed to print: ${error}`);
      } else {
        setStatusMessage("Printing...");
      }
    },
    [session, searchPaperlessByPath]
  );

  const handleCopyPath = useCallback(async (exercise: SessionExercise) => {
    try {
      await navigator.clipboard.writeText(exercise.pdf_name);
      setStatusMessage("Path copied to clipboard");
    } catch {
      setStatusMessage("Failed to copy path");
    }
  }, []);

  // Format page range for display
  const formatPageRange = (exercise: SessionExercise): string => {
    if (exercise.page_start && exercise.page_end) {
      return `p${exercise.page_start}-${exercise.page_end}`;
    }
    if (exercise.page_start) {
      return `p${exercise.page_start}`;
    }
    return "";
  };

  // Get filename from path
  const getFileName = (path: string): string => {
    return path.split("/").pop() || path;
  };

  return (
    <div
      style={{
        margin: "8px 0",
        padding: "12px",
        border: "1px solid var(--zen-accent)",
        backgroundColor: "var(--zen-bg)",
        boxShadow: "0 0 10px var(--zen-accent)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
          paddingBottom: "8px",
          borderBottom: "1px solid var(--zen-border)",
        }}
      >
        <span style={{ color: "var(--zen-accent)", fontWeight: "bold" }}>
          SESSION DETAIL
        </span>
        <span style={{ color: "var(--zen-dim)", fontSize: "11px" }}>
          Press Esc to close
        </span>
      </div>

      {/* Content Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "120px 1fr",
          gap: "4px 16px",
          fontSize: "13px",
        }}
      >
        <span style={{ color: "var(--zen-dim)" }}>Student:</span>
        <span style={{ color: "var(--zen-fg)" }}>
          {session.student_name || "Unknown"}{" "}
          <span style={{ color: "var(--zen-dim)" }}>
            ({session.school_student_id || "—"})
          </span>
        </span>

        <span style={{ color: "var(--zen-dim)" }}>School:</span>
        <span style={{ color: "var(--zen-fg)" }}>{session.school || "—"}</span>

        <span style={{ color: "var(--zen-dim)" }}>Grade:</span>
        <span style={{ color: "var(--zen-fg)" }}>
          {session.grade || "—"}
          {session.lang_stream || ""}
        </span>

        <span style={{ color: "var(--zen-dim)" }}>Tutor:</span>
        <span style={{ color: "var(--zen-fg)" }}>{session.tutor_name || "—"}</span>

        <span style={{ color: "var(--zen-dim)" }}>Time:</span>
        <span style={{ color: "var(--zen-fg)" }}>{session.time_slot || "—"}</span>

        <span style={{ color: "var(--zen-dim)" }}>Location:</span>
        <span style={{ color: "var(--zen-fg)" }}>{session.location || "—"}</span>

        <span style={{ color: "var(--zen-dim)" }}>Status:</span>
        <span style={{ color: `var(--zen-${statusColor})` }}>
          {statusChar} {session.session_status}
        </span>

        <span style={{ color: "var(--zen-dim)" }}>Payment:</span>
        <span
          style={{
            color:
              session.financial_status === "Paid"
                ? "var(--zen-success)"
                : "var(--zen-error)",
          }}
        >
          {session.financial_status || "Unknown"}
        </span>

        {session.notes && (
          <>
            <span style={{ color: "var(--zen-dim)" }}>Notes:</span>
            <span style={{ color: "var(--zen-fg)" }}>{session.notes}</span>
          </>
        )}

        {session.performance_rating && (
          <>
            <span style={{ color: "var(--zen-dim)" }}>Rating:</span>
            <span style={{ color: "var(--zen-accent)" }}>
              {"★".repeat(parseInt(session.performance_rating) || 0)}
              {"☆".repeat(5 - (parseInt(session.performance_rating) || 0))}
            </span>
          </>
        )}
      </div>

      {/* Exercises Section */}
      {exercises.length > 0 && (
        <div
          style={{
            marginTop: "16px",
            paddingTop: "12px",
            borderTop: "1px solid var(--zen-border)",
          }}
        >
          <div
            style={{
              color: "var(--zen-accent)",
              fontWeight: "bold",
              marginBottom: "8px",
              fontSize: "12px",
            }}
          >
            EXERCISES
          </div>
          {classwork.map((ex, idx) => (
            <ExerciseRow
              key={`cw-${idx}`}
              exercise={ex}
              type="CW"
              onOpen={handleOpenExercise}
              onPrint={handlePrintExercise}
              onCopy={handleCopyPath}
              formatPageRange={formatPageRange}
              getFileName={getFileName}
            />
          ))}
          {homework.map((ex, idx) => (
            <ExerciseRow
              key={`hw-${idx}`}
              exercise={ex}
              type="HW"
              onOpen={handleOpenExercise}
              onPrint={handlePrintExercise}
              onCopy={handleCopyPath}
              formatPageRange={formatPageRange}
              getFileName={getFileName}
            />
          ))}
        </div>
      )}

      {/* Linked Sessions */}
      {(session.make_up_for || session.rescheduled_to) && (
        <div
          style={{
            marginTop: "16px",
            paddingTop: "12px",
            borderTop: "1px solid var(--zen-border)",
          }}
        >
          <div
            style={{
              color: "var(--zen-accent)",
              fontWeight: "bold",
              marginBottom: "8px",
              fontSize: "12px",
            }}
          >
            LINKED SESSIONS
          </div>
          {session.make_up_for && (
            <div style={{ fontSize: "12px", marginBottom: "4px" }}>
              <span style={{ color: "var(--zen-dim)" }}>Original: </span>
              <span style={{ color: "var(--zen-fg)" }}>
                #{session.make_up_for.id} ({session.make_up_for.session_date}{session.make_up_for.time_slot ? ` ${session.make_up_for.time_slot}` : ''})
              </span>
              <span style={{ color: "var(--zen-dim)", marginLeft: "8px" }}>
                {session.make_up_for.session_status}
              </span>
            </div>
          )}
          {session.rescheduled_to && (
            <div style={{ fontSize: "12px", marginBottom: "4px" }}>
              <span style={{ color: "var(--zen-dim)" }}>Make-up: </span>
              <span style={{ color: "var(--zen-fg)" }}>
                #{session.rescheduled_to.id} ({session.rescheduled_to.session_date}{session.rescheduled_to.time_slot ? ` ${session.rescheduled_to.time_slot}` : ''})
              </span>
              <span style={{ color: "var(--zen-dim)", marginLeft: "8px" }}>
                {session.rescheduled_to.session_status}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Rating UI */}
      {isRating && (
        <div
          style={{
            marginTop: "16px",
            paddingTop: "12px",
            borderTop: "1px solid var(--zen-border)",
          }}
        >
          <div
            style={{
              color: "var(--zen-accent)",
              marginBottom: "8px",
              fontSize: "12px",
            }}
          >
            RATE SESSION (1-5)
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => handleRate(n)}
                style={{
                  padding: "4px 12px",
                  backgroundColor: "transparent",
                  border: "1px solid var(--zen-accent)",
                  color: "var(--zen-accent)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "12px",
                }}
              >
                {n}★
              </button>
            ))}
            <button
              onClick={() => setIsRating(false)}
              style={{
                padding: "4px 12px",
                backgroundColor: "transparent",
                border: "1px solid var(--zen-dim)",
                color: "var(--zen-dim)",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "12px",
                marginLeft: "auto",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Status Message */}
      {statusMessage && (
        <div
          style={{
            marginTop: "8px",
            padding: "4px 8px",
            backgroundColor: "var(--zen-selection)",
            color: "var(--zen-fg)",
            fontSize: "11px",
          }}
        >
          {statusMessage}
        </div>
      )}

      {/* Action Buttons - Status Marking */}
      {isActionable && !isRating && (
        <div
          style={{
            marginTop: "16px",
            paddingTop: "12px",
            borderTop: "1px solid var(--zen-border)",
          }}
        >
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <ActionButton
              label="[1] Attended"
              color="success"
              disabled={isMarking}
              onClick={() => handleMark("Attended")}
            />
            <ActionButton
              label="[2] No Show"
              color="error"
              disabled={isMarking}
              onClick={() => handleMark("No Show")}
            />
            <ActionButton
              label="[3] Reschedule"
              color="warning"
              disabled={isMarking}
              onClick={() => handleMark("Rescheduled - Pending Make-up")}
            />
            <ActionButton
              label="[4] Sick"
              color="warning"
              disabled={isMarking}
              onClick={() => handleMark("Sick Leave - Pending Make-up")}
            />
            <ActionButton
              label="[5] Weather"
              color="warning"
              disabled={isMarking}
              onClick={() => handleMark("Weather Cancelled - Pending Make-up")}
            />
          </div>
        </div>
      )}

      {/* Action Buttons - Exercise & Other */}
      {!isRating && (
        <div
          style={{
            marginTop: "8px",
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          <ActionButton
            label="[C] CW"
            color="accent"
            disabled={false}
            onClick={() => setExerciseAssignType("CW")}
          />
          <ActionButton
            label="[H] HW"
            color="accent"
            disabled={false}
            onClick={() => setExerciseAssignType("HW")}
          />
          <ActionButton
            label="[E] Edit"
            color="dim"
            disabled={false}
            onClick={() => setIsEditing(true)}
          />
          <ActionButton
            label="[R] Rate"
            color="dim"
            disabled={false}
            onClick={() => setIsRating(true)}
          />
          <span style={{ marginLeft: "auto", color: "var(--zen-dim)", fontSize: "11px" }}>
            {isMarking ? "Processing..." : ""}
          </span>
        </div>
      )}

      {/* Message for non-actionable sessions (buttons already shown above) */}
      {!isActionable && !isRating && !isEditing && !exerciseAssignType && (
        <div
          style={{
            marginTop: "8px",
            color: "var(--zen-dim)",
            fontSize: "11px",
          }}
        >
          Status marking not available ({session.session_status})
        </div>
      )}

      {/* Edit Session Modal */}
      {isEditing && (
        <ZenEditSession
          session={session}
          onClose={() => setIsEditing(false)}
          onSave={() => {
            setIsEditing(false);
            onRefresh?.();
          }}
        />
      )}

      {/* Exercise Assignment Modal */}
      {exerciseAssignType && (
        <ZenExerciseAssign
          session={session}
          exerciseType={exerciseAssignType}
          onClose={() => setExerciseAssignType(null)}
          onAssigned={() => {
            setExerciseAssignType(null);
            onRefresh?.();
          }}
        />
      )}
    </div>
  );
}

function ActionButton({
  label,
  color,
  disabled,
  onClick,
}: {
  label: string;
  color: "success" | "error" | "warning" | "accent" | "dim";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "4px 12px",
        backgroundColor: "transparent",
        border: `1px solid var(--zen-${color})`,
        color: `var(--zen-${color})`,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        fontFamily: "inherit",
        fontSize: "12px",
      }}
    >
      {label}
    </button>
  );
}

function ExerciseRow({
  exercise,
  type,
  onOpen,
  onPrint,
  onCopy,
  formatPageRange,
  getFileName,
}: {
  exercise: SessionExercise;
  type: "CW" | "HW";
  onOpen: (ex: SessionExercise) => void;
  onPrint: (ex: SessionExercise) => void;
  onCopy: (ex: SessionExercise) => void;
  formatPageRange: (ex: SessionExercise) => string;
  getFileName: (path: string) => string;
}) {
  const pageRange = formatPageRange(exercise);
  const fileName = getFileName(exercise.pdf_name);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "12px",
        marginBottom: "4px",
        padding: "4px",
        backgroundColor: "var(--zen-selection)",
      }}
    >
      <span
        style={{
          color: type === "CW" ? "var(--zen-error)" : "var(--zen-accent)",
          fontWeight: "bold",
          minWidth: "24px",
        }}
      >
        {type}:
      </span>
      <span
        style={{
          flex: 1,
          color: "var(--zen-fg)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={exercise.pdf_name}
      >
        {fileName}
        {pageRange && (
          <span style={{ color: "var(--zen-dim)", marginLeft: "4px" }}>
            ({pageRange})
          </span>
        )}
      </span>
      <button
        onClick={() => onOpen(exercise)}
        style={{
          padding: "2px 6px",
          backgroundColor: "transparent",
          border: "1px solid var(--zen-dim)",
          color: "var(--zen-dim)",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: "10px",
        }}
        title="Open PDF"
      >
        O
      </button>
      <button
        onClick={() => onPrint(exercise)}
        style={{
          padding: "2px 6px",
          backgroundColor: "transparent",
          border: "1px solid var(--zen-dim)",
          color: "var(--zen-dim)",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: "10px",
        }}
        title="Print"
      >
        P
      </button>
      <button
        onClick={() => onCopy(exercise)}
        style={{
          padding: "2px 6px",
          backgroundColor: "transparent",
          border: "1px solid var(--zen-dim)",
          color: "var(--zen-dim)",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: "10px",
        }}
        title="Copy path"
      >
        Y
      </button>
    </div>
  );
}

export default ZenSessionDetail;
