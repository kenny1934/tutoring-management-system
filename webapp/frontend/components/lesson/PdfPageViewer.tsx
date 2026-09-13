"use client";

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, useCallback, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import {
  Loader2, AlertTriangle, RefreshCw, FileX,
  ZoomIn, ZoomOut, UnfoldHorizontal, BookCheck, Moon, Sun,
  ChevronUp, ChevronDown, Printer, NotebookPen, GalleryHorizontal, Blinds,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { extractPagesForPrint, getPdfJs } from "@/lib/pdf-utils";
import { AnnotationLayer } from "./AnnotationLayer";
import { PaneTools, usePaneTools } from "./PaneTools";
import { CM } from "@/lib/drawing-guide";
import { AnnotationTray } from "./AnnotationTray";
import { PageThumbnails } from "./PageThumbnails";
import { PageCover } from "./PageCover";
import { RENDER_SCALE } from "@/hooks/useAnnotations";
import { useViewerTouch } from "@/hooks/useViewerTouch";
import { PDF_DARK_FILTER, usePdfDarkMode } from "@/hooks/usePdfDarkMode";
import { useTheme } from "next-themes";
import { inkLayerProps, type AnnotationTools } from "@/hooks/useAnnotationTools";
import type { PrintStampInfo } from "@/lib/pdf-utils";
import type { PageAnnotations, Stroke } from "@/hooks/useAnnotations";

/** Format page numbers into compact range notation: [1,3,5,6,7] → "1,3,5-7" */
function formatCompactPageRange(pages: number[]): string {
  if (pages.length === 0) return "";
  if (pages.length === 1) return String(pages[0]);
  const groups: string[] = [];
  let start = pages[0], end = pages[0];
  for (let i = 1; i < pages.length; i++) {
    if (pages[i] === end + 1) {
      end = pages[i];
    } else {
      groups.push(start === end ? String(start) : `${start}-${end}`);
      start = end = pages[i];
    }
  }
  groups.push(start === end ? String(start) : `${start}-${end}`);
  return groups.join(",");
}

// The toolbar's row and its buttons. The Draft's toolbar uses them too, so the
// two bars match. A pane too narrow for all its buttons scrolls its row
// sideways, with a thin scrollbar that shows there's more.
export const toolbarRow = cn(
  "flex flex-nowrap items-center gap-1 px-2 py-0.5 min-w-0 overflow-x-auto overflow-y-hidden scrollbar-thin",
  "border-b border-[#d4c4a8] dark:border-[#3a3228]",
  "bg-[#f0e6d4] dark:bg-[#252018]",
);
// Every toolbar button is 44px, the size a finger can hit at the board.
export const tbBtn = "min-w-11 h-11 px-2.5 flex flex-none items-center justify-center gap-1.5 rounded text-sm font-medium";
export const tbBtnIdle = "hover:bg-[#d4c4a8] dark:hover:bg-[#3a3228] text-[#8b7355] dark:text-[#a09080]";
export const tbBtnOn = "bg-[#a0704b] text-white";
// The page bar under the pages, in pixels. While the Draft is open, the lesson
// views float the Pen Tray over the worksheet and the Draft together from this
// far up, so the tray still sits just above the page bar.
export const PAGE_BAR_HEIGHT = 49;

/** A rendered page image with its dimensions. */
interface RenderedPage {
  url: string;
  width: number;
  height: number;
}

/**
 * How one exercise was last left in the viewer: its zoom, where it was
 * scrolled to, whether its ink was hidden, and any covers on its pages. The
 * lesson views keep one per exercise, so switching between students or
 * worksheets and back puts each one where the tutor left it.
 */
export interface PdfViewState {
  zoom: number;
  /** False while the zoom is still fit-to-width, which then follows the pane's size. */
  userZoomed: boolean;
  scrollTop: number;
  scrollLeft: number;
  inkHidden: boolean;
  /**
   * The covers on the exercise's pages, keyed by page index. Each is where
   * its top edge sits, from 0 at the top of the page to 1 at the bottom.
   */
  covers: Record<number, number>;
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
  /** Called with the one page whose strokes changed, and its new strokes. */
  onPageStrokesChange?: (pageIndex: number, strokes: Stroke[]) => void;
  /**
   * Saves several pages' strokes as one change. Pass it to let the lasso move
   * selected ink from one page to another. The lesson views give the Draft the
   * same one, so ink moves between the worksheet and the Draft as well.
   */
  onPagesStrokesChange?: (pages: PageAnnotations) => void;
  /**
   * The Pen Tray's settings. Pass them to show the tray and let people draw
   * on the pages. Without them the viewer is read-only.
   */
  tools?: AnnotationTools;
  /** Called to undo last stroke on a page. */
  onUndo?: () => void;
  /** Called to redo last undone stroke on a page. */
  onRedo?: () => void;
  /** Called to clear all annotations for this exercise. */
  onClearAll?: () => void;
  /** Called with a page's index to clear the ink on that page, from the tray's "Clear this page". */
  onClearPage?: (pageIndex: number) => void;
  /** Whether any annotations exist (for showing save button). */
  hasAnnotations?: boolean;
  /** Called to save annotated PDF. */
  onSaveAnnotated?: () => void;
  /** Exercise ID for render caching — skips re-render when switching back. */
  exerciseId?: number;
  /** Called to toggle answer key view. */
  onAnswerKeyToggle?: () => void;
  /** Whether answer key is currently shown. */
  showAnswerKey?: boolean;
  /** Whether an answer key file was found for this exercise. */
  answerKeyAvailable?: boolean;
  /** True while the search for this exercise's answer key is still running. */
  answerKeySearching?: boolean;
  /** Opens or closes the Draft beside the worksheet. Pass it to show the toolbar's Draft button. */
  onDraftToggle?: () => void;
  /** Whether the Draft is open. */
  showDraft?: boolean;
  /**
   * Buttons from the lesson view, shown at the start of the toolbar. Focus
   * mode puts its way back here, so a finger can always reach it.
   */
  toolbarStart?: ReactNode;
  /** Prints the exercise on screen. Pass it to show the toolbar's Print button. */
  onPrint?: () => void;
  /** True while a print is being prepared, which greys out the Print button. */
  isPrinting?: boolean;
  /** The Print button's tooltip, which shows the progress while printing. */
  printTitle?: string;
  /** What to say when there's nothing to show. Defaults to asking for an exercise. */
  emptyMessage?: string;
  /**
   * Where each exercise's zoom, scroll position, "Hide ink" and covers are
   * kept, keyed by exercise id. Pass the same map on every render.
   */
  viewStates?: Map<number, PdfViewState>;
  /**
   * Which saved view in viewStates this viewer uses, when it isn't keyed by
   * exerciseId. The answer key's viewer leaves exerciseId out, because the
   * render cache goes by that id alone and would show an old answer file's
   * pages when a new one arrives for the same exercise. So it passes the
   * exercise's id here, to keep its zoom, scroll and covers per exercise.
   */
  viewKey?: number;
  /** Shows a Cover button in the toolbar, for a viewer with no Pen Tray, such as the answer key. */
  coverButton?: boolean;
  /**
   * An area to show the Pen Tray in, in place of this viewer's own. While the
   * Draft is open, the lesson views pass one that covers the worksheet and the
   * Draft together. Null means that area isn't on the page yet, so the tray
   * waits for it.
   */
  trayArea?: HTMLElement | null;
  /**
   * How the lesson views zoom this viewer from the keyboard. The + and - keys
   * go through the views' key table, so they wait while a dialog is open, and
   * only the worksheet's viewer is handed this, so the answer key keeps its
   * own zoom.
   */
  ref?: Ref<PdfViewerHandle>;
}

/** What a lesson view can do to its worksheet's viewer from the keyboard. */
export interface PdfViewerHandle {
  zoomIn: () => void;
  zoomOut: () => void;
}

const MIN_ZOOM = 25;
const MAX_ZOOM = 200;
const ZOOM_STEP = 25;
const MAX_RENDER_CACHE_SIZE = 30;

/** Compute fit-to-width zoom for a container and page width. */
function computeFitZoom(container: HTMLElement, pageWidth: number): number {
  const style = getComputedStyle(container);
  const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const containerWidth = container.clientWidth - paddingX;
  const rawZoom = Math.floor((containerWidth / pageWidth) * 100);
  return Math.min(rawZoom, MAX_ZOOM);
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
  onPageStrokesChange,
  onPagesStrokesChange,
  tools,
  onUndo,
  onRedo,
  onClearAll,
  onClearPage,
  hasAnnotations = false,
  onSaveAnnotated,
  exerciseId,
  onAnswerKeyToggle,
  showAnswerKey = false,
  answerKeyAvailable = false,
  answerKeySearching = false,
  onDraftToggle,
  showDraft = false,
  toolbarStart,
  onPrint,
  isPrinting = false,
  printTitle = "Print this exercise (P)",
  emptyMessage = "Select an exercise to view",
  viewStates,
  viewKey,
  coverButton = false,
  trayArea,
  ref,
}: PdfPageViewerProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [currentVisiblePage, setCurrentVisiblePage] = useState(1);
  const [pdfDarkMode, togglePdfDarkMode] = usePdfDarkMode();
  const pageUrlsRef = useRef<string[]>([]);
  const pagesRef = useRef<RenderedPage[]>([]);
  const zoomRef = useRef(100);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userHasZoomed = useRef(false);
  const fitZoomRef = useRef(100);

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

  // Auto-retry state for transient processing failures
  const retryCountRef = useRef(0);
  const [autoRetryTick, setAutoRetryTick] = useState(0);

  // The tray's "Hide ink" switch. Hidden ink is still there, and you can still draw.
  const [inkHidden, setInkHiddenState] = useState(false);
  const inkHiddenRef = useRef(false);

  // The covers on this exercise's pages, from the tray's "Cover this page".
  // Like "Hide ink", they're part of the exercise's view, so they come back
  // when the tutor returns to it, but they're never saved as ink.
  const [covers, setCoversState] = useState<Record<number, number>>({});
  const coversRef = useRef<Record<number, number>>({});

  // ---------- Each exercise's view ----------
  // When the exercise changes, the view it was last left in waits here until
  // its pages are showing. `zoomTarget` is the zoom it settles on, and the
  // scroll position goes back once that zoom has been drawn. Scrolling isn't
  // recorded while a view is waiting, so the outgoing pages can't overwrite it.
  const restoreRef = useRef<(PdfViewState & { zoomTarget?: number }) | null>(null);

  // The saved view this viewer uses: its own key if it was given one, and otherwise the exercise's.
  const viewId = viewKey ?? exerciseId;

  const saveView = useCallback(() => {
    if (viewId == null || !viewStates || restoreRef.current) return;
    const el = scrollContainerRef.current;
    viewStates.set(viewId, {
      zoom: zoomRef.current,
      userZoomed: userHasZoomed.current,
      scrollTop: el?.scrollTop ?? 0,
      scrollLeft: el?.scrollLeft ?? 0,
      inkHidden: inkHiddenRef.current,
      covers: coversRef.current,
    });
  }, [viewId, viewStates]);

  const setInkHidden = useCallback((hidden: boolean) => {
    inkHiddenRef.current = hidden;
    setInkHiddenState(hidden);
    saveView();
  }, [saveView]);

  const setCovers = useCallback((next: Record<number, number>) => {
    coversRef.current = next;
    setCoversState(next);
    saveView();
  }, [saveView]);

  // Keep refs in sync with state (synchronous, before effects run)
  pagesRef.current = pages;
  zoomRef.current = zoom;

  const drawingEnabled = tools?.drawingEnabled ?? false;

  // ---------- Touch and pinch-zoom ----------
  // During a pinch the zoom is shown straight on the page stack, without a
  // React render per finger movement, and kept in state once the pinch ends.
  const pageStackRef = useRef<HTMLDivElement>(null);

  // Every style that follows the zoom level. React applies them once a zoom
  // settles, and previewZoom writes the very same ones during a pinch.
  const zoomStyles = useCallback((z: number): { stack: React.CSSProperties; scroller: React.CSSProperties } => {
    const scale = z / 100;
    const pagesNow = pagesRef.current;
    // gap-4 = 16px between pages
    const naturalHeight = pagesNow.reduce((sum, p) => sum + p.height, 0) + Math.max(0, pagesNow.length - 1) * 16;
    // Past fit-to-width the pages line up on the left so they can scroll sideways.
    const pastFit = z > fitZoomRef.current;
    return {
      stack: {
        transform: `scale(${scale})`,
        width: `${(100 / z) * 100}%`,
        marginBottom: scale < 1 ? `${naturalHeight * (scale - 1)}px` : "",
        alignItems: pastFit ? "flex-start" : "center",
      },
      scroller: { overflowX: pastFit ? "auto" : "hidden" },
    };
  }, []);

  const previewZoom = useCallback((z: number) => {
    const stack = pageStackRef.current, container = scrollContainerRef.current;
    if (!stack || !container) return;
    const styles = zoomStyles(z);
    Object.assign(stack.style, styles.stack);
    Object.assign(container.style, styles.scroller);
  }, [zoomStyles]);

  const commitZoom = useCallback((z: number) => {
    // Show the whole-number zoom that's kept, so the page already matches what
    // React renders next, even when the pinch ends back where it started.
    const settled = Math.round(z);
    previewZoom(settled);
    userHasZoomed.current = true;
    setZoom(settled);
  }, [previewZoom]);

  const { gestureActive, handlers: touchHandlers } = useViewerTouch({
    scrollRef: scrollContainerRef,
    getAnchor: () => pageRefs.current[0] ?? null,
    handTool: !drawingEnabled,
    zoom,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    previewZoom,
    commitZoom,
  });

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    userHasZoomed.current = true;
    setZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const handleZoomOut = useCallback(() => {
    userHasZoomed.current = true;
    setZoom((z) => Math.max(z - ZOOM_STEP, MIN_ZOOM));
  }, []);

  useImperativeHandle(ref, () => ({ zoomIn: handleZoomIn, zoomOut: handleZoomOut }), [handleZoomIn, handleZoomOut]);

  const handleFitWidth = useCallback(() => {
    if (pagesRef.current.length === 0 || !scrollContainerRef.current) return;
    const fit = computeFitZoom(scrollContainerRef.current, pagesRef.current[0].width);
    fitZoomRef.current = fit;
    setZoom(fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollToPage = useCallback((pageNum: number) => {
    const clamped = Math.max(1, Math.min(pageNum, pagesRef.current.length));
    const el = pageRefs.current[clamped - 1];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  // Ref-driven page input to avoid re-render storms from IntersectionObserver during smooth scroll
  const pageInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (pageInputRef.current && pageInputRef.current !== document.activeElement) {
      pageInputRef.current.value = String(currentVisiblePage);
    }
  }, [currentVisiblePage]);

  // The strip of small pages that the page bar's "Show all pages" button
  // raises. It closes whenever the viewer moves on to another file.
  const [thumbsOpen, setThumbsOpen] = useState(false);
  const thumbsButtonRef = useRef<HTMLButtonElement>(null);
  const closeThumbs = useCallback(() => setThumbsOpen(false), []);
  useEffect(() => { setThumbsOpen(false); }, [exerciseId, pdfData]);

  // The ruler, the protractor and the compasses, from More. They lie among
  // the pages, and they're put away when the viewer moves on to another file,
  // like the strip.
  const paneTools = usePaneTools(pageStackRef, scrollContainerRef);
  const { putAway } = paneTools;
  useEffect(() => { putAway(); }, [exerciseId, pdfData, putAway]);

  // Reset retry counter when a genuinely new PDF loads
  useEffect(() => {
    retryCountRef.current = 0;
    setAutoRetryTick(0);
  }, [pdfData, exerciseId]);

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
          try {
            const page = await doc.getPage(pageNum);
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            if (canvas.width === 0 || canvas.height === 0) return null;
            const ctx = canvas.getContext("2d");
            if (!ctx) return null;
            await page.render({ canvasContext: ctx, viewport }).promise;

            if (cancelled) return null;

            const blob = await new Promise<Blob>((resolve, reject) =>
              canvas.toBlob((b) => b ? resolve(b) : reject(new Error("toBlob returned null")), "image/png")
            );

            if (cancelled) return null;

            const url = URL.createObjectURL(blob);
            return {
              url,
              width: viewport.width / dpr,
              height: viewport.height / dpr,
            };
          } catch (err) {
            console.warn("[PdfPageViewer] Page render failed (page", pageNum, "):", err);
            return null;
          }
        };

        const pageNums = Array.from({ length: doc.numPages }, (_, i) => i + 1);
        const results = await Promise.all(pageNums.map(renderPage));

        doc.destroy();

        if (cancelled) {
          results.forEach((r) => r && URL.revokeObjectURL(r.url));
          return;
        }

        const rendered = results.filter((r): r is RenderedPage => r !== null);

        if (rendered.length === 0 && doc.numPages > 0) {
          throw new Error(`All ${doc.numPages} page(s) failed to render`);
        }

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
      } catch (err) {
        console.error("[PdfPageViewer] PDF processing failed:", err);
        if (!cancelled) {
          if (retryCountRef.current === 0) {
            // First failure: auto-retry once after a brief delay
            retryCountRef.current = 1;
            setTimeout(() => {
              if (!cancelled) setAutoRetryTick(t => t + 1);
            }, 500);
          } else {
            retryCountRef.current = 2;
            setProcessError("Failed to process PDF");
          }
        }
      } finally {
        // Keep spinner visible while auto-retry is pending (retryCount === 1)
        if (!cancelled && retryCountRef.current !== 1) {
          setIsProcessing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfData, pageNumbers, stamp, exerciseId, autoRetryTick]);

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

  // Pick the zoom for pages that have just arrived: the one this exercise was
  // left at if the tutor zoomed it, and otherwise fit-to-width.
  const settleZoom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (pagesRef.current.length === 0 || !container) return;
    const fit = computeFitZoom(container, pagesRef.current[0].width);
    fitZoomRef.current = fit;
    const pending = restoreRef.current;
    const target = pending?.userZoomed ? pending.zoom : fit;
    userHasZoomed.current = !!pending?.userZoomed;
    if (pending) pending.zoomTarget = target;
    if (target !== zoomRef.current) setZoom(target);
  }, []);

  // A new exercise, or new bytes for this one, brings back the view it was
  // left in, or the top of the first page at fit-to-width if it's new.
  useLayoutEffect(() => {
    const saved = viewId != null ? viewStates?.get(viewId) : undefined;
    restoreRef.current = saved
      ? { ...saved }
      : { zoom: 0, userZoomed: false, scrollTop: 0, scrollLeft: 0, inkHidden: false, covers: {} };
    inkHiddenRef.current = saved?.inkHidden ?? false;
    setInkHiddenState(inkHiddenRef.current);
    coversRef.current = saved?.covers ?? {};
    setCoversState(coversRef.current);
    setCurrentVisiblePage(1);
    // Pages that are already this exercise's won't arrive again, so settle now.
    if (exerciseId != null && renderCacheRef.current.get(exerciseId)?.pages === pagesRef.current) settleZoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseId, viewId, pdfData]);

  // Settle the zoom when pages load, except for hi-res re-renders of the same
  // pages. A layout effect, so the page never shows at the wrong size first.
  useLayoutEffect(() => {
    if (hiResRerenderRef.current) {
      hiResRerenderRef.current = false;
      return;
    }
    settleZoom();
  }, [pages, settleZoom]);

  // Once the settled zoom has been drawn, scroll back to where the tutor was.
  useLayoutEffect(() => {
    const pending = restoreRef.current;
    const el = scrollContainerRef.current;
    if (!pending || pending.zoomTarget === undefined || !el || pages.length === 0) return;
    if (zoom !== pending.zoomTarget) return;
    el.scrollTop = pending.scrollTop;
    el.scrollLeft = pending.scrollLeft;
    restoreRef.current = null;
  }, [pages, zoom]);

  // Remember each zoom change, including a pinch or a refit to the pane's width.
  useEffect(() => { saveView(); }, [zoom, saveView]);

  // Reset horizontal scroll when content fits (prevents stuck scroll after zoom-out)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container && zoom <= fitZoomRef.current) {
      container.scrollLeft = 0;
    }
  }, [zoom]);

  // ResizeObserver: auto-refit on window resize (only if user hasn't manually zoomed)
  // Uses pagesRef to avoid reconnecting observer on every hi-res re-render
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || pagesRef.current.length === 0) return;

    const observer = new ResizeObserver(() => {
      if (userHasZoomed.current || pagesRef.current.length === 0) return;
      const fit = computeFitZoom(container, pagesRef.current[0].width);
      fitZoomRef.current = fit;
      if (fit !== zoomRef.current) setZoom(fit);
    });
    observer.observe(container);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages.length]);

  // Track which page is most visible via scroll position (center of viewport)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || pages.length <= 1) return;

    const updateVisiblePage = () => {
      const containerRect = container.getBoundingClientRect();
      const viewportCenter = containerRect.top + containerRect.height / 2;
      let closest = 1;
      let closestDist = Infinity;
      for (let i = 0; i < pageRefs.current.length; i++) {
        const el = pageRefs.current[i];
        if (!el) continue;
        const elRect = el.getBoundingClientRect();
        const elCenter = elRect.top + elRect.height / 2;
        const dist = Math.abs(elCenter - viewportCenter);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i + 1;
        }
      }
      setCurrentVisiblePage(closest);
    };

    container.addEventListener("scroll", updateVisiblePage, { passive: true });
    return () => container.removeEventListener("scroll", updateVisiblePage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages.length]);

  // Debounced hi-res re-render when zoom exceeds current render resolution
  // Uses pagesRef to avoid re-triggering when pages change (prevents flash on initial load)
  useEffect(() => {
    if (pagesRef.current.length === 0 || !pdfBytesRef.current) return;

    const neededScale = (zoom / 100) * RENDER_SCALE;
    // Only re-render if zoom demands more than 10% beyond current resolution
    if (neededScale <= renderScaleRef.current * 1.1) return;

    let cancelled = false;
    let rafHandle: number | undefined;
    const pdfBytes = pdfBytesRef.current;
    const timer = setTimeout(async () => {
      try {
        const pdfjs = await getPdfJs();
        const doc = await pdfjs.getDocument({ data: pdfBytes.slice(0) }).promise;
        const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        const scale = neededScale * dpr;

        const renderPage = async (pageNum: number): Promise<RenderedPage | null> => {
          if (cancelled) return null;
          try {
            const page = await doc.getPage(pageNum);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            if (canvas.width === 0 || canvas.height === 0) return null;
            const ctx = canvas.getContext("2d");
            if (!ctx) return null;
            await (page.render({ canvasContext: ctx, viewport }) as any).promise;
            const blob = await new Promise<Blob>((resolve, reject) =>
              canvas.toBlob((b) => b ? resolve(b) : reject(new Error("toBlob returned null")), "image/png")
            );
            // CSS dimensions stay at base RENDER_SCALE so zoom CSS transform isn't double-counted
            const nativeWidth = viewport.width / scale;
            const nativeHeight = viewport.height / scale;
            return { url: URL.createObjectURL(blob), width: nativeWidth * RENDER_SCALE, height: nativeHeight * RENDER_SCALE };
          } catch (err) {
            console.warn("[PdfPageViewer] Hi-res page render failed (page", pageNum, "):", err);
            return null;
          }
        };

        const pageNums = Array.from({ length: doc.numPages }, (_, i) => i + 1);
        const results = await Promise.all(pageNums.map(renderPage));
        doc.destroy();

        if (cancelled) {
          results.forEach((r) => r && URL.revokeObjectURL(r.url));
          return;
        }

        const rendered = results.filter((r): r is RenderedPage => r !== null);

        // If hi-res render produced no valid pages, keep current (lower-res) pages
        if (rendered.length === 0) {
          return;
        }

        // Snapshot old URLs before replacing — revoke AFTER React flushes to DOM
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

        // Delay revocation so React can flush new img src to DOM first
        rafHandle = requestAnimationFrame(() => {
          oldUrls.forEach((url) => URL.revokeObjectURL(url));
        });
      } catch (err) {
        console.error("Hi-res re-render failed:", err);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      if (rafHandle !== undefined) cancelAnimationFrame(rafHandle);
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, exerciseId]);

  // While a worksheet loads, fails or is missing, the view's own buttons still
  // sit at the top. In focus mode they're the way back, so they can't vanish.
  const withStartBar = (content: ReactNode) => toolbarStart ? (
    <div className="flex-1 flex flex-col min-h-0 min-w-0">
      <div className={toolbarRow}>{toolbarStart}</div>
      {content}
    </div>
  ) : content;

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

    return withStartBar(
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
    return withStartBar(
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
    return withStartBar(
      <div className="flex-1 flex items-center justify-center bg-[#e8dcc8] dark:bg-[#1e1a14]">
        <div className="flex flex-col items-center gap-3 text-center">
          <FileX className="h-10 w-10 text-[#c4a882]" />
          <p className="text-sm text-[#8b7355] dark:text-[#a09080]">
            {emptyMessage}
          </p>
        </div>
      </div>
    );
  }

  const tbBtnClass = cn(tbBtn, tbBtnIdle, "transition-colors");
  const tbBtnDisabled = cn(tbBtn, "text-[#d4c4a8] dark:text-[#3a3228] cursor-not-allowed");
  // The words on the Cover, Draft, Answers and Print buttons only show when the pane has room for them.
  const tbLabel = "hidden @[560px]/toolbar:inline";
  // The tray floats over this viewer, unless the lesson view has given it an area of its own.
  const placeTray = (tray: ReactNode) => (trayArea ? createPortal(tray, trayArea) : tray);
  // Put a cover over a page from its top edge down, or take it off again.
  const toggleCover = (pageIndex: number) => {
    const { [pageIndex]: current, ...others } = coversRef.current;
    setCovers(current === undefined ? { ...coversRef.current, [pageIndex]: 0 } : others);
  };
  const pageCovered = covers[currentVisiblePage - 1] !== undefined;

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-[#e8dcc8] dark:bg-[#1e1a14]">
      {/* Toolbar. It never wraps: the file name gives way first, then the button labels, and then the row scrolls sideways. */}
      <div className={cn(toolbarRow, "@container/toolbar")}>
        {toolbarStart}
        {exerciseLabel && (
          <span className="min-w-0 truncate text-xs font-medium text-[#8b7355] dark:text-[#a09080] ml-1">
            {exerciseLabel}
          </span>
        )}
        {pageNumbers.length > 0 && (
          <span className="flex-none text-[10px] text-[#b0a090] dark:text-[#706050]">
            p{formatCompactPageRange(pageNumbers)}
          </span>
        )}
        <div className="flex-1" />
        {/* Zoom controls */}
        <div className="flex flex-none items-center gap-0.5">
          <button
            onClick={handleZoomOut}
            disabled={zoom <= MIN_ZOOM}
            className={zoom <= MIN_ZOOM ? tbBtnDisabled : tbBtnClass}
            title="Zoom out (-)"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-5 w-5" />
          </button>
          <span className="text-xs text-[#8b7355] dark:text-[#a09080] min-w-[2.75rem] text-center tabular-nums">
            {zoom}%
          </span>
          <button
            onClick={handleZoomIn}
            disabled={zoom >= MAX_ZOOM}
            className={zoom >= MAX_ZOOM ? tbBtnDisabled : tbBtnClass}
            title="Zoom in (+)"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-5 w-5" />
          </button>
          <button
            onClick={handleFitWidth}
            className={tbBtnClass}
            title="Fit to width"
            aria-label="Fit to width"
          >
            <UnfoldHorizontal className="h-5 w-5" />
          </button>
          <button
            onClick={togglePdfDarkMode}
            className={cn(tbBtnClass, pdfDarkMode && "!text-yellow-500 dark:!text-yellow-400")}
            title={pdfDarkMode ? "Light PDF mode" : "Dark PDF mode"}
            aria-label="Dark PDF mode"
            aria-pressed={pdfDarkMode}
          >
            {pdfDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </div>

        {(coverButton || onDraftToggle || onAnswerKeyToggle || onPrint) && <div className="flex-none h-6 w-px bg-[#d4c4a8] dark:bg-[#3a3228]" />}

        {/* Cover the page in view, for a viewer with no Pen Tray to do it from */}
        {coverButton && (
          <button
            onClick={() => toggleCover(currentVisiblePage - 1)}
            className={cn(tbBtn, "transition-colors", pageCovered ? tbBtnOn : tbBtnIdle)}
            title={pageCovered ? "Remove the cover" : "Cover this page"}
            aria-label="Cover"
            aria-pressed={pageCovered}
          >
            <Blinds className="h-5 w-5" />
            <span className={tbLabel}>Cover</span>
          </button>
        )}

        {/* Draft toggle */}
        {onDraftToggle && (
          <button
            onClick={onDraftToggle}
            className={cn(
              tbBtn, "transition-colors",
              showDraft ? tbBtnOn : tbBtnIdle,
            )}
            title={showDraft ? "Close the draft" : "Open a draft sheet beside the worksheet for your working."}
            aria-label="Draft"
            aria-pressed={showDraft}
          >
            <NotebookPen className="h-5 w-5" />
            <span className={tbLabel}>Draft</span>
          </button>
        )}

        {/* Answer key toggle */}
        {onAnswerKeyToggle && (
          <button
            onClick={onAnswerKeyToggle}
            disabled={!answerKeyAvailable}
            className={cn(
              tbBtn, "transition-colors",
              !answerKeyAvailable
                ? "text-[#d4c4a8] dark:text-[#3a3228] cursor-not-allowed"
                : showAnswerKey
                ? tbBtnOn
                : tbBtnIdle
            )}
            title={
              answerKeySearching ? "Looking for the answer key"
                : !answerKeyAvailable ? "No answer key found"
                : showAnswerKey ? "Hide answer key (A)" : "Show answer key (A)"
            }
            aria-label="Answers"
            aria-pressed={showAnswerKey}
            aria-busy={answerKeySearching || undefined}
          >
            {answerKeySearching
              ? <Loader2 className="h-5 w-5 animate-spin" />
              : <BookCheck className="h-5 w-5" />}
            <span className={tbLabel}>Answers</span>
          </button>
        )}

        {/* Print the exercise on screen */}
        {onPrint && (
          <button
            onClick={onPrint}
            disabled={isPrinting}
            className={isPrinting ? cn(tbBtnDisabled, "text-[#8b7355] dark:text-[#a09080]") : tbBtnClass}
            title={printTitle}
            aria-label="Print"
            aria-busy={isPrinting || undefined}
          >
            {isPrinting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5" />}
            <span className={tbLabel}>Print</span>
          </button>
        )}
      </div>

      {/* Scrollable page container, with the Pen Tray floating over its bottom edge */}
      <div className="relative flex-1 min-h-0 flex flex-col">
      <div
        ref={scrollContainerRef}
        {...touchHandlers}
        onScroll={saveView}
        className={cn(
          "flex-1 overflow-y-auto px-2 py-2 md:px-4 md:py-4 min-h-0",
          // Room under the last page, so its bottom lines can scroll clear of the tray
          tools && "!pb-24",
          tools && !drawingEnabled && "cursor-grab active:cursor-grabbing",
        )}
        // The viewer handles every touch itself: one finger for the tool, two
        // to scroll or pinch-zoom. The mouse wheel still scrolls as usual.
        style={{ touchAction: "none", ...zoomStyles(zoom).scroller }}
      >
        <div
          ref={pageStackRef}
          className="relative flex flex-col gap-4"
          style={{ ...zoomStyles(zoom).stack, transformOrigin: "top left" }}
        >
          {pages.map((page, i) => (
            <div
              key={i}
              ref={(el) => { pageRefs.current[i] = el; }}
              className="relative bg-white rounded shadow-lg ring-1 ring-black/5 dark:ring-white/5"
              style={{ width: page.width, height: page.height }}
            >
              {/* Dark PDF mode inverts the page and its ink together, so black
                  ink turns light on the darkened page instead of vanishing.
                  The saved PDF is drawn from the strokes, so it keeps the real colours. */}
              <div
                className="absolute inset-0 rounded"
                style={pdfDarkMode ? { filter: PDF_DARK_FILTER } : undefined}
              >
                <img
                  src={page.url}
                  alt={`Page ${i + 1}`}
                  className="block w-full h-full rounded"
                  draggable={false}
                />
                {tools && (
                  <AnnotationLayer
                    // A new exercise gets fresh layers, so fading ink from the last one doesn't linger
                    key={exerciseId}
                    width={page.width}
                    height={page.height}
                    strokes={annotations[i] || []}
                    {...inkLayerProps(tools)}
                    onStrokesChange={(strokes) => onPageStrokesChange?.(i, strokes)}
                    hidden={inkHidden}
                    suspended={gestureActive}
                    uiScale={zoom / 100}
                    guides={paneTools.guides}
                    pageIndex={i}
                    pageLabel={`Page ${i + 1}`}
                    onPagesChange={onPagesStrokesChange}
                  />
                )}
              </div>
              {covers[i] !== undefined && (
                <PageCover
                  top={covers[i]}
                  onMove={(top) => setCovers({ ...coversRef.current, [i]: top })}
                  onRemove={() => toggleCover(i)}
                  scale={zoom / 100}
                  darkMode={pdfDarkMode}
                />
              )}
            </div>
          ))}
          {tools && <PaneTools state={paneTools} containerRef={pageStackRef} cm={CM} darkMode={pdfDarkMode} />}
        </div>
      </div>

      {tools && onPageStrokesChange && trayArea !== null && placeTray(
        <AnnotationTray
          tools={tools}
          onUndo={onUndo}
          onRedo={onRedo}
          inkHidden={inkHidden}
          onInkHiddenChange={setInkHidden}
          hasInk={hasAnnotations}
          onClearAll={onClearAll}
          pageInView={pages.length > 1
            ? { number: currentVisiblePage, hasInk: (annotations[currentVisiblePage - 1]?.length ?? 0) > 0 }
            : undefined}
          onClearPage={onClearPage && (() => onClearPage(currentVisiblePage - 1))}
          cover={{ covered: pageCovered, onToggle: () => toggleCover(currentVisiblePage - 1) }}
          paneTools={paneTools}
          inkRevision={annotations}
          onSaveAnnotated={onSaveAnnotated}
        />,
      )}

      {thumbsOpen && pages.length > 1 && (
        <PageThumbnails
          pages={pages}
          current={currentVisiblePage}
          darkMode={pdfDarkMode}
          onPick={(page) => { scrollToPage(page); closeThumbs(); }}
          onClose={closeThumbs}
          toggleRef={thumbsButtonRef}
        />
      )}
      </div>

      {/* Bottom page navigation bar. It's there even for a one-page file, with
          its arrows greyed out, so the viewer keeps the same height and the
          Pen Tray doesn't jump up and down between exercises. */}
      <div className={cn(
        "flex items-center justify-center gap-2 px-2 py-0.5",
        "border-t border-[#d4c4a8] dark:border-[#3a3228]",
        "bg-[#f0e6d4] dark:bg-[#252018]",
      )} style={{ height: PAGE_BAR_HEIGHT }}>
        <button
          onClick={() => scrollToPage(currentVisiblePage - 1)}
          disabled={currentVisiblePage <= 1}
          className={currentVisiblePage <= 1 ? tbBtnDisabled : tbBtnClass}
          title="Previous page"
          aria-label="Previous page"
        >
          <ChevronUp className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-1 text-[11px] text-[#8b7355] dark:text-[#a09080]">
          <input
            ref={pageInputRef}
            type="text"
            inputMode="numeric"
            aria-label="Page number"
            disabled={pages.length <= 1}
            defaultValue={currentVisiblePage}
            onBlur={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val >= 1 && val <= pages.length) scrollToPage(val);
              else e.target.value = String(currentVisiblePage);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="w-8 text-center rounded border border-[#d4c4a8] dark:border-[#3a3228] bg-white/50 dark:bg-black/20 text-[11px] text-[#8b7355] dark:text-[#a09080] py-0.5 focus:outline-none focus:ring-1 focus:ring-[#a0704b]"
          />
          <span>/ {pages.length}</span>
        </div>
        <button
          onClick={() => scrollToPage(currentVisiblePage + 1)}
          disabled={currentVisiblePage >= pages.length}
          className={currentVisiblePage >= pages.length ? tbBtnDisabled : tbBtnClass}
          title="Next page"
          aria-label="Next page"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
        {/* The page number box is too small for a finger, so this raises a strip of small pages to pick from */}
        {pages.length > 1 && (
          <button
            ref={thumbsButtonRef}
            onClick={() => setThumbsOpen((open) => !open)}
            className={cn(tbBtn, "transition-colors", thumbsOpen ? tbBtnOn : tbBtnIdle)}
            title="Show all pages"
            aria-label="Show all pages"
            aria-expanded={thumbsOpen}
          >
            <GalleryHorizontal className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}
