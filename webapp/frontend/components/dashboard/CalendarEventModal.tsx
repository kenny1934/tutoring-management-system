"use client";

import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import { calendarAPI, studentsAPI } from "@/lib/api";
import type { CalendarEvent, CalendarEventCreate } from "@/types";
import {
  X,
  Loader2,
  Calendar,
  School,
  GraduationCap,
  FileText,
  Trash2,
  AlertTriangle,
  Tag,
} from "lucide-react";

// Event type color mapping (matching TestCalendar)
const EVENT_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Test: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300", border: "border-red-500" },
  Exam: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-300", border: "border-purple-500" },
  Quiz: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300", border: "border-green-500" },
};

// Grade options (F1-F6)
const GRADE_OPTIONS = ["F1", "F2", "F3", "F4", "F5", "F6"];

// Academic streams (for F4-F6)
const STREAM_OPTIONS = [
  { value: "A", label: "Art" },
  { value: "S", label: "Science" },
  { value: "C", label: "Commerce" },
];

// Parse existing title into components for edit mode
const parseTitle = (title: string): { school: string; grade: string; stream: string; type: string; suffix: string } => {
  // Match pattern: [school] [grade][(stream)?] [type] [suffix...]
  // Examples: "SRL-E F2 Test", "TIS F5(S) Exam", "MLC F4 Quiz Unit 3"
  const match = title.match(/^(\S+)\s+(F\d)(?:\(([ASC])\))?\s+(\w+)(?:\s+(.*))?$/);
  if (match) {
    return {
      school: match[1],
      grade: match[2],
      stream: match[3] || '',
      type: match[4],
      suffix: match[5] || '',
    };
  }
  // Fallback: put whole title in suffix
  return { school: '', grade: '', stream: '', type: 'Test', suffix: title };
};

interface CalendarEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (event?: CalendarEvent, action?: 'create' | 'update' | 'delete') => void;
  event?: CalendarEvent;  // If provided, edit mode; otherwise create mode
  prefilledDate?: string; // For create mode: pre-fill start date (YYYY-MM-DD)
}

export function CalendarEventModal({
  isOpen,
  onClose,
  onSuccess,
  event,
  prefilledDate,
}: CalendarEventModalProps) {
  const { showToast } = useToast();
  const isEditMode = !!event;

  // Track if component is mounted (for SSR compatibility with Portal)
  const [mounted, setMounted] = useState(false);

  // Schools list from API
  const [schools, setSchools] = useState<string[]>([]);
  const [isLoadingSchools, setIsLoadingSchools] = useState(false);

  // Form state - parse from event title in edit mode
  const parsedTitle = useMemo(() => {
    if (event?.title) {
      return parseTitle(event.title);
    }
    return { school: '', grade: '', stream: '', type: 'Test', suffix: '' };
  }, [event?.title]);

  const [eventType, setEventType] = useState<string>(parsedTitle.type || "Test");
  const [school, setSchool] = useState(parsedTitle.school || event?.school || "");
  const [grade, setGrade] = useState(parsedTitle.grade || event?.grade || "");
  const [academicStream, setAcademicStream] = useState(parsedTitle.stream || event?.academic_stream || "");
  const [suffix, setSuffix] = useState(parsedTitle.suffix || "");
  const [startDate, setStartDate] = useState(event?.start_date ?? prefilledDate ?? "");
  const [endDate, setEndDate] = useState(event?.end_date ?? "");
  const [description, setDescription] = useState(event?.description ?? "");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mount tracking for Portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch schools when modal opens
  useEffect(() => {
    if (isOpen && schools.length === 0 && !isLoadingSchools) {
      setIsLoadingSchools(true);
      studentsAPI.getSchools()
        .then(setSchools)
        .catch(() => {
          // Silently fail - user can still type school manually
        })
        .finally(() => setIsLoadingSchools(false));
    }
  }, [isOpen, schools.length, isLoadingSchools]);

  // Reset form when modal opens/closes or event changes
  useEffect(() => {
    if (isOpen) {
      const parsed = event?.title ? parseTitle(event.title) : { school: '', grade: '', stream: '', type: 'Test', suffix: '' };
      const parsingSucceeded = parsed.school !== '';

      if (parsingSucceeded) {
        // Parsing succeeded - use parsed values directly
        setEventType(parsed.type || event?.event_type || "Test");
        setSchool(parsed.school);
        setGrade(parsed.grade);
        setAcademicStream(parsed.stream || event?.academic_stream || "");
        setSuffix(parsed.suffix || "");
      } else if (event?.school && event?.grade) {
        // Parsing failed but event has school/grade - extract suffix from title
        // e.g., "DBYW-C F3 幾何 Exam" with school=DBYW-C, grade=F3 → suffix="幾何 Exam"
        const prefix = `${event.school} ${event.grade}`;
        let suffix = event.title?.startsWith(prefix)
          ? event.title.slice(prefix.length).trim()
          : "";
        // Try to detect event type from suffix
        let detectedType = "Test";
        if (suffix.includes("Exam")) {
          detectedType = "Exam";
          suffix = suffix.replace(/\bExam\b/g, "").trim();
        } else if (suffix.includes("Quiz")) {
          detectedType = "Quiz";
          suffix = suffix.replace(/\bQuiz\b/g, "").trim();
        } else if (suffix.includes("Test")) {
          detectedType = "Test";
          suffix = suffix.replace(/\bTest\b/g, "").trim();
        }
        setEventType(event?.event_type || detectedType);
        setSchool(event.school);
        setGrade(event.grade);
        setAcademicStream(event?.academic_stream || "");
        setSuffix(suffix);
      } else {
        // No parsing, no event data - use defaults
        setEventType(event?.event_type || "Test");
        setSchool(event?.school || "");
        setGrade(event?.grade || "");
        setAcademicStream(event?.academic_stream || "");
        setSuffix("");
      }

      setStartDate(event?.start_date ?? prefilledDate ?? "");
      setEndDate(event?.end_date ?? "");
      setDescription(event?.description ?? "");
      setError(null);
      setShowDeleteConfirm(false);
    }
  }, [isOpen, event, prefilledDate]);

  // Clear academic stream when grade changes to non-senior
  useEffect(() => {
    if (grade && !["F4", "F5", "F6"].includes(grade)) {
      setAcademicStream("");
    }
  }, [grade]);

  // Show academic stream selector only for F4-F6
  const showStreamSelector = useMemo(() => {
    return ["F4", "F5", "F6"].includes(grade);
  }, [grade]);

  // Auto-generate title from selections
  const generatedTitle = useMemo(() => {
    const parts: string[] = [];

    if (school) parts.push(school);

    if (grade) {
      if (academicStream) {
        parts.push(`${grade}(${academicStream})`);
      } else {
        parts.push(grade);
      }
    }

    if (eventType) parts.push(eventType);
    if (suffix.trim()) parts.push(suffix.trim());

    return parts.join(' ');
  }, [school, grade, academicStream, eventType, suffix]);

  // Check if event has revision slots (can't delete)
  const hasRevisionSlots = !!(event?.revision_slot_count && event.revision_slot_count > 0);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting && !isDeleting) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, isDeleting, onClose]);

  // Form validation - now requires school, grade, eventType, and startDate
  const canSubmit = useMemo(() => {
    return school.trim().length > 0 && grade.length > 0 && eventType.length > 0 && startDate.length > 0;
  }, [school, grade, eventType, startDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    const data: CalendarEventCreate = {
      title: generatedTitle,
      event_type: eventType || undefined,
      start_date: startDate,
      end_date: endDate || undefined,
      school: school.trim() || undefined,
      grade: grade || undefined,
      academic_stream: academicStream || undefined,
      description: description.trim() || undefined,
    };

    try {
      if (isEditMode && event) {
        const result = await calendarAPI.updateEvent(event.id, data);
        showToast(`Event "${generatedTitle}" updated successfully`, "success");
        onSuccess(result, 'update');
      } else {
        const result = await calendarAPI.createEvent(data);
        showToast(`Event "${generatedTitle}" created successfully`, "success");
        onSuccess(result, 'create');
      }
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save event";
      setError(message);
      showToast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!event || isDeleting) return;

    setIsDeleting(true);
    setError(null);

    try {
      await calendarAPI.deleteEvent(event.id);
      showToast(`Event "${event.title}" deleted successfully`, "success");
      onSuccess(event, 'delete');
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete event";
      setError(message);
      showToast(message, "error");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Don't render on server or before mount (needed for Portal)
  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !isSubmitting && !isDeleting && onClose()}
      />

      {/* Modal */}
      <div
        style={{
          width: "100%",
          maxWidth: "28rem",
        }}
        className={cn(
          "relative",
          "bg-[#fef9f3] dark:bg-[#2d2618]",
          "border-2 border-[#d4a574] dark:border-[#8b6f47]",
          "rounded-xl shadow-xl",
          "paper-texture",
          "max-h-[90vh] flex flex-col"
        )}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
          <h2 className="text-lg font-semibold text-[#5c4934] dark:text-[#e8d4b8]">
            {isEditMode ? "Edit Calendar Event" : "Create Calendar Event"}
          </h2>
          <button
            onClick={onClose}
            disabled={isSubmitting || isDeleting}
            className="p-1 rounded-lg hover:bg-[#e8d4b8]/50 dark:hover:bg-[#6b5a4a]/50 transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Title Preview */}
          <div className="p-3 rounded-lg bg-[#e8d4b8]/30 dark:bg-[#6b5a4a]/30 border border-[#d4a574]/50">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-1">
              <Tag className="h-3 w-3" />
              Title Preview
            </div>
            <div className={cn(
              "font-semibold text-[#5c4934] dark:text-[#e8d4b8]",
              !generatedTitle && "text-gray-400 italic"
            )}>
              {generatedTitle || "Select school, grade, and type..."}
            </div>
          </div>

          {/* Event Type Buttons */}
          <div>
            <label className="block text-sm font-medium text-[#5c4934] dark:text-[#e8d4b8] mb-2">
              Event Type <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              {Object.entries(EVENT_TYPE_COLORS).map(([type, colors]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setEventType(type)}
                  disabled={isSubmitting}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-lg font-medium text-sm transition-all",
                    "border-2",
                    eventType === type
                      ? cn(colors.bg, colors.text, colors.border)
                      : "border-transparent bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* School and Grade */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[#5c4934] dark:text-[#e8d4b8] mb-1">
                <School className="h-3.5 w-3.5 inline mr-1" />
                School <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                list="school-suggestions"
                value={school}
                onChange={(e) => setSchool(e.target.value.toUpperCase())}
                placeholder="Type or select..."
                className={cn(
                  "w-full px-3 py-2 rounded-lg",
                  "bg-[#e8d4b8]/30 dark:bg-[#2d2618]/70",
                  "border border-[#e8d4b8] dark:border-[#6b5a4a]",
                  "text-[#5c4934] dark:text-[#e8d4b8]",
                  "placeholder:text-[#a08060] dark:placeholder:text-[#8b7355]",
                  "focus:outline-none focus:ring-2 focus:ring-[#d4a574]",
                  "uppercase"
                )}
                disabled={isSubmitting || isLoadingSchools}
              />
              <datalist id="school-suggestions">
                {schools.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#5c4934] dark:text-[#e8d4b8] mb-1">
                <GraduationCap className="h-3.5 w-3.5 inline mr-1" />
                Grade <span className="text-red-500">*</span>
              </label>
              <select
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className={cn(
                  "w-full px-3 py-2 rounded-lg",
                  "bg-[#e8d4b8]/30 dark:bg-[#2d2618]/70",
                  "border border-[#e8d4b8] dark:border-[#6b5a4a]",
                  "text-[#5c4934] dark:text-[#e8d4b8]",
                  "focus:outline-none focus:ring-2 focus:ring-[#d4a574]"
                )}
                disabled={isSubmitting}
              >
                <option value="">Select grade</option>
                {GRADE_OPTIONS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Academic Stream (only for F4-F6) */}
          {showStreamSelector && (
            <div>
              <label className="block text-sm font-medium text-[#5c4934] dark:text-[#e8d4b8] mb-2">
                Academic Stream
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAcademicStream("")}
                  disabled={isSubmitting}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-lg font-medium text-sm transition-all border-2",
                    academicStream === ""
                      ? "border-[#d4a574] bg-[#e8d4b8]/30 text-[#5c4934] dark:text-[#e8d4b8]"
                      : "border-transparent bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  )}
                >
                  All
                </button>
                {STREAM_OPTIONS.map((stream) => (
                  <button
                    key={stream.value}
                    type="button"
                    onClick={() => setAcademicStream(stream.value)}
                    disabled={isSubmitting}
                    className={cn(
                      "flex-1 py-2 px-3 rounded-lg font-medium text-sm transition-all border-2",
                      academicStream === stream.value
                        ? "border-[#d4a574] bg-[#e8d4b8]/30 text-[#5c4934] dark:text-[#e8d4b8]"
                        : "border-transparent bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                    )}
                  >
                    {stream.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Suffix (optional extra text) */}
          <div>
            <label className="block text-sm font-medium text-[#5c4934] dark:text-[#e8d4b8] mb-1">
              Suffix (optional)
            </label>
            <input
              type="text"
              value={suffix}
              onChange={(e) => setSuffix(e.target.value)}
              placeholder="e.g., Algebra, Geometry"
              className={cn(
                "w-full px-3 py-2 rounded-lg",
                "bg-white/50 dark:bg-[#2d2618]/70",
                "border border-[#e8d4b8] dark:border-[#6b5a4a]",
                "text-[#5c4934] dark:text-[#e8d4b8]",
                "placeholder:text-[#a08060] dark:placeholder:text-[#8b7355]",
                "focus:outline-none focus:ring-2 focus:ring-[#d4a574]"
              )}
              disabled={isSubmitting}
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[#5c4934] dark:text-[#e8d4b8] mb-1">
                <Calendar className="h-3.5 w-3.5 inline mr-1" />
                Start Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={cn(
                  "w-full px-3 py-2 rounded-lg",
                  "bg-white/50 dark:bg-[#2d2618]/70",
                  "border border-[#e8d4b8] dark:border-[#6b5a4a]",
                  "text-[#5c4934] dark:text-[#e8d4b8]",
                  "focus:outline-none focus:ring-2 focus:ring-[#d4a574]"
                )}
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#5c4934] dark:text-[#e8d4b8] mb-1">
                <Calendar className="h-3.5 w-3.5 inline mr-1" />
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className={cn(
                  "w-full px-3 py-2 rounded-lg",
                  "bg-white/50 dark:bg-[#2d2618]/70",
                  "border border-[#e8d4b8] dark:border-[#6b5a4a]",
                  "text-[#5c4934] dark:text-[#e8d4b8]",
                  "focus:outline-none focus:ring-2 focus:ring-[#d4a574]"
                )}
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-[#5c4934] dark:text-[#e8d4b8] mb-1">
              <FileText className="h-3.5 w-3.5 inline mr-1" />
              Syllabus / Notes
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="What topics will be covered..."
              className={cn(
                "w-full px-3 py-2 rounded-lg resize-none",
                "bg-white/50 dark:bg-[#2d2618]/70",
                "border border-[#e8d4b8] dark:border-[#6b5a4a]",
                "text-[#5c4934] dark:text-[#e8d4b8]",
                "placeholder:text-[#a08060] dark:placeholder:text-[#8b7355]",
                "focus:outline-none focus:ring-2 focus:ring-[#d4a574]"
              )}
              disabled={isSubmitting}
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Delete Confirmation */}
          {showDeleteConfirm && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-700 dark:text-red-300">
                    Delete this event?
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    This will also remove it from Google Calendar. This action cannot be undone.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
                    >
                      {isDeleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      {isDeleting ? "Deleting..." : "Delete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={isDeleting}
                      className="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </form>

        {/* Actions - fixed at bottom */}
        <div className="flex-shrink-0 flex justify-between gap-3 p-4 border-t border-[#e8d4b8] dark:border-[#6b5a4a]">
          {/* Delete button (edit mode only) */}
          {isEditMode && !showDeleteConfirm && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isSubmitting || isDeleting || hasRevisionSlots}
              title={hasRevisionSlots ? `Cannot delete: event has ${event?.revision_slot_count} revision slot(s)` : undefined}
              className={cn(
                "px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-1.5",
                hasRevisionSlots
                  ? "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                  : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
              )}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          )}

          <div className={cn("flex gap-3", !isEditMode && "ml-auto")}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting || isDeleting}
              className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="calendar-event-form"
              onClick={handleSubmit}
              disabled={!canSubmit || isSubmitting || isDeleting}
              className={cn(
                "px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2",
                "bg-[#d4a574] text-white hover:bg-[#c4956a]",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting
                ? "Saving..."
                : isEditMode
                ? "Save Changes"
                : "Create Event"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
