"use client";

import { useMemo, useState, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "@/contexts/LocationContext";
import { ChevronLeft, ChevronRight, CalendarDays, Users, List, Grid3X3, X, ExternalLink, HandCoins, CheckSquare, Square, CheckCheck, UserX, CalendarClock, Ambulance, PenTool, Home, GraduationCap, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SessionActionButtons } from "@/components/ui/action-buttons";
import { SessionDetailPopover } from "@/components/sessions/SessionDetailPopover";
import { BulkExerciseModal } from "@/components/sessions/BulkExerciseModal";
import { ProposedSessionCard } from "@/components/sessions/ProposedSessionCard";
import type { Session, Tutor } from "@/types";
import {
  toDateString,
  getToday,
  isSameDay,
  getMonthCalendarDates,
  getMonthName,
  getPreviousMonth,
  getNextMonth,
  getDayName,
  groupSessionsByTimeSlot,
  parseTimeSlot,
  timeToMinutes,
} from "@/lib/calendar-utils";
import { cn } from "@/lib/utils";
import { getSessionStatusConfig, getStatusSortOrder, getDisplayStatus, isCountableSession } from "@/lib/session-status";
import { getGradeColor } from "@/lib/constants";
import { getTutorSortName, getTutorFirstName, canBeMarked } from "@/components/zen/utils/sessionSorting";
import type { ProposedSession } from "@/lib/proposal-utils";
import type { MakeupProposal } from "@/types";

// Helper to get tutor initials
const getTutorInitials = (name: string): string => {
  const cleaned = name.replace(/^(Mr\.?|Ms\.?|Mrs\.?)\s*/i, '');
  const parts = cleaned.split(' ').filter(p => p.length > 0);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return cleaned.substring(0, 2).toUpperCase();
};

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface TutorWorkload {
  tutor: Tutor;
  sessionCount: number;
}

interface DayCellData {
  date: Date;
  dateString: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  isPast: boolean;
  sessions: Session[];
  proposedSessions: ProposedSession[];
  tutorWorkloads: TutorWorkload[];
  totalSessions: number;
  proposedCount: number;
  statusCounts: Map<string, number>;
  unpaidCount: number;
}

interface MonthlyCalendarViewProps {
  sessions: Session[];
  tutors: Tutor[];
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  onViewModeChange?: (mode: "list" | "daily") => void;
  isMobile?: boolean;
  proposedSessions?: ProposedSession[];
  onProposalClick?: (proposal: MakeupProposal) => void;
  sessionProposalMap?: Map<number, MakeupProposal>;
}

export const MonthlyCalendarView = memo(function MonthlyCalendarView({
  sessions,
  tutors,
  selectedDate,
  onDateChange,
  onViewModeChange,
  isMobile = false,
  proposedSessions = [],
  onProposalClick,
  sessionProposalMap,
}: MonthlyCalendarViewProps) {
  const { selectedLocation } = useLocation();
  const [selectedDayDate, setSelectedDayDate] = useState<string | null>(null);
  const [popoverTab, setPopoverTab] = useState<"list" | "grid">("list");
  const [openSessionId, setOpenSessionId] = useState<number | null>(null);

  const today = getToday();

  // Build sessions lookup by date
  const sessionsByDate = useMemo(() => {
    const map = new Map<string, Session[]>();
    sessions.forEach((session) => {
      const dateKey = session.session_date;
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(session);
    });
    return map;
  }, [sessions]);

  // Build proposed sessions lookup by date
  const proposedByDate = useMemo(() => {
    const map = new Map<string, ProposedSession[]>();
    proposedSessions.forEach((ps) => {
      const dateKey = ps.session_date;
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(ps);
    });
    return map;
  }, [proposedSessions]);

  // Build tutor lookup
  const tutorMap = useMemo(() => {
    const map = new Map<number, Tutor>();
    tutors.forEach((t) => map.set(t.id, t));
    return map;
  }, [tutors]);

  // Generate calendar grid data
  const calendarData = useMemo(() => {
    const calendarDates = getMonthCalendarDates(selectedDate);
    const currentMonth = selectedDate.getMonth();

    return calendarDates.map((date): DayCellData => {
      const dateString = toDateString(date);
      const daySessions = sessionsByDate.get(dateString) || [];
      const dayProposedSessions = proposedByDate.get(dateString) || [];
      const dayOfWeek = date.getDay();

      // Calculate tutor workloads, status counts, and unpaid count (exclude rescheduled/cancelled)
      const countableSessions = daySessions.filter(isCountableSession);
      const tutorSessionCounts = new Map<number, number>();
      const statusCounts = new Map<string, number>();
      let unpaidCount = 0;

      countableSessions.forEach((session) => {
        // Tutor counts
        if (session.tutor_id) {
          tutorSessionCounts.set(
            session.tutor_id,
            (tutorSessionCounts.get(session.tutor_id) || 0) + 1
          );
        }
        // Status counts
        const status = getDisplayStatus(session) || "Unknown";
        statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
        // Unpaid count
        if (session.financial_status !== "Paid") {
          unpaidCount++;
        }
      });

      const tutorWorkloads: TutorWorkload[] = Array.from(tutorSessionCounts.entries())
        .map(([tutorId, count]) => ({
          tutor: tutorMap.get(tutorId) || { id: tutorId, tutor_name: "Unknown" },
          sessionCount: count,
        }))
        .sort((a, b) => b.sessionCount - a.sessionCount);

      return {
        date,
        dateString,
        isCurrentMonth: date.getMonth() === currentMonth,
        isToday: isSameDay(date, today),
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        isPast: date < today && !isSameDay(date, today),
        sessions: daySessions,
        proposedSessions: dayProposedSessions,
        tutorWorkloads,
        totalSessions: countableSessions.length,
        proposedCount: dayProposedSessions.length,
        statusCounts,
        unpaidCount,
      };
    });
  }, [selectedDate, sessionsByDate, proposedByDate, tutorMap, today]);

  // Navigation handlers
  const goToPreviousMonth = () => {
    onDateChange(getPreviousMonth(selectedDate));
  };

  const goToNextMonth = () => {
    onDateChange(getNextMonth(selectedDate));
  };

  const goToToday = () => {
    onDateChange(today);
  };

  // Handle day cell click
  const handleDayClick = (dayData: DayCellData) => {
    if (dayData.totalSessions > 0 || dayData.proposedCount > 0) {
      setSelectedDayDate(dayData.dateString);
      setPopoverTab("list");
    }
  };

  // Get current day data for popover (looks up fresh data from calendarData)
  const selectedDayData = useMemo(() => {
    if (!selectedDayDate) return null;
    return calendarData.find(d => d.dateString === selectedDayDate) || null;
  }, [selectedDayDate, calendarData]);

  // Handle opening full view
  const handleOpenFullView = (viewMode: "list" | "daily") => {
    if (selectedDayData) {
      onDateChange(selectedDayData.date);
      onViewModeChange?.(viewMode);
      setSelectedDayDate(null);
    }
  };

  // Get maximum sessions in any day for color scaling
  const maxSessions = useMemo(() => {
    return Math.max(...calendarData.map(d => d.totalSessions), 1);
  }, [calendarData]);

  // Calculate background intensity based on session count
  const getLoadIntensity = (count: number): string => {
    if (count === 0) return "";
    const ratio = count / maxSessions;
    if (ratio < 0.25) return "bg-amber-50 dark:bg-amber-950/20";
    if (ratio < 0.5) return "bg-amber-100 dark:bg-amber-900/30";
    if (ratio < 0.75) return "bg-amber-200 dark:bg-amber-800/40";
    return "bg-amber-300 dark:bg-amber-700/50";
  };

  return (
    <div className="flex flex-col gap-1 h-full min-h-0">
      {/* Month Navigation Header */}
      <div className={cn(
        "flex items-center justify-between gap-2 bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg px-3 py-1.5",
        !isMobile && "paper-texture"
      )}>
        {/* Previous Month */}
        <Button
          variant="ghost"
          size="sm"
          onClick={goToPreviousMonth}
          className="h-7 px-2 text-[#8b6f47] hover:text-[#6b5347] hover:bg-[#f5ede3] dark:text-[#cd853f] dark:hover:bg-[#3d3628]"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline ml-1">Prev</span>
        </Button>

        {/* Month/Year Display */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={goToToday}
            className="h-7 px-2 text-xs font-medium text-[#8b6f47] hover:text-[#6b5347] hover:bg-[#f5ede3] dark:text-[#cd853f] dark:hover:bg-[#3d3628]"
          >
            Today
          </Button>
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-[#a0704b] dark:text-[#cd853f]" />
            <span className="font-bold text-[#5d4e37] dark:text-[#e8d4b8] text-sm sm:text-base">
              {getMonthName(selectedDate)} {selectedDate.getFullYear()}
            </span>
          </div>
        </div>

        {/* Next Month */}
        <Button
          variant="ghost"
          size="sm"
          onClick={goToNextMonth}
          className="h-7 px-2 text-[#8b6f47] hover:text-[#6b5347] hover:bg-[#f5ede3] dark:text-[#cd853f] dark:hover:bg-[#3d3628]"
        >
          <span className="hidden sm:inline mr-1">Next</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 min-h-0 bg-white dark:bg-[#1a1a1a] border-2 border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden flex flex-col">
        {/* Weekday Headers */}
        <div className="grid grid-cols-7 border-b-2 border-[#e8d4b8] dark:border-[#6b5a4a]">
          {WEEKDAY_NAMES.map((day, index) => (
            <div
              key={day}
              className={cn(
                "py-1.5 px-1 text-center text-xs font-semibold",
                "bg-[#fef9f3] dark:bg-[#2d2618]",
                index > 0 && "border-l border-[#e8d4b8] dark:border-[#6b5a4a]",
                (index === 0 || index === 6) && "text-[#a0704b]/70 dark:text-[#cd853f]/70"
              )}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days Grid */}
        <div className="grid grid-cols-7 auto-rows-fr flex-1 min-h-0">
          {calendarData.map((dayData, index) => (
            <DayCell
              key={dayData.dateString}
              dayData={dayData}
              index={index}
              maxSessions={maxSessions}
              isMobile={isMobile}
              onClick={() => handleDayClick(dayData)}
              getLoadIntensity={getLoadIntensity}
            />
          ))}
        </div>
      </div>

      {/* Day Popover */}
      <AnimatePresence>
        {selectedDayData && (
          <DayPopover
            dayData={selectedDayData}
            tab={popoverTab}
            onTabChange={setPopoverTab}
            onClose={() => setSelectedDayDate(null)}
            onOpenFullView={handleOpenFullView}
            openSessionId={openSessionId}
            setOpenSessionId={setOpenSessionId}
            tutorMap={tutorMap}
            isMobile={isMobile}
            onProposalClick={onProposalClick}
            sessionProposalMap={sessionProposalMap}
          />
        )}
      </AnimatePresence>
    </div>
  );
});

// Day Cell Component
interface DayCellProps {
  dayData: DayCellData;
  index: number;
  maxSessions: number;
  isMobile: boolean;
  onClick: () => void;
  getLoadIntensity: (count: number) => string;
}

function DayCell({ dayData, index, maxSessions, isMobile, onClick, getLoadIntensity }: DayCellProps) {
  const { date, isCurrentMonth, isToday, isWeekend, isPast, tutorWorkloads, totalSessions, proposedCount } = dayData;
  const dayOfWeek = date.getDay();
  const isFirstCol = dayOfWeek === 0;
  const hasContent = totalSessions > 0 || proposedCount > 0;

  // Show max 3 tutors, then "+X more"
  const visibleTutors = tutorWorkloads.slice(0, isMobile ? 2 : 3);
  const remainingTutors = tutorWorkloads.length - visibleTutors.length;

  return (
    <motion.div
      whileHover={hasContent ? { scale: 1.02 } : undefined}
      onClick={onClick}
      className={cn(
        "flex flex-col p-1 sm:p-1.5 border-b border-[#e8d4b8] dark:border-[#6b5a4a] transition-colors overflow-hidden",
        !isFirstCol && "border-l",
        !isCurrentMonth && "bg-gray-50 dark:bg-[#1f1f1f] opacity-50",
        isCurrentMonth && getLoadIntensity(totalSessions),
        isWeekend && isCurrentMonth && !hasContent && "bg-[#fef9f3]/50 dark:bg-[#2d2618]/30",
        isPast && isCurrentMonth && "opacity-70",
        isToday && "ring-2 ring-inset ring-[#d4a574] dark:ring-[#cd853f]",
        hasContent && "cursor-pointer hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
      )}
    >
      {/* Day Number + Weekday */}
      <div className="flex items-start justify-between mb-0.5 flex-shrink-0">
        <span className={cn(
          "text-xs sm:text-sm font-bold",
          isToday && "text-[#a0704b] dark:text-[#cd853f]",
          !isToday && isCurrentMonth && "text-[#5d4e37] dark:text-[#e8d4b8]",
          !isCurrentMonth && "text-gray-400 dark:text-gray-600",
          isWeekend && isCurrentMonth && !isToday && "text-[#a0704b]/70 dark:text-[#cd853f]/70"
        )}>
          {date.getDate()}
        </span>
        {isToday && (
          <span className="text-[8px] sm:text-[10px] font-medium text-[#a0704b] dark:text-[#cd853f] bg-[#a0704b]/10 dark:bg-[#cd853f]/20 px-1 rounded">
            TODAY
          </span>
        )}
      </div>

      {/* Tutor Workloads */}
      {totalSessions > 0 && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="space-y-0.5">
            {visibleTutors.map(({ tutor, sessionCount }) => (
              <div
                key={tutor.id}
                className="flex items-center gap-1 text-[9px] sm:text-[10px]"
              >
                <span className="font-semibold text-[#5d4e37] dark:text-[#e8d4b8] bg-[#e8d4b8]/50 dark:bg-[#4a3f2f] px-1 rounded truncate max-w-[50px]">
                  {getTutorFirstName(tutor.tutor_name)}
                </span>
                <span className="text-[#8b6f47] dark:text-[#cd853f]">
                  {sessionCount}
                </span>
              </div>
            ))}
            {remainingTutors > 0 && (
              <div className="text-[8px] sm:text-[9px] text-[#8b6f47]/70 dark:text-[#cd853f]/70">
                +{remainingTutors} more
              </div>
            )}

            {/* Status Summary */}
            <div className="text-[8px] text-[#8b6f47]/80 dark:text-[#cd853f]/80 mt-0.5 space-y-px">
              {/* Unpaid indicator */}
              {dayData.unpaidCount > 0 && (
                <div className="flex items-center gap-0.5 text-red-500">
                  <HandCoins className="h-2.5 w-2.5" />
                  <span>{dayData.unpaidCount} unpaid</span>
                </div>
              )}
              {/* Status breakdown - show top 2 statuses */}
              {Array.from(dayData.statusCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 2)
                .map(([status, count]) => (
                  <div key={status} className="truncate">
                    {count} {status.toLowerCase()}
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* Load Bar + Total */}
      {totalSessions > 0 && (
        <div className="flex-shrink-0 pt-0.5">
          <div className="flex items-center gap-1">
            <div className="flex-1 h-1 bg-[#e8d4b8] dark:bg-[#4a3f2f] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#a0704b] dark:bg-[#cd853f] rounded-full transition-all"
                style={{ width: `${(totalSessions / maxSessions) * 100}%` }}
              />
            </div>
            <span className="text-[8px] sm:text-[9px] font-medium text-[#8b6f47] dark:text-[#cd853f] whitespace-nowrap">
              {totalSessions}
            </span>
          </div>
        </div>
      )}

      {/* Proposed Sessions Indicator */}
      {proposedCount > 0 && (
        <div className="flex-shrink-0 pt-0.5">
          <div className="flex items-center gap-0.5 text-[8px] text-amber-600 dark:text-amber-400">
            <CalendarClock className="h-2.5 w-2.5" />
            <span>{proposedCount} proposed</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// Day Popover Component
interface DayPopoverProps {
  dayData: DayCellData;
  tab: "list" | "grid";
  onTabChange: (tab: "list" | "grid") => void;
  onClose: () => void;
  onOpenFullView: (mode: "list" | "daily") => void;
  openSessionId: number | null;
  setOpenSessionId: (id: number | null) => void;
  tutorMap: Map<number, Tutor>;
  isMobile: boolean;
  onProposalClick?: (proposal: MakeupProposal) => void;
  sessionProposalMap?: Map<number, MakeupProposal>;
}

function DayPopover({
  dayData,
  tab,
  onTabChange,
  onClose,
  onOpenFullView,
  openSessionId,
  setOpenSessionId,
  tutorMap,
  isMobile,
  onProposalClick,
  sessionProposalMap,
}: DayPopoverProps) {
  const { date, sessions, proposedSessions } = dayData;
  const [popoverClickPosition, setPopoverClickPosition] = useState<{ x: number; y: number } | null>(null);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkExerciseType, setBulkExerciseType] = useState<"CW" | "HW" | null>(null);

  const selectedSessions = useMemo(() =>
    sessions.filter(s => selectedIds.has(s.id)),
    [sessions, selectedIds]
  );

  const bulkActionsAvailable = useMemo(() => ({
    attended: selectedSessions.length > 0 && selectedSessions.every(canBeMarked),
    noShow: selectedSessions.length > 0 && selectedSessions.every(canBeMarked),
    reschedule: selectedSessions.length > 0 && selectedSessions.every(canBeMarked),
    sickLeave: selectedSessions.length > 0 && selectedSessions.every(canBeMarked),
  }), [selectedSessions]);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      if (prev.size === sessions.length) {
        return new Set();
      }
      return new Set(sessions.map(s => s.id));
    });
  }, [sessions]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isAllSelected = selectedIds.size === sessions.length && sessions.length > 0;
  const hasSelection = selectedIds.size > 0;

  // Group sessions by time slot for list view
  const sessionsByTimeSlot = useMemo(() => {
    return groupSessionsByTimeSlot(sessions);
  }, [sessions]);

  // Sort time slots
  const sortedTimeSlots = useMemo(() => {
    return Array.from(sessionsByTimeSlot.keys()).sort((a, b) => {
      if (a === "Unscheduled") return 1;
      if (b === "Unscheduled") return -1;
      const aTime = parseTimeSlot(a);
      const bTime = parseTimeSlot(b);
      if (!aTime || !bTime) return 0;
      return timeToMinutes(aTime.start) - timeToMinutes(bTime.start);
    });
  }, [sessionsByTimeSlot]);

  // Group sessions by tutor for grid view
  const sessionsByTutor = useMemo(() => {
    const map = new Map<number, Session[]>();
    sessions.forEach((session) => {
      if (session.tutor_id) {
        if (!map.has(session.tutor_id)) {
          map.set(session.tutor_id, []);
        }
        map.get(session.tutor_id)!.push(session);
      }
    });
    return map;
  }, [sessions]);

  // Group proposed sessions by tutor for grid view
  const proposedByTutor = useMemo(() => {
    const map = new Map<number, ProposedSession[]>();
    proposedSessions.forEach((ps) => {
      if (ps.tutor_id) {
        if (!map.has(ps.tutor_id)) {
          map.set(ps.tutor_id, []);
        }
        map.get(ps.tutor_id)!.push(ps);
      }
    });
    return map;
  }, [proposedSessions]);

  // Combine tutor IDs from both real and proposed sessions
  const tutorIds = useMemo(() => {
    const allTutorIds = new Set<number>();
    sessionsByTutor.forEach((_, tutorId) => allTutorIds.add(tutorId));
    proposedByTutor.forEach((_, tutorId) => allTutorIds.add(tutorId));
    return Array.from(allTutorIds).sort((a, b) => {
      const tutorA = tutorMap.get(a);
      const tutorB = tutorMap.get(b);
      return getTutorSortName(tutorA?.tutor_name || "").localeCompare(getTutorSortName(tutorB?.tutor_name || ""));
    });
  }, [sessionsByTutor, proposedByTutor, tutorMap]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg shadow-xl overflow-hidden w-full max-w-[600px] max-h-[80vh] sm:max-h-[70vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3] dark:bg-[#3d3628]">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-[#a0704b] dark:text-[#cd853f]" />
            <span className="font-bold text-[#5d4e37] dark:text-[#e8d4b8]">
              {getDayName(date, false)}, {getMonthName(date)} {date.getDate()}
            </span>
            <span className="text-xs text-[#8b6f47] dark:text-[#cd853f] bg-[#e8d4b8]/50 dark:bg-[#4a3f2f] px-1.5 py-0.5 rounded">
              {sessions.filter(isCountableSession).length} sessions
            </span>
            {proposedSessions.length > 0 && (
              <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-100/50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                <CalendarClock className="h-3 w-3" />
                {proposedSessions.length} proposed
              </span>
            )}
            {/* Select All button */}
            {tab === "list" && sessions.length > 0 && (
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 ml-1"
              >
                {isAllSelected ? (
                  <CheckSquare className="h-3.5 w-3.5 text-[#a0704b] dark:text-[#cd853f]" />
                ) : (
                  <Square className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">All</span>
              </button>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-7 w-7 p-0 text-[#8b6f47] hover:text-[#6b5347] hover:bg-[#e8d4b8] dark:text-[#cd853f] dark:hover:bg-[#4a3f2f]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
          <button
            onClick={() => onTabChange("list")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors",
              tab === "list"
                ? "bg-white dark:bg-[#1a1a1a] text-[#5d4e37] dark:text-[#e8d4b8] border-b-2 border-[#a0704b] dark:border-[#cd853f]"
                : "text-[#8b6f47] dark:text-[#cd853f] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
            )}
          >
            <List className="h-4 w-4" />
            List View
          </button>
          <button
            onClick={() => onTabChange("grid")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors",
              tab === "grid"
                ? "bg-white dark:bg-[#1a1a1a] text-[#5d4e37] dark:text-[#e8d4b8] border-b-2 border-[#a0704b] dark:border-[#cd853f]"
                : "text-[#8b6f47] dark:text-[#cd853f] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
            )}
          >
            <Grid3X3 className="h-4 w-4" />
            Grid View
          </button>
        </div>

        {/* Bulk Action Bar - appears when selections exist */}
        {hasSelection && tab === "list" && (
          <div className="px-3 py-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#fef9f3] dark:bg-[#2d2618]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                {selectedIds.size} selected
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Attendance actions - conditional based on selected sessions */}
                {bulkActionsAvailable.attended && (
                  <button
                    disabled
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 cursor-not-allowed opacity-50"
                    title="Coming soon"
                  >
                    <CheckCheck className="h-3 w-3" />
                    <span className="hidden xs:inline">Attended</span>
                  </button>
                )}
                {bulkActionsAvailable.noShow && (
                  <button
                    disabled
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 cursor-not-allowed opacity-50"
                    title="Coming soon"
                  >
                    <UserX className="h-3 w-3" />
                    <span className="hidden xs:inline">No Show</span>
                  </button>
                )}
                {bulkActionsAvailable.reschedule && (
                  <button
                    disabled
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 cursor-not-allowed opacity-50"
                    title="Coming soon"
                  >
                    <CalendarClock className="h-3 w-3" />
                    <span className="hidden xs:inline">Reschedule</span>
                  </button>
                )}
                {bulkActionsAvailable.sickLeave && (
                  <button
                    disabled
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 cursor-not-allowed opacity-50"
                    title="Coming soon"
                  >
                    <Ambulance className="h-3 w-3" />
                    <span className="hidden xs:inline">Sick</span>
                  </button>
                )}
                {/* Exercise actions - always visible */}
                <button
                  onClick={() => setBulkExerciseType("CW")}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
                  title="Assign Classwork"
                >
                  <PenTool className="h-3 w-3" />
                  <span className="hidden xs:inline">CW</span>
                </button>
                <button
                  onClick={() => setBulkExerciseType("HW")}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50"
                  title="Assign Homework"
                >
                  <Home className="h-3 w-3" />
                  <span className="hidden xs:inline">HW</span>
                </button>
                {/* Clear button - always visible */}
                <button
                  onClick={clearSelection}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  <X className="h-3 w-3" />
                  <span className="hidden xs:inline">Clear</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto" style={{ maxHeight: isMobile ? "calc(80vh - 180px)" : "calc(70vh - 180px)" }}>
          {tab === "list" ? (
            <ListView
              sortedTimeSlots={sortedTimeSlots}
              sessionsByTimeSlot={sessionsByTimeSlot}
              setOpenSessionId={setOpenSessionId}
              setPopoverClickPosition={setPopoverClickPosition}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              proposedSessions={proposedSessions}
              onProposalClick={onProposalClick}
              onClose={onClose}
            />
          ) : (
            <GridView
              tutorIds={tutorIds}
              tutorMap={tutorMap}
              sessionsByTutor={sessionsByTutor}
              setOpenSessionId={setOpenSessionId}
              setPopoverClickPosition={setPopoverClickPosition}
              proposedByTutor={proposedByTutor}
              onProposalClick={onProposalClick}
              onClose={onClose}
            />
          )}
        </div>

        {/* Session Detail Popover */}
        {openSessionId !== null && (() => {
          const session = sessions.find(s => s.id === openSessionId);
          if (!session) return null;
          return (
            <SessionDetailPopover
              session={session}
              isOpen={true}
              onClose={() => setOpenSessionId(null)}
              clickPosition={popoverClickPosition}
              sessionProposalMap={sessionProposalMap}
              onProposalClick={onProposalClick}
            />
          );
        })()}

        {/* Bulk Exercise Modal */}
        {bulkExerciseType && (
          <BulkExerciseModal
            sessions={selectedSessions}
            exerciseType={bulkExerciseType}
            isOpen={true}
            onClose={() => setBulkExerciseType(null)}
          />
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-2 border-t border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3] dark:bg-[#3d3628]">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenFullView("list")}
            className="h-7 text-xs border-[#d4a574] dark:border-[#8b6f47] text-[#5d4e37] dark:text-[#e8d4b8] hover:bg-[#e8d4b8] dark:hover:bg-[#4a3f2f]"
          >
            <List className="h-3 w-3 mr-1" />
            Open List
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenFullView("daily")}
            className="h-7 text-xs border-[#d4a574] dark:border-[#8b6f47] text-[#5d4e37] dark:text-[#e8d4b8] hover:bg-[#e8d4b8] dark:hover:bg-[#4a3f2f]"
          >
            <Users className="h-3 w-3 mr-1" />
            Open Daily
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// List View Tab Content
interface ListViewProps {
  sortedTimeSlots: string[];
  sessionsByTimeSlot: Map<string, Session[]>;
  setOpenSessionId: (id: number | null) => void;
  setPopoverClickPosition: (pos: { x: number; y: number } | null) => void;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  proposedSessions?: ProposedSession[];
  onProposalClick?: (proposal: MakeupProposal) => void;
  onClose?: () => void;
}

function ListView({ sortedTimeSlots, sessionsByTimeSlot, setOpenSessionId, setPopoverClickPosition, selectedIds, onToggleSelect, proposedSessions = [], onProposalClick, onClose }: ListViewProps) {
  // Sort sessions within each slot using main sessions page logic
  const getSortedSlotSessions = (sessions: Session[]) => {
    // Group by tutor
    const byTutor = new Map<string, Session[]>();
    sessions.forEach(s => {
      const tutor = s.tutor_name || '';
      if (!byTutor.has(tutor)) byTutor.set(tutor, []);
      byTutor.get(tutor)!.push(s);
    });

    const sortedSessions: Session[] = [];
    const tutorNames = [...byTutor.keys()].sort((a, b) =>
      getTutorSortName(a).localeCompare(getTutorSortName(b))
    );

    for (const tutor of tutorNames) {
      const tutorSessions = byTutor.get(tutor)!;

      // Find main group (most common grade+lang_stream among Scheduled)
      const scheduledSessions = tutorSessions.filter(s => s.session_status === 'Scheduled');
      const gradeCounts = new Map<string, number>();
      scheduledSessions.forEach(s => {
        const key = `${s.grade || ''}${s.lang_stream || ''}`;
        gradeCounts.set(key, (gradeCounts.get(key) || 0) + 1);
      });
      const mainGroup = [...gradeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';

      // Sort by priority
      tutorSessions.sort((a, b) => {
        const getPriority = (s: Session) => {
          const gradeKey = `${s.grade || ''}${s.lang_stream || ''}`;
          const isMainGroup = gradeKey === mainGroup && mainGroup !== '';
          const status = s.session_status || '';

          if (status === 'Trial Class') return 0;
          if (isMainGroup && status === 'Scheduled') return 1;
          if (isMainGroup && status === 'Attended') return 2;
          if (status === 'Scheduled') return 3;
          if (status === 'Attended') return 4;
          if (status === 'Make-up Class') return 5;
          if (status === 'Attended (Make-up)') return 6;
          return 10 + getStatusSortOrder(status);
        };

        const priorityA = getPriority(a);
        const priorityB = getPriority(b);
        if (priorityA !== priorityB) return priorityA - priorityB;

        // Within same priority, sort by school then student_id
        if (priorityA <= 2) {
          const schoolCompare = (a.school || '').localeCompare(b.school || '');
          if (schoolCompare !== 0) return schoolCompare;
        }
        return (a.school_student_id || '').localeCompare(b.school_student_id || '');
      });

      sortedSessions.push(...tutorSessions);
    }

    return sortedSessions;
  };

  return (
    <div className="p-2 space-y-2">
      {sortedTimeSlots.map((timeSlot) => {
        const slotSessions = getSortedSlotSessions(sessionsByTimeSlot.get(timeSlot) || []);
        return (
          <div key={timeSlot}>
            {/* Time Slot Header */}
            <div className="flex items-center gap-1.5 mb-1">
              <div className="h-px flex-1 bg-[#e8d4b8] dark:bg-[#6b5a4a]" />
              <span className="text-[10px] font-semibold text-[#a0704b] dark:text-[#cd853f] px-1.5">
                {timeSlot}
              </span>
              <div className="h-px flex-1 bg-[#e8d4b8] dark:bg-[#6b5a4a]" />
            </div>
            {/* Sessions */}
            <div className="space-y-1">
              {slotSessions.map((session, sessionIndex) => {
                const prevSession = sessionIndex > 0 ? slotSessions[sessionIndex - 1] : null;
                const isNewTutor = prevSession && prevSession.tutor_name !== session.tutor_name;
                return (
                  <div key={session.id}>
                    {isNewTutor && (
                      <div className="border-t-2 border-dashed border-[#d4a574] dark:border-[#8b6f47] my-1.5" />
                    )}
                    <SessionCard
                      session={session}
                      onClick={(e) => {
                        setPopoverClickPosition({ x: e.clientX, y: e.clientY });
                        setOpenSessionId(session.id);
                      }}
                      isSelected={selectedIds.has(session.id)}
                      onToggleSelect={(e) => {
                        e.stopPropagation();
                        onToggleSelect(session.id);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Proposed Sessions Section */}
      {proposedSessions.length > 0 && (
        <div>
          {/* Proposed Sessions Header */}
          <div className="flex items-center gap-1.5 mb-1">
            <div className="h-px flex-1 bg-amber-300 dark:bg-amber-700" />
            <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 px-1.5 flex items-center gap-1">
              <CalendarClock className="h-3 w-3" />
              Proposed Sessions
            </span>
            <div className="h-px flex-1 bg-amber-300 dark:bg-amber-700" />
          </div>
          {/* Proposed Session Cards */}
          <div className="space-y-1">
            {proposedSessions.map((ps) => (
              <div
                key={ps.id}
                onClick={() => {
                  // Clear any open session popovers before opening proposal modal
                  setOpenSessionId(null);
                  // Close the day popover before opening proposal modal
                  onClose?.();
                  onProposalClick?.(ps.proposal);
                }}
                className={cn(
                  "relative flex items-center gap-2 pr-7 py-1 rounded-md cursor-pointer transition-all overflow-hidden",
                  "bg-amber-50 dark:bg-amber-900/20 border-2 border-dashed border-amber-400 dark:border-amber-600",
                  "hover:shadow-md hover:scale-[1.01]"
                )}
              >
                {/* Main Content */}
                <div className="flex-1 min-w-0 pl-3">
                  {/* Top Row: Student ID + Time */}
                  <div className="flex items-center justify-between text-[9px] text-gray-500 dark:text-gray-400 mb-0.5">
                    <span className="flex items-center gap-0.5 whitespace-nowrap flex-shrink-0">
                      {ps.school_student_id || "N/A"}
                    </span>
                    <span>{ps.time_slot?.split('-')[0]}</span>
                  </div>

                  {/* Middle Row: Student Name + Grade + School */}
                  <div className="flex items-center gap-1 text-xs font-semibold text-[#5d4e37] dark:text-[#e8d4b8]">
                    <span className="truncate">{ps.student_name || "Unknown"}</span>
                    {ps.grade && (
                      <span
                        className="text-[8px] px-1 py-0.5 rounded text-gray-800 whitespace-nowrap"
                        style={{ backgroundColor: getGradeColor(ps.grade, ps.lang_stream) }}
                      >
                        {ps.grade}{ps.lang_stream || ''}
                      </span>
                    )}
                    {ps.school && (
                      <span className="text-[8px] px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 whitespace-nowrap">
                        {ps.school}
                      </span>
                    )}
                  </div>

                  {/* Bottom Row: Tutor Name */}
                  <div className="text-[10px] text-[#8b6f47] dark:text-[#cd853f] truncate">
                    {ps.tutor_name || "No tutor"}
                  </div>
                </div>

                {/* Proposed Badge */}
                <div className="absolute inset-y-0 right-0 w-6 flex items-center justify-center bg-amber-500 dark:bg-amber-600">
                  <CalendarClock className="h-3 w-3 text-white" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Grid View Tab Content
interface GridViewProps {
  tutorIds: number[];
  tutorMap: Map<number, Tutor>;
  sessionsByTutor: Map<number, Session[]>;
  setOpenSessionId: (id: number | null) => void;
  setPopoverClickPosition: (pos: { x: number; y: number } | null) => void;
  proposedByTutor: Map<number, ProposedSession[]>;
  onProposalClick?: (proposal: MakeupProposal) => void;
  onClose?: () => void;
}

function GridView({ tutorIds, tutorMap, sessionsByTutor, setOpenSessionId, setPopoverClickPosition, proposedByTutor, onProposalClick, onClose }: GridViewProps) {
  const { selectedLocation } = useLocation();
  // Calculate dynamic time slots based on actual sessions AND proposed sessions
  const timeSlots = useMemo(() => {
    // Collect all sessions from all tutors
    const allSessions: Session[] = [];
    sessionsByTutor.forEach(sessions => allSessions.push(...sessions));

    let minStartMinutes = Infinity;
    let maxEndMinutes = -Infinity;

    // Include real sessions in time range
    allSessions.forEach(session => {
      const parsed = parseTimeSlot(session.time_slot);
      if (!parsed) return;
      const startMins = timeToMinutes(parsed.start);
      const endMins = timeToMinutes(parsed.end);
      minStartMinutes = Math.min(minStartMinutes, startMins);
      maxEndMinutes = Math.max(maxEndMinutes, endMins);
    });

    // ALSO include proposed sessions in time range calculation
    proposedByTutor.forEach(proposedSessions => {
      proposedSessions.forEach(ps => {
        const parsed = parseTimeSlot(ps.time_slot);
        if (!parsed) return;
        const startMins = timeToMinutes(parsed.start);
        const endMins = timeToMinutes(parsed.end);
        minStartMinutes = Math.min(minStartMinutes, startMins);
        maxEndMinutes = Math.max(maxEndMinutes, endMins);
      });
    });

    if (minStartMinutes === Infinity) {
      return ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];
    }

    const startHour = Math.max(8, Math.floor(minStartMinutes / 60));
    const endHour = Math.min(20, Math.ceil(maxEndMinutes / 60));

    return Array.from({ length: endHour - startHour }, (_, i) =>
      `${(startHour + i).toString().padStart(2, '0')}:00`
    );
  }, [sessionsByTutor, proposedByTutor]);

  return (
    <div className="p-3">
      <div className="border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-x-auto">
        <div style={{ minWidth: `${40 + tutorIds.length * 80}px` }}>
        {/* Tutor Headers */}
        <div
          className="grid border-b border-[#e8d4b8] dark:border-[#6b5a4a]"
          style={{ gridTemplateColumns: `40px repeat(${tutorIds.length}, minmax(80px, 1fr))` }}
        >
          <div className="p-1 bg-[#fef9f3] dark:bg-[#2d2618] text-[8px] text-[#8b6f47] dark:text-[#cd853f]">
            Time
          </div>
          {tutorIds.map((tutorId, index) => {
            const tutor = tutorMap.get(tutorId);
            return (
              <div
                key={tutorId}
                className={cn(
                  "p-1 text-center bg-[#fef9f3] dark:bg-[#2d2618] border-l border-[#e8d4b8] dark:border-[#6b5a4a]",
                  index % 2 === 1 && "bg-[#f5ede3] dark:bg-[#3d3628]"
                )}
              >
                <div className="text-[9px] font-semibold text-[#5d4e37] dark:text-[#e8d4b8] truncate">
                  {tutor ? getTutorFirstName(tutor.tutor_name) : "Unknown"}
                </div>
                <div className="text-[8px] text-[#8b6f47] dark:text-[#cd853f]">
                  {(sessionsByTutor.get(tutorId) || []).filter(isCountableSession).length} sessions
                </div>
              </div>
            );
          })}
        </div>

        {/* Time Grid */}
        {timeSlots.map((time) => (
          <div
            key={time}
            className="grid border-b last:border-b-0 border-[#e8d4b8] dark:border-[#6b5a4a]"
            style={{ gridTemplateColumns: `40px repeat(${tutorIds.length}, minmax(80px, 1fr))` }}
          >
            {/* Time Label */}
            <div className="p-0.5 text-[8px] text-[#8b6f47] dark:text-[#cd853f] bg-[#fef9f3] dark:bg-[#2d2618] flex items-center justify-center">
              {time}
            </div>
            {/* Tutor Cells */}
            {tutorIds.map((tutorId, index) => {
              const tutorSessions = sessionsByTutor.get(tutorId) || [];
              const sessionsAtTime = tutorSessions.filter((s) => {
                const parsed = parseTimeSlot(s.time_slot);
                if (!parsed) return false;
                const startHour = parseInt(parsed.start.split(":")[0]);
                const slotHour = parseInt(time.split(":")[0]);
                return startHour === slotHour;
              });

              // Get proposed sessions for this tutor at this time
              const tutorProposed = proposedByTutor.get(tutorId) || [];
              const proposedAtTime = tutorProposed.filter((ps) => {
                const parsed = parseTimeSlot(ps.time_slot);
                if (!parsed) return false;
                const startHour = parseInt(parsed.start.split(":")[0]);
                const slotHour = parseInt(time.split(":")[0]);
                return startHour === slotHour;
              });

              return (
                <div
                  key={tutorId}
                  className={cn(
                    "min-h-[24px] p-0.5 border-l border-[#e8d4b8] dark:border-[#6b5a4a]",
                    index % 2 === 1 && "bg-[#fef9f3]/50 dark:bg-[#2d2618]/50"
                  )}
                >
                  {[...sessionsAtTime].sort((a, b) => {
                    const getPriority = (s: Session) => {
                      const status = s.session_status || '';
                      if (status === 'Trial Class') return 0;
                      if (status === 'Scheduled') return 1;
                      if (status === 'Attended') return 2;
                      if (status === 'Make-up Class') return 3;
                      if (status === 'Attended (Make-up)') return 4;
                      return 10 + getStatusSortOrder(status);
                    };
                    const pa = getPriority(a), pb = getPriority(b);
                    if (pa !== pb) return pa - pb;
                    const schoolCmp = (a.school || '').localeCompare(b.school || '');
                    if (schoolCmp !== 0) return schoolCmp;
                    return (a.school_student_id || '').localeCompare(b.school_student_id || '');
                  }).map((session) => {
                    const config = getSessionStatusConfig(getDisplayStatus(session));
                    const isCancelledEnrollment = session.enrollment_payment_status === 'Cancelled';
                    return (
                      <div
                        key={session.id}
                        onClick={(e) => {
                          setPopoverClickPosition({ x: e.clientX, y: e.clientY });
                          setOpenSessionId(session.id);
                        }}
                        className={cn(
                          "text-[7px] leading-tight p-0.5 rounded truncate cursor-pointer",
                          "border border-[#e8d4b8] dark:border-[#6b5a4a]",
                          "hover:scale-105 transition-transform",
                          config.bgTint,
                          config.strikethrough && "line-through opacity-60",
                          isCancelledEnrollment && "opacity-50"
                        )}
                        style={{ borderLeftWidth: 2 }}
                      >
                        {/* Row 1: Student ID + unpaid icon */}
                        <div className="flex items-center gap-0.5 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          <span className="truncate">{selectedLocation === "All Locations" && session.location && `${session.location}-`}{session.school_student_id || "N/A"}</span>
                          {isCancelledEnrollment ? (
                            <span className="text-[6px] px-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium flex-shrink-0">
                              Cancelled
                            </span>
                          ) : session.financial_status !== "Paid" && (
                            <HandCoins className="h-2 w-2 text-red-500 flex-shrink-0" />
                          )}
                        </div>
                        {/* Row 2: Full name */}
                        <div className={cn(
                          "truncate",
                          isCancelledEnrollment
                            ? "text-gray-400 dark:text-gray-500"
                            : session.financial_status !== "Paid"
                              ? "text-red-600 dark:text-red-400"
                              : config.strikethrough
                                ? "text-gray-400 dark:text-gray-500"
                                : "",
                        )}>{session.student_name || "Student"}</div>
                        {/* Row 3: Grade + School tags */}
                        <div className="flex items-center gap-0.5 flex-wrap">
                          {session.grade && (
                            <span
                              className="text-[6px] px-0.5 rounded text-gray-800"
                              style={{ backgroundColor: getGradeColor(session.grade, session.lang_stream) }}
                            >
                              {session.grade}{session.lang_stream || ''}
                            </span>
                          )}
                          {session.school && (
                            <span className="text-[6px] px-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                              {session.school}
                            </span>
                          )}
                          {session.exam_revision_slot_id && (
                            <span title="Exam Revision"><GraduationCap className="h-2.5 w-2.5 text-purple-500 flex-shrink-0" /></span>
                          )}
                          {session.extension_request_id && (
                            <span title={`Extension ${session.extension_request_status}`}><Clock className="h-2.5 w-2.5 text-amber-500 flex-shrink-0" /></span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {/* Proposed sessions for this tutor at this time */}
                  {proposedAtTime.map((ps) => (
                    <ProposedSessionCard
                      key={ps.id}
                      proposedSession={ps}
                      onClick={() => {
                        // Clear any open session popovers before opening proposal modal
                        setOpenSessionId(null);
                        // Close the day popover before opening proposal modal
                        onClose?.();
                        onProposalClick?.(ps.proposal);
                      }}
                      size="compact"
                      showTutor={false}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}

// Session Card Component for List View
interface SessionCardProps {
  session: Session;
  onClick: (e: React.MouseEvent) => void;
  isSelected?: boolean;
  onToggleSelect?: (e: React.MouseEvent) => void;
}

function SessionCard({ session, onClick, isSelected, onToggleSelect }: SessionCardProps) {
  const { selectedLocation } = useLocation();
  const config = getSessionStatusConfig(getDisplayStatus(session));
  const StatusIcon = config.Icon;
  const isCancelledEnrollment = session.enrollment_payment_status === 'Cancelled';

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-2 pr-7 py-1 rounded-md cursor-pointer transition-all overflow-hidden",
        "bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a]",
        "hover:shadow-md hover:scale-[1.01]",
        config.bgTint,
        isSelected && "ring-2 ring-[#a0704b] dark:ring-[#cd853f]",
        isCancelledEnrollment && "opacity-50"
      )}
      style={{ borderLeftWidth: 3 }}
    >
      {/* Checkbox for bulk selection */}
      {onToggleSelect && (
        <button
          onClick={onToggleSelect}
          className="flex-shrink-0 p-1.5 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors rounded-l"
        >
          {isSelected ? (
            <CheckSquare className="h-4 w-4 text-[#a0704b] dark:text-[#cd853f]" />
          ) : (
            <Square className="h-4 w-4 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300" />
          )}
        </button>
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        {/* Top Row: Student ID + Time */}
        <div className="flex items-center justify-between text-[9px] text-gray-500 dark:text-gray-400 mb-0.5">
          <span className="flex items-center gap-0.5 whitespace-nowrap flex-shrink-0">
            {selectedLocation === "All Locations" && session.location && `${session.location}-`}{session.school_student_id || "N/A"}
            {isCancelledEnrollment ? (
              <span className="text-[8px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium">
                Cancelled
              </span>
            ) : session.financial_status !== "Paid" && (
              <HandCoins className="h-2.5 w-2.5 text-red-500" />
            )}
          </span>
          <span>{session.time_slot?.split('-')[0]}</span>
        </div>

        {/* Middle Row: Student Name + Grade + School */}
        <div className={cn(
          "flex items-center gap-1 text-xs font-semibold",
          isCancelledEnrollment
            ? "text-gray-400 dark:text-gray-500"
            : session.financial_status !== "Paid"
              ? "text-red-600 dark:text-red-400"
              : config.strikethrough
                ? "text-gray-400 dark:text-gray-500"
                : "text-[#5d4e37] dark:text-[#e8d4b8]",
          config.strikethrough && "line-through"
        )}>
          <span className="truncate">{session.student_name || "Unknown"}</span>
          {session.grade && (
            <span
              className="text-[8px] px-1 py-0.5 rounded text-gray-800 whitespace-nowrap"
              style={{ backgroundColor: getGradeColor(session.grade, session.lang_stream) }}
            >
              {session.grade}{session.lang_stream || ''}
            </span>
          )}
          {session.school && (
            <span className="text-[8px] px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 whitespace-nowrap">
              {session.school}
            </span>
          )}
          {session.exam_revision_slot_id && (
            <span title="Exam Revision"><GraduationCap className="h-3 w-3 text-purple-500 flex-shrink-0" /></span>
          )}
          {session.extension_request_id && (
            <span title={`Extension ${session.extension_request_status}`}><Clock className="h-3 w-3 text-amber-500 flex-shrink-0" /></span>
          )}
        </div>

        {/* Bottom Row: Tutor Name */}
        <div className="text-[10px] text-[#8b6f47] dark:text-[#cd853f] truncate">
          {session.tutor_name || "No tutor"}
        </div>

        {/* Action Buttons */}
        <SessionActionButtons
          session={session}
          size="sm"
          className="mt-1 pt-1 border-t border-gray-200 dark:border-gray-700"
        />
      </div>

      {/* Status Icon Strip */}
      <div className={cn("absolute inset-y-0 right-0 w-6 flex items-center justify-center", config.bgClass)}>
        <StatusIcon className={cn("h-3 w-3 text-white", config.iconClass)} />
      </div>
    </div>
  );
}
