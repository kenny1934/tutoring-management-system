"use client";

import type { ActivityEvent } from "@/types";

interface ZenActivityFeedProps {
  events: ActivityEvent[];
  isLoading?: boolean;
  maxItems?: number;
}

/**
 * Terminal-style activity feed showing recent events
 */
export function ZenActivityFeed({
  events,
  isLoading = false,
  maxItems = 5,
}: ZenActivityFeedProps) {
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

  const displayEvents = events.slice(0, maxItems);

  return (
    <div className="zen-activity-feed">
      {displayEvents.map((event) => {
        const icon = getEventIcon(event.type);
        const color = getEventColor(event.type);
        const timeAgo = formatTimeAgo(event.timestamp);

        return (
          <div
            key={event.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "4px 0",
              borderBottom: "1px dotted var(--zen-border)",
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

/**
 * Format timestamp as relative time
 */
function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default ZenActivityFeed;
