"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, PenTool, Home, FolderOpen, ExternalLink, Printer, Loader2, XCircle, Search, Download, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { getGradeColor } from "@/lib/constants";
import { api, sessionsAPI } from "@/lib/api";
import { updateSessionInCache } from "@/lib/session-cache";
import { useToast } from "@/contexts/ToastContext";
import type { Session, PageSelection } from "@/types";
import { isFileSystemAccessSupported, openFileFromPathWithFallback, printFileFromPathWithFallback, printBulkFiles, downloadBulkFiles } from "@/lib/file-system";
import { FolderTreeModal, type FileSelection } from "@/components/ui/folder-tree-modal";
import { PaperlessSearchModal } from "@/components/ui/paperless-search-modal";
import { combineExerciseRemarks, validateExercisePageRange, parsePageInput, type ExerciseValidationError } from "@/lib/exercise-utils";



// Exercise form item type
export interface ExerciseFormItem {
  exercise_type: "CW" | "HW";
  pdf_name: string;
  page_mode: 'simple' | 'custom';  // Tracks which page input mode is active
  page_start: string;              // For simple mode
  page_end: string;                // For simple mode
  complex_pages: string;           // For custom mode (e.g., "1,3,5-7")
  remarks: string;
}

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
  const [fileActionState, setFileActionState] = useState<Record<number, { open?: 'loading' | 'error'; print?: 'loading' | 'error' }>>({});
  const [paperlessSearchOpen, setPaperlessSearchOpen] = useState(false);
  const [searchingForIndex, setSearchingForIndex] = useState<number | null>(null);
  const [printAllState, setPrintAllState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [downloadAllState, setDownloadAllState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{ current: number; total: number } | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ExerciseValidationError[]>([]);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const { showToast } = useToast();

  // Check for File System Access API support on mount
  useEffect(() => {
    setCanBrowseFiles(isFileSystemAccessSupported());
  }, []);

  // Warn user about unsaved changes before leaving
  useEffect(() => {
    if (!isDirty || !isOpen) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, isOpen]);

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

    // Filter out empty PDF names (defensive, should already be filtered)
    const validExercises = exercises.filter(ex => ex.pdf_name && ex.pdf_name.trim());

    // Build API format with remarks encoding
    const apiExercises = validExercises.map((ex) => ({
      exercise_type: ex.exercise_type,
      pdf_name: ex.pdf_name,
      page_start: ex.page_mode === 'simple' && ex.page_start ? parseInt(ex.page_start, 10) : null,
      page_end: ex.page_mode === 'simple' && ex.page_end ? parseInt(ex.page_end, 10) : null,
      remarks: combineExerciseRemarks(ex.page_mode === 'custom' ? ex.complex_pages : '', ex.remarks) || null,
    }));

    let successCount = 0;
    let failCount = 0;

    // Save to each session with progress tracking
    // Use concurrency limit of 5 to avoid overwhelming the server
    const CONCURRENCY = 5;
    for (let i = 0; i < sessions.length; i += CONCURRENCY) {
      const batch = sessions.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(session =>
          sessionsAPI.saveExercises(session.id, exerciseType, apiExercises)
            .then(updated => {
              updateSessionInCache(updated);
              return { success: true };
            })
        )
      );

      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          successCount++;
        } else {
          console.error(`Failed to save to session ${batch[idx].id}:`, result.reason);
          failCount++;
        }
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
    setExercises([]); // Reset for next use
    setIsDirty(false);
    setValidationErrors([]);
    onClose();
  }, [sessions, exerciseType, exercises, onSave, onClose, showToast]);

  // Handle close attempts - show confirmation if dirty
  const handleCloseAttempt = useCallback(() => {
    if (isDirty) {
      setShowCloseConfirm(true);
    } else {
      setExercises([]);
      setIsDirty(false);
      setValidationErrors([]);
      onClose();
    }
  }, [isDirty, onClose]);

  // Actually close and reset everything
  const handleClose = useCallback(() => {
    setExercises([]);
    setIsDirty(false);
    setValidationErrors([]);
    setShowCloseConfirm(false);
    onClose();
  }, [onClose]);

  const addExercise = useCallback(() => {
    setExercises((prev) => [
      ...prev,
      { exercise_type: exerciseType, pdf_name: "", page_mode: 'simple', page_start: "", page_end: "", complex_pages: "", remarks: "" },
    ]);
    setIsDirty(true);
    shouldFocusNewRef.current = true;
  }, [exerciseType]);

  const duplicateExercise = useCallback((index: number) => {
    setExercises((prev) => {
      const exerciseToDuplicate = prev[index];
      if (!exerciseToDuplicate) return prev;
      const duplicate = { ...exerciseToDuplicate };
      // Insert after the current index
      const before = prev.slice(0, index + 1);
      const after = prev.slice(index + 1);
      return [...before, duplicate, ...after];
    });
    setIsDirty(true);
  }, []);

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
        setExercises((prev) => {
          const newExercises = selections.slice(1).map((sel) => {
            const parsed = sel.pages ? parsePageInput(sel.pages) : null;
            return {
              exercise_type: exerciseType,
              pdf_name: sel.path,
              page_mode: parsed?.complexRange ? 'custom' as const : 'simple' as const,
              page_start: parsed?.complexRange ? "" : (parsed?.pageStart?.toString() || ""),
              page_end: parsed?.complexRange ? "" : (parsed?.pageEnd?.toString() || ""),
              complex_pages: parsed?.complexRange || "",
              remarks: "",
            };
          });
          // Insert after the current index
          const before = prev.slice(0, browsingForIndex + 1);
          const after = prev.slice(browsingForIndex + 1);
          return [...before, ...newExercises, ...after];
        });
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

  // Handle open file in new tab
  const handleOpenFile = useCallback(async (index: number, path: string) => {
    if (!path || fileActionState[index]?.open === 'loading') return;
    setFileActionState(prev => ({ ...prev, [index]: { ...prev[index], open: 'loading' } }));
    const error = await openFileFromPathWithFallback(path, searchPaperlessByPath);
    if (error) {
      console.warn('Failed to open file:', error);
      setFileActionState(prev => ({ ...prev, [index]: { ...prev[index], open: 'error' } }));
      setTimeout(() => setFileActionState(prev => ({ ...prev, [index]: { ...prev[index], open: undefined } })), 2000);
    } else {
      setFileActionState(prev => ({ ...prev, [index]: { ...prev[index], open: undefined } }));
    }
  }, [fileActionState, searchPaperlessByPath]);

  // Handle print file with page range support
  const handlePrintFile = useCallback(async (index: number, exercise: ExerciseFormItem) => {
    const path = exercise.pdf_name;
    if (!path || fileActionState[index]?.print === 'loading') return;

    // Extract page range info
    const pageStart = exercise.page_start ? parseInt(exercise.page_start, 10) : undefined;
    const pageEnd = exercise.page_end ? parseInt(exercise.page_end, 10) : undefined;

    // Use complex_pages directly (no more parsing from remarks)
    const complexRange = exercise.complex_pages?.trim() || undefined;

    setFileActionState(prev => ({ ...prev, [index]: { ...prev[index], print: 'loading' } }));
    const error = await printFileFromPathWithFallback(path, pageStart, pageEnd, complexRange, undefined, searchPaperlessByPath);
    if (error) {
      console.warn('Failed to print file:', error);
      setFileActionState(prev => ({ ...prev, [index]: { ...prev[index], print: 'error' } }));
      setTimeout(() => setFileActionState(prev => ({ ...prev, [index]: { ...prev[index], print: undefined } })), 2000);
    } else {
      setFileActionState(prev => ({ ...prev, [index]: { ...prev[index], print: undefined } }));
    }
  }, [fileActionState, searchPaperlessByPath]);

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
  }, [exercises, printAllState, sessions, exerciseType, searchPaperlessByPath]);

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
  }, [exercises, downloadAllState, sessions, exerciseType, searchPaperlessByPath]);

  const removeExercise = useCallback((index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  }, []);

  const confirmDelete = useCallback(() => {
    if (deleteConfirmIndex !== null) {
      setExercises((prev) => prev.filter((_, i) => i !== deleteConfirmIndex));
      setIsDirty(true);
      setDeleteConfirmIndex(null);
      setFocusedRowIndex(null);
    }
  }, [deleteConfirmIndex]);

  const cancelDelete = useCallback(() => {
    setDeleteConfirmIndex(null);
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
          setShowCloseConfirm(false);
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
      if (deleteConfirmIndex !== null) {
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
        if (deleteConfirmIndex === focusedRowIndex) {
          // Already pending confirmation, confirm it
          confirmDelete();
        } else {
          // First press, request confirmation
          setDeleteConfirmIndex(focusedRowIndex);
        }
        return;
      }
    };

    // Use capture phase to intercept before modal's handlers
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, initiateSave, handleSave, addExercise, focusedRowIndex, deleteConfirmIndex, confirmDelete, cancelDelete, exercises.length, isSaving, showSaveConfirm, showCloseConfirm]);

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
            ).map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-1.5 px-2 py-1 bg-white dark:bg-gray-800 rounded text-xs shadow-sm"
              >
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
            ))}
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
                className={cn(
                  "p-3 rounded-lg border",
                  isCW
                    ? "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800"
                    : "bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800"
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
                      placeholder="PDF name or path"
                      className={cn(inputClass, "text-xs py-1.5 flex-1 min-w-0")}
                    />

                    {/* File action buttons */}
                    {/* Paperless search button - always show */}
                    <button
                      type="button"
                      onClick={() => handlePaperlessSearch(index)}
                      className="px-2 py-1.5 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors shrink-0"
                      title="Search Shelv"
                    >
                      <Search className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    </button>
                    {canBrowseFiles && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleBrowseFile(index)}
                          className="px-2 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0"
                          title="Browse files"
                        >
                          <FolderOpen className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                        </button>
                        {exercise.pdf_name && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenFile(index, exercise.pdf_name)}
                              disabled={fileActionState[index]?.open === 'loading'}
                              className="px-2 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0"
                              title="Open PDF"
                            >
                              {fileActionState[index]?.open === 'loading' ? (
                                <Loader2 className="h-3.5 w-3.5 text-gray-400 animate-spin" />
                              ) : fileActionState[index]?.open === 'error' ? (
                                <XCircle className="h-3.5 w-3.5 text-red-500" />
                              ) : (
                                <ExternalLink className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400 hover:text-blue-500" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePrintFile(index, exercise)}
                              disabled={fileActionState[index]?.print === 'loading'}
                              className="px-2 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0"
                              title="Print PDF (with page range if specified)"
                            >
                              {fileActionState[index]?.print === 'loading' ? (
                                <Loader2 className="h-3.5 w-3.5 text-gray-400 animate-spin" />
                              ) : fileActionState[index]?.print === 'error' ? (
                                <XCircle className="h-3.5 w-3.5 text-red-500" />
                              ) : (
                                <Printer className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400 hover:text-green-500" />
                              )}
                            </button>
                          </>
                        )}
                      </>
                    )}

                    {/* Duplicate button */}
                    <button
                      type="button"
                      onClick={() => duplicateExercise(index)}
                      className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors shrink-0"
                      title="Duplicate exercise"
                    >
                      <Copy className="h-4 w-4" />
                    </button>

                    {/* Delete button with inline confirmation */}
                    {deleteConfirmIndex === index ? (
                      <div className="flex items-center gap-1 text-xs shrink-0">
                        <span className="text-red-500">Delete?</span>
                        <button
                          type="button"
                          onClick={confirmDelete}
                          className="px-1.5 py-0.5 text-red-600 dark:text-red-400 font-medium hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={cancelDelete}
                          className="px-1.5 py-0.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmIndex(index)}
                        className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors shrink-0"
                        title="Remove exercise (Alt+Backspace)"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Row 2: Page Range Mode Selection */}
                  <div className="flex gap-2 items-start">
                    {/* Spacer matching row 1 badge container width */}
                    <div className="w-12 shrink-0" />

                    {/* Page Range Section with Radio Toggle */}
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {/* Simple Range Mode */}
                        <label
                          className={cn(
                            "flex items-center gap-2 cursor-pointer transition-opacity",
                            exercise.page_mode !== 'simple' && "opacity-50"
                          )}
                        >
                          <input
                            type="radio"
                            name={`page-mode-${index}`}
                            checked={exercise.page_mode === 'simple'}
                            onChange={() => {
                              updateExercise(index, "page_mode", "simple");
                              updateExercise(index, "complex_pages", ""); // Clear custom field
                            }}
                            className="text-amber-500 focus:ring-amber-400"
                          />
                          <span className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">Range:</span>
                          <input
                            type="number"
                            value={exercise.page_start}
                            onChange={(e) => {
                              if (exercise.page_mode !== 'simple') {
                                updateExercise(index, "page_mode", "simple");
                                updateExercise(index, "complex_pages", "");
                              }
                              updateExercise(index, "page_start", e.target.value);
                            }}
                            onFocus={() => setFocusedRowIndex(index)}
                            placeholder="From"
                            min="1"
                            disabled={exercise.page_mode !== 'simple'}
                            className={cn(
                              inputClass,
                              "text-xs py-1 w-16",
                              exercise.page_mode !== 'simple' && "opacity-50 cursor-not-allowed",
                              hasFieldError(index, 'page_start') && "border-red-500 ring-1 ring-red-500"
                            )}
                          />
                          <span className="text-xs text-gray-400">–</span>
                          <input
                            type="number"
                            value={exercise.page_end}
                            onChange={(e) => {
                              if (exercise.page_mode !== 'simple') {
                                updateExercise(index, "page_mode", "simple");
                                updateExercise(index, "complex_pages", "");
                              }
                              updateExercise(index, "page_end", e.target.value);
                            }}
                            onFocus={() => setFocusedRowIndex(index)}
                            placeholder="To"
                            min="1"
                            disabled={exercise.page_mode !== 'simple'}
                            className={cn(
                              inputClass,
                              "text-xs py-1 w-16",
                              exercise.page_mode !== 'simple' && "opacity-50 cursor-not-allowed",
                              hasFieldError(index, 'page_end') && "border-red-500 ring-1 ring-red-500"
                            )}
                          />
                        </label>

                        {/* Custom Range Mode */}
                        <label
                          className={cn(
                            "flex items-center gap-2 cursor-pointer transition-opacity flex-1 min-w-[180px]",
                            exercise.page_mode !== 'custom' && "opacity-50"
                          )}
                        >
                          <input
                            type="radio"
                            name={`page-mode-${index}`}
                            checked={exercise.page_mode === 'custom'}
                            onChange={() => {
                              updateExercise(index, "page_mode", "custom");
                              updateExercise(index, "page_start", ""); // Clear simple fields
                              updateExercise(index, "page_end", "");
                            }}
                            className="text-amber-500 focus:ring-amber-400"
                          />
                          <span className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">Custom:</span>
                          <input
                            type="text"
                            value={exercise.complex_pages}
                            onChange={(e) => {
                              if (exercise.page_mode !== 'custom') {
                                updateExercise(index, "page_mode", "custom");
                                updateExercise(index, "page_start", "");
                                updateExercise(index, "page_end", "");
                              }
                              updateExercise(index, "complex_pages", e.target.value);
                            }}
                            onFocus={() => setFocusedRowIndex(index)}
                            placeholder="e.g. 1,3,5-7"
                            disabled={exercise.page_mode !== 'custom'}
                            className={cn(
                              inputClass,
                              "text-xs py-1 flex-1",
                              exercise.page_mode !== 'custom' && "opacity-50 cursor-not-allowed",
                              hasFieldError(index, 'complex_pages') && "border-red-500 ring-1 ring-red-500"
                            )}
                            title="Custom page range (e.g., 1,3,5-7)"
                          />
                        </label>
                      </div>

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
              <Button variant="outline" onClick={() => setShowCloseConfirm(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleClose}>
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
