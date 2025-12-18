"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useSessions } from "@/lib/hooks";
import { useLocation } from "@/contexts/LocationContext";
import { getSessionStatusConfig, getDisplayStatus, getStatusSortOrder } from "@/lib/session-status";
import { cn } from "@/lib/utils";
import { Calendar, Clock, ChevronRight, CheckSquare, PenTool, Home, HandCoins, Square, CheckCheck, X, UserX, CalendarClock, Ambulance } from "lucide-react";
import { parseTimeSlot } from "@/lib/calendar-utils";
import { SessionActionButtons } from "@/components/ui/action-buttons";
import { SessionStatusTag } from "@/components/ui/session-status-tag";
import { NoSessionsToday } from "@/components/illustrations/EmptyStates";
import { SessionsAccent } from "@/components/illustrations/CardAccents";
import { ProgressRing } from "@/components/dashboard/ProgressRing";
import { SessionDetailPopover } from "@/components/sessions/SessionDetailPopover";
import { BulkExerciseModal } from "@/components/sessions/BulkExerciseModal";
import type { Session } from "@/types";

// Format today's date as YYYY-MM-DD
const getTodayString = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Grade tag colors
const GRADE_COLORS: Record<string, string> = {
  "F1C": "#c2dfce",
  "F1E": "#cedaf5",
  "F2C": "#fbf2d0",
  "F2E": "#f0a19e",
  "F3C": "#e2b1cc",
  "F3E": "#ebb26e",
  "F4C": "#7dc347",
  "F4E": "#a590e6",
};

const getGradeColor = (grade: string | undefined, langStream: string | undefined): string => {
  const key = `${grade || ""}${langStream || ""}`;
  return GRADE_COLORS[key] || "#e5e7eb";
};

// Strip honorific prefixes for tutor name sorting
const getTutorSortName = (name: string) => name.replace(/^(Mr\.?|Ms\.?|Mrs\.?)\s*/i, '');

// Check if a session can have attendance actions (same as isNotAttended in session-actions.ts)
const canBeMarked = (session: Session): boolean =>
  ['Scheduled', 'Trial Class', 'Make-up Class'].includes(session.session_status);

interface TodaySessionsCardProps {
  className?: string;
  isMobile?: boolean;
}

interface TimeSlotGroup {
  timeSlot: string;
  startTime: string;
  sessions: Session[];
}

export function TodaySessionsCard({ className, isMobile = false }: TodaySessionsCardProps) {
  const { selectedLocation } = useLocation();
  const todayString = getTodayString();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [popoverSession, setPopoverSession] = useState<Session | null>(null);
  const [clickPosition, setClickPosition] = useState<{ x: number; y: number } | null>(null);
  const [bulkExerciseType, setBulkExerciseType] = useState<"CW" | "HW" | null>(null);

  const { data: sessions = [], isLoading } = useSessions({
    date: todayString,
    location: selectedLocation === "All Locations" ? undefined : selectedLocation,
    limit: 500,  // Ensure all daily sessions are fetched (default is 100)
  });

  // Sync popover session with updated data from SWR (e.g., after marking attended)
  useEffect(() => {
    if (popoverSession && sessions) {
      const updatedSession = sessions.find((s) => s.id === popoverSession.id);
      if (updatedSession && updatedSession !== popoverSession) {
        setPopoverSession(updatedSession);
      }
    }
  }, [sessions, popoverSession]);

  // Group and sort sessions (same logic as main sessions page)
  const { groupedSessions, stats, allSessionIds } = useMemo(() => {
    // First, group by time slot
    const groups: Record<string, Session[]> = {};
    sessions.forEach((session) => {
      const timeSlot = session.time_slot || "Unscheduled";
      if (!groups[timeSlot]) {
        groups[timeSlot] = [];
      }
      groups[timeSlot].push(session);
    });

    // Sort sessions within each group using main group priority (from sessions/page.tsx)
    Object.values(groups).forEach((groupSessions) => {
      // Group by tutor first
      const byTutor = new Map<string, Session[]>();
      groupSessions.forEach(s => {
        const tutor = s.tutor_name || '';
        if (!byTutor.has(tutor)) byTutor.set(tutor, []);
        byTutor.get(tutor)!.push(s);
      });

      // For each tutor, find main group and sort
      const sortedSessions: Session[] = [];
      const tutorNames = [...byTutor.keys()].sort((a, b) =>
        getTutorSortName(a).localeCompare(getTutorSortName(b))
      );

      for (const tutor of tutorNames) {
        const tutorSessions = byTutor.get(tutor)!;

        // Find majority grade+lang_stream among Scheduled only
        const scheduledSessions = tutorSessions.filter(s => s.session_status === 'Scheduled');
        const gradeCounts = new Map<string, number>();
        scheduledSessions.forEach(s => {
          const key = `${s.grade || ''}${s.lang_stream || ''}`;
          gradeCounts.set(key, (gradeCounts.get(key) || 0) + 1);
        });
        const mainGroup = [...gradeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';

        // Sort with main group priority
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

          // Within same priority (especially main group), sort by school then student_id
          if (priorityA <= 2) {
            const schoolCompare = (a.school || '').localeCompare(b.school || '');
            if (schoolCompare !== 0) return schoolCompare;
          }
          return (a.school_student_id || '').localeCompare(b.school_student_id || '');
        });

        sortedSessions.push(...tutorSessions);
      }

      // Replace original array contents
      groupSessions.length = 0;
      groupSessions.push(...sortedSessions);
    });

    // Sort time slots chronologically and convert to array
    const sortedEntries = Object.entries(groups).sort(([timeA], [timeB]) => {
      if (timeA === "Unscheduled") return 1;
      if (timeB === "Unscheduled") return -1;
      const startA = timeA.split("-")[0];
      const startB = timeB.split("-")[0];
      return startA.localeCompare(startB);
    });

    const groupedArray: TimeSlotGroup[] = sortedEntries.map(([slot, sessionsInSlot]) => {
      const parsed = parseTimeSlot(slot);
      return {
        timeSlot: slot,
        startTime: parsed?.start || slot,
        sessions: sessionsInSlot,
      };
    });

    // Collect all session IDs for select all
    const allIds = sessions.map(s => s.id);

    // Calculate stats
    const completed = sessions.filter(s =>
      s.session_status === 'Attended' ||
      s.session_status === 'Attended (Make-up)'
    ).length;

    const cancelled = sessions.filter(s =>
      s.session_status === 'Cancelled' ||
      s.session_status === 'No Show' ||
      s.session_status.includes('Pending Make-up') ||
      s.session_status.includes('Make-up Booked')
    ).length;

    return {
      groupedSessions: groupedArray,
      allSessionIds: allIds,
      stats: {
        total: sessions.length,
        completed,
        upcoming: sessions.length - completed - cancelled,
        cancelled,
      }
    };
  }, [sessions]);

  // Compute which bulk actions are available based on selected sessions
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

  // Bulk selection handlers
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
      if (prev.size === allSessionIds.length) {
        return new Set();
      }
      return new Set(allSessionIds);
    });
  }, [allSessionIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isAllSelected = selectedIds.size === allSessionIds.length && allSessionIds.length > 0;
  const hasSelection = selectedIds.size > 0;

  if (isLoading) {
    return (
      <div className={cn(
        "bg-[#fef9f3] dark:bg-[#2d2618] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] overflow-hidden",
        !isMobile && "paper-texture",
        className
      )}>
        <div className="p-4">
          <div className="h-5 shimmer-sepia rounded w-32 mb-4" />
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 shimmer-sepia rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "bg-[#fef9f3] dark:bg-[#2d2618] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] overflow-hidden flex flex-col h-[520px] card-hover",
      !isMobile && "paper-texture",
      className
    )}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3] dark:bg-[#3d3628] flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SessionsAccent className="w-8 h-6" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Today's Sessions</h3>
          </div>
          <div className="flex items-center gap-3">
            {/* Progress Ring */}
            {stats.total > 0 && (
              <ProgressRing
                completed={stats.completed}
                total={stats.total}
                size={32}
                strokeWidth={3}
              />
            )}
            {/* Select All checkbox */}
            {stats.total > 0 && (
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              >
                {isAllSelected ? (
                  <CheckSquare className="h-3.5 w-3.5 text-[#a0704b] dark:text-[#cd853f]" />
                ) : (
                  <Square className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">Select All</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {groupedSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-500 dark:text-gray-400">
            <NoSessionsToday className="mb-2 opacity-80" />
            <p className="text-sm font-medium">No sessions today</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Time for a coffee break!</p>
          </div>
        ) : (
          <div className="divide-y divide-[#e8d4b8] dark:divide-[#6b5a4a]">
            {groupedSessions.map((group) => (
              <div key={group.timeSlot}>
                {/* Time Slot Header */}
                <div className="px-3 py-1.5 bg-[#f5ede3]/50 dark:bg-[#3d3628]/50 flex items-center gap-2">
                  <Clock className="h-3 w-3 text-[#a0704b] dark:text-[#cd853f]" />
                  <span className="text-xs font-semibold text-[#a0704b] dark:text-[#cd853f]">
                    {group.timeSlot}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    ({group.sessions.length})
                  </span>
                </div>

                {/* Sessions in this time slot */}
                <div className="divide-y divide-[#e8d4b8]/50 dark:divide-[#6b5a4a]/50">
                  {group.sessions.map((session, idx) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      isAlternate={idx % 2 === 1}
                      isSelected={selectedIds.has(session.id)}
                      onToggleSelect={() => toggleSelect(session.id)}
                      onRowClick={(e) => {
                        setClickPosition({ x: e.clientX, y: e.clientY });
                        setPopoverSession(session);
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer with Stats & Link (or Bulk Actions if selected) */}
      <div className="px-4 py-3 border-t border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3]/50 dark:bg-[#3d3628]/50 flex-shrink-0">
        {hasSelection ? (
          /* Bulk Action Bar */
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
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
        ) : (
          /* Regular Stats Footer */
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs">
              <span className="text-green-600 dark:text-green-400">
                <span className="font-semibold">{stats.completed}</span> done
              </span>
              <span className="text-sky-600 dark:text-sky-400">
                <span className="font-semibold">{stats.upcoming}</span> upcoming
              </span>
              {stats.cancelled > 0 && (
                <span className="text-red-500 dark:text-red-400">
                  <span className="font-semibold">{stats.cancelled}</span> cancelled
                </span>
              )}
            </div>
            <Link
              href={`/sessions?date=${todayString}`}
              className="flex items-center gap-1 text-sm text-[#a0704b] dark:text-[#cd853f] hover:underline"
            >
              View All
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </div>

      {/* Session Detail Popover */}
      {popoverSession && (
        <SessionDetailPopover
          session={popoverSession}
          isOpen={!!popoverSession}
          onClose={() => setPopoverSession(null)}
          clickPosition={clickPosition}
        />
      )}

      {/* Bulk Exercise Modal */}
      {bulkExerciseType && (
        <BulkExerciseModal
          sessions={selectedSessions}
          exerciseType={bulkExerciseType}
          isOpen={true}
          onClose={() => setBulkExerciseType(null)}
        />
      )}
    </div>
  );
}

// Individual session row component
interface SessionRowProps {
  session: Session;
  isAlternate: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onRowClick: (e: React.MouseEvent) => void;
}

function SessionRow({ session, isAlternate, isSelected, onToggleSelect, onRowClick }: SessionRowProps) {
  const displayStatus = getDisplayStatus(session);
  const config = getSessionStatusConfig(displayStatus);
  const gradeColor = getGradeColor(session.grade, session.lang_stream);
  const isUnpaid = session.financial_status !== 'Paid';

  return (
    <div
      className={cn(
        "px-3 py-2 cursor-pointer hover:bg-[#f5ede3]/60 dark:hover:bg-[#3d3628]/60 transition-colors",
        isAlternate && "bg-[#f5ede3]/30 dark:bg-[#3d3628]/30",
        isSelected && "bg-amber-50 dark:bg-amber-900/20"
      )}
      onClick={onRowClick}
    >
      {/* Main row: Checkbox + Info + Status */}
      <div className="flex items-center gap-2">
        {/* Checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
          className="flex-shrink-0 p-0.5"
        >
          {isSelected ? (
            <CheckSquare className="h-4 w-4 text-[#a0704b] dark:text-[#cd853f]" />
          ) : (
            <Square className="h-4 w-4 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300" />
          )}
        </button>

        {/* Left: Student info */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
          {/* School ID + Name */}
          <span className={cn(
            "text-sm font-medium truncate",
            isUnpaid ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-gray-100",
            config.strikethrough && "line-through opacity-60"
          )}>
            {session.school_student_id && (
              <span className="text-gray-500 dark:text-gray-400 mr-1">
                {session.school_student_id}
              </span>
            )}
            {session.student_name}
          </span>

          {/* Grade badge */}
          {session.grade && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-gray-800"
              style={{ backgroundColor: gradeColor }}
            >
              {session.grade}{session.lang_stream || ''}
            </span>
          )}

          {/* School badge */}
          {session.school && (
            <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
              {session.school}
            </span>
          )}

          {/* Payment indicator */}
          {isUnpaid && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center gap-0.5">
              <HandCoins className="h-2.5 w-2.5" />
              <span className="hidden xs:inline">Unpaid</span>
            </span>
          )}
        </div>

        {/* Right: Status + Tutor */}
        <div className="flex-shrink-0 flex items-center gap-2">
          {/* Status badge */}
          <SessionStatusTag status={displayStatus} iconOnly size="sm" />

          {/* Tutor */}
          {session.tutor_name && (
            <span className="hidden sm:inline text-[10px] text-gray-500 dark:text-gray-400 max-w-[60px] truncate">
              {session.tutor_name}
            </span>
          )}
        </div>
      </div>

      {/* Action buttons row */}
      <SessionActionButtons
        session={session}
        size="md"
        showLabels
        className="mt-1.5 ml-6"
      />
    </div>
  );
}
