import { mutate, type ScopedMutator } from 'swr';

const pendingRefreshes = new Map<ScopedMutator, Promise<unknown>>();

/** Refresh rows and shared counts without clearing the current view.
 * A successful action can notify both its panel and the containing page. Merge
 * those same-tick notifications, but allow later actions to start a fresh read.
 */
export function invalidateRenewalQueueCache(refresh: ScopedMutator = mutate) {
  const pending = pendingRefreshes.get(refresh);
  if (pending) return pending;
  const next = Promise.resolve().then(() => {
    pendingRefreshes.delete(refresh);
    return refresh(key => Array.isArray(key) && (
      key[0] === 'renewal-queue-counts' || key[0] === 'billing-renewal-queue'
    ));
  });
  pendingRefreshes.set(refresh, next);
  return next;
}
