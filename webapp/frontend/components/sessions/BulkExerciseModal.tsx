"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useFormDirtyTracking, useDeleteConfirmation, useFileActions } from "@/lib/ui-hooks";
import { createPortal } from "react-dom";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Plus, PenTool, Home, Printer, Loader2, XCircle, Download, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { getGradeColor } from "@/lib/constants";
import { sessionsAPI } from "@/lib/api";
import { updateSessionInCache } from "@/lib/session-cache";
import { useToast } from "@/contexts/ToastContext";
import type { Session, PageSelection } from "@/types";
import { isFileSystemAccessSupported, printBulkFiles, downloadBulkFiles } from "@/lib/file-system";
import { FolderTreeModal, type FileSelection } from "@/components/ui/folder-tree-modal";
import { PaperlessSearchModal } from "@/components/ui/paperless-search-modal";
import { FileSearchModal } from "@/components/ui/file-search-modal";
import { combineExerciseRemarks, validateExercisePageRange, parsePageInput, getPageFieldsFromSelection, insertExercisesAfterIndex, type ExerciseValidationError, type ExerciseFormItemBase, generateClientId, createExercise, createExerciseFromSelection } from "@/lib/exercise-utils";
import { ExercisePageRangeInput } from "./ExercisePageRangeInput";
import { ExerciseActionButtons } from "./ExerciseActionButtons";
import { ExerciseDeleteButton } from "./ExerciseDeleteButton";
import { ExerciseAnswerSection } from "./ExerciseAnswerSection";
import { searchPaperlessByPath } from "@/lib/paperless-utils";

// Re-export type for external consumers
export type ExerciseFormItem = ExerciseFormItemBase;

interface BulkExerciseModalProps {
  sessions: Session[];
  exerciseType: "CW" | "HW";
  isOpen: boolean;
  onClose: () => void;
  onSave?: (sessionIds: number[], exercises: ExerciseFormItem[]) => void;
}

export function BulkExerciseModal({
  sessions,
  exerciseType,
  isOpen,
  onClose,
  onSave,
}: BulkExerciseModalProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [exercises, setExercises] = useState<ExerciseFormItem[]>([]);
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);
  const [canBrowseFiles, setCanBrowseFiles] = useState(false);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [browsingForIndex, setBrowsingForIndex] = useState<number | null>(null);
  const [paperlessSearchOpen, setPaperlessSearchOpen] = useState(false);
  const [searchingForIndex, setSearchingForIndex] = useState<number | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState<number | null>(null);
  const [fileSearchOpen, setFileSearchOpen] = useState(false);
  const [searchFilename, setSearchFilename] = useState("");
  const [searchForIndex, setSearchForIndex] = useState<number | null>(null);
  const [batchSearchOpen, setBatchSearchOpen] = useState(false);
  const [searchFilenames, setSearchFilenames] = useState<string[]>([]);
  const [printAllState, setPrintAllState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [downloadAllState, setDownloadAllState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{ current: number; total: number } | null>(null);
  // Per-session save status for visual feedback
  const [sessionSaveStatus, setSessionSaveStatus] = useState<Record<number, 'saving' | 'success' | 'error'>>({});
  const [validationErrors, setValidationErrors] = useState<ExerciseValidationError[]>([]);
  // Answer file browse state
  const [answerFolderTreeOpen, setAnswerFolderTreeOpen] = useState(false);
  const [browsingForAnswerClientId, setBrowsingForAnswerClientId] = useState<string | null>(null);
  const { showToast } = useToast();

  // Wrapper for onClose that includes state reset
  const closeAndReset = useCallback(() => {
    setExercises([]);
    setValidationErrors([]);
    onClose();
  }, [onClose]);

  // Form dirty tracking hook
  const {
    isDirty, setIsDirty, showCloseConfirm, setShowCloseConfirm,
    handleCloseAttempt, confirmDiscard, cancelClose,
  } = useFormDirtyTracking(isOpen, closeAndReset);

  // Delete exercise handler for confirmation hook
  const handleDeleteExercise = useCallback((index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index));
    setIsDirty(true);
    setFocusedRowIndex(null);
  }, [setIsDirty]);

  // Delete confirmation hook
  const {
    pendingIndex: pendingDeleteIndex, requestDelete, confirmDelete, cancelDelete, isPending: isDeletePending,
  } = useDeleteConfirmation(handleDeleteExercise);

  // File open/print actions (from ui-hooks) - no stamp info for bulk modal
  const { fileActionState, handleOpenFile, handlePrintFile } = useFileActions();

  // Check for File System Access API support on mount
  useEffect(() => {
    setCanBrowseFiles(isFileSystemAccessSupported());
  }, []);

  // Ref for focusing newly added exercise input
  const newExerciseInputRef = useRef<HTMLInputElement>(null);
  const shouldFocusNewRef = useRef(false);

  // Initiate save - shows confirmation first
  const initiateSave = useCallback(() => {
    // Filter out exercises with empty PDF names
    const validExercises = exercises.filter(ex => ex.pdf_name && ex.pdf_name.trim());
    const emptyCount = exercises.length - validExercises.length;

    if (emptyCount > 0) {
      showToast(`Removed ${emptyCount} exercise(s) without PDF paths`, 'info');
      setExercises(validExercises);
    }

    if (validExercises.length === 0) {
      showToast('No valid exercises to save', 'error');
      return;
    }

    // Validate page ranges before showing confirmation
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

    // Show confirmation dialog
    setShowSaveConfirm(true);
  }, [exercises, showToast]);

  // Execute actual save after confirmation
  const handleSave = useCallback(async () => {
    setShowSaveConfirm(false);
    setIsSaving(true);
    setSaveProgress({ current: 0, total: sessions.length });
    setSessionSaveStatus({}); // Reset status

    // Filter out empty PDF names (defensive, should already be filtered)
    const validExercises = exercises.filter(ex => ex.pdf_name && ex.pdf_name.trim());

    // Build API format with remarks encoding
    const apiExercises = validExercises.map((ex) => ({
      exercise_type: ex.exercise_type,
      pdf_name: ex.pdf_name,
      page_start: ex.page_mode === 'simple' && ex.page_start ? parseInt(ex.page_start, 10) : null,
      page_end: ex.page_mode === 'simple' && ex.page_end ? parseInt(ex.page_end, 10) : null,
      remarks: combineExerciseRemarks(ex.page_mode === 'custom' ? ex.complex_pages : '', ex.remarks) || null,
      // Answer file fields
      answer_pdf_name: ex.answer_pdf_name || null,
      answer_page_start: ex.answer_page_mode === 'simple' && ex.answer_page_start ? parseInt(ex.answer_page_start, 10) : null,
      answer_page_end: ex.answer_page_mode === 'simple' && ex.answer_page_end ? parseInt(ex.answer_page_end, 10) : null,
      answer_remarks: combineExerciseRemarks(ex.answer_page_mode === 'custom' ? ex.answer_complex_pages : '', '') || null,
    }));

    let successCount = 0;
    let failCount = 0;

    // Save to each session with progress tracking
    // Use concurrency limit of 5 to avoid overwhelming the server
    const CONCURRENCY = 5;
    for (let i = 0; i < sessions.length; i += CONCURRENCY) {
      const batch = sessions.slice(i, i + CONCURRENCY);

      // Mark batch as saving
      setSessionSaveStatus(prev => {
        const next = { ...prev };
        batch.forEach(s => { next[s.id] = 'saving'; });
        return next;
      });

      const results = await Promise.allSettled(
        batch.map(session =>
          sessionsAPI.saveExercises(session.id, exerciseType, apiExercises)
            .then(updated => {
              updateSessionInCache(updated);
              return { sessionId: session.id, success: true };
            })
            .catch(err => {
              throw { sessionId: session.id, error: err };
            })
        )
      );

      // Update status for each result
      setSessionSaveStatus(prev => {
        const next = { ...prev };
        results.forEach((result, idx) => {
          const sessionId = batch[idx].id;
          if (result.status === 'fulfilled') {
            next[sessionId] = 'success';
            successCount++;
          } else {
            console.error(`Failed to save to session ${sessionId}:`, result.reason);
            next[sessionId] = 'error';
            failCount++;
          }
        });
        return next;
      });

      setSaveProgress({ current: Math.min(i + CONCURRENCY, sessions.length), total: sessions.length });
    }

    // Show result toast
    if (failCount === 0) {
      showToast(`Saved ${exerciseType} to ${successCount} session(s)`, 'success');
    } else {
      showToast(`Saved ${successCount}, failed ${failCount}`, 'error');
    }

    // Notify parent if provided
    if (onSave) {
      onSave(sessions.map(s => s.id), validExercises);
    }

    setIsSaving(false);
    setSaveProgress(null);
    setSessionSaveStatus({}); // Clear status after close
    setExercises([]); // Reset for next use
    setIsDirty(false);
    setValidationErrors([]);
    onClose();
  }, [sessions, exerciseType, exercises, onSave, onClose, showToast]);

  const addExercise = useCallback(() => {
    setExercises((prev) => [...prev, createExercise(exerciseType)]);
    setIsDirty(true);
    shouldFocusNewRef.current = true;
  }, [exerciseType]);

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

  // Handle file browse for PDF selection
  const handleBrowseFile = useCallback((index: number) => {
    setBrowsingForIndex(index);
    setFolderPickerOpen(true);
  }, []);

  // Handle file selected from folder picker (single file)
  const handleFileSelected = useCallback((path: string, pages?: string) => {
    if (browsingForIndex !== null) {
      updateExercise(browsingForIndex, "pdf_name", path);

      // If pages provided from preview, parse and apply
      if (pages) {
        const parsed = parsePageInput(pages);
        if (parsed?.complexRange) {
          updateExercise(browsingForIndex, "page_mode", "custom");
          updateExercise(browsingForIndex, "page_start", "");
          updateExercise(browsingForIndex, "page_end", "");
          updateExercise(browsingForIndex, "complex_pages", parsed.complexRange);
        } else if (parsed?.pageStart) {
          updateExercise(browsingForIndex, "page_mode", "simple");
          updateExercise(browsingForIndex, "page_start", String(parsed.pageStart));
          updateExercise(browsingForIndex, "page_end", String(parsed.pageEnd || parsed.pageStart));
          updateExercise(browsingForIndex, "complex_pages", "");
        }
      }

      setBrowsingForIndex(null);
    }
  }, [browsingForIndex]);

  // Handle batch file selection from folder picker (multi-select)
  const handleBatchAddFromBrowse = useCallback((selections: FileSelection[]) => {
    if (selections.length === 0) return;

    if (browsingForIndex !== null) {
      const first = selections[0];
      // First selection goes to the current row
      updateExercise(browsingForIndex, "pdf_name", first.path);

      // Apply page selection for the first item
      if (first.pages) {
        const parsed = parsePageInput(first.pages);
        if (parsed?.complexRange) {
          updateExercise(browsingForIndex, "page_mode", "custom");
          updateExercise(browsingForIndex, "page_start", "");
          updateExercise(browsingForIndex, "page_end", "");
          updateExercise(browsingForIndex, "complex_pages", parsed.complexRange);
        } else if (parsed?.pageStart) {
          updateExercise(browsingForIndex, "page_mode", "simple");
          updateExercise(browsingForIndex, "page_start", String(parsed.pageStart));
          updateExercise(browsingForIndex, "page_end", String(parsed.pageEnd || parsed.pageStart));
          updateExercise(browsingForIndex, "complex_pages", "");
        }
      }

      // Additional selections create new rows
      if (selections.length > 1) {
        const newExercises = selections.slice(1).map((sel) =>
          createExerciseFromSelection(exerciseType, sel.path, parsePageInput(sel.pages))
        );
        setExercises((prev) => insertExercisesAfterIndex(prev, browsingForIndex!, newExercises));
        setIsDirty(true);
      }

      setBrowsingForIndex(null);
    }
    setFolderPickerOpen(false);
  }, [browsingForIndex, exerciseType]);

  // Handle Paperless search
  const handlePaperlessSearch = useCallback((index: number) => {
    setSearchingForIndex(index);
    setPaperlessSearchOpen(true);
  }, []);

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

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(index);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(null);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Filter to only PDF files
    const pdfFiles = files.filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (pdfFiles.length === 0) return;

    if (pdfFiles.length === 1) {
      // Single file: search by filename
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

  // Handle batch file search results
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
      setExercises(prev => insertExercisesAfterIndex(prev, searchForIndex!, newExercises));
      setIsDirty(true);
    }

    setBatchSearchOpen(false);
    setSearchFilenames([]);
    setSearchForIndex(null);
  }, [searchForIndex, exerciseType]);

  // Handle print all exercises in one batch
  const handlePrintAll = useCallback(async () => {
    if (printAllState === 'loading') return;

    // Filter exercises that have PDF paths
    const exercisesWithPdfs = exercises.filter(ex => ex.pdf_name && ex.pdf_name.trim());
    if (exercisesWithPdfs.length === 0) return;

    setPrintAllState('loading');

    // Build title (same format as download filename)
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const printTitle = `Bulk_${exerciseType}_${dateStr}_${sessions.length}students`;

    // No stamp for bulk modal (multiple students)
    const error = await printBulkFiles(exercisesWithPdfs, undefined, searchPaperlessByPath, printTitle);
    if (error) {
      console.warn('Failed to print all files:', error);
      setPrintAllState('error');
      setTimeout(() => setPrintAllState('idle'), 2000);
    } else {
      setPrintAllState('idle');
    }
  }, [exercises, printAllState, sessions, exerciseType]);

  // Handle download all exercises in one combined file
  const handleDownloadAll = useCallback(async () => {
    if (downloadAllState === 'loading') return;

    // Filter exercises that have PDF paths
    const exercisesWithPdfs = exercises.filter(ex => ex.pdf_name && ex.pdf_name.trim());
    if (exercisesWithPdfs.length === 0) return;

    setDownloadAllState('loading');

    // Build filename: Bulk_CW_20260110_5students.pdf
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `Bulk_${exerciseType}_${dateStr}_${sessions.length}students.pdf`;

    const error = await downloadBulkFiles(exercisesWithPdfs, filename, undefined, searchPaperlessByPath);
    if (error) {
      console.warn('Failed to download all files:', error);
      setDownloadAllState('error');
      setTimeout(() => setDownloadAllState('idle'), 2000);
    } else {
      setDownloadAllState('idle');
    }
  }, [exercises, downloadAllState, sessions, exerciseType]);

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

      // Handle save confirmation with Enter/Escape - MUST be at TOP
      if (showSaveConfirm) {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          handleSave();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setShowSaveConfirm(false);
          return;
        }
      }

      // Handle delete confirmation with Enter/Escape when pending
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
        if (exercises.length > 0 && !isSaving && !showSaveConfirm) {
          initiateSave();
        }
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
  }, [isOpen, initiateSave, handleSave, addExercise, focusedRowIndex, pendingDeleteIndex, confirmDelete, cancelDelete, requestDelete, cancelClose, handleCloseAttempt, exercises.length, isSaving, showSaveConfirm, showCloseConfirm]);

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
          <span>Bulk {title}</span>
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
            <Button variant="outline" onClick={handleCloseAttempt} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={initiateSave} disabled={isSaving || exercises.length === 0}>
              {isSaving && saveProgress
                ? `Saving ${saveProgress.current}/${saveProgress.total}...`
                : isSaving
                  ? "Saving..."
                  : `Assign to ${sessions.length} Session${sessions.length > 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Selected Sessions Header */}
        <div className="bg-[#f5ebe0] dark:bg-[#3d3628] rounded-lg p-3">
          <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
            Assigning {title.toLowerCase()} to {sessions.length} session{sessions.length > 1 ? 's' : ''}:
          </div>
          <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
            {[...sessions].sort((a, b) =>
              (a.school_student_id || '').localeCompare(b.school_student_id || '')
            ).map((s) => {
              const status = sessionSaveStatus[s.id];
              return (
                <div
                  key={s.id}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded text-xs shadow-sm",
                    status === 'success' ? "bg-green-50 dark:bg-green-900/20" :
                    status === 'error' ? "bg-red-50 dark:bg-red-900/20" :
                    "bg-white dark:bg-gray-800"
                  )}
                >
                  {status === 'saving' && <Loader2 className="h-3 w-3 animate-spin text-amber-500" />}
                  {status === 'success' && <Check className="h-3 w-3 text-green-500" />}
                  {status === 'error' && <XCircle className="h-3 w-3 text-red-500" />}
                  <span className="text-gray-500 dark:text-gray-400">{s.school_student_id}</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{s.student_name}</span>
                  {s.grade && (
                    <span
                      className="px-1 py-0.5 rounded text-[9px] text-gray-800"
                      style={{ backgroundColor: getGradeColor(s.grade, s.lang_stream) }}
                    >
                      {s.grade}{s.lang_stream}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

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
            Click &quot;Add {title}&quot; to add exercises for all selected sessions.
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

                    {/* Delete button with inline confirmation */}
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
                        radioNamePrefix="bulk-exercise"
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
            ))}
          </div>
        )}
      </div>

      {/* Folder Tree Modal */}
      <FolderTreeModal
        isOpen={folderPickerOpen}
        onClose={() => {
          setFolderPickerOpen(false);
          setBrowsingForIndex(null);
        }}
        onFileSelected={handleFileSelected}
        onFilesSelected={handleBatchAddFromBrowse}
        allowMultiSelect={true}
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
      />

      {/* File Search Modal (single file from drag-drop) */}
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

      {/* Batch File Search Modal (multiple files from drag-drop) */}
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

      {/* Save Confirmation Dialog - uses createPortal to render outside Modal */}
      {showSaveConfirm && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg shadow-xl p-6 w-full max-w-[450px]">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Confirm Bulk Assignment
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Assign {exercises.filter(ex => ex.pdf_name?.trim()).length} exercise(s) to {sessions.length} session(s)?
            </p>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-4 max-h-32 overflow-y-auto">
              <div className="font-medium mb-1">Sessions:</div>
              <div className="flex flex-wrap gap-1">
                {[...sessions].sort((a, b) =>
                  (a.school_student_id || '').localeCompare(b.school_student_id || '')
                ).map(s => (
                  <span key={s.id} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                    {s.school_student_id} {s.student_name}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowSaveConfirm(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                Confirm
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

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
