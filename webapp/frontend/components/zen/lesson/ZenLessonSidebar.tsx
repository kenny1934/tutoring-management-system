"use client";

import { getDisplayName, parseExerciseRemarks } from "@/lib/exercise-utils";
import type { SessionExercise } from "@/types";

interface ZenLessonSidebarProps {
  exercises: SessionExercise[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  answerAvailable?: Map<number, boolean | null>; // exerciseId → true/false/null(searching)
}

function formatPageRange(exercise: SessionExercise): string {
  const { complexPages } = parseExerciseRemarks(exercise.remarks || null);
  if (complexPages) return complexPages;
  if (exercise.page_start) {
    if (exercise.page_end && exercise.page_end !== exercise.page_start) {
      return `p${exercise.page_start}-${exercise.page_end}`;
    }
    return `p${exercise.page_start}`;
  }
  return "all";
}

function getExerciseTypeLabel(type: string): { label: string; color: string } {
  if (type === "CW" || type === "Classwork") return { label: "CW", color: "var(--zen-error)" };
  if (type === "HW" || type === "Homework") return { label: "HW", color: "var(--zen-accent)" };
  return { label: type, color: "var(--zen-dim)" };
}

export function ZenLessonSidebar({
  exercises,
  selectedIndex,
  onSelect,
  answerAvailable,
}: ZenLessonSidebarProps) {
  const cwExercises = exercises.filter(
    (e) => e.exercise_type === "CW" || e.exercise_type === "Classwork"
  );
  const hwExercises = exercises.filter(
    (e) => e.exercise_type === "HW" || e.exercise_type === "Homework"
  );

  // Build flat list matching parent's exercise ordering (CW first, then HW)
  const sections: { title: string; items: { exercise: SessionExercise; flatIndex: number }[] }[] = [];
  let flatIdx = 0;

  if (cwExercises.length > 0) {
    const items = cwExercises.map((e) => ({ exercise: e, flatIndex: flatIdx++ }));
    sections.push({ title: `CLASSWORK (${cwExercises.length})`, items });
  }
  if (hwExercises.length > 0) {
    const items = hwExercises.map((e) => ({ exercise: e, flatIndex: flatIdx++ }));
    sections.push({ title: `HOMEWORK (${hwExercises.length})`, items });
  }

  if (sections.length === 0) {
    return (
      <div style={{ padding: "16px", color: "var(--zen-dim)", fontSize: "11px" }}>
        No exercises assigned
      </div>
    );
  }

  return (
    <div style={{ overflowY: "auto", padding: "8px 0" }}>
      {sections.map((section) => (
        <div key={section.title} style={{ marginBottom: "12px" }}>
          <div
            style={{
              color: "var(--zen-accent)",
              fontSize: "10px",
              fontWeight: "bold",
              padding: "0 8px",
              marginBottom: "2px",
              textShadow: "var(--zen-glow)",
            }}
          >
            {section.title}
          </div>
          <div
            style={{
              color: "var(--zen-border)",
              fontSize: "10px",
              padding: "0 8px",
              marginBottom: "4px",
            }}
          >
            {"─".repeat(28)}
          </div>

          {section.items.map(({ exercise, flatIndex }) => {
            const isSelected = flatIndex === selectedIndex;
            const { label, color } = getExerciseTypeLabel(exercise.exercise_type);
            const displayName = getDisplayName(exercise.pdf_name);
            const pageRange = formatPageRange(exercise);
            const answerStatus = answerAvailable?.get(exercise.id);

            return (
              <div
                key={exercise.id}
                onClick={() => onSelect(flatIndex)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "3px 8px",
                  cursor: "pointer",
                  backgroundColor: isSelected ? "var(--zen-selection)" : "transparent",
                  borderLeft: isSelected ? "2px solid var(--zen-accent)" : "2px solid transparent",
                  fontSize: "11px",
                }}
              >
                <span
                  style={{
                    width: "10px",
                    color: isSelected ? "var(--zen-accent)" : "transparent",
                    textShadow: isSelected ? "var(--zen-glow)" : "none",
                    flexShrink: 0,
                  }}
                >
                  {isSelected ? ">" : " "}
                </span>

                <span style={{ color, fontWeight: "bold", fontSize: "10px", width: "20px", flexShrink: 0 }}>
                  {label}
                </span>

                <span
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: "var(--zen-fg)",
                  }}
                  title={exercise.pdf_name}
                >
                  {displayName}
                </span>

                <span style={{ color: "var(--zen-dim)", fontSize: "10px", flexShrink: 0 }}>
                  {pageRange}
                </span>

                {answerStatus === true && (
                  <span style={{ color: "var(--zen-success)", fontSize: "9px", flexShrink: 0 }} title="Answer available">
                    [A]
                  </span>
                )}
                {answerStatus === false && (
                  <span style={{ color: "var(--zen-dim)", fontSize: "9px", flexShrink: 0 }} title="No answer found">
                    [-]
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
