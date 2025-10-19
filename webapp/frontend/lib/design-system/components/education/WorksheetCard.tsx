"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DateStamp } from "./RubberStamp";

interface WorksheetCardProps {
  /**
   * Worksheet content
   */
  children: ReactNode;

  /**
   * Worksheet title
   */
  title?: string;

  /**
   * Due date (if applicable)
   */
  dueDate?: string;

  /**
   * Whether to show Name/Date header
   * @default false
   */
  showHeader?: boolean;

  /**
   * Problem numbering style
   * @default "decimal"
   */
  numbering?: "circle" | "decimal" | "none";

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * WorksheetCard - Display problems/exercises in worksheet format
 *
 * Creates traditional worksheet appearance with optional header (Name/Date),
 * title, numbered problems, and due date stamp. Use for exercises, homework
 * assignments, quizzes, or problem sets.
 *
 * @example
 * ```tsx
 * <WorksheetCard
 *   title="Algebra Review"
 *   dueDate="OCT 25"
 *   showHeader
 *   numbering="circle"
 * >
 *   <WorksheetProblem number={1}>
 *     Solve for x: 2x + 5 = 13
 *   </WorksheetProblem>
 *   <WorksheetProblem number={2}>
 *     Factor: x² + 5x + 6
 *   </WorksheetProblem>
 * </WorksheetCard>
 * ```
 */
export function WorksheetCard({
  children,
  title,
  dueDate,
  showHeader = false,
  numbering = "decimal",
  className,
}: WorksheetCardProps) {
  return (
    <div
      className={cn(
        "relative bg-white dark:bg-[#1a1a1a] paper-texture rounded-lg p-8 paper-shadow-md",
        "border border-gray-200 dark:border-gray-800",
        className
      )}
      style={{
        counterReset: "worksheet-problem",
      }}
    >
      {/* Due date stamp (top right) */}
      {dueDate && (
        <div className="absolute top-4 right-4">
          <DateStamp date={dueDate} label="DUE" />
        </div>
      )}

      {/* Header with Name/Date fields */}
      {showHeader && (
        <div className="mb-6 pb-4 border-b border-gray-300 dark:border-gray-700 font-mono text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              Name: <span className="border-b border-gray-400 dark:border-gray-600 inline-block w-48"></span>
            </div>
            <div>
              Date: <span className="border-b border-gray-400 dark:border-gray-600 inline-block w-32"></span>
            </div>
          </div>
        </div>
      )}

      {/* Title */}
      {title && (
        <h2 className="text-2xl font-bold mb-6 text-center">
          {title}
        </h2>
      )}

      {/* Content with problem numbering context */}
      <div
        className={cn(
          "space-y-4",
          numbering === "circle" && "worksheet-circle-numbers",
          numbering === "decimal" && "worksheet-decimal-numbers"
        )}
      >
        {children}
      </div>
    </div>
  );
}

interface WorksheetProblemProps {
  /**
   * Problem number
   */
  number?: number;

  /**
   * Problem content
   */
  children: ReactNode;

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * WorksheetProblem - Individual problem within a worksheet
 *
 * Displays a single problem with automatic or manual numbering.
 *
 * @example
 * ```tsx
 * <WorksheetProblem number={1}>
 *   Solve for x: 2x + 5 = 13
 * </WorksheetProblem>
 * ```
 */
export function WorksheetProblem({
  number,
  children,
  className,
}: WorksheetProblemProps) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      {number !== undefined ? (
        <span className="font-bold text-lg flex-shrink-0 w-8">{number}.</span>
      ) : (
        <span className="font-bold text-lg flex-shrink-0 w-8 before:content-[counter(worksheet-problem)'.'] before:counter-increment-[worksheet-problem]"></span>
      )}
      <div className="flex-1">{children}</div>
    </div>
  );
}

/**
 * AnswerBlank - Answer input/blank line
 *
 * Displays a blank line for writing answers.
 *
 * @example
 * ```tsx
 * <AnswerBlank width="md" />
 * ```
 */
export function AnswerBlank({ width = "md" }: { width?: "sm" | "md" | "lg" | "full" }) {
  const widthClass = {
    sm: "w-32",
    md: "w-48",
    lg: "w-64",
    full: "w-full",
  }[width];

  return (
    <span
      className={cn(
        "inline-block border-b-2 border-gray-400 dark:border-gray-600 align-baseline",
        widthClass
      )}
      style={{ minHeight: "1.2em" }}
    ></span>
  );
}
