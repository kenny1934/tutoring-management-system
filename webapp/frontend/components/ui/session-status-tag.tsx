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
 * Session status tag with consistent styling matching session cards.
 * Uses getSessionStatusConfig for colors and icons.
 */
export function SessionStatusTag({
  status,
  className,
  size = "md",
  showIcon = true,
  iconOnly = false,
}: SessionStatusTagProps) {
  const { bgClass, Icon, iconClass } = getSessionStatusConfig(status);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md font-medium text-white",
        bgClass,
        iconOnly ? "p-1" : "gap-1.5",
        !iconOnly && (size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-sm"),
        className
      )}
      title={iconOnly ? status : undefined}
    >
      {showIcon && <Icon className={cn(size === "sm" ? "h-3 w-3" : "h-4 w-4", iconClass)} />}
      {!iconOnly && <span className="truncate">{status}</span>}
    </span>
  );
}
