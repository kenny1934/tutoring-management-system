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
