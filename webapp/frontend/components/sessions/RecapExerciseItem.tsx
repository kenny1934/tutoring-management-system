"use client";

import { useState, memo } from "react";
import { Check, XCircle, Copy, Loader2, ExternalLink, Printer } from "lucide-react";
import { isFileSystemAccessSupported, openFileFromPathWithFallback, printFileFromPathWithFallback } from "@/lib/file-system";
import type { PrintStampInfo } from "@/lib/file-system";
import { searchPaperlessByPath } from "@/lib/paperless-utils";

interface RecapExerciseItemProps {
  pdfName: string;
  pageStart?: number;
  pageEnd?: number;
  stamp?: PrintStampInfo;
}

/**
 * Component for displaying exercise items in Recap section with action buttons.
 * Shows filename, page info, and copy/open/print buttons.
 * Memoized to prevent re-renders when parent state changes.
 */
export const RecapExerciseItem = memo(function RecapExerciseItem({ pdfName, pageStart, pageEnd, stamp }: RecapExerciseItemProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [openState, setOpenState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [printState, setPrintState] = useState<'idle' | 'loading' | 'error'>('idle');
  const canBrowseFiles = typeof window !== 'undefined' && isFileSystemAccessSupported();

  // Parse display name from full path
  const displayName = pdfName.includes('/') || pdfName.includes('\\')
    ? pdfName.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || pdfName
    : pdfName.replace(/\.[^.]+$/, '');

  const pageInfo = pageStart && pageEnd && pageStart !== pageEnd
    ? `(p${pageStart}-${pageEnd})`
    : pageStart ? `(p${pageStart})` : null;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(pdfName);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 1500);
    } catch {
      setCopyState('failed');
      setTimeout(() => setCopyState('idle'), 1500);
    }
  };

  const handleOpen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (openState === 'loading') return;
    setOpenState('loading');
    const error = await openFileFromPathWithFallback(pdfName, searchPaperlessByPath);
    if (error) {
      setOpenState('error');
      setTimeout(() => setOpenState('idle'), 2000);
    } else {
      setOpenState('idle');
    }
  };

  const handlePrint = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (printState === 'loading') return;
    setPrintState('loading');
    const error = await printFileFromPathWithFallback(
      pdfName,
      pageStart,
      pageEnd,
      undefined,
      stamp,
      searchPaperlessByPath
    );
    if (error) {
      setPrintState('error');
      setTimeout(() => setPrintState('idle'), 2000);
    } else {
      setPrintState('idle');
    }
  };

  return (
    <div className="flex items-center gap-1.5 text-xs min-w-0">
      <span className="truncate text-gray-700 dark:text-gray-300 min-w-0" title={pdfName}>
        {displayName}
      </span>
      {pageInfo && <span className="text-gray-500 flex-shrink-0">{pageInfo}</span>}

      {/* Copy button */}
      <button type="button" onClick={handleCopy} className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex-shrink-0" title="Copy path">
        {copyState === 'copied' ? <Check className="h-3 w-3 text-green-500" /> :
         copyState === 'failed' ? <XCircle className="h-3 w-3 text-red-500" /> :
         <Copy className="h-3 w-3 text-gray-400" />}
      </button>

      {/* Open/Print buttons - only if file system supported */}
      {canBrowseFiles && (
        <>
          <button type="button" onClick={handleOpen} disabled={openState === 'loading'} className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex-shrink-0" title="Open file">
            {openState === 'loading' ? <Loader2 className="h-3 w-3 animate-spin text-gray-400" /> :
             openState === 'error' ? <XCircle className="h-3 w-3 text-red-500" /> :
             <ExternalLink className="h-3 w-3 text-gray-400" />}
          </button>
          <button type="button" onClick={handlePrint} disabled={printState === 'loading'} className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex-shrink-0" title="Print file">
            {printState === 'loading' ? <Loader2 className="h-3 w-3 animate-spin text-gray-400" /> :
             printState === 'error' ? <XCircle className="h-3 w-3 text-red-500" /> :
             <Printer className="h-3 w-3 text-gray-400" />}
          </button>
        </>
      )}
    </div>
  );
});
