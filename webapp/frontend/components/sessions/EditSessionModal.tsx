"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { StarRating, parseStarRating } from "@/components/ui/star-rating";
import { useTutors, useLocations } from "@/lib/hooks";
import { getSessionStatusConfig } from "@/lib/session-status";
import { Plus, Trash2, PenTool, Home, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { sessionsAPI } from "@/lib/api";
import { updateSessionInCache } from "@/lib/session-cache";
import type { Session } from "@/types";

// Available session statuses
const SESSION_STATUSES = [
  "Scheduled",
  "Attended",
  "Trial Class",
  "Make-up Class",
  "No Show",
  "Cancelled",
  "Rescheduled - Pending Make-up",
  "Sick Leave - Pending Make-up",
  "Weather Cancelled - Pending Make-up",
  "Rescheduled - Make-up Booked",
  "Sick Leave - Make-up Booked",
  "Weather Cancelled - Make-up Booked",
];

// Grade tag colors (matches SessionDetailPopover)
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

// Form state type
interface EditFormState {
  session_date: string;
  time_slot_start: string;
  time_slot_end: string;
  location: string;
  tutor_id: number | null;
  session_status: string;
  performance_rating: number;
  notes: string;
  exercises: ExerciseFormItem[];
}

interface ExerciseFormItem {
  id?: number;
  exercise_type: "CW" | "HW";
  pdf_name: string;
  page_start: string;
  page_end: string;
  remarks: string;
}

// Parse time_slot "16:45 - 18:15" (24-hour format) to { start: "16:45", end: "18:15" }
function parseTimeSlot(timeSlot: string): { start: string; end: string } {
  if (!timeSlot) return { start: "", end: "" };

  // Format is "HH:MM - HH:MM" (24-hour), which matches HTML time input directly
  const match = timeSlot.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
  if (!match) return { start: "", end: "" };

  return { start: match[1], end: match[2] };
}

// Format time back to storage format (24-hour)
function formatTimeSlot(start: string, end: string): string {
  return `${start} - ${end}`;
}

// Convert rating number to emoji stars
function ratingToEmoji(rating: number): string {
  return "⭐".repeat(rating);
}

interface EditSessionModalProps {
  session: Session;
  isOpen: boolean;
  onClose: () => void;
  onSave?: (sessionId: number, updates: Partial<Session>) => void;
}

export function EditSessionModal({
  session,
  isOpen,
  onClose,
  onSave,
}: EditSessionModalProps) {
  const { data: tutors } = useTutors();
  const { data: locations } = useLocations();
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  // Track if form has been initialized for this modal open
  const initializedRef = useRef(false);

  // Close status dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setStatusDropdownOpen(false);
      }
    };
    if (statusDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [statusDropdownOpen]);

  // Initialize form state from session
  const [form, setForm] = useState<EditFormState>(() => {
    const times = parseTimeSlot(session.time_slot || "");
    return {
      session_date: session.session_date,
      time_slot_start: times.start,
      time_slot_end: times.end,
      location: session.location || "",
      tutor_id: session.tutor_id,
      session_status: session.session_status,
      performance_rating: parseStarRating(session.performance_rating),
      notes: session.notes || "",
      exercises: (session.exercises || []).map((ex) => ({
        id: ex.id,
        exercise_type: ex.exercise_type === "Classwork" ? "CW" : ex.exercise_type === "Homework" ? "HW" : ex.exercise_type as "CW" | "HW",
        pdf_name: ex.pdf_name,
        page_start: ex.page_start?.toString() || "",
        page_end: ex.page_end?.toString() || "",
        remarks: ex.remarks || "",
      })),
    };
  });

  // Reset form only when modal first opens, not on session changes
  useEffect(() => {
    if (isOpen && !initializedRef.current) {
      initializedRef.current = true;
      const times = parseTimeSlot(session.time_slot || "");
      setForm({
        session_date: session.session_date,
        time_slot_start: times.start,
        time_slot_end: times.end,
        location: session.location || "",
        tutor_id: session.tutor_id,
        session_status: session.session_status,
        performance_rating: parseStarRating(session.performance_rating),
        notes: session.notes || "",
        exercises: (session.exercises || []).map((ex) => ({
          id: ex.id,
          exercise_type: ex.exercise_type === "Classwork" ? "CW" : ex.exercise_type === "Homework" ? "HW" : ex.exercise_type as "CW" | "HW",
          pdf_name: ex.pdf_name,
          page_start: ex.page_start?.toString() || "",
          page_end: ex.page_end?.toString() || "",
          remarks: ex.remarks || "",
        })),
      });
    }
    if (!isOpen) {
      initializedRef.current = false;
    }
  }, [isOpen, session]);

  // Helper to get tutor name without Mr/Ms prefix for sorting (same as sessions toolbar)
  const getTutorSortName = (name: string) => name.replace(/^(Mr\.?|Ms\.?|Mrs\.?)\s*/i, '');

  // Filter tutors by selected location and sort by first name (like sessions toolbar)
  const filteredTutors = useMemo(() => {
    if (!tutors) return [];
    const filtered = !form.location
      ? tutors
      : tutors.filter(t => t.default_location === form.location);
    return [...filtered].sort((a, b) =>
      getTutorSortName(a.tutor_name).localeCompare(getTutorSortName(b.tutor_name))
    );
  }, [tutors, form.location]);

  const handleSave = async () => {
    const sessionId = session.id;
    const currentForm = { ...form };

    // Build updates object for session fields
    const updates = {
      session_date: currentForm.session_date,
      time_slot: formatTimeSlot(currentForm.time_slot_start, currentForm.time_slot_end),
      location: currentForm.location || undefined,
      tutor_id: currentForm.tutor_id || undefined,
      session_status: currentForm.session_status,
      performance_rating: currentForm.performance_rating > 0 ? ratingToEmoji(currentForm.performance_rating) : undefined,
      notes: currentForm.notes || undefined,
    };

    // Build exercises for optimistic update
    const optimisticExercises = currentForm.exercises.map((ex, idx) => ({
      id: ex.id || Date.now() + idx,
      session_id: sessionId,
      exercise_type: ex.exercise_type,
      pdf_name: ex.pdf_name,
      page_start: ex.page_start ? parseInt(ex.page_start, 10) : null,
      page_end: ex.page_end ? parseInt(ex.page_end, 10) : null,
      remarks: ex.remarks || null,
    }));

    // Build optimistic session state
    const optimisticSession = {
      ...session,
      session_date: currentForm.session_date,
      time_slot: formatTimeSlot(currentForm.time_slot_start, currentForm.time_slot_end),
      location: currentForm.location || null,
      tutor_id: currentForm.tutor_id,
      session_status: currentForm.session_status,
      performance_rating: currentForm.performance_rating > 0 ? ratingToEmoji(currentForm.performance_rating) : null,
      notes: currentForm.notes || null,
      exercises: optimisticExercises,
    };

    // Update cache IMMEDIATELY (optimistic)
    updateSessionInCache(optimisticSession);

    // Close modal
    onClose();

    // Save exercises - split by type for API
    const cwExercises = currentForm.exercises
      .filter((ex) => ex.exercise_type === "CW")
      .map((ex) => ({
        exercise_type: ex.exercise_type,
        pdf_name: ex.pdf_name,
        page_start: ex.page_start ? parseInt(ex.page_start, 10) : null,
        page_end: ex.page_end ? parseInt(ex.page_end, 10) : null,
        remarks: ex.remarks || null,
      }));

    const hwExercises = currentForm.exercises
      .filter((ex) => ex.exercise_type === "HW")
      .map((ex) => ({
        exercise_type: ex.exercise_type,
        pdf_name: ex.pdf_name,
        page_start: ex.page_start ? parseInt(ex.page_start, 10) : null,
        page_end: ex.page_end ? parseInt(ex.page_end, 10) : null,
        remarks: ex.remarks || null,
      }));

    // Save in background - will update cache again with server state
    try {
      // Update session fields
      let updatedSession = await sessionsAPI.updateSession(sessionId, updates);

      // Save CW exercises (even if empty - to clear existing)
      updatedSession = await sessionsAPI.saveExercises(sessionId, "CW", cwExercises);

      // Save HW exercises (even if empty - to clear existing)
      updatedSession = await sessionsAPI.saveExercises(sessionId, "HW", hwExercises);

      // Update cache with final server state
      updateSessionInCache(updatedSession);

      // Notify parent
      if (onSave) {
        onSave(sessionId, updates);
      }
    } catch (error) {
      console.error("Failed to save session:", error);
      // Could rollback cache or show toast here
    }
  };

  const updateField = <K extends keyof EditFormState>(
    field: K,
    value: EditFormState[K]
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const addExercise = (type: "CW" | "HW") => {
    setForm((prev) => ({
      ...prev,
      exercises: [
        ...prev.exercises,
        { exercise_type: type, pdf_name: "", page_start: "", page_end: "", remarks: "" },
      ],
    }));
  };

  const updateExercise = (
    index: number,
    field: keyof ExerciseFormItem,
    value: string
  ) => {
    setForm((prev) => ({
      ...prev,
      exercises: prev.exercises.map((ex, i) =>
        i === index ? { ...ex, [field]: value } : ex
      ),
    }));
  };

  const removeExercise = (index: number) => {
    setForm((prev) => ({
      ...prev,
      exercises: prev.exercises.filter((_, i) => i !== index),
    }));
  };

  const inputClass = cn(
    "w-full px-3 py-2 rounded-md border",
    "bg-white dark:bg-gray-900",
    "border-gray-300 dark:border-gray-600",
    "text-gray-900 dark:text-gray-100",
    "focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent",
    "text-sm"
  );

  const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit Session #${session.id}`}
      size="lg"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
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
        </div>

        {/* Date & Time Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Date</label>
            <input
              type="date"
              value={form.session_date}
              onChange={(e) => updateField("session_date", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Start Time</label>
            <input
              type="time"
              value={form.time_slot_start}
              onChange={(e) => updateField("time_slot_start", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>End Time</label>
            <input
              type="time"
              value={form.time_slot_end}
              onChange={(e) => updateField("time_slot_end", e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {/* Location & Tutor Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Location</label>
            <select
              value={form.location}
              onChange={(e) => updateField("location", e.target.value)}
              className={inputClass}
            >
              <option value="">Select location...</option>
              {locations?.filter(loc => loc !== "Various").map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Tutor</label>
            <select
              value={form.tutor_id || ""}
              onChange={(e) =>
                updateField("tutor_id", e.target.value ? Number(e.target.value) : null)
              }
              className={inputClass}
            >
              <option value="">Select tutor...</option>
              {filteredTutors.map((tutor) => (
                <option key={tutor.id} value={tutor.id}>
                  {tutor.tutor_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status & Rating Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Status</label>
            <div className="relative" ref={statusDropdownRef}>
              {/* Trigger Button */}
              <button
                type="button"
                onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                className={cn(
                  inputClass,
                  "flex items-center justify-between gap-2 cursor-pointer"
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {(() => {
                    const config = getSessionStatusConfig(form.session_status);
                    const StatusIcon = config.Icon;
                    return (
                      <>
                        <span className={cn("p-1 rounded-full flex-shrink-0", config.bgClass)}>
                          <StatusIcon className={cn("h-3 w-3", config.iconClass || "text-white")} />
                        </span>
                        <span className="truncate">{form.session_status}</span>
                      </>
                    );
                  })()}
                </div>
                <ChevronDown className={cn(
                  "h-4 w-4 text-gray-400 flex-shrink-0 transition-transform",
                  statusDropdownOpen && "rotate-180"
                )} />
              </button>

              {/* Dropdown Panel */}
              {statusDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
                  {SESSION_STATUSES.map((status) => {
                    const config = getSessionStatusConfig(status);
                    const StatusIcon = config.Icon;
                    const isSelected = form.session_status === status;
                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() => {
                          updateField("session_status", status);
                          setStatusDropdownOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors",
                          isSelected
                            ? "bg-amber-50 dark:bg-amber-900/30"
                            : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
                        )}
                      >
                        <span className={cn("p-1 rounded-full flex-shrink-0", config.bgClass)}>
                          <StatusIcon className={cn("h-3 w-3", config.iconClass || "text-white")} />
                        </span>
                        <span className={cn(
                          "truncate",
                          isSelected && "font-medium"
                        )}>{status}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className={labelClass}>Performance Rating</label>
            <div className="flex items-center gap-2 h-10">
              <StarRating
                rating={form.performance_rating}
                onChange={(rating) => updateField("performance_rating", rating)}
                size="lg"
                showEmpty
              />
              {form.performance_rating > 0 && (
                <span className="text-sm text-gray-500">
                  ({form.performance_rating}/5)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Comments */}
        <div>
          <label className={labelClass}>Comments</label>
          <textarea
            value={form.notes}
            onChange={(e) => updateField("notes", e.target.value)}
            placeholder="Add comments..."
            rows={3}
            className={cn(inputClass, "resize-none")}
          />
        </div>

        {/* Exercises Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className={labelClass}>Today's Courseware</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => addExercise("CW")}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
              >
                <Plus className="h-3 w-3" />
                <PenTool className="h-3 w-3" />
                CW
              </button>
              <button
                type="button"
                onClick={() => addExercise("HW")}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
              >
                <Plus className="h-3 w-3" />
                <Home className="h-3 w-3" />
                HW
              </button>
            </div>
          </div>

          {form.exercises.length === 0 ? (
            <div className="text-center py-6 text-gray-500 dark:text-gray-400 text-sm border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
              No exercises assigned. Click + CW or + HW to add.
            </div>
          ) : (
            <div className="space-y-3">
              {form.exercises.map((exercise, index) => (
                <div
                  key={index}
                  className={cn(
                    "p-3 rounded-lg border",
                    exercise.exercise_type === "CW"
                      ? "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800"
                      : "bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Type badge */}
                    <div
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium shrink-0",
                        exercise.exercise_type === "CW"
                          ? "bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-200"
                          : "bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-200"
                      )}
                    >
                      {exercise.exercise_type === "CW" ? (
                        <PenTool className="h-3 w-3" />
                      ) : (
                        <Home className="h-3 w-3" />
                      )}
                      {exercise.exercise_type}
                    </div>

                    {/* Fields */}
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <div className="sm:col-span-2">
                        <input
                          type="text"
                          value={exercise.pdf_name}
                          onChange={(e) =>
                            updateExercise(index, "pdf_name", e.target.value)
                          }
                          placeholder="PDF name or path"
                          className={cn(inputClass, "text-xs py-1.5")}
                        />
                      </div>
                      <div>
                        <input
                          type="number"
                          value={exercise.page_start}
                          onChange={(e) =>
                            updateExercise(index, "page_start", e.target.value)
                          }
                          placeholder="Start page"
                          min="1"
                          className={cn(inputClass, "text-xs py-1.5")}
                        />
                      </div>
                      <div>
                        <input
                          type="number"
                          value={exercise.page_end}
                          onChange={(e) =>
                            updateExercise(index, "page_end", e.target.value)
                          }
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
                          placeholder="Remarks"
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
      </div>
    </Modal>
  );
}
