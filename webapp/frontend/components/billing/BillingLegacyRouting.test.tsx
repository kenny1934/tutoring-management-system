import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeeMessagePanel } from '@/components/enrollments/FeeMessagePanel';
import { BatchRenewModal } from '@/components/enrollments/BatchRenewModal';
import { billingErrorHref } from '@/lib/billing-workflow';
import { BillingWorkflowLink } from './BillingWorkflowLink';
import type { RenewalListItem } from '@/types';

const mocks = vi.hoisted(() => ({ fee: vi.fn(), update: vi.fn(), batchCheck: vi.fn(), batchRenew: vi.fn(), toast: vi.fn() }));
vi.mock('@/lib/api', () => ({ enrollmentsAPI: { getFeeMessage: mocks.fee, update: mocks.update, batchRenewCheck: mocks.batchCheck, batchRenew: mocks.batchRenew } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ effectiveRole: 'Admin', isReadOnly: false }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock('@/lib/share', () => ({ useCanShare: () => false, shareOrCopy: vi.fn() }));
vi.mock('@/components/ui/student-info-badges', () => ({ StudentInfoBadges: ({ student }: { student: { student_name: string } }) => <span>{student.student_name}</span> }));

const renewal: RenewalListItem = { id: 10, student_id: 4, student_name: 'Example Student', tutor_id: 7, tutor_name: 'Tutor', assigned_day: 'Fri', assigned_time: '16:45 - 18:15', location: 'MSA', first_lesson_date: '2026-10-30', lessons_paid: 6, effective_end_date: '2026-12-04', days_until_expiry: 4, sessions_remaining: 1, payment_status: 'Paid', renewal_status: 'pending_message', renewal_enrollment_id: 20, renewal_lessons_paid: 7 };
beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.fee.mockResolvedValue({ message: 'Legacy fee message' });
  mocks.update.mockResolvedValue({});
});

describe('legacy payment routing', () => {
  it('shows the actual collection method with its shared colour and icon beside the payment link', () => {
    const view = render(<BillingWorkflowLink studentId={4} paymentId="combined-1" method="manual" />);
    expect(screen.getByText('Manual')).toHaveClass('bg-tint');
    expect(screen.getByText('Manual').querySelector('svg')).toHaveClass('lucide-hand-coins');
    expect(screen.queryByText('Autopay')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open payment' })).toHaveAttribute('href', '/billing/students/4?view=payments&payment=combined-1');
    view.rerender(<BillingWorkflowLink studentId={4} paymentId="combined-1" method="autopay" />);
    expect(screen.getByText('Autopay')).toHaveClass('bg-blue-50');
    expect(screen.getByText('Autopay').querySelector('svg')).toHaveClass('lucide-landmark');
    expect(screen.queryByText('Manual')).not.toBeInTheDocument();
    view.rerender(<BillingWorkflowLink studentId={4} paymentId="combined-1" />);
    expect(screen.queryByText('Manual')).not.toBeInTheDocument();
    expect(screen.queryByText('Autopay')).not.toBeInTheDocument();
  });
  it('opens a combined renewal payment instead of fetching a per-enrollment fee message', async () => {
    render(<FeeMessagePanel enrollment={{ ...renewal, billing_managed: true, renewal_billing_payment_id: 'combined-1' }} onClose={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'Open payment' })).toHaveAttribute('href', '/billing/students/4?view=payments&payment=combined-1');
    expect(mocks.fee).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Mark sent' })).not.toBeInTheDocument();
  });
  it('preserves existing unlinked enrollment messages after the student joins the new workflow', async () => {
    render(<FeeMessagePanel enrollment={{ ...renewal, billing_managed: true }} onClose={vi.fn()} />);
    await screen.findByDisplayValue('Legacy fee message');
    expect(mocks.fee).toHaveBeenCalledWith(20, 'zh', 7);
    fireEvent.click(screen.getByRole('button', { name: 'Mark sent' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(20, { fee_message_sent: true }));
  });
  it('shows a payment journey link for active students excluded from six-session batch renewal', async () => {
    mocks.batchCheck.mockResolvedValue({ eligible: [], ineligible: [{ enrollment_id: 10, eligible: false, reason: 'billing_workflow', student_id: 4, student_name: 'Example Student', details: 'Review the next enrollment in Billing.', billing_managed: true, overridable: false, assigned_day: 'Fri', assigned_time: '16:45 - 18:15', suggested_first_lesson_date: null }] });
    render(<BatchRenewModal isOpen onClose={vi.fn()} enrollmentIds={[10]} onSuccess={vi.fn()} />);
    expect(await screen.findByRole('link', { name: 'Review next enrollment' })).toHaveAttribute('href', '/billing/students/4');
    expect(mocks.batchRenew).not.toHaveBeenCalled();
    expect(screen.queryByText('Tick a student to renew them anyway.')).not.toBeInTheDocument();
  });
  it('recognises only the structured workflow redirect from legacy mutation guards', () => {
    expect(billingErrorHref({ detail: { code: 'BILLING_WORKFLOW_REQUIRED', student_id: 4, payment_id: 'group 1' } })).toBe('/billing/students/4?view=payments&payment=group%201');
    expect(billingErrorHref({ detail: { code: 'OTHER_CONFLICT', student_id: 4 } })).toBeNull();
    expect(billingErrorHref(new Error('Connection lost'))).toBeNull();
  });
});
