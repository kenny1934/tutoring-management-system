"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Eraser, Download, RotateCcw, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { documentProcessingAPI, type ProcessingMode } from "@/lib/api";

interface HandwritingRemovalToolbarProps {
  /** The current PDF blob URL to process */
  pdfBlobUrl: string | null;
  /** Filename for download naming */
  filename?: string;
  /** Callback when cleaned PDF is ready - provides blob URL for display */
  onCleanedPdf?: (cleanedUrl: string | null) => void;
  /** Whether to show the cleaned version (controlled externally) */
  showCleaned?: boolean;
  /** Callback when toggle is clicked */
  onToggleCleaned?: () => void;
  /** Optional class name for the container */
  className?: string;
}

/**
 * Reusable toolbar for handwriting removal from PDFs.
 * Works with local files (blob URLs) or any PDF source.
 */
export function HandwritingRemovalToolbar({
  pdfBlobUrl,
  filename,
  onCleanedPdf,
  showCleaned = false,
  onToggleCleaned,
  className,
}: HandwritingRemovalToolbarProps) {
  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cleanedPdfBase64, setCleanedPdfBase64] = useState<string | null>(null);
  const [hasCleanedVersion, setHasCleanedVersion] = useState(false);

  // Black ink removal options
  const [removeBlackInk, setRemoveBlackInk] = useState(false);
  const [blackInkMode, setBlackInkMode] = useState<ProcessingMode>("balanced");
  const [blackInkStrokeThreshold, setBlackInkStrokeThreshold] = useState(0);

  // Help tooltip state
  const [showHelp, setShowHelp] = useState(false);

  // Reset state when PDF changes
  useEffect(() => {
    setIsProcessing(false);
    setError(null);
    setCleanedPdfBase64(null);
    setHasCleanedVersion(false);
    setRemoveBlackInk(false);
    setBlackInkMode("balanced");
    setBlackInkStrokeThreshold(0);
    onCleanedPdf?.(null);
  }, [pdfBlobUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle handwriting removal
  const handleRemoveHandwriting = useCallback(async () => {
    if (!pdfBlobUrl || isProcessing) return;

    setIsProcessing(true);
    setError(null);

    try {
      // Fetch the PDF from blob URL
      const response = await fetch(pdfBlobUrl);
      if (!response.ok) {
        throw new Error("Failed to fetch PDF");
      }
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();

      // Convert to base64
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ""
        )
      );

      // Call the API to remove handwriting
      const result = await documentProcessingAPI.removeHandwriting(base64, {
        removeBlackInk,
        blackInkMode,
        blackInkStrokeThreshold,
      });

      if (result.success) {
        // Store base64 for download
        setCleanedPdfBase64(result.pdf_base64);

        // Convert base64 back to blob URL for display
        const binaryString = atob(result.pdf_base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const cleanedBlob = new Blob([bytes], { type: "application/pdf" });
        const cleanedUrl = URL.createObjectURL(cleanedBlob);

        setHasCleanedVersion(true);
        onCleanedPdf?.(cleanedUrl);
      } else {
        throw new Error(result.message || "Processing failed");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to remove handwriting"
      );
    } finally {
      setIsProcessing(false);
    }
  }, [pdfBlobUrl, isProcessing, removeBlackInk, blackInkMode, blackInkStrokeThreshold, onCleanedPdf]);

  // Download cleaned PDF
  const handleDownloadCleaned = useCallback(() => {
    if (!cleanedPdfBase64) return;

    // Convert base64 to blob
    const binaryString = atob(cleanedPdfBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: "application/pdf" });

    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Generate filename: original_cleaned.pdf
    const baseName = (filename || "document").replace(/\.pdf$/i, "");
    a.download = `${baseName}_cleaned.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [cleanedPdfBase64, filename]);

  if (!pdfBlobUrl) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {/* Help button with tooltip */}
      <div className="relative">
        <button
          onClick={() => setShowHelp(!showHelp)}
          onBlur={() => setTimeout(() => setShowHelp(false), 150)}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
          title="Usage tips"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
        {showHelp && (
          <div className="absolute left-0 top-full mt-1 z-50 w-64 p-3 bg-white dark:bg-[#2d2820] border border-[#e8d4b8] dark:border-[#5a4d3a] rounded-lg shadow-lg text-xs">
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">Works best for:</p>
            <ul className="text-gray-600 dark:text-gray-400 space-y-0.5 mb-2">
              <li>- Blue, red, green ink</li>
              <li>- Pencil marks</li>
              <li>- Ballpoint pen on laser print</li>
              <li>- Thin handwriting strokes</li>
            </ul>
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">May not work for:</p>
            <ul className="text-gray-600 dark:text-gray-400 space-y-0.5">
              <li>- Thick markers</li>
              <li>- Very dark handwriting</li>
              <li>- Text overlapping print</li>
            </ul>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <span className="text-xs text-red-500">{error}</span>
      )}

      {/* Black ink removal options */}
      <label className="flex items-center gap-1.5 cursor-pointer" title="Also try to remove black/dark ink using stroke analysis">
        <input
          type="checkbox"
          checked={removeBlackInk}
          onChange={(e) => setRemoveBlackInk(e.target.checked)}
          className="w-3.5 h-3.5 accent-amber-600"
        />
        <span className="text-xs text-gray-600 dark:text-gray-400">Black ink</span>
      </label>

      {/* Mode selector (only shown when black ink is enabled) */}
      {removeBlackInk && (
        <>
          <select
            value={blackInkMode}
            onChange={(e) => setBlackInkMode(e.target.value as ProcessingMode)}
            className={cn(
              "h-7 px-2 text-xs rounded-md border",
              "bg-white dark:bg-[#3d3427]",
              "border-[#d4c4a8] dark:border-[#5a4d3a]",
              "focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            )}
            title="Black ink removal aggressiveness"
          >
            <option value="conservative">Conservative</option>
            <option value="balanced">Balanced</option>
            <option value="aggressive">Aggressive</option>
          </select>

          {/* Manual stroke threshold slider */}
          <div className="flex items-center gap-1.5" title="Manual stroke width threshold (0 = use preset)">
            <span className="text-xs text-gray-500 dark:text-gray-400">Width:</span>
            <input
              type="range"
              min="0"
              max="20"
              value={blackInkStrokeThreshold}
              onChange={(e) => setBlackInkStrokeThreshold(parseInt(e.target.value, 10))}
              className="w-14 h-1.5 accent-amber-600"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400 min-w-[2rem]">
              {blackInkStrokeThreshold === 0 ? "Auto" : blackInkStrokeThreshold}
            </span>
          </div>
        </>
      )}

      {/* Handwriting removal button */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleRemoveHandwriting}
        disabled={isProcessing}
        className="gap-1.5 h-7 text-xs"
        title="Remove handwriting from scanned PDF"
      >
        {isProcessing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Eraser className="h-3.5 w-3.5" />
        )}
        <span className="hidden sm:inline">
          {isProcessing ? "Processing..." : "Remove Handwriting"}
        </span>
      </Button>

      {/* Show toggle and download when cleaned version exists */}
      {hasCleanedVersion && onToggleCleaned && (
        <Button
          variant={showCleaned ? "default" : "outline"}
          size="sm"
          onClick={onToggleCleaned}
          className="gap-1.5 h-7 text-xs"
          title={showCleaned ? "Show original" : "Show cleaned version"}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">
            {showCleaned ? "Original" : "Cleaned"}
          </span>
        </Button>
      )}

      {hasCleanedVersion && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadCleaned}
          className="gap-1.5 h-7 text-xs"
          title="Download cleaned PDF"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Download</span>
        </Button>
      )}
    </div>
  );
}
