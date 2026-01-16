import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { sessionsAPI, tutorsAPI, calendarAPI, studentsAPI, enrollmentsAPI, revenueAPI, coursewareAPI, holidaysAPI, terminationsAPI, messagesAPI, api } from './api';
import type { Session, SessionFilters, Tutor, CalendarEvent, Student, StudentFilters, Enrollment, DashboardStats, ActivityEvent, MonthlyRevenueSummary, SessionRevenueDetail, CoursewarePopularity, CoursewareUsageDetail, Holiday, TerminatedStudent, TerminationStatsResponse, QuarterOption, OverdueEnrollment, MessageThread, Message, MessageCategory } from '@/types';

// SWR configuration is now global in Providers.tsx
// Hooks inherit: revalidateOnFocus, revalidateOnReconnect, dedupingInterval, keepPreviousData

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
 */
export function useCalendarEvents(daysAhead: number = 30) {
  return useSWR<CalendarEvent[]>(
    ['calendar-events', daysAhead],
    () => calendarAPI.getEvents(daysAhead)  );
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
    () => enrollmentsAPI.getActive(location)  );
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
    () => enrollmentsAPI.getById(id!)  );
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
    () => api.stats.getDashboard(location)  );
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
    () => api.stats.getActivityFeed(location)  );
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
    () => holidaysAPI.getHolidays(from_date, to_date)
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
 */
export function useMessageThreads(
  tutorId: number | null | undefined,
  category?: MessageCategory
) {
  return useSWR<MessageThread[]>(
    tutorId ? ['message-threads', tutorId, category || 'all'] : null,
    () => messagesAPI.getThreads(tutorId!, category),
    { refreshInterval: 60000, revalidateOnFocus: false }  // Poll every 60s, no refetch on tab switch
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
 */
export function useUnreadMessageCount(tutorId: number | null | undefined) {
  return useSWR<{ count: number }>(
    tutorId ? ['unread-count', tutorId] : null,
    () => messagesAPI.getUnreadCount(tutorId!),
    { refreshInterval: 30000, revalidateOnFocus: false }  // Poll every 30s, no refetch on tab switch
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
