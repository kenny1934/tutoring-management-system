import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BillingCouponBalance } from '@/types/billing';
import { availableRenewalCoupons, BillingRenewalCoupon, matchingRenewalCoupon, type RenewalCouponSelection } from './BillingRenewalCoupon';

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
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
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
  it('shows optional month combination only for a selected ordinary coupon when applicable', () => {
    const input = props(); const view = render(<BillingRenewalCoupon {...input} selection={selected()} canCombine />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include next month to reach 4 sessions' }));
    expect(input.onCombine).toHaveBeenCalledWith(true);
    view.rerender(<BillingRenewalCoupon {...input} selection={selected()} canCombine={false} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    const data = balance({ groups: [{ ...balance().groups[0], kind: 'staff', value: 500 }] });
    view.rerender(<BillingRenewalCoupon {...input} balance={data} selection={selected(data)} canCombine />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
