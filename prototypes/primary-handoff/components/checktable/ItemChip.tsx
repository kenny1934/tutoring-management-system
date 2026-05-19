"use client";

import { Check } from "lucide-react";
import type { AssignmentStatus, ChecktableItem } from "@/lib/types";

type Props = {
  item: ChecktableItem;
  status?: AssignmentStatus | null;
  isSelected: boolean;
  tutorNote?: string;
  onClick: () => void;
};

export function ItemChip({
  item,
  status,
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
    tutorNote ? `Note: ${tutorNote}` : null,
    item.pdfPath,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <button
      type="button"
      onClick={onClick}
      className="chip relative"
      data-state={state}
      title={title}
    >
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
