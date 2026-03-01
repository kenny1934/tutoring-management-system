"use client";

import { useState, useMemo, useEffect } from "react";
import useSWR, { mutate } from "swr";
import { Modal } from "@/components/ui/modal";
import { StarRating } from "@/components/ui/star-rating";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import { memosAPI, studentsAPI } from "@/lib/api";
import { useLocation } from "@/contexts/LocationContext";
import { useToast } from "@/contexts/ToastContext";
import { cn } from "@/lib/utils";
import { parseTimeSlot, toDateString } from "@/lib/calendar-utils";
import type { Student, MemoExercise, TutorMemo } from "@/types";
import {
  StickyNote,
  Search,
  Loader2,
  X,
  Plus,
  Trash2,
  FileText,
} from "lucide-react";

interface MemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-fill with an existing memo for editing */
  memo?: TutorMemo;
  /** Pre-fill student (e.g., from session context) */
  prefillStudent?: Student;
  onSaved?: () => void;
}


const EMPTY_EXERCISE: MemoExercise = {
  exercise_type: "CW",
  pdf_name: "",
  page_start: null,
  page_end: null,
  remarks: null,
  answer_pdf_name: null,
  answer_page_start: null,
  answer_page_end: null,
  answer_remarks: null,
};

export function MemoModal({ isOpen, onClose, memo, prefillStudent, onSaved }: MemoModalProps) {
  const { selectedLocation } = useLocation();
  const { showToast } = useToast();
  const isEditing = !!memo;

  // Student search
  const [student, setStudent] = useState<Student | null>(prefillStudent ?? null);
  const [studentSearch, setStudentSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const { data: searchResults = [], isLoading: searchLoading } = useSWR(
    studentSearch.length >= 2 ? ["students-memo-search", studentSearch, selectedLocation] : null,
    () => studentsAPI.getAll({ search: studentSearch, location: selectedLocation === "All Locations" ? undefined : selectedLocation, limit: 10 })
  );

  // Parse existing time slot for editing
  const parsedTime = memo?.time_slot ? parseTimeSlot(memo.time_slot) : null;

  // Form state
  const [memoDate, setMemoDate] = useState(memo?.memo_date ?? toDateString(new Date()));
  const [timeSlotStart, setTimeSlotStart] = useState(parsedTime?.start ?? "");
  const [timeSlotEnd, setTimeSlotEnd] = useState(parsedTime?.end ?? "");
  const [location, setLocation] = useState(memo?.location ?? (selectedLocation !== "All Locations" ? selectedLocation : ""));
  const [notes, setNotes] = useState(memo?.notes ?? "");
  const [rating, setRating] = useState(() => {
    if (memo?.performance_rating) {
      return (memo.performance_rating.match(/⭐/g) || []).length;
    }
    return 0;
  });
  const [exercises, setExercises] = useState<MemoExercise[]>(memo?.exercises ?? []);
  const [saving, setSaving] = useState(false);

  // Initialize student from memo data if editing
  useMemo(() => {
    if (memo && !student) {
      setStudent({
        id: memo.student_id,
        student_name: memo.student_name,
        school_student_id: memo.school_student_id ?? undefined,
        grade: memo.grade ?? undefined,
        school: memo.school ?? undefined,
      } as Student);
    }
  }, [memo, student]);

  // Auto-set location from student's home_location
  useEffect(() => {
    if (student?.home_location) {
      setLocation(student.home_location);
    }
  }, [student]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSave = student && memoDate;

  const addExercise = (type: "CW" | "HW") => {
    setExercises((prev) => [...prev, { ...EMPTY_EXERCISE, exercise_type: type }]);
  };

  const updateExercise = (index: number, field: keyof MemoExercise, value: string | number | null) => {
    setExercises((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removeExercise = (index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);

    try {
      const ratingStr = rating > 0 ? "⭐".repeat(rating) : undefined;
      const exercisesData = exercises.filter((e) => e.pdf_name.trim());
      const timeSlot = timeSlotStart && timeSlotEnd ? `${timeSlotStart} - ${timeSlotEnd}` : timeSlotStart || undefined;

      if (isEditing && memo) {
        await memosAPI.update(memo.id, {
          student_id: student!.id !== memo.student_id ? student!.id : undefined,
          memo_date: memoDate,
          time_slot: timeSlot,
          location: location || undefined,
          notes: notes || undefined,
          exercises: exercisesData.length > 0 ? exercisesData : undefined,
          performance_rating: ratingStr,
        });
        showToast("Memo updated", "success");
      } else {
        await memosAPI.create({
          student_id: student!.id,
          memo_date: memoDate,
          time_slot: timeSlot,
          location: location || undefined,
          notes: notes || undefined,
          exercises: exercisesData.length > 0 ? exercisesData : undefined,
          performance_rating: ratingStr,
        });
        showToast("Memo created", "success");
      }

      // Invalidate memo caches
      mutate((key: unknown) => Array.isArray(key) && (key[0] === "tutor-memos" || key[0] === "tutor-memos-pending-count" || key[0] === "session-memo"), undefined, { revalidate: true });
      onSaved?.();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save memo", "error");
    } finally {
      setSaving(false);
    }
  };

  const inputClass = cn(
    "w-full px-3 py-2 rounded-md border text-sm",
    "bg-white dark:bg-gray-900",
    "border-gray-300 dark:border-gray-600",
    "text-gray-900 dark:text-gray-100",
    "focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded bg-amber-100 dark:bg-amber-900/30">
            <StickyNote className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </span>
          <span>{isEditing ? "Edit Session Memo" : "Record Session Memo"}</span>
        </div>
      }
      size="lg"
      footer={
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className={cn(
              "px-4 py-2 text-sm rounded-md font-medium",
              "bg-amber-500 hover:bg-amber-600 text-white",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1.5" />
                Saving...
              </>
            ) : isEditing ? "Update Memo" : "Save Memo"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Student Search */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Student <span className="text-red-500">*</span>
          </label>
          {student ? (
            <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800">
              <div className="flex-1">
                <StudentInfoBadges
                  student={{
                    student_id: student.id,
                    student_name: student.student_name,
                    school_student_id: student.school_student_id,
                    grade: student.grade,
                    lang_stream: student.lang_stream,
                    school: student.school,
                    home_location: student.home_location,
                  }}
                  showLocationPrefix
                />
              </div>
              <button type="button" onClick={() => setStudent(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => {
                  setStudentSearch(e.target.value);
                  setSearchOpen(e.target.value.length >= 2);
                }}
                onFocus={() => studentSearch.length >= 2 && setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
                placeholder="Search student by name or ID..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 text-sm"
              />
              {searchOpen && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {searchLoading ? (
                    <div className="p-3 text-center text-foreground/60">
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                      Searching...
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="p-3 text-center text-foreground/60">No students found</div>
                  ) : (
                    searchResults.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setStudent(s);
                          setStudentSearch("");
                          setSearchOpen(false);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <StudentInfoBadges
                          student={{
                            student_id: s.id,
                            student_name: s.student_name,
                            school_student_id: s.school_student_id,
                            grade: s.grade,
                            lang_stream: s.lang_stream,
                            school: s.school,
                            home_location: s.home_location,
                          }}
                          showLocationPrefix
                        />
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Date / Time row */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Date <span className="text-red-500">*</span>
            </label>
            <input type="date" value={memoDate} onChange={(e) => setMemoDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Time</label>
            <input
              type="time"
              value={timeSlotStart}
              onChange={(e) => setTimeSlotStart(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Time</label>
            <input
              type="time"
              value={timeSlotEnd}
              onChange={(e) => setTimeSlotEnd(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="What happened in the lesson? Topics covered, observations..."
            className={cn(inputClass, "resize-none")}
          />
        </div>

        {/* Performance Rating */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Performance</label>
          <div className="flex items-center gap-2">
            <StarRating rating={rating} onChange={setRating} size="lg" />
            {rating > 0 && (
              <span className="text-sm text-amber-600 dark:text-amber-400 font-medium">({rating}/5)</span>
            )}
          </div>
        </div>

        {/* Exercises */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Exercises</label>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => addExercise("CW")}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800"
              >
                <Plus className="h-3 w-3" /> CW
              </button>
              <button
                type="button"
                onClick={() => addExercise("HW")}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-800"
              >
                <Plus className="h-3 w-3" /> HW
              </button>
            </div>
          </div>

          {exercises.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic">No exercises added yet</p>
          ) : (
            <div className="space-y-2">
              {exercises.map((ex, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-2 p-2.5 rounded-md border",
                    ex.exercise_type === "CW"
                      ? "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10"
                      : "border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10"
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 px-1.5 py-0.5 text-[10px] font-bold rounded mt-1",
                      ex.exercise_type === "CW"
                        ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                        : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                    )}
                  >
                    {ex.exercise_type}
                  </span>
                  <div className="flex-1 grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      <input
                        type="text"
                        value={ex.pdf_name}
                        onChange={(e) => updateExercise(i, "pdf_name", e.target.value)}
                        placeholder="PDF path"
                        className="flex-1 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-amber-400"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={ex.page_start ?? ""}
                        onChange={(e) => updateExercise(i, "page_start", e.target.value ? Number(e.target.value) : null)}
                        placeholder="p."
                        className="w-14 px-1.5 py-1 text-sm text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-amber-400"
                        min={1}
                      />
                      <span className="text-gray-400 text-xs">-</span>
                      <input
                        type="number"
                        value={ex.page_end ?? ""}
                        onChange={(e) => updateExercise(i, "page_end", e.target.value ? Number(e.target.value) : null)}
                        placeholder="p."
                        className="w-14 px-1.5 py-1 text-sm text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-amber-400"
                        min={1}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeExercise(i)}
                      className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
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
