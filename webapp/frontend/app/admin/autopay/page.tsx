import { Suspense } from 'react';
import { BillingAutopayEntry } from '@/components/billing/BillingAutopayRun';

export default function AutopayPage() {
  return <Suspense fallback={<p className="p-6">Loading autopay…</p>}><BillingAutopayEntry /></Suspense>;
}
