"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { Session } from "@/types";
import { sessionsAPI } from "@/lib/api";
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
import { parseExerciseRemarks, detectPageMode } from "@/lib/exercise-utils";
import { CoursewarePicker, type CoursewarePickerProps } from '@/components/courseware/CoursewarePicker';
import { TrendingCoursewareSection } from '@/components/sessions/TrendingCoursewareSection';
import { getPageCount } from "@/lib/pdf-utils";


interface ZenExerciseAssignProps {
  session: Session;
  exerciseType: "CW" | "HW";
  onClose: () => void;
  onAssigned?: () => void;
}

type FocusArea = "exercises" | "pages" | "browse";

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
 * Exercise assignment using the shared courseware picker
 *
 * Features:
 * - Multiple exercises per session
 * - Shared courseware search, filters and PDF preview
 * - Multiple-file selection with per-file page ranges
 * - Batch print all
 * - Usage details (expandable)
 *
 * Keyboard controls:
 * - /: Open courseware search
 * - Enter: Assign from page inputs
 * - a or +: Add new exercise row
 * - d or -: Delete current exercise row
 * - Ctrl+j/k: Navigate between exercise rows
 * - Ctrl+m: Open multiple-file courseware selection
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [focusArea, setFocusArea] = useState<FocusArea>("exercises");
  const initialExercises = useMemo(() => {
    const longType = exerciseType === "CW" ? "Classwork" : "Homework";
    return (session.exercises || [])
      .filter(ex => ex.exercise_type === exerciseType || ex.exercise_type === longType)
      .map(ex => {
        const { complexPages } = parseExerciseRemarks(ex.remarks);
        const pageMode = detectPageMode(ex.page_start, ex.page_end, complexPages);
        return {
          id: `ex-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          pdf_name: ex.pdf_name,
          page_mode: pageMode,
          page_start: ex.page_start?.toString() || "",
          page_end: ex.page_end?.toString() || "",
          custom_pages: complexPages || "",
        } as ZenExerciseItem;
      });
  }, [session.exercises, exerciseType]);
  const [exercises, setExercises] = useState<ZenExerciseItem[]>(initialExercises);
  const [activeExerciseIndex, setActiveExerciseIndex] = useState(0);

  // Usage details expansion
  // Local folders state
  const [savedFolders, setSavedFolders] = useState<SavedFolder[]>([]);
  const [showFoldersDropdown, setShowFoldersDropdown] = useState(false);
  const [folderCursorIndex, setFolderCursorIndex] = useState(0);

  // Browse mode state
  const [browseMode, setBrowseMode] = useState(false);
  const [browsePath, setBrowsePath] = useState<string[]>([]); // ["RootFolder", "SubFolder"]
  const [, setBrowseHandle] = useState<FileSystemDirectoryHandle | null>(null);
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
  const browseContainerRef = useRef<HTMLDivElement>(null);

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
    setFocusArea("exercises");
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
  const handleSelectFile = useCallback((path: string) => {
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

  }, [exercises.length]);

  const handlePickCourseware: NonNullable<CoursewarePickerProps['onMultiSelect']> = files => {
    const additions = files.map(file => ({ id: generateId(), pdf_name: file.path,
      page_mode: file.pageSelection?.complexRange ? "custom" as const : "simple" as const,
      page_start: file.pageSelection?.pageStart?.toString() || "", page_end: file.pageSelection?.pageEnd?.toString() || "",
      custom_pages: file.pageSelection?.complexRange || "" }));
    setExercises(previous => [...previous, ...additions]);
    setActiveExerciseIndex(exercises.length); setFocusArea("exercises");
    setStatusMessage(`Added ${additions.length} file${additions.length === 1 ? '' : 's'}`);
  };

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
    const error = await openFileFromPathWithFallback(filePath, undefined);
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

    const error = await printFileFromPathWithFallback(ex.pdf_name, start, end, complex, stamp, undefined);
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
    const error = await printBulkFiles(items, stamp, undefined);
    if (error) {
      setStatusMessage(`Batch print failed: ${error}`);
    } else {
      setStatusMessage("Batch print sent!");
    }
  }, [exercises, buildStampInfo]);

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (pickerOpen) return;
      const target = e.target as HTMLElement;
      const isInInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;

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

        } else if (showFoldersDropdown) {
          setShowFoldersDropdown(false);
        } else if (browseMode) {
          exitBrowseMode();

        } else {
          onClose();
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

      if ((e.key === "/" || (e.ctrlKey && e.key === "m")) && !isInInput) { e.preventDefault(); setPickerOpen(true); return; }

      // Toggle browse mode: b
      if (e.key === "b" && !isInInput && !e.ctrlKey) {
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
  }, [pickerOpen, focusArea, exercises, activeExerciseIndex, showFoldersDropdown, savedFolders, folderCursorIndex,
    onClose, handleDeleteExercise, handleOpenFile, handlePrintFile, handleBatchPrint, handleAssign, handlePickFromFolder, handleAddNewFolder,
    browseMode, browseContents, browseIndex, browsePath, enterBrowseMode, exitBrowseMode, browseUp, browseIntoFolder, browseSelectFile,
    browsePreviewUrl, browsePreviewNode, handleBrowsePreview, closeBrowsePreview, handleBrowseDeleteFolder, previewPageStart, previewPageEnd, previewPageError]);

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
          {initialExercises.length > 0 ? "EDIT" : "ASSIGN"} {title}{initialExercises.length > 0 ? ` (${initialExercises.length})` : ""}
        </span>
        <span style={{ color: "var(--zen-dim)", fontSize: "10px" }}>
          / search • a add • d delete • Ctrl+j/k rows • Esc cancel
        </span>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <button onClick={() => setPickerOpen(true)}>Search courseware [/]</button>
        <button onClick={() => browseMode ? exitBrowseMode() : enterBrowseMode()}>Browse connected folders [b]</button>
        <button onClick={() => setShowFoldersDropdown(value => !value)}>Connected folders</button>
      </div>

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

      {!browseMode && <TrendingCoursewareSection exerciseType={exerciseType} grade={session.grade} school={session.school} location={session.location} onAdd={handleSelectFile} />}

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
          [/] Search • [B]rowse • [O]pen • [P]rint
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

      <CoursewarePicker isOpen={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={(path, pageSelection) => handlePickCourseware([{ path, pageSelection }])} multiSelect onMultiSelect={handlePickCourseware} exerciseType={exerciseType} studentGrade={session.grade} school={session.school} location={session.location} />
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
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [pdfFocused, setPdfFocused] = useState(false);
  useEffect(() => {
    if (isActive && !exercise.pdf_name && pdfInputRef.current) {
      pdfInputRef.current.focus();
    }
  }, [isActive, exercise.pdf_name]);

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
      <input
        ref={pdfInputRef}
        type="text"
        value={exercise.pdf_name}
        onChange={(e) => onUpdate("pdf_name", e.target.value)}
        onFocus={() => { onFocus(); setPdfFocused(true); }}
        onBlur={() => setPdfFocused(false)}
        placeholder="paste or type PDF path"
        style={{
          flex: 1,
          backgroundColor: "var(--zen-bg)",
          border: "none",
          borderBottom: pdfFocused ? "1px solid var(--zen-accent)" : "1px solid var(--zen-border)",
          color: "var(--zen-fg)",
          padding: "1px 3px",
          fontFamily: "inherit",
          fontSize: "11px",
          outline: "none",
          boxShadow: pdfFocused ? "0 1px 0 var(--zen-accent)" : "none",
        }}
        title={exercise.pdf_name}
      />

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

export default ZenExerciseAssign;
