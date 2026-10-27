import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingReceiptsQueue } from './BillingReceiptsQueue';
import type { BillingReceiptTasks } from '@/types/billing';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), receipts: vi.fn(), payment: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: { receipts: mocks.receipts } }));
vi.mock('@/lib/hooks', () => ({ useVisibilityAwareInterval: () => 0 }));
vi.mock('./BillingPayments', () => ({ BillingPayments: (props: { studentId: number; initialPaymentId: string; canWrite: boolean; onChanged: () => void }) => { mocks.payment(props); return <button onClick={props.onChanged}>Synthetic receipt saved</button>; } }));
function response(): BillingReceiptTasks { return { as_of: '2026-10-21', storage_available: true, writes_available: true, total: 1, offset: 0, limit: 25, rows: [{ payment_id: 'old-payment', student: { id: 4, student_name: 'Synthetic Student', school_student_id: '0004', home_location: 'MSA', grade: 'F1', is_staff_referral: false }, first_lesson_date: '2025-10-01', last_lesson_date: '2025-11-30', lesson_count: 8, total_amount: 2900, received_amount: 2900, payment_date: '2025-09-21', received_method: 'bank_transfer', coupon_value: 300, coupon_status: 'awaiting_receipt', receipt_reference: null, needs_checking: false, issues: [] }] }; }
function Wrapper({ children }: { children: React.ReactNode }) { return <SWRConfig value={{ provider: () => new Map(), revalidateOnFocus: false, shouldRetryOnError: false, dedupingInterval: 0 }}>{children}</SWRConfig>; }
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockReturnValue({ user: { id: 1 }, isAdmin: true, effectiveRole: 'Admin', isReadOnly: false }); mocks.receipts.mockResolvedValue(response()); });
describe('all outstanding KMS receipts', () => {
  it('loads older receipts without a collection month and opens the exact payment in the existing popup', async () => {
    render(<BillingReceiptsQueue location="MSA" search="" searchPending={false} />, { wrapper: Wrapper }); await screen.findByText('Oct 1, 2025 to Nov 30, 2025'); expect(mocks.receipts).toHaveBeenCalledWith({ location: 'MSA', tutor_id: undefined, search: undefined, offset: 0, limit: 25 }); expect(screen.getByText('MOP 2,900')).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Record receipt' })); await screen.findByRole('dialog', { name: 'Payment' }); expect(mocks.payment.mock.lastCall![0]).toEqual(expect.objectContaining({ studentId: 4, initialPaymentId: 'old-payment', canWrite: true, mode: 'receipt', receiptTask: response().rows[0], nextReceiptDisabled: true })); fireEvent.click(screen.getByRole('button', { name: 'Synthetic receipt saved' })); await waitFor(() => expect(mocks.receipts).toHaveBeenCalledTimes(2));
  });
  it('keeps null evidence as a check and preserves read-only visibility', async () => {
    const value = response(); value.rows[0] = { ...value.rows[0], first_lesson_date: null, last_lesson_date: null, received_amount: null, needs_checking: true }; value.writes_available = false; mocks.receipts.mockResolvedValue(value); mocks.auth.mockReturnValue({ user: { id: 2 }, isAdmin: false, isReadOnly: true, effectiveRole: 'Supervisor' }); render(<BillingReceiptsQueue search="" searchPending={false} />, { wrapper: Wrapper }); await screen.findByText('Amount to confirm'); expect(screen.getByText('Check enrollment dates')).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Record receipt' })).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'View payment' })); await screen.findByRole('dialog'); expect(mocks.payment.mock.lastCall![0]).toEqual(expect.objectContaining({ canWrite: false, mode: 'payment' }));
  });
  it('uses tutor and search scope and pages the complete outstanding list', async () => {
    mocks.receipts.mockResolvedValue({ ...response(), total: 26 }); render(<BillingReceiptsQueue tutorId={7} search="student" searchPending={false} />, { wrapper: Wrapper }); await screen.findByRole('button', { name: 'Next' }); fireEvent.click(screen.getByRole('button', { name: 'Next' })); await waitFor(() => expect(mocks.receipts).toHaveBeenLastCalledWith({ location: undefined, tutor_id: 7, search: 'student', offset: 25, limit: 25 }));
  });
  it('reports disabled storage without pretending the count is zero', async () => {
    mocks.receipts.mockResolvedValue({ ...response(), storage_available: false, writes_available: false, rows: [], total: 0 }); render(<BillingReceiptsQueue search="" searchPending={false} />, { wrapper: Wrapper }); await screen.findByText('KMS receipt follow-up is not available yet.'); expect(screen.queryByText('No KMS receipts are outstanding.')).not.toBeInTheDocument();
  });
});
