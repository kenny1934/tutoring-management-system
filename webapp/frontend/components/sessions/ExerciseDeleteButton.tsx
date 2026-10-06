"use client";

import { Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/controls";

interface ExerciseDeleteButtonProps {
  isPending: boolean;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}

export function ExerciseDeleteButton({
  isPending,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: ExerciseDeleteButtonProps) {
  if (isPending) {
    return (
      <div className="flex items-center gap-1 text-xs shrink-0">
        <span className="text-red-600">Delete?</span>
        <Button
          variant="danger"
          size="sm"
          onClick={onConfirmDelete}
          className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0"
          aria-label="Confirm delete"
        >
          Yes
        </Button>
        <Button
          variant="quiet"
          size="sm"
          onClick={onCancelDelete}
          className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0"
          aria-label="Cancel delete"
        >
          No
        </Button>
      </div>
    );
  }

  return (
    <IconButton
      label="Remove exercise"
      title="Remove exercise (Alt+Backspace)"
      icon={Trash2}
      tone="danger"
      onClick={onRequestDelete}
      className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0"
    />
  );
}
