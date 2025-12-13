"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, PenTool, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Session } from "@/types";

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
  const [isSaving, setIsSaving] = useState(false);

  // Filter existing exercises to only show the relevant type
  const [exercises, setExercises] = useState<ExerciseFormItem[]>([]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
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
  }, [isOpen, session, exerciseType]);

  const handleSave = async () => {
    setIsSaving(true);

    // For now, just log and close (API not implemented)
    console.log("Saving exercises:", { sessionId: session.id, exerciseType, exercises });

    if (onSave) {
      onSave(session.id, exercises);
    }

    setIsSaving(false);
    onClose();
  };

  const addExercise = () => {
    setExercises((prev) => [
      ...prev,
      { exercise_type: exerciseType, pdf_name: "", page_start: "", page_end: "", remarks: "" },
    ]);
  };

  const updateExercise = (
    index: number,
    field: keyof ExerciseFormItem,
    value: string
  ) => {
    setExercises((prev) =>
      prev.map((ex, i) => (i === index ? { ...ex, [field]: value } : ex))
    );
  };

  const removeExercise = (index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index));
  };

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
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
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
                <div className="flex items-start gap-3">
                  {/* Type badge */}
                  <div
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium shrink-0",
                      isCW
                        ? "bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-200"
                        : "bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-200"
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {exerciseType}
                  </div>

                  {/* Fields */}
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div className="sm:col-span-2">
                      <input
                        type="text"
                        value={exercise.pdf_name}
                        onChange={(e) => updateExercise(index, "pdf_name", e.target.value)}
                        placeholder="PDF name or path"
                        className={cn(inputClass, "text-xs py-1.5")}
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        value={exercise.page_start}
                        onChange={(e) => updateExercise(index, "page_start", e.target.value)}
                        placeholder="Start page"
                        min="1"
                        className={cn(inputClass, "text-xs py-1.5")}
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        value={exercise.page_end}
                        onChange={(e) => updateExercise(index, "page_end", e.target.value)}
                        placeholder="End page"
                        min="1"
                        className={cn(inputClass, "text-xs py-1.5")}
                      />
                    </div>
                    {/* Remarks - spans full grid width */}
                    <div className="sm:col-span-4">
                      <input
                        type="text"
                        value={exercise.remarks}
                        onChange={(e) => updateExercise(index, "remarks", e.target.value)}
                        placeholder="Remarks (optional)"
                        className={cn(inputClass, "text-xs py-1.5")}
                      />
                    </div>
                  </div>

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
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
