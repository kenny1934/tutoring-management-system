"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMonthlyRevenueSummary, useSessionRevenueDetails, useTutors, usePageTitle } from "@/lib/hooks";
import { useLocation } from "@/contexts/LocationContext";
import { useRole } from "@/contexts/RoleContext";
import { useAuth } from "@/contexts/AuthContext";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition, StickyNote } from "@/lib/design-system";
import { TutorSelector, type TutorValue } from "@/components/selectors/TutorSelector";
import { SessionDetailPopover } from "@/components/sessions/SessionDetailPopover";
import { SessionStatusTag } from "@/components/ui/session-status-tag";
import { RevenueMatrix } from "@/components/revenue/RevenueMatrix";
import { sessionsAPI } from "@/lib/api";
import { DollarSign, Calendar, ChevronLeft, ChevronRight, User, Loader2, TrendingUp, CircleDot, LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
import type { Session } from "@/types";

// Helper to get current month in YYYY-MM format
function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Helper to format period for display
function formatPeriodDisplay(period: string): string {
  const [year, month] = period.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// Helper to get previous/next period
function adjustPeriod(period: string, delta: number): string {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(year, month - 1 + delta);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Helper to get next month's display name (salary is paid in the month after revenue is earned)
function getNextMonthDisplay(period: string): string {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(year, month); // month is 0-indexed, so this gives next month
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// Format currency
function formatCurrency(amount: number): string {
  return `MOP ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function RevenuePage() {
  usePageTitle("Revenue");

  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedLocation } = useLocation();
  const { viewMode } = useRole();
  const { user, canViewAdminPages, isGuest, isLoading: authLoading, isImpersonating, impersonatedTutor, effectiveRole } = useAuth();
  const { data: tutors = [] } = useTutors();

  // State from URL params - admins can select any tutor, non-admins use their own ID
  const [selectedTutorId, setSelectedTutorId] = useState<TutorValue>(() => {
    const tutor = searchParams.get('tutor');
    return tutor ? parseInt(tutor) : null;
  });

  // In center-view, admins can select tutors; in my-view, everyone sees their own
  // When impersonating a tutor, use the impersonated tutor's ID
  const effectiveTutorId = (canViewAdminPages && viewMode === 'center-view')
    ? selectedTutorId
    : (isImpersonating && effectiveRole === 'Tutor' && impersonatedTutor?.id)
      ? impersonatedTutor.id
      : (user?.id ?? null);

  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => {
    return searchParams.get('period') || getCurrentPeriod();
  });

  // Table view (matrix) defaults to true for admins in center-view, off otherwise.
  // Single source of truth from URL; falls back to role-based default.
  const tableViewAvailable = canViewAdminPages && viewMode === 'center-view';
  const [view, setView] = useState<'table' | 'detail'>(() => {
    const v = searchParams.get('view');
    if (v === 'table' || v === 'detail') return v;
    return tableViewAvailable ? 'table' : 'detail';
  });

  const [selectedYear, setSelectedYear] = useState<number>(() => {
    const y = searchParams.get('year');
    if (y && /^\d{4}$/.test(y)) return parseInt(y, 10);
    return new Date().getFullYear();
  });

  // Matrix sort: "total" | "tutor" | YYYY-MM, plus direction.
  // Persisted as ?sort=<key>:<dir>; omitted when default (total:desc).
  const [matrixSortKey, setMatrixSortKey] = useState<string>(() => {
    const s = searchParams.get('sort');
    if (s) {
      const [key] = s.split(':');
      if (key === 'total' || key === 'tutor' || /^\d{4}-\d{2}$/.test(key)) return key;
    }
    return 'total';
  });
  const [matrixSortDir, setMatrixSortDir] = useState<'asc' | 'desc'>(() => {
    const s = searchParams.get('sort');
    if (s) {
      const [, dir] = s.split(':');
      if (dir === 'asc' || dir === 'desc') return dir;
    }
    return 'desc';
  });

  const [isMobile, setIsMobile] = useState(false);

  // Popover state for session details
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverLoading, setPopoverLoading] = useState(false);
  const [popoverSession, setPopoverSession] = useState<Session | null>(null);
  const [popoverClickPosition, setPopoverClickPosition] = useState<{ x: number; y: number } | null>(null);

  // Pagination state for session table
  const [displayCount, setDisplayCount] = useState(30);

  // Handle session row click - show popover immediately with loading state
  const handleSessionRowClick = async (sessionId: number, event: React.MouseEvent) => {
    event.preventDefault();
    setPopoverClickPosition({ x: event.clientX, y: event.clientY });
    setPopoverOpen(true);
    setPopoverLoading(true);
    setPopoverSession(null);

    try {
      const fullSession = await sessionsAPI.getById(sessionId);
      setPopoverSession(fullSession);
    } catch (error) {
      setPopoverOpen(false);
    } finally {
      setPopoverLoading(false);
    }
  };

  const closePopover = () => {
    setPopoverOpen(false);
    setPopoverSession(null);
  };

  // Auto-select first tutor for admins when no tutor selected
  useEffect(() => {
    if (canViewAdminPages && selectedTutorId === null && tutors.length > 0) {
      // Filter tutors by location if needed
      const filteredTutors = selectedLocation && selectedLocation !== "All Locations"
        ? tutors.filter(t => t.default_location === selectedLocation)
        : tutors;
      if (filteredTutors.length > 0) {
        setSelectedTutorId(filteredTutors[0].id);
      }
    }
  }, [canViewAdminPages, selectedTutorId, tutors, selectedLocation]);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Reset pagination when period or tutor changes
  useEffect(() => {
    setDisplayCount(30);
  }, [selectedPeriod, selectedTutorId]);

  // Force detail view if the user can't access the table (non-admin or my-view).
  useEffect(() => {
    if (!tableViewAvailable && view === 'table') {
      setView('detail');
    }
  }, [tableViewAvailable, view]);

  // Sync state to URL (only for admins who can change tutor selection)
  useEffect(() => {
    if (!canViewAdminPages) return; // Non-admins don't need URL sync for tutor
    const params = new URLSearchParams();
    if (tableViewAvailable && view !== 'table') {
      params.set('view', view);
    }
    if (view === 'table') {
      if (selectedYear !== new Date().getFullYear()) {
        params.set('year', selectedYear.toString());
      }
      if (!(matrixSortKey === 'total' && matrixSortDir === 'desc')) {
        params.set('sort', `${matrixSortKey}:${matrixSortDir}`);
      }
    } else {
      if (selectedTutorId && typeof selectedTutorId === 'number') {
        params.set('tutor', selectedTutorId.toString());
      }
      if (selectedPeriod !== getCurrentPeriod()) {
        params.set('period', selectedPeriod);
      }
    }
    const query = params.toString();
    router.replace(`/revenue${query ? `?${query}` : ''}`, { scroll: false });
  }, [canViewAdminPages, tableViewAvailable, view, selectedYear, matrixSortKey, matrixSortDir, selectedTutorId, selectedPeriod, router]);

  // Fetch data - use effectiveTutorId which respects role-based access.
  // Skip detail fetches entirely when the table view is active so we don't
  // hammer the per-tutor endpoints on initial load.
  const tutorIdForQuery = typeof effectiveTutorId === 'number' && view === 'detail' ? effectiveTutorId : null;
  const periodForQuery = view === 'detail' ? selectedPeriod : null;
  const { data: summary, isLoading: loadingSummary, error: summaryError } =
    useMonthlyRevenueSummary(tutorIdForQuery, periodForQuery);
  const { data: sessions = [], isLoading: loadingSessions } =
    useSessionRevenueDetails(tutorIdForQuery, periodForQuery);

  const handleMatrixCellClick = (tutorId: number, period: string) => {
    setSelectedTutorId(tutorId);
    setSelectedPeriod(period);
    setView('detail');
  };

  // Determine if salary should be shown (hide for Admin and Super Admin roles)
  const viewedTutor = tutors.find(t => t.id === effectiveTutorId);
  const viewedTutorRole = viewedTutor?.role;
  const showSalary = viewedTutorRole && !['Admin', 'Super Admin'].includes(viewedTutorRole);

  const isLoading = loadingSummary || loadingSessions;

  // Pagination for session table
  const paginatedSessions = sessions.slice(0, displayCount);
  const hasMoreSessions = sessions.length > displayCount;

  // Toolbar classes (match sessions page pattern - separate sticky container from visual styling)
  const toolbarInnerClasses = cn(
    "flex flex-wrap items-center gap-2 sm:gap-3",
    "bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47]",
    "rounded-lg px-3 sm:px-4 py-2",
    !isMobile && "paper-texture"
  );

  if (isGuest) {
    return (
      <DeskSurface fullHeight>
        <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 text-foreground/60">
          <DollarSign className="h-12 w-12 text-red-500/50" />
          <p>Access denied — Guest role cannot view revenue data</p>
        </div>
      </DeskSurface>
    );
  }

  return (
    <DeskSurface fullHeight>
      <PageTransition className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 p-2 sm:p-4 min-h-full">
          {/* Toolbar - outer div is sticky container, inner div has visual styling */}
          <div className="sticky top-0 z-30">
            <div className={toolbarInnerClasses}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full">
              {/* Top row: Title + view-specific controls */}
              <div className="flex items-center gap-2 sm:gap-3">
                {/* Title */}
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-[#a0704b] dark:text-[#cd853f]" />
                  <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">
                    Revenue
                  </h1>
                </div>

                <div className="h-6 w-px bg-[#d4a574]/50 hidden sm:block" />

                {/* View toggle - admin/center-view only */}
                {tableViewAvailable && (
                  <div className="inline-flex rounded-md border border-[#d4a574] dark:border-[#6b5a4a] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setView('table')}
                      className={cn(
                        "flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors",
                        view === 'table'
                          ? "bg-[#a0704b] text-white"
                          : "bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
                      )}
                      title="Tutor x Month table"
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Table</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setView('detail')}
                      className={cn(
                        "flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors border-l border-[#d4a574] dark:border-[#6b5a4a]",
                        view === 'detail'
                          ? "bg-[#a0704b] text-white"
                          : "bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
                      )}
                      title="Single tutor / single month detail"
                    >
                      <List className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Detail</span>
                    </button>
                  </div>
                )}

                {/* Detail view: Tutor Selector */}
                {view === 'detail' && viewMode === 'center-view' && canViewAdminPages && (
                  <TutorSelector
                    value={selectedTutorId}
                    onChange={setSelectedTutorId}
                    location={selectedLocation}
                    allowClear={false}
                  />
                )}
              </div>

              {/* Right side: month navigator (detail) or year selector (table) */}
              {view === 'detail' ? (
                <div className="flex items-center justify-center sm:justify-start gap-1 sm:ml-auto">
                <button
                  onClick={() => setSelectedPeriod(adjustPeriod(selectedPeriod, -1))}
                  className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  title="Previous month"
                >
                  <ChevronLeft className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                </button>

                <div className="relative flex items-center">
                  <Calendar className="absolute left-2.5 h-4 w-4 text-[#a0704b] pointer-events-none" />
                  <input
                    type="month"
                    value={selectedPeriod}
                    onChange={(e) => e.target.value && setSelectedPeriod(e.target.value)}
                    max={getCurrentPeriod()}
                    className={cn(
                      "pl-8 pr-3 py-1.5 text-sm font-medium",
                      "bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#6b5a4a] rounded-md",
                      "text-gray-900 dark:text-gray-100",
                      "focus:outline-none focus:ring-2 focus:ring-[#a0704b]/50",
                      "cursor-pointer"
                    )}
                  />
                </div>

                <button
                  onClick={() => setSelectedPeriod(adjustPeriod(selectedPeriod, 1))}
                  className={cn(
                    "p-1.5 rounded transition-colors",
                    selectedPeriod >= getCurrentPeriod()
                      ? "cursor-not-allowed"
                      : "hover:bg-gray-200 dark:hover:bg-gray-700"
                  )}
                  title="Next month"
                  disabled={selectedPeriod >= getCurrentPeriod()}
                >
                  <ChevronRight className={cn(
                    "h-4 w-4",
                    selectedPeriod >= getCurrentPeriod()
                      ? "text-gray-300 dark:text-gray-600"
                      : "text-gray-600 dark:text-gray-400"
                  )} />
                </button>
                </div>
              ) : (
                <div className="flex items-center justify-center sm:justify-start gap-1 sm:ml-auto">
                  <button
                    onClick={() => setSelectedYear(y => y - 1)}
                    className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    title="Previous year"
                  >
                    <ChevronLeft className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                  </button>
                  <div className="relative flex items-center">
                    <Calendar className="absolute left-2.5 h-4 w-4 text-[#a0704b] pointer-events-none" />
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                      className={cn(
                        "pl-8 pr-3 py-1.5 text-sm font-medium",
                        "bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#6b5a4a] rounded-md",
                        "text-gray-900 dark:text-gray-100",
                        "focus:outline-none focus:ring-2 focus:ring-[#a0704b]/50",
                        "cursor-pointer"
                      )}
                    >
                      {Array.from({ length: 5 }).map((_, i) => {
                        const y = new Date().getFullYear() - i;
                        return <option key={y} value={y}>{y}</option>;
                      })}
                    </select>
                  </div>
                  <button
                    onClick={() => setSelectedYear(y => y + 1)}
                    className={cn(
                      "p-1.5 rounded transition-colors",
                      selectedYear >= new Date().getFullYear()
                        ? "cursor-not-allowed"
                        : "hover:bg-gray-200 dark:hover:bg-gray-700"
                    )}
                    title="Next year"
                    disabled={selectedYear >= new Date().getFullYear()}
                  >
                    <ChevronRight className={cn(
                      "h-4 w-4",
                      selectedYear >= new Date().getFullYear()
                        ? "text-gray-300 dark:text-gray-600"
                        : "text-gray-600 dark:text-gray-400"
                    )} />
                  </button>
                </div>
              )}
            </div>
          </div>
          </div>

          {/* Auth loading state */}
          {authLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-[#a0704b] dark:text-[#cd853f]" />
                <p className="text-sm text-gray-600 dark:text-gray-400">Checking authentication...</p>
              </div>
            </div>
          )}

          {/* Table view */}
          {!authLoading && view === 'table' && (
            <RevenueMatrix
              year={selectedYear}
              location={selectedLocation}
              isMobile={isMobile}
              sortKey={matrixSortKey}
              sortDir={matrixSortDir}
              onSortChange={(key, dir) => { setMatrixSortKey(key); setMatrixSortDir(dir); }}
              onCellClick={handleMatrixCellClick}
            />
          )}

          {/* Loading state (detail view) */}
          {view === 'detail' && isLoading && !summary && (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-[#a0704b] dark:text-[#cd853f]" />
                <p className="text-sm text-gray-600 dark:text-gray-400">Loading revenue data...</p>
              </div>
            </div>
          )}

          {/* No tutor selected message - only show for admins in detail view */}
          {view === 'detail' && !authLoading && canViewAdminPages && !effectiveTutorId && !isLoading && (
            <div className="flex justify-center py-12">
              <StickyNote variant="yellow" size="lg" showTape>
                <div className="text-center">
                  <User className="h-12 w-12 mx-auto mb-4 text-gray-700 dark:text-gray-300" />
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Select a Tutor</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Choose a tutor from the dropdown to view their revenue
                  </p>
                </div>
              </StickyNote>
            </div>
          )}

          {/* Error state (detail) */}
          {view === 'detail' && summaryError && (
            <div className="flex justify-center py-12">
              <StickyNote variant="pink" size="lg" showTape>
                <div className="text-center">
                  <p className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">Error</p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {summaryError instanceof Error ? summaryError.message : "Failed to load revenue data"}
                  </p>
                </div>
              </StickyNote>
            </div>
          )}

          {/* Summary Card (detail) */}
          {view === 'detail' && summary && (
            <div className={cn(
              "bg-white dark:bg-[#1a1a1a] rounded-lg border-2 border-[#d4a574] dark:border-[#8b6f47] overflow-hidden",
              !isMobile && "paper-texture"
            )}>
              {/* Header */}
              <div className="px-4 py-3 bg-[#f5ede3] dark:bg-[#3d3628] border-b border-[#d4a574]/30">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {summary.tutor_name} - {formatPeriodDisplay(selectedPeriod)}
                </h2>
              </div>

              {/* Stats Grid */}
              <div className="p-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {/* Total Salary - Highlighted (only shown for Tutor role) */}
                  {showSalary && (
                    <div className="col-span-2 sm:col-span-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                            Total Salary (for {getNextMonthDisplay(selectedPeriod)})
                          </p>
                          <p className="text-3xl font-bold text-green-700 dark:text-green-300">
                            {formatCurrency(summary.total_salary)}
                          </p>
                          <p className="text-xs text-green-600/70 dark:text-green-400/70 mt-1">
                            Basic + Bonus
                          </p>
                        </div>
                        <DollarSign className="h-12 w-12 text-green-500/30" />
                      </div>
                    </div>
                  )}

                  {/* Basic Salary (only shown for Tutor role) */}
                  {showSalary && (
                    <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Basic Salary
                      </p>
                      <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                        {formatCurrency(summary.basic_salary)}
                      </p>
                    </div>
                  )}

                  {/* Monthly Bonus - Highlighted (only shown for Tutor role) */}
                  {showSalary && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                      <p className="text-xs text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        Monthly Bonus
                      </p>
                      <p className="text-xl font-semibold text-amber-700 dark:text-amber-300">
                        {formatCurrency(summary.monthly_bonus)}
                      </p>
                    </div>
                  )}

                  {/* Session Revenue */}
                  <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Session Revenue
                    </p>
                    <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                      {formatCurrency(summary.session_revenue)}
                    </p>
                  </div>

                  {/* Sessions Count */}
                  <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Sessions
                    </p>
                    <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                      {summary.sessions_count}
                      {summary.avg_revenue_per_session && (
                        <span className="text-sm font-normal text-gray-500 ml-2">
                          (avg {formatCurrency(summary.avg_revenue_per_session)})
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Session Details Table (detail) */}
          {view === 'detail' && sessions.length > 0 && (
            <div className={cn(
              "bg-white dark:bg-[#1a1a1a] rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] overflow-hidden",
              !isMobile && "paper-texture"
            )}>
              <div className="px-4 py-3 bg-[#f5ede3] dark:bg-[#3d3628] border-b border-[#d4a574]/30">
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
                  Session Details
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-gray-50 dark:bg-gray-800/50">
                      <th className="px-3 sm:px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Date</th>
                      <th className="px-3 sm:px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Time</th>
                      <th className="px-3 sm:px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Student</th>
                      <th className="px-3 sm:px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-400">
                        <CircleDot className="h-4 w-4 sm:hidden" />
                        <span className="hidden sm:inline">Status</span>
                      </th>
                      <th className="px-3 sm:px-4 py-2 text-right font-medium text-gray-600 dark:text-gray-400">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedSessions.map((session) => (
                      <tr
                        key={session.session_id}
                        onClick={(e) => handleSessionRowClick(session.session_id, e)}
                        className="border-b border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer transition-colors"
                      >
                        <td className="px-3 sm:px-4 py-2 text-gray-900 dark:text-gray-100">
                          {new Date(session.session_date).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </td>
                        <td className="px-3 sm:px-4 py-2 text-gray-600 dark:text-gray-400">
                          {session.time_slot || '-'}
                        </td>
                        <td className="px-3 sm:px-4 py-2">
                          <Link
                            href={`/students/${session.student_id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[#a0704b] dark:text-[#cd853f] hover:underline"
                          >
                            {session.student_name}
                          </Link>
                        </td>
                        <td className="px-3 sm:px-4 py-2">
                          <span className="sm:hidden">
                            <SessionStatusTag status={session.session_status} size="sm" iconOnly />
                          </span>
                          <span className="hidden sm:inline">
                            <SessionStatusTag status={session.session_status} size="sm" />
                          </span>
                        </td>
                        <td className="px-3 sm:px-4 py-2 text-right font-medium text-gray-900 dark:text-gray-100">
                          {formatCurrency(session.cost_per_session)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 font-medium">
                      <td colSpan={4} className="px-3 sm:px-4 py-2 text-right text-gray-600 dark:text-gray-400">
                        Total ({sessions.length} sessions)
                      </td>
                      <td className="px-3 sm:px-4 py-2 text-right text-gray-900 dark:text-gray-100">
                        {formatCurrency(summary?.session_revenue || 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                {hasMoreSessions && (
                  <button
                    onClick={() => setDisplayCount(c => c + 30)}
                    className="w-full py-3 text-sm font-medium text-[#a0704b] dark:text-[#cd853f] hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors border-t border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50"
                  >
                    Show more ({sessions.length - displayCount} remaining)
                  </button>
                )}
              </div>
            </div>
          )}

          {/* No sessions message (detail) */}
          {view === 'detail' && effectiveTutorId && sessions.length === 0 && !isLoading && summary && (
            <div className="flex justify-center py-8">
              <StickyNote variant="blue" size="md" showTape>
                <div className="text-center">
                  <Calendar className="h-10 w-10 mx-auto mb-3 text-gray-700 dark:text-gray-300" />
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">No sessions found</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    No attended sessions for {formatPeriodDisplay(selectedPeriod)}
                  </p>
                </div>
              </StickyNote>
            </div>
          )}
        </div>

        <ScrollToTopButton />
      </PageTransition>

      {/* Session Detail Popover */}
      <SessionDetailPopover
        session={popoverSession}
        isOpen={popoverOpen}
        isLoading={popoverLoading}
        onClose={closePopover}
        clickPosition={popoverClickPosition}
      />
    </DeskSurface>
  );
}
