"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  ExternalLink,
  FileText,
  PenTool,
  Home as HomeIcon,
  Trash2,
  Loader2,
} from "lucide-react";
import type { ChecktableItem, ExerciseKind } from "@/lib/types";
import { parsePageRange } from "@/lib/store/PrimaryStore";
import { mcDriveViewerUrl } from "@/lib/mc-drive";

type Props = {
  item: ChecktableItem;
  kind: ExerciseKind;
  /** "log" = accepting/adding a worksheet; "edit" = changing a logged one. */
  mode: "log" | "edit";
  initialPageRange?: string;
  initialNote?: string;
  onClose: () => void;
  onSubmit: (input: {
    page_start?: number;
    page_end?: number;
    remarks?: string;
  }) => void;
  /** Edit mode only — remove the logged exercise. */
  onRemove?: () => void;
};

/** Worksheet detail modal: PDF preview alongside the page-range / note
 *  controls, so a tutor can decide (log) or edit which pages to assign while
 *  looking at the worksheet. */
export function WorksheetModal({
  item,
  kind,
  mode,
  initialPageRange,
  initialNote,
  onClose,
  onSubmit,
  onRemove,
}: Props) {
  const [pageRange, setPageRange] = useState(initialPageRange ?? "");
  const [note, setNote] = useState(initialNote ?? "");
  // Tracks the PDF iframe load so we can overlay a placeholder until it paints.
  const [isLoading, setIsLoading] = useState(true);

  const dialogRef = useRef<HTMLDivElement>(null);
  const pageRangeInputRef = useRef<HTMLInputElement>(null);

  // Backdrop click would discard typed page range / note edits, so only let it
  // close when nothing has changed from what we opened with. Close button always closes.
  const isPristine =
    pageRange === (initialPageRange ?? "") && note === (initialNote ?? "");

  const handleBackdrop = () => {
    if (isPristine) onClose();
  };

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  // Focus management: move focus into the dialog on open, restore it on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    (pageRangeInputRef.current ?? dialogRef.current)?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  // Trap Tab within the dialog.
  const onKeyDownTrap = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const root = dialogRef.current;
    if (!root) return;
    const focusable = root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // Forgive common range formats before validating (mirrors RecordExerciseModal).
  const normalizedRange = pageRange
    .trim()
    .replace(/^p\.?\s*/i, "")
    .replace(/[–—]/g, "-")
    .replace(/\s*to\s*/i, "-")
    .replace(/\s+/g, "");
  const pageRangeIsInvalid =
    pageRange.trim().length > 0 && !/^\d+-\d+$|^\d+$/.test(normalizedRange);

  const previewUrl = item.mcDriveS3Path
    ? mcDriveViewerUrl(item.mcDriveS3Path)
    : null;
  const isCW = kind === "CW";

  const submit = () => {
    if (pageRangeIsInvalid) return;
    const { page_start, page_end } = parsePageRange(normalizedRange);
    onSubmit({ page_start, page_end, remarks: note.trim() || undefined });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/50 p-0 sm:p-4"
      onClick={handleBackdrop}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="worksheet-modal-title"
        tabIndex={-1}
        onKeyDown={onKeyDownTrap}
        className="surface bg-white w-full sm:max-w-3xl h-[90vh] max-h-[94vh] flex flex-col overflow-hidden outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-ink-200 px-4 py-2.5 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {isCW ? (
              <PenTool className="h-4 w-4 text-rose-600 shrink-0" />
            ) : (
              <HomeIcon className="h-4 w-4 text-blue-600 shrink-0" />
            )}
            <span
              id="worksheet-modal-title"
              className="font-mono text-sm font-semibold text-ink-900 truncate"
            >
              {item.code}
            </span>
            <span className="text-xs text-ink-400 shrink-0">
              {mode === "log" ? "Log" : "Edit"} {isCW ? "classwork" : "homework"}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {previewUrl && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-800 px-2 py-1"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Open in new tab</span>
              </a>
            )}
            <button
              onClick={onClose}
              className="text-ink-400 hover:text-ink-700 p-1.5"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-0 flex flex-col sm:flex-row">
          {/* Preview */}
          <div className="sm:flex-1 min-h-[36vh] sm:min-h-0 bg-ink-100 border-b sm:border-b-0 sm:border-r border-ink-200">
            {previewUrl ? (
              <div className="relative w-full h-full">
                <iframe
                  src={`${previewUrl}#zoom=page-fit`}
                  className="block w-full h-full border-0 bg-white"
                  title={`Preview of ${item.code}`}
                  loading="lazy"
                  onLoad={() => setIsLoading(false)}
                />
                {isLoading && (
                  <div className="absolute inset-0 grid place-items-center bg-ink-100 text-ink-400">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-ink-300" />
                      <div className="text-sm">Loading preview…</div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid place-items-center h-full text-ink-400">
                <div className="text-center px-4">
                  <FileText className="h-10 w-10 mx-auto mb-2 text-ink-300" />
                  <div className="text-sm">No preview available</div>
                  {item.pdfPath && (
                    <div className="text-xs mt-1 break-all font-mono text-ink-500">
                      {item.pdfPath}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="sm:w-72 shrink-0 p-4 flex flex-col gap-3 overflow-y-auto">
            <div>
              <label className="block text-xs text-ink-500 mb-1">
                Page range
              </label>
              <input
                type="text"
                value={pageRange}
                onChange={(e) => setPageRange(e.target.value)}
                placeholder="e.g. 5 or 1-3 (blank = whole)"
                aria-invalid={pageRangeIsInvalid || undefined}
                className={`w-full rounded-md border px-2.5 py-1.5 text-sm focus:outline-none ${
                  pageRangeIsInvalid
                    ? "border-mc-red-500 focus:border-mc-red-600"
                    : "border-ink-200 focus:border-ink-400"
                }`}
              />
              {pageRangeIsInvalid && (
                <div className="text-[10px] text-mc-red-600 mt-1">
                  Use &quot;5&quot; or &quot;1-3&quot;
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs text-ink-500 mb-1">
                Note <span className="text-ink-400">(optional)</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Anything specific for this student"
                className="w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-sm focus:outline-none focus:border-ink-400 resize-none"
              />
            </div>

            <div className="mt-auto flex flex-col gap-2 pt-2">
              <button
                onClick={submit}
                disabled={pageRangeIsInvalid}
                className="w-full rounded-md bg-ink-800 text-white px-3 py-2 text-sm font-medium hover:bg-ink-900 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {mode === "log"
                  ? `Log ${isCW ? "classwork" : "homework"}`
                  : "Save changes"}
              </button>
              {mode === "edit" && onRemove && (
                <button
                  onClick={onRemove}
                  className="w-full inline-flex items-center justify-center gap-1 rounded-md px-3 py-1.5 text-sm text-bad hover:bg-ink-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
