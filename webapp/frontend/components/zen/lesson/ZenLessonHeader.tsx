"use client";

import type { Session } from "@/types";

interface ZenLessonHeaderProps {
  session: Session;
  mode: "single" | "wide";
  onClose: () => void;
}

export function ZenLessonHeader({ session, mode, onClose }: ZenLessonHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 12px",
        borderBottom: "1px solid var(--zen-border)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span
          style={{
            color: "var(--zen-accent)",
            fontWeight: "bold",
            fontSize: "12px",
            textShadow: "var(--zen-glow)",
          }}
        >
          {mode === "wide" ? "LESSON WIDE" : "LESSON"}
        </span>

        <span style={{ color: "var(--zen-fg)", fontSize: "12px", fontWeight: "bold" }}>
          {session.student_name || "Unknown"}
        </span>

        {session.school_student_id && (
          <span style={{ color: "var(--zen-dim)", fontSize: "11px" }}>
            ({session.school_student_id})
          </span>
        )}

        <span
          style={{
            padding: "1px 6px",
            backgroundColor: "var(--zen-border)",
            color: "var(--zen-fg)",
            fontSize: "10px",
            borderRadius: "2px",
          }}
        >
          {session.grade || "—"}{session.lang_stream || ""}
        </span>

        {session.time_slot && (
          <span style={{ color: "var(--zen-dim)", fontSize: "11px" }}>
            {session.time_slot}
          </span>
        )}

        {session.tutor_name && (
          <span style={{ color: "var(--zen-dim)", fontSize: "11px" }}>
            {session.tutor_name}
          </span>
        )}
      </div>

      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "1px solid var(--zen-border)",
          color: "var(--zen-dim)",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: "10px",
          padding: "2px 8px",
        }}
      >
        [Esc] Close
      </button>
    </div>
  );
}
