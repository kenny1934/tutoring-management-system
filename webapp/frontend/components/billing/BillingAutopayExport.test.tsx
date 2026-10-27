import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingAutopayExport } from './BillingAutopayExport';
import type { BillingAutopayExportPreview, BillingBankBranch } from '@/types/billing';
import type { ModalProps } from '@/components/ui/modal';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), preview: vi.fn(), export: vi.fn(), download: vi.fn(), copy: vi.fn(), modal: vi.fn(), runs: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: { autopayExportPreview: mocks.preview, autopayExport: mocks.export, bankRuns: mocks.runs } }));
vi.mock('@/lib/geometry-utils', () => ({ downloadBlob: mocks.download }));
vi.mock('@/lib/hooks/useSummerPreGradeWindow', () => ({ useSummerPreGradeWindow: () => false }));
vi.mock('@/components/ui/modal', async importOriginal => {
  const actual = await importOriginal<typeof import('@/components/ui/modal')>();
  return { ...actual, Modal: (props: ModalProps) => { mocks.modal(props); return <actual.Modal {...props} />; } };
});

function preview(branch: BillingBankBranch = 'MSA', month = '2026-11'): BillingAutopayExportPreview {
  return { branch, collection_month: month, payment_count: 1, total_amount: '1600.00', content_hash: 'a'.repeat(64), filename: `autopay-${branch}-${month}-${'a'.repeat(12)}.xlsx`, can_download: true, issues: [], rows: [{ payment_id: 'payment-one', payment_version: 2, contract_no: `${branch}02100`, amount: '1600.00', student: { id: 4, student_name: 'Synthetic Student', school_student_id: '2100', home_location: branch, grade: 'F1', is_staff_referral: false } }] };
}
function file(review = preview()) {
  return new Response(new Uint8Array([80, 75, 3, 4]), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${review.filename}"`, 'X-CSM-Export-Total': review.total_amount!, 'X-CSM-Export-Count': String(review.payment_count), 'X-CSM-Export-Hash': review.content_hash } });
}
function show(defaultBranch = 'MSA', collectionMonth = '2026-11') { return render(<BillingAutopayExport defaultBranch={defaultBranch} collectionMonth={collectionMonth} />); }
async function open() { fireEvent.click(screen.getByRole('button', { name: 'Bank file' })); return screen.findByRole('dialog', { name: 'Bank file & results' }); }
async function ready() { await waitFor(() => expect(screen.getByRole('button', { name: 'Download Excel' })).toBeEnabled()); }
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockReturnValue({ user: { id: 1 }, isAdmin: true, effectiveRole: 'Admin', isReadOnly: false });
  mocks.preview.mockReset().mockImplementation(({ branch, collection_month }: { branch: BillingBankBranch; collection_month: string }) => Promise.resolve(preview(branch, collection_month)));
  mocks.export.mockReset().mockResolvedValue(file());
  mocks.runs.mockReset().mockResolvedValue({ storage_available: false, writes_available: false, runs: [] });
  mocks.copy.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mocks.copy } });
});

describe('reviewed bank file', () => {
  it('requires an explicit profile branch from All Locations and exports every Ready payment in that scope', async () => {
    show('All Locations'); const dialog = await open();
    expect(within(dialog).getByRole('heading', { name: 'Bank file & results' })).toBeInTheDocument();
    expect(mocks.preview).not.toHaveBeenCalled(); expect(screen.queryByRole('button', { name: 'Copy total' })).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Profile branch'), { target: { value: 'MSB' } }); await ready();
    expect(mocks.preview).toHaveBeenCalledWith({ collection_month: '2026-11', branch: 'MSB' }, expect.any(AbortSignal));
    expect(within(dialog).getByText('MSB02100')).toBeInTheDocument();
    expect(within(dialog).getByText('The file includes all Ready payments for this profile branch. Search and list filters do not apply.')).toBeInTheDocument();
    mocks.export.mockResolvedValueOnce(file(preview('MSB')));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Download Excel' }));
    await screen.findByRole('region', { name: 'Downloaded bank file' });
    expect(mocks.export).toHaveBeenCalledWith({ collection_month: '2026-11', branch: 'MSB', expected_content_hash: 'a'.repeat(64) }, expect.any(AbortSignal));
    expect(mocks.download).toHaveBeenCalledWith(expect.objectContaining({ size: 4 }), preview('MSB').filename);
    expect(screen.getByRole('dialog')).toBe(dialog);
  });

  it('keeps a successful file total stable and copies its exact ungrouped value inside the dialog', async () => {
    show(); const dialog = await open(); await ready();
    expect(screen.queryByRole('button', { name: 'Copy total' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download Excel' }));
    const snapshot = await screen.findByRole('region', { name: 'Downloaded bank file' });
    expect(within(snapshot).getByText('1600.00')).toBeInTheDocument(); expect(within(snapshot).getByText(preview().filename)).toBeInTheDocument();
    const next = preview(); next.rows[0].amount = '3200.00'; next.total_amount = '3200.00'; next.content_hash = 'b'.repeat(64); next.filename = `autopay-MSA-2026-11-${'b'.repeat(12)}.xlsx`;
    mocks.preview.mockResolvedValueOnce(next); fireEvent.click(screen.getByRole('button', { name: 'Refresh preview' })); await ready();
    expect(within(snapshot).getByText('1600.00')).toBeInTheDocument(); expect(screen.getAllByText('MOP 3,200.00')).toHaveLength(2);
    fireEvent.click(within(snapshot).getByRole('button', { name: 'Copy total' }));
    expect(await within(dialog).findByRole('status')).toHaveTextContent('Total copied.');
    expect(mocks.copy).toHaveBeenCalledWith('1600.00'); expect(mocks.export).toHaveBeenCalledOnce();
  });

  it('clears a changed review on 409 and requires a fresh preview before another download', async () => {
    mocks.export.mockRejectedValueOnce(Object.assign(new Error('Changed.'), { status: 409 }));
    show(); await open(); await ready(); fireEvent.click(screen.getByRole('button', { name: 'Download Excel' }));
    await screen.findByText('Ready payments changed. Refresh the preview.');
    expect(screen.getByRole('button', { name: 'Download Excel' })).toBeDisabled(); expect(mocks.download).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Copy total' })).not.toBeInTheDocument(); expect(mocks.export).toHaveBeenCalledOnce();
    const next = preview(); next.content_hash = 'b'.repeat(64); next.filename = `autopay-MSA-2026-11-${'b'.repeat(12)}.xlsx`;
    mocks.preview.mockResolvedValueOnce(next); fireEvent.click(screen.getByRole('button', { name: 'Refresh preview' })); await ready();
    expect(mocks.export).toHaveBeenCalledOnce(); mocks.export.mockResolvedValueOnce(file(next));
    fireEvent.click(screen.getByRole('button', { name: 'Download Excel' })); await screen.findByRole('region', { name: 'Downloaded bank file' });
    expect(mocks.export.mock.lastCall![0].expected_content_hash).toBe('b'.repeat(64));
  });

  it.each(['missing', 'total', 'count', 'hash', 'filename'])('does not download or expose a copy total for a %s response mismatch', async kind => {
    const response = file();
    if (kind === 'missing') response.headers.delete('X-CSM-Export-Total');
    if (kind === 'total') response.headers.set('X-CSM-Export-Total', '1600.01');
    if (kind === 'count') response.headers.set('X-CSM-Export-Count', '2');
    if (kind === 'hash') response.headers.set('X-CSM-Export-Hash', 'b'.repeat(64));
    if (kind === 'filename') response.headers.set('Content-Disposition', 'attachment; filename="other.xlsx"');
    mocks.export.mockResolvedValueOnce(response);
    show(); const dialog = await open(); await ready(); fireEvent.click(screen.getByRole('button', { name: 'Download Excel' }));
    await within(dialog).findByRole('alert'); expect(mocks.download).not.toHaveBeenCalled();
    expect(within(dialog).queryByRole('region', { name: 'Downloaded bank file' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Copy total' })).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Download Excel' })).toBeDisabled();
  });

  it('blocks the entire file for invalid IDs or unknown amounts without substituting zero', async () => {
    const review = preview(); review.can_download = false; review.total_amount = null; review.rows[0].amount = null; review.rows[0].contract_no = '';
    review.issues = [{ code: 'INVALID_CONTRACT', message: 'Enter the student’s school student ID.', student_id: 4 }, { code: 'INVALID_AMOUNT', message: 'Check the confirmed payment amount.', student_id: 4 }];
    mocks.preview.mockResolvedValueOnce(review); show(); const dialog = await open();
    await within(dialog).findByText('Total to confirm'); expect(within(dialog).getByRole('button', { name: 'Download Excel' })).toBeDisabled();
    expect(within(dialog).queryByText('MOP 0.00')).not.toBeInTheDocument(); expect(within(dialog).getAllByRole('link', { name: 'Open student' })[0]).toHaveAttribute('href', '/students/4');
    expect(mocks.export).not.toHaveBeenCalled(); expect(within(dialog).queryByRole('button', { name: 'Copy total' })).not.toBeInTheDocument();
  });

  it('shows the unavailable confirmed-storage state without creating a file', async () => {
    mocks.preview.mockResolvedValueOnce({ ...preview(), payment_count: 0, total_amount: '0.00', rows: [], can_download: false, issues: [{ code: 'CONFIRMED_STORAGE_UNAVAILABLE', message: 'Confirmed Autopay payments are not available yet.' }] });
    show(); await open(); await screen.findByText('Confirmed Autopay payments are not available yet.');
    expect(screen.getByRole('button', { name: 'Download Excel' })).toBeDisabled(); expect(mocks.export).not.toHaveBeenCalled();
  });

  it('aborts a held download when its month changes and discards its late response', async () => {
    let finish!: (value: Response) => void; mocks.export.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = show(); await open(); await ready(); fireEvent.click(screen.getByRole('button', { name: 'Download Excel' }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalledOnce()); const signal = mocks.export.mock.calls[0][1] as AbortSignal;
    view.rerender(<BillingAutopayExport defaultBranch="MSA" collectionMonth="2026-12" />);
    expect(signal.aborted).toBe(true); await act(async () => finish(file()));
    expect(mocks.download).not.toHaveBeenCalled(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await open(); await ready(); expect(screen.queryByRole('button', { name: 'Copy total' })).not.toBeInTheDocument();
  });

  it('blocks Escape and the close button in the same turn that a download begins', async () => {
    let finish!: (value: Response) => void;
    mocks.export.mockImplementationOnce(() => {
      // A document listener can still hold the close callback from the idle render.
      closeWhileIdle();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      screen.getByRole('button', { name: 'Close modal' }).click();
      return new Promise(resolve => { finish = resolve; });
    });
    show(); await open(); await ready();
    await waitFor(() => expect(mocks.modal.mock.lastCall![0].persistent).toBe(false));
    const closeWhileIdle = mocks.modal.mock.lastCall![0].onClose;
    fireEvent.click(screen.getByRole('button', { name: 'Download Excel' }));
    const signal = mocks.export.mock.calls[0][1] as AbortSignal;
    expect(signal.aborted).toBe(false); expect(screen.getByRole('dialog', { name: 'Bank file & results' })).toBeInTheDocument();
    await act(async () => finish(file()));
    await screen.findByRole('region', { name: 'Downloaded bank file' }); expect(mocks.download).toHaveBeenCalledOnce();
    fireEvent.keyDown(document, { key: 'Escape' }); await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('blocks immediate dismissal while a downloaded total is being copied', async () => {
    let finish!: () => void;
    mocks.copy.mockImplementationOnce(() => {
      closeWhileIdle();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return new Promise<void>(resolve => { finish = resolve; });
    });
    show(); await open(); await ready(); fireEvent.click(screen.getByRole('button', { name: 'Download Excel' }));
    await screen.findByRole('button', { name: 'Copy total' });
    await waitFor(() => expect(mocks.modal.mock.lastCall![0].persistent).toBe(false));
    const closeWhileIdle = mocks.modal.mock.lastCall![0].onClose;
    fireEvent.click(screen.getByRole('button', { name: 'Copy total' }));
    expect(screen.getByRole('dialog', { name: 'Bank file & results' })).toBeInTheDocument();
    await act(async () => finish()); await screen.findByText('Total copied.');
  });

  it('clears private preview state and aborts pending work when effective access changes', async () => {
    let finish!: (value: BillingAutopayExportPreview) => void; mocks.preview.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = show(); await open(); await waitFor(() => expect(mocks.preview).toHaveBeenCalledOnce());
    const signal = mocks.preview.mock.calls[0][1] as AbortSignal;
    mocks.auth.mockReturnValue({ user: { id: 1 }, isAdmin: false, isReadOnly: true, effectiveRole: 'Supervisor' });
    view.rerender(<BillingAutopayExport defaultBranch="MSA" collectionMonth="2026-11" />); await act(async () => finish(preview()));
    expect(signal.aborted).toBe(true); expect(screen.queryByRole('button', { name: 'Bank file' })).not.toBeInTheDocument(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('keeps clipboard failure feedback with the downloaded raw total inside the dialog', async () => {
    mocks.copy.mockRejectedValueOnce(new Error('Copy failed.')); show(); const dialog = await open(); await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Download Excel' })); await screen.findByRole('button', { name: 'Copy total' });
    fireEvent.click(screen.getByRole('button', { name: 'Copy total' })); expect(await within(dialog).findByRole('alert')).toHaveTextContent('Copy failed.');
    expect(within(dialog).getByText('1600.00')).toBeInTheDocument(); expect(screen.getByRole('dialog')).toBe(dialog);
  });
});
