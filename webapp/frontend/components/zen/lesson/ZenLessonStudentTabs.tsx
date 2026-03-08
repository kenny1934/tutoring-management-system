"use client";

import type { Session } from "@/types";

interface ZenLessonStudentTabsProps {
  sessions: Session[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

function getFirstName(name: string): string {
  return name.split(/\s+/)[0] || name;
}

export function ZenLessonStudentTabs({
  sessions,
  activeIndex,
  onSelect,
}: ZenLessonStudentTabsProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "4px 8px",
        borderBottom: "1px solid var(--zen-border)",
        overflowX: "auto",
        flexShrink: 0,
      }}
    >
      {sessions.map((session, i) => {
        const isActive = i === activeIndex;
        const hasExercises = (session.exercises?.length || 0) > 0;

        return (
          <button
            key={session.id}
            onClick={() => onSelect(i)}
            style={{
              padding: "3px 10px",
              backgroundColor: isActive ? "var(--zen-accent)" : "transparent",
              color: isActive
                ? "var(--zen-bg)"
                : hasExercises
                ? "var(--zen-fg)"
                : "var(--zen-dim)",
              border: "1px solid var(--zen-border)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "11px",
              whiteSpace: "nowrap",
              opacity: hasExercises ? 1 : 0.5,
              textShadow: isActive ? "none" : "var(--zen-glow)",
            }}
            title={`${session.student_name} (${session.grade || "—"}${session.lang_stream || ""})`}
          >
            <span style={{ color: isActive ? "var(--zen-bg)" : "var(--zen-dim)", fontSize: "9px", marginRight: "4px" }}>
              {i + 1}
            </span>
            {getFirstName(session.student_name || "Unknown")}
            {!hasExercises && " (none)"}
          </button>
        );
      })}
    </div>
  );
}
