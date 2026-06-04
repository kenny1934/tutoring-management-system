"use client";

import { Printer } from "lucide-react";

/** "Add N shown" — queues every worksheet matching the active filters into the
 *  print batch. Hidden when nothing is shown; disabled (with a different label)
 *  when everything shown is already queued. Uses the same Printer icon as the
 *  per-chapter add button and the tray so the "queue to print" action reads
 *  consistently. Shared by both checktable views. */
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
      <Printer className="h-3.5 w-3.5" />
      {pendingCount === 0 ? "All shown queued" : `Add ${pendingCount} shown`}
    </button>
  );
}
