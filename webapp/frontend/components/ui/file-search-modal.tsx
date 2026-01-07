"use client";

import { useState, useEffect, useCallback } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, FolderSync, AlertCircle, Search, Info, CheckCircle2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  searchForFile,
  formatSearchResultPath,
  getContainingFolder,
  type FileSearchResult,
  type SearchProgress,
  type SearchOptions,
} from "@/lib/file-search";

interface FileSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Single filename to search for */
  filename?: string;
  /** Callback when a single file is selected */
  onFileSelected?: (path: string) => void;
  /** Multiple filenames to search for (batch mode) */
  filenames?: string[];
  /** Callback when multiple files are selected (batch mode) */
  onFilesSelected?: (paths: string[]) => void;
}

// Batch mode types
interface BatchSearchState {
  filename: string;
  isSearching: boolean;
  results: FileSearchResult[];
  selectedPath: string | null;
  error: string | null;
}

export function FileSearchModal({
  isOpen,
  onClose,
  filename,
  onFileSelected,
  filenames,
  onFilesSelected,
}: FileSearchModalProps) {
  // Determine if in batch mode
  const isBatchMode = Boolean(filenames && filenames.length > 0);

  // Single file mode state
  const [isSearching, setIsSearching] = useState(false);
  const [progress, setProgress] = useState<SearchProgress | null>(null);
  const [results, setResults] = useState<FileSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchLocalFolders, setSearchLocalFolders] = useState(false);

  // Batch mode state
  const [batchStates, setBatchStates] = useState<BatchSearchState[]>([]);

  // Start search when modal opens
  useEffect(() => {
    if (isOpen) {
      if (isBatchMode && filenames) {
        startBatchSearch();
      } else if (filename) {
        startSearch();
      }
    } else {
      // Reset state when closed
      setResults([]);
      setProgress(null);
      setError(null);
      setIsSearching(false);
      setSearchLocalFolders(false);
      setBatchStates([]);
    }
  }, [isOpen, filename, isBatchMode]);

  // Single file search
  const startSearch = useCallback(async (includeLocal: boolean = false) => {
    setIsSearching(true);
    setResults([]);
    setError(null);

    const options: SearchOptions = {
      searchLocal: includeLocal,
      localFolderLimit: 3,
      localFileLimit: 1000,
    };

    try {
      const searchResults = await searchForFile(
        filename!,
        options,
        (p) => setProgress(p),
        (result) => setResults((prev) => [...prev, result])
      );

      if (searchResults.length === 0) {
        setError(`No files matching "${filename}" were found${includeLocal ? "" : " in Shelv"}.`);
      }
    } catch (err) {
      setError("An error occurred while searching. Please try again.");
      console.error("Search error:", err);
    } finally {
      setIsSearching(false);
    }
  }, [filename]);

  // Batch search - search for all filenames simultaneously
  const startBatchSearch = useCallback(async () => {
    if (!filenames || filenames.length === 0) return;

    // Initialize batch states
    const initialStates: BatchSearchState[] = filenames.map((fn) => ({
      filename: fn,
      isSearching: true,
      results: [],
      selectedPath: null,
      error: null,
    }));
    setBatchStates(initialStates);

    const options: SearchOptions = {
      searchLocal: false, // Shelv only for batch mode
      localFolderLimit: 3,
      localFileLimit: 1000,
    };

    // Search for each filename in parallel
    await Promise.all(
      filenames.map(async (fn, index) => {
        try {
          const searchResults = await searchForFile(
            fn,
            options,
            undefined, // No progress callback for batch
            (result) => {
              setBatchStates((prev) =>
                prev.map((state, i) =>
                  i === index
                    ? { ...state, results: [...state.results, result] }
                    : state
                )
              );
            }
          );

          setBatchStates((prev) =>
            prev.map((state, i) => {
              if (i !== index) return state;

              // Auto-select exact match if found
              const exactMatch = searchResults.find((r) => r.match === "exact");
              const bestMatch = exactMatch || (searchResults.length === 1 ? searchResults[0] : null);

              return {
                ...state,
                isSearching: false,
                selectedPath: bestMatch?.path || null,
                error: searchResults.length === 0 ? `No matches found` : null,
              };
            })
          );
        } catch (err) {
          console.error(`Search error for ${fn}:`, err);
          setBatchStates((prev) =>
            prev.map((state, i) =>
              i === index
                ? { ...state, isSearching: false, error: "Search failed" }
                : state
            )
          );
        }
      })
    );
  }, [filenames]);

  // Re-run search when local toggle changes (single mode only)
  const handleLocalToggle = useCallback((enabled: boolean) => {
    setSearchLocalFolders(enabled);
    if (enabled && !isSearching) {
      startSearch(true);
    }
  }, [isSearching, startSearch]);

  // Single mode: select result
  const handleSelectResult = (result: FileSearchResult) => {
    onFileSelected?.(result.path);
    onClose();
  };

  // Batch mode: select path for a file
  const handleBatchSelectPath = (index: number, path: string) => {
    setBatchStates((prev) =>
      prev.map((state, i) =>
        i === index ? { ...state, selectedPath: path } : state
      )
    );
  };

  // Batch mode: confirm all selections
  const handleBatchConfirm = () => {
    const selectedPaths = batchStates
      .map((state) => state.selectedPath)
      .filter((path): path is string => path !== null);

    if (selectedPaths.length > 0 && onFilesSelected) {
      onFilesSelected(selectedPaths);
    }
    onClose();
  };

  // Group results by source (single mode)
  const localResults = results.filter((r) => r.source === "local");
  const shelvResults = results.filter((r) => r.source === "shelv");

  // Sort results: exact matches first, then alphabetically
  const sortResults = (arr: FileSearchResult[]) =>
    [...arr].sort((a, b) => {
      if (a.match === "exact" && b.match !== "exact") return -1;
      if (a.match !== "exact" && b.match === "exact") return 1;
      return a.path.localeCompare(b.path);
    });

  // Batch mode stats
  const batchSearchingCount = batchStates.filter((s) => s.isSearching).length;
  const batchSelectedCount = batchStates.filter((s) => s.selectedPath).length;
  const batchTotalCount = batchStates.length;

  // Render batch mode
  if (isBatchMode) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-amber-500" />
            <span>Find {batchTotalCount} Files</span>
          </div>
        }
        size="lg"
        footer={
          <div className="flex justify-between items-center w-full">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {batchSelectedCount} of {batchTotalCount} files selected
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleBatchConfirm}
                disabled={batchSelectedCount === 0 || batchSearchingCount > 0}
              >
                Add {batchSelectedCount} Exercise{batchSelectedCount !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Explanation */}
          <div className="flex gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-700 dark:text-blue-300">
              <p className="font-medium mb-1">Searching for {batchTotalCount} dropped files</p>
              <p className="text-blue-600 dark:text-blue-400 text-xs">
                Exact matches are auto-selected. Click a result to change selection.
              </p>
            </div>
          </div>

          {/* Progress indicator */}
          {batchSearchingCount > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
              <Loader2 className="h-5 w-5 text-amber-500 animate-spin shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Searching... ({batchTotalCount - batchSearchingCount}/{batchTotalCount} complete)
              </span>
            </div>
          )}

          {/* File list */}
          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {batchStates.map((state, index) => (
              <BatchFileRow
                key={index}
                state={state}
                onSelectPath={(path) => handleBatchSelectPath(index, path)}
              />
            ))}
          </div>
        </div>
      </Modal>
    );
  }

  // Single file mode
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Search className="h-5 w-5 text-amber-500" />
          <span>Find File</span>
        </div>
      }
      size="md"
    >
      <div className="space-y-4">
        {/* Explanation box */}
        <div className="flex gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700 dark:text-blue-300">
            <p className="font-medium mb-1">Why search?</p>
            <p className="text-blue-600 dark:text-blue-400 text-xs">
              Browsers cannot access file paths from dropped files for security reasons.
              We're searching for "<span className="font-mono">{filename}</span>" in Shelv.
            </p>
          </div>
        </div>

        {/* Local folders toggle */}
        <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
          <input
            type="checkbox"
            checked={searchLocalFolders}
            onChange={(e) => handleLocalToggle(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
          />
          <div className="flex-1">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Also search local folders
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Slower - scans your granted folder permissions
            </p>
          </div>
          {searchLocalFolders && progress?.phase === 'local' && (
            <Loader2 className="h-4 w-4 text-amber-500 animate-spin shrink-0" />
          )}
        </label>

        {/* Search progress */}
        {isSearching && progress && progress.phase !== "done" && (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
            <Loader2 className="h-5 w-5 text-amber-500 animate-spin shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {progress.phase === "shelv"
                  ? "Searching Shelv..."
                  : progress.phase === "local"
                  ? "Scanning local folders..."
                  : "Search complete"}
              </div>
              {progress.phase === "local" && progress.currentFolder && (
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {progress.currentFolder} ({progress.filesScanned.toLocaleString()} files)
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error state */}
        {error && !isSearching && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
            <div className="text-sm text-amber-700 dark:text-amber-300">{error}</div>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Found {results.length} matching file{results.length !== 1 ? "s" : ""}
            </div>

            {/* Local folder results */}
            {localResults.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <FolderSync className="h-4 w-4" />
                  Local Folders ({localResults.length})
                </h3>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {sortResults(localResults).map((result, index) => (
                    <ResultRow
                      key={`local-${index}`}
                      result={result}
                      onClick={() => handleSelectResult(result)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Shelv results */}
            {shelvResults.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  Shelv ({shelvResults.length})
                </h3>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {sortResults(shelvResults).map((result, index) => (
                    <ResultRow
                      key={`shelv-${index}`}
                      result={result}
                      onClick={() => handleSelectResult(result)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state when search is complete */}
        {!isSearching && results.length === 0 && !error && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Search className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No results yet.</p>
          </div>
        )}

        {/* Help text */}
        <div className="text-xs text-gray-400 dark:text-gray-500 pt-2 border-t border-gray-200 dark:border-gray-700">
          Click a result to use that file path.
        </div>
      </div>
    </Modal>
  );
}

function ResultRow({
  result,
  onClick,
  isSelected,
}: {
  result: FileSearchResult;
  onClick: () => void;
  isSelected?: boolean;
}) {
  const filename = formatSearchResultPath(result);
  const folder = getContainingFolder(result);

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-all text-left",
        "bg-white dark:bg-gray-800",
        isSelected
          ? "border-green-400 dark:border-green-500 bg-green-50 dark:bg-green-900/20"
          : "border-gray-200 dark:border-gray-700",
        "hover:border-amber-400 dark:hover:border-amber-500",
        "hover:bg-amber-50 dark:hover:bg-amber-900/20",
        "focus:outline-none focus:ring-2 focus:ring-amber-400"
      )}
    >
      {isSelected && (
        <Check className="h-4 w-4 text-green-500 shrink-0" />
      )}
      <FileText className={cn("h-4 w-4 shrink-0", isSelected ? "text-green-600" : "text-red-500")} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
            {filename}
          </span>
          {result.match === "exact" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 shrink-0">
              Exact
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{folder}</div>
      </div>
    </button>
  );
}

/**
 * Batch file row component for multi-file search
 */
function BatchFileRow({
  state,
  onSelectPath,
}: {
  state: BatchSearchState;
  onSelectPath: (path: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Sort results: exact matches first
  const sortedResults = [...state.results].sort((a, b) => {
    if (a.match === "exact" && b.match !== "exact") return -1;
    if (a.match !== "exact" && b.match === "exact") return 1;
    return a.path.localeCompare(b.path);
  });

  const hasMultipleResults = sortedResults.length > 1;
  const selectedResult = sortedResults.find((r) => r.path === state.selectedPath);

  return (
    <div className={cn(
      "rounded-lg border overflow-hidden",
      state.error
        ? "border-red-200 dark:border-red-800"
        : state.selectedPath
        ? "border-green-200 dark:border-green-800"
        : "border-gray-200 dark:border-gray-700"
    )}>
      {/* Header - filename being searched */}
      <div
        className={cn(
          "flex items-center gap-3 p-3",
          state.error
            ? "bg-red-50 dark:bg-red-900/20"
            : state.selectedPath
            ? "bg-green-50 dark:bg-green-900/10"
            : "bg-gray-50 dark:bg-gray-800/50"
        )}
      >
        {/* Status indicator */}
        {state.isSearching ? (
          <Loader2 className="h-4 w-4 text-amber-500 animate-spin shrink-0" />
        ) : state.error ? (
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
        ) : state.selectedPath ? (
          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
        ) : (
          <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
        )}

        {/* Filename */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
            {state.filename}
          </div>
          {state.error ? (
            <div className="text-xs text-red-500 dark:text-red-400">{state.error}</div>
          ) : state.selectedPath && selectedResult ? (
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
              → {getContainingFolder(selectedResult)}
            </div>
          ) : state.isSearching ? (
            <div className="text-xs text-gray-400">Searching...</div>
          ) : null}
        </div>

        {/* Result count / expand button */}
        {!state.isSearching && !state.error && hasMultipleResults && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            {isExpanded ? "Hide" : `${sortedResults.length} results`}
          </button>
        )}
      </div>

      {/* Expandable results list */}
      {isExpanded && sortedResults.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-2 space-y-1 max-h-40 overflow-y-auto bg-white dark:bg-gray-800">
          {sortedResults.map((result, index) => (
            <ResultRow
              key={index}
              result={result}
              isSelected={result.path === state.selectedPath}
              onClick={() => onSelectPath(result.path)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
