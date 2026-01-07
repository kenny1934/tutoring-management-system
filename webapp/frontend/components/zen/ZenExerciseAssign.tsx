"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Session, CoursewarePopularity } from "@/types";
import { paperlessAPI, type PaperlessDocument, type PaperlessTag } from "@/lib/api";
import { sessionsAPI } from "@/lib/api";
import { useCoursewarePopularity, useCoursewareUsageDetail } from "@/lib/hooks";
import { updateSessionInCache } from "@/lib/session-cache";
import {
  openFileFromPath,
  printFileFromPathWithPages,
  printBulkFiles,
  getSavedFolders,
  pickFileFromFolder,
  addFolder,
  type PrintStampInfo,
  type BulkPrintExercise,
  type SavedFolder,
} from "@/lib/file-system";
import {
  getRecentDocuments,
  addRecentDocument,
  clearRecentDocuments,
  type RecentDocument,
} from "@/lib/shelv-storage";
import { ZenPdfPreview } from "./ZenPdfPreview";

interface ZenExerciseAssignProps {
  session: Session;
  exerciseType: "CW" | "HW";
  onClose: () => void;
  onAssigned?: () => void;
}

type FocusArea = "search" | "results" | "exercises" | "pages";
type SearchMode = "all" | "title" | "content";

interface ZenExerciseItem {
  id: string; // Unique client-side ID for React keys
  pdf_name: string;
  page_mode: "simple" | "custom";
  page_start: string;
  page_end: string;
  custom_pages: string;
}

/**
 * Terminal-style exercise assignment component with Shelv integration
 *
 * Features:
 * - Multiple exercises per session
 * - Advanced search modes (all, title, content)
 * - Tag-based filtering
 * - Recent documents history
 * - Multi-select from search
 * - Batch print all
 * - Usage details (expandable)
 *
 * Keyboard controls:
 * - ↑↓ or j/k: Navigate results
 * - Enter: Select file / Assign
 * - Tab: Switch focus between sections
 * - a or +: Add new exercise row
 * - d or -: Delete current exercise row
 * - Ctrl+j/k: Navigate between exercise rows
 * - Space: Toggle multi-select
 * - Ctrl+m: Toggle multi-select mode
 * - p: Print selected file
 * - Shift+P: Batch print all exercises
 * - o: Open selected file
 * - Escape: Cancel
 */
export function ZenExerciseAssign({
  session,
  exerciseType,
  onClose,
  onAssigned,
}: ZenExerciseAssignProps) {
  // Search state
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("all");
  const [results, setResults] = useState<PaperlessDocument[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Tags state
  const [availableTags, setAvailableTags] = useState<PaperlessTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [tagMatchMode, setTagMatchMode] = useState<"all" | "any">("all");
  const [tagCursorIndex, setTagCursorIndex] = useState(0);

  // Recent documents
  const [recentDocs, setRecentDocs] = useState<RecentDocument[]>([]);

  // Selection state
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusArea, setFocusArea] = useState<FocusArea>("results");

  // Multi-select state
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedResults, setSelectedResults] = useState<Set<number>>(new Set());

  // Exercises state (multiple exercises)
  const [exercises, setExercises] = useState<ZenExerciseItem[]>([]);
  const [activeExerciseIndex, setActiveExerciseIndex] = useState(0);

  // Usage details expansion
  const [expandedTrending, setExpandedTrending] = useState<string | null>(null);

  // PDF Preview state
  const [previewDoc, setPreviewDoc] = useState<{ id: number; title: string; path: string } | null>(null);

  // Trending preview availability tracking (for Shelv file existence check)
  const [previewableTrending, setPreviewableTrending] = useState<Map<string, PaperlessDocument>>(new Map());
  const [unavailableTrending, setUnavailableTrending] = useState<Set<string>>(new Set());
  const [checkingPreview, setCheckingPreview] = useState<Set<string>>(new Set());

  // Local folders state
  const [savedFolders, setSavedFolders] = useState<SavedFolder[]>([]);
  const [showFoldersDropdown, setShowFoldersDropdown] = useState(false);
  const [folderCursorIndex, setFolderCursorIndex] = useState(0);

  // Status
  const [isAssigning, setIsAssigning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Refs
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  // Fetch trending courseware for student's grade/school
  const { data: trendingData, isLoading: trendingLoading } = useCoursewarePopularity(
    "recent",
    undefined,
    session.grade,
    session.school
  );

  // Usage details for expanded trending item
  const { data: usageDetails } = useCoursewareUsageDetail(
    expandedTrending || undefined,
    "recent",
    5,
    undefined,
    session.grade,
    session.school
  );

  const topTrending = (trendingData?.slice(0, 8) || []).map((item) => ({
    ...item,
    path: item.normalized_paths.split(",")[0]?.trim() || "",
  }));

  // Combined list for navigation
  const getNavigableItems = () => {
    if (query.trim()) return results;
    if (recentDocs.length > 0 && !query.trim()) {
      // Show recent docs at top, then trending
      return [];
    }
    return topTrending;
  };
  const navigableItems = getNavigableItems();

  // Fetch tags on mount
  useEffect(() => {
    const fetchTags = async () => {
      try {
        const response = await paperlessAPI.getTags();
        setAvailableTags(response.tags || []);
      } catch {
        // Ignore tag fetch errors
      }
    };
    fetchTags();
  }, []);

  // Load recent documents on mount
  useEffect(() => {
    setRecentDocs(getRecentDocuments());
  }, []);

  // Load saved folders on mount
  useEffect(() => {
    const loadFolders = async () => {
      const folders = await getSavedFolders();
      setSavedFolders(folders);
    };
    loadFolders();
  }, []);

  // Handle file pick from folder
  const handlePickFromFolder = useCallback(async (folder: SavedFolder) => {
    setShowFoldersDropdown(false);
    const result = await pickFileFromFolder(folder);
    if (result) {
      const newExercise: ZenExerciseItem = {
        id: generateId(),
        pdf_name: result.path,
        page_mode: "simple",
        page_start: "",
        page_end: "",
        custom_pages: "",
      };
      setExercises((prev) => [...prev, newExercise]);
      setActiveExerciseIndex(exercises.length);
      setFocusArea("exercises");
      setStatusMessage(`Added: ${result.name}`);
    }
  }, [exercises.length]);

  // Handle adding new folder
  const handleAddNewFolder = useCallback(async () => {
    setShowFoldersDropdown(false);
    const folder = await addFolder();
    if (folder) {
      setSavedFolders((prev) => [...prev, folder]);
      setStatusMessage(`Folder added: ${folder.name}`);
    }
  }, []);

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!query.trim()) {
      setResults([]);
      setSelectedIndex(0);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);
      try {
        // Build search query based on mode
        let searchQuery = query;
        if (searchMode === "title") {
          searchQuery = `title:${query}`;
        } else if (searchMode === "content") {
          searchQuery = `content:${query}`;
        }

        // Add tag filters to query
        if (selectedTagIds.length > 0) {
          const tagQueries = selectedTagIds.map((id) => `tag:${id}`);
          if (tagMatchMode === "all") {
            // All tags must match: AND them together
            searchQuery = `${searchQuery} ${tagQueries.join(" ")}`;
          } else {
            // Any tag can match: OR them together (wrap in parens)
            searchQuery = `${searchQuery} (${tagQueries.join(" OR ")})`;
          }
        }

        const response = await paperlessAPI.search(searchQuery, 15);
        setResults(response.results);
        setSelectedIndex(0);
        setSelectedResults(new Set());
      } catch (error) {
        setSearchError("Search failed");
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, searchMode, selectedTagIds, tagMatchMode]);

  // Generate unique ID for exercise items
  const generateId = () => `ex-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Build print stamp info
  const buildStampInfo = useCallback((): PrintStampInfo => {
    const sessionDate = new Date(session.session_date + "T00:00:00");
    return {
      location: session.location,
      schoolStudentId: session.school_student_id,
      studentName: session.student_name,
      sessionDate: sessionDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      sessionTime: session.time_slot,
    };
  }, [session]);

  // Handle file selection (add to exercises)
  const handleSelectFile = useCallback((path: string, title?: string, docId?: number) => {
    const newExercise: ZenExerciseItem = {
      id: generateId(),
      pdf_name: path,
      page_mode: "simple",
      page_start: "",
      page_end: "",
      custom_pages: "",
    };
    setExercises((prev) => [...prev, newExercise]);
    setActiveExerciseIndex(exercises.length);
    setFocusArea("exercises");
    setStatusMessage(`Added: ${getFileName(path)}`);

    // Add to recent documents
    if (docId && title) {
      addRecentDocument({
        id: docId,
        title,
        path,
        tags: [],
      });
      setRecentDocs(getRecentDocuments());
    }
  }, [exercises.length]);

  // Handle multi-select add
  const handleAddSelectedFiles = useCallback(() => {
    if (selectedResults.size === 0) return;

    const newExercises: ZenExerciseItem[] = [];
    selectedResults.forEach((idx) => {
      const doc = results[idx];
      if (doc) {
        const path = doc.original_path || doc.converted_path || "";
        newExercises.push({
          id: generateId(),
          pdf_name: path,
          page_mode: "simple",
          page_start: "",
          page_end: "",
          custom_pages: "",
        });

        // Add to recent
        addRecentDocument({
          id: doc.id,
          title: doc.title,
          path,
          tags: [],
        });
      }
    });

    setExercises((prev) => [...prev, ...newExercises]);
    setActiveExerciseIndex(exercises.length);
    setSelectedResults(new Set());
    setMultiSelectMode(false);
    setFocusArea("exercises");
    setStatusMessage(`Added ${newExercises.length} files`);
    setRecentDocs(getRecentDocuments());
  }, [selectedResults, results, exercises.length]);

  // Delete exercise row
  const handleDeleteExercise = useCallback((index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index));
    setActiveExerciseIndex((prev) => Math.max(0, Math.min(prev, exercises.length - 2)));
    setStatusMessage("Removed exercise");
  }, [exercises.length]);

  // Update exercise field
  const updateExercise = useCallback((index: number, field: keyof ZenExerciseItem, value: string) => {
    setExercises((prev) =>
      prev.map((ex, i) => (i === index ? { ...ex, [field]: value } : ex))
    );
  }, []);

  // Handle assign
  const handleAssign = useCallback(async () => {
    if (exercises.length === 0) {
      setStatusMessage("No exercises to assign");
      return;
    }

    setIsAssigning(true);
    try {
      const exercisesToSave = exercises.map((ex) => ({
        exercise_type: exerciseType,
        pdf_name: ex.pdf_name,
        page_start: ex.page_mode === "simple" && ex.page_start ? parseInt(ex.page_start, 10) : null,
        page_end: ex.page_mode === "simple" && ex.page_end ? parseInt(ex.page_end, 10) : null,
        remarks: ex.page_mode === "custom" && ex.custom_pages ? `Pages: ${ex.custom_pages}` : null,
      }));

      const updatedSession = await sessionsAPI.saveExercises(
        session.id,
        exerciseType,
        exercisesToSave
      );
      updateSessionInCache(updatedSession);
      setStatusMessage(`Assigned ${exercises.length} exercise(s)!`);
      onAssigned?.();
      setTimeout(onClose, 500);
    } catch (error) {
      setStatusMessage("Failed to assign");
      setIsAssigning(false);
    }
  }, [exercises, session.id, exerciseType, onAssigned, onClose]);

  // Handle open file
  const handleOpenFile = useCallback(async (path?: string) => {
    const filePath = path || exercises[activeExerciseIndex]?.pdf_name;
    if (!filePath) return;
    const error = await openFileFromPath(filePath);
    if (error) {
      setStatusMessage(`Failed to open: ${error}`);
    } else {
      setStatusMessage("Opening PDF...");
    }
  }, [exercises, activeExerciseIndex]);

  // Handle print single file
  const handlePrintFile = useCallback(async (path?: string) => {
    const ex = path ? exercises.find((e) => e.pdf_name === path) : exercises[activeExerciseIndex];
    if (!ex) return;
    const stamp = buildStampInfo();
    const start = ex.page_mode === "simple" && ex.page_start ? parseInt(ex.page_start, 10) : undefined;
    const end = ex.page_mode === "simple" && ex.page_end ? parseInt(ex.page_end, 10) : undefined;
    const complex = ex.page_mode === "custom" ? ex.custom_pages : undefined;

    const error = await printFileFromPathWithPages(ex.pdf_name, start, end, complex, stamp);
    if (error) {
      setStatusMessage(`Failed to print: ${error}`);
    } else {
      setStatusMessage("Printing...");
    }
  }, [exercises, activeExerciseIndex, buildStampInfo]);

  // Handle batch print all
  const handleBatchPrint = useCallback(async () => {
    if (exercises.length === 0) {
      setStatusMessage("No exercises to print");
      return;
    }

    const stamp = buildStampInfo();
    const items: BulkPrintExercise[] = exercises.map((ex) => ({
      pdf_name: ex.pdf_name,
      page_start: ex.page_mode === "simple" && ex.page_start ? ex.page_start : undefined,
      page_end: ex.page_mode === "simple" && ex.page_end ? ex.page_end : undefined,
      complex_pages: ex.page_mode === "custom" ? ex.custom_pages : undefined,
    }));

    setStatusMessage(`Printing ${exercises.length} files...`);
    const error = await printBulkFiles(items, stamp);
    if (error) {
      setStatusMessage(`Batch print failed: ${error}`);
    } else {
      setStatusMessage("Batch print sent!");
    }
  }, [exercises, buildStampInfo]);

  // Preview trending item - checks Shelv for file existence first
  const handlePreviewTrending = useCallback(async (item: { filename: string; path: string }) => {
    // Check cache first
    const cachedDoc = previewableTrending.get(item.filename);
    if (cachedDoc) {
      setPreviewDoc({ id: cachedDoc.id, title: cachedDoc.title, path: cachedDoc.original_path || cachedDoc.converted_path || "" });
      return;
    }

    // Already marked as unavailable
    if (unavailableTrending.has(item.filename)) return;

    // Already checking
    if (checkingPreview.has(item.filename)) return;

    // Start checking
    setCheckingPreview(prev => { const next = new Set(prev); next.add(item.filename); return next; });

    try {
      const response = await paperlessAPI.search(item.path, 3, "all");
      if (response.results.length > 0) {
        const doc = response.results[0];
        setPreviewableTrending(prev => new Map(prev).set(item.filename, doc));
        setPreviewDoc({ id: doc.id, title: doc.title, path: doc.original_path || doc.converted_path || "" });
      } else {
        setUnavailableTrending(prev => { const next = new Set(prev); next.add(item.filename); return next; });
      }
    } catch {
      setUnavailableTrending(prev => { const next = new Set(prev); next.add(item.filename); return next; });
    } finally {
      setCheckingPreview(prev => { const next = new Set(prev); next.delete(item.filename); return next; });
    }
  }, [previewableTrending, unavailableTrending, checkingPreview]);

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInInput = document.activeElement?.tagName === "INPUT";

      // Block ALL navigation-related keys when this modal is open
      // This prevents ZenLayout and ZenSessionList from handling these keys
      // Must be at the top to catch keys before any conditional returns
      // NOTE: We ALWAYS block these keys, even when typing in input.
      // stopImmediatePropagation only blocks other listeners, NOT the character being typed.
      const navigationKeys = ['j', 'k', 'c', 's', 'n', 'r', 'd', 'ArrowUp', 'ArrowDown'];
      if (navigationKeys.includes(e.key)) {
        e.stopImmediatePropagation();
        // Don't return - let the handler below process the key
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (showTagDropdown) {
          setShowTagDropdown(false);
        } else if (showFoldersDropdown) {
          setShowFoldersDropdown(false);
        } else if (previewDoc) {
          setPreviewDoc(null);
        } else {
          onClose();
        }
        return;
      }

      if (e.key === "Tab" && !e.ctrlKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const areas: FocusArea[] = ["search", "results", "exercises", "pages"];
        const validAreas = exercises.length > 0 ? areas : areas.filter((a) => a !== "exercises" && a !== "pages");
        const currentIdx = validAreas.indexOf(focusArea);
        if (e.shiftKey) {
          setFocusArea(validAreas[(currentIdx - 1 + validAreas.length) % validAreas.length]);
        } else {
          setFocusArea(validAreas[(currentIdx + 1) % validAreas.length]);
        }
        return;
      }

      // Add exercise: a or +
      if ((e.key === "a" || e.key === "+") && !isInInput && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        // Add empty exercise row for manual entry
        const newExercise: ZenExerciseItem = {
          id: generateId(),
          pdf_name: "",
          page_mode: "simple",
          page_start: "",
          page_end: "",
          custom_pages: "",
        };
        setExercises((prev) => [...prev, newExercise]);
        setActiveExerciseIndex(exercises.length);
        setFocusArea("exercises");
        return;
      }

      // Delete exercise: d or -
      if ((e.key === "d" || e.key === "-") && !isInInput && focusArea === "exercises" && exercises.length > 0) {
        e.preventDefault();
        handleDeleteExercise(activeExerciseIndex);
        return;
      }

      // Navigate between exercise rows: Ctrl+j/k
      if (e.ctrlKey && (e.key === "j" || e.key === "k") && exercises.length > 0) {
        e.preventDefault();
        if (e.key === "j") {
          setActiveExerciseIndex((prev) => Math.min(prev + 1, exercises.length - 1));
        } else {
          setActiveExerciseIndex((prev) => Math.max(prev - 1, 0));
        }
        setFocusArea("exercises");
        return;
      }

      // Toggle multi-select mode: Ctrl+m
      if (e.ctrlKey && e.key === "m") {
        e.preventDefault();
        setMultiSelectMode((prev) => !prev);
        setSelectedResults(new Set());
        setStatusMessage(multiSelectMode ? "Multi-select off" : "Multi-select on");
        return;
      }

      // Toggle selection in multi-select: Space
      if (e.key === " " && focusArea === "results" && multiSelectMode) {
        e.preventDefault();
        setSelectedResults((prev) => {
          const newSet = new Set(prev);
          if (newSet.has(selectedIndex)) {
            newSet.delete(selectedIndex);
          } else {
            newSet.add(selectedIndex);
          }
          return newSet;
        });
        return;
      }

      // Search mode shortcuts: Ctrl+1/2/3
      if (e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === "1") {
          e.preventDefault();
          setSearchMode("all");
          setStatusMessage("Search mode: All");
          return;
        }
        if (e.key === "2") {
          e.preventDefault();
          setSearchMode("title");
          setStatusMessage("Search mode: Title only");
          return;
        }
        if (e.key === "3") {
          e.preventDefault();
          setSearchMode("content");
          setStatusMessage("Search mode: Content only");
          return;
        }
      }

      // Toggle tag dropdown: t
      if (e.key === "t" && !isInInput && !e.ctrlKey) {
        e.preventDefault();
        setShowTagDropdown((prev) => !prev);
        setTagCursorIndex(0);
        return;
      }

      // Tag dropdown navigation when open
      if (showTagDropdown && availableTags.length > 0) {
        if (e.key === "ArrowDown" || (e.key === "j" && !isInInput)) {
          e.preventDefault();
          setTagCursorIndex((prev) => Math.min(prev + 1, availableTags.length - 1));
          return;
        }
        if (e.key === "ArrowUp" || (e.key === "k" && !isInInput)) {
          e.preventDefault();
          setTagCursorIndex((prev) => Math.max(prev - 1, 0));
          return;
        }
        // Space to toggle tag selection
        if (e.key === " " && !isInInput) {
          e.preventDefault();
          const tagId = availableTags[tagCursorIndex]?.id;
          if (tagId !== undefined) {
            setSelectedTagIds((prev) =>
              prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
            );
          }
          return;
        }
        // M to toggle match mode
        if (e.key === "m" && !isInInput) {
          e.preventDefault();
          setTagMatchMode((prev) => (prev === "all" ? "any" : "all"));
          return;
        }
        // Enter to confirm tag selection
        if (e.key === "Enter" && !isInInput) {
          e.preventDefault();
          setShowTagDropdown(false);
          return;
        }
      }

      // Toggle local folders dropdown: b
      if (e.key === "b" && !isInInput && !e.ctrlKey && !showTagDropdown) {
        e.preventDefault();
        setShowFoldersDropdown((prev) => !prev);
        setFolderCursorIndex(0);
        return;
      }

      // Local folders dropdown navigation when open
      if (showFoldersDropdown) {
        if (e.key === "ArrowDown" || (e.key === "j" && !isInInput)) {
          e.preventDefault();
          // +1 for "Add new folder" option
          setFolderCursorIndex((prev) => Math.min(prev + 1, savedFolders.length));
          return;
        }
        if (e.key === "ArrowUp" || (e.key === "k" && !isInInput)) {
          e.preventDefault();
          setFolderCursorIndex((prev) => Math.max(prev - 1, 0));
          return;
        }
        // Enter to select folder
        if (e.key === "Enter" && !isInInput) {
          e.preventDefault();
          if (folderCursorIndex < savedFolders.length) {
            handlePickFromFolder(savedFolders[folderCursorIndex]);
          } else {
            handleAddNewFolder();
          }
          return;
        }
        // Escape to close
        if (e.key === "Escape") {
          e.preventDefault();
          setShowFoldersDropdown(false);
          return;
        }
        // Number keys for quick select (1-9)
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 9) {
          e.preventDefault();
          const idx = num - 1;
          if (idx < savedFolders.length) {
            handlePickFromFolder(savedFolders[idx]);
          }
          return;
        }
      }

      // Expand usage details: i (outside navigation block so it works even when search input focused)
      if (e.key === "i" && !isInInput && !query.trim() && topTrending.length > 0) {
        e.preventDefault();
        // Calculate actual trending index by subtracting recent docs offset
        const recentOffset = recentDocs.length > 0 ? Math.min(recentDocs.length, 5) : 0;
        const trendingIndex = selectedIndex - recentOffset;
        if (trendingIndex >= 0 && trendingIndex < topTrending.length) {
          const item = topTrending[trendingIndex];
          setExpandedTrending((prev) => (prev === item.filename ? null : item.filename));
        }
        return;
      }

      // Navigation in results
      if (focusArea === "results" || (focusArea === "search" && !isInInput)) {
        if (e.key === "ArrowDown" || e.key === "j") {
          e.preventDefault();
          const maxIndex = query.trim() ? results.length - 1 : (recentDocs.length > 0 ? recentDocs.length - 1 : topTrending.length - 1);
          setSelectedIndex((prev) => Math.min(prev + 1, maxIndex));
          return;
        }
        if (e.key === "ArrowUp" || e.key === "k") {
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === "Enter" && focusArea === "results") {
          e.preventDefault();
          if (multiSelectMode && selectedResults.size > 0) {
            handleAddSelectedFiles();
          } else {
            // Select from appropriate list
            if (query.trim()) {
              const doc = results[selectedIndex];
              if (doc) {
                const path = doc.original_path || doc.converted_path || "";
                handleSelectFile(path, doc.title, doc.id);
              }
            } else if (recentDocs.length > 0) {
              const doc = recentDocs[selectedIndex];
              if (doc) {
                handleSelectFile(doc.path, doc.title, doc.id);
              }
            } else {
              const item = topTrending[selectedIndex];
              if (item) {
                handleSelectFile(item.path, item.filename);
              }
            }
          }
          return;
        }

        // Preview PDF: v
        if (e.key === "v" && !isInInput) {
          e.preventDefault();
          // Get the currently selected document
          if (query.trim() && results[selectedIndex]) {
            const doc = results[selectedIndex];
            setPreviewDoc({
              id: doc.id,
              title: doc.title,
              path: doc.original_path || doc.converted_path || "",
            });
          } else if (!query.trim() && recentDocs.length > 0 && selectedIndex < recentDocs.slice(0, 5).length) {
            const doc = recentDocs[selectedIndex];
            setPreviewDoc({
              id: doc.id,
              title: doc.title,
              path: doc.path,
            });
          } else if (!query.trim() && recentDocs.length === 0 && topTrending.length > 0) {
            // Preview trending item - needs Shelv file existence check
            const trendingIdx = selectedIndex;
            if (trendingIdx >= 0 && trendingIdx < topTrending.length) {
              handlePreviewTrending(topTrending[trendingIdx]);
            }
          }
          return;
        }
      }

      // Clear recent: c in results area when showing recent
      if (e.key === "c" && !isInInput && focusArea === "results" && !query.trim() && recentDocs.length > 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        clearRecentDocuments();
        setRecentDocs([]);
        setStatusMessage("Recent documents cleared");
        return;
      }

      // Actions when exercises exist
      if (exercises.length > 0) {
        if (e.key === "o" && !isInInput) {
          e.preventDefault();
          handleOpenFile();
          return;
        }
        if (e.key === "p" && !isInInput && !e.shiftKey) {
          e.preventDefault();
          handlePrintFile();
          return;
        }
        if (e.key === "P" && !isInInput) {
          e.preventDefault();
          handleBatchPrint();
          return;
        }
        if ((e.key === "Enter" && focusArea === "pages") || (e.metaKey && e.key === "Enter")) {
          e.preventDefault();
          handleAssign();
          return;
        }
      }
    };

    // Use capture phase so this handler fires BEFORE ZenLayout's bubble phase handler
    // This allows stopImmediatePropagation() to actually block parent handlers
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [
    focusArea, results, recentDocs, topTrending, selectedIndex, exercises, activeExerciseIndex,
    multiSelectMode, selectedResults, query, showTagDropdown, availableTags, tagCursorIndex,
    showFoldersDropdown, savedFolders, folderCursorIndex,
    onClose, handleSelectFile, handleAddSelectedFiles, handleDeleteExercise, handleOpenFile,
    handlePrintFile, handleBatchPrint, handleAssign, handlePickFromFolder, handleAddNewFolder,
    handlePreviewTrending,
  ]);

  // Focus management
  useEffect(() => {
    if (focusArea === "search") {
      searchInputRef.current?.focus();
    } else {
      // Blur search input to ensure keyboard shortcuts work
      searchInputRef.current?.blur();
    }
  }, [focusArea]);

  // Auto-scroll selected item into view when navigating with j/k
  useEffect(() => {
    const container = resultsContainerRef.current;
    if (!container) return;

    const selectedElement = container.querySelector('[data-selected="true"]');
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  const isCW = exerciseType === "CW";
  const title = isCW ? "CLASSWORK" : "HOMEWORK";

  return (
    <div
      style={{
        margin: "8px 0",
        padding: "12px",
        border: `1px solid var(--zen-accent)`,
        backgroundColor: "var(--zen-bg)",
        boxShadow: "0 0 10px var(--zen-accent)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
          paddingBottom: "8px",
          borderBottom: "1px solid var(--zen-border)",
        }}
      >
        <span
          style={{
            color: isCW ? "var(--zen-error)" : "var(--zen-accent)",
            fontWeight: "bold",
          }}
        >
          ASSIGN {title}
        </span>
        <span style={{ color: "var(--zen-dim)", fontSize: "10px" }}>
          Tab navigate • Ctrl+m multi-select • Esc cancel
        </span>
      </div>

      {/* Search Box with Mode */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "8px",
        }}
      >
        <span style={{ color: "var(--zen-dim)", fontSize: "12px" }}>Search:</span>
        <input
          ref={searchInputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocusArea("search")}
          placeholder="Search Shelv..."
          style={{
            flex: 1,
            backgroundColor: "var(--zen-bg)",
            border: `1px solid ${focusArea === "search" ? "var(--zen-accent)" : "var(--zen-border)"}`,
            color: "var(--zen-fg)",
            padding: "6px 10px",
            fontFamily: "inherit",
            fontSize: "12px",
            outline: "none",
            boxShadow: focusArea === "search" ? "0 0 5px var(--zen-accent)" : "none",
          }}
        />
        <span style={{ color: "var(--zen-dim)", fontSize: "10px" }}>
          Mode:
        </span>
        {(["all", "title", "content"] as SearchMode[]).map((mode, i) => (
          <button
            key={mode}
            onClick={() => setSearchMode(mode)}
            style={{
              padding: "2px 6px",
              backgroundColor: searchMode === mode ? "var(--zen-accent)" : "transparent",
              border: `1px solid ${searchMode === mode ? "var(--zen-accent)" : "var(--zen-border)"}`,
              color: searchMode === mode ? "var(--zen-bg)" : "var(--zen-dim)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "10px",
            }}
            title={`Ctrl+${i + 1}`}
          >
            {mode.charAt(0).toUpperCase()}
          </button>
        ))}
        {isSearching && (
          <span style={{ color: "var(--zen-dim)", fontSize: "11px" }}>...</span>
        )}
        {/* Tag filter button */}
        <button
          onClick={() => {
            setShowTagDropdown((prev) => !prev);
            setTagCursorIndex(0);
          }}
          style={{
            padding: "2px 6px",
            backgroundColor: selectedTagIds.length > 0 ? "var(--zen-accent)" : "transparent",
            border: `1px solid ${selectedTagIds.length > 0 ? "var(--zen-accent)" : "var(--zen-border)"}`,
            color: selectedTagIds.length > 0 ? "var(--zen-bg)" : "var(--zen-dim)",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "10px",
          }}
          title="[T]ags"
        >
          {selectedTagIds.length > 0 ? `T(${selectedTagIds.length})` : "T"}
        </button>
      </div>

      {/* Tag Dropdown */}
      {showTagDropdown && (
        <div
          style={{
            marginBottom: "8px",
            padding: "8px",
            border: "1px solid var(--zen-accent)",
            backgroundColor: "var(--zen-bg)",
            maxHeight: "180px",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "8px",
              paddingBottom: "4px",
              borderBottom: "1px solid var(--zen-border)",
            }}
          >
            <span style={{ color: "var(--zen-fg)", fontSize: "11px" }}>
              Tags: {selectedTagIds.length > 0 ? `[${selectedTagIds.length} selected]` : "[none]"}
            </span>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span style={{ color: "var(--zen-dim)", fontSize: "10px" }}>Match:</span>
              <button
                onClick={() => setTagMatchMode("all")}
                style={{
                  padding: "1px 4px",
                  backgroundColor: tagMatchMode === "all" ? "var(--zen-accent)" : "transparent",
                  border: `1px solid ${tagMatchMode === "all" ? "var(--zen-accent)" : "var(--zen-border)"}`,
                  color: tagMatchMode === "all" ? "var(--zen-bg)" : "var(--zen-dim)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "9px",
                }}
              >
                [A]ll
              </button>
              <button
                onClick={() => setTagMatchMode("any")}
                style={{
                  padding: "1px 4px",
                  backgroundColor: tagMatchMode === "any" ? "var(--zen-accent)" : "transparent",
                  border: `1px solid ${tagMatchMode === "any" ? "var(--zen-accent)" : "var(--zen-border)"}`,
                  color: tagMatchMode === "any" ? "var(--zen-bg)" : "var(--zen-dim)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "9px",
                }}
              >
                a[N]y
              </button>
              {selectedTagIds.length > 0 && (
                <button
                  onClick={() => setSelectedTagIds([])}
                  style={{
                    padding: "1px 4px",
                    backgroundColor: "transparent",
                    border: "1px solid var(--zen-error)",
                    color: "var(--zen-error)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: "9px",
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <div style={{ fontSize: "10px", color: "var(--zen-dim)", marginBottom: "4px" }}>
            ↑↓ navigate • Space toggle • [M] match mode • Enter confirm
          </div>
          {availableTags.length === 0 ? (
            <div style={{ color: "var(--zen-dim)", fontSize: "11px", padding: "4px 0" }}>
              No tags available
            </div>
          ) : (
            availableTags.map((tag, idx) => {
              const isSelected = selectedTagIds.includes(tag.id);
              const isCursor = idx === tagCursorIndex;
              return (
                <div
                  key={tag.id}
                  onClick={() => {
                    setSelectedTagIds((prev) =>
                      prev.includes(tag.id) ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]
                    );
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "2px 4px",
                    cursor: "pointer",
                    backgroundColor: isCursor ? "var(--zen-selection)" : "transparent",
                    borderLeft: isCursor ? "2px solid var(--zen-accent)" : "2px solid transparent",
                  }}
                >
                  <span style={{ color: isSelected ? "var(--zen-accent)" : "var(--zen-dim)", fontSize: "11px" }}>
                    {isSelected ? "[x]" : "[ ]"}
                  </span>
                  <span
                    style={{
                      color: isSelected ? "var(--zen-fg)" : "var(--zen-dim)",
                      fontSize: "11px",
                    }}
                  >
                    {tag.name}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Local Folders Dropdown */}
      {showFoldersDropdown && (
        <div
          style={{
            marginBottom: "8px",
            padding: "8px",
            border: "1px solid var(--zen-accent)",
            backgroundColor: "var(--zen-bg)",
            maxHeight: "180px",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "8px",
              paddingBottom: "4px",
              borderBottom: "1px solid var(--zen-border)",
            }}
          >
            <span style={{ color: "var(--zen-fg)", fontSize: "11px" }}>
              LOCAL FOLDERS
            </span>
            <span style={{ color: "var(--zen-dim)", fontSize: "10px" }}>
              1-9 quick select
            </span>
          </div>
          <div style={{ fontSize: "10px", color: "var(--zen-dim)", marginBottom: "4px" }}>
            ↑↓ navigate • Enter select • Esc close
          </div>
          {savedFolders.length === 0 ? (
            <div style={{ color: "var(--zen-dim)", fontSize: "11px", padding: "4px 0" }}>
              No folders configured
            </div>
          ) : (
            savedFolders.map((folder, idx) => {
              const isCursor = idx === folderCursorIndex;
              return (
                <div
                  key={folder.id}
                  onClick={() => handlePickFromFolder(folder)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "2px 4px",
                    cursor: "pointer",
                    backgroundColor: isCursor ? "var(--zen-selection)" : "transparent",
                    borderLeft: isCursor ? "2px solid var(--zen-accent)" : "2px solid transparent",
                  }}
                >
                  <span style={{ color: "var(--zen-accent)", fontSize: "11px", minWidth: "16px" }}>
                    {idx + 1}.
                  </span>
                  <span
                    style={{
                      color: "var(--zen-fg)",
                      fontSize: "11px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {folder.name}
                  </span>
                </div>
              );
            })
          )}
          {/* Add new folder option */}
          <div
            onClick={handleAddNewFolder}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "2px 4px",
              cursor: "pointer",
              backgroundColor: folderCursorIndex === savedFolders.length ? "var(--zen-selection)" : "transparent",
              borderLeft: folderCursorIndex === savedFolders.length ? "2px solid var(--zen-accent)" : "2px solid transparent",
              marginTop: "4px",
              borderTop: "1px solid var(--zen-border)",
              paddingTop: "6px",
            }}
          >
            <span style={{ color: "var(--zen-accent)", fontSize: "11px" }}>+</span>
            <span style={{ color: "var(--zen-dim)", fontSize: "11px" }}>
              Browse new folder...
            </span>
          </div>
        </div>
      )}

      {/* Results / Recent / Trending */}
      <div
        ref={resultsContainerRef}
        onClick={() => setFocusArea("results")}
        style={{
          border: `1px solid ${focusArea === "results" ? "var(--zen-accent)" : "var(--zen-border)"}`,
          borderRadius: "2px",
          maxHeight: "180px",
          overflowY: "auto",
          marginBottom: "12px",
        }}
      >
        {/* Search Results */}
        {query.trim() ? (
          <>
            <div
              style={{
                padding: "4px 8px",
                backgroundColor: "var(--zen-selection)",
                borderBottom: "1px solid var(--zen-border)",
                fontSize: "11px",
                color: "var(--zen-dim)",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>Search Results ({results.length})</span>
              {multiSelectMode && selectedResults.size > 0 && (
                <span style={{ color: "var(--zen-accent)" }}>
                  {selectedResults.size} selected
                </span>
              )}
            </div>
            {searchError && (
              <div style={{ padding: "8px", color: "var(--zen-error)", fontSize: "12px" }}>
                {searchError}
              </div>
            )}
            {!searchError && results.length === 0 && (
              <div style={{ padding: "8px", color: "var(--zen-dim)", fontSize: "12px" }}>
                No results found
              </div>
            )}
            {results.map((doc, idx) => (
              <ResultRow
                key={doc.id}
                name={doc.title}
                path={doc.original_path || doc.converted_path || ""}
                isSelected={idx === selectedIndex}
                isMultiSelected={selectedResults.has(idx)}
                multiSelectMode={multiSelectMode}
                onClick={() => {
                  setSelectedIndex(idx);
                  if (!multiSelectMode) {
                    handleSelectFile(
                      doc.original_path || doc.converted_path || "",
                      doc.title,
                      doc.id
                    );
                  }
                }}
              />
            ))}
          </>
        ) : (
          <>
            {/* Recent Documents */}
            {recentDocs.length > 0 && (
              <>
                <div
                  style={{
                    padding: "4px 8px",
                    backgroundColor: "var(--zen-selection)",
                    borderBottom: "1px solid var(--zen-border)",
                    fontSize: "11px",
                    color: "var(--zen-dim)",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>RECENTLY USED</span>
                  <span style={{ color: "var(--zen-dim)" }}>[C] clear</span>
                </div>
                {recentDocs.slice(0, 5).map((doc, idx) => (
                  <ResultRow
                    key={doc.id}
                    name={doc.title}
                    path={doc.path}
                    subtitle={formatTimeAgo(doc.usedAt)}
                    isSelected={idx === selectedIndex}
                    onClick={() => {
                      setSelectedIndex(idx);
                      handleSelectFile(doc.path, doc.title, doc.id);
                    }}
                  />
                ))}
              </>
            )}

            {/* Trending */}
            <div
              style={{
                padding: "4px 8px",
                backgroundColor: "var(--zen-selection)",
                borderBottom: "1px solid var(--zen-border)",
                fontSize: "11px",
                color: "var(--zen-dim)",
              }}
            >
              TRENDING FOR {session.grade || "ALL"}
              {session.school ? ` - ${session.school}` : ""}
            </div>
            {trendingLoading && (
              <div style={{ padding: "8px", color: "var(--zen-dim)", fontSize: "12px" }}>
                Loading...
              </div>
            )}
            {!trendingLoading && topTrending.length === 0 && (
              <div style={{ padding: "8px", color: "var(--zen-dim)", fontSize: "12px" }}>
                No trending files
              </div>
            )}
            {topTrending.map((item, idx) => {
              const adjustedIdx = recentDocs.length > 0 ? idx + recentDocs.slice(0, 5).length : idx;
              const isExpanded = expandedTrending === item.filename;
              // Determine preview status for this trending item
              const itemPreviewStatus = checkingPreview.has(item.filename)
                ? "checking"
                : unavailableTrending.has(item.filename)
                  ? "unavailable"
                  : previewableTrending.has(item.filename)
                    ? "available"
                    : undefined;
              return (
                <div key={item.filename}>
                  <ResultRow
                    name={item.filename}
                    path={item.path}
                    subtitle={`${item.assignment_count} uses`}
                    isSelected={adjustedIdx === selectedIndex}
                    onClick={() => {
                      setSelectedIndex(adjustedIdx);
                      handleSelectFile(item.path, item.filename);
                    }}
                    onExpand={() =>
                      setExpandedTrending((prev) => (prev === item.filename ? null : item.filename))
                    }
                    expandable
                    expanded={isExpanded}
                    previewStatus={itemPreviewStatus}
                  />
                  {/* Usage details */}
                  {isExpanded && usageDetails && (
                    <div
                      style={{
                        padding: "4px 8px 4px 32px",
                        fontSize: "10px",
                        color: "var(--zen-dim)",
                        backgroundColor: "rgba(0,0,0,0.2)",
                      }}
                    >
                      {usageDetails.slice(0, 3).map((usage, i) => (
                        <div key={i} style={{ marginBottom: "2px" }}>
                          {usage.session_date} • {usage.school_student_id} • {usage.student_name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Exercises Table */}
      {exercises.length > 0 && (
        <div
          style={{
            marginBottom: "12px",
            border: `1px solid ${focusArea === "exercises" || focusArea === "pages" ? "var(--zen-accent)" : "var(--zen-border)"}`,
          }}
          onClick={() => setFocusArea("exercises")}
        >
          <div
            style={{
              padding: "4px 8px",
              backgroundColor: "var(--zen-selection)",
              borderBottom: "1px solid var(--zen-border)",
              fontSize: "11px",
              color: "var(--zen-dim)",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>EXERCISES ({exercises.length})</span>
            <span>[A]dd [D]elete • Ctrl+j/k navigate</span>
          </div>
          {exercises.map((ex, idx) => (
            <ExerciseRow
              key={ex.id}
              exercise={ex}
              index={idx}
              isActive={idx === activeExerciseIndex}
              onUpdate={(field, value) => updateExercise(idx, field, value)}
              onDelete={() => handleDeleteExercise(idx)}
              onFocus={() => {
                setActiveExerciseIndex(idx);
                setFocusArea("pages");
              }}
            />
          ))}
        </div>
      )}

      {/* Status Message */}
      {statusMessage && (
        <div
          style={{
            padding: "4px 8px",
            backgroundColor: "var(--zen-selection)",
            color: "var(--zen-fg)",
            fontSize: "11px",
            marginBottom: "8px",
          }}
        >
          {statusMessage}
        </div>
      )}

      {/* Action Buttons */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: "8px",
          borderTop: "1px solid var(--zen-border)",
        }}
      >
        <span style={{ color: "var(--zen-dim)", fontSize: "10px" }}>
          ↑↓/jk • [V]iew • [T]ags • [B]rowse • [O]pen • [P]rint
        </span>
        <div style={{ display: "flex", gap: "8px" }}>
          {exercises.length > 0 && (
            <>
              <ActionBtn label="[O]pen" onClick={() => handleOpenFile()} />
              <ActionBtn label="[P]rint" onClick={() => handlePrintFile()} />
              {exercises.length > 1 && (
                <ActionBtn label="[Shift+P] All" onClick={handleBatchPrint} />
              )}
            </>
          )}
          <ActionBtn label="Cancel" onClick={onClose} color="dim" />
          <ActionBtn
            label={isAssigning ? "..." : `Assign (${exercises.length})`}
            onClick={handleAssign}
            color="accent"
            disabled={exercises.length === 0 || isAssigning}
          />
        </div>
      </div>

      {/* PDF Preview Modal */}
      {previewDoc && (
        <ZenPdfPreview
          documentId={previewDoc.id}
          documentTitle={previewDoc.title}
          onClose={() => setPreviewDoc(null)}
          onSelect={(pageStart, pageEnd, complexPages) => {
            // Add selected document as exercise
            const newExercise: ZenExerciseItem = {
              id: generateId(),
              pdf_name: previewDoc.path,
              page_mode: complexPages ? "custom" : "simple",
              page_start: pageStart?.toString() || "",
              page_end: pageEnd?.toString() || "",
              custom_pages: complexPages || "",
            };
            setExercises((prev) => [...prev, newExercise]);
            setActiveExerciseIndex(exercises.length);
            setFocusArea("exercises");
            setStatusMessage(`Added: ${getFileName(previewDoc.path)}`);

            // Add to recent documents
            addRecentDocument({
              id: previewDoc.id,
              title: previewDoc.title,
              path: previewDoc.path,
              tags: [],
            });
            setRecentDocs(getRecentDocuments());

            setPreviewDoc(null);
          }}
        />
      )}
    </div>
  );
}

function ResultRow({
  name,
  path,
  subtitle,
  isSelected,
  isMultiSelected,
  multiSelectMode,
  onClick,
  onExpand,
  expandable,
  expanded,
  previewStatus,
}: {
  name: string;
  path: string;
  subtitle?: string;
  isSelected: boolean;
  isMultiSelected?: boolean;
  multiSelectMode?: boolean;
  onClick: () => void;
  onExpand?: () => void;
  expandable?: boolean;
  expanded?: boolean;
  previewStatus?: "checking" | "unavailable" | "available";
}) {
  return (
    <div
      onClick={onClick}
      data-selected={isSelected}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "4px 8px",
        cursor: "pointer",
        backgroundColor: isSelected ? "var(--zen-selection)" : "transparent",
        borderLeft: isSelected ? "2px solid var(--zen-accent)" : "2px solid transparent",
      }}
    >
      <span
        style={{
          width: "16px",
          color: isSelected ? "var(--zen-accent)" : "transparent",
          textShadow: isSelected ? "var(--zen-glow)" : "none",
        }}
      >
        {multiSelectMode ? (isMultiSelected ? "[x]" : "[ ]") : isSelected ? ">" : " "}
      </span>
      <span
        style={{
          flex: 1,
          color: "var(--zen-fg)",
          fontSize: "12px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={path}
      >
        {name}
      </span>
      {subtitle && (
        <span style={{ color: "var(--zen-dim)", fontSize: "10px" }}>{subtitle}</span>
      )}
      {previewStatus && (
        <span
          style={{
            fontSize: "10px",
            color: previewStatus === "unavailable" ? "var(--zen-error, #f87171)" : "var(--zen-dim)",
          }}
          title={
            previewStatus === "checking"
              ? "Checking Shelv..."
              : previewStatus === "unavailable"
                ? "Not found in Shelv"
                : "Available for preview"
          }
        >
          {previewStatus === "checking" ? "⋯" : previewStatus === "unavailable" ? "✕" : ""}
        </span>
      )}
      {expandable && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onExpand?.();
          }}
          style={{
            padding: "0 4px",
            backgroundColor: "transparent",
            border: "none",
            color: "var(--zen-dim)",
            cursor: "pointer",
            fontSize: "10px",
          }}
        >
          {expanded ? "▼" : "▶"}
        </button>
      )}
    </div>
  );
}

function ExerciseRow({
  exercise,
  index,
  isActive,
  onUpdate,
  onDelete,
  onFocus,
}: {
  exercise: ZenExerciseItem;
  index: number;
  isActive: boolean;
  onUpdate: (field: keyof ZenExerciseItem, value: string) => void;
  onDelete: () => void;
  onFocus: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "4px 8px",
        backgroundColor: isActive ? "var(--zen-selection)" : "transparent",
        borderLeft: isActive ? "2px solid var(--zen-accent)" : "2px solid transparent",
      }}
    >
      <span style={{ color: "var(--zen-dim)", fontSize: "10px", width: "20px" }}>
        {index + 1}.
      </span>
      <span
        style={{
          flex: 1,
          color: "var(--zen-fg)",
          fontSize: "11px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={exercise.pdf_name}
      >
        {getFileName(exercise.pdf_name) || "(empty)"}
      </span>

      {/* Page range inputs */}
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "2px", fontSize: "10px" }}>
          <input
            type="radio"
            checked={exercise.page_mode === "simple"}
            onChange={() => onUpdate("page_mode", "simple")}
            style={{ width: "12px", height: "12px" }}
          />
          <input
            type="text"
            value={exercise.page_start}
            onChange={(e) => onUpdate("page_start", e.target.value)}
            onFocus={onFocus}
            placeholder="fr"
            disabled={exercise.page_mode !== "simple"}
            style={{
              width: "30px",
              backgroundColor: "var(--zen-bg)",
              border: "1px solid var(--zen-border)",
              color: "var(--zen-fg)",
              padding: "1px 3px",
              fontFamily: "inherit",
              fontSize: "10px",
              opacity: exercise.page_mode === "simple" ? 1 : 0.5,
            }}
          />
          <span style={{ color: "var(--zen-dim)" }}>-</span>
          <input
            type="text"
            value={exercise.page_end}
            onChange={(e) => onUpdate("page_end", e.target.value)}
            onFocus={onFocus}
            placeholder="to"
            disabled={exercise.page_mode !== "simple"}
            style={{
              width: "30px",
              backgroundColor: "var(--zen-bg)",
              border: "1px solid var(--zen-border)",
              color: "var(--zen-fg)",
              padding: "1px 3px",
              fontFamily: "inherit",
              fontSize: "10px",
              opacity: exercise.page_mode === "simple" ? 1 : 0.5,
            }}
          />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "2px", fontSize: "10px" }}>
          <input
            type="radio"
            checked={exercise.page_mode === "custom"}
            onChange={() => onUpdate("page_mode", "custom")}
            style={{ width: "12px", height: "12px" }}
          />
          <input
            type="text"
            value={exercise.custom_pages}
            onChange={(e) => onUpdate("custom_pages", e.target.value)}
            onFocus={onFocus}
            placeholder="1,3,5-7"
            disabled={exercise.page_mode !== "custom"}
            style={{
              width: "60px",
              backgroundColor: "var(--zen-bg)",
              border: "1px solid var(--zen-border)",
              color: "var(--zen-fg)",
              padding: "1px 3px",
              fontFamily: "inherit",
              fontSize: "10px",
              opacity: exercise.page_mode === "custom" ? 1 : 0.5,
            }}
          />
        </label>
      </div>

      {/* Delete button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        style={{
          padding: "1px 4px",
          backgroundColor: "transparent",
          border: "1px solid var(--zen-dim)",
          color: "var(--zen-dim)",
          cursor: "pointer",
          fontSize: "9px",
        }}
        title="Delete"
      >
        ×
      </button>
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  color = "dim",
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  color?: "accent" | "dim";
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "4px 10px",
        backgroundColor: "transparent",
        border: `1px solid var(--zen-${color})`,
        color: `var(--zen-${color})`,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        fontFamily: "inherit",
        fontSize: "11px",
      }}
    >
      {label}
    </button>
  );
}

function getFileName(path: string): string {
  return path.split("/").pop() || path;
}

function formatTimeAgo(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "yesterday";
  return `${diffDays}d ago`;
}

export default ZenExerciseAssign;
