// Tutor types
export interface Tutor {
  id: number;
  user_email?: string;
  tutor_name: string;
  default_location?: string;
}

// Student types
export interface Student {
  id: number;
  school_student_id?: string;
  student_name: string;
  grade?: string;
  phone?: string;
  school?: string;
  lang_stream?: string;
  home_location?: string;
  academic_stream?: string;
  enrollment_count?: number;
}

// Enrollment types
export interface Enrollment {
  id: number;
  student_id: number;
  tutor_id?: number;
  assigned_day?: string;
  assigned_time?: string;
  location?: string;
  lessons_paid?: number;
  payment_date?: string;
  first_lesson_date?: string;
  payment_status: string;
  enrollment_type?: string;
  student_name?: string;
  tutor_name?: string;
  discount_name?: string;
  grade?: string;
  school?: string;
  lang_stream?: string;
  deadline_extension_weeks?: number;
  last_modified_time?: string;
  student?: Student;
}

// Session Exercise types
export interface SessionExercise {
  id: number;
  session_id: number;
  exercise_type: string;
  pdf_name: string;
  page_start?: number;
  page_end?: number;
  created_by: string;
  created_at?: string;
  remarks?: string;
}

// Homework Completion types
export interface HomeworkCompletion {
  id: number;
  current_session_id: number;
  session_exercise_id: number;
  student_id: number;
  completion_status?: string;
  submitted: boolean;
  tutor_comments?: string;
  checked_by?: number;
  checked_at?: string;
  pdf_name?: string;
  page_start?: number;
  page_end?: number;
  homework_assigned_date?: string;
  assigned_by_tutor_id?: number;
  assigned_by_tutor?: string;
}

// Curriculum Suggestion types
export interface CurriculumSuggestion {
  id: number;
  enrollment_id?: number;
  student_id?: number;
  tutor_id?: number;
  session_date?: string;
  time_slot?: string;
  location?: string;
  session_status?: string;
  financial_status?: string;

  // Student info
  school_student_id?: string;
  student_name?: string;
  grade?: string;
  school?: string;
  lang_stream?: string;

  // Tutor info
  tutor_name?: string;

  // Current week info
  current_week_number?: number;
  current_academic_year?: string;

  // Last year's curriculum suggestions (3 weeks)
  week_before_topic?: string;
  week_before_number?: number;
  same_week_topic?: string;
  same_week_number?: number;
  week_after_topic?: string;
  week_after_number?: number;

  // Primary suggestion and formatted display
  primary_suggestion?: string;
  suggestions_display?: string;
  user_friendly_display?: string;
  options_for_buttons?: string;

  // Metadata
  suggestion_count?: number;
  coverage_status?: string;
}

// Session types
export interface Session {
  id: number;
  enrollment_id: number;
  student_id: number;
  tutor_id: number;
  session_date: string;
  time_slot: string;
  location?: string;
  session_status: string;
  attendance_status?: string;
  financial_status?: string;
  performance_rating?: string;
  notes?: string;
  student_name?: string;
  tutor_name?: string;
  school_student_id?: string;
  grade?: string;
  lang_stream?: string;
  school?: string;
  enrollment?: Enrollment;
  student?: Student;
  exercises?: SessionExercise[];
  homework_completion?: HomeworkCompletion[];
  previous_session?: Session;
}

// Dashboard stats types
export interface DashboardStats {
  total_students: number;
  active_students: number;
  total_enrollments: number;
  active_enrollments: number;
  pending_payment_enrollments: number;
  sessions_this_month: number;
  sessions_this_week: number;
  revenue_this_month?: number | null;
}

// API response types
export interface APIResponse<T> {
  data: T;
  message?: string;
  error?: string;
}

// Filter types
export interface StudentFilters {
  search?: string;
  grade?: string;
  location?: string;
  academic_stream?: string;
  limit?: number;
  offset?: number;
}

export interface SessionFilters {
  date?: string;
  from_date?: string;
  to_date?: string;
  tutor_id?: number;
  location?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

// Calendar Event types
export interface UpcomingTestAlert {
  id: number;
  event_id: string;
  title: string;
  description?: string;
  start_date: string;  // ISO format
  end_date?: string;  // ISO format
  school: string;
  grade: string;
  academic_stream?: string;
  event_type: string;
  days_until: number;  // Number of days until the test
}

export interface CalendarEvent {
  id: number;
  event_id: string;
  title: string;
  description?: string;
  start_date: string;  // ISO format (YYYY-MM-DD)
  end_date?: string;
  school?: string;
  grade?: string;
  academic_stream?: string;
  event_type?: string;
  created_at: string;
  updated_at: string;
  last_synced_at: string;
}
