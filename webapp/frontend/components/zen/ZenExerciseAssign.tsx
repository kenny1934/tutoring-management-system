"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Session, CoursewarePopularity } from "@/types";
import { paperlessAPI, api, type PaperlessDocument, type PaperlessTag } from "@/lib/api";
import { sessionsAPI } from "@/lib/api";
import { useCoursewarePopularity, useCoursewareUsageDetail } from "@/lib/hooks";
import { updateSessionInCache } from "@/lib/session-cache";
import {
  openFileFromPathWithFallback,
  printFileFromPathWithFallback,
  printBulkFiles,
  getSavedFolders,
  pickFileFromFolder,
  addFolder,
  removeFolder,
  verifyPermission,
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
import { getPageCount } from "@/lib/pdf-utils";

interface ZenExerciseAssignProps {
  session: Session;
  exerciseType: "CW" | "HW";
  onClose: () => void;
  onAssigned?: () => void;
}

type FocusArea = "search" | "results" | "exercises" | "pages" | "browse";
type SearchMode = "all" | "title" | "content" | "advanced";

// Browser node type
interface BrowseNode {
  name: string;
  path: string;
  kind: "folder" | "file";
  handle?: FileSystemDirectoryHandle | FileSystemFileHandle;
}

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
  const [searchOffset, setSearchOffset] = useState(0);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showSearchHints, setShowSearchHints] = useState(false);

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

  // Browse mode state
  const [browseMode, setBrowseMode] = useState(false);
  const [browsePath, setBrowsePath] = useState<string[]>([]); // ["RootFolder", "SubFolder"]
  const [browseHandle, setBrowseHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [browseContents, setBrowseContents] = useState<BrowseNode[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseIndex, setBrowseIndex] = useState(0);
  const [browseError, setBrowseError] = useState<string | null>(null);
  // Browse preview state
  const [browsePreviewUrl, setBrowsePreviewUrl] = useState<string | null>(null);
  const [browsePreviewName, setBrowsePreviewName] = useState<string | null>(null);
  const [browsePreviewNode, setBrowsePreviewNode] = useState<BrowseNode | null>(null);
  // Browse preview page selection
  const [previewPageStart, setPreviewPageStart] = useState("");
  const [previewPageEnd, setPreviewPageEnd] = useState("");
  const [previewPageCount, setPreviewPageCount] = useState<number | null>(null);
  const [previewPageError, setPreviewPageError] = useState<string | null>(null);

  // Status
  const [isAssigning, setIsAssigning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Refs
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const browseContainerRef = useRef<HTMLDivElement>(null);

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

  // Enter browse mode - show root folders
  const enterBrowseMode = useCallback(async () => {
    setBrowseMode(true);
    setFocusArea("browse");
    setBrowsePath([]);
    setBrowseHandle(null);
    setBrowseIndex(0);
    setBrowseError(null);

    // Convert saved folders to browse nodes
    const nodes: BrowseNode[] = savedFolders.map((folder) => ({
      name: folder.name,
      path: folder.name,
      kind: "folder" as const,
      handle: folder.handle,
    }));
    setBrowseContents(nodes);
  }, [savedFolders]);

  // Exit browse mode
  const exitBrowseMode = useCallback(() => {
    setBrowseMode(false);
    setFocusArea("results");
    setBrowsePath([]);
    setBrowseHandle(null);
    setBrowseContents([]);
    setBrowseIndex(0);
  }, []);

  // Load folder contents
  const loadBrowseFolder = useCallback(async (handle: FileSystemDirectoryHandle, newPath: string[]) => {
    setBrowseLoading(true);
    setBrowseError(null);

    try {
      const hasPermission = await verifyPermission(handle);
      if (!hasPermission) {
        setBrowseError("Permission denied");
        setBrowseLoading(false);
        return;
      }

      const contents: BrowseNode[] = [];
      const basePath = newPath.join("\\");

      for await (const [name, entryHandle] of handle.entries()) {
        const isPdf = name.toLowerCase().endsWith(".pdf");
        const isFolder = entryHandle.kind === "directory";

        if (isFolder || isPdf) {
          contents.push({
            name,
            path: `${basePath}\\${name}`,
            kind: isFolder ? "folder" : "file",
            handle: entryHandle as FileSystemDirectoryHandle | FileSystemFileHandle,
          });
        }
      }

      // Sort: folders first, then alphabetical
      contents.sort((a, b) => {
        if (a.kind === "folder" && b.kind !== "folder") return -1;
        if (a.kind !== "folder" && b.kind === "folder") return 1;
        return a.name.localeCompare(b.name);
      });

      setBrowseContents(contents);
      setBrowsePath(newPath);
      setBrowseHandle(handle);
      setBrowseIndex(0);
    } catch (err) {
      setBrowseError("Failed to load folder");
      console.error("Browse error:", err);
    } finally {
      setBrowseLoading(false);
    }
  }, []);

  // Navigate into a folder
  const browseIntoFolder = useCallback(async (node: BrowseNode) => {
    if (node.kind !== "folder" || !node.handle) return;
    const newPath = browsePath.length === 0 ? [node.name] : [...browsePath, node.name];
    await loadBrowseFolder(node.handle as FileSystemDirectoryHandle, newPath);
  }, [browsePath, loadBrowseFolder]);

  // Navigate up one level
  const browseUp = useCallback(async () => {
    if (browsePath.length === 0) {
      // Already at root - exit browse mode
      exitBrowseMode();
      return;
    }

    if (browsePath.length === 1) {
      // Go back to root folders list
      const nodes: BrowseNode[] = savedFolders.map((folder) => ({
        name: folder.name,
        path: folder.name,
        kind: "folder" as const,
        handle: folder.handle,
      }));
      setBrowseContents(nodes);
      setBrowsePath([]);
      setBrowseHandle(null);
      setBrowseIndex(0);
      return;
    }

    // Navigate to parent folder
    const parentPath = browsePath.slice(0, -1);
    const rootFolder = savedFolders.find((f) => f.name === parentPath[0]);
    if (!rootFolder?.handle) return;

    // Navigate through path to get parent handle
    let currentDir = rootFolder.handle;
    for (let i = 1; i < parentPath.length; i++) {
      try {
        currentDir = await currentDir.getDirectoryHandle(parentPath[i]);
      } catch {
        setBrowseError("Cannot navigate to parent folder");
        return;
      }
    }

    await loadBrowseFolder(currentDir, parentPath);
  }, [browsePath, savedFolders, loadBrowseFolder, exitBrowseMode]);

  // Select a file from browse mode
  const browseSelectFile = useCallback((node: BrowseNode) => {
    if (node.kind !== "file") return;

    const newExercise: ZenExerciseItem = {
      id: generateId(),
      pdf_name: node.path,
      page_mode: "simple",
      page_start: "",
      page_end: "",
      custom_pages: "",
    };
    setExercises((prev) => [...prev, newExercise]);
    setActiveExerciseIndex(exercises.length);
    setStatusMessage(`Added: ${node.name}`);

    // Stay in browse mode for easy multiple selection
  }, [exercises.length]);

  // Preview a file in browse mode
  const handleBrowsePreview = useCallback(async (node: BrowseNode) => {
    if (node.kind !== "file" || !node.handle) return;
    try {
      const file = await (node.handle as FileSystemFileHandle).getFile();
      const url = URL.createObjectURL(file);
      setBrowsePreviewUrl(url);
      setBrowsePreviewName(node.name);
      setBrowsePreviewNode(node);
      // Get page count for validation
      try {
        const arrayBuffer = await file.arrayBuffer();
        const count = await getPageCount(arrayBuffer);
        setPreviewPageCount(count);
      } catch {
        setPreviewPageCount(null); // Page count detection failed, validation will be skipped
      }
    } catch {
      setStatusMessage("Failed to load preview");
    }
  }, []);

  // Close browse preview
  const closeBrowsePreview = useCallback(() => {
    if (browsePreviewUrl) {
      URL.revokeObjectURL(browsePreviewUrl);
    }
    setBrowsePreviewUrl(null);
    setBrowsePreviewName(null);
    setBrowsePreviewNode(null);
    // Reset page inputs and validation
    setPreviewPageStart("");
    setPreviewPageEnd("");
    setPreviewPageCount(null);
    setPreviewPageError(null);
  }, [browsePreviewUrl]);

  // Delete a folder from browse mode (only at root level)
  const handleBrowseDeleteFolder = useCallback(async (node: BrowseNode) => {
    if (node.kind !== "folder") return;
    if (!window.confirm(`Remove "${node.name}" from the folder list?\n\nThis won't delete the actual folder on disk.`)) {
      return;
    }
    // Find folder by name to get ID
    const folder = savedFolders.find(f => f.name === node.name);
    if (folder) {
      await removeFolder(folder.id);
      setSavedFolders(prev => prev.filter(f => f.id !== folder.id));
      // Refresh browse contents
      setBrowseContents(prev => prev.filter(n => n.name !== node.name));
      // Adjust cursor if needed
      if (browseIndex >= browseContents.length - 1) {
        setBrowseIndex(Math.max(0, browseContents.length - 2));
      }
      setStatusMessage(`Removed folder: ${node.name}`);
    }
  }, [savedFolders, browseIndex, browseContents.length]);

  // Validate preview page inputs
  useEffect(() => {
    if (!previewPageCount) {
      setPreviewPageError(null);
      return;
    }
    const start = previewPageStart ? parseInt(previewPageStart, 10) : null;
    const end = previewPageEnd ? parseInt(previewPageEnd, 10) : null;
    if ((start && (isNaN(start) || start < 1 || start > previewPageCount)) ||
        (end && (isNaN(end) || end < 1 || end > previewPageCount))) {
      setPreviewPageError(`Max page is ${previewPageCount}`);
    } else if (start && end && start > end) {
      setPreviewPageError("Start must be ≤ end");
    } else {
      setPreviewPageError(null);
    }
  }, [previewPageStart, previewPageEnd, previewPageCount]);

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
      setHasMoreResults(false);
      setSearchOffset(0);
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
        // Advanced mode: use raw query as-is, skip automatic tag filters

        // Add tag filters to query (except in advanced mode where user has full control)
        if (searchMode !== "advanced" && selectedTagIds.length > 0) {
          const tagQueries = selectedTagIds.map((id) => `tag:${id}`);
          if (tagMatchMode === "all") {
            // All tags must match: AND them together
            searchQuery = `${searchQuery} ${tagQueries.join(" ")}`;
          } else {
            // Any tag can match: OR them together (wrap in parens)
            searchQuery = `${searchQuery} (${tagQueries.join(" OR ")})`;
          }
        }

        const response = await paperlessAPI.search(searchQuery, 30);
        setResults(response.results);
        setHasMoreResults(response.has_more);
        setSearchOffset(30);
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

  // Load more search results
  const handleLoadMore = useCallback(async () => {
    if (!hasMoreResults || isLoadingMore || !query.trim()) return;

    setIsLoadingMore(true);
    try {
      // Build search query based on mode (same as initial search)
      let searchQuery = query;
      if (searchMode === "title") {
        searchQuery = `title:${query}`;
      } else if (searchMode === "content") {
        searchQuery = `content:${query}`;
      }
      // Advanced mode: use raw query as-is

      // Add tag filters to query (except in advanced mode)
      if (searchMode !== "advanced" && selectedTagIds.length > 0) {
        const tagQueries = selectedTagIds.map((id) => `tag:${id}`);
        if (tagMatchMode === "all") {
          searchQuery = `${searchQuery} ${tagQueries.join(" ")}`;
        } else {
          searchQuery = `${searchQuery} (${tagQueries.join(" OR ")})`;
        }
      }

      const response = await paperlessAPI.search(searchQuery, 30, "all", undefined, "all", searchOffset);
      setResults(prev => [...prev, ...response.results]);
      setHasMoreResults(response.has_more);
      setSearchOffset(prev => prev + 30);
    } catch (error) {
      setSearchError("Failed to load more results");
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMoreResults, isLoadingMore, query, searchMode, selectedTagIds, tagMatchMode, searchOffset]);

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

  // Paperless search callback for fallback when local file access fails
  const searchPaperlessByPath = useCallback(async (searchPath: string): Promise<number | null> => {
    try {
      const response = await api.paperless.search(searchPath, 1, 'all');
      if (response.results.length > 0) {
        return response.results[0].id;
      }
    } catch (error) {
      console.warn('Paperless search failed:', error);
    }
    return null;
  }, []);

  // Handle open file
  const handleOpenFile = useCallback(async (path?: string) => {
    const filePath = path || exercises[activeExerciseIndex]?.pdf_name;
    if (!filePath) return;
    const error = await openFileFromPathWithFallback(filePath, searchPaperlessByPath);
    if (error) {
      setStatusMessage(`Failed to open: ${error}`);
    } else {
      setStatusMessage("Opening PDF...");
    }
  }, [exercises, activeExerciseIndex, searchPaperlessByPath]);

  // Handle print single file
  const handlePrintFile = useCallback(async (path?: string) => {
    const ex = path ? exercises.find((e) => e.pdf_name === path) : exercises[activeExerciseIndex];
    if (!ex) return;
    const stamp = buildStampInfo();
    const start = ex.page_mode === "simple" && ex.page_start ? parseInt(ex.page_start, 10) : undefined;
    const end = ex.page_mode === "simple" && ex.page_end ? parseInt(ex.page_end, 10) : undefined;
    const complex = ex.page_mode === "custom" ? ex.custom_pages : undefined;

    const error = await printFileFromPathWithFallback(ex.pdf_name, start, end, complex, stamp, searchPaperlessByPath);
    if (error) {
      setStatusMessage(`Failed to print: ${error}`);
    } else {
      setStatusMessage("Printing...");
    }
  }, [exercises, activeExerciseIndex, buildStampInfo, searchPaperlessByPath]);

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
    const error = await printBulkFiles(items, stamp, searchPaperlessByPath);
    if (error) {
      setStatusMessage(`Batch print failed: ${error}`);
    } else {
      setStatusMessage("Batch print sent!");
    }
  }, [exercises, buildStampInfo, searchPaperlessByPath]);

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
      const navigationKeys = ['j', 'k', 'c', 's', 'n', 'r', 'd', 'o', 'Enter', 'ArrowUp', 'ArrowDown'];
      if (navigationKeys.includes(e.key)) {
        e.stopImmediatePropagation();
        // Don't return - let the handler below process the key
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        // Check browse preview FIRST (most inner modal)
        if (browsePreviewUrl) {
          closeBrowsePreview();
        } else if (showTagDropdown) {
          setShowTagDropdown(false);
        } else if (showFoldersDropdown) {
          setShowFoldersDropdown(false);
        } else if (browseMode) {
          exitBrowseMode();
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
        // Remove "pages" - page inputs are accessed within exercises
        const areas: FocusArea[] = browseMode
          ? ["search", "browse", "exercises"]
          : ["search", "results", "exercises"];
        const validAreas = exercises.length > 0 ? areas : areas.filter((a) => a !== "exercises");
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

      // Plain j/k in exercises section - navigate between rows
      if ((e.key === "j" || e.key === "k") && !isInInput && focusArea === "exercises" && exercises.length > 0) {
        e.preventDefault();
        if (e.key === "j") {
          setActiveExerciseIndex((prev) => Math.min(prev + 1, exercises.length - 1));
        } else {
          setActiveExerciseIndex((prev) => Math.max(prev - 1, 0));
        }
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
        if (e.key === "4") {
          e.preventDefault();
          setSearchMode("advanced");
          setShowSearchHints(true);
          setStatusMessage("Search mode: Advanced (raw query)");
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

      // Toggle search hints: ?
      if (e.key === "?" && !isInInput) {
        e.preventDefault();
        setShowSearchHints((prev) => !prev);
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

      // Toggle browse mode: b
      if (e.key === "b" && !isInInput && !e.ctrlKey && !showTagDropdown) {
        e.preventDefault();
        if (browseMode) {
          exitBrowseMode();
        } else {
          enterBrowseMode();
        }
        return;
      }

      // Browse mode navigation - must check focusArea to not interfere with exercises
      if (browseMode && focusArea === "browse" && !isInInput) {
        if (e.key === "ArrowDown" || e.key === "j") {
          e.preventDefault();
          setBrowseIndex((prev) => Math.min(prev + 1, browseContents.length - 1));
          return;
        }
        if (e.key === "ArrowUp" || e.key === "k") {
          e.preventDefault();
          setBrowseIndex((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === "ArrowLeft" || e.key === "h" || e.key === "Backspace") {
          e.preventDefault();
          browseUp();
          return;
        }
        if (e.key === "ArrowRight" || e.key === "l" || e.key === "Enter") {
          e.preventDefault();
          const node = browseContents[browseIndex];
          if (node) {
            if (node.kind === "folder") {
              browseIntoFolder(node);
            } else {
              browseSelectFile(node);
            }
          }
          return;
        }
        if (e.key === " ") {
          e.preventDefault();
          const node = browseContents[browseIndex];
          if (node?.kind === "file") {
            browseSelectFile(node);
          }
          return;
        }
        // Preview focused file: p
        if (e.key === "p" || e.key === "P") {
          e.preventDefault();
          const node = browseContents[browseIndex];
          if (node?.kind === "file") {
            handleBrowsePreview(node);
          }
          return;
        }
        // Delete folder at root level: x or Delete
        if ((e.key === "x" || e.key === "Delete") && browsePath.length === 0) {
          e.preventDefault();
          const node = browseContents[browseIndex];
          if (node?.kind === "folder") {
            handleBrowseDeleteFolder(node);
          }
          return;
        }
        // Don't process other keys in browse mode
        return;
      }

      // Catch-all: If browseMode is true but focusArea isn't "browse", block Enter from doing other things
      if (browseMode && e.key === "Enter" && focusArea !== "browse") {
        e.preventDefault();
        e.stopImmediatePropagation();
        // Set focus back to browse area
        setFocusArea("browse");
        return;
      }

      // Browse preview keyboard handling
      if (browsePreviewUrl) {
        if (e.key === "Escape") {
          e.preventDefault();
          closeBrowsePreview();
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          // Don't add if there's a page validation error
          if (browsePreviewNode && !previewPageError) {
            // Create exercise with page values from preview inputs
            const newExercise: ZenExerciseItem = {
              id: generateId(),
              pdf_name: browsePreviewNode.path,
              page_mode: "simple",
              page_start: previewPageStart,
              page_end: previewPageEnd,
              custom_pages: "",
            };
            setExercises((prev) => [...prev, newExercise]);
            setActiveExerciseIndex(exercises.length);
            setStatusMessage(`Added: ${browsePreviewNode.name}`);
            closeBrowsePreview();
          }
          return;
        }
        // Block other keys while preview is open (except typing in inputs)
        if (!isInInput) return;
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
          // Don't process results Enter when in browse mode
          if (browseMode) {
            e.stopImmediatePropagation();
            return;
          }
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

      // Load more results: l in results area when there are more
      if (e.key === "l" && !isInInput && focusArea === "results" && query.trim() && hasMoreResults) {
        e.preventDefault();
        handleLoadMore();
        return;
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
          // Don't trigger assign if in browse mode
          if (browseMode) {
            e.stopImmediatePropagation();
            return;
          }
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
    handlePreviewTrending, handleLoadMore, hasMoreResults,
    browseMode, browseContents, browseIndex, browsePath, enterBrowseMode, exitBrowseMode, browseUp, browseIntoFolder, browseSelectFile,
    browsePreviewUrl, browsePreviewNode, handleBrowsePreview, closeBrowsePreview, handleBrowseDeleteFolder,
    previewPageStart, previewPageEnd, previewPageError,
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

  // Auto-scroll browse item into view when navigating with j/k
  useEffect(() => {
    if (!browseMode) return;
    const container = browseContainerRef.current;
    if (!container) return;

    const selectedElement = container.querySelector('[data-browse-selected="true"]');
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [browseIndex, browseMode]);

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
        {(["all", "title", "content", "advanced"] as SearchMode[]).map((mode, i) => (
          <button
            key={mode}
            onClick={() => {
              setSearchMode(mode);
              if (mode === "advanced") setShowSearchHints(true);
            }}
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
            {mode === "advanced" ? "Adv" : mode.charAt(0).toUpperCase()}
          </button>
        ))}
        {/* Search hints toggle */}
        <button
          onClick={() => setShowSearchHints((prev) => !prev)}
          style={{
            padding: "2px 6px",
            backgroundColor: showSearchHints ? "var(--zen-accent)" : "transparent",
            border: `1px solid ${showSearchHints ? "var(--zen-accent)" : "var(--zen-border)"}`,
            color: showSearchHints ? "var(--zen-bg)" : "var(--zen-dim)",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "10px",
          }}
          title="[?] Toggle search hints"
        >
          ?
        </button>
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
        {/* Browse button */}
        <button
          onClick={() => {
            if (browseMode) {
              exitBrowseMode();
            } else {
              enterBrowseMode();
            }
          }}
          style={{
            padding: "2px 6px",
            backgroundColor: browseMode ? "var(--zen-accent)" : "transparent",
            border: `1px solid ${browseMode ? "var(--zen-accent)" : "var(--zen-border)"}`,
            color: browseMode ? "var(--zen-bg)" : "var(--zen-dim)",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "10px",
          }}
          title="[B]rowse folders"
        >
          B
        </button>
      </div>

      {/* Search Hints Panel */}
      {showSearchHints && (
        <div
          style={{
            marginBottom: "8px",
            padding: "8px",
            border: "1px solid var(--zen-border)",
            backgroundColor: "var(--zen-selection)",
            fontSize: "10px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "6px",
              paddingBottom: "4px",
              borderBottom: "1px solid var(--zen-border)",
            }}
          >
            <span style={{ color: "var(--zen-accent)", fontWeight: "bold" }}>
              SEARCH SYNTAX
            </span>
            <button
              onClick={() => setShowSearchHints(false)}
              style={{
                background: "none",
                border: "none",
                color: "var(--zen-dim)",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "10px",
              }}
            >
              [×] close
            </button>
          </div>
          <div style={{ color: "var(--zen-fg)", lineHeight: 1.5 }}>
            <div>
              <span style={{ color: "var(--zen-accent)" }}>Boolean:</span>{" "}
              <span style={{ color: "var(--zen-dim)" }}>F1 AND algebra, factorisation OR factorization, integral NOT indices</span>
            </div>
            <div>
              <span style={{ color: "var(--zen-accent)" }}>Fields:</span>{" "}
              <span style={{ color: "var(--zen-dim)" }}>title:Exam, tag:SS, content:polynomial</span>
            </div>
            <div>
              <span style={{ color: "var(--zen-accent)" }}>Phrases:</span>{" "}
              <span style={{ color: "var(--zen-dim)" }}>&quot;exact phrase&quot;, test*, created:[2024 to 2025]</span>
            </div>
            {searchMode === "advanced" && (
              <div style={{ marginTop: "4px", color: "var(--zen-dim)", fontStyle: "italic" }}>
                In Advanced mode, query is sent raw (no auto-prefixes or tag filters)
              </div>
            )}
          </div>
        </div>
      )}

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

      {/* Selected Tag Chips */}
      {selectedTagIds.length > 0 && !showTagDropdown && (
        <div
          style={{
            marginBottom: "8px",
            display: "flex",
            flexWrap: "wrap",
            gap: "4px",
            alignItems: "center",
          }}
        >
          <span style={{ color: "var(--zen-dim)", fontSize: "10px", marginRight: "4px" }}>
            Tags ({tagMatchMode === "all" ? "ALL" : "ANY"}):
          </span>
          {selectedTagIds.map((tagId) => {
            const tag = availableTags.find((t) => t.id === tagId);
            if (!tag) return null;
            return (
              <span
                key={tagId}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "1px 6px",
                  fontSize: "10px",
                  backgroundColor: "var(--zen-selection)",
                  border: "1px solid var(--zen-accent)",
                  color: "var(--zen-accent)",
                }}
              >
                {tag.name}
                <button
                  onClick={() => setSelectedTagIds((prev) => prev.filter((id) => id !== tagId))}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--zen-error)",
                    cursor: "pointer",
                    padding: "0",
                    fontSize: "10px",
                    lineHeight: 1,
                    fontFamily: "inherit",
                  }}
                  title="Remove tag"
                >
                  ×
                </button>
              </span>
            );
          })}
          <button
            onClick={() => setSelectedTagIds([])}
            style={{
              background: "none",
              border: "1px solid var(--zen-error)",
              color: "var(--zen-error)",
              cursor: "pointer",
              padding: "1px 4px",
              fontSize: "9px",
              fontFamily: "inherit",
            }}
            title="Clear all tags"
          >
            Clear
          </button>
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

      {/* Browse Mode */}
      {browseMode && (
        <div
          ref={browseContainerRef}
          onClick={() => setFocusArea("browse")}
          style={{
            border: `1px solid ${focusArea === "browse" ? "var(--zen-accent)" : "var(--zen-border)"}`,
            borderRadius: "2px",
            maxHeight: "220px",
            overflowY: "auto",
            marginBottom: "12px",
          }}
        >
          {/* Breadcrumb Navigation */}
          <div
            style={{
              padding: "4px 8px",
              backgroundColor: "var(--zen-selection)",
              borderBottom: "1px solid var(--zen-border)",
              fontSize: "11px",
              color: "var(--zen-dim)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <button
                onClick={(e) => { e.stopPropagation(); browseUp(); }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--zen-accent)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "11px",
                  padding: "0 4px",
                }}
                title="Back (Backspace/h)"
              >
                ←
              </button>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  // Go to root
                  const nodes: BrowseNode[] = savedFolders.map((folder) => ({
                    name: folder.name,
                    path: folder.name,
                    kind: "folder" as const,
                    handle: folder.handle,
                  }));
                  setBrowseContents(nodes);
                  setBrowsePath([]);
                  setBrowseHandle(null);
                  setBrowseIndex(0);
                }}
                style={{ cursor: "pointer" }}
              >
                Home
              </span>
              {browsePath.map((part, idx) => (
                <span key={idx} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ color: "var(--zen-dim)" }}>/</span>
                  <span style={{ color: idx === browsePath.length - 1 ? "var(--zen-fg)" : "var(--zen-dim)" }}>
                    {part}
                  </span>
                </span>
              ))}
            </div>
            <span style={{ color: "var(--zen-dim)", fontSize: "10px" }}>
              {browseContents.length} items
            </span>
          </div>

          {/* Browse Keyboard Hints */}
          <div
            style={{
              padding: "2px 8px",
              backgroundColor: "var(--zen-bg)",
              borderBottom: "1px solid var(--zen-border)",
              fontSize: "10px",
              color: "var(--zen-dim)",
            }}
          >
            j/k nav · Enter/Space add · l→ folder · h← back · P preview{browsePath.length === 0 ? " · x delete" : ""} · Esc exit
          </div>

          {/* Loading State */}
          {browseLoading && (
            <div style={{ padding: "12px", color: "var(--zen-dim)", fontSize: "12px", textAlign: "center" }}>
              Loading...
            </div>
          )}

          {/* Error State */}
          {browseError && (
            <div style={{ padding: "8px", color: "var(--zen-error)", fontSize: "12px" }}>
              {browseError}
            </div>
          )}

          {/* Empty State */}
          {!browseLoading && !browseError && browseContents.length === 0 && (
            <div style={{ padding: "12px", color: "var(--zen-dim)", fontSize: "12px", textAlign: "center" }}>
              {browsePath.length === 0 ? "No saved folders. Add folders in Settings." : "Folder is empty"}
            </div>
          )}

          {/* File/Folder List */}
          {!browseLoading && !browseError && browseContents.map((node, idx) => (
            <div
              key={node.path}
              onClick={() => {
                setBrowseIndex(idx);
                if (node.kind === "folder") {
                  browseIntoFolder(node);
                } else {
                  browseSelectFile(node);
                }
              }}
              data-browse-selected={idx === browseIndex}
              style={{
                padding: "6px 8px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: "pointer",
                backgroundColor: idx === browseIndex ? "var(--zen-selection)" : "transparent",
                borderLeft: idx === browseIndex ? "2px solid var(--zen-accent)" : "2px solid transparent",
              }}
            >
              <span style={{ color: node.kind === "folder" ? "var(--zen-accent)" : "var(--zen-dim)", fontSize: "12px" }}>
                {node.kind === "folder" ? "📁" : "📄"}
              </span>
              <span
                style={{
                  color: idx === browseIndex ? "var(--zen-fg)" : "var(--zen-dim)",
                  fontSize: "12px",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {node.name}
              </span>
              {node.kind === "folder" && (
                <span style={{ color: "var(--zen-dim)", fontSize: "11px" }}>→</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Browse Preview Overlay */}
      {browsePreviewUrl && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.9)",
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
            padding: "20px",
          }}
        >
          {/* Preview Header */}
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
            <span style={{ color: "var(--zen-fg)", fontSize: "14px" }}>
              {browsePreviewName}
            </span>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              {/* Page Range Inputs */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ color: "var(--zen-dim)", fontSize: "12px" }}>
                  Pages{previewPageCount ? ` (of ${previewPageCount})` : ""}:
                </span>
                <input
                  type="text"
                  value={previewPageStart}
                  onChange={(e) => setPreviewPageStart(e.target.value)}
                  placeholder="from"
                  style={{
                    width: "50px",
                    backgroundColor: "var(--zen-bg)",
                    border: previewPageError ? "1px solid var(--zen-error, #f87171)" : "1px solid var(--zen-border)",
                    color: "var(--zen-fg)",
                    padding: "4px 6px",
                    fontFamily: "inherit",
                    fontSize: "12px",
                    borderRadius: "2px",
                  }}
                />
                <span style={{ color: "var(--zen-dim)", fontSize: "12px" }}>to</span>
                <input
                  type="text"
                  value={previewPageEnd}
                  onChange={(e) => setPreviewPageEnd(e.target.value)}
                  placeholder="to"
                  style={{
                    width: "50px",
                    backgroundColor: "var(--zen-bg)",
                    border: previewPageError ? "1px solid var(--zen-error, #f87171)" : "1px solid var(--zen-border)",
                    color: "var(--zen-fg)",
                    padding: "4px 6px",
                    fontFamily: "inherit",
                    fontSize: "12px",
                    borderRadius: "2px",
                  }}
                />
                {previewPageError && (
                  <span style={{ color: "var(--zen-error, #f87171)", fontSize: "11px" }}>
                    {previewPageError}
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  if (browsePreviewNode && !previewPageError) {
                    // Create exercise with page values
                    const newExercise: ZenExerciseItem = {
                      id: generateId(),
                      pdf_name: browsePreviewNode.path,
                      page_mode: "simple",
                      page_start: previewPageStart,
                      page_end: previewPageEnd,
                      custom_pages: "",
                    };
                    setExercises((prev) => [...prev, newExercise]);
                    setActiveExerciseIndex(exercises.length);
                    setStatusMessage(`Added: ${browsePreviewNode.name}`);
                    closeBrowsePreview();
                  }
                }}
                disabled={!!previewPageError}
                style={{
                  background: "none",
                  border: previewPageError ? "1px solid var(--zen-dim)" : "1px solid var(--zen-accent)",
                  color: previewPageError ? "var(--zen-dim)" : "var(--zen-accent)",
                  padding: "4px 12px",
                  cursor: previewPageError ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  fontSize: "12px",
                  opacity: previewPageError ? 0.5 : 1,
                }}
              >
                [Enter] Use{previewPageStart || previewPageEnd ? ` (p${previewPageStart || "?"}–${previewPageEnd || "?"})` : ""}
              </button>
              <button
                onClick={closeBrowsePreview}
                style={{
                  background: "none",
                  border: "1px solid var(--zen-border)",
                  color: "var(--zen-dim)",
                  padding: "4px 12px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "12px",
                }}
              >
                [Esc] Close
              </button>
            </div>
          </div>
          {/* PDF Iframe */}
          <iframe
            src={browsePreviewUrl}
            style={{
              flex: 1,
              border: "1px solid var(--zen-border)",
              borderRadius: "4px",
              backgroundColor: "#fff",
            }}
            title="PDF Preview"
          />
        </div>
      )}

      {/* Results / Recent / Trending */}
      {!browseMode && (
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
            {/* Load more button */}
            {hasMoreResults && (
              <div
                style={{
                  padding: "8px",
                  textAlign: "center",
                  borderTop: "1px solid var(--zen-border)",
                }}
              >
                <button
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  style={{
                    background: "none",
                    border: "1px solid var(--zen-border)",
                    color: "var(--zen-accent)",
                    padding: "4px 12px",
                    fontSize: "12px",
                    cursor: isLoadingMore ? "wait" : "pointer",
                    borderRadius: "4px",
                  }}
                >
                  {isLoadingMore ? "Loading..." : "[L] Load more results"}
                </button>
              </div>
            )}
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
      )}

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
            <span>[A]dd [D]elete • j/k navigate</span>
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
