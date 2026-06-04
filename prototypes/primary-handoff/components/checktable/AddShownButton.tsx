"use client";

import { Plus } from "lucide-react";

/** "Add N shown" — queues every worksheet matching the active filters. Hidden
 *  when nothing is shown; disabled (with a different label) when everything
 *  shown is already queued. Shared by both checktable views. */
export function AddShownButton({
  shownCount,
  pendingCount,
  onAdd,
}: {
  shownCount: number;
  pendingCount: number;
  onAdd: () => void;
}) {
  if (shownCount === 0) return null;
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={pendingCount === 0}
      title={
        pendingCount === 0
          ? "Everything shown is already queued"
          : `Queue all ${pendingCount} shown worksheet${
              pendingCount === 1 ? "" : "s"
            } for printing`
      }
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-ink-200 bg-white px-2 py-1 text-xs font-medium text-ink-700 hover:bg-ink-100 disabled:cursor-default disabled:text-ink-300 disabled:hover:bg-white"
    >
      <Plus className="h-3.5 w-3.5" />
      {pendingCount === 0 ? "All shown queued" : `Add ${pendingCount} shown`}
    </button>
  );
}
