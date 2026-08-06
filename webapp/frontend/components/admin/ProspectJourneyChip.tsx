"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatProspectCode } from "@/lib/regular-utils";
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
 *
 * The chip names a record staff usually want to read — the primary tutor's
 * remark is often the reason an application is worth a second look — so it is
 * always a way in, never inert. Hosts that can stack a modal pass
 * onProspectClick; everything else deep-links to the prospects page with the
 * row focused. Same button-or-link shape as summer's PrimaryBranchChip, so one
 * chip behaves the same wherever it turns up.
 */
export function ProspectJourneyChip({
  journey,
  className,
  onProspectClick,
}: {
  journey?: RegularProspectJourney | null;
  className?: string;
  onProspectClick?: (prospectId: number) => void;
}) {
  if (!journey) return null;

  const branch = journey.source_branch || "P6";
  // The same helper every other prospect-code display uses, so the chip and
  // the prospect pages can't render one student's code two ways.
  const origin = journey.source_branch
    ? formatProspectCode(journey.source_branch, journey.primary_student_id)
    : branch;
  const label = journey.attended_summer
    ? `${origin} → summer → regular`
    : `${origin} → regular`;
  const summer = journey.attended_summer
    ? "Took the summer course."
    : "Did not take the summer course.";
  const journeyText = journey.primary_student_id
    ? `P6 prospect from ${branch}, ${origin}. ${summer}`
    : `P6 prospect from ${branch}. ${summer}`;
  const title = `${journeyText} Open the prospect record.`;

  const chipClass = cn(
    "shrink-0 inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap transition-opacity hover:opacity-80",
    journey.attended_summer
      ? "text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20"
      : "text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-900/20",
    className,
  );

  // Both shapes stop propagation: the chip sits on a card whose own click
  // opens the application, and reading the prospect is not that.
  if (onProspectClick) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onProspectClick(journey.prospect_id); }}
        className={chipClass}
        title={title}
      >
        {label}
      </button>
    );
  }
  return (
    <Link
      href={`/admin/prospects?focus=${journey.prospect_id}`}
      onClick={(e) => e.stopPropagation()}
      className={chipClass}
      title={title}
    >
      {label}
    </Link>
  );
}
