"use client";

import { useState, useEffect, useCallback, useRef, Fragment, useMemo } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import Fuse from "fuse.js";
import {
  Folder,
  FolderOpen,
  FolderSync,
  FolderPlus,
  FileText,
  ChevronRight,
  Loader2,
  Eye,
  ZoomIn,
  ZoomOut,
  ExternalLink,
  AlertCircle,
  Info,
  Home,
  LayoutGrid,
  List,
  Trash2,
  X,
  AlertTriangle,
  RefreshCw,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getSavedFolders,
  verifyPermission,
  addFolder,
  removeFolder,
  getPathMappings,
  type SavedFolder,
} from "@/lib/file-system";
import { getPageCount } from "@/lib/pdf-utils";
import { SessionSelectorModal } from "@/components/sessions/SessionSelectorModal";
import { HandwritingRemovalToolbar } from "@/components/ui/handwriting-removal-toolbar";
import { CalendarPlus } from "lucide-react";

// File selection with page range
export interface FileSelection {
  path: string;
  pages: string; // "1-5", "1,3,5-7", or ""
  pageCount?: number; // Loaded when selected
  error?: string; // Validation error
}

// Validate page input against max pages
export function validatePageInput(input: string, maxPages: number): string | null {
  if (!input.trim()) return null;
  const normalized = input.replace(/[~–—−]/g, '-');
  const numbers = normalized.match(/\d+/g)?.map(Number) || [];
  for (const num of numbers) {
    if (num < 1) return `Page must be ≥ 1`;
    if (num > maxPages) return `Page ${num} exceeds max (${maxPages})`;
  }
  return null;
}

// Timeout helper for network operations
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  errorMsg: string
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(errorMsg)), ms)
  );
  return Promise.race([promise, timeout]);
}

interface TreeNode {
  id: string;
  name: string;
  path: string;
  kind: "folder" | "file";
  handle?: FileSystemDirectoryHandle | FileSystemFileHandle;
  isShared?: boolean;
  lastModified?: number; // Timestamp, loaded lazily for date sorting
}

interface FolderTreeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFileSelected: (path: string, pages?: string) => void;
  /** Handler for batch adding multiple files (multi-select mode) */
  onFilesSelected?: (selections: FileSelection[]) => void;
  /** Enable multi-select toggle */
  allowMultiSelect?: boolean;
  /** Initial path to navigate to (e.g., "Center\\Math\\file.pdf") */
  initialPath?: string;
  /** Enable "Assign To Sessions" functionality */
  allowAssignTo?: boolean;
  /** Callback when assignment completes successfully */
  onAssignComplete?: () => void;
}

type SortOption = "name-asc" | "name-desc" | "date-desc" | "date-asc";
type ViewMode = "grid" | "list";

// Zoom levels for PDF preview
const ZOOM_LEVELS = [50, 75, 100, 125, 150, 200];

export function FolderTreeModal({
  isOpen,
  onClose,
  onFileSelected,
  onFilesSelected,
  allowMultiSelect = false,
  initialPath,
  allowAssignTo = false,
  onAssignComplete,
}: FolderTreeModalProps) {
  // Root folders (from saved folder handles)
  const [rootFolders, setRootFolders] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Navigation state
  const [currentPath, setCurrentPath] = useState<string[]>([]); // ["Center", "Math"]
  const [currentHandle, setCurrentHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [currentContents, setCurrentContents] = useState<TreeNode[]>([]);
  const [contentsLoading, setContentsLoading] = useState(false);

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // Preview state
  const [previewNode, setPreviewNode] = useState<TreeNode | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(2); // Start at 100%
  // Handwriting removal state
  const [cleanedPreviewUrl, setCleanedPreviewUrl] = useState<string | null>(null);
  const [showCleanedPreview, setShowCleanedPreview] = useState(false);

  // Sort state
  const [sortBy, setSortBy] = useState<SortOption>("name-asc");
  const [loadingDates, setLoadingDates] = useState(false);

  // Pagination state for large folders
  const ITEMS_PER_PAGE = 100;
  const [displayLimit, setDisplayLimit] = useState(ITEMS_PER_PAGE);

  // Selection state (multi-select via checkbox hover + Ctrl/Shift+Click)
  const [selections, setSelections] = useState<Map<string, FileSelection>>(new Map());

  // Page range state for preview panel (radio button format)
  const [previewPageCount, setPreviewPageCount] = useState<number | null>(null);
  const [previewPageMode, setPreviewPageMode] = useState<"simple" | "custom">("simple");
  const [previewPageStart, setPreviewPageStart] = useState("");
  const [previewPageEnd, setPreviewPageEnd] = useState("");
  const [previewComplexPages, setPreviewComplexPages] = useState("");
  const [previewPagesError, setPreviewPagesError] = useState<string | null>(null);

  // Explorer-like UX state (hover to show checkbox, click to preview, double-click to use)
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

  // Keyboard navigation state
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Scroll ref
  const contentScrollRef = useRef<HTMLDivElement>(null);

  // Track unavailable folders (network drives that timed out)
  const [unavailableFolders, setUnavailableFolders] = useState<Set<string>>(new Set());

  // Session selector modal state
  const [sessionSelectorOpen, setSessionSelectorOpen] = useState(false);

  // Search/filter state
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load root folders when modal opens
  useEffect(() => {
    if (isOpen) {
      loadRootFolders();
    } else {
      // Cleanup on close
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
      setPreviewNode(null);
      setPreviewPageCount(null);
      setPreviewPageMode("simple");
      setPreviewPageStart("");
      setPreviewPageEnd("");
      setPreviewComplexPages("");
      setPreviewPagesError(null);
      setCurrentPath([]);
      setCurrentHandle(null);
      setCurrentContents([]);
      setSelections(new Map());
    }
  }, [isOpen]);

  // Navigate to initial path when root folders are loaded
  useEffect(() => {
    if (isOpen && initialPath && rootFolders.length > 0 && currentPath.length === 0) {
      navigateToInitialPath(initialPath);
    }
  }, [isOpen, initialPath, rootFolders]);

  const loadRootFolders = async () => {
    setLoading(true);
    setError(null);

    try {
      const folders = await getSavedFolders();

      // Get path mappings to determine which folders are network drive aliases
      const mappings = await getPathMappings();
      const aliasNames = new Set(mappings.map((m) => m.alias));

      // Convert to nodes - add brackets for network drive aliases
      const nodes: TreeNode[] = folders.map((folder) => {
        const isAlias = aliasNames.has(folder.name);
        return {
          id: folder.id,
          name: folder.name,
          path: isAlias ? `[${folder.name}]` : folder.name,
          kind: "folder" as const,
          handle: folder.handle,
          isShared: folder.isShared,
        };
      });

      // Sort: shared first, then alphabetical
      nodes.sort((a, b) => {
        if (a.isShared && !b.isShared) return -1;
        if (!a.isShared && b.isShared) return 1;
        return a.name.localeCompare(b.name);
      });

      setRootFolders(nodes);
      setCurrentContents(nodes);
    } catch (err) {
      setError("Failed to load folders. Please try again.");
      console.error("Failed to load folders:", err);
    } finally {
      setLoading(false);
    }
  };

  // Navigate to initial path (e.g., "Center\Math\file.pdf" or "[MSA Staff]\scan\file.pdf")
  const navigateToInitialPath = async (path: string) => {
    const parts = path.split("\\").filter(Boolean);
    if (parts.length === 0) return;

    // Get the root part (may be bracketed alias from Shelv)
    let rootName = parts[0];

    // Strip brackets from Shelv format: [MSA Staff] → MSA Staff
    if (rootName.startsWith("[") && rootName.endsWith("]")) {
      rootName = rootName.slice(1, -1);
    }

    // Try to find root folder directly by name first
    let rootFolder = rootFolders.find((f) => f.name === rootName);

    // If not found, check if it's an alias that maps to a saved folder
    if (!rootFolder) {
      try {
        const mappings = await getPathMappings();
        const mapping = mappings.find((m) => m.alias === rootName);
        if (mapping) {
          // Find root folder by drive path (e.g., mapping.drivePath = "Z:")
          // The saved folder name might be the drive letter or the alias itself
          rootFolder = rootFolders.find((f) => {
            const folderNameUpper = f.name.toUpperCase();
            const drivePathUpper = mapping.drivePath.toUpperCase().replace(":", "");
            // Match if folder name starts with drive letter (e.g., "Z" or "Z:")
            return folderNameUpper === drivePathUpper ||
                   folderNameUpper === `${drivePathUpper}:` ||
                   folderNameUpper.startsWith(`${drivePathUpper}:`);
          });
        }
      } catch (err) {
        console.warn("Failed to lookup path mappings:", err);
      }
    }

    if (!rootFolder || !rootFolder.handle) return;

    try {
      // Navigate to the parent folder of the file (not including the filename)
      const folderParts = parts.slice(0, -1); // Remove filename
      if (folderParts.length === 0) return;

      let currentDir = rootFolder.handle as FileSystemDirectoryHandle;
      const pathSoFar: string[] = [rootFolder.name]; // Use actual folder name, not alias

      // Navigate through each subfolder (skip the first part which is the root/alias)
      for (let i = 1; i < folderParts.length; i++) {
        const subfolderName = folderParts[i];
        try {
          currentDir = await currentDir.getDirectoryHandle(subfolderName);
          pathSoFar.push(subfolderName);
        } catch {
          // Subfolder doesn't exist, stop here
          break;
        }
      }

      // Load contents of the final folder
      setCurrentPath(pathSoFar);
      setCurrentHandle(currentDir);
      await loadFolderContents(currentDir, pathSoFar.join("\\"));
    } catch (err) {
      console.warn("Failed to navigate to initial path:", err);
    }
  };

  // Load contents of a directory (with chunked loading for large folders)
  const loadFolderContents = async (handle: FileSystemDirectoryHandle, basePath: string, folderId?: string) => {
    setContentsLoading(true);
    setError(null);

    const TIMEOUT_MS = 5000; // 5 second timeout for network operations

    try {
      // Verify permission with timeout
      const hasPermission = await withTimeout(
        verifyPermission(handle),
        TIMEOUT_MS,
        "Connection timeout - drive may be unavailable"
      );

      if (!hasPermission) {
        setError(`Permission denied. Please grant access in Settings.`);
        setContentsLoading(false);
        return;
      }

      const contents: TreeNode[] = [];
      let count = 0;
      const CHUNK_SIZE = 100; // Yield to UI every 100 items

      // Get entries iterator
      const entriesIterator = handle.entries();

      // Try to get first entry with timeout to detect unreachable drives early
      const firstEntryResult = await withTimeout(
        entriesIterator.next(),
        TIMEOUT_MS,
        "Cannot access folder - network may be unavailable"
      );

      // Process first entry if it exists
      if (!firstEntryResult.done) {
        const [name, entryHandle] = firstEntryResult.value;
        const isPdf = name.toLowerCase().endsWith(".pdf");
        const isFolder = entryHandle.kind === "directory";

        if (isFolder || isPdf) {
          contents.push({
            id: `${basePath}\\${name}`,
            name,
            path: `${basePath}\\${name}`,
            kind: entryHandle.kind === "directory" ? "folder" : "file",
            handle: entryHandle as FileSystemDirectoryHandle | FileSystemFileHandle,
          });
        }
        count++;
      }

      // Continue with remaining entries (already connected, so less likely to timeout)
      for await (const [name, entryHandle] of entriesIterator) {
        const isPdf = name.toLowerCase().endsWith(".pdf");
        const isFolder = entryHandle.kind === "directory";

        // Only include folders and PDF files
        if (isFolder || isPdf) {
          contents.push({
            id: `${basePath}\\${name}`,
            name,
            path: `${basePath}\\${name}`,
            kind: entryHandle.kind === "directory" ? "folder" : "file",
            handle: entryHandle as FileSystemDirectoryHandle | FileSystemFileHandle,
          });
        }

        count++;
        // Yield to UI every CHUNK_SIZE items to prevent freezing
        if (count % CHUNK_SIZE === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      // Clear this folder from unavailable list on success
      if (folderId) {
        setUnavailableFolders((prev) => {
          const next = new Set(prev);
          next.delete(folderId);
          return next;
        });
      }

      setCurrentContents(contents);
      setDisplayLimit(ITEMS_PER_PAGE); // Reset pagination when folder changes
    } catch (err) {
      console.error("Failed to load folder contents:", err);
      const message = err instanceof Error ? err.message : "Failed to load folder contents.";
      setError(message);

      // Mark folder as unavailable if it was a timeout
      if (folderId && (message.includes("timeout") || message.includes("unavailable"))) {
        setUnavailableFolders((prev) => new Set(prev).add(folderId));
      }
    } finally {
      setContentsLoading(false);
    }
  };

  // Navigate into a folder
  const navigateInto = useCallback(async (node: TreeNode) => {
    if (node.kind !== "folder" || !node.handle) return;

    const dirHandle = node.handle as FileSystemDirectoryHandle;
    // At root level, use node.path which has brackets for alias folders
    // For subfolders, use node.name (just the folder name)
    const segment = currentPath.length === 0 ? node.path : node.name;
    const newPath = [...currentPath, segment];

    // Normalize path: remove consecutive duplicate segments (defensive fix for state race conditions)
    const normalizedPath = newPath.filter((seg, i) => i === 0 || seg !== newPath[i - 1]);
    const basePath = normalizedPath.join("\\");

    setSearchQuery(""); // Clear search when navigating
    setCurrentPath(normalizedPath);
    setCurrentHandle(dirHandle);
    await loadFolderContents(dirHandle, basePath, node.id);

    // Scroll to top
    if (contentScrollRef.current) {
      contentScrollRef.current.scrollTop = 0;
    }
  }, [currentPath]);

  // Navigate via breadcrumb
  const navigateTo = useCallback(async (index: number) => {
    setSearchQuery(""); // Clear search when navigating
    if (index === -1) {
      // Go to root
      setCurrentPath([]);
      setCurrentHandle(null);
      setCurrentContents(rootFolders);
      return;
    }

    const newPath = currentPath.slice(0, index + 1);

    // Find the handle for this path
    let handle: FileSystemDirectoryHandle | null = null;

    // Start from root folder - strip brackets if present
    let rootName = newPath[0];
    if (rootName.startsWith("[") && rootName.endsWith("]")) {
      rootName = rootName.slice(1, -1);
    }
    const rootFolder = rootFolders.find((f) => f.name === rootName);
    if (!rootFolder || !rootFolder.handle) return;

    handle = rootFolder.handle as FileSystemDirectoryHandle;

    // Navigate through subfolders
    for (let i = 1; i < newPath.length; i++) {
      try {
        handle = await handle.getDirectoryHandle(newPath[i]);
      } catch {
        return;
      }
    }

    setCurrentPath(newPath);
    setCurrentHandle(handle);
    await loadFolderContents(handle, newPath.join("\\"));
  }, [currentPath, rootFolders]);

  // Sort nodes helper
  const sortNodes = useCallback((nodes: TreeNode[]): TreeNode[] => {
    return [...nodes].sort((a, b) => {
      // Folders first (always)
      if (a.kind !== b.kind) {
        return a.kind === "folder" ? -1 : 1;
      }
      // Then by sort option
      switch (sortBy) {
        case "date-desc":
          return (b.lastModified || 0) - (a.lastModified || 0);
        case "date-asc":
          return (a.lastModified || 0) - (b.lastModified || 0);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "name-asc":
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [sortBy]);

  // Toggle file selection (loads page count when adding)
  const toggleSelection = useCallback(async (node: TreeNode) => {
    const path = node.path;
    if (selections.has(path)) {
      // Remove
      setSelections((prev) => {
        const next = new Map(prev);
        next.delete(path);
        return next;
      });
    } else {
      // Add with placeholder
      const sel: FileSelection = { path, pages: "" };
      setSelections((prev) => new Map(prev).set(path, sel));

      // Load page count async
      if (node.handle && node.kind === "file") {
        try {
          const file = await (node.handle as FileSystemFileHandle).getFile();
          const arrayBuffer = await file.arrayBuffer();
          const pageCount = await getPageCount(arrayBuffer);
          setSelections((prev) => {
            const next = new Map(prev);
            const existing = next.get(path);
            if (existing) next.set(path, { ...existing, pageCount });
            return next;
          });
        } catch {
          // Page count loading failed, validation will be skipped
        }
      }
    }
  }, [selections]);

  // Update page range for a selected file (with validation)
  const updateSelectionPages = useCallback((path: string, pages: string) => {
    setSelections((prev) => {
      const next = new Map(prev);
      const existing = next.get(path);
      if (existing) {
        const error = existing.pageCount ? validatePageInput(pages, existing.pageCount) : null;
        next.set(path, { ...existing, pages, error: error || undefined });
      }
      return next;
    });
  }, []);

  // Remove file from selection (for selection panel X button)
  const removeSelection = useCallback((path: string) => {
    setSelections((prev) => {
      const next = new Map(prev);
      next.delete(path);
      return next;
    });
  }, []);

  // Sort current contents - needed early for click/keyboard handlers
  const sortedContentsRaw = sortNodes(currentContents);

  // Fuzzy filter when search query is active
  const fuseOptions = useMemo(() => ({
    keys: ["name"],
    threshold: 0.4, // 0 = exact, 1 = match anything
    ignoreLocation: true,
  }), []);

  const sortedContents = useMemo(() => {
    if (!searchQuery.trim()) return sortedContentsRaw;
    const fuse = new Fuse(sortedContentsRaw, fuseOptions);
    return fuse.search(searchQuery).map((result) => result.item);
  }, [sortedContentsRaw, searchQuery, fuseOptions]);

  // Load file dates lazily when sorting by date
  useEffect(() => {
    if (!sortBy.startsWith("date-") || loadingDates) return;

    const filesToLoad = currentContents.filter(
      (n) => n.kind === "file" && n.lastModified === undefined && n.handle
    );

    if (filesToLoad.length === 0) return;

    const loadDates = async () => {
      setLoadingDates(true);
      try {
        for (const node of filesToLoad) {
          try {
            const file = await (node.handle as FileSystemFileHandle).getFile();
            node.lastModified = file.lastModified;
          } catch {
            node.lastModified = 0; // Fallback for inaccessible files
          }
        }
        // Trigger re-render
        setCurrentContents([...currentContents]);
      } finally {
        setLoadingDates(false);
      }
    };

    loadDates();
  }, [sortBy, currentContents, loadingDates]);

  // Pagination: only render a subset for performance with large folders
  const displayedContents = sortedContents.slice(0, displayLimit);
  const hasMore = sortedContents.length > displayLimit;
  const remainingCount = sortedContents.length - displayLimit;

  // Handle preview - defined early since it's used by handleSingleClick
  const handlePreview = useCallback(async (node: TreeNode) => {
    if (node.kind !== "file" || !node.handle) return;

    setPreviewLoading(true);
    setPreviewNode(node);
    setPreviewPageMode("simple");
    setPreviewPageStart("");
    setPreviewPageEnd("");
    setPreviewComplexPages("");
    setPreviewPagesError(null);
    setPreviewPageCount(null);

    try {
      const fileHandle = node.handle as FileSystemFileHandle;
      // Add timeout to prevent hanging on stale file handles (e.g., network drive disconnected)
      const file = await withTimeout(
        fileHandle.getFile(),
        5000,
        "Preview timeout - file may be unavailable"
      );
      const url = URL.createObjectURL(file);

      // Get page count for validation
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pageCount = await getPageCount(arrayBuffer);
        setPreviewPageCount(pageCount);
      } catch {
        // Page count loading failed, validation will be skipped
        setPreviewPageCount(null);
      }

      // Cleanup previous URL
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      setPreviewUrl(url);
    } catch (err) {
      console.error("Failed to load preview:", err);
      setError("Failed to load PDF preview.");
    } finally {
      setPreviewLoading(false);
    }
  }, [previewUrl]);

  // Single click: preview file (or navigate folder) - Explorer-like behavior
  const handleSingleClick = useCallback((e: React.MouseEvent, node: TreeNode, index: number) => {
    // Ctrl+Click: toggle selection
    if (e.ctrlKey || e.metaKey) {
      if (node.kind === "file") {
        toggleSelection(node);
        setLastClickedIndex(index);
      }
      return;
    }

    // Shift+Click: range selection
    if (e.shiftKey && lastClickedIndex !== null && node.kind === "file") {
      const start = Math.min(lastClickedIndex, index);
      const end = Math.max(lastClickedIndex, index);
      const rangeNodes = sortedContents
        .slice(start, end + 1)
        .filter((n) => n.kind === "file");
      // Add range to selections (page counts will load async)
      setSelections((prev) => {
        const next = new Map(prev);
        for (const n of rangeNodes) {
          if (!next.has(n.path)) {
            next.set(n.path, { path: n.path, pages: "" });
          }
        }
        return next;
      });
      // Load page counts for new selections in parallel
      rangeNodes.forEach(async (n) => {
        if (n.handle && !selections.has(n.path)) {
          try {
            const file = await (n.handle as FileSystemFileHandle).getFile();
            const arrayBuffer = await file.arrayBuffer();
            const pageCount = await getPageCount(arrayBuffer);
            setSelections((prev) => {
              const next = new Map(prev);
              const existing = next.get(n.path);
              if (existing && !existing.pageCount) {
                next.set(n.path, { ...existing, pageCount });
              }
              return next;
            });
          } catch {
            // Page count loading failed, skip
          }
        }
      });
      return;
    }

    // Regular click on folder: navigate
    if (node.kind === "folder") {
      navigateInto(node);
      return;
    }

    // Regular click on file: preview it
    if (node.kind === "file") {
      setLastClickedIndex(index);
      handlePreview(node);
    }
  }, [lastClickedIndex, sortedContents, toggleSelection, navigateInto, handlePreview]);

  // Double click: select/use file - Explorer-like behavior
  const handleDoubleClick = useCallback((node: TreeNode) => {
    if (node.kind === "file") {
      if (selections.size > 0 && onFilesSelected) {
        // Batch add all selected + this one (if not already selected)
        const allSelections = new Map(selections);
        if (!allSelections.has(node.path)) {
          allSelections.set(node.path, { path: node.path, pages: "" });
        }
        onFilesSelected(Array.from(allSelections.values()));
      } else {
        // Single file selection (no page range on double-click)
        onFileSelected(node.path);
      }
      onClose();
    }
  }, [selections, onFilesSelected, onFileSelected, onClose]);

  // Checkbox click: toggle selection (stops propagation to prevent other click handlers)
  const handleCheckboxClick = useCallback((e: React.MouseEvent, node: TreeNode, index: number) => {
    e.stopPropagation();
    toggleSelection(node);
    setLastClickedIndex(index);
  }, [toggleSelection]);

  // Handle batch add
  const handleBatchAdd = useCallback(() => {
    if (onFilesSelected && selections.size > 0) {
      onFilesSelected(Array.from(selections.values()));
      onClose();
    }
  }, [onFilesSelected, selections, onClose]);

  // Close preview
  const handleClosePreview = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    if (cleanedPreviewUrl) {
      URL.revokeObjectURL(cleanedPreviewUrl);
    }
    setPreviewUrl(null);
    setPreviewNode(null);
    setCleanedPreviewUrl(null);
    setShowCleanedPreview(false);
  }, [previewUrl, cleanedPreviewUrl]);

  // Handle cleaned PDF from handwriting removal
  const handleCleanedPdf = useCallback((url: string | null) => {
    if (cleanedPreviewUrl) URL.revokeObjectURL(cleanedPreviewUrl);
    setCleanedPreviewUrl(url);
    if (url) setShowCleanedPreview(true);
  }, [cleanedPreviewUrl]);

  // Use previewed file
  const handleUsePreviewedFile = useCallback(() => {
    if (previewNode && !previewPagesError) {
      // Construct pages string from mode
      let pages: string | undefined;
      if (previewPageMode === "simple") {
        const start = previewPageStart.trim();
        const end = previewPageEnd.trim();
        if (start && end) {
          pages = `${start}-${end}`;
        } else if (start) {
          pages = start;
        }
      } else {
        pages = previewComplexPages.trim() || undefined;
      }
      onFileSelected(previewNode.path, pages);
      onClose();
    }
  }, [previewNode, previewPageMode, previewPageStart, previewPageEnd, previewComplexPages, previewPagesError, onFileSelected, onClose]);

  // Open preview in new tab
  const handleOpenInNewTab = useCallback(() => {
    if (previewUrl) {
      window.open(previewUrl, "_blank");
    }
  }, [previewUrl]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoomIndex((prev) => Math.min(prev + 1, ZOOM_LEVELS.length - 1));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const currentZoom = ZOOM_LEVELS[zoomIndex];

  // Keyboard navigation handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+F or / to focus search
      if ((e.ctrlKey && e.key === "f") || (e.key === "/" && !(e.target instanceof HTMLInputElement))) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      // Escape in search input clears it and unfocuses
      if (e.key === "Escape" && e.target === searchInputRef.current) {
        e.preventDefault();
        setSearchQuery("");
        searchInputRef.current?.blur();
        return;
      }

      // Don't handle if user is typing in a text input (but allow checkboxes)
      if (e.target instanceof HTMLInputElement && e.target.type !== "checkbox") {
        return;
      }
      if (e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const totalItems = sortedContents.length;

      // Helper to get grid columns based on viewport and view mode
      const getGridColumns = () => {
        if (viewMode !== "grid") return 1;
        const width = window.innerWidth;
        if (width >= 640) return 4; // sm:grid-cols-4
        return 3; // grid-cols-3
      };

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (viewMode === "grid") {
            const cols = getGridColumns();
            setFocusedIndex((prev) => {
              const next = Math.min(prev + cols, totalItems - 1);
              itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
              return next;
            });
          } else {
            setFocusedIndex((prev) => {
              const next = prev < totalItems - 1 ? prev + 1 : totalItems - 1;
              itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
              return next;
            });
          }
          // Ctrl+Shift+Down: extend selection while navigating
          if (e.ctrlKey && e.shiftKey) {
            const nextIndex = Math.min(focusedIndex + 1, totalItems - 1);
            const node = sortedContents[nextIndex];
            if (node?.kind === "file" && !selections.has(node.path)) {
              toggleSelection(node);
            }
          }
          break;

        case "ArrowUp":
          e.preventDefault();
          if (viewMode === "grid") {
            const cols = getGridColumns();
            setFocusedIndex((prev) => {
              const next = Math.max(prev - cols, 0);
              itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
              return next;
            });
          } else {
            setFocusedIndex((prev) => {
              const next = prev > 0 ? prev - 1 : 0;
              itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
              return next;
            });
          }
          // Ctrl+Shift+Up: extend selection while navigating
          if (e.ctrlKey && e.shiftKey) {
            const nextIndex = Math.max(focusedIndex - 1, 0);
            const node = sortedContents[nextIndex];
            if (node?.kind === "file" && !selections.has(node.path)) {
              toggleSelection(node);
            }
          }
          break;

        case "ArrowLeft":
          if (viewMode === "grid") {
            e.preventDefault();
            setFocusedIndex((prev) => {
              const next = Math.max(prev - 1, 0);
              itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
              return next;
            });
          }
          break;

        case "ArrowRight":
          if (viewMode === "grid") {
            e.preventDefault();
            setFocusedIndex((prev) => {
              const next = Math.min(prev + 1, totalItems - 1);
              itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
              return next;
            });
          }
          break;

        case "Enter":
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < totalItems) {
            const node = sortedContents[focusedIndex];
            if (node.kind === "folder") {
              navigateInto(node);
              setFocusedIndex(-1); // Reset focus when navigating
            } else {
              handleDoubleClick(node);
            }
          }
          break;

        case " ": // Space
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < totalItems) {
            const node = sortedContents[focusedIndex];
            if (node.kind === "file") {
              toggleSelection(node);
            }
          }
          break;

        case "p":
        case "P":
          // Preview focused file
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < totalItems) {
            const node = sortedContents[focusedIndex];
            if (node.kind === "file") {
              handlePreview(node);
            }
          }
          break;

        case "a":
          // Ctrl+A: Select all files
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const allFileSelections = new Map<string, FileSelection>();
            sortedContents
              .filter((n) => n.kind === "file")
              .forEach((n) => allFileSelections.set(n.path, { path: n.path, pages: "" }));
            setSelections(allFileSelections);
          }
          break;

        case "Escape":
          // If items are selected, clear selection first (Esc to deselect all)
          if (selections.size > 0) {
            e.preventDefault();
            e.stopImmediatePropagation(); // Prevents Modal's Escape handler from firing
            setSelections(new Map());
          }
          // Otherwise let modal handle close
          break;

        case "Backspace":
          // Navigate back (like browser back)
          if (currentPath.length > 0) {
            e.preventDefault();
            navigateTo(currentPath.length - 2);
          }
          break;
      }
    };

    // Use capture phase to intercept Escape BEFORE Modal's document-level handler fires
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [isOpen, focusedIndex, sortedContents, selections, currentPath, navigateInto, navigateTo, toggleSelection, handleDoubleClick, handlePreview, viewMode]);

  // Reset focus when folder contents change
  useEffect(() => {
    setFocusedIndex(-1);
  }, [currentContents]);

  // Check if at root level
  const isAtRoot = currentPath.length === 0;

  // Add a new local folder
  const handleAddFolder = useCallback(async () => {
    try {
      const newFolder = await addFolder();
      if (newFolder) {
        // Reload root folders to show the new one
        await loadRootFolders();
      }
    } catch (err) {
      console.error("Failed to add folder:", err);
      setError("Failed to add folder. Please try again.");
    }
  }, []);

  // Remove a folder from the list
  const handleRemoveFolder = useCallback(async (id: string, name: string) => {
    if (!window.confirm(`Remove "${name}" from the folder list?\n\nThis won't delete the actual folder on disk.`)) {
      return;
    }
    try {
      await removeFolder(id);
      await loadRootFolders();
    } catch (err) {
      console.error("Failed to remove folder:", err);
      setError("Failed to remove folder. Please try again.");
    }
  }, []);

  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-amber-500" />
          <span>Browse Files</span>
        </div>
      }
      size="2xl"
    >
      <div className="flex flex-col md:flex-row gap-4 h-[60vh] md:h-[70vh]">
        {/* File browser panel */}
        <div className="h-1/2 md:h-full md:w-2/5 flex-shrink-0 flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading folders...
            </div>
          ) : rootFolders.length === 0 && !error ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
              <Folder className="h-10 w-10 mb-3 text-gray-400 opacity-50" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No folders configured.
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 mb-4">
                Add a local folder to browse, or set up shared drives in Settings
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddFolder}
                className="gap-2"
              >
                <FolderPlus className="h-4 w-4" />
                Add Folder
              </Button>
            </div>
          ) : (
            <>
              {/* Dismissible error banner */}
              {error && (
                <div className="flex items-center gap-2 p-3 mb-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
                  <span className="flex-1 text-sm text-red-700 dark:text-red-300">{error}</span>
                  <button
                    onClick={() => {
                      setError(null);
                      // Navigate back to root if we're in a failed folder
                      if (currentPath.length > 0) {
                        navigateTo(-1);
                      }
                    }}
                    className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-800 text-red-500 hover:text-red-700 transition-colors shrink-0"
                    title="Dismiss and go to root"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      setError(null);
                      // Retry loading current folder
                      if (currentHandle && currentPath.length > 0) {
                        const rootFolder = rootFolders.find(f => f.name === currentPath[0]);
                        loadFolderContents(currentHandle, currentPath.join("\\"), rootFolder?.id);
                      } else {
                        loadRootFolders();
                      }
                    }}
                    className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-800 text-red-500 hover:text-red-700 transition-colors shrink-0"
                    title="Retry"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* HEADER: Breadcrumb + View Toggle + Sort + Multi-select */}
              <div className="flex-shrink-0 pb-3 mb-3 border-b border-gray-200 dark:border-gray-700 bg-[#fef9f3] dark:bg-[#2d2618] space-y-2">
                {/* Row 1: Breadcrumb + Add Folder + View toggle */}
                <div className="flex items-center gap-2">
                  {/* Breadcrumb */}
                  <div className="flex items-center gap-1 text-sm flex-1 min-w-0 overflow-x-auto">
                    <button
                      onClick={() => navigateTo(-1)}
                      className={cn(
                        "shrink-0 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors",
                        isAtRoot && "text-amber-500"
                      )}
                      title="Root"
                    >
                      <Home className="h-4 w-4" />
                    </button>

                    {/* Add Folder button at root */}
                    {isAtRoot && (
                      <button
                        onClick={handleAddFolder}
                        className="shrink-0 ml-1 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-500 hover:text-amber-500"
                        title="Add local folder"
                      >
                        <FolderPlus className="h-4 w-4" />
                      </button>
                    )}
                    {currentPath.map((segment, i) => (
                      <Fragment key={i}>
                        <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                        <button
                          onClick={() => navigateTo(i)}
                          className={cn(
                            "hover:text-amber-500 truncate max-w-[120px] transition-colors",
                            i === currentPath.length - 1 && "font-medium text-amber-600 dark:text-amber-400"
                          )}
                          title={segment}
                        >
                          {segment}
                        </button>
                      </Fragment>
                    ))}
                  </div>

                  {/* View toggle */}
                  <div className="flex items-center gap-0.5 border border-gray-300 dark:border-gray-600 rounded-md p-0.5 shrink-0">
                    <button
                      onClick={() => setViewMode("list")}
                      className={cn(
                        "p-1 rounded transition-colors",
                        viewMode === "list"
                          ? "bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400"
                          : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                      )}
                      title="List view"
                    >
                      <List className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setViewMode("grid")}
                      className={cn(
                        "p-1 rounded transition-colors",
                        viewMode === "grid"
                          ? "bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400"
                          : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                      )}
                      title="Grid view"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Row 2: Sort + Search + Item count */}
                <div className="flex items-center gap-3">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                  >
                    <option value="name-asc">Name A→Z</option>
                    <option value="name-desc">Name Z→A</option>
                    <option value="date-desc">Newest first</option>
                    <option value="date-asc">Oldest first</option>
                  </select>

                  {/* Search input */}
                  <div className="relative flex-1 max-w-[200px]">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      placeholder="Filter... (Ctrl+F)"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-7 pr-7 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                        title="Clear search"
                      >
                        <X className="h-3 w-3 text-gray-400" />
                      </button>
                    )}
                  </div>

                  {loadingDates && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                  )}
                  <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                    {searchQuery.trim()
                      ? `${sortedContents.length} of ${sortedContentsRaw.length} items`
                      : hasMore
                        ? `${displayedContents.length} of ${sortedContents.length} items`
                        : sortedContents.length > 0
                          ? `${sortedContents.length} item${sortedContents.length !== 1 ? "s" : ""}`
                          : ""}
                  </span>
                </div>

                {/* Selection panel - shows when files selected with page range inputs */}
                {selections.size > 0 && (
                  <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                        {selections.size} file{selections.size !== 1 ? "s" : ""} selected
                        <span className="font-normal ml-1 opacity-70">(Esc to clear)</span>
                      </span>
                      <button
                        onClick={() => setSelections(new Map())}
                        className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
                      >
                        Clear all
                      </button>
                    </div>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {Array.from(selections.values()).map((sel) => (
                        <div key={sel.path} className="space-y-0.5">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="flex-1 truncate text-gray-700 dark:text-gray-300" title={sel.path}>
                              {sel.path.split("\\").pop()}
                            </span>
                            <input
                              type="text"
                              value={sel.pages}
                              onChange={(e) => updateSelectionPages(sel.path, e.target.value)}
                              placeholder={sel.pageCount ? `1-${sel.pageCount}` : "Pages"}
                              className={cn(
                                "w-20 px-1.5 py-0.5 text-xs border rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder:text-gray-400",
                                sel.error
                                  ? "border-red-400 focus:ring-red-400"
                                  : "border-gray-300 dark:border-gray-600 focus:ring-amber-400"
                              )}
                            />
                            {sel.pageCount && (
                              <span className="text-gray-400 shrink-0">/{sel.pageCount}</span>
                            )}
                            <button
                              onClick={() => removeSelection(sel.path)}
                              className="p-0.5 rounded hover:bg-amber-200 dark:hover:bg-amber-800 text-gray-400 hover:text-gray-600"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                          {sel.error && (
                            <p className="text-[10px] text-red-500 pl-1">{sel.error}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* SCROLLABLE CONTENT */}
              <div
                ref={contentScrollRef}
                className="flex-1 overflow-y-auto min-h-0"
              >
                {contentsLoading ? (
                  <div className="flex items-center justify-center py-8 text-gray-500 dark:text-gray-400">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Loading...
                  </div>
                ) : sortedContents.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <Folder className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No PDF files in this folder</p>
                  </div>
                ) : viewMode === "list" ? (
                  /* LIST VIEW - Explorer-like: click=preview, double-click=use, checkbox on hover */
                  <div className="space-y-0.5">
                    {displayedContents.map((node, index) => {
                      const isSelected = selections.has(node.path);
                      const isHovered = hoveredPath === node.path;
                      const showCheckbox = node.kind === "file" && (isHovered || isSelected);

                      const isFocused = focusedIndex === index;

                      return (
                        <div
                          key={node.id}
                          ref={(el) => { itemRefs.current[index] = el; }}
                          onClick={(e) => handleSingleClick(e, node, index)}
                          onDoubleClick={() => handleDoubleClick(node)}
                          onMouseEnter={() => setHoveredPath(node.path)}
                          onMouseLeave={() => setHoveredPath(null)}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all group",
                            "hover:bg-amber-50 dark:hover:bg-amber-900/20",
                            isSelected && "bg-amber-100 dark:bg-amber-900/40 ring-1 ring-amber-300 dark:ring-amber-700",
                            isFocused && !isSelected && "ring-2 ring-amber-400/50 bg-amber-50/50 dark:bg-amber-900/30"
                          )}
                        >
                          {/* Checkbox - visible on hover, multi-select mode, or when selected */}
                          {node.kind === "file" && (
                            <div className={cn(
                              "transition-opacity duration-100",
                              showCheckbox ? "opacity-100" : "opacity-0 pointer-events-none"
                            )}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                onClick={(e) => handleCheckboxClick(e, node, index)}
                                className="w-3.5 h-3.5 rounded border-gray-300 text-amber-500 focus:ring-amber-500 shrink-0 cursor-pointer"
                              />
                            </div>
                          )}
                          {/* Spacer for folders to maintain alignment */}
                          {node.kind === "folder" && <div className="w-3.5 shrink-0" />}

                          {/* Icon */}
                          {node.kind === "folder" ? (
                            node.isShared ? (
                              <FolderSync className="h-5 w-5 text-green-500 shrink-0" />
                            ) : (
                              <Folder className="h-5 w-5 text-amber-500 shrink-0" />
                            )
                          ) : (
                            <FileText className="h-5 w-5 text-red-500 shrink-0" />
                          )}

                          {/* Name */}
                          <span
                            className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate"
                            title={node.name}
                          >
                            {node.name}
                          </span>

                          {/* Warning icon for unavailable folders */}
                          {node.kind === "folder" && unavailableFolders.has(node.id) && (
                            <AlertTriangle
                              className="h-4 w-4 text-amber-500 shrink-0"
                              title="Folder unavailable - network may be disconnected"
                            />
                          )}

                          {/* Folder arrow */}
                          {node.kind === "folder" && (
                            <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                          )}

                          {/* Delete button for root folders */}
                          {isAtRoot && node.kind === "folder" && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRemoveFolder(node.id, node.name); }}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-all shrink-0"
                              title="Remove folder"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* GRID VIEW - Explorer-like: click=preview, double-click=use, checkbox on hover */
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 p-1">
                    {displayedContents.map((node, index) => {
                      const isSelected = selections.has(node.path);
                      const isHovered = hoveredPath === node.path;
                      const showCheckbox = node.kind === "file" && (isHovered || isSelected);
                      const isFocused = focusedIndex === index;

                      return (
                        <div
                          key={node.id}
                          ref={(el) => { itemRefs.current[index] = el; }}
                          onClick={(e) => handleSingleClick(e, node, index)}
                          onDoubleClick={() => handleDoubleClick(node)}
                          onMouseEnter={() => setHoveredPath(node.path)}
                          onMouseLeave={() => setHoveredPath(null)}
                          className={cn(
                            "flex flex-col items-center gap-1 p-3 rounded-lg cursor-pointer transition-all relative group",
                            "hover:bg-amber-50 dark:hover:bg-amber-900/20 border border-transparent",
                            "hover:border-amber-200 dark:hover:border-amber-700",
                            isSelected && "bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700",
                            isFocused && !isSelected && "ring-2 ring-amber-400/50 border-amber-200"
                          )}
                        >
                          {/* Checkbox overlay - visible on hover, multi-select mode, or when selected */}
                          {node.kind === "file" && (
                            <div className={cn(
                              "absolute top-1 left-1 transition-opacity duration-100",
                              showCheckbox ? "opacity-100" : "opacity-0 pointer-events-none"
                            )}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                onClick={(e) => handleCheckboxClick(e, node, index)}
                                className="w-3.5 h-3.5 rounded border-gray-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
                              />
                            </div>
                          )}

                          {/* Delete button for root folders */}
                          {isAtRoot && node.kind === "folder" && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRemoveFolder(node.id, node.name); }}
                              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-all"
                              title="Remove folder"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {/* Warning icon for unavailable folders */}
                          {node.kind === "folder" && unavailableFolders.has(node.id) && (
                            <div
                              className="absolute top-1 left-1 p-0.5 rounded bg-amber-100 dark:bg-amber-900/50"
                              title="Folder unavailable - network may be disconnected"
                            >
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                            </div>
                          )}

                          {/* Icon */}
                          {node.kind === "folder" ? (
                            node.isShared ? (
                              <FolderSync className="h-10 w-10 text-green-500" />
                            ) : (
                              <Folder className="h-10 w-10 text-amber-500" />
                            )
                          ) : (
                            <FileText className="h-10 w-10 text-red-500" />
                          )}

                          {/* Name */}
                          <span
                            className="text-xs text-center text-gray-700 dark:text-gray-300 truncate w-full"
                            title={node.name}
                          >
                            {node.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Show more button for pagination */}
                {hasMore && (
                  <button
                    onClick={() => setDisplayLimit(prev => prev + ITEMS_PER_PAGE)}
                    className="w-full py-3 mt-2 text-sm text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    Show {Math.min(remainingCount, ITEMS_PER_PAGE)} more
                    <span className="text-gray-400 dark:text-gray-500">
                      ({remainingCount} remaining)
                    </span>
                  </button>
                )}
              </div>

              {/* FOOTER */}
              <div className="flex-shrink-0 pt-3 mt-3 border-t border-gray-200 dark:border-gray-700 bg-[#fef9f3] dark:bg-[#2d2618] space-y-2">
                {/* Help text */}
                <div className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-2">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  {selections.size > 0
                    ? `${selections.size} selected. Double-click or use button below to add.`
                    : "Click to preview • Double-click to use • Checkbox to multi-select"}
                </div>

                {/* Keyboard shortcuts hint */}
                <div className="text-[10px] text-gray-400 dark:text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono">
                      {viewMode === "grid" ? "←↑↓→" : "↑↓"}
                    </kbd>
                    <span>navigate</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono">P</kbd>
                    <span>preview</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono">Enter</kbd>
                    <span>use</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono">Space</kbd>
                    <span>toggle</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono">Ctrl+A</kbd>
                    <span>all</span>
                  </span>
                </div>

                {/* Batch add button - shows when files are selected */}
                {selections.size > 0 && onFilesSelected && (
                  <Button
                    onClick={handleBatchAdd}
                    className="w-full"
                    disabled={Array.from(selections.values()).some((s) => s.error)}
                  >
                    Add {selections.size} Exercise{selections.size !== 1 ? "s" : ""}
                  </Button>
                )}

                {/* Assign to sessions button - shows when files are selected and allowAssignTo is true */}
                {selections.size > 0 && allowAssignTo && (
                  <Button
                    variant="outline"
                    onClick={() => setSessionSelectorOpen(true)}
                    className="w-full"
                    disabled={Array.from(selections.values()).some((s) => s.error)}
                  >
                    <CalendarPlus className="h-4 w-4 mr-2" />
                    Assign to Sessions...
                  </Button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Preview panel - constrained width to prevent overflow with wide PDFs */}
        <div className="h-1/2 md:h-full md:flex-1 md:max-w-[55%] lg:max-w-[60%] flex flex-col border-t md:border-t-0 md:border-l border-gray-200 dark:border-gray-700 pt-4 md:pt-0 md:pl-4">
          {previewUrl ? (
            <>
              {/* Preview header */}
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                  {previewNode?.name}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleZoomOut}
                    disabled={zoomIndex === 0}
                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Zoom out"
                  >
                    <ZoomOut className="h-4 w-4 text-gray-500" />
                  </button>
                  <span className="text-xs text-gray-500 w-12 text-center">{currentZoom}%</span>
                  <button
                    onClick={handleZoomIn}
                    disabled={zoomIndex === ZOOM_LEVELS.length - 1}
                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Zoom in"
                  >
                    <ZoomIn className="h-4 w-4 text-gray-500" />
                  </button>
                  <button
                    onClick={handleOpenInNewTab}
                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ml-2"
                    title="Open in new tab"
                  >
                    <ExternalLink className="h-4 w-4 text-gray-500" />
                  </button>
                </div>
              </div>

              {/* Handwriting removal toolbar */}
              <HandwritingRemovalToolbar
                pdfBlobUrl={previewUrl}
                filename={previewNode?.name}
                onCleanedPdf={handleCleanedPdf}
                showCleaned={showCleanedPreview}
                onToggleCleaned={() => setShowCleanedPreview(!showCleanedPreview)}
                className="mb-2 py-2 border-b border-gray-200/50 dark:border-gray-700/50"
              />

              {/* PDF iframe - overflow-auto allows internal scrolling for wide PDFs */}
              <div className="flex-1 relative bg-gray-100 dark:bg-gray-900 rounded-lg overflow-auto">
                {previewLoading ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
                  </div>
                ) : (
                  <iframe
                    src={showCleanedPreview && cleanedPreviewUrl ? cleanedPreviewUrl : previewUrl}
                    className="w-full h-full border-0"
                    style={{ transform: `scale(${currentZoom / 100})`, transformOrigin: "top left" }}
                    title="PDF Preview"
                  />
                )}
              </div>

              {/* Preview footer */}
              <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 space-y-2">
                {/* Page range inputs - radio button format */}
                <div className="space-y-2">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="radio"
                        checked={previewPageMode === "simple"}
                        onChange={() => setPreviewPageMode("simple")}
                        className="text-amber-500 focus:ring-amber-500"
                      />
                      <span className="text-gray-700 dark:text-gray-300">Range</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="radio"
                        checked={previewPageMode === "custom"}
                        onChange={() => setPreviewPageMode("custom")}
                        className="text-amber-500 focus:ring-amber-500"
                      />
                      <span className="text-gray-700 dark:text-gray-300">Custom</span>
                    </label>
                    {previewPageCount && (
                      <span className="text-xs text-gray-400 ml-auto">({previewPageCount} pages)</span>
                    )}
                  </div>

                  {previewPageMode === "simple" ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={previewPageCount || undefined}
                        value={previewPageStart}
                        onChange={(e) => {
                          setPreviewPageStart(e.target.value);
                          if (previewPageCount) {
                            const val = parseInt(e.target.value);
                            if (val && (val < 1 || val > previewPageCount)) {
                              setPreviewPagesError(`Page must be 1-${previewPageCount}`);
                            } else {
                              setPreviewPagesError(null);
                            }
                          }
                        }}
                        placeholder="From"
                        className={cn(
                          "w-16 px-2 py-1 text-sm border rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder:text-gray-400",
                          previewPagesError ? "border-red-400" : "border-gray-300 dark:border-gray-600"
                        )}
                      />
                      <span className="text-gray-400 text-sm">to</span>
                      <input
                        type="number"
                        min={1}
                        max={previewPageCount || undefined}
                        value={previewPageEnd}
                        onChange={(e) => {
                          setPreviewPageEnd(e.target.value);
                          if (previewPageCount) {
                            const val = parseInt(e.target.value);
                            if (val && (val < 1 || val > previewPageCount)) {
                              setPreviewPagesError(`Page must be 1-${previewPageCount}`);
                            } else {
                              setPreviewPagesError(null);
                            }
                          }
                        }}
                        placeholder="To"
                        className={cn(
                          "w-16 px-2 py-1 text-sm border rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder:text-gray-400",
                          previewPagesError ? "border-red-400" : "border-gray-300 dark:border-gray-600"
                        )}
                      />
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={previewComplexPages}
                      onChange={(e) => {
                        setPreviewComplexPages(e.target.value);
                        if (previewPageCount) {
                          setPreviewPagesError(validatePageInput(e.target.value, previewPageCount));
                        }
                      }}
                      placeholder="e.g., 1,3,5-7"
                      className={cn(
                        "w-full px-2 py-1 text-sm border rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder:text-gray-400",
                        previewPagesError ? "border-red-400" : "border-gray-300 dark:border-gray-600"
                      )}
                    />
                  )}

                  {previewPagesError && (
                    <p className="text-xs text-red-500">{previewPagesError}</p>
                  )}
                </div>

                {/* Path and buttons */}
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate flex-1 mr-2">
                    {previewNode?.path}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleClosePreview}>
                      Close
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleUsePreviewedFile}
                      disabled={!!previewPagesError}
                    >
                      Use This File
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
              <Eye className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                No preview selected
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Click the <Eye className="h-3 w-3 inline mx-0.5" /> icon next to a PDF to preview it
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>

      {/* Session Selector Modal for assigning files to sessions */}
      {allowAssignTo && (
        <SessionSelectorModal
          isOpen={sessionSelectorOpen}
          onClose={() => setSessionSelectorOpen(false)}
          files={Array.from(selections.values())}
          onAssignComplete={() => {
            setSessionSelectorOpen(false);
            onAssignComplete?.();
          }}
        />
      )}
    </>
  );
}
