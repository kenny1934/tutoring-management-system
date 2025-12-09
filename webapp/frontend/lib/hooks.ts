import useSWR, { SWRConfiguration } from 'swr';
import { sessionsAPI, tutorsAPI, calendarAPI, studentsAPI, enrollmentsAPI, api } from './api';
import type { Session, SessionFilters, Tutor, CalendarEvent, Student, StudentFilters, Enrollment, DashboardStats, ActivityEvent } from '@/types';

// SWR configuration for optimal caching behavior
// - revalidateOnFocus: Auto-refresh when tutor tabs back (important during lessons)
// - revalidateOnReconnect: Don't refetch on network reconnect (reduces unnecessary calls)
// - dedupingInterval: Prevent duplicate calls within 5 seconds
const swrConfig: SWRConfiguration = {
  revalidateOnFocus: true,
  revalidateOnReconnect: false,
  dedupingInterval: 5000,
};

/**
 * Hook for fetching sessions list with filters
 * Returns cached data immediately, then revalidates in background
 */
export function useSessions(filters?: SessionFilters) {
  // Create a stable cache key from filters
  const key = filters ? ['sessions', JSON.stringify(filters)] : ['sessions'];

  return useSWR<Session[]>(
    key,
    () => sessionsAPI.getAll(filters),
    swrConfig
  );
}

/**
 * Hook for fetching a single session by ID
 * Returns null key when id is falsy to skip fetching
 */
export function useSession(id: number | null | undefined) {
  return useSWR<Session>(
    id ? ['session', id] : null,
    () => sessionsAPI.getById(id!),
    swrConfig
  );
}

/**
 * Hook for fetching tutors list
 */
export function useTutors() {
  return useSWR<Tutor[]>(
    'tutors',
    () => tutorsAPI.getAll(),
    swrConfig
  );
}

/**
 * Hook for fetching calendar events (tests/exams)
 * Returns cached data immediately, then revalidates in background
 */
export function useCalendarEvents(daysAhead: number = 30) {
  return useSWR<CalendarEvent[]>(
    ['calendar-events', daysAhead],
    () => calendarAPI.getEvents(daysAhead),
    swrConfig
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
    () => studentsAPI.getAll(filters),
    swrConfig
  );
}

/**
 * Hook for fetching a single student by ID
 * Returns null key when id is falsy to skip fetching
 */
export function useStudent(id: number | null | undefined) {
  return useSWR<Student>(
    id ? ['student', id] : null,
    () => studentsAPI.getById(id!),
    swrConfig
  );
}

/**
 * Hook for fetching enrollments for a student
 * Returns null key when studentId is falsy to skip fetching
 */
export function useStudentEnrollments(studentId: number | null | undefined) {
  return useSWR<Enrollment[]>(
    studentId ? ['enrollments', studentId] : null,
    () => enrollmentsAPI.getAll(studentId!),
    swrConfig
  );
}

/**
 * Hook for fetching sessions for a specific student
 * Returns null key when studentId is falsy to skip fetching
 */
export function useStudentSessions(studentId: number | null | undefined, limit: number = 100) {
  return useSWR<Session[]>(
    studentId ? ['student-sessions', studentId, limit] : null,
    () => sessionsAPI.getAll({ student_id: studentId!, limit }),
    swrConfig
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
    swrConfig
  );
}

/**
 * Hook for fetching sessions for a specific enrollment
 * Returns null key when enrollmentId is falsy to skip fetching
 */
export function useEnrollmentSessions(enrollmentId: number | null | undefined) {
  return useSWR<Session[]>(
    enrollmentId ? ['enrollment-sessions', enrollmentId] : null,
    () => sessionsAPI.getAll({ enrollment_id: enrollmentId!, limit: 500 }),
    swrConfig
  );
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
    swrConfig
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
    swrConfig
  );
}
