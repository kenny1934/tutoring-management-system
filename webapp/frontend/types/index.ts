// Tutor types
export type TutorRole = 'Tutor' | 'Admin' | 'Super Admin';

export interface Tutor {
  id: number;
  user_email?: string;
  tutor_name: string;
  default_location?: string;
  role: TutorRole;
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

/**
 * Student creation payload - fields for creating a new student
 * Used in: studentsAPI.create()
 */
export interface StudentCreate {
  student_name: string;
  school_student_id?: string;
  grade?: string;
  phone?: string;
  school?: string;
  lang_stream?: string;
  home_location?: string;
  academic_stream?: string;
}

/**
 * Student response - full student record from API
 * Used in: API responses, component props
 */
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
  is_staff_referral?: boolean;
  staff_referral_notes?: string;
  enrollment_count?: number;
  enrollments?: Enrollment[];
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
  school?: string;
  days_overdue: number;
  urgency_level: 'Critical' | 'High' | 'Medium' | 'Low';
}

export interface UncheckedAttendanceCount {
  total: number;
  critical: number;  // Sessions >7 days overdue
}

// Message types
export type MessagePriority = 'Normal' | 'High' | 'Urgent';
export type MessageCategory = 'Reminder' | 'Question' | 'Announcement' | 'Schedule' | 'Chat' | 'Courseware' | 'MakeupConfirmation';

export interface ReadReceiptDetail {
  tutor_id: number;
  tutor_name: string;
  read_at: string;
}

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
  image_attachments?: string[];  // List of image URLs
  // Read receipt fields for sender's messages (WhatsApp-style seen status)
  read_receipts?: ReadReceiptDetail[];  // Only populated for sender's own messages
  total_recipients?: number;  // Total recipients for broadcasts
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
  to_tutor_id?: number;  // NULL = broadcast
  reply_to_id?: number;
  subject?: string;
  message: string;
  priority?: MessagePriority;
  category?: MessageCategory;
  image_attachments?: string[];  // List of uploaded image URLs
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
export interface BatchUpdateResponse {
  updated: number[];
  count: number;
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
  fee_message_sent: boolean;
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
  enrollment_count: number;
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
