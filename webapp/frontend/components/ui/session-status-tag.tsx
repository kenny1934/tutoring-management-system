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
 * Session status tag: the status's icon and its word in the status colour,
 * with no fill, as statuses read in the supply order app. The icon is what
 * people pick out first when scanning a list, so it stays. The words already
 * say whether an attended session was a make-up or a trial, so the tag drops
 * the strip's icon accents, which were chosen for a solid fill.
 */
export function SessionStatusTag({
  status,
  className,
  size = "md",
  showIcon = true,
  iconOnly = false,
}: SessionStatusTagProps) {
  const { textClass, Icon } = getSessionStatusConfig(status);

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium",
        textClass,
        iconOnly ? "p-1" : "gap-1",
        !iconOnly && (size === "sm" ? "text-xs" : "text-sm"),
        className
      )}
      title={iconOnly ? status : undefined}
    >
      {showIcon && <Icon className={size === "sm" ? "h-3 w-3" : "h-4 w-4"} />}
      {!iconOnly && <span className="truncate">{status}</span>}
    </span>
  );
}
