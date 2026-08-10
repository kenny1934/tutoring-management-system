"use client";

import { getExerciseDisplayName, parseExerciseRemarks } from "@/lib/exercise-utils";
import { UrlBadgeInline } from "@/components/ui/url-badge";
import { checkedCount } from "@/lib/homework-utils";
import { statusGlyph } from "./ZenHomeworkCheck";
import type { HomeworkCompletion, SessionExercise } from "@/types";

interface ZenLessonSidebarProps {
  exercises: SessionExercise[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  answerAvailable?: Map<number, boolean | null>; // exerciseId → true/false/null(searching)
  onEditExercises?: (type: "CW" | "HW") => void;
  /** Homework set in earlier lessons, waiting to be checked. */
  homework?: HomeworkCompletion[];
  /** Opens the marking overlay, same as the H key. */
  onCheckHomework?: () => void;
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

/**
 * Homework carried in from earlier lessons. Read only here; marking happens in
 * the overlay, where the keyboard can drive it.
 */
function HomeworkToCheckSection({
  homework,
  onCheckHomework,
}: {
  homework: HomeworkCompletion[];
  onCheckHomework?: () => void;
}) {
  const done = checkedCount(homework);

  return (
    <div style={{ marginBottom: "12px" }}>
      <div
        style={{
          color: done === homework.length ? "var(--zen-dim)" : "var(--zen-warning)",
          fontSize: "10px",
          fontWeight: "bold",
          padding: "0 8px",
          marginBottom: "2px",
          textShadow: "var(--zen-glow)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>TO CHECK ({done}/{homework.length})</span>
        {onCheckHomework && (
          <button
            onClick={onCheckHomework}
            style={{
              background: "none",
              border: "none",
              color: "var(--zen-dim)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "9px",
              padding: "0 2px",
            }}
            title="Mark homework (H)"
          >
            [mark]
          </button>
        )}
      </div>
      <div style={{ color: "var(--zen-border)", fontSize: "10px", padding: "0 8px", marginBottom: "4px" }}>
        {"─".repeat(28)}
      </div>

      {homework.map((hw) => {
        const glyph = statusGlyph(hw.completion_status);
        return (
          <div
            key={hw.session_exercise_id}
            onClick={onCheckHomework}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "3px 8px",
              fontSize: "11px",
              cursor: onCheckHomework ? "pointer" : "default",
            }}
            title={`${getExerciseDisplayName(hw)} — set ${hw.sessions_ago === 1 ? "last session" : `${hw.sessions_ago} sessions ago`}`}
          >
            <span style={{ width: "10px", flexShrink: 0 }} />
            <span style={{ color: glyph.colour, fontFamily: "monospace", flexShrink: 0 }}>{glyph.mark}</span>
            <span
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: "var(--zen-fg)",
              }}
            >
              {getExerciseDisplayName(hw)}
            </span>
            {(hw.sessions_ago || 0) > 1 && (
              <span style={{ color: "var(--zen-warning)", fontSize: "9px", flexShrink: 0 }}>
                {hw.sessions_ago}x
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ZenLessonSidebar({
  exercises,
  selectedIndex,
  onSelect,
  answerAvailable,
  onEditExercises,
  homework = [],
  onCheckHomework,
}: ZenLessonSidebarProps) {
  const cwExercises = exercises.filter(
    (e) => e.exercise_type === "CW" || e.exercise_type === "Classwork"
  );
  const hwExercises = exercises.filter(
    (e) => e.exercise_type === "HW" || e.exercise_type === "Homework"
  );

  // Build flat list matching parent's exercise ordering (CW first, then HW)
  const sections: { title: string; type: "CW" | "HW"; items: { exercise: SessionExercise; flatIndex: number }[] }[] = [];
  let flatIdx = 0;

  if (cwExercises.length > 0) {
    const items = cwExercises.map((e) => ({ exercise: e, flatIndex: flatIdx++ }));
    sections.push({ title: `CLASSWORK (${cwExercises.length})`, type: "CW", items });
  }
  if (hwExercises.length > 0) {
    const items = hwExercises.map((e) => ({ exercise: e, flatIndex: flatIdx++ }));
    sections.push({ title: `HOMEWORK (${hwExercises.length})`, type: "HW", items });
  }

  if (sections.length === 0 && homework.length === 0) {
    return (
      <div style={{ padding: "16px", color: "var(--zen-dim)", fontSize: "11px" }}>
        No exercises assigned
      </div>
    );
  }

  return (
    <div style={{ overflowY: "auto", padding: "8px 0" }}>
      {/* Last lesson's homework leads: it is what the tutor settles first. */}
      {homework.length > 0 && (
        <HomeworkToCheckSection homework={homework} onCheckHomework={onCheckHomework} />
      )}
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
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>{section.title}</span>
            {onEditExercises && (
              <button
                onClick={() => onEditExercises(section.type)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--zen-dim)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "9px",
                  padding: "0 2px",
                }}
              >
                [edit]
              </button>
            )}
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
            const displayName = getExerciseDisplayName(exercise);
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
                  title={exercise.pdf_name || exercise.url}
                >
                  {displayName}
                </span>
                <UrlBadgeInline url={exercise.url} />

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
