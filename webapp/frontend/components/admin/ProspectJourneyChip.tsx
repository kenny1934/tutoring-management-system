"use client";

import { cn } from "@/lib/utils";
import type { RegularProspectJourney } from "@/types";

/**
 * Short-form journey chip for a regular application whose applicant was a
 * tracked P6 prospect. Sits beside the New / Claims-existing origin chip, never
 * replacing it. Two shapes:
 *   - skipped summer: "MAC -> regular"
 *   - did summer:     "MAC -> summer -> regular"
 * Applications with no linked prospect render nothing.
 */
export function ProspectJourneyChip({
  journey,
  className,
}: {
  journey?: RegularProspectJourney | null;
  className?: string;
}) {
  if (!journey) return null;

  const branch = journey.source_branch || "P6";
  const label = journey.attended_summer
    ? `${branch} → summer → regular`
    : `${branch} → regular`;
  const title = journey.attended_summer
    ? `P6 prospect from ${branch}. Took the summer course.`
    : `P6 prospect from ${branch}. Did not take the summer course.`;

  return (
    <span
      className={cn(
        "shrink-0 inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap",
        journey.attended_summer
          ? "text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20"
          : "text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-900/20",
        className,
      )}
      title={title}
      onClick={(e) => e.stopPropagation()}
    >
      {label}
    </span>
  );
}
