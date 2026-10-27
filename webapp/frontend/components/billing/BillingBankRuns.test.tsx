import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingAutopayExport } from './BillingAutopayExport';
import { BillingBankResults } from './BillingBankResults';
import { formatShortDate } from '@/lib/formatters';
import type { BillingAutopayExportPreview, BillingBankResultReview, BillingBankRunDetail } from '@/types/billing';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), bankRuns: vi.fn(), autopayExportPreview: vi.fn(), autopayExport: vi.fn(), saveBankRun: vi.fn(), bankRun: vi.fn(), bankRunFile: vi.fn(), submitBankRun: vi.fn(), discardBankRun: vi.fn(), previewBankResult: vi.fn(), bankResult: vi.fn(), confirmBankResult: vi.fn(), download: vi.fn(), copy: vi.fn(), busy: vi.fn(), version: vi.fn(), refresh: vi.fn(), changed: vi.fn(), invalidate: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: mocks }));
vi.mock('@/lib/geometry-utils', () => ({ downloadBlob: mocks.download }));
vi.mock('@/lib/hooks', () => ({ invalidateCaches: mocks.invalidate }));
vi.mock('@/lib/hooks/useSummerPreGradeWindow', () => ({ useSummerPreGradeWindow: () => false }));
vi.mock('./BillingPayments', () => ({ BillingPayments: () => <div>Exact payment details</div> }));

function preview(): BillingAutopayExportPreview {
  return { collection_month: '2026-11', branch: 'MSA', payment_count: 1, total_amount: '1600.00', content_hash: 'a'.repeat(64), filename: `autopay-MSA-2026-11-${'a'.repeat(12)}.xlsx`, issues: [], can_download: true, rows: [{ payment_id: 'payment-one', payment_version: 2, contract_no: 'MSA02100', amount: '1600.00', student: { id: 4, student_name: 'Synthetic Student', school_student_id: '2100', home_location: 'MSA', grade: 'F1', is_staff_referral: false } }] };
}
function run(overrides: Partial<BillingBankRunDetail> = {}): BillingBankRunDetail {
  const file = preview();
  return { id: 'run-one', version: 1, status: 'prepared', collection_month: file.collection_month, branch: file.branch, filename: file.filename, payment_count: file.payment_count, total_amount: file.total_amount!, content_hash: file.content_hash, created_at: '2026-11-20T08:00:00Z', created_by_name: 'Synthetic Admin', export_preview: file, issues: [], can_submit: true, can_discard: true, can_download: true, can_import_results: false, latest_import: null, history: [{ kind: 'prepared', actor_name: 'Synthetic Admin', created_at: '2026-11-20T08:00:00Z' }], ...overrides };
}
function submitted(): BillingBankRunDetail { return run({ status: 'submitted', version: 2, submitted_at: '2026-11-20T09:00:00Z', bank_batch_no: '00012', can_submit: false, can_discard: false, can_import_results: true }); }
function review(overrides: Partial<BillingBankResultReview> = {}): BillingBankResultReview {
  return { id: 'result-one', run_id: 'run-one', run_version: 3, source_format: 'html_en', bank_batch_no: '00012', debit_date: '2026-11-20', currency: 'MOP', report_hash: 'b'.repeat(64), review_hash: 'c'.repeat(64), payment_count: 1, total_amount: '1600.00', success_count: 1, successful_amount: '1600.00', failed_count: 0, failed_amount: '0.00', ready_count: 1, ready_amount: '1600.00', recorded_count: 0, recorded_amount: '0.00', review_count: 0, issues: [], rows: [{ contract_no: 'MSA02100', amount: '1600.00', raw_status: 'Successed', reject_code: '', outcome: 'collected', reason: 'Ready to record.', student: preview().rows[0].student, payment_id: 'payment-one', payment_version: 2, record_status: 'ready' }], can_confirm: true, ...overrides };
}
function file(headers: Record<string, string> = {}) { const value = preview(); return new Response(new Uint8Array([80, 75, 3, 4]), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${value.filename}"`, 'X-CSM-Export-Total': '1600.00', 'X-CSM-Export-Count': '1', 'X-CSM-Export-Hash': value.content_hash, ...headers } }); }
function show() { return render(<BillingAutopayExport collectionMonth="2026-11" defaultBranch="MSA" />); }
async function open() { fireEvent.click(screen.getByRole('button', { name: 'Bank file' })); return screen.findByRole('dialog', { name: 'Bank file & results' }); }
async function ready() { await waitFor(() => expect(screen.getByRole('button', { name: 'Save and download' })).toBeEnabled()); }
async function openHistory(value = run()) {
  mocks.bankRuns.mockResolvedValue({ storage_available: true, writes_available: true, runs: [value] }); mocks.bankRun.mockResolvedValue(value);
  show(); await open(); await ready(); fireEvent.click(screen.getByRole('button', { name: 'Run history (1)' }));
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(value.filename) }));
  return screen.findByRole('region', { name: 'Saved bank run' });
}
function results(value = submitted()) { return render(<BillingBankResults run={value} canWrite disabled={false} onBusyChange={mocks.busy} onRunVersion={mocks.version} onRunRefresh={mocks.refresh} />); }
function chooseFile() { if (!screen.queryByLabelText('Bank result file')) fireEvent.click(screen.getByRole('button', { name: 'Import another file' })); const value = new File(['synthetic report'], 'results.xls', { type: 'application/vnd.ms-excel' }); fireEvent.change(screen.getByLabelText('Bank result file'), { target: { files: [value] } }); return value; }

beforeEach(() => {
  for (const value of Object.values(mocks)) value.mockReset();
  mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Admin', isAdmin: true, isReadOnly: false });
  mocks.bankRuns.mockResolvedValue({ storage_available: true, writes_available: true, runs: [] });
  mocks.autopayExportPreview.mockResolvedValue(preview()); mocks.saveBankRun.mockResolvedValue(run()); mocks.bankRunFile.mockImplementation(() => Promise.resolve(file())); mocks.previewBankResult.mockResolvedValue(review());
  mocks.copy.mockResolvedValue(undefined); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mocks.copy } });
});

describe('saved bank file lifecycle', () => {
  it('saves the exact reviewed scope before downloading its immutable file and keeps the verified copy total', async () => {
    show(); const dialog = await open(); await ready(); fireEvent.click(screen.getByRole('button', { name: 'Save and download' }));
    const snapshot = await screen.findByRole('region', { name: 'Downloaded bank file' });
    expect(mocks.saveBankRun).toHaveBeenCalledWith({ collection_month: '2026-11', branch: 'MSA', expected_content_hash: preview().content_hash, idempotency_key: expect.any(String) }, expect.any(AbortSignal));
    expect(mocks.bankRunFile).toHaveBeenCalledWith('run-one', expect.any(AbortSignal)); expect(mocks.autopayExport).not.toHaveBeenCalled();
    expect(mocks.saveBankRun.mock.invocationCallOrder[0]).toBeLessThan(mocks.bankRunFile.mock.invocationCallOrder[0]);
    expect(within(snapshot).getByText('1600.00')).toBeInTheDocument(); expect(screen.getAllByText(preview().filename)).toHaveLength(1); expect(screen.getByRole('button', { name: 'Run history (1)' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(snapshot).getByRole('button', { name: 'Copy total' })); await within(dialog).findByText('Total copied.'); expect(mocks.copy).toHaveBeenCalledWith('1600.00');
    expect(mocks.submitBankRun).not.toHaveBeenCalled(); expect(mocks.confirmBankResult).not.toHaveBeenCalled();
  });

  it('retains a saved run for re-download when the attachment headers fail verification', async () => {
    mocks.bankRunFile.mockResolvedValueOnce(file({ 'X-CSM-Export-Total': '1600.01' })); show(); await open(); await ready(); fireEvent.click(screen.getByRole('button', { name: 'Save and download' }));
    const saved = await screen.findByRole('region', { name: 'Saved bank run' }); await within(saved).findByRole('alert');
    expect(mocks.download).not.toHaveBeenCalled(); expect(screen.queryByRole('button', { name: 'Copy total' })).not.toBeInTheDocument();
    fireEvent.click(within(saved).getByRole('button', { name: 'Download Excel' })); await screen.findByRole('region', { name: 'Downloaded bank file' });
    expect(mocks.saveBankRun).toHaveBeenCalledOnce(); expect(mocks.download).toHaveBeenCalledOnce();
  });

  it('does not download a saved response that differs from the reviewed file hash', async () => {
    const different = preview(); different.content_hash = 'b'.repeat(64); different.filename = `autopay-MSA-2026-11-${'b'.repeat(12)}.xlsx`;
    mocks.saveBankRun.mockResolvedValueOnce(run({ content_hash: different.content_hash, filename: different.filename, export_preview: different })); show(); await open(); await ready(); fireEvent.click(screen.getByRole('button', { name: 'Save and download' }));
    await screen.findByText('Could not verify the saved file against this preview. Refresh the preview.'); expect(mocks.bankRunFile).not.toHaveBeenCalled(); expect(mocks.download).not.toHaveBeenCalled();
  });

  it('reuses the save idempotency key after an interrupted response', async () => {
    mocks.saveBankRun.mockRejectedValueOnce(new Error('Connection interrupted.')); show(); await open(); await ready(); fireEvent.click(screen.getByRole('button', { name: 'Save and download' }));
    await screen.findByText('Connection interrupted.'); await ready(); fireEvent.click(screen.getByRole('button', { name: 'Save and download' }));
    await screen.findByRole('region', { name: 'Saved bank run' }); expect(mocks.saveBankRun.mock.calls[0][0]).toEqual(mocks.saveBankRun.mock.calls[1][0]);
  });

  it('requires a new review after a changed Ready set and never automatically resubmits', async () => {
    mocks.saveBankRun.mockRejectedValueOnce(Object.assign(new Error('Changed.'), { status: 409 })); show(); await open(); await ready(); fireEvent.click(screen.getByRole('button', { name: 'Save and download' }));
    await screen.findByText('Ready payments changed. Refresh the preview.'); expect(screen.getByRole('button', { name: 'Save and download' })).toBeDisabled(); expect(mocks.bankRunFile).not.toHaveBeenCalled(); expect(mocks.saveBankRun).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh preview' })); await ready(); expect(mocks.saveBankRun).toHaveBeenCalledOnce();
  });

  it('does not bypass unavailable saved-run writes with the old export endpoint', async () => {
    mocks.bankRuns.mockResolvedValue({ storage_available: true, writes_available: false, runs: [] }); show(); await open(); await screen.findByText('Saving bank runs is not available yet.');
    expect(screen.getByRole('button', { name: 'Save and download' })).toBeDisabled(); expect(mocks.autopayExport).not.toHaveBeenCalled(); expect(mocks.saveBankRun).not.toHaveBeenCalled();
  });

  it('does not guess capabilities on a failed history read or accept a different branch run', async () => {
    mocks.bankRuns.mockRejectedValueOnce(new Error('Read denied.')); show(); await open(); await screen.findByText('Read denied.'); expect(mocks.autopayExportPreview).not.toHaveBeenCalled();
    mocks.bankRuns.mockResolvedValueOnce({ storage_available: true, writes_available: true, runs: [run({ branch: 'MSB' })] }); fireEvent.click(screen.getByRole('button', { name: 'Retry bank runs' }));
    await screen.findByText('Could not verify this run history. Refresh the list.'); expect(mocks.autopayExportPreview).not.toHaveBeenCalled();
  });

  it('records actual bank upload only after an explicit check with the exact run version and optional batch', async () => {
    const next = submitted(); mocks.submitBankRun.mockResolvedValue(next); const saved = await openHistory();
    expect(within(saved).queryByRole('button', { name: 'Copy total' })).not.toBeInTheDocument(); fireEvent.click(within(saved).getByRole('button', { name: 'Record bank upload' }));
    const confirm = screen.getByRole('button', { name: 'Confirm bank upload' }); expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Bank batch number (optional)'), { target: { value: ' 00012 ' } }); fireEvent.click(screen.getByRole('checkbox', { name: 'I uploaded this file to the bank.' })); fireEvent.click(confirm);
    const notice = await screen.findByText('Bank upload recorded.'); expect(notice).toHaveFocus(); expect(mocks.submitBankRun).toHaveBeenCalledWith('run-one', { expected_version: 1, bank_batch_no: '00012', idempotency_key: expect.any(String) }, expect.any(AbortSignal));
    expect(mocks.confirmBankResult).not.toHaveBeenCalled(); expect(mocks.previewBankResult).not.toHaveBeenCalled(); expect(screen.queryByRole('button', { name: 'Discard run' })).not.toBeInTheDocument();
    const upload = screen.getByRole('region', { name: 'Bank result review' }); const fileDetails = screen.getByText('File details').closest('details')!;
    expect(fileDetails).not.toHaveAttribute('open'); expect(upload.compareDocumentPosition(fileDetails) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(upload).getByLabelText('Bank result file')).toBeVisible(); expect(within(saved).getByRole('button', { name: 'Download Excel' }).closest('details')).toBe(fileDetails);
  });

  it('requires an unsubmitted confirmation and reason to discard and holds a stale version for review', async () => {
    mocks.discardBankRun.mockRejectedValueOnce(Object.assign(new Error('Run changed.'), { status: 409 })); await openHistory(); fireEvent.click(screen.getByRole('button', { name: 'Discard run' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'I have not uploaded this file to the bank.' })); expect(screen.getByRole('button', { name: 'Confirm discard' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Wrong month.' } }); expect(screen.getByRole('button', { name: 'Confirm discard' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'I have not uploaded this file to the bank.' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm discard' }));
    await screen.findByText('Refresh the run before continuing.'); expect(mocks.discardBankRun).toHaveBeenCalledWith('run-one', { expected_version: 1, reason: 'Wrong month.', idempotency_key: expect.any(String) }, expect.any(AbortSignal)); expect(screen.getByRole('button', { name: 'Confirm discard' })).toBeDisabled();
  });

  it('contains keyboard focus in nested payment details and restores the exact triggering button', async () => {
    await openHistory(); fireEvent.click(screen.getByText('Payments in this file'));
    const trigger = screen.getByRole('button', { name: 'Payment details' }); trigger.focus(); fireEvent.click(trigger);
    const payment = await screen.findByRole('dialog', { name: 'Payment' }); const close = within(payment).getByRole('button', { name: 'Close modal' });
    await waitFor(() => expect(close).toHaveFocus()); expect(fireEvent.keyDown(close, { key: 'Tab' })).toBe(false); expect(close).toHaveFocus();
    expect(fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })).toBe(false); expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' }); await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Payment' })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus(); expect(screen.getByRole('dialog', { name: 'Bank file & results' })).toBeInTheDocument();
  });

  it('keeps the review action in the dialog footer and opens payment details from the result row', async () => {
    const value = { ...submitted(), version: 3, latest_import: review() }; await openHistory(value);
    const result = screen.getByRole('region', { name: 'Bank result review' });
    expect(screen.queryByText('Payments in this file')).not.toBeInTheDocument(); expect(screen.getByText('File details').closest('details')).not.toHaveAttribute('open');
    expect(screen.queryByLabelText('Bank result file')).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Import another file' })).toBeInTheDocument();
    const footer = await screen.findByRole('region', { name: 'Record reviewed payments' }); expect(result.contains(footer)).toBe(false); expect(screen.getByRole('dialog', { name: 'Bank file & results' }).contains(footer)).toBe(true);
    // The dialog body must absorb the height reduction on a narrow phone.
    // Its fixed review footer must not shrink and clip the confirmation button.
    expect(screen.getByRole('dialog', { name: 'Bank file & results' })).toHaveClass('[&>div:has([data-bank-run-footer])]:shrink-0'); expect(footer.closest('[data-bank-run-footer]')).not.toBeNull();
    expect(within(footer).getByText('1 payment to record')).toBeInTheDocument(); expect(within(footer).getByText('MOP 1,600.00')).toBeInTheDocument();
    const trigger = within(result).getByRole('button', { name: 'Payment details' }); trigger.focus(); fireEvent.click(trigger); const popup = await screen.findByRole('dialog', { name: 'Payment' });
    expect(within(popup).getByText('Exact payment details')).toBeInTheDocument(); fireEvent.keyDown(document, { key: 'Escape' }); await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Payment' })).not.toBeInTheDocument()); expect(trigger).toHaveFocus();
  });

  it('keeps the final progress step incomplete while one collected payment still needs checking', async () => {
    const frozen = preview(); frozen.payment_count = 2; frozen.total_amount = '3200.00'; frozen.rows.push({ ...frozen.rows[0], payment_id: 'payment-two', contract_no: 'MSA02101', student: { ...frozen.rows[0].student, id: 5, school_student_id: '2101' } });
    const partial = review({ payment_count: 2, total_amount: '3200.00', success_count: 2, successful_amount: '3200.00', ready_count: 0, ready_amount: '0.00', recorded_count: 1, recorded_amount: '1600.00', review_count: 1, can_confirm: false }); partial.rows[0].record_status = 'recorded'; partial.rows.push({ ...partial.rows[0], contract_no: 'MSA02101', payment_id: 'payment-two', record_status: 'review', reason: 'Payment changed.' });
    await openHistory({ ...submitted(), version: 3, payment_count: 2, total_amount: '3200.00', export_preview: frozen, latest_import: partial });
    const progress = screen.getByRole('list', { name: 'Bank run progress' }); expect(within(progress).getByText('Payments recorded').closest('li')).toHaveAttribute('aria-current', 'step'); expect(screen.getByText('1 of 2 payments recorded · 1 to check')).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Record 1 payment' })).not.toBeInTheDocument();
  });

  it('aborts a held saved-file download and clears private run data on an auth change', async () => {
    let finish!: (value: Response) => void; mocks.bankRunFile.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); const view = show(); await open(); await ready(); fireEvent.click(screen.getByRole('button', { name: 'Save and download' }));
    await waitFor(() => expect(mocks.bankRunFile).toHaveBeenCalledOnce()); const signal = mocks.bankRunFile.mock.calls[0][1];
    mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Supervisor', isAdmin: false, isReadOnly: true }); view.rerender(<BillingAutopayExport collectionMonth="2026-11" defaultBranch="MSA" />); await act(async () => finish(file()));
    expect(signal.aborted).toBe(true); expect(mocks.download).not.toHaveBeenCalled(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('reviewed bank results', () => {
  it('puts every row in exactly one record-status group and keeps raw bank facts on demand', () => {
    const value = review({ payment_count: 4, review_count: 1, failed_count: 1, recorded_count: 1 });
    value.rows = (['ready', 'recorded', 'unpaid', 'review'] as const).map((status, index) => ({ ...value.rows[0], contract_no: `MSA0210${index}`, record_status: status, outcome: status === 'unpaid' ? 'rejected' : 'collected', reason: `Reason ${status}`, student: null }));
    results({ ...submitted(), latest_import: value });
    for (const [group, reason] of [['To record', 'ready'], ['Recorded', 'recorded'], ['Not collected', 'unpaid'], ['Needs checking', 'review']]) {
      fireEvent.click(screen.getByRole('button', { name: `${group} (1)` })); expect(screen.getAllByRole('article')).toHaveLength(1); expect(screen.getByText(`Reason ${reason}`)).toBeInTheDocument();
      expect(screen.getByText('Bank status and code').closest('details')).not.toHaveAttribute('open');
    }
  });

  it('moves focus into the optional importer and back without enabling a stale confirmation', () => {
    results({ ...submitted(), latest_import: review() }); fireEvent.click(screen.getByRole('checkbox', { name: 'I checked the collected payments and debit date.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import another file' })); expect(screen.getByLabelText('Bank result file')).toHaveFocus(); expect(screen.getByRole('button', { name: 'Record 1 payment' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel import' })); expect(screen.getByRole('button', { name: 'Import another file' })).toHaveFocus(); expect(screen.getByRole('checkbox', { name: 'I checked the collected payments and debit date.' })).not.toBeChecked();
  });
  it('previews the uploaded evidence without recording money and shows actual debit date and original status on demand', async () => {
    results(); const selected = chooseFile(); fireEvent.click(screen.getByRole('button', { name: 'Preview results' })); await screen.findByText('Actual debit date');
    expect(mocks.previewBankResult).toHaveBeenCalledWith('run-one', selected, 2, expect.any(AbortSignal)); expect(mocks.confirmBankResult).not.toHaveBeenCalled(); expect(screen.getByText(formatShortDate('2026-11-20'))).toBeInTheDocument(); expect(screen.getByText('Successed')).toBeInTheDocument(); expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Record 1 payment' })).toBeDisabled();
  });

  it('shows a collected but changed payment in Needs checking and selects the first nonempty failure group', async () => {
    const held = review(); held.rows[0].record_status = 'review'; held.rows[0].reason = 'Payment changed.'; held.ready_count = 0; held.ready_amount = '0.00'; held.review_count = 1; held.can_confirm = false;
    const view = results(submitted()); mocks.previewBankResult.mockResolvedValueOnce(held); chooseFile(); fireEvent.click(screen.getByRole('button', { name: 'Preview results' }));
    const checking = await screen.findByRole('button', { name: 'Needs checking (1)' }); fireEvent.click(checking); expect(screen.getByText('Payment changed.')).toBeInTheDocument(); expect(screen.queryByRole('button', { name: /Record \d/ })).not.toBeInTheDocument();
    view.unmount(); const rejected = review(); rejected.rows[0].outcome = 'rejected'; rejected.rows[0].record_status = 'unpaid'; rejected.rows[0].reason = 'Account closed.'; rejected.success_count = 0; rejected.failed_count = 1; rejected.ready_count = 0; rejected.can_confirm = false;
    results({ ...submitted(), latest_import: rejected }); expect(screen.getByRole('button', { name: 'Not collected (1)' })).toHaveAttribute('aria-pressed', 'true'); expect(screen.getByText('Account closed.')).toBeInTheDocument();
  });

  it('does not display zero or NaN for malformed bank amounts', () => {
    const malformed = review({ total_amount: null, successful_amount: null, ready_count: 0, can_confirm: false }); malformed.rows[0].amount = ''; results({ ...submitted(), latest_import: malformed });
    expect(screen.getAllByText('Amount to confirm')).toHaveLength(3); expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it('records only after explicit reviewed confirmation and reuses the identical request after an interrupted response', async () => {
    const next = review({ run_version: 4, ready_count: 0, ready_amount: '0.00', recorded_count: 1, recorded_amount: '1600.00', can_confirm: false }); next.rows[0].record_status = 'recorded';
    mocks.confirmBankResult.mockRejectedValueOnce(new Error('Response interrupted.')).mockResolvedValueOnce(next); results({ ...submitted(), latest_import: review() });
    fireEvent.click(screen.getByRole('checkbox', { name: 'I checked the collected payments and debit date.' })); fireEvent.click(screen.getByRole('button', { name: 'Record 1 payment' })); await screen.findByText('Response interrupted.');
    fireEvent.click(screen.getByRole('button', { name: 'Record 1 payment' })); expect(await screen.findByText('Payments recorded.')).toHaveFocus();
    expect(mocks.confirmBankResult.mock.calls[0].slice(0, 3)).toEqual(mocks.confirmBankResult.mock.calls[1].slice(0, 3)); expect(mocks.confirmBankResult.mock.calls[0][2]).toEqual({ expected_review_hash: review().review_hash, idempotency_key: expect.any(String) });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Recorded (1)' })).toHaveAttribute('aria-pressed', 'true')); expect(screen.queryByRole('button', { name: 'Record 1 payment' })).not.toBeInTheDocument(); expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('requires refreshed review after a conflict and shows an equivalent re-import as already recorded', async () => {
    mocks.confirmBankResult.mockRejectedValueOnce(Object.assign(new Error('Payment changed.'), { status: 409 })); const already = review({ ready_count: 0, recorded_count: 1, recorded_amount: '1600.00', can_confirm: false }); already.rows[0].record_status = 'recorded'; mocks.bankResult.mockResolvedValueOnce(already);
    results({ ...submitted(), latest_import: review() }); fireEvent.click(screen.getByRole('checkbox', { name: 'I checked the collected payments and debit date.' })); fireEvent.click(screen.getByRole('button', { name: 'Record 1 payment' })); await screen.findByText('Refresh the results before recording payments.');
    expect(screen.getByRole('button', { name: 'Record 1 payment' })).toBeDisabled(); chooseFile(); fireEvent.click(screen.getByRole('button', { name: 'Cancel import' })); expect(screen.getByRole('button', { name: 'Record 1 payment' })).toBeDisabled(); expect(screen.getByText('Refresh the results before recording payments.')).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Refresh results' })); await screen.findByText('These results are already recorded.'); expect(mocks.confirmBankResult).toHaveBeenCalledOnce();
    mocks.previewBankResult.mockResolvedValueOnce({ ...already, source_format: 'txt' }); chooseFile(); fireEvent.click(screen.getByRole('button', { name: 'Preview results' })); await screen.findByText('These results are already recorded.'); expect(mocks.confirmBankResult).toHaveBeenCalledOnce();
  });

  it('rejects a late report from another run before exposing any record action', async () => {
    mocks.previewBankResult.mockResolvedValueOnce(review({ run_id: 'different-run' })); results(); chooseFile(); fireEvent.click(screen.getByRole('button', { name: 'Preview results' }));
    await screen.findByText('The bank result changed. Refresh the run before continuing.'); expect(screen.queryByRole('button', { name: 'Record 1 payment' })).not.toBeInTheDocument(); expect(mocks.confirmBankResult).not.toHaveBeenCalled();
  });

  it('keeps unresolved rows visible after a partial replay without describing the whole report as recorded', async () => {
    const partial = review({ ready_count: 0, recorded_count: 1, recorded_amount: '1600.00', payment_count: 2, failed_count: 1, can_confirm: false }); partial.rows[0].record_status = 'recorded'; partial.rows.push({ ...partial.rows[0], contract_no: 'MSA02101', outcome: 'rejected', record_status: 'unpaid', reason: 'Account closed.' });
    mocks.previewBankResult.mockResolvedValueOnce(partial); results(); chooseFile(); fireEvent.click(screen.getByRole('button', { name: 'Preview results' })); await screen.findByText('No new payments to record.');
    expect(screen.queryByText('These results are already recorded.')).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Not collected (1)' })); expect(screen.getByText('Account closed.')).toBeInTheDocument(); expect(mocks.confirmBankResult).not.toHaveBeenCalled();
  });
});
