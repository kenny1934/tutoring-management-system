import { useEffect, useState, useRef, RefObject, useMemo, useCallback } from 'react';
import useSWR from 'swr';
import { sessionsAPI, tutorsAPI, calendarAPI, studentsAPI, enrollmentsAPI, revenueAPI, coursewareAPI, holidaysAPI, terminationsAPI, messagesAPI, proposalsAPI, examRevisionAPI, api } from './api';
import type { Session, SessionFilters, Tutor, CalendarEvent, Student, StudentFilters, Enrollment, DashboardStats, ActivityEvent, MonthlyRevenueSummary, SessionRevenueDetail, CoursewarePopularity, CoursewareUsageDetail, Holiday, TerminatedStudent, TerminationStatsResponse, QuarterOption, OverdueEnrollment, MessageThread, Message, MessageCategory, MakeupProposal, ProposalStatus, PendingProposalCount, ExamRevisionSlot, ExamRevisionSlotDetail, EligibleStudent, ExamWithRevisionSlots } from '@/types';

// SWR configuration is now global in Providers.tsx
// Hooks inherit: revalidateOnFocus, revalidateOnReconnect, dedupingInterval, keepPreviousData

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
export function useActiveStudents(location?: string, enabled: boolean = true) {
  const params = location && location !== "All Locations" ? `?location=${location}` : "";
  return useSWR<Array<{
    id: number;
    school_student_id: string | null;
    student_name: string;
    grade: string | null;
    lang_stream: string | null;
    school: string | null;
    home_location: string | null;
  }>>(
    enabled ? ['active-students', location || 'all'] : null,
    async () => {
      const response = await fetch(`/api/active-students${params}`);
      if (!response.ok) throw new Error('Failed to fetch active students');
      return response.json();
    },
    { revalidateOnFocus: false }
  );
}

/**
 * Hook for fetching enrollments for a student
 * Returns null key when studentId is falsy to skip fetching
 */
export function useStudentEnrollments(studentId: number | null | undefined) {
  return useSWR<Enrollment[]>(
    studentId ? ['enrollments', studentId] : null,
    () => enrollmentsAPI.getAll(studentId!)  );
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
 * Hook for fetching all active enrollments in a location (no tutor filter)
 * Used for "All Tutors" mode in My Students view
 */
export function useAllStudents(location?: string) {
  return useSWR<Enrollment[]>(
    ['all-students', location || 'all'],
    () => enrollmentsAPI.getActive(location),
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
 */
export function useDashboardStats(location?: string) {
  const key = location && location !== "All Locations"
    ? ['dashboard-stats', location]
    : ['dashboard-stats'];

  return useSWR<DashboardStats>(
    key,
    () => api.stats.getDashboard(location),
    { revalidateOnFocus: false }
  );
}

/**
 * Hook for fetching activity feed events
 * Returns recent activity (sessions, payments, enrollments)
 */
export function useActivityFeed(location?: string) {
  const key = location && location !== "All Locations"
    ? ['activity-feed', location]
    : ['activity-feed'];

  return useSWR<ActivityEvent[]>(
    key,
    () => api.stats.getActivityFeed(location),
    { revalidateOnFocus: false }
  );
}

/**
 * Hook for setting dynamic browser tab titles
 * Updates document.title with page context
 */
const BASE_TITLE = "CSM Pro";

export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${BASE_TITLE} - ${title}` : BASE_TITLE;
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
    () => terminationsAPI.getQuarters(location)
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
    () => terminationsAPI.getTerminatedStudents(quarter!, year!, location, tutorId)
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
    () => terminationsAPI.getStats(quarter!, year!, location, tutorId)
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
 * Hook for fetching message threads for a tutor
 * Returns threads grouped by root message with replies
 * Pauses polling when tab is hidden to save API calls
 */
export function useMessageThreads(
  tutorId: number | null | undefined,
  category?: MessageCategory
) {
  const refreshInterval = useVisibilityAwareInterval(60000);
  return useSWR<MessageThread[]>(
    tutorId ? ['message-threads', tutorId, category || 'all'] : null,
    () => messagesAPI.getThreads(tutorId!, category),
    { refreshInterval, revalidateOnFocus: false }
  );
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
