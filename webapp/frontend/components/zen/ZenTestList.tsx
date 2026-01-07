"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { CalendarEvent } from "@/types";
import { useZenKeyboardFocus } from "@/contexts/ZenKeyboardFocusContext";

interface ZenTestListProps {
  events: CalendarEvent[];
  isLoading?: boolean;
  maxItems?: number;
}

/**
 * Terminal-style upcoming tests/exams list with keyboard navigation
 *
 * Keyboard controls:
 * - j/↓: Move cursor down
 * - k/↑: Move cursor up
 * - Enter: Toggle detail view
 */
export function ZenTestList({
  events,
  isLoading = false,
  maxItems = 5,
}: ZenTestListProps) {
  const [expandedEventId, setExpandedEventId] = useState<number | null>(null);
  const [cursorIndex, setCursorIndex] = useState(0);

  // Keyboard focus context
  const { isFocused, setFocusedSection } = useZenKeyboardFocus();

  // Ref for auto-scroll on cursor movement
  const cursorRowRef = useRef<HTMLDivElement>(null);

  // Filter to only future events and sort by date
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingEvents = events
    .filter((event) => {
      const eventDate = new Date(event.start_date);
      return eventDate >= today;
    })
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
    .slice(0, maxItems);

  const currentEvent = upcomingEvents[cursorIndex];

  // Keyboard navigation handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Only handle if not in an input
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      // Only handle if this section has focus
      if (!isFocused("tests")) {
        return;
      }

      // Only work when tests section has items
      if (upcomingEvents.length === 0) return;

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          if (cursorIndex < upcomingEvents.length - 1) {
            setCursorIndex(cursorIndex + 1);
          }
          break;

        case "k":
        case "ArrowUp":
          e.preventDefault();
          if (cursorIndex > 0) {
            setCursorIndex(cursorIndex - 1);
          }
          break;

        case "Enter":
          // Toggle detail view for current event
          if (currentEvent) {
            e.preventDefault();
            setExpandedEventId((prev) =>
              prev === currentEvent.id ? null : currentEvent.id
            );
          }
          break;
      }
    },
    [currentEvent, upcomingEvents.length, cursorIndex, isFocused]
  );

  // Register keyboard handler
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Auto-scroll to keep cursor visible
  useEffect(() => {
    if (cursorRowRef.current) {
      cursorRowRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [cursorIndex]);

  // Reset cursor if events change
  useEffect(() => {
    if (cursorIndex >= upcomingEvents.length) {
      setCursorIndex(Math.max(0, upcomingEvents.length - 1));
    }
  }, [upcomingEvents.length, cursorIndex]);

  if (isLoading) {
    return (
      <div style={{ color: "var(--zen-dim)" }}>Loading tests...</div>
    );
  }

  if (upcomingEvents.length === 0) {
    return (
      <div style={{ color: "var(--zen-dim)" }}>No upcoming tests scheduled.</div>
    );
  }

  const hasFocus = isFocused("tests");

  return (
    <div
      className="zen-test-list"
      onClick={() => setFocusedSection("tests")}
      style={{
        outline: hasFocus ? "1px solid var(--zen-accent)" : "1px solid transparent",
        outlineOffset: "4px",
        borderRadius: "4px",
        transition: "outline-color 0.15s ease",
      }}
    >
      {upcomingEvents.map((event, index) => {
        const daysUntil = getDaysUntil(event.start_date);
        const urgency = getUrgency(daysUntil);
        const urgencyColor = getUrgencyColor(urgency);
        const isAtCursor = index === cursorIndex;
        const isExpanded = expandedEventId === event.id;

        return (
          <div key={event.id} ref={isAtCursor ? cursorRowRef : undefined}>
            <div
              onClick={() => {
                setFocusedSection("tests");
                setCursorIndex(index);
                setExpandedEventId((prev) =>
                  prev === event.id ? null : event.id
                );
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "4px 0",
                borderBottom: isExpanded ? "none" : "1px dotted var(--zen-border)",
                cursor: "pointer",
                backgroundColor: isAtCursor ? "var(--zen-selection)" : "transparent",
                borderLeft: isAtCursor
                  ? "2px solid var(--zen-accent)"
                  : "2px solid transparent",
                paddingLeft: "4px",
              }}
            >
              {/* Cursor indicator */}
              <span
                style={{
                  width: "12px",
                  color: isAtCursor ? "var(--zen-accent)" : "transparent",
                  textShadow: isAtCursor ? "var(--zen-glow)" : "none",
                }}
              >
                {isAtCursor ? ">" : " "}
              </span>

              {/* Days countdown */}
              <span
                style={{
                  minWidth: "50px",
                  color: `var(--zen-${urgencyColor})`,
                  fontWeight: urgency === "urgent" ? "bold" : "normal",
                  textShadow: urgency === "urgent" ? "var(--zen-glow)" : "none",
                }}
              >
                {formatDaysUntil(daysUntil)}
              </span>

              {/* Separator */}
              <span style={{ color: "var(--zen-border)" }}>|</span>

              {/* Event title */}
              <span
                style={{
                  flex: 1,
                  color: "var(--zen-fg)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {event.title}
              </span>

              {/* Description indicator */}
              {event.description && (
                <span
                  style={{
                    color: "var(--zen-accent)",
                    fontSize: "10px",
                  }}
                  title="Has syllabus details"
                >
                  [+]
                </span>
              )}

              {/* Grade */}
              {event.grade && (
                <span
                  style={{
                    padding: "0 6px",
                    backgroundColor: "var(--zen-selection)",
                    color: "var(--zen-fg)",
                    borderRadius: "2px",
                    fontSize: "11px",
                  }}
                >
                  {event.grade}
                  {event.academic_stream || ""}
                </span>
              )}

              {/* School(s) */}
              <span
                style={{
                  color: "var(--zen-dim)",
                  fontSize: "11px",
                  minWidth: "80px",
                  textAlign: "right",
                }}
              >
                {event.school || "All"}
              </span>
            </div>

            {/* Expanded detail view */}
            {isExpanded && (
              <div
                style={{
                  marginLeft: "16px",
                  marginBottom: "8px",
                  padding: "8px 12px",
                  borderLeft: "2px solid var(--zen-accent)",
                  borderBottom: "1px dotted var(--zen-border)",
                  backgroundColor: "var(--zen-selection)",
                }}
              >
                <div style={{ marginBottom: "4px" }}>
                  <span style={{ color: "var(--zen-dim)" }}>Title: </span>
                  <span style={{ color: "var(--zen-fg)", fontWeight: "bold" }}>
                    {event.title}
                  </span>
                </div>
                <div style={{ marginBottom: "4px" }}>
                  <span style={{ color: "var(--zen-dim)" }}>Date: </span>
                  <span style={{ color: "var(--zen-fg)" }}>
                    {formatDate(event.start_date)}
                  </span>
                  <span style={{ color: "var(--zen-dim)", marginLeft: "8px" }}>
                    ({formatDaysUntil(daysUntil)})
                  </span>
                </div>
                {event.school && (
                  <div style={{ marginBottom: "4px" }}>
                    <span style={{ color: "var(--zen-dim)" }}>School: </span>
                    <span style={{ color: "var(--zen-fg)" }}>{event.school}</span>
                  </div>
                )}
                {event.grade && (
                  <div style={{ marginBottom: "4px" }}>
                    <span style={{ color: "var(--zen-dim)" }}>Grade: </span>
                    <span style={{ color: "var(--zen-fg)" }}>
                      {event.grade}
                      {event.academic_stream ? ` ${event.academic_stream}` : ""}
                    </span>
                  </div>
                )}
                {event.description && (
                  <div style={{ marginTop: "8px" }}>
                    <span style={{ color: "var(--zen-accent)" }}>Syllabus:</span>
                    <div
                      style={{
                        color: "var(--zen-fg)",
                        marginTop: "4px",
                        whiteSpace: "pre-wrap",
                        fontSize: "12px",
                        lineHeight: "1.4",
                      }}
                    >
                      {event.description}
                    </div>
                  </div>
                )}
                <div
                  style={{
                    marginTop: "8px",
                    color: "var(--zen-dim)",
                    fontSize: "10px",
                  }}
                >
                  Press <span style={{ color: "var(--zen-fg)" }}>Enter</span> or click to close
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Navigation hint */}
      <div
        style={{
          marginTop: "8px",
          color: "var(--zen-dim)",
          fontSize: "10px",
        }}
      >
        Click or <span style={{ color: "var(--zen-fg)" }}>Enter</span> to expand details
      </div>
    </div>
  );
}

/**
 * Get number of days until a date
 */
function getDaysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(dateStr);
  date.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Format days until as readable string
 */
function formatDaysUntil(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "1d";
  if (days < 0) return `${-days}d ago`;
  return `${days}d`;
}

/**
 * Format date for display
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Get urgency level based on days until
 */
function getUrgency(days: number): "urgent" | "soon" | "normal" {
  if (days <= 1) return "urgent";
  if (days <= 7) return "soon";
  return "normal";
}

/**
 * Get color for urgency level
 */
function getUrgencyColor(urgency: "urgent" | "soon" | "normal"): string {
  switch (urgency) {
    case "urgent":
      return "error";
    case "soon":
      return "warning";
    default:
      return "dim";
  }
}

export default ZenTestList;
