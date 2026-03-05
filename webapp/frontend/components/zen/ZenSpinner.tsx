"use client";

import { useEffect, useState } from "react";

// ASCII spinner frames
const SPINNER_FRAMES = ["|", "/", "-", "\\"];

export function ZenSpinner() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return <span>{SPINNER_FRAMES[frame]}</span>;
}

// ASCII progress bar component
export function ZenProgressBar({ completed, total }: { completed: number; total: number }) {
  const barWidth = 10;
  const filled = total > 0 ? Math.round((completed / total) * barWidth) : 0;
  const empty = barWidth - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);

  return (
    <span style={{ fontFamily: "monospace" }}>
      <span style={{ color: "var(--zen-dim)" }}>[</span>
      <span style={{ color: completed === total && total > 0 ? "var(--zen-success)" : "var(--zen-accent)" }}>
        {bar}
      </span>
      <span style={{ color: "var(--zen-dim)" }}>] </span>
      <span style={{ color: "var(--zen-fg)" }}>{completed}</span>
      <span style={{ color: "var(--zen-dim)" }}>/</span>
      <span style={{ color: "var(--zen-fg)" }}>{total}</span>
      <span style={{ color: "var(--zen-dim)" }}> done</span>
    </span>
  );
}
