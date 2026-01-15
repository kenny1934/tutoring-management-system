"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Session } from "@/types";
import { sessionsAPI } from "@/lib/api";
import { useTutors, useLocations } from "@/lib/hooks";
import { updateSessionInCache } from "@/lib/session-cache";
import { parseTimeSlot } from "@/lib/calendar-utils";

// Available session statuses
const SESSION_STATUSES = [
  "Scheduled",
  "Attended",
  "Trial Class",
  "Make-up Class",
  "No Show",
  "Cancelled",
  "Rescheduled - Pending Make-up",
  "Sick Leave - Pending Make-up",
  "Weather Cancelled - Pending Make-up",
  "Rescheduled - Make-up Booked",
  "Sick Leave - Make-up Booked",
  "Weather Cancelled - Make-up Booked",
];

interface ZenEditSessionProps {
  session: Session;
  onClose: () => void;
  onSave?: (updatedSession: Session) => void;
}

type FieldName = "date" | "timeStart" | "timeEnd" | "location" | "tutor" | "status" | "rating" | "notes";

/**
 * Terminal-style session editor
 *
 * Keyboard controls:
 * - Tab/Shift+Tab: Navigate between fields
 * - Enter: Save changes
 * - Escape: Cancel without saving
 * - ↑↓: Navigate dropdown options (when dropdown is focused)
 */
export function ZenEditSession({
  session,
  onClose,
  onSave,
}: ZenEditSessionProps) {
  const { data: tutors } = useTutors();
  const { data: locations } = useLocations();

  // Parse initial time slot
  const initialTime = parseTimeSlot(session.time_slot || "") || { start: "", end: "" };

  // Form state
  const [formData, setFormData] = useState({
    date: session.session_date || "",
    timeStart: initialTime.start,
    timeEnd: initialTime.end,
    location: session.location || "",
    tutorId: session.tutor_id || null as number | null,
    status: session.session_status || "Scheduled",
    rating: parseInt(session.performance_rating || "0") || 0,
    notes: session.notes || "",
  });

  const [focusedField, setFocusedField] = useState<FieldName>("date");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState<FieldName | null>(null);
  const [dropdownIndex, setDropdownIndex] = useState(0);

  // Refs for inputs
  const dateRef = useRef<HTMLInputElement>(null);
  const timeStartRef = useRef<HTMLInputElement>(null);
  const timeEndRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLInputElement>(null);

  // Field order for Tab navigation
  const fieldOrder: FieldName[] = ["date", "status", "timeStart", "timeEnd", "rating", "location", "tutor", "notes"];

  // Focus management
  useEffect(() => {
    if (focusedField === "date") dateRef.current?.focus();
    else if (focusedField === "timeStart") timeStartRef.current?.focus();
    else if (focusedField === "timeEnd") timeEndRef.current?.focus();
    else if (focusedField === "notes") notesRef.current?.focus();
  }, [focusedField]);

  // Handle save
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);

    try {
      const timeSlot = `${formData.timeStart} - ${formData.timeEnd}`;
      const updates = {
        session_date: formData.date,
        time_slot: timeSlot,
        location: formData.location,
        tutor_id: formData.tutorId || undefined,
        session_status: formData.status,
        performance_rating: formData.rating > 0 ? formData.rating.toString() : undefined,
        notes: formData.notes || undefined,
      };

      const updatedSession = await sessionsAPI.updateSession(session.id, updates);
      updateSessionInCache(updatedSession);
      onSave?.(updatedSession);
      onClose();
    } catch (err) {
      setError("Failed to save changes");
      setIsSaving(false);
    }
  }, [session.id, formData, onSave, onClose]);

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle dropdown navigation
      if (dropdownOpen) {
        if (e.key === "ArrowDown" || e.key === "j") {
          e.preventDefault();
          let maxIndex = 0;
          if (dropdownOpen === "location") maxIndex = (locations?.length || 1) - 1;
          else if (dropdownOpen === "tutor") maxIndex = (tutors?.length || 1) - 1;
          else if (dropdownOpen === "status") maxIndex = SESSION_STATUSES.length - 1;
          setDropdownIndex((prev) => Math.min(prev + 1, maxIndex));
          return;
        }
        if (e.key === "ArrowUp" || e.key === "k") {
          e.preventDefault();
          setDropdownIndex((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          // Select current dropdown item
          if (dropdownOpen === "location" && locations) {
            setFormData((prev) => ({ ...prev, location: locations[dropdownIndex] }));
          } else if (dropdownOpen === "tutor" && tutors) {
            setFormData((prev) => ({ ...prev, tutorId: tutors[dropdownIndex].id }));
          } else if (dropdownOpen === "status") {
            setFormData((prev) => ({ ...prev, status: SESSION_STATUSES[dropdownIndex] }));
          }
          setDropdownOpen(null);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setDropdownOpen(null);
          return;
        }
        return;
      }

      // Normal navigation
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSave();
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        const currentIndex = fieldOrder.indexOf(focusedField);
        if (e.shiftKey) {
          const newIndex = currentIndex > 0 ? currentIndex - 1 : fieldOrder.length - 1;
          setFocusedField(fieldOrder[newIndex]);
        } else {
          const newIndex = currentIndex < fieldOrder.length - 1 ? currentIndex + 1 : 0;
          setFocusedField(fieldOrder[newIndex]);
        }
        return;
      }

      // Open dropdown for dropdown fields
      if ((e.key === "Enter" || e.key === " ") && ["location", "tutor", "status"].includes(focusedField)) {
        e.preventDefault();
        setDropdownOpen(focusedField as FieldName);
        // Set initial index based on current value
        if (focusedField === "location" && locations) {
          setDropdownIndex(Math.max(0, locations.indexOf(formData.location)));
        } else if (focusedField === "tutor" && tutors) {
          setDropdownIndex(Math.max(0, tutors.findIndex((t) => t.id === formData.tutorId)));
        } else if (focusedField === "status") {
          setDropdownIndex(Math.max(0, SESSION_STATUSES.indexOf(formData.status)));
        }
        return;
      }

      // Rating with number keys
      if (focusedField === "rating" && e.key >= "0" && e.key <= "5") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setFormData((prev) => ({ ...prev, rating: parseInt(e.key) }));
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusedField, dropdownOpen, dropdownIndex, locations, tutors, formData, onClose, handleSave, fieldOrder]);

  // Get tutor name by ID
  const getTutorName = (id: number | null) => {
    if (!id || !tutors) return "—";
    const tutor = tutors.find((t) => t.id === id);
    return tutor?.tutor_name || "—";
  };

  const inputStyle = {
    backgroundColor: "var(--zen-bg)",
    border: "1px solid var(--zen-border)",
    color: "var(--zen-fg)",
    padding: "4px 8px",
    fontFamily: "inherit",
    fontSize: "12px",
    outline: "none",
  };

  const focusedStyle = {
    ...inputStyle,
    border: "1px solid var(--zen-accent)",
    boxShadow: "0 0 5px var(--zen-accent)",
  };

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
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
          paddingBottom: "8px",
          borderBottom: "1px solid var(--zen-border)",
        }}
      >
        <span style={{ color: "var(--zen-accent)", fontWeight: "bold" }}>
          EDIT SESSION
        </span>
        <span style={{ color: "var(--zen-dim)", fontSize: "11px" }}>
          Ctrl+Enter save • Esc cancel
        </span>
      </div>

      {/* Form Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px 24px",
          fontSize: "12px",
        }}
      >
        {/* Date */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: "var(--zen-dim)", minWidth: "60px" }}>Date:</span>
          <input
            ref={dateRef}
            type="date"
            value={formData.date}
            onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
            onFocus={() => setFocusedField("date")}
            style={focusedField === "date" ? focusedStyle : inputStyle}
          />
        </div>

        {/* Status */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", position: "relative" }}>
          <span style={{ color: "var(--zen-dim)", minWidth: "60px" }}>Status:</span>
          <button
            onClick={() => {
              setFocusedField("status");
              setDropdownOpen("status");
              setDropdownIndex(Math.max(0, SESSION_STATUSES.indexOf(formData.status)));
            }}
            onFocus={() => setFocusedField("status")}
            style={{
              ...(focusedField === "status" ? focusedStyle : inputStyle),
              cursor: "pointer",
              minWidth: "160px",
              textAlign: "left",
            }}
          >
            {formData.status} ▼
          </button>
          {dropdownOpen === "status" && (
            <DropdownList
              items={SESSION_STATUSES}
              selectedIndex={dropdownIndex}
              onSelect={(item) => {
                setFormData((prev) => ({ ...prev, status: item }));
                setDropdownOpen(null);
              }}
            />
          )}
        </div>

        {/* Time Start */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: "var(--zen-dim)", minWidth: "60px" }}>Time:</span>
          <input
            ref={timeStartRef}
            type="time"
            value={formData.timeStart}
            onChange={(e) => setFormData((prev) => ({ ...prev, timeStart: e.target.value }))}
            onFocus={() => setFocusedField("timeStart")}
            style={focusedField === "timeStart" ? focusedStyle : inputStyle}
          />
          <span style={{ color: "var(--zen-dim)" }}>-</span>
          <input
            ref={timeEndRef}
            type="time"
            value={formData.timeEnd}
            onChange={(e) => setFormData((prev) => ({ ...prev, timeEnd: e.target.value }))}
            onFocus={() => setFocusedField("timeEnd")}
            style={focusedField === "timeEnd" ? focusedStyle : inputStyle}
          />
        </div>

        {/* Rating */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: "var(--zen-dim)", minWidth: "60px" }}>Rating:</span>
          <div
            onClick={() => setFocusedField("rating")}
            style={{
              ...(focusedField === "rating" ? focusedStyle : inputStyle),
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            {formData.rating > 0
              ? "★".repeat(formData.rating) + "☆".repeat(5 - formData.rating)
              : "☆☆☆☆☆"}
            <span style={{ color: "var(--zen-dim)", marginLeft: "8px", fontSize: "10px" }}>
              (0-5)
            </span>
          </div>
        </div>

        {/* Location */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", position: "relative" }}>
          <span style={{ color: "var(--zen-dim)", minWidth: "60px" }}>Location:</span>
          <button
            onClick={() => {
              setFocusedField("location");
              setDropdownOpen("location");
              if (locations) setDropdownIndex(Math.max(0, locations.indexOf(formData.location)));
            }}
            onFocus={() => setFocusedField("location")}
            style={{
              ...(focusedField === "location" ? focusedStyle : inputStyle),
              cursor: "pointer",
              minWidth: "120px",
              textAlign: "left",
            }}
          >
            {formData.location || "—"} ▼
          </button>
          {dropdownOpen === "location" && locations && (
            <DropdownList
              items={locations}
              selectedIndex={dropdownIndex}
              onSelect={(item) => {
                setFormData((prev) => ({ ...prev, location: item }));
                setDropdownOpen(null);
              }}
            />
          )}
        </div>

        {/* Tutor */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", position: "relative" }}>
          <span style={{ color: "var(--zen-dim)", minWidth: "60px" }}>Tutor:</span>
          <button
            onClick={() => {
              setFocusedField("tutor");
              setDropdownOpen("tutor");
              if (tutors) setDropdownIndex(Math.max(0, tutors.findIndex((t) => t.id === formData.tutorId)));
            }}
            onFocus={() => setFocusedField("tutor")}
            style={{
              ...(focusedField === "tutor" ? focusedStyle : inputStyle),
              cursor: "pointer",
              minWidth: "120px",
              textAlign: "left",
            }}
          >
            {getTutorName(formData.tutorId)} ▼
          </button>
          {dropdownOpen === "tutor" && tutors && (
            <DropdownList
              items={tutors.map((t) => t.tutor_name)}
              selectedIndex={dropdownIndex}
              onSelect={(_, idx) => {
                setFormData((prev) => ({ ...prev, tutorId: tutors[idx].id }));
                setDropdownOpen(null);
              }}
            />
          )}
        </div>
      </div>

      {/* Notes - Full Width */}
      <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ color: "var(--zen-dim)", minWidth: "60px", fontSize: "12px" }}>Notes:</span>
        <input
          ref={notesRef}
          type="text"
          value={formData.notes}
          onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
          onFocus={() => setFocusedField("notes")}
          placeholder="Session notes..."
          style={{
            ...(focusedField === "notes" ? focusedStyle : inputStyle),
            flex: 1,
          }}
        />
      </div>

      {/* Error Message */}
      {error && (
        <div style={{ marginTop: "8px", color: "var(--zen-error)", fontSize: "11px" }}>
          {error}
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          marginTop: "12px",
          paddingTop: "8px",
          borderTop: "1px solid var(--zen-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ color: "var(--zen-dim)", fontSize: "10px" }}>
          Tab: next field • Enter: open dropdown • ↑↓: navigate • 0-5: rating
        </span>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={onClose}
            disabled={isSaving}
            style={{
              padding: "4px 12px",
              backgroundColor: "transparent",
              border: "1px solid var(--zen-dim)",
              color: "var(--zen-dim)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "12px",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              padding: "4px 12px",
              backgroundColor: "transparent",
              border: "1px solid var(--zen-accent)",
              color: "var(--zen-accent)",
              cursor: isSaving ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              fontSize: "12px",
              opacity: isSaving ? 0.5 : 1,
            }}
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Simple dropdown list component
 */
function DropdownList({
  items,
  selectedIndex,
  onSelect,
}: {
  items: string[];
  selectedIndex: number;
  onSelect: (item: string, index: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  return (
    <div
      ref={listRef}
      style={{
        position: "absolute",
        top: "100%",
        left: "68px",
        zIndex: 100,
        backgroundColor: "var(--zen-bg)",
        border: "1px solid var(--zen-accent)",
        maxHeight: "200px",
        overflowY: "auto",
        minWidth: "160px",
      }}
    >
      {items.map((item, idx) => (
        <div
          key={idx}
          ref={idx === selectedIndex ? selectedRef : undefined}
          onClick={() => onSelect(item, idx)}
          style={{
            padding: "4px 8px",
            cursor: "pointer",
            backgroundColor: idx === selectedIndex ? "var(--zen-selection)" : "transparent",
            color: idx === selectedIndex ? "var(--zen-accent)" : "var(--zen-fg)",
            borderLeft: idx === selectedIndex ? "2px solid var(--zen-accent)" : "2px solid transparent",
            fontSize: "12px",
          }}
        >
          {idx === selectedIndex && "> "}
          {item}
        </div>
      ))}
    </div>
  );
}

export default ZenEditSession;
