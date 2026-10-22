"use client";

import { useParams } from 'next/navigation';
import { Suspense } from 'react';
import { StudentBillingJourney } from '@/components/billing/StudentBillingJourney';

export default function StudentBillingJourneyPage() {
  const params = useParams<{ id: string }>();
  return <Suspense fallback={<p className="p-6">Loading payment journey…</p>}><StudentBillingJourney studentId={Number(params.id)} /></Suspense>;
}
