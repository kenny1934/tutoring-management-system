"use client";

import { getExerciseDisplayName } from "@/lib/exercise-utils";
import { getPageLabel } from "@/lib/lesson-utils";
import { assignedLabel } from "@/lib/homework-utils";
import { MARK_KEYS, statusGlyph } from "./zen-homework";
import type { HomeworkCompletion, SessionExercise } from "@/types";

/**
 * Homework marking overlay for wide lesson mode.
 *
 * Presentational: the lesson's own keyboard handler owns the cursor and the
 * keys, the way the print and help overlays already work.
 */
export function ZenHomeworkCheck({
  studentName,
  items,
  cursor,
  saving,
}: {
  studentName: string;
  items: HomeworkCompletion[];
  cursor: number;
  saving: boolean;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          backgroundColor: "var(--zen-bg)",
          border: "1px solid var(--zen-accent)",
          padding: "20px 28px",
          maxWidth: "560px",
          width: "90%",
          maxHeight: "80vh",
          overflow: "auto",
          opacity: saving ? 0.7 : 1,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <span style={{ color: "var(--zen-accent)", fontWeight: "bold", fontSize: "12px", textShadow: "var(--zen-glow)" }}>
            CHECK HOMEWORK
          </span>
          <span style={{ color: "var(--zen-dim)", fontSize: "10px" }}>{studentName}</span>
        </div>

        {items.length === 0 ? (
          <div style={{ color: "var(--zen-dim)", fontSize: "11px", padding: "8px 0" }}>
            Nothing outstanding for this student.
          </div>
        ) : (
          items.map((hw, i) => {
            const glyph = statusGlyph(hw.completion_status);
            const isCursor = i === cursor;
            const pageLabel = getPageLabel({
              page_start: hw.page_start,
              page_end: hw.page_end,
              remarks: hw.assignment_remarks,
            } as SessionExercise);
            const source = assignedLabel(hw);

            return (
              <div
                key={hw.session_exercise_id}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "8px",
                  padding: "3px 6px",
                  fontSize: "11px",
                  backgroundColor: isCursor ? "var(--zen-selection)" : "transparent",
                }}
              >
                <span style={{ color: "var(--zen-accent)", width: "10px" }}>{isCursor ? ">" : " "}</span>
                <span style={{ color: glyph.colour, fontFamily: "monospace" }}>{glyph.mark}</span>
                <span style={{ color: "var(--zen-fg)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {getExerciseDisplayName(hw)}
                  {pageLabel && <span style={{ color: "var(--zen-dim)", marginLeft: "6px" }}>{pageLabel}</span>}
                </span>
                {source && (
                  <span style={{ color: "var(--zen-dim)", fontSize: "10px", whiteSpace: "nowrap" }}>
                    {source}
                    {(hw.sessions_ago || 0) > 1 && ` · ${hw.sessions_ago} back`}
                  </span>
                )}
              </div>
            );
          })
        )}

        <div style={{ marginTop: "16px", paddingTop: "8px", borderTop: "1px solid var(--zen-border)", display: "flex", flexWrap: "wrap", gap: "12px", fontSize: "10px" }}>
          {MARK_KEYS.map((k) => (
            <span key={k.key}>
              <span style={{ color: "var(--zen-accent)", fontFamily: "monospace" }}>{k.key}</span>
              <span style={{ color: "var(--zen-dim)", marginLeft: "4px" }}>{k.label}</span>
            </span>
          ))}
          <span>
            <span style={{ color: "var(--zen-accent)", fontFamily: "monospace" }}>j/k</span>
            <span style={{ color: "var(--zen-dim)", marginLeft: "4px" }}>move</span>
          </span>
          <span>
            <span style={{ color: "var(--zen-accent)", fontFamily: "monospace" }}>Esc</span>
            <span style={{ color: "var(--zen-dim)", marginLeft: "4px" }}>close</span>
          </span>
        </div>
      </div>
    </div>
  );
}
