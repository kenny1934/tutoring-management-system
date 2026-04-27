"use client";

import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  useFloating,
  useDismiss,
  useInteractions,
  FloatingOverlay,
  FloatingFocusManager,
  FloatingPortal,
} from "@floating-ui/react";
import { CalendarDays, AlertTriangle } from "lucide-react";

type PlacementMode = "all" | "first_half" | "single";

interface SummerPlacementModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (mode: PlacementMode) => void;
  studentName: string;
  slotLabel: string;
  totalLessons?: number;
  /** Active placements already counted toward this app's session plan. */
  placedCount?: number;
  /** Session plan cap (lessons_paid). Modes overshooting this are disabled. */
  lessonsPaid?: number;
}

interface ModeOption {
  value: PlacementMode;
  label: string;
  description: string;
  /** New sessions this mode would add to the application's placement count. */
  added: number;
}

function getModes(total: number): ModeOption[] {
  const half = Math.floor(total / 2);
  return [
    {
      value: "all",
      label: `All ${total} lessons`,
      description: `Place in every weekly lesson (standard for 1x/week students)`,
      added: total,
    },
    {
      value: "first_half",
      label: `${half} lessons`,
      description: `Place in ${half} of the ${total} weekly slots (for 2x/week students needing a second slot)`,
      added: half,
    },
    {
      value: "single",
      label: "Manual (Calendar)",
      description: "Don't place now — I'll assign individual lessons in the Calendar tab",
      added: 0,
    },
  ];
}

export function SummerPlacementModeModal({
  isOpen,
  onClose,
  onConfirm,
  studentName,
  slotLabel,
  totalLessons = 8,
  placedCount = 0,
  lessonsPaid,
}: SummerPlacementModeModalProps) {
  const modes = useMemo(() => getModes(totalLessons), [totalLessons]);
  const cap = lessonsPaid ?? totalLessons;
  const remaining = Math.max(cap - placedCount, 0);

  const isOver = (added: number) => placedCount + added > cap;
  const firstAvailable = modes.find((m) => !isOver(m.added))?.value ?? "single";

  const [selected, setSelected] = useState<PlacementMode>(firstAvailable);

  // Reset selection to first non-overshooting mode each time the modal opens.
  useEffect(() => {
    if (isOpen) setSelected(firstAvailable);
    // firstAvailable depends on placedCount/cap which only matter at open time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const { refs, context } = useFloating({
    open: isOpen,
    onOpenChange: (open) => {
      if (!open) onClose();
    },
  });

  const dismiss = useDismiss(context, { outsidePressEvent: "mousedown" });
  const { getFloatingProps } = useInteractions([dismiss]);

  if (!isOpen) return null;

  const allOver = modes.every((m) => isOver(m.added));
  const selectedDisabled = isOver(modes.find((m) => m.value === selected)?.added ?? 0);

  return (
    <FloatingPortal>
      <FloatingOverlay
        className="z-[10000] bg-black/50 flex items-center justify-center p-4"
        lockScroll
      >
        <FloatingFocusManager context={context}>
          <div
            ref={refs.setFloating}
            {...getFloatingProps()}
            className="w-full max-w-sm bg-card dark:bg-gray-900 rounded-lg shadow-xl border border-border"
          >
            <div className="p-4 space-y-4">
              {/* Header */}
              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <CalendarDays className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Place Student</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {studentName} → {slotLabel}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                    Placed {placedCount} / {cap} • {remaining} session{remaining === 1 ? "" : "s"} remaining
                  </p>
                </div>
              </div>

              {allOver && (
                <div className="flex items-start gap-2 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-2.5 text-[11px] text-red-700 dark:text-red-300">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <div>
                    Session plan limit reached ({placedCount}/{cap}). Cancel or reschedule
                    an existing placement before adding more, or pick Manual to ready
                    lessons without creating sessions.
                  </div>
                </div>
              )}

              {/* Mode options */}
              <div className="space-y-2">
                {modes.map((mode) => {
                  const projected = placedCount + mode.added;
                  const overshoots = isOver(mode.added);
                  return (
                    <label
                      key={mode.value}
                      className={cn(
                        "flex items-start gap-3 p-2.5 rounded-lg border transition-colors",
                        overshoots
                          ? "border-red-200 dark:border-red-800 bg-red-50/40 dark:bg-red-900/10 cursor-not-allowed opacity-70"
                          : selected === mode.value
                            ? "border-primary bg-primary/15 cursor-pointer"
                            : "border-border hover:border-primary/50 cursor-pointer"
                      )}
                    >
                      <input
                        type="radio"
                        name="placement-mode"
                        value={mode.value}
                        checked={selected === mode.value}
                        disabled={overshoots}
                        onChange={() => setSelected(mode.value)}
                        className="mt-0.5 accent-primary"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-sm font-medium">{mode.label}</div>
                          {mode.added > 0 && (
                            <span
                              className={cn(
                                "text-[10px] tabular-nums px-1.5 py-0.5 rounded border",
                                overshoots
                                  ? "text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                                  : "text-muted-foreground bg-muted/40 border-border"
                              )}
                            >
                              would total {projected} / {cap}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {mode.description}
                        </div>
                        {overshoots && (
                          <div className="text-[11px] text-red-600 dark:text-red-400 mt-1">
                            Exceeds session plan by {projected - cap}.
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => onConfirm(selected)}
                  disabled={selectedDisabled}
                  className="px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Place
                </button>
              </div>
            </div>
          </div>
        </FloatingFocusManager>
      </FloatingOverlay>
    </FloatingPortal>
  );
}
