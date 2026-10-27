import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingRoster } from './BillingRoster';
import type { BillingMethod, BillingPreferences, BillingRosterResponse, BillingRosterRow } from '@/types/billing';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), location: vi.fn(), students: vi.fn(), options: vi.fn(), preferences: vi.fn(),
  savePreferences: vi.fn(), invalidate: vi.fn(), confirmDraft: vi.fn(), recordPayment: vi.fn(),
  recordManualPayment: vi.fn(), markPaymentSent: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/contexts/LocationContext', () => ({ useLocation: mocks.location }));
vi.mock('@/lib/hooks', async original => ({ ...await original<typeof import('@/lib/hooks')>(), usePageTitle: vi.fn(), useVisibilityAwareInterval: () => 0 }));
vi.mock('@/lib/hooks/useSummerPreGradeWindow', () => ({ useSummerPreGradeWindow: () => false }));
vi.mock('@/lib/renewal-queue', () => ({ invalidateRenewalQueueCache: mocks.invalidate }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: {
  students: mocks.students, options: mocks.options, preferences: mocks.preferences,
  savePreferences: mocks.savePreferences, confirmDraft: mocks.confirmDraft,
  recordPayment: mocks.recordPayment, recordManualPayment: mocks.recordManualPayment,
  markPaymentSent: mocks.markPaymentSent,
} }));
vi.mock('@/components/layout/PageSurface', () => ({ PageSurface: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

function period(method: BillingMethod, amount: number, actualMethod: BillingMethod = method): BillingRosterRow['next_manual'] {
  return {
    lesson_count: amount / 400, gross_tuition: amount,
    first_lesson_date: '2026-11-13', coverage_through: '2026-12-31',
    collection: { method: actualMethod, due_before_lesson: actualMethod === 'manual' ? '2026-11-13' : null,
      notice_from: actualMethod === 'autopay' ? '2026-11-12' : null,
      notice_to: actualMethod === 'autopay' ? '2026-11-18' : null,
      debit_from: actualMethod === 'autopay' ? '2026-11-20' : null,
      debit_to: actualMethod === 'autopay' ? '2026-11-22' : null,
      gap_min_days: null, gap_max_days: null },
  };
}

type PlanRow = BillingRosterRow & { recorded_payment_method: BillingMethod | null; mandate_ready: boolean; preference_version: number };
function row(id: number, method: BillingMethod | null, changes: Partial<PlanRow> = {}): PlanRow {
  return {
    student: { id, student_name: `Synthetic plan ${id}`, school_student_id: String(id).padStart(4, '0'), home_location: 'MSA', grade: 'F2', is_staff_referral: false },
    upcoming_original_count: 4, pending_bill_count: 0, sent_pending_bill_count: 0, pending_makeup_count: 0,
    slot_candidate_count: 1, selected_slot_count: 1, last_paid_original_date: '2026-11-06', first_uncovered_date: '2026-11-13',
    next_manual: period('manual', id === 1 ? 3200 : 4000), next_autopay: period('autopay', id === 1 ? 1600 : 2000),
    issues: [], source_issues: [], method_issues: {}, requires_review: false, source_fingerprint: `synthetic-source-${id}`,
    recorded_payment_method: method, mandate_ready: false, preference_version: method ? 2 : 0,
    ...changes,
  };
}
let rows: PlanRow[];
function response(values = rows): BillingRosterResponse & { preferences_available: boolean; preference_counts: Record<string, number> } {
  return {
    as_of: '2026-11-15', basis: 'paid_only', total: values.length, offset: 0, limit: 25, rows: structuredClone(values),
    preferences_available: true, preference_counts: { total: rows.length, not_recorded: rows.filter(row => !row.recorded_payment_method).length, manual: rows.filter(row => row.recorded_payment_method === 'manual').length, autopay: rows.filter(row => row.recorded_payment_method === 'autopay').length, setup_pending: rows.filter(row => row.recorded_payment_method === 'autopay' && !row.mandate_ready).length },
  };
}
function preference(value: PlanRow): BillingPreferences {
  return { student_id: value.student.id, payment_method: value.recorded_payment_method, mandate_ready: value.mandate_ready, version: value.preference_version, updated_at: value.preference_version ? '2026-10-27T01:00:00Z' : null };
}
function Wrapper({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnFocus: false, shouldRetryOnError: false }}>{children}</SWRConfig>;
}
function show() { return render(<BillingRoster />, { wrapper: Wrapper }); }
async function card(id: number) {
  await screen.findByText(`Synthetic plan ${id}`);
  return screen.getByRole('article', { name: new RegExp(`Synthetic plan ${id}\\b`) });
}

beforeEach(() => {
  vi.clearAllMocks();
  rows = [row(1, 'manual'), row(2, 'autopay'), row(3, null), row(4, 'autopay', { next_autopay: period('autopay', 2400, 'manual'), mandate_ready: true })];
  mocks.auth.mockReturnValue({ user: { id: 9 }, isLoading: false, isGuest: false, isAdmin: true, isReadOnly: false, canViewAdminPages: true, effectiveRole: 'Admin', isImpersonating: false });
  mocks.location.mockReturnValue({ selectedLocation: 'MSA' });
  mocks.students.mockReset().mockImplementation(async () => response());
  mocks.options.mockReset().mockResolvedValue({ workflow_available: true, workflow_writes_available: false, preferences_writes_available: true });
  mocks.preferences.mockReset().mockImplementation(async (id: number) => preference(rows.find(value => value.student.id === id)!));
  mocks.savePreferences.mockReset().mockImplementation(async (id: number, body: { payment_method: BillingMethod | null; mandate_ready: boolean; expected_version: number }) => {
    const value = rows.find(item => item.student.id === id)!;
    value.recorded_payment_method = body.payment_method;
    value.mandate_ready = body.mandate_ready;
    value.preference_version = body.expected_version + 1;
    return preference(value);
  });
  mocks.invalidate.mockResolvedValue(undefined);
});

describe('payment plans on the existing student roster', () => {
  it('names the existing page Payment plans and shows only the saved method for recorded students', async () => {
    show();
    const manual = await card(1), autopay = await card(2);
    expect(screen.getByRole('heading', { name: 'Payment plans' })).toBeVisible();
    expect(within(manual).getByText('MOP 3,200')).toBeVisible();
    expect(within(manual).queryByText('MOP 1,600')).not.toBeInTheDocument();
    expect(within(autopay).getByText('MOP 2,000')).toBeVisible();
    expect(within(autopay).queryByText('MOP 4,000')).not.toBeInTheDocument();
  });

  it('keeps the unknown student comparison side by side without inventing a manual choice', async () => {
    show(); const unknown = await card(3);
    expect(within(unknown).getByText('MOP 4,000')).toBeVisible();
    expect(within(unknown).getByText('MOP 2,000')).toBeVisible();
    expect(mocks.savePreferences).not.toHaveBeenCalled();
    expect(mocks.confirmDraft).not.toHaveBeenCalled();
    expect(mocks.recordPayment).not.toHaveBeenCalled();
    expect(mocks.recordManualPayment).not.toHaveBeenCalled();
    expect(mocks.markPaymentSent).not.toHaveBeenCalled();
  });

  it('retains Autopay as the saved choice when its next transition collection is manual', async () => {
    show(); const transition = await card(4);
    expect(within(transition).getByText('MOP 2,400')).toBeVisible();
    expect(within(transition).queryByText('MOP 4,000')).not.toBeInTheDocument();
    expect(within(transition).getByText(/Due before Nov 13, 2026/)).toBeVisible();
    expect(within(transition).getAllByText('Autopay').length).toBeGreaterThan(0);
    expect(within(transition).getAllByText('Manual').length).toBeGreaterThan(0);
  });

  it('keeps a route to the full journey instead of treating list previews as enrollment creation', async () => {
    show(); const manual = await card(1);
    expect(within(manual).getAllByRole('link').some(link => link.getAttribute('href') === '/billing/students/1?basis=include_pending')).toBe(true);
    expect(mocks.confirmDraft).not.toHaveBeenCalled();
    expect(mocks.recordPayment).not.toHaveBeenCalled();
  });

  it('does not surface hidden Autopay-only warnings on a saved Manual row', async () => {
    const warning = { code: 'MANDATE_CHECK_REQUIRED', message: 'Synthetic hidden Autopay warning.', period: null };
    rows[0].issues = [warning];
    rows[0].source_issues = [];
    rows[0].method_issues = { autopay: [warning], manual: [] };
    show(); const manual = await card(1);
    expect(within(manual).queryByText(warning.message)).not.toBeInTheDocument();
  });

  it('keeps read-only staff on the roster without enabling preference writes', async () => {
    mocks.auth.mockReturnValue({ user: { id: 9 }, isLoading: false, isGuest: false, isAdmin: false,
      isReadOnly: true, canViewAdminPages: true, effectiveRole: 'Supervisor', isImpersonating: false });
    show(); const manual = await card(1);
    expect(within(manual).getByText('MOP 3,200')).toBeVisible();
    expect(within(manual).queryAllByRole('combobox').every(control => control.hasAttribute('disabled'))).toBe(true);
    expect(mocks.savePreferences).not.toHaveBeenCalled();
  });

  it('uses the impersonated tutor scope for the same roster without granting writes', async () => {
    mocks.auth.mockReturnValue({ user: { id: 99 }, isLoading: false, isGuest: false, isAdmin: false,
      isReadOnly: true, canViewAdminPages: false, effectiveRole: 'Tutor', isImpersonating: true, impersonatedTutor: { id: 42 } });
    show(); await card(1);
    expect(mocks.students).toHaveBeenCalledWith(expect.objectContaining({ tutor_id: 42, location: 'MSA' }));
    expect(mocks.savePreferences).not.toHaveBeenCalled();
  });

  it('does not restore old-branch rows after an earlier roster read arrives late', async () => {
    let finish!: (value: ReturnType<typeof response>) => void;
    const old = response();
    mocks.students.mockImplementationOnce(() => new Promise<ReturnType<typeof response>>(resolve => { finish = resolve; }));
    const view = show();
    await waitFor(() => expect(mocks.students).toHaveBeenCalledOnce());
    const next = row(90, 'manual'); next.student.home_location = 'MSB';
    mocks.students.mockResolvedValue(response([next]));
    mocks.location.mockReturnValue({ selectedLocation: 'MSB' });
    view.rerender(<BillingRoster />);
    await card(90);
    await act(async () => { finish(old); });
    expect(screen.queryByText('Synthetic plan 1')).not.toBeInTheDocument();
    expect(screen.getByText('Synthetic plan 90')).toBeInTheDocument();
    expect(mocks.students).toHaveBeenLastCalledWith(expect.objectContaining({ location: 'MSB', offset: 0 }));
  });


  it('records a choice inline while financial workflow writes remain disabled', async () => {
    show(); const unknown = await card(3);
    expect(within(unknown).getByRole('combobox', { name: 'Payment method for Synthetic plan 3' })).toHaveValue('');
    fireEvent.change(within(unknown).getByRole('combobox'), { target: { value: 'autopay' } });
    await waitFor(() => expect(mocks.savePreferences).toHaveBeenCalledOnce());
    await waitFor(() => expect(within(screen.getByRole('article', { name: /Synthetic plan 3\b/ })).queryByText('MOP 4,000')).not.toBeInTheDocument());
    const updated = screen.getByRole('article', { name: /Synthetic plan 3\b/ });
    expect(within(updated).getByText('MOP 2,000')).toBeVisible();
    expect(within(updated).getByRole('checkbox', { name: 'Bank authorisation ready' })).not.toBeChecked();
    expect(mocks.savePreferences).toHaveBeenCalledWith(3, expect.objectContaining({ payment_method: 'autopay', mandate_ready: false, expected_version: 0 }), expect.any(AbortSignal));
    expect(mocks.confirmDraft).not.toHaveBeenCalled(); expect(mocks.recordPayment).not.toHaveBeenCalled();
    expect(mocks.recordManualPayment).not.toHaveBeenCalled(); expect(mocks.markPaymentSent).not.toHaveBeenCalled();
  });

  it('keeps the old saved preview until a changed preference is confirmed', async () => {
    let finish!: (value: BillingPreferences) => void;
    mocks.savePreferences.mockImplementationOnce(() => new Promise<BillingPreferences>(resolve => { finish = resolve; }));
    show(); const manual = await card(1);
    fireEvent.change(within(manual).getByRole('combobox'), { target: { value: 'autopay' } });
    await waitFor(() => expect(mocks.savePreferences).toHaveBeenCalledOnce());
    expect(within(manual).getByText('MOP 3,200')).toBeVisible();
    expect(within(manual).queryByText('MOP 1,600')).not.toBeInTheDocument();
    rows[0].recorded_payment_method = 'autopay'; rows[0].preference_version = 3;
    await act(async () => { finish(preference(rows[0])); });
    await waitFor(() => expect(within(screen.getByRole('article', { name: /Synthetic plan 1\b/ })).getByText('MOP 1,600')).toBeVisible());
    expect(within(screen.getByRole('article', { name: /Synthetic plan 1\b/ })).queryByText('MOP 3,200')).not.toBeInTheDocument();
  });

  it('filters preference collection over the roster without adding a collection-month restriction', async () => {
    mocks.students.mockImplementation(async ({ preference_filter }: { preference_filter?: string } = {}) => response(preference_filter === 'not_recorded' ? rows.filter(row => !row.recorded_payment_method) : rows));
    show(); await card(1);
    fireEvent.click(screen.getByRole('tab', { name: /^Not recorded 1$/ }));
    await card(3);
    expect(screen.queryByText('Synthetic plan 1')).not.toBeInTheDocument();
    expect(mocks.students).toHaveBeenLastCalledWith(expect.objectContaining({ preference_filter: 'not_recorded', offset: 0, location: 'MSA' }));
    expect(mocks.students.mock.lastCall![0]).not.toHaveProperty('collection_month');
    expect(screen.queryByLabelText('Collection month')).not.toBeInTheDocument();
  });

  it('clears selection when the preference filter changes', async () => {
    show(); const manual = await card(1);
    fireEvent.click(within(manual).getByRole('checkbox', { name: 'Select Synthetic plan 1' }));
    expect(await screen.findByRole('button', { name: 'Set payment method' })).toBeEnabled();
    fireEvent.click(screen.getByRole('tab', { name: /^Autopay 2$/ }));
    await waitFor(() => expect(mocks.students).toHaveBeenLastCalledWith(expect.objectContaining({ preference_filter: 'autopay' })));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Set payment method' })).not.toBeInTheDocument());
    expect(mocks.savePreferences).not.toHaveBeenCalled();
  });

  it('aborts inline saving when effective access changes and ignores its late reply', async () => {
    let finish!: (value: BillingPreferences) => void;
    mocks.savePreferences.mockImplementationOnce(() => new Promise<BillingPreferences>(resolve => { finish = resolve; }));
    const view = show(); const manual = await card(1);
    fireEvent.change(within(manual).getByRole('combobox'), { target: { value: 'autopay' } });
    await waitFor(() => expect(mocks.savePreferences).toHaveBeenCalledOnce());
    const signal = mocks.savePreferences.mock.calls[0][2] as AbortSignal;
    mocks.auth.mockReturnValue({ user: { id: 9 }, isLoading: false, isGuest: false, isAdmin: false, isReadOnly: true,
      canViewAdminPages: true, effectiveRole: 'Supervisor', isImpersonating: false });
    view.rerender(<BillingRoster />);
    await waitFor(() => expect(signal.aborted).toBe(true));
    await act(async () => { finish({ ...preference(rows[0]), payment_method: 'autopay', version: 3 }); });
    const readonly = await card(1);
    expect(within(readonly).getByText('MOP 3,200')).toBeVisible();
    expect(within(readonly).queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('hides stale selection immediately while a changed search is waiting to load', async () => {
    mocks.students.mockImplementation(async ({ search }: { search?: string } = {}) => response(search ? [] : rows));
    show(); const manual = await card(1);
    fireEvent.click(within(manual).getByRole('checkbox', { name: 'Select Synthetic plan 1' }));
    await screen.findByRole('button', { name: 'Set payment method' });
    fireEvent.change(screen.getByPlaceholderText('Name or student number'), { target: { value: 'new lookup' } });
    const outgoing = screen.queryByRole('button', { name: 'Set payment method' });
    if (outgoing) fireEvent.click(outgoing);
    expect(screen.queryByRole('dialog', { name: 'Set payment method' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Set payment method' })).not.toBeInTheDocument());
    await waitFor(() => expect(mocks.students).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'new lookup', offset: 0 })));
    fireEvent.change(screen.getByPlaceholderText('Name or student number'), { target: { value: '' } });
    await card(1);
    expect(screen.queryByRole('dialog', { name: 'Set payment method' })).not.toBeInTheDocument();
    expect(mocks.savePreferences).not.toHaveBeenCalled();
  });

  it('keeps comparison available without enabling writes when preference storage is unavailable', async () => {
    const data = response([row(3, null)]); data.preferences_available = false;
    mocks.students.mockResolvedValue(data);
    mocks.options.mockResolvedValue({ workflow_available: false, workflow_writes_available: false, preferences_writes_available: false });
    show(); const unknown = await card(3);
    expect(within(unknown).getByText('MOP 4,000')).toBeVisible(); expect(within(unknown).getByText('MOP 2,000')).toBeVisible();
    expect(within(unknown).queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Select Synthetic plan 3' })).not.toBeInTheDocument();
    expect(mocks.preferences).not.toHaveBeenCalled(); expect(mocks.savePreferences).not.toHaveBeenCalled();
  });


  it('allows preference collection even when that student needs timetable review', async () => {
    rows = [row(3, null, { next_manual: null, next_autopay: null, requires_review: true,
      issues: [{ code: 'CONTINUING_SLOTS_REVIEW', message: 'Synthetic timetable needs review.', period: null }],
      source_issues: [{ code: 'CONTINUING_SLOTS_REVIEW', message: 'Synthetic timetable needs review.', period: null }] })];
    show(); const needsReview = await card(3);
    expect(within(needsReview).getByRole('combobox', { name: 'Payment method for Synthetic plan 3' })).toBeEnabled();
    fireEvent.change(within(needsReview).getByRole('combobox'), { target: { value: 'manual' } });
    await waitFor(() => expect(mocks.savePreferences).toHaveBeenCalledOnce());
    expect(mocks.savePreferences).toHaveBeenCalledWith(3, expect.objectContaining({ payment_method: 'manual', expected_version: 0 }), expect.any(AbortSignal));
    expect(mocks.confirmDraft).not.toHaveBeenCalled();
  });


  it('aborts a pending inline read when fresh roster metadata withdraws preference storage', async () => {
    let finish!: (value: BillingPreferences) => void;
    mocks.preferences.mockImplementationOnce(() => new Promise<BillingPreferences>(resolve => { finish = resolve; }));
    show(); const manual = await card(1);
    fireEvent.change(within(manual).getByRole('combobox'), { target: { value: 'autopay' } });
    await waitFor(() => expect(mocks.preferences).toHaveBeenCalledOnce());
    const signal = mocks.preferences.mock.calls[0][2] as AbortSignal;
    mocks.students.mockResolvedValue({ ...response(), preferences_available: false });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh records' }));
    await waitFor(() => expect(signal.aborted).toBe(true));
    await act(async () => { finish(preference(rows[0])); });
    expect(mocks.savePreferences).not.toHaveBeenCalled();
    const readonly = await card(1);
    expect(within(readonly).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(readonly).getByText('MOP 3,200')).toBeVisible();
  });

  it('supports keyboard preference filtering with focus following the selected tab', async () => {
    show(); await card(1);
    const all = screen.getByRole('tab', { name: /^All 4$/ });
    const pending = screen.getByRole('tab', { name: /^Setup pending 1$/ });
    fireEvent.keyDown(all, { key: 'End' });
    expect(pending).toHaveFocus();
    await waitFor(() => expect(mocks.students).toHaveBeenLastCalledWith(expect.objectContaining({ preference_filter: 'setup_pending', offset: 0 })));
    expect(pending).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(pending, { key: 'Home' });
    expect(all).toHaveFocus();
    await waitFor(() => expect(mocks.students).toHaveBeenLastCalledWith(expect.objectContaining({ preference_filter: undefined, offset: 0 })));
  });


  it('retains scoped progress and keyboard filter access while a changed method is loading', async () => {
    let finishManual!: (value: ReturnType<typeof response>) => void;
    let finishAutopay!: (value: ReturnType<typeof response>) => void;
    mocks.students.mockImplementation(async ({ preference_filter }: { preference_filter?: string } = {}) => {
      if (preference_filter === 'manual') return new Promise<ReturnType<typeof response>>(resolve => { finishManual = resolve; });
      if (preference_filter === 'autopay') return new Promise<ReturnType<typeof response>>(resolve => { finishAutopay = resolve; });
      return response();
    });
    show(); await card(1);
    const manual = screen.getByRole('tab', { name: /^Manual 1$/ });
    const autopay = screen.getByRole('tab', { name: /^Autopay 2$/ });
    fireEvent.click(manual);
    await waitFor(() => expect(mocks.students).toHaveBeenLastCalledWith(expect.objectContaining({ preference_filter: 'manual' })));
    expect(screen.queryByText('Synthetic plan 1')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^All 4$/ })).toBeEnabled();
    expect(screen.getByRole('tab', { name: /^Not recorded 1$/ })).toBeEnabled();
    expect(manual).toBeEnabled(); expect(autopay).toBeEnabled();
    expect(screen.getByRole('tab', { name: /^Setup pending 1$/ })).toBeEnabled();
    fireEvent.keyDown(manual, { key: 'ArrowRight' });
    expect(autopay).toHaveFocus(); expect(autopay).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(mocks.students).toHaveBeenLastCalledWith(expect.objectContaining({ preference_filter: 'autopay' })));
    const stale = response([rows[0]]); stale.preference_counts = { total: 999, not_recorded: 0, manual: 999, autopay: 0, setup_pending: 0 };
    await act(async () => { finishManual(stale); });
    expect(screen.getByRole('tab', { name: /^All 4$/ })).toBeVisible();
    expect(screen.queryByRole('tab', { name: /^All 999$/ })).not.toBeInTheDocument();
    expect(autopay).toHaveFocus();
    await act(async () => { finishAutopay(response(rows.filter(row => row.recorded_payment_method === 'autopay'))); });
    await card(2); await card(4);
    expect(screen.getByRole('tab', { name: /^All 4$/ })).toBeVisible();
    expect(autopay).toHaveFocus();
  });

  it('shows native partial page selection and selects or clears only the roster selection', async () => {
    show(); const first = await card(1); const fourth = await card(4);
    const page = screen.getByRole('checkbox', { name: 'Select this page' }) as HTMLInputElement;
    expect(page).not.toBeChecked(); expect(page.indeterminate).toBe(false);
    fireEvent.click(within(first).getByRole('checkbox', { name: 'Select Synthetic plan 1' }));
    expect(page).toBePartiallyChecked(); expect(page).not.toBeChecked(); expect(page.indeterminate).toBe(true);
    fireEvent.click(page);
    expect(page).toBeChecked(); expect(page.indeterminate).toBe(false);
    for (const id of [1, 2, 3, 4]) expect(screen.getByRole('checkbox', { name: `Select Synthetic plan ${id}` })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Synthetic plan 2' }));
    expect(page).toBePartiallyChecked(); expect(page.indeterminate).toBe(true);
    fireEvent.click(page);
    expect(page).toBeChecked(); expect(page.indeterminate).toBe(false);
    fireEvent.click(page);
    expect(page).not.toBeChecked(); expect(page.indeterminate).toBe(false);
    for (const id of [1, 2, 3, 4]) expect(screen.getByRole('checkbox', { name: `Select Synthetic plan ${id}` })).not.toBeChecked();
    expect(within(fourth).getByRole('checkbox', { name: 'Bank authorisation ready' })).toBeChecked();
    expect(mocks.savePreferences).not.toHaveBeenCalled();
  });

});
