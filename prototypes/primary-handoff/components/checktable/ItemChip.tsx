"use client";

import { Check } from "lucide-react";
import type { AssignmentStatus, ChecktableItem } from "@/lib/types";

type Props = {
  item: ChecktableItem;
  status?: AssignmentStatus | null;
  isSelected: boolean;
  onClick: () => void;
};

export function ItemChip({ item, status, isSelected, onClick }: Props) {
  const state = isSelected
    ? "selected"
    : status === "done"
      ? "done"
      : status === "assigned"
        ? "assigned"
        : "available";

  const isNote = ["R", "P", "PS"].includes(item.code);

  return (
    <button
      type="button"
      onClick={onClick}
      className="chip"
      data-state={state}
      title={item.code + (item.pdfPath ? `\n${item.pdfPath}` : "")}
    >
      {state === "done" && <Check className="h-3 w-3" strokeWidth={3} />}
      <span className={isNote ? "italic text-ink-400" : ""}>{item.code}</span>
    </button>
  );
}
