"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, PenTool, Home, FolderOpen, ExternalLink, Printer, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { sessionsAPI } from "@/lib/api";
import { updateSessionInCache } from "@/lib/session-cache";
import type { Session } from "@/types";
import { isFileSystemAccessSupported, openFileFromPath, printFileFromPath } from "@/lib/file-system";
import { FolderPickerModal } from "@/components/ui/folder-picker-modal";

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
  page_start: string;
  page_end: string;
  remarks: string;
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
        .map((ex) => ({
          id: ex.id,
          exercise_type: exerciseType,
          pdf_name: ex.pdf_name,
          page_start: ex.page_start?.toString() || "",
          page_end: ex.page_end?.toString() || "",
          remarks: ex.remarks || "",
        }));
      setExercises(filteredExercises);
    }
    if (!isOpen) {
      initializedRef.current = false;
    }
  }, [isOpen, session, exerciseType]);

  const handleSave = useCallback(async () => {
    const sessionId = session.id;
    const currentExercises = [...exercises];

    // Build API format
    const apiExercises = currentExercises.map((ex) => ({
      exercise_type: ex.exercise_type,
      pdf_name: ex.pdf_name,
      page_start: ex.page_start ? parseInt(ex.page_start, 10) : null,
      page_end: ex.page_end ? parseInt(ex.page_end, 10) : null,
      remarks: ex.remarks || null,
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
      page_start: ex.page_start,
      page_end: ex.page_end,
      remarks: ex.remarks,
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
      { exercise_type: exerciseType, pdf_name: "", page_start: "", page_end: "", remarks: "" },
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

  // Handle print file
  const handlePrintFile = useCallback(async (index: number, path: string) => {
    if (!path || fileActionState[index]?.print === 'loading') return;
    setFileActionState(prev => ({ ...prev, [index]: { ...prev[index], print: 'loading' } }));
    const error = await printFileFromPath(path);
    if (error) {
      console.warn('Failed to print file:', error);
      setFileActionState(prev => ({ ...prev, [index]: { ...prev[index], print: 'error' } }));
      setTimeout(() => setFileActionState(prev => ({ ...prev, [index]: { ...prev[index], print: undefined } })), 2000);
    } else {
      setFileActionState(prev => ({ ...prev, [index]: { ...prev[index], print: undefined } }));
    }
  }, [fileActionState]);

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
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 font-mono text-[10px]">⌥N</kbd>
            <span>add</span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 font-mono text-[10px]">⌥⌫</kbd>
            <span>delete</span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 font-mono text-[10px]">⌘↵</kbd>
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
            No {title.toLowerCase()} assigned yet. Click "Add {title}" to add one.
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
                              onClick={() => handlePrintFile(index, exercise.pdf_name)}
                              disabled={fileActionState[index]?.print === 'loading'}
                              className="px-2 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0"
                              title="Print PDF"
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

                  {/* Row 2: Start page, End page, Remarks */}
                  <div className="flex gap-2">
                    {/* Spacer matching row 1 badge container width */}
                    <div className="w-12 shrink-0" />
                    <input
                      type="number"
                      value={exercise.page_start}
                      onChange={(e) => updateExercise(index, "page_start", e.target.value)}
                      onFocus={() => setFocusedRowIndex(index)}
                      placeholder="Start page"
                      min="1"
                      className={cn(inputClass, "text-xs py-1.5 w-24")}
                    />
                    <input
                      type="number"
                      value={exercise.page_end}
                      onChange={(e) => updateExercise(index, "page_end", e.target.value)}
                      onFocus={() => setFocusedRowIndex(index)}
                      placeholder="End page"
                      min="1"
                      className={cn(inputClass, "text-xs py-1.5 w-24")}
                    />
                    <input
                      type="text"
                      value={exercise.remarks}
                      onChange={(e) => updateExercise(index, "remarks", e.target.value)}
                      onFocus={() => setFocusedRowIndex(index)}
                      placeholder="Remarks (optional)"
                      className={cn(inputClass, "text-xs py-1.5 flex-1")}
                    />
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
    </Modal>
  );
}
