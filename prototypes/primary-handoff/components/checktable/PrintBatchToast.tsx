"use client";

import { Printer } from "lucide-react";
import type { BatchToast } from "./usePrintBatchUI";

/** Bottom-centred status toast for batch clear/print, with an optional Undo.
 *  Shared by the student tab and the session drawer. Renders nothing when
 *  there's no active toast. */
export function PrintBatchToast({
  toast,
  onDismiss,
}: {
  toast: BatchToast;
  onDismiss: () => void;
}) {
  if (!toast) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-[10px] border border-ink-800 bg-ink-900 text-white px-4 py-2 text-sm flex items-center gap-2 shadow-lg"
    >
      <Printer className="h-4 w-4 text-mc-yellow-400" />
      {toast.message}
      {toast.onUndo && (
        <button
          onClick={() => {
            toast.onUndo?.();
            onDismiss();
          }}
          className="ml-1 font-medium text-mc-yellow-400 hover:underline"
        >
          Undo
        </button>
      )}
    </div>
  );
}
