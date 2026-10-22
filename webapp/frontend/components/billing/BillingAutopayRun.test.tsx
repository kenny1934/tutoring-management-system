import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SWRConfig, useSWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingAutopayRun } from './BillingAutopayRun';
import type { BillingAutopayResponse, BillingAutopayRow, BillingAutopayStage } from '@/types/billing';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), location: vi.fn(), setLocation: vi.fn(), options: vi.fn(), autopay: vi.fn(), payment: vi.fn(), bankRuns: vi.fn(), bankRun: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/contexts/LocationContext', () => ({ useLocation: mocks.location }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: { autopay: mocks.autopay, options: mocks.options, bankRuns: mocks.bankRuns, bankRun: mocks.bankRun } }));
vi.mock('@/lib/hooks', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/hooks')>(), usePageTitle: vi.fn(), useVisibilityAwareInterval: () => 0 }));
vi.mock('@/lib/hooks/useSummerPreGradeWindow', () => ({ useSummerPreGradeWindow: () => false }));
vi.mock('@/components/layout/PageSurface', () => ({ PageSurface: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('./BillingPayments', () => ({ BillingPayments: (props: { studentId: number; initialPaymentId: string; canWrite: boolean }) => {
  mocks.payment(props); return <section aria-label="Reviewed payment">{props.studentId}:{props.initialPaymentId}</section>;
} }));

const options = { autopay_first_collection_month: '2026-11', autopay_last_collection_month: '2027-06' };
function row(overrides: Partial<BillingAutopayRow> = {}): BillingAutopayRow {
  return { key: 'payment-one', student: { id: 4, student_name: 'Synthetic Student', school_student_id: '004', home_location: 'MSA', grade: 'F1', lang_stream: 'E', school: 'Synthetic School', is_staff_referral: false },
    stage: 'ready', origin: 'payment', payment_id: 'payment-one', draft_id: 'draft-one', payment_status: 'Pending Payment',
    collection: { method: 'autopay', notice_from: '2026-11-12', notice_to: '2026-11-18', debit_from: '2026-11-20', debit_to: '2026-11-22', due_before_lesson: null, gap_min_days: null, gap_max_days: null },
    coverage_from: '2026-12-19', coverage_through: '2027-01-31', lesson_count: 6, total_fee: 2400, amount_basis: 'confirmed', recorded_payment_method: 'autopay', mandate_ready: true, sent_at: '2026-11-14T12:00:00', reasons: [{ code: 'READY', label: 'Message sent' }], enrollment_ids: [7], action_url: '/billing/students/4?view=payments&payment=payment-one', ...overrides };
}
function response(rows: BillingAutopayRow[] = [row()], overrides: Partial<BillingAutopayResponse> = {}): BillingAutopayResponse {
  return { as_of: '2026-11-15', collection_month: '2026-11', confirmed_storage_available: true, preparation_available: true, notice_from: '2026-11-12', notice_to: '2026-11-18', debit_from: '2026-11-20', debit_to: '2026-11-22', counts: { ready: 2, attention: 3, prepare: 4, skipped: 5 }, ready_total: 6000, total: rows.length, offset: 0, limit: 25, rows, ...overrides };
}
function show(initialCollectionMonth = '2026-11') {
  const cache = new Map();
  let refresh: () => Promise<unknown> = async () => {};
  function CaptureRefresh() {
    const { mutate } = useSWRConfig();
    refresh = () => mutate(key => Array.isArray(key) && key[0] === 'billing-autopay');
    return null;
  }
  function Wrapper({ children }: { children: React.ReactNode }) { return <SWRConfig value={{ provider: () => cache, dedupingInterval: 0, revalidateOnFocus: false, shouldRetryOnError: false }}><CaptureRefresh />{children}</SWRConfig>; }
  return { ...render(<BillingAutopayRun initialCollectionMonth={initialCollectionMonth} />, { wrapper: Wrapper }), refresh: () => refresh() };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockReturnValue({ user: { id: 1 }, isAdmin: true, canViewAdminPages: true, isLoading: false, effectiveRole: 'Admin' });
  mocks.location.mockReturnValue({ selectedLocation: 'MSA', locations: ['All Locations', 'MSA', 'MSB', 'Various'], setSelectedLocation: mocks.setLocation });
  mocks.options.mockReset().mockResolvedValue(options);
  mocks.autopay.mockReset().mockResolvedValue(response());
  mocks.bankRuns.mockReset().mockResolvedValue({ storage_available: true, writes_available: false, runs: [] });
  mocks.bankRun.mockReset().mockRejectedValue(new Error('Synthetic selected run.'));
});
afterEach(() => vi.useRealTimers());

describe('autopay collection review', () => {
  it('opens the exact saved run month and profile branch while preserving the familiar Details action', async () => {
    mocks.location.mockReturnValue({ selectedLocation: 'MSB', locations: ['All Locations', 'MSA', 'MSB', 'Various'], setSelectedLocation: mocks.setLocation });
    mocks.autopay.mockResolvedValue(response([row({ stage: 'attention', bank_run: { id: 'earlier-run', branch: 'MSA', collection_month: '2026-11', follow_up: 'awaiting_results', reason: 'Awaiting bank results' } })], { collection_month: '2026-12', ready_total: 0 }));
    show('2026-12'); const card = await screen.findByRole('article', { name: 'Synthetic Student autopay' }); expect(within(card).getByText('Awaiting bank results')).toBeInTheDocument(); expect(within(card).getByRole('button', { name: 'Details for Synthetic Student' })).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Open bank run for Synthetic Student' })); const dialog = await screen.findByRole('dialog', { name: 'Bank file' });
    await within(dialog).findByText('Synthetic selected run.'); expect(within(dialog).getByLabelText('Profile branch')).toHaveValue('MSA'); expect(within(dialog).getByText('November 2026')).toBeInTheDocument();
    expect(mocks.bankRuns).toHaveBeenCalledWith({ collection_month: '2026-11', branch: 'MSA' }, expect.any(AbortSignal)); expect(mocks.bankRun).toHaveBeenCalledWith('earlier-run', expect.any(AbortSignal)); expect(mocks.autopay.mock.calls[0][0].location).toBe('MSB');
  });

  it('shows follow-up metadata without exposing bank history actions to read-only staff', async () => {
    mocks.auth.mockReturnValue({ user: { id: 9 }, canViewAdminPages: true, isAdmin: false, isReadOnly: true, isLoading: false, effectiveRole: 'Supervisor' }); mocks.autopay.mockResolvedValue(response([row({ stage: 'attention', bank_run: { id: 'run-one', branch: 'MSA', collection_month: '2026-11', follow_up: 'review', reason: 'Check possible duplicate collection' } })]));
    show(); const card = await screen.findByRole('article', { name: 'Synthetic Student autopay' }); expect(within(card).getByText('Check possible duplicate collection')).toBeInTheDocument(); expect(within(card).queryByRole('button', { name: /Open bank run/ })).not.toBeInTheDocument(); expect(within(card).getByRole('button', { name: 'Details for Synthetic Student' })).toBeInTheDocument();
  });

  it('keeps the original attention reason visible when a prepared file also exists', async () => {
    mocks.autopay.mockResolvedValue(response([row({ stage: 'attention', reasons: [{ code: 'MANDATE_NOT_READY', label: 'Check bank authorisation' }], bank_run: { id: 'run-one', branch: 'MSA', collection_month: '2026-11', follow_up: 'prepared', reason: 'Saved bank file' } })]));
    show(); const card = await screen.findByRole('article', { name: 'Synthetic Student autopay' }); expect(within(card).getByText('File saved')).toBeInTheDocument(); expect(within(card).getByText('Check bank authorisation')).toBeInTheDocument();
  });
  it('separates collection dates, lesson coverage and the scoped exact ready total', async () => {
    show();
    const card = await screen.findByRole('article', { name: 'Synthetic Student autopay' });
    const summary = screen.getByRole('region', { name: 'Collection summary' });
    expect(within(summary).getByText('MOP 6,000')).toBeInTheDocument();
    expect(within(summary).getByText('Ready to collect · 2 payments')).toBeInTheDocument();
    expect(within(summary).getByText('Nov 20, 2026 to Nov 22, 2026')).toBeInTheDocument();
    expect(within(card).getByText('Dec 19, 2026 to Jan 31, 2027')).toBeInTheDocument();
    expect(within(card).getByText('6 sessions')).toBeInTheDocument();
    expect(within(card).getByText('MOP 2,400')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Synthetic Student' })).toHaveAttribute('href', '/students/4');
    expect(within(card).getByText('Synthetic School')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Needs attention 3' })).toBeInTheDocument();
    expect(mocks.autopay).toHaveBeenCalledWith({ collection_month: '2026-11', stage: 'ready', location: 'MSA', search: undefined, offset: 0, limit: 25 });
    fireEvent.click(within(card).getByRole('button', { name: 'Details for Synthetic Student' }));
    const dialog = await screen.findByRole('dialog', { name: 'Payment' });
    expect(mocks.payment.mock.lastCall![0]).toEqual(expect.objectContaining({ studentId: 4, initialPaymentId: 'payment-one', canWrite: false, inline: true }));
    expect(within(dialog).getByRole('link', { name: 'Open payment' })).toHaveAttribute('href', '/billing/students/4?view=payments&payment=payment-one');
    expect(within(dialog).queryByRole('link', { name: 'Review draft' })).not.toBeInTheDocument();
  });

  it('keeps saved and projected preparation estimates out of the ready amount', async () => {
    const draft = row({ key: 'draft-two', stage: 'prepare', origin: 'draft', payment_id: null, payment_status: null, amount_basis: 'estimate', total_fee: 3200, reasons: [{ code: 'CREATE_ENROLLMENT', label: 'Create enrollment' }], action_url: '/billing/students/4?view=drafts&draft=draft-one' });
    mocks.autopay.mockImplementation(({ stage }: { stage: BillingAutopayStage }) => Promise.resolve(response(stage === 'prepare' ? [draft] : [], { counts: { ready: 0, attention: 0, prepare: 1, skipped: 0 }, ready_total: 0, total: stage === 'prepare' ? 1 : 0, confirmed_storage_available: false })));
    show(); await screen.findByText('Confirmed payments are not available yet.');
    fireEvent.click(screen.getByRole('tab', { name: 'To prepare 1' }));
    const card = await screen.findByRole('article');
    expect(within(card).getByText('Draft amount')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Collection summary' })).getByText('MOP 0')).toBeInTheDocument();
    expect(screen.queryByText('Ready to collect · 1 payment')).not.toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Details for Synthetic Student' }));
    expect(await screen.findByRole('link', { name: 'Review draft' })).toHaveAttribute('href', '/billing/students/4?view=drafts&draft=draft-one');
    expect(screen.getByText('Confirm the amount when reviewing the enrollment.')).toBeInTheDocument();
    expect(mocks.payment).not.toHaveBeenCalled();
  });

  it('shows paid and manual-first skips with direct reasons and paid amount context', async () => {
    const paid = row({ stage: 'skipped', payment_status: 'Paid', reasons: [{ code: 'PAID', label: 'Already paid' }] });
    const manual = row({ key: 'manual', stage: 'skipped', student: { ...row().student, id: 5, student_name: 'Second Student', school_student_id: '005' }, collection: { ...row().collection!, method: 'manual' }, reasons: [{ code: 'FIRST_MANUAL', label: 'First payment is manual' }] });
    mocks.autopay.mockImplementation(({ stage }: { stage: BillingAutopayStage }) => Promise.resolve(response(stage === 'skipped' ? [paid, manual] : [])));
    show(); await screen.findByRole('tab', { name: 'Skipped 5' }); fireEvent.click(screen.getByRole('tab', { name: 'Skipped 5' }));
    const card = await screen.findByRole('article', { name: 'Synthetic Student autopay' });
    expect(within(card).getByText('Already paid')).toBeInTheDocument(); expect(within(card).getByText('Paid')).toBeInTheDocument();
    const manualCard = screen.getByRole('article', { name: 'Second Student autopay' });
    expect(within(manualCard).getByText('Manual')).toBeInTheDocument(); expect(within(manualCard).getByText('First payment is manual')).toBeInTheDocument();
    expect(screen.getAllByRole('article').map(value => value.getAttribute('aria-label'))).toEqual(['Synthetic Student autopay', 'Second Student autopay']);
  });

  it('shows a proven legacy prepayment without inventing a payment or amount', async () => {
    const legacy = row({ key: 'legacy-paid', stage: 'skipped', origin: 'projection', payment_id: null,
      draft_id: null, payment_status: null, collection: null, total_fee: null, amount_basis: 'unknown',
      reasons: [{ code: 'PREPAID', label: 'Already paid for these lessons' }], action_url: '/billing/students/4' });
    mocks.autopay.mockImplementation(({ stage }: { stage: BillingAutopayStage }) => Promise.resolve(response(
      stage === 'skipped' ? [legacy] : [], { ready_total: 0, counts: { ready: 0, attention: 0, prepare: 0, skipped: 1 } },
    )));
    show();
    fireEvent.click(await screen.findByRole('tab', { name: 'Skipped 1' }));
    const card = await screen.findByRole('article');
    expect(within(card).getByText('No debit')).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Details for Synthetic Student' }));
    const dialog = await screen.findByRole('dialog', { name: 'Autopay details' });
    expect(within(dialog).getByText('No debit')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Open payment journey' })).toHaveAttribute('href', '/billing/students/4');
    expect(mocks.payment).not.toHaveBeenCalled();
  });

  it('waits for explicit policy dates and defaults an October visit to the first November collection', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-20T08:00:00Z'));
    let finish!: (value: typeof options) => void;
    mocks.options.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    show(''); expect(mocks.autopay).not.toHaveBeenCalled(); expect(screen.getByLabelText('Collection month')).toBeDisabled();
    await act(async () => finish(options));
    await screen.findByRole('article');
    expect(mocks.autopay.mock.lastCall![0].collection_month).toBe('2026-11');
    expect(screen.getByLabelText('Collection month')).toHaveValue('2026-11');
    expect(screen.getByLabelText('Collection month')).toHaveAttribute('min', '2026-11'); expect(screen.getByLabelText('Collection month')).toHaveAttribute('max', '2027-06');
  });

  it('explains unsupported months without silently opening another collection', async () => {
    show('2026-10');
    await screen.findByText('Choose a collection month from Nov 2026 to Jun 2027.');
    expect(mocks.autopay).not.toHaveBeenCalled(); expect(screen.getByLabelText('Collection month')).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(screen.getByLabelText('Collection month'), { target: { value: '2026-11' } });
    await screen.findByRole('article'); expect(screen.queryByText('Choose a collection month from Nov 2026 to Jun 2027.')).not.toBeInTheDocument();
  });

  it('normalizes Various to all branches and resets paging when scope changes', async () => {
    mocks.location.mockReturnValue({ selectedLocation: 'Various', locations: ['All Locations', 'MSA', 'MSB', 'Various'], setSelectedLocation: mocks.setLocation });
    mocks.autopay.mockImplementation((params: { offset: number }) => Promise.resolve(response([row()], { total: 40, offset: params.offset })));
    const view = show(); await screen.findByRole('article');
    expect(screen.getByLabelText('Branch')).toHaveValue('All Locations'); expect(screen.queryByRole('option', { name: 'Various' })).not.toBeInTheDocument();
    expect(mocks.autopay.mock.lastCall![0].location).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(mocks.autopay.mock.lastCall![0].offset).toBe(25));
    mocks.location.mockReturnValue({ selectedLocation: 'MSB', locations: ['All Locations', 'MSA', 'MSB', 'Various'], setSelectedLocation: mocks.setLocation });
    view.rerender(<BillingAutopayRun initialCollectionMonth="2026-11" />);
    await waitFor(() => expect(mocks.autopay.mock.lastCall![0]).toEqual(expect.objectContaining({ location: 'MSB', offset: 0 })));
  });

  it('withholds stale totals and closes old details during a month change', async () => {
    const view = show();
    fireEvent.click(await screen.findByRole('button', { name: 'Details for Synthetic Student' })); await screen.findByRole('dialog');
    let finish!: (value: BillingAutopayResponse) => void;
    mocks.autopay.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    fireEvent.change(screen.getByLabelText('Collection month'), { target: { value: '2026-12' } });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(screen.queryByText('MOP 6,000')).not.toBeInTheDocument(); expect(screen.queryByRole('article')).not.toBeInTheDocument();
    await act(async () => finish(response([], { collection_month: '2026-12', counts: { ready: 0, attention: 0, prepare: 0, skipped: 1 }, ready_total: 0 })));
    await screen.findByText('No payments are ready for this collection.');
    expect(screen.getByText('MOP 0')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Collection month'), { target: { value: '2026-11' } });
    await screen.findByRole('article'); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    view.unmount();
  });

  it('withholds open Ready details during refresh and closes them when the payment has been collected', async () => {
    const view = show();
    fireEvent.click(await screen.findByRole('button', { name: 'Details for Synthetic Student' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByText('Ready')).toBeVisible());
    let finish!: (value: BillingAutopayResponse) => void;
    mocks.autopay.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    let refresh!: Promise<unknown>;
    act(() => { refresh = view.refresh(); });
    await within(dialog).findByText('Checking collection…');
    expect(dialog).toBeInTheDocument(); expect(within(dialog).getByText('Ready')).not.toBeVisible();
    await act(async () => { finish(response([], { ready_total: 0, counts: { ready: 0, attention: 0, prepare: 0, skipped: 1 }, total: 0 })); await refresh; });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Ready 0' })).toHaveFocus());
    expect(screen.getByText('MOP 0')).toBeInTheDocument();
  });

  it('rebases an open detail onto changed collection checks for a row that remains in the tab', async () => {
    const first = row({ stage: 'attention', reasons: [{ code: 'MANDATE_NOT_READY', label: 'Autopay setup is not ready' }] });
    mocks.autopay.mockImplementation(({ stage }: { stage: BillingAutopayStage }) => Promise.resolve(response(stage === 'attention' ? [first] : [])));
    const view = show();
    fireEvent.click(await screen.findByRole('tab', { name: 'Needs attention 3' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Details for Synthetic Student' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByText('Autopay setup is not ready')).toBeVisible());
    mocks.autopay.mockResolvedValueOnce(response([{ ...first, reasons: [{ code: 'ACCOUNT_INACTIVE', label: 'Autopay participation needs review' }] }]));
    await act(async () => { await view.refresh(); });
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(within(dialog).getByText('Autopay participation needs review')).toBeVisible();
    expect(within(dialog).queryByText('Autopay setup is not ready')).not.toBeInTheDocument();
  });

  it('keeps a selected phone tab in view after returning counts change the tab widths', async () => {
    show();
    const skipped = await screen.findByRole('tab', { name: 'Skipped 5' });
    const bar = screen.getByRole('tablist', { name: 'Autopay stages' });
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 240 } as DOMRect);
    vi.spyOn(skipped, 'getBoundingClientRect').mockImplementation(() => skipped.querySelector('span')
      ? { left: 270, right: 330 } as DOMRect : { left: 160, right: 220 } as DOMRect);
    let finish!: (value: BillingAutopayResponse) => void;
    mocks.autopay.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    fireEvent.click(skipped);
    await waitFor(() => expect(mocks.autopay.mock.lastCall![0].stage).toBe('skipped'));
    expect(bar.scrollLeft).toBe(0);
    await act(async () => finish(response([])));
    await screen.findByRole('tab', { name: 'Skipped 5' });
    await waitFor(() => expect(bar.scrollLeft).toBeGreaterThan(0));
    expect(skipped).toHaveAttribute('aria-selected', 'true');
  });

  it('isolates effective-role access and never exposes a write action in a Supervisor view', async () => {
    const view = show(); await screen.findByRole('article');
    mocks.auth.mockReturnValue({ user: { id: 1 }, isAdmin: false, isReadOnly: true, canViewAdminPages: true, effectiveRole: 'Supervisor' });
    view.rerender(<BillingAutopayRun initialCollectionMonth="2026-11" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Details for Synthetic Student' }));
    await screen.findByRole('dialog'); expect(mocks.payment.mock.lastCall![0].canWrite).toBe(false);
    const calls = mocks.autopay.mock.calls.length;
    mocks.auth.mockReturnValue({ user: { id: 1 }, isAdmin: false, canViewAdminPages: false, effectiveRole: 'Tutor', isImpersonating: true, impersonatedTutor: { id: 9 } });
    view.rerender(<BillingAutopayRun initialCollectionMonth="2026-11" />);
    expect(screen.getByText('Admin access is required to review autopay.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(screen.queryByText('MOP 6,000')).not.toBeInTheDocument(); expect(mocks.autopay).toHaveBeenCalledTimes(calls);
  });

  it('hides old results while a search is pending and retries an error without reporting zero readiness', async () => {
    show(); await screen.findByRole('article');
    mocks.autopay.mockRejectedValueOnce(new Error('Collection unavailable.'));
    fireEvent.change(screen.getByLabelText('Find a student'), { target: { value: '004' } });
    expect(screen.queryByRole('article')).not.toBeInTheDocument(); expect(screen.queryByText('MOP 6,000')).not.toBeInTheDocument();
    await screen.findByText('Collection unavailable.'); expect(screen.queryByText('MOP 0')).not.toBeInTheDocument();
    expect(mocks.autopay.mock.lastCall![0].search).toBe('004');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' })); await screen.findByRole('article');
  });
});
