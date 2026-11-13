import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingEnrollmentSettings } from './BillingEnrollmentSettings';
const mocks = vi.hoisted(() => ({ auth: { user: { id: 1 }, isAdmin: true, isLoading: false, isGuest: false, isReadOnly: false }, settings: vi.fn(), save: vi.fn(), mutate: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: { settings: mocks.settings, saveSettings: mocks.save } }));
vi.mock('swr', () => ({ useSWRConfig: () => ({ mutate: mocks.mutate }) }));
vi.mock('@/components/ui/modal', () => ({ Modal: ({ isOpen, children, onClose }: { isOpen: boolean; children: React.ReactNode; onClose: () => void }) => isOpen ? <div role="dialog"><button onClick={onClose}>Close dialog</button>{children}</div> : null }));
vi.mock('./BillingDraftReview', () => ({ billingDraftAuthScope: (auth: typeof mocks.auth) => String(auth.user.id), BillingDraftFocus: ({ children }: { children: React.ReactNode }) => children }));
const base = { materials_fee: 100, version: 3, storage_available: true, writes_available: true };
async function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Enrollment settings' }));
  await screen.findByLabelText('Materials fee (MOP)');
  await waitFor(() => expect(screen.queryByText('Loading settings…')).not.toBeInTheDocument());
}
function change(value = '120') { fireEvent.change(screen.getByLabelText('Materials fee (MOP)'), { target: { value } }); }
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth = { user: { id: 1 }, isAdmin: true, isLoading: false, isGuest: false, isReadOnly: false };
  mocks.settings.mockResolvedValue(base); mocks.save.mockResolvedValue({ ...base, materials_fee: 120, version: 4 }); mocks.mutate.mockResolvedValue(undefined);
});
describe('Enrollment settings', () => {
  it('loads on demand and saves a versioned amount while invalidating calculation caches only', async () => {
    const event = vi.fn(); window.addEventListener('billing-settings-updated', event);
    render(<BillingEnrollmentSettings />); expect(mocks.settings).not.toHaveBeenCalled(); await open();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled(); change(); fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Settings saved.');
    expect(mocks.save).toHaveBeenCalledWith({ materials_fee: 120, expected_version: 3, idempotency_key: expect.any(String) }, expect.any(AbortSignal));
    expect(event).toHaveBeenCalledOnce(); const predicate = mocks.mutate.mock.calls[0][0];
    expect(predicate(['billing-plan-options', 'actor'])).toBe(true); expect(predicate(['billing-student-context', 42])).toBe(true); expect(predicate(['billing-payments', 42])).toBe(false);
    window.removeEventListener('billing-settings-updated', event);
  });
  it('hides configuration from tutors, guests and read-only access', () => {
    mocks.auth.isAdmin = false; const { rerender } = render(<BillingEnrollmentSettings />); expect(screen.queryByRole('button')).not.toBeInTheDocument();
    mocks.auth.isAdmin = true; mocks.auth.isReadOnly = true; rerender(<BillingEnrollmentSettings />); expect(screen.queryByRole('button')).not.toBeInTheDocument();
    mocks.auth.isReadOnly = false; mocks.auth.isGuest = true; rerender(<BillingEnrollmentSettings />); expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('requires a fresh read following a version conflict', async () => {
    mocks.save.mockRejectedValueOnce(Object.assign(new Error('Conflict'), { status: 409 })); render(<BillingEnrollmentSettings />); await open(); change(); fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Settings changed. Reload before saving.'); expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    mocks.settings.mockResolvedValueOnce({ ...base, version: 4, materials_fee: 110 }); fireEvent.click(screen.getByRole('button', { name: 'Reload settings' }));
    await waitFor(() => expect(screen.getByLabelText('Materials fee (MOP)')).toHaveValue(110)); change(); fireEvent.click(screen.getByRole('button', { name: 'Save' })); await screen.findByText('Settings saved.'); expect(mocks.save.mock.calls[1][0].expected_version).toBe(4);
  });
  it('reuses the request token after an ambiguous failure', async () => {
    mocks.save.mockRejectedValueOnce(new Error('Connection lost')); render(<BillingEnrollmentSettings />); await open(); change(); fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Connection lost'); fireEvent.click(screen.getByRole('button', { name: 'Save' })); await screen.findByText('Settings saved.'); expect(mocks.save.mock.calls[0][0]).toEqual(mocks.save.mock.calls[1][0]);
  });
  it('disables unavailable storage and validates integer limits', async () => {
    mocks.settings.mockResolvedValueOnce({ ...base, storage_available: false, writes_available: false }); const { unmount } = render(<BillingEnrollmentSettings />); await open(); expect(screen.getByLabelText('Materials fee (MOP)')).toBeDisabled(); unmount();
    render(<BillingEnrollmentSettings />); await open(); for (const value of ['-1', '1.5', '10001', '']) { change(value); expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled(); } change('0'); expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
  it('aborts a save and ignores its late response when the actor changes', async () => {
    let finish!: (value: typeof base) => void; mocks.save.mockImplementation(() => new Promise(resolve => { finish = resolve; })); const { rerender } = render(<BillingEnrollmentSettings />); await open(); change(); fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    mocks.auth.user = { id: 2 }; rerender(<BillingEnrollmentSettings />); expect(mocks.save.mock.calls[0][1].aborted).toBe(true); finish(base); await Promise.resolve(); expect(mocks.mutate).not.toHaveBeenCalled(); expect(screen.queryByText('Settings saved.')).not.toBeInTheDocument();
  });
  it('keeps the modal open during saves and requires reload after unavailable writes', async () => {
    let reject!: (error: Error) => void;
    mocks.save.mockImplementationOnce(() => new Promise((_resolve, rejectRequest) => { reject = rejectRequest; }));
    render(<BillingEnrollmentSettings />); await open(); change(); fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' })); expect(screen.getByRole('dialog')).toBeInTheDocument();
    reject(Object.assign(new Error('Unavailable'), { status: 503 }));
    await screen.findByText('Saving settings is unavailable. Reload to check again.');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reload settings' }));
    await waitFor(() => expect(screen.getByLabelText('Materials fee (MOP)')).toHaveValue(100));
    expect(screen.getByLabelText('Materials fee (MOP)')).toBeEnabled();
  });
  it('retries an initial read failure', async () => {
    mocks.settings.mockRejectedValueOnce(new Error('Read failed')); render(<BillingEnrollmentSettings />); fireEvent.click(screen.getByRole('button', { name: 'Enrollment settings' })); await screen.findByText('Read failed'); fireEvent.click(screen.getByRole('button', { name: 'Reload settings' })); await screen.findByLabelText('Materials fee (MOP)'); expect(mocks.settings).toHaveBeenCalledTimes(2);
  });
});
