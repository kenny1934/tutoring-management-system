"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Plus, PenTool, Home, ExternalLink, Printer, Loader2, XCircle, TrendingUp, Flame, User, ChevronDown, ChevronRight, Eye, EyeOff, Info, ChevronUp, History, Star, Check, Download, Copy, Clipboard, Square, CheckSquare, GripVertical } from "lucide-react";
import { Reorder, useDragControls } from "framer-motion";
import type { DragControls } from "framer-motion";
import { cn } from "@/lib/utils";
import { getGradeColor } from "@/lib/constants";
import { sessionsAPI, api } from "@/lib/api";
import { updateSessionInCache } from "@/lib/session-cache";
import { useToast } from "@/contexts/ToastContext";
import type { Session, PageSelection, CoursewarePopularity } from "@/types";
import Link from "next/link";
import { isFileSystemAccessSupported, openFileFromPathWithFallback, printFileFromPathWithFallback, printBulkFiles, downloadBulkFiles, downloadAllAnswerFiles, PrintStampInfo, convertToAliasPath } from "@/lib/file-system";
import { FolderTreeModal, FileSelection } from "@/components/ui/folder-tree-modal";
import { PaperlessSearchModal } from "@/components/ui/paperless-search-modal";
import { FileSearchModal } from "@/components/ui/file-search-modal";
import { CopyPathButton } from "@/components/ui/copy-path-button";
import { useCoursewarePopularity, useCoursewareUsageDetail, useSession } from "@/lib/hooks";
import { PdfPreviewModal } from "@/components/ui/pdf-preview-modal";
import type { PaperlessDocument } from "@/lib/api";
import { parseExerciseRemarks, detectPageMode, combineExerciseRemarks, validateExercisePageRange, parsePageInput, getPageFieldsFromSelection, insertExercisesAfterIndex, type ExerciseValidationError, type ExerciseFormItemBase, generateClientId, createExercise, createExerciseFromSelection, copyExercisesToClipboard, getExerciseClipboard, createExercisesFromClipboard, CLIPBOARD_EVENT, type ExerciseClipboardData } from "@/lib/exercise-utils";
import { useFormDirtyTracking, useDeleteConfirmation, useFileActions } from "@/lib/ui-hooks";
import { ExercisePageRangeInput } from "./ExercisePageRangeInput";
import { ExerciseActionButtons } from "./ExerciseActionButtons";
import { ExerciseDeleteButton } from "./ExerciseDeleteButton";
import { ExerciseAnswerSection } from "./ExerciseAnswerSection";
import { RecapExerciseItem } from "./RecapExerciseItem";
import { searchPaperlessByPath } from "@/lib/paperless-utils";

// Exercise form item extends base with optional id for existing exercises
export interface ExerciseFormItem extends ExerciseFormItemBase {
  id?: number;
}

interface ExerciseModalProps {
  session: Session;
  exerciseType: "CW" | "HW";
  isOpen: boolean;
  onClose: () => void;
  onSave?: (sessionId: number, exercises: ExerciseFormItem[]) => void;
  /** When true, disables save action (Supervisor mode) */
  readOnly?: boolean;
}

/** Thin wrapper for Reorder.Item that provides drag controls via render prop */
function ReorderableItem({ value, disabled, children }: {
  value: string;
  disabled?: boolean;
  children: (controls: DragControls | null) => React.ReactNode;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={value}
      dragListener={false}
      dragControls={disabled ? undefined : controls}
      style={{ listStyle: "none" }}
    >
      {children(disabled ? null : controls)}
    </Reorder.Item>
  );
}

export function ExerciseModal({
  session,
  exerciseType,
  isOpen,
  onClose,
  onSave,
  readOnly = false,
}: ExerciseModalProps) {
  // Filter existing exercises to only show the relevant type
  const [exercises, setExercises] = useState<ExerciseFormItem[]>([]);
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);
  const [canBrowseFiles, setCanBrowseFiles] = useState(false);
  const [folderTreeOpen, setFolderTreeOpen] = useState(false);
  const [browsingForIndex, setBrowsingForIndex] = useState<number | null>(null);
  const [paperlessSearchOpen, setPaperlessSearchOpen] = useState(false);
  const [searchingForIndex, setSearchingForIndex] = useState<number | null>(null);
  // Answer file browse state
  const [answerFolderTreeOpen, setAnswerFolderTreeOpen] = useState(false);
  const [browsingForAnswerClientId, setBrowsingForAnswerClientId] = useState<string | null>(null);
  const [printAllState, setPrintAllState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [downloadAllState, setDownloadAllState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [downloadAllAnswersState, setDownloadAllAnswersState] = useState<'idle' | 'loading' | 'error'>('idle');

  // Drag-drop file search state
  const [isDraggingOver, setIsDraggingOver] = useState<number | null>(null);
  const [fileSearchOpen, setFileSearchOpen] = useState(false);
  const [searchFilename, setSearchFilename] = useState("");
  const [searchForIndex, setSearchForIndex] = useState<number | null>(null);

  // Multi-file drag-drop batch search state
  const [batchSearchOpen, setBatchSearchOpen] = useState(false);
  const [searchFilenames, setSearchFilenames] = useState<string[]>([]);

  // Copy/paste state
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [showPasteConfirm, setShowPasteConfirm] = useState(false);
  const [clipboardData, setClipboardData] = useState<ExerciseClipboardData | null>(null);

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
    // Clear selections since indices shift after delete
    setSelectedIndices(new Set());
  }, [setIsDirty]);

  const {
    pendingIndex: pendingDeleteIndex,
    requestDelete,
    confirmDelete,
    cancelDelete,
    isPending: isDeletePending,
  } = useDeleteConfirmation(handleDeleteExercise);

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

  // Stamp info for recap exercise items
  const recapStamp = useMemo(() => buildStampInfo(), [buildStampInfo]);

  // File open/print actions (from ui-hooks)
  const { fileActionState, handleOpenFile, handlePrintFile } = useFileActions(buildStampInfo);

  // Validation errors
  const [validationErrors, setValidationErrors] = useState<ExerciseValidationError[]>([]);

  // Trending section state
  const [trendingExpanded, setTrendingExpanded] = useState(false);
  const [trendingPreviewDoc, setTrendingPreviewDoc] = useState<PaperlessDocument | null>(null);
  // Consolidated trending item state: tracks status and cached document per filename
  const [trendingItemState, setTrendingItemState] = useState<Record<string, { status: 'checking' | 'available' | 'unavailable'; doc?: PaperlessDocument }>>({});
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

  // Keep clipboard data in sync when it changes externally
  useEffect(() => {
    if (!isOpen) return;
    const handler = () => setClipboardData(getExerciseClipboard());
    window.addEventListener(CLIPBOARD_EVENT, handler);
    return () => window.removeEventListener(CLIPBOARD_EVENT, handler);
  }, [isOpen]);


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
          // Parse answer remarks for complex pages
          const { complexPages: answerComplexPages } = parseExerciseRemarks(ex.answer_remarks);
          const answerPageMode = detectPageMode(ex.answer_page_start, ex.answer_page_end, answerComplexPages);
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
            // Answer fields
            answer_pdf_name: ex.answer_pdf_name || "",
            answer_page_mode: answerPageMode,
            answer_page_start: ex.answer_page_start?.toString() || "",
            answer_page_end: ex.answer_page_end?.toString() || "",
            answer_complex_pages: answerComplexPages,
          };
        });
      setExercises(filteredExercises);
      setIsDirty(false);
      setValidationErrors([]);
      setSelectedIndices(new Set());
      setClipboardData(getExerciseClipboard());
    }
    if (!isOpen) {
      initializedRef.current = false;
      setIsDirty(false);
      setValidationErrors([]);
      setShowCloseConfirm(false);
      setShowPasteConfirm(false);
      setSelectedIndices(new Set());
    }
  }, [isOpen, session, exerciseType]);


  const handleSave = useCallback(async () => {
    // Filter out empty exercises (no PDF name)
    const validExercises = exercises.filter(ex => ex.pdf_name && ex.pdf_name.trim());
    const emptyCount = exercises.length - validExercises.length;

    if (emptyCount > 0) {
      setExercises(validExercises);
    }

    if (validExercises.length === 0) {
      onClose();
      return;
    }

    // Validate page ranges before saving
    const errors: ExerciseValidationError[] = [];
    validExercises.forEach((ex, idx) => {
      errors.push(...validateExercisePageRange(ex, idx));
    });

    if (errors.length > 0) {
      setValidationErrors(errors);
      const firstError = errors[0];
      showToast(`Row ${firstError.index + 1}: ${firstError.message}`, 'error');
      return;
    }

    setValidationErrors([]);

    const sessionId = session.id;
    const currentExercises = [...validExercises];
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
      // Answer file fields
      answer_pdf_name: ex.answer_pdf_name || null,
      answer_page_start: ex.answer_page_mode === 'simple' && ex.answer_page_start ? parseInt(ex.answer_page_start, 10) : null,
      answer_page_end: ex.answer_page_mode === 'simple' && ex.answer_page_end ? parseInt(ex.answer_page_end, 10) : null,
      answer_remarks: combineExerciseRemarks(ex.answer_page_mode === 'custom' ? ex.answer_complex_pages : '', '') || null,
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
      answer_pdf_name: ex.answer_pdf_name ?? undefined,
      answer_page_start: ex.answer_page_start ?? undefined,
      answer_page_end: ex.answer_page_end ?? undefined,
      answer_remarks: ex.answer_remarks ?? undefined,
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
      // Rollback to original state and show error
      updateSessionInCache(originalSession);
      showToast("Failed to save exercises. Changes reverted.", "error");
    }
  }, [session, exercises, exerciseType, onClose, onSave, showToast]);

  // Ref for focusing newly added exercise input
  const newExerciseInputRef = useRef<HTMLInputElement>(null);
  const shouldFocusNewRef = useRef(false);

  const addExercise = useCallback(() => {
    setExercises((prev) => [...prev, createExercise(exerciseType)]);
    setIsDirty(true);
    shouldFocusNewRef.current = true;
  }, [exerciseType]);

  // Toggle checkbox selection for an exercise row
  const toggleSelection = useCallback((index: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  // Select all / deselect all
  const toggleSelectAll = useCallback(() => {
    setSelectedIndices(prev => {
      if (prev.size === exercises.length) return new Set();
      return new Set(exercises.map((_, i) => i));
    });
  }, [exercises.length]);

  // Copy selected exercises (or all if none selected) to clipboard
  const handleCopyExercises = useCallback(() => {
    if (exercises.length === 0) {
      showToast('No exercises to copy', 'info');
      return;
    }
    const toCopy = selectedIndices.size > 0
      ? exercises.filter((_, i) => selectedIndices.has(i))
      : exercises;
    copyExercisesToClipboard(toCopy, session.id, session.student_name || '');
    setClipboardData(getExerciseClipboard());
  }, [exercises, selectedIndices, session.id, session.student_name]);

  // Show paste confirmation dialog
  const handlePasteRequest = useCallback(() => {
    const clipboard = getExerciseClipboard();
    if (!clipboard) {
      showToast('Clipboard is empty', 'info');
      return;
    }
    setClipboardData(clipboard);
    setShowPasteConfirm(true);
  }, [showToast]);

  // Execute paste after confirmation
  const handlePasteConfirm = useCallback(() => {
    if (!clipboardData) return;
    const newExercises = createExercisesFromClipboard(clipboardData.exercises, exerciseType);
    setExercises(prev => [...prev, ...newExercises]);
    setIsDirty(true);
    shouldFocusNewRef.current = true;
    setShowPasteConfirm(false);
    showToast(
      `Pasted ${newExercises.length} exercise${newExercises.length !== 1 ? 's' : ''}${clipboardData.sourceStudentName ? ` from ${clipboardData.sourceStudentName}` : ''}`,
      'success'
    );
  }, [clipboardData, exerciseType, showToast, setIsDirty]);

  // Handle manual browse for answer file
  const handleBrowseAnswer = useCallback((clientId: string) => {
    setBrowsingForAnswerClientId(clientId);
    setAnswerFolderTreeOpen(true);
  }, []);

  // Handle answer file selected from folder picker
  const handleAnswerFileSelected = useCallback((path: string, pages?: string) => {
    if (browsingForAnswerClientId) {
      setExercises(prev => prev.map(ex => {
        if (ex.clientId !== browsingForAnswerClientId) return ex;

        // Build the updates
        const updates: Partial<ExerciseFormItem> = { answer_pdf_name: path };

        // Apply page selection if provided
        if (pages) {
          const pageFields = getPageFieldsFromSelection(parsePageInput(pages));
          if (pageFields) {
            updates.answer_page_mode = pageFields.page_mode;
            updates.answer_page_start = pageFields.page_start;
            updates.answer_page_end = pageFields.page_end;
            updates.answer_complex_pages = pageFields.complex_pages;
          }
        }

        return { ...ex, ...updates };
      }));
      setIsDirty(true);
      setBrowsingForAnswerClientId(null);
    }
  }, [browsingForAnswerClientId, setIsDirty]);

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

      // Ctrl+C - Copy exercises (only when checkboxes are selected, to avoid blocking native copy)
      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && !e.shiftKey && !e.altKey) {
        if (selectedIndices.size > 0) {
          e.preventDefault();
          handleCopyExercises();
          return;
        }
        // If nothing selected, let native copy work
      }

      // Ctrl+V - Paste exercises (only when not focused on an input/textarea)
      if ((e.metaKey || e.ctrlKey) && e.key === 'v' && !e.shiftKey && !e.altKey) {
        const active = document.activeElement;
        const isInputFocused = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
        if (!isInputFocused && getExerciseClipboard()) {
          e.preventDefault();
          handlePasteRequest();
          return;
        }
        // If focused on input, let native paste work
      }

      // Handle paste confirm dialog keyboard
      if (showPasteConfirm) {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          handlePasteConfirm();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setShowPasteConfirm(false);
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

      // Block all keyboard events from reaching parent page handlers.
      // Native input behavior (typing, Ctrl+A select, etc.) still works
      // because stopPropagation only blocks JS handlers, not browser defaults.
      e.stopPropagation();
    };

    // Use capture phase to intercept before modal's handlers
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, handleSave, addExercise, handleCopyExercises, handlePasteRequest, handlePasteConfirm, showPasteConfirm, selectedIndices, focusedRowIndex, pendingDeleteIndex, requestDelete, confirmDelete, cancelDelete, showCloseConfirm, cancelClose, handleCloseAttempt]);

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
      const newExercises = paths.slice(1).map((path) => createExercise(exerciseType, path));
      setExercises((prev) => insertExercisesAfterIndex(prev, searchForIndex, newExercises));
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
        const pageFields = getPageFieldsFromSelection(parsePageInput(pages));
        if (pageFields) {
          updateExercise(browsingForIndex, "page_mode", pageFields.page_mode);
          updateExercise(browsingForIndex, "page_start", pageFields.page_start);
          updateExercise(browsingForIndex, "page_end", pageFields.page_end);
          updateExercise(browsingForIndex, "complex_pages", pageFields.complex_pages);
        }
      }

      setBrowsingForIndex(null);
    }
  }, [browsingForIndex]);

  // Handle batch add from folder picker (multi-select mode)
  const handleBatchAddFromBrowse = useCallback((selections: FileSelection[]) => {
    if (selections.length === 0) return;

    // If we were browsing for a specific index, fill that first
    let startIndex = 0;
    if (browsingForIndex !== null && selections.length > 0) {
      const first = selections[0];
      updateExercise(browsingForIndex, "pdf_name", first.path);

      const pageFields = getPageFieldsFromSelection(parsePageInput(first.pages));
      if (pageFields) {
        updateExercise(browsingForIndex, "page_mode", pageFields.page_mode);
        updateExercise(browsingForIndex, "page_start", pageFields.page_start);
        updateExercise(browsingForIndex, "page_end", pageFields.page_end);
        updateExercise(browsingForIndex, "complex_pages", pageFields.complex_pages);
      }

      startIndex = 1;
    }

    // Create new exercise rows for remaining files
    if (selections.length > startIndex) {
      const newExercises = selections.slice(startIndex).map((sel) =>
        createExerciseFromSelection(exerciseType, sel.path, parsePageInput(sel.pages))
      );

      setExercises((prev) =>
        browsingForIndex !== null
          ? insertExercisesAfterIndex(prev, browsingForIndex, newExercises)
          : [...prev, ...newExercises]
      );
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
    const itemState = trendingItemState[item.filename];

    // If already cached, open immediately
    if (itemState?.status === 'available' && itemState.doc) {
      setTrendingPreviewDoc(itemState.doc);
      return;
    }

    // If already known to be unavailable or checking, do nothing
    if (itemState?.status === 'unavailable' || itemState?.status === 'checking') return;

    // Start checking
    setTrendingItemState(prev => ({ ...prev, [item.filename]: { status: 'checking' } }));

    try {
      const path = item.normalized_paths?.split(',')[0]?.trim();
      if (!path) {
        setTrendingItemState(prev => ({ ...prev, [item.filename]: { status: 'unavailable' } }));
        return;
      }

      const response = await api.paperless.search(path, 3, 'all');
      if (response.results.length > 0) {
        // Found - cache and open preview
        const doc = response.results[0];
        setTrendingItemState(prev => ({ ...prev, [item.filename]: { status: 'available', doc } }));
        setTrendingPreviewDoc(doc);
      } else {
        setTrendingItemState(prev => ({ ...prev, [item.filename]: { status: 'unavailable' } }));
      }
    } catch {
      setTrendingItemState(prev => ({ ...prev, [item.filename]: { status: 'unavailable' } }));
    }
  }, [trendingItemState]);

  // Handle file selected from Paperless search (single select)
  const handlePaperlessSelected = useCallback((path: string, pageSelection?: PageSelection) => {
    if (searchingForIndex !== null) {
      updateExercise(searchingForIndex, "pdf_name", path);

      // Auto-populate page fields if selection has page info
      const pageFields = getPageFieldsFromSelection(pageSelection);
      if (pageFields) {
        updateExercise(searchingForIndex, "page_mode", pageFields.page_mode);
        updateExercise(searchingForIndex, "page_start", pageFields.page_start);
        updateExercise(searchingForIndex, "page_end", pageFields.page_end);
        updateExercise(searchingForIndex, "complex_pages", pageFields.complex_pages);
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

      // Apply page selection for the first item
      const pageFields = getPageFieldsFromSelection(first.pageSelection);
      if (pageFields) {
        updateExercise(searchingForIndex, "page_mode", pageFields.page_mode);
        updateExercise(searchingForIndex, "page_start", pageFields.page_start);
        updateExercise(searchingForIndex, "page_end", pageFields.page_end);
        updateExercise(searchingForIndex, "complex_pages", pageFields.complex_pages);
      }

      // Additional selections create new rows
      if (selections.length > 1) {
        const newExercises = selections.slice(1).map(({ path, pageSelection }) =>
          createExerciseFromSelection(exerciseType, path, pageSelection)
        );
        setExercises((prev) => insertExercisesAfterIndex(prev, searchingForIndex!, newExercises));
        setIsDirty(true);
      }

      setSearchingForIndex(null);
    }
  }, [searchingForIndex, exerciseType]);

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
      setDownloadAllState('error');
      setTimeout(() => setDownloadAllState('idle'), 2000);
    } else {
      setDownloadAllState('idle');
    }
  }, [exercises, downloadAllState, buildStampInfo, session, exerciseType]);

  // Handle download all answer files in one combined file
  const handleDownloadAllAnswers = useCallback(async () => {
    if (downloadAllAnswersState === 'loading') return;

    // Filter exercises that have PDF paths (answers will be searched or use saved answer_pdf_name)
    const exercisesWithPdfs = exercises.filter(ex => ex.pdf_name && ex.pdf_name.trim());
    if (exercisesWithPdfs.length === 0) return;

    setDownloadAllAnswersState('loading');
    const stamp = buildStampInfo();

    // Build filename: Ans_CW_1978_John_Doe_20260110.pdf
    const dateStr = session.session_date.replace(/-/g, '');
    const studentName = session.student_name.replace(/\s+/g, '_');
    const filename = `Ans_${exerciseType}_${session.school_student_id}_${studentName}_${dateStr}.pdf`;

    const result = await downloadAllAnswerFiles(exercisesWithPdfs, filename, stamp, searchPaperlessByPath);
    if (result.status === 'success') {
      setDownloadAllAnswersState('idle');
    } else {
      setDownloadAllAnswersState('error');
      setTimeout(() => setDownloadAllAnswersState('idle'), 2000);
    }
  }, [exercises, downloadAllAnswersState, buildStampInfo, session, exerciseType]);

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
          <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 hidden sm:inline">
            Alt+N add · Alt+⌫ del · Ctrl+↵ save · Ctrl+C/V copy
          </span>
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleCloseAttempt}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={readOnly} title={readOnly ? "Read-only access" : undefined}>
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
                          <RecapExerciseItem key={i} pdfName={ex.pdf_name} pageStart={ex.page_start} pageEnd={ex.page_end} stamp={recapStamp} />
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
                          <RecapExerciseItem pdfName={hw.pdf_name} stamp={recapStamp} />
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
                          setExercises(prev => [...prev, createExercise(exerciseType, firstPath)]);
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
                        {trendingItemState[item.filename]?.status === 'unavailable' ? (
                          <div className="p-1 shrink-0" title="Not available in Shelv" onClick={(e) => e.stopPropagation()}>
                            <EyeOff className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600" />
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePreviewTrending(item);
                            }}
                            disabled={trendingItemState[item.filename]?.status === 'checking'}
                            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-amber-600 dark:hover:text-amber-400 shrink-0 disabled:opacity-50"
                            title={trendingItemState[item.filename]?.status === 'checking' ? 'Checking...' : 'Preview PDF'}
                          >
                            {trendingItemState[item.filename]?.status === 'checking' ? (
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
                                  // Check if user has access to this detail's location
                                  const canAccessLocation = !session.location || session.location === detail.location;
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
                                      {canAccessLocation ? (
                                        <Link
                                          href={`/students/${detail.student_id}`}
                                          target="_blank"
                                          className="truncate flex-1 text-[#a0704b] dark:text-[#cd853f] hover:underline"
                                          title={`${displayId} ${detail.student_name}`}
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {detail.student_name}
                                        </Link>
                                      ) : (
                                        <span className="truncate flex-1 text-gray-500 dark:text-gray-400" title={detail.student_name}>
                                          {detail.student_name}
                                        </span>
                                      )}
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
                                      {canAccessLocation ? (
                                        <Link
                                          href={`/sessions/${detail.session_id}`}
                                          target="_blank"
                                          className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 shrink-0"
                                          title="Go to session"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <ExternalLink className="h-2.5 w-2.5 text-gray-400 hover:text-[#a0704b]" />
                                        </Link>
                                      ) : (
                                        <div className="p-0.5 shrink-0 w-3.5" />
                                      )}
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
              <button
                type="button"
                onClick={handleDownloadAllAnswers}
                disabled={downloadAllAnswersState === 'loading'}
                className={cn(
                  "flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded transition-colors",
                  "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50",
                  downloadAllAnswersState === 'loading' && "opacity-50 cursor-not-allowed"
                )}
              >
                {downloadAllAnswersState === 'loading' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : downloadAllAnswersState === 'error' ? (
                  <XCircle className="h-4 w-4" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download Answers
              </button>
            </div>
          ) : (
            <div /> // Spacer
          )}

          {/* Add button */}
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

        {/* Copy/Paste Controls Row */}
        {((exercises.length > 0 && !readOnly) || (clipboardData && !readOnly)) && (
          <div className="flex items-center gap-1.5">
            {/* Select All toggle */}
            {exercises.length > 0 && !readOnly && (
              <button
                type="button"
                onClick={toggleSelectAll}
                className="flex items-center gap-1 px-1.5 py-1 text-xs rounded transition-colors text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                title={selectedIndices.size === exercises.length ? "Deselect all" : "Select all"}
              >
                {selectedIndices.size === exercises.length && exercises.length > 0 ? (
                  <CheckSquare className="h-3.5 w-3.5" />
                ) : (
                  <Square className="h-3.5 w-3.5" />
                )}
                <span>{selectedIndices.size === exercises.length && exercises.length > 0 ? "Deselect" : "Select all"}</span>
              </button>
            )}

            {/* Copy button */}
            {exercises.length > 0 && !readOnly && (
              <button
                type="button"
                onClick={handleCopyExercises}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                title={selectedIndices.size > 0
                  ? `Copy ${selectedIndices.size} selected exercise${selectedIndices.size !== 1 ? 's' : ''} (Ctrl+C)`
                  : `Copy all ${exercises.length} exercise${exercises.length !== 1 ? 's' : ''} (Ctrl+C)`}
              >
                <Copy className="h-3 w-3" />
                Copy{selectedIndices.size > 0 ? ` (${selectedIndices.size})` : ''}
              </button>
            )}

            {/* Paste button */}
            {clipboardData && !readOnly && (
              <button
                type="button"
                onClick={handlePasteRequest}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 hover:bg-teal-200 dark:hover:bg-teal-900/50"
                title={`Paste ${clipboardData.exercises.length} exercise${clipboardData.exercises.length !== 1 ? 's' : ''} from ${clipboardData.sourceStudentName || 'clipboard'} (Ctrl+V)`}
              >
                <Clipboard className="h-3 w-3" />
                Paste
                <span className="text-[10px] px-1 py-0.5 bg-teal-500 text-white rounded-full min-w-[16px] text-center leading-tight">
                  {clipboardData.exercises.length}
                </span>
              </button>
            )}
          </div>
        )}

        {/* Paste Confirmation Dialog */}
        {showPasteConfirm && clipboardData && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800">
            <div className="flex items-center gap-2 min-w-0">
              <Clipboard className="h-4 w-4 text-teal-600 dark:text-teal-400 flex-shrink-0" />
              <span className="text-sm text-teal-700 dark:text-teal-300">
                Paste {clipboardData.exercises.length} exercise{clipboardData.exercises.length !== 1 ? 's' : ''}
                {clipboardData.sourceStudentName ? ` from ${clipboardData.sourceStudentName}` : ''}?
              </span>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPasteConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handlePasteConfirm}
                className="bg-teal-600 hover:bg-teal-700 text-white"
              >
                Paste
              </Button>
            </div>
          </div>
        )}

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
        ) : (<>
          <Reorder.Group
            axis="y"
            values={exercises.map(ex => ex.clientId)}
            onReorder={(newOrder) => {
              const reordered = newOrder.map(id => exercises.find(ex => ex.clientId === id)!);
              setExercises(reordered);
              setIsDirty(true);
              setSelectedIndices(new Set());
            }}
            className="space-y-3"
          >
            {exercises.map((exercise, index) => (
              <ReorderableItem key={exercise.clientId} value={exercise.clientId} disabled={readOnly}>
                {(dragControls) => (
              <div
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                className={cn(
                  "p-3 rounded-lg border transition-all select-none",
                  isCW
                    ? "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800"
                    : "bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800",
                  focusedRowIndex === index && "ring-2 ring-amber-400/70 ring-offset-1",
                  isDraggingOver === index && "ring-2 ring-amber-400 bg-amber-50/50 dark:bg-amber-900/30"
                )}
              >
                <div className="space-y-2">
                  {/* Row 1: Drag handle, Checkbox, Type badge, PDF path, action buttons, delete */}
                  <div className="flex items-center gap-2">
                    {/* Drag handle for reordering */}
                    {dragControls && (
                      <div
                        className="flex-shrink-0 cursor-grab active:cursor-grabbing touch-none p-0.5"
                        onPointerDown={(e) => dragControls.start(e)}
                      >
                        <GripVertical className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                      </div>
                    )}
                    {/* Selection checkbox */}
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => toggleSelection(index)}
                        className="flex-shrink-0 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        title={selectedIndices.has(index) ? "Deselect" : "Select for copying"}
                      >
                        {selectedIndices.has(index) ? (
                          <CheckSquare className="h-4 w-4 text-teal-500 dark:text-teal-400" />
                        ) : (
                          <Square className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                        )}
                      </button>
                    )}
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

                      {/* Answer Section - Shared Component */}
                      <ExerciseAnswerSection
                        clientId={exercise.clientId}
                        index={index}
                        radioNamePrefix="exercise"
                        pdfName={exercise.pdf_name}
                        answerPdfName={exercise.answer_pdf_name}
                        answerPageMode={exercise.answer_page_mode}
                        answerPageStart={exercise.answer_page_start}
                        answerPageEnd={exercise.answer_page_end}
                        answerComplexPages={exercise.answer_complex_pages}
                        onAnswerChange={(field, value) => updateExercise(index, field, value)}
                        onBrowseAnswer={() => handleBrowseAnswer(exercise.clientId)}
                        onFocus={() => setFocusedRowIndex(index)}
                        inputClass={inputClass}
                        canBrowseFiles={canBrowseFiles}
                      />
                    </div>
                  </div>
                </div>
              </div>
                )}
              </ReorderableItem>
            ))}
          </Reorder.Group>
          {/* Bottom add row */}
          {!readOnly && (
            <button
              type="button"
              onClick={addExercise}
              className={cn(
                "w-full flex items-center justify-center gap-1.5 py-2 text-sm rounded-lg border-2 border-dashed transition-colors",
                isCW
                  ? "text-red-400 dark:text-red-500 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 dark:hover:text-red-400"
                  : "text-blue-400 dark:text-blue-500 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-500 dark:hover:text-blue-400"
              )}
            >
              <Plus className="h-4 w-4" />
              Add {title}
            </button>
          )}
        </>)}
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

      {/* Answer File Browser Modal */}
      <FolderTreeModal
        isOpen={answerFolderTreeOpen}
        onClose={() => {
          setAnswerFolderTreeOpen(false);
          setBrowsingForAnswerClientId(null);
        }}
        onFileSelected={handleAnswerFileSelected}
        allowMultiSelect={false}
        initialPath={browsingForAnswerClientId
          ? exercises.find(ex => ex.clientId === browsingForAnswerClientId)?.answer_pdf_name || exercises.find(ex => ex.clientId === browsingForAnswerClientId)?.pdf_name
          : undefined
        }
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
        documentId={trendingPreviewDoc?.id ?? null}
        documentTitle={trendingPreviewDoc?.title}
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
