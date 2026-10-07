"use client";

import { useState, useEffect, useRef } from "react";
import {
  useFloating,
  useDismiss,
  useInteractions,
  FloatingOverlay,
  FloatingFocusManager,
  FloatingPortal,
} from "@floating-ui/react";
import { Button, Input, Label } from "@/components/controls";

interface LessonNumberPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the picked lesson number, or null when admin skips/clears. */
  onConfirm: (lessonNumber: number | null) => void;
  title: string;
  description?: string;
  /** Prefill for the input (e.g. when editing an existing value). */
  initialValue?: number | null;
  /** Confirm button label ("Place" for drop-time prompt, "Save" for edit). */
  confirmLabel?: string;
  /** Inclusive upper bound, typically `config.total_lessons` for summer. */
  maxLesson?: number;
}

const MIN_LESSON = 1;

export function LessonNumberPromptModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  initialValue,
  confirmLabel = "Save",
  maxLesson = 10,
}: LessonNumberPromptModalProps) {
  const [value, setValue] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue != null ? String(initialValue) : "");
      // Autofocus after mount
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen, initialValue]);

  const { refs, context } = useFloating({
    open: isOpen,
    onOpenChange: (open) => {
      if (!open) onClose();
    },
  });
  const dismiss = useDismiss(context, { outsidePressEvent: "mousedown" });
  const { getFloatingProps } = useInteractions([dismiss]);

  if (!isOpen) return null;

  const parsed = value.trim() === "" ? null : parseInt(value, 10);
  const isValid =
    parsed === null ||
    (!isNaN(parsed) && parsed >= MIN_LESSON && parsed <= maxLesson);

  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm(parsed);
    onClose();
  };

  return (
    <FloatingPortal>
      <FloatingOverlay
        className="z-[10001] bg-black/50 flex items-center justify-center p-4"
        lockScroll
      >
        <FloatingFocusManager context={context}>
          <div
            ref={refs.setFloating}
            {...getFloatingProps()}
            className="w-full max-w-xs bg-card dark:bg-gray-900 rounded-lg shadow-xl border border-border"
          >
            <div className="p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold">{title}</h3>
                {description && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {description}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="lesson-number-prompt">Lesson number</Label>
                <Input
                  id="lesson-number-prompt"
                  aria-describedby="lesson-number-prompt-hint"
                  aria-invalid={!isValid || undefined}
                  ref={inputRef}
                  type="number"
                  value={value}
                  min={MIN_LESSON}
                  max={maxLesson}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleConfirm();
                    }
                  }}
                  placeholder="Leave blank to skip"
                />
                <p id="lesson-number-prompt-hint" className="text-[11px] text-muted-foreground mt-1">
                  1–{maxLesson}, or leave blank.
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="primary" onClick={handleConfirm} disabled={!isValid}>
                  {confirmLabel}
                </Button>
              </div>
            </div>
          </div>
        </FloatingFocusManager>
      </FloatingOverlay>
    </FloatingPortal>
  );
}
