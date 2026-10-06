"use client";

import { useMemo, useEffect, useState, memo } from "react";
import { useEnrollmentSessions, useLocations, useTutors } from "@/lib/hooks";
import { departureLabel, isHomeBranch, pickableTutors, withCurrentTutor } from "@/lib/employment";
import { enrollmentsAPI } from "@/lib/api";
import Link from "next/link";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useDismiss,
  useInteractions,
  FloatingPortal,
} from "@floating-ui/react";
import { X, Calendar, Clock, MapPin, HandCoins, ExternalLink, User, Check, Edit2, CalendarDays, Loader2, Tag, CalendarX, XCircle, Copy } from "lucide-react";
import { cn, formatError } from "@/lib/utils";
import { fetchSummerFeeMessage } from "@/lib/summer-fee-message-fetch";
import { useToast } from "@/contexts/ToastContext";
import { getTutorSortName } from "@/components/zen/utils/sessionSorting";
import { SessionStatusTag } from "@/components/ui/session-status-tag";
import { getDisplayStatus } from "@/lib/session-status";
import { ScheduleChangeReviewModal } from "@/components/enrollments/ScheduleChangeReviewModal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Enrollment, Tutor } from "@/types";
import { TutorLink } from "@/components/tutors/TutorLink";
import { useAuth } from "@/contexts/AuthContext";
import { GradeBadge } from "@/components/ui/grade-label";
import { Button, IconButton, Input, Label, Select, buttonClasses } from "@/components/controls";

/** Stable empty list so a fetch in flight does not recompute the narrowing. */
const EMPTY_TUTORS: Tutor[] = [];

// Day options (short form)
const DAY_OPTIONS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

// Time options based on day type
const WEEKDAY_TIMES = ["16:45 - 18:15", "18:25 - 19:55"];
const WEEKEND_TIMES = ["10:00 - 11:30", "11:45 - 13:15", "14:30 - 16:00", "16:15 - 17:45", "18:00 - 19:30"];

// Check if day is weekend
const isWeekend = (day: string) => day === "Sat" || day === "Sun" || day === "Saturday" || day === "Sunday";

// Get time options based on selected day
const getTimeOptions = (day: string) => isWeekend(day) ? WEEKEND_TIMES : WEEKDAY_TIMES;

interface EnrollmentDetailPopoverProps {
  enrollment: Enrollment | null;
  isOpen: boolean;
  onClose: () => void;
  clickPosition: { x: number; y: number } | null;
  onNavigate?: () => void;
  onStatusChange?: () => void;
}

export const EnrollmentDetailPopover = memo(function EnrollmentDetailPopover({
  enrollment,
  isOpen,
  onClose,
  clickPosition,
  onNavigate,
  onStatusChange,
}: EnrollmentDetailPopoverProps) {
  // Virtual reference based on click position
  const virtualReference = useMemo(() => {
    if (!clickPosition) return null;
    return {
      getBoundingClientRect: () => ({
        x: clickPosition.x,
        y: clickPosition.y,
        top: clickPosition.y,
        left: clickPosition.x,
        bottom: clickPosition.y,
        right: clickPosition.x,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      }),
    };
  }, [clickPosition]);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: (open) => {
      if (!open) onClose();
    },
    middleware: [
      offset(8),
      flip({
        fallbackAxisSideDirection: "end",
        padding: 16,
      }),
      shift({
        padding: 16,
      }),
    ],
    whileElementsMounted: autoUpdate,
    placement: "bottom-start",
  });

  // Use setPositionReference for virtual references
  useEffect(() => {
    if (virtualReference) {
      refs.setPositionReference(virtualReference);
    }
  }, [virtualReference, refs]);

  const dismiss = useDismiss(context);
  const { getFloatingProps } = useInteractions([dismiss]);

  // Fetch locations and tutors for editing
  const { data: allLocations = [] } = useLocations();
  // The whole roster. The dropdown narrows it below, but this enrollment may
  // already belong to somebody who has left, and their name has to come from
  // somewhere.
  const { data: allTutors = EMPTY_TUTORS } = useTutors();
  const { effectiveRole, isReadOnly } = useAuth();
  const isTutor = effectiveRole === "Tutor" || isReadOnly;

  // Filter locations (exclude "Various" placeholder)
  const locations = useMemo(() =>
    allLocations.filter(loc => loc !== "Various"),
  [allLocations]);

  // Action states
  const [markedAsPaid, setMarkedAsPaid] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const [editedDay, setEditedDay] = useState('');
  const [editedTime, setEditedTime] = useState('');
  const [editedLocation, setEditedLocation] = useState('');
  const [editedTutorId, setEditedTutorId] = useState<number | null>(null);
  const [isCustomTime, setIsCustomTime] = useState(false);
  const [scheduleSaved, setScheduleSaved] = useState(false);

  // Schedule change modal state
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

  // Confirmation dialog states
  const [confirmPayment, setConfirmPayment] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Copy fee message states
  const [isCopying, setIsCopying] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const { showToast } = useToast();

  // Filter tutors by selected location. Only people who can still be given work
  // are offered, but whoever this enrollment is already assigned to is added
  // back, so a tutor who has left does not leave the field looking empty when
  // it is not.
  const filteredTutors = useMemo(() => {
    if (!editedLocation) return [];
    const offerable = pickableTutors(
      allTutors.filter(t => isHomeBranch(t, editedLocation))
    );
    return [...withCurrentTutor(offerable, editedTutorId, allTutors)]
      .sort((a, b) => getTutorSortName(a.tutor_name).localeCompare(getTutorSortName(b.tutor_name)));
  }, [allTutors, editedLocation, editedTutorId]);

  // Get time options based on current day
  const timeOptions = useMemo(() => getTimeOptions(editedDay), [editedDay]);

  // Reset states when enrollment changes
  useEffect(() => {
    setMarkedAsPaid(false);
    setIsEditingSchedule(false);
    setScheduleSaved(false);
    setIsCustomTime(false);
    if (enrollment) {
      setEditedDay(enrollment.assigned_day || '');
      setEditedTime(enrollment.assigned_time || '');
      setEditedLocation(enrollment.location || '');
      setEditedTutorId(enrollment.tutor_id || null);
      // Check if current time is custom (not in predefined options)
      if (enrollment.assigned_time) {
        const options = getTimeOptions(enrollment.assigned_day || '');
        if (!options.includes(enrollment.assigned_time)) {
          setIsCustomTime(true);
        }
      }
    }
  }, [enrollment?.id]);

  // Fetch sessions for this enrollment
  const { data: sessions = [], isLoading: sessionsLoading } = useEnrollmentSessions(enrollment?.id);

  // Get upcoming sessions (today or future, limit to 2)
  const upcomingSessions = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return sessions
      .filter(s => {
        const sessionDate = new Date(s.session_date);
        sessionDate.setHours(0, 0, 0, 0);
        return sessionDate >= today && s.session_status !== 'Cancelled';
      })
      .sort((a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime())
      .slice(0, 2);
  }, [sessions]);

  if (!isOpen || !enrollment) return null;

  const isPending = enrollment.payment_status === 'Pending Payment';
  const showMarkAsPaid = isPending && !markedAsPaid && !isTutor;

  // Check if any sessions have been attended - cannot cancel if so
  const hasAttendedSessions = sessions.some(
    s => s.session_status === 'Attended' || s.session_status === 'Attended (Make-up)'
  );
  const showCancelButton = (enrollment.payment_status === 'Pending Payment'
    || enrollment.payment_status === 'Overdue')
    && !markedAsPaid
    && !hasAttendedSessions
    && !isTutor;

  // Format date relative to today
  const formatSessionDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const handleMarkAsPaid = async () => {
    if (!enrollment) return;
    setMarkingPaid(true);
    try {
      await enrollmentsAPI.update(enrollment.id, { payment_status: "Paid" });
      setMarkedAsPaid(true);
      onStatusChange?.();
    } catch (err) {
      // Failed to mark as paid silently
    } finally {
      setMarkingPaid(false);
    }
  };

  const handleCancelEnrollment = async () => {
    if (!enrollment) return;

    setIsCancelling(true);
    try {
      await enrollmentsAPI.cancel(enrollment.id);
      onStatusChange?.();
      onClose();
    } catch (err) {
      // Failed to cancel enrollment silently
    } finally {
      setIsCancelling(false);
    }
  };

  const handleSaveSchedule = () => {
    // Check if anything actually changed
    const dayChanged = editedDay !== enrollment.assigned_day;
    const timeChanged = editedTime !== enrollment.assigned_time;
    const locationChanged = editedLocation !== enrollment.location;
    const tutorChanged = editedTutorId !== enrollment.tutor_id;

    if (!dayChanged && !timeChanged && !locationChanged && !tutorChanged) {
      // Nothing changed, just close editing mode
      setIsEditingSchedule(false);
      return;
    }

    // Open the schedule change review modal
    setIsScheduleModalOpen(true);
    setIsEditingSchedule(false);
  };

  // Handle schedule change success
  const handleScheduleChangeSuccess = () => {
    setScheduleSaved(true);
    onStatusChange?.();
  };

  // Handle location change - reset tutor when location changes
  const handleLocationChange = (newLocation: string) => {
    setEditedLocation(newLocation);
    setEditedTutorId(null); // Reset tutor when location changes
  };

  // Handle day change - reset time if current time is not in new options
  const handleDayChange = (newDay: string) => {
    setEditedDay(newDay);
    const newOptions = getTimeOptions(newDay);
    if (!isCustomTime && editedTime && !newOptions.includes(editedTime)) {
      setEditedTime('');
    }
  };

  // Handle copy fee message
  const handleCopyFeeMessage = async () => {
    if (!enrollment?.id) return;
    setIsCopying(true);
    setCopySuccess(false);
    try {
      // Published Summer enrollments price via the summer config, so the
      // generic fee-message endpoint rejects them; build the summer message
      // from the application context instead.
      const message =
        enrollment.enrollment_type === 'Summer' && enrollment.summer_application_id
          ? await fetchSummerFeeMessage(enrollment.summer_application_id)
          : (await enrollmentsAPI.getFeeMessage(enrollment.id, 'zh', enrollment.lessons_paid)).message;
      await navigator.clipboard.writeText(message);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy fee message:', error);
      showToast(formatError(error, 'Failed to copy fee message'), 'error');
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        {...getFloatingProps()}
        className={cn(
          "z-[9999]",
          "bg-paper",
          "border-2 border-line-strong",
          "rounded-lg shadow-lg",
          "p-4 w-[min(280px,90vw)]",
          "paper-texture"
        )}
      >
        {/* Close button */}
        <IconButton label="Close" icon={X} size="sm" onClick={onClose} className="absolute top-2 right-2" />

        {/* Header */}
        <div className="mb-3 pr-6">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">{enrollment.school_student_id || "N/A"}</span>
            <span className="text-[11px] text-gray-500 font-mono">#{enrollment.id}</span>
          </div>
          <Link
            href={`/students/${enrollment.student_id}`}
            onClick={(e) => {
              e.stopPropagation();
              onNavigate?.();
              onClose();
            }}
            className="text-lg font-bold text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
          >
            {enrollment.student_name || "Unknown Student"}
          </Link>
        </div>

        {/* Details */}
        <div className="space-y-2 text-sm mb-4">
          {/* Grade */}
          {enrollment.grade && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Grade:</span>
              <GradeBadge className="text-xs px-1.5 py-0.5 rounded text-gray-800" grade={enrollment.grade} langStream={enrollment.lang_stream} />
            </div>
          )}

          {/* School */}
          {enrollment.school && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">School:</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                {enrollment.school}
              </span>
            </div>
          )}

          {/* Schedule - with inline edit option */}
          {isEditingSchedule ? (
            <div className="space-y-2 p-2 bg-paper rounded-md border border-[#d4a574] dark:border-[#6b5a4a]">
              {/* Day selector */}
              <div className="flex items-center gap-2">
                <Label htmlFor={`enrollment-${enrollment.id}-day`} className="mb-0 w-12 flex-shrink-0">Day</Label>
                <div className="flex-1 min-w-0">
                  <Select
                    id={`enrollment-${enrollment.id}-day`}
                    size="sm"
                    value={editedDay}
                    onChange={(e) => handleDayChange(e.target.value)}
                  >
                    <option value="">Unscheduled</option>
                    {DAY_OPTIONS.map(day => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </Select>
                </div>
              </div>

              {/* Time selector - shows dropdown or custom input */}
              <div className="flex items-center gap-2">
                <Label htmlFor={`enrollment-${enrollment.id}-time`} className="mb-0 w-12 flex-shrink-0">Time</Label>
                {isCustomTime ? (
                  <div className="flex-1 flex items-center gap-1">
                    <Input
                      id={`enrollment-${enrollment.id}-time`}
                      type="text"
                      size="sm"
                      value={editedTime}
                      onChange={(e) => setEditedTime(e.target.value)}
                      placeholder="e.g., 10:00 - 11:30"
                      className="flex-1"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsCustomTime(false);
                        setEditedTime('');
                      }}
                      className="text-[11px] text-accent-ink hover:underline whitespace-nowrap"
                    >
                      Back
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <Select
                      id={`enrollment-${enrollment.id}-time`}
                      size="sm"
                      value={editedTime}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') {
                          setIsCustomTime(true);
                          setEditedTime('');
                        } else {
                          setEditedTime(e.target.value);
                        }
                      }}
                    >
                      <option value="">Select time...</option>
                      {timeOptions.map(time => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                      <option value="__custom__">Other (custom)...</option>
                    </Select>
                  </div>
                )}
              </div>

              {/* Location selector from API */}
              <div className="flex items-center gap-2">
                <Label htmlFor={`enrollment-${enrollment.id}-location`} className="mb-0 w-12 flex-shrink-0">Loc</Label>
                <div className="flex-1 min-w-0">
                  <Select
                    id={`enrollment-${enrollment.id}-location`}
                    size="sm"
                    value={editedLocation}
                    onChange={(e) => handleLocationChange(e.target.value)}
                  >
                    <option value="">None</option>
                    {locations.map(loc => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </Select>
                </div>
              </div>

              {/* Tutor selector - filtered by location */}
              <div className="flex items-center gap-2">
                <Label htmlFor={`enrollment-${enrollment.id}-tutor`} className="mb-0 w-12 flex-shrink-0">Tutor</Label>
                <div className="flex-1 min-w-0">
                <Select
                  id={`enrollment-${enrollment.id}-tutor`}
                  size="sm"
                  value={editedTutorId || ''}
                  onChange={(e) => setEditedTutorId(e.target.value ? parseInt(e.target.value) : null)}
                  disabled={!editedLocation}
                >
                  <option value="">{editedLocation ? 'Select tutor...' : 'Select location first'}</option>
                  {filteredTutors.map(tutor => {
                    const departure = departureLabel(tutor);
                    return (
                      <option key={tutor.id} value={tutor.id}>
                        {departure ? `${tutor.tutor_name} (${departure.toLowerCase()})` : tutor.tutor_name}
                      </option>
                    );
                  })}
                </Select>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingSchedule(false);
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSaveSchedule();
                  }}
                  className="flex-1"
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Schedule display */}
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Schedule:
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-gray-900 dark:text-gray-100 font-medium">
                    {scheduleSaved ? `${editedDay} ${editedTime}` : (enrollment.assigned_day && enrollment.assigned_time ? `${enrollment.assigned_day} ${enrollment.assigned_time}` : 'Unscheduled')}
                    {scheduleSaved && <span className="text-green-700 text-[11px] ml-1">✓</span>}
                  </span>
                  <IconButton
                    label="Edit schedule"
                    icon={Edit2}
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditingSchedule(true);
                    }}
                    // Sits inside a line of text, so it stays smaller than a toolbar button.
                    className="h-5 w-5"
                    iconClassName="h-3 w-3"
                  />
                </div>
              </div>

              {/* Location display */}
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  Location:
                </span>
                <span className="text-gray-900 dark:text-gray-100">
                  {scheduleSaved ? (editedLocation || 'None') : (enrollment.location || 'None')}
                </span>
              </div>
            </>
          )}

          {/* Enrollment Type */}
          {enrollment.enrollment_type && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                <Tag className="h-3.5 w-3.5" />
                Type:
              </span>
              <span className={cn(
                "px-2 py-0.5 rounded text-xs font-medium",
                enrollment.enrollment_type === 'Trial'
                  ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300"
                  : enrollment.enrollment_type === 'One-Time'
                  ? "bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300"
                  : enrollment.enrollment_type === 'Summer'
                  ? "bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300"
                  : "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300"
              )}>
                {enrollment.enrollment_type}
              </span>
            </div>
          )}

          {/* Payment Status */}
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
              <HandCoins className="h-3.5 w-3.5" />
              Payment:
            </span>
            <span className={cn(
              "px-2 py-0.5 rounded text-xs font-medium",
              markedAsPaid || enrollment.payment_status === 'Paid'
                ? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300"
                : enrollment.payment_status === 'Cancelled' || enrollment.payment_status === 'Waived'
                  ? "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                  : enrollment.payment_status === 'Overdue'
                    ? "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300"
                    : "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300"
            )}>
              {markedAsPaid ? "Payment Confirmed ✓" : enrollment.payment_status}
            </span>
          </div>

          {/* New Student - not applicable to Trial. The fee is only claimed
              when it was actually charged: a seasonal intake may collect it
              from nobody. */}
          {enrollment.is_new_student && enrollment.enrollment_type !== 'Trial' && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">New Student:</span>
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                {enrollment.registration_fee === 0 ? "Yes" : "+$100 Reg Fee"}
              </span>
            </div>
          )}

          {/* Lessons Paid */}
          {enrollment.lessons_paid !== undefined && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Lessons Paid:</span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">
                {enrollment.lessons_paid}
              </span>
            </div>
          )}

          {/* Fee — total tuition from the fee message. A waived enrollment
              owes nothing, so the nominal figure would mislead here. */}
          {enrollment.payment_status === 'Waived' ? (
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Fee:</span>
              <span className="text-gray-500 dark:text-gray-400 font-medium">
                Waived (no fee due)
              </span>
            </div>
          ) : enrollment.total_fee != null ? (
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Fee:</span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">
                ${enrollment.total_fee.toLocaleString()}
              </span>
            </div>
          ) : null}

          {/* First Lesson Date */}
          {enrollment.first_lesson_date && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Started:
              </span>
              <span className="text-gray-900 dark:text-gray-100">
                {new Date(enrollment.first_lesson_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
          )}

          {/* Effective End Date */}
          {enrollment.effective_end_date && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                <CalendarX className="h-3.5 w-3.5" />
                Ends:
              </span>
              <span className={cn(
                new Date(enrollment.effective_end_date) < new Date()
                  ? "text-red-600 dark:text-red-400"
                  : "text-gray-900 dark:text-gray-100"
              )}>
                {new Date(enrollment.effective_end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {(enrollment.deadline_extension_weeks ?? 0) > 0 && (
                  <span className="ml-1 text-[11px] text-amber-700 dark:text-amber-400">
                    (+{enrollment.deadline_extension_weeks}w)
                  </span>
                )}
              </span>
            </div>
          )}

          {/* Tutor */}
          {enrollment.tutor_name && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                Tutor:
              </span>
              <span className="text-gray-900 dark:text-gray-100">
                <TutorLink tutorId={enrollment.tutor_id} tutorName={enrollment.tutor_name} />
              </span>
            </div>
          )}
        </div>

        {/* Summer unavailability notes — what the parent flagged on the application, to help arrange make-ups */}
        {enrollment.summer_unavailability_notes && (
          <div className="mb-4 p-2.5 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60">
            <div className="flex items-center gap-1.5 mb-1">
              <CalendarX className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
              <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                Unavailable Dates
              </span>
            </div>
            <p className="text-xs text-amber-800 dark:text-amber-200 whitespace-pre-wrap break-words">
              {enrollment.summer_unavailability_notes}
            </p>
          </div>
        )}

        {/* Upcoming Sessions Preview */}
        <div className="py-3 border-t border-line">
          <div className="flex items-center gap-1 mb-2">
            <CalendarDays className="h-3.5 w-3.5 text-accent-ink" />
            <span className="text-[11px] font-bold text-accent-ink uppercase tracking-wider">
              Upcoming Sessions
            </span>
          </div>
          {sessionsLoading ? (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Loading...</span>
            </div>
          ) : upcomingSessions.length === 0 ? (
            <p className="text-xs text-gray-500 italic">No upcoming sessions</p>
          ) : (
            <div className="space-y-1">
              {upcomingSessions.map((session) => (
                <Link
                  key={session.id}
                  href={`/sessions/${session.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigate?.();
                    onClose();
                  }}
                  className="flex items-center justify-between text-xs p-1.5 rounded bg-tint border border-line hover:bg-[#efe5d7] dark:hover:bg-[#4d4638] transition-colors cursor-pointer"
                >
                  <div className="flex flex-col">
                    <span className="text-gray-700 dark:text-gray-300">
                      {formatSessionDate(session.session_date)}
                    </span>
                    {session.tutor_name && (
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">
                        <TutorLink tutorId={session.tutor_id} tutorName={session.tutor_name} />
                      </span>
                    )}
                  </div>
                  <SessionStatusTag status={getDisplayStatus(session)} size="sm" iconOnly />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="pt-3 border-t border-line space-y-2">
          {/* Confirm Payment button - only shown for pending payments */}
          {showMarkAsPaid && (
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmPayment(true);
              }}
              loading={markingPaid}
              icon={Check}
              iconClassName="text-green-700 dark:text-green-400"
              className="w-full"
            >
              Confirm payment
            </Button>
          )}

          {/* Cancel Enrollment button - shown for pending/overdue without attended sessions */}
          {showCancelButton && (
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmCancel(true);
              }}
              loading={isCancelling}
              icon={XCircle}
              iconClassName="text-red-600 dark:text-red-400"
              className="w-full"
            >
              Cancel enrollment
            </Button>
          )}

          {/* Copy Fee Message button — hidden for waived enrollments, which
              have no fee to ask for */}
          {enrollment.payment_status !== 'Waived' && (
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleCopyFeeMessage();
            }}
            loading={isCopying}
            icon={copySuccess ? Check : Copy}
            iconClassName={cn(copySuccess && "text-green-700 dark:text-green-400")}
            className="w-full"
          >
            {isCopying ? 'Copying...' : copySuccess ? 'Copied!' : 'Copy fee message'}
          </Button>
          )}

          {/* View Details link */}
          <Link
            href={`/enrollments/${enrollment.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onNavigate?.();
              onClose();
            }}
            // While the schedule is being edited, Save is the one primary button.
            className={cn(buttonClasses({ variant: isEditingSchedule ? "secondary" : "primary", size: "sm" }), "w-full")}
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            View enrollment details
          </Link>
        </div>

        {/* Confirm Payment Dialog */}
        <ConfirmDialog
          isOpen={confirmPayment}
          onConfirm={() => {
            setConfirmPayment(false);
            handleMarkAsPaid();
          }}
          onCancel={() => setConfirmPayment(false)}
          title="Confirm Payment"
          message="Are you sure you want to confirm payment for this enrollment?"
          confirmText="Confirm Payment"
          variant="default"
          loading={markingPaid}
        />

        {/* Confirm Cancel Dialog */}
        <ConfirmDialog
          isOpen={confirmCancel}
          onConfirm={() => {
            setConfirmCancel(false);
            handleCancelEnrollment();
          }}
          onCancel={() => setConfirmCancel(false)}
          title="Cancel Enrollment"
          message="Are you sure you want to cancel this enrollment?"
          consequences={["All scheduled sessions will be cancelled"]}
          confirmText="Cancel Enrollment"
          variant="danger"
          loading={isCancelling}
        />

        {/* Schedule Change Review Modal */}
        <ScheduleChangeReviewModal
          isOpen={isScheduleModalOpen}
          onClose={() => setIsScheduleModalOpen(false)}
          enrollmentId={enrollment.id}
          currentSchedule={{
            day: enrollment.assigned_day || '',
            time: enrollment.assigned_time || '',
            location: enrollment.location || '',
            tutorId: enrollment.tutor_id || 0,
            tutorName: enrollment.tutor_name || '',
          }}
          newSchedule={{
            day: editedDay,
            time: editedTime,
            location: editedLocation,
            tutorId: editedTutorId || 0,
            tutorName: allTutors.find(t => t.id === editedTutorId)?.tutor_name || '',
          }}
          onSuccess={handleScheduleChangeSuccess}
        />
      </div>
    </FloatingPortal>
  );
});
