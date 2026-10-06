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
 * Session status tag. With its word, it is the status's icon and word in the
 * status colour, with no fill, as statuses read in the supply order app. Icon
 * only, the word is gone, so the tag needs a solid block of colour to be told
 * apart at a glance: a small badge with a white icon, which also shows the
 * icon accents (yellow for a make-up, blue for a trial). A pale fill was tried
 * and was too faint at this size.
 */
export function SessionStatusTag({
  status,
  className,
  size = "md",
  showIcon = true,
  iconOnly = false,
}: SessionStatusTagProps) {
  const { textClass, badgeClass, iconClass, Icon } = getSessionStatusConfig(status);

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium",
        iconOnly
          ? cn("justify-center rounded p-1 text-white", badgeClass)
          : cn("gap-1", textClass, size === "sm" ? "text-xs" : "text-sm"),
        className
      )}
      title={iconOnly ? status : undefined}
    >
      {showIcon && <Icon className={cn(size === "sm" ? "h-3 w-3" : "h-4 w-4", iconOnly && iconClass)} />}
      {!iconOnly && <span className="truncate">{status}</span>}
    </span>
  );
}
