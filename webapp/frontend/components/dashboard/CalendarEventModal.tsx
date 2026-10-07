"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import { useFormDirtyTracking } from "@/lib/ui-hooks";
import { calendarAPI, studentsAPI } from "@/lib/api";
import { Button, IconButton, Input, Label, Segmented, Select, Textarea } from "@/components/controls";
import type { CalendarEvent, CalendarEventCreate } from "@/types";
import {
  X,
  Calendar,
  School,
  GraduationCap,
  FileText,
  Trash2,
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
  readOnly?: boolean;
}

export function CalendarEventModal({
  isOpen,
  onClose,
  onSuccess,
  event,
  prefilledDate,
  readOnly = false,
}: CalendarEventModalProps) {
  const { showToast } = useToast();
  const isEditMode = !!event;

  // Dirty tracking for discard warning
  const {
    setIsDirty,
    showCloseConfirm,
    handleCloseAttempt,
    confirmDiscard,
    cancelClose,
  } = useFormDirtyTracking(isOpen, onClose);

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

  // Mark form dirty on any field change
  const markDirty = useCallback(() => setIsDirty(true), [setIsDirty]);

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
      if (e.key === "Escape") {
        if (showCloseConfirm) {
          e.preventDefault();
          e.stopPropagation();
          cancelClose();
        } else if (!isSubmitting && !isDeleting) {
          handleCloseAttempt();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, isSubmitting, isDeleting, showCloseConfirm, handleCloseAttempt, cancelClose]);

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
        onClick={() => !isSubmitting && !isDeleting && handleCloseAttempt()}
      />

      {/* Modal */}
      <div
        style={{
          width: "100%",
          maxWidth: "28rem",
        }}
        className={cn(
          "relative",
          "bg-paper",
          "border-2 border-line-strong",
          "rounded-xl shadow-xl",
          "paper-texture",
          "max-h-[90vh] flex flex-col"
        )}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-line">
          <h2 className="text-lg font-semibold text-ink-heading">
            {isEditMode ? "Edit Calendar Event" : "Create Calendar Event"}
          </h2>
          <IconButton
            icon={X}
            label="Close"
            onClick={handleCloseAttempt}
            disabled={isSubmitting || isDeleting}
          />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Title Preview */}
          <div className="p-3 rounded-lg bg-line/30 border border-[#d4a574]/50">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-1">
              <Tag className="h-3 w-3" />
              Title preview
            </div>
            <div className={cn(
              "font-semibold text-ink-heading dark:text-ink-heading",
              !generatedTitle && "text-gray-500 italic"
            )}>
              {generatedTitle || "Select school, grade, and type..."}
            </div>
          </div>

          {/* Event Type Buttons */}
          <div>
            <Label id="calendar-event-type">
              Event type <span className="text-red-600">*</span>
            </Label>
            {/* Each type keeps the colour it has on the test calendar. */}
            <div role="group" aria-labelledby="calendar-event-type" className="flex gap-2">
              {Object.entries(EVENT_TYPE_COLORS).map(([type, colors]) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={eventType === type}
                  onClick={() => { setEventType(type); markDirty(); }}
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
              <Label htmlFor="calendar-event-school">
                <School className="h-3.5 w-3.5 inline mr-1" aria-hidden="true" />
                School <span className="text-red-600">*</span>
              </Label>
              <Input
                id="calendar-event-school"
                type="text"
                list="school-suggestions"
                value={school}
                onChange={(e) => { setSchool(e.target.value.toUpperCase()); markDirty(); }}
                placeholder="Type or select..."
                className="uppercase"
                disabled={isSubmitting || isLoadingSchools}
              />
              <datalist id="school-suggestions">
                {schools.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div>
              <Label htmlFor="calendar-event-grade">
                <GraduationCap className="h-3.5 w-3.5 inline mr-1" aria-hidden="true" />
                Grade <span className="text-red-600">*</span>
              </Label>
              <Select
                id="calendar-event-grade"
                value={grade}
                onChange={(e) => { setGrade(e.target.value); markDirty(); }}
                disabled={isSubmitting}
              >
                <option value="">Select grade</option>
                {GRADE_OPTIONS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </Select>
            </div>
          </div>

          {/* Academic Stream (only for F4-F6) */}
          {showStreamSelector && (
            <div>
              <Label>Academic stream</Label>
              <Segmented
                label="Academic stream"
                value={academicStream}
                onChange={(value) => { setAcademicStream(value); markDirty(); }}
                options={[
                  { value: "", label: "All", disabled: isSubmitting },
                  ...STREAM_OPTIONS.map((stream) => ({ value: stream.value, label: stream.label, disabled: isSubmitting })),
                ]}
              />
            </div>
          )}

          {/* Suffix (optional extra text) */}
          <div>
            <Label htmlFor="calendar-event-suffix">
              Suffix <span className="normal-case font-normal">(optional)</span>
            </Label>
            <Input
              id="calendar-event-suffix"
              type="text"
              value={suffix}
              onChange={(e) => { setSuffix(e.target.value); markDirty(); }}
              placeholder="e.g., Algebra, Geometry"
              disabled={isSubmitting}
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="calendar-event-start">
                <Calendar className="h-3.5 w-3.5 inline mr-1" aria-hidden="true" />
                Start date <span className="text-red-600">*</span>
              </Label>
              <Input
                id="calendar-event-start"
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); markDirty(); }}
                disabled={isSubmitting}
              />
            </div>
            <div>
              <Label htmlFor="calendar-event-end">
                <Calendar className="h-3.5 w-3.5 inline mr-1" aria-hidden="true" />
                End date
              </Label>
              <Input
                id="calendar-event-end"
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); markDirty(); }}
                min={startDate}
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="calendar-event-notes">
              <FileText className="h-3.5 w-3.5 inline mr-1" aria-hidden="true" />
              Syllabus / notes
            </Label>
            <Textarea
              id="calendar-event-notes"
              value={description}
              onChange={(e) => { setDescription(e.target.value); markDirty(); }}
              rows={4}
              placeholder="What topics will be covered..."
              className="resize-none"
              disabled={isSubmitting}
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

        </form>

        {/* Actions - fixed at bottom */}
        <div className="flex-shrink-0 flex justify-between gap-3 p-4 border-t border-line">
          {/* Delete button (edit mode only) */}
          {isEditMode && (
            showDeleteConfirm ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="danger"
                  icon={Trash2}
                  loading={isDeleting}
                  onClick={handleDelete}
                >
                  {isDeleting ? "Deleting..." : "Confirm delete"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                icon={Trash2}
                iconClassName="text-red-600 dark:text-red-400"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={readOnly || isSubmitting || isDeleting || hasRevisionSlots}
                title={readOnly ? "Read-only access" : hasRevisionSlots ? `Cannot delete: event has ${event?.revision_slot_count} revision slot(s)` : undefined}
              >
                Delete
              </Button>
            )
          )}

          {!showDeleteConfirm && (
            <div className={cn("flex gap-3", !isEditMode && "ml-auto")}>
              <Button
                variant="secondary"
                onClick={handleCloseAttempt}
                disabled={isSubmitting || isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                form="calendar-event-form"
                onClick={handleSubmit}
                loading={isSubmitting}
                disabled={readOnly || !canSubmit || isDeleting}
                title={readOnly ? "Read-only access" : undefined}
              >
                {isSubmitting
                  ? "Saving..."
                  : isEditMode
                  ? "Save changes"
                  : "Create event"}
              </Button>
            </div>
          )}
        </div>
      </div>
      {/* Close Confirmation Dialog */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-paper border-2 border-line-strong rounded-lg shadow-xl p-6 w-full max-w-[400px]">
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
              You have unsaved changes. Discard them?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={cancelClose}>
                Cancel
              </Button>
              <Button variant="danger" onClick={confirmDiscard}>
                Discard
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
