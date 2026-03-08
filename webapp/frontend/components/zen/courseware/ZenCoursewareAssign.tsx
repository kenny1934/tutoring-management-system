"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSessions } from "@/lib/hooks";
import { sessionsAPI } from "@/lib/api";
import { updateSessionInCache } from "@/lib/session-cache";
import { setZenStatus } from "@/components/zen/ZenStatusBar";
import { toDateString, getWeekStartStr, getWeekEndStr, getWeekDateStrings } from "@/lib/calendar-utils";
import { DAY_NAMES } from "@/lib/constants";
import {
  groupAndSortSessions,
  getStatusChar,
  getStatusColor,
  getGradeColor,
  getTutorFirstName,
  getShortStatus,
} from "@/components/zen/utils/sessionSorting";
import type { Session } from "@/types";

interface AssignTarget {
  path: string;
  title: string;
  pageStart?: number;
  pageEnd?: number;
}

interface ZenCoursewareAssignProps {
  target: AssignTarget;
  onClose: () => void;
  onAssigned?: () => void;
}

type ExerciseType = "CW" | "HW";

function formatDayDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()}`;
}

export function ZenCoursewareAssign({
  target,
  onClose,
  onAssigned,
}: ZenCoursewareAssignProps) {
  const today = useMemo(() => toDateString(new Date()), []);
  const [weekStart, setWeekStart] = useState(() => getWeekStartStr(today));
  const weekEnd = useMemo(() => getWeekEndStr(weekStart), [weekStart]);
  const weekDates = useMemo(() => getWeekDateStrings(weekStart), [weekStart]);

  const [dateIndex, setDateIndex] = useState(() => {
    const idx = weekDates.indexOf(today);
    return idx >= 0 ? idx : 0;
  });
  const selectedDate = weekDates[dateIndex] || weekDates[0];

  const [cursor, setCursor] = useState(0);
  const [exerciseType, setExerciseType] = useState<ExerciseType>("CW");
  const [isAssigning, setIsAssigning] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch sessions for the week
  const { data: allSessions, isLoading } = useSessions({
    from_date: weekStart,
    to_date: weekEnd,
    limit: 2000,
  });

  // Group sessions by date
  const sessionsByDate = useMemo(() => {
    const map = new Map<string, Session[]>();
    weekDates.forEach((d) => map.set(d, []));
    (allSessions || []).forEach((s) => {
      const existing = map.get(s.session_date);
      if (existing) existing.push(s);
    });
    return map;
  }, [allSessions, weekDates]);

  // Sessions for selected date, grouped by time slot
  const { groupedSessions, flatSessions } = useMemo(() => {
    const dateSessions = sessionsByDate.get(selectedDate) || [];
    return groupAndSortSessions(dateSessions);
  }, [sessionsByDate, selectedDate]);

  // Reset cursor when date changes
  useEffect(() => {
    setCursor(0);
  }, [selectedDate]);

  // Auto-scroll
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const selected = container.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [cursor]);

  const handleAssign = useCallback(async () => {
    const session = flatSessions[cursor];
    if (!session || isAssigning) return;

    setIsAssigning(true);
    try {
      const exercises = [
        {
          exercise_type: exerciseType === "CW" ? "Classwork" : "Homework",
          pdf_name: target.path,
          page_start: target.pageStart ?? null,
          page_end: target.pageEnd ?? null,
          remarks: null,
        },
      ];

      const updatedSession = await sessionsAPI.saveExercises(
        session.id,
        exerciseType,
        exercises,
        { append: true }
      );
      updateSessionInCache(updatedSession);
      setZenStatus(`Assigned "${target.title}" to ${session.student_name}`, "success");
      onAssigned?.();
      onClose();
    } catch {
      setZenStatus("Assignment failed", "error");
      setIsAssigning(false);
    }
  }, [flatSessions, cursor, exerciseType, target, isAssigning, onAssigned, onClose]);

  // Week navigation
  const goWeek = useCallback((direction: number) => {
    setWeekStart((prev) => {
      const d = new Date(prev + "T00:00:00");
      d.setDate(d.getDate() + direction * 7);
      return toDateString(d);
    });
    setDateIndex(direction > 0 ? 0 : 6);
  }, []);

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable) return;

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          e.stopImmediatePropagation();
          setCursor((prev) => Math.min(prev + 1, flatSessions.length - 1));
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          e.stopImmediatePropagation();
          setCursor((prev) => Math.max(prev - 1, 0));
          break;
        case "[":
          e.preventDefault();
          e.stopImmediatePropagation();
          setDateIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "]":
          e.preventDefault();
          e.stopImmediatePropagation();
          setDateIndex((prev) => Math.min(prev + 1, 6));
          break;
        case "{":
          e.preventDefault();
          e.stopImmediatePropagation();
          goWeek(-1);
          break;
        case "}":
          e.preventDefault();
          e.stopImmediatePropagation();
          goWeek(1);
          break;
        case "c":
          e.preventDefault();
          e.stopImmediatePropagation();
          setExerciseType("CW");
          break;
        case "h":
          e.preventDefault();
          e.stopImmediatePropagation();
          setExerciseType("HW");
          break;
        case "Enter":
          e.preventDefault();
          e.stopImmediatePropagation();
          handleAssign();
          break;
        case "Escape":
          e.preventDefault();
          e.stopImmediatePropagation();
          onClose();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [flatSessions, cursor, handleAssign, onClose, goWeek]);

  let flatIndex = -1;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        padding: "16px",
      }}
    >
      {/* Header */}
      <div
        style={{
          borderBottom: "1px solid var(--zen-border)",
          paddingBottom: "8px",
          marginBottom: "8px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "var(--zen-accent)", fontWeight: "bold", fontSize: "12px" }}>
            ASSIGN COURSEWARE
          </span>
          <span style={{ color: "var(--zen-dim)", fontSize: "10px" }}>Esc to cancel</span>
        </div>
        <div
          style={{
            color: "var(--zen-fg)",
            fontSize: "11px",
            marginTop: "4px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          File: {target.title}
          {(target.pageStart || target.pageEnd) && (
            <span style={{ color: "var(--zen-dim)" }}>
              {" "}(p.{target.pageStart || "1"}-{target.pageEnd || "end"})
            </span>
          )}
        </div>
      </div>

      {/* Exercise type toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "8px",
          fontSize: "11px",
          flexShrink: 0,
        }}
      >
        <span style={{ color: "var(--zen-dim)" }}>Type:</span>
        <button
          onClick={() => setExerciseType("CW")}
          style={{
            padding: "2px 8px",
            backgroundColor: exerciseType === "CW" ? "var(--zen-accent)" : "transparent",
            color: exerciseType === "CW" ? "var(--zen-bg)" : "var(--zen-fg)",
            border: "1px solid var(--zen-border)",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "11px",
          }}
        >
          [c]lasswork
        </button>
        <button
          onClick={() => setExerciseType("HW")}
          style={{
            padding: "2px 8px",
            backgroundColor: exerciseType === "HW" ? "var(--zen-accent)" : "transparent",
            color: exerciseType === "HW" ? "var(--zen-bg)" : "var(--zen-fg)",
            border: "1px solid var(--zen-border)",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "11px",
          }}
        >
          [h]omework
        </button>
      </div>

      {/* Date tabs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          marginBottom: "8px",
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => goWeek(-1)}
          style={{
            padding: "2px 6px",
            backgroundColor: "transparent",
            border: "1px solid var(--zen-border)",
            color: "var(--zen-fg)",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "10px",
          }}
          title="Previous week"
        >
          {"<"}
        </button>

        {weekDates.map((date, i) => {
          const count = (sessionsByDate.get(date) || []).length;
          const isActive = i === dateIndex;
          const isToday = date === today;
          const hasSessions = count > 0;

          return (
            <button
              key={date}
              onClick={() => setDateIndex(i)}
              style={{
                flex: 1,
                padding: "3px 2px",
                backgroundColor: isActive ? "var(--zen-accent)" : "transparent",
                color: isActive
                  ? "var(--zen-bg)"
                  : hasSessions
                  ? "var(--zen-fg)"
                  : "var(--zen-dim)",
                border: isToday && !isActive
                  ? "1px solid var(--zen-accent)"
                  : "1px solid var(--zen-border)",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "10px",
                textAlign: "center",
                opacity: hasSessions ? 1 : 0.5,
              }}
            >
              {isToday && !isActive ? "★" : ""}
              {formatDayDate(date)}
              {hasSessions ? ` (${count})` : ""}
            </button>
          );
        })}

        <button
          onClick={() => goWeek(1)}
          style={{
            padding: "2px 6px",
            backgroundColor: "transparent",
            border: "1px solid var(--zen-border)",
            color: "var(--zen-fg)",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "10px",
          }}
          title="Next week"
        >
          {">"}
        </button>
      </div>

      {/* Session list */}
      <div ref={listRef} style={{ flex: 1, overflowY: "auto" }}>
        {isLoading && (
          <div style={{ padding: "16px", textAlign: "center", color: "var(--zen-dim)", fontSize: "12px" }}>
            Loading sessions...
          </div>
        )}

        {!isLoading && flatSessions.length === 0 && (
          <div style={{ padding: "16px", textAlign: "center", color: "var(--zen-dim)", fontSize: "12px" }}>
            No sessions on {formatDayDate(selectedDate)}
          </div>
        )}

        {!isLoading &&
          groupedSessions.map((slotGroup) => (
            <div key={slotGroup.timeSlot} style={{ marginBottom: "8px" }}>
              {/* Time slot header */}
              <div
                style={{
                  color: "var(--zen-accent)",
                  fontSize: "11px",
                  marginBottom: "2px",
                  paddingLeft: "4px",
                }}
              >
                {slotGroup.timeSlot}
              </div>
              <div
                style={{
                  color: "var(--zen-border)",
                  marginBottom: "2px",
                  letterSpacing: "0.5px",
                  fontSize: "10px",
                }}
              >
                {"─".repeat(40)}
              </div>

              {/* Session rows */}
              {slotGroup.sessions.map((session) => {
                flatIndex++;
                const rowIndex = flatIndex;
                const isAtCursor = rowIndex === cursor;
                const statusColor = getStatusColor(session.session_status);
                const gradeColor = getGradeColor(session.grade, session.lang_stream);
                const statusChar = getStatusChar(session.session_status);

                return (
                  <div
                    key={session.id}
                    data-selected={isAtCursor}
                    onClick={() => {
                      setCursor(rowIndex);
                      handleAssign();
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "2px 4px",
                      cursor: "pointer",
                      backgroundColor: isAtCursor ? "var(--zen-selection)" : "transparent",
                      borderLeft: isAtCursor
                        ? "2px solid var(--zen-accent)"
                        : "2px solid transparent",
                      fontSize: "11px",
                    }}
                  >
                    {/* Cursor indicator */}
                    <span
                      style={{
                        width: "10px",
                        color: isAtCursor ? "var(--zen-accent)" : "transparent",
                        textShadow: isAtCursor ? "var(--zen-glow)" : "none",
                      }}
                    >
                      {isAtCursor ? ">" : " "}
                    </span>

                    {/* Status char */}
                    <span
                      style={{
                        width: "16px",
                        textAlign: "center",
                        color: `var(--zen-${statusColor})`,
                      }}
                    >
                      {statusChar}
                    </span>

                    {/* Student name */}
                    <span
                      style={{
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: "var(--zen-fg)",
                      }}
                    >
                      {session.student_name || "Unknown"}
                    </span>

                    {/* Grade badge */}
                    <span
                      style={{
                        width: "36px",
                        padding: "0 4px",
                        backgroundColor: gradeColor + "40",
                        color: "var(--zen-fg)",
                        borderRadius: "2px",
                        textAlign: "center",
                        fontSize: "10px",
                      }}
                    >
                      {session.grade || "—"}
                      {session.lang_stream || ""}
                    </span>

                    {/* Short status */}
                    <span
                      style={{
                        width: "50px",
                        color: `var(--zen-${statusColor})`,
                        fontSize: "10px",
                      }}
                    >
                      {getShortStatus(session.session_status, true)}
                    </span>

                    {/* Tutor */}
                    <span
                      style={{
                        width: "60px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: "var(--zen-dim)",
                        fontSize: "10px",
                      }}
                    >
                      {session.tutor_name
                        ? getTutorFirstName(session.tutor_name)
                        : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
      </div>

      {/* Footer */}
      <div
        style={{
          paddingTop: "8px",
          borderTop: "1px solid var(--zen-border)",
          fontSize: "10px",
          color: "var(--zen-dim)",
          display: "flex",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span>j/k nav • [/] day • {"{/}"} week • [c]w/[h]w • Enter assign</span>
        {isAssigning && <span style={{ color: "var(--zen-warning)" }}>Assigning...</span>}
      </div>
    </div>
  );
}
