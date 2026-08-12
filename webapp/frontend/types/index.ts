// Tutor types
export type TutorRole = 'Tutor' | 'Admin' | 'Super Admin' | 'Supervisor' | 'Guest';

export interface Tutor {
  id: number;
  user_email?: string;
  tutor_name: string;
  nickname?: string;
  default_location?: string;
  role: TutorRole;
  /** Monthly base salary. Only present for admin-level roles (Super Admin, Admin, Supervisor). */
  basic_salary?: number;
  is_active_tutor?: boolean;
  profile_picture?: string;
}

// Fields an admin may edit via the tutor profile page. Excludes email + role
// (those stay debug-panel only).
export interface TutorUpdate {
  nickname?: string;
  default_location?: string;
  basic_salary?: number;
  is_active_tutor?: boolean;
}

// Session Status constants
// Keep in sync with backend/constants.py
export const SessionStatus = {
  // Base statuses
  SCHEDULED: 'Scheduled',
  TRIAL_CLASS: 'Trial Class',
  MAKEUP_CLASS: 'Make-up Class',

  // Attended statuses
  ATTENDED: 'Attended',
  ATTENDED_MAKEUP: 'Attended (Make-up)',

  // No show
  NO_SHOW: 'No Show',

  // Rescheduled statuses
  RESCHEDULED_PENDING: 'Rescheduled - Pending Make-up',
  RESCHEDULED_BOOKED: 'Rescheduled - Make-up Booked',

  // Sick leave statuses
  SICK_LEAVE_PENDING: 'Sick Leave - Pending Make-up',
  SICK_LEAVE_BOOKED: 'Sick Leave - Make-up Booked',

  // Weather cancelled statuses
  WEATHER_PENDING: 'Weather Cancelled - Pending Make-up',
  WEATHER_BOOKED: 'Weather Cancelled - Make-up Booked',

  // Cancelled
  CANCELLED: 'Cancelled',
} as const;

export type SessionStatusValue = typeof SessionStatus[keyof typeof SessionStatus];

// Session status groupings for UI logic
export const ATTENDABLE_STATUSES: SessionStatusValue[] = [
  SessionStatus.SCHEDULED,
  SessionStatus.MAKEUP_CLASS,
  SessionStatus.TRIAL_CLASS,
];

export const PENDING_MAKEUP_STATUSES: SessionStatusValue[] = [
  SessionStatus.RESCHEDULED_PENDING,
  SessionStatus.SICK_LEAVE_PENDING,
  SessionStatus.WEATHER_PENDING,
];

export const MAKEUP_BOOKED_STATUSES: SessionStatusValue[] = [
  SessionStatus.RESCHEDULED_BOOKED,
  SessionStatus.SICK_LEAVE_BOOKED,
  SessionStatus.WEATHER_BOOKED,
];

export const COMPLETED_STATUSES: SessionStatusValue[] = [
  SessionStatus.ATTENDED,
  SessionStatus.ATTENDED_MAKEUP,
];

// =============================================================================
// STUDENT TYPES
// =============================================================================

export interface StudentContact {
  phone: string;
  label?: string;
}

/**
 * Student creation payload - fields for creating a new student
 * Used in: studentsAPI.create()
 */
export interface StudentCreate {
  student_name: string;
  school_student_id?: string;
  grade?: string;
  phone?: string;
  contacts?: StudentContact[];
  school?: string;
  lang_stream?: string;
  home_location?: string;
  academic_stream?: string;
}

/**
 * Student response - full student record from API
 * Used in: API responses, component props
 */
export interface HandoverProspect {
  id: number;
  tutor_remark?: string | null;
  sibling_info?: string | null;
  preferred_tutor_note?: string | null;
  preferred_time_note?: string | null;
  tutor_name?: string | null;
  source_branch: string;
  primary_student_id?: string | null;
  student_name?: string | null;
  submitted_at?: string | null;
}

export interface Student {
  id: number;
  school_student_id?: string;
  student_name: string;
  grade?: string;
  phone?: string;
  contacts?: StudentContact[];
  school?: string;
  lang_stream?: string;
  home_location?: string;
  academic_stream?: string;
  is_staff_referral?: boolean;
  staff_referral_notes?: string;
  enrollment_count?: number;
  enrollments?: Enrollment[];
  handover_prospect?: HandoverProspect | null;
}

// =============================================================================
// DISCOUNT TYPES
// =============================================================================

/**
 * Discount - available discount types in the system
 */
export interface Discount {
  id: number;
  discount_name: string;
  discount_type?: string;
  discount_value?: number;
  is_active: boolean;
}

/**
 * Student coupon availability check response
 */
export interface StudentCouponResponse {
  has_coupon: boolean;
  available?: number;
  value?: number;
  last_synced_at?: string;
}

// =============================================================================
// ENROLLMENT TYPES
// =============================================================================

/**
 * Enrollment creation payload - fields for creating a new enrollment
 * Used in: enrollmentsAPI.create(), enrollmentsAPI.preview()
 */
export interface EnrollmentCreate {
  student_id: number;
  tutor_id: number;
  assigned_day: string;
  assigned_time: string;
  location: string;
  first_lesson_date: string;
  lessons_paid: number;
  enrollment_type?: string;
  remark?: string;
  renewed_from_enrollment_id?: number;
  discount_id?: number;
  is_new_student?: boolean;
}

/**
 * Enrollment response - full enrollment record from API
 * Used in: API responses, component props
 */
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
  extension_notes?: string;
  last_extension_date?: string;
  extension_granted_by?: string;
  last_modified_time?: string;
  effective_end_date?: string;
  fee_message_sent?: boolean;
  is_new_student?: boolean;
  summer_application_id?: number | null;
  // Dates the student can't attend, from the source summer application (for arranging make-ups).
  summer_unavailability_notes?: string | null;
  // Summer tier snapshot — locked at publish, kept in sync by nightly sweep.
  payment_deadline?: string | null;
  locked_discount_code?: string | null;
  locked_discount_amount?: number | null;
  discount_override_code?: string | null;
  discount_override_reason?: string | null;
  discount_override_by?: string | null;
  discount_override_at?: string | null;
  // Total tuition shown in the fee message (base - discount + reg fee).
  // null/undefined for Summer enrollments without a priceable config.
  total_fee?: number | null;
  // One-off materials fee actually charged: 0 for a new student whose intake
  // collects it from nobody, null/undefined when the endpoint did not compute
  // it (the badge then falls back to assuming it was charged).
  registration_fee?: number | null;
  student?: Student;
}

// Session Exercise types
export interface SessionExercise {
  id: number;
  session_id: number;
  exercise_type: string;
  pdf_name?: string;
  page_start?: number;
  page_end?: number;
  created_by: string;
  created_at?: string;
  remarks?: string;
  url?: string;
  url_title?: string;
  // Answer file fields (for manual answer selection)
  answer_pdf_name?: string;
  answer_page_start?: number;
  answer_page_end?: number;
  answer_remarks?: string;
}

// Exercise History types (for exercise history panel)
export interface ExerciseHistorySession {
  session_id: number;
  session_date: string;
  time_slot?: string;
  exercises: SessionExercise[];
}

export interface ExerciseHistoryResponse {
  sessions: ExerciseHistorySession[];
  has_more: boolean;
}

// Homework Completion types
//
// A ladder, not a set of peers. "Submitted" is work that came back but nobody
// has marked yet, so it still counts as unchecked: it stays in the backlog and
// keeps ageing until a tutor gives it a verdict.
export type HomeworkStatus =
  | "Not Checked"
  | "Submitted"
  | "Completed"
  | "Partially Completed"
  | "Not Completed";

/** A photo or PDF of what the student handed in. */
export interface HomeworkFile {
  id: number;
  file_path: string;
  /** Small derivative for previews. Absent on older rows and on PDFs. */
  thumbnail_path?: string;
  // The column allows 'document' as well, but only photos and PDFs can be
  // attached, so nothing writes it.
  file_type: "image" | "pdf";
  file_name?: string;
  file_size_kb?: number;
  file_order?: number;
  uploaded_at?: string;
  uploaded_by?: string;
}

/** One homework assignment still open for a session, with its check state. */
export interface HomeworkCompletion {
  session_exercise_id: number;
  current_session_id: number;
  student_id: number;

  // Where it was assigned. sessions_ago is 1 for last session, 2 for the one before.
  assigned_session_id?: number;
  homework_assigned_date?: string;
  assigned_time_slot?: string;
  assigned_by_tutor_id?: number;
  assigned_by_tutor?: string;
  sessions_ago?: number;

  // The assignment
  pdf_name?: string;
  page_start?: number;
  page_end?: number;
  url?: string;
  url_title?: string;
  assignment_remarks?: string;

  // Check state
  completion_id?: number;
  completion_status?: HomeworkStatus;
  homework_rating?: string;
  tutor_comments?: string;
  checked_by?: number;
  checked_at?: string;
  checked_in_session_id?: number;

  // What the student handed in
  attachment_count: number;
  files: HomeworkFile[];
}

/** Open homework counts for one session, for list badges. */
export interface HomeworkCount {
  session_id: number;
  total: number;
  checked: number;
}

/** Open homework for one session, as returned by the bulk endpoint. */
export interface SessionHomework {
  session_id: number;
  homework: HomeworkCompletion[];
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
  tutor_nickname?: string;
  session_status: string;
}

// =============================================================================
// SESSION TYPES
// =============================================================================

/**
 * Session update payload - fields for updating a session
 * Used in: sessionsAPI.updateSession()
 */
export interface SessionUpdate {
  session_date?: string;
  time_slot?: string;
  location?: string;
  tutor_id?: number;
  session_status?: string;
  performance_rating?: string;
  notes?: string;
}

/**
 * Session response - full session record from API
 * Used in: API responses, component props
 */
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
  tutor_nickname?: string;
  school_student_id?: string;
  grade?: string;
  lang_stream?: string;
  school?: string;
  last_modified_time?: string;
  last_modified_by?: string;
  attendance_marked_by?: string;
  attendance_mark_time?: string;
  previous_session_status?: string;
  undone_from_status?: string;  // Only set in undo response for redo toast
  rescheduled_to_id?: number;
  make_up_for_id?: number;
  root_original_session_date?: string;  // For makeup sessions: date of the root original session (for 60-day rule)
  exam_revision_slot_id?: number;  // Links session to exam revision slot
  extension_request_id?: number;  // ID of extension request for this session
  extension_request_status?: 'Pending' | 'Approved' | 'Rejected';  // Status of extension request
  rescheduled_to?: LinkedSessionInfo;
  make_up_for?: LinkedSessionInfo;
  enrollment?: Enrollment;
  enrollment_payment_status?: string;  // Payment status of the enrollment (Paid, Pending Payment, Overdue, Cancelled)
  lesson_number?: number | null;
  summer_slot_id?: number | null;  // Summer class (slot) this session belongs to; null for non-summer
  summer_class_grade?: string | null;  // Grade of the summer class, distinct from the student's own grade
  summer_course_type?: string | null;  // Summer course type (A/B) — determines lesson order
  summer_slot_label?: string | null;
  summer_stray?: boolean | null;  // True when class fields are the home-slot fallback: no class of this row's tutor hosted in its cell
  moved_lesson_number?: number | null;  // Make-up origins: lesson number carried by the successor row (display only)
  student?: Student;
  exercises?: SessionExercise[];
  homework_completion?: HomeworkCompletion[];
  previous_session?: Session;
  nav_previous_id?: number;
  nav_next_id?: number;
  handover_prospect?: HandoverProspect | null;
  show_handover_first_lesson?: boolean;
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
  modified_by?: string;
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
  lang_stream?: string;
  tutor_id?: number;
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
  revision_slot_count?: number;  // Number of revision slots linked to this event
}

export interface CalendarEventCreate {
  title: string;
  description?: string;
  start_date: string;  // ISO format (YYYY-MM-DD)
  end_date?: string;
  school?: string;
  grade?: string;
  academic_stream?: string;  // 'A' | 'S' | 'C'
  event_type?: string;  // 'Test' | 'Quiz' | 'Exam'
}

export type CalendarEventUpdate = Partial<CalendarEventCreate>;

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

export interface TutorYearMatrixCell {
  session_revenue: number;
  sessions_count: number;
  basic_salary: number;
  monthly_bonus: number;
  total_salary: number;
}

export interface TutorYearMatrixTutor {
  id: number;
  name: string;
  default_location?: string | null;
}

export interface TutorYearMatrixResponse {
  year: number;
  periods: string[];
  tutors: TutorYearMatrixTutor[];
  cells: Record<string, Record<string, TutorYearMatrixCell>>;
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
  reason_category?: string;
  count_as_terminated: boolean;
}

export interface TerminationRecordUpdate {
  quarter: number;
  year: number;
  reason?: string;
  reason_category?: string;
  count_as_terminated: boolean;
}

export interface TerminationRecordResponse {
  id: number;
  student_id: number;
  quarter: number;
  year: number;
  reason?: string;
  reason_category?: string;
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

/** How the summer course period narrowed the quarter these figures cover */
export interface SummerPauseScope {
  pause_start: string;
  pause_end: string;
  measured_from: string;
  measured_to: string;
  /** Lessons ending on or after this date are judged in the next quarter */
  handover_from: string;
}

export interface TerminationStatsResponse {
  tutor_stats: TutorTerminationStats[];
  location_stats: LocationTerminationStats;
  summer_scope?: SummerPauseScope | null;
}

export interface QuarterOption {
  quarter: number;
  year: number;
}

export interface TerminationReviewCount {
  count: number;
  in_review_period: boolean;
  review_quarter: number | null;
  review_year: number | null;
}

export interface QuarterTrendPoint {
  quarter: number;
  year: number;
  label: string;
  opening: number;
  terminated: number;
  closing: number;
  term_rate: number;
  reason_breakdown: Record<string, number>;
}

export interface StatDetailStudent {
  student_id: number;
  student_name: string;
  school_student_id: string | null;
  tutor_name: string | null;
  grade: string | null;
  school: string | null;
  lang_stream: string | null;
  home_location: string | null;
  enrollment_id: number | null;
  assigned_day: string | null;
  assigned_time: string | null;
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
  enrollment_type?: string | null;
  // For Summer enrollments: the earlier of (discount deadline, first_lesson_date).
  // Null for Regular enrollments — urgency falls back to first_lesson_date.
  payment_deadline?: string | null;
  deadline_source?: "payment_deadline" | "first_lesson";
  locked_discount_code?: string | null;
  locked_discount_amount?: number | null;
  discount_override_code?: string | null;
  discount_override_reason?: string | null;
  // Total tuition shown in the fee message; null for Summer rows with no priceable config.
  total_fee?: number | null;
  // One-off materials fee actually charged; 0 when waived or not applicable.
  registration_fee?: number | null;
}

// Unchecked attendance types
export interface UncheckedAttendanceReminder {
  session_id: number;
  session_date: string;  // ISO format (YYYY-MM-DD)
  time_slot?: string;
  location?: string;
  session_status: string;
  tutor_id: number;
  tutor_name: string;
  student_id: number;
  student_name: string;
  school_student_id?: string;
  grade?: string;
  lang_stream?: string;
  school?: string;
  days_overdue: number;
  urgency_level: 'Critical' | 'High' | 'Medium' | 'Low';
  lesson_number?: number | null;
}

export interface UncheckedAttendanceCount {
  total: number;
  critical: number;  // Sessions >7 days overdue
}

export interface AgedPendingMakeupsCount {
  count: number;
  critical: number;
}

// Message types
export type MessagePriority = 'Normal' | 'High' | 'Urgent';
export type MessageCategory = 'Reminder' | 'Question' | 'Announcement' | 'Schedule' | 'Chat' | 'Courseware' | 'MakeupConfirmation' | 'Feedback';

export interface ReadReceiptDetail {
  tutor_id: number;
  tutor_name: string;
  read_at: string;
}

export interface LikeDetail {
  tutor_id: number;
  tutor_name: string;
  liked_at: string;
  emoji: string;
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  tutor_ids: number[];
}

export interface MessageTemplate {
  id: number;
  tutor_id: number | null;
  title: string;
  content: string;
  category: string | null;
  is_global: boolean;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  from_tutor_id: number;
  from_tutor_name?: string;
  from_tutor_profile_picture?: string;
  to_tutor_id?: number;
  to_tutor_name?: string;  // "All" for broadcasts, comma-joined for groups
  subject?: string;
  message: string;
  priority: MessagePriority;
  category?: MessageCategory;
  created_at: string;
  updated_at?: string;
  reply_to_id?: number;
  is_read: boolean;
  is_pinned: boolean;
  is_thread_pinned?: boolean;
  is_thread_muted?: boolean;
  is_snoozed?: boolean;
  snoozed_until?: string | null;
  scheduled_at?: string | null;
  is_group_message?: boolean;
  to_tutor_ids?: number[];    // Group message recipient IDs
  to_tutor_names?: string[];  // Group message recipient names
  like_count: number;
  is_liked_by_me: boolean;
  like_details?: LikeDetail[];
  reaction_summary?: ReactionSummary[];
  reply_count: number;
  image_attachments?: string[];  // List of image URLs
  file_attachments?: { url: string; filename: string; content_type: string; duration?: number }[];  // Document attachments
  // Read receipt fields for sender's messages (WhatsApp-style seen status)
  read_receipts?: ReadReceiptDetail[];  // Only populated for sender's own messages
  total_recipients?: number;  // Total recipients for broadcasts/groups
  read_by_all?: boolean;  // True when all recipients have read
}

export interface MessageThread {
  root_message: Message;
  replies: Message[];
  total_unread: number;
}

export interface PaginatedThreadsResponse {
  threads: MessageThread[];
  total_count: number;
  has_more: boolean;
  limit: number;
  offset: number;
}

export interface PaginatedMessagesResponse {
  messages: Message[];
  total_count: number;
  has_more: boolean;
  limit: number;
  offset: number;
}

export interface MessageCreate {
  to_tutor_id?: number;    // NULL = broadcast, specific ID = direct
  to_tutor_ids?: number[]; // 2+ recipients = group message
  reply_to_id?: number;
  subject?: string;
  message: string;
  priority?: MessagePriority;
  category?: MessageCategory;
  image_attachments?: string[];  // List of uploaded image URLs
  file_attachments?: { url: string; filename: string; content_type: string; duration?: number }[];  // Document attachments
  scheduled_at?: string;  // ISO datetime string for scheduled send
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
  lesson_number?: number | null;  // Resolved summer lesson; null for non-summer
}

// Raw scoring data returned by backend for frontend-side weighted scoring
export interface MakeupScoreBreakdown {
  is_same_tutor: boolean;
  matching_grade_count: number;
  matching_school_count: number;
  matching_lang_count: number;
  days_away: number;
  current_students: number;
  // Summer-only lesson signals (same-grade summer students in the slot);
  // optional so old cached responses stay valid
  missed_lesson?: number | null;
  matching_lesson_count?: number;
  slot_majority_lesson?: number | null;
  majority_lesson_count?: number;
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

// Extension Request types
export type ExtensionRequestStatus = 'Pending' | 'Approved' | 'Rejected';

export interface ExtensionRequest {
  id: number;
  session_id: number;
  enrollment_id: number;  // Source enrollment (session belongs to this)
  target_enrollment_id?: number;  // Enrollment to extend (student's current). NULL = same as enrollment_id
  student_id: number;
  tutor_id: number;
  requested_extension_weeks: number;
  reason: string;
  proposed_reschedule_date?: string;
  proposed_reschedule_time?: string;
  request_status: ExtensionRequestStatus;
  requested_by: string;
  requested_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
  extension_granted_weeks?: number;
  session_rescheduled: boolean;
  // Joined fields
  student_name?: string;
  tutor_name?: string;
  original_session_date?: string;
  // Student info for display
  school_student_id?: string;
  grade?: string;
  lang_stream?: string;
  school?: string;
  location?: string;
}

export interface ExtensionRequestDetail extends ExtensionRequest {
  // Source enrollment context (where the session is from)
  enrollment_first_lesson_date?: string;
  enrollment_lessons_paid?: number;
  source_effective_end_date?: string;
  source_pending_makeups_count: number;  // Pending makeups on source enrollment
  source_sessions_completed: number;  // Sessions completed on source enrollment
  // Target enrollment context (the one to extend - may differ from source)
  target_first_lesson_date?: string;
  target_lessons_paid?: number;
  current_extension_weeks: number;  // Target enrollment's current extensions
  current_effective_end_date?: string;  // Target enrollment's current end date
  projected_effective_end_date?: string;  // Target enrollment's end date if approved
  // Session/makeup context (target enrollment)
  pending_makeups_count: number;  // Pending makeups on target enrollment
  sessions_completed: number;  // Sessions completed on target enrollment
  admin_guidance?: string;
  // UI loading state flag
  _isLoading?: boolean;
}

export interface ExtensionRequestCreate {
  session_id: number;
  requested_extension_weeks: number;
  reason: string;
  proposed_reschedule_date?: string;
  proposed_reschedule_time?: string;
  target_enrollment_id?: number;  // For concurrent enrollments - which enrollment to extend
}

export interface ExtensionRequestApprove {
  extension_granted_weeks: number;
  review_notes?: string;
}

export interface ExtensionRequestReject {
  review_notes: string;
}

export interface PendingExtensionRequestCount {
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
  warning?: string;  // Overlap warning from creation
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
  home_location?: string;
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
  root_original_session_date?: string;
}

export interface EligibleStudent {
  student_id: number;
  student_name: string;
  school_student_id?: string;
  grade?: string;
  school?: string;
  lang_stream?: string;
  academic_stream?: string;
  home_location?: string;
  enrollment_tutor_name?: string;
  pending_sessions: PendingSessionInfo[];
  is_past_deadline?: boolean;
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
  warning?: string;
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

// Slot defaults for exam revision slot creation
export interface SlotDefaults {
  tutor_id?: number;
  location?: string;
  notes?: string;
}

// =============================================================================
// BATCH RENEWAL TYPES
// =============================================================================

/**
 * Eligibility result for a single enrollment in batch renewal check
 */
export interface EligibilityResult {
  enrollment_id: number;
  eligible: boolean;
  reason: string | null;
  student_name: string;
  details: string | null;
  // Student info for StudentInfoBadges display
  student_id: number | null;
  school_student_id: string | null;
  grade: string | null;
  lang_stream: string | null;
  school: string | null;
  // Schedule preview info
  assigned_day: string | null;
  assigned_time: string | null;
  suggested_first_lesson_date: string | null;
  // Override capability (True for pending_makeups, extension_pending; False for conflicts)
  overridable: boolean;
}

/**
 * Response from batch renewal eligibility check endpoint
 * Used in: enrollmentsAPI.batchRenewCheck()
 */
export interface BatchRenewCheckResponse {
  eligible: EligibilityResult[];
  ineligible: EligibilityResult[];
}

// =============================================================================
// ERROR TYPES
// =============================================================================

/**
 * Structured API error response
 * Used for typed error handling in API responses
 */
export interface ApiError {
  detail: string | { message: string; code?: string; [key: string]: unknown };
  status?: number;
}

// =============================================================================
// GENERIC API RESPONSE TYPES
// =============================================================================

/** Generic message response for delete/action endpoints */
export interface MessageResponse {
  message: string;
}

/** Generic success response */
export interface SuccessResponse {
  success: boolean;
}

/** Generic count response */
export interface CountResponse {
  count: number;
}

/** Batch update response for mark-paid/mark-sent operations */
/** The early-bird discount a late payment would forfeit. Mirrors the backend
 *  409 detail / batch blocked-item payload; the dialog component reads this. */
export interface EarlyBirdDeadlineDetail {
  code: string; // "early_bird_deadline_passed"
  message: string;
  tier_code: string;
  tier_name_en: string | null;
  tier_name_zh: string | null;
  deadline: string | null; // YYYY-MM-DD
  amount_at_risk: number;
  full_fee: number;
  discounted_fee: number;
}

/** A Summer enrolment a batch mark-paid skipped to avoid stripping its discount. */
export interface EarlyBirdBlockedEnrollment {
  enrollment_id: number;
  student_name: string;
  detail: EarlyBirdDeadlineDetail;
}

export interface BatchUpdateResponse {
  updated: number[];
  count: number;
  early_bird_blocked?: EarlyBirdBlockedEnrollment[];
}

/** Response for calendar sync operations */
export interface CalendarSyncResponse {
  success: boolean;
  events_synced: number;
  message: string;
}

/** Response for enrollment cancellation */
export interface EnrollmentCancelResponse {
  enrollment: Enrollment;
  sessions_cancelled: number;
}

/** Response for fee message generation */
export interface FeeMessageResponse {
  message: string;
  lessons_paid: number;
  first_lesson_date: string;
}

/** Response for school info lookup */
export interface SchoolInfoResponse {
  lang_stream: string | null;
}

/** Response for next student ID */
export interface NextIdResponse {
  next_id: string;
}

/** Duplicate student match */
export interface DuplicateStudent {
  id: number;
  student_name: string;
  school_student_id: string | null;
  school: string | null;
  grade: string | null;
  home_location: string | null;
  lang_stream: string | null;
  match_reason: string;
}

/** Response for duplicate check */
export interface CheckDuplicatesResponse {
  duplicates: DuplicateStudent[];
}

/** Location revenue summary */
export interface LocationRevenueSummary {
  location: string;
  period: string;
  total_revenue: number;
  sessions_count: number;
  avg_revenue_per_session: number;
}

/** Active student for dashboard */
export interface ActiveStudent {
  id: number;
  school_student_id: string | null;
  student_name: string;
  grade: string | null;
  lang_stream: string | null;
  school: string | null;
  home_location: string | null;
}

/** Toggle like response */
export interface ToggleLikeResponse {
  success: boolean;
  is_liked: boolean;
  like_count: number;
}

/** Archive operation response */
export interface ArchiveResponse {
  success: boolean;
  count: number;
}

/** Pin/star operation response */
export interface PinResponse {
  success: boolean;
  count: number;
}

/** Bulk delete response for debug API */
export interface BulkDeleteResponse {
  deleted_count: number;
  failed_ids: number[];
  message: string;
}

/** Bulk update response for debug API */
export interface DebugBulkUpdateResponse {
  updated_count: number;
  message: string;
}

// =============================================================================
// ENROLLMENT PREVIEW & RENEWAL TYPES
// =============================================================================

/** Session preview for enrollment creation */
export interface SessionPreview {
  session_date: string;
  time_slot: string;
  location: string;
  is_holiday: boolean;
  holiday_name?: string;
  conflict?: string;
}

/** Student conflict info during enrollment creation */
export interface StudentConflict {
  session_date: string;
  time_slot: string;
  existing_tutor_name: string;
  session_status: string;
  enrollment_id: number;
}

/** Potential renewal link for enrollment creation */
export interface PotentialRenewalLink {
  id: number;
  effective_end_date: string;
  lessons_paid: number;
  tutor_name: string;
}

/** Response from enrollment preview endpoint */
export interface EnrollmentPreviewResponse {
  enrollment_data: EnrollmentCreate;
  sessions: SessionPreview[];
  effective_end_date: string;
  conflicts: StudentConflict[];
  warnings: string[];
  skipped_holidays: Array<{ date: string; name: string }>;
  potential_renewals: PotentialRenewalLink[];
}

/** Response from renewal data endpoint */
export interface RenewalDataResponse {
  student_id: number;
  student_name: string;
  school_student_id?: string;
  grade?: string;
  tutor_id: number;
  tutor_name: string;
  assigned_day: string;
  assigned_time: string;
  location: string;
  suggested_first_lesson_date: string;
  previous_lessons_paid: number;
  enrollment_type: string;
  renewed_from_enrollment_id: number;
  previous_effective_end_date: string;
  discount_id?: number;
  discount_name?: string;
}

/** Renewal list item for renewals page */
export interface RenewalListItem {
  id: number;
  student_id: number;
  student_name: string;
  school_student_id?: string;
  grade?: string;
  lang_stream?: string;
  school?: string;
  tutor_id: number;
  tutor_name: string;
  assigned_day: string;
  assigned_time: string;
  location: string;
  first_lesson_date: string;
  lessons_paid: number;
  effective_end_date: string;
  days_until_expiry: number;
  sessions_remaining: number;
  payment_status: string;
  renewal_status: 'not_renewed' | 'pending_message' | 'message_sent' | 'paid';
  renewal_enrollment_id?: number;
  renewal_first_lesson_date?: string;
  renewal_lessons_paid?: number;
  renewal_payment_status?: string;
}

/** Renewal counts response */
export interface RenewalCountsResponse {
  expiring_soon: number;
  expired: number;
  total: number;
}

/** Trial list item for trials page */
export interface TrialListItem {
  enrollment_id: number;
  student_id: number;
  student_name: string;
  school_student_id?: string;
  grade?: string;
  lang_stream?: string;
  school?: string;
  tutor_id: number;
  tutor_name: string;
  session_id: number;
  session_date: string;
  time_slot: string;
  location: string;
  session_status: string;
  payment_status: string;
  trial_status: 'scheduled' | 'attended' | 'no_show' | 'converted' | 'pending';
  subsequent_enrollment_id?: number;
  subsequent_payment_status?: string;
  created_at: string;
}

/** Pending makeup session info */
export interface PendingMakeupSession {
  id: number;
  session_date: string;
  time_slot?: string;
  session_status: string;
  tutor_name?: string;
  has_extension_request: boolean;
  extension_request_status?: string;
  lesson_number?: number | null;
}

/** Detailed enrollment response */
export interface EnrollmentDetailResponse {
  id: number;
  student_id: number;
  student_name: string;
  school_student_id?: string;
  grade?: string;
  lang_stream?: string;
  school?: string;
  home_location?: string;
  tutor_id: number;
  tutor_name: string;
  assigned_day: string;
  assigned_time: string;
  location: string;
  first_lesson_date: string;
  effective_end_date: string;
  days_until_expiry: number;
  lessons_paid: number;
  sessions_finished: number;
  sessions_total: number;
  pending_makeups: PendingMakeupSession[];
  payment_status: string;
  phone?: string;
  contacts?: StudentContact[];
  fee_message_sent: boolean;
  is_new_student?: boolean;
  // One-off materials fee actually charged; 0 when the intake waived it.
  registration_fee?: number | null;
  enrollment_type?: string | null;
  summer_application_id?: number | null;
  payment_date?: string | null;
  payment_deadline?: string | null;
  locked_discount_code?: string | null;
  locked_discount_amount?: number | null;
  discount_override_code?: string | null;
  discount_override_reason?: string | null;
  discount_override_by?: string | null;
  discount_override_at?: string | null;
}

// =============================================================================
// SCHEDULE CHANGE TYPES
// =============================================================================

/** Schedule change request */
export interface ScheduleChangeRequest {
  assigned_day: string;
  assigned_time: string;
  location: string;
  tutor_id: number;
}

/** Session that cannot be changed */
export interface UnchangeableSession {
  session_id: number;
  session_date: string;
  time_slot: string;
  tutor_name: string;
  session_status: string;
  reason: string;
}

/** Session that can be updated */
export interface UpdatableSession {
  session_id: number;
  current_date: string;
  current_time_slot: string;
  current_tutor_name: string;
  new_date: string;
  new_time_slot: string;
  new_tutor_name: string;
  is_holiday: boolean;
  holiday_name?: string;
  shifted_date?: string;
}

/** Schedule change preview response */
export interface ScheduleChangePreviewResponse {
  enrollment_id: number;
  current_schedule: {
    assigned_day: string;
    assigned_time: string;
    location: string;
    tutor_id: number;
    tutor_name: string;
  };
  new_schedule: {
    assigned_day: string;
    assigned_time: string;
    location: string;
    tutor_id: number;
    tutor_name: string;
  };
  unchangeable_sessions: UnchangeableSession[];
  updatable_sessions: UpdatableSession[];
  conflicts: StudentConflict[];
  warnings: string[];
  can_apply: boolean;
}

/** Apply schedule change request */
export interface ApplyScheduleChangeRequest {
  assigned_day: string;
  assigned_time: string;
  location: string;
  tutor_id: number;
  apply_to_sessions: boolean;
  date_overrides?: Record<number, string>;
  time_overrides?: Record<number, string>;
}

/** Schedule change result */
export interface ScheduleChangeResult {
  enrollment_id: number;
  sessions_updated: number;
  new_effective_end_date?: string;
  message: string;
}

// =============================================================================
// SEARCH TYPES
// =============================================================================

/** Search results from global search */
export interface SearchResults {
  students: Array<{
    id: number;
    student_name: string;
    school_student_id: string | null;
    school: string | null;
    grade: string | null;
    phone: string | null;
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
  exams: Array<{
    id: number;
    event_id: string;
    title: string;
    start_date: string | null;
    end_date: string | null;
    school: string | null;
    grade: string | null;
    event_type: string | null;
  }>;
}

// =============================================================================
// PAPERLESS-NGX TYPES
// =============================================================================

/** Paperless document */
export interface PaperlessDocument {
  id: number;
  title: string;
  original_path: string | null;
  converted_path: string | null;
  tags: string[];
  created: string | null;
  correspondent: string | null;
}

/** Paperless search response */
export interface PaperlessSearchResponse {
  results: PaperlessDocument[];
  count: number;
  has_more: boolean;
}

/** Paperless status */
export interface PaperlessStatus {
  configured: boolean;
  reachable: boolean;
  url?: string;
  error?: string;
}

/** Paperless tag */
export interface PaperlessTag {
  id: number;
  name: string;
}

/** Paperless tags response */
export interface PaperlessTagsResponse {
  tags: PaperlessTag[];
}

export type PaperlessSearchMode = "all" | "title" | "content" | "advanced";
export type PaperlessTagMatchMode = "all" | "any";

// =============================================================================
// PATH ALIASES TYPES
// =============================================================================

/** Path alias definition */
export interface PathAliasDefinition {
  id: number;
  alias: string;
  description: string | null;
}

// =============================================================================
// DOCUMENT PROCESSING TYPES
// =============================================================================

export type ProcessingMode = 'conservative' | 'balanced' | 'aggressive';

/** Handwriting removal options */
export interface HandwritingRemovalOptions {
  removeBlue?: boolean;
  removeRed?: boolean;
  removeGreen?: boolean;
  removePencil?: boolean;
  pencilThreshold?: number;
  removeBlackInk?: boolean;
  blackInkMode?: ProcessingMode;
  blackInkStrokeThreshold?: number;
}

/** Handwriting removal response */
export interface HandwritingRemovalResponse {
  pdf_base64: string;
  pages_processed: number;
  success: boolean;
  message: string;
}

/** Document processing status */
export interface DocumentProcessingStatus {
  available: boolean;
  opencv: boolean;
  pymupdf: boolean;
  features: {
    remove_colored_ink: boolean;
    remove_pencil: boolean;
    remove_black_ink: boolean;
    pdf_processing: boolean;
  };
}

// =============================================================================
// PARENT COMMUNICATIONS TYPES
// =============================================================================

/** Parent communication record */
export interface ParentCommunication {
  id: number;
  student_id: number;
  student_name: string;
  school_student_id: string | null;
  grade: string | null;
  lang_stream: string | null;
  school: string | null;
  home_location: string | null;
  tutor_id: number;
  tutor_name: string;
  contact_date: string;
  contact_method: string;
  contact_type: string;
  brief_notes: string | null;
  follow_up_needed: boolean | null;
  follow_up_date: string | null;
  created_at: string;
  created_by: string | null;
}

/** Student contact status */
export interface StudentContactStatus {
  student_id: number;
  student_name: string;
  school_student_id: string | null;
  grade: string | null;
  lang_stream: string | null;
  school: string | null;
  home_location: string | null;
  last_contact_date: string | null;
  last_contacted_by: string | null;
  days_since_contact: number;
  contact_status: 'Never Contacted' | 'Recent' | 'Been a While' | 'Contact Needed';
  pending_follow_up: boolean;
  follow_up_date: string | null;
  follow_up_communication_id: number | null;
  enrollment_count: number;
}

/** Parent communication stats for dashboard */
export interface ParentCommunicationStats {
  total_active_students: number;
  students_contacted_recently: number;
  contact_coverage_percent: number;
  /** Contacts of each type in the last 30 days, keyed by the type. A type with
   *  nothing against it is absent rather than zero. */
  type_counts: Record<string, number>;
  contacts_this_week: number;
  contacts_last_week: number;
  average_days_since_contact: number | null;
  pending_followups_count: number;
}

/** Location settings */
export interface LocationSettings {
  id: number;
  location: string;
  contact_recent_days: number;
  contact_warning_days: number;
}

/** Parent communication create payload */
export interface ParentCommunicationCreate {
  student_id: number;
  contact_method?: string;
  contact_type?: string;
  brief_notes?: string;
  follow_up_needed?: boolean;
  follow_up_date?: string;
  contact_date?: string;
}

// ============================================
// WeCom Types
// ============================================

/** WeCom webhook configuration (URL masked) */
export interface WecomWebhook {
  id: number;
  webhook_name: string;
  target_description: string | null;
  is_active: boolean;
  last_used_at: string | null;
  total_messages_sent: number;
  notes: string | null;
  webhook_url_configured: boolean;
}

/** WeCom webhook admin response (includes full URL) */
export interface WecomWebhookAdmin extends WecomWebhook {
  webhook_url: string;
}

/** WeCom webhook update payload */
export interface WecomWebhookUpdate {
  webhook_url?: string;
  target_description?: string;
  is_active?: boolean;
  notes?: string;
}

/** WeCom send message request */
export interface WecomSendRequest {
  webhook_name: string;
  msg_type: 'text' | 'markdown';
  content: string;
}

/** WeCom send message response */
export interface WecomSendResponse {
  success: boolean;
  message: string;
  log_id: number | null;
  wecom_errcode: number | null;
  wecom_errmsg: string | null;
}

/** WeCom message log entry */
export interface WecomMessageLog {
  id: number;
  webhook_name: string;
  message_type: string | null;
  message_content: string;
  enrollment_id: number | null;
  session_id: number | null;
  send_status: 'pending' | 'sent' | 'failed';
  send_timestamp: string | null;
  error_message: string | null;
  created_at: string;
}

// Tutor Memo types
export interface MemoExercise {
  exercise_type: 'CW' | 'HW';
  pdf_name: string;
  page_start: number | null;
  page_end: number | null;
  remarks: string | null;
  answer_pdf_name: string | null;
  answer_page_start: number | null;
  answer_page_end: number | null;
  answer_remarks: string | null;
}

export interface TutorMemo {
  id: number;
  student_id: number;
  student_name: string;
  school_student_id: string | null;
  grade: string | null;
  school: string | null;
  tutor_id: number;
  tutor_name: string;
  memo_date: string;
  time_slot: string | null;
  location: string | null;
  notes: string | null;
  exercises: MemoExercise[] | null;
  performance_rating: string | null;
  linked_session_id: number | null;
  status: 'pending' | 'linked';
  created_at: string;
  updated_at: string | null;
  created_by: string | null;
}

export interface TutorMemoCreate {
  student_id: number;
  memo_date: string;
  time_slot?: string;
  location?: string;
  notes?: string;
  exercises?: MemoExercise[];
  performance_rating?: string;
}

export interface TutorMemoUpdate {
  student_id?: number;
  memo_date?: string;
  time_slot?: string;
  location?: string;
  notes?: string;
  exercises?: MemoExercise[];
  performance_rating?: string;
}

export interface TutorMemoImportRequest {
  import_notes: boolean;
  import_exercises: boolean;
  import_rating: boolean;
}

// Document Builder types
export type DocType = 'worksheet' | 'lesson_plan';

export interface DocumentMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface DocumentHeaderFooter {
  enabled: boolean;
  left: string;
  center: string;
  right: string;
  imageUrl?: string | null;
  imagePosition?: "left" | "center" | "right" | null;
  fontSize?: number;
  fontFamily?: string | null;
  fontFamilyCjk?: string | null;
}

export interface DocumentWatermark {
  enabled: boolean;
  type: "text" | "image";
  text?: string;
  imageUrl?: string | null;
  imageSize?: number;
  opacity: number;
}

export interface DocumentMetadata {
  margins?: DocumentMargins;
  header?: DocumentHeaderFooter;
  footer?: DocumentHeaderFooter;
  watermark?: DocumentWatermark;
  bodyFontFamily?: string | null;
  bodyFontFamilyCjk?: string | null;
  bodyFontSize?: number | null;
}

export interface Document {
  id: number;
  title: string;
  doc_type: DocType;
  content?: Record<string, unknown> | null;
  page_layout?: DocumentMetadata | null;
  created_by: number;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  updated_by?: number | null;
  updated_by_name?: string;
  is_archived: boolean;
  archived_at?: string | null;
  is_template: boolean;
  is_starred?: boolean;
  locked_by?: number | null;
  locked_by_name?: string | null;
  lock_expires_at?: string | null;
  tags: string[];
  folder_id?: number | null;
  folder_name?: string;
  source_filename?: string | null;
  questions?: ExtractedQuestion[] | null;
  solutions?: Record<string, { text: string; topic?: string; subtopic?: string; difficulty?: string }> | null;
  variants?: Record<string, { text: string; solution_text?: string }> | null;
  parent_id?: number | null;
  parent_title?: string;
  children?: { id: number; title: string }[];
  version_count?: number;
  content_preview?: string;
}

export interface ExtractedQuestion {
  index: number;
  label: string;
  start_node: number;
  end_node: number;
  preview?: string;
  full_text?: string;
  topic?: string | null;
  subtopic?: string | null;
  difficulty?: "easy" | "medium" | "hard" | null;
  marks?: number | null;
  sub_questions?: string[];
}

export interface ProcessQuestionResult {
  index: number;
  label: string;
  solution_nodes?: Record<string, unknown>[] | null;
  variant_nodes?: Record<string, unknown>[] | null;
  variant_solution_nodes?: Record<string, unknown>[] | null;
  solution_text?: string | null;
  variant_text?: string | null;
  variant_solution_text?: string | null;
  topic?: string | null;
  subtopic?: string | null;
  difficulty?: "easy" | "medium" | "hard" | null;
}

export interface ProcessQuestionError {
  index: number;
  label: string;
  error: string;
}

export interface ProcessQuestionsResponse {
  results: ProcessQuestionResult[];
  questions: ExtractedQuestion[];
  usage: { input_tokens: number; output_tokens: number };
  errors?: ProcessQuestionError[];
}

export interface DocumentCreate {
  title: string;
  doc_type: DocType;
  page_layout?: DocumentMetadata;
  content?: Record<string, unknown>;
  tags?: string[];
  folder_id?: number | null;
  is_template?: boolean;
}

export interface DocumentUpdate {
  title?: string;
  content?: Record<string, unknown>;
  page_layout?: DocumentMetadata;
  is_archived?: boolean;
  is_template?: boolean;
  tags?: string[];
  folder_id?: number | null;
}

export interface DocumentFolder {
  id: number;
  name: string;
  parent_id?: number | null;
  created_by: number;
  created_by_name: string;
  created_at: string;
  document_count: number;
}

export interface DocumentVersion {
  id: number;
  document_id: number;
  version_number: number;
  title: string;
  created_by: number;
  created_by_name: string;
  created_at: string;
  version_type: "auto" | "manual" | "session_start";
  label?: string | null;
}

export interface DocumentVersionDetail extends DocumentVersion {
  content?: Record<string, unknown> | null;
  page_layout?: DocumentMetadata | null;
}

// ============================================
// Summer Course Types
// ============================================

export interface SummerBilingualOption {
  name: string;
  name_en: string;
  value?: string;
  admin_only?: boolean;
}

export interface SummerPricingConfig {
  base_fee: number;
  registration_fee?: number;
  discounts?: Array<{
    code: string;
    name_zh: string;
    name_en: string;
    amount: number;
    conditions: {
      before_date?: string;
      min_group_size?: number;
      [key: string]: unknown;
    };
  }>;
  // Base payment-terms line inserted before the bank block in fee messages.
  // Supports {course_start} placeholder (formatted YYYY/MM/DD).
  payment_terms_zh?: string;
  payment_terms_en?: string;
  // Tier-specific warning appended when the applied discount has a
  // `conditions.before_date`. Supports {tier_name} and {deadline}.
  tier_lock_note_zh?: string;
  tier_lock_note_en?: string;
  // Per-lesson rate used for partial-plan apps (lessons_paid < total_lessons).
  // Defaults to 400 on the frontend when absent.
  partial_per_lesson_rate?: number;
  // Receipt-code suggestions shown in the application detail modal. Keys are
  // rule identifiers, values are the code strings copied to receipts.
  receipt_codes?: {
    partial?: string;
    new?: string;
    f1_primary_prospect?: string;
    returning_secondary?: string;
    returning_primary_no_prospect?: string;
  };
  // Non-Summer enrollment window used to decide whether a linked Secondary
  // student has already re-enrolled in CSM this academic year.
  academic_year_start?: string;
  academic_year_end?: string;
}

export interface SummerLocation {
  name: string;
  name_en: string;
  address: string;
  address_en?: string;
  open_days: string[];
  image_url?: string | null;
  time_slots?: Record<string, string[]>;  // day → available time slots
}

export interface SummerCourseFormConfig {
  year: number;
  title: string;
  description?: string | null;
  application_open_date: string;
  application_close_date: string;
  course_start_date: string;
  course_end_date: string;
  total_lessons: number;
  pricing_config: SummerPricingConfig;
  locations: SummerLocation[];
  available_grades: SummerBilingualOption[];
  time_slots: string[];
  existing_student_options?: SummerBilingualOption[] | null;
  center_options?: SummerBilingualOption[] | null;
  lang_stream_options?: SummerBilingualOption[] | null;
  text_content?: Record<string, string> | null;
  course_intro?: SummerCourseIntro | null;
  banner_image_url?: string | null;
  pre_grade_window_start?: string | null;
  pre_grade_window_end?: string | null;
  primary_branch_options?: SummerPrimaryBranchOption[];
}

export interface SummerCourseIntroText {
  zh: string;
  en: string;
}

export interface SummerCourseIntro {
  headline?: SummerCourseIntroText | null;
  pillars?: SummerCourseIntroText[] | null;
  philosophy?: SummerCourseIntroText | null;
}

export interface SummerApplicationCreate {
  student_name: string;
  school?: string | null;
  grade: string;
  lang_stream?: string | null;
  is_existing_student?: string | null;
  current_centers?: string[] | null;
  wechat_id?: string | null;
  contact_phone: string;
  preferred_location?: string | null;
  preference_1_day?: string | null;
  preference_1_time?: string | null;
  preference_2_day?: string | null;
  preference_2_time?: string | null;
  preference_3_day?: string | null;
  preference_3_time?: string | null;
  preference_4_day?: string | null;
  preference_4_time?: string | null;
  unavailability_notes?: string | null;
  buddy_code?: string | null;
  buddy_names?: string | null;
  buddy_referrer_name?: string | null;
  form_language?: string;
  sessions_per_week?: number;
  declared_sibling?: SummerSiblingDeclaration | null;
}

export interface SummerSiblingDeclaration {
  name_en: string;
  name_zh?: string | null;
  source_branch: string;
}

export type SiblingVerificationStatus = "Pending" | "Confirmed" | "Rejected";

export interface SummerSiblingInfo {
  id: number;
  name_en: string;
  name_zh?: string | null;
  source_branch: string;
  verification_status: SiblingVerificationStatus;
  declared_by_application_id?: number | null;
  declared_by_name?: string | null;
  can_remove?: boolean;
  created_at?: string | null;
}

export interface SummerPrimaryBranchOption {
  code: string;
  name_zh: string;
  name_en: string;
}

export interface SummerApplicationSubmitResponse {
  reference_code: string;
  buddy_code?: string | null;
  message: string;
}

export interface SummerApplicationStatusResponse {
  reference_code: string;
  student_name: string;
  application_status: string;
  buddy_code?: string | null;
  buddy_group_member_count?: number | null;
  buddy_siblings?: SummerSiblingInfo[];
  primary_branch_options?: SummerPrimaryBranchOption[];
  submitted_at?: string | null;
  // Editable fields exposed to the status page
  grade?: string | null;
  school?: string | null;
  lang_stream?: string | null;
  wechat_id?: string | null;
  preferred_location?: string | null;
  preference_1_day?: string | null;
  preference_1_time?: string | null;
  preference_2_day?: string | null;
  preference_2_time?: string | null;
  preference_3_day?: string | null;
  preference_3_time?: string | null;
  preference_4_day?: string | null;
  preference_4_time?: string | null;
  unavailability_notes?: string | null;
  sessions_per_week?: number;
}

export interface SummerApplicationEditEntry {
  id: number;
  edited_at: string;
  field_name: string;
  old_value?: string | null;
  new_value?: string | null;
  edited_via: "applicant" | "admin";
  edited_by?: string | null;
}

export interface SummerApplicationEditRequest {
  grade?: string | null;
  school?: string | null;
  lang_stream?: string | null;
  wechat_id?: string | null;
  preferred_location?: string | null;
  preference_1_day?: string | null;
  preference_1_time?: string | null;
  preference_2_day?: string | null;
  preference_2_time?: string | null;
  preference_3_day?: string | null;
  preference_3_time?: string | null;
  preference_4_day?: string | null;
  preference_4_time?: string | null;
  unavailability_notes?: string | null;
  sessions_per_week?: number;
}

export interface SummerCourseConfig {
  id: number;
  year: number;
  title: string;
  description?: string | null;
  application_open_date: string;
  application_close_date: string;
  course_start_date: string;
  course_end_date: string;
  total_lessons: number;
  pricing_config: SummerPricingConfig;
  locations: SummerLocation[];
  available_grades: SummerBilingualOption[];
  time_slots: string[];
  existing_student_options?: SummerBilingualOption[] | null;
  center_options?: SummerBilingualOption[] | null;
  lang_stream_options?: SummerBilingualOption[] | null;
  text_content?: Record<string, string> | null;
  course_intro?: SummerCourseIntro | null;
  banner_image_url?: string | null;
  pre_grade_window_start?: string | null;
  pre_grade_window_end?: string | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

// Note: also see SummerPublishResponse / SummerPublishErrorDetail below for
// the publish bridge surface area.

// ---- Summer Courseware Index ----
// Scanned snapshot of the net-drive courseware tree. Mirrors
// webapp/backend/routers/summer_courseware.py response models.

export interface SummerCoursewareFile {
  id: number;
  grade: string | null;
  course_code: string | null;
  lesson_number: number | null;
  topic_zh: string | null;
  topic_en: string | null;
  doc_type: "CW" | "HW" | "Extra" | null;
  lang: "e" | "c" | null; // null for parallel versions (both languages merged)
  is_parallel: boolean;
  is_answer: boolean;
  is_classified: boolean;
  unclassified_reason: string | null;
  rel_path: string;
  file_name: string;
  file_mtime: string | null;
}

export interface SummerCoursewareScanSummary {
  id: number;
  year: number;
  root_name: string | null;
  path_prefix: string | null;
  total_files: number;
  classified_count: number;
  unclassified_count: number;
  excluded_count: number;
  skipped_grade_count: number;
  scanned_by: string | null;
  scanned_at: string | null;
}

export interface SummerCoursewareIndexResponse {
  year: number;
  scan: SummerCoursewareScanSummary | null;
  files: SummerCoursewareFile[];
  unclassified: SummerCoursewareFile[];
}

export interface SummerApplication {
  id: number;
  config_id: number;
  reference_code: string;
  student_name: string;
  school?: string | null;
  grade: string;
  lang_stream?: string | null;
  is_existing_student?: string | null;
  verified_branch_origin?: string | null;
  current_centers?: string[] | null;
  wechat_id?: string | null;
  contact_phone?: string | null;
  preferred_location?: string | null;
  preference_1_day?: string | null;
  preference_1_time?: string | null;
  preference_2_day?: string | null;
  preference_2_time?: string | null;
  preference_3_day?: string | null;
  preference_3_time?: string | null;
  preference_4_day?: string | null;
  preference_4_time?: string | null;
  unavailability_notes?: string | null;
  buddy_group_id?: number | null;
  buddy_joined_at?: string | null;
  buddy_code?: string | null;
  buddy_names?: string | null;
  buddy_referrer_name?: string | null;
  existing_student_id?: number | null;
  application_status: string;
  admin_notes?: string | null;
  submitted_at?: string | null;
  updated_at?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  form_language?: string | null;
  sessions_per_week?: number;
  lessons_paid: number;
  total_lessons: number;
  placed_count?: number;
  sessions?: SummerApplicationSessionInfo[];
  pending_sibling_count?: number;
  buddy_siblings?: SummerSiblingInfo[];
  buddy_group_member_count?: number;
  linked_student?: LinkedSecondaryStudentInfo | null;
  linked_prospect?: LinkedPrimaryProspectInfo | null;
  claimed_branch_code?: string | null;
  /** Set when the application has been published into a native Summer
   *  enrollment. Drives the Publish/Unpublish button state. */
  published_enrollment_id?: number | null;
  /** Admin tier-override pinned on the published enrollment, surfaced here so
   *  summer-side fee/tier displays honour it instead of recomputing. Null when
   *  no override (or not published). */
  discount_override_code?: string | null;
  /** Flat value of a coupon attached to the published enrollment (its
   *  discount_id), so the fee message subtracts it like a regular enrollment.
   *  Null pre-publish or when no coupon is attached. */
  coupon_discount_value?: number | null;
  /** Stamped when admin marks status Paid; editable for receipt-date fixes.
   *  Drives discount-tier deadline checks. */
  paid_at?: string | null;
}

export interface LinkedSecondaryStudentInfo {
  id: number;
  student_name: string;
  school_student_id?: string | null;
  home_location?: string | null;
  /** The student record's stored grade (pre-promotion), for the same
   *  window-aware badge as the student's own page. */
  grade?: string | null;
  has_current_year_regular_enrollment?: boolean | null;
  /** The student record's language stream (C/E) — the system of record for
   *  placement, so regular surfaces can resolve effective stream client-side. */
  lang_stream?: string | null;
}

export interface LinkedPrimaryProspectInfo {
  id: number;
  student_name: string;
  primary_student_id?: string | null;
  source_branch: string;
}

export interface SummerApplicationSessionInfo {
  id: number;
  slot_id: number;
  slot_day: string;
  time_slot: string;
  location?: string | null;
  grade?: string | null;
  course_type?: string | null;
  tutor_name?: string | null;
  session_status: string;
  lesson_number?: number | null;
  lesson_date?: string | null;
  slot_max_students?: number | null;
  slot_current_count?: number | null;
  // Post-publish only — populated from active session_log row so the modal
  // can overlay live state and render a divergence chip when anything moved.
  session_log_id?: number | null;
  original_lesson_date?: string | null;
  original_session_status?: string | null;
  original_lesson_number?: number | null;
  original_time_slot?: string | null;
  original_location?: string | null;
  original_tutor_name?: string | null;
}

export interface SummerApplicationUpdate {
  application_status?: string;
  admin_notes?: string;
  existing_student_id?: number | null;
  verified_branch_origin?: string | null;
  lang_stream?: string;
  buddy_code?: string;
  buddy_referrer_name?: string;
  allow_buddy_overflow?: boolean;
  // Detail-field admin edits (audited)
  student_name?: string;
  grade?: string;
  school?: string;
  wechat_id?: string;
  preferred_location?: string;
  preference_1_day?: string;
  preference_1_time?: string;
  preference_2_day?: string;
  preference_2_time?: string;
  preference_3_day?: string;
  preference_3_time?: string;
  preference_4_day?: string;
  preference_4_time?: string;
  unavailability_notes?: string;
  sessions_per_week?: number;
  lessons_paid?: number;
  /** Editable for receipt-date corrections. Send null to clear. */
  paid_at?: string | null;
  /** Confirm "record as paid today and drop the discount" after the backend
   *  blocks a post-deadline status→Paid with a 409 early_bird_deadline_passed. */
  acknowledge_discount_loss?: boolean;
}

export interface SummerApplicationStats {
  total: number;
  by_status: Record<string, number>;
  by_grade: Record<string, number>;
  by_location: Record<string, number>;
}

// ---- Summer Slot Types ----

export interface SummerSlotSessionInfo {
  id: number;
  application_id: number;
  student_name: string;
  grade: string;
  session_status: string;
  buddy_group_id?: number | null;
  lesson_number?: number | null;
  session_log_id?: number | null;
  lang_stream?: string | null;
  existing_student_id?: number | null;
  school_student_id?: string | null;
  existing_student_name?: string | null;
  application_status?: string | null;
}

export interface SummerSlot {
  id: number;
  config_id: number;
  slot_day: string;
  time_slot: string;
  location: string;
  grade?: string | null;
  slot_label?: string | null;
  course_type?: string | null;
  tutor_id?: number | null;
  tutor_name?: string | null;
  max_students: number;
  is_adhoc?: boolean;
  adhoc_date?: string | null;
  created_at?: string | null;
  session_count: number;
  sessions: SummerSlotSessionInfo[];
}

export interface SummerSlotCreate {
  config_id: number;
  slot_day: string;
  time_slot: string;
  location: string;
  grade?: string | null;
  slot_label?: string | null;
  course_type?: string | null;
  tutor_id?: number | null;
  max_students?: number;
}

export interface SummerMakeupSlotCreate {
  config_id: number;
  location: string;
  date: string;
  time_slot: string;
  tutor_id: number;
  max_students?: number;
}

export interface SummerMakeupSlotCreateResponse {
  slot: SummerSlot;
  tutor_conflict_note?: string | null;
}

export interface SummerSlotUpdate {
  grade?: string | null;
  slot_label?: string | null;
  course_type?: string | null;
  tutor_id?: number | null;
  max_students?: number;
}

// ---- Summer Session (per-student booking) Types ----

export interface SummerSession {
  id: number;
  application_id: number;
  slot_id: number;
  lesson_id?: number | null;
  lesson_number?: number | null;
  specific_date?: string | null;
  session_status: string;
  placed_at?: string | null;
  placed_by?: string | null;
  student_name?: string | null;
  student_grade?: string | null;
}

export interface SummerSessionCreate {
  application_id: number;
  slot_id: number;
  lesson_id?: number;
  mode?: "all" | "first_half" | "single";
  lesson_number?: number | null;
  force_lesson_duplicate?: boolean;
}

export interface SummerSessionStatusUpdate {
  session_status: string;
}

export interface SummerSessionLessonNumberUpdate {
  lesson_number?: number | null;
  clear_lesson_number?: boolean;
  force_lesson_duplicate?: boolean;
}

// ---- Summer Publish Bridge (Phase 5) ----

export interface SummerPublishResponse {
  application_id: number;
  enrollment_id: number;
  sessions_created: number;
}

export interface SummerUnpublishResponse {
  application_id: number;
  enrollment_id: number;
  sessions_deleted: number;
  application_status: string;
}

export interface SummerPublishBatchRequest {
  application_ids: number[];
}

export interface SummerPublishResult {
  application_id: number;
  success: boolean;
  enrollment_id?: number | null;
  sessions_created?: number | null;
  error_code?: string | null;
  error?: string | null;
}

export interface SummerPublishBatchResponse {
  results: SummerPublishResult[];
  published_count: number;
  failed_count: number;
}

export interface SummerPublishConflictSession {
  session_id: number;
  session_date: string;
  time_slot?: string | null;
  enrollment_id?: number | null;
  enrollment_type?: string | null;
}

// Structured detail returned with 400 errors from publish endpoints. The
// `error_code` lets the UI map to specific tooltip / toast copy.
export interface SummerPublishErrorDetail {
  error_code: string;
  message: string;
  // Optional fields surfaced by individual blocks
  enrollment_id?: number;
  current_status?: string;
  placement_ids?: number[];
  expected?: number;
  actual?: number;
  conflicts?: SummerPublishConflictSession[];
  session_ids?: number[];
}

// ---- Summer Lesson (class meeting) Types ----

export interface SummerLesson {
  id: number;
  slot_id: number;
  session_date: string;
  lesson_number: number | null;
  lesson_status: string;
  notes?: string | null;
  created_at?: string | null;
}

export interface SummerLessonUpdate {
  lesson_number?: number;
  lesson_status?: "Scheduled" | "Attended" | "Cancelled";
  notes?: string;
  clear_lesson_number?: boolean;
}

export interface SummerLessonCalendarEntry {
  lesson_id: number;
  slot_id: number;
  slot_day: string;
  time_slot: string;
  grade?: string | null;
  course_type?: string | null;
  lesson_number: number;
  lesson_status: string;
  tutor_id?: number | null;
  tutor_name?: string | null;
  max_students: number;
  date: string;
  notes?: string | null;
  sessions: SummerSlotSessionInfo[];
  is_adhoc?: boolean;
}

export interface SummerLessonCalendarResponse {
  week_start: string;
  week_end: string;
  lessons: SummerLessonCalendarEntry[];
}

export interface SummerFindSlotResult {
  lesson_id: number;
  slot_id: number;
  date: string;
  time_slot: string;
  tutor_id?: number;
  tutor_name: string | null;
  current_count: number;
  max_students: number;
  lesson_number: number;
  lesson_match: boolean;
}

// ---- Summer Student Lessons Types ----

export interface SummerStudentLessonEntry {
  lesson_number: number;
  placed: boolean;
  session_id?: number | null;
  lesson_id?: number | null;
  lesson_date?: string | null;
  time_slot?: string | null;
  slot_id?: number | null;
  session_status?: string | null;
  duplicates?: SummerStudentLessonEntry[];
}

export interface SummerStudentLessonsRow {
  application_id: number;
  student_name: string;
  grade: string;
  lang_stream?: string | null;
  /** Branch the course is taken at (MSA/MSB), not the origin-branch chip. */
  branch_code?: string | null;
  application_status?: string | null;
  is_existing_student?: string | null;
  claimed_branch_code?: string | null;
  verified_branch_origin?: string | null;
  contact_phone?: string | null;
  linked_student?: LinkedSecondaryStudentInfo | null;
  linked_prospect?: LinkedPrimaryProspectInfo | null;
  sessions_per_week: number;
  lessons_paid: number;
  placed_count: number;
  attended_count: number;
  rescheduled_count: number;
  total_lessons: number;
  lessons: SummerStudentLessonEntry[];
}

export interface SummerStudentLessonsResponse {
  students: SummerStudentLessonsRow[];
}

// ---- Summer Demand Types ----

export interface SummerDemandCell {
  day: string;
  time_slot: string;
  total_first_pref: number;
  total_second_pref: number;
  by_grade_first: Record<string, number>;
  by_grade_second: Record<string, number>;
}

export interface SummerDemandResponse {
  location: string;
  cells: SummerDemandCell[];
}

// ---- Summer Auto-Suggest Types ----

export interface SummerLessonAssignment {
  lesson_id: number;
  slot_id: number;
  lesson_number: number;
  lesson_date: string;
  time_slot: string;
  slot_day: string;
  tutor_name?: string | null;
  student_count?: number;
  max_students?: number;
  is_pending_makeup?: boolean;
}

export interface SummerSuggestionItem {
  application_id: number;
  student_name: string;
  student_grade: string;
  sessions_per_week: number;
  lesson_assignments: SummerLessonAssignment[];
  sequence_score: number;
  match_type: string;
  confidence: number;
  reason: string;
  unavailability_notes: string | null;
  option_label?: string | null;
  preference_1_day?: string | null;
  preference_1_time?: string | null;
  preference_2_day?: string | null;
  preference_2_time?: string | null;
  preference_3_day?: string | null;
  preference_3_time?: string | null;
  preference_4_day?: string | null;
  preference_4_time?: string | null;
  placed_count?: number;
  lessons_paid?: number;
  pending_makeup_count?: number;
}

export interface SummerSuggestRequest {
  config_id: number;
  location: string;
  application_id?: number;
  exclude_dates?: string[];
  include_dates?: string[];
}

export interface SummerSuggestResponse {
  proposals: SummerSuggestionItem[];
  unplaceable: Array<{ application_id: number; student_name: string; reason: string }>;
}

// ---- Tutor Duty Types (shared by both intakes) ----

export interface TutorDuty {
  id: number;
  config_id: number;
  tutor_id: number;
  tutor_name: string;
  location: string;
  duty_day: string;
  time_slot: string;
}

export interface TutorDutyItem {
  tutor_id: number;
  duty_day: string;
  time_slot: string;
}

export interface ActiveTutorOption {
  id: number;
  tutor_name: string;
  default_location: string | null;
}

export interface AvailableTutor {
  id: number;
  name: string;
  onDuty: boolean;
}

// ---- Primary Prospect Types (P6 → Secondary feeder) ----

export type ProspectOutreachStatus =
  | 'Not Started'
  | 'WeChat - Not Found'
  | 'WeChat - Cannot Add'
  | 'WeChat - Added'
  | 'Called'
  | 'No Response';

// Relationship stage only. Applied/enrolled per course are derived on the
// backend (summer_state / regular_state), never stored in status.
export type ProspectStatus = 'New' | 'Contacted' | 'Interested' | 'Declined';

// Derived course journey state; null = never applied to that course.
export type ProspectCourseState = 'applied' | 'enrolled' | 'withdrawn';

// The two course journeys a prospect can be on.
export type ProspectCourse = 'summer' | 'regular';

export type ProspectIntention = 'Yes' | 'No' | 'Considering';

export const PROSPECT_BRANCHES = ['MAC', 'MCP', 'MNT', 'MTA', 'MLT', 'MTR', 'MOT'] as const;
export type ProspectBranch = typeof PROSPECT_BRANCHES[number];

export const SECONDARY_BRANCHES = ['MSA', 'MSB'] as const;

export const OUTREACH_STATUS_HINTS: Record<ProspectOutreachStatus, string> = {
  'Not Started': "Haven't attempted contact yet",
  'WeChat - Not Found': 'Searched but no results. Ask tutor to verify WeChat ID',
  'WeChat - Cannot Add': 'Found but privacy settings block. Ask primary branch to send our WeChat to the parent so they can add us',
  'WeChat - Added': 'Friend request sent',
  'Called': 'Contacted by phone',
  'No Response': 'Tried contacting but no reply',
};

export interface PrimaryProspect {
  id: number;
  year: number;
  source_branch: ProspectBranch;
  primary_student_id: string | null;
  student_name: string;
  school: string | null;
  grade: string | null;
  tutor_name: string | null;
  phone_1: string | null;
  phone_1_relation: string | null;
  phone_2: string | null;
  phone_2_relation: string | null;
  wechat_id: string | null;
  tutor_remark: string | null;
  wants_summer: ProspectIntention | null;
  wants_regular: ProspectIntention | null;
  preferred_branches: string[];
  preferred_time_note: string | null;
  preferred_tutor_note: string | null;
  sibling_info: string | null;
  outreach_status: ProspectOutreachStatus;
  contact_notes: string | null;
  status: ProspectStatus;
  summer_application_id: number | null;
  regular_application_id: number | null;
  submitted_at: string | null;
  updated_at: string | null;
  edit_history: Array<{ timestamp: string; field: string; old_value: string | null; new_value: string | null }>;
  matched_application_ref: string | null;
  matched_application_status: string | null;
  matched_regular_ref: string | null;
  matched_regular_status: string | null;
  /** Who the applicant became once a course enrolled: the student's id and
   *  MSA/MSB code, set only while the matching state is 'enrolled'. */
  matched_student_id: number | null;
  matched_student_code: string | null;
  matched_regular_student_id: number | null;
  matched_regular_student_code: string | null;
  summer_state: ProspectCourseState | null;
  regular_state: ProspectCourseState | null;
}

export interface PrimaryProspectBulkItem {
  primary_student_id?: string;
  student_name: string;
  school?: string;
  grade?: string;
  tutor_name?: string;
  phone_1?: string;
  phone_1_relation?: string;
  phone_2?: string;
  phone_2_relation?: string;
  wechat_id?: string;
  tutor_remark?: string;
  wants_summer?: ProspectIntention;
  wants_regular?: ProspectIntention;
  preferred_branches?: string[];
  preferred_time_note?: string;
  preferred_tutor_note?: string;
  sibling_info?: string;
}

export interface PrimaryProspectBulkCreate {
  year: number;
  source_branch: string;
  prospects: PrimaryProspectBulkItem[];
}

export interface PrimaryProspectStats {
  branch: string;
  total: number;
  wants_summer_yes: number;
  wants_summer_considering: number;
  wants_regular_yes: number;
  wants_regular_considering: number;
  // Exclusive funnel states: applied = live application, no enrollment yet.
  applied_summer: number;
  enrolled_summer: number;
  applied_regular: number;
  enrolled_regular: number;
  outreach_not_started: number;
  outreach_wechat_added: number;
  outreach_wechat_not_found: number;
  outreach_wechat_cannot_add: number;
  outreach_called: number;
  outreach_no_response: number;
}

export interface PrimaryProspectMatchResult {
  prospect_id: number;
  matches: Array<{
    application_id: number;
    reference_code: string;
    student_name: string;
    contact_phone: string;
    application_status: string;
    match_type: string;
    similarity?: number | null;
  }>;
}

export interface AutoMatchProspectSummary {
  id: number;
  student_name: string;
  phone_1: string | null;
  phone_2: string | null;
  source_branch: string;
  grade: string | null;
}

export interface AutoMatchAppSummary {
  id: number;
  student_name: string;
  reference_code: string | null;
  contact_phone: string | null;
  preferred_location: string | null;
  grade: string | null;
}

export type AutoMatchSkipReason =
  | "multiple_prospects_share_phone"
  | "multiple_apps_share_phone"
  | "grade_mismatch"
  | "name_similarity";

export interface AutoMatchEntry {
  prospect: AutoMatchProspectSummary;
  application: AutoMatchAppSummary;
}

export interface AutoMatchSkipEntry {
  prospect: AutoMatchProspectSummary;
  reason: AutoMatchSkipReason;
  conflicting_prospects: AutoMatchProspectSummary[];
  // For the "name_similarity" reason, each app has an extra `similarity`
  // (0-100) field so the UI can show how close the name match is.
  conflicting_apps: (AutoMatchAppSummary & { similarity?: number })[];
}

export interface AutoMatchResult {
  total_unlinked: number;
  matches: AutoMatchEntry[];
  skipped: AutoMatchSkipEntry[];
}

// ---- Secondary student link suggestions ----

export interface StudentSuggestionCandidate {
  id: number;
  student_name: string;
  school_student_id?: string | null;
  school?: string | null;
  grade?: string | null;
  home_location?: string | null;
  lang_stream?: string | null;
  match_reason: string;
}

export interface StudentLinkAppSummary {
  id: number;
  student_name: string;
  reference_code: string | null;
  contact_phone: string | null;
  preferred_location: string | null;
  grade: string | null;
  claimed_branch_code: string | null;
}

export interface StudentLinkMatch {
  application: StudentLinkAppSummary;
  student: StudentSuggestionCandidate;
}

export interface StudentLinkSkipEntry {
  application: StudentLinkAppSummary;
  reason: "ambiguous_candidates";
  candidates: StudentSuggestionCandidate[];
}

export interface StudentLinkSuggestResult {
  total_unlinked: number;
  matches: StudentLinkMatch[];
  skipped: StudentLinkSkipEntry[];
}

export interface SummerMarketingSnapshotCell {
  total: number;
  pending: number;
  converted: number;
}

export interface SummerMarketingSnapshotResponse {
  as_of_date: string;
  config_id: number | null;
  spreadsheet_id: string | null;
  tab_name: string | null;
  action: "appended" | "updated" | "skipped";
  row_index: number | null;
  reason: string | null;
  cells: Record<string, Record<string, SummerMarketingSnapshotCell>>;
}

export interface RevenueTierBreakdown {
  code: string;
  name: string;
  discount_amount: number;
  fee_per_student: number;
  paid_count: number;
  paid_amount: number;
  fee_sent_count: number;
  fee_sent_amount: number;
}

export interface RevenuePipelineEntry {
  status: string;
  students: number;
  amount: number;
}

export interface RevenueTermFeeEntry {
  status: string;
  enrollments: number;
  amount: number;
}

export interface RegularRevenueSummary {
  jul_sessions: number;
  aug_sessions: number;
  jul_revenue: number;
  aug_revenue: number;
  enrollments_jul: number;
  enrollments_aug: number;
  term_fees: RevenueTermFeeEntry[];
}

export interface BranchRevenueSummary {
  receivable_students: number;
  receivable_amount: number;
  collected_students: number;
  collected_amount: number;
  outstanding_students: number;
  outstanding_amount: number;
  collection_rate_amount: number;
  collection_rate_students: number;
  tiers: RevenueTierBreakdown[];
  pipeline: RevenuePipelineEntry[];
  pipeline_potential_amount: number;
  regular: RegularRevenueSummary;
  outlook_confirmed: number;
  outlook_with_potential: number;
}

export interface BranchRevenueReportResponse {
  as_of: string;
  config_id: number;
  year: number;
  spreadsheet_id: string | null;
  branches: Record<string, BranchRevenueSummary>;
}

export interface RevenueSheetRefreshResponse {
  as_of: string;
  config_id: number;
  spreadsheet_id: string;
  sheet_name: string | null;
  modified_time: string | null;
}

// Student Progress Analytics Types
// ============================================

export interface AttendanceSummary {
  attended: number;
  no_show: number;
  rescheduled: number;
  recent_rate?: number | null;
  previous_rate?: number | null;
  total_past_sessions: number;
  attendance_rate: number;
}

export interface RatingMonth {
  month: string;
  avg_rating: number;
  count: number;
}

export interface RatingSummary {
  overall_avg: number;
  total_rated: number;
  monthly_trend: RatingMonth[];
  recent_avg?: number | null;
}

export interface ExerciseDetail {
  session_date: string;
  exercise_type: string;
  pdf_name?: string;
  url?: string;
  url_title?: string;
  page_start?: number;
  page_end?: number;
}

export interface ExerciseSummary {
  total: number;
  classwork: number;
  homework: number;
  details?: ExerciseDetail[];
}

export interface EnrollmentTimelineItem {
  id: number;
  tutor_name: string | null;
  enrollment_type: string | null;
  payment_status: string;
  first_lesson_date: string | null;
  location: string | null;
  assigned_day: string | null;
  assigned_time: string | null;
  lessons_paid: number | null;
}

export interface ContactSummary {
  total_contacts: number;
  last_contact_date: string | null;
  by_method: Record<string, number>;
  by_type: Record<string, number>;
}

export interface MonthlyActivity {
  month: string;
  sessions_attended: number;
  exercises_assigned: number;
}

export interface TestEvent {
  title: string;
  start_date: string;
  end_date?: string;
  event_type?: string;
  description?: string;
}

export interface TopicCount {
  topic: string;
  count: number;
}

export interface ConceptNode {
  label: string;
  count: number;
  category?: string;
}

export interface ProgressInsights {
  top_topics: TopicCount[];
  total_exercises: number;
  cw_count: number;
  hw_count: number;
  narrative: string;
  concept_nodes?: ConceptNode[];
  ai_error?: boolean;
}

export interface RadarAxis {
  label: string;
  score: number;
}

export interface RadarChartConfig {
  axes: RadarAxis[];
  display_mode: "numerical" | "labeled";
}

export interface StudentProgress {
  student_id: number;
  attendance: AttendanceSummary;
  ratings: RatingSummary;
  exercises: ExerciseSummary;
  enrollment_timeline: EnrollmentTimelineItem[];
  contacts: ContactSummary;
  monthly_activity: MonthlyActivity[];
  test_events?: TestEvent[];
  insights?: ProgressInsights;
}

export interface SavedReportSummary {
  id: number;
  student_id: number;
  label: string | null;
  created_by: number;
  creator_name: string | null;
  created_at: string;
  mode: string | null;
  date_range_label: string | null;
}

export interface SavedReportDetail {
  id: number;
  student_id: number;
  report_data: Record<string, unknown>;
  label: string | null;
  created_by: number;
  creator_name: string | null;
  created_at: string;
}

// Buddy Tracker (Primary Branches)
// ============================================

export interface BuddyGroupMemberInfo {
  id: number;
  name: string;
  student_id: string | null;
  phone: string | null;
  branch: string;
  source: 'primary' | 'secondary';
  is_sibling: boolean;
}

export interface BuddyMember {
  id: number;
  buddy_group_id: number;
  student_id: string;
  student_name_en: string;
  student_name_zh: string | null;
  parent_phone: string | null;
  source_branch: string;
  is_sibling: boolean;
  year: number;
  created_at: string;
  updated_at: string | null;
  buddy_code: string;
  group_size: number;
  group_members: BuddyGroupMemberInfo[];
}

export interface BuddyMemberCreate {
  student_id: string;
  student_name_en: string;
  student_name_zh?: string | null;
  parent_phone?: string | null;
  source_branch: string;
  year: number;
  buddy_code?: string | null;
  is_sibling?: boolean;
}

export interface BuddyMemberUpdate {
  student_id?: string;
  student_name_en?: string;
  student_name_zh?: string | null;
  parent_phone?: string | null;
}

export interface BuddyGroupLookup {
  buddy_code: string;
  year: number | null;
  members: BuddyGroupMemberInfo[];
  total_size: number;
}

// ─── ARK Leave Integration ───

export interface ArkLeaveType {
  id: number;
  name_en: string;
  name_zh: string;
}

export interface ArkLeaveBalance {
  id: number;
  leave_type: ArkLeaveType;
  entitlement_days: number;
  carry_over_days: number;
  used_days: number;
  adjusted_days: number;
  year: number;
}

export interface ArkLeaveRequest {
  id: number;
  staff_id: number;
  staff_name: string | null;
  leave_type: ArkLeaveType;
  start_date: string;
  end_date: string;
  days_requested: number;
  is_half_day: boolean;
  half_day_period: string | null;
  reason: string | null;
  status: string;
  reviewer_name: string | null;
  created_at: string;
}

export interface ArkCalendarEntry {
  id: number;
  staff_id: number;
  staff_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  is_half_day: boolean;
  half_day_period: string | null;
}

export interface ArkCreateLeaveRequest {
  leave_type_id: number;
  start_date: string;
  end_date: string;
  start_time?: string | null;
  end_time?: string | null;
  days_requested: number;
  reason?: string | null;
}

export interface ArkOvertimeRecord {
  id: number;
  staff_name?: string | null;
  date: string;
  hours: number;
  description?: string | null;
  compensation_type: string;
  approver_name?: string | null;
  created_at?: string | null;
}

export interface ArkCreateOvertime {
  date: string;
  hours: number;
  description?: string | null;
}

export interface ArkHolidayEntry {
  id: number;
  holiday_date: string;
  name: string;
  name_zh?: string | null;
  holiday_type: string;
  fiscal_year: number;
  notes?: string | null;
}

export interface ArkStaffRDO {
  id: number;
  staff_id: number;
  day_of_week: number;
  effective_from: string;
  effective_until?: string | null;
}

export interface ArkStaffLeaveSummary {
  staff_id: number;
  staff_name: string;
  staff_name_zh?: string | null;
  branch_id?: number | null;
  branch_code?: string | null;
  branch_name?: string | null;
  profile_photo_url?: string | null;
  al_entitlement: number;
  al_oc: number;
  al_bday: number;
  al_used: number;
  al_remaining: number;
  sl_entitlement: number;
  sl_used: number;
  sl_remaining: number;
}

// ============================================
// Waitlist Types
// ============================================

export interface WaitlistSlotPreference {
  id: number;
  location: string;
  day_of_week?: string | null;
  time_slot?: string | null;
  preferred_tutor_id?: number | null;
  preferred_tutor_name?: string | null;
}

export interface WaitlistSlotPreferenceCreate {
  location: string;
  day_of_week?: string | null;
  time_slot?: string | null;
  preferred_tutor_id?: number | null;
}

export interface EnrollmentContextInfo {
  label: string;
  enrollment_id?: number | null;
  current_day?: string | null;
  current_time?: string | null;
  current_location?: string | null;
  current_tutor?: string | null;
}

export interface WaitlistEntry {
  id: number;
  student_name: string;
  school: string;
  grade: string;
  lang_stream?: string | null;
  phone: string;
  parent_name?: string | null;
  notes?: string | null;
  is_active: boolean;
  entry_type: "New" | "Slot Change";
  student_id?: number | null;
  school_student_id?: string | null;
  created_by: number;
  created_by_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  slot_preferences: WaitlistSlotPreference[];
  enrollment_context?: EnrollmentContextInfo | null;
}

export interface WaitlistEntryCreate {
  student_name: string;
  school: string;
  grade: string;
  lang_stream?: string | null;
  phone: string;
  parent_name?: string | null;
  notes?: string | null;
  entry_type?: "New" | "Slot Change";
  student_id?: number | null;
  slot_preferences?: WaitlistSlotPreferenceCreate[];
}

export interface WaitlistEntryBulkItem {
  student_name: string;
  school: string;
  grade: string;
  phone: string;
  lang_stream?: string | null;
  parent_name?: string | null;
}

export interface WaitlistEntryUpdate {
  student_name?: string;
  school?: string;
  grade?: string;
  lang_stream?: string | null;
  phone?: string;
  parent_name?: string | null;
  notes?: string | null;
  is_active?: boolean;
  entry_type?: "New" | "Slot Change";
  student_id?: number | null;
  slot_preferences?: WaitlistSlotPreferenceCreate[];
}

// ============================================
// Regular Course (September intake) Types
// ============================================
// Stripped-down mirrors of the summer types: no buddy/sibling, no pricing or
// discount tiers, single weekly slot (preference 1 = first choice, 2 = backup).
// Mirror webapp/backend/schemas.py's Regular* section.

export type RegularBilingualOption = SummerBilingualOption;
export type RegularLocation = SummerLocation;
export type RegularCourseIntro = SummerCourseIntro;

/**
 * A seasonal offer on the regular intake. At most one runs at a time, so this
 * is a single object rather than summer's array of competing tiers.
 *
 * Only `tuition_amount` is money moving through an enrollment — it names an
 * ordinary discounts row via `discount_id`, so publishing and revenue price it
 * through the usual path. `total_value` is the headline figure quoted to
 * parents, which also counts the waived materials fee and so is larger.
 */
export interface RegularPromo {
  /** Code staff put on the receipt, e.g. 26BTSSA. */
  code: string;
  name_zh: string;
  name_en: string;
  /** Shorter form for the fee message, where the surrounding text has already
   *  named the centre and the course. Falls back to the full name. */
  short_name_zh?: string;
  short_name_en?: string;
  /** Headline value advertised to parents. Prose, not arithmetic. */
  total_value: number;
  /** Dollars off tuition — the part backed by a discounts row. */
  tuition_amount: number;
  waives_registration_fee?: boolean;
  /** First day the offer may be shown. The form opens before the campaign
   *  launches, so the API withholds the whole promo until this date. */
  from_date?: string | null;
  until_date?: string | null;
  /** Bullet list shown on the form. Includes non-monetary perks such as a
   *  gift, which never affect the fee. */
  items?: { name_zh: string; name_en: string }[];
  /** Internal discounts row id. Stripped from the public config. */
  discount_id?: number | null;
}

export interface RegularPricingConfig {
  base_fee: number;
  lessons_per_block: number;
  /** The standard one-off materials fee. Still quoted by an offer that claims
   *  to waive it, even on an intake that collects it from nobody. */
  registration_fee?: number | null;
  /** False when this intake does not collect the materials fee from anyone,
   *  whatever their history. Absent means charged, so only an intake that
   *  opts out behaves differently. */
  registration_fee_charged?: boolean;
  /** Present on the public config only while the offer is running — the API
   *  removes it outside the window, so its presence is the signal to show it. */
  promo?: RegularPromo | null;
}

export interface RegularCourseFormConfig {
  year: number;
  title: string;
  description?: string | null;
  application_open_date: string;
  application_close_date: string;
  /** Resolved server-side in Hong Kong time so the form never depends on the
   *  visitor's device clock. The form is only offered while this is "open". */
  application_window: "before" | "open" | "closed";
  course_start_date: string;
  locations: RegularLocation[];
  available_grades: RegularBilingualOption[];
  time_slots: string[];
  existing_student_options?: RegularBilingualOption[] | null;
  center_options?: RegularBilingualOption[] | null;
  lang_stream_options?: RegularBilingualOption[] | null;
  text_content?: Record<string, string> | null;
  course_intro?: RegularCourseIntro | null;
  pricing_config?: RegularPricingConfig | null;
  banner_image_url?: string | null;
}

export interface RegularApplicationCreate {
  student_name: string;
  school?: string | null;
  grade: string;
  lang_stream?: string | null;
  is_existing_student?: string | null;
  current_centers?: string[] | null;
  wechat_id?: string | null;
  contact_phone: string;
  preferred_location?: string | null;
  preference_1_day?: string | null;
  preference_1_time?: string | null;
  preference_2_day?: string | null;
  preference_2_time?: string | null;
  form_language?: string;
}

export interface RegularApplicationSubmitResponse {
  reference_code: string;
  message: string;
}

export interface RegularApplicationStatusResponse {
  reference_code: string;
  student_name: string;
  application_status: string;
  submitted_at?: string | null;
  // Editable fields exposed to the status page
  grade?: string | null;
  school?: string | null;
  lang_stream?: string | null;
  wechat_id?: string | null;
  preferred_location?: string | null;
  preference_1_day?: string | null;
  preference_1_time?: string | null;
  preference_2_day?: string | null;
  preference_2_time?: string | null;
}

export interface RegularApplicationEditRequest {
  grade?: string | null;
  school?: string | null;
  lang_stream?: string | null;
  wechat_id?: string | null;
  preferred_location?: string | null;
  preference_1_day?: string | null;
  preference_1_time?: string | null;
  preference_2_day?: string | null;
  preference_2_time?: string | null;
}

export interface RegularApplicationEditEntry {
  id: number;
  edited_at: string;
  field_name: string;
  old_value?: string | null;
  new_value?: string | null;
  edited_via: "applicant" | "admin";
  edited_by?: string | null;
}

export interface RegularCourseConfig {
  id: number;
  year: number;
  title: string;
  description?: string | null;
  application_open_date: string;
  application_close_date: string;
  course_start_date: string;
  locations: RegularLocation[];
  available_grades: RegularBilingualOption[];
  time_slots: string[];
  existing_student_options?: RegularBilingualOption[] | null;
  center_options?: RegularBilingualOption[] | null;
  lang_stream_options?: RegularBilingualOption[] | null;
  text_content?: Record<string, string> | null;
  course_intro?: RegularCourseIntro | null;
  pricing_config?: RegularPricingConfig | null;
  banner_image_url?: string | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface RegularApplication {
  id: number;
  config_id: number;
  reference_code: string;
  student_name: string;
  school?: string | null;
  grade: string;
  lang_stream?: string | null;
  is_existing_student?: string | null;
  current_centers?: string[] | null;
  /** The centre the applicant claims, resolved to a branch code (MAC, MSB,
   *  ...). Null when they claim none, or when the stored name is unrecognised. */
  claimed_branch_code?: string | null;
  /** Admin-verified origin: a branch code, or "New" for a student with no
   *  MathConcept history. The form only asks which centre they attend *now*,
   *  so seasonal new-student offers key off this instead. */
  verified_branch_origin?: string | null;
  wechat_id?: string | null;
  contact_phone?: string | null;
  preferred_location?: string | null;
  preference_1_day?: string | null;
  preference_1_time?: string | null;
  preference_2_day?: string | null;
  preference_2_time?: string | null;
  existing_student_id?: number | null;
  application_status: string;
  admin_notes?: string | null;
  submitted_at?: string | null;
  updated_at?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  form_language?: string | null;
  linked_student?: LinkedSecondaryStudentInfo | null;
  /** Set when the application has been published into a native Regular
   *  enrollment. Drives the Publish/Unpublish button state. */
  published_enrollment_id?: number | null;
  /** Arrangement slot this application is assigned to, if any. */
  assigned_slot_id?: number | null;
  /** The assigned slot itself, inlined by the API so the card and the detail
   *  modal can show the placement without loading every slot in the config. */
  assigned_slot?: RegularAssignedSlot | null;
  /** Whether the one-off materials fee still applies, decided by the same
   *  rule the fee message and publishing use. */
  is_new_student?: boolean;
  /** P6 prospect journey, when a prospect links to this application. Null when
   *  the applicant was never a tracked prospect. */
  prospect_journey?: RegularProspectJourney | null;
  /** True when a seasonal offer is running AND this applicant is verified as
   *  new. False while unverified, which is what prompts staff to check. */
  promo_eligible?: boolean;
  /** Code of the offer they qualify for. Null when not eligible. */
  promo_code?: string | null;
}

/** P6 prospect journey attached to a linked regular application. */
export interface RegularProspectJourney {
  prospect_id: number;
  source_branch?: string | null;
  /** Their id at the primary branch as submitted ("MCP1112"). Render it
   *  through formatProspectCode. */
  primary_student_id?: string | null;
  /** True when the prospect's summer application published an enrollment and
   *  was not withdrawn. Splits the "MAC -> regular" and "MAC -> summer ->
   *  regular" chip copy. */
  attended_summer: boolean;
}

/** One ranked prospect candidate for a regular application (reverse match). */
export interface RegularProspectSuggestion {
  prospect_id: number;
  student_name: string;
  source_branch: string;
  grade?: string | null;
  phone_1?: string | null;
  match_type: "student" | "phone" | "name" | "phone+name";
  similarity?: number | null;
  already_linked: boolean;
}

export interface RegularProspectSuggestResponse {
  application_id: number;
  suggestions: RegularProspectSuggestion[];
}

/** One branch's slice of the prospect -> regular conversion funnel. */
export interface RegularConversionBranchRow {
  branch: string;
  prospects: number;
  wants_summer_yes: number;
  wants_regular_yes: number;
  attended_summer: number;
  applied_regular: number;
  enrolled_regular: number;
}

export interface RegularConversionTutorRow {
  branch: string;
  tutor_name: string;
  prospects: number;
  applied_regular: number;
  enrolled_regular: number;
}

export interface RegularConversionIntentionRow {
  intention: string;
  prospects: number;
  applied_regular: number;
  enrolled_regular: number;
  attended_summer: number;
}

export interface RegularConversionSchoolRow {
  school: string;
  prospects: number;
  applied_regular: number;
  enrolled_regular: number;
}

export interface RegularConversionMovementRow {
  wanted_branch: string;
  enrolled_branch: string;
  count: number;
}

export interface RegularConversionLostRow {
  prospect_id: number;
  student_name: string;
  source_branch: string;
  primary_student_id: string | null;
  grade: string | null;
  school: string | null;
  phone_1: string | null;
  phone_2: string | null;
  wechat_id: string | null;
  wants_regular: string | null;
  /** Ordered MSA/MSB choices from the prospect form; empty when the parent
   *  named no branch. */
  preferred_branches: string[];
  outreach_status: string | null;
  attended_summer: boolean;
  /** The enrolled summer student's MSA/MSB code, set only while
   *  attended_summer holds. */
  summer_student_code: string | null;
}

export interface RegularConversionResponse {
  year: number;
  branches: RegularConversionBranchRow[];
  totals: RegularConversionBranchRow;
  by_grade_stream_applied: Record<string, number>;
  by_grade_stream_enrolled: Record<string, number>;
  by_tutor: RegularConversionTutorRow[];
  by_regular_intention: RegularConversionIntentionRow[];
  by_summer_intention: RegularConversionIntentionRow[];
  by_school: RegularConversionSchoolRow[];
  branch_movement: RegularConversionMovementRow[];
  lost_prospects: RegularConversionLostRow[];
}

/** Where a cohort member came from. Conversion answers "did new blood
 *  arrive"; retention answers "did the people we already had stay". */
export type RetentionSource = "regular_and_summer" | "regular_only" | "summer_only";

/** What happened to them this intake. Everything before "no_response" is a
 *  resolved outcome; only no_response earns a place on the chase list. */
export type RetentionState =
  | "enrolled"
  | "applied"
  | "declined"
  | "not_churn"
  | "no_response";

/** Whether the grade they are entering is one the form actually offers.
 *  `admin_only` rungs exist but are hidden from parents, so those families
 *  cannot self-serve however hard they are chased. */
export type RetentionRung = "open" | "admin_only" | "none";

export interface RegularRetentionRow {
  /** Branch code, entering grade, source tag, tutor id or decline reason,
   *  depending on which list the row came from. */
  key: string;
  /** What to show instead of `key` when the key is an identifier. Tutors are
   *  keyed by id so two tutors sharing a name stay two rows. */
  label?: string | null;
  /** The denominator. Holds declines: a family who said no is a retention
   *  failure, not an exclusion. */
  cohort: number;
  applied: number;
  enrolled: number;
  declined: number;
  /** A parent contact was logged inside the application window. Independent of
   *  state — a contacted family can still be sitting at no_response. */
  contacted: number;
  no_response: number;
  /** Of the unresponsive, how many have already been contacted. */
  no_response_contacted: number;
}

/** One student to chase.
 *
 *  The optional fields really are absent, not null: the report is about 800 of
 *  these and most of them have nothing to say about a call nobody has made, so
 *  the endpoint leaves empty keys out of the JSON entirely. Read them with `??`
 *  or a falsy check and the two cases behave the same. */
export interface RegularRetentionChaseRow {
  student_id: number;
  student_name: string;
  student_code?: string | null;
  branch?: string | null;
  /** The grade on the student record: last school year's, until the Sept 1
   *  promotion job runs. */
  grade?: string | null;
  /** The grade they are entering, which is what an application carries. Equal
   *  to `grade` only after promotion. */
  expected_grade?: string | null;
  rung: RetentionRung;
  lang_stream?: string | null;
  school?: string | null;
  phone?: string | null;
  tutor_name?: string | null;
  source: RetentionSource;
  /** Where a student who came up from a primary branch this summer came from.
   *  The same block the applications page reads, so one chip renders it in
   *  both places. Absent for everyone else. */
  prospect_journey?: RegularProspectJourney | null;
  state: RetentionState;
  reference_code?: string | null;
  /** Where the application has got to on the ladder the parent also sees on
   *  the status page: Submitted, Placement Offered, Fee Sent and so on. Only
   *  set for a student who has one. */
  application_status?: string | null;
  last_contact_date?: string | null;
  /** What was said on that call, clipped to a couple of lines. */
  last_contact_note?: string | null;
  days_since_contact?: number | null;
  follow_up_needed: boolean;
  follow_up_date?: string | null;
  /** The category only. The free-text reason lives on the termination record
   *  and reads in full on the student's own page. */
  decline_reason_category?: string | null;
}

/** One student who applied without being in this year's group. Named rather
 *  than counted because each is a different situation: a family who lapsed and
 *  came back, a primary student the conversion board owns, an enrollment that
 *  ended early. A number cannot tell those apart. */
export interface RegularRetentionOutsideRow {
  student_id: number;
  student_name: string;
  student_code?: string | null;
  branch?: string | null;
  grade?: string | null;
  applied_grade?: string | null;
  reference_code?: string | null;
}

export interface RegularRetentionReconciliation {
  unlinked_count: number;
  unlinked_secondary: number;
  unlinked_primary: number;
  /** Applications linked to a student who is not in this year's group: they
   *  lapsed earlier, or never had a qualifying enrollment. */
  applied_outside_cohort: number;
  applied_outside: RegularRetentionOutsideRow[];
}

/** One day of the intake window: what happened that day, and the running total
 *  to the end of it. Derived from the dates the events already carry, so the
 *  series is complete from the first day the board is opened and its last point
 *  always equals the headline figures. Every point measures against the cohort
 *  as it stands today, so a moving line means the chasing moved. */
export interface RegularRetentionTrendPoint {
  date: string;
  applied: number;
  declined: number;
  contacted: number;
  applied_total: number;
  declined_total: number;
  contacted_total: number;
}

export interface RegularRetentionResponse {
  year: number;
  window_start?: string | null;
  active_from?: string | null;
  /** The reporting quarter a decline is written into. The application window
   *  falls inside a single quarter, which is what lets a decline ride on
   *  termination records instead of needing its own store. */
  intake_year: number;
  intake_quarter: number;
  totals: RegularRetentionRow;
  by_branch: RegularRetentionRow[];
  by_expected_grade: RegularRetentionRow[];
  by_source: RegularRetentionRow[];
  by_tutor: RegularRetentionRow[];
  by_decline_reason: RegularRetentionRow[];
  /** Students whose entering grade the config has no place for. Reported apart
   *  and never counted as unresponsive. */
  no_rung: RegularRetentionRow;
  /** Students who left for a reason that was never a retention failure: moved
   *  to another branch, finished school. Out of the denominator, still
   *  reported, because "where did they go" is the first question asked of a
   *  cohort that shrank. */
  not_churn: RegularRetentionRow;
  /** The whole cohort, unresponsive first. The chase list is the no_response
   *  subset; the rest is returned so the page can filter without a second call. */
  chase: RegularRetentionChaseRow[];
  reconciliation: RegularRetentionReconciliation;
  /** One point per day of the window so far, counting only the students in
   *  `totals` — the same filters, so the chart and the headline agree. */
  trend: RegularRetentionTrendPoint[];
}

/** One tutor's own students. Deliberately narrower than the admin report: no
 *  branch rows, no tutor comparison, no reconciliation. `totals` counts only
 *  this tutor's students — a worklist size, not a measure of the centre. */
export interface RegularRetentionMineResponse {
  year: number;
  intake_year: number;
  intake_quarter: number;
  totals: RegularRetentionRow;
  students: RegularRetentionChaseRow[];
}

/** One applicant placed in a tutor's September slot. An application rather
 *  than a student record: about a third of them are families the centre has
 *  never taught, so the name on the form is the only name there is. */
export interface RegularMyClassStudent {
  application_id: number;
  student_name: string;
  grade?: string | null;
  lang_stream?: string | null;
  school?: string | null;
  application_status: string;
  /** Set when the application is matched to a student we already have. */
  student_id?: number | null;
  student_code?: string | null;
  /** This tutor taught them last school year, so the class list can say which
   *  faces are already familiar. */
  taught_by_me_last_year: boolean;
}

/** One weekly slot a tutor is down to teach, and who is in it. */
export interface RegularMyClassSlot {
  slot_id: number;
  slot_day: string;
  time_slot: string;
  location: string;
  grade?: string | null;
  lang_stream?: string | null;
  max_students: number;
  students: RegularMyClassStudent[];
}

/** A tutor's own September classes, as far as arrangement has got. Empty for
 *  most tutors until the office assigns tutors to slots. */
export interface RegularMyClassResponse {
  year: number;
  slots: RegularMyClassSlot[];
}

/** A weekly slot's own fields, with no assignment state. Inlined on the
 *  application (regular's counterpart to a summer application's `sessions`
 *  array) and the base of `RegularSlot`, so the two cannot drift. */
export interface RegularAssignedSlot {
  id: number;
  slot_day: string;
  time_slot: string;
  location: string;
  grade?: string | null;
  /** Language stream (C/E); unset = any. Pairs with grade to render F1C. */
  lang_stream?: string | null;
  tutor_id?: number | null;
  tutor_name?: string | null;
  max_students: number;
}

export interface RegularApplicationUpdate {
  application_status?: string;
  admin_notes?: string;
  existing_student_id?: number | null;
  lang_stream?: string;
  /** Null clears it back to unverified. Omit to let the backend auto-fill it
   *  from a student or prospect link. */
  verified_branch_origin?: string | null;
  // Detail-field admin edits (audited)
  student_name?: string;
  grade?: string;
  school?: string;
  wechat_id?: string;
  preferred_location?: string;
  preference_1_day?: string;
  preference_1_time?: string;
  preference_2_day?: string;
  preference_2_time?: string;
}

export interface RegularApplicationStats {
  total: number;
  by_status: Record<string, number>;
  by_grade: Record<string, number>;
  by_location: Record<string, number>;
}

export interface RegularDemandCell {
  day: string;
  time_slot: string;
  total_first_pref: number;
  total_second_pref: number;
  /** Keyed by grade + effective stream (F1C, F1E, ...); bare grade (F1) when
   *  no stream resolves. Separates the Chinese and English streams in the grid. */
  by_grade_stream_first: Record<string, number>;
  by_grade_stream_second: Record<string, number>;
}

export interface RegularDemandResponse {
  location: string;
  cells: RegularDemandCell[];
}

export interface RegularPublishRequest {
  /** Weekday, full or short form (backend normalizes to "Tue" etc.).
   *  Omit schedule fields to resolve them from the assigned slot. */
  confirmed_day?: string | null;
  confirmed_time?: string | null;
  /** Branch display name or MSA/MSB code (backend normalizes). */
  location?: string | null;
  tutor_id?: number | null;
  /** Defaults to 6, the standard regular enrollment block. */
  lessons_paid?: number;
  /** Omit to auto-compute: first occurrence of confirmed_day on/after the
   *  config's course_start_date. */
  first_lesson_date?: string | null;
  /** Omit to derive from the application status (Paid/Enrolled → Paid). */
  payment_status?: "Pending Payment" | "Paid" | null;
  /** Discount applied to the enrollment (e.g. an auto-suggested coupon). */
  discount_id?: number | null;
}

/** Ready-to-send parent messages for one application, both languages. */
export interface RegularApplicationMessages {
  application_id: number;
  schedule_zh: string;
  schedule_en: string;
  fee_zh: string;
  fee_en: string;
  /** "slot" when taken from the assigned slot, "preference" when it fell
   *  back to the applicant's first choice. */
  schedule_source: "slot" | "preference";
  assigned_day: string;
  assigned_time: string;
  location: string;
  lessons_paid: number;
  first_lesson_date: string;
  total_fee: number;
  discount_value: number;
  is_new_student: boolean;
  has_student_link: boolean;
  /** Offer quoted in the message, when the applicant is verified new and it is
   *  running. Null otherwise. */
  promo_code?: string | null;
  promo_name_en?: string | null;
  /** True when that offer also waives the one-off materials fee, which is why
   *  the total can be lower than base − discount + fee. */
  promo_waives_registration_fee?: boolean;
}

export interface RegularSlotCreate {
  config_id: number;
  slot_day: string;
  time_slot: string;
  location: string;
  grade?: string | null;
  lang_stream?: string | null;
  tutor_id?: number | null;
  max_students?: number;
}

export interface RegularSlotUpdate {
  slot_day?: string;
  time_slot?: string;
  location?: string;
  grade?: string | null;
  lang_stream?: string | null;
  tutor_id?: number | null;
  max_students?: number;
}

export interface RegularSlotStudentInfo {
  application_id: number;
  student_name: string;
  grade: string;
  lang_stream?: string | null;
  school?: string | null;
  application_status: string;
  published: boolean;
  /** From the linked student record, when the application has one. */
  school_student_id?: string | null;
}

export interface RegularSlot extends RegularAssignedSlot {
  config_id: number;
  assigned_count: number;
  students: RegularSlotStudentInfo[];
}

export interface RegularPublishResult {
  application_id: number;
  success: boolean;
  enrollment_id?: number | null;
  sessions_created?: number | null;
  error_code?: string | null;
  error?: string | null;
}

export interface RegularPublishBatchResponse {
  results: RegularPublishResult[];
  published_count: number;
  failed_count: number;
}

export interface RegularSuggestion {
  slot_id: number;
  slot_day: string;
  time_slot: string;
  location: string;
  grade?: string | null;
  lang_stream?: string | null;
  tutor_name?: string | null;
  assigned_count: number;
  max_students: number;
  score: number;
  /** Machine reasons: pref_1_match | pref_2_match | same_grade |
   *  stream_match | schoolmates:{n} */
  reasons: string[];
}

export interface RegularSuggestResponse {
  application_id: number;
  suggestions: RegularSuggestion[];
}

export interface RegularPublishResponse {
  application_id: number;
  enrollment_id: number;
  sessions_created: number;
  first_lesson_date: string;
  skipped_holidays: Array<{ date: string; name: string }>;
}

export interface RegularUnpublishResponse {
  application_id: number;
  enrollment_id: number;
  sessions_deleted: number;
  application_status: string;
}

export interface RegularPublishErrorDetail {
  error_code: string;
  message: string;
  enrollment_id?: number;
  current_status?: string;
  conflicts?: Array<{
    session_date: string;
    time_slot?: string | null;
    existing_tutor_name?: string | null;
    session_status?: string | null;
    enrollment_id?: number | null;
  }>;
}
