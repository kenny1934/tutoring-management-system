import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState, type ComponentProps } from 'react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingPaymentSettings } from './BillingPaymentSettings';
import type { BillingMethod, BillingPreferences } from '@/types/billing';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), preferences: vi.fn(), savePreferences: vi.fn(), invalidate: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: mocks }));
vi.mock('@/lib/renewal-queue', () => ({ invalidateRenewalQueueCache: mocks.invalidate }));
const stored: BillingPreferences = { student_id: 4, payment_method: 'manual', mandate_ready: false, version: 2, updated_at: null };
function Wrapper({ children }: { children: React.ReactNode }) { return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false, revalidateOnFocus: false }}>{children}</SWRConfig>; }
function ControlledSettings({ previewMethod: initialMethod, onPreviewMethod, ...props }: ComponentProps<typeof BillingPaymentSettings>) {
  const [method, setMethod] = useState<BillingMethod | null | undefined>(initialMethod);
  return <BillingPaymentSettings {...props} previewMethod={method} onPreviewMethod={value => { setMethod(value); onPreviewMethod?.(value); }} />;
}
async function openInlineEditor() {
  fireEvent.click(await screen.findByRole('button', { name: 'Change' }));
  await waitFor(() => expect(screen.queryByText('Loading the saved payment method…')).not.toBeInTheDocument());
}
function pending<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { resolve, promise }; }
beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Admin', isAdmin: true });
  mocks.preferences.mockResolvedValue(stored);
  mocks.savePreferences.mockResolvedValue({ ...stored, payment_method: 'autopay', version: 3 });
});

describe('discoverable payment methods', () => {
  it('uses one editable method badge on a queue card and loads settings only when opened', async () => {
    render(<BillingPaymentSettings storageAvailable canWrite recordedMethod="manual" studentId={4} onSaved={vi.fn()} presentation="badge" />, { wrapper: Wrapper });
    expect(screen.getAllByText('Manual')).toHaveLength(1);
    expect(screen.queryByText('Payment preference')).not.toBeInTheDocument();
    expect(mocks.preferences).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Payment method: Manual' }));
    await waitFor(() => expect(screen.getByLabelText('Parent’s payment preference')).toHaveValue('manual'));
    expect(mocks.preferences).toHaveBeenCalledExactlyOnceWith(4, undefined);
  });

  it('keeps a known Manual choice compact until Change and hides bank controls for Manual', async () => {
    const onPreviewMethod = vi.fn();
    render(<ControlledSettings storageAvailable canWrite recordedMethod="manual" previewMethod="manual" studentId={4} onSaved={vi.fn()} presentation="inline" onPreviewMethod={onPreviewMethod} />, { wrapper: Wrapper });
    expect(screen.getByText('Manual')).toBeVisible();
    expect(screen.queryByLabelText('Payment plan')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save payment method' })).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await openInlineEditor();
    await waitFor(() => expect(screen.getByLabelText('Payment plan')).toHaveValue('manual'));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Payment plan'), { target: { value: 'autopay' } });
    expect(onPreviewMethod).toHaveBeenLastCalledWith('autopay');
    expect(screen.getByRole('checkbox', { name: 'Bank authorisation is ready.' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onPreviewMethod).toHaveBeenLastCalledWith('manual');
    expect(screen.queryByLabelText('Payment plan')).not.toBeInTheDocument();
    expect(screen.getByText('Manual')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Change' })).toHaveFocus();
  });

  it('reports an in-flight preference save and releases the workspace on cleanup', async () => {
    const result = pending<BillingPreferences>(); mocks.savePreferences.mockReturnValue(result.promise);
    const onBusyChange = vi.fn();
    const view = render(<BillingPaymentSettings storageAvailable canWrite studentId={4} onSaved={vi.fn()} presentation="inline" onBusyChange={onBusyChange} />, { wrapper: Wrapper });
    await openInlineEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Save payment method' }));
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    const signal = mocks.savePreferences.mock.calls[0][2] as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    await act(async () => result.resolve({ ...stored, version: 3 }));
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it('shows the editor with unavailable saving and never requests absent storage', async () => {
    render(<BillingPaymentSettings canWrite studentId={4} onSaved={vi.fn()} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Payment method' }));
    expect(screen.getByLabelText('Parent’s payment preference')).toHaveValue('');
    await waitFor(() => expect(screen.getByText('Saving payment methods is not enabled yet.')).toBeVisible());
    expect(screen.getByRole('button', { name: 'Save payment method' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Parent’s payment preference'), { target: { value: 'autopay' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Save payment method' }).closest('form')!);
    expect(mocks.preferences).not.toHaveBeenCalled();
    expect(mocks.savePreferences).not.toHaveBeenCalled();
  });

  it('does not fetch a preference for every compact queue card', async () => {
    render(<>{[4, 5, 6].map(studentId => <BillingPaymentSettings key={studentId} storageAvailable studentId={studentId} onSaved={vi.fn()} />)}</>, { wrapper: Wrapper });
    expect(screen.getAllByRole('button', { name: 'Payment method' })).toHaveLength(3);
    expect(mocks.preferences).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Payment method' })[0]);
    await waitFor(() => expect(screen.getByLabelText('Parent’s payment preference')).toHaveValue('manual'));
    expect(mocks.preferences).toHaveBeenCalledTimes(1);
    expect(mocks.preferences).toHaveBeenCalledWith(4, undefined);
  });

  it('applies an unknown plan immediately and Done keeps the unsaved preview', () => {
    const onPreviewMethod = vi.fn();
    const onSaved = vi.fn();
    render(<ControlledSettings studentId={4} onSaved={onSaved} presentation="inline" previewMethod={null} onPreviewMethod={onPreviewMethod} />, { wrapper: Wrapper });
    expect(screen.getByLabelText('Payment plan')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    expect(onPreviewMethod).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Payment plan'), { target: { value: 'autopay' } });
    expect(onPreviewMethod).toHaveBeenCalledExactlyOnceWith('autopay');
    expect(screen.getByLabelText('Payment plan')).toHaveValue('autopay');
    expect(screen.getByText('Not saved')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByLabelText('Payment plan', { selector: 'select' })).not.toBeInTheDocument();
    expect(screen.getByText('Autopay')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Change' })).toHaveFocus();
    expect(screen.queryByText('Payment method saved.')).not.toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(mocks.preferences).not.toHaveBeenCalled();
    expect(mocks.savePreferences).not.toHaveBeenCalled();
  });

  it('Cancel restores an unknown preview instead of inventing a saved or Manual plan', () => {
    const onPreviewMethod = vi.fn();
    render(<ControlledSettings studentId={4} onSaved={vi.fn()} presentation="inline" previewMethod={null} onPreviewMethod={onPreviewMethod} />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText('Payment plan'), { target: { value: 'autopay' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onPreviewMethod.mock.calls.map(call => call[0])).toEqual(['autopay', null]);
    expect(screen.getByLabelText('Payment plan')).toHaveValue('');
    expect(screen.getByLabelText('Payment plan')).toHaveFocus();
    expect(screen.queryByText('Not saved')).not.toBeInTheDocument();
    expect(mocks.savePreferences).not.toHaveBeenCalled();
  });

  it('Cancel restores a prior temporary plan independently of the recorded preference', async () => {
    render(<ControlledSettings storageAvailable canWrite studentId={4} recordedMethod="manual" onSaved={vi.fn()} presentation="inline" previewMethod="autopay" />, { wrapper: Wrapper });
    await openInlineEditor();
    expect(screen.getByLabelText('Payment plan')).toHaveValue('autopay');
    fireEvent.change(screen.getByLabelText('Payment plan'), { target: { value: 'manual' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Autopay')).toBeVisible();
    expect(screen.getByText('Not saved')).toBeVisible();
    expect(mocks.savePreferences).not.toHaveBeenCalled();
  });

  it('saves preferences with their separate capability and refreshes the queue', async () => {
    const onSaved = vi.fn();
    const onPreviewMethod = vi.fn();
    const onBusyChange = vi.fn();
    render(<ControlledSettings storageAvailable canWrite studentId={4} onSaved={onSaved} presentation="inline" previewMethod="manual" onPreviewMethod={onPreviewMethod} onBusyChange={onBusyChange} />, { wrapper: Wrapper });
    await openInlineEditor();
    await waitFor(() => expect(screen.getByLabelText('Payment plan')).toHaveValue('manual'));
    fireEvent.change(screen.getByLabelText('Payment plan'), { target: { value: 'autopay' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save payment method' }));
    await screen.findByText('Payment method saved.');
    expect(mocks.savePreferences).toHaveBeenCalledWith(4, expect.objectContaining({ payment_method: 'autopay', mandate_ready: false, expected_version: 2 }), expect.any(AbortSignal));
    expect(onSaved).toHaveBeenCalledOnce();
    expect(onPreviewMethod).toHaveBeenLastCalledWith('autopay');
    expect(onBusyChange).toHaveBeenCalledWith(true);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(mocks.invalidate).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText('Payment plan')).not.toBeInTheDocument();
    expect(screen.getByText('Autopay')).toBeVisible();
  });

  it('does not invent a preview method when the saved choice is cleared', async () => {
    mocks.savePreferences.mockResolvedValue({ ...stored, payment_method: null, version: 3 });
    const onPreviewMethod = vi.fn();
    render(<BillingPaymentSettings storageAvailable canWrite studentId={4} onSaved={vi.fn()} presentation="inline" previewMethod="manual" onPreviewMethod={onPreviewMethod} />, { wrapper: Wrapper });
    await openInlineEditor();
    fireEvent.change(screen.getByLabelText('Payment plan'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save payment method' }));
    await screen.findByText('Payment method saved.');
    expect(onPreviewMethod).toHaveBeenCalledExactlyOnceWith(null);
    expect(mocks.savePreferences.mock.calls[0][1].payment_method).toBeNull();
  });

  it('withholds saving on a preference read failure and allows a fresh retry', async () => {
    mocks.preferences.mockRejectedValueOnce(new Error('Offline'));
    render(<BillingPaymentSettings storageAvailable canWrite studentId={4} onSaved={vi.fn()} presentation="inline" />, { wrapper: Wrapper });
    await screen.findByText('Could not load the saved payment method.');
    expect(screen.getByRole('button', { name: 'Save payment method' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await openInlineEditor();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save payment method' })).toBeEnabled());
    expect(screen.getByLabelText('Payment plan')).toHaveValue('manual');
  });

  it('reloads a conflicting saved version only after staff choose to replace their edit', async () => {
    mocks.savePreferences.mockRejectedValueOnce(Object.assign(new Error('Payment settings changed. Reload them before saving.'), { status: 409 }));
    render(<BillingPaymentSettings storageAvailable canWrite studentId={4} onSaved={vi.fn()} presentation="inline" />, { wrapper: Wrapper });
    await openInlineEditor();
    await waitFor(() => expect(screen.getByLabelText('Payment plan')).toHaveValue('manual'));
    fireEvent.change(screen.getByLabelText('Payment plan'), { target: { value: 'autopay' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save payment method' }));
    const reload = await screen.findByRole('button', { name: 'Reload saved choice' });
    expect(screen.getByLabelText('Payment plan')).toHaveValue('autopay');
    mocks.preferences.mockResolvedValue({ ...stored, version: 3 });
    fireEvent.click(reload);
    await waitFor(() => expect(screen.getByLabelText('Payment plan')).toHaveValue('manual'));
    fireEvent.change(screen.getByLabelText('Payment plan'), { target: { value: 'autopay' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save payment method' }));
    await screen.findByText('Payment method saved.');
    expect(mocks.savePreferences.mock.calls[1][1].expected_version).toBe(3);
    expect(mocks.savePreferences.mock.calls[1][1].idempotency_key).not.toBe(mocks.savePreferences.mock.calls[0][1].idempotency_key);
  });

  it('isolates an open form and pending save when the student changes', async () => {
    const result = pending<BillingPreferences>(); mocks.savePreferences.mockReturnValue(result.promise);
    const onSaved = vi.fn();
    const view = render(<BillingPaymentSettings storageAvailable canWrite studentId={4} onSaved={onSaved} presentation="inline" />, { wrapper: Wrapper });
    await openInlineEditor();
    await waitFor(() => expect(screen.getByLabelText('Payment plan')).toHaveValue('manual'));
    fireEvent.change(screen.getByLabelText('Payment plan'), { target: { value: 'autopay' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save payment method' }));
    const signal = mocks.savePreferences.mock.calls[0][2] as AbortSignal;
    mocks.preferences.mockResolvedValue({ ...stored, student_id: 5, payment_method: null, version: 0 });
    view.rerender(<BillingPaymentSettings storageAvailable canWrite studentId={5} onSaved={onSaved} presentation="inline" />);
    await waitFor(() => expect(mocks.preferences).toHaveBeenCalledWith(5, undefined));
    expect(signal.aborted).toBe(true);
    await act(async () => result.resolve({ ...stored, payment_method: 'autopay', version: 3 }));
    expect(screen.getByLabelText('Payment plan')).toHaveValue('');
    expect(onSaved).not.toHaveBeenCalled(); expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it('aborts a pending save when its separate write capability is withdrawn', async () => {
    const result = pending<BillingPreferences>(); mocks.savePreferences.mockReturnValue(result.promise);
    const onSaved = vi.fn();
    const view = render(<BillingPaymentSettings storageAvailable canWrite studentId={4} onSaved={onSaved} presentation="inline" />, { wrapper: Wrapper });
    await openInlineEditor();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save payment method' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Save payment method' }));
    const signal = mocks.savePreferences.mock.calls[0][2] as AbortSignal;
    view.rerender(<BillingPaymentSettings storageAvailable studentId={4} onSaved={onSaved} presentation="inline" />);
    expect(signal.aborted).toBe(true);
    await act(async () => result.resolve({ ...stored, version: 3 }));
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save payment method' })).toBeDisabled();
    expect(screen.queryByText('Payment method saved.')).not.toBeInTheDocument();
  });

  it('allows a tutor to preview without allowing saved preference or mandate changes', async () => {
    mocks.auth.mockReturnValue({ user: { id: 99 }, effectiveRole: 'Tutor', isAdmin: false, isImpersonating: true, impersonatedTutor: { id: 7 } });
    const onPreviewMethod = vi.fn();
    render(<BillingPaymentSettings storageAvailable canWrite studentId={4} onSaved={vi.fn()} presentation="inline" onPreviewMethod={onPreviewMethod} />, { wrapper: Wrapper });
    await openInlineEditor();
    await waitFor(() => expect(screen.getByLabelText('Payment plan')).toHaveValue('manual'));
    expect(mocks.preferences).toHaveBeenCalledWith(4, 7);
    fireEvent.change(screen.getByLabelText('Payment plan'), { target: { value: 'autopay' } });
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save payment method' })).toBeDisabled();
    expect(onPreviewMethod).toHaveBeenCalledWith('autopay');
    expect(mocks.savePreferences).not.toHaveBeenCalled();
  });
});
