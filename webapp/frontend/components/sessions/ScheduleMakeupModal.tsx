"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import useSWR, { mutate } from "swr";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveTutors, useHolidays, useEnrollment, useStudentEnrollments } from "@/lib/hooks";
import { sessionsAPI, proposalsAPI, extensionRequestsAPI } from "@/lib/api";
import { updateSessionInCache, addSessionToCache, removeSessionFromCache } from "@/lib/session-cache";
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
import { getGradeColor, DAY_NAMES, WEEKDAY_TIME_SLOTS, WEEKEND_TIME_SLOTS } from "@/lib/constants";
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
  Send,
  Plus,
  Trash2,
  MessageSquare,
  Clock,
} from "lucide-react";
import type { Session, MakeupSlotSuggestion, MakeupScoreBreakdown, Tutor, MakeupProposalSlotCreate } from "@/types";
import { ExtensionRequestModal } from "./ExtensionRequestModal";

// Interface for enrollment deadline exceeded error
interface DeadlineExceededError {
  effective_end_date: string;
  enrollment_id: number;
  session_id: number;
}

// Time slot constants imported from @/lib/constants

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
  // Caps scale proportionally: weight * 3 (e.g., default 20 * 3 = 60)
  score += Math.min(breakdown.matching_grade_count * weights.sameGrade, weights.sameGrade * 3);
  score += Math.min(breakdown.matching_lang_count * weights.sameLang, weights.sameLang * 3);
  score += Math.min(breakdown.matching_school_count * weights.sameSchool, weights.sameSchool * 3);
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

// Memoized suggestion card to prevent re-renders when weights change
interface SuggestionCardProps {
  suggestion: MakeupSlotSuggestion & { calculatedScore: number };
  isExpanded: boolean;
  onToggle: () => void;
  onBook: () => void;
  onAddToProposal?: () => void;
  mode: "book" | "propose";
  canAddMore: boolean;
  weights: ScoringWeights;
  originalStudent: { grade?: string; lang_stream?: string; school?: string };
  isSaving: boolean;
  isPastDeadline?: boolean;
  is60DayExceeded?: boolean;
  isSuperAdmin?: boolean;
  hasApprovedExtension?: boolean;
  onRequestExtension?: () => void;
}

const SuggestionCard = React.memo(function SuggestionCard({
  suggestion,
  isExpanded,
  onToggle,
  onBook,
  onAddToProposal,
  mode,
  canAddMore,
  weights,
  originalStudent,
  isSaving,
  isPastDeadline,
  is60DayExceeded,
  isSuperAdmin,
  hasApprovedExtension,
  onRequestExtension,
}: SuggestionCardProps) {
  const breakdown = suggestion.score_breakdown;

  // Sort students by compatibility with original student (grade > lang > school)
  const sortedStudents = useMemo(() =>
    [...suggestion.students_in_slot].sort((a, b) => {
      const scoreA = (a.grade === originalStudent.grade ? 4 : 0) +
                     (a.lang_stream === originalStudent.lang_stream ? 2 : 0) +
                     (a.school === originalStudent.school ? 1 : 0);
      const scoreB = (b.grade === originalStudent.grade ? 4 : 0) +
                     (b.lang_stream === originalStudent.lang_stream ? 2 : 0) +
                     (b.school === originalStudent.school ? 1 : 0);
      return scoreB - scoreA;
    }),
    [suggestion.students_in_slot, originalStudent]
  );

  return (
    <div className="bg-[#fef9f3] dark:bg-[#2d2618] rounded-lg overflow-hidden transition-all">
      {/* Suggestion Header - Clickable */}
      <div
        onClick={onToggle}
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
            <span className="text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded">
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
              <span>Same tutor: +{breakdown.is_same_tutor ? weights.sameTutor : 0}</span>
              <span>Same grade ({breakdown.matching_grade_count}): +{Math.min(breakdown.matching_grade_count * weights.sameGrade, weights.sameGrade * 3)}</span>
              <span>Same lang ({breakdown.matching_lang_count}): +{Math.min(breakdown.matching_lang_count * weights.sameLang, weights.sameLang * 3)}</span>
              <span>Same school ({breakdown.matching_school_count}): +{Math.min(breakdown.matching_school_count * weights.sameSchool, weights.sameSchool * 3)}</span>
              <span>Sooner date ({breakdown.days_away}d): +{Math.round(weights.soonerDate * Math.max(0, (30 - breakdown.days_away) / 30))}</span>
              <span>Capacity ({8 - breakdown.current_students} spots): +{weights.moreCapacity * (8 - breakdown.current_students)}</span>
            </div>
          </div>

          {/* Students in Slot */}
          <div className="text-xs font-medium text-[#8b6f47] dark:text-[#cd853f] mb-1.5">
            Students in this slot:
          </div>
          {sortedStudents.length === 0 ? (
            <div className="text-xs text-gray-500 italic">No students yet (empty slot)</div>
          ) : (
            <div className="space-y-1 mb-3">
              {sortedStudents.map((student, idx) => (
                <StudentDisplay key={idx} student={student} />
              ))}
            </div>
          )}

          {/* Book / Add to Proposal Button */}
          {mode === "propose" ? (
            <>
              {is60DayExceeded && (
                <div className={`mb-2 p-2 ${isSuperAdmin ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800/50' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50'} border rounded text-xs`}>
                  <div className={`flex items-center gap-1.5 ${isSuperAdmin ? 'text-orange-700 dark:text-orange-400' : 'text-red-700 dark:text-red-400'}`}>
                    <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                    <span>{isSuperAdmin ? 'Override: Past 60-day limit' : 'Past 60-day makeup limit'}</span>
                  </div>
                </div>
              )}
              {isPastDeadline && (
                <div className="mb-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded text-xs">
                  <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                    <span>Past enrollment deadline</span>
                  </div>
                </div>
              )}
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToProposal?.();
                }}
                disabled={!canAddMore || (is60DayExceeded && !isSuperAdmin && !hasApprovedExtension) || isPastDeadline}
                className="w-full h-8 text-xs"
                variant={canAddMore && !(is60DayExceeded && !isSuperAdmin && !hasApprovedExtension) && !isPastDeadline ? "default" : "outline"}
              >
                {is60DayExceeded && !isSuperAdmin && !hasApprovedExtension ? (
                  "Past 60-day limit"
                ) : isPastDeadline ? (
                  "Past deadline"
                ) : canAddMore ? (
                  <>
                    <Plus className="h-3 w-3 mr-1" />
                    Add to Proposal
                  </>
                ) : (
                  "3 Slots Selected"
                )}
              </Button>
            </>
          ) : (
            <>
              {is60DayExceeded && hasApprovedExtension && !isPastDeadline && (
                <div className="mb-2 p-2 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50 border rounded text-xs">
                  <div className="flex items-center gap-1.5 text-green-700 dark:text-green-400">
                    <Check className="h-3 w-3 flex-shrink-0" />
                    <span>Extension approved — 60-day limit waived</span>
                  </div>
                </div>
              )}
              {is60DayExceeded && !hasApprovedExtension && (
                <div className={`mb-2 p-2 ${isSuperAdmin ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800/50' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50'} border rounded text-xs`}>
                  <div className={`flex items-center gap-1.5 ${isSuperAdmin ? 'text-orange-700 dark:text-orange-400' : 'text-red-700 dark:text-red-400'}`}>
                    <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                    <span>{isSuperAdmin ? 'Override: Past 60-day limit' : 'Past 60-day makeup limit'}</span>
                  </div>
                  <div className={`mt-1 ${isSuperAdmin ? 'text-orange-600 dark:text-orange-400' : 'text-red-600 dark:text-red-400'} text-[10px]`}>
                    {isSuperAdmin
                      ? 'Super Admin can proceed despite 60-day limit.'
                      : 'Makeups must be scheduled within 60 days of the original session.'}
                  </div>
                </div>
              )}
              {isPastDeadline && (
                <div className="mb-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded text-xs">
                  <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                    <span>Past enrollment deadline</span>
                  </div>
                  {onRequestExtension && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRequestExtension();
                      }}
                      className="mt-1 text-amber-600 dark:text-amber-400 underline hover:text-amber-700 dark:hover:text-amber-300"
                    >
                      Request Extension
                    </button>
                  )}
                </div>
              )}
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onBook();
                }}
                disabled={isSaving || isPastDeadline || (is60DayExceeded && !isSuperAdmin && !hasApprovedExtension)}
                className="w-full h-8 text-xs"
              >
                {isSaving ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Check className="h-3 w-3 mr-1" />
                )}
                Book This Slot
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
});

// Proposal slot type for local state
interface ProposalSlotLocal {
  date: string;
  timeSlot: string;
  tutorId: number;
  tutorName: string;
  location: string;
}

interface ScheduleMakeupModalProps {
  session: Session;
  isOpen: boolean;
  onClose: () => void;
  onScheduled?: (makeupSession: Session, originalSession: Session) => void;
  /** Tutor ID for the proposer (required for propose mode) */
  proposerTutorId?: number;
  /** Callback after proposal is created */
  onProposed?: () => void;
  /** Pre-fill date when opening (YYYY-MM-DD format) */
  initialDate?: string;
  /** Pre-fill time slot when opening */
  initialTimeSlot?: string;
  /** When true, pre-fills notes with "Rescheduled via extension request" */
  viaExtensionRequest?: boolean;
  /** Extension request ID to mark as rescheduled after successful booking */
  extensionRequestId?: number;
  /** When true, disables submit actions (Supervisor mode) */
  readOnly?: boolean;
}

export function ScheduleMakeupModal({
  session,
  isOpen,
  onClose,
  onScheduled,
  proposerTutorId,
  onProposed,
  initialDate,
  initialTimeSlot,
  viaExtensionRequest,
  extensionRequestId,
  readOnly = false,
}: ScheduleMakeupModalProps) {
  const { showToast, dismissToast } = useToast();
  const { effectiveRole, user } = useAuth();
  const isSuperAdmin = effectiveRole === "Super Admin";
  const { data: tutors } = useActiveTutors();
  const { data: enrollment } = useEnrollment(session.enrollment_id);

  // Fetch all student enrollments to find the CURRENT one (latest Regular by first_lesson_date)
  // This is needed for cross-enrollment makeups: when a session from old enrollment A needs
  // to be scheduled, the deadline should be checked against the student's current enrollment B
  const { data: studentEnrollments } = useStudentEnrollments(session.student_id);
  const currentEnrollment = useMemo(() => {
    if (!studentEnrollments) return null;
    // Filter to Regular enrollments only, then find the latest by first_lesson_date
    const regularEnrollments = studentEnrollments.filter(e => e.enrollment_type === 'Regular' && e.payment_status !== 'Cancelled');
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
  const today = getToday();

  // 60-day makeup restriction
  // Use root_original_session_date from API (computed on backend by tracing makeup chain)
  // Falls back to session.session_date if not available
  const rootOriginalDate = session.root_original_session_date || session.session_date;

  // Calculate the last allowed date (60 days from original)
  const lastAllowedDate60Day = useMemo(() => {
    if (!rootOriginalDate) return null;
    const d = new Date(rootOriginalDate + 'T00:00:00');
    d.setDate(d.getDate() + 60);
    return d.toISOString().split('T')[0];
  }, [rootOriginalDate]);

  // Approved extension bypasses the 60-day rule (matches backend logic)
  const hasApprovedExtension = session.extension_request_status === 'Approved';

  // Form selection state
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>("");
  const [selectedTutorId, setSelectedTutorId] = useState<number | null>(null);
  const [makeupNotes, setMakeupNotes] = useState(viaExtensionRequest ? "Rescheduled via extension request" : "");

  // Propose mode state
  const [mode, setMode] = useState<"book" | "propose">("book");
  const [proposalSlots, setProposalSlots] = useState<ProposalSlotLocal[]>([]);
  const [isProposing, setIsProposing] = useState(false);
  // Use prop if provided, otherwise current user's ID from OAuth
  const selectedProposerTutorId = proposerTutorId ?? user?.id ?? null;

  // Custom time state (consolidated: start, end, enabled)
  const [customTime, setCustomTime] = useState({ start: "", end: "", enabled: false });
  const customTimeStart = customTime.start;
  const customTimeEnd = customTime.end;
  const useCustomTime = customTime.enabled;
  const setCustomTimeStart = (v: string) => setCustomTime(prev => ({ ...prev, start: v }));
  const setCustomTimeEnd = (v: string) => setCustomTime(prev => ({ ...prev, end: v }));
  const setUseCustomTime = (v: boolean) => setCustomTime(prev => ({ ...prev, enabled: v }));

  // Calendar state
  const [viewDate, setViewDate] = useState<Date>(today);
  const [showAllTutors, setShowAllTutors] = useState(false);

  // UI toggles state (consolidated: multiple panel visibility)
  const [panels, setPanels] = useState({
    showDayPicker: false,
    showWeightTuner: false,
    showSuggestions: true,
    showManualForm: true,
    visibleSuggestionCount: 5,
  });
  const showDayPicker = panels.showDayPicker;
  const showWeightTuner = panels.showWeightTuner;
  const showSuggestions = panels.showSuggestions;
  const showManualForm = panels.showManualForm;
  const visibleSuggestionCount = panels.visibleSuggestionCount;
  const setShowDayPicker = (v: boolean) => setPanels(prev => ({ ...prev, showDayPicker: v }));
  const setShowWeightTuner = (v: boolean) => setPanels(prev => ({ ...prev, showWeightTuner: v }));
  const setShowSuggestions = (v: boolean) => setPanels(prev => ({ ...prev, showSuggestions: v }));
  const setShowManualForm = (v: boolean) => setPanels(prev => ({ ...prev, showManualForm: v }));
  const setVisibleSuggestionCount = (v: number) => setPanels(prev => ({ ...prev, visibleSuggestionCount: v }));

  // Saving/validation state
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [deadlineError, setDeadlineError] = useState<DeadlineExceededError | null>(null);

  // Helper to get day name from date string (abbreviated to match DB format)
  const getDayName = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  };

  // Early deadline warning - ONLY for regular slot past deadline
  // Business rule: Only block scheduling to the student's regular slot (assigned_day + assigned_time)
  // past the enrollment end date. Non-regular slots are allowed past deadline.
  // Uses CURRENT enrollment (not session's enrollment) for cross-enrollment makeups.
  const earlyDeadlineWarning = useMemo(() => {
    if (!selectedDate || !effectiveEndDate) return false;
    if (selectedDate <= effectiveEndDate) return false; // Not past deadline

    // Check if this is the regular slot (of the CURRENT enrollment)
    const selectedDayName = getDayName(selectedDate);
    const isRegularDay = selectedDayName === currentEnrollment?.assigned_day;
    const isRegularTime = selectedTimeSlot === currentEnrollment?.assigned_time;

    return isRegularDay && isRegularTime;
  }, [selectedDate, effectiveEndDate, selectedTimeSlot, currentEnrollment?.assigned_day, currentEnrollment?.assigned_time]);

  // Check if a suggestion would violate the regular slot deadline
  // Uses CURRENT enrollment (not session's enrollment) for cross-enrollment makeups.
  const isSuggestionPastDeadline = useCallback((suggestion: MakeupSlotSuggestion) => {
    if (!effectiveEndDate || !currentEnrollment?.assigned_day || !currentEnrollment?.assigned_time) return false;
    if (suggestion.session_date <= effectiveEndDate) return false;

    const dayName = getDayName(suggestion.session_date);
    return dayName === currentEnrollment.assigned_day && suggestion.time_slot === currentEnrollment.assigned_time;
  }, [effectiveEndDate, currentEnrollment?.assigned_day, currentEnrollment?.assigned_time]);

  // 60-day rule check for selected date
  const is60DayExceeded = useMemo(() => {
    if (!selectedDate || !lastAllowedDate60Day) return false;
    return selectedDate > lastAllowedDate60Day;
  }, [selectedDate, lastAllowedDate60Day]);

  // Check if a suggestion would violate the 60-day rule
  const isSuggestion60DayExceeded = useCallback((suggestion: MakeupSlotSuggestion) => {
    if (!lastAllowedDate60Day || hasApprovedExtension) return false;
    return suggestion.session_date > lastAllowedDate60Day;
  }, [lastAllowedDate60Day, hasApprovedExtension]);

  // Check if a date/slot would be blocked (for day picker panel)
  const isSlotBlocked = useCallback((date: string, slotTimeSlot: string) => {
    const exceeds60Day = !!(lastAllowedDate60Day && !hasApprovedExtension && date > lastAllowedDate60Day);
    const dayName = getDayName(date);
    const pastDeadline = !!(effectiveEndDate && date > effectiveEndDate &&
      dayName === currentEnrollment?.assigned_day && slotTimeSlot === currentEnrollment?.assigned_time);
    return { exceeds60Day, pastDeadline };
  }, [lastAllowedDate60Day, hasApprovedExtension, effectiveEndDate, currentEnrollment?.assigned_day, currentEnrollment?.assigned_time]);

  const [showExtensionModal, setShowExtensionModal] = useState(false);

  // Expanded items state
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null);
  const [expandedSlotStudents, setExpandedSlotStudents] = useState<string | null>(null);
  const [dayPickerDate, setDayPickerDate] = useState<string | null>(null);

  // Scoring weights state
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS);
  // Wrapper that also resets pagination so user sees new top results
  const updateWeights: typeof setWeights = (v) => {
    setWeights(v);
    setVisibleSuggestionCount(5);
  };

  // Selection state for day picker
  const [selectedDayPickerSlot, setSelectedDayPickerSlot] = useState<{
    timeSlot: string;
    tutorId: number;
  } | null>(null);

  // Confirmation dialogs state
  const [confirmBooking, setConfirmBooking] = useState<{
    timeSlot: string;
    tutorId: number;
    tutorName: string;
  } | null>(null);
  const [confirmSuggestion, setConfirmSuggestion] = useState<MakeupSlotSuggestion | null>(null);
  const [confirmManualBooking, setConfirmManualBooking] = useState(false);

  // Filters (consolidated: time slots + hide full + same grade)
  const [filters, setFilters] = useState({ timeSlots: [] as string[], hideFull: false, sameGrade: false });
  const filterTimeSlots = filters.timeSlots;
  const filterHideFull = filters.hideFull;
  const filterSameGrade = filters.sameGrade;
  const setFilterHideFull = (v: boolean) => setFilters(prev => ({ ...prev, hideFull: v }));
  const setFilterSameGrade = (v: boolean) => setFilters(prev => ({ ...prev, sameGrade: v }));
  const toggleTimeSlotFilter = (slot: string) => {
    setFilters(prev => ({
      ...prev,
      timeSlots: prev.timeSlots.includes(slot)
        ? prev.timeSlots.filter(s => s !== slot)
        : [...prev.timeSlots, slot]
    }));
  };
  const clearTimeSlotFilters = () => setFilters(prev => ({ ...prev, timeSlots: [] }));

  // Location is fixed to original session's location
  const location = session.location || "";

  // Days ahead for suggestion search range
  const [daysAhead, setDaysAhead] = useState(14);

  // Fetch suggestions
  const { data: suggestions = [], isLoading: suggestionsLoading } = useSWR(
    isOpen ? [`makeup-suggestions`, session.id, daysAhead] : null,
    async () => {
      return sessionsAPI.getMakeupSuggestions(session.id, { daysAhead });
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

  // Fetch holidays for the current month view
  const monthBounds = getMonthBounds(viewDate);
  const { data: holidays = [] } = useHolidays(
    toDateString(monthBounds.start),
    toDateString(monthBounds.end)
  );
  const holidayDates = useMemo(() => new Set(holidays.map(h => h.holiday_date)), [holidays]);

  // Prefetch next month's holidays for instant navigation
  const nextMonthBounds = useMemo(() => getMonthBounds(getNextMonth(viewDate)), [viewDate]);
  useHolidays(toDateString(nextMonthBounds.start), toDateString(nextMonthBounds.end));

  // Fetch existing sessions for the viewed month
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
    if (isOpen) {
      if (session.tutor_id) {
        setSelectedTutorId(session.tutor_id);
      }
      // Pre-fill date/time if provided (e.g., from extension request)
      if (initialDate) {
        setSelectedDate(initialDate);
      }
      if (initialTimeSlot) {
        setSelectedTimeSlot(initialTimeSlot);
      }
    }
  }, [isOpen, session.tutor_id, initialDate, initialTimeSlot]);

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
      setConfirmManualBooking(false);
      setExpandedSlotStudents(null);
      setShowAllSuggestions(false);
      // Reset propose mode state
      setMode("book");
      setProposalSlots([]);
      setIsProposing(false);
      setSelectedProposerTutorId(proposerTutorId ?? null);
    }
    // eslint-disable-next-line react-hooks-exhaustive-deps
  }, [isOpen, session.tutor_id]);

  // Build sessions by date lookup (include all statuses for retrospective scheduling)
  const sessionsByDate = useMemo(() => {
    const map = new Map<string, Session[]>();
    existingSessions.forEach((s) => {
      const dateKey = s.session_date;
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(s);
    });
    return map;
  }, [existingSessions]);

  // Get all unique time slots from existing sessions (for filter chips)
  // Respects "Show all tutors" setting - only shows slots for relevant tutors
  const allTimeSlots = useMemo(() => {
    const slots = new Set<string>();
    existingSessions?.forEach(s => {
      if (s.time_slot && (s.session_status === "Scheduled" || s.session_status === "Make-up Class")) {
        // Only include time slots for relevant tutors
        if (showAllTutors || s.tutor_id === session.tutor_id) {
          slots.add(s.time_slot);
        }
      }
    });
    // Sort chronologically
    return Array.from(slots).sort((a, b) => {
      const aMin = timeToMinutes(a.split(' - ')[0]);
      const bMin = timeToMinutes(b.split(' - ')[0]);
      return aMin - bMin;
    });
  }, [existingSessions, showAllTutors, session.tutor_id]);

  // Generate calendar grid data
  const calendarData = useMemo(() => {
    const calendarDates = getMonthCalendarDates(viewDate);
    const currentMonth = viewDate.getMonth();

    return calendarDates.map((date) => {
      const dateString = toDateString(date);
      const daySessions = sessionsByDate.get(dateString) || [];
      const dayOfWeek = date.getDay();

      // Filter sessions by selected tutor if not showing all
      let displaySessions = showAllTutors
        ? daySessions
        : daySessions.filter(s => s.tutor_id === selectedTutorId);

      // Filter by selected time slots if any
      if (filterTimeSlots.length > 0) {
        displaySessions = displaySessions.filter(s => filterTimeSlots.includes(s.time_slot));
      }

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

      // Only mark as past deadline if it's the regular day AND past deadline
      // Uses CURRENT enrollment for cross-enrollment makeups
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      const isRegularDay = dayName === currentEnrollment?.assigned_day;
      const isPastDeadline = effectiveEndDate && isRegularDay ? dateString > effectiveEndDate : false;

      // 60-day rule: check if date is more than 60 days from root original session
      const isPast60Days = lastAllowedDate60Day && !hasApprovedExtension ? dateString > lastAllowedDate60Day : false;

      return {
        date,
        dateString,
        isCurrentMonth: date.getMonth() === currentMonth,
        isToday: isSameDay(date, today),
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        isHoliday: holidayDates.has(dateString),
        isPastDeadline,
        isPast60Days,
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
  }, [viewDate, sessionsByDate, today, holidayDates, effectiveEndDate, currentEnrollment?.assigned_day, selectedDate, showAllTutors, selectedTutorId, filterTimeSlots, lastAllowedDate60Day]);

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
    // Helper to get default slots based on day of week
    const getDefaultSlots = (dateStr: string) => {
      const date = new Date(dateStr + 'T00:00:00');
      const dayOfWeek = date.getDay();
      return (dayOfWeek === 0 || dayOfWeek === 6) ? WEEKEND_TIME_SLOTS : WEEKDAY_TIME_SLOTS;
    };

    if (!selectedDate) return WEEKDAY_TIME_SLOTS; // Default to weekday slots

    // Start with default slots for this day type
    const defaultSlots = getDefaultSlots(selectedDate);
    const slots = new Set<string>(defaultSlots);

    // Add any additional time slots from existing sessions
    const daySessions = sessionsByDate.get(selectedDate) || [];
    daySessions.forEach(s => {
      if (s.time_slot) slots.add(s.time_slot);
    });

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
      addSessionToCache(response.makeup_session); // Add new session to cache directly

      // Mark extension request as rescheduled if this was via extension request flow
      if (extensionRequestId) {
        try {
          await extensionRequestsAPI.markRescheduled(extensionRequestId);
        } catch {
          // Non-critical - don't fail the whole operation
        }
      }

      // Show toast with Undo action (inline to avoid closure issues after modal unmounts)
      const makeupId = response.makeup_session.id;
      showToast("Make-up class scheduled", "success", {
        label: "Undo",
        onClick: async () => {
          const undoingId = showToast("Undoing make-up...", "info", undefined, { persistent: true });
          try {
            const originalSession = await sessionsAPI.cancelMakeup(makeupId);
            dismissToast(undoingId);
            removeSessionFromCache(makeupId);
            updateSessionInCache(originalSession);
            showToast("Make-up cancelled", "success");
          } catch {
            dismissToast(undoingId);
            showToast("Failed to undo make-up", "error");
          }
        },
      });

      onScheduled?.(response.makeup_session, response.original_session);
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to schedule make-up";

      // Check if this is an enrollment deadline exceeded error
      if (message.includes("ENROLLMENT_DEADLINE_EXCEEDED") || message.includes("enrollment end date")) {
        // Try to parse the error details from the message
        // Backend returns: "Cannot schedule past enrollment end date (YYYY-MM-DD)"
        const dateMatch = message.match(/\((\d{4}-\d{2}-\d{2})\)/);
        setDeadlineError({
          effective_end_date: dateMatch ? dateMatch[1] : "",
          enrollment_id: session.enrollment_id,
          session_id: session.id,
        });
        setValidationError(`Enrollment deadline exceeded. The enrollment ends on ${dateMatch ? dateMatch[1] : "this date"}.`);
      } else {
        setDeadlineError(null);
        setValidationError(message);
      }
      showToast(message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Add slot to proposal (up to 3)
  const addProposalSlot = useCallback((slot: ProposalSlotLocal) => {
    if (proposalSlots.length >= 3) {
      showToast("Maximum 3 slot options allowed", "info");
      return;
    }
    // Check for duplicate
    const isDuplicate = proposalSlots.some(
      s => s.date === slot.date && s.timeSlot === slot.timeSlot && s.tutorId === slot.tutorId
    );
    if (isDuplicate) {
      showToast("This slot is already in your proposal", "info");
      return;
    }
    setProposalSlots(prev => [...prev, slot]);
    showToast(`Added option ${proposalSlots.length + 1}`, "success");
  }, [proposalSlots, showToast]);

  // Remove slot from proposal
  const removeProposalSlot = useCallback((index: number) => {
    setProposalSlots(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Submit proposal
  const submitProposal = async () => {
    if (!selectedProposerTutorId) {
      showToast("Unable to determine current user", "error");
      return;
    }
    if (proposalSlots.length === 0) {
      showToast("Add at least one slot option", "info");
      return;
    }

    setIsProposing(true);
    try {
      const slots: MakeupProposalSlotCreate[] = proposalSlots.map((slot, idx) => ({
        slot_order: idx + 1,
        proposed_date: slot.date,
        proposed_time_slot: slot.timeSlot,
        proposed_tutor_id: slot.tutorId,
        proposed_location: slot.location,
      }));

      await proposalsAPI.create({
        original_session_id: session.id,
        proposal_type: "specific_slots",
        slots,
        notes: makeupNotes.trim() || undefined,
      }, selectedProposerTutorId);

      // Refresh proposal-related data
      mutate((key) =>
        Array.isArray(key) &&
        (key[0] === "proposals" ||
          key[0] === "pending-proposals-count" ||
          key[0] === "message-threads")
      );

      showToast("Make-up proposal sent!", "success");
      onProposed?.();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send proposal";
      showToast(message, "error");
    } finally {
      setIsProposing(false);
    }
  };

  // Handle manual schedule from form - shows confirm dialog
  const handleSchedule = () => {
    const error = validateForm();
    if (error) {
      setValidationError(error);
      return;
    }
    setConfirmManualBooking(true);
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

    // Always update day picker to show the selected date
    setDayPickerDate(dateString);
    setShowDayPicker(true);
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

    // Filter out sessions where student wasn't actually there
    const attendingSessions = allDaySessions.filter(s => {
      const status = s.session_status || '';
      // Exclude: Rescheduled, No Show, Cancelled, Make-up Booked, Pending Make-up
      if (status.includes('Rescheduled') ||
          status.includes('No Show') ||
          status.includes('Cancelled') ||
          status.includes('Make-up Booked') ||
          status.includes('Pending Make-up')) {
        return false;
      }
      return true;
    });

    // Filter by tutor if "Show all tutors" is unchecked
    const daySessions = showAllTutors
      ? attendingSessions
      : attendingSessions.filter(s => s.tutor_id === selectedTutorId);

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

  // Apply filters to day picker slots
  const filteredDayPickerSlots = useMemo(() => {
    let slots = dayPickerSlots;

    // Filter by selected time slots
    if (filterTimeSlots.length > 0) {
      slots = slots.filter(slot => filterTimeSlots.includes(slot.timeSlot));
    }

    // Filter by same grade (at least one student in slot has same grade)
    if (filterSameGrade && session.grade) {
      slots = slots.map(slot => ({
        ...slot,
        tutors: slot.tutors.filter(t =>
          t.sessions.some(s => s.grade === session.grade)
        )
      })).filter(slot => slot.tutors.length > 0);
    }

    // Filter out full slots (8 students)
    if (filterHideFull) {
      slots = slots.map(slot => ({
        ...slot,
        tutors: slot.tutors.filter(t => t.studentCount < 8)
      })).filter(slot => slot.tutors.length > 0);
    }

    return slots;
  }, [dayPickerSlots, filterTimeSlots, filterSameGrade, filterHideFull, session.grade]);

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
          <span>{mode === "propose" ? "Propose Make-up Slots" : "Schedule Make-up Class"}</span>
        </div>
      }
      size="xl"
      persistent={isSaving || isProposing}
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="outline" onClick={onClose} disabled={isSaving || isProposing}>
            Cancel
          </Button>
          {mode === "propose" ? (
            <Button
              onClick={submitProposal}
              disabled={readOnly || isProposing || proposalSlots.length === 0 || !selectedProposerTutorId}
              title={readOnly ? "Read-only access" : undefined}
            >
              {isProposing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : !selectedProposerTutorId ? (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Select Tutor First
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Proposal ({proposalSlots.length}/3)
                </>
              )}
            </Button>
          ) : (
            <Button onClick={handleSchedule} disabled={readOnly || isSaving || !selectedDate || !effectiveTimeSlot || !selectedTutorId || !isCustomTimeValid || earlyDeadlineWarning || (is60DayExceeded && !isSuperAdmin && !hasApprovedExtension)} title={readOnly ? "Read-only access" : undefined}>
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
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* Original Session Info - Compact sticky bar */}
        <div className="sticky -top-4 z-20 -mx-4 px-4 -mt-4 pt-4 pb-2 bg-[#fef9f3] dark:bg-[#2d2618] border-b border-[#e8d4b8] dark:border-[#6b5a4a] flex items-center gap-2 text-xs flex-wrap">
          <User className="h-3.5 w-3.5 text-[#a0704b] flex-shrink-0" />
          {session.school_student_id && (
            <span className="text-[9px] text-gray-400 font-mono">{session.school_student_id}</span>
          )}
          <span className="font-medium text-[#5d4e37] dark:text-[#e8d4b8]">{session.student_name}</span>
          {session.grade && (
            <span
              className="text-[9px] px-1 py-0.5 rounded text-gray-800"
              style={{ backgroundColor: getGradeColor(session.grade, session.lang_stream) }}
            >
              {session.grade}{session.lang_stream || ""}
            </span>
          )}
          {session.school && (
            <span className="text-[8px] px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
              {session.school}
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

        {/* Mode Toggle - Book vs Propose */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setMode("book")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                mode === "book"
                  ? "bg-white dark:bg-[#2a2a2a] text-[#a0704b] shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              )}
            >
              <Check className="h-3 w-3 inline mr-1" />
              Book Directly
            </button>
            <button
              onClick={() => setMode("propose")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                mode === "propose"
                  ? "bg-white dark:bg-[#2a2a2a] text-[#a0704b] shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              )}
            >
              <Send className="h-3 w-3 inline mr-1" />
              Propose to Tutor
            </button>
          </div>
          {mode === "propose" && (
            <span className="text-xs text-gray-500">
              Select up to 3 time slots
            </span>
          )}
        </div>

        {/* Proposal Slots (when in propose mode) */}
        {mode === "propose" && proposalSlots.length > 0 && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                <MessageSquare className="h-3.5 w-3.5" />
                PROPOSED SLOTS ({proposalSlots.length}/3)
              </span>
              {proposalSlots.length < 3 && (
                <span className="text-[10px] text-blue-600 dark:text-blue-400">
                  Click slots below to add more options
                </span>
              )}
            </div>
            <div className="space-y-2">
              {proposalSlots.map((slot, idx) => (
                <div
                  key={`${slot.date}-${slot.timeSlot}-${slot.tutorId}`}
                  className="flex items-center justify-between bg-white dark:bg-[#1a1a1a] rounded-md px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">#{idx + 1}</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {new Date(slot.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                    <span className="text-gray-500">{slot.timeSlot}</span>
                    <span className="text-[#a0704b]">{slot.tutorName}</span>
                  </div>
                  <button
                    onClick={() => removeProposalSlot(idx)}
                    className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    title="Remove this option"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Optional Notes Field */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={makeupNotes}
            onChange={(e) => setMakeupNotes(e.target.value)}
            placeholder={mode === "propose" ? "Note for the tutor (optional)" : "Reason for make-up (optional)"}
            maxLength={500}
            className="flex-1 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 placeholder:text-gray-400"
          />
        </div>

        {/* Validation Error */}
        {validationError && (
          <div id="makeup-validation-error" role="alert" className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span>{validationError}</span>
            </div>
            {/* Show Request Extension button for deadline exceeded errors */}
            {deadlineError && (
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
            )}
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
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                {/* Quick Book / Quick Add Best Suggestion */}
                {sortedSuggestions.length > 0 && (
                  mode === "propose" ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const best = sortedSuggestions[0];
                        addProposalSlot({
                          date: best.session_date,
                          timeSlot: best.time_slot,
                          tutorId: best.tutor_id,
                          tutorName: best.tutor_name,
                          location: best.location,
                        });
                      }}
                      disabled={proposalSlots.length >= 3}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 disabled:opacity-50"
                    >
                      <Plus className="h-3 w-3" />
                      Quick Add
                    </button>
                  ) : (
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
                  )
                )}
                {/* Days ahead selector */}
                <div className="flex items-center rounded overflow-hidden border border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
                  {[7, 14, 30].map((d) => (
                    <button
                      key={d}
                      onClick={() => { setDaysAhead(d); setVisibleSuggestionCount(5); }}
                      className={cn(
                        "px-1.5 py-1 text-[10px] transition-colors",
                        daysAhead === d
                          ? "bg-[#a0704b] text-white"
                          : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                      )}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
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
                  onClick={() => updateWeights(DEFAULT_WEIGHTS)}
                  className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-[#a0704b] transition-colors"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </button>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <WeightSlider label="Same Tutor" value={weights.sameTutor} min={0} max={200} step={10}
                  onChange={(v) => updateWeights(w => ({ ...w, sameTutor: v }))} />
                <WeightSlider label="Same Grade (per student)" value={weights.sameGrade} min={0} max={50} step={5}
                  onChange={(v) => updateWeights(w => ({ ...w, sameGrade: v }))} />
                <WeightSlider label="Same Lang (per student)" value={weights.sameLang} min={0} max={50} step={5}
                  onChange={(v) => updateWeights(w => ({ ...w, sameLang: v }))} />
                <WeightSlider label="Same School (per student)" value={weights.sameSchool} min={0} max={50} step={5}
                  onChange={(v) => updateWeights(w => ({ ...w, sameSchool: v }))} />
                <WeightSlider label="Sooner Date" value={weights.soonerDate} min={0} max={100} step={5}
                  onChange={(v) => updateWeights(w => ({ ...w, soonerDate: v }))} />
                <WeightSlider label="More Capacity (per spot)" value={weights.moreCapacity} min={0} max={30} step={2}
                  onChange={(v) => updateWeights(w => ({ ...w, moreCapacity: v }))} />
              </div>
              <div className="mt-2 pt-2 border-t border-[#e8d4b8] dark:border-[#6b5a4a] text-[9px] text-gray-500 dark:text-gray-400">
                Adjust weights to prioritize different factors. Suggestions re-sort instantly.
              </div>
              </div>
              )}
              {suggestionsLoading ? (
                <div className="space-y-2">
                  {/* Skeleton suggestion cards */}
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-[#fef9f3] dark:bg-[#2d2618] rounded-lg p-2">
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="h-4 w-20 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                            <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                            <div className="h-3 w-14 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                            <div className="h-4 w-14 bg-green-100 dark:bg-green-900/30 rounded animate-pulse" />
                          </div>
                        </div>
                        <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : sortedSuggestions.length === 0 ? (
                <div className="text-sm text-gray-500 py-2">
                  No available slots found. Use the calendar below to select a date manually.
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {sortedSuggestions.slice(0, visibleSuggestionCount).map((suggestion) => {
                    const suggestionKey = `${suggestion.session_date}-${suggestion.time_slot}-${suggestion.tutor_id}`;
                    return (
                      <SuggestionCard
                        key={suggestionKey}
                        suggestion={suggestion}
                        isExpanded={expandedSuggestion === suggestionKey}
                        onToggle={() => toggleSuggestion(suggestionKey)}
                        onBook={() => setConfirmSuggestion(suggestion)}
                        onAddToProposal={() => addProposalSlot({
                          date: suggestion.session_date,
                          timeSlot: suggestion.time_slot,
                          tutorId: suggestion.tutor_id,
                          tutorName: suggestion.tutor_name,
                          location: suggestion.location,
                        })}
                        mode={mode}
                        canAddMore={proposalSlots.length < 3}
                        weights={weights}
                        originalStudent={{ grade: session.grade, lang_stream: session.lang_stream, school: session.school }}
                        isSaving={isSaving}
                        isPastDeadline={isSuggestionPastDeadline(suggestion)}
                        is60DayExceeded={isSuggestion60DayExceeded(suggestion)}
                        isSuperAdmin={isSuperAdmin}
                        hasApprovedExtension={hasApprovedExtension}
                        onRequestExtension={() => setShowExtensionModal(true)}
                      />
                    );
                  })}
                  {(sortedSuggestions.length > 5) && (
                    <div className="flex items-center justify-center gap-3 py-2">
                      {visibleSuggestionCount < sortedSuggestions.length && (
                        <button
                          onClick={() => setVisibleSuggestionCount(Math.min(visibleSuggestionCount + 10, sortedSuggestions.length))}
                          className="text-xs text-[#a0704b] hover:text-[#8b5d3b] hover:underline transition-colors"
                        >
                          Show 10 more ({sortedSuggestions.length - visibleSuggestionCount} remaining)
                        </button>
                      )}
                      {visibleSuggestionCount > 5 && (
                        <>
                          {visibleSuggestionCount < sortedSuggestions.length && <span className="text-gray-300">|</span>}
                          <button
                            onClick={() => setVisibleSuggestionCount(5)}
                            className="text-xs text-gray-500 hover:text-gray-700 hover:underline transition-colors"
                          >
                            Show less
                          </button>
                        </>
                      )}
                    </div>
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

            {/* Time Slot Filter */}
            <div className="px-3 py-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs text-gray-700 dark:text-gray-300">Filter by time</span>
                {filterTimeSlots.length > 0 && (
                  <button
                    onClick={clearTimeSlotFilters}
                    className="text-[10px] text-[#a0704b] hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {sessionsLoading ? (
                  <span className="text-[10px] text-gray-400">Loading...</span>
                ) : allTimeSlots.length === 0 ? (
                  <span className="text-[10px] text-gray-400">No sessions found</span>
                ) : (
                  allTimeSlots.map(slot => (
                    <button
                      key={slot}
                      onClick={() => toggleTimeSlotFilter(slot)}
                      className={cn(
                        "px-2 py-0.5 text-[10px] rounded border transition-colors",
                        filterTimeSlots.includes(slot)
                          ? "bg-[#a0704b] text-white border-[#a0704b]"
                          : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-[#a0704b]"
                      )}
                    >
                      {slot.split(' - ')[0]}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Calendar grid - dates shown immediately, availability skeletons while loading */}
            <>
              {/* Weekday headers */}
              <div className="grid grid-cols-7 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
                {DAY_NAMES.map((day, idx) => (
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
                        "p-1 min-h-[50px] border-b border-[#e8d4b8] dark:border-[#6b5a4a] transition-colors cursor-pointer relative",
                        !isFirstCol && "border-l",
                        !dayData.isCurrentMonth && "bg-gray-50 dark:bg-[#1f1f1f] opacity-40",
                        dayData.isHoliday && "bg-rose-50 dark:bg-rose-900/10 cursor-not-allowed",
                        !dayData.isHoliday && dayData.isPast60Days && "bg-red-50 dark:bg-red-900/20",
                        !dayData.isHoliday && !dayData.isPast60Days && dayData.isPastDeadline && "bg-amber-50 dark:bg-amber-900/20",
                        dayData.isSelected && "ring-2 ring-inset ring-[#a0704b] dark:ring-[#cd853f] bg-[#f5ede3] dark:bg-[#3d3628]",
                        !dayData.isSelected && !dayData.isHoliday && dayData.isCurrentMonth && "hover:bg-[#fef9f3] dark:hover:bg-[#2d2618]",
                        dayData.isToday && "ring-1 ring-inset ring-blue-400"
                      )}
                    >
                      {/* 60-day exceeded indicator - takes priority over deadline */}
                      {!dayData.isHoliday && dayData.isPast60Days && dayData.isCurrentMonth && (
                        <div className="absolute top-0.5 right-0.5" title="Past 60-day makeup limit">
                          <AlertTriangle className="h-2.5 w-2.5 text-red-500" />
                        </div>
                      )}
                      {/* Past deadline indicator */}
                      {!dayData.isHoliday && !dayData.isPast60Days && dayData.isPastDeadline && dayData.isCurrentMonth && (
                        <div className="absolute top-0.5 right-0.5" title="Past enrollment deadline">
                          <AlertTriangle className="h-2.5 w-2.5 text-amber-500" />
                        </div>
                      )}
                      {/* Date number - always visible */}
                      <div className={cn(
                        "text-[10px] font-semibold",
                        dayData.isToday && "text-blue-500",
                        dayData.isHoliday && "text-rose-500",
                        !dayData.isHoliday && dayData.isPast60Days && "text-red-600 dark:text-red-400",
                        !dayData.isHoliday && !dayData.isPast60Days && dayData.isPastDeadline && "text-amber-600 dark:text-amber-400",
                        !dayData.isToday && !dayData.isHoliday && !dayData.isPast60Days && !dayData.isPastDeadline && dayData.isCurrentMonth && "text-[#5d4e37] dark:text-[#e8d4b8]"
                      )}>
                        {dayData.date.getDate()}
                      </div>
                      {/* Availability - skeleton while loading */}
                      {sessionsLoading ? (
                        <div className="h-2.5 w-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mt-0.5" />
                      ) : (
                        dayData.totalSlots > 0 && (() => {
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
                        })()
                      )}
                    </div>
                  );
                })}
              </div>
            </>
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

            {/* 60-day makeup limit — approved extension shows green confirmation, super admin orange, others red block */}
            {is60DayExceeded && hasApprovedExtension && !earlyDeadlineWarning && (
              <div id="makeup-60day-warning" className="p-3 border rounded-lg bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
                  <p className="text-sm text-green-800 dark:text-green-200">
                    Extension approved — 60-day limit waived
                  </p>
                </div>
              </div>
            )}
            {is60DayExceeded && !hasApprovedExtension && (
              <div id="makeup-60day-warning" role="alert" className={cn(
                "p-3 border rounded-lg",
                isSuperAdmin
                  ? "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700"
                  : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700"
              )}>
                <div className="flex items-start gap-2">
                  <AlertTriangle className={cn(
                    "h-4 w-4 mt-0.5 flex-shrink-0",
                    isSuperAdmin ? "text-orange-600 dark:text-orange-400" : "text-red-600 dark:text-red-400"
                  )} aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm",
                      isSuperAdmin ? "text-orange-800 dark:text-orange-200" : "text-red-800 dark:text-red-200"
                    )}>
                      {isSuperAdmin
                        ? "Super Admin Override: Exceeds 60-day limit"
                        : "This date exceeds the 60-day makeup limit"}
                    </p>
                    <p className={cn(
                      "text-xs mt-0.5",
                      isSuperAdmin ? "text-orange-600 dark:text-orange-400" : "text-red-600 dark:text-red-400"
                    )}>
                      Makeups must be scheduled within 60 days of the original session ({rootOriginalDate}).
                      Last allowed date: {lastAllowedDate60Day}
                      {isSuperAdmin && " — You can proceed as Super Admin."}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedDate("")}
                    className={cn(
                      "text-xs",
                      isSuperAdmin
                        ? "text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-800"
                        : "text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-800"
                    )}
                  >
                    Pick Different Date
                  </Button>
                </div>
              </div>
            )}

            {/* Early deadline warning - shown when scheduling to regular slot past deadline */}
            {earlyDeadlineWarning && !deadlineError && (
              <div id="makeup-deadline-warning" role="alert" className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
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
                    onClick={() => setSelectedDate("")}
                    className="text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-800"
                  >
                    Pick Different Date
                  </Button>
                </div>
              </div>
            )}

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
                        aria-label="Start time"
                        aria-describedby={isInvalid ? "makeup-custom-time-error" : undefined}
                        aria-invalid={isInvalid ? "true" : undefined}
                        className={cn(
                          "flex-1 px-3 py-2 border rounded-md text-sm bg-white dark:bg-gray-800",
                          isInvalid ? "border-red-400" : "border-gray-200 dark:border-gray-700"
                        )}
                      />
                      <span className="text-gray-500" aria-hidden="true">to</span>
                      <input
                        type="time"
                        value={customTimeEnd}
                        onChange={(e) => setCustomTimeEnd(e.target.value)}
                        aria-label="End time"
                        aria-describedby={isInvalid ? "makeup-custom-time-error" : undefined}
                        aria-invalid={isInvalid ? "true" : undefined}
                        className={cn(
                          "flex-1 px-3 py-2 border rounded-md text-sm bg-white dark:bg-gray-800",
                          isInvalid ? "border-red-400" : "border-gray-200 dark:border-gray-700"
                        )}
                      />
                    </div>
                    {isInvalid && (
                      <p id="makeup-custom-time-error" className="text-xs text-red-500" role="alert">End time must be after start time</p>
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

            {/* Add to Proposal button (propose mode only) */}
            {mode === "propose" && selectedDate && effectiveTimeSlot && selectedTutorId && (
              <Button
                onClick={() => {
                  const tutorName = tutors?.find(t => t.id === selectedTutorId)?.tutor_name || "";
                  addProposalSlot({
                    date: selectedDate,
                    timeSlot: effectiveTimeSlot,
                    tutorId: selectedTutorId,
                    tutorName,
                    location,
                  });
                }}
                disabled={proposalSlots.length >= 3 || studentsInSlot.length >= 8 || (is60DayExceeded && !isSuperAdmin && !hasApprovedExtension) || earlyDeadlineWarning}
                className="w-full"
                variant={proposalSlots.length < 3 && studentsInSlot.length < 8 && !(is60DayExceeded && !isSuperAdmin && !hasApprovedExtension) && !earlyDeadlineWarning ? "default" : "outline"}
              >
                {is60DayExceeded && !isSuperAdmin && !hasApprovedExtension ? (
                  "Past 60-day limit"
                ) : earlyDeadlineWarning ? (
                  "Past deadline"
                ) : proposalSlots.length >= 3 ? (
                  "3 Slots Selected"
                ) : studentsInSlot.length >= 8 ? (
                  "Slot is Full"
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Add to Proposal
                  </>
                )}
              </Button>
            )}
              </>
            )}
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

              {/* Filter Options */}
              {dayPickerSlots.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a]">
                  <span className="text-[10px] text-gray-500 mr-1">Filter:</span>
                  <button
                    onClick={() => setFilterSameGrade(!filterSameGrade)}
                    className={cn(
                      "px-2 py-0.5 text-[10px] rounded-full border transition-colors",
                      filterSameGrade
                        ? "bg-[#a0704b] text-white border-[#a0704b]"
                        : "text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-[#a0704b]"
                    )}
                  >
                    Same grade
                  </button>
                  <button
                    onClick={() => setFilterHideFull(!filterHideFull)}
                    className={cn(
                      "px-2 py-0.5 text-[10px] rounded-full border transition-colors",
                      filterHideFull
                        ? "bg-[#a0704b] text-white border-[#a0704b]"
                        : "text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-[#a0704b]"
                    )}
                  >
                    Hide full
                  </button>
                  {(filterTimeSlots.length > 0 || filterSameGrade || filterHideFull) && (
                    <span className="text-[10px] text-gray-400 ml-auto">
                      {filteredDayPickerSlots.reduce((sum, s) => sum + s.tutors.length, 0)} results
                    </span>
                  )}
                </div>
              )}

              {/* Time Slots - Scrollable with more height */}
              <div className="max-h-[350px] overflow-y-auto p-2 space-y-2 bg-gray-50 dark:bg-[#252525]">
                  {filteredDayPickerSlots.length === 0 ? (
                    <div className="text-xs text-gray-500 text-center py-4">
                      {dayPickerSlots.length === 0
                        ? "No sessions on this day. Select anyway to use a custom time slot."
                        : "No slots match your filters."}
                    </div>
                  ) : (
                    filteredDayPickerSlots.map(({ timeSlot, tutors: slotTutors }) => (
                      <div key={timeSlot} className="space-y-1.5">
                        {/* Time Slot Header */}
                        <div className="sticky top-0 z-10 text-[10px] font-bold text-[#8b6f47] dark:text-[#cd853f] uppercase tracking-wide border-b border-[#e8d4b8] dark:border-[#6b5a4a] pb-1 pt-2 -mt-2 bg-gray-50 dark:bg-[#252525] shadow-[0_-4px_0_0] shadow-gray-50 dark:shadow-[#252525]">
                          {timeSlot}
                        </div>

                        {/* Tutors in this slot */}
                        {slotTutors.map(({ tutorId, tutorName, studentCount, sessions }) => {
                          const isSelected = selectedDayPickerSlot?.timeSlot === timeSlot && selectedDayPickerSlot?.tutorId === tutorId;
                          const isFull = studentCount >= 8;
                          // Compute block status for this slot
                          const slotBlockStatus = dayPickerDate ? isSlotBlocked(dayPickerDate, timeSlot) : { exceeds60Day: false, pastDeadline: false };

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

                              {/* Book / Add to Proposal Button - Shown when selected */}
                              {isSelected && dayPickerDate && (
                                <div className="px-2.5 pb-2.5 border-t border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#fef9f3] dark:bg-[#2d2618]">
                                  {/* Warning banners */}
                                  {slotBlockStatus.exceeds60Day && (
                                    <div className={`mt-2 mb-2 p-2 ${isSuperAdmin ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800/50' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50'} border rounded text-xs`}>
                                      <div className={`flex items-center gap-1.5 ${isSuperAdmin ? 'text-orange-700 dark:text-orange-400' : 'text-red-700 dark:text-red-400'}`}>
                                        <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                                        <span>{isSuperAdmin ? 'Override: Past 60-day limit' : 'Past 60-day makeup limit'}</span>
                                      </div>
                                    </div>
                                  )}
                                  {slotBlockStatus.pastDeadline && (
                                    <div className="mt-2 mb-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded text-xs">
                                      <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                                        <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                                        <span>Past enrollment deadline</span>
                                      </div>
                                    </div>
                                  )}
                                  {mode === "propose" ? (
                                    <Button
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        addProposalSlot({
                                          date: dayPickerDate,
                                          timeSlot,
                                          tutorId,
                                          tutorName,
                                          location,
                                        });
                                      }}
                                      disabled={proposalSlots.length >= 3 || isFull || (slotBlockStatus.exceeds60Day && !isSuperAdmin) || slotBlockStatus.pastDeadline}
                                      className="w-full mt-2 h-8 text-xs"
                                      variant={proposalSlots.length < 3 && !isFull && !(slotBlockStatus.exceeds60Day && !isSuperAdmin) && !slotBlockStatus.pastDeadline ? "default" : "outline"}
                                    >
                                      {slotBlockStatus.exceeds60Day && !isSuperAdmin ? (
                                        "Past 60-day limit"
                                      ) : slotBlockStatus.pastDeadline ? (
                                        "Past deadline"
                                      ) : proposalSlots.length >= 3 ? (
                                        "3 Slots Selected"
                                      ) : isFull ? (
                                        "Slot is Full"
                                      ) : (
                                        <>
                                          <Plus className="h-3 w-3 mr-1" />
                                          Add to Proposal
                                        </>
                                      )}
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setConfirmBooking({ timeSlot, tutorId, tutorName });
                                      }}
                                      disabled={isSaving || isFull || (slotBlockStatus.exceeds60Day && !isSuperAdmin) || slotBlockStatus.pastDeadline}
                                      className="w-full mt-2 h-8 text-xs"
                                    >
                                      {isSaving ? (
                                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                      ) : (
                                        <Check className="h-3 w-3 mr-1" />
                                      )}
                                      {slotBlockStatus.exceeds60Day && !isSuperAdmin ? "Past 60-day limit" : slotBlockStatus.pastDeadline ? "Past deadline" : isFull ? "Slot is Full" : "Book This Slot"}
                                    </Button>
                                  )}
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

      {/* Confirm Booking Dialog - Manual Form */}
      <ConfirmDialog
        isOpen={confirmManualBooking}
        onConfirm={() => {
          bookMakeup({
            session_date: selectedDate,
            time_slot: effectiveTimeSlot,
            tutor_id: selectedTutorId!,
            location,
          });
          setConfirmManualBooking(false);
        }}
        onCancel={() => setConfirmManualBooking(false)}
        title="Confirm Make-up Booking"
        message={`Book make-up class on ${selectedDate ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''} at ${effectiveTimeSlot} with ${filteredTutors.find(t => t.id === selectedTutorId)?.tutor_name || ''}?`}
        confirmText="Book"
        variant="default"
        loading={isSaving}
      />

      {/* Extension Request Modal */}
      {(deadlineError || (currentEnrollment && effectiveEndDate)) && (proposerTutorId || session.tutor_id) && (
        <ExtensionRequestModal
          session={session}
          enrollmentId={deadlineError?.enrollment_id ?? currentEnrollment?.id!}
          effectiveEndDate={deadlineError?.effective_end_date ?? effectiveEndDate!}
          isOpen={showExtensionModal}
          onClose={() => setShowExtensionModal(false)}
          onRequestSubmitted={() => {
            setShowExtensionModal(false);
            showToast("Extension request submitted. You'll be notified when reviewed.", "success");
          }}
          tutorId={(proposerTutorId || session.tutor_id)!}
        />
      )}
    </Modal>
  );
}

export default ScheduleMakeupModal;
