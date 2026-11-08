'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { CreditCard } from 'lucide-react';
import { Button, buttonClasses } from '@/components/controls';
import { BillingPaymentSettings } from '@/components/billing/BillingPaymentSettings';
import { billingDraftAuthScope, billingDraftTutorId } from '@/components/billing/BillingDraftReview';
import { useAuth } from '@/contexts/AuthContext';
import { billingAPI } from '@/lib/billing-api';
import { cn } from '@/lib/utils';

export function StudentPaymentPlan({ studentId, isMobile }: { studentId: number; isMobile: boolean }) {
  const auth = useAuth();
  const enabled = !!auth.user && !auth.isGuest;
  const options = useSWR(enabled ? 'billing-preview-options' : null, billingAPI.options);
  const scope = `${studentId}:${billingDraftAuthScope(auth)}`;
  const preferences = useSWR(enabled && options.data?.workflow_available ? ['billing-preferences', scope] : null,
    () => billingAPI.preferences(studentId, billingDraftTutorId(auth)), { keepPreviousData: false });
  const saved = preferences.data?.student_id === studentId ? preferences.data : null;
  if (!enabled) return null;
  const error = options.error || preferences.error;
  const loading = !options.data || (!!options.data.workflow_available && !saved);

  return <section aria-label="Student payment plan" className={cn('rounded-lg border border-line bg-raised p-4 md:col-span-2', !isMobile && 'paper-texture')}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-600 dark:text-gray-400"><CreditCard className="h-4 w-4" aria-hidden="true" />Payment plan</h3>
      <Link href={`/billing/students/${studentId}`} className={buttonClasses({ size: 'sm', variant: 'secondary' })}>Payment journey</Link>
    </div>
    {error ? <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-ink-subtle"><span>Could not load payment plan.</span><Button size="sm" variant="quiet" onClick={() => { if (options.error) void options.mutate(); else void preferences.mutate(); }}>Retry</Button></div>
      : loading ? <p role="status" className="text-sm text-ink-subtle">Loading payment plan…</p>
      : !options.data?.workflow_available ? <p className="text-sm text-ink-subtle">Payment settings are unavailable.</p>
      : saved && <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-3"><span className="text-ink-subtle">Payment method</span><BillingPaymentSettings studentId={studentId} presentation="badge" storageAvailable canWrite={!!options.data.preferences_writes_available}
          recordedMethod={saved.payment_method} mandateReady={saved.mandate_ready} onSaved={value => { void preferences.mutate(value, false); }} /></div>
        {saved.payment_method === 'autopay' && <BillingPaymentSettings studentId={studentId} presentation="authorisation" storageAvailable canWrite={!!options.data.preferences_writes_available}
          recordedMethod={saved.payment_method} mandateReady={saved.mandate_ready} onSaved={value => { void preferences.mutate(value, false); }} />}
      </div>}
  </section>;
}
