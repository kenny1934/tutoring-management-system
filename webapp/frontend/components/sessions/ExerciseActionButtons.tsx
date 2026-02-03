"use client";

import { Search, FolderOpen, ExternalLink, Printer, Loader2, XCircle } from "lucide-react";

type FileActionState = { open?: 'loading' | 'error'; print?: 'loading' | 'error' };

interface ExerciseActionButtonsProps {
  hasPdfName: boolean;
  canBrowseFiles: boolean;
  fileActionState?: FileActionState;
  onPaperlessSearch: () => void;
  onBrowseFile: () => void;
  onOpenFile: () => void;
  onPrintFile: () => void;
}

export function ExerciseActionButtons({
  hasPdfName,
  canBrowseFiles,
  fileActionState,
  onPaperlessSearch,
  onBrowseFile,
  onOpenFile,
  onPrintFile,
}: ExerciseActionButtonsProps) {
  return (
    <>
      {/* Paperless search button - always show */}
      <button
        type="button"
        onClick={onPaperlessSearch}
        className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 p-2.5 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors shrink-0 flex items-center justify-center"
        title="Search Shelv"
        aria-label="Search Shelv"
      >
        <Search className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      </button>

      {canBrowseFiles && (
        <>
          <button
            type="button"
            onClick={onBrowseFile}
            className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 p-2.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0 flex items-center justify-center"
            title="Browse files"
            aria-label="Browse files"
          >
            <FolderOpen className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          </button>

          {hasPdfName && (
            <>
              <button
                type="button"
                onClick={onOpenFile}
                disabled={fileActionState?.open === 'loading'}
                className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 p-2.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0 flex items-center justify-center"
                title="Open PDF"
                aria-label="Open PDF"
              >
                {fileActionState?.open === 'loading' ? (
                  <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
                ) : fileActionState?.open === 'error' ? (
                  <XCircle className="h-4 w-4 text-red-500" />
                ) : (
                  <ExternalLink className="h-4 w-4 text-gray-500 dark:text-gray-400 hover:text-blue-500" />
                )}
              </button>
              <button
                type="button"
                onClick={onPrintFile}
                disabled={fileActionState?.print === 'loading'}
                className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 p-2.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0 flex items-center justify-center"
                title="Print PDF"
                aria-label="Print PDF"
              >
                {fileActionState?.print === 'loading' ? (
                  <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
                ) : fileActionState?.print === 'error' ? (
                  <XCircle className="h-4 w-4 text-red-500" />
                ) : (
                  <Printer className="h-4 w-4 text-gray-500 dark:text-gray-400 hover:text-green-500" />
                )}
              </button>
            </>
          )}
        </>
      )}
    </>
  );
}
