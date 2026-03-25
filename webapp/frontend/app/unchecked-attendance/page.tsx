"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocation } from "@/contexts/LocationContext";
import { useRole } from "@/contexts/RoleContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle, useUncheckedAttendance, useBulkSelection } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import { useHaptic } from "@/lib/useHaptic";
import { formatDateCompact } from "@/lib/formatters";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition, StickyNote } from "@/lib/design-system";
import { TutorSelector, type TutorValue, ALL_TUTORS } from "@/components/selectors/TutorSelector";
import { sessionsAPI } from "@/lib/api";
import { SessionStatusTag } from "@/components/ui/session-status-tag";
import { SessionDetailPopover } from "@/components/sessions/SessionDetailPopover";
import { Loader2, Check, X, ClipboardList, AlertTriangle, CheckSquare, Square, Minus, CheckCheck, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { mutate } from "swr";
import type { UncheckedAttendanceReminder, Session } from "@/types";

type UrgencyLevel = 'Critical' | 'High' | 'Medium' | 'Low';
type BulkAction = 'attended' | 'no-show';

interface UrgencyConfig {
  label: string;
  sectionLabel: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  badgeBg: string;
  iconColor: string;
}

const URGENCY_LEVELS: Record<UrgencyLevel, UrgencyConfig> = {
  Critical: {
    label: '7+ Days',
    sectionLabel: 'Critical (7+ Days Overdue)',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    borderColor: 'border-red-200 dark:border-red-800',
    textColor: 'text-red-600 dark:text-red-400',
    badgeBg: 'bg-red-100 dark:bg-red-900/40',
    iconColor: 'text-red-500',
  },
  High: {
    label: '4-7 Days',
    sectionLabel: 'High (4-7 Days Overdue)',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    borderColor: 'border-orange-200 dark:border-orange-800',
    textColor: 'text-orange-600 dark:text-orange-400',
    badgeBg: 'bg-orange-100 dark:bg-orange-900/40',
    iconColor: 'text-orange-500',
  },
  Medium: {
    label: '2-3 Days',
    sectionLabel: 'Medium (2-3 Days Overdue)',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    borderColor: 'border-amber-200 dark:border-amber-800',
    textColor: 'text-amber-600 dark:text-amber-400',
    badgeBg: 'bg-amber-100 dark:bg-amber-900/40',
    iconColor: 'text-amber-500',
  },
  Low: {
    label: '0-1 Days',
    sectionLabel: 'Low (0-1 Days Overdue)',
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    borderColor: 'border-yellow-200 dark:border-yellow-800',
    textColor: 'text-yellow-600 dark:text-yellow-400',
    badgeBg: 'bg-yellow-100 dark:bg-yellow-900/40',
    iconColor: 'text-yellow-500',
  },
};

const URGENCY_ORDER: UrgencyLevel[] = ['Critical', 'High', 'Medium', 'Low'];

const BULK_ACTION_CONFIG: Record<BulkAction, { apiFn: (id: number) => Promise<unknown>; label: string }> = {
  'attended': { apiFn: sessionsAPI.markAttended, label: 'attended' },
  'no-show': { apiFn: sessionsAPI.markNoShow, label: 'no show' },
};

export default function UncheckedAttendancePage() {
  usePageTitle("Unchecked Attendance");

  const searchParams = useSearchParams();
  const urgencyFilter = searchParams.get('urgency') as UrgencyLevel | null;

  const { selectedLocation } = useLocation();
  const { viewMode } = useRole();
  const { user, isImpersonating, impersonatedTutor, effectiveRole } = useAuth();
  const { showToast } = useToast();
  const haptic = useHaptic();

  const [selectedTutorId, setSelectedTutorId] = useState<TutorValue>(ALL_TUTORS);
  const [markingId, setMarkingId] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Session detail popover state
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverLoading, setPopoverLoading] = useState(false);
  const [popoverSession, setPopoverSession] = useState<Session | null>(null);
  const [popoverClickPosition, setPopoverClickPosition] = useState<{ x: number; y: number } | null>(null);

  // Pagination limits per urgency section
  const [sectionLimits, setSectionLimits] = useState<Record<UrgencyLevel, number>>({
    Critical: 10,
    High: 10,
    Medium: 10,
    Low: 10,
  });

  // Bulk action state
  const [bulkActionLoading, setBulkActionLoading] = useState<BulkAction | null>(null);
  const [currentProcessingId, setCurrentProcessingId] = useState<number | null>(null);

  // Determine effective location
  const effectiveLocation = useMemo(() => {
    return selectedLocation && selectedLocation !== "All Locations" ? selectedLocation : undefined;
  }, [selectedLocation]);

  // Get effective user ID (respects impersonation) - same logic as Sidebar
  const effectiveUserId = useMemo(() => {
    if (isImpersonating && effectiveRole === 'Tutor' && impersonatedTutor?.id) {
      return impersonatedTutor.id;
    }
    return user?.id;
  }, [isImpersonating, effectiveRole, impersonatedTutor, user?.id]);

  // Determine effective tutor ID for API calls based on view mode
  const effectiveTutorId = useMemo(() => {
    if (isImpersonating && effectiveRole === 'Tutor' && impersonatedTutor?.id) {
      return impersonatedTutor.id;
    }
    if (viewMode === 'my-view' && effectiveUserId) {
      return effectiveUserId;
    }
    if (selectedTutorId === ALL_TUTORS) return undefined;
    if (typeof selectedTutorId === 'number') return selectedTutorId;
    return undefined;
  }, [selectedTutorId, viewMode, effectiveUserId, isImpersonating, effectiveRole, impersonatedTutor?.id]);

  // Fetch unchecked attendance sessions
  const { data: uncheckedSessions = [], isLoading, mutate: mutateUnchecked } = useUncheckedAttendance(
    effectiveLocation,
    effectiveTutorId
  );

  // Auto-select tutor for my-view mode (for TutorSelector display)
  useEffect(() => {
    if (isImpersonating && effectiveRole === 'Tutor' && impersonatedTutor?.id) {
      setSelectedTutorId(impersonatedTutor.id);
    } else if (viewMode === 'my-view' && effectiveUserId) {
      setSelectedTutorId(effectiveUserId);
    } else if (viewMode === 'center-view') {
      setSelectedTutorId(ALL_TUTORS);
    }
  }, [viewMode, effectiveUserId, isImpersonating, effectiveRole, impersonatedTutor?.id]);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Group sessions by urgency level
  const sessionsByUrgency = useMemo(() => {
    const grouped: Record<UrgencyLevel, UncheckedAttendanceReminder[]> = {
      Critical: [],
      High: [],
      Medium: [],
      Low: [],
    };
    for (const session of uncheckedSessions) {
      const level = session.urgency_level as UrgencyLevel;
      if (grouped[level]) {
        grouped[level].push(session);
      }
    }
    return grouped;
  }, [uncheckedSessions]);

  // Filter by URL param if present
  const filteredSessionsByUrgency = useMemo(() => {
    if (!urgencyFilter || !URGENCY_LEVELS[urgencyFilter]) {
      return sessionsByUrgency;
    }
    const filtered: Record<UrgencyLevel, UncheckedAttendanceReminder[]> = {
      Critical: [],
      High: [],
      Medium: [],
      Low: [],
    };
    filtered[urgencyFilter] = sessionsByUrgency[urgencyFilter];
    return filtered;
  }, [sessionsByUrgency, urgencyFilter]);

  // Precompute visible IDs per section and total (shared by selection logic)
  const visibleIdsBySection = useMemo(() => {
    const map: Record<UrgencyLevel, number[]> = { Critical: [], High: [], Medium: [], Low: [] };
    for (const level of URGENCY_ORDER) {
      map[level] = filteredSessionsByUrgency[level].slice(0, sectionLimits[level]).map(s => s.session_id);
    }
    return map;
  }, [filteredSessionsByUrgency, sectionLimits]);

  const allVisibleIds = useMemo(() => {
    return URGENCY_ORDER.flatMap(level => visibleIdsBySection[level]);
  }, [visibleIdsBySection]);

  // Bulk selection (shared hook)
  const { selectedIds, toggleSelect, toggleSelectAll, clearSelection, hasSelection, isAllSelected } = useBulkSelection(allVisibleIds);

  // Reset pagination and selection when filters change
  useEffect(() => {
    setSectionLimits({ Critical: 10, High: 10, Medium: 10, Low: 10 });
    clearSelection();
  }, [effectiveLocation, effectiveTutorId, urgencyFilter, clearSelection]);

  // Count per urgency level
  const urgencyCounts = useMemo(() => ({
    Critical: sessionsByUrgency.Critical.length,
    High: sessionsByUrgency.High.length,
    Medium: sessionsByUrgency.Medium.length,
    Low: sessionsByUrgency.Low.length,
  }), [sessionsByUrgency]);

  // Section-level selection helpers
  const toggleSectionSelect = useCallback((level: UrgencyLevel) => {
    const sectionIds = visibleIdsBySection[level];
    const allSelected = sectionIds.every(id => selectedIds.has(id));
    if (allSelected) {
      // Deselect section IDs from current selection
      const next = new Set(selectedIds);
      sectionIds.forEach(id => next.delete(id));
      // Use toggleSelect to rebuild — or directly set via selectIds pattern
      // Since useBulkSelection doesn't expose setSelectedIds, toggle each
      sectionIds.forEach(id => toggleSelect(id));
    } else {
      // Select all in section that aren't already selected
      sectionIds.filter(id => !selectedIds.has(id)).forEach(id => toggleSelect(id));
    }
  }, [visibleIdsBySection, selectedIds, toggleSelect]);

  const getSectionSelectionState = useCallback((level: UrgencyLevel): 'none' | 'partial' | 'all' => {
    const sectionIds = visibleIdsBySection[level];
    if (sectionIds.length === 0) return 'none';
    const selectedCount = sectionIds.filter(id => selectedIds.has(id)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === sectionIds.length) return 'all';
    return 'partial';
  }, [visibleIdsBySection, selectedIds]);

  // Handle session row click - show popover
  const handleSessionRowClick = useCallback(async (sessionId: number, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setPopoverClickPosition({ x: event.clientX, y: event.clientY });
    setPopoverOpen(true);
    setPopoverLoading(true);
    setPopoverSession(null);

    try {
      const fullSession = await sessionsAPI.getById(sessionId);
      setPopoverSession(fullSession);
    } catch {
      setPopoverOpen(false);
    } finally {
      setPopoverLoading(false);
    }
  }, []);

  const closePopover = useCallback(() => {
    setPopoverOpen(false);
    setPopoverSession(null);
  }, []);

  // Individual mark handler (parameterized)
  const handleMark = useCallback(async (sessionId: number, action: BulkAction) => {
    haptic.trigger("medium");
    setMarkingId(sessionId);
    try {
      await BULK_ACTION_CONFIG[action].apiFn(sessionId);
      mutateUnchecked();
      mutate(['unchecked-attendance-count', effectiveLocation || 'all', effectiveTutorId || 'all']);
      showToast(`Marked as ${BULK_ACTION_CONFIG[action].label}`, "success");
    } catch {
      showToast("Failed to mark attendance", "error");
    } finally {
      setMarkingId(null);
    }
  }, [mutateUnchecked, effectiveLocation, effectiveTutorId, showToast, haptic]);

  // Bulk action handler (parameterized)
  const handleBulkAction = useCallback(async (action: BulkAction) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const { apiFn, label } = BULK_ACTION_CONFIG[action];
    haptic.trigger("medium");
    setBulkActionLoading(action);

    let successCount = 0;
    let failCount = 0;

    for (const id of ids) {
      setCurrentProcessingId(id);
      try {
        await apiFn(id);
        successCount++;
      } catch {
        failCount++;
      }
    }

    setCurrentProcessingId(null);
    setBulkActionLoading(null);
    clearSelection();
    mutateUnchecked();
    mutate(['unchecked-attendance-count', effectiveLocation || 'all', effectiveTutorId || 'all']);

    if (failCount === 0) {
      showToast(`${successCount} session${successCount !== 1 ? 's' : ''} marked as ${label}`, 'success');
    } else {
      showToast(`${successCount} succeeded, ${failCount} failed`, failCount > successCount ? 'error' : 'info');
    }
  }, [selectedIds, clearSelection, mutateUnchecked, effectiveLocation, effectiveTutorId, showToast, haptic]);

  const totalCount = uncheckedSessions.length;
  const isDisabled = markingId !== null || bulkActionLoading !== null;
  const colCount = viewMode === 'center-view' ? 9 : 8;

  return (
    <DeskSurface>
      <PageTransition>
        <div className="min-h-screen">
          <div className="flex flex-col gap-3 p-2 sm:p-4">
            {/* Toolbar */}
            <div className={cn(
              "sticky top-0 z-30 flex flex-wrap items-center gap-2 sm:gap-3",
              "bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47]",
              "rounded-lg px-3 sm:px-4 py-2",
              !isMobile && "paper-texture"
            )}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full">
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap flex-1">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-[#a0704b] dark:text-[#cd853f]" />
                    <h1 className="text-lg font-semibold">Unchecked Attendance</h1>
                    {urgencyFilter && URGENCY_LEVELS[urgencyFilter] && (
                      <Link
                        href="/unchecked-attendance"
                        className={cn(
                          "px-2 py-0.5 text-xs font-medium rounded-full flex items-center gap-1",
                          URGENCY_LEVELS[urgencyFilter].badgeBg,
                          URGENCY_LEVELS[urgencyFilter].textColor
                        )}
                      >
                        {URGENCY_LEVELS[urgencyFilter].label}
                        <span className="text-[10px]">×</span>
                      </Link>
                    )}
                  </div>

                  {viewMode === 'center-view' && (
                    <TutorSelector
                      value={selectedTutorId}
                      onChange={setSelectedTutorId}
                      location={effectiveLocation}
                      showAllTutors
                    />
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className={cn(
                    "px-3 py-1 rounded-full text-sm font-medium",
                    totalCount > 0
                      ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
                      : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                  )}>
                    {totalCount} Need Attention
                  </span>
                </div>
              </div>
            </div>

            {/* Bulk Action Bar */}
            {hasSelection && (
              <div className={cn(
                "sticky top-[52px] z-25",
                "bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47]",
                "rounded-lg px-3 sm:px-4 py-2"
              )}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                    {selectedIds.size} selected
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
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
                    <button
                      onClick={toggleSelectAll}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-[#f0e0cc] dark:bg-[#4a3d2e] text-[#a0704b] dark:text-[#cd853f] hover:bg-[#e8d4b8] dark:hover:bg-[#5a4a38]"
                    >
                      <CheckSquare className="h-3 w-3" />
                      <span className="hidden xs:inline">{isAllSelected ? 'Deselect All' : 'Select All'}</span>
                    </button>
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

            {/* Main content */}
            <div className="space-y-4">
              {/* Urgency Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {URGENCY_ORDER.map((level) => {
                  const config = URGENCY_LEVELS[level];
                  const count = urgencyCounts[level];
                  const isActive = urgencyFilter === level;
                  return (
                    <Link
                      key={level}
                      href={isActive ? '/unchecked-attendance' : `/unchecked-attendance?urgency=${level}`}
                      className={cn(
                        "p-3 rounded-lg border text-center transition-all",
                        config.bgColor,
                        config.borderColor,
                        isActive && "ring-2 ring-offset-2 ring-[#a0704b]"
                      )}
                    >
                      <div className={cn("text-2xl font-bold", config.textColor)}>
                        {count}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {config.label}
                      </div>
                    </Link>
                  );
                })}
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : totalCount === 0 ? (
                <StickyNote icon={ClipboardList} color="green">
                  <p className="text-lg font-medium">All attendance is up to date!</p>
                  <p className="text-muted-foreground">
                    No unchecked sessions found for the current filters.
                  </p>
                </StickyNote>
              ) : (
                <>
                  {URGENCY_ORDER.map((level) => {
                    const config = URGENCY_LEVELS[level];
                    const sessions = filteredSessionsByUrgency[level];
                    const limit = sectionLimits[level];
                    const hasMore = sessions.length > limit;
                    const sectionState = getSectionSelectionState(level);

                    if (sessions.length === 0) return null;

                    return (
                      <div
                        key={level}
                        className={cn(
                          "bg-white dark:bg-[#1a1a1a] rounded-xl border shadow-sm overflow-hidden",
                          config.borderColor,
                          !isMobile && "paper-texture"
                        )}
                      >
                        {/* Section Header */}
                        <div className={cn(
                          "px-4 py-3 border-b flex items-center justify-between",
                          config.bgColor,
                          config.borderColor
                        )}>
                          <h2 className={cn("font-medium flex items-center gap-2", config.textColor)}>
                            <AlertTriangle className="h-4 w-4" />
                            {config.sectionLabel}
                          </h2>
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-xs font-medium",
                            config.badgeBg,
                            config.textColor
                          )}>
                            {sessions.length}
                          </span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="pl-3 pr-1 py-3 w-8">
                                  <button
                                    onClick={() => toggleSectionSelect(level)}
                                    disabled={isDisabled}
                                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                    title={sectionState === 'all' ? 'Deselect section' : 'Select section'}
                                  >
                                    {sectionState === 'all' ? (
                                      <CheckSquare className="h-4 w-4 text-[#a0704b] dark:text-[#cd853f]" />
                                    ) : sectionState === 'partial' ? (
                                      <Minus className="h-4 w-4 text-[#a0704b] dark:text-[#cd853f]" />
                                    ) : (
                                      <Square className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                                    )}
                                  </button>
                                </th>
                                <th className="px-4 py-3 text-left font-medium">Date</th>
                                <th className="px-4 py-3 text-left font-medium">Time</th>
                                <th className="px-4 py-3 text-left font-medium min-w-[120px]">Student</th>
                                <th className="px-4 py-3 text-left font-medium w-16">Grade</th>
                                {viewMode === 'center-view' && (
                                  <th className="px-4 py-3 text-left font-medium min-w-[100px]">Tutor</th>
                                )}
                                <th className="px-4 py-3 text-left font-medium">Status</th>
                                <th className="px-4 py-3 text-center font-medium w-16">Days</th>
                                <th className="px-4 py-3 text-right w-48"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#e8d4b8] dark:divide-[#6b5a4a]">
                              {sessions.slice(0, limit).map((session) => {
                                const isSelected = selectedIds.has(session.session_id);
                                const isProcessing = currentProcessingId === session.session_id;

                                return (
                                  <tr
                                    key={session.session_id}
                                    onClick={(e) => handleSessionRowClick(session.session_id, e)}
                                    className={cn(
                                      "hover:bg-[#f5ede3]/50 dark:hover:bg-[#3d3628]/50 transition-colors cursor-pointer",
                                      isSelected && "bg-[#f5ede3]/70 dark:bg-[#3d3628]/70"
                                    )}
                                  >
                                    <td className="pl-3 pr-1 py-3">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleSelect(session.session_id);
                                        }}
                                        disabled={isDisabled}
                                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                      >
                                        {isProcessing ? (
                                          <Loader2 className="h-4 w-4 animate-spin text-[#a0704b] dark:text-[#cd853f]" />
                                        ) : isSelected ? (
                                          <CheckSquare className="h-4 w-4 text-[#a0704b] dark:text-[#cd853f]" />
                                        ) : (
                                          <Square className="h-4 w-4 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300" />
                                        )}
                                      </button>
                                    </td>
                                    <td className="px-4 py-3">
                                      {formatDateCompact(session.session_date)}
                                    </td>
                                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                                      {session.time_slot || '-'}
                                    </td>
                                    <td className="px-4 py-3 font-medium">
                                      {session.student_name}
                                      {session.school_student_id && (
                                        <div className="text-xs text-gray-500 font-mono">
                                          {session.school_student_id}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                                      {session.grade || '-'}
                                    </td>
                                    {viewMode === 'center-view' && (
                                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                                        {session.tutor_name}
                                      </td>
                                    )}
                                    <td className="px-4 py-3">
                                      <SessionStatusTag status={session.session_status} size="sm" />
                                    </td>
                                    <td className="px-4 py-3 text-center whitespace-nowrap">
                                      <span className={cn(
                                        "px-2 py-0.5 rounded-full text-xs font-medium inline-block",
                                        config.badgeBg,
                                        config.textColor
                                      )}>
                                        {session.days_overdue}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-right whitespace-nowrap">
                                      <div className="flex items-center justify-end gap-2 flex-nowrap">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleMark(session.session_id, 'attended');
                                          }}
                                          disabled={isDisabled}
                                          title="Mark as attended"
                                          className={cn(
                                            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                                            "bg-green-600 text-white shadow-sm",
                                            "hover:bg-green-700 hover:shadow",
                                            "disabled:opacity-50"
                                          )}
                                        >
                                          {markingId === session.session_id ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                          ) : (
                                            <Check className="h-3 w-3" />
                                          )}
                                          <span className="hidden sm:inline">Attended</span>
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleMark(session.session_id, 'no-show');
                                          }}
                                          disabled={isDisabled}
                                          title="Mark as no show"
                                          className={cn(
                                            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                                            "bg-red-600 text-white shadow-sm",
                                            "hover:bg-red-700 hover:shadow",
                                            "disabled:opacity-50"
                                          )}
                                        >
                                          <X className="h-3 w-3" />
                                          <span className="hidden sm:inline">No Show</span>
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            {hasMore && (
                              <tfoot>
                                <tr>
                                  <td colSpan={colCount} className="px-4 py-2 text-center">
                                    <button
                                      onClick={() => setSectionLimits(prev => ({
                                        ...prev,
                                        [level]: prev[level] + 10
                                      }))}
                                      className="text-sm font-medium text-[#a0704b] dark:text-[#cd853f] hover:underline"
                                    >
                                      Show {Math.min(10, sessions.length - limit)} more...
                                    </button>
                                  </td>
                                </tr>
                              </tfoot>
                            )}
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>

        <SessionDetailPopover
          session={popoverSession}
          isOpen={popoverOpen}
          isLoading={popoverLoading}
          onClose={closePopover}
          clickPosition={popoverClickPosition}
        />
      </PageTransition>
    </DeskSurface>
  );
}
