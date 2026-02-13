import { useEffect, useState, useRef, RefObject, useMemo, useCallback } from 'react';
import useSWR, { mutate } from 'swr';
import { sessionsAPI, tutorsAPI, calendarAPI, studentsAPI, enrollmentsAPI, revenueAPI, coursewareAPI, holidaysAPI, terminationsAPI, messagesAPI, proposalsAPI, examRevisionAPI, parentCommunicationsAPI, extensionRequestsAPI, memosAPI, api, type ParentCommunication } from './api';
import type { Session, SessionFilters, Tutor, CalendarEvent, Student, StudentFilters, Enrollment, DashboardStats, ActivityEvent, MonthlyRevenueSummary, SessionRevenueDetail, CoursewarePopularity, CoursewareUsageDetail, Holiday, TerminatedStudent, TerminationStatsResponse, QuarterOption, QuarterTrendPoint, StatDetailStudent, TerminationReviewCount, OverdueEnrollment, UncheckedAttendanceReminder, UncheckedAttendanceCount, MessageThread, Message, MessageCategory, MakeupProposal, ProposalStatus, PendingProposalCount, PendingExtensionRequestCount, ExamRevisionSlot, ExamRevisionSlotDetail, EligibleStudent, ExamWithRevisionSlots, PaginatedThreadsResponse, TutorMemo, CountResponse } from '@/types';

// SWR configuration is now global in Providers.tsx
// Hooks inherit: revalidateOnFocus, revalidateOnReconnect, dedupingInterval, keepPreviousData

/**
 * Hook to detect unseen app updates.
 * Compares NEXT_PUBLIC_APP_VERSION against localStorage 'last-seen-version'.
 * Returns true when there's a new version the user hasn't viewed yet.
 */
export function useUnseenUpdates(): boolean {
  const [hasUnseen, setHasUnseen] = useState(false);

  useEffect(() => {
    const checkVersion = () => {
      const version = process.env.NEXT_PUBLIC_APP_VERSION;
      if (!version || version === 'dev') {
        setHasUnseen(false);
        return;
      }
      const lastSeen = localStorage.getItem('last-seen-version');
      setHasUnseen(lastSeen !== version);
    };

    checkVersion();

    // Listen for storage changes from other tabs (e.g. user opened What's New in another tab)
    window.addEventListener('storage', checkVersion);
    return () => window.removeEventListener('storage', checkVersion);
  }, []);

  return hasUnseen;
}

/**
 * Hook for visibility-aware polling intervals.
 * Returns 0 (disabled) when the browser tab is hidden to save API calls.
 * Resumes polling when the tab becomes visible again.
 */
export function useVisibilityAwareInterval(baseInterval: number): number {
  const [isVisible, setIsVisible] = useState(() =>
    typeof document !== 'undefined' ? !document.hidden : true
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handler = () => setIsVisible(!document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  // Return 0 (disabled) when hidden, else normal interval
  return isVisible ? baseInterval : 0;
}

/**
 * Hook for debouncing a value
 * Useful for search inputs to avoid filtering on every keystroke
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook for filtering a list by search query across multiple fields.
 * Generic and reusable for any list type.
 */
export function useFilteredList<T extends Record<string, unknown>>(
  items: T[],
  searchQuery: string,
  searchFields: (keyof T)[]
): T[] {
  return useMemo(() => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter(item =>
      searchFields.some(field => {
        const value = item[field];
        return typeof value === 'string' && value.toLowerCase().includes(query);
      })
    );
  }, [items, searchQuery, searchFields]);
}

/**
 * Hook for fetching sessions list with filters
 * Returns cached data immediately, then revalidates in background
 */
export function useSessions(filters?: SessionFilters) {
  // Create a stable cache key from filters
  const key = filters ? ['sessions', JSON.stringify(filters)] : ['sessions'];

  return useSWR<Session[]>(
    key,
    () => sessionsAPI.getAll(filters)
  );
}

/**
 * Hook for fetching a single session by ID
 * Returns null key when id is falsy to skip fetching
 */
export function useSession(id: number | null | undefined) {
  return useSWR<Session>(
    id ? ['session', id] : null,
    () => sessionsAPI.getById(id!)
  );
}

/**
 * Hook for fetching tutors list
 */
export function useTutors() {
  return useSWR<Tutor[]>(
    'tutors',
    () => tutorsAPI.getAll()
  );
}

/**
 * Hook for fetching only active tutors (those who teach students)
 * Filters out Supervisors and non-teaching admin staff
 */
export function useActiveTutors() {
  const { data: tutors, ...rest } = useTutors();
  const activeTutors = tutors?.filter(t => t.is_active_tutor !== false) ?? [];
  return { data: activeTutors, ...rest };
}

/**
 * Hook for fetching locations list
 */
export function useLocations() {
  return useSWR<string[]>(
    'locations',
    () => api.stats.getLocations()  );
}

/**
 * Hook for fetching calendar events (tests/exams)
 * Returns cached data immediately, then revalidates in background
 * @param daysAhead Number of days ahead to fetch (default: 30)
 * @param includePast Include past events (default: false)
 * @param daysBehind Days in the past to fetch when includePast=true (default: 365)
 */
export function useCalendarEvents(daysAhead: number = 30, includePast: boolean = false, daysBehind?: number) {
  return useSWR<CalendarEvent[]>(
    ['calendar-events', daysAhead, includePast, daysBehind],
    () => calendarAPI.getEvents(daysAhead, includePast, daysBehind),
    { keepPreviousData: true, revalidateOnFocus: false }
  );
}

/**
 * Hook for fetching students list with filters
 * Returns cached data immediately, then revalidates in background
 */
export function useStudents(filters?: StudentFilters) {
  const key = filters ? ['students', JSON.stringify(filters)] : ['students'];
  return useSWR<Student[]>(
    key,
    () => studentsAPI.getAll(filters)  );
}

/**
 * Hook for fetching a single student by ID
 * Returns null key when id is falsy to skip fetching
 */
export function useStudent(id: number | null | undefined) {
  return useSWR<Student>(
    id ? ['student', id] : null,
    () => studentsAPI.getById(id!)  );
}

/**
 * Hook for fetching active students list (for HeaderStats popover)
 * Only fetches when enabled=true (popover is open)
 */
export function useActiveStudents(location?: string, tutorId?: number, enabled: boolean = true) {
  return useSWR<Array<{
    id: number;
    school_student_id: string | null;
    student_name: string;
    grade: string | null;
    lang_stream: string | null;
    school: string | null;
    home_location: string | null;
  }>>(
    enabled ? ['active-students', location || 'all', tutorId || 'all'] : null,
    () => api.stats.getActiveStudents(location, tutorId),
    { revalidateOnFocus: false }
  );
}

/**
 * Hook for fetching enrollments for a student
 * Returns null key when studentId is falsy to skip fetching
 * Note: revalidateOnFocus disabled to prevent N+1 API calls when switching view modes
 */
export function useStudentEnrollments(studentId: number | null | undefined) {
  return useSWR<Enrollment[]>(
    studentId ? ['enrollments', studentId] : null,
    () => enrollmentsAPI.getAll(studentId!),
    { revalidateOnFocus: false }
  );
}

/**
 * Hook for fetching "My Students" enrollments for a specific tutor
 * Returns active, latest enrollments filtered by tutor and optionally location
 */
export function useMyStudents(tutorId: number | null | undefined, location?: string) {
  return useSWR<Enrollment[]>(
    tutorId ? ['my-students', tutorId, location || 'all'] : null,
    () => enrollmentsAPI.getMyStudents(tutorId!, location)  );
}

/**
 * Hook for fetching all active enrollments in a location
 * Used for "All Tutors" mode in My Students view and dashboard charts
 * @param location - Filter by location
 * @param tutorId - Filter by tutor (for 'My View' mode) - uses getMyStudents
 */
export function useAllStudents(location?: string, tutorId?: number) {
  return useSWR<Enrollment[]>(
    ['all-students', location || 'all', tutorId || 'all'],
    () => tutorId
      ? enrollmentsAPI.getMyStudents(tutorId, location)
      : enrollmentsAPI.getActive(location),
    { revalidateOnFocus: false }
  );
}

/**
 * Hook for fetching sessions for a specific student
 * Returns null key when studentId is falsy to skip fetching
 */
export function useStudentSessions(studentId: number | null | undefined, limit: number = 100) {
  return useSWR<Session[]>(
    studentId ? ['student-sessions', studentId, limit] : null,
    () => sessionsAPI.getAll({ student_id: studentId!, limit })  );
}

/**
 * Hook for fetching parent communications for a specific student
 * Returns null key when studentId is falsy to skip fetching
 * Results are sorted by contact_date descending (most recent first)
 */
export function useStudentParentContacts(studentId: number | null | undefined) {
  return useSWR<ParentCommunication[]>(
    studentId ? ['student-parent-contacts', studentId] : null,
    () => parentCommunicationsAPI.getAll({ student_id: studentId! })
      .then(contacts => contacts.sort((a, b) =>
        new Date(b.contact_date).getTime() - new Date(a.contact_date).getTime()
      )),
    { revalidateOnFocus: false }
  );
}

/**
 * Hook for fetching a single enrollment by ID
 * Returns null key when id is falsy to skip fetching
 */
export function useEnrollment(id: number | null | undefined) {
  return useSWR<Enrollment>(
    id ? ['enrollment', id] : null,
    () => enrollmentsAPI.getById(id!),
    { revalidateOnFocus: false, revalidateIfStale: false }  // Only fetch when modal opens, not on page load
  );
}

/**
 * Hook for fetching sessions for a specific enrollment
 * Returns null key when enrollmentId is falsy to skip fetching
 */
export function useEnrollmentSessions(enrollmentId: number | null | undefined) {
  return useSWR<Session[]>(
    enrollmentId ? ['enrollment-sessions', enrollmentId] : null,
    () => sessionsAPI.getAll({ enrollment_id: enrollmentId!, limit: 500 })  );
}

/**
 * Hook for fetching dashboard stats with caching
 * Returns cached data immediately for instant navigation
 * @param location - Filter by location
 * @param tutorId - Filter by tutor (for 'My View' mode)
 */
export function useDashboardStats(location?: string, tutorId?: number) {
  const key = ['dashboard-stats', location || 'all', tutorId || 'all'];

  return useSWR<DashboardStats>(
    key,
    () => api.stats.getDashboard(location, tutorId),
    { revalidateOnFocus: false }
  );
}

/**
 * Hook for fetching activity feed events
 * Returns recent activity (sessions, payments, enrollments)
 * @param location - Filter by location
 * @param tutorId - Filter by tutor (for 'My View' mode)
 * @param limit - Max number of events to return (default 50, max 100)
 * @param offset - Number of events to skip for pagination
 */
export function useActivityFeed(location?: string, tutorId?: number, limit?: number, offset?: number) {
  const key = ['activity-feed', location || 'all', tutorId || 'all', limit || 'default', offset || 0];

  return useSWR<ActivityEvent[]>(
    key,
    () => api.stats.getActivityFeed(location, tutorId, limit, offset),
    { revalidateOnFocus: false }
  );
}

/**
 * Hook for setting dynamic browser tab titles
 * Updates document.title with page context
 */
const BASE_TITLE = "CSM Pro";

export function usePageTitle(title?: string) {
  // Set title immediately on render (not just in effect) to prevent flicker
  if (typeof document !== 'undefined' && title) {
    const newTitle = `${BASE_TITLE} - ${title}`;
    if (document.title !== newTitle) {
      document.title = newTitle;
    }
  }

  // Also set in effect to ensure it persists after any framework resets
  useEffect(() => {
    if (title) {
      document.title = `${BASE_TITLE} - ${title}`;
    }
  }, [title]);
}

/**
 * Hook for fetching monthly revenue summary for a tutor
 * Returns null key when tutorId or period is falsy to skip fetching
 */
export function useMonthlyRevenueSummary(tutorId: number | null | undefined, period: string | null | undefined) {
  return useSWR<MonthlyRevenueSummary>(
    tutorId && period ? ['revenue-summary', tutorId, period] : null,
    () => revenueAPI.getMonthlySummary(tutorId!, period!)
  );
}

/**
 * Hook for fetching current month's revenue summary for a tutor (My View)
 * Automatically uses current month as the period
 * @param tutorId - The tutor ID to fetch revenue for (undefined skips fetching)
 * @param enabled - Whether to enable fetching (default true, set false to prevent API calls)
 */
export function useCurrentMonthRevenue(tutorId: number | undefined, enabled: boolean = true) {
  const period = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  return useSWR<MonthlyRevenueSummary>(
    enabled && tutorId ? ['current-month-revenue', tutorId, period] : null,
    () => revenueAPI.getMonthlySummary(tutorId!, period),
    { revalidateOnFocus: false }
  );
}

/**
 * Hook for fetching current month's revenue aggregated by location (Center View)
 * @param location - Location to aggregate (null for all locations)
 * @param enabled - Whether to enable fetching (default true, set false to prevent API calls)
 */
export function useLocationMonthlyRevenue(location: string | null, enabled: boolean = true) {
  const period = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  return useSWR<{ location: string; period: string; total_revenue: number; sessions_count: number; avg_revenue_per_session: number }>(
    enabled ? ['location-month-revenue', location || 'all', period] : null,
    () => revenueAPI.getLocationMonthlySummary(location, period),
    { revalidateOnFocus: false }
  );
}

/**
 * Hook for fetching session revenue details for a tutor
 * Returns null key when tutorId or period is falsy to skip fetching
 */
export function useSessionRevenueDetails(tutorId: number | null | undefined, period: string | null | undefined) {
  return useSWR<SessionRevenueDetail[]>(
    tutorId && period ? ['revenue-details', tutorId, period] : null,
    () => revenueAPI.getSessionDetails(tutorId!, period!)
  );
}

/**
 * Hook for fetching courseware popularity rankings
 * Returns list of courseware sorted by assignment count
 */
export function useCoursewarePopularity(
  timeRange: 'recent' | 'all-time',
  exerciseType?: string,
  grade?: string,
  school?: string
) {
  const key = ['courseware-popularity', timeRange, exerciseType || '', grade || '', school || ''];
  return useSWR<CoursewarePopularity[]>(
    key,
    () => coursewareAPI.getPopularity(timeRange, exerciseType, grade, school)
  );
}

/**
 * Hook for fetching detailed usage for a specific courseware file
 * Returns null key when filename is falsy to skip fetching
 * Supports pagination with limit parameter
 */
export function useCoursewareUsageDetail(
  filename: string | null | undefined,
  timeRange: 'recent' | 'all-time',
  limit?: number,
  exerciseType?: string,
  grade?: string,
  school?: string
) {
  return useSWR<CoursewareUsageDetail[]>(
    filename ? ['courseware-detail', filename, timeRange, limit, exerciseType, grade, school] : null,
    () => coursewareAPI.getUsageDetail(filename!, timeRange, limit, undefined, exerciseType, grade, school)
  );
}

/**
 * Hook for fetching holidays within a date range
 * Returns holidays filtered by from_date and to_date
 */
export function useHolidays(from_date?: string, to_date?: string) {
  const key = ['holidays', from_date, to_date].filter(Boolean);
  return useSWR<Holiday[]>(
    key,
    () => holidaysAPI.getHolidays(from_date, to_date),
    { revalidateOnFocus: false }  // Holiday data is essentially static
  );
}

/**
 * Hook for fetching available quarters with terminations
 * Returns quarters in descending order (most recent first)
 */
export function useTerminationQuarters(location?: string) {
  return useSWR<QuarterOption[]>(
    ['termination-quarters', location || 'all'],
    () => terminationsAPI.getQuarters(location),
    { revalidateOnFocus: false }
  );
}

/**
 * Hook for fetching terminated students for a quarter
 * Returns null key when quarter or year is falsy to skip fetching
 */
export function useTerminatedStudents(
  quarter: number | null,
  year: number | null,
  location?: string,
  tutorId?: number
) {
  return useSWR<TerminatedStudent[]>(
    quarter && year
      ? ['terminated-students', quarter, year, location || 'all', tutorId || 'all']
      : null,
    () => terminationsAPI.getTerminatedStudents(quarter!, year!, location, tutorId),
    { revalidateOnFocus: false }
  );
}

/**
 * Hook for fetching termination stats for a quarter
 * Returns null key when quarter or year is falsy to skip fetching
 */
export function useTerminationStats(
  quarter: number | null,
  year: number | null,
  location?: string,
  tutorId?: number
) {
  return useSWR<TerminationStatsResponse>(
    quarter && year
      ? ['termination-stats', quarter, year, location || 'all', tutorId || 'all']
      : null,
    () => terminationsAPI.getStats(quarter!, year!, location, tutorId),
    { revalidateOnFocus: false }
  );
}

export function useTerminationTrends(location?: string, tutorId?: number, enabled = true) {
  return useSWR<QuarterTrendPoint[]>(
    enabled ? ['termination-trends', location || 'all', tutorId || 'all'] : null,
    () => terminationsAPI.getTrends(location, tutorId),
    { revalidateOnFocus: false }
  );
}

/**
 * Hook for fetching count of terminated students needing reason review
 * Used for dashboard badge and notification bell during review period
 * Polls every 60 seconds when tab is visible
 */
export function useTerminationReviewCount(location?: string, tutorId?: number) {
  const refreshInterval = useVisibilityAwareInterval(60000);
  return useSWR<TerminationReviewCount>(
    ['termination-review-count', location || 'all', tutorId || 'all'],
    () => terminationsAPI.getReviewNeededCount(location, tutorId),
    { refreshInterval, revalidateOnFocus: false }
  );
}

export function useStatDetails(
  statType: string | null,
  quarter: number | null,
  year: number | null,
  location?: string,
  tutorId?: number
) {
  return useSWR<StatDetailStudent[]>(
    statType && quarter && year
      ? ['stat-details', statType, quarter, year, location || 'all', tutorId || 'all']
      : null,
    () => terminationsAPI.getStatDetails(statType!, quarter!, year!, location, tutorId),
    { revalidateOnFocus: false }
  );
}

/**
 * Hook for fetching overdue enrollments (pending payment with lessons started)
 * Returns enrollments sorted by days overdue (most overdue first)
 */
export function useOverdueEnrollments(location?: string, tutorId?: number) {
  return useSWR<OverdueEnrollment[]>(
    ['overdue-enrollments', location || 'all', tutorId || 'all'],
    () => enrollmentsAPI.getOverdue(location, tutorId)
  );
}

/**
 * Hook for fetching unchecked attendance sessions
 * Returns past sessions still marked as Scheduled, Make-up Class, or Trial Class
 */
export function useUncheckedAttendance(location?: string, tutorId?: number, urgency?: string) {
  return useSWR<UncheckedAttendanceReminder[]>(
    ['unchecked-attendance', location || 'all', tutorId || 'all', urgency || 'all'],
    () => sessionsAPI.getUncheckedAttendance(location, tutorId, urgency)
  );
}

/**
 * Hook for fetching unchecked attendance count (for notification bell)
 * Polls every 30 seconds when tab is visible
 */
export function useUncheckedAttendanceCount(location?: string, tutorId?: number) {
  const refreshInterval = useVisibilityAwareInterval(30000);
  return useSWR<UncheckedAttendanceCount>(
    ['unchecked-attendance-count', location || 'all', tutorId || 'all'],
    () => sessionsAPI.getUncheckedAttendanceCount(location, tutorId),
    { refreshInterval, revalidateOnFocus: false }
  );
}

/**
 * Hook for fetching message threads for a tutor
 * Returns threads grouped by root message with replies
 * Pauses polling when tab is hidden to save API calls
 *
 * NOTE: This hook fetches all threads for the category (no pagination).
 * For paginated access with Load More, use useMessageThreadsPaginated.
 */
export function useMessageThreads(
  tutorId: number | null | undefined,
  category?: MessageCategory
) {
  const refreshInterval = useVisibilityAwareInterval(30000);
  const result = useSWR<PaginatedThreadsResponse>(
    tutorId ? ['message-threads', tutorId, category || 'all'] : null,
    () => messagesAPI.getThreads(tutorId!, category, 500),
    { refreshInterval, revalidateOnFocus: false }
  );

  // Return threads array for backward compatibility
  return {
    ...result,
    data: result.data?.threads ?? []
  };
}

/**
 * Options for the paginated message threads hook
 */
export interface UseMessageThreadsPaginatedOptions {
  tutorId: number | null | undefined;
  category?: MessageCategory;
  search?: string;
  pageSize?: number;
}

/**
 * Result type for paginated hooks
 */
export interface PaginatedResult<T> {
  data: T[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: Error | undefined;
  hasMore: boolean;
  totalCount: number;
  loadMore: () => void;
  refresh: () => void;
}

/**
 * Hook for fetching message threads with pagination and server-side search.
 * Supports "Load More" pattern for infinite scrolling.
 */
export function useMessageThreadsPaginated(
  options: UseMessageThreadsPaginatedOptions
): PaginatedResult<MessageThread> {
  const { tutorId, category, search, pageSize = 20 } = options;
  const [allData, setAllData] = useState<MessageThread[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const refreshInterval = useVisibilityAwareInterval(60000);

  // Reset when search/category/tutorId changes
  useEffect(() => {
    setIsTransitioning(true);  // Show loading spinner during transition
    setAllData([]);
    setOffset(0);
    setHasMore(true);
    setTotalCount(0);
  }, [search, category, tutorId]);

  // Fetch current page
  const { data, isLoading, error, mutate } = useSWR<PaginatedThreadsResponse>(
    tutorId ? ['message-threads-paginated', tutorId, category || 'all', search || '', offset, pageSize] : null,
    () => messagesAPI.getThreads(tutorId!, category, pageSize, offset, search),
    {
      refreshInterval: offset === 0 ? refreshInterval : 0, // Only poll first page
      revalidateOnFocus: false,
      onSuccess: (response) => {
        setIsTransitioning(false);  // Clear transition state when data arrives
        if (offset === 0) {
          setAllData(response.threads);
        } else {
          setAllData(prev => [...prev, ...response.threads]);
        }
        setHasMore(response.has_more);
        setTotalCount(response.total_count);
        setIsLoadingMore(false);
      }
    }
  );

  // Sync cached data immediately when SWR returns from cache
  // onSuccess only fires after fetch, not for cache hits
  useEffect(() => {
    if (data && offset === 0 && !isLoading) {
      setAllData(data.threads);
      setHasMore(data.has_more);
      setTotalCount(data.total_count);
      setIsTransitioning(false);
    }
  }, [data, offset, isLoading]);

  const loadMore = useCallback(() => {
    if (hasMore && !isLoadingMore && !isLoading) {
      setIsLoadingMore(true);
      setOffset(prev => prev + pageSize);
    }
  }, [hasMore, isLoadingMore, isLoading, pageSize]);

  const refresh = useCallback(() => {
    setAllData([]);
    setOffset(0);
    setHasMore(true);
    mutate();
  }, [mutate]);

  return {
    data: allData,
    isLoading: (isLoading && offset === 0) || isTransitioning,
    isLoadingMore,
    error,
    hasMore,
    totalCount,
    loadMore,
    refresh
  };
}

/**
 * Hook for fetching sent messages for a tutor
 */
export function useSentMessages(tutorId: number | null | undefined) {
  return useSWR<Message[]>(
    tutorId ? ['sent-messages', tutorId] : null,
    () => messagesAPI.getSent(tutorId!),
    { revalidateOnFocus: false }  // No refetch on tab switch
  );
}

/**
 * Hook for fetching unread message count for a tutor
 * Pauses polling when tab is hidden to save API calls
 */
export function useUnreadMessageCount(tutorId: number | null | undefined) {
  const refreshInterval = useVisibilityAwareInterval(30000);
  return useSWR<{ count: number }>(
    tutorId ? ['unread-count', tutorId] : null,
    () => messagesAPI.getUnreadCount(tutorId!),
    { refreshInterval, revalidateOnFocus: false }
  );
}

/**
 * Hook for fetching a specific message thread
 */
export function useMessageThread(
  messageId: number | null | undefined,
  tutorId: number | null | undefined
) {
  return useSWR<MessageThread>(
    messageId && tutorId ? ['message-thread', messageId, tutorId] : null,
    () => messagesAPI.getThread(messageId!, tutorId!)
  );
}

/**
 * Hook for fetching archived message threads for a tutor
 */
export function useArchivedMessages(tutorId: number | null | undefined) {
  const result = useSWR<PaginatedThreadsResponse>(
    tutorId ? ['archived-messages', tutorId] : null,
    () => messagesAPI.getArchived(tutorId!, 50), // Max allowed by backend
    { revalidateOnFocus: false }
  );

  return {
    ...result,
    data: result.data?.threads ?? []
  };
}

/**
 * Hook for fetching pinned/starred message threads for a tutor
 */
export function usePinnedMessages(tutorId: number | null | undefined) {
  const result = useSWR<PaginatedThreadsResponse>(
    tutorId ? ['pinned-messages', tutorId] : null,
    () => messagesAPI.getPinned(tutorId!, 50),
    { revalidateOnFocus: false }
  );

  return {
    ...result,
    data: result.data?.threads ?? []
  };
}

// ============================================
// Make-up Proposal Hooks
// ============================================

/**
 * Hook for fetching proposals with filters
 * Can filter by target tutor, proposer, or status
 */
export function useProposals(params: {
  tutorId?: number;
  proposedBy?: number;
  status?: ProposalStatus;
  includeSession?: boolean;
} = {}) {
  return useSWR<MakeupProposal[]>(
    ['proposals', params.tutorId, params.proposedBy, params.status],
    () => proposalsAPI.getAll({
      tutor_id: params.tutorId,
      proposed_by: params.proposedBy,
      status: params.status,
      include_session: params.includeSession ?? true,
    }),
    { revalidateOnFocus: false }
  );
}

/**
 * Hook for fetching pending proposal count for notification bell
 * Pauses polling when tab is hidden to save API calls
 */
export function usePendingProposalCount(tutorId: number | null | undefined) {
  const refreshInterval = useVisibilityAwareInterval(30000);
  return useSWR<PendingProposalCount>(
    tutorId ? ['pending-proposals-count', tutorId] : null,
    () => proposalsAPI.getPendingCount(tutorId!),
    { refreshInterval, revalidateOnFocus: false }
  );
}

/**
 * Hook for fetching renewal counts (for notification badge)
 * Only enabled for admins
 * Pauses polling when tab is hidden to save API calls
 */
export function useRenewalCounts(isAdmin: boolean, location?: string) {
  const refreshInterval = useVisibilityAwareInterval(60000); // 1 minute refresh
  return useSWR<{ expiring_soon: number; expired: number; total: number }>(
    isAdmin ? ['renewal-counts', location] : null,
    () => enrollmentsAPI.getRenewalCounts(location),
    { refreshInterval, revalidateOnFocus: false }
  );
}

/**
 * Hook for fetching pending extension request count (for notification badge)
 * Only enabled for admins
 * Pauses polling when tab is hidden to save API calls
 */
export function usePendingExtensionCount(isAdmin: boolean, location?: string) {
  const refreshInterval = useVisibilityAwareInterval(60000); // 1 minute refresh
  return useSWR<PendingExtensionRequestCount>(
    isAdmin ? ['pending-extension-count', location] : null,
    () => extensionRequestsAPI.getPendingCount(location),
    { refreshInterval, revalidateOnFocus: false }
  );
}

/**
 * Hook for fetching a single proposal by ID
 */
export function useProposal(proposalId: number | null | undefined) {
  return useSWR<MakeupProposal>(
    proposalId ? ['proposal', proposalId] : null,
    () => proposalsAPI.getById(proposalId!)
  );
}

/**
 * Hook for fetching the active proposal for a specific session
 */
export function useProposalForSession(sessionId: number | null | undefined) {
  return useSWR<MakeupProposal | null>(
    sessionId ? ['proposal-for-session', sessionId] : null,
    () => proposalsAPI.getForSession(sessionId!)
  );
}

/**
 * Hook for fetching pending proposals within a date range
 * Used by session views to show proposed sessions as ghost entries
 */
export function useProposalsInDateRange(
  fromDate: string | null | undefined,
  toDate: string | null | undefined
) {
  return useSWR<MakeupProposal[]>(
    fromDate ? ['proposals-date-range', fromDate, toDate] : null,
    () => proposalsAPI.getAll({
      from_date: fromDate!,
      to_date: toDate ?? undefined,
      include_session: true,
      status: 'pending',
    }),
    { revalidateOnFocus: false }
  );
}

/**
 * Hook for fetching pending proposals by original session date range
 * Used to show "X slots proposed" badge on sessions that have active proposals
 * This filters by the original session's date, not the proposed slot dates
 */
export function useProposalsForOriginalSessions(
  fromDate: string | null | undefined,
  toDate: string | null | undefined
) {
  return useSWR<MakeupProposal[]>(
    fromDate ? ['proposals-original-sessions', fromDate, toDate] : null,
    () => proposalsAPI.getAll({
      original_from_date: fromDate!,
      original_to_date: toDate ?? undefined,
      include_session: true,
      status: 'pending',
    }),
    { revalidateOnFocus: false }
  );
}

/**
 * Hook for browser notifications
 * Handles permission state and sending OS-level notifications
 */
export function useBrowserNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async (): Promise<NotificationPermission> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  };

  const sendNotification = (title: string, options?: NotificationOptions): Notification | null => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return null;
    }
    // Only send if permission granted and page is not visible
    if (permission === 'granted' && document.hidden) {
      return new Notification(title, options);
    }
    return null;
  };

  return { permission, requestPermission, sendNotification };
}

/**
 * Hook for detecting clicks outside of a referenced element
 * Useful for closing dropdowns, modals, or popups
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onClickOutside: () => void,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClickOutside();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ref, onClickOutside, enabled]);
}

/**
 * Focus trap hook for modal dialogs.
 * Traps focus within the modal and returns focus to the trigger element on close.
 */
export function useFocusTrap(isOpen: boolean, modalRef: RefObject<HTMLElement | null>) {
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    // Store the currently focused element
    previousActiveElement.current = document.activeElement as HTMLElement;

    // Find all focusable elements within the modal
    const getFocusableElements = () => {
      if (!modalRef.current) return [];
      return Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
    };

    // Focus the first focusable element
    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    // Handle tab key to trap focus
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const focusable = getFocusableElements();
      if (focusable.length === 0) return;

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Return focus to the previously focused element
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === "function") {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen, modalRef]);
}

/**
 * Hook for managing modal state with focus trapping.
 * Combines open/close state, ref, and focus trap into a single hook.
 *
 * @example
 * // Simple boolean modal
 * const confirmModal = useModal();
 * // Usage: confirmModal.isOpen, confirmModal.open(), confirmModal.close(), confirmModal.ref
 *
 * @example
 * // Modal with state (e.g., which item is being edited)
 * const editModal = useModal<{ id: number; name: string }>();
 * // Usage: editModal.open({ id: 1, name: "Item" }), editModal.state?.id
 */
export function useModal<T = boolean>() {
  const [state, setState] = useState<T | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const isOpen = state !== null;

  useFocusTrap(isOpen, ref);

  const open = useCallback((value?: T) => {
    setState((value ?? true) as T);
  }, []);

  const close = useCallback(() => {
    setState(null);
  }, []);

  return {
    isOpen,
    state,
    open,
    close,
    ref,
  };
}

// ============================================
// Exam Revision Hooks
// ============================================

/**
 * Hook for fetching exams with their revision slot summaries
 * Used on the exams calendar page
 */
export function useExamsWithSlots(params?: {
  school?: string;
  grade?: string;
  location?: string;
  from_date?: string;
  to_date?: string;
}) {
  const key = params ? ['exams-with-slots', JSON.stringify(params)] : ['exams-with-slots'];
  return useSWR<ExamWithRevisionSlots[]>(
    key,
    () => examRevisionAPI.getCalendarWithSlots(params),
    { revalidateOnFocus: false }
  );
}

/**
 * Hook for fetching revision slots with filters
 */
export function useRevisionSlots(params?: {
  calendar_event_id?: number;
  tutor_id?: number;
  location?: string;
  from_date?: string;
  to_date?: string;
}) {
  const key = params ? ['revision-slots', JSON.stringify(params)] : ['revision-slots'];
  return useSWR<ExamRevisionSlot[]>(
    key,
    () => examRevisionAPI.getSlots(params),
    { revalidateOnFocus: false }
  );
}

/**
 * Hook for fetching a single revision slot with enrolled students
 */
export function useRevisionSlotDetail(slotId: number | null | undefined) {
  return useSWR<ExamRevisionSlotDetail>(
    slotId ? ['revision-slot-detail', slotId] : null,
    () => examRevisionAPI.getSlotDetails(slotId!),
    { revalidateOnFocus: false }
  );
}

/**
 * Hook for fetching eligible students for a revision slot
 */
export function useEligibleStudents(slotId: number | null | undefined) {
  return useSWR<EligibleStudent[]>(
    slotId ? ['eligible-students', slotId] : null,
    () => examRevisionAPI.getEligibleStudents(slotId!),
    { revalidateOnFocus: false }
  );
}

/**
 * Hook for fetching eligible students by exam (calendar event)
 * This doesn't require a slot to exist - useful for showing eligible students before creating slots
 */
export function useEligibleStudentsByExam(eventId: number | null | undefined, location?: string | null) {
  return useSWR<EligibleStudent[]>(
    eventId ? ['eligible-students-by-exam', eventId, location || 'all'] : null,
    () => examRevisionAPI.getEligibleStudentsByExam(eventId!, location),
    { revalidateOnFocus: false }
  );
}

// ============================================
// Cache Invalidation Utilities
// ============================================

/**
 * Invalidate SWR caches after mutation operations.
 *
 * Use this after create/update/delete operations to ensure
 * related lists and data are refreshed.
 *
 * @example
 * // After creating an enrollment
 * await enrollmentsAPI.create(data);
 * invalidateCaches('enrollments', { studentId: 123, location: 'MSA' });
 *
 * // After marking attendance
 * await sessionsAPI.markAttended(sessionId);
 * invalidateCaches('sessions', { sessionId, enrollmentId });
 */
export function invalidateCaches(
  type: 'sessions' | 'enrollments' | 'students' | 'proposals' | 'messages',
  context?: {
    sessionId?: number;
    studentId?: number;
    enrollmentId?: number;
    tutorId?: number;
    location?: string;
  }
) {
  // Use a regex-based matcher to invalidate all matching keys
  const revalidateMatchingKeys = (pattern: RegExp) => {
    mutate(
      key => {
        if (typeof key === 'string') return pattern.test(key);
        if (Array.isArray(key)) return pattern.test(key[0]);
        return false;
      },
      undefined,
      { revalidate: true }
    );
  };

  switch (type) {
    case 'sessions':
      revalidateMatchingKeys(/^sessions|^session|^unchecked-attendance/);
      // Also invalidate related enrollments and dashboard stats
      if (context?.enrollmentId) {
        mutate(['enrollment-sessions', context.enrollmentId]);
        mutate(['enrollment', context.enrollmentId]);
      }
      if (context?.studentId) {
        mutate(['student-sessions', context.studentId]);
      }
      // Dashboard stats might change (sessions this week/month)
      revalidateMatchingKeys(/^dashboard-stats|^activity-feed/);
      break;

    case 'enrollments':
      revalidateMatchingKeys(/^enrollments|^enrollment|^my-students|^all-students|^renewal/);
      if (context?.studentId) {
        mutate(['student', context.studentId]);
        mutate(['enrollments', context.studentId]);
      }
      // Dashboard stats might change (enrollment counts)
      revalidateMatchingKeys(/^dashboard-stats|^activity-feed|^overdue/);
      break;

    case 'students':
      revalidateMatchingKeys(/^students|^student|^active-students/);
      // Dashboard stats might change (student counts)
      revalidateMatchingKeys(/^dashboard-stats/);
      break;

    case 'proposals':
      revalidateMatchingKeys(/^proposals|^proposal|^pending-proposals/);
      if (context?.sessionId) {
        mutate(['proposal-for-session', context.sessionId]);
      }
      break;

    case 'messages':
      revalidateMatchingKeys(/^message|^unread-count|^archived-messages/);
      break;
  }
}

/**
 * Hook that returns cache invalidation functions for common operations.
 * Use this in components that perform mutations.
 *
 * @example
 * const { invalidateAfterSessionUpdate, invalidateAfterEnrollmentCreate } = useCacheInvalidation();
 *
 * const handleMarkAttended = async () => {
 *   await sessionsAPI.markAttended(sessionId);
 *   invalidateAfterSessionUpdate({ sessionId, enrollmentId });
 * };
 */
export function useCacheInvalidation() {
  const invalidateAfterSessionUpdate = useCallback((context?: {
    sessionId?: number;
    studentId?: number;
    enrollmentId?: number;
  }) => {
    invalidateCaches('sessions', context);
  }, []);

  const invalidateAfterEnrollmentCreate = useCallback((context?: {
    studentId?: number;
    location?: string;
  }) => {
    invalidateCaches('enrollments', context);
  }, []);

  const invalidateAfterEnrollmentUpdate = useCallback((context?: {
    enrollmentId?: number;
    studentId?: number;
    location?: string;
  }) => {
    invalidateCaches('enrollments', context);
  }, []);

  const invalidateAfterStudentUpdate = useCallback((context?: {
    studentId?: number;
  }) => {
    invalidateCaches('students', context);
  }, []);

  const invalidateAfterProposalAction = useCallback((context?: {
    sessionId?: number;
    tutorId?: number;
  }) => {
    invalidateCaches('proposals', context);
    // Also invalidate related sessions since proposals affect session display
    if (context?.sessionId) {
      mutate(['session', context.sessionId]);
    }
  }, []);

  const invalidateAfterMessageAction = useCallback((context?: {
    tutorId?: number;
  }) => {
    invalidateCaches('messages', context);
  }, []);

  return {
    invalidateAfterSessionUpdate,
    invalidateAfterEnrollmentCreate,
    invalidateAfterEnrollmentUpdate,
    invalidateAfterStudentUpdate,
    invalidateAfterProposalAction,
    invalidateAfterMessageAction,
  };
}


/**
 * Hook for fetching tutor memos with optional filters.
 */
export function useMemos(params?: {
  student_id?: number;
  tutor_id?: number;
  status?: 'pending' | 'linked';
  from_date?: string;
  to_date?: string;
}) {
  const key = params ? ['tutor-memos', JSON.stringify(params)] : ['tutor-memos'];
  return useSWR<TutorMemo[]>(key, () => memosAPI.getAll(params));
}

/**
 * Hook for fetching memo associated with a specific session.
 */
export function useMemoForSession(sessionId: number | null | undefined) {
  return useSWR<TutorMemo | null>(
    sessionId ? ['session-memo', sessionId] : null,
    () => memosAPI.getForSession(sessionId!)
  );
}

/**
 * Hook for fetching pending memo count (for notification badges).
 */
export function usePendingMemoCount(tutorId?: number) {
  return useSWR<CountResponse>(
    ['tutor-memos-pending-count', tutorId],
    () => memosAPI.getPendingCount(tutorId)
  );
}
