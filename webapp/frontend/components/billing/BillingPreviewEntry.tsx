'use client';

import { useSearchParams } from 'next/navigation';
import { PageSurface } from '@/components/layout/PageSurface';
import { PageHeader } from '@/components/controls';
import { Calculator } from 'lucide-react';
import { BillingEnrollmentIntake } from './BillingEnrollmentIntake';
import { BillingPreview } from './BillingPreview';

function positiveId(value: string | null): number | undefined {
  return value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : undefined;
}

export function BillingPreviewEntry() {
  const params = useSearchParams();
  const student = positiveId(params.get('student_id'));
  if (!params.has('student_id')) return <BillingPreview />;
  const enrollment = positiveId(params.get('trial_enrollment_id'));
  const session = positiveId(params.get('trial_session_id'));
  const malformed = !student || params.has('trial_enrollment_id') !== params.has('trial_session_id')
    || (params.has('trial_enrollment_id') && (!enrollment || !session));
  return <PageSurface><div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
    <PageHeader title="Enrollment fee preview" icon={Calculator} backHref="/trials" backLabel="Back to trials" />
    {malformed ? <p role="alert" className="text-sm">This enrollment link is incomplete. Open the student’s trial again.</p> : <BillingEnrollmentIntake
      studentId={student!} trialEnrollmentId={enrollment} trialSessionId={session} initialDraftId={params.get('draft_id') || undefined} />}
  </div></PageSurface>;
}
