"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { parentCommunicationsAPI } from "@/lib/api";
import type { ParentCommunication } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useZenKeyboardFocus, type ZenFocusSection } from "@/contexts/ZenKeyboardFocusContext";
import { setZenStatus } from "./ZenStatusBar";

const METHODS = ["WeChat", "Phone", "In-Person"] as const;
const TYPES = ["Progress Update", "Concern", "General"] as const;

interface ZenContactFormProps {
  studentId: number;
  onSave: () => void;
  onCancel: () => void;
  editingContact?: ParentCommunication;
}

/**
 * Inline form for recording/editing a parent contact.
 *
 * Keyboard:
 * - Tab/Shift+Tab: cycle fields
 * - Enter: save
 * - Escape: cancel
 * - When on method/type: left/right to cycle options
 */
export function ZenContactForm({
  studentId,
  onSave,
  onCancel,
  editingContact,
}: ZenContactFormProps) {
  const { user } = useAuth();
  const { focusedSection, setFocusedSection } = useZenKeyboardFocus();
  const previousFocusRef = useRef<ZenFocusSection>(focusedSection);
  const hasSetFocusRef = useRef(false);

  const [method, setMethod] = useState<string>(editingContact?.contact_method || "WeChat");
  const [type, setType] = useState<string>(editingContact?.contact_type || "Progress Update");
  const [notes, setNotes] = useState(editingContact?.brief_notes || "");
  const [followUp, setFollowUp] = useState(editingContact?.follow_up_needed || false);
  const [saving, setSaving] = useState(false);
  const [activeField, setActiveField] = useState(0); // 0=method, 1=type, 2=notes, 3=followUp
  const notesRef = useRef<HTMLInputElement>(null);

  const FIELD_COUNT = 4;

  // Focus management
  useEffect(() => {
    if (!hasSetFocusRef.current) {
      previousFocusRef.current = focusedSection;
      setFocusedSection("detail");
      hasSetFocusRef.current = true;
    }
    return () => {
      if (previousFocusRef.current && previousFocusRef.current !== "detail") {
        setFocusedSection(previousFocusRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus notes input when field is active
  useEffect(() => {
    if (activeField === 2 && notesRef.current) {
      notesRef.current.focus();
    } else if (activeField !== 2 && notesRef.current) {
      notesRef.current.blur();
    }
  }, [activeField]);

  const handleSave = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    try {
      if (editingContact) {
        await parentCommunicationsAPI.update(editingContact.id, {
          contact_method: method,
          contact_type: type,
          brief_notes: notes || undefined,
          follow_up_needed: followUp,
        });
        setZenStatus("Contact updated", "success");
      } else {
        await parentCommunicationsAPI.create(
          {
            student_id: studentId,
            contact_method: method,
            contact_type: type,
            brief_notes: notes || undefined,
            follow_up_needed: followUp,
            contact_date: new Date().toISOString().split("T")[0],
          },
          user.id,
          user.name,
        );
        setZenStatus("Contact recorded", "success");
      }
      onSave();
    } catch {
      setZenStatus("Failed to save contact", "error");
    } finally {
      setSaving(false);
    }
  }, [user, editingContact, studentId, method, type, notes, followUp, onSave]);

  // Keyboard handler (capture phase)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (saving) return;

      // Let notes input handle its own keys
      if (activeField === 2 && e.key !== "Tab" && e.key !== "Escape" && e.key !== "Enter") {
        return;
      }

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          e.stopImmediatePropagation();
          onCancel();
          break;

        case "Enter":
          e.preventDefault();
          e.stopImmediatePropagation();
          handleSave();
          break;

        case "Tab":
          e.preventDefault();
          e.stopImmediatePropagation();
          setActiveField((f) =>
            e.shiftKey ? (f - 1 + FIELD_COUNT) % FIELD_COUNT : (f + 1) % FIELD_COUNT
          );
          break;

        case "ArrowLeft":
        case "h":
          if (activeField === 0) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const idx = METHODS.indexOf(method as typeof METHODS[number]);
            setMethod(METHODS[(idx - 1 + METHODS.length) % METHODS.length]);
          } else if (activeField === 1) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const idx = TYPES.indexOf(type as typeof TYPES[number]);
            setType(TYPES[(idx - 1 + TYPES.length) % TYPES.length]);
          }
          break;

        case "ArrowRight":
        case "l":
          if (activeField === 0) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const idx = METHODS.indexOf(method as typeof METHODS[number]);
            setMethod(METHODS[(idx + 1) % METHODS.length]);
          } else if (activeField === 1) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const idx = TYPES.indexOf(type as typeof TYPES[number]);
            setType(TYPES[(idx + 1) % TYPES.length]);
          }
          break;

        case " ":
          if (activeField === 3) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setFollowUp((f) => !f);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [activeField, method, type, saving, onCancel, handleSave]);

  const fieldStyle = (idx: number) => ({
    padding: "4px 8px",
    border: `1px solid ${activeField === idx ? "var(--zen-accent)" : "var(--zen-border)"}`,
    backgroundColor: activeField === idx ? "var(--zen-border)" : "transparent",
  });

  return (
    <div
      style={{
        margin: "8px 0",
        padding: "12px",
        border: "1px solid var(--zen-accent)",
        backgroundColor: "var(--zen-bg)",
        boxShadow: "0 0 10px var(--zen-accent)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "12px",
          paddingBottom: "8px",
          borderBottom: "1px solid var(--zen-border)",
        }}
      >
        <span style={{ color: "var(--zen-accent)", fontWeight: "bold" }}>
          {editingContact ? "EDIT CONTACT" : "NEW CONTACT"}
        </span>
        <span style={{ color: "var(--zen-dim)", fontSize: "11px" }}>
          Tab=next Enter=save Esc=cancel
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "8px 12px", fontSize: "13px" }}>
        {/* Method */}
        <span style={{ color: "var(--zen-dim)" }}>Method:</span>
        <div style={fieldStyle(0)}>
          {METHODS.map((m) => (
            <span
              key={m}
              style={{
                marginRight: "12px",
                color: m === method ? "var(--zen-accent)" : "var(--zen-dim)",
                fontWeight: m === method ? "bold" : "normal",
              }}
            >
              {m}
            </span>
          ))}
          {activeField === 0 && (
            <span style={{ color: "var(--zen-dim)", fontSize: "10px", marginLeft: "8px" }}>← →</span>
          )}
        </div>

        {/* Type */}
        <span style={{ color: "var(--zen-dim)" }}>Type:</span>
        <div style={fieldStyle(1)}>
          {TYPES.map((t) => (
            <span
              key={t}
              style={{
                marginRight: "12px",
                color: t === type ? "var(--zen-accent)" : "var(--zen-dim)",
                fontWeight: t === type ? "bold" : "normal",
              }}
            >
              {t}
            </span>
          ))}
          {activeField === 1 && (
            <span style={{ color: "var(--zen-dim)", fontSize: "10px", marginLeft: "8px" }}>← →</span>
          )}
        </div>

        {/* Notes */}
        <span style={{ color: "var(--zen-dim)" }}>Notes:</span>
        <div style={fieldStyle(2)}>
          <input
            ref={notesRef}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Brief notes..."
            style={{
              background: "none",
              border: "none",
              color: "var(--zen-fg)",
              fontFamily: "inherit",
              fontSize: "13px",
              width: "100%",
              outline: "none",
            }}
          />
        </div>

        {/* Follow-up */}
        <span style={{ color: "var(--zen-dim)" }}>Follow-up:</span>
        <div style={fieldStyle(3)}>
          <span style={{ color: followUp ? "var(--zen-warning)" : "var(--zen-dim)" }}>
            {followUp ? "✓ Yes" : "— No"}
          </span>
          {activeField === 3 && (
            <span style={{ color: "var(--zen-dim)", fontSize: "10px", marginLeft: "8px" }}>Space to toggle</span>
          )}
        </div>
      </div>

      {saving && (
        <div style={{ marginTop: "8px", color: "var(--zen-accent)", fontSize: "12px" }}>
          Saving...
        </div>
      )}
    </div>
  );
}
