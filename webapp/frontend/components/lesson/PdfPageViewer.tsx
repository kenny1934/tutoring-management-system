"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, AlertTriangle, RefreshCw, FileX } from "lucide-react";
import { cn } from "@/lib/utils";
import { extractPagesForPrint } from "@/lib/pdf-utils";
import type { PrintStampInfo } from "@/lib/pdf-utils";

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
}

export function PdfPageViewer({
  pdfData,
  pageNumbers,
  stamp,
  isLoading,
  error,
  exerciseLabel,
  onRetry,
}: PdfPageViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Process PDF data: extract pages + stamp → blob URL
  useEffect(() => {
    if (!pdfData) {
      setBlobUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        blobUrlRef.current = null;
        return null;
      });
      setProcessError(null);
      return;
    }

    let cancelled = false;
    setIsProcessing(true);
    setProcessError(null);

    (async () => {
      try {
        let blob: Blob;
        if (stamp || pageNumbers.length > 0) {
          blob = await extractPagesForPrint(pdfData, pageNumbers, stamp);
        } else {
          blob = new Blob([pdfData], { type: "application/pdf" });
        }

        if (cancelled) return;

        const url = URL.createObjectURL(blob);
        setBlobUrl(prev => {
          if (prev) URL.revokeObjectURL(prev);
          blobUrlRef.current = url;
          return url;
        });
      } catch {
        if (!cancelled) {
          setProcessError("Failed to process PDF");
        }
      } finally {
        if (!cancelled) setIsProcessing(false);
      }
    })();

    return () => { cancelled = true; };
  }, [pdfData, pageNumbers, stamp]);

  // Revoke blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  // Loading state
  if (isLoading || isProcessing) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#e8dcc8] dark:bg-[#1e1a14]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 text-[#a0704b] animate-spin" />
          <span className="text-sm text-[#8b7355] dark:text-[#a09080]">
            {isLoading ? "Loading PDF..." : "Processing..."}
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
  if (!pdfData || !blobUrl) {
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
        "flex items-center gap-2 px-3 py-1.5",
        "border-b border-[#d4c4a8] dark:border-[#3a3228]",
        "bg-[#f0e6d4] dark:bg-[#252018]"
      )}>
        {exerciseLabel && (
          <span className="text-xs font-medium text-[#8b7355] dark:text-[#a09080] truncate">
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
      </div>

      {/* PDF viewer (browser-native) */}
      <iframe
        src={blobUrl}
        className="flex-1 border-0 min-h-0"
        title="PDF Preview"
      />
    </div>
  );
}
