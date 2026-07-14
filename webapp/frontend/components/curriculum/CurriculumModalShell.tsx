"use client";

import { ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

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

  // Dialog focus management: take focus on open, hand it back on close, and
  // keep Tab cycling inside the panel instead of escaping into the page.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => opener?.focus?.();
  }, []);
  const trapTab = (e: React.KeyboardEvent) => {
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !previewOpen) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, previewOpen]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
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

/** The "Show N more" / "Showing the first N of M files" pair under a
 *  concept's file list, shared by the modals that lift their cap on demand. */
export function CurriculumShowMoreFiles({
  shown,
  total,
  showAll,
  onShowAll,
}: {
  shown: number;
  total: number;
  showAll: boolean;
  onShowAll: () => void;
}) {
  if (total <= shown) return null;
  return showAll ? (
    <p className="text-[10px] text-gray-400 mt-1.5">
      Showing the first {shown} of {total} files.
    </p>
  ) : (
    <button
      type="button"
      onClick={onShowAll}
      className="mt-1.5 text-[10px] text-teal-700 dark:text-teal-400 hover:underline"
    >
      Show {total - shown} more
    </button>
  );
}
