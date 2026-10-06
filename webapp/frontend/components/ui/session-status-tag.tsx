"use client";

import { cn } from "@/lib/utils";
import { getSessionStatusConfig } from "@/lib/session-status";

interface SessionStatusTagProps {
  status: string;
  className?: string;
  size?: "sm" | "md";
  showIcon?: boolean;
  iconOnly?: boolean;
}

/**
 * Session status tag, in the same hue as the status strip on session cards
 * but drawn as a tinted chip so its words stay readable at small sizes. The
 * icon takes the chip's text colour. The strips' icon accents (yellow for a
 * make-up, blue for a trial) were chosen for a green fill and would vanish on
 * a pale one, and the tag already says which it is in words.
 */
export function SessionStatusTag({
  status,
  className,
  size = "md",
  showIcon = true,
  iconOnly = false,
}: SessionStatusTagProps) {
  const { chipClass, Icon } = getSessionStatusConfig(status);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md font-medium",
        chipClass,
        iconOnly ? "p-1" : "gap-1.5",
        !iconOnly && (size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-sm"),
        className
      )}
      title={iconOnly ? status : undefined}
    >
      {showIcon && <Icon className={size === "sm" ? "h-3 w-3" : "h-4 w-4"} />}
      {!iconOnly && <span className="truncate">{status}</span>}
    </span>
  );
}
