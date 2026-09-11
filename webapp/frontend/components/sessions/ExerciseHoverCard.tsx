"use client";

import { useState, type ReactNode } from "react";
import {
  useFloating,
  useHover,
  useDismiss,
  useRole,
  useInteractions,
  offset,
  flip,
  shift,
  autoUpdate,
  FloatingPortal,
} from "@floating-ui/react";
import { cn } from "@/lib/utils";
import { ABOVE_OVERLAYS_Z } from "@/hooks/useOverlayLayer";
import { getExerciseDisplayName, parseExerciseRemarks } from "@/lib/exercise-utils";
import { getPageLabel } from "@/lib/lesson-utils";
import type { SessionExercise } from "@/types";

// Older exercises were saved with the long type names, so both spellings count.
const EXERCISE_TYPES = {
  CW: { name: "Classwork", codes: ["CW", "Classwork"], shortcut: "C", dot: "bg-red-500" },
  HW: { name: "Homework", codes: ["HW", "Homework"], shortcut: "H", dot: "bg-blue-500" },
} as const;

interface ExerciseHoverCardProps {
  /** Every exercise on the session. The card picks out the ones of `type`. */
  exercises: SessionExercise[] | undefined;
  type: "CW" | "HW";
  /** Classes for the wrapper around the button, for example to stop it shrinking in a flex row. */
  className?: string;
  /** The CW or HW button. It keeps its own click handling. */
  children: ReactNode;
}

/**
 * Wraps a CW or HW button so that resting the mouse on it shows what is
 * already assigned, and tutors can check a session's work without opening the
 * exercise modal. It only responds to a mouse. On a touchscreen there is no
 * hover, so a tap goes straight through to the button as before.
 *
 * The card is portalled to the page body and sits above every overlay,
 * because these buttons often live inside cards that clip their contents, and
 * inside the session popover, which is itself an overlay.
 */
export function ExerciseHoverCard({ exercises, type, className, children }: ExerciseHoverCardProps) {
  const [open, setOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom",
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  // A short delay keeps the card from flashing up as the mouse passes over a
  // row of buttons. Pressing the button closes it, since the modal is opening.
  const hover = useHover(context, { mouseOnly: true, delay: { open: 250, close: 0 } });
  const dismiss = useDismiss(context, { referencePress: true });
  const role = useRole(context, { role: "tooltip" });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, dismiss, role]);

  const { name, codes, shortcut, dot } = EXERCISE_TYPES[type];
  const assigned = (exercises ?? []).filter((ex) =>
    (codes as readonly string[]).includes(ex.exercise_type)
  );

  return (
    <>
      <span ref={refs.setReference} {...getReferenceProps()} className={cn("inline-flex", className)}>
        {children}
      </span>

      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={{ ...floatingStyles, zIndex: ABOVE_OVERLAYS_Z }}
            {...getFloatingProps()}
            className={cn(
              "pointer-events-none w-max min-w-[180px] max-w-[300px] rounded-lg px-3 py-2 shadow-lg",
              "bg-[#fef9f3] dark:bg-[#2d2618]",
              "border border-[#d4a574] dark:border-[#8b6f47]"
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-900 dark:text-gray-100">
                <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
                {name}
                {assigned.length > 0 && (
                  <span className="font-normal text-gray-500 dark:text-gray-400">({assigned.length})</span>
                )}
              </span>
              <kbd className="rounded border border-[#d4a574]/60 dark:border-[#8b6f47] px-1 font-mono text-[10px] leading-4 text-gray-500 dark:text-gray-400">
                {shortcut}
              </kbd>
            </div>

            {assigned.length === 0 ? (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                No {name.toLowerCase()} assigned yet.
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1.5">
                {assigned.map((ex) => {
                  const pages = getPageLabel(ex);
                  const { remarks } = parseExerciseRemarks(ex.remarks);
                  return (
                    <li key={ex.id} className="text-xs">
                      <div className="flex items-baseline gap-3">
                        <span className="min-w-0 break-words text-gray-800 dark:text-gray-200">
                          {getExerciseDisplayName(ex) || "Untitled exercise"}
                        </span>
                        {pages && (
                          <span className="ml-auto shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
                            {pages}
                          </span>
                        )}
                      </div>
                      {remarks && (
                        <p className="mt-0.5 break-words text-[11px] italic text-gray-500 dark:text-gray-400">
                          {remarks}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
