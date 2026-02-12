"use client";

import React, { useEffect, useLayoutEffect, useState, useMemo, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useSessions, useActiveTutors, usePageTitle, useProposalsInDateRange, useProposalsForOriginalSessions, usePendingMemoCount, useUncheckedAttendanceCount } from "@/lib/hooks";
import { useLocation } from "@/contexts/LocationContext";
import { useRole } from "@/contexts/RoleContext";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session, Tutor, MakeupProposal } from "@/types";
import Link from "next/link";
import { Calendar, Clock, ChevronRight, ChevronDown, ExternalLink, HandCoins, CheckSquare, Square, MinusSquare, CheckCheck, X, UserX, CalendarClock, CalendarPlus, Ambulance, CloudRain, PenTool, Home, RefreshCw, GraduationCap, Loader2, StickyNote as StickyNoteIcon, Presentation, ClipboardCheck } from "lucide-react";
import { getSessionStatusConfig, getStatusSortOrder, getDisplayStatus, isCountableSession } from "@/lib/session-status";
import { SessionActionButtons } from "@/components/ui/action-buttons";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition, IndexCard, StickyNote } from "@/lib/design-system";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ViewSwitcher, type ViewMode } from "@/components/sessions/ViewSwitcher";
import { StatusFilterDropdown } from "@/components/sessions/StatusFilterDropdown";
import { ExerciseDropdownButton } from "@/components/sessions/ExerciseDropdownButton";
import { groupExercisesByStudent, bulkDownloadByStudent, bulkPrintAllStudents } from "@/lib/bulk-exercise-download";

// Loading skeleton for grid views
const GridViewLoading = () => (
  <div className="flex-1 flex items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
);

// Dynamic imports for view components - only loaded when needed
const WeeklyGridView = dynamic(
  () => import("@/components/sessions/WeeklyGridView").then(mod => mod.WeeklyGridView),
  { loading: GridViewLoading }
);

const DailyGridView = dynamic(
  () => import("@/components/sessions/DailyGridView").then(mod => mod.DailyGridView),
  { loading: GridViewLoading }
);

const MonthlyCalendarView = dynamic(
  () => import("@/components/sessions/MonthlyCalendarView").then(mod => mod.MonthlyCalendarView),
  { loading: GridViewLoading }
);
// Lazy-load modal components to reduce initial bundle size
const SessionDetailPopover = dynamic(
  () => import("@/components/sessions/SessionDetailPopover").then(m => m.SessionDetailPopover),
  { ssr: false }
);
const BulkExerciseModal = dynamic(
  () => import("@/components/sessions/BulkExerciseModal").then(m => m.BulkExerciseModal),
  { ssr: false }
);
const ExerciseModal = dynamic(
  () => import("@/components/sessions/ExerciseModal").then(m => m.ExerciseModal),
  { ssr: false }
);
const RateSessionModal = dynamic(
  () => import("@/components/sessions/RateSessionModal").then(m => m.RateSessionModal),
  { ssr: false }
);
const EditSessionModal = dynamic(
  () => import("@/components/sessions/EditSessionModal").then(m => m.EditSessionModal),
  { ssr: false }
);
const MemoModal = dynamic(
  () => import("@/components/sessions/MemoModal").then(m => m.MemoModal),
  { ssr: false }
);
const MemoListDrawer = dynamic(
  () => import("@/components/sessions/MemoListDrawer").then(m => m.MemoListDrawer),
  { ssr: false }
);
import { StarRating, parseStarRating } from "@/components/ui/star-rating";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
import { toDateString, getWeekBounds, getMonthBounds } from "@/lib/calendar-utils";
import { sessionsAPI } from "@/lib/api";
import { updateSessionInCache } from "@/lib/session-cache";
import { useToast } from "@/contexts/ToastContext";
import { useCommandPalette } from "@/contexts/CommandPaletteContext";
import { getGradeColor, CURRENT_USER_TUTOR } from "@/lib/constants";
import { getTutorSortName, canBeMarked } from "@/components/zen/utils/sessionSorting";
import { ProposedSessionRow } from "@/components/sessions/ProposedSessionCard";
import { ProposalIndicatorBadge } from "@/components/sessions/ProposalIndicatorBadge";
const ProposalDetailModal = dynamic(
  () => import("@/components/sessions/ProposalDetailModal").then(m => m.ProposalDetailModal),
  { ssr: false }
);
import { proposalSlotsToSessions, createSessionProposalMap, type ProposedSession } from "@/lib/proposal-utils";

// Key for storing scroll position in sessionStorage
const SCROLL_POSITION_KEY = 'sessions-list-scroll-position';

// Pending make-up statuses for special filter
const PENDING_MAKEUP_STATUSES = [
  "Rescheduled - Pending Make-up",
  "Sick Leave - Pending Make-up",
  "Weather Cancelled - Pending Make-up",
];

export default function SessionsPage() {
  usePageTitle("Sessions");

  const { selectedLocation } = useLocation();
  const { viewMode: roleViewMode } = useRole();  // center-view or my-view
  const { user, isImpersonating, impersonatedTutor, effectiveRole } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { isOpen: isCommandPaletteOpen } = useCommandPalette();

  // Initialize state from URL query params (with fallbacks)
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const dateParam = searchParams.get('date');
    return dateParam ? new Date(dateParam + 'T00:00:00') : new Date();
  });
  const [statusFilter, setStatusFilter] = useState(() => {
    return searchParams.get('status') || "";
  });
  const [tutorFilter, setTutorFilter] = useState(() => {
    return searchParams.get('tutor') || "";
  });
  // Track if URL had an explicit ?tutor= param (consumed once on mount)
  const urlTutorOverride = useRef(searchParams.get('tutor') || '');

  // Get the effective user ID (respects impersonation)
  const effectiveUserId = useMemo(() => {
    if (isImpersonating && effectiveRole === 'Tutor' && impersonatedTutor?.id) {
      return impersonatedTutor.id.toString();
    }
    return user?.id?.toString() || "";
  }, [isImpersonating, effectiveRole, impersonatedTutor, user?.id]);

  // Sync tutor filter with center/my view mode
  useEffect(() => {
    // On mount, respect explicit ?tutor= param (e.g., navigated from session popover)
    if (urlTutorOverride.current) {
      setTutorFilter(urlTutorOverride.current);
      urlTutorOverride.current = '';
      return;
    }
    if (roleViewMode === 'my-view') {
      // In my-view, default to own tutor
      setTutorFilter(effectiveUserId);
    } else {
      // In center-view, show all tutors
      setTutorFilter("");
    }
  }, [roleViewMode, effectiveUserId]);

  // Special filter modes (e.g., "pending-makeups")
  const [specialFilter, setSpecialFilter] = useState(() => {
    return searchParams.get('filter') || "";
  });
  const [isMobile, setIsMobile] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const param = searchParams.get('view');
    return (param as ViewMode) || 'list';
  });

  // Sync state from URL when searchParams change (for client-side navigation)
  useEffect(() => {
    const urlFilter = searchParams.get('filter') || "";
    const urlView = searchParams.get('view') as ViewMode | null;
    const urlDate = searchParams.get('date');
    const urlStatus = searchParams.get('status') || "";

    if (urlFilter !== specialFilter) {
      setSpecialFilter(urlFilter);
    }
    if (urlView && urlView !== viewMode) {
      setViewMode(urlView);
    } else if (!urlView && viewMode !== 'list') {
      // Reset to list if no view param in URL
      setViewMode('list');
    }
    if (urlDate) {
      const parsed = new Date(urlDate + 'T00:00:00');
      if (!isNaN(parsed.getTime()) && parsed.toDateString() !== selectedDate.toDateString()) {
        setSelectedDate(parsed);
      }
    }
    if (urlStatus !== statusFilter) {
      setStatusFilter(urlStatus);
    }
    // Apply tutor from URL (for client-side navigation, e.g., session popover link)
    const urlTutor = searchParams.get('tutor');
    if (urlTutor) {
      urlTutorOverride.current = urlTutor;  // Protect from roleViewMode override
      if (urlTutor !== tutorFilter) {
        setTutorFilter(urlTutor);
      }
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build filters for SWR hook
  const sessionFilters = useMemo(() => {
    const filters: Record<string, string | number | undefined> = {
      location: selectedLocation !== "All Locations" ? selectedLocation : undefined,
      status: statusFilter || undefined,
      tutor_id: tutorFilter ? parseInt(tutorFilter) : undefined,
      limit: viewMode === "monthly" ? 2000 : 500,
    };

    // Special filter: pending-makeups overrides date and status
    if (specialFilter === "pending-makeups") {
      // 60 days ago, no upper bound
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      filters.from_date = toDateString(sixtyDaysAgo);
      filters.status = PENDING_MAKEUP_STATUSES.join(",");
      filters.limit = 500;
    } else if (viewMode === "list" || viewMode === "daily") {
      filters.date = toDateString(selectedDate);
    } else if (viewMode === "weekly") {
      const { start, end } = getWeekBounds(selectedDate);
      filters.from_date = toDateString(start);
      filters.to_date = toDateString(end);
    } else if (viewMode === "monthly") {
      const { start, end } = getMonthBounds(selectedDate);
      filters.from_date = toDateString(start);
      filters.to_date = toDateString(end);
    }

    return filters;
  }, [selectedDate, statusFilter, tutorFilter, selectedLocation, viewMode, specialFilter]);

  // SWR hooks for data fetching with caching
  const { data: sessions = [], error, isLoading: loading, mutate: mutateSessions } = useSessions(sessionFilters);
  const { data: tutors = [] } = useActiveTutors();

  // Scroll to time slot specified in URL ?slot= param (once per navigation)
  const lastScrolledSlot = useRef('');
  useEffect(() => {
    const slot = searchParams.get('slot');
    if (!slot || slot === lastScrolledSlot.current || loading || sessions.length === 0) return;
    lastScrolledSlot.current = slot;
    requestAnimationFrame(() => {
      const el = document.getElementById(`slot-${slot}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [searchParams, loading, sessions.length]);


  // Get current user's tutor ID for proposal actions
  const currentTutorId = useMemo(() => {
    const tutor = tutors.find((t) => t.tutor_name === CURRENT_USER_TUTOR);
    return tutor?.id ?? 0;
  }, [tutors]);

  const isAdminRole = effectiveRole === "Admin" || effectiveRole === "Super Admin";
  const { data: pendingMemoData } = usePendingMemoCount(isAdminRole ? undefined : currentTutorId || undefined);

  // Fetch proposals for the current date range (for showing proposed sessions)
  const proposalDateRange = useMemo(() => {
    if (specialFilter === "pending-makeups") {
      // Don't show proposed sessions in pending makeups view
      return { from: null, to: null };
    }
    if (viewMode === "list" || viewMode === "daily") {
      return { from: toDateString(selectedDate), to: toDateString(selectedDate) };
    } else if (viewMode === "weekly") {
      const { start, end } = getWeekBounds(selectedDate);
      return { from: toDateString(start), to: toDateString(end) };
    } else if (viewMode === "monthly") {
      const { start, end } = getMonthBounds(selectedDate);
      return { from: toDateString(start), to: toDateString(end) };
    }
    return { from: null, to: null };
  }, [selectedDate, viewMode, specialFilter]);

  // Fetch proposals where PROPOSED SLOTS are in the date range (for ghost session display)
  const { data: proposalsForSlots = [] } = useProposalsInDateRange(
    proposalDateRange.from,
    proposalDateRange.to
  );

  // Fetch proposals where ORIGINAL SESSION is in the date range (for indicator badge on original sessions)
  const { data: proposalsForOriginals = [] } = useProposalsForOriginalSessions(
    proposalDateRange.from,
    proposalDateRange.to
  );

  // Create lookup map: session_id -> proposal (for showing indicators on pending makeup sessions)
  // Uses proposals fetched by original session date so badges show correctly
  const sessionProposalMap = useMemo(() => {
    return createSessionProposalMap(proposalsForOriginals);
  }, [proposalsForOriginals]);

  // Convert proposal slots to session-like objects for display
  // Uses proposals fetched by slot date so ghost sessions appear on correct dates
  const proposedSessions = useMemo(() => {
    return proposalSlotsToSessions(proposalsForSlots);
  }, [proposalsForSlots]);

  // Popover state for list view
  const [popoverSession, setPopoverSession] = useState<Session | null>(null);
  const [popoverClickPosition, setPopoverClickPosition] = useState<{ x: number; y: number } | null>(null);

  // Proposal detail modal state
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

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkExerciseType, setBulkExerciseType] = useState<"CW" | "HW" | null>(null);
  const [memoModalOpen, setMemoModalOpen] = useState(false);
  const [memoDrawerOpen, setMemoDrawerOpen] = useState(false);
  const [showSelectDropdown, setShowSelectDropdown] = useState(false);
  const [slotDropdownOpen, setSlotDropdownOpen] = useState<string | null>(null);

  // Keyboard navigation state (J/K to move, Enter to open popover)
  const [focusedSessionId, setFocusedSessionId] = useState<number | null>(null);
  // Use a Map to store refs for all cards (avoids conditional ref timing issues)
  const cardRefsMap = useRef<Map<number, HTMLDivElement>>(new Map());

  // Quick action state (for keyboard shortcuts on focused card)
  const [quickActionSession, setQuickActionSession] = useState<Session | null>(null);
  const [quickActionType, setQuickActionType] = useState<'CW' | 'HW' | 'Rate' | 'Edit' | null>(null);

  // Loading state for keyboard-triggered A/N actions (Map to track which action per session)
  const [loadingSessionActions, setLoadingSessionActions] = useState<Map<number, string>>(new Map());

  // Keyboard shortcut hints panel visibility
  const [showShortcutHints, setShowShortcutHints] = useState(false);

  // Track if scrolled past threshold (to move ? button above scroll-to-top)
  const [isScrolledPastThreshold, setIsScrolledPastThreshold] = useState(false);

  // Collapse state for time slot groups
  const [collapsedSlots, setCollapsedSlots] = useState<Set<string>>(new Set());

  const toggleSlot = (timeSlot: string) => {
    setCollapsedSlots(prev => {
      const next = new Set(prev);
      if (next.has(timeSlot)) {
        next.delete(timeSlot);
      } else {
        next.add(timeSlot);
      }
      return next;
    });
  };

  // Toolbar height tracking for dynamic sticky offset
  // Use callback ref (setState) so effect re-runs when element mounts
  const [toolbarElement, setToolbarElement] = useState<HTMLDivElement | null>(null);
  const [toolbarHeight, setToolbarHeight] = useState(52);

  // Bulk action bar height tracking
  const [bulkActionBarElement, setBulkActionBarElement] = useState<HTMLDivElement | null>(null);
  const [bulkActionBarHeight, setBulkActionBarHeight] = useState(0);

  // Scroll container ref for position restoration
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Track time slots that have been rendered (to skip stagger animation on re-expand)
  const seenSlotsRef = useRef<Set<string>>(new Set());

  // Track toolbar height changes (for responsive wrapping)
  useLayoutEffect(() => {
    // Only track when in list view and element is mounted
    if (viewMode !== "list" || !toolbarElement) return;

    const updateHeight = () => {
      setToolbarHeight(toolbarElement.getBoundingClientRect().height);
    };

    // Initial measurement
    updateHeight();

    // ResizeObserver for element size changes
    const resizeObserver = new ResizeObserver(() => {
      updateHeight();
    });
    resizeObserver.observe(toolbarElement);

    // Window resize listener as backup (for when wrapping changes due to width)
    window.addEventListener('resize', updateHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, [viewMode, toolbarElement]);

  // Track bulk action bar height changes
  useLayoutEffect(() => {
    if (!bulkActionBarElement) {
      setBulkActionBarHeight(0);
      return;
    }

    const updateHeight = () => {
      setBulkActionBarHeight(bulkActionBarElement.getBoundingClientRect().height);
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(bulkActionBarElement);

    return () => resizeObserver.disconnect();
  }, [bulkActionBarElement]);

  // Detect mobile device for performance optimization
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Sync view state to URL (use replace to avoid polluting history)
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('view', viewMode);
    // Special filters override normal date/status params
    if (specialFilter) {
      params.set('filter', specialFilter);
    } else {
      params.set('date', toDateString(selectedDate));
      if (statusFilter) params.set('status', statusFilter);
    }
    if (tutorFilter) params.set('tutor', tutorFilter);

    router.replace(`/sessions?${params.toString()}`, { scroll: false });
  }, [viewMode, selectedDate, statusFilter, tutorFilter, specialFilter, router]);

  // Restore scroll position when returning to list view (after data loads)
  useEffect(() => {
    if (viewMode !== 'list' || loading) return;

    const savedPosition = sessionStorage.getItem(SCROLL_POSITION_KEY);
    if (savedPosition && scrollContainerRef.current) {
      // Use requestAnimationFrame to ensure DOM is ready after render
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = parseInt(savedPosition, 10);
        }
        sessionStorage.removeItem(SCROLL_POSITION_KEY);
      });
    }
  }, [viewMode, loading]);

  // Track scroll position to move ? button above scroll-to-top when needed
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setIsScrolledPastThreshold(container.scrollTop > 300);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Save scroll position before navigating to session detail
  const saveScrollPosition = () => {
    if (scrollContainerRef.current) {
      sessionStorage.setItem(SCROLL_POSITION_KEY, scrollContainerRef.current.scrollTop.toString());
    }
  };


  // Handle card click - open popover at click position
  const handleCardClick = (session: Session, event: React.MouseEvent) => {
    setPopoverClickPosition({ x: event.clientX, y: event.clientY });
    setPopoverSession(session);
  };

  // Group sessions by time slot (including proposed sessions' time slots)
  const groupedSessions = useMemo(() => {
    const groups: Record<string, Session[]> = {};

    sessions.forEach((session) => {
      const timeSlot = session.time_slot || "Unscheduled";
      if (!groups[timeSlot]) {
        groups[timeSlot] = [];
      }
      groups[timeSlot].push(session);
    });

    // Add empty entries for proposed sessions' time slots (for selected date)
    // so they have a place to render in the list view
    const selectedDateString = toDateString(selectedDate);
    proposedSessions
      .filter((ps) => ps.session_date === selectedDateString)
      .forEach((ps) => {
        const timeSlot = ps.time_slot;
        if (timeSlot && !groups[timeSlot]) {
          groups[timeSlot] = [];
        }
      });

    // Sort sessions within each group using main group priority
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

    // Sort time slots chronologically
    return Object.entries(groups).sort(([timeA], [timeB]) => {
      // Handle "Unscheduled" to appear last
      if (timeA === "Unscheduled") return 1;
      if (timeB === "Unscheduled") return -1;

      const startA = timeA.split("-")[0];
      const startB = timeB.split("-")[0];
      return startA.localeCompare(startB);
    });
  }, [sessions, selectedDate, proposedSessions]);

  // Group sessions by student for pending-makeups view
  const groupedByStudent = useMemo(() => {
    if (specialFilter !== "pending-makeups") return null;

    const groups: Record<string, Session[]> = {};
    sessions.forEach(session => {
      const key = `${session.student_id}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(session);
    });

    // Sort sessions within each student by date ascending
    Object.values(groups).forEach(studentSessions => {
      studentSessions.sort((a, b) =>
        new Date(a.session_date).getTime() - new Date(b.session_date).getTime()
      );
    });

    // Sort groups by school_student_id
    return Object.entries(groups).sort(([, a], [, b]) => {
      const idA = a[0]?.school_student_id || '';
      const idB = b[0]?.school_student_id || '';
      return idA.localeCompare(idB);
    });
  }, [sessions, specialFilter]);

  // Filter and sort tutors by selected location
  const filteredTutors = useMemo(() => {
    const filtered = selectedLocation === "All Locations"
      ? tutors
      : tutors.filter(t => t.default_location === selectedLocation);
    return [...filtered].sort((a, b) =>
      getTutorSortName(a.tutor_name).localeCompare(getTutorSortName(b.tutor_name))
    );
  }, [tutors, selectedLocation]);

  // Bulk selection computations - use grouped order to match visual display
  const allSessionIds = useMemo(() => {
    // For pending-makeups view, use groupedByStudent order
    if (groupedByStudent) {
      return groupedByStudent.flatMap(([_, studentSessions]) => studentSessions.map(s => s.id));
    }
    // For normal view, use groupedSessions order (by time slot)
    return groupedSessions.flatMap(([_, sessionsInSlot]) => sessionsInSlot.map(s => s.id));
  }, [groupedSessions, groupedByStudent]);

  const selectedSessions = useMemo(() =>
    sessions.filter(s => selectedIds.has(s.id)),
    [sessions, selectedIds]
  );

  const bulkActionsAvailable = useMemo(() => ({
    attended: selectedSessions.length > 0 && selectedSessions.every(canBeMarked),
    noShow: selectedSessions.length > 0 && selectedSessions.every(canBeMarked),
    reschedule: selectedSessions.length > 0 && selectedSessions.every(canBeMarked),
    sickLeave: selectedSessions.length > 0 && selectedSessions.every(canBeMarked),
    weatherCancelled: selectedSessions.length > 0 && selectedSessions.every(canBeMarked),
  }), [selectedSessions]);

  // Bulk exercise download/print state
  const [bulkExerciseProcessing, setBulkExerciseProcessing] = useState<'CW' | 'HW' | null>(null);
  const selectedHaveCW = useMemo(() =>
    selectedSessions.some(s => s.exercises?.some(e => e.exercise_type === 'CW')),
    [selectedSessions]
  );
  const selectedHaveHW = useMemo(() =>
    selectedSessions.some(s => s.exercises?.some(e => e.exercise_type === 'HW')),
    [selectedSessions]
  );

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

  // Get selection state for a timeslot (none, partial, all)
  const getSlotSelectionState = useCallback((sessionsInSlot: Session[]): 'none' | 'partial' | 'all' => {
    if (sessionsInSlot.length === 0) return 'none';
    const selectedCount = sessionsInSlot.filter(s => selectedIds.has(s.id)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === sessionsInSlot.length) return 'all';
    return 'partial';
  }, [selectedIds]);

  // Toggle selection for all sessions in a timeslot
  const toggleSlotSelection = useCallback((sessionsInSlot: Session[], e: React.MouseEvent) => {
    e.stopPropagation(); // Don't trigger collapse
    const slotIds = sessionsInSlot.map(s => s.id);
    setSelectedIds(prev => {
      const allSelected = slotIds.every(id => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        slotIds.forEach(id => next.delete(id));
      } else {
        slotIds.forEach(id => next.add(id));
      }
      return next;
    });
  }, []);

  // Select only markable sessions (Scheduled, Trial Class, Make-up Class)
  const selectMarkableOnly = useCallback(() => {
    const markableIds = sessions.filter(canBeMarked).map(s => s.id);
    setSelectedIds(new Set(markableIds));
  }, [sessions]);

  // Select only markable sessions within a specific timeslot
  const selectMarkableInSlot = useCallback((sessionsInSlot: Session[]) => {
    const markableIds = sessionsInSlot.filter(canBeMarked).map(s => s.id);
    setSelectedIds(prev => {
      const next = new Set(prev);
      markableIds.forEach(id => next.add(id));
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Handler for action buttons to update loading state
  // Note: This is called by SessionActionButtons which manages its own loadingAction internally.
  // We just track that something is loading for that session (for status strip spinner).
  const handleActionLoadingChange = useCallback((sessionId: number, isLoading: boolean, actionId?: string) => {
    setLoadingSessionActions(prev => {
      const next = new Map(prev);
      if (isLoading && actionId) {
        next.set(sessionId, actionId);
      } else {
        next.delete(sessionId);
      }
      return next;
    });
  }, []);

  // Bulk attendance action handlers
  const [bulkActionLoading, setBulkActionLoading] = useState<string | null>(null);

  const handleBulkAttended = useCallback(async () => {
    if (selectedSessions.length === 0) return;
    setBulkActionLoading('attended');

    // Add all session IDs to loading state upfront with action ID
    setLoadingSessionActions(prev => {
      const next = new Map(prev);
      for (const s of selectedSessions) {
        next.set(s.id, 'attended');
      }
      return next;
    });

    let successCount = 0;
    let failCount = 0;

    for (const session of selectedSessions) {
      try {
        const updatedSession = await sessionsAPI.markAttended(session.id);
        updateSessionInCache(updatedSession);
        successCount++;
      } catch (error) {
        failCount++;
      }
      // Remove this session from loading state
      setLoadingSessionActions(prev => {
        const next = new Map(prev);
        next.delete(session.id);
        return next;
      });
    }

    setBulkActionLoading(null);
    clearSelection();

    if (failCount === 0) {
      showToast(`${successCount} session${successCount !== 1 ? 's' : ''} marked as attended`, 'success');
    } else {
      showToast(`${successCount} succeeded, ${failCount} failed`, failCount > successCount ? 'error' : 'info');
    }
  }, [selectedSessions, clearSelection, showToast]);

  const handleBulkNoShow = useCallback(async () => {
    if (selectedSessions.length === 0) return;
    setBulkActionLoading('no-show');

    // Add all session IDs to loading state upfront with action ID
    setLoadingSessionActions(prev => {
      const next = new Map(prev);
      for (const s of selectedSessions) {
        next.set(s.id, 'no-show');
      }
      return next;
    });

    let successCount = 0;
    let failCount = 0;

    for (const session of selectedSessions) {
      try {
        const updatedSession = await sessionsAPI.markNoShow(session.id);
        updateSessionInCache(updatedSession);
        successCount++;
      } catch (error) {
        failCount++;
      }
      // Remove this session from loading state
      setLoadingSessionActions(prev => {
        const next = new Map(prev);
        next.delete(session.id);
        return next;
      });
    }

    setBulkActionLoading(null);
    clearSelection();

    if (failCount === 0) {
      showToast(`${successCount} session${successCount !== 1 ? 's' : ''} marked as no show`, 'success');
    } else {
      showToast(`${successCount} succeeded, ${failCount} failed`, failCount > successCount ? 'error' : 'info');
    }
  }, [selectedSessions, clearSelection, showToast]);

  const handleBulkReschedule = useCallback(async () => {
    if (selectedSessions.length === 0) return;
    setBulkActionLoading('reschedule');

    const markableSessions = selectedSessions.filter(canBeMarked);
    // Add all markable session IDs to loading state upfront with action ID
    setLoadingSessionActions(prev => {
      const next = new Map(prev);
      for (const s of markableSessions) {
        next.set(s.id, 'reschedule');
      }
      return next;
    });

    let successCount = 0;
    let failCount = 0;

    for (const session of markableSessions) {
      try {
        const updatedSession = await sessionsAPI.markRescheduled(session.id);
        updateSessionInCache(updatedSession);
        successCount++;
      } catch (error) {
        failCount++;
      }
      // Remove this session from loading state
      setLoadingSessionActions(prev => {
        const next = new Map(prev);
        next.delete(session.id);
        return next;
      });
    }

    setBulkActionLoading(null);
    clearSelection();

    if (failCount === 0) {
      showToast(`${successCount} session${successCount !== 1 ? 's' : ''} marked as rescheduled`, 'success');
    } else {
      showToast(`${successCount} succeeded, ${failCount} failed`, failCount > successCount ? 'error' : 'info');
    }
  }, [selectedSessions, clearSelection, showToast]);

  const handleBulkSickLeave = useCallback(async () => {
    if (selectedSessions.length === 0) return;
    setBulkActionLoading('sick-leave');

    const markableSessions = selectedSessions.filter(canBeMarked);
    // Add all markable session IDs to loading state upfront with action ID
    setLoadingSessionActions(prev => {
      const next = new Map(prev);
      for (const s of markableSessions) {
        next.set(s.id, 'sick-leave');
      }
      return next;
    });

    let successCount = 0;
    let failCount = 0;

    for (const session of markableSessions) {
      try {
        const updatedSession = await sessionsAPI.markSickLeave(session.id);
        updateSessionInCache(updatedSession);
        successCount++;
      } catch (error) {
        failCount++;
      }
      // Remove this session from loading state
      setLoadingSessionActions(prev => {
        const next = new Map(prev);
        next.delete(session.id);
        return next;
      });
    }

    setBulkActionLoading(null);
    clearSelection();

    if (failCount === 0) {
      showToast(`${successCount} session${successCount !== 1 ? 's' : ''} marked as sick leave`, 'success');
    } else {
      showToast(`${successCount} succeeded, ${failCount} failed`, failCount > successCount ? 'error' : 'info');
    }
  }, [selectedSessions, clearSelection, showToast]);

  const handleBulkWeatherCancelled = useCallback(async () => {
    if (selectedSessions.length === 0) return;
    setBulkActionLoading('weather-cancelled');

    const markableSessions = selectedSessions.filter(canBeMarked);
    // Add all markable session IDs to loading state upfront with action ID
    setLoadingSessionActions(prev => {
      const next = new Map(prev);
      for (const s of markableSessions) {
        next.set(s.id, 'weather-cancelled');
      }
      return next;
    });

    let successCount = 0;
    let failCount = 0;

    for (const session of markableSessions) {
      try {
        const updatedSession = await sessionsAPI.markWeatherCancelled(session.id);
        updateSessionInCache(updatedSession);
        successCount++;
      } catch (error) {
        failCount++;
      }
      // Remove this session from loading state
      setLoadingSessionActions(prev => {
        const next = new Map(prev);
        next.delete(session.id);
        return next;
      });
    }

    setBulkActionLoading(null);
    clearSelection();

    if (failCount === 0) {
      showToast(`${successCount} session${successCount !== 1 ? 's' : ''} marked as weather cancelled`, 'success');
    } else {
      showToast(`${successCount} succeeded, ${failCount} failed`, failCount > successCount ? 'error' : 'info');
    }
  }, [selectedSessions, clearSelection, showToast]);

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

  // Global selection state (none, partial, all)
  const getGlobalSelectionState = useMemo((): 'none' | 'partial' | 'all' => {
    if (allSessionIds.length === 0) return 'none';
    if (selectedIds.size === 0) return 'none';
    if (selectedIds.size === allSessionIds.length) return 'all';
    return 'partial';
  }, [selectedIds, allSessionIds]);

  const isAllSelected = getGlobalSelectionState === 'all';
  const hasSelection = selectedIds.size > 0;

  // Calculate sticky top for time slot headers (accounts for bulk action bar when visible)
  const timeSlotStickyTop = toolbarHeight + (hasSelection ? bulkActionBarHeight : 0);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedDate, statusFilter, tutorFilter, selectedLocation, viewMode]);

  // Close select dropdowns on outside click
  useEffect(() => {
    if (!showSelectDropdown && !slotDropdownOpen) return;
    const handleClick = () => {
      setShowSelectDropdown(false);
      setSlotDropdownOpen(null);
    };
    // Delay to avoid closing immediately on the click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
    };
  }, [showSelectDropdown, slotDropdownOpen]);

  // J/K keyboard navigation for sessions list
  useEffect(() => {
    if (viewMode !== "list") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in an input, modal open, or command palette open
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (popoverSession || bulkExerciseType || quickActionSession || isCommandPaletteOpen) return;

      // Cmd/Ctrl+Shift+A - Select only markable sessions (must check before Cmd+A)
      // If a session is focused, select markable in that timeslot only
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        if (focusedSessionId) {
          const focusedSession = sessions.find(s => s.id === focusedSessionId);
          if (focusedSession) {
            const slotSessions = sessions.filter(s => s.time_slot === focusedSession.time_slot);
            const markableIds = slotSessions.filter(canBeMarked).map(s => s.id);
            setSelectedIds(new Set(markableIds));
            return;
          }
        }
        // Fallback: select all markable on page
        const markableIds = sessions.filter(canBeMarked).map(s => s.id);
        setSelectedIds(new Set(markableIds));
        return;
      }

      // Cmd/Ctrl+A - Select all visible sessions
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        setSelectedIds(new Set(allSessionIds));
        return;
      }

      // ? - Toggle shortcut hints
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShowShortcutHints(prev => !prev);
        return;
      }

      const key = e.key.toLowerCase();
      // For single-letter shortcuts, require no modifiers (Ctrl/Cmd+A, Ctrl+Shift+A handled above)
      const hasModifier = e.shiftKey || e.altKey || e.metaKey || e.ctrlKey;

      // Escape - close hints panel, clear selection, or clear focus (works with modifiers)
      if (key === 'escape') {
        if (showShortcutHints) {
          setShowShortcutHints(false);
          return;
        }
        if (selectedIds.size > 0) {
          clearSelection();
          return;
        }
        setFocusedSessionId(null);
        return;
      }

      if (!hasModifier && (key === 'j' || key === 'k')) {
        // Guard against empty list
        if (allSessionIds.length === 0) return;

        e.preventDefault();
        const currentIndex = focusedSessionId ? allSessionIds.indexOf(focusedSessionId) : -1;

        if (key === 'j') {
          // Move down
          const nextIndex = currentIndex < allSessionIds.length - 1 ? currentIndex + 1 : 0;
          setFocusedSessionId(allSessionIds[nextIndex]);
        } else {
          // Move up
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : allSessionIds.length - 1;
          setFocusedSessionId(allSessionIds[prevIndex]);
        }
      } else if (key === 'enter' && focusedSessionId) {
        e.preventDefault();
        // Open popover for focused session
        const session = sessions.find(s => s.id === focusedSessionId);
        if (session) {
          setPopoverSession(session);
          // Use card position if available, otherwise center of screen
          const card = cardRefsMap.current.get(focusedSessionId);
          if (card) {
            const rect = card.getBoundingClientRect();
            setPopoverClickPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
          }
        }
      }
      // Space - toggle selection on focused card
      else if (key === ' ' && focusedSessionId) {
        e.preventDefault();
        toggleSelect(focusedSessionId);
        return;
      }
      // Bulk action shortcuts (when sessions are selected, no modifiers)
      else if (!hasModifier && selectedIds.size > 0) {
        switch (key) {
          case 'a':
            if (bulkActionsAvailable.attended) {
              e.preventDefault();
              handleBulkAttended();
            }
            break;
          case 'n':
            if (bulkActionsAvailable.noShow) {
              e.preventDefault();
              handleBulkNoShow();
            }
            break;
          case 'c':
            e.preventDefault();
            setBulkExerciseType('CW');
            break;
          case 'h':
            e.preventDefault();
            setBulkExerciseType('HW');
            break;
        }
        return;
      }
      // Action shortcuts on focused card (A/N/C/H/R/E, no modifiers)
      else if (!hasModifier && focusedSessionId) {
        const session = sessions.find(s => s.id === focusedSessionId);
        if (!session) return;

        switch (key) {
          case 'a': // Mark Attended
            if (canBeMarked(session)) {
              e.preventDefault();
              setLoadingSessionActions(prev => new Map(prev).set(session.id, 'attended'));
              sessionsAPI.markAttended(session.id).then(updated => {
                updateSessionInCache(updated);
                showToast(`${session.student_name} marked as attended`);
              }).catch(() => {
                showToast('Failed to mark attended', 'error');
              }).finally(() => {
                setLoadingSessionActions(prev => {
                  const next = new Map(prev);
                  next.delete(session.id);
                  return next;
                });
              });
            }
            break;
          case 'n': // Mark No Show
            if (canBeMarked(session)) {
              e.preventDefault();
              setLoadingSessionActions(prev => new Map(prev).set(session.id, 'no-show'));
              sessionsAPI.markNoShow(session.id).then(updated => {
                updateSessionInCache(updated);
                showToast(`${session.student_name} marked as no show`);
              }).catch(() => {
                showToast('Failed to mark no show', 'error');
              }).finally(() => {
                setLoadingSessionActions(prev => {
                  const next = new Map(prev);
                  next.delete(session.id);
                  return next;
                });
              });
            }
            break;
          case 'c': // Open CW modal
            e.preventDefault();
            setQuickActionSession(session);
            setQuickActionType('CW');
            break;
          case 'h': // Open HW modal
            e.preventDefault();
            setQuickActionSession(session);
            setQuickActionType('HW');
            break;
          case 'r': // Open Rate modal
            e.preventDefault();
            setQuickActionSession(session);
            setQuickActionType('Rate');
            break;
          case 'e': // Open Edit modal
            e.preventDefault();
            setQuickActionSession(session);
            setQuickActionType('Edit');
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, allSessionIds, focusedSessionId, popoverSession, bulkExerciseType, quickActionSession, isCommandPaletteOpen, sessions, showToast, showShortcutHints, selectedIds, bulkActionsAvailable, handleBulkAttended, handleBulkNoShow, clearSelection, toggleSelect]);

  // Scroll focused card into view
  useEffect(() => {
    if (!focusedSessionId || !scrollContainerRef.current) return;

    const card = cardRefsMap.current.get(focusedSessionId);
    if (!card) return;

    const container = scrollContainerRef.current;
    const containerRect = container.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();

    // Card position relative to container's scroll position
    const cardTopInContainer = cardRect.top - containerRect.top + container.scrollTop;

    // Target: center the card in the container
    const targetScroll = cardTopInContainer - (containerRect.height / 2) + (cardRect.height / 2);

    container.scrollTo({ top: targetScroll, behavior: 'smooth' });
  }, [focusedSessionId]);

  // Clear focus when filters change
  useEffect(() => {
    setFocusedSessionId(null);
  }, [selectedDate, statusFilter, tutorFilter, selectedLocation]);

  // Mark visible time slots as "seen" after initial render (to skip stagger on re-expand)
  useEffect(() => {
    if (viewMode === "list" && !loading) {
      groupedSessions.forEach(([timeSlot]) => {
        if (!collapsedSlots.has(timeSlot)) {
          seenSlotsRef.current.add(timeSlot);
        }
      });
    }
  }, [viewMode, loading, groupedSessions, collapsedSlots]);

  // Mark visible student groups as "seen" for pending-makeups view
  useEffect(() => {
    if (groupedByStudent && !loading) {
      groupedByStudent.forEach(([studentId]) => {
        const studentKey = `student-${studentId}`;
        if (!collapsedSlots.has(studentKey)) {
          seenSlotsRef.current.add(studentKey);
        }
      });
    }
  }, [groupedByStudent, loading, collapsedSlots]);

  if (loading) {
    return (
      <DeskSurface fullHeight={viewMode === "weekly" || viewMode === "daily" || viewMode === "monthly"}>
        <PageTransition className={cn(
          "flex flex-col gap-2 sm:gap-3 p-2 sm:p-4",
          (viewMode === "weekly" || viewMode === "daily" || viewMode === "monthly") && "h-full overflow-hidden"
        )}>
          {/* Toolbar Skeleton */}
          <div className={cn(
            "flex items-center gap-2 sm:gap-3 bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg px-3 sm:px-4 py-2",
            !isMobile && "paper-texture"
          )}>
            {/* Title */}
            <div className="h-5 w-5 bg-[#d4a574]/50 dark:bg-[#8b6f47]/50 rounded animate-pulse" />
            <div className="h-5 w-20 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
            <div className="h-6 w-px bg-[#d4a574]/50 hidden sm:block" />
            {/* View switcher */}
            <div className="flex gap-1">
              {[1,2,3,4].map(i => (
                <div key={i} className="h-7 w-7 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              ))}
            </div>
            <div className="h-6 w-px bg-[#d4a574]/50 hidden sm:block" />
            {/* Filters placeholder */}
            <div className="h-7 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse hidden sm:block" />
            <div className="h-7 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse hidden sm:block" />
            <div className="ml-auto h-5 w-16 bg-amber-200/50 dark:bg-amber-800/50 rounded-full animate-pulse" />
          </div>

          {viewMode === "weekly" ? (
            /* Weekly View Skeleton */
            <div className="flex-1 bg-white dark:bg-[#1a1a1a] border-2 border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden">
              {/* Day headers row */}
              <div className="grid border-b-2 border-[#e8d4b8] dark:border-[#6b5a4a]" style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}>
                <div className="p-2 bg-[#fef9f3] dark:bg-[#2d2618]" />
                {[1,2,3,4,5,6,7].map(i => (
                  <div key={i} className="py-2 px-1.5 text-center bg-[#fef9f3] dark:bg-[#2d2618] border-l border-[#e8d4b8] dark:border-[#6b5a4a]">
                    <div className="h-3 w-8 mx-auto bg-gray-300 dark:bg-gray-600 rounded animate-pulse mb-1" />
                    <div className="h-5 w-6 mx-auto bg-gray-400 dark:bg-gray-500 rounded animate-pulse" />
                  </div>
                ))}
              </div>
              {/* Grid body */}
              <div className="grid flex-1" style={{ gridTemplateColumns: "60px repeat(7, 1fr)", height: "calc(100% - 52px)" }}>
                {/* Time labels column */}
                <div className="bg-[#fef9f3] dark:bg-[#2d2618] border-r border-[#e8d4b8] dark:border-[#6b5a4a] py-4">
                  {["10AM","11AM","12PM","1PM","2PM","3PM","4PM","5PM"].map(t => (
                    <div key={t} className="h-3 w-10 mx-auto bg-gray-300 dark:bg-gray-600 rounded animate-pulse mb-8" />
                  ))}
                </div>
                {/* Day columns */}
                {[1,2,3,4,5,6,7].map(d => (
                  <div key={d} className="border-l border-[#e8d4b8] dark:border-[#6b5a4a] relative p-1">
                    {d % 2 === 0 && (
                      <div className="absolute top-4 left-1 right-1 h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    )}
                    {d % 3 === 0 && (
                      <div className="absolute top-16 left-1 right-1 h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : viewMode === "daily" ? (
            /* Daily View Skeleton */
            <div className="flex-1 flex flex-col gap-1 overflow-hidden">
              {/* Day Navigation Skeleton */}
              <div className="flex items-center justify-between gap-2 bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg px-3 py-1.5">
                <div className="h-7 w-16 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                <div className="flex items-center gap-2">
                  <div className="h-7 w-16 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                  <div className="h-7 w-28 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                  <div className="h-5 w-40 bg-gray-300 dark:bg-gray-600 rounded animate-pulse hidden sm:block" />
                </div>
                <div className="h-7 w-16 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
              </div>

              {/* Grid Skeleton */}
              <div className="flex-1 bg-white dark:bg-[#1a1a1a] border-2 border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden">
                {/* Tutor headers row - 1 expanded + 3 collapsed */}
                <div className="grid border-b-2 border-[#e8d4b8] dark:border-[#6b5a4a]" style={{ gridTemplateColumns: "60px 1fr 36px 36px 36px" }}>
                  <div className="p-1.5 bg-[#fef9f3] dark:bg-[#2d2618] border-r border-[#e8d4b8] dark:border-[#6b5a4a]">
                    <div className="h-3 w-8 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                  </div>
                  {/* Expanded tutor header */}
                  <div className="py-1 px-1.5 text-center bg-[#fef9f3] dark:bg-[#2d2618] border-r border-[#e8d4b8] dark:border-[#6b5a4a]">
                    <div className="h-3 w-20 mx-auto bg-gray-300 dark:bg-gray-600 rounded animate-pulse mb-1" />
                    <div className="h-3 w-16 mx-auto bg-[#d4a574]/50 dark:bg-[#8b6f47]/50 rounded animate-pulse" />
                  </div>
                  {/* Collapsed tutor headers */}
                  {[1, 2, 3].map(i => (
                    <div key={i} className={cn(
                      "py-1 px-0.5 border-r last:border-r-0 border-[#e8d4b8] dark:border-[#6b5a4a]",
                      i % 2 === 1 ? "bg-[#f5ede3] dark:bg-[#181510]" : "bg-[#fef9f3] dark:bg-[#2d2618]"
                    )}>
                      <div className="h-full flex items-center justify-center">
                        <div className="h-8 w-2 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
                {/* Grid body */}
                <div className="grid flex-1" style={{ gridTemplateColumns: "60px 1fr 36px 36px 36px", height: "calc(100% - 40px)" }}>
                  {/* Time labels column */}
                  <div className="bg-[#fef9f3] dark:bg-[#2d2618] border-r border-[#e8d4b8] dark:border-[#6b5a4a] py-4">
                    {["10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00"].map(t => (
                      <div key={t} className="h-3 w-10 mx-auto bg-gray-300 dark:bg-gray-600 rounded animate-pulse mb-8" />
                    ))}
                  </div>
                  {/* Expanded tutor column with session placeholders */}
                  <div className="border-r border-[#e8d4b8] dark:border-[#6b5a4a] relative p-1">
                    <div className="absolute top-8 left-1 right-1 h-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="absolute top-28 left-1 right-1 h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="absolute top-48 left-1 right-1 h-14 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </div>
                  {/* Collapsed tutor columns */}
                  {[1, 2, 3].map(i => (
                    <div key={i} className={cn(
                      "border-r last:border-r-0 border-[#e8d4b8] dark:border-[#6b5a4a]",
                      i % 2 === 1 ? "bg-[#f8f4ef] dark:bg-[#131310]" : ""
                    )} />
                  ))}
                </div>
              </div>
            </div>
          ) : viewMode === "monthly" ? (
            /* Monthly View Skeleton */
            <div className="flex-1 flex flex-col gap-1 overflow-hidden">
              {/* Month Navigation Skeleton */}
              <div className="flex items-center justify-between gap-2 bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg px-3 py-1.5">
                <div className="h-7 w-16 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                <div className="flex items-center gap-2">
                  <div className="h-7 w-16 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                  <div className="h-5 w-32 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                </div>
                <div className="h-7 w-16 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
              </div>

              {/* Calendar Grid Skeleton */}
              <div className="flex-1 bg-white dark:bg-[#1a1a1a] border-2 border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden">
                {/* Weekday Headers */}
                <div className="grid grid-cols-7 border-b-2 border-[#e8d4b8] dark:border-[#6b5a4a]">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => (
                    <div
                      key={day}
                      className={cn(
                        "py-1.5 px-1 text-center bg-[#fef9f3] dark:bg-[#2d2618]",
                        i > 0 && "border-l border-[#e8d4b8] dark:border-[#6b5a4a]"
                      )}
                    >
                      <div className="h-3 w-8 mx-auto bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                    </div>
                  ))}
                </div>
                {/* Calendar Days Grid - 6 rows */}
                <div className="grid grid-cols-7 auto-rows-fr" style={{ minHeight: isMobile ? "400px" : "500px" }}>
                  {Array.from({ length: 42 }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "p-1.5 border-b border-[#e8d4b8] dark:border-[#6b5a4a]",
                        i % 7 !== 0 && "border-l",
                        (i < 3 || i > 30) && "opacity-40"
                      )}
                    >
                      {/* Day number */}
                      <div className="h-4 w-4 bg-gray-300 dark:bg-gray-600 rounded animate-pulse mb-1" />
                      {/* Tutor workload placeholders - show on some cells */}
                      {i % 4 === 0 && i >= 3 && i <= 30 && (
                        <div className="space-y-0.5">
                          <div className="h-2.5 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                          <div className="h-2.5 w-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                        </div>
                      )}
                      {/* Load bar placeholder */}
                      {i % 3 === 0 && i >= 3 && i <= 30 && (
                        <div className="absolute bottom-1 left-1 right-1">
                          <div className="h-1 w-full bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* List View Skeleton */
            <AnimatePresence>
              {[1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    delay: i * 0.1,
                    duration: 0.4,
                    ease: [0.38, 1.21, 0.22, 1.00]
                  }}
                >
                  {/* Time slot header skeleton */}
                  <div className={cn(
                    "flex items-center gap-3 p-4 bg-[#fef9f3] dark:bg-[#2d2618] rounded-lg border-l-4 border-[#a0704b] dark:border-[#cd853f] mb-4",
                    !isMobile && "paper-texture"
                  )}>
                    <div className="w-9 h-9 bg-[#a0704b]/30 dark:bg-[#cd853f]/30 rounded-full animate-pulse" />
                    <div className="h-5 w-24 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                    <div className="ml-auto h-6 w-16 bg-amber-200 dark:bg-amber-800 rounded-full animate-pulse" />
                  </div>
                  {/* Session card skeletons */}
                  <div className="ml-0 sm:ml-4 space-y-3">
                    {[1, 2].map((j) => (
                      <div key={j} className={cn(
                        "flex rounded-lg overflow-hidden bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a]",
                        !isMobile && "paper-texture"
                      )}>
                        <div className="flex-1 p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="h-4 w-14 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                            <div className="h-5 w-28 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                            <div className="h-4 w-10 bg-green-200 dark:bg-green-900 rounded animate-pulse hidden sm:block" />
                          </div>
                          <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                        </div>
                        <div className="w-10 sm:w-12 bg-gray-300 dark:bg-gray-600 animate-pulse" />
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </PageTransition>
      </DeskSurface>
    );
  }

  if (error) {
    return (
      <DeskSurface>
        <PageTransition className="flex h-full items-center justify-center p-8">
          <StickyNote variant="pink" size="lg" showTape={true}>
            <div className="text-center">
              <p className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">Oops!</p>
              <p className="text-sm text-gray-900 dark:text-gray-100">Error: {error instanceof Error ? error.message : "Failed to load sessions"}</p>
            </div>
          </StickyNote>
        </PageTransition>
      </DeskSurface>
    );
  }

  // Toolbar content (shared between animated and non-animated versions)
  const toolbarContent = (
    <>
      {/* Title */}
      <div className="flex items-center gap-2">
        <Calendar className="h-5 w-5 text-[#a0704b] dark:text-[#cd853f]" />
        <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">Sessions</h1>
      </div>

      <div className="h-6 w-px bg-[#d4a574]/50 hidden sm:block" />

      {/* Inline View Switcher */}
      <ViewSwitcher currentView={viewMode} onViewChange={setViewMode} compact />

      {/* Show filters for list and weekly views */}
      {(viewMode === "list" || viewMode === "weekly") && (
        <>
          <div className="h-6 w-px bg-[#d4a574]/50 hidden sm:block" />

          {/* Date Picker (only for list view) */}
          {viewMode === "list" && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                {selectedDate.toLocaleDateString('en-US', { weekday: 'short' })}
              </span>
              <input
                type="date"
                defaultValue={toDateString(selectedDate)}
                key={toDateString(selectedDate)}
                onBlur={(e) => {
                  const date = new Date(e.target.value + 'T00:00:00');
                  if (!isNaN(date.getTime()) && toDateString(date) !== toDateString(selectedDate)) {
                    setSelectedDate(date);
                  }
                }}
                className="px-2 py-1 text-sm bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#6b5a4a] rounded-md focus:outline-none focus:ring-1 focus:ring-[#a0704b] text-gray-900 dark:text-gray-100 font-medium"
              />
              {/* Today button - only show when not on today */}
              {toDateString(selectedDate) !== toDateString(new Date()) && (
                <button
                  onClick={() => setSelectedDate(new Date())}
                  className="px-2 py-1 text-xs font-medium rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/70 transition-colors"
                >
                  Today
                </button>
              )}
            </div>
          )}

          {/* Compact Status Filter with color indicators */}
          <StatusFilterDropdown value={statusFilter} onChange={setStatusFilter} />

          {/* Compact Tutor Filter */}
          <select
            value={tutorFilter}
            onChange={(e) => setTutorFilter(e.target.value)}
            className="px-2 py-1 text-sm bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#6b5a4a] rounded-md focus:outline-none focus:ring-1 focus:ring-[#a0704b] text-gray-900 dark:text-gray-100 font-medium appearance-none cursor-pointer pr-7"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 12 12'%3E%3Cpath fill='%23a0704b' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 0.5rem center',
            }}
          >
            <option value="">Tutor</option>
            {filteredTutors.map((tutor) => (
              <option key={tutor.id} value={tutor.id.toString()}>
                {tutor.tutor_name}
              </option>
            ))}
          </select>
        </>
      )}

      {/* Record Memo button */}
      <button
        onClick={() => setMemoDrawerOpen(true)}
        className="relative flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 border border-amber-300 dark:border-amber-700 transition-colors"
        title="Record a session memo (for sessions not yet in system)"
      >
        <StickyNoteIcon className="h-3 w-3" />
        <span className="hidden sm:inline">Memo</span>
        {(pendingMemoData?.count ?? 0) > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold rounded-full bg-amber-500 text-white">
            {pendingMemoData!.count}
          </span>
        )}
      </button>

      <div className="flex-1" />

      {/* Select All checkbox with dropdown (only in list view) */}
      {viewMode === "list" && sessions.length > 0 && (
        <div className="relative">
          <div className="flex items-center">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            >
              {getGlobalSelectionState === 'all' ? (
                <CheckSquare className="h-3.5 w-3.5 text-[#a0704b] dark:text-[#cd853f]" />
              ) : getGlobalSelectionState === 'partial' ? (
                <MinusSquare className="h-3.5 w-3.5 text-[#a0704b] dark:text-[#cd853f]" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Select</span>
            </button>
            <button
              onClick={() => setShowSelectDropdown(!showSelectDropdown)}
              className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              title="Selection options (Ctrl+A all, Ctrl+Shift+A markable)"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>
          {showSelectDropdown && (
            <div className="absolute top-full right-0 mt-1 bg-[#fef9f3] dark:bg-[#2d2618] shadow-lg rounded-md border border-[#e8d4b8] dark:border-[#6b5a4a] z-50 py-1 min-w-[160px]">
              <button
                onClick={() => { toggleSelectAll(); setShowSelectDropdown(false); }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#f5ede3] dark:hover:bg-[#3d3520] text-gray-700 dark:text-gray-300"
              >
                Select All
              </button>
              <button
                onClick={() => { selectMarkableOnly(); setShowSelectDropdown(false); }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#f5ede3] dark:hover:bg-[#3d3520] text-gray-700 dark:text-gray-300"
              >
                Select Markable Only
              </button>
              {hasSelection && (
                <button
                  onClick={() => { clearSelection(); setShowSelectDropdown(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#f5ede3] dark:hover:bg-[#3d3520] text-red-600 dark:text-red-400"
                >
                  Clear Selection
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Session count */}
      <span className="text-xs sm:text-sm font-semibold text-[#a0704b] dark:text-[#cd853f] whitespace-nowrap">
        {sessions.filter(isCountableSession).length} sessions
      </span>

    </>
  );

  // Toolbar: outer div is clean sticky container, inner div has visual styling
  const toolbarStickyClasses = "sticky top-0 z-30";
  const toolbarInnerClasses = cn(
    "flex flex-wrap items-center gap-2 sm:gap-3 bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg px-3 sm:px-4 py-2",
    !isMobile && "paper-texture"
  );

  // For list view: Use fullHeight to propagate height constraints for sticky positioning
  // For other views: Use PageTransition with animations
  if (viewMode === "list") {
    return (
      <>
      <DeskSurface fullHeight>
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-2 sm:gap-3 p-2 sm:p-4">
            {/* Toolbar - outer div is sticky, inner div has visual styling */}
            <div ref={setToolbarElement} className={toolbarStickyClasses}>
              <div className={toolbarInnerClasses}>
                {toolbarContent}
              </div>
            </div>

            {/* Special Filter Banner */}
            {specialFilter === "pending-makeups" && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
                  <RefreshCw className="h-4 w-4" />
                  <span className="font-medium">Pending Make-ups</span>
                  <span className="text-amber-600 dark:text-amber-400">(last 60 days)</span>
                </div>
                <button
                  onClick={() => setSpecialFilter("")}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded transition-colors"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              </div>
            )}

            {/* Bulk Action Bar - appears when selections exist */}
            {hasSelection && (
              <div ref={setBulkActionBarElement} className="sticky z-25 bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg px-3 sm:px-4 py-2" style={{ top: toolbarHeight }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                    {selectedIds.size} selected
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Attendance actions - conditional based on selected sessions */}
                    {bulkActionsAvailable.attended && (
                      <button
                        onClick={handleBulkAttended}
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
                        onClick={handleBulkNoShow}
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
                        onClick={handleBulkReschedule}
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
                        onClick={handleBulkSickLeave}
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
                        onClick={handleBulkWeatherCancelled}
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
                    />
                    <ExerciseDropdownButton
                      exerciseType="HW"
                      onAssign={() => setBulkExerciseType("HW")}
                      onDownload={() => handleBulkDownloadExercises('HW')}
                      onPrint={() => handleBulkPrintExercises('HW')}
                      hasExercises={selectedHaveHW}
                      isProcessing={bulkExerciseProcessing === 'HW'}
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
              </div>
            )}

            {/* List view content */}
            {(groupedByStudent ? groupedByStudent.length === 0 : groupedSessions.length === 0) ? (
              <div className="flex justify-center py-12">
                <StickyNote variant="yellow" size="lg" showTape={true} className="desk-shadow-medium">
                  <div className="text-center">
                    <Clock className="h-12 w-12 mx-auto mb-4 text-gray-700 dark:text-gray-300" />
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">No sessions found</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {specialFilter === "pending-makeups"
                        ? "No pending make-ups in the last 60 days"
                        : "Try selecting a different date or adjusting your filters"}
                    </p>
                  </div>
                </StickyNote>
              </div>
            ) : groupedByStudent ? (
              /* Pending Make-ups View: Grouped by Student */
              <>
                {groupedByStudent.map(([studentId, studentSessions], groupIndex) => {
                  const firstSession = studentSessions[0];
                  const studentKey = `student-${studentId}`;
                  const isCollapsed = collapsedSlots.has(studentKey);
                  return (
                    <React.Fragment key={studentKey}>
                      {/* Student Header */}
                      <div className="sticky z-20 mb-4" style={{ top: timeSlotStickyTop }}>
                        <div
                          onClick={() => toggleSlot(studentKey)}
                          className={cn(
                            "bg-[#fef9f3] dark:bg-[#2d2618] border-l-4 border-[#a0704b] dark:border-[#cd853f] rounded-lg p-4 desk-shadow-low cursor-pointer hover:bg-[#fdf5eb] dark:hover:bg-[#352f20] transition-colors",
                            !isMobile && "paper-texture"
                          )}
                          style={{ transform: isMobile ? 'none' : 'rotate(-0.1deg)' }}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                              <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap flex-shrink-0">
                                {selectedLocation === "All Locations" && firstSession.location && `${firstSession.location}-`}{firstSession.school_student_id}
                              </span>
                              <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 truncate">
                                {firstSession.student_name}
                              </h3>
                              {firstSession.grade && (
                                <span
                                  className="text-[11px] px-1.5 py-0.5 rounded text-gray-800 whitespace-nowrap hidden sm:inline flex-shrink-0"
                                  style={{ backgroundColor: getGradeColor(firstSession.grade, firstSession.lang_stream) }}
                                >{firstSession.grade}{firstSession.lang_stream || ''}</span>
                              )}
                              {firstSession.school && (
                                <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 whitespace-nowrap hidden sm:inline flex-shrink-0">{firstSession.school}</span>
                              )}
                              <motion.div
                                animate={{ rotate: isCollapsed ? -90 : 0 }}
                                transition={{ duration: 0.2 }}
                                className="flex-shrink-0"
                              >
                                <ChevronDown className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                              </motion.div>
                            </div>
                            <div className="bg-amber-100 dark:bg-amber-900 text-amber-900 dark:text-amber-100 px-3 py-1 rounded-full border-2 border-amber-600 dark:border-amber-700 font-bold text-xs sm:text-sm flex-shrink-0">
                              {studentSessions.length} pending
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Session Cards for this student */}
                      <AnimatePresence initial={false}>
                        {!isCollapsed && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                            className="overflow-hidden"
                          >
                            <div className="space-y-3 ml-0 sm:ml-4 p-1">
                              {studentSessions.map((session, sessionIndex) => {
                                const displayStatus = getDisplayStatus(session);
                                const statusConfig = getSessionStatusConfig(displayStatus);
                                const StatusIcon = statusConfig.Icon;
                                const sessionDate = new Date(session.session_date + 'T00:00:00');
                                const dateStr = sessionDate.toLocaleDateString('en-US', {
                                  weekday: 'short',
                                  month: 'short',
                                  day: 'numeric'
                                });
                                const isCancelledEnrollment = session.enrollment_payment_status === 'Cancelled';
                                return (
                                  <motion.div
                                    key={session.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: isCancelledEnrollment ? 0.5 : 1, x: 0 }}
                                    transition={{
                                      // Skip stagger delay on re-expand
                                      delay: isMobile || seenSlotsRef.current.has(studentKey) ? 0 : groupIndex * 0.05 + sessionIndex * 0.03,
                                      duration: 0.35,
                                      ease: [0.38, 1.21, 0.22, 1.00]
                                    }}
                                    whileHover={!isMobile ? {
                                      scale: 1.02,
                                      y: -4,
                                      transition: { duration: 0.2 }
                                    } : {}}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={(e) => handleCardClick(session, e)}
                                    title="Click for quick view"
                                    ref={(el) => {
                                      if (el) cardRefsMap.current.set(session.id, el);
                                      else cardRefsMap.current.delete(session.id);
                                    }}
                                    className={cn(
                                      "relative rounded-lg cursor-pointer transition-all duration-200 overflow-hidden flex",
                                      statusConfig.bgTint,
                                      !isMobile && "paper-texture",
                                      selectedIds.has(session.id) && focusedSessionId !== session.id && "outline outline-2 outline-[#a0704b] dark:outline-[#cd853f]",
                                      focusedSessionId === session.id && !selectedIds.has(session.id) && "outline outline-2 outline-[#a0704b] dark:outline-[#cd853f]",
                                      focusedSessionId === session.id && selectedIds.has(session.id) && "outline outline-dashed outline-2 outline-[#a0704b] dark:outline-[#cd853f]"
                                    )}
                                    style={{
                                      transform: isMobile ? 'none' : `rotate(${sessionIndex % 2 === 0 ? -0.3 : 0.3}deg)`,
                                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                                    }}
                                  >
                                    {/* Checkbox for bulk selection */}
                                    <button
                                      onClick={(e) => { e.stopPropagation(); toggleSelect(session.id); }}
                                      className="flex-shrink-0 p-2 sm:p-3 flex items-center justify-center border-r border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                    >
                                      {selectedIds.has(session.id) ? (
                                        <CheckSquare className="h-4 w-4 sm:h-5 sm:w-5 text-[#a0704b] dark:text-[#cd853f]" />
                                      ) : (
                                        <Square className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300" />
                                      )}
                                    </button>

                                    {/* Main content */}
                                    <div className="flex-1 p-3 sm:p-4 min-w-0">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="space-y-1.5 flex-1 min-w-0">
                                          {/* Date + Time Slot */}
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-semibold text-[#a0704b] dark:text-[#cd853f]">
                                              {dateStr}
                                            </span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                              {session.time_slot}
                                            </span>
                                            {session.exam_revision_slot_id && (
                                              <span title="Exam Revision"><GraduationCap className="h-3.5 w-3.5 text-purple-500 flex-shrink-0" /></span>
                                            )}
                                            {session.extension_request_id && (
                                              <span title={`Extension ${session.extension_request_status}`}><Clock className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" /></span>
                                            )}
                                          </div>

                                          {/* Action buttons */}
                                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                            <button
                                              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-medium whitespace-nowrap transition-colors"
                                              title="Schedule Make-up (coming soon)"
                                            >
                                              <CalendarPlus className="h-3.5 w-3.5" />
                                              <span className="hidden sm:inline">Make-up</span>
                                            </button>
                                            <Link
                                              href={`/sessions/${session.id}`}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                saveScrollPosition();
                                              }}
                                              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-[#a0704b]/10 hover:bg-[#a0704b]/20 dark:bg-[#cd853f]/10 dark:hover:bg-[#cd853f]/20 text-[#a0704b] dark:text-[#cd853f] font-medium whitespace-nowrap transition-colors"
                                            >
                                              <span className="hidden sm:inline">View</span>
                                              <ExternalLink className="h-3.5 w-3.5" />
                                            </Link>
                                          </div>
                                        </div>

                                        {/* Right side - Status + Tutor */}
                                        <div className="flex flex-col items-end gap-0.5 flex-shrink-0 text-right">
                                          <p className={cn("text-sm font-medium truncate max-w-[80px] sm:max-w-none", statusConfig.textClass)}>
                                            {displayStatus}
                                          </p>
                                          {session.tutor_name && (
                                            <p className="text-xs text-gray-600 dark:text-gray-400">
                                              {session.tutor_name}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Status color strip with icon */}
                                    <div className={cn("w-10 sm:w-12 flex-shrink-0 flex items-center justify-center rounded-r-lg", statusConfig.bgClass)}>
                                      {loadingSessionActions.has(session.id) ? (
                                        <div className="w-5 h-5 sm:w-6 sm:h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                      ) : (
                                        <StatusIcon className={cn("h-5 w-5 sm:h-6 sm:w-6 text-white", statusConfig.iconClass)} />
                                      )}
                                    </div>
                                  </motion.div>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  );
                })}
              </>
            ) : (
              /* Normal View: Grouped by Time Slot */
              <>
                {groupedSessions.map(([timeSlot, sessionsInSlot], groupIndex) => (
                  <React.Fragment key={timeSlot}>
                    {/* Time Slot Header - Index Card Style (Clickable to collapse) */}
                    {/* Outer div is clean sticky container; inner div has visual effects */}
                    <div id={`slot-${timeSlot}`} className={cn("sticky mb-4", slotDropdownOpen === timeSlot ? "z-50" : "z-20")} style={{ top: timeSlotStickyTop }}>
                      <div
                        onClick={() => toggleSlot(timeSlot)}
                        className={cn(
                          "bg-[#fef9f3] dark:bg-[#2d2618] border-l-4 border-[#a0704b] dark:border-[#cd853f] rounded-lg p-4 desk-shadow-low cursor-pointer hover:bg-[#fdf5eb] dark:hover:bg-[#352f20] transition-colors",
                          !isMobile && "paper-texture"
                        )}
                        style={{ transform: isMobile ? 'none' : 'rotate(-0.1deg)' }}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-3">
                            {/* Slot selection checkbox with dropdown */}
                            <div className="relative flex items-center">
                              <button
                                onClick={(e) => toggleSlotSelection(sessionsInSlot, e)}
                                className="p-1 hover:bg-[#a0704b]/10 rounded transition-colors"
                                title={`Select all sessions in ${timeSlot}`}
                              >
                                {(() => {
                                  const state = getSlotSelectionState(sessionsInSlot);
                                  if (state === 'all') return <CheckSquare className="h-4 w-4 sm:h-5 sm:w-5 text-[#a0704b] dark:text-[#cd853f]" />;
                                  if (state === 'partial') return <MinusSquare className="h-4 w-4 sm:h-5 sm:w-5 text-[#a0704b] dark:text-[#cd853f]" />;
                                  return <Square className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 dark:text-gray-500" />;
                                })()}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setSlotDropdownOpen(slotDropdownOpen === timeSlot ? null : timeSlot); }}
                                className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                title="Selection options (Ctrl+Shift+A markable when focused)"
                              >
                                <ChevronDown className="h-3 w-3" />
                              </button>
                              {slotDropdownOpen === timeSlot && (
                                <div className="absolute top-full left-0 mt-1 bg-[#fef9f3] dark:bg-[#2d2618] shadow-lg rounded-md border border-[#e8d4b8] dark:border-[#6b5a4a] z-[100] py-1 min-w-[160px]">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); toggleSlotSelection(sessionsInSlot, e); setSlotDropdownOpen(null); }}
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#f5ede3] dark:hover:bg-[#3d3520] text-gray-700 dark:text-gray-300"
                                  >
                                    Select All in Slot
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); selectMarkableInSlot(sessionsInSlot); setSlotDropdownOpen(null); }}
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#f5ede3] dark:hover:bg-[#3d3520] text-gray-700 dark:text-gray-300"
                                  >
                                    Select Markable Only
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="bg-[#a0704b] dark:bg-[#cd853f] p-2 rounded-full">
                              <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                            </div>
                            <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">
                              {timeSlot}
                            </h3>
                            <motion.div
                              animate={{ rotate: collapsedSlots.has(timeSlot) ? -90 : 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <ChevronDown className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                            </motion.div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="bg-amber-100 dark:bg-amber-900 text-amber-900 dark:text-amber-100 px-3 py-1 rounded-full border-2 border-amber-600 dark:border-amber-700 font-bold text-xs sm:text-sm">
                              {sessionsInSlot.filter(isCountableSession).length} session{sessionsInSlot.filter(isCountableSession).length !== 1 ? "s" : ""}
                            </div>
                            {(() => {
                              const proposedCount = proposedSessions.filter(
                                (ps) => ps.time_slot === timeSlot && ps.session_date === toDateString(selectedDate)
                              ).length;
                              if (proposedCount > 0) {
                                return (
                                  <div className="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full border border-dashed border-amber-400 dark:border-amber-600 text-xs font-medium flex items-center gap-1">
                                    <CalendarClock className="h-3 w-3" />
                                    {proposedCount} proposed
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Session Cards (Collapsible) */}
                    <AnimatePresence initial={false}>
                      {!collapsedSlots.has(timeSlot) && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-3 ml-0 sm:ml-4 p-1">
                            {sessionsInSlot.map((session, sessionIndex) => {
                        const displayStatus = getDisplayStatus(session);
                        const statusConfig = getSessionStatusConfig(displayStatus);
                        const StatusIcon = statusConfig.Icon;
                        const prevSession = sessionIndex > 0 ? sessionsInSlot[sessionIndex - 1] : null;
                        const isNewTutor = prevSession && prevSession.tutor_name !== session.tutor_name;
                        return (
                          <div key={session.id}>
                            {isNewTutor && (
                              <div className="border-t-2 border-dashed border-[#d4a574] dark:border-[#8b6f47] my-4" />
                            )}
                            <motion.div
                              initial={{ opacity: 0, x: -20 }}
                              animate={{
                                opacity: session.enrollment_payment_status === 'Cancelled' ? 0.5 : 1,
                                x: 0
                              }}
                              transition={{
                                // Skip stagger delay on re-expand (only animate on first render)
                                delay: isMobile || seenSlotsRef.current.has(timeSlot) ? 0 : 0.7 + groupIndex * 0.1 + sessionIndex * 0.05,
                                duration: 0.35,
                                ease: [0.38, 1.21, 0.22, 1.00]
                              }}
                              whileHover={!isMobile ? {
                                scale: 1.02,
                                y: -4,
                                transition: { duration: 0.2 }
                              } : {}}
                              whileTap={{ scale: 0.98 }}
                              onClick={(e) => handleCardClick(session, e)}
                              title="Click for quick view"
                              ref={(el) => {
                                      if (el) cardRefsMap.current.set(session.id, el);
                                      else cardRefsMap.current.delete(session.id);
                                    }}
                              className={cn(
                                "relative rounded-lg cursor-pointer transition-all duration-200 overflow-hidden flex",
                                statusConfig.bgTint,
                                !isMobile && "paper-texture",
                                selectedIds.has(session.id) && focusedSessionId !== session.id && "outline outline-2 outline-[#a0704b] dark:outline-[#cd853f]",
                                focusedSessionId === session.id && !selectedIds.has(session.id) && "outline outline-2 outline-[#a0704b] dark:outline-[#cd853f]",
                                focusedSessionId === session.id && selectedIds.has(session.id) && "outline outline-dashed outline-2 outline-[#a0704b] dark:outline-[#cd853f]"
                              )}
                              style={{
                                transform: isMobile ? 'none' : `rotate(${sessionIndex % 2 === 0 ? -0.3 : 0.3}deg)`,
                                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                              }}
                            >
                              {/* Checkbox for bulk selection */}
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleSelect(session.id); }}
                                className="flex-shrink-0 p-2 sm:p-3 flex items-center justify-center border-r border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                              >
                                {selectedIds.has(session.id) ? (
                                  <CheckSquare className="h-4 w-4 sm:h-5 sm:w-5 text-[#a0704b] dark:text-[#cd853f]" />
                                ) : (
                                  <Square className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300" />
                                )}
                              </button>

                              {/* Main content */}
                              <div className="flex-1 p-3 sm:p-4 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  {/* Left side - Session info */}
                                  <div className="space-y-1.5 flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className={cn(
                                        "flex items-center gap-1.5 min-w-0 w-full sm:w-auto",
                                        statusConfig.strikethrough && "line-through decoration-gray-500 dark:decoration-gray-400"
                                      )}>
                                        <span className={cn(
                                          "text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap flex-shrink-0",
                                          statusConfig.strikethrough && "text-gray-500 dark:text-gray-400"
                                        )}>
                                          {selectedLocation === "All Locations" && session.location && `${session.location}-`}{session.school_student_id}
                                        </span>
                                        <span className={cn(
                                          "font-bold text-base truncate",
                                          session.enrollment_payment_status === 'Cancelled'
                                            ? "text-gray-500 dark:text-gray-400"
                                            : session.financial_status !== "Paid"
                                              ? "text-red-600 dark:text-red-400"
                                              : "text-gray-900 dark:text-gray-100",
                                          statusConfig.strikethrough && "text-gray-500 dark:text-gray-400"
                                        )}>
                                          {session.student_name}
                                        </span>
                                      </p>
                                      {session.grade && (
                                        <span
                                          className="text-[11px] px-1.5 py-0.5 rounded text-gray-800 whitespace-nowrap"
                                          style={{ backgroundColor: getGradeColor(session.grade, session.lang_stream) }}
                                        >{session.grade}{session.lang_stream || ''}</span>
                                      )}
                                      {session.school && (
                                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 whitespace-nowrap">{session.school}</span>
                                      )}
                                      {session.exam_revision_slot_id && (
                                        <span title="Exam Revision"><GraduationCap className="h-3.5 w-3.5 text-purple-500 flex-shrink-0 hidden sm:inline" /></span>
                                      )}
                                      {session.extension_request_id && (
                                        <span title={`Extension ${session.extension_request_status}`}><Clock className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 hidden sm:inline" /></span>
                                      )}
                                      {session.enrollment_payment_status === 'Cancelled' ? (
                                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 whitespace-nowrap font-medium">
                                          Cancelled
                                        </span>
                                      ) : session.financial_status !== "Paid" && (
                                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 whitespace-nowrap flex items-center gap-0.5">
                                          <HandCoins className="h-3.5 w-3.5" />
                                          <span className="hidden sm:inline">Unpaid</span>
                                        </span>
                                      )}
                                      <Link
                                        href={`/sessions/${session.id}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          saveScrollPosition();
                                        }}
                                        className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-[#a0704b]/10 hover:bg-[#a0704b]/20 dark:bg-[#cd853f]/10 dark:hover:bg-[#cd853f]/20 text-[#a0704b] dark:text-[#cd853f] font-medium whitespace-nowrap transition-colors flex-shrink-0"
                                      >
                                        <span className="hidden sm:inline">View</span>
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </Link>
                                      <Link
                                        href={`/sessions/${session.id}?lesson=true`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          saveScrollPosition();
                                        }}
                                        className="flex items-center text-xs px-1.5 py-1 rounded bg-[#a0704b]/10 hover:bg-[#a0704b]/20 dark:bg-[#cd853f]/10 dark:hover:bg-[#cd853f]/20 text-[#a0704b] dark:text-[#cd853f] transition-colors flex-shrink-0"
                                        title="Lesson Mode"
                                      >
                                        <Presentation className="h-3.5 w-3.5" />
                                      </Link>
                                    </div>
                                  </div>

                                  {/* Right side - Status text + Proposal Indicator */}
                                  <div className="flex flex-col items-end gap-0.5 flex-shrink-0 text-right">
                                    <p className={cn("text-sm font-medium truncate max-w-[80px] sm:max-w-none", statusConfig.textClass)}>
                                      {displayStatus}
                                    </p>
                                    {session.tutor_name && (
                                      <p className="text-xs text-gray-600 dark:text-gray-400">
                                        {session.tutor_name}
                                      </p>
                                    )}
                                    {/* Show proposal indicator if session has pending proposal */}
                                    {sessionProposalMap.has(session.id) && (
                                      <ProposalIndicatorBadge
                                        proposal={sessionProposalMap.get(session.id)!}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedProposal(sessionProposalMap.get(session.id)!);
                                        }}
                                        size="sm"
                                      />
                                    )}
                                  </div>
                                </div>

                                {/* Action buttons row */}
                                <SessionActionButtons
                                  session={session}
                                  size="md"
                                  showLabels
                                  onLoadingChange={handleActionLoadingChange}
                                  loadingActionId={loadingSessionActions.get(session.id) || null}
                                  className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700"
                                />
                              </div>

                              {/* Status color strip with icon - RIGHT side */}
                              <div className={cn("w-10 sm:w-12 flex-shrink-0 flex items-center justify-center rounded-r-lg", statusConfig.bgClass)}>
                                {loadingSessionActions.has(session.id) ? (
                                  <div className="w-5 h-5 sm:w-6 sm:h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <StatusIcon className={cn("h-5 w-5 sm:h-6 sm:w-6 text-white", statusConfig.iconClass)} />
                                )}
                              </div>
                            </motion.div>
                          </div>
                        );
                            })}

                            {/* Proposed Sessions for this time slot */}
                            {proposedSessions
                              .filter((ps) => ps.time_slot === timeSlot && ps.session_date === toDateString(selectedDate))
                              .map((proposedSession, psIndex) => (
                                <ProposedSessionRow
                                  key={proposedSession.id}
                                  proposedSession={proposedSession}
                                  onClick={() => setSelectedProposal(proposedSession.proposal)}
                                />
                              ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                ))}
              </>
            )}
          </div>

          <ScrollToTopButton />
        </div>

        {/* Session Detail Popover */}
        {popoverSession && (
          <SessionDetailPopover
            session={popoverSession}
            isOpen={!!popoverSession}
            onClose={() => setPopoverSession(null)}
            clickPosition={popoverClickPosition}
            tutorFilter={tutorFilter}
            onNavigate={saveScrollPosition}
            sessionProposalMap={sessionProposalMap}
            onProposalClick={setSelectedProposal}
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

        {/* Quick action modals (triggered by keyboard shortcuts on focused card) */}
        {quickActionSession && quickActionType === 'CW' && (
          <ExerciseModal
            session={quickActionSession}
            exerciseType="CW"
            isOpen={true}
            onClose={() => { setQuickActionSession(null); setQuickActionType(null); }}
          />
        )}
        {quickActionSession && quickActionType === 'HW' && (
          <ExerciseModal
            session={quickActionSession}
            exerciseType="HW"
            isOpen={true}
            onClose={() => { setQuickActionSession(null); setQuickActionType(null); }}
          />
        )}
        {quickActionSession && quickActionType === 'Rate' && (
          <RateSessionModal
            session={quickActionSession}
            isOpen={true}
            onClose={() => { setQuickActionSession(null); setQuickActionType(null); }}
          />
        )}
        {quickActionSession && quickActionType === 'Edit' && (
          <EditSessionModal
            session={quickActionSession}
            isOpen={true}
            onClose={() => { setQuickActionSession(null); setQuickActionType(null); }}
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

        {/* Keyboard shortcut hint button (shows when panel is hidden) */}
        {!showShortcutHints && (
          <button
            onClick={() => setShowShortcutHints(true)}
            className={cn(
              "hidden md:flex fixed right-4 z-40 w-8 h-8 rounded-full transition-all duration-200",
              "bg-[#fef9f3] dark:bg-[#2d2618] border border-[#d4a574] dark:border-[#8b6f47]",
              "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200",
              "shadow-md items-center justify-center",
              isScrolledPastThreshold ? "bottom-20" : "bottom-4"
            )}
            title="Keyboard shortcuts (?)"
          >
            <span className="text-sm font-mono">?</span>
          </button>
        )}

        {/* Keyboard Shortcut Hints Panel */}
        <AnimatePresence>
          {showShortcutHints && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="fixed bottom-4 right-4 z-50 p-4 rounded-lg shadow-lg border
                bg-[#fef9f3] dark:bg-[#2d2618] border-[#d4a574] dark:border-[#8b6f47]
                text-sm w-64"
            >
              <div className="flex justify-between items-center mb-3">
                <span className="font-semibold text-[#5c4033] dark:text-[#d4a574]">
                  Keyboard Shortcuts
                </span>
                <button
                  onClick={() => setShowShortcutHints(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-1.5 text-gray-600 dark:text-gray-300">
                <div className="flex justify-between gap-4">
                  <kbd className="px-1.5 py-0.5 bg-white dark:bg-[#1a1a1a] rounded border text-xs font-mono">J↓ K↑</kbd>
                  <span>Navigate sessions</span>
                </div>
                <div className="flex justify-between gap-4">
                  <kbd className="px-1.5 py-0.5 bg-white dark:bg-[#1a1a1a] rounded border text-xs font-mono">Space</kbd>
                  <span>Toggle selection</span>
                </div>
                <div className="flex justify-between gap-4">
                  <kbd className="px-1.5 py-0.5 bg-white dark:bg-[#1a1a1a] rounded border text-xs font-mono">Enter</kbd>
                  <span>Open details</span>
                </div>
                <div className="flex justify-between gap-4">
                  <kbd className="px-1.5 py-0.5 bg-white dark:bg-[#1a1a1a] rounded border text-xs font-mono">A/N</kbd>
                  <span>Attended / No Show</span>
                </div>
                <div className="flex justify-between gap-4">
                  <kbd className="px-1.5 py-0.5 bg-white dark:bg-[#1a1a1a] rounded border text-xs font-mono">C/H</kbd>
                  <span>CW / HW</span>
                </div>
                <div className="flex justify-between gap-4">
                  <kbd className="px-1.5 py-0.5 bg-white dark:bg-[#1a1a1a] rounded border text-xs font-mono">Ctrl+A</kbd>
                  <span>Select all</span>
                </div>
                <div className="flex justify-between gap-4">
                  <kbd className="px-1.5 py-0.5 bg-white dark:bg-[#1a1a1a] rounded border text-xs font-mono">Ctrl+Shift+A</kbd>
                  <span>Select markable</span>
                </div>
                <div className="flex justify-between gap-4">
                  <kbd className="px-1.5 py-0.5 bg-white dark:bg-[#1a1a1a] rounded border text-xs font-mono">Esc</kbd>
                  <span>Deselect / Clear</span>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
                Press <kbd className="px-1 py-0.5 bg-white dark:bg-[#1a1a1a] rounded border font-mono">?</kbd> to toggle
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DeskSurface>
      <QuickAttendFAB selectedDate={selectedDate} />
      </>
    );
  }

  // Non-list views (weekly, daily, monthly)
  return (
    <>
    <DeskSurface fullHeight={viewMode === "weekly" || viewMode === "daily" || viewMode === "monthly"}>
      <PageTransition className={cn(
        "flex flex-col gap-2 sm:gap-3 p-2 sm:p-4",
        (viewMode === "weekly" || viewMode === "daily" || viewMode === "monthly") && "h-full overflow-hidden"
      )}>
        {/* Toolbar with animation (non-list views don't need sticky) */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.38, 1.21, 0.22, 1.00] }}
          className={toolbarInnerClasses}
        >
          {toolbarContent}
        </motion.div>

      {/* Weekly Calendar View */}
      {viewMode === "weekly" && (
        <WeeklyGridView
          sessions={sessions}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          isMobile={isMobile}
          tutorFilter={tutorFilter}
          fillHeight
          proposedSessions={proposedSessions}
          onProposalClick={setSelectedProposal}
          sessionProposalMap={sessionProposalMap}
        />
      )}

      {/* Daily View */}
      {viewMode === "daily" && (
        <DailyGridView
          sessions={sessions}
          tutors={filteredTutors}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          isMobile={isMobile}
          fillHeight
          proposedSessions={proposedSessions}
          onProposalClick={setSelectedProposal}
          sessionProposalMap={sessionProposalMap}
        />
      )}

      {/* Monthly View */}
      {viewMode === "monthly" && (
        <MonthlyCalendarView
          sessions={sessions}
          tutors={filteredTutors}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          onViewModeChange={setViewMode}
          isMobile={isMobile}
          proposedSessions={proposedSessions}
          onProposalClick={setSelectedProposal}
          sessionProposalMap={sessionProposalMap}
        />
      )}

      {/* Proposal Detail Modal - needed for Weekly/Daily/Monthly views */}
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

      </PageTransition>
    </DeskSurface>

    {/* Quick Attend FAB - mobile only, outside DeskSurface to avoid overflow-hidden clipping */}
    <QuickAttendFAB selectedDate={selectedDate} />
    </>
  );
}

// --- Quick Attend Floating Action Button (mobile only, today only) ---
function QuickAttendFAB({ selectedDate }: { selectedDate: Date }) {
  const { selectedLocation } = useLocation();
  const { viewMode } = useRole();
  const { user, isImpersonating, impersonatedTutor, effectiveRole } = useAuth();
  const [isMobile, setIsMobile] = useState(false);

  const effectiveTutorId = useMemo(() => {
    if (isImpersonating && effectiveRole === "Tutor" && impersonatedTutor?.id) return impersonatedTutor.id;
    if (viewMode === "my-view" && user?.id) return user.id;
    return undefined;
  }, [viewMode, user?.id, isImpersonating, effectiveRole, impersonatedTutor?.id]);

  const location = selectedLocation && selectedLocation !== "All Locations" ? selectedLocation : undefined;
  const { data: unchecked } = useUncheckedAttendanceCount(location, effectiveTutorId);

  const isToday = useMemo(() => {
    const now = new Date();
    return selectedDate.getFullYear() === now.getFullYear()
      && selectedDate.getMonth() === now.getMonth()
      && selectedDate.getDate() === now.getDate();
  }, [selectedDate]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (!isMobile || !isToday || !unchecked?.total) return null;

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.3 }}
      className="fixed bottom-6 right-6 z-50"
    >
      <Link
        href="/quick-attend"
        className="flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500 text-white shadow-lg hover:bg-emerald-600 active:scale-95 transition-transform"
      >
        <ClipboardCheck className="h-6 w-6" />
        {unchecked.total > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 flex items-center justify-center text-[11px] font-bold rounded-full bg-red-500 text-white">
            {unchecked.total > 99 ? "99+" : unchecked.total}
          </span>
        )}
      </Link>
    </motion.div>
  );
}
