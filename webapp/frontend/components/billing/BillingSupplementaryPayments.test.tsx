import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { BillingSupplementaryPayments } from './BillingSupplementaryPayments';
import type { BillingPaymentDetail } from '@/types/billing';
const mocks = vi.hoisted(() => ({ collect: vi.fn(), copy: vi.fn() }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: { supplementPaid: mocks.collect } }));
vi.mock('@/lib/share', () => ({ shareOrCopy: mocks.copy }));
vi.mock('@/lib/billing-clock', () => ({ billingToday: () => '2026-11-25' }));
function detail() {
  return { id: 'payment', version: 4, status: 'Paid', outstanding_supplement_amount: 800, review_issues: [],
    review: { student: { student_name: 'Invented Student' } }, supplementary_payments: [{ id: 'extra', enrollment_id: 20, amount: 800, status: 'Pending Payment',
      lessons: [{ session_id: 1, date: '2027-01-01', time_slot: '16:00 - 17:30', location: 'MSA' }, { session_id: 2, date: '2027-01-08', time_slot: '16:00 - 17:30', location: 'MSA' }], reason: 'Weekday change' }] } as unknown as BillingPaymentDetail;
}
beforeEach(() => { vi.clearAllMocks(); });
it('requires receipt of the exact supplementary amount before recording it', async () => {
  const updated = { ...detail(), outstanding_supplement_amount: 0 };
  mocks.collect.mockResolvedValue(updated);
  const onUpdate = vi.fn();
  render(<BillingSupplementaryPayments detail={detail()} canWrite onUpdate={onUpdate} />);
  expect(screen.getByText(/Partially paid/)).toHaveTextContent('800');
  const record = screen.getByRole('button', { name: 'Record payment' });
  expect(record).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(record);
  await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(updated, true));
  expect(mocks.collect).toHaveBeenCalledWith('payment', expect.objectContaining({ amount: 800, enrollment_id: 20, supplement_id: 'extra', expected_version: 4, payment_date: '2026-11-25' }));
});
it('reuses the operation key after an interrupted collection', async () => {
  mocks.collect.mockRejectedValueOnce(new Error('Connection interrupted')).mockResolvedValueOnce(detail());
  render(<BillingSupplementaryPayments detail={detail()} canWrite onUpdate={vi.fn()} />);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
  await screen.findByText('Connection interrupted');
  fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
  await waitFor(() => expect(mocks.collect).toHaveBeenCalledTimes(2));
  expect(mocks.collect.mock.calls[0][1].idempotency_key).toBe(mocks.collect.mock.calls[1][1].idempotency_key);
});
it('shows history but withholds collection controls for read-only staff', () => {
  render(<BillingSupplementaryPayments detail={detail()} canWrite={false} onUpdate={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Record payment' })).not.toBeInTheDocument();
  expect(screen.getByText(/2 additional sessions/)).toBeInTheDocument();
});
it('copies the selected server-prepared language and amount', async () => {
  const value = detail();
  value.supplementary_payments![0].message = { template_version: 'fixture', zh: '新增兩堂，補繳 MOP 800。', en: 'Additional tuition: MOP 800.', blocked_reasons: [] };
  mocks.copy.mockResolvedValue('copied');
  render(<BillingSupplementaryPayments detail={value} canWrite onUpdate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Copy payment message' }));
  await waitFor(() => expect(mocks.copy).toHaveBeenLastCalledWith('新增兩堂，補繳 MOP 800。'));
  fireEvent.change(screen.getByLabelText('Message language'), { target: { value: 'en' } });
  fireEvent.click(screen.getByRole('button', { name: 'Copy payment message' }));
  await waitFor(() => expect(mocks.copy).toHaveBeenLastCalledWith('Additional tuition: MOP 800.'));
});
