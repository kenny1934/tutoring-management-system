"use client";

import { Circle, Inbox, Check, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HomeworkStatus } from "@/types";

/**
 * The five states, in ladder order, with the one icon and colour each gets.
 *
 * Every surface that draws a state reads this: the marking control, the glyphs
 * on the student page and its filter chips. Same reasoning as isChecked living
 * in one place, applied to how a state looks rather than what it means.
 *
 * Read left to right: nothing recorded, then the work came back, then the
 * three verdicts a tutor can give it.
 */
export const HOMEWORK_STATES: Array<{
  status: HomeworkStatus;
  icon: typeof Check;
  /** Used on the marking buttons, where the ladder gives the context. */
  label: string;
  /** Used where a state stands alone and has to say what it means. */
  longLabel: string;
  /** The filled treatment, for the selected marking button. */
  activeClass: string;
  /** The bare treatment, for a glyph against the page background. */
  glyphClass: string;
  /** Fill for the proportion bar. */
  barClass: string;
}> = [
  {
    status: "Not Checked",
    icon: Circle,
    label: "Not checked",
    longLabel: "Not checked",
    activeClass: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
    glyphClass: "text-gray-300 dark:text-gray-600",
    barClass: "bg-gray-300 dark:bg-gray-600",
  },
  {
    status: "Submitted",
    icon: Inbox,
    label: "Handed in, not marked",
    longLabel: "Handed in",
    activeClass: "bg-blue-500 text-white",
    glyphClass: "text-blue-500",
    barClass: "bg-blue-500",
  },
  {
    status: "Completed",
    icon: Check,
    label: "Done",
    longLabel: "Done",
    activeClass: "bg-green-500 text-white",
    glyphClass: "text-green-500",
    barClass: "bg-green-500",
  },
  {
    status: "Partially Completed",
    icon: Minus,
    label: "Partly done",
    longLabel: "Partly done",
    activeClass: "bg-amber-500 text-white",
    glyphClass: "text-amber-500",
    barClass: "bg-amber-500",
  },
  {
    status: "Not Completed",
    icon: X,
    label: "Not done",
    longLabel: "Not done",
    activeClass: "bg-red-500 text-white",
    glyphClass: "text-red-400",
    barClass: "bg-red-400",
  },
];

const BY_STATUS = new Map(HOMEWORK_STATES.map((state) => [state.status, state]));

/** How one state reads. Falls back to Not Checked, which is what no record means. */
export function homeworkState(status: HomeworkStatus | undefined | null) {
  return (status && BY_STATUS.get(status)) || HOMEWORK_STATES[0];
}

/**
 * A state as a bare icon, for lists that show homework without marking it.
 *
 * Decorative on purpose: every caller pairs it with a text label or wraps it
 * in a button that carries the title, so the meaning never rests on colour
 * alone and screen readers do not hear it twice.
 */
export function HomeworkStatusGlyph({
  status,
  className,
}: {
  status: HomeworkStatus | undefined;
  className?: string;
}) {
  const state = homeworkState(status);
  const Icon = state.icon;
  return <Icon className={cn("h-3.5 w-3.5", state.glyphClass, className)} aria-hidden />;
}
