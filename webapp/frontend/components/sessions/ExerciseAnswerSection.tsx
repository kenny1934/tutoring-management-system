"use client";

import { useState, useCallback, useRef, type LucideIcon } from "react";
import { Search, ChevronDown, ChevronRight, ExternalLink, Download, FolderOpen, X, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { searchAnswerFile, openAnswerFileWithFallback, downloadAnswerFileWithFallback } from "@/lib/answer-file-utils";
import { convertToAliasPath } from "@/lib/file-system";
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

  // Exercise page range (to copy into answer on search)
  exercisePageMode: 'simple' | 'custom';
  exercisePageStart: string;
  exercisePageEnd: string;
  exerciseComplexPages: string;

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
type ActionState = 'idle' | 'loading' | 'error';

/** Shared button for answer open/download actions with loading/error states */
function AnswerActionButton({ state, message, onClick, Icon, title, size, busy }: {
  state: ActionState;
  message: string | undefined;
  onClick: () => void;
  Icon: LucideIcon;
  title: string;
  size: 'sm' | 'md';
  busy: boolean;
}) {
  const iconClass = size === 'sm' ? "h-3 w-3" : "h-3.5 w-3.5";
  const btnPadding = size === 'sm' ? "px-1.5 py-1" : "px-2 py-1.5";
  const gap = size === 'sm' ? "gap-1" : "gap-1.5";
  const msgMaxW = size === 'sm' ? "max-w-[120px]" : "max-w-[140px]";
  const isLoading = state === 'loading';
  const showMessage = isLoading && message;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        `min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 ${btnPadding} rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0 flex items-center justify-center`,
        showMessage && gap
      )}
      title={showMessage ? message : title}
    >
      {isLoading ? <Loader2 className={cn(iconClass, "text-gray-400 animate-spin")} />
        : state === 'error' ? <XCircle className={cn(iconClass, "text-red-500")} />
        : <Icon className={cn(iconClass, "text-gray-500 dark:text-gray-400")} />}
      {showMessage && (
        <span className={cn(
          "text-[10px] text-amber-600 dark:text-amber-400 italic whitespace-nowrap truncate",
          msgMaxW,
          size === 'sm' && "hidden md:inline"
        )}>{message}</span>
      )}
    </button>
  );
}

export function ExerciseAnswerSection({
  clientId,
  index,
  radioNamePrefix,
  pdfName,
  exercisePageMode,
  exercisePageStart,
  exercisePageEnd,
  exerciseComplexPages,
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
  const [openState, setOpenState] = useState<ActionState>('idle');
  const [downloadState, setDownloadState] = useState<ActionState>('idle');
  const [actionMessage, setActionMessage] = useState<string | undefined>();
  const busyRef = useRef(false);
  const { showToast } = useToast();

  // Shared helper for open/download actions
  const runAction = useCallback(async (
    action: (path: string, onProgress?: (msg: string) => void) => Promise<boolean>,
    setState: React.Dispatch<React.SetStateAction<ActionState>>,
    errorMsg: string
  ) => {
    if (!answerPdfName || busyRef.current) return;
    busyRef.current = true;
    setState('loading');
    try {
      const success = await action(answerPdfName, (msg) => setActionMessage(msg));
      if (success) {
        setState('idle');
      } else {
        setState('error');
        showToast(errorMsg, 'error');
        setTimeout(() => setState(prev => prev === 'error' ? 'idle' : prev), 2000);
      }
    } finally {
      setActionMessage(undefined);
      busyRef.current = false;
    }
  }, [answerPdfName, showToast]);

  const handleOpen = useCallback(() => {
    runAction(openAnswerFileWithFallback, setOpenState, 'Failed to open answer file');
  }, [runAction]);

  const handleDownload = useCallback(() => {
    runAction(downloadAnswerFileWithFallback, setDownloadState, 'Failed to download answer file');
  }, [runAction]);

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
        onAnswerChange('answer_pdf_name', result.path);
        onAnswerChange('answer_page_mode', exercisePageMode);
        onAnswerChange('answer_page_start', exercisePageStart);
        onAnswerChange('answer_page_end', exercisePageEnd);
        onAnswerChange('answer_complex_pages', exerciseComplexPages);
        setExpanded(true);
      } else {
        setSearchState('not_found');
        setTimeout(() => {
          setSearchState(prev => prev === 'not_found' ? 'idle' : prev);
        }, 2000);
      }
    } catch (err) {
      setSearchState('not_found');
      setTimeout(() => {
        setSearchState(prev => prev === 'not_found' ? 'idle' : prev);
      }, 2000);
    }
  }, [pdfName, exercisePageMode, exercisePageStart, exercisePageEnd, exerciseComplexPages, onAnswerChange]);

  // Auto-translate pasted drive letter paths (e.g., V:\... → [Courseware Developer 中學]\...)
  const handleAnswerPaste = useCallback(async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData('text');
    const driveMatch = pastedText.match(/^["']?([A-Za-z]):[\\\/]/);
    if (!driveMatch) return; // Let default paste happen

    e.preventDefault();
    const cleanPath = pastedText.replace(/^["']|["']$/g, '').replace(/\//g, '\\');
    const convertedPath = await convertToAliasPath(cleanPath);
    onAnswerChange('answer_pdf_name', convertedPath);
  }, [onAnswerChange]);

  // Clear answer
  const handleClear = useCallback(() => {
    onAnswerChange('answer_pdf_name', '');
    onAnswerChange('answer_page_mode', 'simple');
    onAnswerChange('answer_page_start', '');
    onAnswerChange('answer_page_end', '');
    onAnswerChange('answer_complex_pages', '');
    setSearchState('idle');
  }, [onAnswerChange]);

  const isBusy = openState === 'loading' || downloadState === 'loading';

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
                <AnswerActionButton state={openState} message={actionMessage} onClick={handleOpen} Icon={ExternalLink} title="Open answer file" size="sm" busy={isBusy} />
                <AnswerActionButton state={downloadState} message={actionMessage} onClick={handleDownload} Icon={Download} title="Download answer file" size="sm" busy={isBusy} />
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
              onPaste={handleAnswerPaste}
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
            {answerPdfName && (
              <>
                <AnswerActionButton state={openState} message={actionMessage} onClick={handleOpen} Icon={ExternalLink} title="Open answer file" size="md" busy={isBusy} />
                <AnswerActionButton state={downloadState} message={actionMessage} onClick={handleDownload} Icon={Download} title="Download answer file" size="md" busy={isBusy} />
              </>
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
