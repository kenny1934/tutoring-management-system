"use client";

import { usePageTitle } from "@/lib/hooks";

export default function ZenCoursewarePage() {
  usePageTitle("Courseware - Zen Mode");

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          marginBottom: "16px",
          borderBottom: "1px solid var(--zen-border)",
          paddingBottom: "8px",
        }}
      >
        <h1
          style={{
            fontSize: "16px",
            fontWeight: "bold",
            textTransform: "uppercase",
            color: "var(--zen-fg)",
            textShadow: "var(--zen-glow)",
            margin: 0,
          }}
        >
          COURSEWARE
        </h1>
      </div>

      <div
        style={{
          color: "var(--zen-dim)",
          fontSize: "13px",
          lineHeight: "1.8",
          maxWidth: "600px",
        }}
      >
        <div style={{ color: "var(--zen-warning)", marginBottom: "16px" }}>
          [COMING SOON]
        </div>
        <div>
          Courseware management will be available in a future update.
        </div>
        <div style={{ marginTop: "16px" }}>
          Use the GUI courseware page for now:{" "}
          <span style={{ color: "var(--zen-accent)" }}>/courseware</span>
        </div>
      </div>

      {/* Navigation hint */}
      <div
        style={{
          marginTop: "32px",
          paddingTop: "16px",
          borderTop: "1px solid var(--zen-border)",
          color: "var(--zen-dim)",
          fontSize: "12px",
        }}
      >
        <span style={{ color: "var(--zen-fg)" }}>?</span>=help
      </div>
    </div>
  );
}
