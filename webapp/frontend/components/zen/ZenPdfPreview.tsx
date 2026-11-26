"use client";

import { PdfPreviewModal } from '@/components/ui/pdf-preview-modal';

interface ZenPdfPreviewProps {
  sourcePath?: string;
  /** An old opaque ID cannot identify a courseware file across providers. */
  documentId?: number;
  documentTitle?: string;
  onClose: () => void;
  onSelect?: (pageStart?: number, pageEnd?: number, complexPages?: string) => void;
}
export function ZenPdfPreview({ sourcePath, documentTitle, onClose, onSelect }: ZenPdfPreviewProps) {
  return <PdfPreviewModal isOpen documentId={null} sourcePath={sourcePath} documentTitle={documentTitle} onClose={onClose} enablePageSelection={!!onSelect}
    onSelect={onSelect ? selection => onSelect(selection?.pageStart, selection?.pageEnd, selection?.complexRange) : undefined} />;
}
export default ZenPdfPreview;
