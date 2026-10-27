'use client';

import { useLayoutEffect, useState, type ReactNode } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/contexts/AuthContext';
import { billingAPI } from '@/lib/billing-api';
import { isBillingTestDate, setBillingTestDate } from '@/lib/billing-clock';
import { formatShortDate } from '@/lib/formatters';
import { Button } from '@/components/controls';

export function BillingTestBoundary({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV !== 'development' || process.env.NEXT_PUBLIC_BILLING_TEST_MODE !== '1') return <>{children}</>;
  return <TestCalendar>{children}</TestCalendar>;
}

function TestCalendar({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const scope = JSON.stringify([auth.user?.id, auth.effectiveRole, auth.isImpersonating, auth.impersonatedTutor?.id]);
  const options = useSWR(auth.user ? ['billing-test-calendar', scope] : null, billingAPI.options,
    { keepPreviousData: false, revalidateOnFocus: false });
  const date = options.data?.test_date;
  const valid = !options.error && !!date && isBillingTestDate(date) && options.data?.as_of === date;
  const [ready, setReady] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (!valid || !date) { setReady(null); setBillingTestDate(null); return; }
    setBillingTestDate(date);
    setReady(`${scope}:${date}`);
    return () => setBillingTestDate(null);
  }, [scope, date, valid]);
  if (!auth.user) return <>{children}</>;
  if (options.isLoading) return <p role="status" className="p-4 text-sm">Checking the billing test database…</p>;
  if (options.error || !valid || !date) return <div role="alert" className="space-y-3 p-4 text-sm"><p>The test app is not connected to its billing test database. Restart its backend before continuing.</p><Button onClick={() => window.location.reload()}>Check again</Button></div>;
  return <><div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"><span>Billing test data · Fee date: {formatShortDate(date)}</span><Button size="sm" onClick={() => window.location.reload()}>Reload test date</Button></div>{ready === `${scope}:${date}` && children}</>;
}
