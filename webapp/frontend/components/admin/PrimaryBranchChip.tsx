"use client";

import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { BRANCH_INFO } from "@/lib/summer-utils";
import type { SummerApplication } from "@/types";

type BranchChipApp = Pick<SummerApplication, "linked_student" | "linked_prospect" | "claimed_branch_code" | "is_existing_student">;

export function PrimaryBranchChip({
  app,
  onProspectClick,
}: {
  app: BranchChipApp;
  onProspectClick?: (prospectId: number) => void;
}) {
  const linkedStudent = app.linked_student;
  const linkedProspect = app.linked_prospect;
  const claimedBranchCode = app.claimed_branch_code || null;
  const claimsExisting =
    !!claimedBranchCode &&
    !!app.is_existing_student &&
    app.is_existing_student !== "None";

  if (linkedStudent) {
    return (
      <a
        href={`/students/${linkedStudent.id}?tab=profile`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold font-mono text-primary bg-primary/10 hover:bg-primary/15 px-1.5 py-0.5 rounded transition-colors"
        title={`Linked to ${linkedStudent.student_name}`}
      >
        <BadgeCheck className="h-3 w-3" />
        {linkedStudent.home_location && linkedStudent.school_student_id
          ? `${linkedStudent.home_location}-${linkedStudent.school_student_id}`
          : linkedStudent.school_student_id || `#${linkedStudent.id}`}
      </a>
    );
  }

  if (linkedProspect) {
    const raw = linkedProspect.primary_student_id;
    const stripped = raw
      ? raw.startsWith(linkedProspect.source_branch)
        ? raw.slice(linkedProspect.source_branch.length)
        : raw
      : "";
    const label = stripped
      ? `${linkedProspect.source_branch}-${stripped}`
      : linkedProspect.source_branch;
    const chipClass = cn(
      "shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold font-mono px-1.5 py-0.5 rounded transition-opacity hover:opacity-80",
      BRANCH_INFO[linkedProspect.source_branch]?.badge ||
        "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
    );
    const title = `Linked to prospect: ${linkedProspect.student_name}`;
    if (onProspectClick) {
      return (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onProspectClick(linkedProspect.id); }}
          className={chipClass}
          title={title}
        >
          <BadgeCheck className="h-3 w-3" />
          {label}
        </button>
      );
    }
    return (
      <Link
        href={`/admin/summer/prospects?focus=${linkedProspect.id}`}
        onClick={(e) => e.stopPropagation()}
        className={chipClass}
        title={title}
      >
        <BadgeCheck className="h-3 w-3" />
        {label}
      </Link>
    );
  }

  if (claimsExisting) {
    return (
      <span
        className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 px-1.5 py-0.5 rounded"
        title="Applicant claims to be an existing student — not yet linked"
        onClick={(e) => e.stopPropagation()}
      >
        Claims: <span className="font-mono">{claimedBranchCode}</span>
      </span>
    );
  }

  return (
    <span
      className="shrink-0 text-[10px] font-semibold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded"
      title="New student — no prior enrolment"
      onClick={(e) => e.stopPropagation()}
    >
      New
    </span>
  );
}
