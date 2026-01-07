"use client";

import { useState, useEffect, useCallback } from "react";
import { paperlessAPI } from "@/lib/api";

interface ZenPdfPreviewProps {
  documentId: number;
  documentTitle?: string;
  onClose: () => void;
  onSelect?: (pageStart?: number, pageEnd?: number, complexPages?: string) => void;
}

/**
 * Terminal-style PDF preview component for Zen mode
 *
 * Keyboard controls:
 * - +/-: Zoom in/out
 * - o: Open in new tab
 * - Enter: Select/confirm
 * - Escape: Close
 * - Tab: Switch between page inputs
 */
export function ZenPdfPreview({
  documentId,
  documentTitle,
  onClose,
  onSelect,
}: ZenPdfPreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);

  // Page selection
  const [pageMode, setPageMode] = useState<"simple" | "custom">("simple");
  const [pageStart, setPageStart] = useState("");
  const [pageEnd, setPageEnd] = useState("");
  const [customPages, setCustomPages] = useState("");

  const previewUrl = paperlessAPI.getPreviewUrl(documentId);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 25, 200));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 25, 50));
  }, []);

  const handleOpenInNewTab = useCallback(() => {
    window.open(previewUrl, "_blank");
  }, [previewUrl]);

  const handleSelect = useCallback(() => {
    if (!onSelect) {
      onClose();
      return;
    }

    if (pageMode === "custom" && customPages.trim()) {
      onSelect(undefined, undefined, customPages.trim());
    } else if (pageMode === "simple" && (pageStart || pageEnd)) {
      const start = pageStart ? parseInt(pageStart, 10) : undefined;
      const end = pageEnd ? parseInt(pageEnd, 10) : undefined;
      onSelect(start, end, undefined);
    } else {
      onSelect(undefined, undefined, undefined);
    }
  }, [onSelect, onClose, pageMode, pageStart, pageEnd, customPages]);

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Allow typing in inputs
      const isInInput = document.activeElement?.tagName === "INPUT";

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        handleSelect();
        return;
      }

      // Skip remaining shortcuts when in input
      if (isInInput) return;

      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        handleZoomIn();
        return;
      }

      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        handleZoomOut();
        return;
      }

      if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        handleOpenInNewTab();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, handleSelect, handleZoomIn, handleZoomOut, handleOpenInNewTab]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.9)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        padding: "16px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
          paddingBottom: "8px",
          borderBottom: "1px solid var(--zen-border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ color: "var(--zen-accent)", fontWeight: "bold" }}>
            PREVIEW
          </span>
          <span
            style={{
              color: "var(--zen-fg)",
              fontSize: "12px",
              maxWidth: "400px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {documentTitle || `Document #${documentId}`}
          </span>
        </div>

        {/* Zoom controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={handleZoomOut}
            disabled={zoom <= 50}
            style={{
              padding: "2px 8px",
              backgroundColor: "transparent",
              border: "1px solid var(--zen-border)",
              color: zoom <= 50 ? "var(--zen-dim)" : "var(--zen-fg)",
              cursor: zoom <= 50 ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              fontSize: "12px",
            }}
          >
            [-]
          </button>
          <span style={{ color: "var(--zen-fg)", fontSize: "12px", minWidth: "40px", textAlign: "center" }}>
            {zoom}%
          </span>
          <button
            onClick={handleZoomIn}
            disabled={zoom >= 200}
            style={{
              padding: "2px 8px",
              backgroundColor: "transparent",
              border: "1px solid var(--zen-border)",
              color: zoom >= 200 ? "var(--zen-dim)" : "var(--zen-fg)",
              cursor: zoom >= 200 ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              fontSize: "12px",
            }}
          >
            [+]
          </button>
          <span style={{ color: "var(--zen-dim)", fontSize: "10px", marginLeft: "8px" }}>
            +/- zoom • [O]pen • Esc close
          </span>
        </div>
      </div>

      {/* Page Selection */}
      {onSelect && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "12px",
            paddingBottom: "8px",
            borderBottom: "1px solid var(--zen-border)",
          }}
        >
          <span style={{ color: "var(--zen-dim)", fontSize: "11px" }}>Pages:</span>

          {/* Simple range */}
          <label style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <input
              type="radio"
              checked={pageMode === "simple"}
              onChange={() => setPageMode("simple")}
              style={{ width: "12px", height: "12px" }}
            />
            <input
              type="text"
              value={pageStart}
              onChange={(e) => setPageStart(e.target.value)}
              placeholder="from"
              disabled={pageMode !== "simple"}
              style={{
                width: "40px",
                backgroundColor: "var(--zen-bg)",
                border: "1px solid var(--zen-border)",
                color: "var(--zen-fg)",
                padding: "2px 4px",
                fontFamily: "inherit",
                fontSize: "11px",
                opacity: pageMode === "simple" ? 1 : 0.5,
              }}
            />
            <span style={{ color: "var(--zen-dim)" }}>-</span>
            <input
              type="text"
              value={pageEnd}
              onChange={(e) => setPageEnd(e.target.value)}
              placeholder="to"
              disabled={pageMode !== "simple"}
              style={{
                width: "40px",
                backgroundColor: "var(--zen-bg)",
                border: "1px solid var(--zen-border)",
                color: "var(--zen-fg)",
                padding: "2px 4px",
                fontFamily: "inherit",
                fontSize: "11px",
                opacity: pageMode === "simple" ? 1 : 0.5,
              }}
            />
          </label>

          {/* Custom range */}
          <label style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <input
              type="radio"
              checked={pageMode === "custom"}
              onChange={() => setPageMode("custom")}
              style={{ width: "12px", height: "12px" }}
            />
            <input
              type="text"
              value={customPages}
              onChange={(e) => setCustomPages(e.target.value)}
              placeholder="1,3,5-7"
              disabled={pageMode !== "custom"}
              style={{
                width: "80px",
                backgroundColor: "var(--zen-bg)",
                border: "1px solid var(--zen-border)",
                color: "var(--zen-fg)",
                padding: "2px 4px",
                fontFamily: "inherit",
                fontSize: "11px",
                opacity: pageMode === "custom" ? 1 : 0.5,
              }}
            />
          </label>

          <span style={{ flex: 1 }} />

          <button
            onClick={handleSelect}
            style={{
              padding: "4px 12px",
              backgroundColor: "transparent",
              border: "1px solid var(--zen-accent)",
              color: "var(--zen-accent)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "11px",
            }}
          >
            Select [Enter]
          </button>
        </div>
      )}

      {/* PDF Viewer */}
      <div
        style={{
          flex: 1,
          position: "relative",
          backgroundColor: "var(--zen-bg)",
          border: "1px solid var(--zen-border)",
          overflow: "auto",
        }}
      >
        {isLoading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--zen-dim)",
              fontSize: "12px",
            }}
          >
            Loading PDF...
          </div>
        )}

        {error && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
            }}
          >
            <span style={{ color: "var(--zen-error)", fontSize: "12px" }}>{error}</span>
            <button
              onClick={handleOpenInNewTab}
              style={{
                padding: "4px 12px",
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
            }}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setError("Failed to load PDF preview");
            }}
            title="PDF Preview"
          />
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "12px",
          paddingTop: "8px",
          borderTop: "1px solid var(--zen-border)",
        }}
      >
        <span style={{ color: "var(--zen-dim)", fontSize: "10px" }}>
          Document ID: {documentId}
        </span>
        <button
          onClick={onClose}
          style={{
            padding: "4px 12px",
            backgroundColor: "transparent",
            border: "1px solid var(--zen-dim)",
            color: "var(--zen-dim)",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "11px",
          }}
        >
          Close [Esc]
        </button>
      </div>
    </div>
  );
}

export default ZenPdfPreview;
