"use client";

import { Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { homeworkCountLabel, homeworkCountTone } from "@/lib/homework-utils";
import { useHomeworkCounts } from "./HomeworkCountsProvider";

/**
 * Small pill showing how much homework is waiting to be checked in a session.
 * Renders nothing when the session has none, so rows stay quiet by default.
 */
export function HomeworkCheckBadge({
  sessionId,
  onClick,
  className,
}: {
  sessionId: number;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}) {
  const counts = useHomeworkCounts(sessionId);

  if (!counts || counts.total === 0) return null;

  const label = `${counts.checked}/${counts.total}`;
  const title = homeworkCountLabel(counts.checked, counts.total);

  const Element = onClick ? "button" : "span";

  return (
    <Element
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap",
        homeworkCountTone(counts.checked, counts.total),
        onClick && "hover:opacity-80 transition-opacity",
        className
      )}
    >
      <Home className="h-2.5 w-2.5" />
      HW {label}
    </Element>
  );
}
