"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A student's school, as the amber tag the student lists use. Schools are
 * stored as short codes such as SRL-E or DBYW-C, so the tag is small.
 */
export function SchoolBadge({ school, className }: { school: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex-none rounded px-1.5 font-medium whitespace-nowrap",
        "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
        className,
      )}
    >
      {school}
    </span>
  );
}

interface WithSchoolIfItFitsProps {
  school?: string | null;
  /**
   * One line's height, as a class. The row is exactly this tall, and so is
   * the part that always shows. It has to be at least as tall as the tag.
   */
  lineClass: string;
  /** Classes for the row, such as its gap and how it lines its parts up. */
  className?: string;
  /** Classes for the tag, such as its text size. */
  badgeClassName?: string;
  /** The part that always shows, which is the student's number, name and grade. */
  children: ReactNode;
}

/**
 * The student's number, name and grade, followed by their school only when
 * all of the school's tag fits. The tag never shortens the name, and it's
 * never cut in half.
 *
 * The row is allowed to wrap, but it's exactly one line tall and hides
 * anything past that line. When there's room, the tag sits on the first line
 * beside the name. When there isn't, it drops onto the second line, out of
 * sight, and only then does a long name start to shorten. Nothing is
 * measured, so this keeps up as the pane is dragged wider or narrower.
 */
export function WithSchoolIfItFits({ school, lineClass, className, badgeClassName, children }: WithSchoolIfItFitsProps) {
  return (
    <span className={cn("flex flex-wrap items-center min-w-0 overflow-hidden", lineClass, className)}>
      {/* Its parts are spaced with the row's own gap. */}
      <span className={cn("flex items-center gap-[inherit] min-w-0 max-w-full", lineClass)}>{children}</span>
      {school && <SchoolBadge school={school} className={badgeClassName} />}
    </span>
  );
}
