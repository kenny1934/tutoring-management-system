"use client";

import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { BRANCH_INFO } from "@/lib/summer-utils";
import type { SummerApplication } from "@/types";

type LinkedStudent = NonNullable<SummerApplication["linked_student"]>;
type LinkedProspect = NonNullable<SummerApplication["linked_prospect"]>;

type BranchChipApp = Pick<SummerApplication, "linked_student" | "linked_prospect" | "claimed_branch_code" | "is_existing_student" | "verified_branch_origin">;

/** True if the applicant has any signal of being an existing student — linked
 *  record, verified existing origin, or an unverified claim. Kept next to the
 *  chip so the filter bucket and the badge can't drift. */
export function isExistingOrigin(app: BranchChipApp): boolean {
  if (app.linked_student || app.linked_prospect) return true;
  if (app.verified_branch_origin && app.verified_branch_origin !== "New") return true;
  if (app.claimed_branch_code && app.is_existing_student && app.is_existing_student !== "None") {
    return true;
  }
  return false;
}

function StudentChip({ student }: { student: LinkedStudent }) {
  return (
    <a
      href={`/students/${student.id}?tab=profile`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold font-mono text-primary bg-primary/10 hover:bg-primary/15 px-1.5 py-0.5 rounded transition-colors"
      title={`Linked to ${student.student_name}`}
    >
      <BadgeCheck className="h-3 w-3" />
      {student.home_location && student.school_student_id
        ? `${student.home_location}-${student.school_student_id}`
        : student.school_student_id || `#${student.id}`}
    </a>
  );
}

function ProspectChip({
  prospect,
  asFrom,
  onProspectClick,
}: {
  prospect: LinkedProspect;
  asFrom?: boolean;
  onProspectClick?: (prospectId: number) => void;
}) {
  const raw = prospect.primary_student_id;
  const stripped = raw
    ? raw.startsWith(prospect.source_branch)
      ? raw.slice(prospect.source_branch.length)
      : raw
    : "";
  const code = stripped
    ? `${prospect.source_branch}-${stripped}`
    : prospect.source_branch;
  const chipClass = cn(
    "shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold font-mono px-1.5 py-0.5 rounded transition-opacity hover:opacity-80",
    BRANCH_INFO[prospect.source_branch]?.badge ||
      "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  );
  // When rendered alongside a student chip, prefix with "from" so admins read
  // it as the primary-branch origin, not a redundant second branch claim.
  const title = asFrom
    ? `Came from prospect: ${prospect.student_name}`
    : `Linked to prospect: ${prospect.student_name}`;
  const inner = (
    <>
      <BadgeCheck className="h-3 w-3" />
      {asFrom && <span className="font-normal opacity-70">from</span>}
      {code}
    </>
  );
  if (onProspectClick) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onProspectClick(prospect.id); }}
        className={chipClass}
        title={title}
      >
        {inner}
      </button>
    );
  }
  return (
    <Link
      href={`/admin/summer/prospects?focus=${prospect.id}`}
      onClick={(e) => e.stopPropagation()}
      className={chipClass}
      title={title}
    >
      {inner}
    </Link>
  );
}

export function PrimaryBranchChip({
  app,
  onProspectClick,
}: {
  app: BranchChipApp;
  onProspectClick?: (prospectId: number) => void;
}) {
  const linkedStudent = app.linked_student;
  const linkedProspect = app.linked_prospect;
  const verified = app.verified_branch_origin;
  const claimedBranchCode = app.claimed_branch_code || null;
  const claimsExisting =
    !!claimedBranchCode &&
    !!app.is_existing_student &&
    app.is_existing_student !== "None";

  // Both linked: surface origin (prospect) alongside destination (student) so
  // admins don't have to dig into the prospects page to see the P6 origin.
  if (linkedStudent && linkedProspect) {
    return (
      <>
        <StudentChip student={linkedStudent} />
        <ProspectChip prospect={linkedProspect} asFrom onProspectClick={onProspectClick} />
      </>
    );
  }

  if (linkedStudent) {
    return <StudentChip student={linkedStudent} />;
  }

  if (linkedProspect) {
    return <ProspectChip prospect={linkedProspect} onProspectClick={onProspectClick} />;
  }

  // Verified branch origin overrides the claim
  if (verified) {
    if (verified === "New") {
      return (
        <span
          className="shrink-0 text-[10px] font-semibold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded"
          title="Verified: new student"
          onClick={(e) => e.stopPropagation()}
        >
          New
        </span>
      );
    }
    const branchColors = BRANCH_INFO[verified]?.badge || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
    return (
      <span
        className={cn("shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold font-mono px-1.5 py-0.5 rounded", branchColors)}
        title={`Verified: existing student at ${verified}`}
        onClick={(e) => e.stopPropagation()}
      >
        <BadgeCheck className="h-3 w-3" />
        {verified}
      </span>
    );
  }

  if (claimsExisting) {
    return (
      <span
        className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 px-1.5 py-0.5 rounded"
        title="Applicant claims to be an existing student — not yet verified"
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
