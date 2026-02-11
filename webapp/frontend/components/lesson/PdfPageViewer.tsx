"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, ZoomIn, ZoomOut, Maximize2, AlertTriangle, RefreshCw, FileX } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPdfJs } from "@/lib/pdf-utils";
import type { PDFDocumentProxy } from "pdfjs-dist";

interface PdfPageViewerProps {
  pdfData: ArrayBuffer | null;
  /** Pages to render (1-indexed). Empty array = all pages. */
  pageNumbers: number[];
  isLoading: boolean;
  error: string | null;
  exerciseLabel?: string;
  onRetry?: () => void;
}

const DEFAULT_SCALE = 1.5;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3.0;
const SCALE_STEP = 0.25;

export function PdfPageViewer({
  pdfData,
  pageNumbers,
  isLoading,
  error,
  exerciseLabel,
  onRetry,
}: PdfPageViewerProps) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const renderedPagesRef = useRef<Set<number>>(new Set());
  const renderingPagesRef = useRef<Set<number>>(new Set());

  // Keep ref in sync for unmount cleanup
  pdfDocRef.current = pdfDoc;

  // Pages to display (resolved from pageNumbers or all pages)
  const [pagesToDisplay, setPagesToDisplay] = useState<number[]>([]);

  // Destroy PDF document on unmount
  useEffect(() => {
    return () => { pdfDocRef.current?.destroy(); };
  }, []);

  // Load PDF document when data changes
  useEffect(() => {
    if (!pdfData) {
      setPdfDoc(prev => { prev?.destroy(); return null; });
      setPagesToDisplay([]);
      return;
    }

    let cancelled = false;
    let loadedDoc: PDFDocumentProxy | null = null;

    async function loadDocument() {
      try {
        setIsRendering(true);
        setRenderError(null);
        renderedPagesRef.current.clear();
        renderingPagesRef.current.clear();

        const pdfjs = await getPdfJs();
        const doc = await pdfjs.getDocument({ data: pdfData! }).promise;
        loadedDoc = doc;

        if (cancelled) {
          doc.destroy();
          return;
        }

        // Destroy previous document before setting new one
        setPdfDoc(prev => { prev?.destroy(); return doc; });

        // Determine which pages to show
        const totalPages = doc.numPages;
        let pages: number[];
        if (pageNumbers.length > 0) {
          pages = pageNumbers.filter(p => p >= 1 && p <= totalPages);
        } else {
          pages = Array.from({ length: totalPages }, (_, i) => i + 1);
        }
        setPagesToDisplay(pages);
        setIsRendering(false);
      } catch (err) {
        if (!cancelled) {
          setRenderError("Failed to load PDF document");
          setIsRendering(false);
        }
      }
    }

    loadDocument();
    return () => {
      cancelled = true;
      // If load already completed, destroy the document
      if (loadedDoc) loadedDoc.destroy();
    };
  }, [pdfData, pageNumbers]);

  // Render a single page to canvas
  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfDoc || renderingPagesRef.current.has(pageNum) || renderedPagesRef.current.has(pageNum)) return;

    const canvas = canvasRefs.current.get(pageNum);
    if (!canvas) return;

    renderingPagesRef.current.add(pageNum);

    try {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvas, viewport }).promise;
      renderedPagesRef.current.add(pageNum);
    } catch {
      // Page render failed silently
    } finally {
      renderingPagesRef.current.delete(pageNum);
    }
  }, [pdfDoc, scale]);

  // Set up IntersectionObserver for lazy rendering
  useEffect(() => {
    if (!pdfDoc || pagesToDisplay.length === 0) return;

    // Clear previous renders on scale change
    renderedPagesRef.current.clear();
    renderingPagesRef.current.clear();

    observerRef.current?.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const pageNum = parseInt(entry.target.getAttribute("data-page") || "0", 10);
            if (pageNum > 0) {
              renderPage(pageNum);
            }
          }
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: "200px 0px", // Pre-render pages slightly before they enter viewport
      }
    );

    // Observe all page containers
    const containers = scrollContainerRef.current?.querySelectorAll("[data-page]");
    containers?.forEach(el => observerRef.current?.observe(el));

    return () => {
      observerRef.current?.disconnect();
    };
  }, [pdfDoc, pagesToDisplay, scale, renderPage]);

  // Scroll to top when exercise changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [pdfData]);

  const handleZoomIn = () => setScale(s => Math.min(s + SCALE_STEP, MAX_SCALE));
  const handleZoomOut = () => setScale(s => Math.max(s - SCALE_STEP, MIN_SCALE));
  const handleFitWidth = () => {
    if (!scrollContainerRef.current) return;
    const containerWidth = scrollContainerRef.current.clientWidth - 32; // account for px-4 padding
    const pdfPageWidth = 595; // standard A4 width in PDF units
    const fitScale = containerWidth / pdfPageWidth;
    setScale(Math.min(Math.max(fitScale, MIN_SCALE), MAX_SCALE));
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#e8dcc8] dark:bg-[#1e1a14]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 text-[#a0704b] animate-spin" />
          <span className="text-sm text-[#8b7355] dark:text-[#a09080]">Loading PDF...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error || renderError) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#e8dcc8] dark:bg-[#1e1a14]">
        <div className="flex flex-col items-center gap-3 max-w-sm text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500" />
          <p className="text-sm text-[#8b7355] dark:text-[#a09080]">
            {error || renderError}
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
  if (!pdfData || pagesToDisplay.length === 0) {
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

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-[#e8dcc8] dark:bg-[#1e1a14]">
      {/* Toolbar */}
      <div className={cn(
        "flex items-center justify-between gap-2 px-3 py-1.5",
        "border-b border-[#d4c4a8] dark:border-[#3a3228]",
        "bg-[#f0e6d4] dark:bg-[#252018]"
      )}>
        <div className="flex items-center gap-1.5 min-w-0">
          {exerciseLabel && (
            <span className="text-xs font-medium text-[#8b7355] dark:text-[#a09080] truncate">
              {exerciseLabel}
            </span>
          )}
          <span className="text-[10px] text-[#b0a090] dark:text-[#706050]">
            {pagesToDisplay.length} page{pagesToDisplay.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            disabled={scale <= MIN_SCALE}
            className="p-1 rounded hover:bg-[#d4c4a8] dark:hover:bg-[#3a3228] disabled:opacity-30 transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5 text-[#8b7355] dark:text-[#a09080]" />
          </button>
          <span className="text-[10px] text-[#8b7355] dark:text-[#a09080] min-w-[2.5rem] text-center tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            disabled={scale >= MAX_SCALE}
            className="p-1 rounded hover:bg-[#d4c4a8] dark:hover:bg-[#3a3228] disabled:opacity-30 transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5 text-[#8b7355] dark:text-[#a09080]" />
          </button>
          <button
            onClick={handleFitWidth}
            className="p-1 rounded hover:bg-[#d4c4a8] dark:hover:bg-[#3a3228] transition-colors"
            title="Reset zoom"
          >
            <Maximize2 className="h-3.5 w-3.5 text-[#8b7355] dark:text-[#a09080]" />
          </button>
        </div>
      </div>

      {/* Scrollable page container */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto px-4 py-4 min-h-0"
      >
        <div className="flex flex-col items-center gap-4">
          {pagesToDisplay.map((pageNum) => (
              <div
                key={pageNum}
                data-page={pageNum}
                className="relative inline-block"
                style={{ minWidth: 595 * scale, minHeight: 842 * scale }}
              >
                {/* Paper sheet effect */}
                <div className={cn(
                  "bg-white rounded shadow-lg",
                  "ring-1 ring-black/5 dark:ring-white/5"
                )}>
                  <canvas
                    ref={(el) => {
                      if (el) {
                        canvasRefs.current.set(pageNum, el);
                      } else {
                        canvasRefs.current.delete(pageNum);
                      }
                    }}
                    className="block rounded"
                  />
                </div>
                {/* Page number label */}
                <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/40 text-[10px] text-white tabular-nums">
                  p. {pageNum}
                </div>
              </div>
          ))}
        </div>
      </div>
    </div>
  );
}
