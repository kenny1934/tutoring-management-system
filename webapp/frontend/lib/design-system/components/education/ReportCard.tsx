"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ReportCardProps {
  /**
   * Student name
   */
  studentName: string;

  /**
   * Academic term/period
   */
  term: string;

  /**
   * Report card content (subjects, grades, comments)
   */
  children: ReactNode;

  /**
   * Grading scale
   * @default "letter"
   */
  gradingScale?: "letter" | "percentage" | "gpa";

  /**
   * School/organization name
   * @default "CSM Pro Math Center"
   */
  schoolName?: string;

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * ReportCard - Display grades and progress reports
 *
 * Creates traditional report card layout with header, student info,
 * subject grades, and teacher comments. Use for performance summaries,
 * progress reports, or assessment results.
 *
 * @example
 * ```tsx
 * <ReportCard
 *   studentName="John Doe"
 *   term="Fall 2025"
 *   gradingScale="letter"
 * >
 *   <Subject name="Algebra II" grade="A" gpa={4.0} />
 *   <Subject name="Geometry" grade="B+" gpa={3.5} />
 *   <TeacherComment>
 *     Excellent progress in problem-solving...
 *   </TeacherComment>
 * </ReportCard>
 * ```
 */
export function ReportCard({
  studentName,
  term,
  children,
  gradingScale = "letter",
  schoolName = "CSM Pro Math Center",
  className,
}: ReportCardProps) {
  return (
    <div
      className={cn(
        "relative w-full bg-[#fef9f3] dark:bg-[#2d2618] paper-texture rounded-lg p-8 paper-shadow-lg",
        "border-2 border-amber-900/20 dark:border-amber-100/10",
        className
      )}
    >
      {/* Decorative header border */}
      <div className="absolute top-0 left-0 right-0 h-3 bg-gradient-to-r from-amber-600/20 via-yellow-600/20 to-amber-600/20 rounded-t-lg"></div>

      {/* Header */}
      <div className="text-center mb-6 pb-4 border-b-2 border-gray-400 dark:border-gray-600">
        <h1 className="text-2xl font-bold mb-2">{schoolName}</h1>
        <h2 className="text-xl font-semibold">Student Progress Report</h2>
        <p className="text-sm text-muted-foreground mt-2">{term}</p>
      </div>

      {/* Student Info */}
      <div className="mb-6 pb-4 border-b border-gray-300 dark:border-gray-700">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-semibold">Student Name:</span>{" "}
            <span className="font-mono">{studentName}</span>
          </div>
          <div>
            <span className="font-semibold">Grading Scale:</span>{" "}
            <span className="font-mono uppercase">{gradingScale}</span>
          </div>
        </div>
      </div>

      {/* Content (Subjects & Comments) */}
      <div className="space-y-4">{children}</div>

      {/* Footer seal/signature area */}
      <div className="mt-8 pt-4 border-t border-gray-300 dark:border-gray-700 text-center text-xs text-muted-foreground">
        <p>This report represents the student's progress and performance during the specified term.</p>
      </div>
    </div>
  );
}

interface SubjectProps {
  /**
   * Subject name
   */
  name: string;

  /**
   * Letter grade (A, B+, etc.)
   */
  grade?: string;

  /**
   * Percentage score
   */
  percentage?: number;

  /**
   * GPA value
   */
  gpa?: number;

  /**
   * Additional notes/comments
   */
  notes?: string;

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * Subject - Individual subject row in report card
 *
 * Displays subject name with grade/score. Automatically adapts to parent
 * ReportCard's grading scale.
 *
 * @example
 * ```tsx
 * <Subject name="Algebra II" grade="A" gpa={4.0} />
 * <Subject name="Geometry" percentage={87} />
 * ```
 */
export function Subject({
  name,
  grade,
  percentage,
  gpa,
  notes,
  className,
}: SubjectProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_auto] gap-6 py-3 border-b border-gray-200 dark:border-gray-800",
        className
      )}
    >
      <div>
        <div className="font-semibold text-base">{name}</div>
        {notes && (
          <div className="text-sm text-muted-foreground italic mt-1">
            {notes}
          </div>
        )}
      </div>

      <div className="text-right">
        {grade && (
          <div className="font-bold text-xl">{grade}</div>
        )}
        {percentage !== undefined && (
          <div className="font-bold text-xl">{percentage}%</div>
        )}
        {gpa !== undefined && (
          <div className="text-sm text-muted-foreground">GPA: {gpa.toFixed(1)}</div>
        )}
      </div>
    </div>
  );
}

interface TeacherCommentProps {
  /**
   * Comment text
   */
  children: ReactNode;

  /**
   * Teacher/tutor name
   */
  author?: string;

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * TeacherComment - Teacher's comments section
 *
 * Displays teacher/tutor feedback and observations.
 *
 * @example
 * ```tsx
 * <TeacherComment author="Ms. Johnson">
 *   John has shown excellent progress in problem-solving...
 * </TeacherComment>
 * ```
 */
export function TeacherComment({
  children,
  author,
  className,
}: TeacherCommentProps) {
  return (
    <div
      className={cn(
        "mt-6 p-4 bg-amber-50/50 dark:bg-amber-950/20 rounded border border-amber-200/50 dark:border-amber-800/30",
        className
      )}
    >
      <div className="font-semibold text-sm mb-2">Teacher Comments:</div>
      <div className="text-sm leading-relaxed italic">{children}</div>
      {author && (
        <div className="mt-3 text-xs text-right text-muted-foreground">
          — {author}
        </div>
      )}
    </div>
  );
}
