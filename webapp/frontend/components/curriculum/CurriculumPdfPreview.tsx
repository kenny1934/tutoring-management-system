"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Loader2, Plus, X } from "lucide-react";
import { loadExercisePdf } from "@/lib/lesson-pdf-loader";
import { openFileFromPathWithFallback } from "@/lib/file-system";
import { searchPaperlessByPath } from "@/lib/paperless-utils";
import { Button, IconButton } from "@/components/controls";
import { useDialogFocus } from "./CurriculumModalShell";

interface CurriculumPdfPreviewProps {
  filePath: string;
  fileLabel: string;
  /** When set, the header offers "Add to session" (the exercise modal case). */
  onAdd?: () => void;
  onClose: () => void;
}

/**
 * Peek at a worksheet without leaving the current surface.
 * Loads bytes through the same chain Lesson Mode uses (connected drive
 * folders first, Shelv as fallback) and renders them in an iframe overlay,
 * portalled above whatever opened it.
 */
export function CurriculumPdfPreview({
  filePath,
  fileLabel,
  onAdd,
  onClose,
}: CurriculumPdfPreviewProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState("Opening…");
  const [failed, setFailed] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const trapTab = useDialogFocus(panelRef);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      const result = await loadExercisePdf(filePath, (message) => {
        if (!cancelled) setProgress(message);
      });
      if (cancelled) return;
      if ("error" in result) {
        setFailed(true);
        return;
      }
      url = URL.createObjectURL(new Blob([result.data], { type: "application/pdf" }));
      setBlobUrl(url);
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [filePath]);

  // Capture phase, for the same reason as CurriculumModalShell: the exercise
  // modal swallows bubbling Escapes, deferring to open overlays via the
  // data-curriculum-overlay marker.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-curriculum-overlay=""
      className="fixed inset-0 z-[10010] flex items-center justify-center p-2 sm:p-6 bg-black/50"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Preview of ${fileLabel}`}
        tabIndex={-1}
        onKeyDown={trapTab}
        className="bg-paper border-2 border-line-strong rounded-lg shadow-xl w-full max-w-3xl h-[85vh] flex flex-col overflow-hidden focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#d4a574]/40 dark:border-[#8b6f47]/60">
          <span
            className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate flex-1"
            title={filePath}
          >
            {fileLabel}
          </span>
          {onAdd && (
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => {
                onAdd();
                onClose();
              }}
            >
              Add to session
            </Button>
          )}
          <IconButton
            icon={ExternalLink}
            size="sm"
            label="Open in a new tab"
            onClick={() => openFileFromPathWithFallback(filePath, searchPaperlessByPath)}
          />
          <IconButton icon={X} size="sm" label="Close preview" onClick={onClose} />
        </div>

        <div className="flex-1 min-h-0 bg-gray-100 dark:bg-gray-900">
          {blobUrl ? (
            <iframe src={blobUrl} title={fileLabel} className="w-full h-full border-0" />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-2 px-6 text-center">
              {failed ? (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    We couldn&apos;t open this file.
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    It isn&apos;t reachable from your connected folders or Shelv on
                    this device.
                    {/* Only promise the add action where it exists (the
                        exercise modal case). */}
                    {onAdd ? " You can still add it to the session." : ""}
                  </p>
                </>
              ) : (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-teal-700" />
                  <p className="text-xs text-gray-500 dark:text-gray-400">{progress}</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
