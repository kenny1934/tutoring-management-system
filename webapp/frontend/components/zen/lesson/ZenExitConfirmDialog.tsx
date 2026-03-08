"use client";

interface ZenExitConfirmDialogProps {
  onSaveAndExit: () => void;
  onDiscardAndExit: () => void;
  onCancel: () => void;
}

export function ZenExitConfirmDialog({ onSaveAndExit, onDiscardAndExit, onCancel }: ZenExitConfirmDialogProps) {
  return (
    <div
      onClick={onCancel}
      style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div onClick={(ev) => ev.stopPropagation()} style={{ backgroundColor: "var(--zen-bg)", border: "1px solid var(--zen-accent)", padding: "16px 24px" }}>
        <div style={{ color: "var(--zen-accent)", fontWeight: "bold", fontSize: "12px", marginBottom: "12px", textShadow: "var(--zen-glow)" }}>
          UNSAVED ANNOTATIONS
        </div>
        <div style={{ color: "var(--zen-dim)", fontSize: "11px", marginBottom: "12px" }}>
          You have unsaved annotations. What would you like to do?
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <button onClick={onSaveAndExit} style={{ background: "none", border: "1px solid var(--zen-border)", color: "var(--zen-fg)", cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "6px 16px" }}>
            <span style={{ color: "var(--zen-accent)" }}>1</span> Download &amp; Exit
          </button>
          <button onClick={onDiscardAndExit} style={{ background: "none", border: "1px solid var(--zen-border)", color: "var(--zen-fg)", cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "6px 16px" }}>
            <span style={{ color: "var(--zen-accent)" }}>2</span> Exit
          </button>
        </div>
        <div style={{ color: "var(--zen-dim)", fontSize: "10px", marginTop: "8px" }}>
          Press 1, 2, or Esc to cancel
        </div>
      </div>
    </div>
  );
}
