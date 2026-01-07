"use client";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getSavedFolders,
  verifyPermission,
  addFolder,
  removeFolder,
  type SavedFolder,
} from "@/lib/file-system";

interface TreeNode {
  id: string;
  name: string;
  path: string;
  kind: "folder" | "file";
  handle?: FileSystemDirectoryHandle | FileSystemFileHandle;
  isShared?: boolean;
}

interface FolderTreeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFileSelected: (path: string) => void;
  /** Handler for batch adding multiple files (multi-select mode) */
  onFilesSelected?: (paths: string[]) => void;
  /** Enable multi-select toggle */
  allowMultiSelect?: boolean;
  /** Initial path to navigate to (e.g., "Center\\Math\\file.pdf") */
  initialPath?: string;
}

type SortOption = "name-asc" | "name-desc";
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

  // Sort state
  const [sortBy, setSortBy] = useState<SortOption>("name-asc");

  // Pagination state for large folders
  const ITEMS_PER_PAGE = 100;
  const [displayLimit, setDisplayLimit] = useState(ITEMS_PER_PAGE);

  // Selection state (multi-select via checkbox hover + Ctrl/Shift+Click)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  // Explorer-like UX state (hover to show checkbox, click to preview, double-click to use)
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

  // Keyboard navigation state
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Scroll ref
  const contentScrollRef = useRef<HTMLDivElement>(null);

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
      setCurrentPath([]);
      setCurrentHandle(null);
      setCurrentContents([]);
      setSelectedPaths(new Set());
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

      // Convert to nodes
      const nodes: TreeNode[] = folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        path: folder.name,
        kind: "folder" as const,
        handle: folder.handle,
        isShared: folder.isShared,
      }));

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

  // Navigate to initial path (e.g., "Center\Math\file.pdf")
  const navigateToInitialPath = async (path: string) => {
    const parts = path.split("\\").filter(Boolean);
    if (parts.length === 0) return;

    // Find root folder
    const rootName = parts[0];
    const rootFolder = rootFolders.find((f) => f.name === rootName);
    if (!rootFolder || !rootFolder.handle) return;

    try {
      // Navigate to the parent folder of the file (not including the filename)
      const folderParts = parts.slice(0, -1); // Remove filename
      if (folderParts.length === 0) return;

      let currentDir = rootFolder.handle as FileSystemDirectoryHandle;
      const pathSoFar: string[] = [rootName];

      // Navigate through each subfolder
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
  const loadFolderContents = async (handle: FileSystemDirectoryHandle, basePath: string) => {
    setContentsLoading(true);
    setError(null);

    try {
      // Verify permission
      const hasPermission = await verifyPermission(handle);
      if (!hasPermission) {
        setError(`Permission denied. Please grant access in Settings.`);
        setContentsLoading(false);
        return;
      }

      const contents: TreeNode[] = [];
      let count = 0;
      const CHUNK_SIZE = 100; // Yield to UI every 100 items

      for await (const [name, entryHandle] of handle.entries()) {
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

      setCurrentContents(contents);
      setDisplayLimit(ITEMS_PER_PAGE); // Reset pagination when folder changes
    } catch (err) {
      console.error("Failed to load folder contents:", err);
      setError("Failed to load folder contents.");
    } finally {
      setContentsLoading(false);
    }
  };

  // Navigate into a folder
  const navigateInto = useCallback(async (node: TreeNode) => {
    if (node.kind !== "folder" || !node.handle) return;

    const dirHandle = node.handle as FileSystemDirectoryHandle;
    const newPath = [...currentPath, node.name];

    setCurrentPath(newPath);
    setCurrentHandle(dirHandle);
    await loadFolderContents(dirHandle, newPath.join("\\"));

    // Scroll to top
    if (contentScrollRef.current) {
      contentScrollRef.current.scrollTop = 0;
    }
  }, [currentPath]);

  // Navigate via breadcrumb
  const navigateTo = useCallback(async (index: number) => {
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

    // Start from root folder
    const rootName = newPath[0];
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
      // Folders first
      if (a.kind !== b.kind) {
        return a.kind === "folder" ? -1 : 1;
      }
      // Then by sort option
      switch (sortBy) {
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "name-asc":
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [sortBy]);

  // Toggle file selection
  const toggleSelection = useCallback((path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Sort current contents - needed early for click/keyboard handlers
  const sortedContents = sortNodes(currentContents);

  // Pagination: only render a subset for performance with large folders
  const displayedContents = sortedContents.slice(0, displayLimit);
  const hasMore = sortedContents.length > displayLimit;
  const remainingCount = sortedContents.length - displayLimit;

  // Handle preview - defined early since it's used by handleSingleClick
  const handlePreview = useCallback(async (node: TreeNode) => {
    if (node.kind !== "file" || !node.handle) return;

    setPreviewLoading(true);
    setPreviewNode(node);

    try {
      const fileHandle = node.handle as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      const url = URL.createObjectURL(file);

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
        toggleSelection(node.path);
        setLastClickedIndex(index);
      }
      return;
    }

    // Shift+Click: range selection
    if (e.shiftKey && lastClickedIndex !== null && node.kind === "file") {
      const start = Math.min(lastClickedIndex, index);
      const end = Math.max(lastClickedIndex, index);
      const rangePaths = sortedContents
        .slice(start, end + 1)
        .filter((n) => n.kind === "file")
        .map((n) => n.path);
      setSelectedPaths((prev) => {
        const next = new Set(prev);
        rangePaths.forEach((p) => next.add(p));
        return next;
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
      if (selectedPaths.size > 0 && onFilesSelected) {
        // Batch add all selected + this one (if not already selected)
        const paths = new Set(selectedPaths);
        paths.add(node.path);
        onFilesSelected(Array.from(paths));
      } else {
        // Single file selection
        onFileSelected(node.path);
      }
      onClose();
    }
  }, [selectedPaths, onFilesSelected, onFileSelected, onClose]);

  // Checkbox click: toggle selection (stops propagation to prevent other click handlers)
  const handleCheckboxClick = useCallback((e: React.MouseEvent, node: TreeNode, index: number) => {
    e.stopPropagation();
    toggleSelection(node.path);
    setLastClickedIndex(index);
  }, [toggleSelection]);

  // Handle batch add
  const handleBatchAdd = useCallback(() => {
    if (onFilesSelected && selectedPaths.size > 0) {
      onFilesSelected(Array.from(selectedPaths));
      onClose();
    }
  }, [onFilesSelected, selectedPaths, onClose]);

  // Close preview
  const handleClosePreview = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setPreviewNode(null);
  }, [previewUrl]);

  // Use previewed file
  const handleUsePreviewedFile = useCallback(() => {
    if (previewNode) {
      onFileSelected(previewNode.path);
      onClose();
    }
  }, [previewNode, onFileSelected, onClose]);

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
      // Don't handle if user is typing in a text input (but allow checkboxes)
      if (e.target instanceof HTMLInputElement && e.target.type !== "checkbox") {
        return;
      }
      if (e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const totalItems = sortedContents.length;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((prev) => {
            const next = prev < totalItems - 1 ? prev + 1 : totalItems - 1;
            itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
            return next;
          });
          // Ctrl+Shift+Down: extend selection while navigating
          if (e.ctrlKey && e.shiftKey) {
            const nextIndex = Math.min(focusedIndex + 1, totalItems - 1);
            const node = sortedContents[nextIndex];
            if (node?.kind === "file") {
              setSelectedPaths((prev) => new Set(prev).add(node.path));
            }
          }
          break;

        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((prev) => {
            const next = prev > 0 ? prev - 1 : 0;
            itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
            return next;
          });
          // Ctrl+Shift+Up: extend selection while navigating
          if (e.ctrlKey && e.shiftKey) {
            const nextIndex = Math.max(focusedIndex - 1, 0);
            const node = sortedContents[nextIndex];
            if (node?.kind === "file") {
              setSelectedPaths((prev) => new Set(prev).add(node.path));
            }
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
              toggleSelection(node.path);
            }
          }
          break;

        case "a":
          // Ctrl+A: Select all files
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const allFilePaths = sortedContents
              .filter((n) => n.kind === "file")
              .map((n) => n.path);
            setSelectedPaths(new Set(allFilePaths));
          }
          break;

        case "Escape":
          // If items are selected, clear selection first (Esc to deselect all)
          if (selectedPaths.size > 0) {
            e.preventDefault();
            e.stopImmediatePropagation(); // Prevents Modal's Escape handler from firing
            setSelectedPaths(new Set());
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
  }, [isOpen, focusedIndex, sortedContents, selectedPaths, currentPath, navigateInto, navigateTo, toggleSelection, handleDoubleClick]);

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
          ) : error ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="h-5 w-5 shrink-0" />
              {error}
            </div>
          ) : rootFolders.length === 0 ? (
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

                {/* Row 2: Sort + Item count */}
                <div className="flex items-center gap-3">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                  >
                    <option value="name-asc">Name A→Z</option>
                    <option value="name-desc">Name Z→A</option>
                  </select>
                  {sortedContents.length > 0 && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {hasMore
                        ? `${displayedContents.length} of ${sortedContents.length} items`
                        : `${sortedContents.length} item${sortedContents.length !== 1 ? "s" : ""}`}
                    </span>
                  )}
                </div>

                {/* Selection banner - always shows when files selected */}
                {selectedPaths.size > 0 && (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                      {selectedPaths.size} file{selectedPaths.size !== 1 ? "s" : ""} selected
                      <span className="text-xs font-normal ml-2 opacity-70">(Esc to clear)</span>
                    </span>
                    <button
                      onClick={() => setSelectedPaths(new Set())}
                      className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
                    >
                      Clear
                    </button>
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
                      const isSelected = selectedPaths.has(node.path);
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
                      const isSelected = selectedPaths.has(node.path);
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
                  {selectedPaths.size > 0
                    ? `${selectedPaths.size} selected. Double-click or use button below to add.`
                    : "Click to preview • Double-click to use • Checkbox to multi-select"}
                </div>

                {/* Keyboard shortcuts hint */}
                <div className="text-[10px] text-gray-400 dark:text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono">↑↓</kbd>
                    <span>navigate</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono">Enter</kbd>
                    <span>select</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono">Space</kbd>
                    <span>toggle</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono">Ctrl+A</kbd>
                    <span>select all</span>
                  </span>
                </div>

                {/* Batch add button - shows when files are selected */}
                {selectedPaths.size > 0 && onFilesSelected && (
                  <Button onClick={handleBatchAdd} className="w-full">
                    Add {selectedPaths.size} Exercise{selectedPaths.size !== 1 ? "s" : ""}
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

              {/* PDF iframe - overflow-auto allows internal scrolling for wide PDFs */}
              <div className="flex-1 relative bg-gray-100 dark:bg-gray-900 rounded-lg overflow-auto">
                {previewLoading ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
                  </div>
                ) : (
                  <iframe
                    src={previewUrl}
                    className="w-full h-full border-0"
                    style={{ transform: `scale(${currentZoom / 100})`, transformOrigin: "top left" }}
                    title="PDF Preview"
                  />
                )}
              </div>

              {/* Preview footer */}
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate flex-1 mr-2">
                  {previewNode?.path}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleClosePreview}>
                    Close
                  </Button>
                  <Button size="sm" onClick={handleUsePreviewedFile}>
                    Use This File
                  </Button>
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
  );
}
