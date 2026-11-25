import { useId } from 'react';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/controls';
import { formatShortDate } from '@/lib/formatters';
import { billingToday } from '@/lib/billing-clock';
import type { BillingPaymentDetail } from '@/types/billing';

export function billingPaymentStatus(detail: BillingPaymentDetail, today = billingToday()) {
  if ((detail.outstanding_supplement_amount ?? 0) > 0) return 'Partially paid';
  if (detail.status !== 'Pending Payment') return detail.status;
  const collection = detail.review.period.collection;
  const deadline = collection.method === 'manual' ? collection.due_before_lesson : collection.debit_to;
  const overdue = !!deadline && (collection.method === 'manual' ? deadline <= today : deadline < today);
  return overdue ? 'Overdue' : 'Unpaid';
}

export function BillingPaymentStatus({ detail }: { detail: BillingPaymentDetail }) {
  const status = billingPaymentStatus(detail);
  return <Badge tone={status === 'Paid' ? 'success' : status === 'Cancelled' ? 'neutral' : status === 'Overdue' ? 'danger' : 'warning'}>{status}</Badge>;
}

export function BillingPaymentMessageStatus({ detail, onOpen, expanded = false, controls, disabled = false }: { detail: BillingPaymentDetail; onOpen?: () => void; expanded?: boolean; controls?: string; disabled?: boolean }) {
  const statusId = useId();
  const status = detail.sent_at ? `Sent ${formatShortDate(detail.sent_at)} (${detail.sent_language === 'en' ? 'English' : '中文'})` : 'Not sent';
  if (onOpen) return <div aria-label="Fee message status">
    <button type="button" aria-label="Fee message" aria-describedby={statusId} aria-expanded={expanded} aria-controls={controls} disabled={disabled} onClick={onOpen}
      className="flex w-full items-center gap-3 rounded py-2 text-left text-xs transition-colors hover:bg-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
      <span className="text-ink-subtle">Fee message</span><span id={statusId} className="ml-auto min-w-0 text-right">{status}</span><ChevronRight aria-hidden="true" className={`h-4 w-4 shrink-0 text-ink-subtle ${expanded ? 'rotate-90' : ''}`} />
    </button>
  </div>;
  return <dl aria-label="Fee message status" className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
    <dt className="text-ink-subtle">Fee message</dt><dd className="text-right">{status}</dd>
  </dl>;
}
