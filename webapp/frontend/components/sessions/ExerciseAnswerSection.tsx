"use client";

import { useState, useCallback } from "react";
import { Search, ChevronDown, ChevronRight, ExternalLink, Download, FolderOpen, X, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { searchAnswerFile, openAnswerFile, downloadAnswerFile } from "@/lib/answer-file-utils";
import { getDisplayName } from "@/lib/exercise-utils";
import { ExercisePageRangeInput } from "./ExercisePageRangeInput";
import { useToast } from "@/contexts/ToastContext";

interface ExerciseAnswerSectionProps {
  // Identifiers
  clientId: string;
  index: number;
  radioNamePrefix: string;

  // Exercise PDF (for answer search)
  pdfName: string;

  // Answer field values
  answerPdfName: string;
  answerPageMode: 'simple' | 'custom';
  answerPageStart: string;
  answerPageEnd: string;
  answerComplexPages: string;

  // Callbacks
  onAnswerChange: (field: string, value: string) => void;
  onBrowseAnswer?: () => void;
  onFocus?: () => void;

  // Styling
  inputClass?: string;

  // Feature flags
  canBrowseFiles: boolean;
}

type SearchState = 'idle' | 'searching' | 'found' | 'not_found';

export function ExerciseAnswerSection({
  clientId,
  index,
  radioNamePrefix,
  pdfName,
  answerPdfName,
  answerPageMode,
  answerPageStart,
  answerPageEnd,
  answerComplexPages,
  onAnswerChange,
  onBrowseAnswer,
  onFocus,
  inputClass = "",
  canBrowseFiles,
}: ExerciseAnswerSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const { showToast } = useToast();

  // Toggle expanded state
  const toggleExpanded = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  // Search for answer file
  const handleSearch = useCallback(async () => {
    if (!pdfName) return;

    setSearchState('searching');

    try {
      const result = await searchAnswerFile(pdfName);
      if (result) {
        setSearchState('found');
        // Update the answer path
        onAnswerChange('answer_pdf_name', result.path);
        // Auto-expand to show the result
        setExpanded(true);
      } else {
        setSearchState('not_found');
        // Auto-reset after 2 seconds
        setTimeout(() => {
          setSearchState(prev => prev === 'not_found' ? 'idle' : prev);
        }, 2000);
      }
    } catch (err) {
      setSearchState('not_found');
      // Auto-reset after 2 seconds
      setTimeout(() => {
        setSearchState(prev => prev === 'not_found' ? 'idle' : prev);
      }, 2000);
    }
  }, [pdfName, onAnswerChange]);

  // Open answer file
  const handleOpen = useCallback(async () => {
    if (!answerPdfName) return;

    const success = await openAnswerFile({ source: 'local', path: answerPdfName });
    if (!success) {
      showToast('Failed to open answer file', 'error');
    }
  }, [answerPdfName, showToast]);

  // Download answer file
  const handleDownload = useCallback(async () => {
    if (!answerPdfName) return;

    const success = await downloadAnswerFile({ source: 'local', path: answerPdfName });
    if (!success) {
      showToast('Failed to download answer file', 'error');
    }
  }, [answerPdfName, showToast]);

  // Clear answer
  const handleClear = useCallback(() => {
    onAnswerChange('answer_pdf_name', '');
    onAnswerChange('answer_page_mode', 'simple');
    onAnswerChange('answer_page_start', '');
    onAnswerChange('answer_page_end', '');
    onAnswerChange('answer_complex_pages', '');
    setSearchState('idle');
  }, [onAnswerChange]);

  return (
    <div className="mt-1 pt-1 border-t border-gray-200 dark:border-gray-700">
      {/* Header row with toggle and action buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleExpanded}
          className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-gray-500" />
          ) : (
            <ChevronRight className="h-3 w-3 text-gray-500" />
          )}
        </button>
        <span className="text-xs text-gray-500 dark:text-gray-400">Answer:</span>

        {answerPdfName ? (
          <>
            {/* Answer is set - show filename + Open + Download */}
            <span className="text-xs text-green-600 dark:text-green-400 truncate flex-1 min-w-0" title={answerPdfName}>
              {getDisplayName(answerPdfName)}
            </span>
            {!expanded && (
              <>
                <button
                  type="button"
                  onClick={handleOpen}
                  className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 px-1.5 py-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0 flex items-center justify-center"
                  title="Open answer file"
                >
                  <ExternalLink className="h-3 w-3 text-gray-500 dark:text-gray-400 hover:text-blue-500" />
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 px-1.5 py-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0 flex items-center justify-center"
                  title="Download answer file"
                >
                  <Download className="h-3 w-3 text-gray-500 dark:text-gray-400 hover:text-purple-500" />
                </button>
              </>
            )}
          </>
        ) : (
          <>
            {/* Answer not set - show "Not set" + Search */}
            <span className="text-xs text-gray-400 italic">Not set</span>
            <button
              type="button"
              onClick={handleSearch}
              disabled={searchState === 'searching' || !pdfName}
              className={cn(
                "min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 px-1.5 py-1 rounded-md border transition-colors shrink-0 flex items-center justify-center",
                searchState === 'searching'
                  ? "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30"
                  : searchState === 'not_found'
                  ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30"
                  : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800",
                !pdfName && "opacity-50 cursor-not-allowed"
              )}
              title={!pdfName ? "Set PDF first" : searchState === 'not_found' ? "Answer not found" : "Search for answer file"}
            >
              {searchState === 'searching' ? (
                <Loader2 className="h-3 w-3 text-amber-500 animate-spin" />
              ) : searchState === 'not_found' ? (
                <XCircle className="h-3 w-3 text-red-500" />
              ) : (
                <Search className="h-3 w-3 text-gray-500 dark:text-gray-400" />
              )}
            </button>
          </>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="pl-5 space-y-1 mt-1">
          {/* Answer path input + buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={answerPdfName}
              onChange={(e) => onAnswerChange('answer_pdf_name', e.target.value)}
              onFocus={onFocus}
              placeholder="Answer PDF path"
              className={cn(inputClass, "text-xs py-1 flex-1")}
            />
            {/* Browse for answer file - right next to path */}
            {canBrowseFiles && onBrowseAnswer && (
              <button
                type="button"
                onClick={onBrowseAnswer}
                className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 px-2 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0 flex items-center justify-center"
                title="Browse for answer file"
              >
                <FolderOpen className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
              </button>
            )}
            {/* Open answer file */}
            {answerPdfName && (
              <button
                type="button"
                onClick={handleOpen}
                className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 px-2 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0 flex items-center justify-center"
                title="Open answer file"
              >
                <ExternalLink className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400 hover:text-blue-500" />
              </button>
            )}
            {/* Download answer file */}
            {answerPdfName && (
              <button
                type="button"
                onClick={handleDownload}
                className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 px-2 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0 flex items-center justify-center"
                title="Download answer file"
              >
                <Download className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400 hover:text-purple-500" />
              </button>
            )}
            {/* Clear answer */}
            {answerPdfName && (
              <button
                type="button"
                onClick={handleClear}
                className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 ml-auto px-2 py-1.5 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors shrink-0 flex items-center justify-center"
                title="Clear answer"
              >
                <X className="h-3.5 w-3.5 text-red-500" />
              </button>
            )}
          </div>

          {/* Answer page range */}
          <ExercisePageRangeInput
            radioName={`${radioNamePrefix}-answer-page-mode-${index}`}
            pageMode={answerPageMode}
            pageStart={answerPageStart}
            pageEnd={answerPageEnd}
            complexPages={answerComplexPages}
            onPageModeChange={(mode) => onAnswerChange('answer_page_mode', mode)}
            onPageStartChange={(value) => onAnswerChange('answer_page_start', value)}
            onPageEndChange={(value) => onAnswerChange('answer_page_end', value)}
            onComplexPagesChange={(value) => onAnswerChange('answer_complex_pages', value)}
            onFocus={onFocus}
            inputClass={inputClass}
          />
        </div>
      )}
    </div>
  );
}
