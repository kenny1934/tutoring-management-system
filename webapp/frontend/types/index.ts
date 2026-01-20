// Tutor types
export type TutorRole = 'Tutor' | 'Admin' | 'Super Admin';

export interface Tutor {
  id: number;
  user_email?: string;
  tutor_name: string;
  default_location?: string;
  role: TutorRole;
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
  enrollments?: Enrollment[];
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
  school_student_id?: string;
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
  // Answer file fields (for manual answer selection)
  answer_pdf_name?: string;
  answer_page_start?: number;
  answer_page_end?: number;
  answer_remarks?: string;
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

// Linked session info for make-up/original session display
export interface LinkedSessionInfo {
  id: number;
  session_date: string;
  time_slot?: string;
  tutor_name?: string;
  session_status: string;
}

// Session types
export interface Session {
  id: number;
  enrollment_id: number;
  student_id: number;
  tutor_id: number | null;
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
  previous_session_status?: string;
  rescheduled_to_id?: number;
  make_up_for_id?: number;
  exam_revision_slot_id?: number;  // Links session to exam revision slot
  rescheduled_to?: LinkedSessionInfo;
  make_up_for?: LinkedSessionInfo;
  enrollment?: Enrollment;
  student?: Student;
  exercises?: SessionExercise[];
  homework_completion?: HomeworkCompletion[];
  previous_session?: Session;
  nav_previous_id?: number;
  nav_next_id?: number;
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

// Activity feed event types
export interface ActivityEvent {
  id: string;
  type: 'session_attended' | 'payment_received' | 'new_enrollment' | 'makeup_completed' | 'session_cancelled' | 'session_rescheduled' | 'sick_leave' | 'weather_cancelled' | 'makeup_booked';
  title: string;
  student: string;
  school_student_id?: string;
  location?: string;
  description?: string;
  timestamp: string;
  link?: string;
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
  school?: string;
  location?: string;
  academic_stream?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface SessionFilters {
  date?: string;
  from_date?: string;
  to_date?: string;
  student_id?: number;
  tutor_id?: number;
  enrollment_id?: number;
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

// Revenue types
export interface MonthlyRevenueSummary {
  tutor_id: number;
  tutor_name: string;
  period: string;
  basic_salary: number;
  session_revenue: number;
  monthly_bonus: number;
  total_salary: number;
  sessions_count: number;
  avg_revenue_per_session?: number | null;
}

export interface SessionRevenueDetail {
  session_id: number;
  session_date: string;
  time_slot?: string;
  student_id: number;
  student_name: string;
  session_status: string;
  cost_per_session: number;
  enrollment_id: number;
}

// Courseware types
export interface CoursewarePopularity {
  filename: string;
  normalized_paths: string;
  used_by: string;
  assignment_count: number;
  unique_student_count: number;
  earliest_use: string | null;
  latest_use: string | null;
}

export interface CoursewareUsageDetail {
  exercise_id: number;
  session_id: number;
  filename: string;
  normalized_path: string;
  original_pdf_name: string;
  exercise_type: string;
  page_start: number | null;
  page_end: number | null;
  session_date: string | null;
  location: string;
  student_id: number;
  school_student_id: string | null;
  student_name: string;
  grade: string;
  lang_stream: string;
  school: string;
  tutor_id: number;
  tutor_name: string;
}

// Holiday types
export interface Holiday {
  id: number;
  holiday_date: string;  // ISO format (YYYY-MM-DD)
  holiday_name?: string;
}

// Page selection types (for PDF page range selection)
export interface PageSelection {
  pageStart?: number;
  pageEnd?: number;
  complexRange?: string;  // For non-consecutive pages: "1,3,5-7"
}

// Termination types
export interface TerminatedStudent {
  student_id: number;
  student_name: string;
  school_student_id?: string;
  grade?: string;
  home_location?: string;
  termination_date: string;
  tutor_id?: number;
  tutor_name?: string;
  schedule?: string;
  record_id?: number;
  reason?: string;
  count_as_terminated: boolean;
}

export interface TerminationRecordUpdate {
  quarter: number;
  year: number;
  reason?: string;
  count_as_terminated: boolean;
}

export interface TerminationRecordResponse {
  id: number;
  student_id: number;
  quarter: number;
  year: number;
  reason?: string;
  count_as_terminated: boolean;
  tutor_id?: number;
  updated_by?: string;
  updated_at: string;
}

export interface TutorTerminationStats {
  tutor_id: number;
  tutor_name: string;
  opening: number;
  enrollment_transfer: number;
  terminated: number;
  closing: number;
  term_rate: number;
}

export interface LocationTerminationStats {
  opening: number;
  enrollment_transfer: number;
  terminated: number;
  closing: number;
  term_rate: number;
}

export interface TerminationStatsResponse {
  tutor_stats: TutorTerminationStats[];
  location_stats: LocationTerminationStats;
}

export interface QuarterOption {
  quarter: number;
  year: number;
  count: number;
}

// Overdue enrollment types
export interface OverdueEnrollment {
  id: number;
  student_id: number;
  student_name: string;
  school_student_id?: string;
  grade?: string;
  tutor_id?: number;
  tutor_name?: string;
  assigned_day?: string;
  assigned_time?: string;
  location?: string;
  first_lesson_date: string;  // ISO format (YYYY-MM-DD)
  lessons_paid: number;
  days_overdue: number;
}

// Message types
export type MessagePriority = 'Normal' | 'High' | 'Urgent';
export type MessageCategory = 'Reminder' | 'Question' | 'Announcement' | 'Schedule' | 'Chat' | 'Courseware' | 'MakeupConfirmation';

export interface Message {
  id: number;
  from_tutor_id: number;
  from_tutor_name?: string;
  to_tutor_id?: number;
  to_tutor_name?: string;  // "All" for broadcasts
  subject?: string;
  message: string;
  priority: MessagePriority;
  category?: MessageCategory;
  created_at: string;
  updated_at?: string;
  reply_to_id?: number;
  is_read: boolean;
  like_count: number;
  is_liked_by_me: boolean;
  reply_count: number;
}

export interface MessageThread {
  root_message: Message;
  replies: Message[];
  total_unread: number;
}

export interface MessageCreate {
  to_tutor_id?: number;  // NULL = broadcast
  reply_to_id?: number;
  subject?: string;
  message: string;
  priority?: MessagePriority;
  category?: MessageCategory;
}

// Make-up scheduling types
export interface StudentInSlot {
  id: number;
  school_student_id?: string;
  student_name: string;
  grade?: string;
  school?: string;
  lang_stream?: string;
  session_status: string;
}

// Raw scoring data returned by backend for frontend-side weighted scoring
export interface MakeupScoreBreakdown {
  is_same_tutor: boolean;
  matching_grade_count: number;
  matching_school_count: number;
  matching_lang_count: number;
  days_away: number;
  current_students: number;
}

export interface MakeupSlotSuggestion {
  session_date: string;  // ISO format
  time_slot: string;
  tutor_id: number;
  tutor_name: string;
  location: string;
  current_students: number;
  available_spots: number;
  compatibility_score: number;  // Default score from backend
  score_breakdown: MakeupScoreBreakdown;  // Raw data for frontend scoring
  students_in_slot: StudentInSlot[];
}

export interface ScheduleMakeupRequest {
  session_date: string;  // ISO format
  time_slot: string;
  tutor_id: number;
  location: string;
  notes?: string;  // Optional reason for scheduling
}

export interface ScheduleMakeupResponse {
  makeup_session: Session;
  original_session: Session;
}

// Make-up Proposal types
export type ProposalType = 'specific_slots' | 'needs_input';
export type ProposalStatus = 'pending' | 'approved' | 'rejected';
export type SlotStatus = 'pending' | 'approved' | 'rejected';

export interface MakeupProposalSlot {
  id: number;
  proposal_id: number;
  slot_order: number;
  proposed_date: string;  // ISO format
  proposed_time_slot: string;
  proposed_tutor_id: number;
  proposed_tutor_name?: string;
  proposed_location: string;
  slot_status: SlotStatus;
  resolved_at?: string;
  resolved_by_tutor_id?: number;
  resolved_by_tutor_name?: string;
  rejection_reason?: string;
}

export interface MakeupProposal {
  id: number;
  original_session_id: number;
  proposed_by_tutor_id: number;
  proposed_by_tutor_name?: string;
  proposal_type: ProposalType;
  needs_input_tutor_id?: number;
  needs_input_tutor_name?: string;
  notes?: string;
  status: ProposalStatus;
  created_at: string;
  resolved_at?: string;
  message_id?: number;
  slots: MakeupProposalSlot[];
  original_session?: Session;
}

export interface MakeupProposalSlotCreate {
  slot_order: number;
  proposed_date: string;
  proposed_time_slot: string;
  proposed_tutor_id: number;
  proposed_location: string;
}

export interface MakeupProposalCreate {
  original_session_id: number;
  proposal_type: ProposalType;
  needs_input_tutor_id?: number;
  slots?: MakeupProposalSlotCreate[];
  notes?: string;
}

export interface PendingProposalCount {
  count: number;
}

// Exam Revision Slot types
export interface ExamRevisionSlot {
  id: number;
  calendar_event_id: number;
  session_date: string;  // ISO format
  time_slot: string;
  tutor_id: number;
  tutor_name?: string;
  location: string;
  notes?: string;
  created_at: string;
  created_by?: string;
  enrolled_count: number;
  calendar_event?: CalendarEvent;
}

export interface EnrolledStudentInfo {
  session_id: number;
  student_id: number;
  student_name: string;
  school_student_id?: string;
  grade?: string;
  school?: string;
  lang_stream?: string;
  academic_stream?: string;
  session_status: string;
  consumed_session_id?: number;
}

export interface ExamRevisionSlotDetail extends ExamRevisionSlot {
  enrolled_students: EnrolledStudentInfo[];
}

export interface PendingSessionInfo {
  id: number;
  session_date: string;
  time_slot?: string;
  session_status: string;
  tutor_name?: string;
  location?: string;
}

export interface EligibleStudent {
  student_id: number;
  student_name: string;
  school_student_id?: string;
  grade?: string;
  school?: string;
  lang_stream?: string;
  academic_stream?: string;
  pending_sessions: PendingSessionInfo[];
}

export interface ExamRevisionSlotCreate {
  calendar_event_id: number;
  session_date: string;
  time_slot: string;
  tutor_id: number;
  location: string;
  notes?: string;
  created_by?: string;
}

export interface EnrollStudentRequest {
  student_id: number;
  consume_session_id: number;
  notes?: string;
  created_by?: string;
}

export interface EnrollStudentResponse {
  revision_session: Session;
  consumed_session: Session;
}

export interface ExamWithRevisionSlots {
  id: number;
  event_id: string;
  title: string;
  description?: string;
  start_date: string;
  end_date?: string;
  school?: string;
  grade?: string;
  academic_stream?: string;
  event_type?: string;
  revision_slots: ExamRevisionSlot[];
  total_enrolled: number;
  eligible_count: number;
}
