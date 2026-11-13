import Link from 'next/link';
import type { BillingRecordEvidence } from '@/types/billing';
import { formatProposalDate } from '@/lib/formatters';
import { BillingCouponEnrollmentLink } from './BillingCouponEnrollmentLink';

/** Keep the affected records close to the warning so admins can inspect them. */
export function BillingIssueRecords({ records, studentId }: { records?: BillingRecordEvidence[]; studentId?: number }) {
  const seen = new Set<string>();
  const unique = records?.filter(record => { const key = JSON.stringify(record); if (seen.has(key)) return false; seen.add(key); return true; }) ?? [];
  if (!unique.length) return null;
  return <ul aria-label="Related session records" className="space-y-2 text-xs">
    {unique.map((record, index) => <li key={index} className="min-w-0 break-words space-y-0.5 border-l-2 border-line pl-2">
      {(record.date || record.time_slot || record.location) && <p>{[record.date && formatProposalDate(record.date), record.time_slot, record.location && `@ ${record.location}`].filter(Boolean).join(' ')}</p>}
      {(record.expected_weekday || record.expected_time_slot || record.expected_location) && <p className="text-ink-subtle">Enrollment: {[record.expected_weekday, record.expected_time_slot, record.expected_location && `@ ${record.expected_location}`].filter(Boolean).join(' ')}</p>}
      {record.note && <p className="text-ink-subtle">{record.note}</p>}
      {record.enrollment_id && (studentId ? <BillingCouponEnrollmentLink enrollmentId={record.enrollment_id} studentId={studentId} /> : <Link href={`/enrollments/${record.enrollment_id}`} target="_blank" rel="noopener noreferrer" className="text-accent-ink underline underline-offset-2">Enrollment #{record.enrollment_id}</Link>)}
    </li>)}
  </ul>;
}
