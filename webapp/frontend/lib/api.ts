import type {
  Tutor,
  Student,
  Enrollment,
  Session,
  CurriculumSuggestion,
  DashboardStats,
  StudentFilters,
  SessionFilters,
  UpcomingTestAlert,
  CalendarEvent,
  ActivityEvent,
  MonthlyRevenueSummary,
  SessionRevenueDetail,
  CoursewarePopularity,
  CoursewareUsageDetail,
} from "@/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

// Generic fetch wrapper with error handling
async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Unknown error" }));
      throw new Error(error.detail || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`API Error (${endpoint}):`, error);
    throw error;
  }
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

  getMyStudents: (tutorId: number, location?: string) => {
    const params = new URLSearchParams();
    params.append("tutor_id", tutorId.toString());
    if (location && location !== "All Locations") {
      params.append("location", location);
    }
    return fetchAPI<Enrollment[]>(`/enrollments/my-students?${params.toString()}`);
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
};

// Calendar API
export const calendarAPI = {
  getEvents: (daysAhead?: number) => {
    const params = daysAhead ? `?days_ahead=${daysAhead}` : '';
    return fetchAPI<CalendarEvent[]>(`/calendar/events${params}`);
  },

  sync: (force?: boolean) => {
    const params = force ? '?force=true' : '';
    return fetchAPI<{ success: boolean; events_synced: number; message: string }>(
      `/calendar/sync${params}`,
      { method: 'POST' }
    );
  },
};

// Search result types
export interface SearchResults {
  students: Array<{
    id: number;
    student_name: string;
    school_student_id: string | null;
    school: string | null;
    grade: string | null;
  }>;
  sessions: Array<{
    id: number;
    student_id: number;
    student_name: string | null;
    session_date: string | null;
    session_status: string | null;
    tutor_name: string | null;
  }>;
  enrollments: Array<{
    id: number;
    student_id: number;
    student_name: string | null;
    tutor_name: string | null;
    location: string | null;
    payment_status: string | null;
  }>;
}

// Stats API
export const statsAPI = {
  getDashboard: (location?: string) => {
    const params = location && location !== "All Locations" ? `?location=${location}` : "";
    return fetchAPI<DashboardStats>(`/stats${params}`);
  },

  getLocations: () => {
    return fetchAPI<string[]>("/locations");
  },

  search: (query: string, limit?: number) => {
    const params = new URLSearchParams({ q: query });
    if (limit) params.append("limit", limit.toString());
    return fetchAPI<SearchResults>(`/search?${params.toString()}`);
  },

  getActivityFeed: (location?: string) => {
    const params = location && location !== "All Locations" ? `?location=${location}` : "";
    return fetchAPI<ActivityEvent[]>(`/activity-feed${params}`);
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

  getUsageDetail: (filename: string, timeRange: 'recent' | 'all-time', limit?: number, offset?: number) => {
    const params = new URLSearchParams({
      filename,
      time_range: timeRange,
    });
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    return fetchAPI<CoursewareUsageDetail[]>(`/courseware/usage-detail?${params}`);
  },
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
};
