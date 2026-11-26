import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { beforeEach, expect, it, vi } from 'vitest';
import type { BillingPaymentDetail } from '@/types/billing';
import { BillingSupplementPaymentButton } from './BillingSupplementPaymentButton';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), payment: vi.fn(), options: vi.fn(), supplementPaid: vi.fn(), changed: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: mocks }));
vi.mock('@/lib/billing-clock', () => ({ billingToday: () => '2026-11-25' }));
vi.mock('@/components/ui/modal', () => ({ Modal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) => isOpen ? <div role="dialog" aria-label="Record payment">{children}</div> : null }));

let current: BillingPaymentDetail;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Admin', isAdmin: true, isReadOnly: false });
  current = { id: 'payment', student_id: 101, version: 4, status: 'Paid', review_issues: [], outstanding_supplement_amount: 800,
    supplementary_payments: [{ id: 'extra', enrollment_id: 20, amount: 800, status: 'Pending Payment', lessons: [{ session_id: 1, date: '2027-01-22', time_slot: '16:00 - 17:30', location: 'MSA' }] }], review: { student: { student_name: 'Synthetic student' } } } as unknown as BillingPaymentDetail;
  mocks.payment.mockImplementation(async () => current);
  mocks.options.mockResolvedValue({ workflow_writes_available: true });
  mocks.supplementPaid.mockImplementation(async () => ({ ...current, version: 5, outstanding_supplement_amount: 0, supplementary_payments: current.supplementary_payments!.map(item => ({ ...item, status: 'Paid' })) }));
});
function show(enrollmentId?: number) {
  return render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnFocus: false }}><BillingSupplementPaymentButton paymentId="payment" studentId={101} enrollmentId={enrollmentId} onChanged={mocks.changed} /></SWRConfig>);
}
async function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByLabelText('Received by');
  return dialog;
}
it('opens the collection form directly and records only the extra tuition', async () => {
  show(20); const dialog = await open();
  expect(within(dialog).getByLabelText('Received by')).toHaveValue('bank_transfer');
  expect(within(dialog).getByText(/1 additional session/)).toHaveTextContent('800');
  expect(within(dialog).getByText(/Jan 22, 2027/)).toBeVisible();
  expect(within(dialog).queryByText('Copy payment message')).not.toBeInTheDocument();
  const record = within(dialog).getByRole('button', { name: 'Record payment' });
  expect(record).toBeDisabled(); fireEvent.click(within(dialog).getByRole('checkbox')); fireEvent.click(record);
  await waitFor(() => expect(mocks.supplementPaid).toHaveBeenCalledWith('payment', expect.objectContaining({ amount: 800, enrollment_id: 20, supplement_id: 'extra', expected_version: 4, method: 'bank_transfer' })));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(mocks.changed).toHaveBeenCalled(); expect(screen.queryByRole('button', { name: 'Record payment' })).not.toBeInTheDocument();
});
it('filters collection to the selected enrollment and excludes settled additions', async () => {
  current.supplementary_payments!.push({ ...current.supplementary_payments![0], id: 'other', enrollment_id: 21, amount: 400 }, { ...current.supplementary_payments![0], id: 'settled', status: 'Paid' });
  show(20); const dialog = await open();
  expect(within(dialog).queryByLabelText('Additional payment')).not.toBeInTheDocument();
  expect(within(dialog).getAllByRole('checkbox')).toHaveLength(1);
});
it('allows overdue collection across additions while keeping exact amounts separate', async () => {
  current.supplementary_payments!.push({ ...current.supplementary_payments![0], id: 'other', enrollment_id: 21, amount: 400 });
  show(); const dialog = await open();
  fireEvent.change(within(dialog).getByLabelText('Additional payment'), { target: { value: 'other' } });
  expect(within(dialog).getByRole('checkbox')).toHaveAccessibleName(/400/);
});
it.each(['Tutor', 'Read-only'])('does not expose collection for %s', role => {
  mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: role, isAdmin: role !== 'Tutor', isReadOnly: role === 'Read-only' });
  show(); expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
it('blocks collection when verification fails', async () => {
  current.review_issues = ['The enrollment changed.']; show();
  fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The enrollment changed.');
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});
it('rejects data for another student', async () => {
  current.student_id = 102; show(); fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('no longer belongs');
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});

it('continues with the next addition after collecting one and closes after the last', async () => {
  current.supplementary_payments!.push({ ...current.supplementary_payments![0], id: 'other', enrollment_id: 21, amount: 400 });
  mocks.supplementPaid.mockImplementation(async (_id, body) => {
    current = { ...current, version: current.version + 1, supplementary_payments: current.supplementary_payments!.map(item => item.id === body.supplement_id ? { ...item, status: 'Paid' } : item) };
    return current;
  });
  show(); const dialog = await open();
  fireEvent.click(within(dialog).getByRole('checkbox'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }));
  await waitFor(() => expect(within(dialog).getByRole('checkbox')).toHaveAccessibleName(/400/));
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeEnabled());
  fireEvent.click(within(dialog).getByRole('checkbox'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(mocks.supplementPaid).toHaveBeenNthCalledWith(2, 'payment', expect.objectContaining({ supplement_id: 'other', amount: 400, expected_version: 5 }));
});
