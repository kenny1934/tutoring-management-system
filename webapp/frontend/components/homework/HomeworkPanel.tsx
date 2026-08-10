"use client";

import { Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { HomeworkCheckRow } from "./HomeworkCheckRow";
import type { HomeworkCompletion } from "@/types";

const OPEN_STATUSES = new Set([undefined, "Not Checked"]);

/** How many of these items have actually been looked at. */
export function checkedCount(items: HomeworkCompletion[]): number {
  return items.filter((hw) => !OPEN_STATUSES.has(hw.completion_status)).length;
}

/**
 * Homework carried over from earlier lessons, ready to mark.
 *
 * Renders nothing when the student has none outstanding, so it stays out of
 * the way on the sessions where it does not apply.
 */
export function HomeworkPanel({
  items,
  sessionId,
  readOnly,
  onMarked,
  title = "Homework from last lessons",
  className,
}: {
  items: HomeworkCompletion[];
  sessionId: number;
  readOnly?: boolean;
  onMarked?: (updated: HomeworkCompletion) => void;
  title?: string;
  className?: string;
}) {
  if (!items.length) return null;

  const done = checkedCount(items);
  const allDone = done === items.length;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <Home className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {title}
        </label>
        <span
          className={cn(
            "text-[11px] px-1.5 py-0.5 rounded font-medium tabular-nums ml-auto",
            allDone
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
          )}
        >
          {done}/{items.length}
        </span>
      </div>

      <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 px-3 divide-y divide-blue-200/60 dark:divide-blue-800/60">
        {items.map((hw) => (
          <HomeworkCheckRow
            key={hw.session_exercise_id}
            homework={hw}
            sessionId={sessionId}
            readOnly={readOnly}
            onMarked={onMarked}
          />
        ))}
      </div>

      {!readOnly && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Homework marks save as you tap them.
        </p>
      )}
    </div>
  );
}
