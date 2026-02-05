"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { StarRating, parseStarRating } from "@/components/ui/star-rating";
import { useActiveTutors, useLocations, useEnrollment, useStudentEnrollments } from "@/lib/hooks";
import { getSessionStatusConfig } from "@/lib/session-status";
import { Plus, Trash2, PenTool, Home, ChevronDown, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { sessionsAPI } from "@/lib/api";
import { updateSessionInCache } from "@/lib/session-cache";
import type { Session } from "@/types";
import { getGradeColor } from "@/lib/constants";
import { parseExerciseRemarks, detectPageMode, combineExerciseRemarks } from "@/lib/exercise-utils";
import { getTutorSortName } from "@/components/zen/utils/sessionSorting";
import { ratingToEmoji } from "@/lib/formatters";
import { parseTimeSlot } from "@/lib/calendar-utils";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { ExtensionRequestModal } from "./ExtensionRequestModal";

// Interface for enrollment deadline exceeded error
interface DeadlineExceededError {
  effective_end_date: string;
  enrollment_id: number;
  session_id: number;
}

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
  page_mode: 'simple' | 'custom';  // Tracks which page input mode is active
  page_start: string;              // For simple mode
  page_end: string;                // For simple mode
  complex_pages: string;           // For custom mode (e.g., "1,3,5-7")
  remarks: string;
}

// Format time back to storage format (24-hour)
function formatTimeSlot(start: string, end: string): string {
  return `${start} - ${end}`;
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
  const { data: tutors } = useActiveTutors();
  const { data: locations } = useLocations();
  const { data: enrollment } = useEnrollment(session.enrollment_id);
  const { effectiveRole } = useAuth();
  const isSuperAdmin = effectiveRole === "Super Admin";

  // Fetch all student enrollments to find the CURRENT one (latest Regular by first_lesson_date)
  // This is needed for cross-enrollment makeups: when editing a session from old enrollment A,
  // the deadline should be checked against the student's current enrollment B
  const { data: studentEnrollments } = useStudentEnrollments(session.student_id);
  const currentEnrollment = useMemo(() => {
    if (!studentEnrollments) return null;
    // Filter to Regular enrollments only, then find the latest by first_lesson_date
    const regularEnrollments = studentEnrollments.filter(e => e.enrollment_type === 'Regular');
    if (regularEnrollments.length === 0) return null;
    return regularEnrollments.reduce((latest, e) => {
      if (!latest) return e;
      if (!e.first_lesson_date) return latest;
      if (!latest.first_lesson_date) return e;
      return e.first_lesson_date > latest.first_lesson_date ? e : latest;
    }, null as typeof regularEnrollments[0] | null);
  }, [studentEnrollments]);

  // Use current enrollment for deadline checks (cross-enrollment aware)
  const effectiveEndDate = currentEnrollment?.effective_end_date;

  // 60-day makeup restriction (only applies to makeup sessions)
  // Use root_original_session_date from API (computed on backend by tracing makeup chain)
  const rootOriginalDate = session.root_original_session_date || session.session_date;
  const isMakeupSession = !!session.make_up_for_id;

  // Calculate the last allowed date (60 days from original)
  const lastAllowedDate60Day = useMemo(() => {
    if (!isMakeupSession || !rootOriginalDate) return null;
    const d = new Date(rootOriginalDate + 'T00:00:00');
    d.setDate(d.getDate() + 60);
    return d.toISOString().split('T')[0];
  }, [isMakeupSession, rootOriginalDate]);

  const { showToast } = useToast();
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  // Error and loading state
  const [isSaving, setIsSaving] = useState(false);
  const [deadlineError, setDeadlineError] = useState<DeadlineExceededError | null>(null);
  const [showExtensionModal, setShowExtensionModal] = useState(false);

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
    const times = parseTimeSlot(session.time_slot || "") || { start: "", end: "" };
    return {
      session_date: session.session_date,
      time_slot_start: times.start,
      time_slot_end: times.end,
      location: session.location || "",
      tutor_id: session.tutor_id,
      session_status: session.session_status,
      performance_rating: parseStarRating(session.performance_rating),
      notes: session.notes || "",
      exercises: (session.exercises || []).map((ex) => {
        const { complexPages, remarks } = parseExerciseRemarks(ex.remarks);
        const pageMode = detectPageMode(ex.page_start, ex.page_end, complexPages);
        return {
          id: ex.id,
          exercise_type: ex.exercise_type === "Classwork" ? "CW" : ex.exercise_type === "Homework" ? "HW" : ex.exercise_type as "CW" | "HW",
          pdf_name: ex.pdf_name,
          page_mode: pageMode,
          page_start: ex.page_start?.toString() || "",
          page_end: ex.page_end?.toString() || "",
          complex_pages: complexPages,
          remarks: remarks,
        };
      }),
    };
  });

  // Reset form only when modal first opens, not on session changes
  useEffect(() => {
    if (isOpen && !initializedRef.current) {
      initializedRef.current = true;
      const times = parseTimeSlot(session.time_slot || "") || { start: "", end: "" };
      setForm({
        session_date: session.session_date,
        time_slot_start: times.start,
        time_slot_end: times.end,
        location: session.location || "",
        tutor_id: session.tutor_id,
        session_status: session.session_status,
        performance_rating: parseStarRating(session.performance_rating),
        notes: session.notes || "",
        exercises: (session.exercises || []).map((ex) => {
          const { complexPages, remarks } = parseExerciseRemarks(ex.remarks);
          const pageMode = detectPageMode(ex.page_start, ex.page_end, complexPages);
          return {
            id: ex.id,
            exercise_type: ex.exercise_type === "Classwork" ? "CW" : ex.exercise_type === "Homework" ? "HW" : ex.exercise_type as "CW" | "HW",
            pdf_name: ex.pdf_name,
            page_mode: pageMode,
            page_start: ex.page_start?.toString() || "",
            page_end: ex.page_end?.toString() || "",
            complex_pages: complexPages,
            remarks: remarks,
          };
        }),
      });
    }
    if (!isOpen) {
      initializedRef.current = false;
    }
  }, [isOpen, session]);

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

  // Helper to get day name from date string (abbreviated to match DB format)
  const getDayName = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  };

  // Format time slot from form fields
  const formTimeSlot = form.time_slot_start && form.time_slot_end
    ? `${form.time_slot_start} - ${form.time_slot_end}`
    : '';

  // Early deadline warning - ONLY for regular slot past deadline
  // Business rule: Only block scheduling to the student's regular slot (assigned_day + assigned_time)
  // past the enrollment end date. Non-regular slots are allowed past deadline.
  // Uses CURRENT enrollment (not session's enrollment) for cross-enrollment makeups.
  const showEarlyDeadlineWarning = useMemo(() => {
    if (!effectiveEndDate || !form.session_date) return false;
    if (form.session_date === session.session_date) return false; // No change
    if (form.session_date <= effectiveEndDate) return false; // Not past deadline

    // Check if this is the regular slot (of the CURRENT enrollment)
    const selectedDayName = getDayName(form.session_date);
    const isRegularDay = selectedDayName === currentEnrollment?.assigned_day;
    const isRegularTime = formTimeSlot === currentEnrollment?.assigned_time;

    return isRegularDay && isRegularTime;
  }, [form.session_date, formTimeSlot, session.session_date, effectiveEndDate, currentEnrollment?.assigned_day, currentEnrollment?.assigned_time]);

  // 60-day rule check for makeup sessions
  const is60DayExceeded = useMemo(() => {
    if (!isMakeupSession || !lastAllowedDate60Day || !form.session_date) return false;
    if (form.session_date === session.session_date) return false; // No change
    return form.session_date > lastAllowedDate60Day;
  }, [isMakeupSession, lastAllowedDate60Day, form.session_date, session.session_date]);

  // Check if session is pending makeup
  const isPendingMakeup = session.session_status.includes("Pending Make-up");

  // Filter status dropdown to prevent non-Super Admin from bypassing business logic
  const allowedStatuses = useMemo(() => {
    if (isSuperAdmin) return SESSION_STATUSES;

    let statuses = [...SESSION_STATUSES];

    // Block "Make-up Class" unless session is already that status
    if (session.session_status !== "Make-up Class") {
      statuses = statuses.filter(s => s !== "Make-up Class");
    }

    // For pending makeup sessions, block statuses that would give credit without proper makeup flow
    if (isPendingMakeup) {
      const blockedFromPending = ["Scheduled", "Attended", "Trial Class"];
      statuses = statuses.filter(s => !blockedFromPending.includes(s));
    }

    return statuses;
  }, [isSuperAdmin, session.session_status, isPendingMakeup]);

  // Show warning when Super Admin makes a dangerous status transition
  const dangerousStatuses = ["Scheduled", "Attended", "Trial Class", "Make-up Class"];
  const showStatusOverrideWarning = useMemo(() => {
    if (!isSuperAdmin) return false;
    // Warning for: setting to Make-up Class on non-makeup session
    if (form.session_status === "Make-up Class" && session.session_status !== "Make-up Class") {
      return true;
    }
    // Warning for: changing pending makeup to a status that gives credit
    if (isPendingMakeup && dangerousStatuses.includes(form.session_status)) {
      return true;
    }
    return false;
  }, [isSuperAdmin, form.session_status, session.session_status, isPendingMakeup]);

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

    // Build exercises for optimistic update - mode-aware
    const optimisticExercises = currentForm.exercises.map((ex, idx) => ({
      id: ex.id || Date.now() + idx,
      session_id: sessionId,
      exercise_type: ex.exercise_type,
      pdf_name: ex.pdf_name,
      page_start: ex.page_mode === 'simple' && ex.page_start ? parseInt(ex.page_start, 10) : undefined,
      page_end: ex.page_mode === 'simple' && ex.page_end ? parseInt(ex.page_end, 10) : undefined,
      remarks: combineExerciseRemarks(ex.page_mode === 'custom' ? ex.complex_pages : '', ex.remarks) || undefined,
      created_by: session.tutor_name || 'user', // for optimistic update
    }));

    // Build optimistic session state
    const optimisticSession = {
      ...session,
      session_date: currentForm.session_date,
      time_slot: formatTimeSlot(currentForm.time_slot_start, currentForm.time_slot_end),
      location: currentForm.location || undefined,
      tutor_id: currentForm.tutor_id,
      session_status: currentForm.session_status,
      performance_rating: currentForm.performance_rating > 0 ? ratingToEmoji(currentForm.performance_rating) : undefined,
      notes: currentForm.notes || undefined,
      exercises: optimisticExercises,
    };

    // Save exercises - split by type for API, mode-aware
    const cwExercises = currentForm.exercises
      .filter((ex) => ex.exercise_type === "CW")
      .map((ex) => ({
        exercise_type: ex.exercise_type,
        pdf_name: ex.pdf_name,
        page_start: ex.page_mode === 'simple' && ex.page_start ? parseInt(ex.page_start, 10) : null,
        page_end: ex.page_mode === 'simple' && ex.page_end ? parseInt(ex.page_end, 10) : null,
        remarks: combineExerciseRemarks(ex.page_mode === 'custom' ? ex.complex_pages : '', ex.remarks) || null,
      }));

    const hwExercises = currentForm.exercises
      .filter((ex) => ex.exercise_type === "HW")
      .map((ex) => ({
        exercise_type: ex.exercise_type,
        pdf_name: ex.pdf_name,
        page_start: ex.page_mode === 'simple' && ex.page_start ? parseInt(ex.page_start, 10) : null,
        page_end: ex.page_mode === 'simple' && ex.page_end ? parseInt(ex.page_end, 10) : null,
        remarks: combineExerciseRemarks(ex.page_mode === 'custom' ? ex.complex_pages : '', ex.remarks) || null,
      }));

    // Check if date is being changed - if so, we need to handle potential deadline errors
    const isDateChanging = currentForm.session_date !== session.session_date;

    // If date is changing, don't do optimistic update (wait for API response)
    if (!isDateChanging) {
      // Update cache IMMEDIATELY (optimistic)
      updateSessionInCache(optimisticSession);
      // Close modal
      onClose();
    }

    setIsSaving(true);
    setDeadlineError(null);

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

      // If date was changing and we succeeded, now close the modal
      if (isDateChanging) {
        onClose();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save session";

      // Check if this is an enrollment deadline exceeded error
      if (message.includes("ENROLLMENT_DEADLINE_EXCEEDED") || message.includes("enrollment end date")) {
        // Parse the error details from the message
        const dateMatch = message.match(/\((\d{4}-\d{2}-\d{2})\)/);
        setDeadlineError({
          effective_end_date: dateMatch ? dateMatch[1] : "",
          enrollment_id: session.enrollment_id,
          session_id: session.id,
        });
        showToast("Cannot move session past enrollment end date", "error");

        // If we did optimistic update (date wasn't changing), rollback
        if (!isDateChanging) {
          updateSessionInCache(session); // Rollback to original
        }
      } else {
        showToast(message, "error");

        // Rollback cache if we did optimistic update
        if (!isDateChanging) {
          updateSessionInCache(session);
        }
      }
    } finally {
      setIsSaving(false);
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
        { exercise_type: type, pdf_name: "", page_mode: 'simple', page_start: "", page_end: "", complex_pages: "", remarks: "" },
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
          <Button onClick={handleSave} disabled={isSaving || showEarlyDeadlineWarning || (is60DayExceeded && !isSuperAdmin)}>
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
              aria-describedby={
                is60DayExceeded ? "session-60day-warning" :
                showEarlyDeadlineWarning ? "session-deadline-warning" :
                deadlineError ? "session-deadline-error" : undefined
              }
              aria-invalid={is60DayExceeded || showEarlyDeadlineWarning || deadlineError ? "true" : undefined}
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

        {/* 60-day makeup limit warning - hard block for non-Super Admin, override warning for Super Admin */}
        {is60DayExceeded && (
          <div id="session-60day-warning" role="alert" className={`p-3 ${isSuperAdmin ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'} border rounded-lg`}>
            <div className="flex items-start gap-2">
              <AlertTriangle className={`h-4 w-4 ${isSuperAdmin ? 'text-orange-600 dark:text-orange-400' : 'text-red-600 dark:text-red-400'} mt-0.5 flex-shrink-0`} aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${isSuperAdmin ? 'text-orange-800 dark:text-orange-200' : 'text-red-800 dark:text-red-200'}`}>
                  {isSuperAdmin
                    ? 'This date exceeds the 60-day makeup limit (Super Admin override available)'
                    : 'This date exceeds the 60-day makeup limit'}
                </p>
                <p className={`text-xs ${isSuperAdmin ? 'text-orange-600 dark:text-orange-400' : 'text-red-600 dark:text-red-400'} mt-0.5`}>
                  Makeups must be scheduled within 60 days of the original session ({rootOriginalDate}).
                  Last allowed date: {lastAllowedDate60Day}
                </p>
                {isSuperAdmin && (
                  <p className="text-xs text-orange-600 dark:text-orange-400 mt-1 font-medium">
                    As Super Admin, you may proceed with this override.
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => updateField("session_date", session.session_date)}
                className={`text-xs ${isSuperAdmin ? 'text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-800' : 'text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-800'}`}
              >
                Revert Date
              </Button>
            </div>
          </div>
        )}

        {/* Super Admin warning for dangerous status transitions */}
        {showStatusOverrideWarning && (
          <div className="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-orange-800 dark:text-orange-200">
                  You are changing this session to &quot;{form.session_status}&quot; (Super Admin override)
                </p>
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
                  {isPendingMakeup
                    ? "This will bypass the makeup scheduling workflow. The session will no longer be tracked as pending makeup."
                    : "This bypasses the normal makeup scheduling workflow. The 60-day restriction cannot be enforced without a linked original session."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Early Deadline Warning - shown when moving to regular slot past deadline */}
        {showEarlyDeadlineWarning && !deadlineError && (
          <div id="session-deadline-warning" role="alert" className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  This is the student&apos;s regular slot ({currentEnrollment?.assigned_day} {currentEnrollment?.assigned_time}) past the enrollment deadline
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                  Enrollment ends: {effectiveEndDate}
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowExtensionModal(true)}
                className="text-xs border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-800"
              >
                <Clock className="h-3 w-3 mr-1" />
                Request Extension
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => updateField("session_date", session.session_date)}
                className="text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-800"
              >
                Revert Date
              </Button>
            </div>
          </div>
        )}

        {/* Deadline Error Alert */}
        {deadlineError && (
          <div id="session-deadline-error" role="alert" className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span>Cannot move session past enrollment end date ({deadlineError.effective_end_date})</span>
            </div>
            <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-700">
              <div className="flex items-center justify-between">
                <div className="text-xs text-red-500 dark:text-red-400">
                  <Clock className="h-3 w-3 inline mr-1" />
                  Enrollment ends: {deadlineError.effective_end_date}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowExtensionModal(true)}
                  className="text-amber-600 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-900/20"
                >
                  <Clock className="h-3 w-3 mr-1" />
                  Request Extension
                </Button>
              </div>
            </div>
          </div>
        )}

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
                  {allowedStatuses.map((status) => {
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
                    <div className="flex-1 space-y-2">
                      {/* PDF Name */}
                      <input
                        type="text"
                        value={exercise.pdf_name}
                        onChange={(e) =>
                          updateExercise(index, "pdf_name", e.target.value)
                        }
                        placeholder="PDF name or path"
                        className={cn(inputClass, "text-xs py-1.5")}
                      />

                      {/* Page Range Mode Selection */}
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
                            name={`page-mode-edit-${index}`}
                            checked={exercise.page_mode === 'simple'}
                            onChange={() => {
                              updateExercise(index, "page_mode", "simple");
                              updateExercise(index, "complex_pages", "");
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
                            name={`page-mode-edit-${index}`}
                            checked={exercise.page_mode === 'custom'}
                            onChange={() => {
                              updateExercise(index, "page_mode", "custom");
                              updateExercise(index, "page_start", "");
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

                      {/* Remarks */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400 w-14 shrink-0">Remarks:</span>
                        <input
                          type="text"
                          value={exercise.remarks}
                          onChange={(e) => updateExercise(index, "remarks", e.target.value)}
                          placeholder="Optional notes"
                          className={cn(inputClass, "text-xs py-1 flex-1")}
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

      {/* Extension Request Modal */}
      {deadlineError && session.tutor_id && (
        <ExtensionRequestModal
          session={session}
          enrollmentId={deadlineError.enrollment_id}
          effectiveEndDate={deadlineError.effective_end_date}
          isOpen={showExtensionModal}
          onClose={() => setShowExtensionModal(false)}
          onRequestSubmitted={() => {
            setShowExtensionModal(false);
            setDeadlineError(null);
            showToast("Extension request submitted. You'll be notified when reviewed.", "success");
          }}
          tutorId={session.tutor_id}
        />
      )}
    </Modal>
  );
}
