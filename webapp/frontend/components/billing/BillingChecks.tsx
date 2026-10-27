"use client";

import { AlertCircle, Info } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/controls';
import { formatShortDate } from '@/lib/formatters';
import type { BillingGapEvidence, BillingGapLesson } from '@/types/billing';
import { billingCheck, orderedBillingIssues } from '@/lib/billing-presentation';
import type { BillingIssue } from '@/lib/billing-presentation';

const GAP_LABELS: Record<BillingGapEvidence['kind'], string> = {
  within_enrollment: 'Between recorded sessions',
  between_enrollments: 'Between enrollments',
  recorded_unpaid: 'Unpaid session recorded',
  recorded_cancelled: 'Cancelled session recorded',
  timetable_difference: 'Other lesson dates nearby',
};

function displayedIssues(issues: BillingIssue[]) {
  const result: BillingIssue[] = [];
  const dateChecks = new Map<string, BillingIssue>();
  for (const issue of orderedBillingIssues(issues)) {
    const isDateCheck = issue.code === 'PAID_COVERAGE_GAP' || issue.code === 'CONDITIONAL_COVERAGE_GAP';
    if (!isDateCheck || !issue.gap_evidence?.length) { result.push(issue); continue; }
    const key = JSON.stringify([issue.period ?? null, issue.gap_evidence]);
    const existing = dateChecks.get(key);
    if (existing && existing.code !== issue.code) {
      // Both financial checks remain on the source. Show identical evidence once.
      existing.message = 'Check these dates against the enrollment records.';
      continue;
    }
    const displayed = { ...issue };
    result.push(displayed);
    dateChecks.set(key, displayed);
  }
  return result;
}

function GapLesson({ lesson, label }: { lesson: BillingGapLesson; label?: string }) {
  return <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
    {label && <span className="text-ink-subtle">{label}</span>}
    <span>{formatShortDate(lesson.date)}</span>
    <Link href={`/enrollments/${lesson.enrollment_id}`} className="text-accent-ink hover:underline">Enrollment #{lesson.enrollment_id}</Link>
    <span className="text-ink-subtle">{lesson.payment_status} · {lesson.status}</span>
  </div>;
}

function GapDates({ evidence }: { evidence: BillingGapEvidence[] }) {
  return <div className="mt-2 space-y-2" aria-label="Lesson dates to check">
    {evidence.map(gap => <div key={`${gap.enrollment_id}:${gap.date}:${gap.time_slot}:${gap.location}`} className="min-w-0 space-y-2 rounded border border-line bg-paper p-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="font-semibold">{formatShortDate(gap.date)}</span><span className="text-ink-subtle">{gap.weekday} {gap.time_slot} @ {gap.location}</span>{!gap.selected && <Badge>Other timetable</Badge>}</div>
      <p className="font-medium">{GAP_LABELS[gap.kind]}</p>
      {gap.before && <GapLesson lesson={gap.before} label="Previous recorded" />}
      {gap.matching_lessons.map(lesson => <GapLesson key={lesson.session_id} lesson={lesson} label="On this date" />)}
      {gap.after && <GapLesson lesson={gap.after} label="Next recorded" />}
      {gap.nearby_lessons.length > 0 && <div className="space-y-1 border-t border-line pt-2"><p className="text-ink-subtle">Other dates in these enrollments</p>{gap.nearby_lessons.map(lesson => <GapLesson key={lesson.session_id} lesson={lesson} />)}</div>}
    </div>)}
  </div>;
}

/** Short labels remain visible; complete explanations are available on demand. */
export function BillingChecks({ issues, compact = false, maxVisible = 2 }: {
  issues: BillingIssue[];
  compact?: boolean;
  maxVisible?: number;
}) {
  const ordered = displayedIssues(issues);
  if (!ordered.length) return null;
  const attention = ordered.filter(i => billingCheck(i.code).severity !== 'info');
  const visible = (compact ? attention : ordered).slice(0, maxVisible);
  const hidden = ordered.length - visible.length;
  return <details className="group/checks text-sm" aria-label={attention.length ? `${attention.length} payment checks` : 'Payment notes'}>
    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-1.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 [&::-webkit-details-marker]:hidden">
      {visible.map(issue => {
        const check = billingCheck(issue.code);
        return <Badge key={`${issue.code}:${issue.period ?? ''}:${issue.message}`} tone={check.severity === 'info' ? 'neutral' : 'warning'}>
          {check.severity !== 'info' && <AlertCircle className="h-3 w-3" aria-hidden="true" />}{check.label}
        </Badge>;
      })}
      {hidden > 0 && <span className="text-xs text-ink-subtle underline decoration-dotted underline-offset-2">{visible.length ? `+${hidden} ${hidden === 1 ? 'detail' : 'details'}` : `${hidden} ${attention.length ? (hidden === 1 ? 'check' : 'checks') : (hidden === 1 ? 'note' : 'notes')}`}</span>}
      {!hidden && <span className="text-xs text-ink-subtle underline decoration-dotted underline-offset-2">Details</span>}
    </summary>
    <ul className="mt-2 space-y-2 rounded-md border border-line bg-tint p-3">
      {ordered.map(issue => {
        const check = billingCheck(issue.code);
        const Icon = check.severity === 'info' ? Info : AlertCircle;
        return <li key={`${issue.code}:${issue.period ?? ''}:${issue.message}`} className="flex gap-2 text-xs leading-relaxed">
          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-subtle" aria-hidden="true" />
          <div className="min-w-0 flex-1"><span className="font-semibold">{check.label}{issue.period ? ` · Payment ${issue.period}` : ''}</span><p className="mt-0.5 text-ink-subtle">{issue.message}</p>{!!issue.gap_evidence?.length && <GapDates evidence={issue.gap_evidence} />}</div>
        </li>;
      })}
    </ul>
  </details>;
}
