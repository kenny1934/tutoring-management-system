"use client";

import { useState, useEffect, useCallback } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, ZoomIn, ZoomOut, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { validatePageRange, getPageCount } from "@/lib/pdf-utils";
import type { PageSelection } from "@/types";

interface PdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: number | null;
  documentTitle?: string;
  onSelect?: (selection?: PageSelection) => void;
  enablePageSelection?: boolean;
}

export function PdfPreviewModal({
  isOpen,
  onClose,
  documentId,
  documentTitle,
  onSelect,
  enablePageSelection = false,
}: PdfPreviewModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [totalPages, setTotalPages] = useState<number | null>(null);

  // Page selection state
  const [pageStart, setPageStart] = useState<string>("");
  const [pageEnd, setPageEnd] = useState<string>("");
  const [complexRange, setComplexRange] = useState<string>("");
  const [useComplexRange, setUseComplexRange] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setError(null);
      setZoom(100);
      setTotalPages(null);
      // Reset page selection
      setPageStart("");
      setPageEnd("");
      setComplexRange("");
      setUseComplexRange(false);
      setRangeError(null);
    }
  }, [isOpen, documentId]);

  // Load page count when document changes
  useEffect(() => {
    if (!isOpen || !documentId || !enablePageSelection) return;

    const loadPageCount = async () => {
      try {
        const previewUrl = api.paperless.getPreviewUrl(documentId);
        const response = await fetch(previewUrl);
        if (!response.ok) return;
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const count = await getPageCount(arrayBuffer);
        setTotalPages(count);
      } catch {
        // Page count loading failed, validation will be skipped
      }
    };

    loadPageCount();
  }, [isOpen, documentId, enablePageSelection]);

  // Validate page range on change
  useEffect(() => {
    if (useComplexRange && complexRange) {
      if (!validatePageRange(complexRange, totalPages || undefined)) {
        if (totalPages) {
          setRangeError(`Invalid range. Max page is ${totalPages}`);
        } else {
          setRangeError("Invalid format. Use: 1,3,5-7");
        }
      } else {
        setRangeError(null);
      }
    } else if (!useComplexRange) {
      // Validate simple mode
      const start = pageStart ? parseInt(pageStart, 10) : null;
      const end = pageEnd ? parseInt(pageEnd, 10) : null;
      if (totalPages) {
        if ((start && start > totalPages) || (end && end > totalPages)) {
          setRangeError(`Max page is ${totalPages}`);
        } else if ((start && start < 1) || (end && end < 1)) {
          setRangeError("Page must be at least 1");
        } else {
          setRangeError(null);
        }
      } else {
        setRangeError(null);
      }
    } else {
      setRangeError(null);
    }
  }, [complexRange, useComplexRange, pageStart, pageEnd, totalPages]);

  // Build PageSelection from current state
  const buildPageSelection = useCallback((): PageSelection | undefined => {
    if (!enablePageSelection) return undefined;

    if (useComplexRange && complexRange.trim()) {
      return { complexRange: complexRange.trim() };
    }

    const start = pageStart ? parseInt(pageStart, 10) : undefined;
    const end = pageEnd ? parseInt(pageEnd, 10) : undefined;

    if (start || end) {
      return {
        pageStart: start,
        pageEnd: end || start, // If only start, use it as end too
      };
    }

    return undefined;
  }, [enablePageSelection, useComplexRange, complexRange, pageStart, pageEnd]);

  // Handle select action
  const handleSelect = useCallback(() => {
    if (!onSelect) return;
    if (rangeError) return; // Don't allow selection with invalid range

    const selection = buildPageSelection();
    onSelect(selection);
  }, [onSelect, buildPageSelection, rangeError]);

  // Keyboard shortcuts for preview modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        // Allow Enter to submit from input fields
        if (e.key === "Enter" && onSelect) {
          e.preventDefault();
          handleSelect();
        }
        return;
      }

      if (e.key === "Enter" && onSelect) {
        e.preventDefault();
        handleSelect();
      } else if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        if (documentId) {
          window.open(api.paperless.getPreviewUrl(documentId), "_blank");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onSelect, documentId, handleSelect]);

  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setError("Failed to load PDF preview");
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 25, 200));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 25, 50));
  };

  const handleOpenInNewTab = () => {
    if (documentId) {
      window.open(api.paperless.getPreviewUrl(documentId), "_blank");
    }
  };

  if (!documentId) return null;

  const previewUrl = api.paperless.getPreviewUrl(documentId);
  const hasPageSelection = enablePageSelection && (
    (useComplexRange && complexRange.trim()) ||
    (!useComplexRange && (pageStart || pageEnd))
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={documentTitle || "PDF Preview"}
      size="xl"
    >
      <div className="flex flex-col h-[70vh]">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleZoomOut}
              disabled={zoom <= 50}
              className="h-8 w-8 p-0"
              title="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[3rem] text-center">
              {zoom}%
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleZoomIn}
              disabled={zoom >= 200}
              className="h-8 w-8 p-0"
              title="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-3">
            {/* Keyboard hints */}
            <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:inline">
              {onSelect && "Enter to use · "}O to open in tab
            </span>
            {onSelect && (
              <Button
                size="sm"
                onClick={handleSelect}
                disabled={!!rangeError}
                className="gap-1"
              >
                <Check className="h-4 w-4" />
                {hasPageSelection ? "Use with Pages" : "Use"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenInNewTab}
              className="gap-1"
            >
              <ExternalLink className="h-4 w-4" />
              Open in new tab
            </Button>
          </div>
        </div>

        {/* Page Selection UI */}
        {enablePageSelection && (
          <div className="py-3 border-b border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                Page Range:
              </span>

              {/* Mode toggle */}
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="rangeMode"
                    checked={!useComplexRange}
                    onChange={() => setUseComplexRange(false)}
                    className="w-3.5 h-3.5 accent-amber-600"
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Simple</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="rangeMode"
                    checked={useComplexRange}
                    onChange={() => setUseComplexRange(true)}
                    className="w-3.5 h-3.5 accent-amber-600"
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Complex</span>
                </label>
              </div>

              {/* Page count display */}
              {totalPages && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  ({totalPages} pages)
                </span>
              )}

              {/* Simple range inputs */}
              {!useComplexRange && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max={totalPages || undefined}
                    placeholder={totalPages ? `1` : "Start"}
                    value={pageStart}
                    onChange={(e) => setPageStart(e.target.value)}
                    className={cn(
                      "w-20 px-2 py-1.5 text-sm rounded-md border",
                      "bg-white dark:bg-[#3d3427]",
                      rangeError
                        ? "border-red-400 dark:border-red-500"
                        : "border-[#d4c4a8] dark:border-[#5a4d3a]",
                      "focus:outline-none focus:ring-2",
                      rangeError ? "focus:ring-red-500/50" : "focus:ring-amber-500/50"
                    )}
                  />
                  <span className="text-gray-400">to</span>
                  <input
                    type="number"
                    min="1"
                    max={totalPages || undefined}
                    placeholder={totalPages ? `${totalPages}` : "End"}
                    value={pageEnd}
                    onChange={(e) => setPageEnd(e.target.value)}
                    className={cn(
                      "w-20 px-2 py-1.5 text-sm rounded-md border",
                      "bg-white dark:bg-[#3d3427]",
                      rangeError
                        ? "border-red-400 dark:border-red-500"
                        : "border-[#d4c4a8] dark:border-[#5a4d3a]",
                      "focus:outline-none focus:ring-2",
                      rangeError ? "focus:ring-red-500/50" : "focus:ring-amber-500/50"
                    )}
                  />
                  {rangeError && (
                    <p className="text-xs text-red-500">{rangeError}</p>
                  )}
                </div>
              )}

              {/* Complex range input */}
              {useComplexRange && (
                <div className="flex-1 min-w-[200px]">
                  <input
                    type="text"
                    placeholder={totalPages ? `1-${totalPages}` : "1,3,5-7,10"}
                    value={complexRange}
                    onChange={(e) => setComplexRange(e.target.value)}
                    className={cn(
                      "w-full px-2 py-1.5 text-sm rounded-md border",
                      "bg-white dark:bg-[#3d3427]",
                      rangeError
                        ? "border-red-400 dark:border-red-500"
                        : "border-[#d4c4a8] dark:border-[#5a4d3a]",
                      "focus:outline-none focus:ring-2",
                      rangeError
                        ? "focus:ring-red-500/50"
                        : "focus:ring-amber-500/50"
                    )}
                  />
                  {rangeError && (
                    <p className="text-xs text-red-500 mt-1">{rangeError}</p>
                  )}
                </div>
              )}

              {/* Optional helper text */}
              <span className="text-xs text-gray-400 dark:text-gray-500 hidden md:inline">
                {useComplexRange
                  ? "Commas for individual, hyphens for ranges"
                  : "Leave empty to use all pages"}
              </span>
            </div>
          </div>
        )}

        {/* PDF Viewer */}
        <div className="flex-1 relative overflow-auto bg-gray-100 dark:bg-gray-900 rounded-lg mt-3">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-900">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Loading PDF...
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-900">
              <div className="text-center">
                <p className="text-red-500 dark:text-red-400 mb-2">{error}</p>
                <Button variant="outline" size="sm" onClick={handleOpenInNewTab}>
                  Try opening in new tab
                </Button>
              </div>
            </div>
          )}

          {/*
            Zoom implementation: CSS transform scale changes visual size but not layout size.
            To compensate: at 200% zoom (scale=2), we need width/height at 50% (100/2) to fill container.
            Formula: (100 / zoom) * 100 = 10000 / zoom gives the percentage needed.
          */}
          <div
            className="w-full h-full"
            style={{
              transform: `scale(${zoom / 100})`,
              transformOrigin: "top left",
              width: `${(100 / zoom) * 100}%`,
              height: `${(100 / zoom) * 100}%`,
            }}
          >
            <iframe
              src={previewUrl}
              className="w-full h-full border-0"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
              title="PDF Preview"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
