"use client";

import { useState } from "react";
import { Loader2, ZoomIn, ZoomOut, ExternalLink, X, Copy, Check, ScanLine } from "lucide-react";
import { CalendarPlus } from "lucide-react";
import { HandwritingRemovalToolbar } from "@/components/ui/handwriting-removal-toolbar";
import ImportWorksheetModal from "@/components/documents/ImportWorksheetModal";
import { Button, IconButton } from "@/components/controls";

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
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPdf, setImportPdf] = useState<{ blob: Blob; filename: string; path?: string } | null>(null);

  return (
    <div className="flex-1 flex flex-col p-4 min-w-0">
      {/* Header with title and controls */}
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-gray-700 dark:text-gray-300 truncate">
          {previewNode?.name}
        </span>
        <div className="flex items-center gap-1">
          <IconButton icon={ZoomOut} size="sm" label="Zoom out" onClick={onZoomOut} disabled={zoomIndex === 0} />
          <span className="text-xs text-gray-500 w-12 text-center">{currentZoom}%</span>
          <IconButton icon={ZoomIn} size="sm" label="Zoom in" onClick={onZoomIn} disabled={zoomIndex === ZOOM_LEVELS.length - 1} />
          <IconButton icon={ExternalLink} size="sm" label="Open in new tab" onClick={onOpenInNewTab} className="ml-2" />
          <IconButton icon={X} size="sm" label="Close preview" onClick={onClose} />
        </div>
      </div>

      {/* Handwriting removal toolbar */}
      <HandwritingRemovalToolbar
        pdfBlobUrl={previewUrl}
        filename={previewNode?.name}
        onCleanedPdf={onCleanedPdf}
        showCleaned={showCleanedPreview}
        onToggleCleaned={onToggleCleaned}
        className="mb-2 py-2 border-b border-line/50 dark:border-line/50"
      />

      {/* PDF iframe */}
      <div className="flex-1 bg-gray-100 dark:bg-gray-900 rounded-lg overflow-auto relative">
        {previewLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-accent-ink" />
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
      <div className="flex flex-wrap items-center justify-between gap-y-2 mt-2 pt-2 border-t border-line">
        <span className="text-xs text-gray-500 truncate flex-1 min-w-0 mr-2">
          {previewNode?.path}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            icon={ScanLine}
            onClick={async () => {
              const url = showCleanedPreview && cleanedPreviewUrl ? cleanedPreviewUrl : previewUrl;
              try {
                const resp = await fetch(url);
                const blob = await resp.blob();
                setImportPdf({ blob, filename: previewNode?.name || "worksheet.pdf", path: previewNode?.path });
                setShowImportModal(true);
              } catch {
                // Blob URL fetch failed — fall back to upload-based modal
                setImportPdf(null);
                setShowImportModal(true);
              }
            }}
            title="Import to Document via AI OCR"
          >
            Import
          </Button>
          <Button
            icon={copiedPath === previewNode?.path ? Check : Copy}
            iconClassName={copiedPath === previewNode?.path ? "text-green-600 dark:text-green-400" : undefined}
            onClick={() => previewNode && onCopyPath(previewNode.path)}
          >
            Copy path
          </Button>
          <Button variant="primary" icon={CalendarPlus} onClick={onAssign}>
            Assign
          </Button>
        </div>
      </div>

      <ImportWorksheetModal
        isOpen={showImportModal}
        onClose={() => {
          setShowImportModal(false);
          setImportPdf(null);
        }}
        preloadedPdf={importPdf}
      />
    </div>
  );
}
