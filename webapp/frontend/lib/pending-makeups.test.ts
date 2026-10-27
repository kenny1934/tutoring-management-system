import { describe, expect, it, vi } from 'vitest';
import { loadPendingMakeups } from './pending-makeups';
import type { Session } from '@/types';

describe('pending makeup pagination', () => {
  it('loads every pending page and preserves the selected history and staff scope', async () => {
    const page = Array.from({ length: 500 }, (_, index) => ({ id: index + 1 }) as Session);
    const fetch = vi.fn().mockResolvedValueOnce(page).mockResolvedValueOnce([{ id: 501 }]);
    const result = await loadPendingMakeups({ pending_makeups: true, include_history: true, tutor_id: 8, location: 'MSA' }, fetch);
    expect(result).toHaveLength(501);
    expect(fetch).toHaveBeenNthCalledWith(2, expect.objectContaining({ offset: 500, limit: 500, include_history: true, tutor_id: 8, location: 'MSA' }));
  });
  it('stops an offset-ignoring server response instead of looping indefinitely', async () => {
    const page = Array.from({ length: 500 }, (_, index) => ({ id: index + 1 }) as Session);
    const fetch = vi.fn().mockResolvedValue(page);
    await expect(loadPendingMakeups({ pending_makeups: true }, fetch)).rejects.toThrow('next page');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('does not return a partial list when a later page fails', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Array.from({ length: 500 }, (_, index) => ({ id: index + 1 }))).mockRejectedValueOnce(new Error('Request failed.'));
    await expect(loadPendingMakeups({ pending_makeups: true }, fetch)).rejects.toThrow('Request failed.');
  });
});
