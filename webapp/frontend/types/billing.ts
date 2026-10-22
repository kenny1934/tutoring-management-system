export type BillingWeekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
export type BillingMethod = 'manual' | 'autopay';
export type BillingMode = 'new_student' | 'transition' | 'regular';

export interface BillingSlot {
  weekday: BillingWeekday;
  time_slot?: string;
  location?: string;
  covered_through?: string | null;
  holiday_exceptions?: string[];
}

export interface BillingPreviewRequest {
  first_lesson_date: string;
  slots: BillingSlot[];
  mode: BillingMode;
  payment_method: BillingMethod;
  materials_fee: number | null;
  trial_deduction: boolean;
  mandate_ready: boolean;
  adjustment?: { through: string; reason: string } | null;
  coupon?: {
    kind: 'ordinary' | 'staff';
    value: number;
    verified: boolean;
    expires_on: string | null;
    available_count: number | null;
    combine_next_month: boolean;
  } | null;
}

export interface BillingOptions {
  coupon_storage_available?: boolean;
  coupon_writes_available?: boolean;
  queue_available?: boolean;
  draft_storage_available?: boolean;
  workflow_available?: boolean;
  workflow_writes_available?: boolean;
  preferences_writes_available?: boolean;
  autopay_first_collection_month?: string;
  autopay_last_collection_month?: string;
  academic_start: string;
  first_payment_from: string;
  regular_end: string;
  makeup_end: string;
  unit_fee: number;
  first_minimum: number;
  ordinary_coupon_minimum: number;
  policy_version: string;
}

export interface BillingDraftReviewRequest {
  intake?: BillingIntakeRequest | null;
  confirmed_checks?: BillingConfirmableCheck[];
  scenario: BillingPreviewRequest;
  basis: BillingContextBasis;
  selected_enrollment_ids: number[];
  expected_source_fingerprint: string;
  period_number: number;
}

export interface BillingDraftReview {
  intake?: BillingIntakeRequest | null;
  confirmed_checks: BillingConfirmableCheck[];
  student: BillingStudent;
  source_fingerprint: string;
  evidence_hash: string;
  calendar_hash: string;
  policy_version: string;
  scenario: BillingPreviewRequest;
  basis: BillingContextBasis;
  selected_enrollment_ids: number[];
  period: BillingPeriod;
  issues: BillingPreviewResponse['issues'];
  message: { template_version: string; zh: string | null; en: string | null; blocked_reasons: string[] };
  review_hash: string;
}

export type BillingConfirmableCheck = 'UNPAID_PAST_DATES' | 'CONTINUING_SLOTS_REVIEW' | 'CONTINUATION_UNCONFIRMED' | 'HOLIDAY_OPENING_ASSUMED';

export interface BillingDraftSaveRequest {
  review: BillingDraftReviewRequest;
  expected_review_hash: string;
  idempotency_key: string;
  note?: string;
}

export interface BillingDraftSummary {
  state?: 'active' | 'discarded';
  confirmed_payment_id?: string | null;
  id: string;
  student_id: number;
  current_revision: number;
  period_number: number;
  lesson_count: number;
  total_fee: number | null;
  payment_method: BillingMethod;
  coverage_from: string;
  coverage_through: string;
  created_at: string;
  updated_at: string;
}

export interface BillingDraftDetail {
  state?: 'active' | 'discarded';
  confirmed_payment_id?: string | null;
  id: string;
  student_id: number;
  current_revision: number;
  revision: number;
  review: BillingDraftReview;
  note: string | null;
  created_at: string;
  created_by_name: string;
  stale_reasons: string[];
  can_copy: boolean;
  history: { revision: number; note: string | null; created_at: string; created_by_name: string; action?: 'saved' | 'discarded' }[];
}

export interface BillingPeriod {
  number: number;
  kind: string;
  explanation: string;
  coverage_from: string;
  coverage_through: string;
  first_lesson_date: string;
  last_lesson_date: string;
  lesson_count: number;
  counts_by_month: { month: string; lessons: number }[];
  counts_by_slot: number[];
  lessons: { date: string; slot: number; weekday: BillingWeekday; time_slot: string; location: string; holiday_exception: boolean }[];
  gross_tuition: number;
  deductions: { kind: 'trial' | 'ordinary' | 'staff'; amount: number }[];
  tuition_after_deductions: number;
  materials_fee: number | null;
  total_fee: number | null;
  collection: {
    method: BillingMethod;
    notice_from: string | null;
    notice_to: string | null;
    debit_from: string | null;
    debit_to: string | null;
    due_before_lesson: string | null;
    gap_min_days: number | null;
    gap_max_days: number | null;
  };
  adjustment_reason: string | null;
  requires_review: boolean;
}

export interface BillingGapLesson {
  session_id: number;
  enrollment_id: number;
  date: string;
  status: string;
  payment_status: string;
  time_slot: string | null;
  location: string | null;
}

export interface BillingGapEvidence {
  date: string;
  weekday: BillingWeekday;
  time_slot: string;
  location: string;
  selected: boolean;
  enrollment_id: number;
  kind: 'within_enrollment' | 'between_enrollments' | 'recorded_unpaid' | 'recorded_cancelled' | 'timetable_difference';
  before: BillingGapLesson | null;
  after: BillingGapLesson | null;
  matching_lessons: BillingGapLesson[];
  nearby_lessons: BillingGapLesson[];
}

export interface BillingPreviewResponse {
  policy_version: string;
  regular_end_date: string;
  makeup_end_date: string;
  payment_method: BillingMethod;
  monthly: boolean;
  periods: BillingPeriod[];
  skipped_collections: { month: string; covered_by_period: number; reason: string }[];
  excluded_holidays: string[];
  issues: { code: string; message: string; period: number | null; gap_evidence?: BillingGapEvidence[] }[];
  requires_review: boolean;
  is_preview: boolean;
  creates_records: boolean;
}

export type BillingContextBasis = 'paid_only' | 'include_pending';
export interface BillingStudent {
  id: number;
  student_name: string;
  school_student_id: string | null;
  home_location: string | null;
  grade: string | null;
  is_staff_referral: boolean;
  lang_stream?: string | null;
  school?: string | null;
}
export interface BillingIntakeSlot {
  tutor_id: number;
  renewed_from_enrollment_id?: number | null;
}

export interface BillingIntakeRequest {
  trial_enrollment_id?: number | null;
  trial_session_id?: number | null;
  slots: BillingIntakeSlot[];
  materials_override_reason?: string | null;
}

export interface BillingIntakeContext {
  student: BillingStudent;
  source_fingerprint: string;
  trial: null | {
    enrollment_id: number;
    session_id: number;
    session_date: string;
    time_slot: string;
    location: string;
    tutor_id: number;
    tutor_name: string;
    session_status: string;
  };
  is_new_student: boolean;
  materials_fee: number | null;
  materials_basis: string;
  suggested_request: BillingPreviewRequest | null;
  issues: BillingPreviewResponse['issues'];
  recorded_payment_method: BillingMethod | null;
  mandate_ready: boolean | null;
  coupon_snapshot: StudentBillingContext['coupon_snapshot'];
}
export interface BillingSourceBlock {
  enrollment_id: number;
  tutor_id: number;
  tutor_name: string;
  weekday: string | null;
  time_slot: string | null;
  location: string | null;
  first_lesson_date: string | null;
  lessons_recorded: number | null;
  payment_status: string;
  payment_date: string | null;
  fee_message_marked_sent: boolean;
  renewed_from_enrollment_id: number | null;
  is_new_student: boolean;
  originals: { id: number; date: string; status: string; holiday: boolean; time_slot?: string | null; location?: string | null }[];
  last_original_date: string | null;
  makeup_dates: string[];
}
export interface BillingSlotCandidate {
  enrollment_id: number;
  weekday: string | null;
  time_slot: string | null;
  location: string | null;
  tutor_name: string;
  selected: boolean;
  last_paid_original_date: string | null;
  last_retained_original_date: string | null;
  first_uncovered_date: string | null;
}
export interface StudentBillingContext {
  student: BillingStudent;
  as_of: string;
  basis: BillingContextBasis;
  source_blocks: BillingSourceBlock[];
  slot_candidates: BillingSlotCandidate[];
  selected_enrollment_ids: number[];
  upcoming_original_count: number;
  pending_bill_count: number;
  sent_pending_bill_count: number;
  pending_makeup_count: number;
  coupon_snapshot: {
    accounting?: BillingCouponBalance;
    remaining_count: number;
    cached_value: string | null;
    synced_at_utc: string | null;
    verified: boolean;
  } | null;
  suggested_request: BillingPreviewRequest | null;
  issues: BillingPreviewResponse['issues'];
  requires_review: boolean;
  source_fingerprint: string;
  recorded_payment_method: BillingMethod | null;
  mandate_ready: boolean | null;
}
export interface BillingRosterPeriod {
  lesson_count: number;
  gross_tuition: number;
  coverage_through: string;
  first_lesson_date: string;
  collection: BillingPeriod['collection'];
}
export interface BillingRosterRow {
  student: BillingStudent;
  upcoming_original_count: number;
  pending_bill_count: number;
  sent_pending_bill_count: number;
  pending_makeup_count: number;
  slot_candidate_count: number;
  selected_slot_count: number;
  last_paid_original_date: string | null;
  first_uncovered_date: string | null;
  next_manual: BillingRosterPeriod | null;
  next_autopay: BillingRosterPeriod | null;
  issues: BillingPreviewResponse['issues'];
  requires_review: boolean;
  source_fingerprint: string;
  source_issues?: BillingPreviewResponse['issues'];
  method_issues?: Partial<Record<BillingMethod, BillingPreviewResponse['issues']>>;
}
export interface BillingRosterResponse {
  as_of: string;
  basis: BillingContextBasis;
  total: number;
  offset: number;
  limit: number;
  rows: BillingRosterRow[];
}

export type BillingQueueStage = 'prepare' | 'send' | 'awaiting_payment' | 'attention' | 'no_payment';
export type BillingQueueUrgency = 'now' | 'week' | 'check_dates' | 'later';

export interface BillingQueueStageCounts {
  prepare: number;
  send: number;
  awaiting_payment: number;
  attention: number;
  no_payment: number;
  total: number;
  actionable: number;
  overdue: number;
}

export interface BillingQueueCounts extends BillingQueueStageCounts {
  as_of: string;
  collection_month: string;
}

export interface BillingQueueEnrollment {
  enrollment_id: number;
  tutor_id: number;
  tutor_name: string;
  weekday: string | null;
  time_slot: string | null;
  location: string | null;
  first_lesson_date: string | null;
  effective_end_date: string | null;
  last_original_date: string | null;
  last_paid_original_date: string | null;
  payment_status: string;
  lesson_count: number | null;
  sessions_remaining: number;
  fee_message_marked_sent: boolean;
}

export interface BillingQueueRow {
  key: string;
  student: BillingStudent;
  stage: BillingQueueStage;
  origin: 'projection' | 'draft' | 'payment' | 'legacy';
  payment_method: BillingMethod | null;
  recorded_payment_method?: BillingMethod | null;
  mandate_ready?: boolean | null;
  collection: BillingPeriod['collection'] | null;
  first_lesson_date: string | null;
  coverage_through: string | null;
  lesson_count: number | null;
  total_fee: number | null;
  amount_basis: 'reviewed' | 'tuition_only' | 'unknown';
  prepare_on: string | null;
  due_date: string | null;
  overdue: boolean;
  ready_now: boolean;
  urgency?: BillingQueueUrgency;
  action_kind?: 'notice' | 'renewal' | 'payment' | null;
  action_from?: string | null;
  action_by?: string | null;
  draft_id: string | null;
  payment_id: string | null;
  enrollment_ids: number[];
  payment_ids: string[];
  current_enrollments?: BillingQueueEnrollment[];
  issues: BillingPreviewResponse['issues'];
  note: string;
  action_url: string;
}

export interface BillingQueueResponse {
  as_of: string;
  collection_month: string;
  counts: BillingQueueStageCounts;
  urgency_counts?: Record<BillingQueueUrgency, number>;
  total: number;
  offset: number;
  limit: number;
  rows: BillingQueueRow[];
}

export interface BillingPreferences {
  student_id: number;
  payment_method: BillingMethod | null;
  mandate_ready: boolean;
  version: number;
  updated_at: string | null;
}

export interface BillingPaymentDetail {
  id: string;
  student_id: number;
  version: number;
  status: 'Pending Payment' | 'Paid' | 'Cancelled';
  review: BillingDraftReview;
  lines: { enrollment_id: number; slot_index: number; tutor_id: number; tutor_name: string; lesson_count: number; gross_tuition: number; discount_amount: number; tuition_amount: number; materials_fee: number }[];
  created_at: string;
  sent_at: string | null;
  sent_language: 'zh' | 'en' | null;
  paid_at: string | null;
  payment_date: string | null;
  received_method: BillingReceiptMethod | null;
  receipt_reference: string | null;
  coupon_status: 'none' | 'reserved' | 'awaiting_receipt' | 'recorded_in_kms';
  note: string | null;
  can_copy: boolean;
  review_issues: string[];
  history: { kind: string; actor_name: string; created_at: string }[];
}

export type BillingReceiptMethod = 'cash' | 'bank_transfer' | 'autopay';

export interface BillingReceiptTask {
  payment_id: string;
  student: BillingStudent;
  first_lesson_date: string | null;
  last_lesson_date: string | null;
  lesson_count: number | null;
  total_amount: number | null;
  received_amount: number | null;
  payment_date: string | null;
  received_method: BillingReceiptMethod | null;
  coupon_value: number | null;
  coupon_status: BillingPaymentDetail['coupon_status'];
  receipt_reference: string | null;
  needs_checking: boolean;
  issues: BillingPreviewResponse['issues'];
}
export interface BillingReceiptCount {
  count: number;
  storage_available: boolean;
  writes_available: boolean;
}
export interface BillingReceiptTasks extends Omit<BillingReceiptCount, 'count'> {
  as_of: string;
  total: number;
  offset: number;
  limit: number;
  rows: BillingReceiptTask[];
}

export interface BillingCouponGroup {
  key: string;
  kind: 'ordinary' | 'staff';
  value: number;
  expires_on: string;
  quantity: number;
  usable_count: number | null;
}
export interface BillingCouponBalance {
  student_id: number;
  storage_available: boolean;
  writes_available: boolean;
  version: number;
  observation: { id: string; remaining_count: number; observed_on: string; processed_at: string; source_filename: string; source_sha256?: string } | null;
  reserved_count: number;
  receipt_pending_count: number;
  used_awaiting_sync_count: number;
  usable_count: number | null;
  groups: BillingCouponGroup[];
  checked_at: string | null;
  checked_by: string | null;
  issues: { code: string; message: string }[];
  uses: { payment_date?: string | null; received_amount?: number | null; first_lesson_date?: string | null; last_lesson_date?: string | null; lesson_count?: number | null; id: string; payment_id: string | null; legacy_enrollment_id?: number | null; value: number; expires_on: string | null; state: 'reserved' | 'awaiting_receipt' | 'receipt_recorded' | 'released'; accounted_in_observation: boolean; receipt_reference: string | null }[];
  can_verify: boolean;
  legacy_display?: { remaining_count: number; cached_value: string | null; synced_at: string | null } | null;
}
export interface BillingCouponVerification {
  expected_version: number;
  observation_id: string;
  checked_at: string;
  groups: Omit<BillingCouponGroup, 'key' | 'usable_count'>[];
  reconciliations: { use_id: string; included_in_observation: boolean }[];
  reason: string;
}
export interface BillingCouponReview {
  student_id: number;
  expected_version: number;
  review_hash: string;
  balance: BillingCouponBalance;
  can_confirm: boolean;
  issues: { code: string; message: string }[];
}
export interface BillingCouponImport {
  id: string;
  branch: BillingBankBranch;
  observed_on: string;
  filename: string;
  source_sha256: string;
  review_hash: string;
  changed_count: number;
  unchanged_count: number;
  unmatched_count: number;
  invalid_count: number;
  rows: { row_number: number; company_id: string; student: BillingStudent | null; remaining_count: number | null; previous_count: number | null; status: 'changed' | 'unchanged' | 'unmatched' | 'invalid'; coupon_check_required?: boolean | null; issues: { code: string; message: string }[] }[];
  issues: { code: string; message: string }[];
  can_confirm: boolean;
  applied: boolean;
}

export interface BillingRecordPaymentRequest {
  acknowledge_duplicate_receipt?: boolean;
  coupon_selected?: boolean;
  coupon_used_on?: string;
  payment_date: string;
  amount: number;
  method: BillingReceiptMethod;
  receipt_reference?: string | null;
  note?: string | null;
  expected_version: number;
  idempotency_key: string;
}

export type BillingAutopayStage = 'ready' | 'attention' | 'prepare' | 'skipped';

export interface BillingAutopayRow {
  bank_run?: {
    id: string;
    branch: BillingBankBranch;
    collection_month: string;
    follow_up: 'prepared' | 'awaiting_results' | 'rejected' | 'review' | 'record_payment' | 'recorded';
    import_id?: string | null;
    reason: string;
  } | null;
  key: string;
  student: BillingStudent;
  stage: BillingAutopayStage;
  origin: 'payment' | 'draft' | 'projection';
  payment_id?: string | null;
  payment_version?: number | null;
  payment_status?: string | null;
  draft_id?: string | null;
  collection?: BillingPeriod['collection'] | null;
  coverage_from?: string | null;
  coverage_through?: string | null;
  lesson_count?: number | null;
  total_fee?: number | null;
  amount_basis: 'confirmed' | 'estimate' | 'unknown';
  recorded_payment_method?: BillingMethod | null;
  mandate_ready?: boolean | null;
  sent_at?: string | null;
  reasons: { code: string; label: string }[];
  enrollment_ids: number[];
  action_url: string;
}

export interface BillingAutopayResponse {
  as_of: string;
  collection_month: string;
  confirmed_storage_available: boolean;
  preparation_available: boolean;
  notice_from: string;
  notice_to: string;
  debit_from: string;
  debit_to: string;
  counts: Record<BillingAutopayStage, number>;
  ready_total: number;
  total: number;
  offset: number;
  limit: number;
  rows: BillingAutopayRow[];
}

export type BillingBankBranch = 'MSA' | 'MSB';
export interface BillingAutopayExportScope {
  collection_month: string;
  branch: BillingBankBranch;
}

export interface BillingAutopayExportPreview extends BillingAutopayExportScope {
  excluded_claimed_count?: number;
  payment_count: number;
  total_amount: string | null;
  content_hash: string;
  filename: string;
  rows: { payment_id: string; payment_version: number; student: BillingStudent; contract_no: string; amount: string | null }[];
  issues: { code: string; message: string; student_id?: number | null }[];
  can_download: boolean;
}

export interface BillingAutopayBankFile {
  blob: Blob;
  filename: string;
  total_amount: string;
  payment_count: number;
  content_hash: string;
}

export type BillingBankRunStatus = 'prepared' | 'submitted' | 'processed' | 'needs_attention' | 'discarded';
export interface BillingBankRunSummary extends BillingAutopayExportScope {
  id: string;
  version: number;
  status: BillingBankRunStatus;
  filename: string;
  payment_count: number;
  total_amount: string;
  content_hash: string;
  created_at: string;
  created_by_name: string;
  submitted_at?: string | null;
  submitted_by_name?: string | null;
  bank_batch_no?: string | null;
  discarded_at?: string | null;
  discard_reason?: string | null;
  latest_import_id?: string | null;
}
export interface BillingBankRunList {
  storage_available: boolean;
  writes_available: boolean;
  runs: BillingBankRunSummary[];
}
export interface BillingBankRunDetail extends BillingBankRunSummary {
  export_preview: BillingAutopayExportPreview;
  issues: BillingAutopayExportPreview['issues'];
  can_submit: boolean;
  can_discard: boolean;
  can_download: boolean;
  can_import_results: boolean;
  latest_import: BillingBankResultReview | null;
  history: { kind: string; actor_name: string; created_at: string }[];
}
export interface BillingBankResultRow {
  contract_no: string;
  amount: string | null;
  raw_status: string;
  reject_code: string;
  outcome: 'collected' | 'rejected' | 'unknown' | 'conflict';
  reason: string;
  student: BillingStudent | null;
  payment_id: string | null;
  payment_version: number | null;
  record_status: 'ready' | 'recorded' | 'review' | 'unpaid';
}
export interface BillingBankResultReview {
  id: string;
  run_id: string;
  run_version: number;
  source_format: string;
  bank_batch_no: string;
  debit_date: string | null;
  currency: string;
  report_hash: string;
  review_hash: string;
  payment_count: number;
  total_amount: string | null;
  success_count: number;
  successful_amount: string | null;
  failed_count: number;
  failed_amount: string | null;
  ready_count: number;
  ready_amount: string;
  recorded_count: number;
  recorded_amount: string;
  review_count: number;
  issues: BillingAutopayExportPreview['issues'];
  rows: BillingBankResultRow[];
  can_confirm: boolean;
}
