"use client";

import Link from "next/link";
import { getGradeColor } from "@/lib/constants";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface StudentInfoBadgesProps {
  student: {
    student_id?: number;
    student_name: string;
    school_student_id?: string;
    grade?: string;
    lang_stream?: string;
    school?: string;
    home_location?: string;
  };
  showLink?: boolean;
  showLocationPrefix?: boolean;
  trailing?: React.ReactNode;
  /** Tight sizing for dense contexts (calendar cards, slot lists). */
  compact?: boolean;
  /** Tooltip for the name element — e.g. to surface a self-filled original
   *  when the displayed name comes from a linked CSM student. */
  nameTitle?: string;
  /** Optional click handler on the name. When set, the name renders as a
   *  button; otherwise it stays a plain span. */
  onNameClick?: () => void;
}

/**
 * Displays student info with consistent badge styling.
 * Order: school_student_id → name → link → grade badge → school badge → trailing
 */
export function StudentInfoBadges({
  student,
  showLink,
  showLocationPrefix,
  trailing,
  compact = false,
  nameTitle,
  onNameClick,
}: StudentInfoBadgesProps) {
  // Format student ID with optional location prefix (e.g., "MSA-1234")
  const studentIdDisplay = showLocationPrefix && student.home_location
    ? `${student.home_location}-${student.school_student_id || ""}`
    : student.school_student_id;

  const nameClass = cn(
    "font-semibold text-gray-900 dark:text-white",
    compact ? "text-[10px]" : "text-sm",
    onNameClick && "cursor-pointer hover:text-primary hover:underline text-left truncate",
  );

  return (
    <div className={cn("flex items-center flex-wrap", compact ? "gap-1" : "gap-1.5")}>
      {studentIdDisplay && (
        <span
          className={cn(
            "text-gray-500 dark:text-gray-400 font-mono",
            compact ? "text-[9px]" : "text-[10px]",
          )}
        >
          {studentIdDisplay}
        </span>
      )}
      {onNameClick ? (
        <button type="button" className={nameClass} onClick={onNameClick} title={nameTitle}>
          {student.student_name}
        </button>
      ) : (
        <span className={nameClass} title={nameTitle}>
          {student.student_name}
        </span>
      )}
      {showLink && student.student_id && (
        <Link
          href={`/students/${student.student_id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-[#a0704b] hover:text-[#8a5f3e] transition-colors"
        >
          <ExternalLink className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        </Link>
      )}
      {student.grade && (
        <span
          className={cn(
            "rounded text-gray-800",
            compact ? "text-[8px] font-bold px-1 py-0" : "text-[10px] px-1.5 py-0.5",
          )}
          style={{ backgroundColor: getGradeColor(student.grade, student.lang_stream) }}
        >
          {student.grade}{student.lang_stream || ''}
        </span>
      )}
      {student.school && (
        <span
          className={cn(
            "rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300",
            compact ? "text-[8px] px-1 py-0" : "text-[10px] px-1.5 py-0.5",
          )}
        >
          {student.school}
        </span>
      )}
      {trailing}
    </div>
  );
}
