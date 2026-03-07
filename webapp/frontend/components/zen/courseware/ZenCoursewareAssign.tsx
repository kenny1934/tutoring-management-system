"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { sessionsAPI } from "@/lib/api";
import { updateSessionInCache } from "@/lib/session-cache";
import { setZenStatus } from "@/components/zen/ZenStatusBar";
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

export function ZenCoursewareAssign({
  target,
  onClose,
  onAssigned,
}: ZenCoursewareAssignProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cursor, setCursor] = useState(0);
  const [exerciseType, setExerciseType] = useState<ExerciseType>("CW");
  const [isAssigning, setIsAssigning] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch recent sessions
  useEffect(() => {
    const fetchSessions = async () => {
      setIsLoading(true);
      try {
        const today = new Date();
        const fromDate = new Date(today);
        fromDate.setDate(fromDate.getDate() - 7);

        const toDate = new Date(today);
        toDate.setDate(toDate.getDate() + 1);

        const data = await sessionsAPI.getAll({
          from_date: fromDate.toISOString().split("T")[0],
          to_date: toDate.toISOString().split("T")[0],
          limit: 50,
        });

        // Sort: today first, then by date descending
        const sorted = [...data].sort((a, b) => {
          const dateA = new Date(a.session_date + "T" + (a.time_slot || "00:00"));
          const dateB = new Date(b.session_date + "T" + (b.time_slot || "00:00"));
          return dateB.getTime() - dateA.getTime();
        });

        setSessions(sorted);
      } catch {
        setZenStatus("Failed to load sessions", "error");
      } finally {
        setIsLoading(false);
      }
    };
    fetchSessions();
  }, []);

  // Auto-scroll
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const selected = container.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [cursor]);

  const handleAssign = useCallback(async () => {
    const session = sessions[cursor];
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
  }, [sessions, cursor, exerciseType, target, isAssigning, onAssigned, onClose]);

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          e.stopImmediatePropagation();
          setCursor((prev) => Math.min(prev + 1, sessions.length - 1));
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          e.stopImmediatePropagation();
          setCursor((prev) => Math.max(prev - 1, 0));
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
  }, [sessions, cursor, handleAssign, onClose]);

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

      {/* Session list header */}
      <div
        style={{
          display: "flex",
          padding: "2px 0",
          fontSize: "10px",
          color: "var(--zen-dim)",
          borderBottom: "1px solid var(--zen-border)",
          gap: "8px",
        }}
      >
        <span style={{ width: "80px" }}>DATE</span>
        <span style={{ width: "50px" }}>TIME</span>
        <span style={{ flex: 1 }}>STUDENT</span>
        <span style={{ width: "40px" }}>GRADE</span>
      </div>

      {/* Session list */}
      <div ref={listRef} style={{ flex: 1, overflowY: "auto" }}>
        {isLoading && (
          <div style={{ padding: "16px", textAlign: "center", color: "var(--zen-dim)", fontSize: "12px" }}>
            Loading sessions...
          </div>
        )}

        {!isLoading && sessions.length === 0 && (
          <div style={{ padding: "16px", textAlign: "center", color: "var(--zen-dim)", fontSize: "12px" }}>
            No recent sessions found
          </div>
        )}

        {sessions.map((session, index) => {
          const isSelected = index === cursor;
          return (
            <div
              key={session.id}
              data-selected={isSelected}
              onClick={() => {
                setCursor(index);
                handleAssign();
              }}
              style={{
                display: "flex",
                padding: "3px 0",
                fontSize: "11px",
                gap: "8px",
                cursor: "pointer",
                backgroundColor: isSelected ? "var(--zen-accent)" : "transparent",
                color: isSelected ? "var(--zen-bg)" : "var(--zen-fg)",
              }}
            >
              <span style={{ width: "80px" }}>{session.session_date}</span>
              <span style={{ width: "50px" }}>{session.time_slot?.slice(0, 5) || "—"}</span>
              <span
                style={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {session.student_name}
              </span>
              <span style={{ width: "40px" }}>{session.grade || "—"}</span>
            </div>
          );
        })}
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
        }}
      >
        <span>j/k nav • [c]lasswork / [h]omework • Enter assign</span>
        {isAssigning && <span style={{ color: "var(--zen-warning)" }}>Assigning...</span>}
      </div>
    </div>
  );
}
