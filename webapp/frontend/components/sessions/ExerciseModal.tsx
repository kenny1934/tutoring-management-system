"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, PenTool, Home, FolderOpen, ExternalLink, Printer, Loader2, XCircle, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { sessionsAPI } from "@/lib/api";
import { updateSessionInCache } from "@/lib/session-cache";
import type { Session, PageSelection } from "@/types";
import { isFileSystemAccessSupported, openFileFromPath, printFileFromPathWithPages, printBulkFiles, PrintStampInfo } from "@/lib/file-system";
import { FolderPickerModal } from "@/components/ui/folder-picker-modal";
import { PaperlessSearchModal } from "@/components/ui/paperless-search-modal";

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
  id?: number;
  exercise_type: "CW" | "HW";
  pdf_name: string;
  page_mode: 'simple' | 'custom';  // Tracks which page input mode is active
  page_start: string;              // For simple mode
  page_end: string;                // For simple mode
  complex_pages: string;           // For custom mode (e.g., "1,3,5-7")
  remarks: string;
}

// Parse DB remarks into separate complex_pages, remarks, and detected mode
function parseExerciseRemarks(dbRemarks: string | null | undefined): { complexPages: string; remarks: string } {
  if (!dbRemarks) return { complexPages: '', remarks: '' };

  if (dbRemarks.startsWith('Pages: ')) {
    const delimiterIdx = dbRemarks.indexOf(' || ');
    if (delimiterIdx > 0) {
      return {
        complexPages: dbRemarks.substring(7, delimiterIdx),
        remarks: dbRemarks.substring(delimiterIdx + 4)
      };
    }
    // No remarks, just pages
    return { complexPages: dbRemarks.substring(7), remarks: '' };
  }

  // No pages, just remarks
  return { complexPages: '', remarks: dbRemarks };
}

// Detect page mode based on which fields have values
function detectPageMode(pageStart: string | number | null | undefined, pageEnd: string | number | null | undefined, complexPages: string): 'simple' | 'custom' {
  // If complex pages has content, use custom mode
  if (complexPages && complexPages.trim()) return 'custom';
  // If simple range has content, use simple mode
  if ((pageStart && String(pageStart).trim()) || (pageEnd && String(pageEnd).trim())) return 'simple';
  // Default to simple mode
  return 'simple';
}

// Combine complex_pages and remarks for DB storage
function combineExerciseRemarks(complexPages: string, remarks: string): string {
  const parts: string[] = [];
  if (complexPages.trim()) parts.push(`Pages: ${complexPages.trim()}`);
  if (remarks.trim()) parts.push(remarks.trim());
  return parts.join(' || ');
}

interface ExerciseModalProps {
  session: Session;
  exerciseType: "CW" | "HW";
  isOpen: boolean;
  onClose: () => void;
  onSave?: (sessionId: number, exercises: ExerciseFormItem[]) => void;
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
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [browsingForIndex, setBrowsingForIndex] = useState<number | null>(null);
  const [fileActionState, setFileActionState] = useState<Record<number, { open?: 'loading' | 'error'; print?: 'loading' | 'error' }>>({});
  const [paperlessSearchOpen, setPaperlessSearchOpen] = useState(false);
  const [searchingForIndex, setSearchingForIndex] = useState<number | null>(null);
  const [printAllState, setPrintAllState] = useState<'idle' | 'loading' | 'error'>('idle');

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
    }
    if (!isOpen) {
      initializedRef.current = false;
    }
  }, [isOpen, session, exerciseType]);

  const handleSave = useCallback(async () => {
    const sessionId = session.id;
    const currentExercises = [...exercises];

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

    // Close modal
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
      // Could rollback cache or show toast here
    }
  }, [session, exercises, exerciseType, onClose, onSave]);

  // Ref for focusing newly added exercise input
  const newExerciseInputRef = useRef<HTMLInputElement>(null);
  const shouldFocusNewRef = useRef(false);

  const addExercise = useCallback(() => {
    setExercises((prev) => [
      ...prev,
      { exercise_type: exerciseType, pdf_name: "", page_mode: 'simple', page_start: "", page_end: "", complex_pages: "", remarks: "" },
    ]);
    shouldFocusNewRef.current = true;
  }, [exerciseType]);

  // Focus new exercise input after render
  useEffect(() => {
    if (shouldFocusNewRef.current && newExerciseInputRef.current) {
      newExerciseInputRef.current.focus();
      shouldFocusNewRef.current = false;
    }
  }, [exercises.length]);

  const removeExercise = useCallback((index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl+Enter - Save
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
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
  }, [isOpen, handleSave, addExercise, focusedRowIndex, removeExercise]);

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

  // Handle file selected from folder picker
  const handleFileSelected = useCallback((path: string) => {
    if (browsingForIndex !== null) {
      updateExercise(browsingForIndex, "pdf_name", path);
      setBrowsingForIndex(null);
    }
  }, [browsingForIndex]);

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
  const handlePrintFile = useCallback(async (index: number, exercise: ExerciseFormItem) => {
    const path = exercise.pdf_name;
    if (!path || fileActionState[index]?.print === 'loading') return;

    // Extract page range info
    const pageStart = exercise.page_start ? parseInt(exercise.page_start, 10) : undefined;
    const pageEnd = exercise.page_end ? parseInt(exercise.page_end, 10) : undefined;

    // Use complex_pages directly (no more parsing from remarks)
    const complexRange = exercise.complex_pages?.trim() || undefined;

    // Build stamp info
    const stamp = buildStampInfo();

    setFileActionState(prev => ({ ...prev, [index]: { ...prev[index], print: 'loading' } }));
    const error = await printFileFromPathWithPages(path, pageStart, pageEnd, complexRange, stamp);
    if (error) {
      console.warn('Failed to print file:', error);
      setFileActionState(prev => ({ ...prev, [index]: { ...prev[index], print: 'error' } }));
      setTimeout(() => setFileActionState(prev => ({ ...prev, [index]: { ...prev[index], print: undefined } })), 2000);
    } else {
      setFileActionState(prev => ({ ...prev, [index]: { ...prev[index], print: undefined } }));
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

    const error = await printBulkFiles(exercisesWithPdfs, stamp);
    if (error) {
      console.warn('Failed to print all files:', error);
      setPrintAllState('error');
      setTimeout(() => setPrintAllState('idle'), 2000);
    } else {
      setPrintAllState('idle');
    }
  }, [exercises, printAllState, buildStampInfo]);

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
      onClose={onClose}
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
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 font-mono text-[10px]">Alt+Del</kbd>
            <span>delete</span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 font-mono text-[10px]">Ctrl+Enter</kbd>
            <span>save</span>
          </span>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose}>
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
          <span className="text-base font-bold text-gray-900 dark:text-gray-100">
            {session.student_name}
          </span>
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

        {/* Action Buttons */}
        <div className="flex justify-between items-center">
          {/* Print All Button - only show if there are exercises with PDFs */}
          {canBrowseFiles && exercises.some(ex => ex.pdf_name && ex.pdf_name.trim()) ? (
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
                className={cn(
                  "p-3 rounded-lg border transition-all",
                  isCW
                    ? "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800"
                    : "bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800",
                  focusedRowIndex === index && "ring-2 ring-amber-400/70 ring-offset-1"
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

      {/* Folder Picker Modal */}
      <FolderPickerModal
        isOpen={folderPickerOpen}
        onClose={() => {
          setFolderPickerOpen(false);
          setBrowsingForIndex(null);
        }}
        onFileSelected={handleFileSelected}
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
      />
    </Modal>
  );
}
