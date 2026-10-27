export type ParticipationStatus = 'Active' | 'Paused' | 'Left';
export interface ParticipationChange {
  status: ParticipationStatus;
  effective_on: string;
  reason: string;
  return_enrollment_id: number | null;
}
export interface ParticipationDetail {
  student_id: number;
  enabled: boolean;
  can_manage: boolean;
  policy_active: boolean;
  academic_start: string;
  status: ParticipationStatus;
  effective_on: string | null;
  scheduled_status?: ParticipationStatus | null;
  scheduled_effective_on?: string | null;
  version: number;
  paid_through: string | null;
  history: (ParticipationChange & { id: string; version: number; released_session_ids: number[]; actor_name: string; created_at: string })[];
  return_candidates: { enrollment_id: number; payment_id: string | null; coverage_from: string; coverage_through: string; paid_on: string | null }[];
}
export interface ParticipationPreview {
  student_id: number;
  academic_start: string;
  version: number;
  change: ParticipationChange;
  review_hash: string;
  affected_bookings: { session_id: number; source_session_id: number; root_session_id: number; session_date: string; time_slot: string | null; location: string | null; tutor_id: number; tutor_name: string; exam_revision_slot_id: number | null; action: 'release_to_pending' }[];
  warnings: string[];
  can_confirm: boolean;
  blocked_reasons: string[];
}
