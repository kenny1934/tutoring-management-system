"use client";

import { memo } from "react";
import { Check } from "lucide-react";
import type {
  AssignmentStatus,
  ChecktableItem,
  ExerciseKind,
} from "@/lib/types";

type Props = {
  item: ChecktableItem;
  status?: AssignmentStatus | null;
  /** CW/HW this item was recorded as, if known, drives the colored category
   *  stripe (rose = classwork, blue = homework). */
  kind?: ExerciseKind;
  isSelected: boolean;
  tutorNote?: string;
  /** Learning objective for the set this item belongs to; surfaced in the
   *  hover tooltip so it stays reachable in the compact grid view. */
  objective?: string;
  /** Takes the item so callers can pass a stable handler (the chip builds its
   *  own click closure internally), which keeps the React.memo below effective
   *  even in a 400-chip grid. */
  onItemClick: (item: ChecktableItem) => void;
};

/** Memoised: a big grid renders hundreds of these, and marking one worksheet
 *  done re-renders the whole table. With a stable `onItemClick` and primitive
 *  status/kind props, only the chip whose status actually changed re-renders. */
function ItemChipBase({
  item,
  status,
  kind,
  isSelected,
  tutorNote,
  objective,
  onItemClick,
}: Props) {
  // Status drives the chip's fill. Print-batch membership is layered on top as
  // a ring + corner dot (data-batched) rather than its own fill, so queuing an
  // already-assigned/done item never hides its real status.
  const state =
    status === "done"
      ? "done"
      : status === "assigned"
        ? "assigned"
        : "available";

  const isNote = ["R", "P", "PS"].includes(item.code);
  const title = [
    item.code,
    objective ? `Objective: ${objective}` : null,
    kind ? (kind === "CW" ? "Classwork" : "Homework") : null,
    isSelected ? "In print batch" : null,
    tutorNote ? `Note: ${tutorNote}` : null,
    item.pdfPath,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <button
      type="button"
      onClick={() => onItemClick(item)}
      className="chip relative overflow-hidden"
      data-state={state}
      data-batched={isSelected ? "true" : undefined}
      title={title}
    >
      {/* Category stripe: rose = classwork, blue = homework. Sits on the left
       *  edge so it reads even when the chip's fill flips to done/selected. */}
      {kind && (
        <span
          aria-hidden
          className={`absolute left-0 top-0 bottom-0 w-1 ${
            kind === "CW" ? "bg-rose-500" : "bg-blue-500"
          }`}
        />
      )}
      {state === "done" && <Check className="h-3 w-3" strokeWidth={3} />}
      <span className={isNote ? "italic text-ink-400" : ""}>{item.code}</span>
      {/* Print-batch marker: a red dot on the leading edge, distinct in both
       *  colour and position from the amber note dot on the trailing edge. */}
      {isSelected && (
        <span
          aria-label="In print batch"
          className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-mc-red-500 ring-1 ring-white"
        />
      )}
      {tutorNote && (
        <span
          aria-label="Has tutor note"
          className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-500 ring-1 ring-white"
        />
      )}
    </button>
  );
}

export const ItemChip = memo(ItemChipBase);
