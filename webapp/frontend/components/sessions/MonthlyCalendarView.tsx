"use client";

import { useMemo, useState, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "@/contexts/LocationContext";
import { ChevronLeft, ChevronRight, CalendarDays, Users, List, Grid3X3, X, ExternalLink, HandCoins, CheckSquare, Square, CheckCheck, UserX, CalendarClock, Ambulance, PenTool, Home, GraduationCap, Clock, Copy, Check } from "lucide-react";
import { Button, IconButton, Segmented } from "@/components/controls";
import { SessionActionButtons } from "@/components/ui/action-buttons";
import { SessionDetailPopover } from "@/components/sessions/SessionDetailPopover";
import { BulkExerciseModal } from "@/components/sessions/BulkExerciseModal";
import { ProposedSessionCard } from "@/components/sessions/ProposedSessionCard";
import { SessionLessonBadge } from "@/components/sessions/LessonNumberBadge";
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
import { formatCompactDateTimeSlot } from "@/lib/formatters";
import { getSessionStatusConfig, getStatusSortOrder, getDisplayStatus, isCountableSession, isSessionUnpaid } from "@/lib/session-status";
import { getTutorSortName, getTutorFirstName, canBeMarked } from "@/components/zen/utils/sessionSorting";
import type { ProposedSession } from "@/lib/proposal-utils";
import type { MakeupProposal } from "@/types";
import { GradeBadge } from "@/components/ui/grade-label";

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
        if (isSessionUnpaid(session)) {
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
        "flex items-center justify-between gap-2 bg-paper border-2 border-line-strong rounded-lg px-3 py-1.5",
        !isMobile && "paper-texture"
      )}>
        {/* Previous Month */}
        <Button variant="quiet" size="sm" icon={ChevronLeft} onClick={goToPreviousMonth} aria-label="Previous month">
          <span className="hidden sm:inline">Prev</span>
        </Button>

        {/* Month/Year Display */}
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={goToToday}>
            Today
          </Button>
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-accent-ink" />
            <span className="font-bold text-[#5d4e37] dark:text-[#e8d4b8] text-sm sm:text-base">
              {getMonthName(selectedDate)} {selectedDate.getFullYear()}
            </span>
          </div>
        </div>

        {/* Next Month */}
        <Button variant="quiet" size="sm" onClick={goToNextMonth} aria-label="Next month">
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-ink-subtle" aria-hidden="true" />
        </Button>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 min-h-0 bg-white dark:bg-[#1a1a1a] border-2 border-line rounded-lg overflow-hidden flex flex-col">
        {/* Weekday Headers */}
        <div className="grid grid-cols-7 border-b-2 border-line">
          {WEEKDAY_NAMES.map((day, index) => (
            <div
              key={day}
              className={cn(
                "py-1.5 px-1 text-center text-xs font-semibold",
                "bg-paper",
                index > 0 && "border-l border-line",
                (index === 0 || index === 6) && "text-accent-ink/70"
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
        "flex flex-col p-1 sm:p-1.5 border-b border-line transition-colors overflow-hidden",
        !isFirstCol && "border-l",
        !isCurrentMonth && "bg-gray-50 dark:bg-[#1f1f1f] opacity-50",
        isCurrentMonth && getLoadIntensity(totalSessions),
        isWeekend && isCurrentMonth && !hasContent && "bg-[#fef9f3]/50 dark:bg-[#2d2618]/30",
        isPast && isCurrentMonth && "opacity-70",
        isToday && "ring-2 ring-inset ring-[#d4a574] dark:ring-[#cd853f]",
        hasContent && "cursor-pointer hover:bg-tint"
      )}
    >
      {/* Day Number + Weekday */}
      <div className="flex items-start justify-between mb-0.5 flex-shrink-0">
        <span className={cn(
          "text-xs sm:text-sm font-bold",
          isToday && "text-accent-ink dark:text-[#cd853f]",
          !isToday && isCurrentMonth && "text-[#5d4e37] dark:text-[#e8d4b8]",
          !isCurrentMonth && "text-gray-500 dark:text-gray-400",
          isWeekend && isCurrentMonth && !isToday && "text-accent-ink/70 dark:text-[#cd853f]/70"
        )}>
          {date.getDate()}
        </span>
        {totalSessions > 0 && (
          // The day's statuses as icons with counts, beside the day number
          // where there's room. Under three tutors the row fell past the load
          // bar and was cut off. Three marks fit a cell on a 1280px screen,
          // and the unpaid count takes one place when there is one.
          <div className="flex items-center gap-1.5 whitespace-nowrap overflow-hidden text-[11px] tabular-nums">
            {Array.from(dayData.statusCounts.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, (isMobile ? 1 : 3) - (dayData.unpaidCount > 0 ? 1 : 0))
              .map(([status, count]) => {
                const { Icon, textClass } = getSessionStatusConfig(status);
                return (
                  <span key={status} className={cn("inline-flex items-center gap-0.5 flex-shrink-0", textClass)} title={`${count} ${status.toLowerCase()}`}>
                    <Icon className="h-3 w-3" />
                    {count}
                  </span>
                );
              })}
            {dayData.unpaidCount > 0 && (
              <span className="inline-flex items-center gap-0.5 flex-shrink-0 text-red-600 dark:text-red-400" title={`${dayData.unpaidCount} unpaid`}>
                <HandCoins className="h-3 w-3" />
                {dayData.unpaidCount}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Tutor workloads */}
      {totalSessions > 0 && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="space-y-0.5">
            {visibleTutors.map(({ tutor, sessionCount }, i) => (
              <div
                key={tutor.id}
                className="flex items-center gap-1 text-[11px]"
              >
                <span className="font-semibold text-[#5d4e37] dark:text-[#e8d4b8] bg-[#e8d4b8]/50 dark:bg-[#4a3f2f] px-1 rounded truncate max-w-[60px]">
                  {getTutorFirstName(tutor.tutor_name)}
                </span>
                <span className="text-accent-ink tabular-nums">
                  {sessionCount}
                </span>
                {i === visibleTutors.length - 1 && remainingTutors > 0 && (
                  <span className="text-ink-subtle" title={`${remainingTutors} more tutor${remainingTutors > 1 ? "s" : ""}`}>
                    +{remainingTutors}
                  </span>
                )}
              </div>
            ))}

          </div>
        </div>
      )}

      {/* Load Bar + Total */}
      {totalSessions > 0 && (
        <div className="flex-shrink-0 pt-0.5">
          <div className="flex items-center gap-1">
            <div className="flex-1 h-1 bg-[#e8d4b8] dark:bg-[#4a3f2f] rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-ink rounded-full transition-all"
                style={{ width: `${(totalSessions / maxSessions) * 100}%` }}
              />
            </div>
            <span className="text-[11px] font-medium text-ink-subtle tabular-nums whitespace-nowrap">
              {totalSessions}
            </span>
          </div>
        </div>
      )}

      {/* Proposed Sessions Indicator */}
      {proposedCount > 0 && (
        <div className="flex-shrink-0 pt-0.5">
          <div className="flex items-center gap-0.5 text-[11px] text-amber-700 dark:text-amber-400">
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
        className="bg-paper border-2 border-line-strong rounded-lg shadow-xl overflow-hidden w-full max-w-[600px] max-h-[80vh] sm:max-h-[70vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-line bg-tint">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-accent-ink" />
            <span className="font-bold text-[#5d4e37] dark:text-[#e8d4b8]">
              {getDayName(date, false)}, {getMonthName(date)} {date.getDate()}
            </span>
            <span className="text-xs text-[#8b6f47] dark:text-[#cd853f] bg-[#e8d4b8]/50 dark:bg-[#4a3f2f] px-1.5 py-0.5 rounded">
              {sessions.filter(isCountableSession).length} sessions
            </span>
            {proposedSessions.length > 0 && (
              <span className="text-xs text-amber-700 dark:text-amber-400 bg-amber-100/50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded flex items-center gap-0.5">
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
                  <CheckSquare className="h-3.5 w-3.5 text-accent-ink" />
                ) : (
                  <Square className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">All</span>
              </button>
            )}
          </div>
          <IconButton size="sm" label="Close" icon={X} onClick={onClose} />
        </div>

        {/* Tabs */}
        <div className="flex justify-center px-3 py-2 border-b border-line">
          <Segmented
            label="How to show the day"
            value={tab}
            onChange={onTabChange}
            options={[
              { value: "list", label: "List view", icon: List },
              { value: "grid", label: "Grid view", icon: Grid3X3 },
            ]}
          />
        </div>

        {/* Bulk Action Bar - appears when selections exist */}
        {hasSelection && tab === "list" && (
          <div className="px-3 py-2 border-b border-line bg-paper">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                {selectedIds.size} selected
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Attendance actions - conditional based on selected sessions */}
                {bulkActionsAvailable.attended && (
                  <Button size="sm" icon={CheckCheck} iconClassName="text-green-700 dark:text-green-400" disabled title="Coming soon">
                    <span className="hidden xs:inline">Attended</span>
                  </Button>
                )}
                {bulkActionsAvailable.noShow && (
                  <Button size="sm" icon={UserX} iconClassName="text-red-600 dark:text-red-400" disabled title="Coming soon">
                    <span className="hidden xs:inline">No show</span>
                  </Button>
                )}
                {bulkActionsAvailable.reschedule && (
                  <Button size="sm" icon={CalendarClock} iconClassName="text-orange-700 dark:text-orange-400" disabled title="Coming soon">
                    <span className="hidden xs:inline">Reschedule</span>
                  </Button>
                )}
                {bulkActionsAvailable.sickLeave && (
                  <Button size="sm" icon={Ambulance} iconClassName="text-orange-700 dark:text-orange-400" disabled title="Coming soon">
                    <span className="hidden xs:inline">Sick</span>
                  </Button>
                )}
                {/* Exercise actions - always visible */}
                <Button
                  size="sm"
                  icon={PenTool}
                  iconClassName="text-red-600 dark:text-red-400"
                  onClick={() => setBulkExerciseType("CW")}
                  title="Assign Classwork"
                >
                  <span className="hidden xs:inline">CW</span>
                </Button>
                <Button
                  size="sm"
                  icon={Home}
                  iconClassName="text-blue-600 dark:text-blue-400"
                  onClick={() => setBulkExerciseType("HW")}
                  title="Assign Homework"
                >
                  <span className="hidden xs:inline">HW</span>
                </Button>
                {/* Clear button - always visible */}
                <Button variant="quiet" size="sm" icon={X} onClick={clearSelection}>
                  <span className="hidden xs:inline">Clear</span>
                </Button>
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
              date={date}
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
        <div className="flex items-center justify-end gap-2 px-4 py-2 border-t border-line bg-tint">
          <Button size="sm" icon={List} onClick={() => onOpenFullView("list")}>
            Open list
          </Button>
          <Button size="sm" icon={Users} onClick={() => onOpenFullView("daily")}>
            Open daily
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
  date: Date;
  setOpenSessionId: (id: number | null) => void;
  setPopoverClickPosition: (pos: { x: number; y: number } | null) => void;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  proposedSessions?: ProposedSession[];
  onProposalClick?: (proposal: MakeupProposal) => void;
  onClose?: () => void;
}

function ListView({ sortedTimeSlots, sessionsByTimeSlot, date, setOpenSessionId, setPopoverClickPosition, selectedIds, onToggleSelect, proposedSessions = [], onProposalClick, onClose }: ListViewProps) {
  const [copiedSlot, setCopiedSlot] = useState<string | null>(null);
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
        const copyText = formatCompactDateTimeSlot(date, timeSlot);
        return (
          <div key={timeSlot}>
            {/* Time Slot Header */}
            <div className="flex items-center gap-1.5 mb-1">
              <div className="h-px flex-1 bg-line" />
              <button
                className="flex items-center gap-1 text-[11px] font-semibold text-accent-ink px-1.5 hover:text-[#8b5e3c] dark:hover:text-[#daa06d] transition-colors"
                onClick={() => {
                  navigator.clipboard.writeText(copyText);
                  setCopiedSlot(timeSlot);
                  setTimeout(() => setCopiedSlot(null), 2000);
                }}
                title={copyText}
              >
                {timeSlot}
                {copiedSlot === timeSlot ? (
                  <Check className="w-3 h-3 text-green-700 dark:text-green-400" />
                ) : (
                  <Copy className="w-3 h-3 opacity-40 hover:opacity-100" />
                )}
              </button>
              <div className="h-px flex-1 bg-line" />
            </div>
            {/* Sessions */}
            <div className="space-y-1">
              {slotSessions.map((session, sessionIndex) => {
                const prevSession = sessionIndex > 0 ? slotSessions[sessionIndex - 1] : null;
                const isNewTutor = prevSession && prevSession.tutor_name !== session.tutor_name;
                return (
                  <div key={session.id}>
                    {isNewTutor && (
                      <div className="border-t-2 border-dashed border-line-strong my-1.5" />
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
            <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 px-1.5 flex items-center gap-1">
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
                  <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-0.5">
                    <span className="flex items-center gap-0.5 whitespace-nowrap flex-shrink-0">
                      {ps.school_student_id || "N/A"}
                    </span>
                    <span>{ps.time_slot?.split('-')[0]}</span>
                  </div>

                  {/* Middle Row: Student Name + Grade + School */}
                  <div className="flex items-center gap-1 text-xs font-semibold text-[#5d4e37] dark:text-[#e8d4b8]">
                    <span className="truncate">{ps.student_name || "Unknown"}</span>
                    {ps.grade && (
                      <GradeBadge className="text-[11px] px-1 py-0.5 rounded text-gray-800 whitespace-nowrap" grade={ps.grade} langStream={ps.lang_stream} />
                    )}
                    {ps.school && (
                      <span className="text-[11px] px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 whitespace-nowrap">
                        {ps.school}
                      </span>
                    )}
                  </div>

                  {/* Bottom Row: Tutor Name */}
                  <div className="text-[11px] text-[#8b6f47] dark:text-[#cd853f] truncate">
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
      <div className="border border-line rounded-lg overflow-x-auto">
        <div style={{ minWidth: `${40 + tutorIds.length * 80}px` }}>
        {/* Tutor Headers */}
        <div
          className="grid border-b border-line"
          style={{ gridTemplateColumns: `40px repeat(${tutorIds.length}, minmax(80px, 1fr))` }}
        >
          <div className="p-1 bg-paper text-[11px] text-[#8b6f47] dark:text-[#cd853f]">
            Time
          </div>
          {tutorIds.map((tutorId, index) => {
            const tutor = tutorMap.get(tutorId);
            return (
              <div
                key={tutorId}
                className={cn(
                  "p-1 text-center bg-paper border-l border-line",
                  index % 2 === 1 && "bg-tint"
                )}
              >
                <div className="text-[11px] font-semibold text-[#5d4e37] dark:text-[#e8d4b8] truncate">
                  {tutor ? getTutorFirstName(tutor.tutor_name) : "Unknown"}
                </div>
                <div className="text-[11px] text-[#8b6f47] dark:text-[#cd853f]">
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
            className="grid border-b last:border-b-0 border-line"
            style={{ gridTemplateColumns: `40px repeat(${tutorIds.length}, minmax(80px, 1fr))` }}
          >
            {/* Time Label */}
            <div className="p-0.5 text-[11px] text-[#8b6f47] dark:text-[#cd853f] bg-paper flex items-center justify-center">
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
                    "min-h-[24px] p-0.5 border-l border-line",
                    index % 2 === 1 && "bg-paper/50"
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
                          "border border-line",
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
                          <SessionLessonBadge session={session} size="xs" />
                          {isCancelledEnrollment ? (
                            <span className="text-[6px] px-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium flex-shrink-0">
                              Cancelled
                            </span>
                          ) : isSessionUnpaid(session) && (
                            <HandCoins className="h-2 w-2 text-red-600 flex-shrink-0" />
                          )}
                        </div>
                        {/* Row 2: Full name */}
                        <div className={cn(
                          "truncate",
                          isCancelledEnrollment
                            ? "text-gray-500 dark:text-gray-400"
                            : isSessionUnpaid(session)
                              ? "text-red-600 dark:text-red-400"
                              : config.strikethrough
                                ? "text-gray-500 dark:text-gray-400"
                                : "",
                        )}>{session.student_name || "Student"}</div>
                        {/* Row 3: Grade + School tags */}
                        <div className="flex items-center gap-0.5 flex-wrap">
                          {session.grade && (
                            <GradeBadge className="text-[6px] px-0.5 rounded text-gray-800" grade={session.grade} langStream={session.lang_stream} />
                          )}
                          {session.school && (
                            <span className="text-[6px] px-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                              {session.school}
                            </span>
                          )}
                          {session.exam_revision_slot_id && (
                            <span title="Exam Revision"><GraduationCap className="h-2.5 w-2.5 text-purple-600 flex-shrink-0" /></span>
                          )}
                          {session.extension_request_id && (
                            <span title={`Extension ${session.extension_request_status}`}><Clock className="h-2.5 w-2.5 text-amber-700 flex-shrink-0" /></span>
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
        "bg-white dark:bg-[#1a1a1a] border border-line",
        "hover:shadow-md hover:scale-[1.01]",
        config.bgTint,
        isSelected && "ring-2 ring-accent-ink",
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
            <CheckSquare className="h-4 w-4 text-accent-ink" />
          ) : (
            <Square className="h-4 w-4 text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
          )}
        </button>
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        {/* Top Row: Student ID + Time */}
        <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-0.5">
          <span className="flex items-center gap-0.5 whitespace-nowrap flex-shrink-0">
            {selectedLocation === "All Locations" && session.location && `${session.location}-`}{session.school_student_id || "N/A"}
            <SessionLessonBadge session={session} size="xs" />
            {isCancelledEnrollment ? (
              <span className="text-[11px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium">
                Cancelled
              </span>
            ) : isSessionUnpaid(session) && (
              <HandCoins className="h-2.5 w-2.5 text-red-600" />
            )}
          </span>
          <span>{session.time_slot?.split('-')[0]}</span>
        </div>

        {/* Middle Row: Student Name + Grade + School */}
        <div className={cn(
          "flex items-center gap-1 text-xs font-semibold",
          isCancelledEnrollment
            ? "text-gray-500 dark:text-gray-400"
            : isSessionUnpaid(session)
              ? "text-red-600 dark:text-red-400"
              : config.strikethrough
                ? "text-gray-500 dark:text-gray-400"
                : "text-[#5d4e37] dark:text-[#e8d4b8]",
          config.strikethrough && "line-through"
        )}>
          <span className="truncate">{session.student_name || "Unknown"}</span>
          {session.grade && (
            <GradeBadge className="text-[11px] px-1 py-0.5 rounded text-gray-800 whitespace-nowrap" grade={session.grade} langStream={session.lang_stream} />
          )}
          {session.school && (
            <span className="text-[11px] px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 whitespace-nowrap">
              {session.school}
            </span>
          )}
          {session.exam_revision_slot_id && (
            <span title="Exam Revision"><GraduationCap className="h-3 w-3 text-purple-600 flex-shrink-0" /></span>
          )}
          {session.extension_request_id && (
            <span title={`Extension ${session.extension_request_status}`}><Clock className="h-3 w-3 text-amber-700 flex-shrink-0" /></span>
          )}
        </div>

        {/* Bottom Row: Tutor Name */}
        <div className="text-[11px] text-[#8b6f47] dark:text-[#cd853f] truncate">
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
      <div className={cn("absolute inset-y-0 right-0 w-6 flex items-center justify-center", config.stripClass)}>
        <StatusIcon className={cn("h-3 w-3", config.stripIconClass)} />
      </div>
    </div>
  );
}
