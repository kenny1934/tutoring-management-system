import { Suspense } from 'react';
import { BillingAutopayEntry } from '@/components/billing/BillingAutopayRun';

export default function AutopayPage() {
  return <Suspense fallback={<p className="p-4 sm:p-6 xl:p-8">Loading autopay…</p>}><BillingAutopayEntry /></Suspense>;
}
