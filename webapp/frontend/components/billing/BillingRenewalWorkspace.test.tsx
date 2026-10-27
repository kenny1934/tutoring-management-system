import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillingQueueRow } from '@/types/billing';
import { BillingRenewalWorkspace } from './BillingRenewalWorkspace';
import type { BillingRenewalAction } from './BillingRenewalPanel';

const mocks = vi.hoisted(() => ({ detail: vi.fn(), modal: vi.fn() }));
vi.mock('@/components/ui/modal', () => ({ Modal: (props: { children: React.ReactNode; persistent?: boolean }) => { mocks.modal(props); return <div role="dialog">{props.children}</div>; } }));
vi.mock('@/hooks/useOverlayLayer', () => ({ useOverlayLayer: () => ({ isTopmost: true, zIndex: 50 }) }));
vi.mock('./BillingDraftReview', () => ({ BillingDraftFocus: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/components/enrollments/EnrollmentDetailModal', () => ({ EnrollmentDetailModal: (props: { enrollmentId: number; onCreateBillingRenewal?: () => void; onOpenBillingPayment?: (id: string) => void }) => {
  mocks.detail(props);
  return <div aria-label="Current enrollment"><p>Enrollment {props.enrollmentId}</p>{props.onCreateBillingRenewal && <button onClick={props.onCreateBillingRenewal}>Renew</button>}<button onClick={() => props.onOpenBillingPayment?.('exact-payment')}>Open existing payment</button></div>;
} }));
vi.mock('./BillingRenewalPanel', () => ({ BillingRenewalPanel: ({ initialAction, onActionChange, onOpenEnrollment, onBusyChange }: { onBusyChange: (busy: boolean) => void; initialAction: BillingRenewalAction; onActionChange: (action: BillingRenewalAction) => void; onOpenEnrollment: (id: number) => void }) => <div aria-label="Renewal form"><p>{initialAction.kind === 'renew' ? 'Next enrollment' : initialAction.id}</p><button onClick={() => onActionChange({ kind: 'draft', id: 'saved-3' })}>Save reviewed draft</button><button onClick={() => onActionChange({ kind: 'payment', id: 'created-4' })}>Confirm reviewed enrollment</button><button onClick={() => onOpenEnrollment(22)}>View created enrollment</button><button onClick={() => onBusyChange(true)}>Start saving</button><button onClick={() => onBusyChange(false)}>Finish saving</button></div> }));

function row(): BillingQueueRow {
  const enrollment = { enrollment_id: 7, tutor_id: 2, tutor_name: 'Tutor A', weekday: 'Mon', time_slot: '16:45 - 18:15', location: 'MSA', first_lesson_date: '2026-09-07', effective_end_date: '2026-11-30', last_original_date: '2026-11-02', last_paid_original_date: '2026-11-02', payment_status: 'Paid', lesson_count: 6, sessions_remaining: 2, fee_message_marked_sent: true };
  return { key: 'student-4', student: { id: 4, student_name: 'Example Student', school_student_id: '004', home_location: 'MSA', grade: 'F1', is_staff_referral: false }, stage: 'prepare', origin: 'projection', payment_method: null, collection: null, first_lesson_date: null, coverage_through: null, lesson_count: null, total_fee: null, amount_basis: 'unknown', prepare_on: null, due_date: null, overdue: false, ready_now: true, draft_id: null, payment_id: null, enrollment_ids: [7, 8], payment_ids: [], issues: [], note: '', action_url: '/billing/students/4', current_enrollments: [enrollment, { ...enrollment, enrollment_id: 8, weekday: 'Thu' }] };
}
function show(value = row(), initialAction?: BillingRenewalAction) {
  return render(<BillingRenewalWorkspace row={value} initialAction={initialAction} trigger={createRef()} onClose={vi.fn()} onChanged={vi.fn()} />);
}
beforeEach(() => { Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 }); mocks.detail.mockReset(); });

describe('familiar renewal workspace', () => {
  it('opens a first-enrollment draft in one pane without an empty enrollment detail', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    const close = vi.fn();
    const first = { ...row(), origin: 'draft' as const, draft_id: 'first-draft', enrollment_ids: [], current_enrollments: [], action_url: '/billing/preview?student_id=4&draft_id=first-draft' };
    render(<BillingRenewalWorkspace row={first} trigger={createRef()} onClose={close} onChanged={vi.fn()} />);
    expect(screen.getByLabelText('Renewal form')).toHaveTextContent('first-draft');
    expect(screen.queryByText('No enrollment is available to open.')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(mocks.modal.mock.lastCall![0].title).toBe('New enrollment');
    expect(screen.getByRole('link', { name: 'Payment journey' })).toHaveAttribute('href', first.action_url);
    fireEvent.click(screen.getByRole('button', { name: 'Close renewal panel' }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('opens the existing detail first and expands the focused renewal beside it', () => {
    show();
    expect(screen.getByText('Enrollment 7')).toBeInTheDocument();
    expect(screen.queryByLabelText('Renewal form')).not.toBeInTheDocument();
    expect(mocks.detail).toHaveBeenLastCalledWith(expect.objectContaining({ standalone: false, compact: false, hideCloseButton: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Renew' }));
    expect(screen.getByLabelText('Renewal form')).toHaveTextContent('Next enrollment');
    expect(mocks.detail).toHaveBeenLastCalledWith(expect.objectContaining({ compact: true }));
    expect(screen.getByRole('link', { name: 'Payment journey' })).toHaveAttribute('href', '/billing/students/4');
  });

  it('keeps separate twice-weekly enrollment details and a single renewal panel', () => {
    show(row(), { kind: 'renew' });
    fireEvent.change(screen.getByLabelText('Enrollment details'), { target: { value: '8' } });
    expect(screen.getByText('Enrollment 8')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Renewal form')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'View created enrollment' }));
    expect(screen.getByText('Enrollment 22')).toBeInTheDocument();
  });

  it('updates the pane title after saving and removes Renew after confirmation', () => {
    show(row(), { kind: 'renew' });
    fireEvent.click(screen.getByRole('button', { name: 'Save reviewed draft' }));
    expect(screen.getByRole('heading', { name: 'Saved draft' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reviewed enrollment' }));
    expect(screen.getByRole('heading', { name: 'Payment' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Renew' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close renewal panel' }));
    expect(screen.queryByRole('button', { name: 'Renew' })).not.toBeInTheDocument();
  });

  it('does not offer another renewal for an actual unpaid or legacy task', () => {
    const view = show({ ...row(), origin: 'payment', stage: 'awaiting_payment', payment_id: 'pending-1' });
    expect(screen.queryByRole('button', { name: 'Renew' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open existing payment' }));
    expect(screen.getByLabelText('Renewal form')).toHaveTextContent('exact-payment');
    view.unmount();
    show({ ...row(), origin: 'legacy', stage: 'attention' });
    expect(screen.queryByRole('button', { name: 'Renew' })).not.toBeInTheDocument();
    expect(mocks.detail).toHaveBeenLastCalledWith(expect.objectContaining({ showRenewalActions: true }));
  });

  it('does not offer Renew after the teaching year is fully covered', () => {
    show({ ...row(), stage: 'no_payment', first_lesson_date: null });
    expect(screen.queryByRole('button', { name: 'Renew' })).not.toBeInTheDocument();
  });

  it('holds the workspace open while a mutation is in flight', () => {
    show(row(), { kind: 'renew' });
    fireEvent.click(screen.getByRole('button', { name: 'Start saving' }));
    expect(mocks.modal).toHaveBeenLastCalledWith(expect.objectContaining({ persistent: true }));
    expect(screen.getByRole('button', { name: 'Close renewal panel' })).toBeDisabled();
    expect(screen.getByLabelText('Enrollment details')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Open existing payment' }));
    expect(screen.getByLabelText('Renewal form')).toHaveTextContent('Next enrollment');
    fireEvent.click(screen.getByRole('button', { name: 'Finish saving' }));
    expect(screen.getByRole('button', { name: 'Close renewal panel' })).toBeEnabled();
  });

  it('uses Details and Create renewal tabs on a phone and preserves the other pane', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    show(row(), { kind: 'renew' });
    expect(screen.getByRole('tab', { name: 'Create renewal' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Enrollment 7')).not.toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: 'Details' }));
    expect(screen.getByText('Enrollment 7')).toBeVisible();
    expect(screen.getByLabelText('Renewal form')).not.toBeVisible();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Details' }), { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Create renewal' })).toHaveFocus();
    expect(within(screen.getByRole('tabpanel')).getByText('Next enrollment')).toBeVisible();
  });
});
