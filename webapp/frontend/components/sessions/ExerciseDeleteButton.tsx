"use client";

import { Trash2 } from "lucide-react";

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
        <span className="text-red-500">Delete?</span>
        <button
          type="button"
          onClick={onConfirmDelete}
          className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 px-3 py-2 text-red-600 dark:text-red-400 font-medium hover:bg-red-100 dark:hover:bg-red-900/30 rounded flex items-center justify-center"
          aria-label="Confirm delete"
        >
          Yes
        </button>
        <button
          type="button"
          onClick={onCancelDelete}
          className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 px-3 py-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded flex items-center justify-center"
          aria-label="Cancel delete"
        >
          No
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onRequestDelete}
      className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 p-2.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors shrink-0 flex items-center justify-center"
      title="Remove exercise (Alt+Backspace)"
      aria-label="Remove exercise"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
