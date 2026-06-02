"use client";

import { useEffect } from "react";
import { X, ExternalLink, FileText } from "lucide-react";
import type { ChecktableItem } from "@/lib/types";
import { mcDriveViewerUrl } from "@/lib/mc-drive";

/** Read-only PDF preview of a single worksheet, opened from a session-row
 *  chip (logged or suggested). Renders the MC Drive viewer when the item has
 *  a real S3 path, otherwise a path placeholder. */
export function WorksheetPreviewModal({
  item,
  onClose,
}: {
  item: ChecktableItem;
  onClose: () => void;
}) {
  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  const previewUrl = item.mcDriveS3Path
    ? mcDriveViewerUrl(item.mcDriveS3Path)
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="surface bg-white w-full sm:max-w-2xl h-[88vh] max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-ink-200 px-4 py-2.5 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-ink-400 shrink-0" />
            <span className="font-mono text-sm font-semibold text-ink-900 truncate">
              {item.code}
            </span>
            <span className="text-xs text-ink-400 shrink-0">Preview</span>
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
              aria-label="Close preview"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-0 bg-ink-100">
          {previewUrl ? (
            <iframe
              src={`${previewUrl}#zoom=page-fit`}
              className="block w-full h-full border-0 bg-white"
              title={`Preview of ${item.code}`}
              loading="lazy"
            />
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
      </div>
    </div>
  );
}
