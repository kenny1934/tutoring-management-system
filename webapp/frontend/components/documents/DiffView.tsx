"use client";

import { Fragment } from "react";
import type { DiffSegment } from "@/lib/document-diff";

interface DiffViewProps {
  segments: DiffSegment[];
}

const PLACEHOLDER_RE = /^\[(Math: .+?|Image|Diagram|Answer Section)\]$/;

/**
 * Renders a single segment value, converting newlines to <br /> and
 * styling placeholder tokens (e.g. [Math: x^2], [Image]) as pills.
 */
function renderValue(value: string) {
  // Split on newlines, render each part
  const parts = value.split("\n");
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {PLACEHOLDER_RE.test(part.trim()) ? (
        <span className="inline-block px-1.5 py-0.5 mx-0.5 text-[10px] font-mono bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded italic">
          {part.trim()}
        </span>
      ) : (
        part
      )}
    </Fragment>
  ));
}

export function DiffView({ segments }: DiffViewProps) {
  if (segments.length === 0) {
    return (
      <p className="text-gray-400 dark:text-gray-500 italic text-sm">
        No content to compare.
      </p>
    );
  }

  return (
    <div className="whitespace-pre-wrap leading-relaxed text-[14px]">
      {segments.map((seg, i) => {
        if (seg.added) {
          return (
            <span
              key={i}
              className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded-sm"
            >
              {renderValue(seg.value)}
            </span>
          );
        }
        if (seg.removed) {
          return (
            <span
              key={i}
              className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 line-through rounded-sm"
            >
              {renderValue(seg.value)}
            </span>
          );
        }
        return (
          <span key={i}>
            {renderValue(seg.value)}
          </span>
        );
      })}
    </div>
  );
}
