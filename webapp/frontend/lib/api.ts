import type {
  Tutor,
  Student,
  StudentCreate,
  Enrollment,
  EnrollmentCreate,
  Session,
  SessionUpdate,
  CurriculumSuggestion,
  DashboardStats,
  StudentFilters,
  SessionFilters,
  UpcomingTestAlert,
  CalendarEvent,
  CalendarEventCreate,
  CalendarEventUpdate,
  ActivityEvent,
  MonthlyRevenueSummary,
  SessionRevenueDetail,
  CoursewarePopularity,
  CoursewareUsageDetail,
  Holiday,
  TerminatedStudent,
  TerminationRecordUpdate,
  TerminationRecordResponse,
  TerminationStatsResponse,
  QuarterOption,
  OverdueEnrollment,
  UncheckedAttendanceReminder,
  UncheckedAttendanceCount,
  Message,
  MessageThread,
  MessageCreate,
  MessageCategory,
  PaginatedThreadsResponse,
  MakeupSlotSuggestion,
  ScheduleMakeupRequest,
  ScheduleMakeupResponse,
  MakeupProposal,
  MakeupProposalCreate,
  PendingProposalCount,
  ProposalStatus,
  ExamRevisionSlot,
  ExamRevisionSlotDetail,
  ExamRevisionSlotCreate,
  EligibleStudent,
  EnrollStudentRequest,
  EnrollStudentResponse,
  ExamWithRevisionSlots,
  ExtensionRequest,
  ExtensionRequestDetail,
  ExtensionRequestCreate,
  ExtensionRequestApprove,
  ExtensionRequestReject,
  PendingExtensionRequestCount,
  ExtensionRequestStatus,
  BatchRenewCheckResponse,
  MessageResponse,
  SuccessResponse,
  CountResponse,
  BatchUpdateResponse,
  CalendarSyncResponse,
  EnrollmentCancelResponse,
  FeeMessageResponse,
  SchoolInfoResponse,
  NextIdResponse,
  CheckDuplicatesResponse,
  LocationRevenueSummary,
  ActiveStudent,
  ToggleLikeResponse,
  ArchiveResponse,
  BulkDeleteResponse,
  DebugBulkUpdateResponse,
  // Enrollment preview & renewal types
  SessionPreview,
  StudentConflict,
  PotentialRenewalLink,
  EnrollmentPreviewResponse,
  RenewalDataResponse,
  RenewalListItem,
  RenewalCountsResponse,
  TrialListItem,
  PendingMakeupSession,
  EnrollmentDetailResponse,
  // Schedule change types
  ScheduleChangeRequest,
  UnchangeableSession,
  UpdatableSession,
  ScheduleChangePreviewResponse,
  ApplyScheduleChangeRequest,
  ScheduleChangeResult,
  // Search types
  SearchResults,
  // Paperless types
  PaperlessDocument,
  PaperlessSearchResponse,
  PaperlessStatus,
  PaperlessTag,
  PaperlessTagsResponse,
  PaperlessSearchMode,
  PaperlessTagMatchMode,
  // Path aliases types
  PathAliasDefinition,
  // Document processing types
  ProcessingMode,
  HandwritingRemovalOptions,
  HandwritingRemovalResponse,
  DocumentProcessingStatus,
  // Parent communications types
  ParentCommunication,
  StudentContactStatus,
  LocationSettings,
  ParentCommunicationCreate,
} from "@/types";

// Re-export types for backward compatibility
export type {
  StudentCreate,
  EnrollmentCreate,
  SessionUpdate,
  SessionPreview,
  StudentConflict,
  PotentialRenewalLink,
  EnrollmentPreviewResponse,
  RenewalDataResponse,
  RenewalListItem,
  RenewalCountsResponse,
  TrialListItem,
  PendingMakeupSession,
  EnrollmentDetailResponse,
  ScheduleChangeRequest,
  UnchangeableSession,
  UpdatableSession,
  ScheduleChangePreviewResponse,
  ApplyScheduleChangeRequest,
  ScheduleChangeResult,
  SearchResults,
  PaperlessDocument,
  PaperlessSearchResponse,
  PaperlessStatus,
  PaperlessTag,
  PaperlessTagsResponse,
  PaperlessSearchMode,
  PaperlessTagMatchMode,
  PathAliasDefinition,
  ProcessingMode,
  HandwritingRemovalOptions,
  HandwritingRemovalResponse,
  DocumentProcessingStatus,
  ParentCommunication,
  StudentContactStatus,
  LocationSettings,
  ParentCommunicationCreate,
} from "@/types";
import type {
  DebugTable,
  DebugTableSchema,
  DebugRow,
  DebugQueryParams,
  PaginatedRows,
  DebugAuditLog,
  PaginatedAuditLogs,
  AuditLogQueryParams,
  SqlQueryResponse,
  RevertResponse,
} from "@/types/debug";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

// Direct backend URL for iframe sources (bypasses Next.js proxy)
// Iframes load URLs directly and don't go through Next.js rewrites
const BACKEND_DIRECT_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000/api";

// Token refresh state to prevent concurrent refreshes
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

/**
 * Attempt to refresh the authentication token
 * Returns true if refresh was successful
 */
async function refreshToken(): Promise<boolean> {
  // If already refreshing, wait for that to complete
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        return true;
      }
      return false;
    } catch (error) {
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// Generic fetch wrapper with error handling and automatic token refresh
async function fetchAPI<T>(endpoint: string, options?: RequestInit, isRetry = false): Promise<T> {
  try {
    // Build headers with optional impersonation role
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add impersonation header if Super Admin is impersonating another role
    if (typeof window !== "undefined") {
      const effectiveRole = sessionStorage.getItem("csm_impersonated_role");
      if (effectiveRole) {
        headers["X-Effective-Role"] = effectiveRole;
      }
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      credentials: "include", // Include cookies for authentication
      headers: {
        ...headers,
        ...options?.headers,
      },
      ...options,
    });

    // Handle 401 with automatic token refresh (but don't retry refresh endpoint itself)
    if (response.status === 401 && !isRetry && !endpoint.includes("/auth/refresh")) {
      const refreshed = await refreshToken();
      if (refreshed) {
        // Retry the original request
        return fetchAPI<T>(endpoint, options, true);
      }
      // Refresh failed, throw to trigger logout
      throw new Error("Session expired. Please log in again.");
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Unknown error" }));
      // Handle both string and object detail (structured errors like ENROLLMENT_DEADLINE_EXCEEDED)
      const detailMessage = typeof error.detail === 'object'
        ? (error.detail.message || JSON.stringify(error.detail))
        : error.detail;
      throw new Error(detailMessage || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}

// Helper to build query params from an object, filtering out null/undefined/empty values
function buildQueryParams(obj: Record<string, unknown>): string {
  const params = new URLSearchParams();
  Object.entries(obj).forEach(([key, value]) => {
    if (value != null && value !== '') {
      params.append(key, String(value));
    }
  });
  return params.toString();
}

// Tutors API
export const tutorsAPI = {
  getAll: () => {
    return fetchAPI<Tutor[]>("/tutors");
  },
};

// Students API
export const studentsAPI = {
  getAll: (filters?: StudentFilters) => {
    const params = new URLSearchParams();
    if (filters?.search) params.append("search", filters.search);
    if (filters?.grade) params.append("grade", filters.grade);
    if (filters?.school) params.append("school", filters.school);
    if (filters?.location) params.append("location", filters.location);
    if (filters?.academic_stream) params.append("academic_stream", filters.academic_stream);
    if (filters?.sort_by) params.append("sort_by", filters.sort_by);
    if (filters?.sort_order) params.append("sort_order", filters.sort_order);
    if (filters?.limit) params.append("limit", filters.limit.toString());
    if (filters?.offset) params.append("offset", filters.offset.toString());

    const query = params.toString();
    return fetchAPI<Student[]>(`/students${query ? `?${query}` : ""}`);
  },

  getById: (id: number) => {
    return fetchAPI<Student>(`/students/${id}`);
  },

  getSchools: () => {
    return fetchAPI<string[]>("/students/schools");
  },

  update: (id: number, data: Partial<Student>) => {
    return fetchAPI<Student>(`/students/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  create: (data: StudentCreate) => {
    return fetchAPI<Student>('/students', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getSchoolInfo: (schoolName: string) => {
    return fetchAPI<SchoolInfoResponse>(`/students/school-info/${encodeURIComponent(schoolName)}`);
  },

  getNextId: (location: string) => {
    return fetchAPI<NextIdResponse>(`/students/next-id/${encodeURIComponent(location)}`);
  },

  checkDuplicates: (studentName: string, location: string, phone?: string) => {
    const params = new URLSearchParams({ student_name: studentName, location });
    if (phone) params.append("phone", phone);
    return fetchAPI<CheckDuplicatesResponse>(`/students/check-duplicates?${params}`);
  },
};

// Enrollments API
export const enrollmentsAPI = {
  getAll: (student_id?: number) => {
    const params = student_id ? `?student_id=${student_id}` : "";
    return fetchAPI<Enrollment[]>(`/enrollments${params}`);
  },

  getActive: (location?: string) => {
    const params = location && location !== "All Locations" ? `?location=${location}` : "";
    return fetchAPI<Enrollment[]>(`/enrollments/active${params}`);
  },

  getById: (id: number) => {
    return fetchAPI<Enrollment>(`/enrollments/${id}`);
  },

  update: (id: number, data: Partial<Enrollment>) => {
    return fetchAPI<Enrollment>(`/enrollments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  updateExtension: (id: number, data: { deadline_extension_weeks: number; reason: string }) => {
    return fetchAPI<Enrollment>(`/enrollments/${id}/extension`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  getMyStudents: (tutorId: number, location?: string) => {
    const params = new URLSearchParams();
    params.append("tutor_id", tutorId.toString());
    if (location && location !== "All Locations") {
      params.append("location", location);
    }
    return fetchAPI<Enrollment[]>(`/enrollments/my-students?${params.toString()}`);
  },

  getOverdue: (location?: string, tutorId?: number) => {
    const params = new URLSearchParams();
    if (location && location !== "All Locations") {
      params.append("location", location);
    }
    if (tutorId) {
      params.append("tutor_id", tutorId.toString());
    }
    const queryString = params.toString();
    return fetchAPI<OverdueEnrollment[]>(`/enrollments/overdue${queryString ? `?${queryString}` : ''}`);
  },

  // Enrollment creation and preview
  preview: (data: EnrollmentCreate) => {
    return fetchAPI<EnrollmentPreviewResponse>('/enrollments/preview', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  create: (data: EnrollmentCreate) => {
    return fetchAPI<Enrollment>('/enrollments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Renewal functions
  getRenewalData: (enrollmentId: number) => {
    return fetchAPI<RenewalDataResponse>(`/enrollments/${enrollmentId}/renewal-data`);
  },

  getRenewals: (params?: { location?: string; tutor_id?: number; include_expired?: boolean }) => {
    const searchParams = new URLSearchParams();
    if (params?.location && params.location !== "All Locations") {
      searchParams.append("location", params.location);
    }
    if (params?.tutor_id) {
      searchParams.append("tutor_id", params.tutor_id.toString());
    }
    if (params?.include_expired !== undefined) {
      searchParams.append("include_expired", params.include_expired.toString());
    }
    const queryString = searchParams.toString();
    return fetchAPI<RenewalListItem[]>(`/enrollments/renewals${queryString ? `?${queryString}` : ''}`);
  },

  getRenewalCounts: (location?: string) => {
    const params = location && location !== "All Locations" ? `?location=${location}` : "";
    return fetchAPI<RenewalCountsResponse>(`/enrollments/renewal-counts${params}`);
  },

  getTrials: (params?: { location?: string; tutor_id?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.location && params.location !== "All Locations") {
      searchParams.append("location", params.location);
    }
    if (params?.tutor_id) {
      searchParams.append("tutor_id", params.tutor_id.toString());
    }
    const queryString = searchParams.toString();
    return fetchAPI<TrialListItem[]>(`/enrollments/trials${queryString ? `?${queryString}` : ''}`);
  },

  getDetail: (id: number) => {
    return fetchAPI<EnrollmentDetailResponse>(`/enrollments/${id}/detail`);
  },

  getFeeMessage: (id: number, lang: 'zh' | 'en' = 'zh', lessonsPaid: number = 6) => {
    const params = new URLSearchParams({ lang, lessons_paid: lessonsPaid.toString() });
    return fetchAPI<FeeMessageResponse>(`/enrollments/${id}/fee-message?${params}`);
  },

  batchMarkPaid: (enrollmentIds: number[]) => {
    return fetchAPI<BatchUpdateResponse>("/enrollments/batch-mark-paid", {
      method: "POST",
      body: JSON.stringify({ enrollment_ids: enrollmentIds }),
    });
  },

  batchMarkSent: (enrollmentIds: number[]) => {
    return fetchAPI<BatchUpdateResponse>("/enrollments/batch-mark-sent", {
      method: "POST",
      body: JSON.stringify({ enrollment_ids: enrollmentIds }),
    });
  },

  batchRenewCheck: (enrollmentIds: number[]) => {
    return fetchAPI<BatchRenewCheckResponse>("/enrollments/batch-renew-check", {
      method: "POST",
      body: JSON.stringify({ enrollment_ids: enrollmentIds }),
    });
  },

  batchRenew: (enrollmentIds: number[], lessonsPaid: number = 6) => {
    return fetchAPI<{
      results: Array<{
        original_enrollment_id: number;
        new_enrollment_id: number | null;
        success: boolean;
        error: string | null;
      }>;
      created_count: number;
      failed_count: number;
    }>("/enrollments/batch-renew", {
      method: "POST",
      body: JSON.stringify({ enrollment_ids: enrollmentIds, lessons_paid: lessonsPaid }),
    });
  },

  // Schedule change preview and apply
  previewScheduleChange: (enrollmentId: number, newSchedule: ScheduleChangeRequest) => {
    return fetchAPI<ScheduleChangePreviewResponse>(`/enrollments/${enrollmentId}/schedule-change-preview`, {
      method: "POST",
      body: JSON.stringify(newSchedule),
    });
  },

  applyScheduleChange: (enrollmentId: number, changes: ApplyScheduleChangeRequest) => {
    return fetchAPI<ScheduleChangeResult>(`/enrollments/${enrollmentId}/apply-schedule-change`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    });
  },

  cancel: (id: number) => {
    return fetchAPI<EnrollmentCancelResponse>(`/enrollments/${id}/cancel`, { method: 'PATCH' });
  },
};

// Sessions API
export const sessionsAPI = {
  getAll: (filters?: SessionFilters) => {
    const params = new URLSearchParams();
    // Support both single date and date range filters
    if (filters?.date) {
      // Map frontend 'date' filter to backend 'from_date' and 'to_date'
      params.append("from_date", filters.date);
      params.append("to_date", filters.date);
    } else if (filters?.from_date || filters?.to_date) {
      // Support explicit date range for weekly/monthly views
      if (filters.from_date) params.append("from_date", filters.from_date);
      if (filters.to_date) params.append("to_date", filters.to_date);
    }
    if (filters?.student_id) params.append("student_id", filters.student_id.toString());
    if (filters?.tutor_id) params.append("tutor_id", filters.tutor_id.toString());
    if (filters?.enrollment_id) params.append("enrollment_id", filters.enrollment_id.toString());
    if (filters?.location) params.append("location", filters.location);
    // Map frontend 'status' to backend 'session_status'
    if (filters?.status) params.append("session_status", filters.status);
    if (filters?.limit) params.append("limit", filters.limit.toString());
    if (filters?.offset) params.append("offset", filters.offset.toString());

    const query = params.toString();
    return fetchAPI<Session[]>(`/sessions${query ? `?${query}` : ""}`);
  },

  getById: (id: number) => {
    return fetchAPI<Session>(`/sessions/${id}`);
  },

  getCurriculumSuggestions: (sessionId: number) => {
    return fetchAPI<CurriculumSuggestion>(`/sessions/${sessionId}/curriculum-suggestions`);
  },

  getUpcomingTests: (sessionId: number) => {
    return fetchAPI<UpcomingTestAlert[]>(`/sessions/${sessionId}/upcoming-tests`);
  },

  markAttended: (id: number) => {
    return fetchAPI<Session>(`/sessions/${id}/attended`, {
      method: 'PATCH',
    });
  },

  markNoShow: (id: number) => {
    return fetchAPI<Session>(`/sessions/${id}/no-show`, {
      method: 'PATCH',
    });
  },

  markRescheduled: (id: number) => {
    return fetchAPI<Session>(`/sessions/${id}/reschedule`, {
      method: 'PATCH',
    });
  },

  markSickLeave: (id: number) => {
    return fetchAPI<Session>(`/sessions/${id}/sick-leave`, {
      method: 'PATCH',
    });
  },

  markWeatherCancelled: (id: number) => {
    return fetchAPI<Session>(`/sessions/${id}/weather-cancelled`, {
      method: 'PATCH',
    });
  },

  saveExercises: (
    sessionId: number,
    exerciseType: 'CW' | 'HW',
    exercises: Array<{
      exercise_type: string;
      pdf_name: string;
      page_start?: number | null;
      page_end?: number | null;
      remarks?: string | null;
    }>
  ) => {
    return fetchAPI<Session>(`/sessions/${sessionId}/exercises`, {
      method: 'PUT',
      body: JSON.stringify({
        exercise_type: exerciseType,
        exercises,
      }),
    });
  },

  rateSession: (sessionId: number, performanceRating: string | null, notes: string | null) => {
    return fetchAPI<Session>(`/sessions/${sessionId}/rate`, {
      method: 'PATCH',
      body: JSON.stringify({
        performance_rating: performanceRating,
        notes,
      }),
    });
  },

  updateSession: (
    sessionId: number,
    updates: {
      session_date?: string;
      time_slot?: string;
      location?: string;
      tutor_id?: number;
      session_status?: string;
      performance_rating?: string;
      notes?: string;
    }
  ) => {
    return fetchAPI<Session>(`/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  // Make-up scheduling
  getMakeupSuggestions: (
    sessionId: number,
    options?: { daysAhead?: number; limit?: number }
  ) => {
    const params = new URLSearchParams();
    if (options?.daysAhead) params.append('days_ahead', options.daysAhead.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    const query = params.toString();
    return fetchAPI<MakeupSlotSuggestion[]>(
      `/sessions/${sessionId}/makeup-suggestions${query ? `?${query}` : ''}`
    );
  },

  scheduleMakeup: (sessionId: number, request: ScheduleMakeupRequest) => {
    return fetchAPI<ScheduleMakeupResponse>(`/sessions/${sessionId}/schedule-makeup`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  cancelMakeup: (makeupSessionId: number) => {
    return fetchAPI<Session>(`/sessions/${makeupSessionId}/cancel-makeup`, {
      method: 'DELETE',
    });
  },

  // Undo/Redo
  undoStatus: (id: number) => {
    return fetchAPI<Session & { undone_from_status?: string }>(`/sessions/${id}/undo`, {
      method: 'PATCH',
    });
  },

  redoStatus: (id: number, status: string) => {
    return fetchAPI<Session>(`/sessions/${id}/redo?status=${encodeURIComponent(status)}`, {
      method: 'PATCH',
    });
  },

  // Unchecked attendance
  getUncheckedAttendance: (location?: string, tutorId?: number, urgency?: string) => {
    const params = new URLSearchParams();
    if (location && location !== "All Locations") params.append("location", location);
    if (tutorId) params.append("tutor_id", tutorId.toString());
    if (urgency) params.append("urgency", urgency);
    const query = params.toString();
    return fetchAPI<UncheckedAttendanceReminder[]>(`/sessions/unchecked-attendance${query ? `?${query}` : ""}`);
  },

  getUncheckedAttendanceCount: (location?: string, tutorId?: number) => {
    const params = new URLSearchParams();
    if (location && location !== "All Locations") params.append("location", location);
    if (tutorId) params.append("tutor_id", tutorId.toString());
    const query = params.toString();
    return fetchAPI<UncheckedAttendanceCount>(`/sessions/unchecked-attendance/count${query ? `?${query}` : ""}`);
  },
};

// Calendar API
export const calendarAPI = {
  getEvents: (daysAhead?: number, includePast?: boolean, daysBehind?: number) => {
    const params = new URLSearchParams();
    if (daysAhead) params.append('days_ahead', String(daysAhead));
    if (includePast) params.append('include_past', 'true');
    if (daysBehind) params.append('days_behind', String(daysBehind));
    const queryString = params.toString();
    return fetchAPI<CalendarEvent[]>(`/calendar/events${queryString ? '?' + queryString : ''}`);
  },

  sync: (force?: boolean, daysBehind?: number) => {
    const params = new URLSearchParams();
    if (force) params.append('force', 'true');
    if (daysBehind) params.append('days_behind', String(daysBehind));
    const queryString = params.toString();
    return fetchAPI<CalendarSyncResponse>(`/calendar/sync${queryString ? '?' + queryString : ''}`, { method: 'POST' });
  },

  createEvent: (data: CalendarEventCreate) =>
    fetchAPI<CalendarEvent>('/calendar/events', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateEvent: (id: number, data: CalendarEventUpdate) =>
    fetchAPI<CalendarEvent>(`/calendar/events/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteEvent: (id: number) =>
    fetchAPI<MessageResponse>(`/calendar/events/${id}`, { method: 'DELETE' }),
};

// Stats API
export const statsAPI = {
  getDashboard: (location?: string, tutorId?: number) => {
    const params = new URLSearchParams();
    if (location && location !== "All Locations") params.set("location", location);
    if (tutorId) params.set("tutor_id", tutorId.toString());
    const query = params.toString();
    return fetchAPI<DashboardStats>(`/stats${query ? `?${query}` : ""}`);
  },

  getLocations: () => {
    return fetchAPI<string[]>("/locations");
  },

  search: (query: string, location?: string, limit?: number) => {
    const params = new URLSearchParams({ q: query });
    if (location && location !== "All Locations") params.append("location", location);
    if (limit) params.append("limit", limit.toString());
    return fetchAPI<SearchResults>(`/search?${params.toString()}`);
  },

  getActivityFeed: (location?: string, tutorId?: number, limit?: number, offset?: number) => {
    const params = new URLSearchParams();
    if (location && location !== "All Locations") params.set("location", location);
    if (tutorId) params.set("tutor_id", tutorId.toString());
    if (limit) params.set("limit", limit.toString());
    if (offset) params.set("offset", offset.toString());
    const query = params.toString();
    return fetchAPI<ActivityEvent[]>(`/activity-feed${query ? `?${query}` : ""}`);
  },

  getActiveStudents: (location?: string, tutorId?: number) => {
    const params = new URLSearchParams();
    if (location && location !== "All Locations") params.set("location", location);
    if (tutorId) params.set("tutor_id", tutorId.toString());
    const query = params.toString();
    return fetchAPI<ActiveStudent[]>(`/active-students${query ? `?${query}` : ""}`);
  },
};

// Revenue API
export const revenueAPI = {
  getMonthlySummary: (tutorId: number, period: string) => {
    const params = new URLSearchParams({
      tutor_id: tutorId.toString(),
      period,
    });
    return fetchAPI<MonthlyRevenueSummary>(`/revenue/monthly-summary?${params}`);
  },

  getSessionDetails: (tutorId: number, period: string) => {
    const params = new URLSearchParams({
      tutor_id: tutorId.toString(),
      period,
    });
    return fetchAPI<SessionRevenueDetail[]>(`/revenue/session-details?${params}`);
  },

  getLocationMonthlySummary: (location: string | null, period: string) => {
    const params = new URLSearchParams({ period });
    if (location) params.set("location", location);
    return fetchAPI<LocationRevenueSummary>(`/revenue/location-monthly-summary?${params.toString()}`);
  },
};

// Courseware API
export const coursewareAPI = {
  getPopularity: (
    timeRange: 'recent' | 'all-time',
    exerciseType?: string,
    grade?: string,
    school?: string,
    limit?: number,
    offset?: number
  ) => {
    const params = new URLSearchParams({ time_range: timeRange });
    if (exerciseType) params.append('exercise_type', exerciseType);
    if (grade) params.append('grade', grade);
    if (school) params.append('school', school);
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    return fetchAPI<CoursewarePopularity[]>(`/courseware/popularity?${params}`);
  },

  getUsageDetail: (
    filename: string,
    timeRange: 'recent' | 'all-time',
    limit?: number,
    offset?: number,
    exerciseType?: string,
    grade?: string,
    school?: string
  ) => {
    const params = new URLSearchParams({
      filename,
      time_range: timeRange,
    });
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    if (exerciseType) params.append('exercise_type', exerciseType);
    if (grade) params.append('grade', grade);
    if (school) params.append('school', school);
    return fetchAPI<CoursewareUsageDetail[]>(`/courseware/usage-detail?${params}`);
  },
};

// Paperless-ngx API
export const paperlessAPI = {
  search: (
    query: string,
    limit: number = 20,
    searchMode: PaperlessSearchMode = "all",
    tagIds?: number[],
    tagMatchMode: PaperlessTagMatchMode = "all",
    offset: number = 0
  ) => {
    const params = new URLSearchParams({
      query,
      limit: limit.toString(),
      search_mode: searchMode,
      offset: offset.toString(),
    });
    if (tagIds && tagIds.length > 0) {
      params.append("tag_ids", tagIds.join(","));
      params.append("tag_match_mode", tagMatchMode);
    }
    return fetchAPI<PaperlessSearchResponse>(`/paperless/search?${params}`);
  },

  getTags: () => {
    return fetchAPI<PaperlessTagsResponse>("/paperless/tags");
  },

  getThumbnailUrl: (documentId: number) => {
    // Use direct backend URL for img src (bypasses Next.js proxy)
    return `${BACKEND_DIRECT_URL}/paperless/thumbnail/${documentId}`;
  },

  getPreviewUrl: (documentId: number) => {
    // Use direct backend URL for iframe src (bypasses Next.js proxy)
    return `${BACKEND_DIRECT_URL}/paperless/preview/${documentId}`;
  },

  getStatus: () => {
    return fetchAPI<PaperlessStatus>("/paperless/status");
  },
};

// Path Aliases API
export const pathAliasesAPI = {
  getAll: () => {
    return fetchAPI<PathAliasDefinition[]>("/path-aliases");
  },

  create: (alias: string, description?: string) => {
    return fetchAPI<PathAliasDefinition>("/path-aliases", {
      method: "POST",
      body: JSON.stringify({ alias, description }),
    });
  },

  delete: (id: number) => {
    return fetchAPI<MessageResponse>(`/path-aliases/${id}`, { method: "DELETE" });
  },
};

// Holidays API
export const holidaysAPI = {
  getHolidays: (from_date?: string, to_date?: string) => {
    const params = new URLSearchParams();
    if (from_date) params.append("from_date", from_date);
    if (to_date) params.append("to_date", to_date);
    const queryString = params.toString();
    return fetchAPI<Holiday[]>(`/holidays${queryString ? `?${queryString}` : ''}`);
  },
};

// Document processing API
export const documentProcessingAPI = {
  /**
   * Remove handwriting from a PDF (base64 input/output)
   */
  async removeHandwriting(
    pdfBase64: string,
    options: HandwritingRemovalOptions = {}
  ): Promise<HandwritingRemovalResponse> {
    const response = await fetch(`${API_BASE_URL}/document-processing/remove-handwriting`, {
      method: 'POST',
      credentials: 'include', // Include cookies for authentication
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pdf_base64: pdfBase64,
        remove_blue: options.removeBlue ?? true,
        remove_red: options.removeRed ?? true,
        remove_green: options.removeGreen ?? true,
        remove_pencil: options.removePencil ?? true,
        pencil_threshold: options.pencilThreshold ?? 200,
        remove_black_ink: options.removeBlackInk ?? false,
        black_ink_mode: options.blackInkMode ?? 'balanced',
        black_ink_stroke_threshold: options.blackInkStrokeThreshold ?? 0,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to remove handwriting');
    }

    return response.json();
  },

  /**
   * Check if document processing is available
   */
  async getStatus(): Promise<DocumentProcessingStatus> {
    return fetchAPI<DocumentProcessingStatus>('/document-processing/status');
  },
};

// Parent Communications API
export const parentCommunicationsAPI = {
  // Get all communications with filters
  getAll: (params?: {
    tutor_id?: number;
    student_id?: number;
    location?: string;
    from_date?: string;
    to_date?: string;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.tutor_id) searchParams.append('tutor_id', params.tutor_id.toString());
    if (params?.student_id) searchParams.append('student_id', params.student_id.toString());
    if (params?.location) searchParams.append('location', params.location);
    if (params?.from_date) searchParams.append('from_date', params.from_date);
    if (params?.to_date) searchParams.append('to_date', params.to_date);
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.offset) searchParams.append('offset', params.offset.toString());
    const queryString = searchParams.toString();
    return fetchAPI<ParentCommunication[]>(`/parent-communications${queryString ? `?${queryString}` : ''}`);
  },

  // Get student contact statuses (for the student list with status indicators)
  getStudentStatuses: (tutor_id?: number, location?: string) => {
    const params = new URLSearchParams();
    if (tutor_id) params.append('tutor_id', tutor_id.toString());
    if (location) params.append('location', location);
    const queryString = params.toString();
    return fetchAPI<StudentContactStatus[]>(`/parent-communications/students${queryString ? `?${queryString}` : ''}`);
  },

  // Get calendar events for date range
  getCalendarEvents: (start_date: string, end_date: string, tutor_id?: number, location?: string) => {
    const params = new URLSearchParams({ start_date, end_date });
    if (tutor_id) params.append('tutor_id', tutor_id.toString());
    if (location) params.append('location', location);
    return fetchAPI<ParentCommunication[]>(`/parent-communications/calendar?${params}`);
  },

  // Get pending follow-ups
  getPendingFollowups: (tutor_id?: number, location?: string) => {
    const params = new URLSearchParams();
    if (tutor_id) params.append('tutor_id', tutor_id.toString());
    if (location) params.append('location', location);
    const queryString = params.toString();
    return fetchAPI<StudentContactStatus[]>(`/parent-communications/pending-followups${queryString ? `?${queryString}` : ''}`);
  },

  // Get contact needed count (for dashboard badge)
  getContactNeededCount: (tutor_id?: number, location?: string) => {
    const params = new URLSearchParams();
    if (tutor_id) params.append('tutor_id', tutor_id.toString());
    if (location) params.append('location', location);
    const queryString = params.toString();
    return fetchAPI<CountResponse>(`/parent-communications/contact-needed-count${queryString ? `?${queryString}` : ''}`);
  },

  // Get single communication
  get: (id: number) => {
    return fetchAPI<ParentCommunication>(`/parent-communications/${id}`);
  },

  // Create new communication
  create: (data: ParentCommunicationCreate, tutor_id: number, created_by: string) => {
    const params = new URLSearchParams({
      tutor_id: tutor_id.toString(),
      created_by,
    });
    return fetchAPI<ParentCommunication>(`/parent-communications?${params}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update communication
  update: (id: number, data: Partial<ParentCommunicationCreate>) => {
    return fetchAPI<ParentCommunication>(`/parent-communications/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Delete communication
  delete: (id: number, deleted_by?: string) => {
    const params = deleted_by ? `?deleted_by=${encodeURIComponent(deleted_by)}` : '';
    return fetchAPI<MessageResponse>(`/parent-communications/${id}${params}`, { method: 'DELETE' });
  },
};

// Location Settings API
export const locationSettingsAPI = {
  get: (location: string) => {
    return fetchAPI<LocationSettings>(`/location-settings/${location}`);
  },

  update: (location: string, data: { contact_recent_days?: number; contact_warning_days?: number }) => {
    return fetchAPI<LocationSettings>(`/location-settings/${location}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};

// Terminations API
export const terminationsAPI = {
  // Get available quarters with termination data
  getQuarters: (location?: string) => {
    const params = new URLSearchParams();
    if (location && location !== "All Locations") {
      params.append("location", location);
    }
    const queryString = params.toString();
    return fetchAPI<QuarterOption[]>(`/terminations/quarters${queryString ? `?${queryString}` : ''}`);
  },

  // Get terminated students for a specific quarter
  getTerminatedStudents: (
    quarter: number,
    year: number,
    location?: string,
    tutorId?: number
  ) => {
    const params = new URLSearchParams({
      quarter: quarter.toString(),
      year: year.toString(),
    });
    if (location && location !== "All Locations") {
      params.append("location", location);
    }
    if (tutorId) {
      params.append("tutor_id", tutorId.toString());
    }
    return fetchAPI<TerminatedStudent[]>(`/terminations?${params}`);
  },

  // Update termination record (create or update)
  updateRecord: (
    studentId: number,
    data: TerminationRecordUpdate,
    updatedBy: string
  ) => {
    const params = new URLSearchParams({ updated_by: updatedBy });
    return fetchAPI<TerminationRecordResponse>(`/terminations/${studentId}?${params}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  // Get termination stats for a quarter
  getStats: (
    quarter: number,
    year: number,
    location?: string,
    tutorId?: number
  ) => {
    const params = new URLSearchParams({
      quarter: quarter.toString(),
      year: year.toString(),
    });
    if (location && location !== "All Locations") {
      params.append("location", location);
    }
    if (tutorId) {
      params.append("tutor_id", tutorId.toString());
    }
    return fetchAPI<TerminationStatsResponse>(`/terminations/stats?${params}`);
  },
};

// Messages API
export const messagesAPI = {
  // Get message threads for a tutor (paginated with search)
  getThreads: (
    tutorId: number,
    category?: MessageCategory,
    limit?: number,
    offset?: number,
    search?: string
  ) => {
    const params = new URLSearchParams({ tutor_id: tutorId.toString() });
    if (category) params.append("category", category);
    if (limit) params.append("limit", limit.toString());
    if (offset) params.append("offset", offset.toString());
    if (search) params.append("search", search);
    return fetchAPI<PaginatedThreadsResponse>(`/messages?${params}`);
  },

  // Get sent messages for a tutor
  getSent: (tutorId: number, limit?: number, offset?: number) => {
    const params = new URLSearchParams({ tutor_id: tutorId.toString() });
    if (limit) params.append("limit", limit.toString());
    if (offset) params.append("offset", offset.toString());
    return fetchAPI<Message[]>(`/messages/sent?${params}`);
  },

  // Get unread count for a tutor
  getUnreadCount: (tutorId: number) => {
    return fetchAPI<CountResponse>(`/messages/unread-count?tutor_id=${tutorId}`);
  },

  // Get a specific thread
  getThread: (messageId: number, tutorId: number) => {
    return fetchAPI<MessageThread>(`/messages/thread/${messageId}?tutor_id=${tutorId}`);
  },

  // Create a new message
  create: (data: MessageCreate, fromTutorId: number) => {
    return fetchAPI<Message>(`/messages?from_tutor_id=${fromTutorId}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // Mark message as read
  markRead: (messageId: number, tutorId: number) => {
    return fetchAPI<SuccessResponse>(`/messages/${messageId}/read?tutor_id=${tutorId}`, { method: "POST" });
  },

  // Mark message as unread
  markUnread: (messageId: number, tutorId: number) => {
    return fetchAPI<{ success: boolean; was_read: boolean }>(`/messages/${messageId}/read?tutor_id=${tutorId}`, {
      method: "DELETE",
    });
  },

  // Toggle like on a message
  toggleLike: (messageId: number, tutorId: number) => {
    return fetchAPI<ToggleLikeResponse>(`/messages/${messageId}/like?tutor_id=${tutorId}`, { method: "POST" });
  },

  // Update a message (only by sender)
  update: (messageId: number, message: string, tutorId: number) => {
    return fetchAPI<Message>(`/messages/${messageId}?tutor_id=${tutorId}`, {
      method: "PATCH",
      body: JSON.stringify({ message }),
    });
  },

  // Delete a message (only by sender)
  delete: (messageId: number, tutorId: number) => {
    return fetchAPI<SuccessResponse & MessageResponse>(`/messages/${messageId}?tutor_id=${tutorId}`, { method: "DELETE" });
  },

  // Archive messages (bulk)
  archive: (messageIds: number[], tutorId: number) => {
    return fetchAPI<ArchiveResponse>(`/messages/archive?tutor_id=${tutorId}`, {
      method: "POST",
      body: JSON.stringify({ message_ids: messageIds }),
    });
  },

  // Unarchive messages (bulk)
  unarchive: (messageIds: number[], tutorId: number) => {
    return fetchAPI<ArchiveResponse>(`/messages/archive?tutor_id=${tutorId}`, {
      method: "DELETE",
      body: JSON.stringify({ message_ids: messageIds }),
    });
  },

  // Get archived threads
  getArchived: (tutorId: number, limit?: number, offset?: number) => {
    const params = new URLSearchParams({ tutor_id: tutorId.toString() });
    if (limit) params.append("limit", limit.toString());
    if (offset) params.append("offset", offset.toString());
    return fetchAPI<PaginatedThreadsResponse>(`/messages/archived?${params}`);
  },
};

// Make-up Proposals API
export const proposalsAPI = {
  // Get proposals with optional filters
  getAll: (params: {
    tutor_id?: number;
    proposed_by?: number;
    status?: ProposalStatus;
    include_session?: boolean;
    from_date?: string;
    to_date?: string;
    original_from_date?: string;
    original_to_date?: string;
    limit?: number;
    offset?: number;
  } = {}) => {
    const searchParams = new URLSearchParams();
    if (params.tutor_id) searchParams.append("tutor_id", params.tutor_id.toString());
    if (params.proposed_by) searchParams.append("proposed_by", params.proposed_by.toString());
    if (params.status) searchParams.append("status", params.status);
    if (params.include_session) searchParams.append("include_session", "true");
    if (params.from_date) searchParams.append("from_date", params.from_date);
    if (params.to_date) searchParams.append("to_date", params.to_date);
    if (params.original_from_date) searchParams.append("original_from_date", params.original_from_date);
    if (params.original_to_date) searchParams.append("original_to_date", params.original_to_date);
    if (params.limit) searchParams.append("limit", params.limit.toString());
    if (params.offset) searchParams.append("offset", params.offset.toString());

    const query = searchParams.toString();
    return fetchAPI<MakeupProposal[]>(`/makeup-proposals${query ? `?${query}` : ""}`);
  },

  // Get pending proposal count for notification bell
  getPendingCount: (tutorId: number) => {
    return fetchAPI<PendingProposalCount>(`/makeup-proposals/pending-count?tutor_id=${tutorId}`);
  },

  // Get single proposal
  getById: (proposalId: number, includeSession = true) => {
    return fetchAPI<MakeupProposal>(
      `/makeup-proposals/${proposalId}?include_session=${includeSession}`
    );
  },

  // Get proposal for a specific session
  getForSession: (sessionId: number) => {
    return fetchAPI<MakeupProposal | null>(`/makeup-proposals/for-session/${sessionId}`);
  },

  // Create a new proposal
  create: (data: MakeupProposalCreate, fromTutorId: number) => {
    return fetchAPI<MakeupProposal>(`/makeup-proposals?from_tutor_id=${fromTutorId}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // Approve a slot
  approveSlot: (slotId: number, tutorId: number) => {
    return fetchAPI<MakeupProposal>(
      `/makeup-proposals/slots/${slotId}/approve?tutor_id=${tutorId}`,
      { method: "POST" }
    );
  },

  // Reject a slot
  rejectSlot: (slotId: number, tutorId: number, rejectionReason?: string) => {
    return fetchAPI<MakeupProposal>(
      `/makeup-proposals/slots/${slotId}/reject?tutor_id=${tutorId}`,
      {
        method: "POST",
        body: JSON.stringify({ rejection_reason: rejectionReason }),
      }
    );
  },

  // Update a slot (only for pending proposals)
  updateSlot: (
    slotId: number,
    tutorId: number,
    data: {
      proposed_date?: string;
      proposed_time_slot?: string;
      proposed_tutor_id?: number;
      proposed_location?: string;
    }
  ) => {
    return fetchAPI<MakeupProposal>(
      `/makeup-proposals/slots/${slotId}?tutor_id=${tutorId}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    );
  },

  // Reject entire proposal (for needs_input type)
  reject: (proposalId: number, tutorId: number, rejectionReason?: string) => {
    return fetchAPI<MakeupProposal>(
      `/makeup-proposals/${proposalId}/reject?tutor_id=${tutorId}`,
      {
        method: "POST",
        body: JSON.stringify({ rejection_reason: rejectionReason }),
      }
    );
  },

  // Cancel proposal (by proposer)
  cancel: (proposalId: number, tutorId: number) => {
    return fetchAPI<SuccessResponse & MessageResponse>(
      `/makeup-proposals/${proposalId}?tutor_id=${tutorId}`,
      { method: "DELETE" }
    );
  },
};

// Extension Requests API
export const extensionRequestsAPI = {
  // Create an extension request
  create: (data: ExtensionRequestCreate, tutorId: number) => {
    return fetchAPI<ExtensionRequest>(`/extension-requests?tutor_id=${tutorId}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // Get extension requests with optional filters
  getAll: (params: {
    tutor_id?: number;
    status?: ExtensionRequestStatus;
    enrollment_id?: number;
    location?: string;
    include_resolved?: boolean;
    limit?: number;
    offset?: number;
  } = {}) => {
    const searchParams = new URLSearchParams();
    if (params.tutor_id) searchParams.append("tutor_id", params.tutor_id.toString());
    if (params.status) searchParams.append("status", params.status);
    if (params.enrollment_id) searchParams.append("enrollment_id", params.enrollment_id.toString());
    if (params.location) searchParams.append("location", params.location);
    if (params.include_resolved) searchParams.append("include_resolved", "true");
    if (params.limit) searchParams.append("limit", params.limit.toString());
    if (params.offset) searchParams.append("offset", params.offset.toString());

    const query = searchParams.toString();
    return fetchAPI<ExtensionRequest[]>(`/extension-requests${query ? `?${query}` : ""}`);
  },

  // Get pending extension request count for admin badge
  getPendingCount: () => {
    return fetchAPI<PendingExtensionRequestCount>(`/extension-requests/pending-count`);
  },

  // Get single extension request with full context
  getById: (requestId: number) => {
    return fetchAPI<ExtensionRequestDetail>(`/extension-requests/${requestId}`);
  },

  // Approve an extension request (admin only)
  approve: (
    requestId: number,
    adminTutorId: number,
    data: ExtensionRequestApprove
  ) => {
    return fetchAPI<ExtensionRequest>(
      `/extension-requests/${requestId}/approve?admin_tutor_id=${adminTutorId}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    );
  },

  // Reject an extension request (admin only)
  reject: (
    requestId: number,
    adminTutorId: number,
    data: ExtensionRequestReject
  ) => {
    return fetchAPI<ExtensionRequest>(
      `/extension-requests/${requestId}/reject?admin_tutor_id=${adminTutorId}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    );
  },

  // Mark extension request session as rescheduled (after scheduling makeup)
  markRescheduled: (requestId: number) => {
    return fetchAPI<ExtensionRequest>(
      `/extension-requests/${requestId}/mark-rescheduled`,
      {
        method: "PATCH",
      }
    );
  },
};

// Exam Revision Slots API
export const examRevisionAPI = {
  // Get revision slots with filters
  getSlots: (params?: {
    calendar_event_id?: number;
    tutor_id?: number;
    location?: string;
    from_date?: string;
    to_date?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.calendar_event_id) searchParams.append("calendar_event_id", params.calendar_event_id.toString());
    if (params?.tutor_id) searchParams.append("tutor_id", params.tutor_id.toString());
    if (params?.location) searchParams.append("location", params.location);
    if (params?.from_date) searchParams.append("from_date", params.from_date);
    if (params?.to_date) searchParams.append("to_date", params.to_date);
    const query = searchParams.toString();
    return fetchAPI<ExamRevisionSlot[]>(`/exam-revision/slots${query ? `?${query}` : ""}`);
  },

  // Create a new revision slot
  createSlot: (data: ExamRevisionSlotCreate) => {
    return fetchAPI<ExamRevisionSlot>("/exam-revision/slots", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // Get slot details with enrolled students
  getSlotDetails: (slotId: number) => {
    return fetchAPI<ExamRevisionSlotDetail>(`/exam-revision/slots/${slotId}`);
  },

  // Update a revision slot
  updateSlot: (slotId: number, data: Partial<ExamRevisionSlotCreate>) => {
    return fetchAPI<ExamRevisionSlot>(`/exam-revision/slots/${slotId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  // Delete a slot (use force=true to unenroll students and delete)
  deleteSlot: (slotId: number, force: boolean = false) => {
    const params = force ? "?force=true" : "";
    return fetchAPI<MessageResponse>(`/exam-revision/slots/${slotId}${params}`, { method: "DELETE" });
  },

  // Get eligible students for a slot
  getEligibleStudents: (slotId: number) => {
    return fetchAPI<EligibleStudent[]>(`/exam-revision/slots/${slotId}/eligible-students`);
  },

  // Get eligible students by exam (calendar event) - doesn't require a slot to exist
  getEligibleStudentsByExam: (eventId: number, location?: string | null) => {
    const params = location ? `?location=${encodeURIComponent(location)}` : '';
    return fetchAPI<EligibleStudent[]>(`/exam-revision/calendar/${eventId}/eligible-students${params}`);
  },

  // Enroll a student in a slot
  enrollStudent: (slotId: number, data: EnrollStudentRequest) => {
    return fetchAPI<EnrollStudentResponse>(`/exam-revision/slots/${slotId}/enroll`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // Remove a student's enrollment from a slot
  removeEnrollment: (slotId: number, sessionId: number) => {
    return fetchAPI<MessageResponse>(`/exam-revision/slots/${slotId}/enrollments/${sessionId}`, { method: "DELETE" });
  },

  // Get exams (calendar events) with their revision slot summaries
  getCalendarWithSlots: (params?: {
    school?: string;
    grade?: string;
    location?: string;
    from_date?: string;
    to_date?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.school) searchParams.append("school", params.school);
    if (params?.grade) searchParams.append("grade", params.grade);
    if (params?.location) searchParams.append("location", params.location);
    if (params?.from_date) searchParams.append("from_date", params.from_date);
    if (params?.to_date) searchParams.append("to_date", params.to_date);
    const query = searchParams.toString();
    return fetchAPI<ExamWithRevisionSlots[]>(`/exam-revision/calendar${query ? `?${query}` : ""}`);
  },
};

// Debug Admin API - Super Admin only
export const debugAPI = {
  // List available tables
  getTables: (includeCounts: boolean = true) => {
    const params = includeCounts ? "" : "?include_counts=false";
    return fetchAPI<DebugTable[]>(`/debug/tables${params}`);
  },

  // Get table schema
  getTableSchema: (tableName: string) =>
    fetchAPI<DebugTableSchema>(`/debug/tables/${tableName}/schema`),

  // List rows with pagination and filtering
  getRows: (tableName: string, params?: DebugQueryParams & { filter?: string; search_all?: boolean; include_deleted?: boolean }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.append("limit", String(params.limit));
    if (params?.offset) searchParams.append("offset", String(params.offset));
    if (params?.sort_by) searchParams.append("sort_by", params.sort_by);
    if (params?.sort_order) searchParams.append("sort_order", params.sort_order);
    if (params?.search) searchParams.append("search", params.search);
    if (params?.search_all) searchParams.append("search_all", "true");
    if (params?.include_deleted) searchParams.append("include_deleted", "true");
    if (params?.filter) searchParams.append("filter", params.filter);
    const query = searchParams.toString();
    return fetchAPI<PaginatedRows>(`/debug/tables/${tableName}/rows${query ? `?${query}` : ""}`);
  },

  // Get single row
  getRow: (tableName: string, rowId: number) =>
    fetchAPI<DebugRow>(`/debug/tables/${tableName}/rows/${rowId}`),

  // Create row
  createRow: (tableName: string, data: Record<string, unknown>) =>
    fetchAPI<DebugRow>(`/debug/tables/${tableName}/rows`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Update row
  updateRow: (tableName: string, rowId: number, data: Record<string, unknown>) =>
    fetchAPI<DebugRow>(`/debug/tables/${tableName}/rows/${rowId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Delete row (requires confirmation)
  deleteRow: (tableName: string, rowId: number) =>
    fetchAPI<MessageResponse>(`/debug/tables/${tableName}/rows/${rowId}?confirm=DELETE`, { method: "DELETE" }),

  // Bulk delete rows
  bulkDeleteRows: (tableName: string, rowIds: number[]) =>
    fetchAPI<BulkDeleteResponse>(`/debug/tables/${tableName}/bulk-delete?confirm=DELETE`, {
      method: "DELETE",
      body: JSON.stringify({ ids: rowIds }),
    }),

  // Bulk update rows
  bulkUpdateRows: (tableName: string, rowIds: number[], column: string, value: unknown) =>
    fetchAPI<DebugBulkUpdateResponse>(`/debug/tables/${tableName}/bulk-update`, {
      method: "PATCH",
      body: JSON.stringify({ ids: rowIds, column, value }),
    }),

  // Export table as CSV or JSON
  exportTable: async (
    tableName: string,
    format: "csv" | "json" = "csv",
    limit: number = 10000,
    options?: {
      filter?: string;
      includeDeleted?: boolean;
    }
  ): Promise<Blob> => {
    const params = new URLSearchParams({
      format,
      limit: String(limit),
    });
    if (options?.filter) {
      params.set("filter", options.filter);
    }
    if (options?.includeDeleted) {
      params.set("include_deleted", "true");
    }
    const response = await fetch(
      `${API_BASE_URL}/debug/tables/${tableName}/export?${params}`,
      {
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Export failed" }));
      throw new Error(error.detail || "Export failed");
    }
    return response.blob();
  },

  // Get audit logs
  getAuditLogs: (params?: AuditLogQueryParams) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.append("limit", String(params.limit));
    if (params?.offset) searchParams.append("offset", String(params.offset));
    if (params?.table_name) searchParams.append("table_name", params.table_name);
    if (params?.operation) searchParams.append("operation", params.operation);
    if (params?.admin_email) searchParams.append("admin_email", params.admin_email);
    const query = searchParams.toString();
    return fetchAPI<PaginatedAuditLogs>(`/debug/audit-logs${query ? `?${query}` : ""}`);
  },

  // Execute SQL query (read-only)
  executeSql: (query: string) =>
    fetchAPI<SqlQueryResponse>("/debug/sql/execute", {
      method: "POST",
      body: JSON.stringify({ query }),
    }),

  // Revert an audit log entry
  revertAuditLog: (logId: number) =>
    fetchAPI<RevertResponse>(`/debug/audit-logs/${logId}/revert`, {
      method: "POST",
    }),
};

// Export all APIs as a single object
export const api = {
  tutors: tutorsAPI,
  students: studentsAPI,
  enrollments: enrollmentsAPI,
  sessions: sessionsAPI,
  calendar: calendarAPI,
  stats: statsAPI,
  revenue: revenueAPI,
  courseware: coursewareAPI,
  paperless: paperlessAPI,
  pathAliases: pathAliasesAPI,
  holidays: holidaysAPI,
  documentProcessing: documentProcessingAPI,
  parentCommunications: parentCommunicationsAPI,
  locationSettings: locationSettingsAPI,
  terminations: terminationsAPI,
  messages: messagesAPI,
  proposals: proposalsAPI,
  extensionRequests: extensionRequestsAPI,
  examRevision: examRevisionAPI,
  debug: debugAPI,
};
