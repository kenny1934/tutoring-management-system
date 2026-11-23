import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Enrollment } from '@/types';
import type { BillingPaymentDetail } from '@/types/billing';
import { BillingEnrollmentPaymentCard } from './BillingEnrollmentPaymentCard';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), payment: vi.fn(), payments: vi.fn(), options: vi.fn(), editCharges: vi.fn(), recordPayment: vi.fn(), markPaymentSent: vi.fn(), cancelPayment: vi.fn(), changed: vi.fn(), copy: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: mocks }));
vi.mock('@/lib/billing-clock', () => ({ billingToday: () => '2026-11-23' }));
vi.mock('@/lib/hooks/useSummerPreGradeWindow', () => ({ useSummerPreGradeWindow: () => false }));
vi.mock('./BillingEnrollmentSessions', () => ({ BillingEnrollmentSessions: () => null }));
function basePayment(): BillingPaymentDetail {
  return { id: 'payment-1', student_id: 4, version: 1, status: 'Pending Payment', created_at: '2026-10-18', sent_at: null, sent_language: null, paid_at: null, payment_date: null, received_method: null, receipt_reference: null, coupon_status: 'none', note: null, can_copy: true, review_issues: [], history: [{ kind: 'confirmed', actor_name: 'Admin', created_at: '2026-10-18' }],
    lines: [{ enrollment_id: 20, slot_index: 0, tutor_id: 7, tutor_name: 'Tutor A', lesson_count: 3, gross_tuition: 1200, discount_amount: 0, tuition_amount: 1200, materials_fee: 0 }, { enrollment_id: 21, slot_index: 1, tutor_id: 8, tutor_name: 'Tutor B', lesson_count: 4, gross_tuition: 1600, discount_amount: 0, tuition_amount: 1600, materials_fee: 0 }],
    review: { student: { id: 4, student_name: 'Example Student', school_student_id: '004', home_location: 'MSA', grade: 'F1', is_staff_referral: false }, source_fingerprint: 'source', evidence_hash: 'evidence', calendar_hash: 'calendar', policy_version: 'policy', review_hash: 'review', basis: 'paid_only', selected_enrollment_ids: [10, 11], confirmed_checks: [], issues: [],
      scenario: { first_lesson_date: '2026-12-04', slots: [{ weekday: 'Fri', location: 'MSA' }, { weekday: 'Thu', location: 'MSA' }], mode: 'transition', payment_method: 'manual', materials_fee: 0, trial_deduction: false, mandate_ready: false },
      message: { template_version: 'v2', zh: '中文收費通知', en: 'English fee message', blocked_reasons: [] },
      period: { number: 1, kind: 'transition', explanation: 'December sessions.', coverage_from: '2026-12-01', coverage_through: '2026-12-31', first_lesson_date: '2026-12-04', last_lesson_date: '2026-12-31', lesson_count: 7, counts_by_month: [{ month: '2026-12', lessons: 7 }], counts_by_slot: [3, 4], lessons: [{ date: '2026-12-04', weekday: 'Fri', slot: 0, time_slot: '16:45 - 18:15', location: 'MSA', holiday_exception: false }], gross_tuition: 2800, deductions: [], tuition_after_deductions: 2800, materials_fee: 0, total_fee: 2800, adjustment_reason: null, requires_review: false,
        collection: { method: 'manual', notice_from: '2026-11-12', notice_to: '2026-11-18', debit_from: null, debit_to: null, due_before_lesson: '2026-12-04', gap_min_days: null, gap_max_days: null } } } };
}

let current: BillingPaymentDetail;
function single() {
  const value = basePayment();
  value.lines = [{ ...value.lines[0], lesson_count: 8, gross_tuition: 3200, tuition_amount: 3200, materials_fee: 100 }];
  value.review.scenario.mode = 'new_student'; value.review.scenario.materials_fee = 100;
  value.review.period = { ...value.review.period, lesson_count: 8, counts_by_slot: [8], gross_tuition: 3200, tuition_after_deductions: 3200, materials_fee: 100, total_fee: 3300 };
  return value;
}
const enrollment = { id: 20, student_id: 4, is_new_student: true, billing_payment_id: 'payment-1' } as Enrollment;
function Wrapper({ children }: { children: React.ReactNode }) { return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnFocus: false, shouldRetryOnError: false }}>{children}</SWRConfig>; }
function show(value = enrollment) { return render(<BillingEnrollmentPaymentCard enrollment={value} onChanged={mocks.changed} />, { wrapper: Wrapper }); }
beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  current = single();
  mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Admin', isAdmin: true, isReadOnly: false });
  mocks.payment.mockImplementation(async () => current); mocks.payments.mockImplementation(async () => [current]);
  mocks.options.mockResolvedValue({ workflow_writes_available: true, standard_materials_fee: 100 });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mocks.copy.mockResolvedValue(undefined) } });
});
it('shows one total, separates materials from identity, and opens the charge form directly', async () => {
  show(); await screen.findByText('MOP 3,300');
  expect(screen.getAllByText('MOP 3,300')).toHaveLength(1);
  expect(screen.getByText('Materials fee')).toBeVisible(); expect(screen.queryByText('New student')).not.toBeInTheDocument();
  expect(screen.queryByText('Lessons paid')).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Open payment' })).toHaveLength(1);
  expect(screen.queryByText('Coverage')).not.toBeInTheDocument();
  expect(screen.queryByText('8 sessions')).not.toBeInTheDocument();
  const edit = screen.getByRole('button', { name: 'Edit charges' });
  await waitFor(() => expect(edit).toBeEnabled()); fireEvent.click(edit);
  const dialog = await screen.findByRole('dialog', { name: 'Edit charges' });
  await waitFor(() => expect(within(dialog).getByRole('form', { name: 'Edit enrollment charges' })).toBeVisible());
  expect(within(dialog).queryByRole('button', { name: 'Edit charges' })).not.toBeInTheDocument();
  expect(within(dialog).queryByText('Payment plan')).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel changes' }));
  await waitFor(() => expect(screen.queryByRole('form', { name: 'Edit enrollment charges' })).not.toBeInTheDocument());
  expect(edit).toHaveFocus();
});
it('saves the reviewed whole-payment correction and updates the summary without recreating an enrollment', async () => {
  mocks.editCharges.mockImplementation(async (_id, data) => {
    current = structuredClone(current); current.version++; current.lines[0].materials_fee = 0;
    current.review.period.materials_fee = 0; current.review.period.total_fee = 3200; current.review.scenario.materials_fee = 0;
    expect(data.expected_version).toBe(1); return current;
  });
  show(); const edit = await screen.findByRole('button', { name: 'Edit charges' }); await waitFor(() => expect(edit).toBeEnabled()); fireEvent.click(edit);
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('checkbox', { name: /Charge materials fee/ }));
  fireEvent.change(within(dialog).getByLabelText('Reason for change'), { target: { value: 'Materials already supplied.' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save charges' }));
  await screen.findByText('Charges and fee message updated.');
  expect(mocks.editCharges).toHaveBeenCalledWith('payment-1', expect.objectContaining({ charge_materials: false, expected_total: 3200, expected_version: 1, reason: 'Materials already supplied.' }), expect.any(AbortSignal));
  expect(mocks.changed).toHaveBeenCalledTimes(1); expect(screen.queryByText('New student')).not.toBeInTheDocument();
});
it('opens the saved message in place and preserves its language when reopened', async () => {
  show(); fireEvent.click(await screen.findByRole('button', { name: 'Fee message' }));
  const panel = await screen.findByRole('region', { name: 'Fee message' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(within(panel).getByRole('textbox', { name: 'Fee message' })).toHaveValue('中文收費通知');
  fireEvent.click(within(panel).getByRole('button', { name: 'English' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close message' }));
  fireEvent.click(screen.getByRole('button', { name: 'Fee message' }));
  expect(within(panel).getByRole('textbox', { name: 'Fee message' })).toHaveValue('English fee message');
});
it('opens collection immediately with bank transfer selected and no unrelated charge editor', async () => {
  show(); const record = await screen.findByRole('button', { name: 'Record payment' }); await waitFor(() => expect(record).toBeEnabled()); fireEvent.click(record);
  const dialog = await screen.findByRole('dialog', { name: 'Record payment' });
  await waitFor(() => expect(within(dialog).getByRole('form', { name: 'Record received payment' })).toBeVisible());
  expect(within(dialog).getByLabelText('Received by')).toHaveValue('bank_transfer');
  expect(within(dialog).queryByRole('button', { name: 'Edit charges' })).not.toBeInTheDocument();
  expect(within(dialog).queryByText('Payment plan')).not.toBeInTheDocument();
});
it('states the enrollment share and combined scope before a bulk collection', async () => {
  current = basePayment(); show();
  await screen.findByText('MOP 1,200'); expect(screen.getByText('MOP 2,800')).toBeVisible();
  const record = screen.getByRole('button', { name: 'Record payment' }); await waitFor(() => expect(record).toBeEnabled()); fireEvent.click(record);
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(within(dialog).getByText('This action applies to all 2 enrollments in this payment.')).toBeVisible());
  expect(within(dialog).getByText(/#20 · Tutor A/)).toBeVisible(); expect(within(dialog).getByText(/#21 · Tutor B/)).toBeVisible();
});
it('does not offer a pointless editor for a renewal with no editable charges', async () => {
  current = basePayment(); current.lines = [current.lines[0]]; current.review.period.deductions = [];
  show(); await screen.findByText('MOP 1,200');
  expect(screen.queryByRole('button', { name: 'Edit charges' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Record payment' })).toBeVisible();
});
it('explains a settings failure and still lets staff read the saved message', async () => {
  mocks.options.mockRejectedValue(new Error('Settings unavailable')); show();
  await screen.findByText('Could not load payment settings. Payment changes are unavailable.');
  expect(screen.getByRole('button', { name: 'Edit charges' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Record payment' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Fee message' }));
  await screen.findByRole('textbox', { name: 'Fee message' });
});
it('retains read-only access for supervisors and does not expose write controls', async () => {
  mocks.auth.mockReturnValue({ user: { id: 2 }, effectiveRole: 'Supervisor', isAdmin: false, isReadOnly: true }); show();
  await screen.findByText('MOP 3,300');
  expect(screen.queryByRole('button', { name: 'Edit charges' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Record payment' })).not.toBeInTheDocument();
  expect(mocks.options).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Fee message' })); await screen.findByRole('textbox', { name: 'Fee message' });
  expect(screen.queryByRole('button', { name: 'Mark sent' })).not.toBeInTheDocument();
});
it('blocks mutations for a payment held in a bank run and explains the hold', async () => {
  current.batch_action_issue = 'Open this payment in the Autopay list.'; show();
  await screen.findByText('Open this payment in the Autopay list.');
  expect(screen.getByRole('button', { name: 'Edit charges' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Record payment' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'More payment actions' })).toBeDisabled();
});
it('uses the actual configured charge amount and never calls it new-student status', async () => {
  current.lines[0].materials_fee = 125; current.review.period.materials_fee = 125; current.review.period.total_fee = 3325;
  show(); await screen.findByText('MOP 3,325'); expect(screen.getByText('MOP 125')).toBeVisible(); expect(screen.queryByText('New student')).not.toBeInTheDocument();
  expect(screen.queryByText(/reg fee/)).not.toBeInTheDocument();
});
it('keeps paid payment details readable and locks financial edits', async () => {
  current.status = 'Paid'; current.payment_date = '2026-11-20'; current.received_method = 'bank_transfer'; current.receipt_reference = 'SYNTHETIC-KMS'; current.note = 'Receipt checked.';
  show(); await screen.findByText('Paid'); expect(screen.getByText('Bank transfer')).toBeVisible(); expect(screen.getByText('SYNTHETIC-KMS')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Payment note' }).parentElement).toHaveTextContent('Receipt checked.');
  expect(screen.queryByRole('button', { name: 'Edit charges' })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Record payment' })).not.toBeInTheDocument();
});
it('uses the same overdue status on the card and in the direct editor', async () => {
  current.review.period.collection.due_before_lesson = '2026-11-23'; show(); await screen.findByText('Overdue');
  const edit = screen.getByRole('button', { name: 'Edit charges' }); await waitFor(() => expect(edit).toBeEnabled()); fireEvent.click(edit);
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(within(dialog).getByText('Overdue')).toBeVisible());
});

it('rejects a stale edit without closing the form or changing the enrollment', async () => {
  mocks.editCharges.mockRejectedValue(Object.assign(new Error('This payment has changed. Reload it before continuing.'), { status: 409 }));
  show(); const edit = await screen.findByRole('button', { name: 'Edit charges' }); await waitFor(() => expect(edit).toBeEnabled()); fireEvent.click(edit);
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('checkbox', { name: /Charge materials fee/ }));
  fireEvent.change(within(dialog).getByLabelText('Reason for change'), { target: { value: 'Materials waived.' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save charges' }));
  await within(dialog).findByText('This payment has changed. Reload it before continuing.');
  expect(mocks.changed).not.toHaveBeenCalled();
  expect(within(dialog).queryByRole('button', { name: 'Save charges' })).not.toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Refresh payment' })).toBeEnabled();
});

it('clears open messages and write controls when the effective role changes', async () => {
  const view = show(); fireEvent.click(await screen.findByRole('button', { name: 'Fee message' })); await screen.findByRole('textbox', { name: 'Fee message' });
  mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Supervisor', isAdmin: false, isReadOnly: true });
  view.rerender(<BillingEnrollmentPaymentCard enrollment={enrollment} onChanged={mocks.changed} />);
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Fee message' })).not.toBeInTheDocument());
  expect(screen.queryByRole('button', { name: 'Record payment' })).not.toBeInTheDocument();
});

it('labels the cancellation reason separately from payment notes', async () => {
  current.status = 'Cancelled'; current.note = 'Incorrect fee entered.';
  show();
  const heading = await screen.findByRole('heading', { name: 'Reason for cancellation' });
  expect(heading.parentElement).toHaveTextContent('Incorrect fee entered.');
  expect(screen.queryByRole('heading', { name: 'Payment note' })).not.toBeInTheDocument();
});

it('opens the full payment in place and restores focus without navigating away', async () => {
  const before = window.location.href;
  show();
  const trigger = await screen.findByRole('button', { name: 'Open payment' });
  fireEvent.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: 'Payment' });
  await waitFor(() => expect(within(dialog).getByRole('region', { name: 'Enrollment fee' })).toBeVisible());
  expect(window.location.href).toBe(before);
  expect(screen.getByRole('region', { name: 'Payment summary' })).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close modal' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
  expect(window.location.href).toBe(before);
});

it('labels the saved fee-message status with its date and language', async () => {
  current.sent_at = '2026-11-20'; current.sent_language = 'zh';
  show();
  const status = await screen.findByLabelText('Fee message status');
  expect(within(status).getByText('Fee message')).toBeVisible();
  expect(status).toHaveTextContent('Sent Nov 20, 2026 (中文)');
});

it.each(['Paid', 'Cancelled'] as const)('makes the saved message accessible on the card and modal for %s payments without sending controls', async status => {
  current.status = status; current.can_copy = false;
  current.saved_message = structuredClone(current.review.message);
  current.review.message = { ...current.review.message, zh: null, en: null, blocked_reasons: ['This payment is closed.'] };
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Fee message' }));
  const panel = await screen.findByRole('region', { name: 'Fee message' });
  expect(within(panel).getByRole('textbox', { name: 'Fee message' })).toHaveValue('中文收費通知');
  fireEvent.click(within(panel).getByRole('button', { name: 'English' }));
  expect(within(panel).getByRole('textbox', { name: 'Fee message' })).toHaveValue('English fee message');
  expect(within(panel).getByRole('button', { name: 'Copy' })).toBeEnabled();
  fireEvent.click(within(panel).getByRole('button', { name: 'Copy' }));
  await waitFor(() => expect(mocks.copy).toHaveBeenCalledWith('English fee message'));
  expect(screen.queryByRole('button', { name: 'Mark sent' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Edit before copying')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close message' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open payment' }));
  const dialog = await screen.findByRole('dialog', { name: 'Payment' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Fee message' }));
  expect(within(dialog).getByRole('textbox', { name: 'Fee message' })).toHaveValue('中文收費通知');
  expect(within(dialog).getByRole('button', { name: 'Copy' })).toBeEnabled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Copy' }));
  await waitFor(() => expect(mocks.copy).toHaveBeenCalledWith('中文收費通知'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Back to payment' }));
  expect(within(dialog).getByRole('region', { name: 'Enrollment fee' })).toBeInTheDocument();
  expect(mocks.markPaymentSent).not.toHaveBeenCalled();
});

it('checks a saved message again before copying and refuses a changed archived snapshot', async () => {
  current.status = 'Paid'; current.can_copy = false; current.saved_message = structuredClone(current.review.message);
  show(); fireEvent.click(await screen.findByRole('button', { name: 'Fee message' }));
  await screen.findByRole('textbox', { name: 'Fee message' });
  mocks.payment.mockResolvedValue({ ...current, saved_message: { ...current.saved_message, zh: 'Changed saved message' } });
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
  await screen.findByText('This payment changed. Check its details before copying.');
  expect(mocks.copy).not.toHaveBeenCalled(); expect(mocks.markPaymentSent).not.toHaveBeenCalled();
});

it('keeps cancellation in the header menu and returns focus there after dismissing its confirmation', async () => {
  show();
  const more = await screen.findByRole('button', { name: 'More payment actions' });
  await waitFor(() => expect(more).toBeEnabled());
  vi.spyOn(more.parentElement!, 'getBoundingClientRect').mockReturnValue({ x: 250, y: 10, top: 10, left: 250, bottom: 38, right: 278, width: 28, height: 28, toJSON: () => ({}) });
  expect(screen.queryByRole('button', { name: 'Cancel enrollment' })).not.toBeInTheDocument();
  fireEvent.click(more);
  let cancel = await screen.findByRole('menuitem', { name: 'Cancel enrollment' });
  expect(cancel).toHaveFocus();
  fireEvent.keyDown(cancel, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  expect(more).toHaveFocus();
  fireEvent.click(more);
  cancel = await screen.findByRole('menuitem', { name: 'Cancel enrollment' });
  fireEvent.click(cancel);
  const dialog = await screen.findByRole('dialog', { name: 'Cancel enrollment' });
  await waitFor(() => expect(within(dialog).getByRole('form', { name: 'Cancel linked enrollments' })).toBeVisible());
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Confirm cancellation' })).toBeDisabled();
  expect(mocks.cancelPayment).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Keep enrollment' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(more).toHaveFocus();
  expect(mocks.cancelPayment).not.toHaveBeenCalled();
});
