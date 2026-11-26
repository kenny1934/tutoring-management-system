"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useCoursewarePdf } from '@/hooks/useCoursewarePdf';
import { CanvasPdfPreview } from '@/components/courseware/CanvasPdfPreview';
import { Button } from '@/components/controls';
import { ExternalLink } from 'lucide-react';


export interface PreviewFile {
  source?: 'courseware';
  documentId?: number;
  blobUrl?: string;
  path: string;
  title: string;
}

interface ZenCoursewarePreviewProps {
  file: PreviewFile | null;
  onPageSelect?: (pageStart?: number, pageEnd?: number) => void;
}

/**
 * Inline PDF preview pane for zen courseware page.
 * Adapted from ZenPdfPreview but rendered inline (not as fixed overlay).
 *
 * Keyboard controls (handled by parent):
 * - +/-: Zoom in/out
 * - o: Open in new tab
 */
export function ZenCoursewarePreview(props: ZenCoursewarePreviewProps) {
  return props.file && (props.file.source === 'courseware' || (!!props.file.path && !props.file.blobUrl)) ? <PathCoursewarePreview key={props.file.path} {...props} /> : <LegacyZenCoursewarePreview {...props} />;
}
function PathCoursewarePreview(props: ZenCoursewarePreviewProps) {
  const pdf = useCoursewarePdf(props.file!.path);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!pdf.data) { setUrl(null); return; }
    const next = URL.createObjectURL(new Blob([pdf.data.data], { type: 'application/pdf' })); setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [pdf.data]);
  return <LegacyZenCoursewarePreview {...props} pdfData={pdf.data?.data} pdfPending={!pdf.data && !pdf.error} pdfLoadError={pdf.error} onRetry={pdf.retry} onDocumentError={pdf.recoverLocal} file={{ ...props.file!, documentId: undefined, blobUrl: url ?? undefined }} />;
}
function LegacyZenCoursewarePreview({ file, onPageSelect, pdfData, pdfPending, pdfLoadError, onRetry, onDocumentError }: ZenCoursewarePreviewProps & { pdfData?: ArrayBuffer; pdfPending?: boolean; pdfLoadError?: string | null; onRetry?: () => void; onDocumentError?: () => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [pdfDarkMode, setPdfDarkMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('csm_pdf_dark_mode') === 'true';
  });
  const [pageStart, setPageStart] = useState("");
  const [pageEnd, setPageEnd] = useState("");
  const prevFileRef = useRef<string | null>(null);

  const previewUrl = file?.blobUrl || null;
  const native = pdfPending !== undefined || !!pdfData || !!file?.blobUrl;

  // Reset state when file changes
  useEffect(() => {
    const key = file ? `${file.documentId || ""}:${file.blobUrl || ""}` : null;
    if (key !== prevFileRef.current) {
      prevFileRef.current = key;
      setIsLoading(!!file);
      setError(null);
      setZoom(100);
      setPageStart("");
      setPageEnd("");
    }
  }, [file]);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 25, 200));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 25, 50));
  }, []);

  const handleOpenInNewTab = useCallback(() => {
    if (previewUrl) window.open(previewUrl, "_blank");
  }, [previewUrl]);

  const togglePdfDarkMode = useCallback(() => {
    setPdfDarkMode(prev => {
      const next = !prev;
      localStorage.setItem('csm_pdf_dark_mode', String(next));
      return next;
    });
  }, []);

  // Zoom keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (native) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        togglePdfDarkMode();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleZoomIn, handleZoomOut, togglePdfDarkMode, native]);

  if (!file) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--zen-dim)",
          fontSize: "12px",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        <div>No file selected</div>
        <div style={{ fontSize: "10px" }}>Select a file to preview</div>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {native ? <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
        <span className="truncate text-sm font-medium text-ink-heading">{file.title}</span>
        <Button variant="secondary" size="sm" icon={ExternalLink} disabled={!previewUrl} onClick={handleOpenInNewTab}>Open in new tab</Button>
      </div> : <>      {/* Header with title + zoom controls */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 8px",
          borderBottom: "1px solid var(--zen-border)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            color: "var(--zen-fg)",
            fontSize: "11px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "60%",
          }}
          title={file.path || file.title}
        >
          {file.title}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <button
            onClick={handleZoomOut}
            disabled={zoom <= 50}
            style={{
              padding: "1px 6px",
              backgroundColor: "transparent",
              border: "1px solid var(--zen-border)",
              color: zoom <= 50 ? "var(--zen-dim)" : "var(--zen-fg)",
              cursor: zoom <= 50 ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              fontSize: "11px",
            }}
          >
            -
          </button>
          <span style={{ color: "var(--zen-fg)", fontSize: "10px", minWidth: "32px", textAlign: "center" }}>
            {zoom}%
          </span>
          <button
            onClick={handleZoomIn}
            disabled={zoom >= 200}
            style={{
              padding: "1px 6px",
              backgroundColor: "transparent",
              border: "1px solid var(--zen-border)",
              color: zoom >= 200 ? "var(--zen-dim)" : "var(--zen-fg)",
              cursor: zoom >= 200 ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              fontSize: "11px",
            }}
          >
            +
          </button>
          <button
            onClick={handleOpenInNewTab}
            style={{
              padding: "1px 6px",
              backgroundColor: "transparent",
              border: "1px solid var(--zen-border)",
              color: "var(--zen-fg)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "11px",
              marginLeft: "4px",
            }}
            title="Open in new tab"
          >
            open
          </button>
          <button
            onClick={togglePdfDarkMode}
            style={{
              padding: "1px 6px",
              backgroundColor: pdfDarkMode ? "var(--zen-fg)" : "transparent",
              border: "1px solid var(--zen-border)",
              color: pdfDarkMode ? "var(--zen-bg)" : "var(--zen-fg)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "11px",
            }}
            title={pdfDarkMode ? "Light PDF mode (D)" : "Dark PDF mode (D)"}
          >
            {pdfDarkMode ? "☀" : "☾"}
          </button>
        </div>
      </div>

</>}

      {/* Page selection for assignment */}
      {onPageSelect && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "4px 8px",
            borderBottom: "1px solid var(--zen-border)",
            fontSize: "11px",
            flexShrink: 0,
          }}
        >
          <span style={{ color: "var(--zen-dim)" }}>Pages:</span>
          <input
            type="text"
            value={pageStart}
            onChange={(e) => setPageStart(e.target.value)}
            placeholder="from"
            style={{
              width: "36px",
              backgroundColor: "var(--zen-bg)",
              border: "1px solid var(--zen-border)",
              color: "var(--zen-fg)",
              padding: "1px 4px",
              fontFamily: "inherit",
              fontSize: "11px",
            }}
          />
          <span style={{ color: "var(--zen-dim)" }}>-</span>
          <input
            type="text"
            value={pageEnd}
            onChange={(e) => setPageEnd(e.target.value)}
            placeholder="to"
            style={{
              width: "36px",
              backgroundColor: "var(--zen-bg)",
              border: "1px solid var(--zen-border)",
              color: "var(--zen-fg)",
              padding: "1px 4px",
              fontFamily: "inherit",
              fontSize: "11px",
            }}
          />
          <span style={{ color: "var(--zen-dim)", fontSize: "10px" }}>(blank=all)</span>
        </div>
      )}

      {/* PDF iframe */}
      <div
        style={{
          flex: 1,
          position: "relative",
          overflow: "auto",
          backgroundColor: "var(--zen-bg)",
        }}
      >
        {!native && isLoading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--zen-dim)",
              fontSize: "12px",
              zIndex: 1,
            }}
          >
            Loading PDF...
          </div>
        )}

        {!native && error && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            <span style={{ color: "var(--zen-error)", fontSize: "12px" }}>{error}</span>
            <button
              onClick={handleOpenInNewTab}
              style={{
                padding: "2px 8px",
                backgroundColor: "transparent",
                border: "1px solid var(--zen-border)",
                color: "var(--zen-fg)",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "11px",
              }}
            >
              Open in new tab
            </button>
          </div>
        )}

        {native ? <CanvasPdfPreview error={pdfLoadError} data={pdfData} src={pdfData ? undefined : previewUrl ?? undefined} title={file.title} path={file.path} onRetry={onRetry} onDocumentError={onDocumentError} /> : previewUrl && (
          <div
            style={{
              width: "100%",
              height: "100%",
              transform: `scale(${zoom / 100})`,
              transformOrigin: "top left",
            }}
          >
            <iframe
              src={previewUrl}
              style={{
                width: `${(100 / zoom) * 100}%`,
                height: `${(100 / zoom) * 100}%`,
                border: "none",
                ...(pdfDarkMode ? { filter: 'invert(0.86) hue-rotate(180deg)' } : {}),
              }}
              onLoad={() => setIsLoading(false)}
              onError={() => {
                setIsLoading(false);
                setError("Failed to load PDF preview");
              }}
              title="PDF Preview"
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "4px 8px",
          borderTop: "1px solid var(--zen-border)",
          fontSize: "10px",
          color: "var(--zen-dim)",
          flexShrink: 0,
        }}
      >
        +/- zoom • [a]ssign
      </div>
    </div>
  );
}
