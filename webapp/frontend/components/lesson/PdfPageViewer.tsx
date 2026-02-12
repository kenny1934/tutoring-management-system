"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Loader2, AlertTriangle, RefreshCw, FileX,
  PencilLine, Undo2, Redo2, Trash2, Eraser, Download, Circle,
  ZoomIn, ZoomOut, Maximize2, Eye, EyeOff, BookCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { extractPagesForPrint, getPdfJs } from "@/lib/pdf-utils";
import { AnnotationLayer } from "./AnnotationLayer";
import { RENDER_SCALE } from "@/hooks/useAnnotations";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useTheme } from "next-themes";
import {
  useFloating, offset, flip, shift, useClick, useDismiss, useInteractions,
  FloatingPortal,
} from "@floating-ui/react";
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

/** Mobile color popover — larger tap targets for touch devices. */
function MobileColorPopover({
  currentColor,
  onColorChange,
}: {
  currentColor: string;
  onColorChange: (color: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    placement: "bottom",
  });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

  return (
    <>
      <button
        ref={refs.setReference}
        {...getReferenceProps()}
        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded"
        title="Pen color"
      >
        <div
          className="w-6 h-6 rounded-full border-2 border-[#6b5a42] dark:border-[#c4a882]"
          style={{ backgroundColor: currentColor }}
        />
      </button>
      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-[200] bg-[#f0e6d4] dark:bg-[#252018] rounded-lg shadow-xl border border-[#d4c4a8] dark:border-[#3a3228] p-3"
          >
            <div className="flex gap-2">
              {PEN_COLORS.map(({ color, label }) => (
                <button
                  key={color}
                  onClick={() => { onColorChange(color); setIsOpen(false); }}
                  className={cn(
                    "w-11 h-11 rounded-full border-[3px] transition-all",
                    currentColor === color
                      ? "border-[#6b5a42] dark:border-[#c4a882] scale-110"
                      : "border-transparent"
                  )}
                  style={{ backgroundColor: color }}
                  title={label}
                />
              ))}
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

/** Mobile size popover — larger tap targets for touch devices. */
function MobileSizePopover({
  currentSize,
  onSizeChange,
}: {
  currentSize: number;
  onSizeChange: (size: number) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    placement: "bottom",
  });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

  return (
    <>
      <button
        ref={refs.setReference}
        {...getReferenceProps()}
        className={cn(
          "min-w-[44px] min-h-[44px] flex items-center justify-center rounded",
          "text-[#8b7355] dark:text-[#a09080]"
        )}
        title="Pen size"
      >
        <Circle
          className="fill-current"
          style={{
            width: currentSize === 3 ? 6 : currentSize === 6 ? 10 : 14,
            height: currentSize === 3 ? 6 : currentSize === 6 ? 10 : 14,
          }}
        />
      </button>
      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-[200] bg-[#f0e6d4] dark:bg-[#252018] rounded-lg shadow-xl border border-[#d4c4a8] dark:border-[#3a3228] p-3"
          >
            <div className="flex gap-2">
              {PEN_SIZES.map(({ size, label }) => (
                <button
                  key={size}
                  onClick={() => { onSizeChange(size); setIsOpen(false); }}
                  className={cn(
                    "w-11 h-11 flex items-center justify-center rounded-lg transition-colors",
                    currentSize === size
                      ? "bg-[#a0704b] text-white"
                      : "text-[#8b7355] dark:text-[#a09080] hover:bg-[#d4c4a8] dark:hover:bg-[#3a3228]"
                  )}
                  title={`Size: ${label}`}
                >
                  <Circle
                    className="fill-current"
                    style={{
                      width: size === 3 ? 6 : size === 6 ? 10 : 14,
                      height: size === 3 ? 6 : size === 6 ? 10 : 14,
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

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
  loadingMessage?: string | null;
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
  /** Called to toggle answer key view. */
  onAnswerKeyToggle?: () => void;
  /** Whether answer key is currently shown. */
  showAnswerKey?: boolean;
  /** Whether an answer key file was found for this exercise. */
  answerKeyAvailable?: boolean;
}

const MIN_ZOOM = 50;
const MAX_ZOOM = 200;
const ZOOM_STEP = 25;
const MAX_RENDER_CACHE_SIZE = 30;

/** Compute fit-to-width zoom for a container and page width. */
function computeFitZoom(container: HTMLElement, pageWidth: number): number {
  const containerWidth = container.clientWidth - 32; // px-4 padding
  const rawZoom = Math.floor((containerWidth / pageWidth) * 100);
  return Math.min(Math.max(rawZoom, MIN_ZOOM), MAX_ZOOM);
}

export function PdfPageViewer({
  pdfData,
  pageNumbers,
  stamp,
  isLoading,
  loadingMessage,
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
  onAnswerKeyToggle,
  showAnswerKey = false,
  answerKeyAvailable = false,
}: PdfPageViewerProps) {
  const isMobile = useIsMobile();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [currentVisiblePage, setCurrentVisiblePage] = useState(1);
  const pageUrlsRef = useRef<string[]>([]);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userHasZoomed = useRef(false);

  // Render cache: exerciseId → rendered pages + state needed for restoration
  const renderCacheRef = useRef<Map<number, {
    pages: RenderedPage[];
    pdfBytes: ArrayBuffer;
    renderScale: number;
  }>>(new Map());

  // Hi-res re-render state
  const pdfBytesRef = useRef<ArrayBuffer | null>(null);
  const renderScaleRef = useRef(RENDER_SCALE);
  const hiResRerenderRef = useRef(false);

  // Annotation visibility toggle
  const [annotationsVisible, setAnnotationsVisible] = useState(true);

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
    setZoom(computeFitZoom(scrollContainerRef.current, pages[0].width));
  }, [pages]);

  // Process PDF: extract+stamp → render pages as images (parallel)
  // Uses render cache to skip expensive pipeline when switching back to a previously viewed exercise.
  useEffect(() => {
    if (!pdfData) {
      pageUrlsRef.current = [];
      pdfBytesRef.current = null;
      setPages([]);
      setProcessError(null);
      return;
    }

    // Cache hit — restore complete snapshot
    if (exerciseId != null) {
      const cached = renderCacheRef.current.get(exerciseId);
      if (cached) {
        pageUrlsRef.current = cached.pages.map((r) => r.url);
        pdfBytesRef.current = cached.pdfBytes;
        renderScaleRef.current = cached.renderScale;
        setPages(cached.pages);
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
          // Clone to prevent pdfjs from detaching the cached ArrayBuffer
          pdfBytes = pdfData.slice(0);
        }

        if (cancelled) return;

        // Store extracted bytes for potential hi-res re-render (clone so pdfjs can consume the original)
        pdfBytesRef.current = pdfBytes.slice(0);

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
        renderScaleRef.current = RENDER_SCALE;

        // Store in render cache (with LRU eviction)
        if (exerciseId != null) {
          renderCacheRef.current.set(exerciseId, {
            pages: rendered,
            pdfBytes: pdfBytesRef.current!,
            renderScale: RENDER_SCALE,
          });
          if (renderCacheRef.current.size > MAX_RENDER_CACHE_SIZE) {
            const oldestKey = renderCacheRef.current.keys().next().value;
            if (oldestKey !== undefined) {
              renderCacheRef.current.get(oldestKey)?.pages.forEach(p => URL.revokeObjectURL(p.url));
              renderCacheRef.current.delete(oldestKey);
            }
          }
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
      for (const entry of cache.values()) {
        entry.pages.forEach((p) => URL.revokeObjectURL(p.url));
      }
      cache.clear();
    };
  }, []);

  // Auto fit-to-width when pages load (skip for hi-res re-renders)
  useEffect(() => {
    if (pages.length === 0 || !scrollContainerRef.current) return;
    if (hiResRerenderRef.current) {
      hiResRerenderRef.current = false;
      return;
    }
    userHasZoomed.current = false;
    setZoom(computeFitZoom(scrollContainerRef.current, pages[0].width));
  }, [pages]);

  // ResizeObserver: auto-refit on window resize (only if user hasn't manually zoomed)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || pages.length === 0) return;

    const observer = new ResizeObserver(() => {
      if (userHasZoomed.current) return;
      setZoom(computeFitZoom(container, pages[0].width));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [pages]);

  // IntersectionObserver: track which page is most visible
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || pages.length <= 1) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let maxRatio = 0;
        let maxPage = currentVisiblePage;
        for (const entry of entries) {
          if (entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            const idx = pageRefs.current.indexOf(entry.target as HTMLDivElement);
            if (idx >= 0) maxPage = idx + 1;
          }
        }
        if (maxRatio > 0) setCurrentVisiblePage(maxPage);
      },
      { root: container, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    for (const el of pageRefs.current) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [pages]);

  // Debounced hi-res re-render when zoom exceeds current render resolution
  useEffect(() => {
    if (pages.length === 0 || !pdfBytesRef.current) return;

    const neededScale = (zoom / 100) * RENDER_SCALE;
    // Only re-render if zoom demands more than 10% beyond current resolution
    if (neededScale <= renderScaleRef.current * 1.1) return;

    const pdfBytes = pdfBytesRef.current;
    const timer = setTimeout(async () => {
      try {
        const pdfjs = await getPdfJs();
        const doc = await pdfjs.getDocument({ data: pdfBytes.slice(0) }).promise;
        const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        const scale = neededScale * dpr;

        const renderPage = async (pageNum: number): Promise<RenderedPage | null> => {
          const page = await doc.getPage(pageNum);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return null;
          await (page.render({ canvasContext: ctx, viewport }) as any).promise;
          const blob = await new Promise<Blob>((resolve) =>
            canvas.toBlob((b) => resolve(b!), "image/png")
          );
          // CSS dimensions stay at base RENDER_SCALE so zoom CSS transform isn't double-counted
          const nativeWidth = viewport.width / scale;
          const nativeHeight = viewport.height / scale;
          return { url: URL.createObjectURL(blob), width: nativeWidth * RENDER_SCALE, height: nativeHeight * RENDER_SCALE };
        };

        const pageNums = Array.from({ length: doc.numPages }, (_, i) => i + 1);
        const results = await Promise.all(pageNums.map(renderPage));
        doc.destroy();

        const rendered = results.filter((r): r is RenderedPage => r !== null);

        // Snapshot old URLs before replacing — revoke AFTER cache is updated
        const oldUrls = [...pageUrlsRef.current];

        pageUrlsRef.current = rendered.map((r) => r.url);
        hiResRerenderRef.current = true;
        setPages(rendered);
        renderScaleRef.current = neededScale;

        // Update render cache so cached URLs stay valid on switch-back
        if (exerciseId != null) {
          renderCacheRef.current.set(exerciseId, {
            pages: rendered,
            pdfBytes: pdfBytesRef.current!,
            renderScale: neededScale,
          });
        }

        // Revoke old URLs after everything is updated
        oldUrls.forEach((url) => URL.revokeObjectURL(url));
      } catch (err) {
        console.error("Hi-res re-render failed:", err);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [zoom, pages, exerciseId]);

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
    // Theme-aware colors for the page-flip animation
    const spine = isDark
      ? 'linear-gradient(to bottom, #a0704b, #7a5535)'
      : 'linear-gradient(to bottom, #a0704b, #8b6040)';
    const basePage = isDark
      ? 'linear-gradient(135deg, #3d3530 0%, #453c34 100%)'
      : 'linear-gradient(135deg, #e8dcc8 0%, #ddd0b8 100%)';
    const baseInset = isDark
      ? 'inset 0 0 8px rgba(160, 112, 75, 0.15)'
      : 'inset 0 0 8px rgba(139, 96, 64, 0.15)';
    const pageColors = isDark
      ? { from: ['#554a40', '#4e4438', '#473e32'], to: ['#4a4036', '#443a30', '#3e352c'] }
      : { from: ['#faf3e6', '#f5eed8', '#f0e8d0'], to: ['#f0e4cc', '#ebe0c6', '#e6dbc0'] };
    const pageShadow = isDark
      ? '2px 2px 6px rgba(0, 0, 0, 0.4)'
      : '2px 2px 6px rgba(139, 96, 64, 0.2)';
    const lineColor = isDark ? 'rgba(180, 140, 100, 0.2)' : 'rgba(160, 112, 75, 0.15)';

    return (
      <div className="flex-1 flex items-center justify-center bg-[#e8dcc8] dark:bg-[#1e1a14]">
        <div className="flex flex-col items-center gap-5">
          {/* Page-turning book animation (falls back to simple pulse for reduced-motion) */}
          <div className="relative" style={{ perspective: '800px', width: '56px', height: '72px' }}>
            {/* Book spine */}
            <div
              className="absolute top-0 bottom-0 left-0 w-[3px] rounded-l-sm"
              style={{ background: spine }}
            />
            {/* Base page (static) */}
            <div
              className="absolute inset-0 rounded-r-md ml-[3px]"
              style={{ background: basePage, boxShadow: baseInset }}
            />
            {/* Flipping pages */}
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="absolute inset-0 rounded-r-md ml-[3px]"
                style={{
                  transformOrigin: 'left center',
                  backfaceVisibility: 'hidden',
                  background: `linear-gradient(135deg, ${pageColors.from[i]} 0%, ${pageColors.to[i]} 100%)`,
                  boxShadow: pageShadow,
                  animation: `pageFlip 2.4s cubic-bezier(0.4, 0, 0.2, 1) ${i * 0.8}s infinite`,
                  zIndex: 3 - i,
                }}
              >
                {/* Page lines (simulating text) */}
                <div className="absolute top-3 left-2 right-2 flex flex-col gap-1.5">
                  {[0, 1, 2, 3].map(j => (
                    <div
                      key={j}
                      className="rounded-full"
                      style={{
                        height: '2px',
                        width: `${70 - j * 12}%`,
                        opacity: 1 - j * 0.15,
                        background: lineColor,
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
            <style>{`
              @keyframes pageFlip {
                0%, 8% { transform: rotateY(0deg); opacity: 1; }
                35%, 45% { transform: rotateY(-180deg); opacity: 0; }
                46% { transform: rotateY(0deg); opacity: 0; }
                100% { transform: rotateY(0deg); opacity: 0; }
              }
              @media (prefers-reduced-motion: reduce) {
                @keyframes pageFlip {
                  0%, 50% { opacity: 1; transform: none; }
                  51%, 100% { opacity: 0; transform: none; }
                }
              }
            `}</style>
          </div>
          <span className="text-sm text-[#8b7355] dark:text-[#a09080]">
            {isLoading ? (loadingMessage || "Loading PDF...") : "Rendering pages..."}
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
  // Natural content height for scroll correction when zoomed out (gap-4 = 16px)
  const naturalContentHeight = pages.reduce((sum, p) => sum + p.height, 0) + Math.max(0, pages.length - 1) * 16;
  const tbBtn = isMobile ? "p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center" : "p-1";
  const tbBtnClass = cn(tbBtn, "rounded hover:bg-[#d4c4a8] dark:hover:bg-[#3a3228] text-[#8b7355] dark:text-[#a09080] transition-colors");
  const tbBtnDisabled = cn(tbBtn, "rounded text-[#d4c4a8] dark:text-[#3a3228] cursor-not-allowed");

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
        {pages.length > 1 && (
          <span className="text-[10px] text-[#b0a090] dark:text-[#706050]">
            Page {currentVisiblePage} of {pages.length}
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

        {/* Answer key toggle */}
        {onAnswerKeyToggle && (
          <>
            <div className="h-4 w-px bg-[#d4c4a8] dark:bg-[#3a3228]" />
            <button
              onClick={onAnswerKeyToggle}
              disabled={!answerKeyAvailable}
              className={cn(
                tbBtn, "rounded transition-colors text-[10px] font-bold",
                !answerKeyAvailable
                  ? "text-[#d4c4a8] dark:text-[#3a3228] cursor-not-allowed"
                  : showAnswerKey
                  ? "bg-[#a0704b] text-white"
                  : "hover:bg-[#d4c4a8] dark:hover:bg-[#3a3228] text-[#8b7355] dark:text-[#a09080]"
              )}
              title={!answerKeyAvailable ? "No answer key found" : showAnswerKey ? "Hide answer key" : "Show answer key"}
            >
              <BookCheck className="h-3.5 w-3.5" />
            </button>
          </>
        )}

        {/* Annotation toolbar */}
        {onDrawingToggle && (
          <>
            {/* Separator */}
            <div className="h-4 w-px bg-[#d4c4a8] dark:bg-[#3a3228]" />

            {/* Pen tool toggle */}
            <button
              onClick={onDrawingToggle}
              className={cn(
                tbBtn, "rounded transition-colors",
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
                tbBtn, "rounded transition-colors",
                eraserActive
                  ? "bg-[#a0704b] text-white"
                  : "hover:bg-[#d4c4a8] dark:hover:bg-[#3a3228] text-[#8b7355] dark:text-[#a09080]"
              )}
              title={eraserActive ? "Exit eraser mode (E)" : "Eraser tool (E)"}
            >
              <Eraser className="h-3.5 w-3.5" />
            </button>

            {/* Annotation visibility toggle */}
            <button
              onClick={() => setAnnotationsVisible(v => !v)}
              className={cn(
                tbBtn, "rounded transition-colors",
                !annotationsVisible
                  ? "bg-[#a0704b] text-white"
                  : "hover:bg-[#d4c4a8] dark:hover:bg-[#3a3228] text-[#8b7355] dark:text-[#a09080]"
              )}
              title={annotationsVisible ? "Hide annotations" : "Show annotations"}
            >
              {annotationsVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>

            {/* Pen-specific controls: colors and sizes */}
            {drawingEnabled && !eraserActive && (
              <>
                {isMobile ? (
                  <>
                    <MobileColorPopover
                      currentColor={penColor}
                      onColorChange={(c) => onPenColorChange?.(c)}
                    />
                    <MobileSizePopover
                      currentSize={penSize}
                      onSizeChange={(s) => onPenSizeChange?.(s)}
                    />
                  </>
                ) : (
                  <>
                    {/* Desktop: inline color picker */}
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

                    {/* Desktop: inline size selector */}
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
                    tbBtn, "rounded transition-colors",
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
                className={cn(tbBtn, "rounded hover:bg-[#d4c4a8] dark:hover:bg-[#3a3228] text-[#a0704b] transition-colors")}
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
        className="flex-1 overflow-auto px-2 py-2 md:px-4 md:py-4 min-h-0"
      >
        <div
          className="flex flex-col items-center gap-4"
          style={{
            transform: `scale(${zoomScale})`,
            transformOrigin: "top left",
            width: `${(100 / zoom) * 100}%`,
            marginBottom: zoomScale < 1 ? naturalContentHeight * (zoomScale - 1) : undefined,
          }}
        >
          {pages.map((page, i) => (
            <div
              key={i}
              ref={(el) => { pageRefs.current[i] = el; }}
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
                hidden={!annotationsVisible}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
