"use client";

import { useState, useRef, useEffect } from "react";
import { Search, FolderOpen, ExternalLink, Printer, Loader2, XCircle, FileCheck, ChevronDown, Download, RefreshCw } from "lucide-react";

type FileActionState = { open?: 'loading' | 'error'; print?: 'loading' | 'error' };
type AnswerState = 'idle' | 'searching' | 'found' | 'not_found';

interface ExerciseActionButtonsProps {
  hasPdfName: boolean;
  canBrowseFiles: boolean;
  fileActionState?: FileActionState;
  onPaperlessSearch: () => void;
  onBrowseFile: () => void;
  onOpenFile: () => void;
  onPrintFile: () => void;
  // Answer file props
  answerState?: AnswerState;
  onSearchAnswer?: () => void;
  onOpenAnswer?: () => void;
  onDownloadAnswer?: () => void;
  onBrowseAnswer?: () => void;  // Manual browse when auto-search fails
}

export function ExerciseActionButtons({
  hasPdfName,
  canBrowseFiles,
  fileActionState,
  onPaperlessSearch,
  onBrowseFile,
  onOpenFile,
  onPrintFile,
  answerState = 'idle',
  onSearchAnswer,
  onOpenAnswer,
  onDownloadAnswer,
  onBrowseAnswer,
}: ExerciseActionButtonsProps) {
  const [showAnswerDropdown, setShowAnswerDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowAnswerDropdown(false);
      }
    }

    if (showAnswerDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showAnswerDropdown]);

  const handleAnswerButtonClick = () => {
    if (answerState === 'idle' && onSearchAnswer) {
      onSearchAnswer();
    } else if (answerState === 'found' || answerState === 'not_found') {
      setShowAnswerDropdown(!showAnswerDropdown);
    }
  };

  const handleRetrySearch = () => {
    setShowAnswerDropdown(false);
    onSearchAnswer?.();
  };

  const handleBrowseAnswer = () => {
    setShowAnswerDropdown(false);
    onBrowseAnswer?.();
  };

  const handleOpenAnswer = () => {
    setShowAnswerDropdown(false);
    onOpenAnswer?.();
  };

  const handleDownloadAnswer = () => {
    setShowAnswerDropdown(false);
    onDownloadAnswer?.();
  };

  return (
    <>
      {/* Paperless search button - always show */}
      <button
        type="button"
        onClick={onPaperlessSearch}
        className="px-2 py-1.5 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors shrink-0"
        title="Search Shelv"
      >
        <Search className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
      </button>

      {canBrowseFiles && (
        <>
          <button
            type="button"
            onClick={onBrowseFile}
            className="px-2 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0"
            title="Browse files"
          >
            <FolderOpen className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
          </button>

          {hasPdfName && (
            <>
              <button
                type="button"
                onClick={onOpenFile}
                disabled={fileActionState?.open === 'loading'}
                className="px-2 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0"
                title="Open PDF"
              >
                {fileActionState?.open === 'loading' ? (
                  <Loader2 className="h-3.5 w-3.5 text-gray-400 animate-spin" />
                ) : fileActionState?.open === 'error' ? (
                  <XCircle className="h-3.5 w-3.5 text-red-500" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400 hover:text-blue-500" />
                )}
              </button>
              <button
                type="button"
                onClick={onPrintFile}
                disabled={fileActionState?.print === 'loading'}
                className="px-2 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0"
                title="Print PDF (with page range if specified)"
              >
                {fileActionState?.print === 'loading' ? (
                  <Loader2 className="h-3.5 w-3.5 text-gray-400 animate-spin" />
                ) : fileActionState?.print === 'error' ? (
                  <XCircle className="h-3.5 w-3.5 text-red-500" />
                ) : (
                  <Printer className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400 hover:text-green-500" />
                )}
              </button>

              {/* Answer button with dropdown */}
              {onSearchAnswer && (
                <div ref={dropdownRef} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={handleAnswerButtonClick}
                    disabled={answerState === 'searching'}
                    className={`px-2 py-1.5 rounded-md border transition-colors flex items-center gap-0.5 ${
                      answerState === 'found'
                        ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50'
                        : answerState === 'not_found'
                        ? 'border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/30 hover:bg-orange-100 dark:hover:bg-orange-900/50'
                        : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                    title={
                      answerState === 'searching' ? 'Searching for answer...' :
                      answerState === 'found' ? 'Answer found - click to open/download' :
                      answerState === 'not_found' ? 'Answer not found - click to retry or browse' :
                      'Search for answer file'
                    }
                  >
                    {answerState === 'searching' ? (
                      <Loader2 className="h-3.5 w-3.5 text-gray-400 animate-spin" />
                    ) : (
                      <FileCheck className={`h-3.5 w-3.5 ${
                        answerState === 'found'
                          ? 'text-green-600 dark:text-green-400'
                          : answerState === 'not_found'
                          ? 'text-orange-500 dark:text-orange-400'
                          : 'text-gray-500 dark:text-gray-400'
                      }`} />
                    )}
                    {(answerState === 'found' || answerState === 'not_found') && (
                      <ChevronDown className={`h-3 w-3 ${
                        answerState === 'found'
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-orange-500 dark:text-orange-400'
                      }`} />
                    )}
                  </button>

                  {/* Dropdown menu - found state */}
                  {showAnswerDropdown && answerState === 'found' && (
                    <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[140px]">
                      <button
                        type="button"
                        onClick={handleOpenAnswer}
                        className="w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open Answer
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadAnswer}
                        className="w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download Answer
                      </button>
                    </div>
                  )}

                  {/* Dropdown menu - not_found state */}
                  {showAnswerDropdown && answerState === 'not_found' && (
                    <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[160px]">
                      <button
                        type="button"
                        onClick={handleRetrySearch}
                        className="w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Retry Search
                      </button>
                      {onBrowseAnswer && (
                        <button
                          type="button"
                          onClick={handleBrowseAnswer}
                          className="w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                          Browse for Answer...
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
