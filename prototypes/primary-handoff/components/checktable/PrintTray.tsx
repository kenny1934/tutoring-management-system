"use client";

import { Printer, X } from "lucide-react";
import type { ChecktableItem, Student } from "@/lib/types";

type Props = {
  items: ChecktableItem[];
  student: Student;
  basePath: string;
  onRemove: (id: string) => void;
  onClear: () => void;
  onPrint: () => void;
};

export function PrintTray({
  items,
  student,
  basePath,
  onRemove,
  onClear,
  onPrint,
}: Props) {
  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-30 surface bg-white shadow-lg max-w-xl ml-auto">
      <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Printer className="h-4 w-4 text-ink-700" />
          <span className="text-sm font-medium text-ink-800">
            Print batch ({items.length})
          </span>
          <span className="text-xs text-ink-500">for {student.name}</span>
        </div>
        <button
          onClick={onClear}
          className="text-xs text-ink-500 hover:text-ink-800"
        >
          Clear
        </button>
      </div>
      <div className="px-4 py-3 max-h-40 overflow-y-auto">
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 text-xs bg-ink-100 text-ink-700 rounded-md pl-2 pr-1 py-1"
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
      <div className="border-t border-ink-100 px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="text-xs text-ink-500 truncate">
          Will fetch from{" "}
          <code className="font-mono text-ink-700">{basePath}</code>
        </div>
        <button
          onClick={onPrint}
          className="rounded-md bg-ink-800 text-white px-3 py-1.5 text-sm font-medium hover:bg-ink-900 flex items-center gap-1 whitespace-nowrap"
        >
          <Printer className="h-3.5 w-3.5" />
          Print {items.length} PDFs
        </button>
      </div>
    </div>
  );
}
