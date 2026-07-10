"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ClipboardList, Loader2, X } from "lucide-react";
import { useCurriculumRevisionPack } from "@/lib/hooks";
import { conceptNameForStream, stripExtension } from "@/lib/curriculum-labels";
import type { CurriculumFile } from "@/types";
import { CurriculumFileRow } from "./CurriculumFileRow";
import { CurriculumPdfPreview } from "./CurriculumPdfPreview";

interface CurriculumRevisionPackProps {
  eventId: number;
  onClose: () => void;
}

/**
 * One test's revision pack: every topic parsed from the test's scope with
 * revision-ordered worksheets, and any scope lines that stayed unmatched so
 * the tutor knows the pack may be incomplete.
 */
export function CurriculumRevisionPack({ eventId, onClose }: CurriculumRevisionPackProps) {
  const [preview, setPreview] = useState<CurriculumFile | null>(null);
  const [showAll, setShowAll] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useCurriculumRevisionPack(
    eventId,
    // The pack is the "everything for this test" view — lift the cap on demand.
    showAll ? 200 : undefined
  );

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
      // With a preview stacked on top, Escape closes only the preview
      // (its own handler does that); this panel stays put.
      if (e.key === "Escape" && !preview) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, preview]);

  if (typeof document === "undefined") return null;

  const event = data?.event;
  const stream = data?.lang_stream || null;
  const dateLabel = event?.start_date
    ? new Date(event.start_date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-6 bg-black/50"
        onClick={onClose}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={event ? `Revision pack for ${event.title}` : "Revision pack"}
          tabIndex={-1}
          onKeyDown={trapTab}
          className="bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg shadow-xl w-full max-w-lg max-h-[75vh] flex flex-col overflow-hidden focus:outline-none"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#d4a574]/40 dark:border-[#8b6f47]/60 bg-gradient-to-r from-teal-50 to-[#fef9f3] dark:from-teal-900/20 dark:to-[#2d2618]">
            <ClipboardList className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
              {event ? `${event.title}${dateLabel ? ` · ${dateLabel}` : ""}` : "Revision pack"}
            </span>
            {isLoading && (
              <Loader2 className="h-3 w-3 animate-spin text-gray-400 shrink-0" />
            )}
            <button
              type="button"
              aria-label="Close revision pack"
              onClick={onClose}
              className="ml-auto p-1 rounded text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="px-4 py-1.5 text-[10px] text-gray-400 dark:text-gray-500 border-b border-[#d4a574]/20 dark:border-[#8b6f47]/30">
            Worksheets for each topic covered by this test.
          </p>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {!isLoading && data && data.concepts.length === 0 && (
              <p className="px-4 py-5 text-xs text-gray-500 dark:text-gray-400">
                No topics recognised for this test.
              </p>
            )}
            {(data?.concepts || []).map((concept) => (
              <div
                key={concept.concept_id}
                className="px-4 py-2.5 border-b border-[#d4a574]/20 dark:border-[#8b6f47]/30 last:border-b-0"
              >
                <div className="text-xs font-medium text-gray-800 dark:text-gray-200">
                  {conceptNameForStream(concept, stream)}
                </div>
                {concept.scope_lines.length > 0 && (
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">
                    From the test scope: &ldquo;{concept.scope_lines.slice(0, 2).join(" · ")}&rdquo;
                  </p>
                )}
                <div className="space-y-0.5">
                  {concept.files.map((file) => (
                    <CurriculumFileRow
                      key={file.file_path}
                      file={file}
                      onPreview={setPreview}
                      scopeSchool={event?.school}
                    />
                  ))}
                </div>
                {concept.files.length === 0 && (
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    No worksheets mapped to this topic yet.
                  </p>
                )}
                {concept.file_count > concept.files.length &&
                  (showAll ? (
                    <p className="text-[10px] text-gray-400 mt-1.5">
                      Showing the first {concept.files.length} of{" "}
                      {concept.file_count} files.
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAll(true)}
                      className="mt-1.5 text-[10px] text-teal-700 dark:text-teal-400 hover:underline"
                    >
                      Show {concept.file_count - concept.files.length} more
                    </button>
                  ))}
              </div>
            ))}

            {data && data.unmatched_lines.length > 0 && (
              <div className="mx-4 my-3 px-3 py-2 rounded-lg bg-black/[0.04] dark:bg-white/[0.05]">
                <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">
                  Not yet matched to a topic
                </p>
                {data.unmatched_lines.map((line) => (
                  <p key={line} className="text-[10px] text-gray-400 dark:text-gray-500">
                    {line}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {preview && (
        <CurriculumPdfPreview
          filePath={preview.file_path}
          fileLabel={stripExtension(preview.file_basename)}
          onClose={() => setPreview(null)}
        />
      )}
    </>,
    document.body
  );
}
