import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Enrollment } from '@/types';
import { Modal } from '@/components/ui/modal';
import { BillingCouponEnrollmentLink } from './BillingCouponEnrollmentLink';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), enrollment: vi.fn(), popover: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/lib/api', () => ({ enrollmentsAPI: { getById: mocks.enrollment } }));
vi.mock('./BillingDraftReview', () => ({ billingDraftAuthScope: (auth: { user?: { id: number }; effectiveRole: string; impersonatedTutor?: { id: number } }) => JSON.stringify([auth.user?.id, auth.effectiveRole, auth.impersonatedTutor?.id]) }));
vi.mock('@/components/enrollments/EnrollmentDetailPopover', () => ({ EnrollmentDetailPopover: (props: { enrollment: Enrollment; onClose: () => void; onStatusChange?: () => void; zIndex: number }) => {
  mocks.popover(props);
  const { onClose } = props;
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose]);
  return createPortal(<div role="dialog" aria-label="Enrollment details" style={{ zIndex: props.zIndex }}>
    Enrollment {props.enrollment.id}<button onClick={props.onClose}>Close enrollment</button><button onClick={props.onStatusChange}>Enrollment changed</button>
  </div>, document.body);
} }));

function record(values: Partial<Enrollment> = {}): Enrollment { return { id: 10, student_id: 4, tutor_id: 1, payment_status: 'Paid', lessons_paid: 6, first_lesson_date: '2026-10-24', ...values } as Enrollment; }
function Wrapper({ children }: { children: React.ReactNode }) { return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnFocus: false, shouldRetryOnError: false }}>{children}</SWRConfig>; }
beforeEach(() => {
  mocks.auth.mockReset().mockReturnValue({ user: { id: 1 }, effectiveRole: 'Admin', isAdmin: true, isLoading: false });
  mocks.enrollment.mockReset().mockResolvedValue(record()); mocks.popover.mockReset();
});

describe('coupon enrollment links', () => {
  it('reads only when clicked and opens the standard enrollment popover without navigating', async () => {
    render(<BillingCouponEnrollmentLink enrollmentId={10} studentId={4} />, { wrapper: Wrapper });
    const link = screen.getByRole('button', { name: 'Enrollment #10' });
    expect(mocks.enrollment).not.toHaveBeenCalled();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    fireEvent.click(link);
    await screen.findByRole('dialog', { name: 'Enrollment details' });
    expect(mocks.enrollment).toHaveBeenCalledWith(10);
    expect(mocks.popover).toHaveBeenLastCalledWith(expect.objectContaining({ enrollment: expect.objectContaining({ id: 10, student_id: 4 }), isOpen: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Close enrollment' }));
    await waitFor(() => expect(link).toHaveFocus());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('holds a pending read and rejects duplicate clicks', async () => {
    let finish!: (value: Enrollment) => void;
    mocks.enrollment.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<BillingCouponEnrollmentLink enrollmentId={10} studentId={4} />, { wrapper: Wrapper });
    const link = screen.getByRole('button', { name: 'Enrollment #10' });
    fireEvent.click(link);
    expect(screen.getByRole('status')).toHaveTextContent('Opening enrollment');
    expect(link).toBeDisabled(); fireEvent.click(link);
    expect(mocks.enrollment).toHaveBeenCalledTimes(1);
    await act(async () => finish(record()));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it.each([record({ id: 20 }), record({ student_id: 99 })])('withholds responses with a different owner or enrollment: %j', async response => {
    mocks.enrollment.mockResolvedValue(response);
    render(<BillingCouponEnrollmentLink enrollmentId={10} studentId={4} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Enrollment #10' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not open this enrollment.');
    expect(mocks.popover).not.toHaveBeenCalled();
  });

  it('offers a deliberate retry and opens current details after a failed read', async () => {
    mocks.enrollment.mockRejectedValueOnce(new Error('Read failed')).mockResolvedValueOnce(record());
    render(<BillingCouponEnrollmentLink enrollmentId={10} studentId={4} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Enrollment #10' }));
    const failure = await screen.findByRole('alert');
    fireEvent.click(within(failure).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(mocks.enrollment).toHaveBeenCalledTimes(2);
  });

  it('discards a late read after the enrollment changes and requires a fresh click', async () => {
    let finish!: (value: Enrollment) => void;
    mocks.enrollment.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = render(<BillingCouponEnrollmentLink enrollmentId={10} studentId={4} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Enrollment #10' }));
    view.rerender(<BillingCouponEnrollmentLink enrollmentId={20} studentId={5} />);
    await act(async () => finish(record()));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.popover).not.toHaveBeenCalled();
    mocks.enrollment.mockResolvedValueOnce(record({ id: 20, student_id: 5 }));
    fireEvent.click(screen.getByRole('button', { name: 'Enrollment #20' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Enrollment 20');
  });

  it('does not resurrect an open popover across an effective-role change', async () => {
    const view = render(<BillingCouponEnrollmentLink enrollmentId={10} studentId={4} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Enrollment #10' })); await screen.findByRole('dialog');
    mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Tutor', impersonatedTutor: { id: 2 } });
    view.rerender(<BillingCouponEnrollmentLink enrollmentId={10} studentId={4} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Admin', isAdmin: true });
    view.rerender(<BillingCouponEnrollmentLink enrollmentId={10} studentId={4} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps a nested parent modal open when Escape closes the enrollment popover', async () => {
    const closeParent = vi.fn();
    render(<Modal isOpen title="KMS coupons" onClose={closeParent}><BillingCouponEnrollmentLink enrollmentId={10} studentId={4} /></Modal>, { wrapper: Wrapper });
    const parent = await screen.findByRole('dialog', { name: 'KMS coupons' });
    fireEvent.click(within(parent).getByRole('button', { name: 'Enrollment #10' }));
    const child = await screen.findByRole('dialog', { name: 'Enrollment details' });
    expect(Number(child.style.zIndex)).toBeGreaterThan(9999);
    fireEvent.keyDown(child, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Enrollment details' })).not.toBeInTheDocument());
    expect(closeParent).not.toHaveBeenCalled();
    expect(parent).toBeInTheDocument();
  });

  it('closes on disable and leaves enrollment changes to the owning workflow', async () => {
    const changed = vi.fn();
    const view = render(<BillingCouponEnrollmentLink enrollmentId={10} studentId={4} onChanged={changed} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Enrollment #10' })); await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Enrollment changed' }));
    expect(changed).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Enrollment #10' })); await screen.findByRole('dialog');
    view.rerender(<BillingCouponEnrollmentLink enrollmentId={10} studentId={4} disabled />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enrollment #10' })).toBeDisabled();
  });
});
