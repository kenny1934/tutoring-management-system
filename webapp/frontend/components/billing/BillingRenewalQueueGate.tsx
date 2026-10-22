'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { mutate } from 'swr';
import { Button } from '@/components/controls';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from '@/contexts/LocationContext';
import { useBillingQueueCounts } from '@/lib/hooks/useBillingQueueCounts';
import { BillingRenewalQueue, type BillingQueueView } from './BillingRenewalQueue';

/** Keep the old tools available without mounting their requests behind the queue. */
export function BillingRenewalQueueGate({ renderLegacy }: { renderLegacy: (onBack?: () => void, taught?: boolean) => ReactNode }) {
  const auth = useAuth();
  const { selectedLocation } = useLocation();
  const router = useRouter();
  const params = useSearchParams();
  const [hash, setHash] = useState('');
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    update(); window.addEventListener('hashchange', update); window.addEventListener('popstate', update);
    return () => { window.removeEventListener('hashchange', update); window.removeEventListener('popstate', update); };
  }, []);
  const queue = useBillingQueueCounts({ enabled: !auth.isLoading, location: selectedLocation });
  const stageParam = params.get('stage');
  const stage: BillingQueueView = ['all', 'prepare', 'send', 'awaiting_payment', 'attention', 'no_payment'].includes(stageParam ?? '') ? stageParam as BillingQueueView : 'all';
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get('collection_month') ?? '') ? params.get('collection_month')! : '';
  const legacy = params.get('view') === 'legacy' || hash === '#taught';

  if (auth.isLoading) return <p className="p-6">Loading staff access…</p>;
  if (!auth.user || !auth.canViewAdminPages) return <p className="p-6">Admin access is required to review enrollment renewals.</p>;
  if (queue.available === false) return renderLegacy();
  if (queue.available === undefined) return queue.error
    ? <div role="alert" className="space-y-3 p-6"><p>Could not load enrollment renewals.</p><Button size="sm" onClick={() => mutate(key => Array.isArray(key) && key[0] === 'billing-queue-options')}>Retry</Button></div>
    : <p role="status" className="p-6">Loading enrollment renewals…</p>;
  if (legacy) return renderLegacy(() => { setHash(''); router.push('/admin/renewals'); }, hash === '#taught');
  return <BillingRenewalQueue key={`${stage}:${month}`} initialStage={stage} initialCollectionMonth={month}
    onShowLegacy={() => { setHash(''); router.push('/admin/renewals?view=legacy'); }}
    onShowTaught={() => { setHash('#taught'); router.push('/admin/renewals#taught'); }} />;
}
