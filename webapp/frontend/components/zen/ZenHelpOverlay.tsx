"use client";

import { useEffect } from "react";

interface ZenHelpOverlayProps {
  onClose: () => void;
}

/**
 * Help overlay showing all keyboard shortcuts and commands
 * Activated by pressing ? key
 */
export function ZenHelpOverlay({ onClose }: ZenHelpOverlayProps) {
  // Handle keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--zen-bg)",
          border: "1px solid var(--zen-accent)",
          boxShadow: "0 0 30px var(--zen-accent)",
          padding: "24px",
          maxWidth: "700px",
          maxHeight: "80vh",
          overflow: "auto",
          fontFamily: "inherit",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
            paddingBottom: "12px",
            borderBottom: "1px solid var(--zen-border)",
          }}
        >
          <span
            style={{
              color: "var(--zen-accent)",
              fontWeight: "bold",
              fontSize: "16px",
              textShadow: "var(--zen-glow)",
            }}
          >
            KEYBOARD SHORTCUTS
          </span>
          <span style={{ color: "var(--zen-dim)", fontSize: "12px" }}>
            Press Esc or ? to close
          </span>
        </div>

        {/* Content */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "24px",
          }}
        >
          {/* Navigation */}
          <Section title="NAVIGATION">
            <Shortcut keys={["j", "↓"]} desc="Move cursor down" />
            <Shortcut keys={["k", "↑"]} desc="Move cursor up" />
            <Shortcut keys={["g", "g"]} desc="Jump to first item" />
            <Shortcut keys={["G"]} desc="Jump to last item" />
            <Shortcut keys={["Home"]} desc="Jump to first item" />
            <Shortcut keys={["End"]} desc="Jump to last item" />
            <Shortcut keys={["Enter"]} desc="Open detail view" />
            <Shortcut keys={["Esc"]} desc="Close/clear selection" />
          </Section>

          {/* Selection */}
          <Section title="SELECTION">
            <Shortcut keys={["Space"]} desc="Toggle selection" />
            <Shortcut keys={["a"]} desc="Select all actionable" />
          </Section>

          {/* Quick Actions */}
          <Section title="QUICK ACTIONS">
            <Shortcut keys={["1"]} desc="Mark as Attended" />
            <Shortcut keys={["2"]} desc="Mark as No Show" />
            <Shortcut keys={["3"]} desc="Mark as Reschedule" />
            <Shortcut keys={["4"]} desc="Mark as Sick Leave" />
            <Shortcut keys={["5"]} desc="Mark as Weather Cancelled" />
          </Section>

          {/* Session Detail Actions */}
          <Section title="SESSION DETAIL">
            <Shortcut keys={["c"]} desc="Assign Classwork" />
            <Shortcut keys={["h"]} desc="Assign Homework" />
            <Shortcut keys={["e"]} desc="Edit session" />
            <Shortcut keys={["r"]} desc="Rate session" />
            <Shortcut keys={["o"]} desc="Open exercise PDF" />
            <Shortcut keys={["p"]} desc="Print exercise PDF" />
            <Shortcut keys={["y"]} desc="Copy exercise path" />
          </Section>

          {/* Page Navigation */}
          <Section title="PAGE NAVIGATION">
            <Shortcut keys={["s"]} desc="Go to Students" />
            <Shortcut keys={["n"]} desc="Go to Sessions" />
            <Shortcut keys={["c"]} desc="Go to Courseware" />
            <Shortcut keys={["r"]} desc="Go to Revenue" />
            <Shortcut keys={["d"]} desc="Go to Dashboard" />
          </Section>

          {/* Command Bar */}
          <Section title="COMMAND BAR">
            <Shortcut keys={["/"]} desc="Focus command bar" />
            <Shortcut keys={["Tab"]} desc="Autocomplete" />
            <Shortcut keys={["↑", "↓"]} desc="Browse history" />
          </Section>

          {/* Common Commands */}
          <Section title="COMMON COMMANDS">
            <Command cmd="mark attended" desc="Mark selected as attended" />
            <Command cmd="mark noshow" desc="Mark selected as no show" />
            <Command cmd="mark sick" desc="Mark selected as sick leave" />
            <Command cmd="mark weather" desc="Mark as weather cancelled" />
            <Command cmd="select all" desc="Select all sessions" />
            <Command cmd="today" desc="Show today's sessions" />
            <Command cmd="date +N/-N" desc="Offset by N days" />
            <Command cmd="theme list" desc="List available themes" />
            <Command cmd="exit" desc="Exit Zen mode" />
          </Section>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: "20px",
            paddingTop: "12px",
            borderTop: "1px solid var(--zen-border)",
            color: "var(--zen-dim)",
            fontSize: "11px",
            textAlign: "center",
          }}
        >
          Type <span style={{ color: "var(--zen-fg)" }}>help &lt;command&gt;</span> for detailed help on a specific command
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3
        style={{
          fontSize: "12px",
          fontWeight: "bold",
          color: "var(--zen-accent)",
          marginBottom: "8px",
          letterSpacing: "1px",
        }}
      >
        {title}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {children}
      </div>
    </div>
  );
}

function Shortcut({ keys, desc }: { keys: string[]; desc: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
      <span style={{ minWidth: "60px", display: "flex", gap: "4px" }}>
        {keys.map((key, i) => (
          <span key={i}>
            <kbd
              style={{
                padding: "2px 6px",
                backgroundColor: "var(--zen-selection)",
                border: "1px solid var(--zen-border)",
                borderRadius: "3px",
                color: "var(--zen-fg)",
                fontSize: "11px",
              }}
            >
              {key}
            </kbd>
            {i < keys.length - 1 && (
              <span style={{ color: "var(--zen-dim)", margin: "0 2px" }}>/</span>
            )}
          </span>
        ))}
      </span>
      <span style={{ color: "var(--zen-dim)" }}>{desc}</span>
    </div>
  );
}

function Command({ cmd, desc }: { cmd: string; desc: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
      <code
        style={{
          minWidth: "120px",
          color: "var(--zen-accent)",
          fontFamily: "inherit",
        }}
      >
        {cmd}
      </code>
      <span style={{ color: "var(--zen-dim)" }}>{desc}</span>
    </div>
  );
}

export default ZenHelpOverlay;
