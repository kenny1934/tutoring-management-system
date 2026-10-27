import { mutate } from 'swr';

/** Refresh the central worklist and the counts shared by all reminder surfaces. */
export function invalidateRenewalQueueCache() {
  return mutate(key => Array.isArray(key) && (
    key[0] === 'renewal-queue-counts' || key[0] === 'billing-renewal-queue'
  ), undefined, { revalidate: true });
}
