"use client";

import { useEffect, useCallback, useRef } from "react";
import type { Student } from "@/types";
import { getGradeColor } from "@/lib/constants";

interface ZenStudentListProps {
  students: Student[];
  cursorIndex: number;
  onCursorMove: (newIndex: number) => void;
  onSelect: (student: Student) => void;
  focusSection?: string;
  isFocused: boolean;
  onFocus: () => void;
}

/**
 * Terminal-style student list with vim-like navigation
 *
 * Keyboard controls (when focused):
 * - j/↓: Move cursor down
 * - k/↑: Move cursor up
 * - gg: Go to first
 * - G: Go to last
 * - Enter: Select/view student
 */
export function ZenStudentList({
  students,
  cursorIndex,
  onCursorMove,
  onSelect,
  isFocused,
  onFocus,
}: ZenStudentListProps) {
  const cursorRowRef = useRef<HTMLDivElement>(null);
  const gPressedRef = useRef(false);

  const currentStudent = students[cursorIndex];

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
          if (cursorIndex < students.length - 1) {
            onCursorMove(cursorIndex + 1);
          }
          gPressedRef.current = false;
          break;

        case "k":
        case "ArrowUp":
          e.preventDefault();
          if (cursorIndex > 0) {
            onCursorMove(cursorIndex - 1);
          }
          gPressedRef.current = false;
          break;

        case "g":
          if (gPressedRef.current) {
            // gg -> go to first
            e.preventDefault();
            onCursorMove(0);
            gPressedRef.current = false;
          } else {
            gPressedRef.current = true;
            setTimeout(() => {
              gPressedRef.current = false;
            }, 500);
          }
          break;

        case "G":
          e.preventDefault();
          onCursorMove(students.length - 1);
          gPressedRef.current = false;
          break;

        case "Home":
          e.preventDefault();
          onCursorMove(0);
          break;

        case "End":
          e.preventDefault();
          onCursorMove(students.length - 1);
          break;

        case "Enter":
          e.preventDefault();
          if (currentStudent) {
            onSelect(currentStudent);
          }
          break;

        default:
          gPressedRef.current = false;
      }
    },
    [cursorIndex, students.length, currentStudent, onCursorMove, onSelect, isFocused]
  );

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

  if (students.length === 0) {
    return (
      <div style={{ color: "var(--zen-dim)" }}>
        No students found
      </div>
    );
  }

  return (
    <div
      className="zen-student-list"
      onClick={onFocus}
      style={{
        outline: isFocused ? "1px solid var(--zen-accent)" : "1px solid transparent",
        outlineOffset: "4px",
        borderRadius: "4px",
        transition: "outline-color 0.15s ease",
      }}
    >
      {students.map((student, index) => {
        const isAtCursor = index === cursorIndex;
        const gradeColor = getGradeColor(student.grade, student.lang_stream);

        return (
          <div
            key={student.id}
            ref={isAtCursor ? cursorRowRef : undefined}
            onClick={(e) => {
              e.stopPropagation();
              onFocus();
              onCursorMove(index);
            }}
            onDoubleClick={() => onSelect(student)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "3px 4px",
              cursor: "pointer",
              backgroundColor: isAtCursor ? "var(--zen-selection)" : "transparent",
              borderLeft: isAtCursor
                ? "2px solid var(--zen-accent)"
                : "2px solid transparent",
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

            {/* Student ID */}
            <span
              style={{
                width: "50px",
                color: "var(--zen-dim)",
                fontFamily: "monospace",
                fontSize: "12px",
              }}
            >
              {student.school_student_id || "—"}
            </span>

            {/* Student name */}
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
              {student.student_name}
            </span>

            {/* Grade with color hint */}
            <span
              style={{
                width: "40px",
                padding: "0 4px",
                backgroundColor: gradeColor + "40",
                color: "var(--zen-fg)",
                borderRadius: "2px",
                textAlign: "center",
                fontSize: "11px",
              }}
            >
              {student.grade || "—"}
              {student.lang_stream || ""}
            </span>

            {/* School */}
            <span
              style={{
                minWidth: "120px",
                maxWidth: "120px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: "var(--zen-dim)",
                fontSize: "11px",
              }}
            >
              {student.school || "—"}
            </span>

            {/* Location */}
            <span
              style={{
                width: "40px",
                color: "var(--zen-dim)",
                fontSize: "11px",
                textAlign: "center",
              }}
            >
              {student.home_location || "—"}
            </span>

            {/* Enrollment count */}
            <span
              style={{
                color: "var(--zen-dim)",
                fontSize: "11px",
                minWidth: "80px",
              }}
            >
              {student.enrollment_count !== undefined
                ? `${student.enrollment_count} enrollment${student.enrollment_count !== 1 ? "s" : ""}`
                : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default ZenStudentList;
