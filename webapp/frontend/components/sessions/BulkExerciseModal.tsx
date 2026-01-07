"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, PenTool, Home, FolderOpen, ExternalLink, Printer, Loader2, XCircle, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Session, PageSelection } from "@/types";
import { isFileSystemAccessSupported, openFileFromPath, printFileFromPathWithPages } from "@/lib/file-system";
import { FolderTreeModal, type FileSelection } from "@/components/ui/folder-tree-modal";
import { PaperlessSearchModal } from "@/components/ui/paperless-search-modal";

// Parse page input string into structured format
function parsePageInput(input: string): { pageStart?: number; pageEnd?: number; complexRange?: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/[~–—−]/g, '-');
  const match = normalized.match(/^(\d+)(?:-(\d+))?$/);
  if (match) {
    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : start;
    return { pageStart: start, pageEnd: end };
  }
  return { complexRange: normalized };
}

// Grade tag colors (matches EditSessionModal)
const GRADE_COLORS: Record<string, string> = {
  "F1C": "#c2dfce",
  "F1E": "#cedaf5",
  "F2C": "#fbf2d0",
  "F2E": "#f0a19e",
  "F3C": "#e2b1cc",
  "F3E": "#ebb26e",
  "F4C": "#7dc347",
  "F4E": "#a590e6",
};

const getGradeColor = (grade: string | undefined, langStream: string | undefined): string => {
  const key = `${grade || ""}${langStream || ""}`;
  return GRADE_COLORS[key] || "#e5e7eb";
};

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

  // Check for File System Access API support on mount
  useEffect(() => {
    setCanBrowseFiles(isFileSystemAccessSupported());
  }, []);

  // Ref for focusing newly added exercise input
  const newExerciseInputRef = useRef<HTMLInputElement>(null);
  const shouldFocusNewRef = useRef(false);

  const handleSave = useCallback(async () => {
    setIsSaving(true);

    const sessionIds = sessions.map((s) => s.id);

    // For now, just log and close (API not implemented)
    console.log("Bulk saving exercises:", { sessionIds, exerciseType, exercises });

    if (onSave) {
      onSave(sessionIds, exercises);
    }

    setIsSaving(false);
    setExercises([]); // Reset for next use
    onClose();
  }, [sessions, exerciseType, exercises, onSave, onClose]);

  const handleClose = () => {
    setExercises([]); // Reset on close
    onClose();
  };

  const addExercise = useCallback(() => {
    setExercises((prev) => [
      ...prev,
      { exercise_type: exerciseType, pdf_name: "", page_mode: 'simple', page_start: "", page_end: "", complex_pages: "", remarks: "" },
    ]);
    shouldFocusNewRef.current = true;
  }, [exerciseType]);

  const updateExercise = (
    index: number,
    field: keyof ExerciseFormItem,
    value: string
  ) => {
    setExercises((prev) =>
      prev.map((ex, i) => (i === index ? { ...ex, [field]: value } : ex))
    );
  };

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
      }

      setSearchingForIndex(null);
    }
  }, [searchingForIndex, exerciseType]);

  // Handle open file in new tab
  const handleOpenFile = useCallback(async (index: number, path: string) => {
    if (!path || fileActionState[index]?.open === 'loading') return;
    setFileActionState(prev => ({ ...prev, [index]: { ...prev[index], open: 'loading' } }));
    const error = await openFileFromPath(path);
    if (error) {
      console.warn('Failed to open file:', error);
      setFileActionState(prev => ({ ...prev, [index]: { ...prev[index], open: 'error' } }));
      setTimeout(() => setFileActionState(prev => ({ ...prev, [index]: { ...prev[index], open: undefined } })), 2000);
    } else {
      setFileActionState(prev => ({ ...prev, [index]: { ...prev[index], open: undefined } }));
    }
  }, [fileActionState]);

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
    const error = await printFileFromPathWithPages(path, pageStart, pageEnd, complexRange);
    if (error) {
      console.warn('Failed to print file:', error);
      setFileActionState(prev => ({ ...prev, [index]: { ...prev[index], print: 'error' } }));
      setTimeout(() => setFileActionState(prev => ({ ...prev, [index]: { ...prev[index], print: undefined } })), 2000);
    } else {
      setFileActionState(prev => ({ ...prev, [index]: { ...prev[index], print: undefined } }));
    }
  }, [fileActionState]);

  const removeExercise = useCallback((index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index));
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
      // Cmd/Ctrl+Enter - Save
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (exercises.length > 0 && !isSaving) {
          handleSave();
        }
        return;
      }

      // Alt/Option+N - Add new exercise
      if (e.altKey && e.key === 'n') {
        e.preventDefault();
        addExercise();
        return;
      }

      // Alt/Option+Backspace - Delete focused row
      if (e.altKey && e.key === 'Backspace' && focusedRowIndex !== null) {
        e.preventDefault();
        removeExercise(focusedRowIndex);
        setFocusedRowIndex(null);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleSave, addExercise, focusedRowIndex, removeExercise, exercises.length, isSaving]);

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
      onClose={handleClose}
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
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 font-mono text-[10px]">Alt+Del</kbd>
            <span>delete</span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 font-mono text-[10px]">Ctrl+Enter</kbd>
            <span>save</span>
          </span>
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || exercises.length === 0}>
              {isSaving ? "Saving..." : `Assign to ${sessions.length} Session${sessions.length > 1 ? 's' : ''}`}
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

        {/* Add Button */}
        <div className="flex justify-end">
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

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={() => removeExercise(index)}
                      className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors shrink-0"
                      title="Remove exercise"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
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
                              exercise.page_mode !== 'simple' && "opacity-50 cursor-not-allowed"
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
                              exercise.page_mode !== 'simple' && "opacity-50 cursor-not-allowed"
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
                              exercise.page_mode !== 'custom' && "opacity-50 cursor-not-allowed"
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
    </Modal>
  );
}
