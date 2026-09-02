"use client";

import { StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * An application's internal note, one line with the full text on hover.
 *
 * Shared by the applications-list card and the arrangement page's unassigned
 * panel, which is why `compact` exists: the panel's cards are half the width,
 * so it takes the smaller type and icon.
 */
export function AdminNoteLine({
  note,
  compact = false,
  className,
}: {
  note?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const text = note?.trim();
  if (!text) return null;
  return (
    <span
      className={cn(
        "inline-flex items-start gap-1 min-w-0 text-amber-700 dark:text-amber-400",
        compact && "text-[9px] leading-snug",
        className,
      )}
      title={text}
    >
      <StickyNote className={cn("shrink-0", compact ? "h-2.5 w-2.5 mt-[1px]" : "h-3 w-3")} />
      <span className="truncate">{text}</span>
    </span>
  );
}
