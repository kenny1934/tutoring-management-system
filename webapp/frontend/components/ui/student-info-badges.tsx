"use client";

import Link from "next/link";
import { getGradeColor } from "@/lib/constants";
import { ExternalLink } from "lucide-react";

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
}

/**
 * Displays student info with consistent badge styling.
 * Order: school_student_id → name → link → grade badge → school badge → trailing
 */
export function StudentInfoBadges({ student, showLink, showLocationPrefix, trailing }: StudentInfoBadgesProps) {
  // Format student ID with optional location prefix (e.g., "MSA-1234")
  const studentIdDisplay = showLocationPrefix && student.home_location
    ? `${student.home_location}-${student.school_student_id || ""}`
    : student.school_student_id;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {studentIdDisplay && (
        <span className="text-gray-500 dark:text-gray-400 font-mono text-[10px]">
          {studentIdDisplay}
        </span>
      )}
      <span className="font-semibold text-sm text-gray-900 dark:text-white">
        {student.student_name}
      </span>
      {showLink && student.student_id && (
        <Link
          href={`/students/${student.student_id}?tab=sessions`}
          onClick={(e) => e.stopPropagation()}
          className="text-[#a0704b] hover:text-[#8a5f3e] transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      )}
      {student.grade && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded text-gray-800"
          style={{ backgroundColor: getGradeColor(student.grade, student.lang_stream) }}
        >
          {student.grade}{student.lang_stream || ''}
        </span>
      )}
      {student.school && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
          {student.school}
        </span>
      )}
      {trailing}
    </div>
  );
}
