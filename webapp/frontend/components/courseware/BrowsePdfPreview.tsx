"use client";

import { Loader2, ZoomIn, ZoomOut, ExternalLink, X, Copy, Check } from "lucide-react";
import { CalendarPlus } from "lucide-react";
import { HandwritingRemovalToolbar } from "@/components/ui/handwriting-removal-toolbar";

const ZOOM_LEVELS = [50, 75, 100, 125, 150, 200];

interface TreeNode {
  id: string;
  name: string;
  path: string;
  kind: "folder" | "file";
  handle?: FileSystemDirectoryHandle | FileSystemFileHandle;
  isShared?: boolean;
  lastModified?: number;
}

interface BrowsePdfPreviewProps {
  previewUrl: string;
  previewNode: TreeNode | null;
  previewLoading: boolean;
  zoomIndex: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onOpenInNewTab: () => void;
  onClose: () => void;
  onCopyPath: (path: string) => void;
  copiedPath: string | null;
  onAssign: () => void;
  // Handwriting removal
  cleanedPreviewUrl: string | null;
  showCleanedPreview: boolean;
  onCleanedPdf: (url: string) => void;
  onToggleCleaned: () => void;
}

export function BrowsePdfPreview({
  previewUrl,
  previewNode,
  previewLoading,
  zoomIndex,
  onZoomIn,
  onZoomOut,
  onOpenInNewTab,
  onClose,
  onCopyPath,
  copiedPath,
  onAssign,
  cleanedPreviewUrl,
  showCleanedPreview,
  onCleanedPdf,
  onToggleCleaned,
}: BrowsePdfPreviewProps) {
  const currentZoom = ZOOM_LEVELS[zoomIndex];

  return (
    <div className="flex-1 flex flex-col p-4 min-w-0">
      {/* Header with title and controls */}
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-gray-700 dark:text-gray-300 truncate">
          {previewNode?.name}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onZoomOut}
            disabled={zoomIndex === 0}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4 text-gray-500" />
          </button>
          <span className="text-xs text-gray-500 w-12 text-center">{currentZoom}%</span>
          <button
            onClick={onZoomIn}
            disabled={zoomIndex === ZOOM_LEVELS.length - 1}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4 text-gray-500" />
          </button>
          <button
            onClick={onOpenInNewTab}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ml-2"
            title="Open in new tab"
          >
            <ExternalLink className="h-4 w-4 text-gray-500" />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ml-1"
            title="Close preview"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Handwriting removal toolbar */}
      <HandwritingRemovalToolbar
        pdfBlobUrl={previewUrl}
        filename={previewNode?.name}
        onCleanedPdf={onCleanedPdf}
        showCleaned={showCleanedPreview}
        onToggleCleaned={onToggleCleaned}
        className="mb-2 py-2 border-b border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50"
      />

      {/* PDF iframe */}
      <div className="flex-1 bg-gray-100 dark:bg-gray-900 rounded-lg overflow-auto relative">
        {previewLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#a0704b]" />
          </div>
        ) : (
          <iframe
            src={showCleanedPreview && cleanedPreviewUrl ? cleanedPreviewUrl : previewUrl}
            className="w-full h-full border-0"
            style={{ transform: `scale(${currentZoom / 100})`, transformOrigin: "top left" }}
            title="PDF Preview"
          />
        )}
      </div>

      {/* Footer with path and actions */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#e8d4b8] dark:border-[#6b5a4a] overflow-hidden">
        <span className="text-xs text-gray-500 truncate flex-1 min-w-0 mr-2">
          {previewNode?.path}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onAssign}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded bg-[#5a8a5a] text-white hover:bg-[#4a7a4a]"
          >
            <CalendarPlus className="h-4 w-4" />
            Assign
          </button>
          <button
            onClick={() => previewNode && onCopyPath(previewNode.path)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded bg-[#a0704b] text-white hover:bg-[#8b6340]"
          >
            {copiedPath === previewNode?.path ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            Copy Path
          </button>
        </div>
      </div>
    </div>
  );
}
