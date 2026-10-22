import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillingDraftDetail, BillingIntakeContext } from '@/types/billing';
import { BillingEnrollmentIntake } from './BillingEnrollmentIntake';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), context: vi.fn(), preview: vi.fn(), saved: vi.fn(), payments: vi.fn(), settings: vi.fn(), invalidate: vi.fn() }));
const options = { first_payment_from: '2026-10-30', draft_storage_available: true, workflow_available: true, workflow_writes_available: false, preferences_writes_available: false };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/lib/hooks', () => ({ useActiveTutors: () => ({ data: [{ id: 9, tutor_name: 'Tutor Nine' }] }), invalidateCaches: mocks.invalidate }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: { intakeContext: mocks.context, options: vi.fn() } }));
vi.mock('swr', () => ({ default: () => ({ data: options, mutate: vi.fn() }) }));
vi.mock('@/components/ui/student-info-badges', () => ({ StudentInfoBadges: ({ student }: { student: { student_name: string } }) => <span>{student.student_name}</span> }));
vi.mock('./BillingPreview', () => ({ BillingPreview: (props: unknown) => { mocks.preview(props); return <div><span>Intake journey</span><input aria-label="Synthetic intake choice" defaultValue="Unedited" /></div>; } }));
vi.mock('./BillingSavedDrafts', () => ({ BillingSavedDrafts: (props: unknown) => { mocks.saved(props); return <span>Exact saved draft</span>; } }));
vi.mock('./BillingPayments', () => ({ BillingPayments: (props: unknown) => { mocks.payments(props); return <span>Exact created payment</span>; } }));
vi.mock('./BillingPaymentSettings', () => ({ BillingPaymentSettings: (props: unknown) => { mocks.settings(props); return <span>Payment settings</span>; } }));

function context(studentId = 4): BillingIntakeContext {
  return { student: { id: studentId, student_name: `Student ${studentId}`, school_student_id: '004', home_location: 'MSA', grade: 'F1', is_staff_referral: false },
    source_fingerprint: `source-${studentId}`, trial: { enrollment_id: 70, session_id: 71, session_date: '2026-11-03', time_slot: '16:45 - 18:15', location: 'MSA', tutor_id: 9, tutor_name: 'Tutor Nine', session_status: 'Attended' },
    is_new_student: true, materials_fee: 100, materials_basis: 'New student materials.', recorded_payment_method: null, mandate_ready: false, coupon_snapshot: null, issues: [],
    suggested_request: { first_lesson_date: '2026-11-10', slots: [{ weekday: 'Tue', time_slot: '16:45 - 18:15', location: 'MSA' }], mode: 'new_student', payment_method: 'manual', materials_fee: 100, trial_deduction: true, mandate_ready: false } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Admin', isAdmin: true, isGuest: false, isLoading: false });
  mocks.context.mockResolvedValue(context());
});

describe('reviewed first enrollment', () => {
  it('loads verified trial identity but keeps the actual chosen date, tutor and slot', async () => {
    render(<BillingEnrollmentIntake studentId={4} trialEnrollmentId={70} trialSessionId={71} initialFirstLessonDate="2026-11-17"
      initialSlots={[{ weekday: 'Tue', time_slot: '18:30 - 20:00', location: 'MSB' }]}
      initialIntakeSlots={[{ tutor_id: 12, renewed_from_enrollment_id: 70 }]} />);
    await screen.findByText('Intake journey');
    expect(mocks.context).toHaveBeenCalledWith(4, { trial_enrollment_id: 70, trial_session_id: 71, tutor_id: undefined }, expect.any(AbortSignal));
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({
      initialRequest: expect.objectContaining({ first_lesson_date: '2026-11-17', materials_fee: 100, trial_deduction: true, slots: [{ weekday: 'Tue', time_slot: '18:30 - 20:00', location: 'MSB' }] }),
      intake: { trial_enrollment_id: 70, trial_session_id: 71, slots: [{ tutor_id: 12, renewed_from_enrollment_id: 70 }] },
      defaultMaterialsFee: 100, draftContext: expect.objectContaining({ studentId: 4, selectedEnrollmentIds: [], sourceFingerprint: 'source-4' }),
    }));
  });

  it('uses zero materials for a verified returning student and does not invent a trial credit', async () => {
    mocks.context.mockResolvedValue({ ...context(), trial: null, is_new_student: false, materials_fee: 0 });
    render(<BillingEnrollmentIntake studentId={4} initialFirstLessonDate="2026-11-17" initialSlots={[{ weekday: 'Tue' }]} initialIntakeSlots={[{ tutor_id: 9 }]} />);
    await screen.findByText('Intake journey');
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ initialRequest: expect.objectContaining({ materials_fee: 0, trial_deduction: false }) }));
  });

  it('does not advance an early proposed start date to the cutover', async () => {
    mocks.context.mockResolvedValue({ ...context(), suggested_request: { ...context().suggested_request!, first_lesson_date: '2026-10-27' } });
    render(<BillingEnrollmentIntake studentId={4} trialEnrollmentId={70} trialSessionId={71} />);
    await screen.findByText(/Use the existing enrollment flow/);
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it('fails closed on denied or mismatched identity and retries the source', async () => {
    mocks.context.mockRejectedValueOnce(new Error('Not available to this tutor.')).mockResolvedValueOnce({ ...context(), student: { ...context().student, id: 5 } });
    render(<BillingEnrollmentIntake studentId={4} trialEnrollmentId={70} trialSessionId={71} />);
    await screen.findByText('Not available to this tutor.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry enrollment details' }));
    await screen.findByText('The trial or student changed. Open the enrollment again.');
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it('aborts and hides the prior student immediately when scope changes', async () => {
    let finish!: (value: BillingIntakeContext) => void;
    mocks.context.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce({ ...context(5), trial: null });
    const view = render(<BillingEnrollmentIntake studentId={4} />);
    const firstSignal = mocks.context.mock.calls[0][2] as AbortSignal;
    view.rerender(<BillingEnrollmentIntake studentId={5} />);
    await screen.findByText('Student 5');
    expect(firstSignal.aborted).toBe(true);
    await act(async () => finish(context()));
    expect(screen.queryByText('Student 4')).not.toBeInTheDocument();
  });

  it('sends effective tutor scope and leaves creation unavailable for tutors', async () => {
    mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Tutor', isAdmin: false, isGuest: false, isLoading: false, isImpersonating: true, impersonatedTutor: { id: 9 } });
    render(<BillingEnrollmentIntake studentId={4} trialEnrollmentId={70} trialSessionId={71} />);
    await screen.findByText('Intake journey');
    expect(mocks.context).toHaveBeenCalledWith(4, expect.objectContaining({ tutor_id: 9 }), expect.any(AbortSignal));
    expect(mocks.settings).toHaveBeenLastCalledWith(expect.objectContaining({ canWrite: false }));
  });

  it('hands a saved draft to the existing confirmation flow and preserves its metadata on revision', async () => {
    const onCreated = vi.fn();
    render(<BillingEnrollmentIntake studentId={4} trialEnrollmentId={70} trialSessionId={71} onCreated={onCreated} />);
    await screen.findByText('Intake journey');
    const draft = { id: 'draft-1', current_revision: 2, revision: 2, review: { scenario: { ...context().suggested_request!, adjustment: { through: '2026-11-30', reason: 'Approved first period.' } }, intake: { trial_enrollment_id: 70, trial_session_id: 71, slots: [{ tutor_id: 12, renewed_from_enrollment_id: 70 }], materials_override_reason: 'Materials waived.' } } } as BillingDraftDetail;
    act(() => mocks.preview.mock.lastCall![0].onDraftSaved(draft));
    expect(screen.getByText('Exact saved draft')).toBeInTheDocument();
    expect(mocks.saved).toHaveBeenLastCalledWith(expect.objectContaining({ initialDraftId: 'draft-1', workflowWritesAvailable: false }));
    act(() => mocks.saved.mock.lastCall![0].onRevise(draft));
    await screen.findByText('Intake journey');
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ intake: draft.review.intake, initialRequest: expect.objectContaining({ adjustment: draft.review.scenario.adjustment }), revisionTarget: { id: 'draft-1', current_revision: 2 } }));
    act(() => mocks.preview.mock.lastCall![0].onDraftSaved(draft));
    act(() => mocks.saved.mock.lastCall![0].onConfirmed({ id: 'payment-1' }));
    expect(screen.getByText('Exact created payment')).toBeInTheDocument();
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(mocks.payments).toHaveBeenLastCalledWith(expect.objectContaining({ initialPaymentId: 'payment-1', canWrite: false }));
  });

  it('reopens an exact saved intake draft from a persistent link', async () => {
    render(<BillingEnrollmentIntake studentId={4} initialDraftId="draft-previous" />);
    await screen.findByText('Exact saved draft');
    expect(mocks.saved).toHaveBeenLastCalledWith(expect.objectContaining({ studentId: 4, initialDraftId: 'draft-previous', inline: true }));
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it('keeps the edited preview mounted while payment settings refresh and withholds review until verified again', async () => {
    let finish!: (value: BillingIntakeContext) => void;
    render(<BillingEnrollmentIntake studentId={4} trialEnrollmentId={70} trialSessionId={71} />);
    await screen.findByText('Intake journey');
    fireEvent.change(screen.getByLabelText('Synthetic intake choice'), { target: { value: 'Materials waived and first period adjusted.' } });
    mocks.context.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    act(() => mocks.settings.mock.lastCall![0].onSaved());
    expect(screen.getByLabelText('Synthetic intake choice')).toHaveValue('Materials waived and first period adjusted.');
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ sourceLoading: true }));
    await act(async () => finish({ ...context(), source_fingerprint: 'verified-new-preference', recorded_payment_method: 'autopay' }));
    expect(screen.getByLabelText('Synthetic intake choice')).toHaveValue('Materials waived and first period adjusted.');
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ sourceLoading: false, sourceKey: 'verified-new-preference',
      draftContext: expect.objectContaining({ sourceFingerprint: 'verified-new-preference' }) }));
  });

  it('restores a saved intake without a trial and switches exact drafts when the link changes', async () => {
    mocks.context.mockResolvedValue({ ...context(), trial: null, suggested_request: null, is_new_student: false, materials_fee: 0 });
    const view = render(<BillingEnrollmentIntake studentId={4} initialDraftId="draft-returning" />);
    await screen.findByText('Exact saved draft');
    const draft = { id: 'draft-returning', current_revision: 2, review: { scenario: { ...context().suggested_request!, materials_fee: 0, trial_deduction: false }, intake: { slots: [{ tutor_id: 12 }] } } } as BillingDraftDetail;
    act(() => mocks.saved.mock.lastCall![0].onRevise(draft));
    await screen.findByText('Intake journey');
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ intake: draft.review.intake, initialRequest: expect.objectContaining(draft.review.scenario) }));
    view.rerender(<BillingEnrollmentIntake studentId={4} initialDraftId="draft-second" />);
    await screen.findByText('Exact saved draft');
    expect(mocks.saved).toHaveBeenLastCalledWith(expect.objectContaining({ initialDraftId: 'draft-second' }));
  });
});
