import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentParticipation } from './StudentParticipation';
import type { ParticipationChange, ParticipationDetail, ParticipationPreview } from '@/types/makeup';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), source: null as ParticipationDetail | null, preview: vi.fn(), save: vi.fn(), mutate: vi.fn(), invalidate: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/lib/makeup-api', () => ({ makeupAPI: { participation: vi.fn(), previewParticipation: mocks.preview, changeParticipation: mocks.save } }));
vi.mock('@/lib/hooks', () => ({ invalidateCaches: mocks.invalidate }));
vi.mock('@/lib/renewal-queue', () => ({ invalidateRenewalQueueCache: vi.fn() }));
vi.mock('swr', () => ({ default: () => ({ data: mocks.source, mutate: mocks.mutate }) }));

function detail(): ParticipationDetail { return { student_id: 4, enabled: true, can_manage: true, policy_active: true, academic_start: '2026-09-01', status: 'Active', effective_on: '2026-09-01', version: 2, paid_through: '2027-03-31', history: [], return_candidates: [{ enrollment_id: 33, payment_id: 'payment-1', coverage_from: '2027-05-01', coverage_through: '2027-05-31', paid_on: '2027-04-22' }] }; }
function preview(change: ParticipationChange): ParticipationPreview { return { student_id: 4, academic_start: '2026-09-01', version: 2, change, review_hash: 'a'.repeat(64), affected_bookings: [{ session_id: 90, source_session_id: 80, root_session_id: 70, session_date: '2027-04-10', time_slot: '16:00 - 17:30', location: 'MSA', tutor_id: 9, tutor_name: 'Tutor Nine', exam_revision_slot_id: null, action: 'release_to_pending' }], warnings: ['Existing payments remain on record.'], can_confirm: true, blocked_reasons: [] }; }
beforeEach(() => {
  vi.clearAllMocks(); mocks.source = detail();
  mocks.auth.mockReturnValue({ user: { id: 1 }, isAdmin: true, effectiveRole: 'Admin', isGuest: false });
  mocks.preview.mockImplementation((_student, change) => Promise.resolve(preview(change)));
  mocks.save.mockResolvedValue({ ...detail(), status: 'Paused', version: 3 });
  mocks.mutate.mockResolvedValue(undefined);
});
async function edit() {
  fireEvent.click(screen.getByRole('button', { name: 'Change' }));
  await screen.findByLabelText('Reason');
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2027-04-01' } });
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Family trip.' } });
}
async function reviewChange() {
  await edit(); fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
  await screen.findByRole('region', { name: 'Participation change review' });
}

describe('student participation', () => {
  it('does not expose inactive storage or unsupported policy controls', () => {
    mocks.source = { ...detail(), enabled: false };
    render(<StudentParticipation studentId={4} />);
    expect(screen.queryByLabelText('Student participation')).not.toBeInTheDocument();
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it('requires an explicit review and release confirmation before changing a pause', async () => {
    render(<StudentParticipation studentId={4} />); await reviewChange();
    expect(screen.getByText('1 future makeup booking will return to pending.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm change' })).toBeDisabled();
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Release these bookings and keep the unused makeups pending.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(mocks.save).toHaveBeenCalledWith(4, expect.objectContaining({ status: 'Paused', effective_on: '2027-04-01', reason: 'Family trip.', return_enrollment_id: null, expected_version: 2, expected_review_hash: 'a'.repeat(64), idempotency_key: expect.any(String) }), expect.any(AbortSignal));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.invalidate).toHaveBeenCalledWith('sessions', { studentId: 4 });
    expect(mocks.invalidate).toHaveBeenCalledWith('proposals', { studentId: 4 });
  });

  it('keeps the reviewed change and exact idempotency payload after an ambiguous failure', async () => {
    mocks.save.mockRejectedValueOnce(new Error('Connection interrupted.'));
    render(<StudentParticipation studentId={4} />); await reviewChange();
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
    await screen.findByText('Connection interrupted.');
    const first = mocks.save.mock.calls[0][1];
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[1][1]).toEqual(first);
  });

  it('blocks dismissal and duplicate clicks while a reviewed mutation is in flight', async () => {
    let finish!: (value: ParticipationDetail) => void;
    mocks.save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<StudentParticipation studentId={4} />); await reviewChange();
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    const signal = mocks.save.mock.calls[0][2] as AbortSignal;
    fireEvent.keyDown(document, { key: 'Escape' }); fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
    expect(signal.aborted).toBe(false); expect(mocks.save).toHaveBeenCalledOnce();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () => finish({ ...detail(), status: 'Paused', version: 3 }));
  });

  it('requires a paid return enrollment for both an existing departure and a scheduled pause', async () => {
    mocks.source = { ...detail(), status: 'Left' };
    const view = render(<StudentParticipation studentId={4} />); await edit();
    expect(screen.getByLabelText('Paid return enrollment')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review change' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Paid return enrollment'), { target: { value: '33' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledWith(4, expect.objectContaining({ status: 'Active', return_enrollment_id: 33 }), expect.any(AbortSignal)));
    view.unmount(); mocks.source = { ...detail(), scheduled_status: 'Paused', scheduled_effective_on: '2027-04-01' };
    render(<StudentParticipation studentId={4} />); await edit();
    fireEvent.change(screen.getByLabelText('Participation'), { target: { value: 'Active' } });
    expect(screen.getByLabelText('Paid return enrollment')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review change' })).toBeDisabled();
  });

  it('replaces writes with history under an effective read-only role and aborts an old review', async () => {
    let finish!: (value: ParticipationPreview) => void;
    mocks.preview.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = render(<StudentParticipation studentId={4} />); await edit();
    fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
    const original = mocks.preview.mock.calls[0];
    mocks.auth.mockReturnValue({ user: { id: 1 }, isAdmin: false, effectiveRole: 'Supervisor', isReadOnly: true });
    view.rerender(<StudentParticipation studentId={4} />);
    await act(async () => finish(preview(original[1])));
    expect((original[2] as AbortSignal).aborted).toBe(true);
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(screen.queryByRole('button', { name: 'Review change' })).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('withholds a stale review after inputs change and offers refresh after a server conflict', async () => {
    mocks.save.mockRejectedValueOnce(Object.assign(new Error('The bookings changed.'), { status: 409 }));
    render(<StudentParticipation studentId={4} />); await reviewChange();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Revised reason.' } });
    expect(screen.queryByRole('button', { name: 'Confirm change' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review change' })); await screen.findByRole('checkbox');
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh participation' }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Review change' })).toBeInTheDocument();
  });
});
