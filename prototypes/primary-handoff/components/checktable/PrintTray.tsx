"use client";

import { useMemo, useState } from "react";
import { ChevronUp, Printer, X } from "lucide-react";
import type { ChecktableItem, Student } from "@/lib/types";

export type PrintTrayEntry = {
  item: ChecktableItem;
  pageRange?: string;
};

type Props = {
  entries: PrintTrayEntry[];
  student: Student;
  onRemove: (id: string) => void;
  /** Set/clear the page range for a queued worksheet (blank = all pages). */
  onSetPageRange: (id: string, pageRange?: string) => void;
  onClear: () => void;
  onPrint: () => void;
  /** "floating" (default): fixed bottom-right card that collapses to a pill on
   *  small screens. "docked": a static full-width footer, for use inside a
   *  panel/drawer that already owns its own scroll + bottom edge. */
  variant?: "floating" | "docked";
};

export function PrintTray({
  entries,
  student,
  onRemove,
  onSetPageRange,
  onClear,
  onPrint,
  variant = "floating",
}: Props) {
  // Floating tray starts collapsed on phones so it doesn't bury the list; on
  // sm+ the body is always shown (the toggle is mobile-only). Docked trays are
  // always expanded — the drawer manages its own height.
  const [expanded, setExpanded] = useState(false);
  const docked = variant === "docked";

  // Sort by code so the queued rows (and the eventual packet) read in a stable,
  // book order rather than the order they happened to be clicked.
  const sorted = useMemo(
    () =>
      [...entries].sort((a, b) =>
        a.item.code.localeCompare(b.item.code, undefined, { numeric: true })
      ),
    [entries]
  );

  if (entries.length === 0) return null;

  const partial = entries.filter((e) => e.pageRange).length;
  const full = entries.length - partial;
  const bodyVisibility = docked
    ? ""
    : `${expanded ? "" : "hidden"} sm:block`;

  return (
    <section
      role="region"
      aria-label={`Print batch for ${student.name}, ${entries.length} item${
        entries.length === 1 ? "" : "s"
      }`}
      className={
        docked
          ? "border-t border-ink-200 bg-white"
          : "fixed bottom-4 right-4 left-4 sm:left-auto z-30 surface shadow-lg max-w-xl ml-auto bg-white"
      }
    >
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-ink-100">
        <div className="flex items-center gap-2 min-w-0">
          <Printer className="h-4 w-4 shrink-0 text-ink-700" />
          <span className="text-sm font-medium text-ink-800">
            Print batch ({entries.length})
          </span>
          <span className="text-xs truncate text-ink-500">
            for {student.name}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Mobile, collapsed: keep one-tap Print reachable without expanding. */}
          {!docked && !expanded && (
            <button
              onClick={onPrint}
              className="sm:hidden rounded-md px-2.5 py-1 text-xs font-medium flex items-center gap-1 bg-mc-red-600 text-white hover:bg-mc-red-700"
            >
              <Printer className="h-3 w-3" />
              {entries.length}
            </button>
          )}
          <button
            onClick={onClear}
            className="text-xs text-ink-500 hover:text-ink-800 hover:underline"
          >
            Clear
          </button>
          {!docked && (
            <button
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse print batch" : "Expand print batch"}
              className="sm:hidden text-ink-400 hover:text-ink-800"
            >
              <ChevronUp
                className={`h-4 w-4 transition-transform ${
                  expanded ? "" : "rotate-180"
                }`}
              />
            </button>
          )}
        </div>
      </div>

      <div className={bodyVisibility}>
        <div className="max-h-52 overflow-y-auto divide-y divide-ink-100">
          {sorted.map(({ item, pageRange }) => (
            <div
              key={item.id}
              className="flex items-center gap-2 px-4 py-1.5 text-sm"
            >
              <span className="font-medium text-ink-800 w-24 shrink-0 truncate">
                {item.code}
              </span>
              <label className="flex items-center gap-1.5 text-xs text-ink-500 min-w-0 flex-1">
                Pages
                <input
                  type="text"
                  inputMode="numeric"
                  value={pageRange ?? ""}
                  onChange={(e) => {
                    // Don't trim mid-keystroke or it eats spaces the user is
                    // still typing (e.g. "1-5, 8"); only a blank field clears.
                    const v = e.target.value;
                    onSetPageRange(item.id, v.trim() === "" ? undefined : v);
                  }}
                  placeholder="All"
                  title="Pages to print, e.g. 1-5, 8. Leave blank for all pages."
                  aria-label={`Pages to print for ${item.code}`}
                  className="w-24 rounded border border-ink-200 px-1.5 py-0.5 text-xs text-ink-800 placeholder:text-ink-400 focus:border-ink-400 focus:outline-none"
                />
              </label>
              <button
                onClick={() => onRemove(item.id)}
                className="text-ink-400 hover:text-ink-800 shrink-0"
                aria-label={`Remove ${item.code} from print batch`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="px-4 py-2.5 flex items-center justify-between gap-3 border-t border-ink-100">
          <div className="text-xs truncate text-ink-500">
            {partial === 0
              ? "All pages"
              : `${full} full · ${partial} partial`}
          </div>
          <button
            onClick={onPrint}
            className="rounded-md px-3 py-1.5 text-sm font-medium flex items-center gap-1 whitespace-nowrap bg-mc-red-600 text-white hover:bg-mc-red-700"
          >
            <Printer className="h-3.5 w-3.5" />
            Print {entries.length} {entries.length === 1 ? "PDF" : "PDFs"}
          </button>
        </div>
      </div>
    </section>
  );
}
