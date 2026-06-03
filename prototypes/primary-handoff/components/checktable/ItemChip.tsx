"use client";

import { Check } from "lucide-react";
import type {
  AssignmentStatus,
  ChecktableItem,
  ExerciseKind,
} from "@/lib/types";

type Props = {
  item: ChecktableItem;
  status?: AssignmentStatus | null;
  /** CW/HW this item was recorded as, if known — drives the colored category
   *  stripe (rose = classwork, blue = homework). */
  kind?: ExerciseKind;
  isSelected: boolean;
  tutorNote?: string;
  onClick: () => void;
};

export function ItemChip({
  item,
  status,
  kind,
  isSelected,
  tutorNote,
  onClick,
}: Props) {
  const state = isSelected
    ? "selected"
    : status === "done"
      ? "done"
      : status === "assigned"
        ? "assigned"
        : "available";

  const isNote = ["R", "P", "PS"].includes(item.code);
  const title = [
    item.code,
    kind ? (kind === "CW" ? "Classwork" : "Homework") : null,
    tutorNote ? `Note: ${tutorNote}` : null,
    item.pdfPath,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <button
      type="button"
      onClick={onClick}
      className="chip relative overflow-hidden"
      data-state={state}
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
      {tutorNote && (
        <span
          aria-label="Has tutor note"
          className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-500 ring-1 ring-white"
        />
      )}
    </button>
  );
}
