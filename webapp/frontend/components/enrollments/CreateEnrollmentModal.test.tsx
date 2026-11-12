import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLayoutEffect } from 'react';
import type { Student, TrialListItem } from '@/types';
import { CreateEnrollmentModal } from './CreateEnrollmentModal';

const mocks = vi.hoisted(() => ({ student: vi.fn(), preview: vi.fn(), create: vi.fn(), intake: vi.fn(), intakeContext: vi.fn(), renewal: vi.fn(), studentReady: vi.fn() }));
const tutors = [{ id: 9, tutor_name: 'Tutor Nine', default_location: 'MSA' }, { id: 12, tutor_name: 'Tutor Twelve', default_location: 'MSA' }, { id: 13, tutor_name: 'Tutor MSB', default_location: 'MSB' }];
const options = { first_payment_from: '2026-10-30', workflow_writes_available: true };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 }, effectiveRole: 'Admin', isAdmin: true }) }));
vi.mock('@/contexts/LocationContext', () => ({ useLocation: () => ({ selectedLocation: 'MSA' }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn(), showError: vi.fn() }) }));
vi.mock('@/lib/hooks', () => ({ useActiveTutors: () => ({ data: tutors }), useCacheInvalidation: () => ({ invalidateAfterEnrollmentCreate: vi.fn() }) }));
vi.mock('@/lib/api', () => ({ studentsAPI: { getById: mocks.student, getCoupon: vi.fn().mockResolvedValue({ has_coupon: false }) },
  enrollmentsAPI: { getAll: vi.fn().mockResolvedValue([]), getRenewalData: vi.fn(), preview: mocks.preview, create: mocks.create }, discountsAPI: { getAll: vi.fn() } }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: { options: vi.fn(), intakeContext: mocks.intakeContext } }));
vi.mock('swr', () => ({ default: (key: unknown) => ({ data: !key ? undefined : key === 'discounts' ? [] : Array.isArray(key) ? mocks.renewal() : options, isLoading: false, mutate: vi.fn() }) }));
vi.mock('@/components/ui/modal', () => ({ Modal: ({ isOpen, children, footer }: { isOpen: boolean; children: React.ReactNode; footer: React.ReactNode }) => isOpen ? <div>{children}{footer}</div> : null }));
vi.mock('@/components/ui/student-search', () => ({ StudentSearch: ({ value, onChange }: { value: Student | null; onChange: (value: Student) => void }) => {
  useLayoutEffect(() => { if (value) mocks.studentReady(); }, [value]);
  return <div><span>{value?.student_name}</span><button onClick={() => onChange({ id: 6, student_name: 'Student Six', home_location: 'MSB' } as Student)}>Choose MSB student</button></div>;
} }));
vi.mock('@/components/ui/student-info-badges', () => ({ StudentInfoBadges: () => <span>Student badges</span> }));
vi.mock('@/components/billing/BillingEnrollmentIntake', () => ({ BillingEnrollmentIntake: (props: unknown) => { mocks.intake(props); return <span>Reviewed intake</span>; } }));

const student = { id: 4, student_name: 'Student Four', home_location: 'MSA', is_staff_referral: false } as Student;
const trial = { enrollment_id: 70, session_id: 71, student_id: 4, student_name: 'Student Four', tutor_id: 9, tutor_name: 'Tutor Nine', session_date: '2026-10-23', time_slot: '16:45 - 18:15', location: 'MSA', session_status: 'Attended', trial_status: 'pending' } as TrialListItem;
beforeEach(() => {
  options.workflow_writes_available = true;
  mocks.studentReady.mockReset();
  mocks.intakeContext.mockReset().mockImplementation(async (id, params) => ({ student: { ...student, id }, source_fingerprint: 'source', trial: params.trial_enrollment_id ? { enrollment_id: params.trial_enrollment_id, session_id: params.trial_session_id } : null }));
  vi.clearAllMocks(); mocks.student.mockReset().mockResolvedValue(student); mocks.renewal.mockReturnValue(undefined);
  mocks.preview.mockResolvedValue({ sessions: [], conflicts: [], warnings: [], potential_renewals: [] });
});

describe('existing enrollment form under the new fee scheme', () => {
  it('uses the student branch instead of the global filter and preserves a manual change on refresh', async () => {
    const branchStudent = { ...student, home_location: 'MSB' };
    const view = render(<CreateEnrollmentModal isOpen onClose={vi.fn()} prefillStudent={branchStudent} />);
    await screen.findByText('Student Four');
    expect(screen.getByLabelText('Location')).toHaveValue('MSB');
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'MSA' } });
    view.rerender(<CreateEnrollmentModal isOpen onClose={vi.fn()} prefillStudent={{ ...branchStudent }} />);
    expect(screen.getByLabelText('Location')).toHaveValue('MSA');
    await act(async () => {});
  });

  it('defaults to the branch of a student selected from search', async () => {
    render(<CreateEnrollmentModal isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose MSB student' }));
    expect(screen.getByLabelText('Location')).toHaveValue('MSB');
    await act(async () => {});
  });

  it('retains the actual trial lesson branch even when the profile branch differs', async () => {
    mocks.student.mockResolvedValue({ ...student, home_location: 'MSB' });
    render(<CreateEnrollmentModal isOpen onClose={vi.fn()} convertFromTrial={trial} />);
    await screen.findByText('Student Four');
    expect(screen.getByLabelText('Location')).toHaveValue('MSA');
  });

  it('uses the student branch when a taught lesson has no location', async () => {
    mocks.student.mockResolvedValue({ ...student, home_location: 'MSB' });
    render(<CreateEnrollmentModal isOpen onClose={vi.fn()} fromTaughtLesson={{ student_id: 4, tutor_id: 13, lesson_date: '2026-11-17', time_slot: '16:45 - 18:15', location: null }} />);
    await screen.findByText('Student Four');
    expect(screen.getByLabelText('Location')).toHaveValue('MSB');
  });

  it('aborts a pending preview when the modal closes and ignores its late response', async () => {
    let finish!: (value: unknown) => void;
    mocks.intakeContext.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = render(<CreateEnrollmentModal isOpen onClose={vi.fn()} convertFromTrial={trial} />);
    await screen.findByText('Student Four');
    fireEvent.click(screen.getByRole('button', { name: 'Preview fees' }));
    const signal = mocks.intakeContext.mock.calls[0][2] as AbortSignal;
    view.rerender(<CreateEnrollmentModal isOpen={false} onClose={vi.fn()} convertFromTrial={trial} />);
    expect(signal.aborted).toBe(true);
    await act(async () => finish({ student, source_fingerprint: 'late', trial: { enrollment_id: 70, session_id: 71 } }));
    view.rerender(<CreateEnrollmentModal isOpen onClose={vi.fn()} convertFromTrial={trial} />);
    await screen.findByText('Student Four');
    expect(screen.queryByText('Reviewed intake')).not.toBeInTheDocument();
  });

  it.each(['success', 'failure'])('keeps source ownership for a preview started at the student-prefill commit (%s)', async outcome => {
    let finish!: (value: unknown) => void;
    let fail!: (reason: unknown) => void;
    mocks.intakeContext.mockImplementationOnce(() => new Promise((resolve, reject) => { finish = resolve; fail = reject; }));
    // Start at commit before the previous source's passive cleanup runs. A late
    // cleanup must not abort the operation belonging to the newly loaded source.
    mocks.studentReady.mockImplementation(() => screen.getByRole('button', { name: 'Preview fees' }).click());
    render(<CreateEnrollmentModal isOpen onClose={vi.fn()} convertFromTrial={trial} />);
    await screen.findByText('Student Four');
    expect(mocks.intakeContext).toHaveBeenCalledOnce();
    const signal = mocks.intakeContext.mock.calls[0][2] as AbortSignal;
    expect(signal.aborted).toBe(false);
    expect(screen.getByLabelText('Location')).toBeDisabled();
    if (outcome === 'success') {
      await act(async () => finish({ student, source_fingerprint: 'prepared', trial: { enrollment_id: 70, session_id: 71 } }));
    } else {
      await act(async () => fail(new Error('Connection interrupted.')));
      expect(await screen.findByText('Connection interrupted.')).toBeInTheDocument();
      expect(screen.getByLabelText('Location')).toBeEnabled();
      fireEvent.click(screen.getByRole('button', { name: 'Preview fees' }));
    }
    expect(await screen.findByText('Reviewed intake')).toBeInTheDocument();
  });

  it('cancels the old source during a trial switch without cancelling the next source', async () => {
    let finishOld!: (value: unknown) => void;
    mocks.intakeContext.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    const view = render(<CreateEnrollmentModal isOpen onClose={vi.fn()} convertFromTrial={trial} />);
    await screen.findByText('Student Four');
    fireEvent.click(screen.getByRole('button', { name: 'Preview fees' }));
    const oldSignal = mocks.intakeContext.mock.calls[0][2] as AbortSignal;
    const nextTrial = { ...trial, student_id: 5, enrollment_id: 80, session_id: 81 };
    mocks.student.mockResolvedValueOnce({ ...student, id: 5, student_name: 'Student Five' });
    view.rerender(<CreateEnrollmentModal isOpen onClose={vi.fn()} convertFromTrial={nextTrial} />);
    await screen.findByText('Student Five');
    expect(oldSignal.aborted).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Preview fees' }));
    expect(await screen.findByText('Reviewed intake')).toBeInTheDocument();
    await act(async () => finishOld({ student, source_fingerprint: 'late', trial: { enrollment_id: 70, session_id: 71 } }));
    expect(mocks.intake).toHaveBeenLastCalledWith(expect.objectContaining({ studentId: 5,
      trialEnrollmentId: 80, trialSessionId: 81, initialContext: expect.objectContaining({
        data: expect.objectContaining({ student: expect.objectContaining({ id: 5 }) }),
      }) }));
  });

  it('keeps the form visible and disabled until the next preview is prepared', async () => {
    let finish!: (value: unknown) => void;
    mocks.intakeContext.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<CreateEnrollmentModal isOpen onClose={vi.fn()} convertFromTrial={trial} />);
    await screen.findByText('Student Four');
    fireEvent.click(screen.getByRole('button', { name: 'Preview fees' }));
    expect(screen.getByLabelText('Location')).toBeVisible();
    expect(screen.getByLabelText('Location')).toBeDisabled();
    expect(screen.queryByText('Reviewed intake')).not.toBeInTheDocument();
    await act(async () => finish({ student, source_fingerprint: 'prepared', trial: { enrollment_id: 70, session_id: 71 } }));
    await screen.findByText('Reviewed intake');
    expect(mocks.intake).toHaveBeenLastCalledWith(expect.objectContaining({ initialContext: expect.objectContaining({ data: expect.objectContaining({ source_fingerprint: 'prepared' }) }) }));
  });

  it('keeps a failed preload on the form and lets the admin retry', async () => {
    mocks.intakeContext.mockRejectedValueOnce(new Error('Connection interrupted.'));
    render(<CreateEnrollmentModal isOpen onClose={vi.fn()} convertFromTrial={trial} />);
    await screen.findByText('Student Four');
    fireEvent.click(screen.getByRole('button', { name: 'Preview fees' }));
    await screen.findByText('Connection interrupted.');
    expect(screen.getByLabelText('Location')).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Preview fees' }));
    await screen.findByText('Reviewed intake');
  });

  it('keeps post-cutover trial conversion on the original six-session route while only collecting preferences', async () => {
    options.workflow_writes_available = false;
    render(<CreateEnrollmentModal isOpen onClose={vi.fn()} convertFromTrial={trial} />);
    await screen.findByText('Student Four');
    expect(screen.getByLabelText('Number of lessons')).toHaveValue(6);
    fireEvent.click(screen.getByRole('button', { name: 'Preview sessions' }));
    await screen.findByText('Session Preview');
    expect(mocks.preview).toHaveBeenCalledWith(expect.objectContaining({ student_id: 4, first_lesson_date: '2026-10-30', lessons_paid: 6, renewed_from_enrollment_id: 70 }));
    expect(mocks.intake).not.toHaveBeenCalled();
  });

  it('keeps the familiar conversion form and forwards the actual selected date and tutor into reviewed intake', async () => {
    render(<CreateEnrollmentModal isOpen onClose={vi.fn()} convertFromTrial={trial} />);
    await screen.findByText('Student Four');
    expect(screen.queryByLabelText('Number of lessons')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Discount')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/First lesson date/), { target: { value: '2026-11-13' } });
    fireEvent.change(screen.getByLabelText(/Tutor/), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview fees' }));
    expect(await screen.findByText('Reviewed intake')).toBeInTheDocument();
    expect(mocks.intake).toHaveBeenLastCalledWith(expect.objectContaining({ studentId: 4, trialEnrollmentId: 70, trialSessionId: 71,
      initialFirstLessonDate: '2026-11-13', initialIntakeSlots: [{ tutor_id: 12, renewed_from_enrollment_id: 70 }] }));
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('keeps pre-cutover conversion on the original session preview and six-session creation route', async () => {
    render(<CreateEnrollmentModal isOpen onClose={vi.fn()} convertFromTrial={{ ...trial, session_date: '2026-10-13' }} />);
    await screen.findByText('Student Four');
    expect(screen.getByLabelText('Number of lessons')).toHaveValue(6);
    fireEvent.click(screen.getByRole('button', { name: 'Preview sessions' }));
    await screen.findByText('Session Preview');
    expect(mocks.preview).toHaveBeenCalledWith(expect.objectContaining({ student_id: 4, first_lesson_date: '2026-10-20', lessons_paid: 6, renewed_from_enrollment_id: 70 }));
    expect(mocks.intake).not.toHaveBeenCalled();
  });

  it('preserves the actual trial time when it is outside the default timetable', async () => {
    render(<CreateEnrollmentModal isOpen onClose={vi.fn()} convertFromTrial={{ ...trial, time_slot: '16:00 - 17:30' }} />);
    await screen.findByText('Student Four');
    expect(screen.getByLabelText('Time slot')).toHaveValue('16:00 - 17:30');
    fireEvent.click(screen.getByRole('button', { name: 'Preview fees' }));
    await screen.findByText('Reviewed intake');
    expect(mocks.intake).toHaveBeenLastCalledWith(expect.objectContaining({ initialSlots: [{ weekday: 'Fri', time_slot: '16:00 - 17:30', location: 'MSA' }] }));
  });

  it('reports in-flight intake work so the parent conversion workspace can guard dismissal', async () => {
    const onBusyChange = vi.fn();
    render(<CreateEnrollmentModal isOpen onClose={vi.fn()} onBusyChange={onBusyChange} convertFromTrial={trial} />);
    await screen.findByText('Student Four');
    fireEvent.click(screen.getByRole('button', { name: 'Preview fees' }));
    await screen.findByText('Reviewed intake');
    act(() => mocks.intake.mock.lastCall![0].onBusyChange(true));
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('button', { name: 'Back to enrollment details' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    act(() => mocks.intake.mock.lastCall![0].onBusyChange(false));
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it('retains the managed-renewal redirect before considering a new intake', async () => {
    mocks.renewal.mockReturnValue({ student_id: 4, tutor_id: 9, assigned_day: 'Fri', assigned_time: trial.time_slot, location: 'MSA', suggested_first_lesson_date: '2026-11-13', previous_lessons_paid: 6, enrollment_type: 'Regular', billing_managed: true });
    render(<CreateEnrollmentModal isOpen onClose={vi.fn()} renewFromId={88} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole('link', { name: 'Open payment journey' })).toBeInTheDocument();
    expect(mocks.intake).not.toHaveBeenCalled();
  });

  it('keeps new Trial and One-Time enrollments on their existing route after the fee cutover', async () => {
    const view = render(<CreateEnrollmentModal isOpen onClose={vi.fn()} trialMode prefillStudent={student} prefillTutorId={9} />);
    await screen.findByText('Student Four');
    fireEvent.change(screen.getByLabelText(/First lesson date/), { target: { value: '2026-11-16' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview sessions' }));
    await screen.findByText('Session Preview');
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ enrollment_type: 'Trial', lessons_paid: 1 }));
    view.unmount();
    render(<CreateEnrollmentModal isOpen onClose={vi.fn()} prefillStudent={student} prefillTutorId={9} />);
    await screen.findByText('Student Four');
    fireEvent.click(screen.getByRole('button', { name: 'One-Time' }));
    fireEvent.change(screen.getByLabelText(/First lesson date/), { target: { value: '2026-11-16' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview sessions' }));
    await screen.findByText('Session Preview');
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ enrollment_type: 'One-Time', lessons_paid: 1 }));
    expect(mocks.intake).not.toHaveBeenCalled();
  });

  it('rejects a late trial-student response after switching conversion targets', async () => {
    let finish!: (value: Student) => void;
    mocks.student.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce({ ...student, id: 5, student_name: 'Student Five' });
    const view = render(<CreateEnrollmentModal isOpen onClose={vi.fn()} convertFromTrial={trial} />);
    view.rerender(<CreateEnrollmentModal isOpen onClose={vi.fn()} convertFromTrial={{ ...trial, student_id: 5, enrollment_id: 80, session_id: 81 }} />);
    await act(async () => { await Promise.resolve(); });
    expect(mocks.student.mock.calls).toEqual([[4], [5]]);
    await screen.findByText('Student Five');
    await act(async () => finish(student));
    expect(screen.queryByText('Student Four')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Preview fees' }));
    await screen.findByText('Reviewed intake');
    expect(mocks.intake).toHaveBeenLastCalledWith(expect.objectContaining({ studentId: 5, trialEnrollmentId: 80, trialSessionId: 81 }));
  });
});
