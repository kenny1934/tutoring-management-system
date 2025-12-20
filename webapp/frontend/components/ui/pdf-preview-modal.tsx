"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, ZoomIn, ZoomOut, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface PdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: number | null;
  documentTitle?: string;
}

export function PdfPreviewModal({
  isOpen,
  onClose,
  documentId,
  documentTitle,
}: PdfPreviewModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setError(null);
      setZoom(100);
    }
  }, [isOpen, documentId]);

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
