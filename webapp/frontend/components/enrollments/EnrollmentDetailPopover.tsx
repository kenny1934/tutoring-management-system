"use client";

import { useMemo, useEffect, useState } from "react";
import { useEnrollmentSessions, useLocations, useTutors } from "@/lib/hooks";
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
import { X, Calendar, Clock, MapPin, HandCoins, ExternalLink, User, Check, Edit2, CalendarDays, Loader2, Tag, CalendarX } from "lucide-react";
import { cn } from "@/lib/utils";
import { getGradeColor } from "@/lib/constants";
import { getTutorSortName } from "@/components/zen/utils/sessionSorting";
import { SessionStatusTag } from "@/components/ui/session-status-tag";
import { getDisplayStatus } from "@/lib/session-status";
import type { Enrollment } from "@/types";

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

export function EnrollmentDetailPopover({
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
  const { data: allTutors = [] } = useTutors();

  // Filter locations (exclude "Various" placeholder)
  const locations = useMemo(() =>
    allLocations.filter(loc => loc !== "Various"),
  [allLocations]);

  // Action states
  const [markedAsPaid, setMarkedAsPaid] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const [editedDay, setEditedDay] = useState('');
  const [editedTime, setEditedTime] = useState('');
  const [editedLocation, setEditedLocation] = useState('');
  const [editedTutorId, setEditedTutorId] = useState<number | null>(null);
  const [isCustomTime, setIsCustomTime] = useState(false);
  const [scheduleSaved, setScheduleSaved] = useState(false);

  // Filter tutors by selected location
  const filteredTutors = useMemo(() => {
    if (!editedLocation) return [];
    return allTutors
      .filter(t => t.default_location === editedLocation)
      .sort((a, b) => getTutorSortName(a.tutor_name).localeCompare(getTutorSortName(b.tutor_name)));
  }, [allTutors, editedLocation]);

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
  const showMarkAsPaid = isPending && !markedAsPaid;

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
      console.error('Failed to mark as paid:', err);
    } finally {
      setMarkingPaid(false);
    }
  };

  const handleSaveSchedule = () => {
    const selectedTutor = allTutors.find(t => t.id === editedTutorId);
    console.log(`[Demo Mode] Save Schedule clicked for enrollment #${enrollment.id}:`, {
      day: editedDay,
      time: editedTime,
      location: editedLocation,
      tutor_id: editedTutorId,
      tutor_name: selectedTutor?.tutor_name,
    });
    setScheduleSaved(true);
    setIsEditingSchedule(false);
    // In real implementation, this would call the API
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

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        {...getFloatingProps()}
        className={cn(
          "z-[9999]",
          "bg-[#fef9f3] dark:bg-[#2d2618]",
          "border-2 border-[#d4a574] dark:border-[#8b6f47]",
          "rounded-lg shadow-lg",
          "p-4 w-[min(280px,90vw)]",
          "paper-texture"
        )}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          aria-label="Close"
        >
          <X className="h-4 w-4 text-gray-500 dark:text-gray-400" />
        </button>

        {/* Header */}
        <div className="mb-3 pr-6">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">{enrollment.school_student_id || "N/A"}</span>
            <span className="text-[10px] text-gray-400 font-mono">#{enrollment.id}</span>
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
              <span
                className="text-xs px-1.5 py-0.5 rounded text-gray-800"
                style={{ backgroundColor: getGradeColor(enrollment.grade, enrollment.lang_stream) }}
              >
                {enrollment.grade}{enrollment.lang_stream || ''}
              </span>
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
            <div className="space-y-2 p-2 bg-[#fef9f3] dark:bg-[#2d2618] rounded-md border border-[#d4a574] dark:border-[#6b5a4a]">
              {/* Day selector */}
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-gray-500 dark:text-gray-400 w-12">Day:</label>
                <select
                  value={editedDay}
                  onChange={(e) => handleDayChange(e.target.value)}
                  className="flex-1 text-xs px-2 py-1 rounded border border-[#d4a574] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100"
                >
                  <option value="">Unscheduled</option>
                  {DAY_OPTIONS.map(day => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
              </div>

              {/* Time selector - shows dropdown or custom input */}
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-gray-500 dark:text-gray-400 w-12">Time:</label>
                {isCustomTime ? (
                  <div className="flex-1 flex items-center gap-1">
                    <input
                      type="text"
                      value={editedTime}
                      onChange={(e) => setEditedTime(e.target.value)}
                      placeholder="e.g., 10:00 - 11:30"
                      className="flex-1 text-xs px-2 py-1 rounded border border-[#d4a574] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsCustomTime(false);
                        setEditedTime('');
                      }}
                      className="text-[9px] text-[#a0704b] dark:text-[#cd853f] hover:underline whitespace-nowrap"
                    >
                      Back
                    </button>
                  </div>
                ) : (
                  <select
                    value={editedTime}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setIsCustomTime(true);
                        setEditedTime('');
                      } else {
                        setEditedTime(e.target.value);
                      }
                    }}
                    className="flex-1 text-xs px-2 py-1 rounded border border-[#d4a574] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100"
                  >
                    <option value="">Select time...</option>
                    {timeOptions.map(time => (
                      <option key={time} value={time}>{time}</option>
                    ))}
                    <option value="__custom__">Other (custom)...</option>
                  </select>
                )}
              </div>

              {/* Location selector from API */}
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-gray-500 dark:text-gray-400 w-12">Loc:</label>
                <select
                  value={editedLocation}
                  onChange={(e) => handleLocationChange(e.target.value)}
                  className="flex-1 text-xs px-2 py-1 rounded border border-[#d4a574] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100"
                >
                  <option value="">None</option>
                  {locations.map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>

              {/* Tutor selector - filtered by location */}
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-gray-500 dark:text-gray-400 w-12">Tutor:</label>
                <select
                  value={editedTutorId || ''}
                  onChange={(e) => setEditedTutorId(e.target.value ? parseInt(e.target.value) : null)}
                  className="flex-1 text-xs px-2 py-1 rounded border border-[#d4a574] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 disabled:opacity-50"
                  disabled={!editedLocation}
                >
                  <option value="">{editedLocation ? 'Select tutor...' : 'Select location first'}</option>
                  {filteredTutors.map(tutor => (
                    <option key={tutor.id} value={tutor.id}>{tutor.tutor_name}</option>
                  ))}
                </select>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingSchedule(false);
                  }}
                  className="flex-1 text-xs px-2 py-1 rounded border border-[#d4a574] dark:border-[#6b5a4a] text-[#8b6914] dark:text-[#cd853f] hover:bg-[#fef9f3] dark:hover:bg-[#2d2618]"
                >
                  Cancel
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSaveSchedule();
                  }}
                  className="flex-1 text-xs px-2 py-1 rounded bg-[#a0704b] text-white hover:bg-[#8b5e3c]"
                >
                  Save (Demo)
                </button>
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
                    {scheduleSaved && <span className="text-green-600 text-[10px] ml-1">✓</span>}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditingSchedule(true);
                    }}
                    className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                    title="Edit schedule"
                  >
                    <Edit2 className="h-3 w-3 text-gray-400 hover:text-gray-600" />
                  </button>
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
              markedAsPaid
                ? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300"
                : isPending
                  ? "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300"
                  : "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300"
            )}>
              {markedAsPaid ? "Marked as Paid ✓" : enrollment.payment_status}
            </span>
          </div>

          {/* Lessons Paid */}
          {enrollment.lessons_paid !== undefined && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Lessons Paid:</span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">
                {enrollment.lessons_paid}
              </span>
            </div>
          )}

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
                  <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400">
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
                {enrollment.tutor_name}
              </span>
            </div>
          )}
        </div>

        {/* Upcoming Sessions Preview */}
        <div className="py-3 border-t border-[#e8d4b8] dark:border-[#6b5a4a]">
          <div className="flex items-center gap-1 mb-2">
            <CalendarDays className="h-3.5 w-3.5 text-[#a0704b] dark:text-[#cd853f]" />
            <span className="text-[10px] font-bold text-[#a0704b] dark:text-[#cd853f] uppercase tracking-wider">
              Upcoming Sessions
            </span>
          </div>
          {sessionsLoading ? (
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Loading...</span>
            </div>
          ) : upcomingSessions.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No upcoming sessions</p>
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
                  className="flex items-center justify-between text-xs p-1.5 rounded bg-[#f5ede3] dark:bg-[#3d3628] border border-[#e8d4b8] dark:border-[#6b5a4a] hover:bg-[#efe5d7] dark:hover:bg-[#4d4638] transition-colors cursor-pointer"
                >
                  <div className="flex flex-col">
                    <span className="text-gray-700 dark:text-gray-300">
                      {formatSessionDate(session.session_date)}
                    </span>
                    {session.tutor_name && (
                      <span className="text-[10px] text-gray-500 dark:text-gray-400">
                        {session.tutor_name}
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
        <div className="pt-3 border-t border-[#e8d4b8] dark:border-[#6b5a4a] space-y-2">
          {/* Mark as Paid button - only shown for pending payments */}
          {showMarkAsPaid && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleMarkAsPaid();
              }}
              disabled={markingPaid}
              className={cn(
                "w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md",
                "bg-green-600 hover:bg-green-700 text-white transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {markingPaid ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Mark as Paid
            </button>
          )}

          {/* View Details link */}
          <Link
            href={`/enrollments/${enrollment.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onNavigate?.();
              onClose();
            }}
            className={cn(
              "w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md",
              "bg-[#a0704b] hover:bg-[#8a6040] text-white transition-colors"
            )}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View Enrollment Details
          </Link>
        </div>
      </div>
    </FloatingPortal>
  );
}
