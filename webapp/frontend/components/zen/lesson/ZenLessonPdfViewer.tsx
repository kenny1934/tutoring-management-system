"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { extractPagesForPrint, getPdfJs, type PrintStampInfo } from "@/lib/pdf-utils";
import { AnnotationLayer } from "@/components/lesson/AnnotationLayer";
import type { Stroke } from "@/hooks/useAnnotations";

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

const PEN_COLORS = ["#e53e3e", "#3182ce", "#38a169", "#1a202c", "#dd6b20"];
const PEN_SIZES = [
  { label: "S", size: 3 },
  { label: "M", size: 6 },
  { label: "L", size: 12 },
];

const zenToolBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--zen-dim)",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "10px",
};

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
  stamp?: PrintStampInfo;
  currentPage: number;
  onCurrentPageChange: (page: number) => void;
  totalPages: number;
  onTotalPagesChange: (total: number) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  // Annotation props
  drawingEnabled?: boolean;
  isDrawing?: boolean;
  isErasing?: boolean;
  penColor?: string;
  penSize?: number;
  annotationHidden?: boolean;
  pageStrokes?: (pageIndex: number) => Stroke[];
  onStrokesChange?: (pageIndex: number, strokes: Stroke[]) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onClearPage?: (pageIndex: number) => void;
  onPenColorChange?: (color: string) => void;
  onPenSizeChange?: (size: number) => void;
  hasAnnotationsForExercise?: boolean;
  onSaveAnnotated?: () => void;
}

export function ZenLessonPdfViewer({
  pdfData,
  pageNumbers,
  isLoading,
  loadingMessage,
  error,
  exerciseId,
  stamp,
  currentPage,
  onCurrentPageChange,
  totalPages,
  onTotalPagesChange,
  zoom,
  onZoomChange,
  drawingEnabled,
  isDrawing,
  isErasing,
  penColor = "#e53e3e",
  penSize = 3,
  annotationHidden,
  pageStrokes,
  onStrokesChange,
  onUndo,
  onRedo,
  onClearPage,
  onPenColorChange,
  onPenSizeChange,
  hasAnnotationsForExercise,
  onSaveAnnotated,
}: ZenLessonPdfViewerProps) {
  const [clearConfirmPage, setClearConfirmPage] = useState<number | null>(null);
  const clearConfirmTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userHasZoomed = useRef(false);
  const fitZoomRef = useRef(100);

  // Track observer-reported page to distinguish external (keyboard) page changes
  const observerPageRef = useRef(1);
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;

  const renderCacheRef = useRef<Map<number, {
    pages: RenderedPage[];
    pdfBytes: ArrayBuffer;
  }>>(new Map());
  const renderScaleRef = useRef(RENDER_SCALE);
  const pdfBytesRef = useRef<ArrayBuffer | null>(null);
  const hiResRerenderRef = useRef(false);
  const exerciseIdRef = useRef(exerciseId);
  exerciseIdRef.current = exerciseId;

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
    renderScaleRef.current = RENDER_SCALE;

    (async () => {
      try {
        let pdfBytes: ArrayBuffer;
        if (stamp || pageNumbers.length > 0) {
          const blob = await extractPagesForPrint(pdfData, pageNumbers, stamp);
          pdfBytes = await blob.arrayBuffer();
        } else {
          pdfBytes = pdfData.slice(0);
        }

        if (cancelled) return;
        pdfBytesRef.current = pdfBytes;

        const pdfjs = await getPdfJs();
        const doc = await pdfjs.getDocument({ data: pdfBytes.slice(0) }).promise;

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
            if (oldestKey !== undefined && oldestKey !== exerciseId) {
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
  }, [pdfData, pageNumbers, stamp, exerciseId, onTotalPagesChange]);

  // Clean up blob URLs for uncached pages (e.g., answer viewer where exerciseId is undefined)
  useEffect(() => {
    const currentPages = pages;
    return () => {
      if (exerciseId == null) {
        // Don't revoke pages that belong to a cached exercise (transient undefined during student switch)
        const isCached = Array.from(renderCacheRef.current.values()).some(
          entry => entry.pages === currentPages
        );
        if (!isCached) {
          currentPages.forEach(p => URL.revokeObjectURL(p.url));
        }
      }
    };
  }, [pages, exerciseId]);

  // Hi-res re-render when zoom exceeds current render resolution
  useEffect(() => {
    if (pages.length === 0 || !pdfBytesRef.current) return;
    const neededScale = (zoom / 100) * RENDER_SCALE;
    if (neededScale <= renderScaleRef.current * 1.1) return;

    let cancelled = false;
    const pdfBytes = pdfBytesRef.current;
    const timer = setTimeout(async () => {
      try {
        const pdfjs = await getPdfJs();
        if (cancelled) return;
        const doc = await pdfjs.getDocument({ data: pdfBytes.slice(0) }).promise;
        if (cancelled) { doc.destroy(); return; }
        const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        const scale = neededScale * dpr;

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
          const nativeWidth = viewport.width / scale;
          const nativeHeight = viewport.height / scale;
          return { url: URL.createObjectURL(blob), width: nativeWidth * RENDER_SCALE, height: nativeHeight * RENDER_SCALE };
        };

        const pageNums = Array.from({ length: doc.numPages }, (_, i) => i + 1);
        const results = await Promise.all(pageNums.map(renderPage));
        doc.destroy();

        if (cancelled) {
          results.forEach(r => r && URL.revokeObjectURL(r.url));
          return;
        }

        const rendered = results.filter((r): r is RenderedPage => r !== null);
        const oldUrls = pages.map(p => p.url);

        hiResRerenderRef.current = true;
        setPages(rendered);
        renderScaleRef.current = neededScale;

        if (exerciseIdRef.current != null) {
          renderCacheRef.current.set(exerciseIdRef.current, { pages: rendered, pdfBytes });
        }

        oldUrls.forEach(url => URL.revokeObjectURL(url));
      } catch (err) {
        if (!cancelled) console.error("Hi-res re-render failed:", err);
      }
    }, 300);

    return () => { clearTimeout(timer); cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, pages]);

  // Cleanup cached pages and clear confirm timer on unmount
  useEffect(() => {
    const cache = renderCacheRef.current;
    return () => {
      for (const entry of cache.values()) {
        entry.pages.forEach((p) => URL.revokeObjectURL(p.url));
      }
      cache.clear();
      if (clearConfirmTimerRef.current) clearTimeout(clearConfirmTimerRef.current);
    };
  }, []);

  // Auto fit-to-width on initial load (skip for hi-res re-renders)
  useLayoutEffect(() => {
    if (pages.length === 0 || !scrollContainerRef.current) return;
    if (hiResRerenderRef.current) {
      hiResRerenderRef.current = false;
      return;
    }
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
  // Uses currentPageRef to avoid recreating observer on every page change
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || pages.length <= 1) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let maxRatio = 0;
        let maxPage = currentPageRef.current;
        for (const entry of entries) {
          if (entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            const idx = pageRefs.current.indexOf(entry.target as HTMLDivElement);
            if (idx >= 0) maxPage = idx + 1;
          }
        }
        if (maxRatio > 0) {
          observerPageRef.current = maxPage;
          onCurrentPageChange(maxPage);
        }
      },
      { root: container, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const el of pageRefs.current) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [pages, onCurrentPageChange]);

  // Scroll to page on external change (keyboard navigation)
  useEffect(() => {
    if (currentPage === observerPageRef.current) return;
    const el = pageRefs.current[currentPage - 1];
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [currentPage]);

  const showLoading = isLoading || isProcessing;
  const showError = error || processError;

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
          {drawingEnabled && (
            <>
              {/* Annotation toolbar */}
              <span style={{ display: "flex", gap: "2px", alignItems: "center", borderRight: "1px solid var(--zen-border)", paddingRight: "6px", marginRight: "2px" }}>
                {PEN_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => onPenColorChange?.(c)}
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      backgroundColor: c,
                      border: c === penColor ? "2px solid var(--zen-fg)" : "1px solid var(--zen-border)",
                      cursor: "pointer",
                      padding: 0,
                    }}
                    title={c}
                  />
                ))}
              </span>
              <span style={{ display: "flex", gap: "2px", alignItems: "center", borderRight: "1px solid var(--zen-border)", paddingRight: "6px", marginRight: "2px" }}>
                {PEN_SIZES.map(({ label, size: s }) => (
                  <button
                    key={label}
                    onClick={() => onPenSizeChange?.(s)}
                    style={{
                      background: "none",
                      border: "none",
                      color: s === penSize ? "var(--zen-accent)" : "var(--zen-dim)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: "10px",
                      fontWeight: s === penSize ? "bold" : "normal",
                      padding: "0 2px",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </span>
              <button onClick={onUndo} style={zenToolBtn} title="Undo (z)">↩</button>
              <button onClick={onRedo} style={zenToolBtn} title="Redo (Z)">↪</button>
              {onClearPage && (
                <button
                  onClick={() => {
                    if (clearConfirmTimerRef.current) clearTimeout(clearConfirmTimerRef.current);
                    if (clearConfirmPage === currentPage - 1) {
                      onClearPage(currentPage - 1);
                      setClearConfirmPage(null);
                    } else {
                      setClearConfirmPage(currentPage - 1);
                      clearConfirmTimerRef.current = setTimeout(() => setClearConfirmPage(null), 2000);
                    }
                  }}
                  style={{ ...zenToolBtn, color: clearConfirmPage === currentPage - 1 ? "var(--zen-error)" : "var(--zen-dim)" }}
                  title="Clear page annotations"
                >
                  {clearConfirmPage === currentPage - 1 ? "Sure?" : "Clear"}
                </button>
              )}
              {hasAnnotationsForExercise && onSaveAnnotated && (
                <button onClick={onSaveAnnotated} style={{ ...zenToolBtn, color: "var(--zen-accent)" }} title="Save annotated PDF (s)">
                  Save
                </button>
              )}
              <span style={{ borderRight: "1px solid var(--zen-border)", height: "12px", marginRight: "2px" }} />
            </>
          )}
          <button
            onClick={handleZoomOut}
            style={zenToolBtn}
          >
            [-]
          </button>
          <span>{zoom}%</span>
          <button
            onClick={handleZoomIn}
            style={zenToolBtn}
          >
            [+]
          </button>
          <button
            onClick={handleFitWidth}
            style={zenToolBtn}
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
                  position: "relative",
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
                {drawingEnabled && onStrokesChange && (
                  <AnnotationLayer
                    width={page.width * scaleFactor}
                    height={page.height * scaleFactor}
                    strokes={pageStrokes?.(i) || []}
                    isDrawing={isDrawing || false}
                    isErasing={isErasing || false}
                    penColor={penColor}
                    penSize={penSize * scaleFactor}
                    onStrokesChange={(strokes) => onStrokesChange(i, strokes)}
                    hidden={annotationHidden}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
