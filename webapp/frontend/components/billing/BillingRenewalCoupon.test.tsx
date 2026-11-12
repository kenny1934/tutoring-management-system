import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BillingCouponBalance, BillingPreviewRequest, BillingPreviewResponse } from '@/types/billing';
import { availableRenewalCoupons, BillingRenewalCoupon, matchingRenewalCoupon, suggestRenewalCoupon, type RenewalCouponSelection } from './BillingRenewalCoupon';

function balance(overrides: Partial<BillingCouponBalance> = {}): BillingCouponBalance {
  return { student_id: 4, storage_available: true, writes_available: true, version: 3,
    observation: { id: 'obs', remaining_count: 3, observed_on: '2026-11-01', processed_at: '2026-11-01', source_filename: 'fixture.xls' },
    reserved_count: 1, receipt_pending_count: 0, used_awaiting_sync_count: 0, usable_count: 1,
    groups: [{ key: 'ordinary', kind: 'ordinary', value: 300, expires_on: '2027-06-30', quantity: 2, usable_count: 1 },
      { key: 'staff', kind: 'staff', value: 500, expires_on: '2027-06-30', quantity: 1, usable_count: 0 }],
    checked_at: '2026-11-01', checked_by: 'Fixture', issues: [], uses: [], can_verify: true, ...overrides };
}
function selected(data = balance()): RenewalCouponSelection { return { studentId: data.student_id, version: data.version, group: { ...data.groups[0] } }; }
function props() {
  return { studentId: 4, balance: balance(), checking: false, failed: false, selection: null as RenewalCouponSelection | null,
    onSelect: vi.fn(), onRetry: vi.fn(), combine: false, canCombine: false, onCombine: vi.fn() };
}
describe('routine renewal coupon choice', () => {
  it('offers only verified available groups with read-only value and expiry', () => {
    const input = props(); render(<BillingRenewalCoupon {...input} />);
    expect(screen.getByRole('combobox', { name: 'Coupon' })).toHaveValue('');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByRole('option', { name: /300.*coupon.*Jun 30, 2027.*1 available/ })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ordinary' } });
    expect(input.onSelect).toHaveBeenCalledWith(selected());
    expect(screen.queryByLabelText('Coupon amount')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Checked in KMS')).not.toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/students/4#student-coupons');
  });
  it.each([{ usable_count: null }, { observation: null }, { checked_at: null }, { storage_available: false }])('does not use cached or unverified stock: %j', overrides => {
    const data = balance(overrides); render(<BillingRenewalCoupon {...props()} balance={data} />);
    expect(availableRenewalCoupons(data)).toEqual([]);
    expect(screen.getByRole('combobox')).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Check student coupons' })).toBeVisible();
  });
  it('never offers exhausted or reserved stock despite a positive KMS count', () => {
    const data = balance({ usable_count: 0 }); render(<BillingRenewalCoupon {...props()} balance={data} />);
    expect(screen.getByText('No coupons available.')).toBeVisible();
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });
  it.each([true, false])('withholds selection during checking/error (checking=%s)', checking => {
    const input = props(); render(<BillingRenewalCoupon {...input} checking={checking} failed={!checking} selection={selected()} />);
    expect(screen.getByRole('combobox')).toBeEnabled();
    expect(screen.getByRole('combobox')).toHaveValue('__changed');
    expect(matchingRenewalCoupon(input.balance, selected(), true)).toBeNull();
    expect(screen.getByRole('option', { name: /300.*coupon/ })).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ordinary' } });
    expect(input.onSelect).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
    expect(input.onSelect).toHaveBeenCalledWith(null);
    if (!checking) { fireEvent.click(screen.getByRole('button', { name: 'Retry coupons' })); expect(input.onRetry).toHaveBeenCalledOnce(); }
  });
  it.each([balance({ version: 4 }), balance({ student_id: 5 }), balance({ groups: [] }), balance({ groups: [{ ...balance().groups[0], value: 200 }] })])('invalidates a selection when ledger identity or details change: %j', data => {
    expect(matchingRenewalCoupon(data, selected(), false)).toBeNull();
  });
  it('rejects a matching foreign balance and retained foreign selection for the current student', () => {
    const data = balance({ student_id: 5 });
    const input = props(); render(<BillingRenewalCoupon {...input} balance={data} selection={selected(data)} canCombine />);
    expect(screen.getByRole('combobox')).toHaveValue('__changed');
    expect(screen.queryByRole('option', { name: /300.*coupon/ })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Include next month' })).toBeDisabled();
    expect(screen.getByText('Coupon details changed. Select a coupon again.')).toBeVisible();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/students/4#student-coupons');
  });

  it('prompts reselection after a ledger update and can remove a selected coupon', () => {
    const input = props(); const view = render(<BillingRenewalCoupon {...input} selection={selected()} balance={balance({ version: 4 })} />);
    expect(screen.getByText('Coupon details changed. Select a coupon again.')).toBeVisible();
    view.rerender(<BillingRenewalCoupon {...input} selection={selected()} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
    expect(input.onSelect).toHaveBeenCalledWith(null);
  });
  it('keeps the month control visible with its unavailable reason', () => {
    render(<BillingRenewalCoupon {...props()} combineLabel="Include January" combineReason="This enrollment already covers January." />);
    const checkbox = screen.getByRole('checkbox', { name: 'Include January' });
    expect(checkbox).toBeDisabled();
    expect(checkbox.closest('label')).toHaveClass('text-ink-subtle');
    expect(checkbox).toHaveAccessibleDescription('This enrollment already covers January.');
    expect(screen.getByText('This enrollment already covers January.')).toBeVisible();
  });

  it.each(['ordinary', 'staff'] as const)('shows an enabled offer without requiring a selected %s coupon', kind => {
    const data = balance({ groups: [{ ...balance().groups[0], kind, value: kind === 'staff' ? 500 : 300 }] });
    const input = props();
    const view = render(<BillingRenewalCoupon {...input} balance={data} canCombine />);
    const checkbox = screen.getByRole('checkbox', { name: 'Include next month' });
    expect(checkbox).toBeEnabled();
    fireEvent.click(checkbox);
    expect(input.onCombine).toHaveBeenCalledWith(true);
    view.rerender(<BillingRenewalCoupon {...input} balance={data} selection={selected(data)} canCombine />);
    expect(screen.getByRole('checkbox')).toBeEnabled();
    view.rerender(<BillingRenewalCoupon {...input} balance={data} selection={selected(data)} canCombine={false} combineReason="Keep this enrollment's end date." />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByRole('checkbox')).toHaveAccessibleDescription("Keep this enrollment's end date.");
  });

  it('allows unchecking an included month even when no new combination offer remains', () => {
    const input = props();
    const view = render(<BillingRenewalCoupon {...input} selection={selected()} combine canCombine={false} />);
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByRole('checkbox')).toBeEnabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(input.onCombine).toHaveBeenCalledWith(false);
    view.rerender(<BillingRenewalCoupon {...input} selection={selected()} combine canCombine={false} disabled />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });

  it.each(['checking', 'failed', 'stale', 'unverified', 'foreign'] as const)('holds the month control while coupon evidence is %s', state => {
    const input = props();
    const data = state === 'stale' ? balance({ version: 4 }) : state === 'unverified' ? balance({ checked_at: null })
      : state === 'foreign' ? balance({ student_id: 5 }) : balance();
    render(<BillingRenewalCoupon {...input} balance={data} checking={state === 'checking'} failed={state === 'failed'}
      selection={selected()} combine canCombine />);
    const checkbox = screen.getByRole('checkbox', { name: 'Include next month' });
    expect(checkbox).toBeDisabled();
    fireEvent.click(checkbox);
    expect(input.onCombine).not.toHaveBeenCalled();
  });

  it('explains a missing default next to the coupon field without inventing fee rules', () => {
    const message = 'This enrollment has 3 sessions. Coupons require at least 4.';
    render(<BillingRenewalCoupon {...props()} feedback={{ tone: 'info', message }} />);
    const explanation = screen.getByText(message);
    expect(explanation).toBeVisible();
    expect(explanation).toHaveClass('text-ink-subtle');
    expect(screen.getByRole('combobox', { name: 'Coupon' })).toHaveAccessibleDescription(message);
  });

  it('shows a compact amber warning for a selected coupon that was not applied', () => {
    const message = 'Coupon not applied. This enrollment has too few sessions.';
    const { container } = render(<BillingRenewalCoupon {...props()} selection={selected()}
      feedback={{ tone: 'warning', message }} combineReason='Keep this enrollment until December.' />);
    const warning = screen.getByRole('status');
    expect(warning).toHaveTextContent(message);
    expect(warning).toHaveClass('text-amber-800');
    expect(screen.getByRole('combobox', { name: 'Coupon' })).toHaveAccessibleDescription(message);
    expect(container.textContent).not.toContain('·');
    expect(container.textContent).not.toContain('•');
  });

});


describe('automatic renewal coupon suggestion', () => {
  const request: BillingPreviewRequest = { first_lesson_date: '2026-12-01', mode: 'regular', payment_method: 'manual',
    slots: [{ weekday: 'Tue' }], materials_fee: 0, trial_deduction: false, mandate_ready: false };
  function stock() {
    return balance({ usable_count: 3, groups: [
      { key: 'later300', kind: 'ordinary', value: 300, expires_on: '2027-06-30', quantity: 1, usable_count: 1 },
      { key: 'earlier200', kind: 'ordinary', value: 200, expires_on: '2026-12-31', quantity: 1, usable_count: 1 },
      { key: 'held', kind: 'ordinary', value: 300, expires_on: '2026-11-30', quantity: 1, usable_count: 0 },
    ] });
  }
  function calculated(scenario: BillingPreviewRequest, usedPeriod = 1): BillingPreviewResponse {
    return { periods: [{ number: usedPeriod, deductions: scenario.coupon
      ? [{ kind: scenario.coupon.kind, amount: scenario.coupon.value }] : [] }] } as BillingPreviewResponse;
  }
  it('uses the earliest expiry and its actual value without extending the payment', async () => {
    const data = stock(); const originalOrder = data.groups.map(group => group.key);
    const calculate = vi.fn(async (scenario: BillingPreviewRequest) => calculated(scenario));
    const suggestion = await suggestRenewalCoupon(data, request, 1, calculate, new AbortController().signal);
    expect(suggestion).toMatchObject({ studentId: 4, version: 3, group: { key: 'earlier200', value: 200 } });
    expect(calculate).toHaveBeenCalledOnce();
    expect(calculate.mock.calls[0][0]).toMatchObject({ coupon: { verified: true, combine_next_month: false, value: 200 } });
    expect(data.groups.map(group => group.key)).toEqual(originalOrder);
  });
  it('skips an expired or ineligible coupon according to the calculator', async () => {
    const calculate = vi.fn(async (scenario: BillingPreviewRequest) => calculated(scenario.coupon?.value === 200 ? { ...scenario, coupon: null } : scenario));
    expect(await suggestRenewalCoupon(stock(), request, 1, calculate, new AbortController().signal))
      .toMatchObject({ group: { key: 'later300', value: 300 } });
    expect(calculate).toHaveBeenCalledTimes(2);
  });
  it('keeps coupons for later if a short payment cannot use them', async () => {
    const calculate = vi.fn(async (scenario: BillingPreviewRequest) => calculated(scenario, 2));
    expect(await suggestRenewalCoupon(stock(), request, 1, calculate, new AbortController().signal)).toBeNull();
  });
  it('can select an eligible staff voucher for the focused payment', async () => {
    const data = balance({ groups: [{ key: 'staff', kind: 'staff', value: 500, expires_on: '2027-06-30', quantity: 1, usable_count: 1 }] });
    expect(await suggestRenewalCoupon(data, request, 2, async scenario => calculated(scenario, 2), new AbortController().signal))
      .toMatchObject({ group: { kind: 'staff', value: 500 } });
  });
  it('does not interpret a failed calculation as No coupon', async () => {
    await expect(suggestRenewalCoupon(stock(), request, 1, async () => { throw new Error('Offline'); }, new AbortController().signal))
      .rejects.toThrow('Offline');
  });
  it('discards a suggestion if the admin changes details during calculation', async () => {
    const controller = new AbortController();
    expect(await suggestRenewalCoupon(stock(), request, 1, async scenario => {
      controller.abort(); return calculated(scenario);
    }, controller.signal)).toBeNull();
  });
});
