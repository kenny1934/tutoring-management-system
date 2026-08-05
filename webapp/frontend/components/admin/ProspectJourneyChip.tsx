"use client";

import { cn } from "@/lib/utils";
import type { RegularProspectJourney } from "@/types";

/**
 * Short-form journey chip for a regular application whose applicant was a
 * tracked P6 prospect. Sits beside the New / Claims-existing origin chip, never
 * replacing it. Two shapes:
 *   - skipped summer: "MAC-1112 -> regular"
 *   - did summer:     "MAC-1112 -> summer -> regular"
 * The leading label is the applicant's code at their primary branch, which
 * already carries the branch as its prefix, so the chip stays one line while
 * being specific enough to reconcile against the branch's own records. Falls
 * back to the bare branch when a prospect has no code on file.
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
  const origin = journey.primary_student_code || branch;
  const label = journey.attended_summer
    ? `${origin} → summer → regular`
    : `${origin} → regular`;
  const summer = journey.attended_summer
    ? "Took the summer course."
    : "Did not take the summer course.";
  const title = journey.primary_student_code
    ? `P6 prospect from ${branch}, ${journey.primary_student_code}. ${summer}`
    : `P6 prospect from ${branch}. ${summer}`;

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
