"use client";

/** The "Select mode — tap worksheets…" hint shown while batch-select is on,
 *  with a Done button that exits the mode. Shared by both checktable views. */
export function SelectModeBanner({ onDone }: { onDone: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-mc-red-200 bg-mc-red-50 px-2.5 py-1.5 text-xs text-mc-red-700">
      <span>
        Select mode — tap worksheets to add or remove them from the print batch.
      </span>
      <button
        type="button"
        onClick={onDone}
        className="font-medium hover:underline shrink-0"
      >
        Done
      </button>
    </div>
  );
}
