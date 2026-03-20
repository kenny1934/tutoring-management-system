"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  FloatingOverlay,
  FloatingFocusManager,
  FloatingPortal,
  useFloating,
  useDismiss,
  useInteractions,
} from "@floating-ui/react";
import { Search, Check, AlertTriangle, Loader2 } from "lucide-react";
import useSWR from "swr";
import { summerAPI } from "@/lib/api";
import { formatShortDate } from "@/lib/summer-utils";
import { useToast } from "@/contexts/ToastContext";
import type { SummerFindSlotResult } from "@/types";

interface SummerFindSlotDialogProps {
  isOpen: boolean;
  onClose: () => void;
  configId: number;
  location: string;
  applicationId: number;
  studentName: string;
  grade: string;
  lessonNumber: number;
  afterDate?: string;
  beforeDate?: string;
  onPlaced: () => void;
}

export function SummerFindSlotDialog({
  isOpen,
  onClose,
  configId,
  location,
  applicationId,
  studentName,
  grade,
  lessonNumber,
  afterDate,
  beforeDate,
  onPlaced,
}: SummerFindSlotDialogProps) {
  const { showToast, showError } = useToast();
  const [placingId, setPlacingId] = useState<number | null>(null);

  const { data: results, isLoading, error } = useSWR(
    isOpen
      ? [
          "summer-find-slot",
          configId,
          location,
          grade,
          lessonNumber,
          afterDate,
          beforeDate,
        ]
      : null,
    () =>
      summerAPI.findSlot({
        config_id: configId,
        location,
        grade,
        lesson_number: lessonNumber,
        after_date: afterDate,
        before_date: beforeDate,
      })
  );

  const { refs, context } = useFloating({
    open: isOpen,
    onOpenChange: (open) => {
      if (!open && placingId === null) onClose();
    },
  });

  const dismiss = useDismiss(context, {
    outsidePressEvent: "mousedown",
    enabled: placingId === null,
  });
  const { getFloatingProps } = useInteractions([dismiss]);

  if (!isOpen) return null;

  async function handlePlace(result: SummerFindSlotResult) {
    setPlacingId(result.lesson_id);
    try {
      await summerAPI.createSession({
        application_id: applicationId,
        slot_id: result.slot_id,
        lesson_id: result.lesson_id,
        mode: "single",
      });
      showToast(
        `Placed in Lesson ${result.lesson_number} on ${formatShortDate(result.date)}`,
        "success"
      );
      onPlaced();
      onClose();
    } catch (err) {
      showError(err, "Failed to place student");
    } finally {
      setPlacingId(null);
    }
  }

  const fillPercent = (current: number, max: number) =>
    max > 0 ? Math.round((current / max) * 100) : 0;

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
            className="w-full max-w-md bg-card dark:bg-gray-900 rounded-lg shadow-xl border border-border max-h-[80vh] flex flex-col"
          >
            {/* Header */}
            <div className="p-4 border-b border-border flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Search className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">
                  Find Lesson {lessonNumber}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {studentName}
                </p>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : error ? (
                <div className="text-center py-8 text-sm text-red-500">
                  Failed to load available slots.
                </div>
              ) : !results || results.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No available lessons found
                </div>
              ) : (
                <div className="space-y-2">
                  {results.map((result) => {
                    const pct = fillPercent(
                      result.current_count,
                      result.max_students
                    );
                    const isFull =
                      result.current_count >= result.max_students;
                    const isPlacing = placingId === result.lesson_id;

                    return (
                      <div
                        key={result.lesson_id}
                        className={cn(
                          "rounded-lg border p-3 transition-colors",
                          isFull
                            ? "border-border/50 opacity-60"
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            {/* Date and time */}
                            <div className="flex items-center gap-2 text-sm font-medium">
                              <span>{formatShortDate(result.date)}</span>
                              <span className="text-muted-foreground">
                                {result.time_slot}
                              </span>
                            </div>

                            {/* Tutor */}
                            {result.tutor_name && (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {result.tutor_name}
                              </div>
                            )}

                            {/* Fill bar */}
                            <div className="flex items-center gap-2 mt-1.5">
                              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    pct >= 100
                                      ? "bg-red-500"
                                      : pct >= 75
                                        ? "bg-amber-500"
                                        : "bg-emerald-500"
                                  )}
                                  style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {result.current_count}/{result.max_students}
                              </span>
                            </div>

                            {/* Lesson number with match indicator */}
                            <div className="flex items-center gap-1 mt-1">
                              {result.lesson_match ? (
                                <Check className="h-3.5 w-3.5 text-emerald-500" />
                              ) : (
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                              )}
                              <span
                                className={cn(
                                  "text-xs font-medium",
                                  result.lesson_match
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-amber-600 dark:text-amber-400"
                                )}
                              >
                                Lesson {result.lesson_number}
                                {!result.lesson_match && " (mismatch)"}
                              </span>
                            </div>
                          </div>

                          {/* Place button */}
                          <button
                            onClick={() => handlePlace(result)}
                            disabled={isFull || placingId !== null}
                            className={cn(
                              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors shrink-0",
                              "bg-primary text-primary-foreground hover:bg-primary/90",
                              "disabled:opacity-50 disabled:cursor-not-allowed"
                            )}
                          >
                            {isPlacing ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              "Place"
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-border flex justify-end">
              <button
                onClick={onClose}
                disabled={placingId !== null}
                className="px-3 py-1.5 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                Close
              </button>
            </div>
          </div>
        </FloatingFocusManager>
      </FloatingOverlay>
    </FloatingPortal>
  );
}
