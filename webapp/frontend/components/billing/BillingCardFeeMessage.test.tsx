import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingCardFeeMessage, cardFeeMessageTarget } from './BillingCardFeeMessage';
import type { BillingDraftDetail, BillingDraftReview, BillingPaymentDetail, BillingQueueRow } from '@/types/billing';
import type { RenewalListItem } from '@/types';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), draft: vi.fn(), payment: vi.fn(), enrollment: vi.fn(), legacy: vi.fn(), clipboard: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: { draft: mocks.draft, payment: mocks.payment } }));
vi.mock('@/lib/api', () => ({ enrollmentsAPI: { getById: mocks.enrollment } }));
vi.mock('@/components/enrollments/FeeMessagePanel', () => ({
  FeeMessagePanel: (props: { enrollment: RenewalListItem; onClose: () => void; onMarkSent: () => void }) => {
    mocks.legacy(props);
    return <div data-testid="legacy-message"><button onClick={props.onClose}>Legacy close</button><button onClick={props.onMarkSent}>Legacy sent</button></div>;
  },
}));

function review(): BillingDraftReview {
  return {
    student: { id: 4, student_name: 'Example Student', school_student_id: '004', home_location: 'MSA', grade: 'F1', is_staff_referral: false },
    source_fingerprint: 'source', evidence_hash: 'evidence', calendar_hash: 'calendar', policy_version: 'policy', review_hash: 'review',
    basis: 'paid_only', selected_enrollment_ids: [10], confirmed_checks: [], issues: [],
    scenario: { first_lesson_date: '2026-12-04', slots: [{ weekday: 'Fri', location: 'MSA' }], mode: 'transition', payment_method: 'manual', materials_fee: 0, trial_deduction: false, mandate_ready: false },
    message: { template_version: 'v1', zh: '中文收費通知', en: 'English fee message', blocked_reasons: [] },
    period: {
      number: 1, kind: 'transition', explanation: 'December sessions.', coverage_from: '2026-12-01', coverage_through: '2026-12-31',
      first_lesson_date: '2026-12-04', last_lesson_date: '2026-12-18', lesson_count: 3,
      counts_by_month: [{ month: '2026-12', lessons: 3 }], counts_by_slot: [3], lessons: [],
      gross_tuition: 1200, deductions: [], tuition_after_deductions: 1200, materials_fee: 0, total_fee: 1200,
      adjustment_reason: null, requires_review: false,
      collection: { method: 'manual', notice_from: '2026-11-12', notice_to: '2026-11-18', debit_from: null, debit_to: null, due_before_lesson: '2026-12-04', gap_min_days: null, gap_max_days: null },
    },
  };
}
function draft(): BillingDraftDetail {
  return { id: 'draft-1', student_id: 4, state: 'active', current_revision: 2, revision: 2, note: null, created_at: '2026-11-14T12:00:00+08:00', created_by_name: 'Admin', can_copy: true, stale_reasons: [], confirmed_payment_id: null, history: [], review: review() };
}
function payment(): BillingPaymentDetail {
  return { id: 'payment-1', student_id: 4, version: 2, status: 'Pending Payment', review: review(), lines: [], created_at: '2026-11-14T12:00:00+08:00',
    sent_at: null, sent_language: null, paid_at: null, payment_date: null, received_method: null, receipt_reference: null, coupon_status: 'none', note: null, can_copy: true, review_issues: [], history: [] };
}
function row(overrides: Partial<BillingQueueRow> = {}): BillingQueueRow {
  return { key: 'student-4', student: review().student, stage: 'prepare', origin: 'projection', payment_method: 'manual', collection: review().period.collection,
    first_lesson_date: '2026-12-04', coverage_through: '2026-12-31', lesson_count: 3, total_fee: 1200, amount_basis: 'tuition_only',
    prepare_on: '2026-11-12', due_date: '2026-12-04', overdue: false, ready_now: true, draft_id: null, payment_id: null,
    enrollment_ids: [10], payment_ids: [], issues: [], note: '', action_url: '/billing/students/4', ...overrides };
}
function show(kind: 'draft' | 'payment' | 'legacy' = 'draft') {
  return render(<BillingCardFeeMessage target={{ kind, id: kind === 'legacy' ? 10 : `${kind}-1`, studentId: 4 } as Parameters<typeof BillingCardFeeMessage>[0]['target']} onClose={vi.fn()} onChanged={vi.fn()} />);
}
async function copy() {
  await screen.findByRole('textbox', { name: 'Chinese fee message' });
  fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));
}
beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Admin', isAdmin: true, isReadOnly: false });
  mocks.draft.mockResolvedValue(draft()); mocks.payment.mockResolvedValue(payment());
  mocks.enrollment.mockResolvedValue({ id: 10, student_id: 4, enrollment_type: 'Regular', lessons_paid: 4, payment_status: 'Pending Payment', fee_message_sent: false });
  mocks.clipboard.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mocks.clipboard } });
});

describe('renewal card fee target', () => {
  it('uses one reviewed target, including one payment with two teaching enrollments', () => {
    expect(cardFeeMessageTarget(row({ origin: 'draft', draft_id: 'draft-1' }))).toEqual({ kind: 'draft', id: 'draft-1', studentId: 4 });
    expect(cardFeeMessageTarget(row({ origin: 'payment', payment_id: 'payment-1', payment_ids: ['payment-1'], enrollment_ids: [10, 11] }))).toEqual({ kind: 'payment', id: 'payment-1', studentId: 4 });
    expect(cardFeeMessageTarget(row({ origin: 'legacy' }))).toEqual({ kind: 'legacy', id: 10, studentId: 4 });
  });
  it.each([
    row(), row({ stage: 'no_payment', origin: 'draft', draft_id: 'draft-1' }),
    row({ origin: 'legacy', enrollment_ids: [10, 11] }),
    row({ origin: 'legacy', payment_ids: ['payment-1'] }),
    row({ origin: 'payment', payment_id: 'payment-1', payment_ids: ['payment-1', 'payment-2'] }),
    row({ origin: 'draft', draft_id: 'draft-1', payment_id: 'payment-1' }),
  ])('does not invent a message or select one of ambiguous records (%j)', value => {
    expect(cardFeeMessageTarget(value)).toBeNull();
  });
});

describe('reviewed card fee message', () => {
  it.each(['draft', 'payment'] as const)('refetches the exact %s before copying and shows local success', async kind => {
    show(kind); await copy();
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('Message copied.');
    expect(mocks.clipboard).toHaveBeenCalledWith('中文收費通知');
    expect(mocks[kind]).toHaveBeenCalledTimes(2);
    expect(mocks.legacy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.queryByText('Message copied.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));
    await waitFor(() => expect(mocks.clipboard).toHaveBeenLastCalledWith('English fee message'));
  });
  it.each([
    ['discarded', { state: 'discarded' }],
    ['confirmed', { confirmed_payment_id: 'payment-1' }],
    ['old revision', { current_revision: 3 }],
    ['stale source', { stale_reasons: ['Calendar changed.'] }],
    ['not copyable', { can_copy: false }],
  ])('blocks a %s draft that changes after expansion', async (_reason, change) => {
    mocks.draft.mockResolvedValueOnce(draft()).mockResolvedValueOnce({ ...draft(), ...change });
    show(); await copy();
    await screen.findByText('The fee message changed. Check it before copying.');
    expect(mocks.clipboard).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Copy message' })).toBeDisabled();
  });
  it.each(['Paid', 'Cancelled'] as const)('blocks a payment that becomes %s before copying', async status => {
    mocks.payment.mockResolvedValueOnce(payment()).mockResolvedValueOnce({ ...payment(), status });
    show('payment'); await copy();
    await screen.findByText('This payment is no longer awaiting collection.');
    expect(mocks.clipboard).not.toHaveBeenCalled();
  });
  it.each(['version', 'review hash', 'message blocked', 'integrity issues'] as const)('refuses changed payment %s on the copy recheck', async kind => {
    const fresh = payment();
    if (kind === 'version') fresh.version++;
    else if (kind === 'review hash') fresh.review.review_hash = 'changed';
    else if (kind === 'message blocked') fresh.review.message.blocked_reasons = ['Check coupon expiry.'];
    else fresh.review_issues = ['Enrollment amount changed.'];
    mocks.payment.mockResolvedValueOnce(payment()).mockResolvedValueOnce(fresh);
    show('payment'); await copy();
    await screen.findByText('The fee message changed. Check it before copying.');
    expect(mocks.clipboard).not.toHaveBeenCalled();
  });
  it.each(['draft', 'payment'] as const)('rejects a %s belonging to another student before exposing its text', async kind => {
    mocks[kind].mockResolvedValue({ ...(kind === 'draft' ? draft() : payment()), student_id: 99 });
    show(kind);
    expect(await screen.findByRole('alert')).toHaveTextContent('These records belong to another student or payment.');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(mocks.clipboard).not.toHaveBeenCalled();
  });
  it('masks a failed source recheck until Retry message succeeds', async () => {
    mocks.draft.mockResolvedValueOnce(draft()).mockRejectedValueOnce(new Error('Could not refresh source.')).mockResolvedValue(draft());
    show(); await copy();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not refresh source.');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy message' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry message' }));
    await screen.findByRole('textbox', { name: 'Chinese fee message' });
    expect(screen.getByRole('button', { name: 'Copy message' })).toBeEnabled();
    expect(mocks.clipboard).not.toHaveBeenCalled();
  });
  it('keeps verified text available after clipboard denial and permits another attempt', async () => {
    mocks.clipboard.mockRejectedValueOnce(new Error('Clipboard denied.')).mockResolvedValue(undefined);
    show(); await copy();
    expect(await screen.findByRole('alert')).toHaveTextContent('Clipboard denied.');
    expect(screen.getByRole('textbox')).toHaveValue('中文收費通知');
    expect(screen.getByRole('button', { name: 'Copy message' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));
    await screen.findByRole('button', { name: 'Copied' });
    expect(mocks.draft).toHaveBeenCalledTimes(3);
  });
  it('passes tutor scope on both reads while exposing only copy controls', async () => {
    mocks.auth.mockReturnValue({ user: { id: 7 }, effectiveRole: 'Tutor', isAdmin: false, isReadOnly: true });
    show('payment'); await copy();
    await screen.findByRole('button', { name: 'Copied' });
    expect(mocks.payment).toHaveBeenNthCalledWith(1, 'payment-1', 7, expect.any(AbortSignal));
    expect(mocks.payment).toHaveBeenNthCalledWith(2, 'payment-1', 7, expect.any(AbortSignal));
    expect(screen.queryByRole('button', { name: /Mark.*sent|Record payment/ })).not.toBeInTheDocument();
  });
  it('aborts an in-flight copy on target change and does not copy its late result', async () => {
    let resolve!: (value: BillingDraftDetail) => void;
    mocks.draft.mockResolvedValueOnce(draft()).mockImplementationOnce(() => new Promise<BillingDraftDetail>(done => { resolve = done; }));
    const view = show(); await copy();
    await waitFor(() => expect(mocks.draft).toHaveBeenCalledTimes(2));
    const signal = mocks.draft.mock.calls[1][2] as AbortSignal;
    view.rerender(<BillingCardFeeMessage target={{ kind: 'payment', id: 'payment-1', studentId: 4 }} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(draft()));
    await screen.findByRole('textbox', { name: 'Chinese fee message' });
    expect(mocks.clipboard).not.toHaveBeenCalled();
  });
});

describe('legacy card fee message', () => {
  it('uses the fetched enrollment ID and actual four-lesson count, and preserves its callbacks', async () => {
    const close = vi.fn(), changed = vi.fn();
    render(<BillingCardFeeMessage target={{ kind: 'legacy', id: 10, studentId: 4 }} onClose={close} onChanged={changed} />);
    await screen.findByTestId('legacy-message');
    expect(mocks.enrollment).toHaveBeenCalledWith(10);
    expect(mocks.legacy.mock.lastCall![0].enrollment).toMatchObject({ id: 10, student_id: 4, renewal_enrollment_id: 10, renewal_lessons_paid: 4, renewal_status: 'pending_message' });
    fireEvent.click(screen.getByRole('button', { name: 'Legacy close' })); expect(close).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Legacy sent' })); expect(changed).toHaveBeenCalledOnce();
  });
  it('switches to the combined message if the legacy enrollment has since been adopted', async () => {
    mocks.enrollment.mockResolvedValue({ id: 10, student_id: 4, billing_payment_id: 'payment-1' });
    show('legacy');
    await screen.findByRole('textbox', { name: 'Chinese fee message' });
    expect(mocks.payment).toHaveBeenCalledWith('payment-1', undefined, expect.any(AbortSignal));
    expect(mocks.legacy).not.toHaveBeenCalled();
  });
  it.each([
    [{ student_id: 99 }, 'These records belong to another student.'],
    [{ enrollment_type: 'Summer' }, 'Open this enrollment to use its Summer fee message.'],
    [{ payment_status: 'Paid' }, 'This enrollment is no longer awaiting payment.'],
    [{ lessons_paid: 0 }, 'Check the enrollment’s lesson count first.'],
  ])('withholds unsuitable legacy messages (%j)', async (change, expected) => {
    mocks.enrollment.mockResolvedValue({ id: 10, student_id: 4, enrollment_type: 'Regular', lessons_paid: 4, payment_status: 'Pending Payment', ...change });
    show('legacy');
    expect(await screen.findByRole('alert')).toHaveTextContent(expected);
    expect(mocks.legacy).not.toHaveBeenCalled();
  });
  it('reports a failed enrollment read without invoking the old generator', async () => {
    mocks.enrollment.mockRejectedValue(new Error('Could not fetch enrollment.'));
    show('legacy');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not fetch enrollment.');
    expect(mocks.legacy).not.toHaveBeenCalled();
  });
});
