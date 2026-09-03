"use client";

import { ReactNode, RefObject, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Dialog focus management shared by the curriculum overlays (modal shell,
 * PDF preview): take focus on open, hand it back to the opener on close,
 * and keep Tab cycling inside the panel. Returns the keydown handler to
 * put on the panel.
 */
export function useDialogFocus(panelRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => opener?.focus?.();
  }, [panelRef]);
  return (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const root = panelRef.current;
    if (!root) return;
    const focusables = root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === root)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };
}

interface CurriculumModalShellProps {
  ariaLabel: string;
  /** aria-label for the close button ("Close worksheet list"). */
  closeLabel: string;
  /** Header row contents (icon, title, spinner); the shell adds the close
   *  button after them. */
  header: ReactNode;
  /** Muted one-liner pinned under the header. */
  subtitle?: ReactNode;
  /** Rows pinned between the subtitle and the scrollable body. */
  beforeBody?: ReactNode;
  /** While a CurriculumPdfPreview is stacked on top, Escape closes only the
   *  preview (its own handler does that); this panel stays put. */
  previewOpen?: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * The dialog scaffolding shared by the curriculum portal modals (topic
 * worksheets, revision pack): overlay and panel at z-[10000] — above the
 * shared ui/modal shell at 9999, below CurriculumPdfPreview at 10010 — with
 * focus capture/restore, Tab trapping, and Escape-unless-preview semantics.
 */
export function CurriculumModalShell({
  ariaLabel,
  closeLabel,
  header,
  subtitle,
  beforeBody,
  previewOpen = false,
  onClose,
  children,
}: CurriculumModalShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const trapTab = useDialogFocus(panelRef);

  // Capture phase: the exercise modal swallows bubbling Escapes with its own
  // capture listener, so this one must sit at the same level to be heard (it
  // defers to us via the data-curriculum-overlay marker below).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !previewOpen) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, previewOpen]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-curriculum-overlay=""
      className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-6 bg-black/50"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        onKeyDown={trapTab}
        className="bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg shadow-xl w-full max-w-lg max-h-[75vh] flex flex-col overflow-hidden focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#d4a574]/40 dark:border-[#8b6f47]/60 bg-gradient-to-r from-teal-50 to-[#fef9f3] dark:from-teal-900/20 dark:to-[#2d2618]">
          {header}
          <button
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            className="ml-auto p-1 rounded text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {subtitle && (
          <p className="px-4 py-1.5 text-[10px] text-gray-400 dark:text-gray-500 border-b border-[#d4a574]/20 dark:border-[#8b6f47]/30">
            {subtitle}
          </p>
        )}

        {beforeBody}

        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body
  );
}

/** The server never returns more than this many files per topic. */
const SERVER_FILE_CAP = 200;

/** The "Show N more" / "Show fewer" pair under one section's list. Each
 *  click reveals another chunk of that section only; expanded sections can
 *  be collapsed back to their default size. */
export function CurriculumShowMoreFiles({
  shown,
  total,
  chunk,
  expanded,
  loading,
  onShowMore,
  onShowFewer,
}: {
  shown: number;
  total: number;
  chunk: number;
  expanded: boolean;
  loading?: boolean;
  onShowMore: () => void;
  onShowFewer: () => void;
}) {
  const moreAvailable = shown < Math.min(total, SERVER_FILE_CAP);
  if (!moreAvailable && !expanded) return null;
  return (
    <div className="mt-1.5 flex items-center gap-3 text-[10px]">
      {moreAvailable && (
        <button
          type="button"
          onClick={onShowMore}
          disabled={loading}
          className="text-teal-700 dark:text-teal-400 hover:underline disabled:opacity-60 disabled:hover:no-underline"
        >
          {loading ? "Loading…" : `Show ${Math.min(chunk, total - shown)} more`}
        </button>
      )}
      {!moreAvailable && total > shown && (
        <span className="text-gray-400">
          Showing the first {shown} of {total} files.
        </span>
      )}
      {expanded && (
        <button
          type="button"
          onClick={onShowFewer}
          className="text-gray-500 dark:text-gray-400 hover:underline"
        >
          Show fewer
        </button>
      )}
    </div>
  );
}
