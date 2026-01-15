"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useZenKeyboardFocus } from "@/contexts/ZenKeyboardFocusContext";
import { formatTimeAgo } from "@/lib/formatters";
import type { ActivityEvent } from "@/types";

interface ZenActivityFeedProps {
  events: ActivityEvent[];
  isLoading?: boolean;
  maxItems?: number;
}

/**
 * Terminal-style activity feed showing recent events
 */
// Convert GUI links to Zen equivalents
const getZenLink = (link: string | undefined): string | undefined => {
  if (!link) return undefined;
  // /sessions/123 → /zen/sessions (detail pages not ready yet)
  if (link.startsWith("/sessions")) return "/zen/sessions";
  // /enrollments/123 → /zen/students (enrollment is under students)
  if (link.startsWith("/enrollments")) return "/zen/students";
  // /students/123 → /zen/students
  if (link.startsWith("/students")) return "/zen/students";
  // Already a zen link
  if (link.startsWith("/zen")) return link;
  return undefined; // Don't navigate to unknown GUI pages
};

export function ZenActivityFeed({
  events,
  isLoading = false,
  maxItems = 5,
}: ZenActivityFeedProps) {
  const router = useRouter();
  const { isFocused } = useZenKeyboardFocus();
  const [cursorIndex, setCursorIndex] = useState(0);
  const cursorRowRef = useRef<HTMLDivElement>(null);

  const displayEvents = events.slice(0, maxItems);
  const hasFocus = isFocused("activity");

  // Reset cursor when events change
  useEffect(() => {
    setCursorIndex(0);
  }, [events]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Only handle if not in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Only handle if this section has focus
      if (!isFocused("activity")) {
        return;
      }

      const key = e.key.toLowerCase();

      switch (key) {
        case "j":
        case "arrowdown":
          e.preventDefault();
          if (cursorIndex < displayEvents.length - 1) {
            setCursorIndex(cursorIndex + 1);
          }
          break;
        case "k":
        case "arrowup":
          e.preventDefault();
          if (cursorIndex > 0) {
            setCursorIndex(cursorIndex - 1);
          }
          break;
        case "enter":
          e.preventDefault();
          const currentEvent = displayEvents[cursorIndex];
          if (currentEvent) {
            const zenLink = getZenLink(currentEvent.link);
            if (zenLink) {
              router.push(zenLink);
            }
          }
          break;
        case "g":
          // gg to go to first
          if (e.key === "g") {
            e.preventDefault();
            setCursorIndex(0);
          }
          break;
        case "home":
          e.preventDefault();
          setCursorIndex(0);
          break;
        case "end":
          e.preventDefault();
          setCursorIndex(displayEvents.length - 1);
          break;
      }

      // Shift+G for last item
      if (e.key === "G" && e.shiftKey) {
        e.preventDefault();
        setCursorIndex(displayEvents.length - 1);
      }
    },
    [cursorIndex, displayEvents, isFocused, router]
  );

  // Register global keyboard handler
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Auto-scroll to keep cursor visible
  useEffect(() => {
    if (cursorRowRef.current && hasFocus) {
      cursorRowRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [cursorIndex, hasFocus]);

  if (isLoading) {
    return (
      <div style={{ color: "var(--zen-dim)" }}>Loading activity...</div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div style={{ color: "var(--zen-dim)" }}>No recent activity.</div>
    );
  }

  return (
    <div
      className="zen-activity-feed"
      style={{
        outline: hasFocus ? "1px solid var(--zen-accent)" : "none",
        outlineOffset: "2px",
        padding: "2px",
      }}
    >
      {displayEvents.map((event, idx) => {
        const icon = getEventIcon(event.type);
        const color = getEventColor(event.type);
        const timeAgo = formatTimeAgo(event.timestamp);

        const zenLink = getZenLink(event.link);
        const isClickable = !!zenLink;
        const isAtCursor = idx === cursorIndex && hasFocus;

        const handleClick = () => {
          if (zenLink) {
            router.push(zenLink);
          }
        };

        const handleItemKeyDown = (e: React.KeyboardEvent) => {
          if (e.key === "Enter" && zenLink) {
            router.push(zenLink);
          }
        };

        return (
          <div
            key={event.id}
            ref={isAtCursor ? cursorRowRef : undefined}
            role={isClickable ? "button" : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onClick={isClickable ? handleClick : undefined}
            onKeyDown={isClickable ? handleItemKeyDown : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "4px 4px",
              borderBottom: "1px dotted var(--zen-border)",
              cursor: isClickable ? "pointer" : "default",
              transition: "background-color 0.1s ease",
              backgroundColor: isAtCursor ? "var(--zen-border)" : "transparent",
              borderLeft: isAtCursor ? "2px solid var(--zen-accent)" : "2px solid transparent",
            }}
            onMouseEnter={(e) => {
              if (!isAtCursor && isClickable) {
                e.currentTarget.style.backgroundColor = "var(--zen-border)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isAtCursor && isClickable) {
                e.currentTarget.style.backgroundColor = "transparent";
              }
            }}
            onFocus={(e) => {
              if (!isAtCursor && isClickable) {
                e.currentTarget.style.backgroundColor = "var(--zen-border)";
              }
            }}
            onBlur={(e) => {
              if (!isAtCursor && isClickable) {
                e.currentTarget.style.backgroundColor = "transparent";
              }
            }}
          >
            {/* Time ago */}
            <span
              style={{
                minWidth: "60px",
                color: "var(--zen-dim)",
                fontSize: "11px",
                textAlign: "right",
              }}
            >
              {timeAgo}
            </span>

            {/* Separator */}
            <span style={{ color: "var(--zen-border)" }}>|</span>

            {/* Icon */}
            <span
              style={{
                color: `var(--zen-${color})`,
                minWidth: "16px",
                textAlign: "center",
              }}
            >
              {icon}
            </span>

            {/* Title */}
            <span
              style={{
                color: "var(--zen-fg)",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {event.title}
            </span>

            {/* Student */}
            <span
              style={{
                color: "var(--zen-dim)",
                fontSize: "11px",
                maxWidth: "120px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {event.student}
              {event.school_student_id && (
                <span style={{ color: "var(--zen-border)" }}>
                  {" "}({event.school_student_id})
                </span>
              )}
            </span>

            {/* Link indicator */}
            {isClickable && (
              <span style={{ color: "var(--zen-dim)", fontSize: "10px" }}>→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Get icon for event type
 */
function getEventIcon(type: ActivityEvent["type"]): string {
  switch (type) {
    case "session_attended":
      return "\u2713"; // checkmark
    case "payment_received":
      return "$";
    case "new_enrollment":
      return "+";
    case "makeup_completed":
      return "\u21bb"; // refresh/cycle
    case "session_cancelled":
      return "\u2717"; // X
    case "session_rescheduled":
      return "\u2192"; // arrow
    case "sick_leave":
      return "\u25cb"; // circle
    case "weather_cancelled":
      return "\u2601"; // cloud (may not render in terminal, fallback handled)
    case "makeup_booked":
      return "\u21ba"; // counterclockwise
    default:
      return "\u2022"; // bullet
  }
}

/**
 * Get color for event type
 */
function getEventColor(type: ActivityEvent["type"]): string {
  switch (type) {
    case "session_attended":
    case "makeup_completed":
      return "success";
    case "payment_received":
      return "success";
    case "new_enrollment":
      return "accent";
    case "session_cancelled":
    case "weather_cancelled":
      return "error";
    case "sick_leave":
      return "warning";
    case "session_rescheduled":
    case "makeup_booked":
      return "warning";
    default:
      return "dim";
  }
}

export default ZenActivityFeed;
