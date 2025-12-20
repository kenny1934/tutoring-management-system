"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Search, FileText, Loader2, AlertCircle, Check, Eye, Tag, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type PaperlessDocument, type PaperlessSearchMode, type PaperlessTag, type PaperlessTagMatchMode } from "@/lib/api";
import { PdfPreviewModal } from "@/components/ui/pdf-preview-modal";

interface PaperlessSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}

export function PaperlessSearchModal({
  isOpen,
  onClose,
  onSelect,
}: PaperlessSearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PaperlessDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [searchMode, setSearchMode] = useState<PaperlessSearchMode>("all");
  const [previewDoc, setPreviewDoc] = useState<PaperlessDocument | null>(null);
  const [availableTags, setAvailableTags] = useState<PaperlessTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [tagMatchMode, setTagMatchMode] = useState<PaperlessTagMatchMode>("all");
  const [hintsExpanded, setHintsExpanded] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const searchModeOptions: { value: PaperlessSearchMode; label: string }[] = [
    { value: "all", label: "All" },
    { value: "title", label: "Title" },
    { value: "content", label: "Content" },
    { value: "advanced", label: "Advanced" },
  ];

  // Check if Paperless is configured and fetch tags on mount
  useEffect(() => {
    if (isOpen) {
      api.paperless.getStatus()
        .then((status) => {
          setIsConfigured(status.configured && status.reachable);
          if (!status.configured || !status.reachable) {
            setError(status.error || "Shelv is not configured or unreachable");
          } else {
            // Fetch tags if configured
            api.paperless.getTags()
              .then((response) => setAvailableTags(response.tags))
              .catch(() => setAvailableTags([]));
          }
        })
        .catch(() => {
          setIsConfigured(false);
          setError("Cannot check Shelv status");
        });
    }
  }, [isOpen]);

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setResults([]);
      setError(null);
      setSelectedId(null);
      setSearchMode("all");
      setPreviewDoc(null);
      setSelectedTagIds([]);
      setIsTagDropdownOpen(false);
      setFocusedIndex(-1);
      setTagMatchMode("all");
      setHintsExpanded(false);
      setHasMore(false);
      setIsLoadingMore(false);
    }
  }, [isOpen]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Close tag dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(event.target as Node)) {
        setIsTagDropdownOpen(false);
      }
    };

    if (isTagDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isTagDropdownOpen]);

  // Debounced search
  const performSearch = useCallback(async (
    searchQuery: string,
    mode: PaperlessSearchMode,
    tagIds: number[],
    matchMode: PaperlessTagMatchMode,
    append: boolean = false,
    offset: number = 0
  ) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setHasMore(false);
      return;
    }

    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await api.paperless.search(
        searchQuery,
        30,
        mode,
        tagIds.length > 0 ? tagIds : undefined,
        matchMode,
        offset
      );

      if (append) {
        setResults((prev) => [...prev, ...response.results]);
      } else {
        setResults(response.results);
      }
      setHasMore(response.has_more);

      // Clear any previous error, only show "No documents found" if truly empty
      if (response.results.length === 0 && !append) {
        setError("No documents found");
      } else {
        setError(null);
      }
    } catch (err) {
      console.error("Shelv search error:", err);
      setError(err instanceof Error ? err.message : "Search failed");
      if (!append) {
        setResults([]);
      }
      setHasMore(false);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  // Handle search input change with debounce
  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      performSearch(value, searchMode, selectedTagIds, tagMatchMode);
    }, 300);
  }, [performSearch, searchMode, selectedTagIds, tagMatchMode]);

  // Re-search when search mode changes
  const handleSearchModeChange = useCallback((mode: PaperlessSearchMode) => {
    setSearchMode(mode);
    if (query.trim()) {
      performSearch(query, mode, selectedTagIds, tagMatchMode);
    }
  }, [query, performSearch, selectedTagIds, tagMatchMode]);

  // Toggle tag selection
  const handleTagToggle = useCallback((tagId: number) => {
    setSelectedTagIds((prev) => {
      const newTagIds = prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId];

      // Trigger search if there's a query
      if (query.trim()) {
        performSearch(query, searchMode, newTagIds, tagMatchMode);
      }

      return newTagIds;
    });
  }, [query, searchMode, performSearch, tagMatchMode]);

  // Handle tag match mode change
  const handleTagMatchModeChange = useCallback((mode: PaperlessTagMatchMode) => {
    setTagMatchMode(mode);
    if (query.trim() && selectedTagIds.length > 0) {
      performSearch(query, searchMode, selectedTagIds, mode);
    }
  }, [query, searchMode, selectedTagIds, performSearch]);

  // Load more results
  const handleLoadMore = useCallback(() => {
    if (query.trim() && hasMore && !isLoadingMore) {
      performSearch(query, searchMode, selectedTagIds, tagMatchMode, true, results.length);
    }
  }, [query, searchMode, selectedTagIds, tagMatchMode, hasMore, isLoadingMore, results.length, performSearch]);

  // Remove a selected tag
  const handleRemoveTag = useCallback((tagId: number) => {
    handleTagToggle(tagId);
  }, [handleTagToggle]);

  // Handle document selection
  const handleSelect = (doc: PaperlessDocument) => {
    const path = doc.converted_path || doc.original_path;
    if (path) {
      setSelectedId(doc.id);
      // Brief visual feedback before closing
      setTimeout(() => {
        onSelect(path);
        onClose();
      }, 150);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((prev) => {
        const next = prev < results.length - 1 ? prev + 1 : prev;
        // Scroll focused item into view
        setTimeout(() => {
          const items = resultsRef.current?.querySelectorAll("[data-result-item]");
          items?.[next]?.scrollIntoView({ block: "nearest" });
        }, 0);
        return next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((prev) => {
        const next = prev > 0 ? prev - 1 : 0;
        setTimeout(() => {
          const items = resultsRef.current?.querySelectorAll("[data-result-item]");
          items?.[next]?.scrollIntoView({ block: "nearest" });
        }, 0);
        return next;
      });
    } else if (e.key === "Enter") {
      const targetIndex = focusedIndex >= 0 ? focusedIndex : 0;
      const doc = results[targetIndex];
      if (doc && (doc.converted_path || doc.original_path)) {
        handleSelect(doc);
      }
    }
  };

  // Reset focused index when results change
  useEffect(() => {
    setFocusedIndex(results.length > 0 ? 0 : -1);
  }, [results]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Search Shelv"
      size="lg"
    >
      <div className="space-y-4">
        {/* Search Mode Tabs - scrollable on mobile */}
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="flex gap-1 p-1 rounded-lg bg-gray-100 dark:bg-gray-800 min-w-max sm:min-w-0">
            {searchModeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSearchModeChange(option.value)}
                className={cn(
                  "flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap",
                  searchMode === option.value
                    ? "bg-white dark:bg-[#2a2a2a] text-amber-700 dark:text-amber-400 shadow-sm"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                )}
                disabled={isConfigured === false}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search for documents..."
            aria-label="Search documents"
            className={cn(
              "w-full pl-10 pr-4 py-2.5 rounded-lg border",
              "bg-white dark:bg-[#1a1a1a]",
              "border-[#e8d4b8] dark:border-[#6b5a4a]",
              "text-gray-900 dark:text-gray-100",
              "placeholder:text-gray-400 dark:placeholder:text-gray-500",
              "focus:outline-none focus:ring-2 focus:ring-amber-400/50"
            )}
            disabled={isConfigured === false}
          />
          {isLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-500 animate-spin" />
          )}
        </div>

        {/* Screen reader announcement */}
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {isLoading ? "Searching..." : results.length > 0 ? `${results.length} results found` : query && !error ? "No results" : ""}
        </div>

        {/* Advanced mode hint - collapsible */}
        {searchMode === "advanced" && (
          <div className="-mt-2">
            <button
              onClick={() => setHintsExpanded(!hintsExpanded)}
              className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
            >
              <ChevronDown className={cn("h-3 w-3 transition-transform", hintsExpanded && "rotate-180")} />
              {hintsExpanded ? "Hide syntax tips" : "Show syntax tips"}
            </button>
            {hintsExpanded && (
              <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 space-y-1 pl-4">
                <p>
                  <span className="font-medium text-gray-600 dark:text-gray-300">Boolean:</span>{" "}
                  <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800">F1 AND algebra</code>{" "}
                  <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800">factorisation OR factorization</code>{" "}
                  <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800">integral NOT indices</code>
                </p>
                <p>
                  <span className="font-medium text-gray-600 dark:text-gray-300">Fields:</span>{" "}
                  <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800">title:Exam</code>{" "}
                  <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800">tag:SS</code>{" "}
                </p>
                <p>
                  <span className="font-medium text-gray-600 dark:text-gray-300">More:</span>{" "}
                  <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800">"exact phrase"</code>{" "}
                  <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800">test*</code>{" "}
                  <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800">created:[2024 to 2025]</code>
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tag Filter */}
        {availableTags.length > 0 && (
          <div className="space-y-2">
            {/* Tag dropdown */}
            <div className="relative" ref={tagDropdownRef}>
              <button
                onClick={() => setIsTagDropdownOpen(!isTagDropdownOpen)}
                aria-label="Filter by tags"
                aria-expanded={isTagDropdownOpen}
                aria-haspopup="listbox"
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all",
                  "bg-white dark:bg-[#1a1a1a]",
                  "border-[#e8d4b8] dark:border-[#6b5a4a]",
                  "text-gray-700 dark:text-gray-300",
                  "hover:border-amber-300 dark:hover:border-amber-700",
                  selectedTagIds.length > 0 && "border-amber-400 dark:border-amber-600"
                )}
                disabled={isConfigured === false}
              >
                <Tag className="h-4 w-4" />
                <span>Filter by tags{selectedTagIds.length > 0 && ` (${selectedTagIds.length})`}</span>
                <ChevronDown className={cn("h-4 w-4 ml-auto transition-transform", isTagDropdownOpen && "rotate-180")} />
              </button>

              {isTagDropdownOpen && (
                <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] shadow-lg">
                  {availableTags.map((tag) => (
                    <label
                      key={tag.id}
                      className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTagIds.includes(tag.id)}
                        onChange={() => handleTagToggle(tag.id)}
                        className="rounded border-gray-300 dark:border-gray-600 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{tag.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* AND/OR toggle - only show when 2+ tags selected */}
            {selectedTagIds.length >= 2 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500 dark:text-gray-400">Match:</span>
                <button
                  onClick={() => handleTagMatchModeChange("all")}
                  className={cn(
                    "px-2 py-0.5 rounded transition-colors",
                    tagMatchMode === "all"
                      ? "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300"
                      : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  )}
                >
                  All (AND)
                </button>
                <button
                  onClick={() => handleTagMatchModeChange("any")}
                  className={cn(
                    "px-2 py-0.5 rounded transition-colors",
                    tagMatchMode === "any"
                      ? "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300"
                      : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  )}
                >
                  Any (OR)
                </button>
              </div>
            )}

            {/* Selected tags as chips */}
            {selectedTagIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedTagIds.map((tagId) => {
                  const tag = availableTags.find((t) => t.id === tagId);
                  if (!tag) return null;
                  return (
                    <span
                      key={tagId}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300"
                    >
                      {tag.name}
                      <button
                        onClick={() => handleRemoveTag(tagId)}
                        aria-label={`Remove ${tag.name} filter`}
                        className="hover:bg-amber-200 dark:hover:bg-amber-800 rounded-full p-1"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Error Message */}
        {error && !isLoading && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
            <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
          </div>
        )}

        {/* Results area with stable height to prevent modal jumping */}
        <div className="min-h-[350px]">
          {results.length > 0 && (
            <div ref={resultsRef} className="space-y-2 max-h-[350px] overflow-y-auto" role="listbox">
            {results.map((doc, index) => {
              const path = doc.converted_path || doc.original_path;
              const isSelected = selectedId === doc.id;
              const isFocused = focusedIndex === index;

              return (
                <div
                  key={doc.id}
                  data-result-item
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => path && handleSelect(doc)}
                  className={cn(
                    "flex gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                    "hover:shadow-md hover:-translate-y-0.5",
                    isSelected
                      ? "bg-amber-100 dark:bg-amber-900/30 border-amber-400 dark:border-amber-600"
                      : isFocused
                        ? "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 ring-2 ring-amber-400/50"
                        : "bg-white dark:bg-[#1a1a1a] border-[#e8d4b8] dark:border-[#6b5a4a] hover:border-amber-300 dark:hover:border-amber-700",
                    !path && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {/* Thumbnail */}
                  <div className="w-12 h-16 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 flex items-center justify-center shrink-0 overflow-hidden">
                    <img
                      src={api.paperless.getThumbnailUrl(doc.id)}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Replace with icon on error
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                    <FileText className="h-6 w-6 text-gray-400 hidden" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {doc.title}
                    </h4>
                    {path ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1 truncate">
                        {path}
                      </p>
                    ) : (
                      <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                        No path available
                      </p>
                    )}
                    {doc.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {doc.tags.slice(0, 5).map((tag, i) => (
                          <span
                            key={i}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300"
                          >
                            {tag}
                          </span>
                        ))}
                        {doc.tags.length > 5 && (
                          <span className="text-[10px] text-gray-400">
                            +{doc.tags.length - 5} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {/* Preview button */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-gray-500 hover:text-amber-600 dark:hover:text-amber-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewDoc(doc);
                      }}
                      title="Preview PDF"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {/* Select indicator */}
                    {isSelected ? (
                      <Check className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        disabled={!path}
                      >
                        Use
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Load more button */}
            {hasMore && !isLoading && (
              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
              >
                {isLoadingMore && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Load more results
              </Button>
            )}
          </div>
        )}

          {/* Empty state */}
          {!isLoading && !error && query && results.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Search className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Start typing to search documents</p>
            </div>
          )}

          {/* Initial state */}
          {!query && !isLoading && isConfigured !== false && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Search for courseware</p>
              <p className="text-xs mt-1 text-gray-400">
                Results will show the file path to use
              </p>
            </div>
          )}
        </div>
      </div>

      {/* PDF Preview Modal */}
      <PdfPreviewModal
        isOpen={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        documentId={previewDoc?.id ?? null}
        documentTitle={previewDoc?.title}
      />
    </Modal>
  );
}
