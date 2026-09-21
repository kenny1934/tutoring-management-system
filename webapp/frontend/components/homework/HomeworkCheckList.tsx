"use client";

import { useMemo } from "react";
import { checkItems } from "@/lib/homework-check";
import { CheckViewerProvider } from "./CheckViewerProvider";
import { HomeworkCheckRow } from "./HomeworkCheckRow";
import type { HomeworkCompletion } from "@/types";

/**
 * One lesson's homework to check as a list of marking rows, with the Check
 * Viewer behind each row's Answers button stepping through the same list.
 * The panels, the popover and the exercise modal all draw it this way, and
 * only the list's own look differs between them.
 */
export function HomeworkCheckList({
  items,
  sessionId,
  readOnly,
  onMarked,
  className,
}: {
  items: HomeworkCompletion[];
  /** The lesson the marks are saved against. */
  sessionId: number;
  readOnly?: boolean;
  onMarked?: (updated: HomeworkCompletion) => void;
  className?: string;
}) {
  const viewerItems = useMemo(() => checkItems(items, sessionId), [items, sessionId]);
  return (
    <CheckViewerProvider items={viewerItems} readOnly={readOnly} onMarked={onMarked}>
      <div className={className}>
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
    </CheckViewerProvider>
  );
}
