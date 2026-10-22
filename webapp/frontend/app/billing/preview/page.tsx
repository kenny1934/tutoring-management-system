import { Suspense } from 'react';
import { BillingPreviewEntry } from '@/components/billing/BillingPreviewEntry';

export default function BillingPreviewPage() {
  return <Suspense fallback={<p className="p-6">Loading fee preview…</p>}><BillingPreviewEntry /></Suspense>;
}
