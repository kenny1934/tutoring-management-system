import { AlertTriangle, ArrowRight, CheckCircle2, PlusCircle } from 'lucide-react';
import type { ScheduleChangePreviewResponse } from '@/types';
import { formatShortDate } from '@/lib/formatters';

type Adjustment = NonNullable<ScheduleChangePreviewResponse['period_adjustment']>;

export function PeriodSchedulePreview({ adjustment, time, tutorName }: {
  adjustment: Adjustment;
  time: string;
  tutorName: string;
}) {
  const pending = adjustment.pending_sessions ?? [];
  const rows = [
    ...adjustment.moves.map(move => ({ key: `move-${move.session_id}`, date: move.from_date, target: move.date, originalTime: move.from_time_slot, time, kind: 'move' as const })),
    ...adjustment.added_dates.map(date => ({ key: `add-${date}`, date, target: date, originalTime: undefined, time, kind: 'add' as const })),
    ...pending.map(session => ({ key: `pending-${session.session_id}`, date: session.date, target: null, originalTime: session.time_slot, time: session.time_slot, kind: 'pending' as const })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));

  return <div className="space-y-3">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
      <p className="font-medium">{adjustment.additional_amount > 0
        ? `Additional tuition: MOP ${adjustment.additional_amount.toLocaleString('en-US')}`
        : 'No additional payment'}</p>
      {adjustment.additional_amount > 0 && <p className="text-xs text-foreground/60">{adjustment.original_payment_status === 'Paid' ? 'Enrollment becomes partially paid' : 'Added to the unpaid bill'}</p>}
    </div>
    <ul aria-label="Session changes" className="divide-y divide-line overflow-hidden rounded-lg border border-line">
      {rows.map(row => {
        const needsDate = row.kind === 'pending';
        const Icon = needsDate ? AlertTriangle : row.kind === 'add' ? PlusCircle : CheckCircle2;
        const tone = needsDate ? 'text-amber-700 dark:text-amber-400' : row.kind === 'add' ? 'text-blue-700 dark:text-blue-400' : 'text-green-700 dark:text-green-400';
        return <li key={row.key} className="space-y-2 p-3">
          <div className={`flex items-center gap-2 text-xs font-medium ${tone}`}>
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>{needsDate ? 'Needs rescheduling' : row.kind === 'add' ? 'Additional · Unpaid' : 'Moves'}</span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 text-xs sm:text-sm">
            <div><p className="text-[11px] text-foreground/50">{row.kind === 'add' ? 'Additional session' : 'Current'}</p><p className="font-medium">{formatShortDate(row.date)}</p>{row.originalTime && <p className="text-xs text-foreground/60">{row.originalTime}</p>}</div>
            {row.kind !== 'add' && <ArrowRight aria-hidden="true" className="mt-5 h-3 w-3 text-foreground/40" />}
            <div className={row.kind === 'add' ? 'col-span-2' : ''}><p className="text-[11px] text-foreground/50">{needsDate ? 'After change' : 'New'}</p><p className="font-medium">{row.target && row.kind !== 'add' ? formatShortDate(row.target) : needsDate ? 'Pending make-up' : row.time}</p>{!needsDate && <p className="text-xs text-foreground/60">{row.kind !== 'add' && <>{row.time}<br /></>}{tutorName}</p>}</div>
          </div>
        </li>;
      })}
    </ul>
    {adjustment.pending_session_ids.length > 0 && <p className="text-xs text-foreground/60">Fee and billing end unchanged.</p>}
    {pending.length !== adjustment.pending_session_ids.length && <p role="alert" className="text-xs text-amber-700 dark:text-amber-400">Reload the preview to see the dates needing rescheduling.</p>}
  </div>;
}
