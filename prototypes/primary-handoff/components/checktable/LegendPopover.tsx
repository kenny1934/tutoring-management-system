"use client";

import { useCallback, useRef, useState } from "react";
import { KeyRound } from "lucide-react";
import { useDismiss } from "@/lib/useDismiss";

/** The chip key, demoted from an always-on row to an on-demand popover so it
 *  stops eating vertical space above the checktable. Trigger lives in the
 *  toolbar; the panel anchors to its right edge. */
export function LegendPopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(
    ref,
    open,
    useCallback(() => setOpen(false), [])
  );

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-white px-2 py-1 text-xs font-medium text-ink-600 hover:bg-ink-100"
      >
        <KeyRound className="h-3.5 w-3.5" />
        Legend
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Chip legend"
          className="surface absolute right-0 top-full z-30 mt-1 w-64 p-3 text-xs text-ink-600 shadow-lg"
        >
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <Swatch label="Untouched" />
            <Swatch label="Assigned" state="assigned" />
            <Swatch label="Done" state="done" />
            <Swatch label="In print batch" batched />
            <StripeSwatch stripe="bg-rose-500" label="Classwork" />
            <StripeSwatch stripe="bg-blue-500" label="Homework" />
          </div>
          <p className="mt-2.5 border-t border-ink-100 pt-2 text-ink-400">
            Click a chip to assign, mark done, or queue it for printing.
          </p>
        </div>
      )}
    </div>
  );
}

function Swatch({
  label,
  state,
  batched,
}: {
  label: string;
  state?: "assigned" | "done";
  batched?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="chip" data-state={state} data-batched={batched ? "true" : undefined}>
        601A
      </span>
      <span>{label}</span>
    </span>
  );
}

function StripeSwatch({ stripe, label }: { stripe: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="chip relative overflow-hidden">
        <span aria-hidden className={`absolute left-0 top-0 bottom-0 w-1 ${stripe}`} />
        601A
      </span>
      <span>{label}</span>
    </span>
  );
}
