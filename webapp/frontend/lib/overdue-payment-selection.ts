import type { OverdueEnrollment } from '@/types';
import type { PaymentBatchTarget } from './billing-payment-batch';

/** Historical payments keep their original Summer/date/discount workflow. */
export function overduePaymentFamily(row: OverdueEnrollment): 'combined' | 'legacy' | null {
  if (row.billing_payment_id) return row.billing_payment_method === 'manual' ? 'combined' : null;
  return row.billing_managed ? null : 'legacy';
}

export function overduePaymentTarget(row: OverdueEnrollment): PaymentBatchTarget {
  return { paymentId: row.billing_payment_id!, student: {
    id: row.student_id, student_name: row.student_name, school_student_id: row.school_student_id ?? null,
    home_location: null, grade: row.grade ?? null, is_staff_referral: false,
  } };
}
