import type { BillingDraftReview, BillingPreviewRequest, StudentBillingContext } from '@/types/billing';

export interface BillingRenewalSource {
  scenario: BillingPreviewRequest;
  enrollmentIds: number[];
  tutorNames: (string | null | undefined)[];
  tutorIds?: number[];
  selectedTutorIds?: number[];
  reason?: string;
}

/** Match each new class to its existing enrollment without assuming ID order. */
export function renewalSourceFor(context: StudentBillingContext | null | undefined, review?: BillingDraftReview | null): BillingRenewalSource | undefined {
  const original = context?.suggested_request;
  if (!context || !original || (review?.student && review.student.id !== context.student.id)) return undefined;
  const key = (slot: { weekday?: string | null; time_slot?: string | null; location?: string | null }) =>
    [slot.weekday?.slice(0, 3), slot.time_slot?.trim(), slot.location?.trim()].join('|');
  const selected = context.selected_enrollment_ids;
  const candidates = context.slot_candidates.filter(candidate => selected.includes(candidate.enrollment_id));
  const enrollmentIds = review?.renewal?.source_enrollment_ids ?? original.slots.map(slot => {
    const matches = candidates.filter(candidate => key(candidate) === key(slot));
    return matches.length === 1 ? matches[0].enrollment_id : 0;
  });
  if (enrollmentIds.length !== original.slots.length || enrollmentIds.length !== selected.length ||
    new Set(enrollmentIds).size !== enrollmentIds.length ||
    enrollmentIds.some(id => !Number.isSafeInteger(id) || id <= 0 || !selected.includes(id))) return undefined;
  const sources = enrollmentIds.map(id => candidates.find(candidate => candidate.enrollment_id === id));
  if (sources.some(source => !source)) return undefined;
  const slots = sources.map(source => {
    const matches = original.slots.filter(slot => key(slot) === key(source!));
    return matches.length === 1 ? matches[0] : undefined;
  });
  if (slots.some(slot => !slot)) return undefined;
  return {
    scenario: { ...original, slots: slots.map(slot => ({ ...slot!, ...(slot!.holiday_exceptions ? { holiday_exceptions: [...slot!.holiday_exceptions] } : {}) })) },
    enrollmentIds: [...enrollmentIds],
    tutorNames: sources.map(source => source!.tutor_name),
    tutorIds: enrollmentIds.map(id => context.source_blocks?.find(block => block.enrollment_id === id)?.tutor_id ?? 0),
    selectedTutorIds: review?.renewal?.tutor_ids ? [...review.renewal.tutor_ids] : undefined,
    reason: review?.renewal?.reason,
  };
}
