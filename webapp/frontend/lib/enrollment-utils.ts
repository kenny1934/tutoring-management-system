import type { Enrollment } from "@/types";

/**
 * Get the display payment status for an enrollment.
 * Returns "Overdue" if payment is pending and first lesson date has passed.
 */
export function getDisplayPaymentStatus(enrollment: Enrollment): string {
  if (enrollment.payment_status === 'Pending Payment' && enrollment.first_lesson_date) {
    const startDate = new Date(enrollment.first_lesson_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    startDate.setHours(0, 0, 0, 0);
    if (today >= startDate) {
      return 'Overdue';
    }
  }
  return enrollment.payment_status || '';
}

/**
 * Get styling configuration for a payment status.
 */
export function getPaymentStatusConfig(status: string) {
  switch (status) {
    case 'Paid':
      return { bgClass: 'bg-green-500', bgTint: 'bg-green-50 dark:bg-green-900/20' };
    case 'Overdue':
      return { bgClass: 'bg-red-500', bgTint: 'bg-red-50 dark:bg-red-900/20' };
    case 'Pending Payment':
      return { bgClass: 'bg-amber-500', bgTint: 'bg-amber-50 dark:bg-amber-900/20' };
    default:
      return { bgClass: 'bg-gray-400', bgTint: 'bg-gray-50 dark:bg-gray-800/50' };
  }
}
