import { useEffect } from 'react';
import useSWR from 'swr';
import { sessionsAPI, tutorsAPI, calendarAPI, studentsAPI, enrollmentsAPI, revenueAPI, api } from './api';
import type { Session, SessionFilters, Tutor, CalendarEvent, Student, StudentFilters, Enrollment, DashboardStats, ActivityEvent, MonthlyRevenueSummary, SessionRevenueDetail } from '@/types';

// SWR configuration is now global in Providers.tsx
// Hooks inherit: revalidateOnFocus, revalidateOnReconnect, dedupingInterval, keepPreviousData

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
