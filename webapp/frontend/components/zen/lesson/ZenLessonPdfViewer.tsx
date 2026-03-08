"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { extractPagesForPrint, getPdfJs } from "@/lib/pdf-utils";

interface RenderedPage {
  url: string;
  width: number;
  height: number;
}

const MIN_ZOOM = 25;
const MAX_ZOOM = 200;
const ZOOM_STEP = 25;
const RENDER_SCALE = 1.5;
const MAX_RENDER_CACHE_SIZE = 20;

function computeFitZoom(container: HTMLElement, pageWidth: number): number {
  const style = getComputedStyle(container);
  const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const containerWidth = container.clientWidth - paddingX;
  return Math.min(Math.floor((containerWidth / pageWidth) * 100), MAX_ZOOM);
}

interface ZenLessonPdfViewerProps {
  pdfData: ArrayBuffer | null;
  pageNumbers: number[];
  isLoading: boolean;
  loadingMessage?: string | null;
  error: string | null;
  exerciseId?: number;
  currentPage: number;
  onCurrentPageChange: (page: number) => void;
  totalPages: number;
  onTotalPagesChange: (total: number) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
}

export function ZenLessonPdfViewer({
  pdfData,
  pageNumbers,
  isLoading,
  loadingMessage,
  error,
  exerciseId,
  currentPage,
  onCurrentPageChange,
  totalPages,
  onTotalPagesChange,
  zoom,
  onZoomChange,
}: ZenLessonPdfViewerProps) {
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userHasZoomed = useRef(false);
  const fitZoomRef = useRef(100);

  const renderCacheRef = useRef<Map<number, {
    pages: RenderedPage[];
    pdfBytes: ArrayBuffer;
  }>>(new Map());

  // Zoom handlers exposed for parent
  const handleZoomIn = useCallback(() => {
    userHasZoomed.current = true;
    onZoomChange(Math.min(zoom + ZOOM_STEP, MAX_ZOOM));
  }, [zoom, onZoomChange]);

  const handleZoomOut = useCallback(() => {
    userHasZoomed.current = true;
    onZoomChange(Math.max(zoom - ZOOM_STEP, MIN_ZOOM));
  }, [zoom, onZoomChange]);

  const handleFitWidth = useCallback(() => {
    if (pages.length === 0 || !scrollContainerRef.current) return;
    const fit = computeFitZoom(scrollContainerRef.current, pages[0].width);
    fitZoomRef.current = fit;
    onZoomChange(fit);
  }, [pages, onZoomChange]);

  // Expose methods via ref-like callbacks for parent keyboard handler
  // (parent calls onZoomChange/handleFitWidth directly)

  // Process PDF: extract pages → render as images
  useEffect(() => {
    if (!pdfData) {
      setPages([]);
      setProcessError(null);
      onTotalPagesChange(0);
      return;
    }

    // Cache hit
    if (exerciseId != null) {
      const cached = renderCacheRef.current.get(exerciseId);
      if (cached) {
        setPages(cached.pages);
        onTotalPagesChange(cached.pages.length);
        setIsProcessing(false);
        setProcessError(null);
        return;
      }
    }

    let cancelled = false;
    setIsProcessing(true);
    setProcessError(null);

    (async () => {
      try {
        let pdfBytes: ArrayBuffer;
        if (pageNumbers.length > 0) {
          const blob = await extractPagesForPrint(pdfData, pageNumbers);
          pdfBytes = await blob.arrayBuffer();
        } else {
          pdfBytes = pdfData.slice(0);
        }

        if (cancelled) return;

        const pdfjs = await getPdfJs();
        const doc = await pdfjs.getDocument({ data: pdfBytes }).promise;

        if (cancelled) { doc.destroy(); return; }

        const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        const scale = RENDER_SCALE * dpr;

        const renderPage = async (pageNum: number): Promise<RenderedPage | null> => {
          if (cancelled) return null;
          const page = await doc.getPage(pageNum);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return null;
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (cancelled) return null;
          const blob = await new Promise<Blob>((resolve) =>
            canvas.toBlob((b) => resolve(b!), "image/png")
          );
          if (cancelled) return null;
          return {
            url: URL.createObjectURL(blob),
            width: viewport.width / dpr,
            height: viewport.height / dpr,
          };
        };

        const pageNums = Array.from({ length: doc.numPages }, (_, i) => i + 1);
        const results = await Promise.all(pageNums.map(renderPage));
        doc.destroy();

        if (cancelled) {
          results.forEach((r) => r && URL.revokeObjectURL(r.url));
          return;
        }

        const rendered = results.filter((r): r is RenderedPage => r !== null);
        setPages(rendered);
        onTotalPagesChange(rendered.length);

        // Cache with LRU eviction
        if (exerciseId != null) {
          renderCacheRef.current.set(exerciseId, { pages: rendered, pdfBytes });
          if (renderCacheRef.current.size > MAX_RENDER_CACHE_SIZE) {
            const oldestKey = renderCacheRef.current.keys().next().value;
            if (oldestKey !== undefined) {
              renderCacheRef.current.get(oldestKey)?.pages.forEach(p => URL.revokeObjectURL(p.url));
              renderCacheRef.current.delete(oldestKey);
            }
          }
        }
      } catch {
        if (!cancelled) setProcessError("Failed to process PDF");
      } finally {
        if (!cancelled) setIsProcessing(false);
      }
    })();

    return () => { cancelled = true; };
  }, [pdfData, pageNumbers, exerciseId, onTotalPagesChange]);

  // Cleanup on unmount
  useEffect(() => {
    const cache = renderCacheRef.current;
    return () => {
      for (const entry of cache.values()) {
        entry.pages.forEach((p) => URL.revokeObjectURL(p.url));
      }
      cache.clear();
    };
  }, []);

  // Auto fit-to-width on initial load
  useLayoutEffect(() => {
    if (pages.length === 0 || !scrollContainerRef.current) return;
    userHasZoomed.current = false;
    const fit = computeFitZoom(scrollContainerRef.current, pages[0].width);
    fitZoomRef.current = fit;
    onZoomChange(fit);
  }, [pages, onZoomChange]);

  // Reset horizontal scroll when zoomed out
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container && zoom <= fitZoomRef.current) {
      container.scrollLeft = 0;
    }
  }, [zoom]);

  // ResizeObserver: auto-refit on resize
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || pages.length === 0) return;
    const observer = new ResizeObserver(() => {
      if (userHasZoomed.current) return;
      const fit = computeFitZoom(container, pages[0].width);
      fitZoomRef.current = fit;
      onZoomChange(fit);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [pages, onZoomChange]);

  // IntersectionObserver: track current visible page
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || pages.length <= 1) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let maxRatio = 0;
        let maxPage = currentPage;
        for (const entry of entries) {
          if (entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            const idx = pageRefs.current.indexOf(entry.target as HTMLDivElement);
            if (idx >= 0) maxPage = idx + 1;
          }
        }
        if (maxRatio > 0) onCurrentPageChange(maxPage);
      },
      { root: container, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const el of pageRefs.current) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [pages, currentPage, onCurrentPageChange]);

  // Scroll to page when navigated via keyboard
  const scrollToPage = useCallback((page: number) => {
    const el = pageRefs.current[page - 1];
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const showLoading = isLoading || isProcessing;
  const showError = error || processError;

  // Styled scale factor
  const scaleFactor = zoom / 100;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Status bar */}
      <div
        style={{
          padding: "4px 8px",
          borderBottom: "1px solid var(--zen-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "10px",
          color: "var(--zen-dim)",
          flexShrink: 0,
        }}
      >
        <span>
          {showLoading
            ? loadingMessage || "Loading..."
            : showError
            ? showError
            : pages.length > 0
            ? `Page ${currentPage}/${totalPages}`
            : "No PDF loaded"}
        </span>
        <span style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            onClick={handleZoomOut}
            style={{ background: "none", border: "none", color: "var(--zen-dim)", cursor: "pointer", fontFamily: "inherit", fontSize: "10px" }}
          >
            [-]
          </button>
          <span>{zoom}%</span>
          <button
            onClick={handleZoomIn}
            style={{ background: "none", border: "none", color: "var(--zen-dim)", cursor: "pointer", fontFamily: "inherit", fontSize: "10px" }}
          >
            [+]
          </button>
          <button
            onClick={handleFitWidth}
            style={{ background: "none", border: "none", color: "var(--zen-dim)", cursor: "pointer", fontFamily: "inherit", fontSize: "10px" }}
          >
            [f]it
          </button>
        </span>
      </div>

      {/* Scroll container */}
      <div
        ref={scrollContainerRef}
        style={{
          flex: 1,
          overflow: "auto",
          padding: "8px",
          backgroundColor: "var(--zen-bg)",
        }}
      >
        {showLoading && (
          <div style={{ padding: "32px", textAlign: "center", color: "var(--zen-dim)", fontSize: "12px" }}>
            {loadingMessage || "Loading PDF..."}
          </div>
        )}

        {!showLoading && showError && (
          <div style={{ padding: "32px", textAlign: "center", color: "var(--zen-error)", fontSize: "12px" }}>
            {showError}
          </div>
        )}

        {!showLoading && !showError && pages.length === 0 && (
          <div style={{ padding: "32px", textAlign: "center", color: "var(--zen-dim)", fontSize: "12px" }}>
            Select an exercise to view
          </div>
        )}

        {!showLoading && !showError && pages.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
              width: `${pages[0].width * scaleFactor}px`,
              margin: "0 auto",
            }}
          >
            {pages.map((page, i) => (
              <div
                key={i}
                ref={(el) => { pageRefs.current[i] = el; }}
                style={{
                  width: `${page.width * scaleFactor}px`,
                  height: `${page.height * scaleFactor}px`,
                  flexShrink: 0,
                }}
              >
                <img
                  src={page.url}
                  alt={`Page ${i + 1}`}
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "block",
                  }}
                  draggable={false}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

