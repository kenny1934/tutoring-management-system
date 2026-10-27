import { describe, expect, it } from 'vitest';
import { overduePaymentFamily, overduePaymentTarget } from './overdue-payment-selection';
import type { OverdueEnrollment } from '@/types';

function row(overrides: Partial<OverdueEnrollment> = {}): OverdueEnrollment {
  return { id: 7, student_id: 4, student_name: 'Synthetic Student', school_student_id: '004', grade: 'F1', location: 'MSA', first_lesson_date: '2026-12-04', lessons_paid: 4, days_overdue: 3, ...overrides };
}
describe('overdue payment selection boundary', () => {
  it.each(['Regular', 'Summer Course', 'One-Time'] as const)('keeps an unlinked %s enrollment in the original payment workflow', enrollment_type => {
    expect(overduePaymentFamily(row({ enrollment_type }))).toBe('legacy');
  });
  it('chooses the combined workflow for the actual manual collection', () => {
    expect(overduePaymentFamily(row({ billing_managed: true, billing_payment_id: 'combined', billing_payment_method: 'manual' }))).toBe('combined');
  });
  it.each(['autopay', null, undefined] as const)('excludes a linked payment with collection method %s', billing_payment_method => {
    expect(overduePaymentFamily(row({ billing_payment_id: 'combined', billing_payment_method }))).toBeNull();
  });
  it('does not send a managed enrollment with a missing payment link to the legacy API', () => {
    expect(overduePaymentFamily(row({ billing_managed: true }))).toBeNull();
  });
  it('targets the payment and student without pretending the overdue enrollment is the entire combined payment', () => {
    const result = overduePaymentTarget(row({ billing_payment_id: 'combined', billing_payment_method: 'manual' }));
    expect(result).toEqual({ paymentId: 'combined', student: { id: 4, student_name: 'Synthetic Student', school_student_id: '004', home_location: null, grade: 'F1', is_staff_referral: false } });
    expect(result.enrollmentIds).toBeUndefined();
  });
  it('preserves absent profile details as null', () => {
    expect(overduePaymentTarget(row({ billing_payment_id: 'combined', school_student_id: undefined, grade: undefined })).student).toMatchObject({ school_student_id: null, grade: null });
  });
});
