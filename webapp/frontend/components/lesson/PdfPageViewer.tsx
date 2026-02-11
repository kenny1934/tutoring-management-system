"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Loader2, AlertTriangle, RefreshCw, FileX,
  PencilLine, Undo2, Redo2, Trash2, Eraser, Download, Circle,
  ZoomIn, ZoomOut, Maximize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { extractPagesForPrint, getPdfJs } from "@/lib/pdf-utils";
import { AnnotationLayer } from "./AnnotationLayer";
import { RENDER_SCALE } from "@/hooks/useAnnotations";
import type { PrintStampInfo } from "@/lib/pdf-utils";
import type { PageAnnotations, Stroke } from "@/hooks/useAnnotations";

// Pen colors palette
const PEN_COLORS = [
  { color: "#dc2626", label: "Red" },
  { color: "#2563eb", label: "Blue" },
  { color: "#16a34a", label: "Green" },
  { color: "#000000", label: "Black" },
  { color: "#f59e0b", label: "Orange" },
];

const PEN_SIZES = [
  { size: 3, label: "S" },
  { size: 6, label: "M" },
  { size: 12, label: "L" },
];

/** A rendered page image with its dimensions. */
interface RenderedPage {
  url: string;
  width: number;
  height: number;
}

interface PdfPageViewerProps {
  pdfData: ArrayBuffer | null;
  /** Pages to render (1-indexed). Empty array = all pages. */
  pageNumbers: number[];
  /** Stamp info to overlay on each page (same as printing). */
  stamp?: PrintStampInfo;
  isLoading: boolean;
  error: string | null;
  exerciseLabel?: string;
  onRetry?: () => void;
  /** Annotation state for this exercise's pages. */
  annotations?: PageAnnotations;
  /** Called when annotations change on any page. */
  onAnnotationsChange?: (annotations: PageAnnotations) => void;
  /** Whether drawing mode is active. */
  drawingEnabled?: boolean;
  /** Called to toggle drawing mode. */
  onDrawingToggle?: () => void;
  /** Current pen color. */
  penColor?: string;
  /** Called to change pen color. */
  onPenColorChange?: (color: string) => void;
  /** Current pen size. */
  penSize?: number;
  /** Called to change pen size. */
  onPenSizeChange?: (size: number) => void;
  /** Called to undo last stroke on a page. */
  onUndo?: () => void;
  /** Called to redo last undone stroke on a page. */
  onRedo?: () => void;
  /** Called to clear all annotations for this exercise. */
  onClearAll?: () => void;
  /** Whether any annotations exist (for showing save button). */
  hasAnnotations?: boolean;
  /** Called to save annotated PDF. */
  onSaveAnnotated?: () => void;
  /** Whether the eraser tool is active. */
  eraserActive?: boolean;
  /** Called to toggle the eraser tool. */
  onEraserToggle?: () => void;
  /** Exercise ID for render caching — skips re-render when switching back. */
  exerciseId?: number;
}

const MIN_ZOOM = 50;
const MAX_ZOOM = 200;
const ZOOM_STEP = 25;

export function PdfPageViewer({
  pdfData,
  pageNumbers,
  stamp,
  isLoading,
  error,
  exerciseLabel,
  onRetry,
  annotations = {},
  onAnnotationsChange,
  drawingEnabled = false,
  onDrawingToggle,
  penColor = "#dc2626",
  onPenColorChange,
  penSize = 3,
  onPenSizeChange,
  onUndo,
  onRedo,
  onClearAll,
  hasAnnotations = false,
  onSaveAnnotated,
  eraserActive = false,
  onEraserToggle,
  exerciseId,
}: PdfPageViewerProps) {
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const pageUrlsRef = useRef<string[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userHasZoomed = useRef(false);

  // Render cache: exerciseId → rendered pages (avoids re-rendering on exercise switch-back)
  const renderCacheRef = useRef<Map<number, RenderedPage[]>>(new Map());

  // Clear all confirmation state (arm-then-confirm pattern)
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);
  const clearAllTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleClearAllClick = useCallback(() => {
    if (confirmingClearAll) {
      clearTimeout(clearAllTimerRef.current);
      setConfirmingClearAll(false);
      onClearAll?.();
    } else {
      setConfirmingClearAll(true);
      clearAllTimerRef.current = setTimeout(() => setConfirmingClearAll(false), 2000);
    }
  }, [confirmingClearAll, onClearAll]);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    userHasZoomed.current = true;
    setZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const handleZoomOut = useCallback(() => {
    userHasZoomed.current = true;
    setZoom((z) => Math.max(z - ZOOM_STEP, MIN_ZOOM));
  }, []);

  const handleFitWidth = useCallback(() => {
    if (pages.length === 0 || !scrollContainerRef.current) return;
    const containerWidth = scrollContainerRef.current.clientWidth - 32; // px-4 padding
    const pageWidth = pages[0].width;
    const fitZoom = Math.floor((containerWidth / pageWidth) * 100);
    setZoom(Math.min(Math.max(fitZoom, MIN_ZOOM), MAX_ZOOM));
  }, [pages]);

  // Process PDF: extract+stamp → render pages as images (parallel)
  // Uses render cache to skip expensive pipeline when switching back to a previously viewed exercise.
  useEffect(() => {
    if (!pdfData) {
      pageUrlsRef.current = [];
      setPages([]);
      setProcessError(null);
      return;
    }

    // Cache hit — skip entire pipeline
    if (exerciseId != null) {
      const cached = renderCacheRef.current.get(exerciseId);
      if (cached) {
        pageUrlsRef.current = cached.map((r) => r.url);
        setPages(cached);
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
        // Step 1: Extract pages + stamp via pdf-lib
        let pdfBytes: ArrayBuffer;
        if (stamp || pageNumbers.length > 0) {
          const blob = await extractPagesForPrint(pdfData, pageNumbers, stamp);
          pdfBytes = await blob.arrayBuffer();
        } else {
          pdfBytes = pdfData;
        }

        if (cancelled) return;

        // Step 2: Render pages in parallel with pdfjs-dist
        const pdfjs = await getPdfJs();
        const doc = await pdfjs.getDocument({ data: pdfBytes }).promise;

        if (cancelled) {
          doc.destroy();
          return;
        }

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

          const url = URL.createObjectURL(blob);
          return {
            url,
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
        const urls = rendered.map((r) => r.url);

        pageUrlsRef.current = urls;
        setPages(rendered);

        // Store in render cache
        if (exerciseId != null) {
          renderCacheRef.current.set(exerciseId, rendered);
        }
      } catch {
        if (!cancelled) {
          setProcessError("Failed to process PDF");
        }
      } finally {
        if (!cancelled) setIsProcessing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfData, pageNumbers, stamp, exerciseId]);

  // Revoke all cached page URLs on unmount
  useEffect(() => {
    const cache = renderCacheRef.current;
    return () => {
      for (const pages of cache.values()) {
        pages.forEach((p) => URL.revokeObjectURL(p.url));
      }
      cache.clear();
    };
  }, []);

  // Auto fit-to-width when pages load
  useEffect(() => {
    if (pages.length === 0 || !scrollContainerRef.current) return;
    userHasZoomed.current = false;
    const containerWidth = scrollContainerRef.current.clientWidth - 32;
    const pageWidth = pages[0].width;
    const fitZoom = Math.floor((containerWidth / pageWidth) * 100);
    setZoom(Math.min(Math.max(fitZoom, MIN_ZOOM), MAX_ZOOM));
  }, [pages]);

  // ResizeObserver: auto-refit on window resize (only if user hasn't manually zoomed)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || pages.length === 0) return;

    const observer = new ResizeObserver(() => {
      if (userHasZoomed.current) return;
      const containerWidth = container.clientWidth - 32;
      const pageWidth = pages[0].width;
      const fitZoom = Math.floor((containerWidth / pageWidth) * 100);
      setZoom(Math.min(Math.max(fitZoom, MIN_ZOOM), MAX_ZOOM));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [pages]);

  // Keyboard shortcuts for zoom (+/- keys)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        userHasZoomed.current = true;
        setZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM));
      } else if (e.key === "-") {
        e.preventDefault();
        userHasZoomed.current = true;
        setZoom((z) => Math.max(z - ZOOM_STEP, MIN_ZOOM));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Scroll to top when exercise changes
  useEffect(() => {
    scrollContainerRef.current?.scrollTo(0, 0);
  }, [pdfData]);

  // Handle page strokes change
  const handlePageStrokesChange = useCallback(
    (pageIndex: number, strokes: Stroke[]) => {
      if (!onAnnotationsChange) return;
      onAnnotationsChange({ ...annotations, [pageIndex]: strokes });
    },
    [annotations, onAnnotationsChange]
  );

  // Loading state
  if (isLoading || isProcessing) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#e8dcc8] dark:bg-[#1e1a14]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 text-[#a0704b] animate-spin" />
          <span className="text-sm text-[#8b7355] dark:text-[#a09080]">
            {isLoading ? "Loading PDF..." : "Rendering pages..."}
          </span>
        </div>
      </div>
    );
  }

  // Error state
  if (error || processError) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#e8dcc8] dark:bg-[#1e1a14]">
        <div className="flex flex-col items-center gap-3 max-w-sm text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500" />
          <p className="text-sm text-[#8b7355] dark:text-[#a09080]">
            {error || processError}
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-[#a0704b] text-white hover:bg-[#8b6040] transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  // No PDF loaded / empty state
  if (!pdfData || pages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#e8dcc8] dark:bg-[#1e1a14]">
        <div className="flex flex-col items-center gap-3 text-center">
          <FileX className="h-10 w-10 text-[#c4a882]" />
          <p className="text-sm text-[#8b7355] dark:text-[#a09080]">
            Select an exercise to view
          </p>
        </div>
      </div>
    );
  }

  const zoomScale = zoom / 100;
  const tbBtnClass = "p-1 rounded hover:bg-[#d4c4a8] dark:hover:bg-[#3a3228] text-[#8b7355] dark:text-[#a09080] transition-colors";
  const tbBtnDisabled = "p-1 rounded text-[#d4c4a8] dark:text-[#3a3228] cursor-not-allowed";

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-[#e8dcc8] dark:bg-[#1e1a14]">
      {/* Toolbar */}
      <div className={cn(
        "flex items-center gap-1.5 px-2 py-1",
        "border-b border-[#d4c4a8] dark:border-[#3a3228]",
        "bg-[#f0e6d4] dark:bg-[#252018]",
        "flex-wrap"
      )}>
        {/* Exercise label */}
        {exerciseLabel && (
          <span className="text-xs font-medium text-[#8b7355] dark:text-[#a09080] truncate mr-1">
            {exerciseLabel}
          </span>
        )}
        {pageNumbers.length > 0 && (
          <span className="text-[10px] text-[#b0a090] dark:text-[#706050]">
            p{pageNumbers.length === 1
              ? pageNumbers[0]
              : `${pageNumbers[0]}-${pageNumbers[pageNumbers.length - 1]}`}
          </span>
        )}

        {/* Zoom controls */}
        <div className="flex items-center gap-0.5 ml-auto">
          <button
            onClick={handleZoomOut}
            disabled={zoom <= MIN_ZOOM}
            className={zoom <= MIN_ZOOM ? tbBtnDisabled : tbBtnClass}
            title="Zoom out (-)"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="text-[10px] text-[#8b7355] dark:text-[#a09080] min-w-[2.5rem] text-center tabular-nums">
            {zoom}%
          </span>
          <button
            onClick={handleZoomIn}
            disabled={zoom >= MAX_ZOOM}
            className={zoom >= MAX_ZOOM ? tbBtnDisabled : tbBtnClass}
            title="Zoom in (+)"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleFitWidth}
            className={tbBtnClass}
            title="Fit to width"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Annotation toolbar */}
        {onDrawingToggle && (
          <>
            {/* Separator */}
            <div className="h-4 w-px bg-[#d4c4a8] dark:bg-[#3a3228]" />

            {/* Pen tool toggle */}
            <button
              onClick={onDrawingToggle}
              className={cn(
                "p-1 rounded transition-colors",
                drawingEnabled && !eraserActive
                  ? "bg-[#a0704b] text-white"
                  : "hover:bg-[#d4c4a8] dark:hover:bg-[#3a3228] text-[#8b7355] dark:text-[#a09080]"
              )}
              title={drawingEnabled && !eraserActive ? "Exit draw mode (D)" : "Pen tool (D)"}
            >
              <PencilLine className="h-3.5 w-3.5" />
            </button>

            {/* Eraser tool toggle */}
            <button
              onClick={onEraserToggle}
              className={cn(
                "p-1 rounded transition-colors",
                eraserActive
                  ? "bg-[#a0704b] text-white"
                  : "hover:bg-[#d4c4a8] dark:hover:bg-[#3a3228] text-[#8b7355] dark:text-[#a09080]"
              )}
              title={eraserActive ? "Exit eraser mode (E)" : "Eraser tool (E)"}
            >
              <Eraser className="h-3.5 w-3.5" />
            </button>

            {/* Pen-specific controls: colors and sizes */}
            {drawingEnabled && !eraserActive && (
              <>
                {/* Color picker */}
                <div className="flex items-center gap-0.5">
                  {PEN_COLORS.map(({ color, label }) => (
                    <button
                      key={color}
                      onClick={() => onPenColorChange?.(color)}
                      className={cn(
                        "w-4 h-4 rounded-full border-2 transition-all",
                        penColor === color
                          ? "border-[#6b5a42] dark:border-[#c4a882] scale-110"
                          : "border-transparent hover:border-[#d4c4a8] dark:hover:border-[#5a4d3a]"
                      )}
                      style={{ backgroundColor: color }}
                      title={label}
                    />
                  ))}
                </div>

                {/* Size selector */}
                <div className="flex items-center gap-0.5">
                  {PEN_SIZES.map(({ size, label }) => (
                    <button
                      key={size}
                      onClick={() => onPenSizeChange?.(size)}
                      className={cn(
                        "flex items-center justify-center w-5 h-5 rounded transition-colors",
                        penSize === size
                          ? "bg-[#a0704b] text-white"
                          : "hover:bg-[#d4c4a8] dark:hover:bg-[#3a3228] text-[#8b7355] dark:text-[#a09080]"
                      )}
                      title={`Size: ${label}`}
                    >
                      <Circle
                        className="fill-current"
                        style={{
                          width: size === 3 ? 4 : size === 6 ? 7 : 10,
                          height: size === 3 ? 4 : size === 6 ? 7 : 10,
                        }}
                      />
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Annotation controls — visible when any annotation tool is active */}
            {drawingEnabled && (
              <>
                {/* Separator */}
                <div className="h-4 w-px bg-[#d4c4a8] dark:bg-[#3a3228]" />

                {/* Undo / Redo */}
                <button
                  onClick={onUndo}
                  className={tbBtnClass}
                  title="Undo (Z)"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={onRedo}
                  className={tbBtnClass}
                  title="Redo (Shift+Z)"
                >
                  <Redo2 className="h-3.5 w-3.5" />
                </button>

                {/* Separator */}
                <div className="h-4 w-px bg-[#d4c4a8] dark:bg-[#3a3228]" />

                {/* Clear all (with confirmation) */}
                <button
                  onClick={handleClearAllClick}
                  className={cn(
                    "p-1 rounded transition-colors",
                    confirmingClearAll
                      ? "bg-red-500 text-white"
                      : tbBtnClass
                  )}
                  title={confirmingClearAll ? "Click again to confirm" : "Clear all annotations"}
                >
                  {confirmingClearAll
                    ? <span className="text-[10px] font-bold px-0.5">Sure?</span>
                    : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </>
            )}

            {/* Save annotated PDF */}
            {hasAnnotations && onSaveAnnotated && (
              <button
                onClick={onSaveAnnotated}
                className="p-1 rounded hover:bg-[#d4c4a8] dark:hover:bg-[#3a3228] text-[#a0704b] transition-colors"
                title="Save annotated PDF"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Scrollable page container */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto px-4 py-4 min-h-0"
      >
        <div
          className="flex flex-col items-center gap-4"
          style={{
            transform: `scale(${zoomScale})`,
            transformOrigin: "top left",
            width: `${(100 / zoom) * 100}%`,
          }}
        >
          {pages.map((page, i) => (
            <div
              key={i}
              className="relative bg-white rounded shadow-lg ring-1 ring-black/5 dark:ring-white/5"
              style={{ width: page.width, height: page.height }}
            >
              <img
                src={page.url}
                alt={`Page ${i + 1}`}
                className="block w-full h-full rounded"
                draggable={false}
              />
              <AnnotationLayer
                width={page.width}
                height={page.height}
                strokes={annotations[i] || []}
                isDrawing={drawingEnabled && !eraserActive}
                isErasing={eraserActive}
                penColor={penColor}
                penSize={penSize}
                onStrokesChange={(strokes) => handlePageStrokesChange(i, strokes)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
