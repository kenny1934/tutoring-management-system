"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Plus, PenTool, Home, ExternalLink, Printer, Loader2, XCircle, TrendingUp, Flame, User, ChevronDown, ChevronRight, Eye, EyeOff, Info, ChevronUp, History, Star, Copy, Check, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { getGradeColor } from "@/lib/constants";
import { sessionsAPI, api } from "@/lib/api";
import { updateSessionInCache } from "@/lib/session-cache";
import { useToast } from "@/contexts/ToastContext";
import type { Session, PageSelection, CoursewarePopularity } from "@/types";
import Link from "next/link";
import { isFileSystemAccessSupported, openFileFromPathWithFallback, printFileFromPathWithFallback, printBulkFiles, downloadBulkFiles, PrintStampInfo, convertToAliasPath } from "@/lib/file-system";
import { FolderTreeModal, FileSelection } from "@/components/ui/folder-tree-modal";
import { PaperlessSearchModal } from "@/components/ui/paperless-search-modal";
import { FileSearchModal } from "@/components/ui/file-search-modal";
import { CopyPathButton } from "@/components/ui/copy-path-button";
import { useCoursewarePopularity, useCoursewareUsageDetail, useSession } from "@/lib/hooks";
import { PdfPreviewModal } from "@/components/ui/pdf-preview-modal";
import type { PaperlessDocument } from "@/lib/api";
import { parseExerciseRemarks, detectPageMode, combineExerciseRemarks, validateExercisePageRange, parsePageInput, type ExerciseValidationError } from "@/lib/exercise-utils";
import { useFormDirtyTracking, useDeleteConfirmation } from "@/lib/ui-hooks";
import { ExercisePageRangeInput } from "./ExercisePageRangeInput";
import { ExerciseActionButtons } from "./ExerciseActionButtons";
import { ExerciseDeleteButton } from "./ExerciseDeleteButton";
import { searchPaperlessByPath } from "@/lib/paperless-utils";


// Exercise form item type
export interface ExerciseFormItem {
  id?: number;
  clientId: string;               // Stable client-side ID for state tracking
  exercise_type: "CW" | "HW";
  pdf_name: string;
  page_mode: 'simple' | 'custom';  // Tracks which page input mode is active
  page_start: string;              // For simple mode
  page_end: string;                // For simple mode
  complex_pages: string;           // For custom mode (e.g., "1,3,5-7")
  remarks: string;
}

// Generate unique client ID for exercise rows
let clientIdCounter = 0;
function generateClientId(): string {
  return `ex-${Date.now()}-${++clientIdCounter}`;
}


interface ExerciseModalProps {
  session: Session;
  exerciseType: "CW" | "HW";
  isOpen: boolean;
  onClose: () => void;
  onSave?: (sessionId: number, exercises: ExerciseFormItem[]) => void;
}

// Component for displaying exercise items in Recap section with action buttons
function RecapExerciseItem({ pdfName, pageStart, pageEnd }: {
  pdfName: string;
  pageStart?: number;
  pageEnd?: number;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [openState, setOpenState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [printState, setPrintState] = useState<'idle' | 'loading' | 'error'>('idle');
  const canBrowseFiles = typeof window !== 'undefined' && isFileSystemAccessSupported();

  // Parse display name from full path
  const displayName = pdfName.includes('/') || pdfName.includes('\\')
    ? pdfName.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || pdfName
    : pdfName.replace(/\.[^.]+$/, '');

  const pageInfo = pageStart && pageEnd && pageStart !== pageEnd
    ? `(p${pageStart}-${pageEnd})`
    : pageStart ? `(p${pageStart})` : null;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(pdfName);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 1500);
    } catch {
      setCopyState('failed');
      setTimeout(() => setCopyState('idle'), 1500);
    }
  };

  const handleOpen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (openState === 'loading') return;
    setOpenState('loading');
    const error = await openFileFromPathWithFallback(pdfName, searchPaperlessByPath);
    if (error) {
      console.warn('Failed to open file:', error);
      setOpenState('error');
      setTimeout(() => setOpenState('idle'), 2000);
    } else {
      setOpenState('idle');
    }
  };

  const handlePrint = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (printState === 'loading') return;
    setPrintState('loading');
    const error = await printFileFromPathWithFallback(
      pdfName,
      pageStart,
      pageEnd,
      undefined,
      undefined,
      searchPaperlessByPath
    );
    if (error) {
      console.warn('Failed to print file:', error);
      setPrintState('error');
      setTimeout(() => setPrintState('idle'), 2000);
    } else {
      setPrintState('idle');
    }
  };

  return (
    <div className="flex items-center gap-1.5 text-xs min-w-0">
      <span className="truncate text-gray-700 dark:text-gray-300 min-w-0" title={pdfName}>
        {displayName}
      </span>
      {pageInfo && <span className="text-gray-500 flex-shrink-0">{pageInfo}</span>}

      {/* Copy button */}
      <button type="button" onClick={handleCopy} className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex-shrink-0" title="Copy path">
        {copyState === 'copied' ? <Check className="h-3 w-3 text-green-500" /> :
         copyState === 'failed' ? <XCircle className="h-3 w-3 text-red-500" /> :
         <Copy className="h-3 w-3 text-gray-400" />}
      </button>

      {/* Open/Print buttons - only if file system supported */}
      {canBrowseFiles && (
        <>
          <button type="button" onClick={handleOpen} disabled={openState === 'loading'} className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex-shrink-0" title="Open file">
            {openState === 'loading' ? <Loader2 className="h-3 w-3 animate-spin text-gray-400" /> :
             openState === 'error' ? <XCircle className="h-3 w-3 text-red-500" /> :
             <ExternalLink className="h-3 w-3 text-gray-400" />}
          </button>
          <button type="button" onClick={handlePrint} disabled={printState === 'loading'} className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex-shrink-0" title="Print file">
            {printState === 'loading' ? <Loader2 className="h-3 w-3 animate-spin text-gray-400" /> :
             printState === 'error' ? <XCircle className="h-3 w-3 text-red-500" /> :
             <Printer className="h-3 w-3 text-gray-400" />}
          </button>
        </>
      )}
    </div>
  );
}

export function ExerciseModal({
  session,
  exerciseType,
  isOpen,
  onClose,
  onSave,
}: ExerciseModalProps) {
  // Filter existing exercises to only show the relevant type
  const [exercises, setExercises] = useState<ExerciseFormItem[]>([]);
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);
  const [canBrowseFiles, setCanBrowseFiles] = useState(false);
  const [folderTreeOpen, setFolderTreeOpen] = useState(false);
  const [browsingForIndex, setBrowsingForIndex] = useState<number | null>(null);
  const [fileActionState, setFileActionState] = useState<Record<string, { open?: 'loading' | 'error'; print?: 'loading' | 'error' }>>({});
  const [paperlessSearchOpen, setPaperlessSearchOpen] = useState(false);
  const [searchingForIndex, setSearchingForIndex] = useState<number | null>(null);
  const [printAllState, setPrintAllState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [downloadAllState, setDownloadAllState] = useState<'idle' | 'loading' | 'error'>('idle');

  // Drag-drop file search state
  const [isDraggingOver, setIsDraggingOver] = useState<number | null>(null);
  const [fileSearchOpen, setFileSearchOpen] = useState(false);
  const [searchFilename, setSearchFilename] = useState("");
  const [searchForIndex, setSearchForIndex] = useState<number | null>(null);

  // Multi-file drag-drop batch search state
  const [batchSearchOpen, setBatchSearchOpen] = useState(false);
  const [searchFilenames, setSearchFilenames] = useState<string[]>([]);

  // Form dirty tracking and close confirmation (from ui-hooks)
  const {
    isDirty,
    setIsDirty,
    showCloseConfirm,
    setShowCloseConfirm,
    handleCloseAttempt,
    confirmDiscard,
    cancelClose,
  } = useFormDirtyTracking(isOpen, onClose);

  // Delete confirmation (from ui-hooks)
  const handleDeleteExercise = useCallback((index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index));
    setIsDirty(true);
    setFocusedRowIndex(null);
  }, [setIsDirty]);

  const {
    pendingIndex: pendingDeleteIndex,
    requestDelete,
    confirmDelete,
    cancelDelete,
    isPending: isDeletePending,
  } = useDeleteConfirmation(handleDeleteExercise);

  // Validation errors
  const [validationErrors, setValidationErrors] = useState<ExerciseValidationError[]>([]);

  // Trending section state
  const [trendingExpanded, setTrendingExpanded] = useState(false);
  const [trendingPreviewDoc, setTrendingPreviewDoc] = useState<PaperlessDocument | null>(null);
  const [previewableTrending, setPreviewableTrending] = useState<Map<string, PaperlessDocument>>(new Map());
  const [unavailableTrending, setUnavailableTrending] = useState<Set<string>>(new Set());
  const [checkingPreview, setCheckingPreview] = useState<Set<string>>(new Set());
  const [detailItem, setDetailItem] = useState<CoursewarePopularity | null>(null);

  // Recap section state
  const [recapExpanded, setRecapExpanded] = useState(false);

  // Fetch detailed session data for recap (previous session, homework completion)
  const { data: detailedSession, isLoading: isLoadingDetails } = useSession(session?.id ?? 0);

  // Compute recap data
  const uncheckedHwCount = detailedSession?.homework_completion?.filter(
    hw => !hw.completion_status || hw.completion_status === "Not Checked"
  ).length || 0;

  const starCount = detailedSession?.previous_session?.performance_rating
    ? (detailedSession.previous_session.performance_rating.match(/⭐/g) || []).length
    : 0;

  const prevClasswork = detailedSession?.previous_session?.exercises?.filter(
    ex => ex.exercise_type === "Classwork" || ex.exercise_type === "CW"
  ) || [];

  // Fetch trending courseware for this grade/school
  const { data: trendingData, isLoading: trendingLoading } = useCoursewarePopularity(
    "recent",
    exerciseType,
    session.grade,
    session.school
  );

  // Fetch usage details for expanded trending item
  const { data: usageDetails, isLoading: usageDetailsLoading } = useCoursewareUsageDetail(
    detailItem?.filename ?? null,
    'recent',
    10,
    undefined,
    session.grade,
    session.school
  );

  // Toast for error notifications
  const { showToast } = useToast();

  // Check for File System Access API support on mount
  useEffect(() => {
    setCanBrowseFiles(isFileSystemAccessSupported());
  }, []);


  // Track if form has been initialized for this modal open
  const initializedRef = useRef(false);

  // Reset form only when modal first opens, not on session changes
  useEffect(() => {
    if (isOpen && !initializedRef.current) {
      initializedRef.current = true;
      const filteredExercises = (session.exercises || [])
        .filter((ex) => {
          const type = ex.exercise_type === "Classwork" ? "CW" : ex.exercise_type === "Homework" ? "HW" : ex.exercise_type;
          return type === exerciseType;
        })
        .map((ex) => {
          const { complexPages, remarks } = parseExerciseRemarks(ex.remarks);
          const pageMode = detectPageMode(ex.page_start, ex.page_end, complexPages);
          return {
            id: ex.id,
            clientId: generateClientId(),
            exercise_type: exerciseType,
            pdf_name: ex.pdf_name,
            page_mode: pageMode,
            page_start: ex.page_start?.toString() || "",
            page_end: ex.page_end?.toString() || "",
            complex_pages: complexPages,
            remarks: remarks,
          };
        });
      setExercises(filteredExercises);
      setIsDirty(false);
      setValidationErrors([]);
    }
    if (!isOpen) {
      initializedRef.current = false;
      setIsDirty(false);
      setValidationErrors([]);
      setShowCloseConfirm(false);
    }
  }, [isOpen, session, exerciseType]);


  const handleSave = useCallback(async () => {
    // Validate page ranges before saving
    const errors: ExerciseValidationError[] = [];
    exercises.forEach((ex, idx) => {
      if (ex.pdf_name.trim()) { // Only validate exercises with PDF names
        errors.push(...validateExercisePageRange(ex, idx));
      }
    });

    if (errors.length > 0) {
      setValidationErrors(errors);
      const firstError = errors[0];
      showToast(`Row ${firstError.index + 1}: ${firstError.message}`, 'error');
      return;
    }

    setValidationErrors([]);

    const sessionId = session.id;
    const currentExercises = [...exercises];
    const originalSession = session; // Store for rollback on error

    // Build API format - only use the active mode's values
    const apiExercises = currentExercises.map((ex) => ({
      exercise_type: ex.exercise_type,
      pdf_name: ex.pdf_name,
      // Only include simple range values if in simple mode
      page_start: ex.page_mode === 'simple' && ex.page_start ? parseInt(ex.page_start, 10) : null,
      page_end: ex.page_mode === 'simple' && ex.page_end ? parseInt(ex.page_end, 10) : null,
      // Only include complex pages if in custom mode
      remarks: combineExerciseRemarks(ex.page_mode === 'custom' ? ex.complex_pages : '', ex.remarks) || null,
    }));

    // Build optimistic session state
    // Keep exercises of OTHER type, replace exercises of THIS type
    const otherExercises = (session.exercises || []).filter((ex) => {
      const type = ex.exercise_type === "Classwork" ? "CW" : ex.exercise_type === "Homework" ? "HW" : ex.exercise_type;
      return type !== exerciseType;
    });

    const newExercises = apiExercises.map((ex, idx) => ({
      id: currentExercises[idx]?.id || Date.now() + idx, // temp ID for new ones
      session_id: sessionId,
      exercise_type: ex.exercise_type,
      pdf_name: ex.pdf_name,
      page_start: ex.page_start ?? undefined,
      page_end: ex.page_end ?? undefined,
      remarks: ex.remarks ?? undefined,
      created_by: session.tutor_name || 'user', // for optimistic update
    }));

    const optimisticSession = {
      ...session,
      exercises: [...otherExercises, ...newExercises],
    };

    // Update cache IMMEDIATELY (optimistic)
    updateSessionInCache(optimisticSession);

    // Clear dirty state and close modal
    setIsDirty(false);
    onClose();

    // Save in background - will update cache again with server state
    try {
      const updatedSession = await sessionsAPI.saveExercises(
        sessionId,
        exerciseType,
        apiExercises
      );
      updateSessionInCache(updatedSession);

      // Notify parent
      if (onSave) {
        onSave(sessionId, currentExercises);
      }
    } catch (error) {
      console.error("Failed to save exercises:", error);
      // Rollback to original state and show error
      updateSessionInCache(originalSession);
      showToast("Failed to save exercises. Changes reverted.", "error");
    }
  }, [session, exercises, exerciseType, onClose, onSave, showToast]);

  // Ref for focusing newly added exercise input
  const newExerciseInputRef = useRef<HTMLInputElement>(null);
  const shouldFocusNewRef = useRef(false);

  const addExercise = useCallback(() => {
    setExercises((prev) => [
      ...prev,
      { clientId: generateClientId(), exercise_type: exerciseType, pdf_name: "", page_mode: 'simple', page_start: "", page_end: "", complex_pages: "", remarks: "" },
    ]);
    setIsDirty(true);
    shouldFocusNewRef.current = true;
  }, [exerciseType]);

  const duplicateExercise = useCallback((index: number) => {
    setExercises((prev) => {
      const exerciseToDuplicate = prev[index];
      if (!exerciseToDuplicate) return prev;
      const duplicate = { ...exerciseToDuplicate, id: undefined, clientId: generateClientId() }; // New clientId for duplicate
      // Insert after the current index
      const before = prev.slice(0, index + 1);
      const after = prev.slice(index + 1);
      return [...before, duplicate, ...after];
    });
    setIsDirty(true);
  }, []);

  // Focus new exercise input after render
  useEffect(() => {
    if (shouldFocusNewRef.current && newExerciseInputRef.current) {
      newExerciseInputRef.current.focus();
      shouldFocusNewRef.current = false;
    }
  }, [exercises.length]);


  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle close confirmation with Escape - MUST be at TOP
      if (showCloseConfirm) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cancelClose();
          return;
        }
      }

      // Handle confirmation with Enter/Escape when pending - MUST be at TOP to intercept before modal's handlers
      if (pendingDeleteIndex !== null) {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          confirmDelete();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cancelDelete();
          return;
        }
      }

      // Cmd/Ctrl+Enter or Cmd/Ctrl+S - Save
      if ((e.metaKey || e.ctrlKey) && (e.key === 'Enter' || e.key === 's')) {
        e.preventDefault();
        handleSave();
        return;
      }

      // Alt/Option+N - Add new exercise
      if (e.altKey && e.key === 'n') {
        e.preventDefault();
        addExercise();
        return;
      }

      // Alt/Option+Backspace - Delete focused row (with confirmation)
      if (e.altKey && e.key === 'Backspace' && focusedRowIndex !== null) {
        e.preventDefault();
        if (pendingDeleteIndex === focusedRowIndex) {
          // Already pending confirmation, confirm it
          confirmDelete();
        } else {
          // First press, request confirmation
          requestDelete(focusedRowIndex);
        }
        return;
      }

      // General Escape handler - triggers close attempt and blocks propagation
      // This prevents sessions page from deselecting sessions when modal is open
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleCloseAttempt();
        return;
      }
    };

    // Use capture phase to intercept before modal's handlers
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, handleSave, addExercise, focusedRowIndex, pendingDeleteIndex, requestDelete, confirmDelete, cancelDelete, showCloseConfirm, cancelClose, handleCloseAttempt]);

  const updateExercise = (
    index: number,
    field: keyof ExerciseFormItem,
    value: string
  ) => {
    setExercises((prev) =>
      prev.map((ex, i) => (i === index ? { ...ex, [field]: value } : ex))
    );
    setIsDirty(true);
    // Clear validation errors for this field when user edits it
    if (['page_start', 'page_end', 'complex_pages'].includes(field)) {
      setValidationErrors((prev) => prev.filter((e) => !(e.index === index && e.field === field)));
    }
  };

  // Check if a field has validation error
  const hasFieldError = useCallback(
    (index: number, field: ExerciseValidationError['field']) =>
      validationErrors.some((e) => e.index === index && e.field === field),
    [validationErrors]
  );

  // Handle paste - auto-convert Windows drive paths to alias paths
  const handlePasteConvert = useCallback(async (
    e: React.ClipboardEvent<HTMLInputElement>,
    index: number
  ) => {
    const pastedText = e.clipboardData.getData('text');

    // Check if Windows path with drive letter (e.g., "Z:\path" or Z:\path)
    const driveMatch = pastedText.match(/^["']?([A-Za-z]):[\\\/]/);
    if (!driveMatch) return; // Let default paste happen

    e.preventDefault();

    // Clean quotes and normalize separators (forward slashes to backslashes)
    const cleanPath = pastedText.replace(/^["']|["']$/g, '').replace(/\//g, '\\');

    // Convert to alias path if mapping exists
    const convertedPath = await convertToAliasPath(cleanPath);
    updateExercise(index, "pdf_name", convertedPath);
  }, []);

  // Handle drag-drop for file search
  const handleDragOver = useCallback((e: React.DragEvent<HTMLInputElement>, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(index);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLInputElement>, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(null);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Filter to only PDF files
    const pdfFiles = files.filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (pdfFiles.length === 0) return;

    if (pdfFiles.length === 1) {
      // Single file: existing search behavior
      setSearchFilename(pdfFiles[0].name);
      setSearchForIndex(index);
      setFileSearchOpen(true);
    } else {
      // Multiple files: batch search
      setSearchFilenames(pdfFiles.map(f => f.name));
      setSearchForIndex(index);
      setBatchSearchOpen(true);
    }
  }, []);

  // Handle file selected from search modal (single file)
  const handleSearchFileSelected = useCallback((path: string) => {
    if (searchForIndex !== null) {
      updateExercise(searchForIndex, "pdf_name", path);
      setSearchForIndex(null);
    }
    setFileSearchOpen(false);
    setSearchFilename("");
  }, [searchForIndex]);

  // Handle files selected from batch search modal (multiple files)
  const handleBatchSearchFilesSelected = useCallback((paths: string[]) => {
    if (paths.length === 0 || searchForIndex === null) {
      setBatchSearchOpen(false);
      setSearchFilenames([]);
      setSearchForIndex(null);
      return;
    }

    // First path fills the drop target row
    updateExercise(searchForIndex, "pdf_name", paths[0]);

    // Remaining paths create new exercise rows after drop target
    if (paths.length > 1) {
      const newExercises = paths.slice(1).map((path) => ({
        clientId: generateClientId(),
        exercise_type: exerciseType,
        pdf_name: path,
        page_mode: 'simple' as const,
        page_start: "",
        page_end: "",
        complex_pages: "",
        remarks: "",
      }));

      setExercises((prev) => {
        // Insert after the drop target index
        const before = prev.slice(0, searchForIndex + 1);
        const after = prev.slice(searchForIndex + 1);
        return [...before, ...newExercises, ...after];
      });
    }

    setBatchSearchOpen(false);
    setSearchFilenames([]);
    setSearchForIndex(null);
  }, [searchForIndex, exerciseType]);

  // Handle file browse for PDF selection
  const handleBrowseFile = useCallback((index: number) => {
    setBrowsingForIndex(index);
    setFolderTreeOpen(true);
  }, []);

  // Handle file selected from folder picker
  const handleFileSelected = useCallback((path: string, pages?: string) => {
    if (browsingForIndex !== null) {
      updateExercise(browsingForIndex, "pdf_name", path);

      // Apply page selection if provided
      if (pages) {
        const pageSelection = parsePageInput(pages);
        if (pageSelection?.complexRange) {
          updateExercise(browsingForIndex, "page_mode", "custom");
          updateExercise(browsingForIndex, "complex_pages", pageSelection.complexRange);
          updateExercise(browsingForIndex, "page_start", "");
          updateExercise(browsingForIndex, "page_end", "");
        } else if (pageSelection?.pageStart !== undefined || pageSelection?.pageEnd !== undefined) {
          updateExercise(browsingForIndex, "page_mode", "simple");
          updateExercise(browsingForIndex, "page_start", pageSelection.pageStart?.toString() || "");
          updateExercise(browsingForIndex, "page_end", pageSelection.pageEnd?.toString() || "");
          updateExercise(browsingForIndex, "complex_pages", "");
        }
      }

      setBrowsingForIndex(null);
    }
  }, [browsingForIndex]);

  // Handle batch add from folder picker (multi-select mode)
  const handleBatchAddFromBrowse = useCallback((selections: FileSelection[]) => {
    if (selections.length === 0) return;

    // Helper to create exercise from FileSelection
    const createExerciseFromSelection = (sel: FileSelection): ExerciseFormItem => {
      const pageSelection = parsePageInput(sel.pages);
      return {
        clientId: generateClientId(),
        exercise_type: exerciseType,
        pdf_name: sel.path,
        page_mode: pageSelection?.complexRange ? 'custom' : 'simple',
        page_start: pageSelection?.complexRange ? "" : (pageSelection?.pageStart?.toString() || ""),
        page_end: pageSelection?.complexRange ? "" : (pageSelection?.pageEnd?.toString() || ""),
        complex_pages: pageSelection?.complexRange || "",
        remarks: "",
      };
    };

    // If we were browsing for a specific index, fill that first
    let startIndex = 0;
    if (browsingForIndex !== null && selections.length > 0) {
      const first = selections[0];
      const pageSelection = parsePageInput(first.pages);
      updateExercise(browsingForIndex, "pdf_name", first.path);

      if (pageSelection?.complexRange) {
        updateExercise(browsingForIndex, "page_mode", "custom");
        updateExercise(browsingForIndex, "complex_pages", pageSelection.complexRange);
        updateExercise(browsingForIndex, "page_start", "");
        updateExercise(browsingForIndex, "page_end", "");
      } else if (pageSelection?.pageStart !== undefined || pageSelection?.pageEnd !== undefined) {
        updateExercise(browsingForIndex, "page_mode", "simple");
        updateExercise(browsingForIndex, "page_start", pageSelection.pageStart?.toString() || "");
        updateExercise(browsingForIndex, "page_end", pageSelection.pageEnd?.toString() || "");
        updateExercise(browsingForIndex, "complex_pages", "");
      }

      startIndex = 1;
    }

    // Create new exercise rows for remaining files
    if (selections.length > startIndex) {
      const newExercises = selections.slice(startIndex).map(createExerciseFromSelection);

      setExercises((prev) => {
        if (browsingForIndex !== null) {
          // Insert after the browsing index
          const before = prev.slice(0, browsingForIndex + 1);
          const after = prev.slice(browsingForIndex + 1);
          return [...before, ...newExercises, ...after];
        }
        // Or append at end
        return [...prev, ...newExercises];
      });
      setIsDirty(true);
    }

    setBrowsingForIndex(null);
  }, [browsingForIndex, exerciseType]);

  // Handle Paperless search
  const handlePaperlessSearch = useCallback((index: number) => {
    setSearchingForIndex(index);
    setPaperlessSearchOpen(true);
  }, []);

  // Handle preview trending item
  const handlePreviewTrending = useCallback(async (item: CoursewarePopularity) => {
    // If already cached, open immediately
    const cachedDoc = previewableTrending.get(item.filename);
    if (cachedDoc) {
      setTrendingPreviewDoc(cachedDoc);
      return;
    }

    // If already known to be unavailable, do nothing
    if (unavailableTrending.has(item.filename)) return;

    // If already checking, ignore
    if (checkingPreview.has(item.filename)) return;

    // Start checking
    setCheckingPreview(prev => { const next = new Set(prev); next.add(item.filename); return next; });

    try {
      const path = item.normalized_paths?.split(',')[0]?.trim();
      if (!path) {
        setUnavailableTrending(prev => { const next = new Set(prev); next.add(item.filename); return next; });
        return;
      }

      const response = await api.paperless.search(path, 3, 'all');
      if (response.results.length > 0) {
        // Found - cache and open preview
        const doc = response.results[0];
        setPreviewableTrending(prev => new Map(prev).set(item.filename, doc));
        setTrendingPreviewDoc(doc);
      } else {
        setUnavailableTrending(prev => { const next = new Set(prev); next.add(item.filename); return next; });
      }
    } catch {
      setUnavailableTrending(prev => { const next = new Set(prev); next.add(item.filename); return next; });
    } finally {
      setCheckingPreview(prev => { const next = new Set(prev); next.delete(item.filename); return next; });
    }
  }, [previewableTrending, unavailableTrending, checkingPreview]);

  // Handle file selected from Paperless search (single select)
  const handlePaperlessSelected = useCallback((path: string, pageSelection?: PageSelection) => {
    if (searchingForIndex !== null) {
      updateExercise(searchingForIndex, "pdf_name", path);

      // Auto-populate page fields based on selection and switch mode accordingly
      if (pageSelection?.complexRange) {
        // Complex range: set custom mode, clear simple range fields, set complex_pages
        updateExercise(searchingForIndex, "page_mode", "custom");
        updateExercise(searchingForIndex, "page_start", "");
        updateExercise(searchingForIndex, "page_end", "");
        updateExercise(searchingForIndex, "complex_pages", pageSelection.complexRange);
      } else if (pageSelection?.pageStart !== undefined || pageSelection?.pageEnd !== undefined) {
        // Simple range: set simple mode, set page fields, clear complex_pages
        updateExercise(searchingForIndex, "page_mode", "simple");
        updateExercise(searchingForIndex, "page_start", pageSelection.pageStart?.toString() || "");
        updateExercise(searchingForIndex, "page_end", pageSelection.pageEnd?.toString() || "");
        updateExercise(searchingForIndex, "complex_pages", "");
      }

      setSearchingForIndex(null);
    }
  }, [searchingForIndex]);

  // Handle multiple files selected from Paperless search
  const handlePaperlessMultiSelect = useCallback((selections: Array<{ path: string; pageSelection?: PageSelection }>) => {
    if (selections.length === 0) return;

    if (searchingForIndex !== null) {
      const first = selections[0];
      // First selection goes to the current row
      updateExercise(searchingForIndex, "pdf_name", first.path);

      // Apply page selection for the first item with mode switching
      if (first.pageSelection?.complexRange) {
        updateExercise(searchingForIndex, "page_mode", "custom");
        updateExercise(searchingForIndex, "page_start", "");
        updateExercise(searchingForIndex, "page_end", "");
        updateExercise(searchingForIndex, "complex_pages", first.pageSelection.complexRange);
      } else if (first.pageSelection?.pageStart !== undefined || first.pageSelection?.pageEnd !== undefined) {
        updateExercise(searchingForIndex, "page_mode", "simple");
        updateExercise(searchingForIndex, "page_start", first.pageSelection.pageStart?.toString() || "");
        updateExercise(searchingForIndex, "page_end", first.pageSelection.pageEnd?.toString() || "");
        updateExercise(searchingForIndex, "complex_pages", "");
      }

      // Additional selections create new rows
      if (selections.length > 1) {
        setExercises((prev) => {
          const newExercises = selections.slice(1).map(({ path, pageSelection }) => ({
            clientId: generateClientId(),
            exercise_type: exerciseType,
            pdf_name: path,
            page_mode: pageSelection?.complexRange ? 'custom' as const : 'simple' as const,
            page_start: pageSelection?.complexRange ? "" : (pageSelection?.pageStart?.toString() || ""),
            page_end: pageSelection?.complexRange ? "" : (pageSelection?.pageEnd?.toString() || ""),
            complex_pages: pageSelection?.complexRange || "",
            remarks: "",
          }));
          // Insert after the current index
          const before = prev.slice(0, searchingForIndex + 1);
          const after = prev.slice(searchingForIndex + 1);
          return [...before, ...newExercises, ...after];
        });
        setIsDirty(true);
      }

      setSearchingForIndex(null);
    }
  }, [searchingForIndex, exerciseType]);

  // Handle open file in new tab
  const handleOpenFile = useCallback(async (clientId: string, path: string) => {
    if (!path || fileActionState[clientId]?.open === 'loading') return;
    setFileActionState(prev => ({ ...prev, [clientId]: { ...prev[clientId], open: 'loading' } }));
    const error = await openFileFromPathWithFallback(path, searchPaperlessByPath);
    if (error) {
      console.warn('Failed to open file:', error);
      setFileActionState(prev => ({ ...prev, [clientId]: { ...prev[clientId], open: 'error' } }));
      setTimeout(() => setFileActionState(prev => ({ ...prev, [clientId]: { ...prev[clientId], open: undefined } })), 2000);
    } else {
      setFileActionState(prev => ({ ...prev, [clientId]: { ...prev[clientId], open: undefined } }));
    }
  }, [fileActionState]);

  // Build print stamp info from session data
  const buildStampInfo = useCallback((): PrintStampInfo => {
    const sessionDate = new Date(session.session_date + 'T00:00:00');
    return {
      location: session.location,
      schoolStudentId: session.school_student_id,
      studentName: session.student_name,
      sessionDate: sessionDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      sessionTime: session.time_slot,
    };
  }, [session]);

  // Handle print file with page range support
  const handlePrintFile = useCallback(async (exercise: ExerciseFormItem) => {
    const { clientId, pdf_name: path } = exercise;
    if (!path || fileActionState[clientId]?.print === 'loading') return;

    // Extract page range info
    const pageStart = exercise.page_start ? parseInt(exercise.page_start, 10) : undefined;
    const pageEnd = exercise.page_end ? parseInt(exercise.page_end, 10) : undefined;

    // Use complex_pages directly (no more parsing from remarks)
    const complexRange = exercise.complex_pages?.trim() || undefined;

    // Build stamp info
    const stamp = buildStampInfo();

    setFileActionState(prev => ({ ...prev, [clientId]: { ...prev[clientId], print: 'loading' } }));
    const error = await printFileFromPathWithFallback(path, pageStart, pageEnd, complexRange, stamp, searchPaperlessByPath);
    if (error) {
      console.warn('Failed to print file:', error);
      setFileActionState(prev => ({ ...prev, [clientId]: { ...prev[clientId], print: 'error' } }));
      setTimeout(() => setFileActionState(prev => ({ ...prev, [clientId]: { ...prev[clientId], print: undefined } })), 2000);
    } else {
      setFileActionState(prev => ({ ...prev, [clientId]: { ...prev[clientId], print: undefined } }));
    }
  }, [fileActionState, buildStampInfo]);

  // Handle print all exercises in one batch
  const handlePrintAll = useCallback(async () => {
    if (printAllState === 'loading') return;

    // Filter exercises that have PDF paths
    const exercisesWithPdfs = exercises.filter(ex => ex.pdf_name && ex.pdf_name.trim());
    if (exercisesWithPdfs.length === 0) return;

    setPrintAllState('loading');
    const stamp = buildStampInfo();

    // Build title (same format as download filename)
    const dateStr = session.session_date.replace(/-/g, '');
    const studentName = session.student_name.replace(/\s+/g, '_');
    const printTitle = `${exerciseType}_${session.school_student_id}_${studentName}_${dateStr}`;

    const error = await printBulkFiles(exercisesWithPdfs, stamp, searchPaperlessByPath, printTitle);
    if (error) {
      console.warn('Failed to print all files:', error);
      setPrintAllState('error');
      setTimeout(() => setPrintAllState('idle'), 2000);
    } else {
      setPrintAllState('idle');
    }
  }, [exercises, printAllState, buildStampInfo, session, exerciseType]);

  // Handle download all exercises in one combined file
  const handleDownloadAll = useCallback(async () => {
    if (downloadAllState === 'loading') return;

    // Filter exercises that have PDF paths
    const exercisesWithPdfs = exercises.filter(ex => ex.pdf_name && ex.pdf_name.trim());
    if (exercisesWithPdfs.length === 0) return;

    setDownloadAllState('loading');
    const stamp = buildStampInfo();

    // Build filename: CW_1978_John_Doe_20260110.pdf
    const dateStr = session.session_date.replace(/-/g, '');
    const studentName = session.student_name.replace(/\s+/g, '_');
    const filename = `${exerciseType}_${session.school_student_id}_${studentName}_${dateStr}.pdf`;

    const error = await downloadBulkFiles(exercisesWithPdfs, filename, stamp, searchPaperlessByPath);
    if (error) {
      console.warn('Failed to download all files:', error);
      setDownloadAllState('error');
      setTimeout(() => setDownloadAllState('idle'), 2000);
    } else {
      setDownloadAllState('idle');
    }
  }, [exercises, downloadAllState, buildStampInfo, session, exerciseType]);

  const isCW = exerciseType === "CW";
  const title = isCW ? "Classwork" : "Homework";
  const Icon = isCW ? PenTool : Home;

  const inputClass = cn(
    "w-full px-3 py-2 rounded-md border",
    "bg-white dark:bg-gray-900",
    "border-gray-300 dark:border-gray-600",
    "text-gray-900 dark:text-gray-100",
    "focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent",
    "text-sm"
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCloseAttempt}
      title={
        <div className="flex items-center gap-2">
          <span className={cn(
            "p-1.5 rounded",
            isCW ? "bg-red-100 dark:bg-red-900/30" : "bg-blue-100 dark:bg-blue-900/30"
          )}>
            <Icon className={cn(
              "h-4 w-4",
              isCW ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"
            )} />
          </span>
          <span>{title}</span>
        </div>
      }
      size="lg"
      footer={
        <div className="flex justify-between items-center gap-3">
          <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 font-mono text-[10px]">Alt+N</kbd>
            <span>add</span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 font-mono text-[10px]">Alt+⌫</kbd>
            <span>delete</span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 font-mono text-[10px]">Ctrl+↵/S</kbd>
            <span>save</span>
          </span>
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleCloseAttempt}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save Changes
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Session Info Header */}
        <div className="flex items-center gap-2 flex-wrap bg-[#f5ebe0] dark:bg-[#3d3628] rounded-lg p-3">
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {session.school_student_id}
          </span>
          <Link
            href={`/students/${session.student_id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-base font-bold text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
          >
            {session.student_name}
          </Link>
          {session.grade && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded text-gray-800"
              style={{ backgroundColor: getGradeColor(session.grade, session.lang_stream) }}
            >
              {session.grade}{session.lang_stream}
            </span>
          )}
          {session.school && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
              {session.school}
            </span>
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
            {new Date(session.session_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} | {session.time_slot}
          </span>
        </div>

        {/* Recap Section (Previous Session + Homework to Check) */}
        {isLoadingDetails ? (
          <div className="border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="h-3.5 w-3.5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
          </div>
        ) : (detailedSession?.previous_session || (detailedSession?.homework_completion && detailedSession.homework_completion.length > 0)) && (
          <div className="border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setRecapExpanded(!recapExpanded)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors",
                "bg-gradient-to-r from-purple-50 to-white dark:from-purple-900/20 dark:to-[#1a1a1a]",
                "hover:from-purple-100 hover:to-white dark:hover:from-purple-900/30 dark:hover:to-[#1a1a1a]"
              )}
            >
              <History className="h-3.5 w-3.5 text-purple-600" />
              <span className="text-xs text-gray-600 dark:text-gray-300">Recap</span>
              {(prevClasswork.length > 0 || uncheckedHwCount > 0) && (
                <span className="text-[10px] px-1.5 py-0.5 bg-orange-500 text-white rounded-full">
                  {prevClasswork.length > 0 && `${prevClasswork.length} CW`}
                  {prevClasswork.length > 0 && uncheckedHwCount > 0 && ' · '}
                  {uncheckedHwCount > 0 && `${uncheckedHwCount} HW`}
                </span>
              )}
              {recapExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-gray-400 ml-auto" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-gray-400 ml-auto" />
              )}
            </button>

            {recapExpanded && (
              <div className="border-t border-[#e8d4b8] dark:border-[#6b5a4a] px-3 py-2 space-y-2">
                {/* Previous Session Info */}
                {detailedSession?.previous_session && (
                  <div className="text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/sessions/${detailedSession.previous_session.id}`}
                          target="_blank"
                          onClick={(e) => e.stopPropagation()}
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {new Date(detailedSession.previous_session.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {detailedSession.previous_session.time_slot && (
                            <span className="text-gray-500 dark:text-gray-400 ml-1">· {detailedSession.previous_session.time_slot}</span>
                          )}
                        </Link>
                        <Link
                          href={`/sessions/${detailedSession.previous_session.id}`}
                          target="_blank"
                          onClick={(e) => e.stopPropagation()}
                          className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                          title="Open in new tab"
                        >
                          <ExternalLink className="h-3 w-3 text-gray-400" />
                        </Link>
                      </div>
                      {detailedSession.previous_session.performance_rating && (
                        <div className="flex">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} className={cn("h-2.5 w-2.5", i < starCount ? "fill-yellow-400 text-yellow-400" : "text-gray-300")} />
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Previous CW */}
                    {prevClasswork.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        <span className="text-gray-500 text-[10px]">Classwork:</span>
                        {prevClasswork.map((ex, i) => (
                          <RecapExerciseItem key={i} pdfName={ex.pdf_name} pageStart={ex.page_start} pageEnd={ex.page_end} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {/* Homework to Check */}
                {detailedSession?.homework_completion && detailedSession.homework_completion.length > 0 && (
                  <div className="text-xs space-y-0.5">
                    <span className="text-gray-500 text-[10px]">HW to check:</span>
                    {detailedSession.homework_completion.map((hw, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <span className={cn(
                          "text-[9px] px-1 rounded flex-shrink-0",
                          hw.completion_status === 'Completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                          hw.completion_status === 'Partially Completed' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                          'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                        )}>
                          {hw.completion_status === 'Completed' ? '✓' : hw.completion_status === 'Partially Completed' ? '~' : '○'}
                        </span>
                        {hw.pdf_name ? (
                          <RecapExerciseItem pdfName={hw.pdf_name} />
                        ) : (
                          <span className="text-gray-500 italic">No PDF</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Trending Section - Loading Skeleton */}
        {trendingLoading && (
          <div className="border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-orange-50 to-white dark:from-orange-900/20 dark:to-[#1a1a1a]">
              <div className="h-3.5 w-3.5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
          </div>
        )}

        {/* Compact Trending Section */}
        {!trendingLoading && trendingData && trendingData.length > 0 && (
          <div className="border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden">
            {/* Collapsible Header */}
            <button
              type="button"
              onClick={() => setTrendingExpanded(!trendingExpanded)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors",
                "bg-gradient-to-r from-orange-50 to-white dark:from-orange-900/20 dark:to-[#1a1a1a]",
                "hover:from-orange-100 hover:to-white dark:hover:from-orange-900/30 dark:hover:to-[#1a1a1a]"
              )}
            >
              <TrendingUp className="h-3.5 w-3.5 text-orange-500" />
              <span className="text-xs text-gray-600 dark:text-gray-300">
                Trending
                {session.grade && ` for ${session.grade}`}
                {session.school && ` @ ${session.school}`}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                ({trendingData.length} popular)
              </span>
              {trendingExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-gray-400 ml-auto" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-gray-400 ml-auto" />
              )}
            </button>

            {/* Expanded Content */}
            {trendingExpanded && (
              <div className="border-t border-[#e8d4b8] dark:border-[#6b5a4a] max-h-64 overflow-y-auto">
                {trendingData.map((item, index) => {
                  const firstPath = item.normalized_paths?.split(", ")[0]?.trim() || item.filename;
                  const isExpanded = detailItem?.filename === item.filename;
                  return (
                    <div key={item.filename}>
                      <div
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer transition-colors",
                          "hover:bg-amber-50 dark:hover:bg-amber-900/20",
                          "border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30",
                          isExpanded && "border-b-0 bg-amber-50/50 dark:bg-amber-900/10"
                        )}
                        onClick={() => {
                          // Add new exercise with this path
                          setExercises(prev => [...prev, {
                            clientId: generateClientId(),
                            exercise_type: exerciseType,
                            pdf_name: firstPath,
                            page_mode: 'simple' as const,
                            page_start: '',
                            page_end: '',
                            complex_pages: '',
                            remarks: '',
                          }]);
                          setIsDirty(true);
                        }}
                        title={`Click to add ${item.filename} as new exercise`}
                      >
                        {index < 3 && <Flame className="h-3 w-3 text-orange-500 shrink-0" />}
                        {index >= 3 && <div className="w-3" />}
                        <span className="flex-1 truncate text-gray-700 dark:text-gray-300 text-xs">
                          {item.filename}
                        </span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0 flex items-center gap-1">
                          {item.assignment_count}×
                          <User className="h-2.5 w-2.5" />
                          {item.unique_student_count}
                        </span>
                        {/* Preview button */}
                        {unavailableTrending.has(item.filename) ? (
                          <div className="p-1 shrink-0" title="Not available in Shelv" onClick={(e) => e.stopPropagation()}>
                            <EyeOff className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600" />
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
                          >
                            {checkingPreview.has(item.filename) ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                        {/* Copy path button */}
                        <div onClick={(e) => e.stopPropagation()}>
                          <CopyPathButton paths={item.normalized_paths} filename={item.filename} />
                        </div>
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
                        >
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <Info className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      {/* Expandable usage details section */}
                      {isExpanded && (
                        <div className="px-3 py-2 border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30 bg-gray-50 dark:bg-[#1a1a1a]/50">
                          {usageDetailsLoading ? (
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Loading usage details...
                            </div>
                          ) : usageDetails && usageDetails.length > 0 ? (
                            <div className="space-y-1">
                              <div className="text-[10px] font-medium text-gray-600 dark:text-gray-400 mb-1">
                                Recent sessions using this file:
                              </div>
                              <div className="text-xs space-y-0.5 max-h-24 overflow-y-auto">
                                {usageDetails.map((detail, i) => {
                                  const displayId = detail.school_student_id
                                    ? `${detail.location}-${detail.school_student_id}`
                                    : detail.location;
                                  return (
                                    <div
                                      key={`${detail.session_id}-${detail.exercise_id}-${i}`}
                                      className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400 text-[10px]"
                                    >
                                      <span className="text-gray-400 dark:text-gray-500 w-16 shrink-0">
                                        {detail.session_date
                                          ? new Date(detail.session_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                          : '-'}
                                      </span>
                                      <Link
                                        href={`/students/${detail.student_id}`}
                                        target="_blank"
                                        className="truncate flex-1 text-[#a0704b] dark:text-[#cd853f] hover:underline"
                                        title={`${displayId} ${detail.student_name}`}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {detail.student_name}
                                      </Link>
                                      <span className="shrink-0 text-gray-400 dark:text-gray-500">
                                        {detail.grade}
                                      </span>
                                      <span className={cn(
                                        "shrink-0 px-1 rounded text-[9px]",
                                        detail.exercise_type === 'CW'
                                          ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                                          : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                      )}>
                                        {detail.exercise_type}
                                      </span>
                                      <Link
                                        href={`/sessions/${detail.session_id}`}
                                        target="_blank"
                                        className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 shrink-0"
                                        title="Go to session"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <ExternalLink className="h-2.5 w-2.5 text-gray-400 hover:text-[#a0704b]" />
                                      </Link>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <div className="text-[10px] text-gray-500">
                              No usage details available
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-between items-center">
          {/* Print All + Download All Buttons - only show if there are exercises with PDFs */}
          {canBrowseFiles && exercises.some(ex => ex.pdf_name && ex.pdf_name.trim()) ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handlePrintAll}
                disabled={printAllState === 'loading'}
                className={cn(
                  "flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded transition-colors",
                  "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50",
                  printAllState === 'loading' && "opacity-50 cursor-not-allowed"
                )}
              >
                {printAllState === 'loading' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : printAllState === 'error' ? (
                  <XCircle className="h-4 w-4" />
                ) : (
                  <Printer className="h-4 w-4" />
                )}
                Print All
              </button>
              <button
                type="button"
                onClick={handleDownloadAll}
                disabled={downloadAllState === 'loading'}
                className={cn(
                  "flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded transition-colors",
                  "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50",
                  downloadAllState === 'loading' && "opacity-50 cursor-not-allowed"
                )}
              >
                {downloadAllState === 'loading' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : downloadAllState === 'error' ? (
                  <XCircle className="h-4 w-4" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download All
              </button>
            </div>
          ) : (
            <div /> // Spacer
          )}

          <button
            type="button"
            onClick={addExercise}
            className={cn(
              "flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded transition-colors",
              isCW
                ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
                : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50"
            )}
          >
            <Plus className="h-4 w-4" />
            Add {title}
          </button>
        </div>

        {/* Exercises List */}
        {exercises.length === 0 ? (
          <div className={cn(
            "text-center py-8 text-sm border-2 border-dashed rounded-lg",
            isCW
              ? "text-red-500 dark:text-red-400 border-red-200 dark:border-red-800"
              : "text-blue-500 dark:text-blue-400 border-blue-200 dark:border-blue-800"
          )}>
            No {title.toLowerCase()} assigned yet. Click "Add {title}" to add one.
          </div>
        ) : (
          <div className="space-y-3">
            {exercises.map((exercise, index) => (
              <div
                key={index}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                className={cn(
                  "p-3 rounded-lg border transition-all",
                  isCW
                    ? "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800"
                    : "bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800",
                  focusedRowIndex === index && "ring-2 ring-amber-400/70 ring-offset-1",
                  isDraggingOver === index && "ring-2 ring-amber-400 bg-amber-50/50 dark:bg-amber-900/30"
                )}
              >
                <div className="space-y-2">
                  {/* Row 1: Type badge, PDF path, action buttons, delete */}
                  <div className="flex items-center gap-2">
                    {/* Fixed-width badge container for alignment */}
                    <div className="w-12 shrink-0 flex justify-center">
                      <div
                        className={cn(
                          "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium",
                          isCW
                            ? "bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-200"
                            : "bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-200"
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {exerciseType}
                      </div>
                    </div>

                    {/* PDF path input */}
                    <input
                      ref={index === exercises.length - 1 ? newExerciseInputRef : undefined}
                      type="text"
                      value={exercise.pdf_name}
                      onChange={(e) => updateExercise(index, "pdf_name", e.target.value)}
                      onPaste={(e) => handlePasteConvert(e, index)}
                      onFocus={() => setFocusedRowIndex(index)}
                      placeholder={isDraggingOver === index ? "Drop PDF here to search..." : "PDF name or path (drag & drop supported)"}
                      className={cn(
                        inputClass,
                        "text-xs py-1.5 flex-1 min-w-0 transition-all",
                        isDraggingOver === index && "border-amber-400"
                      )}
                    />

                    {/* File action buttons */}
                    <ExerciseActionButtons
                      hasPdfName={!!exercise.pdf_name}
                      canBrowseFiles={canBrowseFiles}
                      fileActionState={fileActionState[exercise.clientId]}
                      onPaperlessSearch={() => handlePaperlessSearch(index)}
                      onBrowseFile={() => handleBrowseFile(index)}
                      onOpenFile={() => handleOpenFile(exercise.clientId, exercise.pdf_name)}
                      onPrintFile={() => handlePrintFile(exercise)}
                    />

                    {/* Duplicate button */}
                    <button
                      type="button"
                      onClick={() => duplicateExercise(index)}
                      className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors shrink-0"
                      title="Duplicate exercise"
                    >
                      <Copy className="h-4 w-4" />
                    </button>

                    {/* Delete button with confirmation */}
                    <ExerciseDeleteButton
                      isPending={pendingDeleteIndex === index}
                      onRequestDelete={() => requestDelete(index)}
                      onConfirmDelete={confirmDelete}
                      onCancelDelete={cancelDelete}
                    />
                  </div>

                  {/* Row 2: Page Range Mode Selection */}
                  <div className="flex gap-2 items-start">
                    {/* Spacer matching row 1 badge container width */}
                    <div className="w-12 shrink-0" />

                    {/* Page Range Section with Radio Toggle */}
                    <div className="flex-1 space-y-1">
                      <ExercisePageRangeInput
                        radioName={`page-mode-${index}`}
                        pageMode={exercise.page_mode}
                        pageStart={exercise.page_start}
                        pageEnd={exercise.page_end}
                        complexPages={exercise.complex_pages}
                        onPageModeChange={(mode) => updateExercise(index, "page_mode", mode)}
                        onPageStartChange={(value) => updateExercise(index, "page_start", value)}
                        onPageEndChange={(value) => updateExercise(index, "page_end", value)}
                        onComplexPagesChange={(value) => updateExercise(index, "complex_pages", value)}
                        onFocus={() => setFocusedRowIndex(index)}
                        inputClass={inputClass}
                        pageStartError={hasFieldError(index, 'page_start')}
                        pageEndError={hasFieldError(index, 'page_end')}
                        complexPagesError={hasFieldError(index, 'complex_pages')}
                      />

                      {/* Remarks row */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400 w-14 shrink-0">Remarks:</span>
                        <input
                          type="text"
                          value={exercise.remarks}
                          onChange={(e) => updateExercise(index, "remarks", e.target.value)}
                          onFocus={() => setFocusedRowIndex(index)}
                          placeholder="Optional notes"
                          className={cn(inputClass, "text-xs py-1 flex-1")}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Folder Tree Browser Modal */}
      <FolderTreeModal
        isOpen={folderTreeOpen}
        onClose={() => {
          setFolderTreeOpen(false);
          setBrowsingForIndex(null);
        }}
        onFileSelected={handleFileSelected}
        onFilesSelected={handleBatchAddFromBrowse}
        allowMultiSelect
        initialPath={browsingForIndex !== null ? exercises[browsingForIndex]?.pdf_name : undefined}
      />

      {/* Paperless Search Modal */}
      <PaperlessSearchModal
        isOpen={paperlessSearchOpen}
        onClose={() => {
          setPaperlessSearchOpen(false);
          setSearchingForIndex(null);
        }}
        onSelect={handlePaperlessSelected}
        multiSelect
        onMultiSelect={handlePaperlessMultiSelect}
        // Pass session context for filtered trending suggestions
        exerciseType={exerciseType}
        studentGrade={session.grade}
        school={session.school}
        location={session.location}
      />

      {/* PDF Preview Modal for trending items */}
      <PdfPreviewModal
        isOpen={!!trendingPreviewDoc}
        onClose={() => setTrendingPreviewDoc(null)}
        document={trendingPreviewDoc}
      />

      {/* File Search Modal (for single file drag-drop) */}
      <FileSearchModal
        isOpen={fileSearchOpen}
        onClose={() => {
          setFileSearchOpen(false);
          setSearchFilename("");
          setSearchForIndex(null);
        }}
        filename={searchFilename}
        onFileSelected={handleSearchFileSelected}
      />

      {/* Batch File Search Modal (for multi-file drag-drop) */}
      <FileSearchModal
        isOpen={batchSearchOpen}
        onClose={() => {
          setBatchSearchOpen(false);
          setSearchFilenames([]);
          setSearchForIndex(null);
        }}
        filenames={searchFilenames}
        onFilesSelected={handleBatchSearchFilesSelected}
      />

      {/* Close Confirmation Dialog - uses createPortal to render above modal */}
      {showCloseConfirm && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg shadow-xl p-6 w-full max-w-[400px]">
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
              You have unsaved changes. Discard them?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={cancelClose}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDiscard}>
                Discard
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </Modal>
  );
}
