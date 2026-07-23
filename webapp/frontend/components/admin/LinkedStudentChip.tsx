"use client";

import { BadgeCheck } from "lucide-react";

/** The minimum an application carries about the student record it is linked
 *  to. Both intakes return at least this much. */
export interface LinkedStudentChipStudent {
  id: number;
  student_name: string;
  school_student_id?: string | null;
  home_location?: string | null;
}

/**
 * The "this application is linked to a student record" badge, shown on
 * application cards in both intakes. Reads as the student's code (branch
 * prefixed when known) and opens the student's profile in a new tab.
 */
export function LinkedStudentChip({ student }: { student: LinkedStudentChipStudent }) {
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
