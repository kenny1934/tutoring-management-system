export interface BillingEnrollmentRouting {
  billing_managed?: boolean;
  billing_payment_id?: string | null;
  billing_payment_method?: 'manual' | 'autopay' | null;
}

export function billingPaymentHref(studentId: number, paymentId?: string | null) {
  return paymentId ? `/billing/students/${studentId}?view=payments&payment=${encodeURIComponent(paymentId)}` : `/billing/students/${studentId}`;
}

export function billingErrorHref(error: unknown): string | null {
  const detail = (error as { detail?: { code?: string; student_id?: number; payment_id?: string | null } } | null)?.detail;
  return detail?.code === 'BILLING_WORKFLOW_REQUIRED' && detail.student_id ? billingPaymentHref(detail.student_id, detail.payment_id) : null;
}
