"use client";

import { useMemo, useState, useCallback, useEffect, memo } from "react";
import Link from "next/link";
import { useSessions, useProposalsInDateRange, useTutors, usePendingMemoCount } from "@/lib/hooks";
import { useBulkSelection, useBulkSessionActions, useGroupedSessions, type TimeSlotGroup } from "@/lib/hooks/index";
import { useLocation } from "@/contexts/LocationContext";
import { useToast } from "@/contexts/ToastContext";
import { getSessionStatusConfig, getDisplayStatus, isCountableSession } from "@/lib/session-status";
import { canBeMarked } from "@/components/zen/utils/sessionSorting";
import { cn } from "@/lib/utils";
import { Calendar, Clock, ChevronRight, CheckSquare, PenTool, Home, HandCoins, Square, CheckCheck, X, UserX, CalendarClock, Ambulance, CloudRain, GraduationCap, StickyNote, ClipboardCheck } from "lucide-react";
import { SessionActionButtons } from "@/components/ui/action-buttons";
import { SessionStatusTag } from "@/components/ui/session-status-tag";
import { NoSessionsToday } from "@/components/illustrations/EmptyStates";
import { SessionsAccent } from "@/components/illustrations/CardAccents";
import { ProgressRing } from "@/components/dashboard/ProgressRing";
import { SessionDetailPopover } from "@/components/sessions/SessionDetailPopover";
import { BulkExerciseModal } from "@/components/sessions/BulkExerciseModal";
import type { Session, MakeupProposal } from "@/types";
import { getGradeColor, CURRENT_USER_TUTOR } from "@/lib/constants";
import { proposalSlotsToSessions } from "@/lib/proposal-utils";
import type { ProposedSession } from "@/lib/proposal-utils";
import { ProposalDetailModal } from "@/components/sessions/ProposalDetailModal";
import { ExerciseDropdownButton } from "@/components/sessions/ExerciseDropdownButton";
import { MemoListDrawer } from "@/components/sessions/MemoListDrawer";
import { useAuth } from "@/contexts/AuthContext";
import { groupExercisesByStudent, bulkDownloadByStudent, bulkPrintAllStudents } from "@/lib/bulk-exercise-download";

// Format today's date as YYYY-MM-DD
const getTodayString = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface TodaySessionsCardProps {
  className?: string;
  isMobile?: boolean;
  tutorId?: number;
}

export function TodaySessionsCard({ className, isMobile = false, tutorId }: TodaySessionsCardProps) {
  const { selectedLocation } = useLocation();
  const { showToast } = useToast();
  const todayString = getTodayString();
  const [popoverSession, setPopoverSession] = useState<Session | null>(null);
  const [clickPosition, setClickPosition] = useState<{ x: number; y: number } | null>(null);
  const [bulkExerciseType, setBulkExerciseType] = useState<"CW" | "HW" | null>(null);
  const [memoDrawerOpen, setMemoDrawerOpen] = useState(false);
  const { effectiveRole } = useAuth();

  // Fetch ALL sessions for today (single cache key, shared across view modes)
  // This enables instant view switching - no API call needed when toggling views
  const { data: allSessions = [], isLoading } = useSessions({
    date: todayString,
    location: selectedLocation === "All Locations" ? undefined : selectedLocation,
    limit: 500,  // Ensure all daily sessions are fetched (default is 100)
    // Note: tutor_id NOT passed - we filter client-side for instant view switching
  });

  // Filter client-side based on view mode (instant, no API call)
  const sessions = useMemo(() => {
    if (!tutorId) return allSessions;  // Center View: show all
    return allSessions.filter(s => s.tutor_id === tutorId);  // My View: filter by tutor
  }, [allSessions, tutorId]);

  // Fetch proposals for today (only proposals with slots on today's date)
  const { data: proposals = [] } = useProposalsInDateRange(todayString, todayString);

  // Fetch tutors for currentTutorId
  const { data: tutors = [] } = useTutors();

  // Get current user's tutor ID for proposal actions
  const currentTutorId = useMemo(() => {
    const tutor = tutors.find((t) => t.tutor_name === CURRENT_USER_TUTOR);
    return tutor?.id ?? 0;
  }, [tutors]);

  const isAdmin = effectiveRole === "Admin" || effectiveRole === "Super Admin";
  const { data: pendingMemoData } = usePendingMemoCount(isAdmin ? undefined : currentTutorId || undefined);

  // Convert proposals to proposed sessions
  const proposedSessions = useMemo(() => {
    const allProposed = proposalSlotsToSessions(proposals);
    // Filter by location if location filter is active
    if (selectedLocation && selectedLocation !== "All Locations") {
      return allProposed.filter(p => p.location === selectedLocation);
    }
    return allProposed;
  }, [proposals, selectedLocation]);

  // Proposal modal state
  const [selectedProposal, setSelectedProposal] = useState<MakeupProposal | null>(null);

  // Sync popover session with updated data from SWR (e.g., after marking attended)
  useEffect(() => {
    if (popoverSession && sessions) {
      const updatedSession = sessions.find((s) => s.id === popoverSession.id);
      if (updatedSession && updatedSession !== popoverSession) {
        setPopoverSession(updatedSession);
      }
    }
  }, [sessions, popoverSession]);

  // Group and sort sessions
  const { groupedSessions, stats, allSessionIds } = useGroupedSessions(sessions, proposedSessions);

  // Bulk selection state
  const {
    selectedIds,
    toggleSelect,
    selectIds,
    clearSelection,
    hasSelection,
  } = useBulkSelection(allSessionIds);

  // Markable sessions (can have attendance marked)
  const markableSessions = useMemo(() => sessions.filter(canBeMarked), [sessions]);
  const markableIds = useMemo(() => markableSessions.map(s => s.id), [markableSessions]);
  const isAllMarkableSelected = markableIds.length > 0 && markableIds.every(id => selectedIds.has(id));

  const toggleSelectMarkable = useCallback(() => {
    if (isAllMarkableSelected) {
      clearSelection();
    } else {
      selectIds(markableIds);
    }
  }, [isAllMarkableSelected, clearSelection, selectIds, markableIds]);

  // Bulk action handlers
  const {
    bulkActionLoading,
    loadingSessionActions,
    selectedSessions,
    bulkActionsAvailable,
    handleBulkAction,
    handleActionLoadingChange,
  } = useBulkSessionActions({
    sessions,
    selectedIds,
    clearSelection,
    showToast,
  });

  // Bulk exercise download/print
  const [bulkExerciseProcessing, setBulkExerciseProcessing] = useState<'CW' | 'HW' | null>(null);
  const selectedHaveCW = useMemo(() =>
    selectedSessions.some(s => s.exercises?.some(e => e.exercise_type === 'CW')),
    [selectedSessions]
  );
  const selectedHaveHW = useMemo(() =>
    selectedSessions.some(s => s.exercises?.some(e => e.exercise_type === 'HW')),
    [selectedSessions]
  );

  const handleBulkDownloadExercises = useCallback(async (type: 'CW' | 'HW') => {
    const groups = groupExercisesByStudent(selectedSessions, type);
    if (groups.length === 0) {
      showToast(`No ${type} exercises found for selected sessions`, 'info');
      return;
    }
    setBulkExerciseProcessing(type);
    const result = await bulkDownloadByStudent(groups);
    setBulkExerciseProcessing(null);

    const parts: string[] = [];
    if (result.succeeded > 0) parts.push(`${result.succeeded} downloaded`);
    if (result.failed > 0) parts.push(`${result.failed} failed`);
    if (result.skipped > 0) parts.push(`${result.skipped} had no exercises`);
    showToast(`${type} download: ${parts.join(', ')}`, result.failed > 0 ? 'error' : 'success');
  }, [selectedSessions, showToast]);

  const handleBulkPrintExercises = useCallback(async (type: 'CW' | 'HW') => {
    const groups = groupExercisesByStudent(selectedSessions, type);
    if (groups.length === 0) {
      showToast(`No ${type} exercises found for selected sessions`, 'info');
      return;
    }
    setBulkExerciseProcessing(type);
    const error = await bulkPrintAllStudents(groups);
    setBulkExerciseProcessing(null);

    if (error === 'not_supported') {
      showToast('File System Access not supported. Use Chrome/Edge.', 'error');
    } else if (error === 'no_valid_files') {
      showToast(`No valid ${type} PDF files found`, 'error');
    } else if (error === 'print_failed') {
      showToast('Print failed. Check popup blocker settings.', 'error');
    }
  }, [selectedSessions, showToast]);

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
      "bg-[#fef9f3] dark:bg-[#2d2618] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] overflow-hidden flex flex-col max-h-[70vh] md:h-[clamp(420px,60vh,560px)] card-hover",
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
            {/* Quick Attend shortcut - only when there are markable sessions */}
            {markableIds.length > 0 && (
              <Link
                href="/quick-attend"
                className="flex items-center gap-1 px-1.5 py-1 text-[10px] font-medium rounded-md shadow-sm bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 border border-emerald-300 dark:border-emerald-700 transition-colors"
                title="Quick attendance marking"
              >
                <ClipboardCheck className="h-3 w-3" />
                <span className="hidden sm:inline">Quick</span>
              </Link>
            )}
            {/* Record Memo button */}
            <button
              onClick={() => setMemoDrawerOpen(true)}
              className="relative flex items-center gap-1 px-1.5 py-1 text-[10px] font-medium rounded-md shadow-sm bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 border border-amber-300 dark:border-amber-700 transition-colors"
              title="Record a session memo"
            >
              <StickyNote className="h-3 w-3" />
              <span className="hidden sm:inline">Memo</span>
              {(pendingMemoData?.count ?? 0) > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold rounded-full bg-amber-500 text-white">
                  {pendingMemoData!.count}
                </span>
              )}
            </button>
            {/* Progress Ring */}
            {stats.total > 0 && (
              <ProgressRing
                completed={stats.completed}
                total={stats.total}
                size={32}
                strokeWidth={3}
              />
            )}
            {/* Select Markable checkbox */}
            {markableIds.length > 0 && (
              <button
                onClick={toggleSelectMarkable}
                className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              >
                {isAllMarkableSelected ? (
                  <CheckSquare className="h-3.5 w-3.5 text-[#a0704b] dark:text-[#cd853f]" />
                ) : (
                  <Square className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">Select Markable</span>
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
                    ({group.sessions.filter(isCountableSession).length}{group.proposedSessions.length > 0 && ` + ${group.proposedSessions.length} proposed`})
                  </span>
                </div>

                {/* Sessions in this time slot */}
                <div className="divide-y divide-[#e8d4b8]/50 dark:divide-[#6b5a4a]/50">
                  {group.sessions.map((session, idx) => {
                    const prevSession = idx > 0 ? group.sessions[idx - 1] : null;
                    const isNewTutor = prevSession && prevSession.tutor_name !== session.tutor_name;

                    return (
                      <div key={session.id}>
                        {isNewTutor && (
                          <div className="border-t-2 border-dashed border-[#d4a574] dark:border-[#8b6f47] my-1" />
                        )}
                        <SessionRow
                          session={session}
                          isAlternate={idx % 2 === 1}
                          isSelected={selectedIds.has(session.id)}
                          onToggleSelect={() => toggleSelect(session.id)}
                          onRowClick={(e) => {
                            setClickPosition({ x: e.clientX, y: e.clientY });
                            setPopoverSession(session);
                          }}
                          isLoading={loadingSessionActions.has(session.id)}
                          loadingActionId={loadingSessionActions.get(session.id) || null}
                          onLoadingChange={handleActionLoadingChange}
                        />
                      </div>
                    );
                  })}
                  {/* Proposed sessions in this time slot */}
                  {group.proposedSessions.map((ps, idx) => (
                    <ProposedSessionRow
                      key={ps.id}
                      proposedSession={ps}
                      isAlternate={(group.sessions.length + idx) % 2 === 1}
                      onClick={() => setSelectedProposal(ps.proposal)}
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
                  onClick={() => handleBulkAction('attended')}
                  disabled={bulkActionLoading !== null}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400",
                    bulkActionLoading === 'attended' ? "opacity-50 cursor-wait" : "hover:bg-green-200 dark:hover:bg-green-900/50"
                  )}
                  title="Mark all as attended"
                >
                  <CheckCheck className={cn("h-3 w-3", bulkActionLoading === 'attended' && "animate-pulse")} />
                  <span className="hidden xs:inline">{bulkActionLoading === 'attended' ? '...' : 'Attended'}</span>
                </button>
              )}
              {bulkActionsAvailable.noShow && (
                <button
                  onClick={() => handleBulkAction('no-show')}
                  disabled={bulkActionLoading !== null}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400",
                    bulkActionLoading === 'no-show' ? "opacity-50 cursor-wait" : "hover:bg-red-200 dark:hover:bg-red-900/50"
                  )}
                  title="Mark all as no show"
                >
                  <UserX className={cn("h-3 w-3", bulkActionLoading === 'no-show' && "animate-pulse")} />
                  <span className="hidden xs:inline">{bulkActionLoading === 'no-show' ? '...' : 'No Show'}</span>
                </button>
              )}
              {bulkActionsAvailable.reschedule && (
                <button
                  onClick={() => handleBulkAction('reschedule')}
                  disabled={bulkActionLoading !== null}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400",
                    bulkActionLoading === 'reschedule' ? "opacity-50 cursor-wait" : "hover:bg-orange-200 dark:hover:bg-orange-900/50"
                  )}
                  title="Mark all as rescheduled"
                >
                  <CalendarClock className={cn("h-3 w-3", bulkActionLoading === 'reschedule' && "animate-pulse")} />
                  <span className="hidden xs:inline">{bulkActionLoading === 'reschedule' ? '...' : 'Reschedule'}</span>
                </button>
              )}
              {bulkActionsAvailable.sickLeave && (
                <button
                  onClick={() => handleBulkAction('sick-leave')}
                  disabled={bulkActionLoading !== null}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400",
                    bulkActionLoading === 'sick-leave' ? "opacity-50 cursor-wait" : "hover:bg-orange-200 dark:hover:bg-orange-900/50"
                  )}
                  title="Mark all as sick leave"
                >
                  <Ambulance className={cn("h-3 w-3", bulkActionLoading === 'sick-leave' && "animate-pulse")} />
                  <span className="hidden xs:inline">{bulkActionLoading === 'sick-leave' ? '...' : 'Sick'}</span>
                </button>
              )}
              {bulkActionsAvailable.weatherCancelled && (
                <button
                  onClick={() => handleBulkAction('weather-cancelled')}
                  disabled={bulkActionLoading !== null}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400",
                    bulkActionLoading === 'weather-cancelled' ? "opacity-50 cursor-wait" : "hover:bg-orange-200 dark:hover:bg-orange-900/50"
                  )}
                  title="Mark all as weather cancelled"
                >
                  <CloudRain className={cn("h-3 w-3", bulkActionLoading === 'weather-cancelled' && "animate-pulse")} />
                  <span className="hidden xs:inline">{bulkActionLoading === 'weather-cancelled' ? '...' : 'Weather'}</span>
                </button>
              )}
              {/* Exercise actions - always visible */}
              <ExerciseDropdownButton
                exerciseType="CW"
                onAssign={() => setBulkExerciseType("CW")}
                onDownload={() => handleBulkDownloadExercises('CW')}
                onPrint={() => handleBulkPrintExercises('CW')}
                hasExercises={selectedHaveCW}
                isProcessing={bulkExerciseProcessing === 'CW'}
                dropUp
              />
              <ExerciseDropdownButton
                exerciseType="HW"
                onAssign={() => setBulkExerciseType("HW")}
                onDownload={() => handleBulkDownloadExercises('HW')}
                onPrint={() => handleBulkPrintExercises('HW')}
                hasExercises={selectedHaveHW}
                isProcessing={bulkExerciseProcessing === 'HW'}
                dropUp
              />
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

      {/* Proposal Detail Modal */}
      <ProposalDetailModal
        proposal={selectedProposal}
        currentTutorId={currentTutorId}
        isOpen={!!selectedProposal}
        onClose={() => setSelectedProposal(null)}
      />

      {/* Memo List Drawer */}
      {memoDrawerOpen && (
        <MemoListDrawer
          isOpen={true}
          onClose={() => setMemoDrawerOpen(false)}
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
  isLoading?: boolean;
  loadingActionId?: string | null;
  onLoadingChange?: (sessionId: number, isLoading: boolean, actionId?: string) => void;
}

const SessionRow = memo(function SessionRow({ session, isAlternate, isSelected, onToggleSelect, onRowClick, isLoading, loadingActionId, onLoadingChange }: SessionRowProps) {
  const { selectedLocation } = useLocation();
  const displayStatus = getDisplayStatus(session);
  const config = getSessionStatusConfig(displayStatus);
  const gradeColor = getGradeColor(session.grade, session.lang_stream);
  const isUnpaid = session.financial_status !== 'Paid';
  const isCancelledEnrollment = session.enrollment_payment_status === 'Cancelled';

  return (
    <div
      className={cn(
        "px-3 py-2 cursor-pointer hover:bg-[#f5ede3]/60 dark:hover:bg-[#3d3628]/60 transition-colors",
        isAlternate && "bg-[#f5ede3]/30 dark:bg-[#3d3628]/30",
        isSelected && "bg-amber-50 dark:bg-amber-900/20",
        isCancelledEnrollment && "opacity-50"
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
            isCancelledEnrollment
              ? "text-gray-400 dark:text-gray-500"
              : isUnpaid
                ? "text-red-600 dark:text-red-400"
                : "text-gray-900 dark:text-gray-100",
            config.strikethrough && "line-through opacity-60"
          )}>
            {session.school_student_id && (
              <span className="text-gray-500 dark:text-gray-400 mr-1">
                {selectedLocation === "All Locations" && session.location && `${session.location}-`}{session.school_student_id}
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
          {isCancelledEnrollment ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium">
              Cancelled
            </span>
          ) : isUnpaid && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center gap-0.5">
              <HandCoins className="h-2.5 w-2.5" />
              <span className="hidden xs:inline">Unpaid</span>
            </span>
          )}

          {/* Exam Revision indicator */}
          {session.exam_revision_slot_id && (
            <span title="Exam Revision"><GraduationCap className="h-3 w-3 text-purple-500 flex-shrink-0" /></span>
          )}

          {/* Extension Request indicator */}
          {session.extension_request_id && (
            <span title={`Extension ${session.extension_request_status}`}><Clock className="h-3 w-3 text-amber-500 flex-shrink-0" /></span>
          )}
        </div>

        {/* Right: Status + Tutor */}
        <div className="flex-shrink-0 flex items-center gap-2">
          {/* Status badge */}
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <SessionStatusTag status={displayStatus} iconOnly size="sm" />
          )}

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
        disablePushRight
        hideActions={
          (session.session_status.includes('Pending Make-up') || session.session_status.includes('Make-up Booked') || session.session_status === 'Cancelled')
            ? ['cw', 'hw', 'rate']
            : undefined
        }
        onLoadingChange={onLoadingChange}
        loadingActionId={loadingActionId}
        className="mt-1.5 ml-6"
      />
    </div>
  );
});

// Proposed session row component (ghost styling)
interface ProposedSessionRowProps {
  proposedSession: ProposedSession;
  isAlternate: boolean;
  onClick: () => void;
}

function ProposedSessionRow({ proposedSession, isAlternate, onClick }: ProposedSessionRowProps) {
  const { selectedLocation } = useLocation();
  const gradeColor = getGradeColor(proposedSession.grade, proposedSession.lang_stream);

  return (
    <div
      className={cn(
        "px-3 py-2 cursor-pointer transition-colors",
        "border-l-2 border-dashed border-amber-400 dark:border-amber-500",
        "hover:bg-amber-50/50 dark:hover:bg-amber-900/20",
        isAlternate && "bg-[#f5ede3]/30 dark:bg-[#3d3628]/30"
      )}
      onClick={onClick}
      style={{
        backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(156, 163, 175, 0.03) 10px, rgba(156, 163, 175, 0.03) 20px)",
      }}
    >
      {/* Main row */}
      <div className="flex items-center gap-2">
        {/* CalendarClock icon instead of checkbox */}
        <div className="flex-shrink-0 p-0.5">
          <CalendarClock className="h-4 w-4 text-amber-500 dark:text-amber-400" />
        </div>

        {/* Left: Student info */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
          {/* School ID + Name */}
          <span className="text-sm font-medium truncate text-gray-700 dark:text-gray-300">
            {proposedSession.school_student_id && (
              <span className="text-gray-500 dark:text-gray-400 mr-1">
                {selectedLocation === "All Locations" && proposedSession.location && `${proposedSession.location}-`}{proposedSession.school_student_id}
              </span>
            )}
            {proposedSession.student_name}
          </span>

          {/* Grade badge */}
          {proposedSession.grade && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-gray-800"
              style={{ backgroundColor: gradeColor }}
            >
              {proposedSession.grade}{proposedSession.lang_stream || ''}
            </span>
          )}

          {/* School badge */}
          {proposedSession.school && (
            <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
              {proposedSession.school}
            </span>
          )}

          {/* PROPOSED badge */}
          <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-dashed border-amber-300 dark:border-amber-600">
            Proposed
          </span>
        </div>

        {/* Right: Tutor */}
        <div className="flex-shrink-0 flex items-center gap-2">
          {proposedSession.tutor_name && (
            <span className="text-[10px] text-gray-500 dark:text-gray-400 max-w-[60px] truncate">
              {proposedSession.tutor_name}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
