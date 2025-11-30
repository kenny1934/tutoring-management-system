"use client";

import { cn } from "@/lib/utils";
import { getSessionStatusConfig } from "@/lib/session-status";

interface SessionStatusTagProps {
  status: string;
  className?: string;
  size?: "sm" | "md";
  showIcon?: boolean;
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
}: SessionStatusTagProps) {
  const { bgClass, Icon, iconClass } = getSessionStatusConfig(status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md font-medium text-white",
        bgClass,
        size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-sm",
        className
      )}
    >
      {showIcon && <Icon className={cn(size === "sm" ? "h-3 w-3" : "h-4 w-4", iconClass)} />}
      <span className="truncate">{status}</span>
    </span>
  );
}
