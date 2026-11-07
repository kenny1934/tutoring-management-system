import { act, renderHook, waitFor } from '@testing-library/react';
import useSWR from 'swr';
import { describe, expect, it, vi } from 'vitest';
import { invalidateRenewalQueueCache } from './renewal-queue';
import { invalidateCaches } from './hooks';

describe('renewal worklist refresh', () => {
  it('refreshes the worklist and shared count once without refetching unrelated data', async () => {
    const list = vi.fn().mockResolvedValue('before');
    const counts = vi.fn().mockResolvedValue(5);
    const unrelated = vi.fn().mockResolvedValue('keep');
    const { result } = renderHook(() => ({
      list: useSWR(['billing-renewal-queue', 'refresh-check'], list),
      counts: useSWR(['renewal-queue-counts', 'refresh-check'], counts),
      unrelated: useSWR(['synthetic-unrelated', 'refresh-check'], unrelated),
    }));
    await waitFor(() => expect(result.current.counts.data).toBe(5));
    list.mockResolvedValue('after');
    counts.mockResolvedValue(0);
    await act(async () => { await invalidateRenewalQueueCache(); });
    await waitFor(() => expect(result.current.counts.data).toBe(0));
    expect(result.current.list.data).toBe('after');
    expect(list).toHaveBeenCalledTimes(2);
    expect(counts).toHaveBeenCalledTimes(2);
    expect(unrelated).toHaveBeenCalledTimes(1);
  });

  it.each(['enrollments', 'sessions', 'students'] as const)('refreshes reminders once after %s change', async type => {
    const list = vi.fn().mockResolvedValue(1);
    const counts = vi.fn().mockResolvedValue(1);
    const { result } = renderHook(() => ({
      list: useSWR(['billing-renewal-queue', type], list),
      counts: useSWR(['renewal-queue-counts', type], counts),
    }));
    await waitFor(() => expect(result.current.counts.data).toBe(1));
    list.mockResolvedValue(2);
    counts.mockResolvedValue(2);
    await act(async () => { invalidateCaches(type); });
    await waitFor(() => expect(result.current.counts.data).toBe(2));
    expect(result.current.list.data).toBe(2);
    expect(list).toHaveBeenCalledTimes(2);
    expect(counts).toHaveBeenCalledTimes(2);
  });
});

it('keeps scoped rows and counts mounted throughout an action invalidation', async () => {
  let finishList!: (value: string) => void;
  let finishCounts!: (value: number) => void;
  const list = vi.fn().mockResolvedValueOnce('retained');
  const counts = vi.fn().mockResolvedValueOnce(8);
  const { result } = renderHook(() => ({
    list: useSWR(['billing-renewal-queue', 'deferred-action'], list),
    counts: useSWR(['renewal-queue-counts', 'deferred-action'], counts),
  }));
  await waitFor(() => expect(result.current.list.data).toBe('retained'));
  list.mockImplementationOnce(() => new Promise<string>(resolve => { finishList = resolve; }));
  counts.mockImplementationOnce(() => new Promise<number>(resolve => { finishCounts = resolve; }));
  let refreshed!: Promise<unknown>;
  act(() => { refreshed = invalidateRenewalQueueCache(); });
  await waitFor(() => expect(finishList).toBeTypeOf('function'));
  expect(result.current.list.data).toBe('retained');
  expect(result.current.list.isLoading).toBe(false);
  expect(result.current.counts.data).toBe(8);
  expect(result.current.counts.isLoading).toBe(false);
  await act(async () => { finishList('updated'); finishCounts(7); await refreshed; });
  expect(result.current.list.data).toBe('updated');
  expect(result.current.counts.data).toBe(7);
});

it('coalesces duplicate action callbacks in one tick but rechecks after a later action', async () => {
  const list = vi.fn().mockResolvedValue(1);
  const { result } = renderHook(() => useSWR(['billing-renewal-queue', 'duplicate-notices'], list));
  await waitFor(() => expect(result.current.data).toBe(1));
  await act(async () => { await Promise.all([invalidateRenewalQueueCache(), invalidateRenewalQueueCache()]); });
  expect(list).toHaveBeenCalledTimes(2);
  await act(async () => { await invalidateRenewalQueueCache(); });
  expect(list).toHaveBeenCalledTimes(3);
});
