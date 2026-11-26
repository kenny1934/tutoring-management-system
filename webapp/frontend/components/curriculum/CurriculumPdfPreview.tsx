"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Plus, X } from "lucide-react";
import { loadExercisePdf } from "@/lib/lesson-pdf-loader";
import { CanvasPdfPreview } from '@/components/courseware/CanvasPdfPreview';

import { Button, IconButton } from "@/components/controls";
import { useOverlayLayer } from "@/hooks/useOverlayLayer";
import { useBackToClose } from "@/hooks/useBackToClose";
import { useAsSheet } from "@/hooks/usePopoverSheet";
import styles from "./CurriculumJourney.module.css";
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
 * folders first, then MCKB) and renders them in the shared PDF viewer,
 * portalled above whatever opened it.
 */
export function CurriculumPdfPreview(props: CurriculumPdfPreviewProps) {
  return <CurriculumPdfPreviewContent key={props.filePath} {...props} />;
}

function CurriculumPdfPreviewContent({
  filePath,
  fileLabel,
  onAdd,
  onClose,
}: CurriculumPdfPreviewProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [data, setData] = useState<ArrayBuffer | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const trapTab = useDialogFocus(panelRef);
  const { isTopmost } = useOverlayLayer(true);
  const onPhone = useAsSheet();
  useBackToClose(onPhone, onClose);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setFailed(false); setData(null); setBlobUrl(null);
    (async () => {
      const result = await loadExercisePdf(filePath);
      if (cancelled) return;
      if ("error" in result) {
        setFailed(true);
        return;
      }
      url = URL.createObjectURL(new Blob([result.data], { type: "application/pdf" }));
      setBlobUrl(url); setData(result.data);
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [filePath, attempt]);

  // Capture phase, for the same reason as CurriculumModalShell: the exercise
  // modal swallows bubbling Escapes, deferring to open overlays via the
  // data-curriculum-overlay marker.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isTopmost) { e.preventDefault(); e.stopImmediatePropagation(); onClose(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, isTopmost]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-curriculum-overlay=""
      className={`fixed inset-0 z-[10010] flex items-center justify-center p-2 sm:p-6 bg-black/50 ${styles.pdfBackdrop}`}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Preview of ${fileLabel}`}
        tabIndex={-1}
        onKeyDown={trapTab}
        className={`bg-paper border-2 border-line-strong rounded-lg shadow-xl w-full max-w-3xl h-[85vh] flex flex-col overflow-hidden focus:outline-none ${styles.pdfPanel}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-2 px-3 py-2 border-b border-line-strong/40 dark:border-line-strong/60">
          <span
            data-curriculum-pdf-label
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
            disabled={!blobUrl} onClick={() => { if (!blobUrl) return; const tab = window.open(blobUrl, '_blank'); if (tab) tab.opener = null; }}
          />
          <IconButton icon={X} size="sm" label="Close preview" onClick={onClose} />
        </header>

        <div data-curriculum-pdf-content className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <CanvasPdfPreview data={data ?? undefined} title={fileLabel} path={filePath} error={failed ? 'The PDF could not load.' : null} onRetry={() => setAttempt(value => value + 1)} />

        </div>
      </div>
    </div>,
    document.body
  );
}
