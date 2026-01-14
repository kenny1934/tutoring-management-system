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
          className="px-1.5 py-0.5 text-red-600 dark:text-red-400 font-medium hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
        >
          Yes
        </button>
        <button
          type="button"
          onClick={onCancelDelete}
          className="px-1.5 py-0.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
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
      className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors shrink-0"
      title="Remove exercise (Alt+Backspace)"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
