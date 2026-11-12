import { act, fireEvent, render as renderBase, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { BillingPreview } from './BillingPreview';
import type { BillingCouponBalance, BillingPreviewRequest, BillingPreviewResponse } from '@/types/billing';

const mocks = vi.hoisted(() => ({ preview: vi.fn(), auth: vi.fn(), params: vi.fn(), review: vi.fn(), coupons: undefined as BillingCouponBalance | undefined, checkingCoupons: false, couponError: undefined as Error | undefined, tutors: [] as { id: number; tutor_name: string; default_location: string; is_active_tutor?: boolean; departure_effective_on?: string }[] }));
const options = {
  academic_start: '2026-09-01', first_payment_from: '2026-10-30', regular_end: '2027-07-04', makeup_end: '2027-06-30',
  unit_fee: 400, first_minimum: 6, ordinary_coupon_minimum: 4, policy_version: 'test',
};
vi.mock('./BillingCouponPanel', () => ({ BillingCouponPanel: () => null }));
vi.mock('next/navigation', () => ({ useSearchParams: mocks.params }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/lib/hooks', () => ({ usePageTitle: vi.fn() }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: { options: vi.fn(), preview: mocks.preview } }));
vi.mock('swr', () => ({ default: (key: string | unknown[] | null) => Array.isArray(key) && key[0] === 'billing-coupons' ? { data: mocks.coupons, isValidating: mocks.checkingCoupons, error: mocks.couponError, mutate: vi.fn() } : ({ data: key === 'tutors' ? mocks.tutors : key === 'locations' ? ['MSA', 'Various', 'MSB', 'All Locations'] : options, mutate: vi.fn() }) }));
vi.mock('@/components/layout/PageSurface', () => ({ PageSurface: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

vi.mock('./BillingDraftReview', () => ({ billingDraftAuthScope: () => 'admin-1', billingDraftTutorId: () => undefined, BillingDraftReview: (props: { inline?: boolean; reviewRequest: { period_number: number } }) => { mocks.review(props); return <p>Review period {props.reviewRequest.period_number}</p>; } }));

function response(): BillingPreviewResponse {
  return {
    policy_version: 'test', regular_end_date: '2027-07-04', makeup_end_date: '2027-06-30', payment_method: 'manual',
    monthly: true, is_preview: true, creates_records: false, requires_review: false, issues: [], excluded_holidays: [],
    skipped_collections: [{ month: '2026-12', covered_by_period: 1, reason: 'January is already included in payment 1.' }],
    periods: [{
      number: 1, kind: 'first', explanation: 'Six lessons across the weekly slots.', coverage_from: '2026-11-10',
      coverage_through: '2026-11-30', first_lesson_date: '2026-11-10', last_lesson_date: '2026-11-26',
      lesson_count: 6, counts_by_month: [{ month: '2026-11', lessons: 6 }], counts_by_slot: [3, 3],
      lessons: [{ date: '2026-11-10', slot: 0, weekday: 'Tue', time_slot: '16:45 - 18:15', location: 'MSA', holiday_exception: false }],
      gross_tuition: 2400, deductions: [{ kind: 'trial', amount: 150 }], tuition_after_deductions: 2250,
      materials_fee: 0, total_fee: 2250, adjustment_reason: null, requires_review: false,
      collection: { method: 'manual', due_before_lesson: '2026-11-10', notice_from: null, notice_to: null,
        debit_from: null, debit_to: null, gap_min_days: null, gap_max_days: null },
    }],
  };
}

function render(ui: React.ReactElement) {
  const view = renderBase(ui);
  fireEvent.click(screen.getByRole('button', { name: 'Edit preview' }));
  return view;
}

async function calculate() {
  await act(async () => { vi.advanceTimersByTime(301); await Promise.resolve(); });
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.params.mockReturnValue(new URLSearchParams());
  mocks.auth.mockReturnValue({ user: { id: 1 }, isLoading: false, isAdmin: false, isGuest: false });
  mocks.preview.mockReset().mockResolvedValue(response());
  mocks.review.mockReset();
  mocks.coupons = { student_id: 4, storage_available: true, writes_available: true, version: 1,
    observation: null, checked_at: null, checked_by: null, reserved_count: 0, receipt_pending_count: 0,
    used_awaiting_sync_count: 0, usable_count: 0, groups: [], issues: [], uses: [], can_verify: true };
  mocks.checkingCoupons = false; mocks.couponError = undefined;
  mocks.tutors = [{ id: 9, tutor_name: 'Tutor Nine', default_location: 'MSA' }, { id: 12, tutor_name: 'Tutor Twelve', default_location: 'MSA' }, { id: 13, tutor_name: 'Tutor Other', default_location: 'MSB' }];
});
afterEach(() => vi.useRealTimers());

describe('enrollment fee preview', () => {
  it('preselects the earliest eligible coupon and respects an explicit No coupon afterwards', async () => {
    mocks.coupons = { ...mocks.coupons!, observation: { id: 'obs', remaining_count: 2, observed_on: '2026-11-01', processed_at: '2026-11-01', source_filename: 'fixture.xls' },
      checked_at: '2026-11-01', usable_count: 2, groups: [
        { key: 'later', kind: 'ordinary', value: 300, expires_on: '2027-06-30', quantity: 1, usable_count: 1 },
        { key: 'earlier', kind: 'ordinary', value: 200, expires_on: '2026-12-31', quantity: 1, usable_count: 1 },
      ] };
    mocks.preview.mockImplementation(async (scenario: BillingPreviewRequest) => {
      const data = response(); data.periods[0].deductions = scenario.coupon ? [{ kind: scenario.coupon.kind, amount: scenario.coupon.value }] : [];
      return data;
    });
    const initial = { first_lesson_date: '2026-11-10', mode: 'transition' as const, payment_method: 'manual' as const, slots: [{ weekday: 'Tue' as const }], materials_fee: 0, trial_deduction: false, mandate_ready: false };
    const props = { focused: true, initialRequest: initial, renewalSource: { scenario: initial, enrollmentIds: [7], tutorNames: ['Fixture'] }, draftContext: { studentId: 4, basis: 'include_pending' as const, selectedEnrollmentIds: [7], sourceFingerprint: 'source' } };
    const view = renderBase(<BillingPreview {...props} />);
    expect(mocks.review).not.toHaveBeenCalled();
    await calculate();
    expect(screen.getByRole('combobox', { name: 'Coupon' })).toHaveValue('earlier');
    expect(mocks.review).not.toHaveBeenCalled();
    await calculate();
    expect(mocks.review).toHaveBeenLastCalledWith(expect.objectContaining({ reviewRequest: expect.objectContaining({ scenario: expect.objectContaining({ coupon: expect.objectContaining({ value: 200 }) }) }) }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Coupon' }), { target: { value: '' } });
    await calculate();
    mocks.coupons = { ...mocks.coupons, version: 2 };
    view.rerender(<BillingPreview {...props} />);
    await calculate();
    expect(screen.getByRole('combobox', { name: 'Coupon' })).toHaveValue('');
    expect(mocks.review).toHaveBeenLastCalledWith(expect.objectContaining({ reviewRequest: expect.objectContaining({ scenario: expect.objectContaining({ coupon: null }) }) }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Coupon' }), { target: { value: 'later' } });
    await calculate();
    expect(screen.getByRole('combobox', { name: 'Coupon' })).toHaveValue('later');
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ coupon: expect.objectContaining({ value: 300 }) }), expect.any(AbortSignal));
  });

  it.each(['loading', 'failed'])('waits for coupon evidence before pricing a renewal (%s)', async state => {
    mocks.coupons = undefined;
    mocks.checkingCoupons = state === 'loading';
    mocks.couponError = state === 'failed' ? new Error('Offline') : undefined;
    const initial = { first_lesson_date: '2026-11-10', mode: 'transition' as const, payment_method: 'manual' as const, slots: [{ weekday: 'Tue' as const }], materials_fee: 0, trial_deduction: false, mandate_ready: false };
    renderBase(<BillingPreview focused initialRequest={initial} renewalSource={{ scenario: initial, enrollmentIds: [7], tutorNames: ['Fixture'] }} draftContext={{ studentId: 4, basis: 'include_pending', selectedEnrollmentIds: [7], sourceFingerprint: 'source' }} />);
    await calculate();
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.review).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Coupon' })).toHaveValue('__suggesting');
    fireEvent.change(screen.getByRole('combobox', { name: 'Coupon' }), { target: { value: '' } });
    await calculate();
    expect(mocks.review).toHaveBeenLastCalledWith(expect.objectContaining({ reviewRequest: expect.objectContaining({ scenario: expect.objectContaining({ coupon: null }) }) }));
  });

  it('explains three-session ineligibility and explicitly includes January without changing Autopay', async () => {
    mocks.coupons = { ...mocks.coupons!, observation: { id: 'obs', remaining_count: 2, observed_on: '2026-11-01', processed_at: '2026-11-01', source_filename: 'fixture.xls' },
      checked_at: '2026-11-01', usable_count: 2, groups: [
        { key: 'later300', kind: 'ordinary', value: 300, expires_on: '2027-06-30', quantity: 1, usable_count: 1 },
        { key: 'earlier200', kind: 'ordinary', value: 200, expires_on: '2026-12-31', quantity: 1, usable_count: 1 },
      ] };
    mocks.preview.mockImplementation(async (scenario: BillingPreviewRequest) => {
      const data = response(); const combined = !!scenario.coupon?.combine_next_month && !!scenario.coupon.allow_transition_combination;
      const count = combined ? 8 : 3; const discount = combined ? scenario.coupon!.value : 0;
      data.payment_method = scenario.payment_method;
      data.periods[0] = { ...data.periods[0], kind: 'transition', first_lesson_date: '2026-12-05', coverage_from: '2026-12-05',
        coverage_through: combined ? '2027-01-31' : '2026-12-31', last_lesson_date: combined ? '2027-01-30' : '2026-12-19',
        lesson_count: count, gross_tuition: count * 400, total_fee: count * 400 - discount,
        tuition_after_deductions: count * 400 - discount, deductions: discount ? [{ kind: 'ordinary', amount: discount }] : [],
        counts_by_month: [{ month: '2026-12', lessons: 3 }, ...(combined ? [{ month: '2027-01', lessons: 5 }] : [])] };
      data.coupon_options = scenario.coupon ? [{ period_number: 1, applied: combined, reason: combined ? null : 'min_sessions', minimum_sessions: 4,
        can_include_next_month: true, include_next_month_reason: null, include_next_month: '2027-01-01', next_month_included: combined }] : [];
      data.skipped_collections = combined ? [{ month: '2026-12', covered_by_period: 1, reason: 'January is already included.' }] : [];
      return data;
    });
    const initial: BillingPreviewRequest = { first_lesson_date: '2026-12-05', mode: 'transition', payment_method: 'autopay', slots: [{ weekday: 'Sat', time_slot: '16:15 - 17:45', location: 'MSB' }], materials_fee: 0, trial_deduction: false, mandate_ready: true };
    renderBase(<BillingPreview focused initialRequest={initial} renewalSource={{ scenario: initial, enrollmentIds: [7], tutorNames: ['Fixture'] }} draftContext={{ studentId: 4, basis: 'include_pending', selectedEnrollmentIds: [7], sourceFingerprint: 'source' }} />);
    await calculate(); await calculate();
    const coupon = screen.getByRole('combobox', { name: 'Coupon' });
    expect(coupon).toHaveValue('');
    expect(screen.getByText('This enrollment has 3 sessions. At least 4 are required.')).toBeVisible();
    const include = screen.getByRole('checkbox', { name: 'Include January' });
    expect(include).toBeVisible(); expect(include).toBeEnabled(); expect(include).not.toBeChecked();
    fireEvent.click(include); await calculate();
    expect(coupon).toHaveValue('earlier200'); expect(include).toBeChecked();
    expect(mocks.review).toHaveBeenLastCalledWith(expect.objectContaining({
      reviewRequest: expect.objectContaining({ scenario: expect.objectContaining({ payment_method: 'autopay', coupon: expect.objectContaining({ value: 200, combine_next_month: true, allow_transition_combination: true }) }) }),
      calculation: expect.objectContaining({ periods: [expect.objectContaining({ coverage_through: '2027-01-31', lesson_count: 8, total_fee: 3000 })], skipped_collections: [expect.objectContaining({ month: '2026-12' })] }),
    }));
    expect(screen.queryByText(/Coupon not applied/)).not.toBeInTheDocument();
    fireEvent.click(include); await calculate();
    expect(include).not.toBeChecked(); expect(coupon).toHaveValue('earlier200');
    expect(screen.getByText('Coupon not applied. This enrollment has 3 sessions. At least 4 are required.')).toBeVisible();
    expect(mocks.review).toHaveBeenLastCalledWith(expect.objectContaining({ calculation: expect.objectContaining({ periods: [expect.objectContaining({ lesson_count: 3, total_fee: 1200 })] }) }));
    fireEvent.change(coupon, { target: { value: '' } }); await calculate();
    expect(coupon).toHaveValue('');
    expect(screen.queryByText(/Coupon not applied/)).not.toBeInTheDocument();
  });

  it('includes February for a later regular period without opting December into January', async () => {
    mocks.coupons = { ...mocks.coupons!, observation: { id: 'obs', remaining_count: 1, observed_on: '2026-11-01', processed_at: '2026-11-01', source_filename: 'fixture.xls' }, checked_at: '2026-11-01', usable_count: 1,
      groups: [{ key: 'staff', kind: 'staff', value: 500, expires_on: '2027-06-30', quantity: 1, usable_count: 1 }] };
    mocks.preview.mockImplementation(async (scenario: BillingPreviewRequest) => {
      const data = response(); const combined = !!scenario.coupon?.combine_next_month && !scenario.coupon.allow_transition_combination;
      data.periods = [
        { ...data.periods[0], kind: 'transition', number: 1, first_lesson_date: '2026-12-05', coverage_from: '2026-12-05', coverage_through: '2026-12-31', lesson_count: 3, deductions: [], total_fee: 1200 },
        { ...data.periods[0], kind: 'regular', number: 2, first_lesson_date: '2027-01-02', coverage_from: '2027-01-02', coverage_through: combined ? '2027-02-28' : '2027-01-31', lesson_count: combined ? 9 : 5, deductions: combined ? [{ kind: 'staff', amount: 500 }] : [], total_fee: combined ? 3100 : 2000 },
      ];
      data.coupon_options = scenario.coupon ? [
        { period_number: 1, applied: false, reason: 'min_sessions', minimum_sessions: 6, can_include_next_month: true, include_next_month_reason: null, include_next_month: '2027-01-01', next_month_included: false },
        { period_number: 2, applied: combined, reason: combined ? null : 'two_months', minimum_sessions: null, can_include_next_month: true, include_next_month_reason: null, include_next_month: '2027-02-01', next_month_included: combined },
      ] : [];
      return data;
    });
    const initial: BillingPreviewRequest = { first_lesson_date: '2026-12-05', mode: 'transition', payment_method: 'autopay', slots: [{ weekday: 'Sat' }], materials_fee: 0, trial_deduction: false, mandate_ready: true };
    renderBase(<BillingPreview focused focusedPeriodNumber={2} initialRequest={initial} renewalSource={{ scenario: initial, enrollmentIds: [7], tutorNames: ['Fixture'] }} draftContext={{ studentId: 4, basis: 'include_pending', selectedEnrollmentIds: [7], sourceFingerprint: 'source' }} />);
    await calculate(); await calculate();
    const include = screen.getByRole('checkbox', { name: 'Include February' }); expect(include).toBeEnabled();
    fireEvent.click(include); await calculate();
    expect(include).toBeChecked();
    const last = mocks.review.mock.lastCall![0];
    expect(last.reviewRequest.period_number).toBe(2);
    expect(last.reviewRequest.scenario.coupon).toMatchObject({ kind: 'staff', combine_next_month: true });
    expect(last.reviewRequest.scenario.coupon).not.toHaveProperty('allow_transition_combination');
    expect(last.calculation.periods[0]).toMatchObject({ coverage_through: '2026-12-31', lesson_count: 3, total_fee: 1200 });
    expect(last.calculation.periods[1]).toMatchObject({ coverage_through: '2027-02-28', lesson_count: 9, total_fee: 3100 });
  });

  it('preserves an old saved transition scenario whose combination belongs to a later regular period', async () => {
    const initial: BillingPreviewRequest = { first_lesson_date: '2026-12-05', mode: 'transition', payment_method: 'autopay', slots: [{ weekday: 'Sat' }], materials_fee: 0, trial_deduction: false, mandate_ready: true,
      coupon: { kind: 'staff', value: 500, expires_on: '2027-06-30', available_count: 1, verified: true, combine_next_month: true } };
    render(<BillingPreview embedded initialRequest={initial} />);
    await calculate();
    expect(screen.getByRole('checkbox', { name: 'Include the next month if needed for this coupon' })).toBeChecked();
    for (const [request] of mocks.preview.mock.calls) {
      expect(request.coupon.combine_next_month).toBe(true);
      expect(request.coupon).not.toHaveProperty('allow_transition_combination');
    }
  });

  it('uses a verified ledger coupon for renewal without editable KMS fields and invalidates changed evidence', async () => {
    mocks.coupons = { student_id: 4, storage_available: true, writes_available: true, version: 3,
      observation: { id: 'obs', remaining_count: 2, observed_on: '2026-11-01', processed_at: '2026-11-01', source_filename: 'fixture.xls' },
      reserved_count: 1, receipt_pending_count: 0, used_awaiting_sync_count: 0, usable_count: 1,
      groups: [{ key: 'ordinary', kind: 'ordinary', value: 300, expires_on: '2027-06-30', quantity: 2, usable_count: 1 }],
      checked_at: '2026-11-01', checked_by: 'Fixture', issues: [], uses: [], can_verify: true };
    const initial = { first_lesson_date: '2026-11-10', mode: 'transition' as const, payment_method: 'manual' as const, slots: [{ weekday: 'Tue' as const }], materials_fee: 0, trial_deduction: false, mandate_ready: false };
    const props = { focused: true, embedded: true, initialRequest: initial, renewalSource: { scenario: initial, enrollmentIds: [7], tutorNames: ['Fixture'] }, draftContext: { studentId: 4, basis: 'include_pending' as const, selectedEnrollmentIds: [7], sourceFingerprint: 'source' } };
    const view = renderBase(<BillingPreview {...props} />);
    await calculate();
    fireEvent.change(screen.getByRole('combobox', { name: 'Coupon' }), { target: { value: 'ordinary' } });
    await calculate();
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ coupon: {
      kind: 'ordinary', value: 300, expires_on: '2027-06-30', available_count: 1, verified: true, combine_next_month: false,
    } }), expect.any(AbortSignal));
    expect(screen.queryByLabelText('Coupon amount')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Coupon expiry')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Remaining coupon count')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Checked in KMS')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Include next month/ })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Manage student coupons' })).toHaveAttribute('href', '/students/4#student-coupons');
    const callsBeforeStudentChange = mocks.preview.mock.calls.length;
    view.rerender(<BillingPreview {...props} draftContext={{ ...props.draftContext, studentId: 5 }} />);
    await calculate();
    expect(mocks.preview).toHaveBeenCalledTimes(callsBeforeStudentChange);
    expect(screen.getByText('Check coupons or select No coupon to continue.')).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Coupon' })).toHaveValue('__changed');
    expect(screen.queryByRole('option', { name: /300.*coupon/ })).not.toBeInTheDocument();
    view.rerender(<BillingPreview {...props} />);
    await calculate();
    const callsBeforeCheck = mocks.preview.mock.calls.length;
    mocks.checkingCoupons = true;
    view.rerender(<BillingPreview {...props} />);
    await calculate();
    expect(mocks.preview).toHaveBeenCalledTimes(callsBeforeCheck);
    expect(screen.getByText('Check coupons or select No coupon to continue.')).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Coupon' })).toBeEnabled();
    mocks.checkingCoupons = false;
    mocks.coupons = { ...mocks.coupons, version: 4 };
    view.rerender(<BillingPreview {...props} />);
    await calculate();
    expect(screen.getByText('Coupon details changed. Select a coupon again.')).toBeVisible();
    expect(mocks.preview).toHaveBeenCalledTimes(callsBeforeCheck);
    fireEvent.change(screen.getByRole('combobox', { name: 'Coupon' }), { target: { value: '' } });
    await calculate();
    expect(mocks.review).toHaveBeenLastCalledWith(expect.objectContaining({ reviewRequest: expect.objectContaining({ scenario: expect.objectContaining({ coupon: null }) }) }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Coupon' }), { target: { value: 'ordinary' } });
    await calculate();
    const callsBeforeImport = mocks.preview.mock.calls.length;
    view.rerender(<BillingPreview {...props} couponSnapshot={{ remaining_count: 0, cached_value: '300', synced_at_utc: '2026-11-02', verified: false }} />);
    await calculate();
    expect(mocks.preview).toHaveBeenCalledTimes(callsBeforeImport);
    expect(screen.getByText('Coupon details changed. Select a coupon again.')).toBeVisible();

  });

  it('does not trust an incoming verified coupon until it is selected from current ledger stock', async () => {
    const initial = { first_lesson_date: '2026-11-10', mode: 'regular' as const, payment_method: 'manual' as const, slots: [{ weekday: 'Tue' as const }], materials_fee: 0, trial_deduction: false, mandate_ready: false,
      coupon: { kind: 'ordinary' as const, value: 300, expires_on: '2027-06-30', available_count: 9, verified: true, combine_next_month: true } };
    renderBase(<BillingPreview focused initialRequest={initial} renewalSource={{ scenario: initial, enrollmentIds: [7], tutorNames: ['Fixture'] }} draftContext={{ studentId: 4, basis: 'include_pending', selectedEnrollmentIds: [7], sourceFingerprint: 'source' }} />);
    await calculate();
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(screen.getByText('Check coupons or select No coupon to continue.')).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Coupon' })).toBeEnabled();
    fireEvent.change(screen.getByRole('combobox', { name: 'Coupon' }), { target: { value: '' } });
    await calculate();
    expect(mocks.review).toHaveBeenLastCalledWith(expect.objectContaining({ reviewRequest: expect.objectContaining({ scenario: expect.objectContaining({ coupon: null }) }) }));
  });

  it.each([
    { kind: 'regular', lessons: 3, couponKind: 'ordinary' as const, enabled: true },
    { kind: 'regular', lessons: 4, couponKind: 'ordinary' as const, enabled: false },
    { kind: 'transition', lessons: 3, couponKind: 'ordinary' as const, enabled: true },
    { kind: 'legacy', lessons: 3, couponKind: 'ordinary' as const, enabled: false },
    { kind: 'regular', lessons: 3, couponKind: 'staff' as const, enabled: true },
  ])('always shows month inclusion and enables only eligible offers: %j', async ({ kind, lessons, couponKind, enabled }) => {
    mocks.coupons = { student_id: 4, storage_available: true, writes_available: true, version: 3,
      observation: { id: 'obs', remaining_count: 1, observed_on: '2026-11-01', processed_at: '2026-11-01', source_filename: 'fixture.xls' },
      reserved_count: 0, receipt_pending_count: 0, used_awaiting_sync_count: 0, usable_count: 1,
      groups: [{ key: 'selected', kind: couponKind, value: couponKind === 'staff' ? 500 : 300, expires_on: '2027-06-30', quantity: 1, usable_count: 1 }],
      checked_at: '2026-11-01', checked_by: 'Fixture', issues: [], uses: [], can_verify: true };
    const result = response(); result.periods[0] = { ...result.periods[0], kind, lesson_count: lessons };
    result.coupon_options = [{ period_number: 1, applied: false, reason: 'min_sessions', minimum_sessions: 4,
      can_include_next_month: enabled, include_next_month_reason: enabled ? null : kind === 'legacy' ? 'legacy' : 'already_eligible',
      include_next_month: '2026-12-01', next_month_included: false }];
    mocks.preview.mockResolvedValue(result);
    const initial = { first_lesson_date: '2026-11-10', mode: 'regular' as const, payment_method: 'autopay' as const, slots: [{ weekday: 'Tue' as const }], materials_fee: 0, trial_deduction: false, mandate_ready: false };
    renderBase(<BillingPreview focused initialRequest={initial} renewalSource={{ scenario: initial, enrollmentIds: [7], tutorNames: ['Fixture'] }} draftContext={{ studentId: 4, basis: 'include_pending', selectedEnrollmentIds: [7], sourceFingerprint: 'source' }} />);
    await calculate();
    fireEvent.change(screen.getByRole('combobox', { name: 'Coupon' }), { target: { value: 'selected' } });
    await calculate();
    const control = screen.getByRole('checkbox', { name: 'Include December' });
    expect(control).toBeVisible();
    if (enabled) expect(control).toBeEnabled(); else expect(control).toBeDisabled();
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ coupon: expect.objectContaining({ combine_next_month: false }) }), expect.any(AbortSignal));
    if (enabled) {
      fireEvent.click(control);
      await calculate();
      expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ coupon: expect.objectContaining({ combine_next_month: true }) }), expect.any(AbortSignal));
    }
  });

  it('supports the old custom-time workflow and withholds incomplete or reversed ranges', async () => {
    const initial: BillingPreviewRequest = { first_lesson_date: '2026-11-10', slots: [{ weekday: 'Tue', time_slot: '16:45 - 18:15', location: 'MSA' }], mode: 'regular', payment_method: 'manual', materials_fee: 0, trial_deduction: false, mandate_ready: false };
    renderBase(<BillingPreview focused embedded initialRequest={initial} renewalSource={{ scenario: initial, enrollmentIds: [7], tutorNames: ['Tutor Nine'] }} draftContext={{ studentId: 4, basis: 'include_pending', selectedEnrollmentIds: [7], sourceFingerprint: 'one' }} />);
    await calculate();
    fireEvent.click(screen.getByRole('button', { name: 'Use custom time' }));
    expect(screen.getByLabelText('Start time')).toHaveValue('16:45');
    expect(screen.getByLabelText('End time')).toHaveValue('18:15');
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '17:00' } });
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '18:30' } });
    await calculate();
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ slots: [expect.objectContaining({ time_slot: '17:00 - 18:30' })] }), expect.any(AbortSignal));
    const validCalls = mocks.preview.mock.calls.length;
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '' } });
    await calculate();
    expect(screen.getByRole('alert')).toHaveTextContent('End time must be after start time');
    expect(mocks.preview).toHaveBeenCalledTimes(validCalls);
    expect(screen.queryByText('Review period 1')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '16:00' } });
    await calculate();
    expect(mocks.preview).toHaveBeenCalledTimes(validCalls);
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '18:30' } });
    fireEvent.change(screen.getByLabelText('Day of week'), { target: { value: 'Sat' } });
    await calculate();
    expect(screen.getByLabelText('Start time')).toHaveValue('17:00');
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ slots: [expect.objectContaining({ weekday: 'Sat', time_slot: '17:00 - 18:30' })] }), expect.any(AbortSignal));
    fireEvent.click(screen.getByRole('button', { name: 'Use preset time slots' }));
    expect(screen.getByRole('combobox', { name: 'Time slot' })).toHaveValue('10:00 - 11:30');
    expect(screen.queryByLabelText('Start time')).not.toBeInTheDocument();
  });

  it('opens inherited custom times in the clock inputs and resets their mode with fresh source data', async () => {
    const initial: BillingPreviewRequest = { first_lesson_date: '2026-11-10', slots: [{ weekday: 'Tue', time_slot: '17:00 - 18:30', location: 'MSA' }], mode: 'regular', payment_method: 'manual', materials_fee: 0, trial_deduction: false, mandate_ready: false };
    const props = { focused: true, embedded: true, initialRequest: initial, sourceKey: 'one', renewalSource: { scenario: initial, enrollmentIds: [7], tutorNames: ['Tutor Nine'] } };
    const view = renderBase(<BillingPreview {...props} />);
    expect(screen.getByLabelText('Start time')).toHaveValue('17:00');
    const fresh = { ...initial, slots: [{ ...initial.slots[0], time_slot: '16:45 - 18:15' }] };
    view.rerender(<BillingPreview {...props} sourceKey="two" initialRequest={fresh} renewalSource={{ ...props.renewalSource, scenario: fresh }} />);
    expect(screen.queryByLabelText('Start time')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Time slot' })).toHaveValue('16:45 - 18:15');
  });

  it('uses the old renewal field order and reviews a changed tutor with source lineage', async () => {
    mocks.tutors[0].is_active_tutor = false;
    mocks.auth.mockReturnValue({ user: { id: 1 }, isLoading: false, isAdmin: true, isGuest: false });
    const initial = { first_lesson_date: '2026-11-10', mode: 'transition' as const, payment_method: 'manual' as const, slots: [{ weekday: 'Tue' as const, time_slot: '16:45 - 18:15', location: 'MSA', covered_through: '2026-11-03' }], materials_fee: 0, trial_deduction: false, mandate_ready: false };
    renderBase(<BillingPreview focused embedded initialRequest={initial} renewalSource={{ scenario: initial, enrollmentIds: [7], tutorIds: [9], tutorNames: ['Tutor Nine'] }}
      draftContext={{ studentId: 4, basis: 'include_pending', selectedEnrollmentIds: [7], sourceFingerprint: 'source' }} />);
    await calculate();
    const section = screen.getByRole('region', { name: 'Renewal enrollment details' });
    const labels = [...section.querySelectorAll('label')].map(label => label.textContent);
    expect(labels.slice(0, 6)).toEqual(['Tutor', 'Location', 'Day of week', 'Time slot', 'First lesson date', 'Coupon']);
    const tutor = screen.getByLabelText('Tutor');
    expect(tutor).toHaveValue('9');
    expect(within(tutor).queryByRole('option', { name: 'Tutor Other' })).not.toBeInTheDocument();
    expect(mocks.review.mock.lastCall![0].reviewRequest.renewal).toBeUndefined();
    fireEvent.change(tutor, { target: { value: '12' } });
    await calculate();
    expect(screen.queryByText('Review period 1')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'Parent requested a tutor change.' } });
    await calculate();
    expect(mocks.review).toHaveBeenLastCalledWith(expect.objectContaining({ reviewRequest: expect.objectContaining({
      renewal: { source_enrollment_ids: [7], tutor_ids: [12], reason: 'Parent requested a tutor change.' },
    }) }));
    expect(within(tutor).getByRole('option', { name: 'Tutor Nine' })).toHaveValue('9');
    fireEvent.change(tutor, { target: { value: '9' } });
    await calculate();
    expect(mocks.review.mock.lastCall![0].reviewRequest.renewal).toBeUndefined();
  });

  it('reviews a changed next timetable with its original enrollment mapping and a deliberate reason', async () => {
    mocks.auth.mockReturnValue({ user: { id: 1 }, isLoading: false, isAdmin: true, isGuest: false });
    const initial = { first_lesson_date: '2026-11-10', mode: 'transition' as const, payment_method: 'manual' as const, slots: [{ weekday: 'Tue' as const, time_slot: '16:45 - 18:15', location: 'MSA', covered_through: '2026-11-03' }], materials_fee: 0, trial_deduction: false, mandate_ready: false };
    renderBase(<BillingPreview focused embedded initialRequest={initial} renewalSource={{ scenario: initial, enrollmentIds: [7], tutorNames: ['Tutor Nine'] }}
      draftContext={{ studentId: 4, basis: 'include_pending', selectedEnrollmentIds: [7], sourceFingerprint: 'source' }} />);
    await calculate();
    expect(screen.queryByText('Weekly class')).not.toBeInTheDocument();
    expect(screen.queryByText('Special arrangements')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Next enrollment' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Reason for change')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add second weekly class' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Enter a custom timetable')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Day of week'), { target: { value: 'Mon' } });
    expect(screen.getByLabelText('First lesson date')).toHaveValue('2026-11-16');
    await calculate();
    expect(screen.queryByText('Review period 1')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'Parent requested Monday next period.' } });
    await calculate();
    expect(mocks.review).toHaveBeenLastCalledWith(expect.objectContaining({ summaryPresentation: 'renewal', reviewRequest: expect.objectContaining({
      scenario: expect.objectContaining({ first_lesson_date: '2026-11-16', slots: [expect.objectContaining({ weekday: 'Mon', covered_through: '2026-11-03' })] }),
      renewal: { source_enrollment_ids: [7], reason: 'Parent requested Monday next period.' },
    }) }));
    expect(screen.queryByLabelText('Existing coverage through')).not.toBeInTheDocument();
  });

  it('resets edited renewal details when fresh source records replace their timetable', async () => {
    mocks.auth.mockReturnValue({ user: { id: 1 }, isLoading: false, isAdmin: true, isGuest: false });
    const initial = { first_lesson_date: '2026-11-10', mode: 'transition' as const, payment_method: 'manual' as const, slots: [{ weekday: 'Tue' as const, time_slot: '16:45 - 18:15', location: 'MSA', covered_through: '2026-11-03' }], materials_fee: 0, trial_deduction: false, mandate_ready: false };
    const props={ focused: true, embedded: true, initialRequest: initial, sourceKey: 'one', renewalSource: { scenario: initial, enrollmentIds: [7], tutorNames: ['Tutor Nine'] }, draftContext: { studentId: 4, basis: 'include_pending' as const, selectedEnrollmentIds: [7], sourceFingerprint: 'one' } };
    const view=renderBase(<BillingPreview {...props} />);
    fireEvent.change(screen.getByLabelText('First lesson date'),{target:{value:'2026-11-17'}});
    fireEvent.change(screen.getByLabelText('Reason for change'),{target:{value:'Old local edit'}});
    const fresh={...initial,first_lesson_date:'2026-11-24'};
    view.rerender(<BillingPreview {...props} sourceKey="two" initialRequest={fresh} renewalSource={{...props.renewalSource,scenario:fresh}} draftContext={{...props.draftContext,sourceFingerprint:'two'}} />);
    expect(screen.getByLabelText('First lesson date')).toHaveValue('2026-11-24');
    expect(screen.queryByLabelText('Reason for change')).not.toBeInTheDocument();
    await calculate();
    expect(mocks.review).toHaveBeenLastCalledWith(expect.objectContaining({reviewRequest:expect.objectContaining({expected_source_fingerprint:'two',scenario:expect.objectContaining({first_lesson_date:'2026-11-24'})})}));
  });

  it('keeps the first-enrollment preview focused and compares both schedules only on demand', async () => {
    renderBase(<BillingPreview focused embedded initialRequest={{ first_lesson_date: '2026-11-10', mode: 'new_student', payment_method: 'autopay', slots: [{ weekday: 'Tue', time_slot: '16:45 - 18:15', location: 'MSA' }], materials_fee: 100, trial_deduction: false, mandate_ready: false }}
      intake={{ slots: [{ tutor_id: 9 }] }} intakeTutors={[{ id: 9, tutor_name: 'Tutor Nine' }]} defaultMaterialsFee={100}
      draftContext={{ studentId: 4, basis: 'include_pending', selectedEnrollmentIds: [], sourceFingerprint: 'source' }} />);
    await calculate();
    expect(mocks.preview).toHaveBeenCalledTimes(1);
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ payment_method: 'autopay' }), expect.any(AbortSignal));
    expect(mocks.review).toHaveBeenLastCalledWith(expect.objectContaining({ inline: true, summaryPresentation: 'renewal' }));
    expect(screen.getByRole('combobox', { name: 'Day of week' }).querySelector('option')?.textContent).toBe('Sun');
    expect(screen.queryByRole('button', { name: 'Edit preview' })).not.toBeInTheDocument();
    expect(screen.queryByText('Weekly class')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use custom time' }));
    expect(screen.getByLabelText('Start time')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Compare payment schedules' }));
    await calculate();
    expect(mocks.preview.mock.calls.slice(-2).map(call => call[0].payment_method)).toEqual(['autopay', 'manual']);
    expect(screen.getByRole('button', { name: 'Hide payment schedules' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows the end-date override only for a short first payment and requires its reason', async () => {
    mocks.auth.mockReturnValue({ user: { id: 1 }, isLoading: false, isAdmin: true, isGuest: false });
    const short = response(); short.issues = [{ code: 'FIRST_PAYMENT_BELOW_MINIMUM', message: 'Approve a short first payment.', period: 1 }];
    mocks.preview.mockResolvedValue(short);
    renderBase(<BillingPreview focused embedded initialRequest={{ first_lesson_date: '2027-06-22', mode: 'new_student', payment_method: 'manual', slots: [{ weekday: 'Tue' }], materials_fee: 100, trial_deduction: false, mandate_ready: false }} intake={{ slots: [{ tutor_id: 9 }] }} defaultMaterialsFee={100}
      draftContext={{ studentId: 4, basis: 'include_pending', selectedEnrollmentIds: [], sourceFingerprint: 'source' }} />);
    await calculate();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Adjust first payment end date' }));
    fireEvent.change(screen.getByLabelText('Cover through'), { target: { value: '2027-07-04' } });
    await calculate();
    expect(screen.queryByText('Review period 1')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Reason for adjustment'), { target: { value: 'Final teaching period.' } });
    await calculate();
    expect(mocks.review).toHaveBeenLastCalledWith(expect.objectContaining({ reviewRequest: expect.objectContaining({ scenario: expect.objectContaining({ adjustment: { through: '2027-07-04', reason: 'Final teaching period.' } }) }) }));
  });

  it('uses verified first-enrollment coupons exclusively with the trial deduction', async () => {
    mocks.coupons = { student_id: 4, storage_available: true, writes_available: true, version: 3,
      observation: { id: 'obs', remaining_count: 1, observed_on: '2026-11-01', processed_at: '2026-11-01', source_filename: 'fixture.xls' },
      reserved_count: 0, receipt_pending_count: 0, used_awaiting_sync_count: 0, usable_count: 1,
      groups: [{ key: 'ordinary', kind: 'ordinary', value: 300, expires_on: '2027-06-30', quantity: 1, usable_count: 1 }],
      checked_at: '2026-11-01', checked_by: 'Fixture', issues: [], uses: [], can_verify: true };
    renderBase(<BillingPreview focused embedded initialRequest={{ first_lesson_date: '2026-11-10', mode: 'new_student', payment_method: 'manual', slots: [{ weekday: 'Tue', time_slot: '16:45 - 18:15', location: 'MSA' }], materials_fee: 100, trial_deduction: true, mandate_ready: false }}
      intake={{ trial_enrollment_id: 70, trial_session_id: 71, slots: [{ tutor_id: 9 }] }} intakeTutors={[{ id: 9, tutor_name: 'Tutor Nine' }]} defaultMaterialsFee={100}
      draftContext={{ studentId: 4, basis: 'include_pending', selectedEnrollmentIds: [], sourceFingerprint: 'source' }} />);
    await calculate();
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ trial_deduction: true, coupon: null }), expect.any(AbortSignal));
    fireEvent.change(screen.getByRole('combobox', { name: 'Discount' }), { target: { value: 'coupon' } });
    expect(screen.getByRole('combobox', { name: 'Discount' })).toHaveValue('coupon');
    fireEvent.change(screen.getByRole('combobox', { name: 'Coupon' }), { target: { value: 'ordinary' } });
    await calculate();
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ trial_deduction: false, coupon: expect.objectContaining({ value: 300, verified: true }) }), expect.any(AbortSignal));
    expect(screen.queryByLabelText('Coupon amount')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Discount' }), { target: { value: 'trial' } });
    await calculate();
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ trial_deduction: true, coupon: null }), expect.any(AbortSignal));
  });

  it('preserves intake dates, tutor, materials waiver and period exception when saved payment settings refresh', async () => {
    mocks.auth.mockReturnValue({ user: { id: 1 }, isLoading: false, isAdmin: true, isGuest: false });
    const initial = { first_lesson_date: '2026-11-10', adjustment: { through: '2026-11-30', reason: 'Approved shorter first period.' }, mode: 'new_student' as const, payment_method: 'manual' as const, slots: [{ weekday: 'Tue' as const, time_slot: '16:45 - 18:15', location: 'MSA' }], materials_fee: 100, trial_deduction: true, mandate_ready: false };
    const intake = { trial_enrollment_id: 70, trial_session_id: 71, slots: [{ tutor_id: 9, renewed_from_enrollment_id: 70 }] };
    const props = { focused: true, embedded: true, initialRequest: initial, sourceKey: 'original', intake, defaultMaterialsFee: 100,
      intakeTutors: [{ id: 9, tutor_name: 'Tutor Nine' }, { id: 12, tutor_name: 'Tutor Twelve' }],
      draftContext: { studentId: 4, basis: 'include_pending' as const, selectedEnrollmentIds: [], sourceFingerprint: 'original' } };
    const view = renderBase(<BillingPreview {...props} />);
    await calculate();
    fireEvent.change(screen.getByLabelText('First lesson date'), { target: { value: '2026-11-17' } });
    fireEvent.change(screen.getByLabelText('Tutor'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Materials'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Reason for materials adjustment'), { target: { value: 'Materials waived.' } });
    view.rerender(<BillingPreview {...props} sourceLoading />);
    expect(screen.queryByText('Review period 1')).not.toBeInTheDocument();
    const freshProps = { ...props, initialRequest: { ...initial, payment_method: 'autopay' as const }, sourceKey: 'new-preference', draftContext: { ...props.draftContext, sourceFingerprint: 'new-preference' } };
    view.rerender(<BillingPreview {...freshProps} />);
    expect(screen.getByLabelText('First lesson date')).toHaveValue('2026-11-17');
    expect(screen.getByLabelText('Tutor')).toHaveValue('12');
    expect(screen.getByLabelText('Materials')).toHaveValue(0);
    expect(screen.getByLabelText('Reason for materials adjustment')).toHaveValue('Materials waived.');
    await calculate();
    expect(mocks.review).toHaveBeenLastCalledWith(expect.objectContaining({ reviewRequest: expect.objectContaining({ expected_source_fingerprint: 'new-preference',
      scenario: expect.objectContaining({ first_lesson_date: '2026-11-17', payment_method: 'autopay', materials_fee: 0, adjustment: { through: '2026-11-30', reason: 'Approved shorter first period.' } }),
      intake: expect.objectContaining({ slots: [{ tutor_id: 12, renewed_from_enrollment_id: 70 }], materials_override_reason: 'Materials waived.' }) }) }));
  });

  it('keeps the intake tutor mapping aligned and withholds review until every class has a tutor', async () => {
    mocks.auth.mockReturnValue({ user: { id: 1 }, isLoading: false, isAdmin: true, isGuest: false });
    renderBase(<BillingPreview focused embedded initialRequest={{ first_lesson_date: '2026-11-10', mode: 'new_student', payment_method: 'manual', slots: [{ weekday: 'Tue', time_slot: '16:45 - 18:15', location: 'MSA' }], materials_fee: 100, trial_deduction: true, mandate_ready: false }}
      intake={{ trial_enrollment_id: 70, trial_session_id: 71, slots: [{ tutor_id: 9, renewed_from_enrollment_id: 70 }] }}
      intakeTutors={[{ id: 9, tutor_name: 'Tutor Nine' }, { id: 12, tutor_name: 'Tutor Twelve' }]} defaultMaterialsFee={100}
      draftContext={{ studentId: 4, basis: 'include_pending', selectedEnrollmentIds: [], sourceFingerprint: 'source' }} />);
    await calculate();
    expect(mocks.review).toHaveBeenLastCalledWith(expect.objectContaining({ reviewRequest: expect.objectContaining({ intake: expect.objectContaining({ slots: [{ tutor_id: 9, renewed_from_enrollment_id: 70 }] }) }) }));
    fireEvent.click(screen.getByRole('button', { name: 'Add second weekly class' }));
    await calculate();
    expect(screen.queryByText('Review period 1')).not.toBeInTheDocument();
    fireEvent.change(screen.getAllByLabelText('Tutor')[1], { target: { value: '12' } });
    await calculate();
    expect(mocks.review).toHaveBeenLastCalledWith(expect.objectContaining({ reviewRequest: expect.objectContaining({ intake: expect.objectContaining({ slots: [{ tutor_id: 9, renewed_from_enrollment_id: 70 }, { tutor_id: 12 }] }) }) }));
  });

  it('requires an admin reason before reviewing a materials waiver and preserves it with the exact payment', async () => {
    mocks.auth.mockReturnValue({ user: { id: 1 }, isLoading: false, isAdmin: true, isGuest: false });
    renderBase(<BillingPreview focused embedded initialRequest={{ first_lesson_date: '2026-11-10', mode: 'new_student', payment_method: 'manual', slots: [{ weekday: 'Tue' }], materials_fee: 100, trial_deduction: false, mandate_ready: false }}
      intake={{ slots: [{ tutor_id: 9 }] }} defaultMaterialsFee={100} draftContext={{ studentId: 4, basis: 'include_pending', selectedEnrollmentIds: [], sourceFingerprint: 'source' }} />);
    await calculate();
    fireEvent.change(screen.getByLabelText('Materials'), { target: { value: '0' } });
    await calculate();
    expect(screen.queryByText('Review period 1')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Reason for materials adjustment'), { target: { value: 'Materials waived for this intake.' } });
    await calculate();
    expect(mocks.review).toHaveBeenLastCalledWith(expect.objectContaining({ reviewRequest: expect.objectContaining({ scenario: expect.objectContaining({ materials_fee: 0 }), intake: { slots: [{ tutor_id: 9 }], materials_override_reason: 'Materials waived for this intake.' } }) }));
  });

  it('focuses one exact reviewed period and keeps editing inside the renewal pane', async () => {
    const data = response(); data.periods = [{ ...data.periods[0], number: 1 }, { ...data.periods[0], number: 3 }];
    mocks.preview.mockResolvedValue(data);
    renderBase(<BillingPreview focused embedded focusedPeriodNumber={3} initialRequest={{ first_lesson_date: '2026-11-10', mode: 'transition', payment_method: 'manual', slots: [{ weekday: 'Tue' }], materials_fee: 0, trial_deduction: false, mandate_ready: false }} draftContext={{ studentId: 4, basis: 'include_pending', selectedEnrollmentIds: [7, 8], sourceFingerprint: 'current-source' }} />);
    await calculate();
    expect(mocks.preview).toHaveBeenCalledTimes(1);
    expect(mocks.review).toHaveBeenLastCalledWith(expect.objectContaining({ inline: true, reviewRequest: expect.objectContaining({ period_number: 3, basis: 'include_pending', selected_enrollment_ids: [7, 8], expected_source_fingerprint: 'current-source' }) }));
    expect(screen.getByText('Review period 3')).toBeInTheDocument();
    expect(screen.queryByLabelText('Payment journey')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit preview' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('First lesson date')).toBeVisible();
    expect(screen.getByLabelText('Day of week')).toBeVisible();
    expect(screen.getByLabelText('Time slot')).toBeVisible();
    expect(screen.getByLabelText('Location')).toBeVisible();
    expect(screen.queryByRole('tablist', { name: 'Preview settings' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Preview for')).not.toBeInTheDocument();
    expect(mocks.review).toHaveBeenLastCalledWith(expect.objectContaining({ summaryPresentation: 'renewal' }));
  });

  it('opens settings on demand and preserves edits when closed and reopened', async () => {
    vi.useRealTimers();
    renderBase(<BillingPreview couponSnapshot={{ remaining_count: 2, cached_value: '300.00', synced_at_utc: '2026-10-10T12:00:00', verified: false }} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('First regular lesson')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit preview' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit preview' });
    await waitFor(() => expect(within(dialog).getByRole('heading', { name: 'Sessions' })).toBeVisible());
    expect(within(dialog).getByRole('heading', { name: 'Discounts and materials' })).toBeVisible();
    expect(within(dialog).getByText('2 coupons')).toBeVisible();
    expect(within(dialog).getByText('Check KMS before use.')).toBeVisible();
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-10' } });
    fireEvent.change(screen.getByLabelText('Materials charge'), { target: { value: '0' } });
    await waitFor(() => expect(screen.getByLabelText('Payment journey')).toBeInTheDocument());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit preview' })).toHaveFocus());
    expect(screen.queryByText('Calendar and year-end dates')).not.toBeInTheDocument();
    expect(screen.queryByText('Payment settings')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit preview' }));
    expect(screen.getByLabelText('First regular lesson')).toHaveValue('2026-11-10');
    expect(screen.getByLabelText('Materials charge')).toHaveValue(0);
    expect(screen.queryByText('Checked in KMS')).not.toBeInTheDocument();
  });

  it('contains keyboard focus and returns it to Edit preview after Escape', async () => {
    vi.useRealTimers();
    renderBase(<BillingPreview />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit preview' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit preview' });
    const close = within(dialog).getByRole('button', { name: 'Close modal' });
    const done = within(dialog).getByRole('button', { name: 'Done' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(done).toHaveFocus();
    fireEvent.keyDown(done, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit preview' })).toHaveFocus());
  });

  it('keeps the editor and coupon choices while rebasing source dates without showing old totals', async () => {
    const initial = { first_lesson_date: '2026-11-10', mode: 'transition' as const, payment_method: 'manual' as const,
      materials_fee: 0, trial_deduction: false, mandate_ready: false,
      slots: [{ weekday: 'Tue' as const, covered_through: '2026-11-03' }] };
    const view = render(<BillingPreview embedded initialRequest={initial} sourceKey="old-source" />);
    fireEvent.change(screen.getByLabelText('Discount'), { target: { value: 'ordinary' } });
    fireEvent.change(screen.getByLabelText('Coupon amount'), { target: { value: '300' } });
    await calculate();
    expect(within(screen.getByLabelText('Selected payment details')).getByText('$2,250')).toBeInTheDocument();
    view.rerender(<BillingPreview embedded initialRequest={initial} sourceKey="old-source" sourceLoading />);
    expect(screen.getByRole('dialog', { name: 'Edit preview' })).toBeInTheDocument();
    expect(screen.queryByText('$2,250')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Coupon amount')).toHaveValue(300);
    expect(screen.getByLabelText('First session to charge')).toBeDisabled();
    const fresh = response(); fresh.periods[0].total_fee = 1900;
    mocks.preview.mockResolvedValue(fresh);
    view.rerender(<BillingPreview embedded initialRequest={{ ...initial, first_lesson_date: '2026-12-15', slots: [{ weekday: 'Tue', covered_through: '2026-12-08' }] }} sourceKey="new-source" />);
    expect(screen.getByLabelText('First session to charge')).toHaveValue('2026-12-15');
    expect(screen.getByLabelText('Coupon amount')).toHaveValue(300);
    expect(screen.queryByText('$2,250')).not.toBeInTheDocument();
    await calculate();
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ first_lesson_date: '2026-12-15', coupon: expect.objectContaining({ value: 300 }) }), expect.any(AbortSignal));
    expect(screen.getByRole('dialog', { name: 'Edit preview' })).toBeInTheDocument();
    expect(within(screen.getByLabelText('Selected payment details')).getByText('$1,900')).toBeInTheDocument();
  });

  it('requires a materials amount when source changes reveal a first enrollment', async () => {
    const initial = { first_lesson_date: '2026-11-10', mode: 'transition' as const, payment_method: 'manual' as const,
      materials_fee: 0, trial_deduction: false, mandate_ready: false, slots: [{ weekday: 'Tue' as const }] };
    const view = render(<BillingPreview embedded initialRequest={initial} sourceKey="existing" />);
    await calculate();
    const unknown = response(); unknown.periods[0].materials_fee = null; unknown.periods[0].total_fee = null;
    mocks.preview.mockResolvedValue(unknown);
    const first = { ...initial, mode: 'new_student' as const, materials_fee: null };
    view.rerender(<BillingPreview embedded initialRequest={first} sourceKey="first-enrollment" />);
    expect(screen.getByLabelText('Materials charge')).toHaveValue(null);
    await calculate();
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'new_student', materials_fee: null }), expect.any(AbortSignal));
    expect(screen.getAllByText('Total to confirm').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Materials charge'), { target: { value: '200' } });
    view.rerender(<BillingPreview embedded initialRequest={{ ...first, first_lesson_date: '2026-11-17' }} sourceKey="updated-first-enrollment" />);
    expect(screen.getByLabelText('Materials charge')).toHaveValue(200);
    await calculate();
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ materials_fee: 200 }), expect.any(AbortSignal));
  });

  it('invalidates coupon verification when a newer import changes the available evidence', async () => {
    const snapshot = { remaining_count: 1, cached_value: '300.00', synced_at_utc: '2026-10-10T12:00:00', verified: false };
    const view = render(<BillingPreview couponSnapshot={snapshot} />);
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-10' } });
    fireEvent.change(screen.getByLabelText('Discount'), { target: { value: 'ordinary' } });
    fireEvent.change(screen.getByLabelText('Coupon amount'), { target: { value: '300' } });
    fireEvent.change(screen.getByLabelText('Coupon expiry'), { target: { value: '2027-07-01' } });
    fireEvent.change(screen.getByLabelText('Remaining coupon count'), { target: { value: '1' } });
    fireEvent.click(screen.getByLabelText('Checked in KMS'));
    await calculate();
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ coupon: expect.objectContaining({ verified: true }) }), expect.any(AbortSignal));
    view.rerender(<BillingPreview couponSnapshot={{ ...snapshot, remaining_count: 0, synced_at_utc: '2026-10-18T12:00:00' }} />);
    expect(screen.getByLabelText('Checked in KMS')).not.toBeChecked();
    await calculate();
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ coupon: expect.objectContaining({ verified: false, value: 300 }) }), expect.any(AbortSignal));
  });

  it('shows source errors and retry inside the open editor instead of a permanent loader', async () => {
    const initial = { first_lesson_date: '2026-11-10', mode: 'transition' as const, payment_method: 'manual' as const,
      materials_fee: 0, trial_deduction: false, mandate_ready: false,
      slots: [{ weekday: 'Tue' as const, covered_through: '2026-11-03', holiday_exceptions: ['2026-11-10'] }] };
    const retry = vi.fn();
    render(<BillingPreview embedded initialRequest={initial} sourceLoading sourceError="Records could not be refreshed." onRetrySource={retry} />);
    const dialog = screen.getByRole('dialog', { name: 'Edit preview' });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Records could not be refreshed.');
    expect(within(dialog).queryByText('Refreshing enrollment records…')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Adjustments' }));
    expect(screen.getByLabelText('Existing coverage through')).toBeDisabled();
    expect(screen.getByLabelText('Holiday class date')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add class on a holiday' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry records' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it('keeps holiday exceptions out of routine settings and supports keyboard settings tabs', async () => {
    render(<BillingPreview />);
    expect(screen.getByRole('tab', { name: 'Enrollment & fees' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('button', { name: 'Add class on a holiday' })).not.toBeInTheDocument();
    const adjustments = screen.getByRole('tab', { name: 'Adjustments' });
    const scrollBody = screen.getByRole('dialog').querySelector<HTMLElement>('.overflow-y-auto')!;
    scrollBody.scrollTop = 400;
    fireEvent.click(adjustments);
    expect(scrollBody.scrollTop).toBe(0);
    expect(screen.getByRole('button', { name: 'Add class on a holiday' })).toBeInTheDocument();
    expect(screen.getByText('Add an exception only when a regular class will run on a holiday.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add class on a holiday' }));
    expect(screen.getByLabelText('Holiday class date')).toBeInTheDocument();
    scrollBody.scrollTop = 200;
    fireEvent.keyDown(adjustments, { key: 'ArrowLeft' });
    expect(scrollBody.scrollTop).toBe(0);
    expect(screen.getByRole('tab', { name: 'Enrollment & fees' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Add class on a holiday' })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Enrollment & fees' }), { key: 'End' });
    expect(adjustments).toHaveFocus();
    expect(screen.getByLabelText('Holiday class date')).toBeInTheDocument();
    await calculate();
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it('excludes placeholder locations even when supplied in the link or initial timetable', async () => {
    mocks.params.mockReturnValue(new URLSearchParams('location=Various'));
    const view = render(<BillingPreview />);
    let branch = screen.getByLabelText('Branch');
    expect(branch).toHaveValue('');
    expect(within(branch).queryByRole('option', { name: 'Various' })).not.toBeInTheDocument();
    expect(within(branch).queryByRole('option', { name: 'All Locations' })).not.toBeInTheDocument();
    fireEvent.change(branch, { target: { value: 'MSB' } });
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-10' } });
    await calculate();
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ slots: [expect.objectContaining({ location: 'MSB' })] }), expect.any(AbortSignal));
    fireEvent.click(screen.getByLabelText('Enter a custom timetable'));
    fireEvent.change(screen.getByLabelText('Custom branch for class 1'), { target: { value: 'Various' } });
    expect(screen.getByLabelText('Custom branch for class 1')).toHaveValue('');
    fireEvent.click(screen.getByLabelText('Enter a custom timetable'));
    expect(screen.getByLabelText('Branch')).toHaveValue('');
    await calculate();
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ slots: [expect.objectContaining({ location: '' })] }), expect.any(AbortSignal));
    view.unmount();
    render(<BillingPreview initialRequest={{ first_lesson_date: '2026-11-10', mode: 'transition', payment_method: 'manual', materials_fee: 0, trial_deduction: false, mandate_ready: false, slots: [{ weekday: 'Tue', location: 'Various' }] }} />);
    branch = screen.getByLabelText('Branch');
    expect(branch).toHaveValue('');
    expect(within(branch).queryByRole('option', { name: 'Various' })).not.toBeInTheDocument();
  });

  it('waits for both methods so the comparison cannot mix different calculations', async () => {
    let finishAutopay!: (value: BillingPreviewResponse) => void;
    mocks.preview.mockImplementation((request: { payment_method: string }) => request.payment_method === 'autopay'
      ? new Promise(resolve => { finishAutopay = resolve; }) : Promise.resolve(response()));
    render(<BillingPreview />);
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-10' } });
    await calculate();
    expect(mocks.preview).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText('Payment journey')).not.toBeInTheDocument();
    await act(async () => finishAutopay(response()));
    expect(screen.getByLabelText('Payment journey')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compare' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('ignores late responses after new dates have already calculated', async () => {
    const old: ((value: BillingPreviewResponse) => void)[] = [];
    mocks.preview.mockImplementation(() => new Promise(resolve => old.push(resolve)));
    render(<BillingPreview />);
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-10' } });
    await calculate();
    const fresh = response();
    fresh.periods[0].total_fee = 1900;
    mocks.preview.mockResolvedValue(fresh);
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-17' } });
    await calculate();
    expect(within(screen.getByLabelText('Selected payment details')).getByText('$1,900')).toBeVisible();
    await act(async () => old.forEach(resolve => resolve(response())));
    expect(within(screen.getByLabelText('Selected payment details')).getByText('$1,900')).toBeVisible();
    expect(screen.queryByText('$2,250')).not.toBeInTheDocument();
  });
  it('waits for a start date and shows exact dates, deductions and skipped collections', async () => {
    render(<BillingPreview />);
    expect(mocks.preview).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-10' } });
    fireEvent.change(screen.getByLabelText('Materials charge'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Discount'), { target: { value: 'trial' } });
    await calculate();
    expect(mocks.preview.mock.calls[0][0]).toMatchObject({
      first_lesson_date: '2026-11-10', slots: [{ weekday: 'Tue' }], trial_deduction: true, materials_fee: 0,
    });
    expect(within(screen.getByLabelText('Selected payment details')).getByText('$2,250')).toBeInTheDocument();
    expect(screen.getByText('Trial deduction')).toBeInTheDocument();
    expect(screen.getAllByText('No additional fee')).toHaveLength(2);
    fireEvent.click(screen.getByText('Show 6 session dates'));
    expect(screen.getByText('Nov 10, 2026 (Tue)')).toBeInTheDocument();
  });

  it('hides a stale result as soon as its inputs change', async () => {
    render(<BillingPreview />);
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-10' } });
    fireEvent.change(screen.getByLabelText('Materials charge'), { target: { value: '0' } });
    await calculate();
    expect(within(screen.getByLabelText('Selected payment details')).getByText('$2,250')).toBeInTheDocument();
    mocks.preview.mockReturnValue(new Promise(() => {}));
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-17' } });
    expect(screen.queryByText('$2,250')).not.toBeInTheDocument();
    await calculate();
    expect(screen.getByText('Updating preview…')).toBeInTheDocument();
  });

  it('never combines the trial deduction with a selected coupon', async () => {
    render(<BillingPreview />);
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-10' } });
    fireEvent.change(screen.getByLabelText('Discount'), { target: { value: 'ordinary' } });
    fireEvent.change(screen.getByLabelText('Coupon amount'), { target: { value: '300' } });
    await calculate();
    expect(mocks.preview.mock.calls[0][0]).toMatchObject({ trial_deduction: false, coupon: { kind: 'ordinary', verified: false } });
  });

  it('keeps unknown totals visibly unresolved', async () => {
    const data = response();
    data.periods[0].total_fee = null;
    data.periods[0].materials_fee = null;
    data.issues = [{ code: 'MATERIALS_UNCONFIRMED', period: 1, message: 'Confirm the materials charge or waiver.' }];
    mocks.preview.mockResolvedValue(data);
    render(<BillingPreview />);
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-10' } });
    await calculate();
    expect(screen.getAllByText('Total to confirm')).toHaveLength(2);
    expect(screen.queryByText('$2,250')).not.toBeInTheDocument();
    expect(screen.getAllByText('Confirm materials fee').length).toBeGreaterThan(0);
    expect(screen.getByText('Confirm the materials charge or waiver.')).toBeInTheDocument();
  });

  it('offers admin adjustments only to admins and requires a reason before recalculating', async () => {
    mocks.auth.mockReturnValue({ user: { id: 1 }, isLoading: false, isAdmin: true, isGuest: false });
    render(<BillingPreview />);
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-11' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Adjustments' }));
    fireEvent.click(screen.getByLabelText('Compare an adjusted first payment'));
    await calculate();
    expect(mocks.preview).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Cover through'), { target: { value: '2026-11-30' } });
    fireEvent.change(screen.getByLabelText('Reason for adjustment'), { target: { value: 'Agreed shorter first month' } });
    await calculate();
    expect(mocks.preview.mock.calls[0][0].adjustment).toEqual({ through: '2026-11-30', reason: 'Agreed shorter first month' });
  });

  it('does not offer tutors an admin adjustment', () => {
    render(<BillingPreview />);
    expect(screen.queryByLabelText('Compare an adjusted first payment')).not.toBeInTheDocument();
  });

  it('prefills a proposed slot after a trial without including student identifiers', async () => {
    mocks.params.mockReturnValue(new URLSearchParams('trial_date=2026-11-03&time_slot=16%3A45+-+18%3A15&location=MSA'));
    render(<BillingPreview />);
    await calculate();
    expect(screen.getByLabelText('First regular lesson')).toHaveValue('2026-11-10');
    expect(mocks.preview.mock.calls[0][0].slots[0]).toMatchObject({ weekday: 'Tue', time_slot: '16:45 - 18:15', location: 'MSA' });
    expect(mocks.preview.mock.calls[0][0]).not.toHaveProperty('student_id');
    expect(screen.getByText(/Confirm the first regular lesson after the trial/)).toBeInTheDocument();
  });

  it('shows a calculation failure without leaving the old amount on screen', async () => {
    mocks.preview.mockRejectedValue(new Error('The first lesson is a holiday.'));
    render(<BillingPreview />);
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-10' } });
    await calculate();
    expect(screen.getByRole('alert')).toHaveTextContent('The first lesson is a holiday.');
    expect(screen.queryByText('$2,250')).not.toBeInTheDocument();
  });

  it('keeps a holiday opening attached to its own weekly slot', async () => {
    render(<BillingPreview />);
    fireEvent.click(screen.getByRole('tab', { name: 'Adjustments' }));
    fireEvent.change(screen.getByLabelText('Preview for'), { target: { value: 'transition' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Enrollment & fees' }));
    fireEvent.change(screen.getByLabelText('First session to charge'), { target: { value: '2026-10-23' } });
    fireEvent.click(screen.getByText('Add second weekly class'));
    fireEvent.click(screen.getByRole('tab', { name: 'Adjustments' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Add class on a holiday' })[0]);
    fireEvent.change(screen.getByLabelText('Holiday class date'), { target: { value: '2026-10-23' } });
    await calculate();
    expect(mocks.preview.mock.calls[0][0].slots[0].holiday_exceptions).toEqual(['2026-10-23']);
    expect(mocks.preview.mock.calls[0][0].slots[1].holiday_exceptions).toBeUndefined();
  });

  it('can retry a failed calculation without changing the arrangement', async () => {
    mocks.preview.mockRejectedValueOnce(new Error('Connection interrupted.'));
    render(<BillingPreview />);
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-10' } });
    await calculate();
    expect(screen.getByRole('alert')).toHaveTextContent('Connection interrupted.');
    fireEvent.click(screen.getByText('Retry calculation'));
    await calculate();
    expect(mocks.preview).toHaveBeenCalledTimes(4);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not assume a trial deduction in a general new-student scenario', async () => {
    render(<BillingPreview />);
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-10' } });
    await calculate();
    expect(mocks.preview.mock.calls[0][0].trial_deduction).toBe(false);
  });

  it('seeds an embedded existing-student journey without carrying trial defaults', async () => {
    render(<BillingPreview embedded initialRequest={{
      first_lesson_date: '2026-12-15', mode: 'transition', payment_method: 'autopay', materials_fee: 0,
      trial_deduction: false, mandate_ready: false,
      slots: [{ weekday: 'Tue', time_slot: '16:45 - 18:15', location: 'MSA', covered_through: '2026-12-08' }],
    }} />);
    await calculate();
    expect(screen.getByLabelText('First session to charge')).toHaveValue('2026-12-15');
    expect(mocks.preview.mock.calls[0][0]).toMatchObject({
      mode: 'transition', payment_method: 'autopay', trial_deduction: false,
      slots: [{ weekday: 'Tue', covered_through: '2026-12-08' }],
    });
    expect(screen.queryByText('Review existing students and their recorded coverage')).not.toBeInTheDocument();
  });

  it('preserves both weekly weekdays when the first uncovered date moves to the second slot', async () => {
    render(<BillingPreview embedded initialRequest={{
      first_lesson_date: '2026-11-10', mode: 'transition', payment_method: 'manual', materials_fee: 0,
      trial_deduction: false, mandate_ready: false, slots: [{ weekday: 'Tue' }, { weekday: 'Thu' }],
    }} />);
    fireEvent.change(screen.getByLabelText('First session to charge'), { target: { value: '2026-11-12' } });
    await calculate();
    expect(mocks.preview.mock.calls[0][0].slots.map((slot: { weekday: string }) => slot.weekday)).toEqual(['Tue', 'Thu']);
  });
});
