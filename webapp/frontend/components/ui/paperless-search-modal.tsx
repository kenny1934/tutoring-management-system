"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Search, FileText, Loader2, AlertCircle, Check, Eye, EyeOff, Tag, ChevronDown, X, Trash2, Square, CheckSquare, TrendingUp, Flame, User, Info, ChevronUp, ExternalLink, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type PaperlessDocument, type PaperlessSearchMode, type PaperlessTag, type PaperlessTagMatchMode } from "@/lib/api";
import { PdfPreviewModal } from "@/components/ui/pdf-preview-modal";
import { CopyPathButton } from "@/components/ui/copy-path-button";
import { getRecentDocuments, addRecentDocument, clearRecentDocuments, type RecentDocument } from "@/lib/shelv-storage";
import { useCoursewarePopularity, useCoursewareUsageDetail } from "@/lib/hooks";
import { setPaperlessPathCache } from "@/lib/file-system";
import type { PageSelection, CoursewarePopularity, CoursewareUsageDetail } from "@/types";

// Constants
const DEBOUNCE_MS = 300;
const RESULTS_PER_PAGE = 30;
const MAX_TRENDING = 10;
const SELECTION_ANIMATION_MS = 150;
const FOCUS_DELAY_MS = 100;

interface PaperlessSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string, pageSelection?: PageSelection) => void;
  multiSelect?: boolean;
  onMultiSelect?: (selections: Array<{ path: string; pageSelection?: PageSelection }>) => void;
  // Optional context for trending suggestions
  exerciseType?: 'CW' | 'HW';
  studentGrade?: string;
  school?: string;
  location?: string;  // For location-based access control on links
}

export function PaperlessSearchModal({
  isOpen,
  onClose,
  onSelect,
  multiSelect = false,
  onMultiSelect,
  exerciseType,
  studentGrade,
  school,
  location,
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

  // New state for power-user features
  const [recentDocs, setRecentDocs] = useState<RecentDocument[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<Array<{ doc: PaperlessDocument; pageSelection?: PageSelection }>>([]);
  const [hasNavigated, setHasNavigated] = useState(false); // Track if user used arrow keys

  // State to track which trending items are previewable in Shelv (cache for found docs)
  const [previewableTrending, setPreviewableTrending] = useState<Map<string, PaperlessDocument>>(new Map());
  // Track items that failed the check (not in Shelv)
  const [unavailableTrending, setUnavailableTrending] = useState<Set<string>>(new Set());
  // Track items currently being checked
  const [checkingPreview, setCheckingPreview] = useState<Set<string>>(new Set());

  // State to track selected trending items by filename (stable key for checkbox)
  const [selectedTrendingFilenames, setSelectedTrendingFilenames] = useState<Set<string>>(new Set());
  const [previewingTrendingFilename, setPreviewingTrendingFilename] = useState<string | null>(null);

  // State for expanded usage details
  const [detailItem, setDetailItem] = useState<CoursewarePopularity | null>(null);

  // Computed: show recent docs when query empty, search results when typing
  const showingRecent = !query.trim();

  // Fetch trending courseware when context is provided
  // Don't filter by exerciseType - show all courseware popular for this grade/school
  const { data: trendingData, isLoading: trendingLoading } = useCoursewarePopularity(
    'recent',
    undefined,  // Don't filter by exercise type - show all courseware
    studentGrade,
    school
  );
  // Memoize trending items with pre-computed path and stable ID
  const topTrending = useMemo(() =>
    (trendingData?.slice(0, MAX_TRENDING) || []).map(item => ({
      ...item,
      // Pre-compute path and stable ID once to avoid repeated parsing
      path: item.normalized_paths.split(',')[0]?.trim() || '',
      stableId: -Math.abs(item.filename.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0))
    })),
    [trendingData]
  );

  // Fetch usage details for expanded item (filtered by grade/school only)
  const { data: usageDetails, isLoading: usageDetailsLoading } = useCoursewareUsageDetail(
    detailItem?.filename ?? null,
    'recent',
    10,
    undefined,     // Don't filter by exercise type - show both CW and HW
    studentGrade,  // Filter by current grade
    school         // Filter by current school
  );

  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Ref to hold state values for keyboard handler (avoids re-registering on every state change)
  const stateRef = useRef({
    previewDoc: null as PaperlessDocument | null,
    selectedDocs: [] as Array<{ doc: PaperlessDocument; pageSelection?: PageSelection }>,
    totalNavigableItems: 0,
    trendingCount: 0,
    topTrending: [] as (CoursewarePopularity & { path: string; stableId: number })[],
    focusedIndex: -1,
    showingRecent: true,
    results: [] as PaperlessDocument[],
    recentDocs: [] as RecentDocument[],
    hasNavigated: false,
  });

  // Cached DOM elements for arrow navigation (avoids querying on every keypress)
  const cachedItemsRef = useRef<Element[]>([]);

  const searchModeOptions: { value: PaperlessSearchMode; label: string }[] = [
    { value: "all", label: "All" },
    { value: "title", label: "Title" },
    { value: "content", label: "Content" },
    { value: "advanced", label: "Advanced" },
  ];

  // Check if Paperless is configured and fetch tags on mount
  useEffect(() => {
    if (isOpen) {
      // Load recent documents from localStorage
      setRecentDocs(getRecentDocuments());

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
      setTimeout(() => searchInputRef.current?.focus(), FOCUS_DELAY_MS);
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
      setSelectedDocs([]);
      setPreviewableTrending(new Map());
      setUnavailableTrending(new Set());
      setCheckingPreview(new Set());
      setSelectedTrendingFilenames(new Set());
      setPreviewingTrendingFilename(null);
      setDetailItem(null);
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
        RESULTS_PER_PAGE,
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
    setHasNavigated(false); // Reset navigation state when typing

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      performSearch(value, searchMode, selectedTagIds, tagMatchMode);
    }, DEBOUNCE_MS);
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
  const handleSelect = useCallback((doc: PaperlessDocument, pageSelection?: PageSelection) => {
    const path = doc.converted_path || doc.original_path;
    if (!path) return;

    // Save to recent documents
    addRecentDocument({
      id: doc.id,
      title: doc.title,
      path,
      tags: doc.tags,
    });

    // Cache path → documentId for Paperless fallback when opening files
    setPaperlessPathCache(path, doc.id);

    if (multiSelect) {
      // Toggle selection in multi-select mode
      setSelectedDocs((prev) => {
        const exists = prev.some((d) => d.doc.id === doc.id);
        if (exists) {
          return prev.filter((d) => d.doc.id !== doc.id);
        }
        return [...prev, { doc, pageSelection }];
      });
    } else {
      // Single select: close modal
      setSelectedId(doc.id);
      setTimeout(() => {
        onSelect(path, pageSelection);
        onClose();
      }, SELECTION_ANIMATION_MS);
    }
  }, [multiSelect, onSelect, onClose]);

  // Handle selecting from recent documents
  const handleSelectRecent = useCallback((recent: RecentDocument) => {
    // Cache path → documentId for Paperless fallback when opening files
    setPaperlessPathCache(recent.path, recent.id);

    if (multiSelect) {
      // In multi-select, we need a full doc object - create a minimal one
      const doc: PaperlessDocument = {
        id: recent.id,
        title: recent.title,
        original_path: recent.path,
        converted_path: recent.path,
        tags: recent.tags,
        created: null,
        correspondent: null,
      };
      setSelectedDocs((prev) => {
        const exists = prev.some((d) => d.doc.id === doc.id);
        if (exists) {
          return prev.filter((d) => d.doc.id !== doc.id);
        }
        return [...prev, { doc, pageSelection: undefined }];
      });
    } else {
      // Single select: close modal
      addRecentDocument(recent); // Move to top of recent
      setTimeout(() => {
        onSelect(recent.path);
        onClose();
      }, SELECTION_ANIMATION_MS);
    }
  }, [multiSelect, onSelect, onClose]);

  // Handle selecting from trending courseware (uses pre-computed path/stableId from topTrending)
  const handleSelectTrending = useCallback((item: CoursewarePopularity & { path: string; stableId: number }) => {
    if (!item.path) return;

    if (multiSelect) {
      const isCurrentlySelected = selectedTrendingFilenames.has(item.filename);

      if (isCurrentlySelected) {
        // Deselecting - remove from both selectedDocs and tracking set
        setSelectedDocs((prev) => prev.filter((d) => d.doc.id !== item.stableId));
        setSelectedTrendingFilenames(prev => {
          const next = new Set(prev);
          next.delete(item.filename);
          return next;
        });
      } else {
        // Selecting - add to both selectedDocs and tracking set
        const doc: PaperlessDocument = {
          id: item.stableId,
          title: item.filename,
          original_path: item.path,
          converted_path: item.path,
          tags: [],
          created: null,
          correspondent: null,
        };
        setSelectedDocs((prev) => [...prev, { doc, pageSelection: undefined }]);
        setSelectedTrendingFilenames(prev => { const next = new Set(prev); next.add(item.filename); return next; });
      }
    } else {
      onSelect(item.path);
      onClose();
    }
  }, [multiSelect, onSelect, onClose, selectedTrendingFilenames]);

  // Handle previewing a trending item (on-demand check, uses pre-computed path from topTrending)
  const handlePreviewTrending = useCallback(async (item: CoursewarePopularity & { path: string; stableId: number }) => {
    // If already cached, open immediately
    const cachedDoc = previewableTrending.get(item.filename);
    if (cachedDoc) {
      setPreviewDoc(cachedDoc);
      setPreviewingTrendingFilename(item.filename);
      return;
    }

    // If already known to be unavailable, do nothing (button shows EyeOff)
    if (unavailableTrending.has(item.filename)) return;

    // If already checking, ignore
    if (checkingPreview.has(item.filename)) return;

    // Start checking
    setCheckingPreview(prev => { const next = new Set(prev); next.add(item.filename); return next; });

    try {
      if (!item.path) {
        setUnavailableTrending(prev => { const next = new Set(prev); next.add(item.filename); return next; });
        return;
      }

      const response = await api.paperless.search(item.path, 3, 'all');
      if (response.results.length > 0) {
        // Found - cache and open preview
        const doc = response.results[0];
        setPreviewableTrending(prev => new Map(prev).set(item.filename, doc));
        setPreviewDoc(doc);
        setPreviewingTrendingFilename(item.filename);
      } else {
        // Not found - mark as unavailable (button will show EyeOff)
        setUnavailableTrending(prev => { const next = new Set(prev); next.add(item.filename); return next; });
      }
    } catch {
      // On error, mark as unavailable
      setUnavailableTrending(prev => { const next = new Set(prev); next.add(item.filename); return next; });
    } finally {
      setCheckingPreview(prev => {
        const next = new Set(prev);
        next.delete(item.filename);
        return next;
      });
    }
  }, [previewableTrending, unavailableTrending, checkingPreview]);

  // Handle adding all selected docs
  const handleAddSelected = useCallback(() => {
    if (selectedDocs.length === 0) return;

    const selections = selectedDocs
      .map(({ doc, pageSelection }) => ({
        path: doc.converted_path || doc.original_path,
        pageSelection,
      }))
      .filter((s): s is { path: string; pageSelection: PageSelection | undefined } => !!s.path);

    if (onMultiSelect) {
      onMultiSelect(selections);
    }
    onClose();
  }, [selectedDocs, onMultiSelect, onClose]);

  // Clear recent documents
  const handleClearRecent = useCallback(() => {
    clearRecentDocuments();
    setRecentDocs([]);
  }, []);

  // Compute navigation list length (includes trending when showing recent)
  const trendingCount = showingRecent && !trendingLoading ? topTrending.length : 0;
  const totalNavigableItems = showingRecent
    ? trendingCount + recentDocs.length
    : results.length;

  // Sync stateRef with current values (for keyboard handler to read without re-registering)
  useEffect(() => {
    stateRef.current = {
      previewDoc,
      selectedDocs,
      totalNavigableItems,
      trendingCount,
      topTrending,
      focusedIndex,
      showingRecent,
      results,
      recentDocs,
      hasNavigated,
    };
  });

  // Cache DOM elements when list structure changes (for arrow navigation)
  useEffect(() => {
    // Small delay to ensure DOM is rendered
    const timer = setTimeout(() => {
      if (resultsRef.current) {
        cachedItemsRef.current = Array.from(resultsRef.current.querySelectorAll("[data-result-item]"));
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [totalNavigableItems, showingRecent]);

  // Global keyboard handler - works regardless of focus
  // Use capture phase to intercept events before Modal's handlers
  // Reads from stateRef to avoid re-registering on every state change
  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const state = stateRef.current;

      // Escape - close preview first, or reset navigation mode, then let modal handle close
      if (e.key === "Escape") {
        if (state.previewDoc) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          setPreviewDoc(null);
          return;
        }
        if (state.hasNavigated) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          setHasNavigated(false);
          return;
        }
        return;
      }

      // Cmd/Ctrl+Enter - Add all selected (multi-select mode)
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && multiSelect && state.selectedDocs.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleAddSelected();
        return;
      }

      // Arrow navigation - works even when typing (autocomplete pattern)
      if (e.key === "ArrowDown" && state.totalNavigableItems > 0) {
        e.preventDefault();
        setHasNavigated(true);
        setFocusedIndex((prev) => {
          const next = prev < state.totalNavigableItems - 1 ? prev + 1 : prev;
          setTimeout(() => {
            cachedItemsRef.current[next]?.scrollIntoView({ block: "nearest" });
          }, 0);
          return next;
        });
      } else if (e.key === "ArrowUp" && state.totalNavigableItems > 0) {
        e.preventDefault();
        setHasNavigated(true);
        setFocusedIndex((prev) => {
          const next = prev > 0 ? prev - 1 : 0;
          setTimeout(() => {
            cachedItemsRef.current[next]?.scrollIntoView({ block: "nearest" });
          }, 0);
          return next;
        });
      } else if (e.key === " " && state.hasNavigated && state.focusedIndex >= 0 && !state.previewDoc) {
        // Space - preview focused item (only after arrow navigation)
        e.preventDefault();
        if (!state.showingRecent && state.results[state.focusedIndex]) {
          setPreviewDoc(state.results[state.focusedIndex]);
        } else if (state.showingRecent) {
          if (state.focusedIndex < state.trendingCount && state.topTrending[state.focusedIndex]) {
            handlePreviewTrending(state.topTrending[state.focusedIndex]);
          } else {
            const recentIndex = state.focusedIndex - state.trendingCount;
            const recent = state.recentDocs[recentIndex];
            if (recent) {
              setPreviewDoc({
                id: recent.id,
                title: recent.title,
                original_path: recent.path,
                converted_path: recent.path,
                tags: recent.tags,
                created: null,
                correspondent: null,
              });
            }
          }
        }
      } else if (e.key === "Enter" && state.hasNavigated && state.focusedIndex >= 0) {
        // Enter - select focused item (only after navigating with arrows)
        e.preventDefault();
        if (state.showingRecent) {
          if (state.focusedIndex < state.trendingCount && state.topTrending[state.focusedIndex]) {
            handleSelectTrending(state.topTrending[state.focusedIndex]);
          } else {
            const recentIndex = state.focusedIndex - state.trendingCount;
            if (state.recentDocs[recentIndex]) {
              handleSelectRecent(state.recentDocs[recentIndex]);
            }
          }
        } else if (state.results[state.focusedIndex]) {
          const doc = state.results[state.focusedIndex];
          if (doc.converted_path || doc.original_path) {
            handleSelect(doc);
          }
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleGlobalKeyDown, { capture: true });
  }, [isOpen, multiSelect, handleAddSelected, handleSelectRecent, handleSelect, handleSelectTrending, handlePreviewTrending]);

  // Reset focused index when navigable items change
  useEffect(() => {
    setFocusedIndex(totalNavigableItems > 0 ? 0 : -1);
  }, [totalNavigableItems]);

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

        {/* Results/Recent area with stable height */}
        <div className="min-h-[350px]">
          {/* Trending + Recent - shown when query is empty */}
          {showingRecent && (
            <div ref={resultsRef} className="max-h-[350px] overflow-y-auto">
              {/* Trending section - loading skeleton */}
              {trendingLoading && (exerciseType || studentGrade || school) && (
                <div className="mb-4 space-y-2">
                  <div className="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                  ))}
                </div>
              )}

              {/* Trending section - empty fallback */}
              {!trendingLoading && topTrending.length === 0 && (studentGrade || school) && (
                <div className="text-xs text-gray-400 dark:text-gray-500 mb-4">
                  No trending for {studentGrade}{school && ` @ ${school}`}
                </div>
              )}

              {/* Trending section */}
              {!trendingLoading && topTrending.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    <span>
                      Trending
                      {studentGrade && ` for ${studentGrade}`}
                      {school && ` @ ${school}`}
                    </span>
                    <span className="text-gray-400 dark:text-gray-500">(Last 14 days)</span>
                  </div>
                  <div className="space-y-1">
                    {topTrending.map((item, index) => {
                      // item.path and item.stableId are pre-computed in topTrending memo
                      const isChecked = selectedTrendingFilenames.has(item.filename);
                      const isFocused = hasNavigated && focusedIndex === index;
                      const isExpanded = detailItem?.filename === item.filename;

                      return (
                        <div key={item.filename}>
                          <div
                            data-result-item
                            role="button"
                            tabIndex={0}
                            aria-label={`${isChecked ? 'Deselect' : 'Select'} ${item.filename}`}
                            onClick={() => handleSelectTrending(item)}
                            onKeyDown={(e) => {
                              // Allow Enter/Space to select (but not when focus is on inner buttons)
                              if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                                e.preventDefault();
                                handleSelectTrending(item);
                              }
                            }}
                            className={cn(
                              "w-full text-left px-3 py-2 rounded-lg border transition-all cursor-pointer",
                              "border-[#e8d4b8] dark:border-[#6b5a4a]",
                              "hover:border-amber-300 dark:hover:border-amber-700 hover:shadow-sm",
                              "flex items-center gap-2",
                              // Gradient background for top 3 (when not focused/checked)
                              !isFocused && !isChecked && index < 3
                                ? "bg-gradient-to-r from-orange-50 to-white dark:from-orange-900/20 dark:to-[#1a1a1a]"
                                : !isFocused && !isChecked ? "bg-white dark:bg-[#1a1a1a]" : "",
                              // Focus styling
                              isFocused && "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 ring-2 ring-amber-400/50",
                              // Highlight if selected in multi-select mode
                              isChecked && "border-amber-400 dark:border-amber-600 bg-amber-100 dark:bg-amber-900/30",
                              // Bottom border radius when expanded
                              isExpanded && "rounded-b-none border-b-0"
                            )}
                          >
                            {index < 3 && <Flame className="h-3.5 w-3.5 text-orange-500 shrink-0" />}
                            <span className="flex-1 truncate text-sm text-gray-900 dark:text-gray-100">{item.filename}</span>
                            <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 flex items-center gap-1.5">
                              {item.assignment_count}×
                              <span className="flex items-center gap-0.5">
                                <User className="h-3 w-3" />
                                {item.unique_student_count}
                              </span>
                            </span>
                            {/* Preview button - always show, checks on-demand */}
                            {unavailableTrending.has(item.filename) ? (
                              <div className="p-1 shrink-0" title="Not available in Shelv">
                                <EyeOff className="h-4 w-4 text-gray-300 dark:text-gray-600" />
                              </div>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePreviewTrending(item);
                                }}
                                disabled={checkingPreview.has(item.filename)}
                                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-amber-600 dark:hover:text-amber-400 shrink-0 disabled:opacity-50"
                                title={checkingPreview.has(item.filename) ? 'Checking...' : 'Preview PDF'}
                                aria-label={`Preview ${item.filename}`}
                              >
                                {checkingPreview.has(item.filename) ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </button>
                            )}
                            {/* Copy path button */}
                            <CopyPathButton paths={item.normalized_paths} filename={item.filename} />
                            {/* Info/details button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDetailItem(isExpanded ? null : item);
                              }}
                              className={cn(
                                "p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 shrink-0",
                                isExpanded
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-gray-500 hover:text-amber-600 dark:hover:text-amber-400"
                              )}
                              title={isExpanded ? "Hide usage details" : "Show usage details"}
                              aria-label={isExpanded ? `Hide usage details for ${item.filename}` : `Show usage details for ${item.filename}`}
                              aria-expanded={isExpanded}
                            >
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <Info className="h-4 w-4" />}
                            </button>
                            {/* Multi-select checkbox */}
                            {multiSelect && (
                              isChecked ? (
                                <CheckSquare className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                              ) : (
                                <Square className="h-4 w-4 text-gray-400 shrink-0" />
                              )
                            )}
                          </div>

                          {/* Expandable usage details section */}
                          {isExpanded && (
                            <div className="px-3 py-2 border border-t-0 border-[#e8d4b8] dark:border-[#6b5a4a] rounded-b-lg bg-gray-50 dark:bg-[#1a1a1a]/50">
                              {usageDetailsLoading ? (
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Loading usage details...
                                </div>
                              ) : usageDetails && usageDetails.length > 0 ? (
                                <div className="space-y-1">
                                  <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                                    Recent sessions using this file:
                                  </div>
                                  <div className="text-xs space-y-1 max-h-32 overflow-y-auto">
                                    {usageDetails.map((detail, i) => {
                                      const displayId = detail.school_student_id
                                        ? `${detail.location}-${detail.school_student_id}`
                                        : detail.location;
                                      // Check if user has access to this detail's location
                                      const canAccessLocation = !location || location === detail.location;
                                      return (
                                        <div
                                          key={`${detail.session_id}-${detail.exercise_id}-${i}`}
                                          className="flex items-center gap-2 text-gray-600 dark:text-gray-400"
                                        >
                                          <span className="text-gray-400 dark:text-gray-500 w-20 shrink-0">
                                            {detail.session_date
                                              ? new Date(detail.session_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                                              : '-'}
                                          </span>
                                          {canAccessLocation ? (
                                            <Link
                                              href={`/students/${detail.student_id}`}
                                              target="_blank"
                                              className="group truncate flex-1 text-[#a0704b] dark:text-[#cd853f]"
                                              title={`${displayId} ${detail.student_name}`}
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <span className="text-gray-400 dark:text-gray-500 mr-1">{displayId}</span>
                                              <span className="group-hover:underline">{detail.student_name}</span>
                                            </Link>
                                          ) : (
                                            <span className="truncate flex-1 text-gray-500 dark:text-gray-400" title={detail.student_name}>
                                              <span className="mr-1">{displayId}</span>
                                              <span>{detail.student_name}</span>
                                            </span>
                                          )}
                                          <span className="shrink-0 text-gray-400 dark:text-gray-500">
                                            {detail.grade}{detail.lang_stream}
                                          </span>
                                          <span className={cn(
                                            "shrink-0 px-1 py-0.5 rounded text-[10px]",
                                            detail.exercise_type === 'CW'
                                              ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                                              : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                          )}>
                                            {detail.exercise_type}
                                          </span>
                                          <span className="shrink-0 text-gray-400 dark:text-gray-500 truncate max-w-[60px]" title={detail.tutor_name}>
                                            {detail.tutor_name}
                                          </span>
                                          {canAccessLocation ? (
                                            <Link
                                              href={`/sessions/${detail.session_id}`}
                                              target="_blank"
                                              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 shrink-0"
                                              title="Go to session"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <ExternalLink className="h-3 w-3 text-gray-400 hover:text-[#a0704b]" />
                                            </Link>
                                          ) : (
                                            <div className="p-1 shrink-0 w-5" />
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-xs text-gray-500">
                                  No usage details available
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recent Documents */}
              {recentDocs.length > 0 ? (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Recently used documents
                    </span>
                    <button
                      onClick={handleClearRecent}
                      className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1"
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear
                    </button>
                  </div>
                  <div className="space-y-2 max-h-[320px] overflow-y-auto" role="listbox">
                    {recentDocs.map((recent, index) => {
                      const isChecked = selectedDocs.some((d) => d.doc.id === recent.id);
                      // Account for trending items when calculating focus index
                      const isFocused = hasNavigated && focusedIndex === index + trendingCount;

                      return (
                        <div
                          key={recent.id}
                          data-result-item
                          role="option"
                          aria-selected={isChecked}
                          onClick={() => handleSelectRecent(recent)}
                          className={cn(
                            "flex gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                            "hover:shadow-md hover:-translate-y-0.5",
                            isChecked
                              ? "bg-amber-100 dark:bg-amber-900/30 border-amber-400 dark:border-amber-600"
                              : isFocused
                                ? "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 ring-2 ring-amber-400/50"
                                : "bg-white dark:bg-[#1a1a1a] border-[#e8d4b8] dark:border-[#6b5a4a] hover:border-amber-300 dark:hover:border-amber-700"
                          )}
                        >
                          {/* Thumbnail */}
                          <div className="w-12 h-16 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 flex items-center justify-center shrink-0 overflow-hidden">
                            <img
                              src={api.paperless.getThumbnailUrl(recent.id)}
                              alt=""
                              loading="lazy"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                            <FileText className="h-6 w-6 text-gray-400 hidden" />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                              {recent.title}
                            </h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1 truncate">
                              {recent.path}
                            </p>
                            {recent.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {recent.tags.slice(0, 5).map((tag, i) => (
                                  <span
                                    key={i}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300"
                                  >
                                    {tag}
                                  </span>
                                ))}
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
                                setPreviewDoc({
                                  id: recent.id,
                                  title: recent.title,
                                  original_path: recent.path,
                                  converted_path: recent.path,
                                  tags: recent.tags,
                                  created: null,
                                  correspondent: null,
                                });
                              }}
                              title="Preview PDF"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {multiSelect ? (
                              isChecked ? (
                                <CheckSquare className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                              ) : (
                                <Square className="h-5 w-5 text-gray-400" />
                              )
                            ) : (
                              <Button size="sm" variant="outline" className="text-xs">
                                Use
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Type to search for documents</p>
                  <p className="text-xs mt-1 text-gray-400">
                    Recent selections will appear here
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Search Results - shown when query has text */}
          {!showingRecent && results.length > 0 && (
            <div ref={resultsRef} className="space-y-2 max-h-[350px] overflow-y-auto" role="listbox">
              {results.map((doc, index) => {
                const path = doc.converted_path || doc.original_path;
                const isChecked = selectedDocs.some((d) => d.doc.id === doc.id);
                const isSelected = selectedId === doc.id;
                const isFocused = hasNavigated && focusedIndex === index;

                return (
                  <div
                    key={doc.id}
                    data-result-item
                    role="option"
                    aria-selected={isChecked || isSelected}
                    onClick={() => path && handleSelect(doc)}
                    className={cn(
                      "flex gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                      "hover:shadow-md hover:-translate-y-0.5",
                      isChecked || isSelected
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
                      {multiSelect ? (
                        isChecked ? (
                          <CheckSquare className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                        ) : (
                          <Square className="h-5 w-5 text-gray-400" />
                        )
                      ) : isSelected ? (
                        <Check className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      ) : (
                        <Button size="sm" variant="outline" className="text-xs" disabled={!path}>
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

          {/* No results found */}
          {!showingRecent && !isLoading && !error && results.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Search className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No documents found</p>
            </div>
          )}
        </div>

        {/* Multi-select selection tray */}
        {multiSelect && selectedDocs.length > 0 && (
          <div className="border-t border-[#e8d4b8] dark:border-[#6b5a4a] pt-3 mt-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {selectedDocs.length} document{selectedDocs.length > 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelectedDocs([])}>
                  Clear
                </Button>
                <Button size="sm" onClick={handleAddSelected}>
                  Add All
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Keyboard hints */}
        <div className="text-xs text-gray-400 dark:text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 border-t border-gray-100 dark:border-gray-800">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px]">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px]">Enter</kbd>
            select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px]">Space</kbd>
            preview
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px]">Esc</kbd>
            close
          </span>
          {multiSelect && selectedDocs.length > 0 && (
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px]">Ctrl+Enter</kbd>
              add all
            </span>
          )}
        </div>
      </div>

      {/* PDF Preview Modal */}
      <PdfPreviewModal
        isOpen={!!previewDoc}
        onClose={() => {
          setPreviewDoc(null);
          setPreviewingTrendingFilename(null);
        }}
        documentId={previewDoc?.id ?? null}
        documentTitle={previewDoc?.title}
        enablePageSelection={true}
        onSelect={previewDoc ? (selection) => {
          handleSelect(previewDoc, selection);
          // If this was a trending preview, track the filename
          if (previewingTrendingFilename) {
            setSelectedTrendingFilenames(prev => { const next = new Set(prev); next.add(previewingTrendingFilename); return next; });
          }
          setPreviewDoc(null);
          setPreviewingTrendingFilename(null);
        } : undefined}
      />
    </Modal>
  );
}
