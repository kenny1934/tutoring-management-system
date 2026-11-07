import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillingRenewalCreator } from '@/lib/billing-renewal-create';
import type { BillingDraftReview, BillingDraftReviewRequest, BillingPaymentDetail } from '@/types/billing';
import { BillingRenewalCreate } from './BillingRenewalCreate';

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));

type Props = ComponentProps<typeof BillingRenewalCreate>;
const review = {
  review_hash: 'review-1', message: { blocked_reasons: [] },
  period: { total_fee: 1200, counts_by_slot: [6] },
} as unknown as BillingDraftReview;
const request = { scenario: { payment_method: 'manual' } } as BillingDraftReviewRequest;
const payment = { id: 'payment-1' } as BillingPaymentDetail;

function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function setup(overrides: Partial<Props> = {}) {
  const create = vi.fn().mockResolvedValue(payment);
  const props: Props = {
    creator: { create } as unknown as BillingRenewalCreator,
    authScope: 'admin-1', studentId: 4, review, request, note: 'Adjusted dates',
    canWrite: true, storageAvailable: true, onCreated: vi.fn(), onStale: vi.fn(), onBusyChange: vi.fn(),
    ...overrides,
  };
  return { create, props, ...render(<BillingRenewalCreate {...props} />) };
}

beforeEach(() => {
  mocks.auth.mockReset();
  mocks.auth.mockReturnValue({ isAdmin: true, isReadOnly: false });
});

describe('direct renewal creation', () => {
  it('creates the reviewed enrollment directly with the exact snapshot and revision target', async () => {
    const revisionTarget = { id: 'draft-1', current_revision: 2 };
    const { create, props } = setup({ revisionTarget });
    fireEvent.click(screen.getByRole('button', { name: 'Create enrollment' }));
    expect(create).toHaveBeenCalledExactlyOnceWith({
      scope: props.authScope, studentId: 4, request, review, note: props.note, revisionTarget,
    }, expect.any(AbortSignal));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledExactlyOnceWith(payment));
  });

  it('uses a plural action when the review covers multiple teaching slots', () => {
    setup({ review: { ...review, period: { ...review.period, counts_by_slot: [4, 4] } } });
    expect(screen.getByRole('button', { name: 'Create enrollments' })).toBeEnabled();
  });

  it('prevents repeated clicks while creating and reports the busy lifecycle', async () => {
    const result = pending<BillingPaymentDetail>();
    const { create, props } = setup(); create.mockReturnValue(result.promise);
    const button = screen.getByRole('button', { name: 'Create enrollment' });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(create).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(props.onBusyChange).toHaveBeenLastCalledWith(true);
    expect(props.onCreated).not.toHaveBeenCalled();
    await act(async () => result.resolve(payment));
    expect(props.onCreated).toHaveBeenCalledExactlyOnceWith(payment);
    expect(props.onBusyChange).toHaveBeenLastCalledWith(false);
    expect(button).toBeEnabled();
  });

  it.each([
    { error: new Error('Connection interrupted'), message: 'Connection interrupted', stale: false },
    { error: Object.assign(new Error('Review changed'), { status: 409 }), message: 'Review changed', stale: true },
    { error: null, message: 'Could not create the enrollment. Try again.', stale: false },
  ])('keeps a failed attempt retryable: $message', async ({ error, message, stale }) => {
    const { create, props } = setup(); create.mockRejectedValueOnce(error);
    fireEvent.click(screen.getByRole('button', { name: 'Create enrollment' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(props.onCreated).not.toHaveBeenCalled();
    expect(props.onStale).toHaveBeenCalledTimes(stale ? 1 : 0);
    expect(props.onBusyChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: 'Create enrollment' }));
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledExactlyOnceWith(payment));
    expect(create).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    { name: 'student', change: { studentId: 5 } },
    { name: 'auth scope', change: { authScope: 'admin-2' } },
    { name: 'reviewed input', change: { note: 'Different adjustment' } },
  ])('aborts on $name change and ignores a late success', async ({ change }) => {
    const result = pending<BillingPaymentDetail>();
    const { create, props, rerender } = setup(); create.mockReturnValue(result.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Create enrollment' }));
    const signal = create.mock.calls[0][1] as AbortSignal;
    rerender(<BillingRenewalCreate {...props} {...change} />);
    expect(signal.aborted).toBe(true);
    expect(props.onBusyChange).toHaveBeenLastCalledWith(false);
    await act(async () => result.resolve(payment));
    expect(props.onCreated).not.toHaveBeenCalled();
    expect(props.onStale).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('suppresses a late conflict after changing student', async () => {
    const result = pending<BillingPaymentDetail>();
    const { create, props, rerender } = setup(); create.mockReturnValue(result.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Create enrollment' }));
    rerender(<BillingRenewalCreate {...props} studentId={5} />);
    await act(async () => result.reject(Object.assign(new Error('Old conflict'), { status: 409 })));
    expect(props.onStale).not.toHaveBeenCalled();
    expect(props.onCreated).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('aborts on unmount and releases its busy callback', async () => {
    const result = pending<BillingPaymentDetail>();
    const { create, props, unmount } = setup(); create.mockReturnValue(result.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Create enrollment' }));
    const signal = create.mock.calls[0][1] as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    expect(props.onBusyChange).toHaveBeenLastCalledWith(false);
    await act(async () => result.resolve(payment));
    expect(props.onCreated).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'non-admin', auth: { isAdmin: false, isReadOnly: false } },
    { name: 'read-only admin', auth: { isAdmin: true, isReadOnly: true } },
  ])('hides creation for a $name', ({ auth }) => {
    mocks.auth.mockReturnValue(auth);
    const { create } = setup();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'no review', change: { review: null } },
    { name: 'blocked review', change: { review: { ...review, message: { ...review.message, blocked_reasons: ['Check dates'] } } } },
    { name: 'unknown fee', change: { review: { ...review, period: { ...review.period, total_fee: null } } } },
    { name: 'disabled writes', change: { canWrite: false } },
    { name: 'missing storage', change: { storageAvailable: false } },
  ] satisfies { name: string; change: Partial<Props> }[])('prevents creation with $name', ({ change }) => {
    const { create } = setup(change);
    const button = screen.getByRole('button', { name: 'Create enrollment' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(create).not.toHaveBeenCalled();
  });
});
