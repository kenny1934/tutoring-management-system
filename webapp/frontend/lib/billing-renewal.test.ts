import { describe, expect, it } from 'vitest';
import type { BillingDraftReview, StudentBillingContext } from '@/types/billing';
import { renewalSourceFor } from './billing-renewal';

function source(): StudentBillingContext {
  return {
    student: { id: 12 }, selected_enrollment_ids: [101, 102],
    source_blocks: [{ enrollment_id: 101, tutor_id: 11 }, { enrollment_id: 102, tutor_id: 22 }],
    slot_candidates: [
      { enrollment_id: 101, weekday: 'Tue', time_slot: '16:45 - 18:15', location: 'MSA', tutor_name: 'Tutor A' },
      { enrollment_id: 102, weekday: 'Thu', time_slot: '16:45 - 18:15', location: 'MSB', tutor_name: 'Tutor B' },
    ],
    suggested_request: { first_lesson_date: '2026-11-10', slots: [
      { weekday: 'Thu', time_slot: '16:45 - 18:15', location: 'MSB', covered_through: '2026-11-05' },
      { weekday: 'Tue', time_slot: '16:45 - 18:15', location: 'MSA', covered_through: '2026-11-03', holiday_exceptions: ['2026-12-22'] },
    ] },
  } as StudentBillingContext;
}
function review(ids = [101, 102]): BillingDraftReview {
  return { student: { id: 12 }, renewal: { source_enrollment_ids: ids, reason: 'New timetable' } } as BillingDraftReview;
}

describe('renewalSourceFor', () => {
  it('matches baseline slots to source IDs and tutors independently of selection order', () => {
    const result = renewalSourceFor(source());
    expect(result?.enrollmentIds).toEqual([102, 101]);
    expect(result?.tutorNames).toEqual(['Tutor B', 'Tutor A']);
    expect(result?.tutorIds).toEqual([22, 11]);
  });
  it('restores saved slot ownership order, coverage and reason without mutating context', () => {
    const context = source();
    const original = structuredClone(context);
    const result = renewalSourceFor(context, review())!;
    expect(result.enrollmentIds).toEqual([101, 102]);
    expect(result.tutorNames).toEqual(['Tutor A', 'Tutor B']);
    expect(result.reason).toBe('New timetable');
    expect(result.scenario.slots.map(slot => slot.covered_through)).toEqual(['2026-11-03', '2026-11-05']);
    result.scenario.slots[0].holiday_exceptions!.push('2026-12-29');
    expect(context).toEqual(original);
  });
  it('restores chosen tutors independently of the original source tutors', () => {
    const saved = review(); saved.renewal!.tutor_ids = [33, 44];
    const result = renewalSourceFor(source(), saved);
    expect(result?.tutorIds).toEqual([11, 22]);
    expect(result?.selectedTutorIds).toEqual([33, 44]);
  });
  it.each([[101, 999], [101, 101], [101]])('rejects missing, duplicate or incomplete source mappings %s', (...ids) => {
    expect(renewalSourceFor(source(), review(ids))).toBeUndefined();
  });
  it('rejects another student and ambiguous timetable evidence', () => {
    expect(renewalSourceFor(source(), { ...review(), student: { id: 99 } } as BillingDraftReview)).toBeUndefined();
    const context = source();
    context.slot_candidates[1] = { ...context.slot_candidates[0], enrollment_id: 102 };
    expect(renewalSourceFor(context)).toBeUndefined();
  });
});
