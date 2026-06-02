"use client";

import { Printer, X } from "lucide-react";
import type { ChecktableItem, Student } from "@/lib/types";

type Props = {
  items: ChecktableItem[];
  student: Student;
  /** When set, the tray is in session-prep mode: print records the items as
   *  HW on that session and returns to it. */
  prepSessionLabel?: string;
  onRemove: (id: string) => void;
  onClear: () => void;
  onPrint: () => void;
};

export function PrintTray({
  items,
  student,
  prepSessionLabel,
  onRemove,
  onClear,
  onPrint,
}: Props) {
  if (items.length === 0) return null;

  const prepMode = Boolean(prepSessionLabel);

  return (
    <div
      className={`fixed bottom-4 right-4 left-4 sm:left-auto z-30 surface shadow-lg max-w-xl ml-auto ${
        prepMode ? "bg-mc-yellow-50 border-mc-yellow-200" : "bg-white"
      }`}
    >
      <div
        className={`flex items-center justify-between px-4 py-2.5 ${
          prepMode ? "border-b border-mc-yellow-200" : "border-b border-ink-100"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Printer
            className={`h-4 w-4 shrink-0 ${
              prepMode ? "text-mc-yellow-600" : "text-ink-700"
            }`}
          />
          <span className="text-sm font-medium text-ink-800">
            {prepMode ? "Prep HW batch" : "Print batch"} ({items.length})
          </span>
          <span className="text-xs truncate text-ink-500">
            {prepMode
              ? `for ${prepSessionLabel} · ${student.name}`
              : `for ${student.name}`}
          </span>
        </div>
        <button
          onClick={onClear}
          className="text-xs text-ink-500 hover:text-ink-800 hover:underline"
        >
          Clear
        </button>
      </div>
      <div className="px-4 py-3 max-h-40 overflow-y-auto">
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 text-xs rounded-md pl-2 pr-1 py-1 bg-white border border-ink-200 text-ink-700"
            >
              {item.code}
              <button
                onClick={() => onRemove(item.id)}
                className="text-ink-400 hover:text-ink-800"
                aria-label={`Remove ${item.code}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      </div>
      <div
        className={`px-4 py-2.5 flex items-center justify-between gap-3 ${
          prepMode ? "border-t border-mc-yellow-200" : "border-t border-ink-100"
        }`}
      >
        <div className="text-xs truncate text-ink-500">
          {prepMode ? (
            <>Records as HW on this session, then prints.</>
          ) : (
            <>Ready to send to the default printer.</>
          )}
        </div>
        <button
          onClick={onPrint}
          className="rounded-md px-3 py-1.5 text-sm font-medium flex items-center gap-1 whitespace-nowrap bg-mc-red-600 text-white hover:bg-mc-red-700"
        >
          <Printer className="h-3.5 w-3.5" />
          {prepMode ? `Print & record ${items.length}` : `Print ${items.length} PDFs`}
        </button>
      </div>
    </div>
  );
}
