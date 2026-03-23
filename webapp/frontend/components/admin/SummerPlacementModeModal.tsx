"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  useFloating,
  useDismiss,
  useInteractions,
  FloatingOverlay,
  FloatingFocusManager,
  FloatingPortal,
} from "@floating-ui/react";
import { CalendarDays } from "lucide-react";

type PlacementMode = "all" | "first_half" | "single";

interface SummerPlacementModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (mode: PlacementMode) => void;
  studentName: string;
  slotLabel: string;
  totalLessons?: number;
}

function getModes(total: number): { value: PlacementMode; label: string; description: string }[] {
  const half = Math.floor(total / 2);
  return [
    {
      value: "all",
      label: `All ${total} lessons`,
      description: `Place in every weekly lesson (standard for 1x/week students)`,
    },
    {
      value: "first_half",
      label: `First ${half} lessons`,
      description: `Place in weeks 1-${half} only (for 2x/week students needing a second slot)`,
    },
    {
      value: "single",
      label: "Manual (Calendar)",
      description: "Don't place now — I'll assign individual lessons in the Calendar tab",
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
}: SummerPlacementModeModalProps) {
  const [selected, setSelected] = useState<PlacementMode>("all");

  // Reset selection when modal opens
  useEffect(() => {
    if (isOpen) setSelected("all");
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

  const modes = getModes(totalLessons);

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
                </div>
              </div>

              {/* Mode options */}
              <div className="space-y-2">
                {modes.map((mode) => (
                  <label
                    key={mode.value}
                    className={cn(
                      "flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors",
                      selected === mode.value
                        ? "border-primary bg-primary/15"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <input
                      type="radio"
                      name="placement-mode"
                      value={mode.value}
                      checked={selected === mode.value}
                      onChange={() => setSelected(mode.value)}
                      className="mt-0.5 accent-primary"
                    />
                    <div>
                      <div className="text-sm font-medium">{mode.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {mode.description}
                      </div>
                    </div>
                  </label>
                ))}
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
                  className="px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
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
