'use client';

import useSWR from 'swr';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAPI } from '@/lib/api';
import { billingDraftAuthScope, billingDraftTutorId } from '@/components/billing/BillingDraftReview';
import type { MakeupEligibility, Session } from '@/types';

export function useMakeupEligibility(session: Pick<Session, 'id' | 'makeup_eligibility'>, enabled: boolean, targetDate?: string) {
  const auth = useAuth();
  const scope = billingDraftAuthScope(auth);
  const tutorId = billingDraftTutorId(auth);
  const evidence = JSON.stringify(session.makeup_eligibility ?? null);
  const result = useSWR(enabled && auth.user && !auth.isGuest ? ['makeup-eligibility', scope, session.id, targetDate || '', evidence] : null,
    () => fetchAPI<{ as_of: string; eligibility: Record<string, MakeupEligibility> }>(`/makeup/eligibility?${new URLSearchParams({ session_ids: String(session.id), ...(targetDate ? { target_date: targetDate } : {}), ...(tutorId ? { tutor_id: String(tutorId) } : {}) })}`),
    { keepPreviousData: false });
  const current = result.data ? result.data.eligibility[String(session.id)] ?? null : session.makeup_eligibility ?? null;
  const eligibility = current && (result.error || result.isLoading || result.isValidating) ? { ...current, can_book: false, status: 'needs_review' as const,
    reason: result.error ? 'Could not check makeup eligibility. Retry before booking.' : 'Checking makeup eligibility…' } : current;
  return { eligibility, error: result.error, retry: result.mutate };
}
