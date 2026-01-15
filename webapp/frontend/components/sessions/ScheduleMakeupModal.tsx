"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import useSWR from "swr";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/contexts/ToastContext";
import { useTutors, useHolidays } from "@/lib/hooks";
import { sessionsAPI } from "@/lib/api";
import { updateSessionInCache } from "@/lib/session-cache";
import {
  toDateString,
  getToday,
  isSameDay,
  getMonthCalendarDates,
  getMonthName,
  getPreviousMonth,
  getNextMonth,
  getMonthBounds,
} from "@/lib/calendar-utils";
import { getTutorSortName } from "@/components/zen/utils/sessionSorting";
import { getGradeColor } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Calendar,
  User,
  Users,
  Loader2,
  Check,
  AlertTriangle,
  Sparkles,
  X,
  Settings2,
  RotateCcw,
} from "lucide-react";
import type { Session, MakeupSlotSuggestion, MakeupScoreBreakdown, Tutor } from "@/types";

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Fallback time slots when no sessions exist
const COMMON_TIME_SLOTS = [
  "09:00 - 10:30",
  "10:45 - 12:15",
  "13:00 - 14:30",
  "14:45 - 16:15",
  "16:30 - 18:00",
  "18:15 - 19:45",
];

// Scoring weights for make-up slot suggestions
interface ScoringWeights {
  sameTutor: number;
  sameGrade: number;
  sameSchool: number;
  sameLang: number;
  soonerDate: number;
  moreCapacity: number;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  sameTutor: 100,
  sameGrade: 20,      // Per matching student, capped at ~60
  sameLang: 15,       // Per matching student, capped at ~45 (priority: grade > lang > school)
  sameSchool: 10,     // Per matching student, capped at ~30
  soonerDate: 30,     // Scaled by proximity (0-30 days)
  moreCapacity: 10,   // Per empty spot
};

// Calculate score based on raw data and user-adjustable weights
function calculateScore(breakdown: MakeupScoreBreakdown, weights: ScoringWeights): number {
  let score = 0;
  if (breakdown.is_same_tutor) score += weights.sameTutor;
  score += Math.min(breakdown.matching_grade_count * weights.sameGrade, 60);
  score += Math.min(breakdown.matching_lang_count * weights.sameLang, 45);
  score += Math.min(breakdown.matching_school_count * weights.sameSchool, 30);
  score += weights.soonerDate * Math.max(0, (30 - breakdown.days_away) / 30);
  score += weights.moreCapacity * (8 - breakdown.current_students);
  return Math.round(score);
}

// Helper to convert time string to minutes for sorting
function timeToMinutes(timeStr: string): number {
  const match = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

// Student display component - reduces duplication across 4 locations
interface StudentDisplayProps {
  student: {
    student_name?: string;
    school_student_id?: string;
    grade?: string;
    lang_stream?: string;
    school?: string;
  };
  compact?: boolean; // true = inline badge style (Day Picker), false = list item style (Suggestions/Form)
}

function StudentDisplay({ student, compact = false }: StudentDisplayProps) {
  const name = compact ? student.student_name?.split(' ')[0] : student.student_name;

  const content = (
    <>
      {student.school_student_id && (
        <span className="text-[9px] text-gray-400 font-mono mr-1">{student.school_student_id}</span>
      )}
      <span className={compact ? "" : "text-gray-700 dark:text-gray-300"}>{name}</span>
      {student.grade && (
        <span
          className={cn(compact ? "ml-1 text-[9px] px-1 rounded" : "text-[9px] px-1 py-0.5 rounded text-gray-800")}
          style={{ backgroundColor: getGradeColor(student.grade, student.lang_stream), color: '#374151' }}
        >
          {student.grade}{student.lang_stream || ""}
        </span>
      )}
      {student.school && (
        <span className={cn(
          "rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300",
          compact ? "ml-1 text-[8px] px-1 py-0.5" : "text-[8px] px-1 py-0.5"
        )}>
          {student.school}
        </span>
      )}
    </>
  );

  if (compact) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-gray-600 dark:text-gray-400">
        {content}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      {content}
    </div>
  );
}

// Weight slider component - reduces duplication in weight tuner (6 sliders)
interface WeightSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

function WeightSlider({ label, value, min, max, step, onChange }: WeightSliderProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-[10px] text-gray-600 dark:text-gray-400">{label}</label>
        <span className="text-[10px] font-mono text-[#a0704b]">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#a0704b]"
      />
    </div>
  );
}

interface ScheduleMakeupModalProps {
  session: Session;
  isOpen: boolean;
  onClose: () => void;
  onScheduled?: (makeupSession: Session, originalSession: Session) => void;
}

export function ScheduleMakeupModal({
  session,
  isOpen,
  onClose,
  onScheduled,
}: ScheduleMakeupModalProps) {
  const { showToast } = useToast();
  const { data: tutors } = useTutors();
  const today = getToday();

  // Form state
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>("");
  const [selectedTutorId, setSelectedTutorId] = useState<number | null>(null);
  const [customTimeStart, setCustomTimeStart] = useState("");
  const [customTimeEnd, setCustomTimeEnd] = useState("");
  const [useCustomTime, setUseCustomTime] = useState(false);

  // Calendar state
  const [viewDate, setViewDate] = useState<Date>(today);
  const [showAllTutors, setShowAllTutors] = useState(false);

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null);
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [dayPickerDate, setDayPickerDate] = useState<string | null>(null);

  // Scoring weights state
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS);
  const [showWeightTuner, setShowWeightTuner] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [selectedDayPickerSlot, setSelectedDayPickerSlot] = useState<{
    timeSlot: string;
    tutorId: number;
  } | null>(null);
  const [confirmBooking, setConfirmBooking] = useState<{
    timeSlot: string;
    tutorId: number;
    tutorName: string;
  } | null>(null);
  const [confirmSuggestion, setConfirmSuggestion] = useState<MakeupSlotSuggestion | null>(null);
  const [expandedSlotStudents, setExpandedSlotStudents] = useState<string | null>(null);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [showManualForm, setShowManualForm] = useState(true);
  const [makeupNotes, setMakeupNotes] = useState("");

  // Location is fixed to original session's location
  const location = session.location || "";

  // Fetch suggestions
  const { data: suggestions = [], isLoading: suggestionsLoading } = useSWR(
    isOpen ? [`makeup-suggestions`, session.id] : null,
    async () => {
      return sessionsAPI.getMakeupSuggestions(session.id, { daysAhead: 30, limit: 10 });
    },
    { revalidateOnFocus: false }
  );

  // Sort suggestions by user-adjustable weights
  const sortedSuggestions = useMemo(() => {
    return [...suggestions]
      .map(s => ({
        ...s,
        calculatedScore: calculateScore(s.score_breakdown, weights),
      }))
      .sort((a, b) => b.calculatedScore - a.calculatedScore);
  }, [suggestions, weights]);

  // Fetch holidays for the month
  const monthBounds = getMonthBounds(viewDate);
  const { data: holidays = [] } = useHolidays(
    toDateString(monthBounds.start),
    toDateString(monthBounds.end)
  );
  const holidayDates = useMemo(() => new Set(holidays.map(h => h.holiday_date)), [holidays]);

  // Fetch existing sessions for calendar view
  const { data: existingSessions = [], isLoading: sessionsLoading } = useSWR(
    isOpen ? [`sessions-for-makeup`, toDateString(monthBounds.start), toDateString(monthBounds.end), location] : null,
    async () => {
      return sessionsAPI.getAll({
        from_date: toDateString(monthBounds.start),
        to_date: toDateString(monthBounds.end),
        location,
        limit: 2000,
      });
    },
    { revalidateOnFocus: false }
  );

  // Filter tutors by location
  const filteredTutors = useMemo(() => {
    if (!tutors) return [];
    const filtered = tutors.filter(t => t.default_location === location);
    return [...filtered].sort((a, b) =>
      getTutorSortName(a.tutor_name).localeCompare(getTutorSortName(b.tutor_name))
    );
  }, [tutors, location]);

  // Initialize form with original session's tutor
  useEffect(() => {
    if (isOpen && session.tutor_id) {
      setSelectedTutorId(session.tutor_id);
    }
  }, [isOpen, session.tutor_id]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedDate("");
      setSelectedTimeSlot("");
      setSelectedTutorId(session.tutor_id);
      setCustomTimeStart("");
      setCustomTimeEnd("");
      setUseCustomTime(false);
      setValidationError(null);
      setViewDate(today);
      setShowAllTutors(false);
      setExpandedSuggestion(null);
      setShowDayPicker(false);
      setDayPickerDate(null);
      setWeights(DEFAULT_WEIGHTS);
      setShowWeightTuner(false);
      setShowSuggestions(true);
      setSelectedDayPickerSlot(null);
      setConfirmBooking(null);
      setConfirmSuggestion(null);
      setExpandedSlotStudents(null);
      setShowAllSuggestions(false);
    }
    // eslint-disable-next-line react-hooks-exhaustive-deps
  }, [isOpen, session.tutor_id]);

  // Build sessions by date lookup
  const sessionsByDate = useMemo(() => {
    const map = new Map<string, Session[]>();
    existingSessions.forEach((s) => {
      // Only count active sessions
      if (s.session_status === "Scheduled" || s.session_status === "Make-up Class") {
        const dateKey = s.session_date;
        if (!map.has(dateKey)) map.set(dateKey, []);
        map.get(dateKey)!.push(s);
      }
    });
    return map;
  }, [existingSessions]);

  // Generate calendar grid data
  const calendarData = useMemo(() => {
    const calendarDates = getMonthCalendarDates(viewDate);
    const currentMonth = viewDate.getMonth();

    return calendarDates.map((date) => {
      const dateString = toDateString(date);
      const daySessions = sessionsByDate.get(dateString) || [];
      const dayOfWeek = date.getDay();

      // Filter sessions by selected tutor if not showing all
      const displaySessions = showAllTutors
        ? daySessions
        : daySessions.filter(s => s.tutor_id === selectedTutorId);

      // Calculate availability: group by time slot and tutor, count students vs capacity (8)
      const slotOccupancy = new Map<string, number>(); // "timeSlot-tutorId" -> student count
      displaySessions.forEach(s => {
        const key = `${s.time_slot}-${s.tutor_id}`;
        slotOccupancy.set(key, (slotOccupancy.get(key) || 0) + 1);
      });
      const totalSlots = slotOccupancy.size;
      const totalCapacity = totalSlots * 8;
      const totalStudents = displaySessions.length;
      const availableSpots = totalCapacity - totalStudents;

      return {
        date,
        dateString,
        isCurrentMonth: date.getMonth() === currentMonth,
        isToday: isSameDay(date, today),
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        isHoliday: holidayDates.has(dateString),
        isSelected: dateString === selectedDate,
        sessions: displaySessions,
        sessionCount: displaySessions.length,
        allSessions: daySessions, // Keep all sessions for day picker
        // Availability metrics
        totalSlots,
        totalCapacity,
        totalStudents,
        availableSpots,
      };
    });
  }, [viewDate, sessionsByDate, today, holidayDates, selectedDate, showAllTutors, selectedTutorId]);

  // Get the effective time slot
  const effectiveTimeSlot = useCustomTime
    ? `${customTimeStart} - ${customTimeEnd}`
    : selectedTimeSlot;

  // Validate custom time (end must be after start)
  const isCustomTimeValid = !useCustomTime || (
    customTimeStart && customTimeEnd && timeToMinutes(customTimeEnd) > timeToMinutes(customTimeStart)
  );

  // Dynamic time slots based on selected date
  const availableTimeSlots = useMemo(() => {
    if (!selectedDate) return COMMON_TIME_SLOTS;

    const daySessions = sessionsByDate.get(selectedDate) || [];
    const slots = new Set<string>();

    // Get unique time slots from actual sessions
    daySessions.forEach(s => {
      if (s.time_slot) slots.add(s.time_slot);
    });

    if (slots.size === 0) return COMMON_TIME_SLOTS;

    // Sort chronologically
    return Array.from(slots).sort((a, b) => {
      const aMin = timeToMinutes(a.split(' - ')[0]);
      const bMin = timeToMinutes(b.split(' - ')[0]);
      return aMin - bMin;
    });
  }, [selectedDate, sessionsByDate]);

  // Validate form
  const validateForm = useCallback(() => {
    if (!selectedDate) return "Please select a date";
    if (!effectiveTimeSlot || effectiveTimeSlot === " - ") return "Please select a time slot";
    if (!selectedTutorId) return "Please select a tutor";
    if (holidayDates.has(selectedDate)) return "Cannot schedule on a holiday";
    return null;
  }, [selectedDate, effectiveTimeSlot, selectedTutorId, holidayDates]);

  // Unified booking function
  const bookMakeup = async (params: {
    session_date: string;
    time_slot: string;
    tutor_id: number;
    location: string;
    notes?: string;
  }) => {
    setIsSaving(true);
    setValidationError(null);

    try {
      // Include notes if provided
      const requestParams = {
        ...params,
        notes: makeupNotes.trim() || undefined,
      };
      const response = await sessionsAPI.scheduleMakeup(session.id, requestParams);
      updateSessionInCache(response.original_session);
      updateSessionInCache(response.makeup_session);
      showToast("Make-up class scheduled successfully", "success");
      onScheduled?.(response.makeup_session, response.original_session);
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to schedule make-up";
      setValidationError(message);
      showToast(message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle manual schedule from form
  const handleSchedule = async () => {
    const error = validateForm();
    if (error) {
      setValidationError(error);
      return;
    }
    await bookMakeup({
      session_date: selectedDate,
      time_slot: effectiveTimeSlot,
      tutor_id: selectedTutorId!,
      location,
    });
  };

  // Navigation handlers
  const goToPreviousMonth = () => setViewDate(getPreviousMonth(viewDate));
  const goToNextMonth = () => setViewDate(getNextMonth(viewDate));
  const goToToday = () => setViewDate(today);

  // Handle date click - now opens day picker
  const handleDateClick = (dateString: string, isHoliday: boolean, sessionCount: number) => {
    if (isHoliday) {
      setValidationError("Cannot schedule on a holiday");
      return;
    }
    setValidationError(null);

    // Always set the selected date (for visual feedback and form field)
    setSelectedDate(dateString);
    setSelectedTimeSlot("");

    // If there are sessions, also open day picker
    if (sessionCount > 0) {
      setDayPickerDate(dateString);
      setShowDayPicker(true);
    }
  };

  // Handle slot selection from day picker
  const handleSlotSelect = (dateString: string, timeSlot: string, tutorId: number) => {
    setSelectedDate(dateString);
    setSelectedTimeSlot(timeSlot);
    setSelectedTutorId(tutorId);
    setShowDayPicker(false);
    setDayPickerDate(null);
    setUseCustomTime(false);
  };

  // Get students in selected slot
  const studentsInSlot = useMemo(() => {
    if (!selectedDate || !effectiveTimeSlot || !selectedTutorId) return [];
    const daySessions = sessionsByDate.get(selectedDate) || [];
    return daySessions
      .filter(s =>
        s.tutor_id === selectedTutorId &&
        s.time_slot === effectiveTimeSlot &&
        (s.session_status === "Scheduled" || s.session_status === "Make-up Class")
      )
      .map(s => ({
        student_name: s.student_name || "Unknown",
        school_student_id: s.school_student_id,
        grade: s.grade,
        school: s.school,
        lang_stream: s.lang_stream,
      }));
  }, [selectedDate, effectiveTimeSlot, selectedTutorId, sessionsByDate]);

  // Get grouped slots for day picker
  const dayPickerSlots = useMemo(() => {
    if (!dayPickerDate) return [];

    const allDaySessions = sessionsByDate.get(dayPickerDate) || [];

    // Filter by tutor if "Show all tutors" is unchecked
    const daySessions = showAllTutors
      ? allDaySessions
      : allDaySessions.filter(s => s.tutor_id === selectedTutorId);

    // Group by time slot, then by tutor
    const slotMap = new Map<string, Map<number, { tutor: Tutor | undefined; sessions: Session[] }>>();

    daySessions.forEach(s => {
      if (!s.time_slot) return;

      if (!slotMap.has(s.time_slot)) {
        slotMap.set(s.time_slot, new Map());
      }

      const tutorMap = slotMap.get(s.time_slot)!;
      if (!tutorMap.has(s.tutor_id || 0)) {
        tutorMap.set(s.tutor_id || 0, {
          tutor: tutors?.find(t => t.id === s.tutor_id),
          sessions: [],
        });
      }
      tutorMap.get(s.tutor_id || 0)!.sessions.push(s);
    });

    // Convert to sorted array
    const result: Array<{
      timeSlot: string;
      tutors: Array<{
        tutorId: number;
        tutorName: string;
        studentCount: number;
        sessions: Session[];
      }>;
    }> = [];

    Array.from(slotMap.entries())
      .sort((a, b) => timeToMinutes(a[0].split(' - ')[0]) - timeToMinutes(b[0].split(' - ')[0]))
      .forEach(([timeSlot, tutorMap]) => {
        const tutorEntries = Array.from(tutorMap.entries())
          .sort((a, b) => {
            const nameA = a[1].tutor?.tutor_name || '';
            const nameB = b[1].tutor?.tutor_name || '';
            return getTutorSortName(nameA).localeCompare(getTutorSortName(nameB));
          })
          .map(([tutorId, data]) => ({
            tutorId,
            tutorName: data.tutor?.tutor_name || 'Unknown Tutor',
            studentCount: data.sessions.length,
            // Sort sessions by compatibility with original student (grade > lang > school)
            sessions: data.sessions.slice().sort((a, b) => {
              const scoreA = (a.grade === session.grade ? 4 : 0) +
                             (a.lang_stream === session.lang_stream ? 2 : 0) +
                             (a.school === session.school ? 1 : 0);
              const scoreB = (b.grade === session.grade ? 4 : 0) +
                             (b.lang_stream === session.lang_stream ? 2 : 0) +
                             (b.school === session.school ? 1 : 0);
              return scoreB - scoreA;
            }),
          }));

        result.push({ timeSlot, tutors: tutorEntries });
      });

    return result;
  }, [dayPickerDate, sessionsByDate, tutors, showAllTutors, selectedTutorId, session.grade, session.lang_stream, session.school]);

  // Toggle suggestion expansion
  const toggleSuggestion = (key: string) => {
    setExpandedSuggestion(prev => prev === key ? null : key);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-[#a0704b] dark:text-[#cd853f]" />
          <span>Schedule Make-up Class</span>
        </div>
      }
      size="xl"
      persistent={isSaving}
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSchedule} disabled={isSaving || !selectedDate || !effectiveTimeSlot || !selectedTutorId || !isCustomTimeValid}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Scheduling...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Schedule Make-up
              </>
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Original Session Info - Compact sticky bar */}
        <div className="sticky -top-4 z-20 -mx-4 px-4 -mt-4 pt-4 pb-2 bg-[#fef9f3] dark:bg-[#2d2618] border-b border-[#e8d4b8] dark:border-[#6b5a4a] flex items-center gap-2 text-xs flex-wrap">
          <User className="h-3.5 w-3.5 text-[#a0704b] flex-shrink-0" />
          <span className="font-medium text-[#5d4e37] dark:text-[#e8d4b8]">{session.student_name}</span>
          {session.grade && (
            <span
              className="text-[9px] px-1 py-0.5 rounded text-gray-800"
              style={{ backgroundColor: getGradeColor(session.grade, session.lang_stream) }}
            >
              {session.grade}{session.lang_stream || ""}
            </span>
          )}
          <span className="text-gray-400">|</span>
          <span className="text-gray-600 dark:text-gray-400">{session.session_date}</span>
          <span className="text-gray-400">|</span>
          <span className="text-gray-600 dark:text-gray-400">{session.time_slot}</span>
          <span className="text-gray-400">|</span>
          <span className="text-gray-600 dark:text-gray-400">{session.location}</span>
          {session.tutor_name && (
            <>
              <span className="text-gray-400">|</span>
              <span className="text-gray-600 dark:text-gray-400">{session.tutor_name}</span>
            </>
          )}
          <span className="text-gray-400">|</span>
          <span className="text-orange-600 dark:text-orange-400">{session.session_status}</span>
        </div>

        {/* Optional Notes Field */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={makeupNotes}
            onChange={(e) => setMakeupNotes(e.target.value)}
            placeholder="Reason for make-up (optional)"
            maxLength={500}
            className="flex-1 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 placeholder:text-gray-400"
          />
        </div>

        {/* Validation Error */}
        {validationError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Smart Suggestions */}
        <div className="bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden">
          {/* Header - Entire row is clickable */}
          <div
            onClick={() => setShowSuggestions(!showSuggestions)}
            className={cn(
              "flex items-center justify-between px-3 py-2.5 cursor-pointer transition-colors",
              "hover:bg-[#fef9f3] dark:hover:bg-[#2d2618]",
              showSuggestions && "border-b border-[#e8d4b8] dark:border-[#6b5a4a]"
            )}
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-[#8b6f47] dark:text-[#cd853f]">
              {showSuggestions ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              <Sparkles className="h-3.5 w-3.5" />
              SMART SUGGESTIONS
              {!showSuggestions && sortedSuggestions.length > 0 && (
                <span className="text-[10px] font-normal text-gray-500">({sortedSuggestions.length} available)</span>
              )}
            </div>
            {showSuggestions && (
              <div className="flex items-center gap-1.5">
                {/* Quick Book Best Suggestion */}
                {sortedSuggestions.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmSuggestion(sortedSuggestions[0]);
                    }}
                    disabled={isSaving}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" />
                    Quick Book
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowWeightTuner(!showWeightTuner);
                  }}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors",
                    showWeightTuner
                      ? "bg-[#a0704b] text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  )}
                >
                  <Settings2 className="h-3 w-3" />
                  Tune
                </button>
              </div>
            )}
          </div>

          {/* Collapsible Content */}
          {showSuggestions && (
            <div className="p-3">
              {/* Weight Tuner Panel */}
              {showWeightTuner && (
            <div className="mb-3 p-3 bg-[#fef9f3] dark:bg-[#2d2618] rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-[#8b6f47] dark:text-[#cd853f]">
                  SCORING WEIGHTS
                </span>
                <button
                  onClick={() => setWeights(DEFAULT_WEIGHTS)}
                  className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-[#a0704b] transition-colors"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </button>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <WeightSlider label="Same Tutor" value={weights.sameTutor} min={0} max={200} step={10}
                  onChange={(v) => setWeights(w => ({ ...w, sameTutor: v }))} />
                <WeightSlider label="Same Grade (per student)" value={weights.sameGrade} min={0} max={50} step={5}
                  onChange={(v) => setWeights(w => ({ ...w, sameGrade: v }))} />
                <WeightSlider label="Same Lang (per student)" value={weights.sameLang} min={0} max={50} step={5}
                  onChange={(v) => setWeights(w => ({ ...w, sameLang: v }))} />
                <WeightSlider label="Same School (per student)" value={weights.sameSchool} min={0} max={50} step={5}
                  onChange={(v) => setWeights(w => ({ ...w, sameSchool: v }))} />
                <WeightSlider label="Sooner Date" value={weights.soonerDate} min={0} max={100} step={5}
                  onChange={(v) => setWeights(w => ({ ...w, soonerDate: v }))} />
                <WeightSlider label="More Capacity (per spot)" value={weights.moreCapacity} min={0} max={30} step={2}
                  onChange={(v) => setWeights(w => ({ ...w, moreCapacity: v }))} />
              </div>
              <div className="mt-2 pt-2 border-t border-[#e8d4b8] dark:border-[#6b5a4a] text-[9px] text-gray-500 dark:text-gray-400">
                Adjust weights to prioritize different factors. Suggestions re-sort instantly.
              </div>
              </div>
              )}
              {suggestionsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-[#a0704b]" />
                  <span className="ml-2 text-sm text-gray-500">Loading suggestions...</span>
                </div>
              ) : sortedSuggestions.length === 0 ? (
                <div className="text-sm text-gray-500 py-2">
                  No available slots found. Use the calendar below to select a date manually.
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
              {(showAllSuggestions ? sortedSuggestions : sortedSuggestions.slice(0, 5)).map((suggestion) => {
                const suggestionKey = `${suggestion.session_date}-${suggestion.time_slot}-${suggestion.tutor_id}`;
                const isExpanded = expandedSuggestion === suggestionKey;
                const breakdown = suggestion.score_breakdown;

                return (
                  <div
                    key={suggestionKey}
                    className="bg-[#fef9f3] dark:bg-[#2d2618] rounded-lg overflow-hidden transition-all"
                  >
                    {/* Suggestion Header - Clickable */}
                    <div
                      onClick={() => toggleSuggestion(suggestionKey)}
                      className="flex items-center justify-between gap-3 p-2 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] cursor-pointer transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-[#5d4e37] dark:text-[#e8d4b8]">
                            {new Date(suggestion.session_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </span>
                          <span className="text-xs text-gray-500">{suggestion.time_slot}</span>
                          <span className="text-xs text-gray-500">•</span>
                          <span className="text-xs text-[#8b6f47] dark:text-[#cd853f]">{suggestion.tutor_name}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-gray-500">
                            {suggestion.current_students}/8 students
                          </span>
                          <span
                            className="text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded"
                          >
                            Score: {suggestion.calculatedScore}
                          </span>
                          {breakdown.is_same_tutor && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
                              Same tutor
                            </span>
                          )}
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      )}
                    </div>

                    {/* Expanded Content - Students List */}
                    {isExpanded && (
                      <div className="px-3 pb-3 border-t border-[#e8d4b8] dark:border-[#6b5a4a]">
                        {/* Score Breakdown */}
                        <div className="mt-2 mb-3 p-2 bg-white/50 dark:bg-black/20 rounded text-[10px] text-gray-600 dark:text-gray-400">
                          <div className="font-medium mb-1">Score Breakdown (Total: {suggestion.calculatedScore}):</div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                            {breakdown.is_same_tutor && (
                              <span>Same tutor: +{weights.sameTutor}</span>
                            )}
                            {breakdown.matching_grade_count > 0 && (
                              <span>Same grade ({breakdown.matching_grade_count}): +{Math.min(breakdown.matching_grade_count * weights.sameGrade, 60)}</span>
                            )}
                            {breakdown.matching_lang_count > 0 && (
                              <span>Same lang ({breakdown.matching_lang_count}): +{Math.min(breakdown.matching_lang_count * weights.sameLang, 45)}</span>
                            )}
                            {breakdown.matching_school_count > 0 && (
                              <span>Same school ({breakdown.matching_school_count}): +{Math.min(breakdown.matching_school_count * weights.sameSchool, 30)}</span>
                            )}
                            <span>Sooner date ({breakdown.days_away}d): +{Math.round(weights.soonerDate * Math.max(0, (30 - breakdown.days_away) / 30))}</span>
                            <span>Capacity ({8 - breakdown.current_students} spots): +{weights.moreCapacity * (8 - breakdown.current_students)}</span>
                          </div>
                        </div>

                        {/* Students in Slot */}
                        <div className="text-xs font-medium text-[#8b6f47] dark:text-[#cd853f] mb-1.5">
                          Students in this slot:
                        </div>
                        {suggestion.students_in_slot.length === 0 ? (
                          <div className="text-xs text-gray-500 italic">No students yet (empty slot)</div>
                        ) : (
                          <div className="space-y-1 mb-3">
                            {suggestion.students_in_slot.map((student, idx) => (
                              <StudentDisplay key={idx} student={student} />
                            ))}
                          </div>
                        )}

                        {/* Book Button */}
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmSuggestion(suggestion);
                          }}
                          disabled={isSaving}
                          className="w-full h-8 text-xs"
                        >
                          {isSaving ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <Check className="h-3 w-3 mr-1" />
                          )}
                          Book This Slot
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
                  {sortedSuggestions.length > 5 && (
                    <button
                      onClick={() => setShowAllSuggestions(!showAllSuggestions)}
                      className="w-full py-2 text-xs text-[#a0704b] hover:text-[#8b5d3b] hover:underline transition-colors"
                    >
                      {showAllSuggestions ? `Show less` : `Show ${sortedSuggestions.length - 5} more suggestions`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Calendar and Form */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Calendar */}
          <div className="bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden">
            {/* Month navigation */}
            <div className="flex items-center justify-between px-3 py-2 bg-[#fef9f3] dark:bg-[#2d2618] border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
              <Button variant="ghost" size="sm" onClick={goToPreviousMonth} className="h-7 px-2">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={goToToday} className="h-6 px-2 text-xs">
                  Today
                </Button>
                <span className="font-semibold text-sm text-[#5d4e37] dark:text-[#e8d4b8]">
                  {getMonthName(viewDate)} {viewDate.getFullYear()}
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={goToNextMonth} className="h-7 px-2">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Toggle - affects both calendar and day picker */}
            <div className="px-3 py-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAllTutors}
                  onChange={(e) => setShowAllTutors(e.target.checked)}
                  className="rounded border-gray-300 accent-[#a0704b]"
                />
                <span className="text-gray-700 dark:text-gray-300">Show all tutors</span>
                <span className="text-[10px] text-gray-400">(calendar + time slots)</span>
              </label>
            </div>

            {/* Loading state */}
            {sessionsLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-[#a0704b]" />
              </div>
            )}

            {/* Calendar grid */}
            {!sessionsLoading && (
              <>
                {/* Weekday headers */}
                <div className="grid grid-cols-7 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
                  {WEEKDAY_NAMES.map((day, idx) => (
                    <div
                      key={day}
                      className={cn(
                        "py-1 px-0.5 text-center text-[10px] font-semibold bg-[#fef9f3] dark:bg-[#2d2618]",
                        idx > 0 && "border-l border-[#e8d4b8] dark:border-[#6b5a4a]",
                        (idx === 0 || idx === 6) && "text-[#a0704b]/70 dark:text-[#cd853f]/70"
                      )}
                    >
                      {day}
                    </div>
                  ))}
                </div>

                {/* Days grid */}
                <div className="grid grid-cols-7">
                  {calendarData.map((dayData) => {
                    const dayOfWeek = dayData.date.getDay();
                    const isFirstCol = dayOfWeek === 0;

                    return (
                      <div
                        key={dayData.dateString}
                        onClick={() => handleDateClick(dayData.dateString, dayData.isHoliday, dayData.allSessions.length)}
                        className={cn(
                          "p-1 min-h-[50px] border-b border-[#e8d4b8] dark:border-[#6b5a4a] transition-colors cursor-pointer",
                          !isFirstCol && "border-l",
                          !dayData.isCurrentMonth && "bg-gray-50 dark:bg-[#1f1f1f] opacity-40",
                          dayData.isHoliday && "bg-rose-50 dark:bg-rose-900/10 cursor-not-allowed",
                          dayData.isSelected && "ring-2 ring-inset ring-[#a0704b] dark:ring-[#cd853f] bg-[#f5ede3] dark:bg-[#3d3628]",
                          !dayData.isSelected && !dayData.isHoliday && dayData.isCurrentMonth && "hover:bg-[#fef9f3] dark:hover:bg-[#2d2618]",
                          dayData.isToday && "ring-1 ring-inset ring-blue-400"
                        )}
                      >
                        <div className={cn(
                          "text-[10px] font-semibold",
                          dayData.isToday && "text-blue-500",
                          dayData.isHoliday && "text-rose-500",
                          !dayData.isToday && !dayData.isHoliday && dayData.isCurrentMonth && "text-[#5d4e37] dark:text-[#e8d4b8]"
                        )}>
                          {dayData.date.getDate()}
                        </div>
                        {dayData.totalSlots > 0 && (() => {
                          const utilization = dayData.totalStudents / dayData.totalCapacity;
                          return (
                            <div className={cn(
                              "text-[9px]",
                              utilization < 0.5 ? "text-green-600 dark:text-green-400" :
                              utilization < 0.8 ? "text-[#8b6f47] dark:text-[#cd853f]" :
                              "text-red-500 dark:text-red-400"
                            )}>
                              {dayData.totalStudents}/{dayData.totalCapacity}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Form Fields - Collapsible */}
          <div className="space-y-3">
            {/* Section Header - Custom Time/Tutor Selection */}
            <div
              onClick={() => setShowManualForm(!showManualForm)}
              className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-800 dark:hover:text-gray-200 transition-colors py-1"
            >
              {showManualForm ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span>CUSTOM TIME & TUTOR</span>
              {!showManualForm && selectedDate && effectiveTimeSlot && (
                <span className="font-normal text-gray-400">
                  — {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} • {effectiveTimeSlot}
                </span>
              )}
            </div>

            {showManualForm && (
              <>
            {/* Date (read-only display) */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Selected Date
              </label>
              <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-sm">
                {selectedDate ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : "Click a date on the calendar"}
              </div>
              {selectedDate === session.session_date && (
                <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                  Note: Same day as original session
                </p>
              )}
            </div>

            {/* Time Slot */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Time Slot
              </label>
              {!useCustomTime ? (
                <div className="space-y-2">
                  <select
                    value={selectedTimeSlot}
                    onChange={(e) => setSelectedTimeSlot(e.target.value)}
                    disabled={!selectedDate}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">{selectedDate ? "Select time slot" : "Select a date first"}</option>
                    {selectedDate && availableTimeSlots.map((slot) => (
                      <option key={slot} value={slot}>{slot}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setUseCustomTime(true)}
                    disabled={!selectedDate}
                    className="text-xs text-[#a0704b] hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Use custom time
                  </button>
                </div>
              ) : (() => {
                const startMins = timeToMinutes(customTimeStart);
                const endMins = timeToMinutes(customTimeEnd);
                const isInvalid = customTimeStart && customTimeEnd && endMins <= startMins;
                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={customTimeStart}
                        onChange={(e) => setCustomTimeStart(e.target.value)}
                        className={cn(
                          "flex-1 px-3 py-2 border rounded-md text-sm bg-white dark:bg-gray-800",
                          isInvalid ? "border-red-400" : "border-gray-200 dark:border-gray-700"
                        )}
                      />
                      <span className="text-gray-500">to</span>
                      <input
                        type="time"
                        value={customTimeEnd}
                        onChange={(e) => setCustomTimeEnd(e.target.value)}
                        className={cn(
                          "flex-1 px-3 py-2 border rounded-md text-sm bg-white dark:bg-gray-800",
                          isInvalid ? "border-red-400" : "border-gray-200 dark:border-gray-700"
                        )}
                      />
                    </div>
                    {isInvalid && (
                      <p className="text-xs text-red-500">End time must be after start time</p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setUseCustomTime(false);
                        setCustomTimeStart("");
                        setCustomTimeEnd("");
                      }}
                      className="text-xs text-[#a0704b] hover:underline"
                    >
                      Use preset times
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* Tutor */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tutor
              </label>
              <select
                value={selectedTutorId || ""}
                onChange={(e) => setSelectedTutorId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-800"
              >
                <option value="">Select tutor</option>
                {filteredTutors.map((tutor) => (
                  <option key={tutor.id} value={tutor.id}>
                    {tutor.tutor_name}
                    {tutor.id === session.tutor_id ? " (Original)" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Location (read-only) */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Location
              </label>
              <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-sm text-gray-600 dark:text-gray-400">
                {location || "No location set"}
              </div>
            </div>

            {/* Students in Slot Preview */}
            {studentsInSlot.length > 0 && (
              <div className="bg-[#fef9f3] dark:bg-[#2d2618] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#8b6f47] dark:text-[#cd853f] mb-2">
                  <Users className="h-3.5 w-3.5" />
                  STUDENTS IN THIS SLOT ({studentsInSlot.length}/8)
                </div>
                <div className="space-y-1">
                  {studentsInSlot.map((student, idx) => (
                    <StudentDisplay key={idx} student={student} />
                  ))}
                </div>
              </div>
            )}

            {/* Slot capacity warning */}
            {studentsInSlot.length >= 8 && (
              <div className="flex items-center gap-2 text-xs text-red-500">
                <AlertTriangle className="h-3.5 w-3.5" />
                This slot is full (8 students)
              </div>
            )}
              </>
            )}

            {/* Schedule Button */}
            <Button
              onClick={handleSchedule}
              disabled={isSaving || !selectedDate || (!selectedTimeSlot && !useCustomTime) || !selectedTutorId || !isCustomTimeValid}
              className="w-full"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Scheduling...
                </>
              ) : (
                <>
                  <Calendar className="h-4 w-4 mr-2" />
                  Schedule Make-up Class
                </>
              )}
            </Button>
          </div>

          {/* Time Slots Panel - Shows available slots for selected date */}
          {showDayPicker && dayPickerDate && (
            <div className="lg:col-span-2 bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden">
              {/* Header - Fixed outside scroll */}
              <div className="flex items-center justify-between px-3 py-2.5 bg-[#a0704b] dark:bg-[#8b6f47]">
                <span className="text-xs font-semibold text-white">
                  {new Date(dayPickerDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </span>
                <button
                  onClick={() => {
                    setShowDayPicker(false);
                    setDayPickerDate(null);
                    setSelectedDayPickerSlot(null);
                  }}
                  className="p-1 hover:bg-white/20 rounded transition-colors"
                >
                  <X className="h-3.5 w-3.5 text-white" />
                </button>
              </div>

              {/* Time Slots - Scrollable with more height */}
              <div className="max-h-[350px] overflow-y-auto p-2 space-y-2 bg-gray-50 dark:bg-[#252525]">
                  {dayPickerSlots.length === 0 ? (
                    <div className="text-xs text-gray-500 text-center py-4">
                      No sessions on this day. Select anyway to use a custom time slot.
                    </div>
                  ) : (
                    dayPickerSlots.map(({ timeSlot, tutors: slotTutors }) => (
                      <div key={timeSlot} className="space-y-1.5">
                        {/* Time Slot Header */}
                        <div className="sticky top-0 z-10 text-[10px] font-bold text-[#8b6f47] dark:text-[#cd853f] uppercase tracking-wide border-b border-[#e8d4b8] dark:border-[#6b5a4a] pb-1 pt-2 -mt-2 bg-gray-50 dark:bg-[#252525] shadow-[0_-4px_0_0] shadow-gray-50 dark:shadow-[#252525]">
                          {timeSlot}
                        </div>

                        {/* Tutors in this slot */}
                        {slotTutors.map(({ tutorId, tutorName, studentCount, sessions }) => {
                          const isSelected = selectedDayPickerSlot?.timeSlot === timeSlot && selectedDayPickerSlot?.tutorId === tutorId;
                          const isFull = studentCount >= 8;

                          return (
                            <div
                              key={`${timeSlot}-${tutorId}`}
                              className={cn(
                                "rounded-lg overflow-hidden transition-all",
                                isSelected
                                  ? "ring-2 ring-[#a0704b] dark:ring-[#cd853f] bg-white dark:bg-[#1a1a1a]"
                                  : "bg-white dark:bg-[#1a1a1a]"
                              )}
                            >
                              {/* Tutor Row */}
                              <div
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedDayPickerSlot(null);
                                  } else {
                                    setSelectedDayPickerSlot({ timeSlot, tutorId });
                                  }
                                }}
                                className={cn(
                                  "flex items-center gap-2 p-2.5 cursor-pointer transition-colors",
                                  isSelected
                                    ? "bg-[#fef9f3] dark:bg-[#2d2618]"
                                    : "hover:bg-[#fef9f3] dark:hover:bg-[#2d2618]"
                                )}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-medium text-[#5d4e37] dark:text-[#e8d4b8]">
                                      {tutorName}
                                    </span>
                                    <span className={cn(
                                      "text-[10px] px-1.5 py-0.5 rounded",
                                      isFull
                                        ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                                        : "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                                    )}>
                                      {studentCount}/8
                                    </span>
                                  </div>
                                  {/* Show students - simplified */}
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {sessions.slice(0, 3).map((s, i) => (
                                      <StudentDisplay key={i} student={s} compact />
                                    ))}
                                    {sessions.length > 3 && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const slotKey = `${timeSlot}-${tutorId}`;
                                          setExpandedSlotStudents(prev => prev === slotKey ? null : slotKey);
                                        }}
                                        className="text-[10px] px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-500 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                                      >
                                        {expandedSlotStudents === `${timeSlot}-${tutorId}` ? "Show less" : `+${sessions.length - 3}`}
                                      </button>
                                    )}
                                  </div>
                                  {/* Expanded student list */}
                                  {expandedSlotStudents === `${timeSlot}-${tutorId}` && sessions.length > 3 && (
                                    <div className="flex flex-wrap gap-1 mt-1.5 pt-1.5 border-t border-gray-200 dark:border-gray-700">
                                      {sessions.slice(3).map((s, i) => (
                                        <StudentDisplay key={i} student={s} compact />
                                      ))}
                                    </div>
                                  )}
                                </div>
                                {isSelected ? (
                                  <ChevronDown className="h-4 w-4 text-[#a0704b] dark:text-[#cd853f]" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-gray-400" />
                                )}
                              </div>

                              {/* Book Button - Shown when selected */}
                              {isSelected && (
                                <div className="px-2.5 pb-2.5 border-t border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#fef9f3] dark:bg-[#2d2618]">
                                  <Button
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmBooking({ timeSlot, tutorId, tutorName });
                                    }}
                                    disabled={isSaving || isFull}
                                    className="w-full mt-2 h-8 text-xs"
                                  >
                                    {isSaving ? (
                                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                    ) : (
                                      <Check className="h-3 w-3 mr-1" />
                                    )}
                                    {isFull ? "Slot is Full" : "Book This Slot"}
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
        </div>
      </div>

      {/* Confirm Booking Dialog - Time Slots */}
      <ConfirmDialog
        isOpen={!!confirmBooking}
        onConfirm={() => {
          if (dayPickerDate && confirmBooking) {
            bookMakeup({
              session_date: dayPickerDate,
              time_slot: confirmBooking.timeSlot,
              tutor_id: confirmBooking.tutorId,
              location,
            });
          }
          setConfirmBooking(null);
        }}
        onCancel={() => setConfirmBooking(null)}
        title="Confirm Make-up Booking"
        message={`Book make-up class on ${dayPickerDate ? new Date(dayPickerDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''} at ${confirmBooking?.timeSlot || ''} with ${confirmBooking?.tutorName || ''}?`}
        confirmText="Book"
        variant="default"
        loading={isSaving}
      />

      {/* Confirm Booking Dialog - Smart Suggestions */}
      <ConfirmDialog
        isOpen={!!confirmSuggestion}
        onConfirm={() => {
          if (confirmSuggestion) {
            bookMakeup({
              session_date: confirmSuggestion.session_date,
              time_slot: confirmSuggestion.time_slot,
              tutor_id: confirmSuggestion.tutor_id,
              location: confirmSuggestion.location,
            });
          }
          setConfirmSuggestion(null);
        }}
        onCancel={() => setConfirmSuggestion(null)}
        title="Confirm Make-up Booking"
        message={`Book make-up class on ${confirmSuggestion ? new Date(confirmSuggestion.session_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''} at ${confirmSuggestion?.time_slot || ''} with ${confirmSuggestion?.tutor_name || ''}?`}
        confirmText="Book"
        variant="default"
        loading={isSaving}
      />
    </Modal>
  );
}

export default ScheduleMakeupModal;
