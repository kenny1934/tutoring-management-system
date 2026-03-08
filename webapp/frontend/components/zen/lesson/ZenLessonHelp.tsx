"use client";

interface ShortcutEntry {
  key: string;
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutEntry[];
}

interface ZenLessonHelpProps {
  mode: "single" | "wide";
  onClose: () => void;
}

const SHARED_SHORTCUTS: ShortcutGroup[] = [
  {
    title: "Navigation",
    shortcuts: [
      { key: "j / ↓", description: "Next exercise" },
      { key: "k / ↑", description: "Previous exercise" },
      { key: "[ / ←", description: "Previous page" },
      { key: "] / →", description: "Next page" },
    ],
  },
  {
    title: "Zoom",
    shortcuts: [
      { key: "+ / =", description: "Zoom in" },
      { key: "-", description: "Zoom out" },
      { key: "f", description: "Fit to width (reset zoom)" },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { key: "a", description: "Toggle answer key" },
      { key: "o", description: "Open file in system viewer" },
      { key: "p", description: "Print current exercise" },
      { key: "c", description: "Edit classwork exercises" },
      { key: "h", description: "Edit homework exercises" },
    ],
  },
  {
    title: "Annotations",
    shortcuts: [
      { key: "d", description: "Toggle pen drawing" },
      { key: "e", description: "Toggle eraser" },
      { key: "z", description: "Undo stroke" },
      { key: "Z", description: "Redo stroke" },
      { key: "v", description: "Toggle annotation visibility" },
      { key: "s", description: "Save annotated PDF" },
    ],
  },
  {
    title: "General",
    shortcuts: [
      { key: "?", description: "Toggle this help" },
      { key: "Esc", description: "Close lesson mode" },
    ],
  },
];

const WIDE_SHORTCUTS: ShortcutGroup[] = [
  {
    title: "Students",
    shortcuts: [
      { key: "Tab", description: "Next student" },
      { key: "Shift+Tab", description: "Previous student" },
      { key: "1-99", description: "Jump to student by number" },
    ],
  },
  {
    title: "Bulk Print",
    shortcuts: [
      { key: "P", description: "Open print menu (CW / HW)" },
    ],
  },
];

const WIDE_ALL_SHORTCUTS: ShortcutGroup[] = [...WIDE_SHORTCUTS, ...SHARED_SHORTCUTS];

export function ZenLessonHelp({ mode, onClose }: ZenLessonHelpProps) {
  const groups = mode === "wide" ? WIDE_ALL_SHORTCUTS : SHARED_SHORTCUTS;

  return (
    <div
      onClick={onClose}
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
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--zen-bg)",
          border: "1px solid var(--zen-accent)",
          padding: "20px 28px",
          maxWidth: "480px",
          width: "90%",
          maxHeight: "80vh",
          overflow: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <span
            style={{
              color: "var(--zen-accent)",
              fontWeight: "bold",
              fontSize: "12px",
              textShadow: "var(--zen-glow)",
            }}
          >
            KEYBOARD SHORTCUTS
          </span>
          <span style={{ color: "var(--zen-dim)", fontSize: "10px" }}>
            Press any key to close
          </span>
        </div>

        {groups.map((group) => (
          <div key={group.title} style={{ marginBottom: "12px" }}>
            <div
              style={{
                color: "var(--zen-fg)",
                fontSize: "10px",
                fontWeight: "bold",
                marginBottom: "4px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              {group.title}
            </div>
            {group.shortcuts.map((s) => (
              <div
                key={s.key}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "2px 0",
                  fontSize: "11px",
                }}
              >
                <span
                  style={{
                    color: "var(--zen-accent)",
                    fontFamily: "monospace",
                    minWidth: "100px",
                  }}
                >
                  {s.key}
                </span>
                <span style={{ color: "var(--zen-dim)" }}>{s.description}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
