'use client';

import useSWR from 'swr';
import { useAuth } from '@/contexts/AuthContext';
import { billingAPI } from '@/lib/billing-api';
import { useVisibilityAwareInterval } from '@/lib/hooks';
import type { BillingOptions, BillingQueueCounts } from '@/types/billing';

export { invalidateRenewalQueueCache } from '@/lib/renewal-queue';

/** The sidebar and every bell share this scoped cache and one visible-tab poll. */
export function useBillingQueueCounts({ enabled = true, location, tutorId }: {
  enabled?: boolean; location?: string; tutorId?: number;
} = {}) {
  const auth = useAuth();
  const allowed = enabled && !!auth.user && auth.canViewAdminPages;
  const scope = JSON.stringify([auth.user?.id, auth.effectiveRole, auth.isImpersonating, auth.impersonatedTutor?.id]);
  const branch = location && location !== 'All Locations' ? location : undefined;
  const refreshInterval = useVisibilityAwareInterval(60000);
  const options = useSWR<BillingOptions>(
    allowed ? ['billing-queue-options', scope] : null,
    billingAPI.options,
    { refreshInterval, revalidateOnFocus: false, keepPreviousData: false },
  );
  // Unknown availability is not an instruction to restore legacy reminders.
  const available = allowed && !options.error ? options.data?.queue_available : undefined;
  const counts = useSWR<BillingQueueCounts>(
    available ? ['renewal-queue-counts', scope, branch ?? 'all', tutorId ?? 'all'] : null,
    () => billingAPI.queueCounts({ location: branch, tutor_id: tutorId }),
    { refreshInterval, revalidateOnFocus: false, keepPreviousData: false },
  );
  return {
    available,
    data: available && !counts.error ? counts.data : undefined,
    error: options.error ?? counts.error,
    isLoading: allowed && (options.isLoading || (available === true && counts.isLoading)),
  };
}
