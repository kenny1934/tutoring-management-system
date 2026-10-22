'use client';

import { Badge } from '@/components/controls';
import { formatShortDate } from '@/lib/formatters';
import { isAdvanceMakeup, makeupBookingIssue } from '@/lib/makeup-eligibility';
import type { MakeupEligibility } from '@/types';

const labels: Record<MakeupEligibility['status'], string> = {
  available: 'Makeup available', payment_required: 'Payment required', paused: 'Paused', left: 'Left', expired: 'Makeup expired', needs_review: 'Check makeup',
};

export function MakeupEligibilityNotice({ eligibility, targetDate, compact = false }: { eligibility?: MakeupEligibility | null; targetDate?: string; compact?: boolean }) {
  if (!eligibility) return null;
  const issue = makeupBookingIssue(eligibility, targetDate);
  const advance = isAdvanceMakeup(eligibility, targetDate);
  return <div aria-label="Makeup eligibility" className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-xs ${compact ? '' : 'rounded border border-line bg-wash p-3'}`}>
    <Badge tone={issue ? 'warning' : 'neutral'}>{issue && eligibility.status === 'available' ? 'Cannot book this date' : labels[eligibility.status]}</Badge>
    {eligibility.valid_until && <span>Valid through {formatShortDate(eligibility.valid_until)}</span>}
    {issue && <span className="text-amber-800 dark:text-amber-300">{issue}</span>}
    {!issue && advance && <span className="text-amber-800 dark:text-amber-300">Check payment before this lesson.</span>}
  </div>;
}
