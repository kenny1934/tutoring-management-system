"use client";

import { useEffect } from "react";

interface ZenConfirmDialogProps {
  title: string;
  details?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Minimal confirmation overlay for bulk actions.
 * Keyboard-only: y/Enter to confirm, n/Escape to cancel.
 */
export function ZenConfirmDialog({ title, details, onConfirm, onCancel }: ZenConfirmDialogProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "y" || e.key === "Y" || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
      } else if (e.key === "n" || e.key === "N" || e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onConfirm, onCancel]);

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
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
          boxShadow: "0 0 20px var(--zen-accent)",
          padding: "24px 32px",
          minWidth: "300px",
          maxWidth: "500px",
          fontFamily: "inherit",
          textAlign: "center",
        }}
      >
        <div
          style={{
            color: "var(--zen-fg)",
            fontSize: "14px",
            marginBottom: details ? "12px" : "20px",
          }}
        >
          {title}
        </div>

        {details && (
          <div
            style={{
              color: "var(--zen-dim)",
              fontSize: "12px",
              marginBottom: "20px",
            }}
          >
            {details}
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "24px",
            fontSize: "12px",
          }}
        >
          <span>
            <kbd
              style={{
                padding: "2px 8px",
                backgroundColor: "var(--zen-selection)",
                border: "1px solid var(--zen-accent)",
                borderRadius: "3px",
                color: "var(--zen-accent)",
                fontSize: "11px",
              }}
            >
              Y
            </kbd>{" "}
            <span style={{ color: "var(--zen-accent)" }}>Confirm</span>
          </span>
          <span>
            <kbd
              style={{
                padding: "2px 8px",
                backgroundColor: "var(--zen-selection)",
                border: "1px solid var(--zen-border)",
                borderRadius: "3px",
                color: "var(--zen-dim)",
                fontSize: "11px",
              }}
            >
              N
            </kbd>{" "}
            <span style={{ color: "var(--zen-dim)" }}>Cancel</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default ZenConfirmDialog;
