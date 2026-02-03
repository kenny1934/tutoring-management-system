"use client";

import { useState, useEffect, useMemo } from "react";
import { Modal } from "@/components/ui/modal";
import { useLocation } from "@/contexts/LocationContext";
import { useToast } from "@/contexts/ToastContext";
import {
  Calendar,
  Clock,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Search,
  X,
  ChevronDown,
  RefreshCw,
  ClipboardList,
} from "lucide-react";
import { cn, formatError } from "@/lib/utils";
import useSWR from "swr";
import {
  enrollmentsAPI,
  studentsAPI,
  EnrollmentCreate,
  EnrollmentPreviewResponse,
  RenewalDataResponse,
  TrialListItem,
} from "@/lib/api";
import { useTutors, useCacheInvalidation } from "@/lib/hooks";
import { formatProposalDate, formatShortDate } from "@/lib/formatters";
import { WEEKDAY_TIME_SLOTS, WEEKEND_TIME_SLOTS, DAY_NAMES } from "@/lib/constants";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import { getTutorSortName } from "@/components/zen/utils/sessionSorting";
import type { Student } from "@/types";

const ENROLLMENT_TYPES = ["Regular", "Trial", "One-Time"] as const;

const ENROLLMENT_TYPE_COLORS: Record<string, { selected: string; unselected: string }> = {
  "Regular": {
    selected: "bg-green-500 text-white border-green-500",
    unselected: "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:border-green-400",
  },
  "Trial": {
    selected: "bg-blue-500 text-white border-blue-500",
    unselected: "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:border-blue-400",
  },
  "One-Time": {
    selected: "bg-purple-500 text-white border-purple-500",
    unselected: "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:border-purple-400",
  },
};

interface StudentSearchProps {
  value: Student | null;
  onChange: (student: Student | null) => void;
  disabled?: boolean;
  location?: string;
}

function StudentSearch({ value, onChange, disabled, location }: StudentSearchProps) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const { data: students = [], isLoading } = useSWR(
    search.length >= 2 ? ["students-search", search, location] : null,
    () => studentsAPI.getAll({ search, location, limit: 10 })
  );

  return (
    <div className="relative">
      {value ? (
        <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800">
          <div className="flex-1">
            <StudentInfoBadges
              student={{
                student_id: value.id,
                student_name: value.student_name,
                school_student_id: value.school_student_id,
                grade: value.grade,
                lang_stream: value.lang_stream,
                school: value.school,
                home_location: value.home_location,
              }}
              showLocationPrefix={true}
            />
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setIsOpen(e.target.value.length >= 2);
            }}
            onFocus={() => search.length >= 2 && setIsOpen(true)}
            onBlur={() => setTimeout(() => setIsOpen(false), 200)}
            placeholder={location ? `Search ${location} students...` : "Search student by name or ID..."}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary/30 focus:border-primary"
            disabled={disabled}
          />
          {isOpen && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {isLoading ? (
                <div className="p-3 text-center text-foreground/60">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                  Searching...
                </div>
              ) : students.length === 0 ? (
                <div className="p-3 text-center text-foreground/60">No students found</div>
              ) : (
                students.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => {
                      onChange(student);
                      setSearch("");
                      setIsOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
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
                      showLocationPrefix={true}
                    />
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface CreateEnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  renewFromId?: number | null;
  onSuccess?: () => void;
  /** If false, renders without backdrop (for side-by-side layouts). Default: true */
  standalone?: boolean;
  /** If true, pre-selects Trial type and locks lessons to 1 */
  trialMode?: boolean;
  /** When converting a trial to regular, pre-fills student/tutor/schedule info */
  convertFromTrial?: TrialListItem;
  /** Pre-fill student (skips student search) - used from student detail page */
  prefillStudent?: Student;
}

export function CreateEnrollmentModal({
  isOpen,
  onClose,
  renewFromId,
  onSuccess,
  standalone = true,
  trialMode = false,
  convertFromTrial,
  prefillStudent,
}: CreateEnrollmentModalProps) {
  const { selectedLocation } = useLocation();
  const { showToast, showError } = useToast();
  const { invalidateAfterEnrollmentCreate } = useCacheInvalidation();

  // Form state
  const [student, setStudent] = useState<Student | null>(null);
  const [tutorId, setTutorId] = useState<number | null>(null);
  const [assignedDay, setAssignedDay] = useState<string>("Mon");
  const [assignedTime, setAssignedTime] = useState<string>(WEEKDAY_TIME_SLOTS[0]);
  const [location, setLocation] = useState<string>(selectedLocation !== "All Locations" ? selectedLocation : "MSA");
  const [firstLessonDate, setFirstLessonDate] = useState<string>("");
  const [lessonsPaid, setLessonsPaid] = useState<number>(6);
  const [enrollmentType, setEnrollmentType] = useState<string>("Regular");

  // Custom time state
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [customTimeStart, setCustomTimeStart] = useState("");
  const [customTimeEnd, setCustomTimeEnd] = useState("");

  // Preview state
  const [preview, setPreview] = useState<EnrollmentPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Renewal link state (for manual selection when not using Quick Renew)
  const [selectedRenewalLinkId, setSelectedRenewalLinkId] = useState<number | null>(null);

  // Submit state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Fetch tutors
  const { data: tutors = [] } = useTutors();

  // Fetch renewal data if renewing
  const { data: renewalData, isLoading: renewalLoading } = useSWR<RenewalDataResponse>(
    isOpen && renewFromId ? ["renewal-data", renewFromId] : null,
    () => enrollmentsAPI.getRenewalData(renewFromId!)
  );

  // Type for day names from DAY_NAMES constant
  type DayName = typeof DAY_NAMES[number];

  // Available time slots based on selected day
  const availableTimeSlots = useMemo(() => {
    const dayIndex = DAY_NAMES.indexOf(assignedDay as DayName);
    // Sun=0, Sat=6 are weekend
    return dayIndex === 0 || dayIndex === 6 ? WEEKEND_TIME_SLOTS : WEEKDAY_TIME_SLOTS;
  }, [assignedDay]);

  // Effective time slot for API (custom or selected)
  const effectiveTimeSlot = useCustomTime
    ? `${customTimeStart} - ${customTimeEnd}`
    : assignedTime;

  // Validate custom time (end must be after start)
  const isCustomTimeValid = !useCustomTime || (
    customTimeStart && customTimeEnd && customTimeEnd > customTimeStart
  );

  // Reset form when modal opens/closes or renewFromId changes
  useEffect(() => {
    if (!isOpen) {
      // Reset on close
      setStudent(null);
      setTutorId(null);
      setAssignedDay("Mon");
      setAssignedTime(WEEKDAY_TIME_SLOTS[0]);
      setLocation(selectedLocation !== "All Locations" ? selectedLocation : "MSA");
      setFirstLessonDate("");
      setLessonsPaid(6);
      setEnrollmentType("Regular");
      setUseCustomTime(false);
      setCustomTimeStart("");
      setCustomTimeEnd("");
      setPreview(null);
      setPreviewError(null);
      setSelectedRenewalLinkId(null);
      setIsSuccess(false);
    } else if (trialMode && !convertFromTrial && !renewFromId) {
      // Initialize trial mode on open (when not converting or renewing)
      setEnrollmentType("Trial");
      setLessonsPaid(1);
    }
  }, [isOpen, selectedLocation, trialMode, convertFromTrial, renewFromId]);

  // Reset time slot when day changes (if current slot not available)
  useEffect(() => {
    if (!useCustomTime && !(availableTimeSlots as readonly string[]).includes(assignedTime)) {
      setAssignedTime(availableTimeSlots[0]);
    }
  }, [assignedDay, availableTimeSlots, assignedTime, useCustomTime]);

  // Pre-fill form from renewal data
  useEffect(() => {
    if (renewalData && isOpen) {
      studentsAPI.getById(renewalData.student_id).then((s) => setStudent(s));
      setTutorId(renewalData.tutor_id);
      setAssignedDay(renewalData.assigned_day);
      setAssignedTime(renewalData.assigned_time);
      setLocation(renewalData.location);
      setFirstLessonDate(renewalData.suggested_first_lesson_date);
      setLessonsPaid(renewalData.previous_lessons_paid);
      setEnrollmentType(renewalData.enrollment_type);
    }
  }, [renewalData, isOpen]);

  // Pre-fill student from props (used from student detail page)
  useEffect(() => {
    if (prefillStudent && isOpen && !convertFromTrial && !renewFromId) {
      setStudent(prefillStudent);
    }
  }, [prefillStudent, isOpen, convertFromTrial, renewFromId]);

  // Pre-fill form when converting trial to regular
  useEffect(() => {
    if (convertFromTrial && isOpen) {
      // Fetch full student data
      studentsAPI.getById(convertFromTrial.student_id).then((s) => setStudent(s));
      setTutorId(convertFromTrial.tutor_id);
      setLocation(convertFromTrial.location);
      // Parse day from session date
      const sessionDate = new Date(convertFromTrial.session_date);
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      setAssignedDay(dayNames[sessionDate.getDay()]);
      setAssignedTime(convertFromTrial.time_slot);
      // Calculate next occurrence of this day after trial
      const nextDate = new Date(sessionDate);
      nextDate.setDate(nextDate.getDate() + 7); // Start with next week
      setFirstLessonDate(nextDate.toISOString().split('T')[0]);
      // Set as Regular enrollment
      setEnrollmentType("Regular");
      setLessonsPaid(6);
    }
  }, [convertFromTrial, isOpen]);

  // Auto-select first tutor from location (only if not renewing and no tutor selected)
  useEffect(() => {
    if (!renewFromId && !tutorId && tutors.length > 0 && location && isOpen) {
      const newLocationTutors = tutors.filter((t) => t.default_location === location);
      if (newLocationTutors.length > 0) {
        setTutorId(newLocationTutors[0].id);
      }
    }
  }, [renewFromId, tutorId, tutors, location, isOpen]);

  // Reset tutor when location changes if current tutor is not from new location
  useEffect(() => {
    if (tutorId && tutors.length > 0 && location) {
      const selectedTutor = tutors.find((t) => t.id === tutorId);
      if (selectedTutor && selectedTutor.default_location !== location) {
        // Current tutor is from different location, reset to first tutor from new location
        const newLocationTutors = tutors.filter((t) => t.default_location === location);
        setTutorId(newLocationTutors.length > 0 ? newLocationTutors[0].id : null);
      }
    }
  }, [location, tutors]);

  // Effective renewal link: prop takes priority, then manual selection
  const effectiveRenewalLinkId = renewFromId || selectedRenewalLinkId || undefined;

  // Build enrollment data for preview/submit
  const enrollmentData: EnrollmentCreate | null = useMemo(() => {
    if (!student || !tutorId || !firstLessonDate) return null;
    if (useCustomTime && !isCustomTimeValid) return null;
    return {
      student_id: student.id,
      tutor_id: tutorId,
      assigned_day: assignedDay,
      assigned_time: effectiveTimeSlot,
      location,
      first_lesson_date: firstLessonDate,
      lessons_paid: lessonsPaid,
      enrollment_type: enrollmentType,
      renewed_from_enrollment_id: effectiveRenewalLinkId,
    };
  }, [student, tutorId, assignedDay, effectiveTimeSlot, location, firstLessonDate, lessonsPaid, enrollmentType, effectiveRenewalLinkId, useCustomTime, isCustomTimeValid]);

  // Check if first lesson date matches selected day of week
  const dayMismatchWarning = useMemo(() => {
    if (!firstLessonDate || !assignedDay) return null;
    const date = new Date(firstLessonDate + 'T00:00:00'); // Ensure local timezone
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const actualDay = dayNames[date.getDay()];
    if (actualDay !== assignedDay) {
      return `Selected date is a ${actualDay}, but assigned day is ${assignedDay}`;
    }
    return null;
  }, [firstLessonDate, assignedDay]);

  // Preview sessions
  const handlePreview = async () => {
    if (!enrollmentData) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const result = await enrollmentsAPI.preview(enrollmentData);
      setPreview(result);
    } catch (error: unknown) {
      setPreviewError(formatError(error, "Failed to preview enrollment"));
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Create enrollment
  const handleSubmit = async () => {
    if (!enrollmentData) return;

    if (preview?.conflicts && preview.conflicts.length > 0) {
      showToast("Cannot create enrollment: conflicts exist with existing sessions", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      await enrollmentsAPI.create(enrollmentData);
      // Invalidate caches so lists refresh with new enrollment
      invalidateAfterEnrollmentCreate({
        studentId: enrollmentData.student_id,
        location: enrollmentData.location,
      });
      showToast(`Enrollment created successfully`, "success");
      setIsSuccess(true);  // Show success screen instead of closing
    } catch (error: unknown) {
      showError(error, "Failed to create enrollment");
    } finally {
      setIsSubmitting(false);
    }
  };

  const locationTutors = tutors
    .filter((t) => t.default_location === location)
    .sort((a, b) => getTutorSortName(a.tutor_name).localeCompare(getTutorSortName(b.tutor_name)));
  const hasConflicts = preview?.conflicts && preview.conflicts.length > 0;
  const hasWarnings = preview?.warnings && preview.warnings.length > 0;

  const titleText = convertFromTrial
    ? "Convert Trial to Regular"
    : trialMode
      ? "New Trial Enrollment"
      : renewFromId
        ? "Renew Enrollment"
        : "New Enrollment";

  // Title with blue icon for trial mode
  const title = trialMode && !convertFromTrial ? (
    <div className="flex items-center gap-2">
      <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
        <ClipboardList className="h-4 w-4 text-blue-600 dark:text-blue-400" />
      </div>
      <span>{titleText}</span>
    </div>
  ) : titleText;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="xl"
      standalone={standalone}
      footer={
        isSuccess ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => { onSuccess?.(); onClose(); }}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-all"
            >
              Done
            </button>
          </div>
        ) : preview ? (
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="px-4 py-2 text-foreground/70 hover:text-foreground transition-colors"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={hasConflicts || isSubmitting}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all",
                hasConflicts
                  ? "bg-gray-300 dark:bg-gray-700 text-foreground/50 cursor-not-allowed"
                  : "bg-primary hover:bg-primary/90 text-primary-foreground"
              )}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Create Enrollment
            </button>
          </div>
        ) : (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handlePreview}
              disabled={!enrollmentData || previewLoading}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-all disabled:opacity-50"
            >
              {previewLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Calendar className="h-4 w-4" />
              )}
              Preview Sessions
            </button>
          </div>
        )
      }
    >
      {isSuccess ? (
        /* Success Screen */
        <div className="flex flex-col items-center justify-center py-8 sm:py-12 gap-3 sm:gap-4">
          <CheckCircle2 className="h-10 w-10 sm:h-12 sm:w-12 text-green-500" />
          <div className="text-center space-y-2 sm:space-y-3">
            <p className="text-base sm:text-lg font-medium">Enrollment Created</p>

            {/* Student info with badges */}
            <div className="flex justify-center">
              <StudentInfoBadges
                student={{
                  student_id: student?.id,
                  student_name: student?.student_name || '',
                  school_student_id: student?.school_student_id,
                  grade: student?.grade,
                  lang_stream: student?.lang_stream,
                  school: student?.school,
                }}
              />
            </div>

            {/* Schedule summary */}
            <div className="flex items-center justify-center gap-2 text-sm text-foreground/60">
              <Calendar className="h-4 w-4" />
              <span>{assignedDay}</span>
              <span>·</span>
              <Clock className="h-4 w-4" />
              <span>{effectiveTimeSlot}</span>
            </div>

            {/* Sessions count */}
            <p className="text-sm text-foreground/60">
              {preview?.sessions.filter(s => !s.is_holiday).length || lessonsPaid} sessions scheduled
            </p>
          </div>
        </div>
      ) : renewalLoading ? (
        <div className="text-center py-12">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-2 text-foreground/60">Loading renewal data...</p>
        </div>
      ) : !preview ? (
        /* Form */
        <div className="grid gap-4 md:grid-cols-2">
          {/* Trial Mode Banner */}
          {trialMode && !convertFromTrial && (
            <div className="md:col-span-2 flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-blue-700 dark:text-blue-300 text-sm">
              <ClipboardList className="h-4 w-4 flex-shrink-0" />
              <span>Trial enrollment: 1 session will be generated</span>
            </div>
          )}

          {/* Student */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-foreground mb-2">Student <span className="text-red-500">*</span></label>
            <StudentSearch value={student} onChange={setStudent} disabled={!!renewFromId || !!convertFromTrial || !!prefillStudent} location={location} />
          </div>

          {/* Tutor */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Tutor <span className="text-red-500">*</span></label>
            <div className="relative">
              <select
                value={tutorId || ""}
                onChange={(e) => setTutorId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary/30 focus:border-primary appearance-none"
              >
                <option value="">Select tutor...</option>
                {locationTutors.map((t) => (
                  <option key={t.id} value={t.id}>{t.tutor_name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40 pointer-events-none" />
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Location</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary/30 focus:border-primary appearance-none"
              >
                <option value="MSA">MSA</option>
                <option value="MSB">MSB</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40 pointer-events-none" />
            </div>
          </div>

          {/* Day */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Day of Week</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
              <select
                value={assignedDay}
                onChange={(e) => setAssignedDay(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary/30 focus:border-primary appearance-none"
              >
                {DAY_NAMES.map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40 pointer-events-none" />
            </div>
          </div>

          {/* Time */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Time Slot</label>
            {!useCustomTime ? (
              <div className="space-y-1">
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
                  <select
                    value={assignedTime}
                    onChange={(e) => setAssignedTime(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary/30 focus:border-primary appearance-none"
                  >
                    {availableTimeSlots.map((slot) => (
                      <option key={slot} value={slot}>{slot}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40 pointer-events-none" />
                </div>
                <button
                  type="button"
                  onClick={() => setUseCustomTime(true)}
                  className="text-xs text-primary hover:underline"
                >
                  Use custom time
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="time"
                    value={customTimeStart}
                    onChange={(e) => setCustomTimeStart(e.target.value)}
                    aria-label="Start time"
                    aria-describedby={!isCustomTimeValid && customTimeStart && customTimeEnd ? "custom-time-error" : undefined}
                    aria-invalid={!isCustomTimeValid && customTimeStart && customTimeEnd ? "true" : undefined}
                    className={cn(
                      "flex-1 px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-800",
                      !isCustomTimeValid ? "border-red-400" : "border-gray-300 dark:border-gray-600"
                    )}
                  />
                  <span className="text-foreground/50 text-center" aria-hidden="true">to</span>
                  <input
                    type="time"
                    value={customTimeEnd}
                    onChange={(e) => setCustomTimeEnd(e.target.value)}
                    aria-label="End time"
                    aria-describedby={!isCustomTimeValid && customTimeStart && customTimeEnd ? "custom-time-error" : undefined}
                    aria-invalid={!isCustomTimeValid && customTimeStart && customTimeEnd ? "true" : undefined}
                    className={cn(
                      "flex-1 px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-800",
                      !isCustomTimeValid ? "border-red-400" : "border-gray-300 dark:border-gray-600"
                    )}
                  />
                </div>
                {!isCustomTimeValid && customTimeStart && customTimeEnd && (
                  <p id="custom-time-error" className="text-xs text-red-500" role="alert">End time must be after start time</p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setUseCustomTime(false);
                    setCustomTimeStart("");
                    setCustomTimeEnd("");
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  Use preset time slots
                </button>
              </div>
            )}
          </div>

          {/* First Lesson Date */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">First Lesson Date <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={firstLessonDate}
              onChange={(e) => setFirstLessonDate(e.target.value)}
              required
              aria-required="true"
              aria-describedby={dayMismatchWarning ? "first-lesson-date-warning" : undefined}
              aria-invalid={dayMismatchWarning ? "true" : undefined}
              className={cn(
                "w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary/30 focus:border-primary",
                dayMismatchWarning
                  ? "border-amber-400 dark:border-amber-500"
                  : "border-gray-300 dark:border-gray-600"
              )}
            />
            {dayMismatchWarning && (
              <div id="first-lesson-date-warning" className="flex items-center gap-1.5 mt-1.5 text-amber-600 dark:text-amber-400" role="alert">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                <span className="text-xs">{dayMismatchWarning}</span>
              </div>
            )}
          </div>

          {/* Lessons Paid */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Number of Lessons</label>
            <input
              type="number"
              min={1}
              max={52}
              value={lessonsPaid}
              onChange={(e) => setLessonsPaid(parseInt(e.target.value) || 1)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          {/* Enrollment Type - hidden when in trial mode or converting from trial */}
          {!trialMode && !convertFromTrial && (
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-foreground mb-2">Enrollment Type</label>
              <div className="flex gap-2">
                {ENROLLMENT_TYPES.map((type) => {
                  const colors = ENROLLMENT_TYPE_COLORS[type];
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setEnrollmentType(type);
                        if (type === "Regular") {
                          setLessonsPaid(6);
                        } else {
                          setLessonsPaid(1);
                        }
                      }}
                      className={cn(
                        "flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-all",
                        enrollmentType === type ? colors.selected : colors.unselected
                      )}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Preview Results */
        <div className="space-y-4">
          {/* Preview Error */}
          {previewError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-medium">Preview Error</span>
              </div>
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{previewError}</p>
            </div>
          )}

          {/* Warnings */}
          {hasWarnings && (
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
              <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 mb-1">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium text-sm">Warnings</span>
              </div>
              <ul className="text-xs text-orange-600 dark:text-orange-400 space-y-0.5">
                {preview.warnings.map((warning, i) => (
                  <li key={i}>• {warning}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Conflicts */}
          {hasConflicts && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-1">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium text-sm">Conflicts - Cannot Create</span>
              </div>
              <ul className="text-xs text-red-600 dark:text-red-400 space-y-0.5">
                {preview.conflicts.map((conflict, i) => (
                  <li key={i}>
                    • {formatShortDate(conflict.session_date)} - Session with {conflict.existing_tutor_name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Renewal Link Selector (only when not using Quick Renew and potential links found) */}
          {!renewFromId && preview.potential_renewals && preview.potential_renewals.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
                <RefreshCw className="h-4 w-4" />
                <span className="font-medium text-sm">Link as Renewal</span>
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-400 mb-2">
                Found {preview.potential_renewals.length} recent enrollment(s) for this student.
              </p>
              <select
                value={selectedRenewalLinkId || ""}
                onChange={(e) => setSelectedRenewalLinkId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 text-sm border border-blue-300 dark:border-blue-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500/30"
              >
                <option value="">None (create as new enrollment)</option>
                {preview.potential_renewals.map((renewal) => (
                  <option key={renewal.id} value={renewal.id}>
                    {renewal.tutor_name} • {renewal.lessons_paid} lessons • ended {formatShortDate(renewal.effective_end_date)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Session Preview Table */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
              <span className="font-medium text-sm text-foreground">Session Preview</span>
              <span className="text-xs text-foreground/60">
                {preview.sessions.filter((s) => !s.is_holiday).length} sessions
              </span>
            </div>
            <div className="overflow-x-auto max-h-[240px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium text-foreground/70 text-xs">#</th>
                    <th className="px-3 py-1.5 text-left font-medium text-foreground/70 text-xs">Date</th>
                    <th className="px-3 py-1.5 text-left font-medium text-foreground/70 text-xs">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {preview.sessions.map((session, index) => (
                    <tr
                      key={index}
                      className={cn(
                        "text-xs",
                        session.is_holiday && "bg-yellow-50 dark:bg-yellow-900/10",
                        session.conflict && "bg-red-50 dark:bg-red-900/10"
                      )}
                    >
                      <td className="px-3 py-1.5 text-foreground/50">
                        {session.is_holiday ? "-" : preview.sessions.slice(0, index + 1).filter((s) => !s.is_holiday).length}
                      </td>
                      <td className="px-3 py-1.5 font-medium">
                        {formatProposalDate(session.session_date)}
                      </td>
                      <td className="px-3 py-1.5">
                        {session.is_holiday ? (
                          <span className="text-yellow-600 dark:text-yellow-400">
                            Holiday: {session.holiday_name}
                          </span>
                        ) : session.conflict ? (
                          <span className="text-red-600 dark:text-red-400">Conflict</span>
                        ) : (
                          <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> OK
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <span className="text-xs text-foreground/60">
                End date:{" "}
                <span className="font-medium text-foreground">
                  {new Date(preview.effective_end_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </span>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
