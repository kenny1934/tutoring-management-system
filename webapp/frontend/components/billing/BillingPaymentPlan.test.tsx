import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingPaymentSettings } from './BillingPaymentSettings';
import { BillingPreview } from './BillingPreview';
import type { BillingDraftReview, BillingDraftReviewRequest, BillingMethod, BillingPeriod, BillingPreviewRequest, BillingPreviewResponse } from '@/types/billing';

const mocks = vi.hoisted(() => ({ preview: vi.fn(), draftReview: vi.fn(), saveDraft: vi.fn(), preferences: vi.fn(), savePreferences: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 }, effectiveRole: 'Admin', isAdmin: true, isLoading: false, isGuest: false }) }));
vi.mock('@/lib/hooks', () => ({ usePageTitle: vi.fn() }));
vi.mock('@/lib/api', () => ({ statsAPI: { getLocations: async () => ['MSA'] } }));
vi.mock('@/lib/renewal-queue', () => ({ invalidateRenewalQueueCache: vi.fn() }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: { ...mocks, options: async () => ({
  academic_start: '2026-09-01', first_payment_from: '2026-10-30', regular_end: '2027-07-04', makeup_end: '2027-06-30',
  unit_fee: 400, first_minimum: 6, ordinary_coupon_minimum: 4, policy_version: 'test', draft_storage_available: true,
}) } }));

const scenario: BillingPreviewRequest = {
  first_lesson_date: '2026-11-14', mode: 'transition', payment_method: 'manual',
  slots: [{ weekday: 'Sat', time_slot: '16:45 - 18:15', location: 'MSA' }],
  materials_fee: 0, trial_deduction: false, mandate_ready: false,
};
function period(number: number, kind: string, method: BillingMethod, firstDate = '2026-11-14'): BillingPeriod {
  return {
    number, kind, explanation: '', coverage_from: firstDate, coverage_through: '2026-12-31',
    first_lesson_date: firstDate, last_lesson_date: '2026-12-19', lesson_count: 6, counts_by_month: [{ month: '2026-11', lessons: 6 }], counts_by_slot: [6],
    lessons: [{ date: firstDate, weekday: 'Sat', slot: 0, time_slot: '16:45 - 18:15', location: 'MSA', holiday_exception: false }],
    gross_tuition: 2400, deductions: [], tuition_after_deductions: 2400, materials_fee: 0, total_fee: 2400, adjustment_reason: null, requires_review: false,
    collection: { method, due_before_lesson: method === 'manual' ? firstDate : null,
      notice_from: null, notice_to: null, debit_from: method === 'autopay' ? '2026-12-20' : null,
      debit_to: method === 'autopay' ? '2026-12-22' : null, gap_min_days: null, gap_max_days: null },
  };
}
function calculation(request: BillingPreviewRequest): BillingPreviewResponse {
  const first = request.first_lesson_date === '2026-12-05'
    ? period(1, 'transition', request.payment_method, request.first_lesson_date)
    : period(1, 'adjusted_manual', 'manual', request.first_lesson_date);
  return {
    payment_method: request.payment_method, policy_version: 'test', regular_end_date: '2027-07-04', makeup_end_date: '2027-06-30',
    monthly: request.payment_method === 'autopay', is_preview: true, creates_records: false, requires_review: false,
    issues: [], excluded_holidays: [], skipped_collections: [], periods: [first, period(2, 'regular', request.payment_method)],
  };
}
function reviewed(request: BillingDraftReviewRequest): BillingDraftReview {
  return {
    student: { id: 4, student_name: 'Example student', school_student_id: '004', home_location: 'MSA', grade: 'F1', is_staff_referral: false },
    source_fingerprint: request.expected_source_fingerprint, evidence_hash: 'evidence', calendar_hash: 'calendar', policy_version: 'test',
    scenario: request.scenario, basis: request.basis, selected_enrollment_ids: request.selected_enrollment_ids, confirmed_checks: [],
    review_hash: `review-${request.scenario.payment_method}`, issues: [], period: calculation(request.scenario).periods[request.period_number - 1],
    message: { template_version: 'v1', zh: `${request.scenario.payment_method} fee message`, en: 'Fee message', blocked_reasons: [] },
  };
}
function SharedPreview({ firstDate = scenario.first_lesson_date, refreshing = false }: { firstDate?: string; refreshing?: boolean }) {
  const [method, setMethod] = useState<BillingMethod | null>('manual');
  return <>
    <BillingPaymentSettings studentId={4} recordedMethod="manual" onSaved={vi.fn()} presentation="inline" previewMethod={method} onPreviewMethod={setMethod} />
    {method && <BillingPreview focused embedded sourceKey="unchanged-source" sourceLoading={refreshing}
      initialRequest={{ ...scenario, first_lesson_date: firstDate, payment_method: method }}
      draftContext={{ studentId: 4, basis: 'include_pending', selectedEnrollmentIds: [10], sourceFingerprint: 'unchanged-source' }} />}
  </>;
}
function Wrapper({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnFocus: false, shouldRetryOnError: false }}>{children}</SWRConfig>;
}
function currentPayment() {
  return screen.getByText('This payment').closest('div')!;
}
beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.preview.mockImplementation(async (request: BillingPreviewRequest) => calculation(request));
  mocks.draftReview.mockImplementation(async (_id: number, request: BillingDraftReviewRequest) => reviewed(request));
  mocks.saveDraft.mockResolvedValue({ id: 'draft-1', revision: 1 });
});

describe('shared payment-plan recalculation', () => {
  it('recalculates immediately with an unchanged source key while retaining the actual manual transition collection', async () => {
    let resolveAutopay!: (value: BillingPreviewResponse) => void;
    const autopay = new Promise<BillingPreviewResponse>(resolve => { resolveAutopay = resolve; });
    mocks.preview.mockImplementation((request: BillingPreviewRequest) => request.payment_method === 'autopay' ? autopay : Promise.resolve(calculation(request)));
    const view = render(<SharedPreview />, { wrapper: Wrapper });
    expect(await screen.findByRole('textbox', { name: 'Chinese fee message' })).toHaveValue('manual fee message');
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.change(screen.getByLabelText('Payment plan'), { target: { value: 'autopay' } });
    expect(screen.queryByRole('textbox', { name: 'Chinese fee message' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ payment_method: 'autopay' }), expect.any(AbortSignal)));
    await act(async () => resolveAutopay(calculation({ ...scenario, payment_method: 'autopay' })));
    expect(await screen.findByRole('textbox', { name: 'Chinese fee message' })).toHaveValue('autopay fee message');
    expect(within(currentPayment()).getByText('Manual')).toBeVisible();
    expect(screen.getByText('Manual payment is needed before the first bank collection run.')).toBeVisible();
    expect(screen.getByText('Next planned debit: Dec 20, 2026 to Dec 22, 2026.')).toBeVisible();
    expect(mocks.draftReview).toHaveBeenLastCalledWith(4, expect.objectContaining({
      scenario: expect.objectContaining({ payment_method: 'autopay' }), expected_source_fingerprint: 'unchanged-source',
    }), expect.any(AbortSignal), undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalled());
    const payload = mocks.saveDraft.mock.calls[0][1];
    expect(payload.expected_review_hash).toBe('review-autopay');
    expect(payload.review.scenario.payment_method).toBe('autopay');
    expect(payload.review.expected_source_fingerprint).toBe('unchanged-source');
    expect(payload).not.toHaveProperty('calculation');
    expect(payload.review).not.toHaveProperty('calculation');
    expect(mocks.preferences).not.toHaveBeenCalled();
    expect(mocks.savePreferences).not.toHaveBeenCalled();
    view.rerender(<SharedPreview refreshing />);
    expect(screen.queryByText(/Next planned debit:/)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Chinese fee message' })).not.toBeInTheDocument();
  });

  it('changes a regular collection to Autopay immediately and Cancel restores the earlier manual preview', async () => {
    render(<SharedPreview firstDate="2026-12-05" />, { wrapper: Wrapper });
    await screen.findByRole('textbox', { name: 'Chinese fee message' });
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.change(screen.getByLabelText('Payment plan'), { target: { value: 'autopay' } });
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Chinese fee message' })).toHaveValue('autopay fee message'));
    expect(within(currentPayment()).getByText('Autopay')).toBeVisible();
    expect(screen.queryByText(/collected manually/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Next planned debit:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('textbox', { name: 'Chinese fee message' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Chinese fee message' })).toHaveValue('manual fee message'));
    expect(within(currentPayment()).getByText('Manual')).toBeVisible();
    expect(mocks.savePreferences).not.toHaveBeenCalled();
  });
});
