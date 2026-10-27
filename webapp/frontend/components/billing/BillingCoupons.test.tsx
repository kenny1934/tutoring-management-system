import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingCouponPanel } from './BillingCouponPanel';
import { BillingCouponImportButton } from './BillingCouponImport';
import type { BillingCouponBalance, BillingCouponImport } from '@/types/billing';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), couponBalance: vi.fn(), reviewCoupons: vi.fn(), verifyCoupons: vi.fn(), previewCouponImport: vi.fn(), couponImport: vi.fn(), confirmCouponImport: vi.fn(), select: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: mocks }));
function balance(overrides: Partial<BillingCouponBalance> = {}): BillingCouponBalance {
  return { student_id: 4, storage_available: true, writes_available: true, version: 3, observation: { id: 'observation-one', remaining_count: 3, observed_on: '2026-10-20', processed_at: '2026-10-21T08:00:00Z', source_filename: 'synthetic.xls' }, reserved_count: 1, receipt_pending_count: 1, used_awaiting_sync_count: 1, usable_count: 1, groups: [{ key: 'group200', kind: 'ordinary', value: 200, expires_on: '2026-12-31', quantity: 2, usable_count: 1 }, { key: 'group300', kind: 'ordinary', value: 300, expires_on: '2027-06-30', quantity: 1, usable_count: 0 }], checked_at: '2026-10-20T09:00:00Z', checked_by: 'Synthetic Admin', issues: [], uses: [], can_verify: true, ...overrides };
}
function imported(overrides: Partial<BillingCouponImport> = {}): BillingCouponImport {
  return { id: 'import-one', branch: 'MSA', observed_on: '2026-10-20', filename: 'synthetic.xls', source_sha256: 'a'.repeat(64), review_hash: 'b'.repeat(64), changed_count: 1, unchanged_count: 0, unmatched_count: 0, invalid_count: 0, rows: [{ row_number: 2, company_id: 'MSA0004', student: { id: 4, student_name: 'Synthetic Student', school_student_id: '0004', home_location: 'MSA', grade: 'F1', is_staff_referral: false }, remaining_count: 3, previous_count: 1, status: 'changed', issues: [] }], issues: [], can_confirm: true, applied: false, ...overrides };
}
function Wrapper({ children }: { children: React.ReactNode }) { return <SWRConfig value={{ provider: () => new Map(), revalidateOnFocus: false, shouldRetryOnError: false, dedupingInterval: 0 }}>{children}</SWRConfig>; }
function showPanel() { return render(<BillingCouponPanel studentId={4} branch="MSA" onSelect={mocks.select} />, { wrapper: Wrapper }); }
async function openVerification() { showPanel(); const button = await screen.findByRole('button', { name: 'Verify coupon details' }); await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button); return screen.findByRole('dialog', { name: 'Verify coupon details' }); }
async function openImport() { render(<BillingCouponImportButton storageAvailable writesAvailable defaultBranch="MSA" />, { wrapper: Wrapper }); fireEvent.click(screen.getByRole('button', { name: 'Import MSA KMS list' })); const dialog = await screen.findByRole('dialog', { name: 'Import KMS coupons' }); fireEvent.change(within(dialog).getByLabelText('KMS export date'), { target: { value: '2026-10-20' } }); const file = new File(['invented workbook'], 'synthetic.xls'); fireEvent.change(within(dialog).getByLabelText('KMS spreadsheet'), { target: { files: [file] } }); await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Review import' })); }); return { dialog, file }; }
beforeEach(() => { for (const mock of Object.values(mocks)) mock.mockReset(); mocks.auth.mockReturnValue({ user: { id: 1 }, isAdmin: true, effectiveRole: 'Admin', isReadOnly: false }); mocks.couponBalance.mockResolvedValue(balance()); mocks.reviewCoupons.mockResolvedValue({ student_id: 4, expected_version: 3, review_hash: 'c'.repeat(64), balance: balance(), can_confirm: true, issues: [] }); mocks.verifyCoupons.mockResolvedValue(balance({ version: 4 })); mocks.previewCouponImport.mockResolvedValue(imported()); mocks.couponImport.mockResolvedValue(imported()); mocks.confirmCouponImport.mockResolvedValue(imported({ applied: true })); });

describe('verified KMS coupon details', () => {
  it('keeps the routine note optional but requires a deliberate answer for every unresolved use', async () => {
    mocks.couponBalance.mockResolvedValue(balance({ uses: [{ id: 'use-one', payment_id: 'p1', value: 200, expires_on: '2026-12-31', state: 'awaiting_receipt', accounted_in_observation: false, receipt_reference: 'KMS-OLD', payment_date: '2026-10-18', first_lesson_date: '2026-11-02', last_lesson_date: '2026-12-21', lesson_count: 8 }] }));
    const dialog = await openVerification();
    expect(within(dialog).getByLabelText('Note (optional)')).toHaveValue('');
    expect(within(dialog).getByText('Paid Oct 18, 2026')).toBeInTheDocument();
    expect(within(dialog).getByText('Nov 2, 2026 to Dec 21, 2026')).toBeInTheDocument();
    expect(within(dialog).getByText('Receipt KMS-OLD')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Review details' })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Has KMS already deducted this coupon in this export?'), { target: { value: 'no' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Review details' }));
    await within(dialog).findByText('These details match KMS.');
    expect(mocks.reviewCoupons.mock.lastCall![1]).toEqual(expect.objectContaining({ reason: '', reconciliations: [{ use_id: 'use-one', included_in_observation: false }], checked_at: expect.any(String) }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'These details match KMS.' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save verified details' }));
    await within(dialog).findByText('Coupon details saved.');
    expect(mocks.verifyCoupons.mock.lastCall![1]).toEqual(expect.objectContaining({ reason: '', reconciliations: [{ use_id: 'use-one', included_in_observation: false }], expected_review_hash: 'c'.repeat(64) }));
  });
  it('separates the observed balance and local commitments without guessing uniform coupon values', async () => {
    showPanel(); await screen.findByText('1 coupon available'); expect(screen.getByText('KMS count: 3 · Oct 20, 2026')).toBeInTheDocument(); expect(screen.getByRole('button', { name: /On unpaid enrollments: 1/ })).toBeInTheDocument(); expect(screen.getByRole('button', { name: /Receipts to record: 1/ })).toBeInTheDocument(); expect(screen.getByRole('button', { name: /Used coupons to check: 1/ })).toBeInTheDocument(); expect(screen.getByText('MOP 200 coupon')).toBeInTheDocument(); expect(screen.getByText('MOP 300 coupon')).toBeInTheDocument();
    const use = screen.getAllByRole('button', { name: 'Use coupon' }); expect(use[1]).toBeDisabled(); fireEvent.click(use[0]); expect(mocks.select).toHaveBeenCalledWith(balance().groups[0]);
  });
  it('keeps an already-used coupon unavailable against its unchanged old KMS snapshot', async () => {
    mocks.couponBalance.mockResolvedValue(balance({ usable_count: 0, groups: [{ ...balance().groups[0], quantity: 1, usable_count: 0 }], used_awaiting_sync_count: 1 })); showPanel(); await screen.findByText('0 coupons available'); expect(screen.getByRole('button', { name: 'Use coupon' })).toBeDisabled();
  });
  it('labels old cached counts as unverified and hides writes when storage is off', async () => {
    mocks.couponBalance.mockResolvedValue(balance({ storage_available: false, writes_available: false, observation: null, groups: [], usable_count: null, can_verify: false, legacy_display: { remaining_count: 2, cached_value: '300', synced_at: '2026-10-21' } })); showPanel(); await screen.findByText('Cached KMS count: 2 · Check KMS'); expect(screen.queryByText(/MOP 300/)).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Use coupon' })).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Import MSA KMS list' })).toBeDisabled();
  });
  it('reviews exact mixed groups and retains the same confirm key after an interrupted save', async () => {
    mocks.verifyCoupons.mockRejectedValueOnce(new Error('Connection interrupted.')).mockResolvedValueOnce(balance({ version: 4 })); const dialog = await openVerification(); fireEvent.change(within(dialog).getByLabelText('Note (optional)'), { target: { value: 'Checked both expiry groups in KMS.' } }); fireEvent.click(within(dialog).getByRole('button', { name: 'Review details' })); await within(dialog).findByText('These details match KMS.'); expect(mocks.verifyCoupons).not.toHaveBeenCalled(); fireEvent.click(within(dialog).getByRole('checkbox', { name: 'These details match KMS.' })); fireEvent.click(within(dialog).getByRole('button', { name: 'Save verified details' })); await within(dialog).findByText('Connection interrupted.'); fireEvent.click(within(dialog).getByRole('button', { name: 'Save verified details' })); expect(await within(dialog).findByText('Coupon details saved.')).toHaveFocus();
    expect(mocks.verifyCoupons.mock.calls[0].slice(0, 2)).toEqual(mocks.verifyCoupons.mock.calls[1].slice(0, 2)); expect(mocks.verifyCoupons.mock.calls[1][1].reason).toBe('Checked both expiry groups in KMS.'); expect(mocks.verifyCoupons.mock.calls[1][1].groups).toEqual(balance().groups.map(({ kind, value, expires_on, quantity }) => ({ kind, value, expires_on, quantity })));
  });
  it('requires explicit receipt-use reconciliation and never treats a count decrease as receipt issuance', async () => {
    mocks.couponBalance.mockResolvedValue(balance({ uses: [{ id: 'use-one', payment_id: 'p1', value: 200, expires_on: '2026-12-31', state: 'awaiting_receipt', accounted_in_observation: false, receipt_reference: null }] })); const dialog = await openVerification(); fireEvent.change(within(dialog).getByLabelText('Note (optional)'), { target: { value: 'Checked the issued coupon in KMS.' } }); expect(within(dialog).getByRole('button', { name: 'Review details' })).toBeDisabled(); fireEvent.change(within(dialog).getByLabelText('Has KMS already deducted this coupon in this export?'), { target: { value: 'yes' } }); fireEvent.click(within(dialog).getByRole('button', { name: 'Review details' })); await within(dialog).findByText('These details match KMS.'); expect(mocks.reviewCoupons.mock.lastCall![1].reconciliations).toEqual([{ use_id: 'use-one', included_in_observation: true }]);
  });
  it('keeps already-accounted coupon uses settled during later KMS checks', async () => {
    mocks.couponBalance.mockResolvedValue(balance({ uses: [{ id: 'settled-use', payment_id: 'p1', value: 200, expires_on: '2026-12-31', state: 'receipt_recorded', accounted_in_observation: true, receipt_reference: 'KMS-OLD' }] })); const dialog = await openVerification(); expect(within(dialog).queryByText('Check earlier coupon uses')).not.toBeInTheDocument(); fireEvent.change(within(dialog).getByLabelText('Note (optional)'), { target: { value: 'Rechecked the remaining groups.' } }); fireEvent.click(within(dialog).getByRole('button', { name: 'Review details' })); await within(dialog).findByText('These details match KMS.'); expect(mocks.reviewCoupons.mock.lastCall![1].reconciliations).toEqual([]);
  });
  it('holds a stale verification until it is reopened instead of reviving the old review after edits', async () => {
    mocks.couponBalance.mockResolvedValueOnce(balance()).mockResolvedValue(balance({ version: 4 })); mocks.verifyCoupons.mockRejectedValueOnce(Object.assign(new Error('KMS source changed.'), { status: 409 })); const dialog = await openVerification(); fireEvent.change(within(dialog).getByLabelText('Note (optional)'), { target: { value: 'Checked today.' } }); fireEvent.click(within(dialog).getByRole('button', { name: 'Review details' })); await within(dialog).findByText('These details match KMS.'); fireEvent.click(within(dialog).getByRole('checkbox', { name: 'These details match KMS.' })); fireEvent.click(within(dialog).getByRole('button', { name: 'Save verified details' })); await within(dialog).findByText('Close and reopen to check the latest KMS record.'); fireEvent.change(within(dialog).getByLabelText('Note (optional)'), { target: { value: 'Another reason.' } }); expect(within(dialog).getByRole('button', { name: 'Review details' })).toBeDisabled(); fireEvent.click(within(dialog).getByRole('button', { name: 'Close modal' })); await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument()); fireEvent.click(screen.getByRole('button', { name: 'Verify coupon details' })); const fresh = await screen.findByRole('dialog'); fireEvent.change(within(fresh).getByLabelText('Note (optional)'), { target: { value: 'Checked the refreshed record.' } }); mocks.reviewCoupons.mockResolvedValueOnce({ student_id: 4, expected_version: 4, review_hash: 'e'.repeat(64), balance: balance({ version: 4 }), can_confirm: true, issues: [] }); fireEvent.click(within(fresh).getByRole('button', { name: 'Review details' })); await within(fresh).findByText('These details match KMS.'); expect(mocks.reviewCoupons.mock.lastCall![1].expected_version).toBe(4);
  });
});

describe('reviewed manual KMS imports', () => {
  it('collapses the chosen file for review and resets every acknowledgement before a replacement preview', async () => {
    const first = imported({ unmatched_count: 1 });
    first.rows[0].issues = [{ code: 'SAME_DAY_SOURCE_REVIEW', message: 'Confirm the latest export.' }];
    first.rows.push({ row_number: 3, company_id: 'MSA0999', student: null, previous_count: null, remaining_count: 1, status: 'unmatched', issues: [] });
    const replacement = imported({ id: 'import-two', filename: 'replacement.xls', source_sha256: 'e'.repeat(64), review_hash: 'f'.repeat(64) });
    mocks.previewCouponImport.mockResolvedValueOnce(first).mockResolvedValueOnce(replacement);
    mocks.confirmCouponImport.mockResolvedValueOnce({ ...replacement, applied: true });
    const { dialog } = await openImport();
    expect(within(dialog).queryByLabelText('KMS spreadsheet')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('KMS export date')).not.toBeInTheDocument();
    expect(within(dialog).getByText('MSA · Oct 20, 2026')).toBeInTheDocument();
    for (const name of ['I checked this KMS export and date.', 'Skip the 1 unmatched student.', 'I confirm this is the latest KMS export for this date.']) fireEvent.click(within(dialog).getByRole('checkbox', { name }));
    expect(within(dialog).getByRole('button', { name: 'Import coupon counts' })).toBeEnabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Choose another file' }));
    expect(within(dialog).getByLabelText('KMS spreadsheet')).toHaveValue('');
    expect(within(dialog).getByRole('button', { name: 'Review import' })).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: 'Import coupon counts' })).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('KMS spreadsheet'), { target: { files: [new File(['second invented workbook'], 'replacement.xls')] } });
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Review import' })); });
    expect(within(dialog).getByRole('checkbox', { name: 'I checked this KMS export and date.' })).not.toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Import coupon counts' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'I checked this KMS export and date.' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Import coupon counts' }));
    await within(dialog).findByText('KMS list imported.');
    expect(mocks.confirmCouponImport).toHaveBeenCalledWith('import-two', expect.objectContaining({ expected_review_hash: 'f'.repeat(64), acknowledge_unmatched: false }), expect.any(AbortSignal));
  });
  it('includes unchanged students in the imported count and separates outstanding coupon checks', async () => {
    const value = imported({ unchanged_count: 1 });
    value.rows[0].coupon_check_required = true;
    value.rows.push({ ...value.rows[0], row_number: 3, student: { ...value.rows[0].student!, id: 5, student_name: 'Other Synthetic Student', school_student_id: '0005' }, company_id: 'MSA0005', previous_count: 3, status: 'unchanged', coupon_check_required: false });
    mocks.previewCouponImport.mockResolvedValueOnce(value); mocks.confirmCouponImport.mockResolvedValueOnce({ ...value, applied: true });
    const { dialog } = await openImport();
    const footer = within(dialog).getByRole('button', { name: 'Import coupon counts' }).closest('[data-coupon-import-footer]')!;
    expect(within(footer as HTMLElement).getByText('Included').nextElementSibling).toHaveTextContent('2');
    expect(within(footer as HTMLElement).getByText('Changed').nextElementSibling).toHaveTextContent('1');
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'I checked this KMS export and date.' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Import coupon counts' }));
    await within(dialog).findByText('Coupon counts updated for 2 students.');
    expect(within(dialog).getByText('1 student needs a coupon check.')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Check coupons' })).toHaveAttribute('href', '/students/4#student-coupons');
    expect(within(dialog).getByRole('link', { name: 'View coupons' })).toHaveAttribute('href', '/students/5#student-coupons');
    expect(within(dialog).queryByRole('button', { name: 'Import coupon counts' })).not.toBeInTheDocument();
  });
  it('requires an explicit latest-source attestation for a different export on the same day', async () => {
    const value = imported(); value.rows[0].issues = [{ code: 'SAME_DAY_SOURCE_REVIEW', message: 'Confirm the order of the two KMS files.' }]; mocks.previewCouponImport.mockResolvedValueOnce(value); const { dialog } = await openImport(); await within(dialog).findByText('Changed (1)'); fireEvent.click(within(dialog).getByRole('checkbox', { name: 'I checked this KMS export and date.' })); expect(within(dialog).getByRole('button', { name: 'Import coupon counts' })).toBeDisabled(); fireEvent.click(within(dialog).getByRole('checkbox', { name: 'I confirm this is the latest KMS export for this date.' })); fireEvent.click(within(dialog).getByRole('button', { name: 'Import coupon counts' })); await within(dialog).findByText('KMS list imported.'); expect(mocks.confirmCouponImport.mock.lastCall![1].acknowledge_same_day).toBe(true);
  });
  it('clears the import dialog and aborts its held preview when effective access changes', async () => {
    let finish!: (value: BillingCouponImport) => void; mocks.previewCouponImport.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); const view = render(<BillingCouponImportButton storageAvailable writesAvailable defaultBranch="MSA" />, { wrapper: Wrapper }); fireEvent.click(screen.getByRole('button', { name: 'Import MSA KMS list' })); await screen.findByRole('dialog'); fireEvent.change(screen.getByLabelText('KMS export date'), { target: { value: '2026-10-20' } }); fireEvent.change(screen.getByLabelText('KMS spreadsheet'), { target: { files: [new File(['invented'], 'synthetic.xls')] } }); fireEvent.click(screen.getByRole('button', { name: 'Review import' })); const signal = mocks.previewCouponImport.mock.lastCall![3] as AbortSignal; mocks.auth.mockReturnValue({ user: { id: 1 }, isAdmin: false, effectiveRole: 'Supervisor', isReadOnly: true }); view.rerender(<BillingCouponImportButton storageAvailable writesAvailable defaultBranch="MSA" />); await act(async () => finish(imported())); expect(signal.aborted).toBe(true); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(mocks.confirmCouponImport).not.toHaveBeenCalled();
  });
  it('requires the actual export date and preserves a misleading filename as source identity only', async () => {
    render(<BillingCouponImportButton storageAvailable writesAvailable defaultBranch="MSA" />, { wrapper: Wrapper }); fireEvent.click(screen.getByRole('button', { name: 'Import MSA KMS list' })); await screen.findByRole('dialog'); const file = new File(['invented'], 'termination-2026-09-01.xls'); fireEvent.change(screen.getByLabelText('KMS spreadsheet'), { target: { files: [file] } }); expect(screen.getByRole('button', { name: 'Review import' })).toBeDisabled(); expect(screen.getByLabelText('KMS export date')).toHaveValue(''); expect(mocks.previewCouponImport).not.toHaveBeenCalled();
  });
  it('previews only, requires acknowledgement of unmatched students and applies the exact reviewed hash', async () => {
    const value = imported({ unmatched_count: 1 }); value.rows.push({ row_number: 3, company_id: 'MSA0999', student: null, previous_count: null, remaining_count: 1, status: 'unmatched', issues: [] }); mocks.previewCouponImport.mockResolvedValueOnce(value); const { dialog, file } = await openImport(); await within(dialog).findByText('Changed (1)'); expect(mocks.previewCouponImport).toHaveBeenCalledWith(file, 'MSA', '2026-10-20', expect.any(AbortSignal)); expect(mocks.confirmCouponImport).not.toHaveBeenCalled(); fireEvent.click(within(dialog).getByRole('checkbox', { name: 'I checked this KMS export and date.' })); expect(within(dialog).getByRole('button', { name: 'Import coupon counts' })).toBeDisabled(); fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Skip the 1 unmatched student.' })); fireEvent.click(within(dialog).getByRole('button', { name: 'Import coupon counts' })); expect(await within(dialog).findByText('KMS list imported.')).toHaveFocus(); expect(mocks.confirmCouponImport).toHaveBeenCalledWith('import-one', { expected_review_hash: 'b'.repeat(64), acknowledge_unmatched: true, idempotency_key: expect.any(String) }, expect.any(AbortSignal));
  });
  it('blocks invalid counts and shows an unknown count without substituting zero', async () => {
    const value = imported({ invalid_count: 1, can_confirm: false }); value.rows[0] = { ...value.rows[0], status: 'invalid', remaining_count: null, issues: [{ code: 'INVALID_COUNT', message: 'Check the count in row 2.' }] }; mocks.previewCouponImport.mockResolvedValueOnce(value); const { dialog } = await openImport(); await within(dialog).findByText(/→ Check count/); expect(within(dialog).getByRole('button', { name: 'Import coupon counts' })).toBeDisabled(); expect(mocks.confirmCouponImport).not.toHaveBeenCalled();
  });
  it('holds a changed import for refresh and reuses an exact key after an ambiguous apply response', async () => {
    mocks.confirmCouponImport.mockRejectedValueOnce(Object.assign(new Error('Import changed.'), { status: 409 })); const { dialog } = await openImport(); await within(dialog).findByText('Changed (1)'); fireEvent.click(within(dialog).getByRole('checkbox', { name: 'I checked this KMS export and date.' })); fireEvent.click(within(dialog).getByRole('button', { name: 'Import coupon counts' })); await within(dialog).findByText('Refresh the review before applying.'); expect(within(dialog).getByRole('button', { name: 'Import coupon counts' })).toBeDisabled(); mocks.couponImport.mockResolvedValueOnce(imported({ review_hash: 'd'.repeat(64) })); fireEvent.click(within(dialog).getByRole('button', { name: 'Refresh review' })); await waitFor(() => expect(within(dialog).getByRole('checkbox', { name: 'I checked this KMS export and date.' })).toBeEnabled()); fireEvent.click(within(dialog).getByRole('checkbox', { name: 'I checked this KMS export and date.' })); mocks.confirmCouponImport.mockRejectedValueOnce(new Error('Response interrupted.')); fireEvent.click(within(dialog).getByRole('button', { name: 'Import coupon counts' })); await within(dialog).findByText('Response interrupted.'); fireEvent.click(within(dialog).getByRole('button', { name: 'Import coupon counts' })); await within(dialog).findByText('KMS list imported.'); expect(mocks.confirmCouponImport.mock.calls[1].slice(0, 2)).toEqual(mocks.confirmCouponImport.mock.calls[2].slice(0, 2));
  });
  it('guards immediate dismissal while applying', async () => {
    let finish!: (value: BillingCouponImport) => void; mocks.confirmCouponImport.mockImplementationOnce(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return new Promise(resolve => { finish = resolve; }); }); const { dialog } = await openImport(); await within(dialog).findByText('Changed (1)'); fireEvent.click(within(dialog).getByRole('checkbox', { name: 'I checked this KMS export and date.' })); fireEvent.click(within(dialog).getByRole('button', { name: 'Import coupon counts' })); expect(screen.getByRole('dialog')).toBe(dialog); await act(async () => finish(imported({ applied: true }))); await within(dialog).findByText('KMS list imported.');
  });
});
