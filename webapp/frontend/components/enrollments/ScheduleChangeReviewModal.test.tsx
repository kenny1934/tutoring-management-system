import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ScheduleChangeReviewModal } from './ScheduleChangeReviewModal';
const mocks = vi.hoisted(() => ({ preview: vi.fn(), apply: vi.fn(), toast: vi.fn() }));
vi.mock('@/lib/api', () => ({ enrollmentsAPI: { previewScheduleChange: mocks.preview, applyScheduleChange: mocks.apply } }));
vi.mock('@/lib/billing-clock', () => ({ billingToday: () => '2026-11-26' }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock('@/components/ui/modal', () => ({ Modal: ({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) => <div>{children}{footer}</div> }));
const schedule = { day: 'Tue', time: '16:00 - 17:30', location: 'MSA', tutorId: 1, tutorName: 'Example Tutor' };
const proposal = { payment_id: 'payment', review_hash: 'a'.repeat(64), effective_date: '2027-01-01', coverage_from: '2027-01-01', coverage_through: '2027-01-31', previous_count: 3, new_count: 5, regular_count: 5,
  moves: [{ session_id: 1, from_date: '2027-01-05', date: '2027-01-01' }], pending_session_ids: [], added_dates: ['2027-01-22', '2027-01-29'], additional_amount: 800, original_payment_status: 'Paid', issues: [] };
function mount(current = schedule, day = 'Fri') { return render(<ScheduleChangeReviewModal isOpen enrollmentId={20} currentSchedule={current} newSchedule={{ ...current, day }} onClose={vi.fn()} onSuccess={vi.fn()} />); }
beforeEach(() => { vi.clearAllMocks(); mocks.preview.mockResolvedValue({ enrollment_id: 20, period_adjustment: proposal, updatable_sessions: [], unchangeable_sessions: [], conflicts: [], warnings: [], can_apply: true }); mocks.apply.mockResolvedValue({ message: 'Schedule updated' }); });
it('reviews added unpaid sessions and submits the exact reviewed period', async () => {
  mount();
  await screen.findByRole('region', { name: 'Billing period adjustment' });
  expect(mocks.preview).toHaveBeenCalledWith(20, expect.objectContaining({ review_period: true }));
  expect(screen.getByText('Additional tuition: MOP 800')).toBeInTheDocument();
  expect(screen.getAllByText('Unpaid')).toHaveLength(2);
  expect(screen.getByText('Enrollment becomes partially paid')).toBeInTheDocument();
  const submit = screen.getByRole('button', { name: 'Apply changes' });
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Reason for the change'), { target: { value: 'Permanent weekday change' } });
  fireEvent.click(submit);
  await waitFor(() => expect(mocks.apply).toHaveBeenCalledWith(20, expect.objectContaining({ expected_adjustment_hash: proposal.review_hash, effective_date: '2027-01-01', reason: 'Permanent weekday change' })));
  expect(screen.queryByRole('button', { name: 'Keep all sessions' })).not.toBeInTheDocument();
});
it('explains surplus entitlements without a refund or an extended period', async () => {
  mocks.preview.mockResolvedValue({ enrollment_id: 20, period_adjustment: { ...proposal, previous_count: 5, new_count: 5, pending_session_ids: [4, 5], pending_sessions: [{ session_id: 4, date: '2027-01-22', time_slot: '16:00 - 17:30' }, { session_id: 5, date: '2027-01-29', time_slot: '16:00 - 17:30' }], added_dates: [], additional_amount: 0 }, updatable_sessions: [], unchangeable_sessions: [], conflicts: [], warnings: [], can_apply: true });
  mount();
  expect(await screen.findByText('No additional payment')).toBeInTheDocument();
  expect(screen.getAllByText('Needs rescheduling')).toHaveLength(2);
  const list = screen.getByRole('list', { name: 'Session changes' });
  expect(list).toHaveTextContent('Jan 22, 2027');
  expect(list).toHaveTextContent('Jan 29, 2027');
  expect(screen.getByText('Fee and billing end unchanged.')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('reviews Friday 27 to Wednesday 25 and requires the reason and past-date confirmation', async () => {
  mocks.preview.mockImplementation(async (_id, request) => ({ enrollment_id: 20, period_adjustment: null,
    as_of: '2026-11-26', effective_date: request.effective_date || '2026-11-26', coverage_from: '2026-11-06', coverage_through: '2026-12-31',
    updatable_sessions: [{ session_id: 7, current_date: '2026-11-27', current_time_slot: '16:00 - 17:30',
      current_tutor_name: 'Example Tutor', new_tutor_name: 'Example Tutor', new_date: request.effective_date === '2026-11-25' ? '2026-11-25' : '2026-12-02', new_time_slot: '16:00 - 17:30', is_holiday: false }],
    unchangeable_sessions: [], conflicts: [], warnings: [], can_apply: true }));
  mount({ ...schedule, day: 'Fri' }, 'Wed');
  const date = await screen.findByLabelText('Change effective from');
  expect(date).toHaveValue('2026-11-26');
  fireEvent.change(date, { target: { value: '2026-11-25' } });
  const confirm = await screen.findByRole('checkbox', { name: 'I confirm the past dates are correct.' });
  expect(screen.getByRole('alert')).toHaveTextContent('Nov 25, 2026');
  expect(screen.getByRole('button', { name: 'Apply changes' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Reason for the change'), { target: { value: 'The timetable began yesterday.' } });
  expect(screen.getByRole('button', { name: 'Apply changes' })).toBeDisabled();
  fireEvent.click(confirm); fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
  await waitFor(() => expect(mocks.apply).toHaveBeenCalledWith(20, expect.objectContaining({ effective_date: '2026-11-25', acknowledge_past_dates: true, reason: 'The timetable began yesterday.' })));
});
it('resets confirmation when the monthly reviewed dates change', async () => {
  mocks.preview.mockImplementation(async (_id, request) => ({ enrollment_id: 20, as_of: '2027-01-07', period_adjustment: { ...proposal,
    effective_date: request.effective_date || '2027-01-01', requires_past_confirmation: true },
    updatable_sessions: [], unchangeable_sessions: [], conflicts: [], warnings: [], can_apply: true }));
  mount();
  let confirm = await screen.findByRole('checkbox', { name: 'I confirm the past dates are correct.' });
  fireEvent.change(screen.getByLabelText('Reason for the change'), { target: { value: 'Timetable correction.' } });
  fireEvent.click(confirm); expect(confirm).toBeChecked();
  fireEvent.change(screen.getByLabelText('Change effective from'), { target: { value: '2027-01-02' } });
  confirm = await screen.findByRole('checkbox', { name: 'I confirm the past dates are correct.' });
  expect(confirm).not.toBeChecked(); expect(screen.getByRole('button', { name: 'Apply changes' })).toBeDisabled();
});
