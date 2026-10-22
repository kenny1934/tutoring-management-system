import Link from 'next/link';
import { CreditCard } from 'lucide-react';
import { buttonClasses } from '@/components/controls';
import { billingPaymentHref } from '@/lib/billing-workflow';
import { PaymentMethodBadge } from '@/components/payments/PaymentMethodBadge';
import type { BillingMethod } from '@/types/billing';

export function BillingWorkflowLink({ studentId, paymentId, method, onClick }: { studentId: number; paymentId?: string | null; method?: BillingMethod | null; onClick?: () => void }) {
  return <span className="inline-flex flex-wrap items-center gap-2">
    {paymentId && method && <PaymentMethodBadge method={method} />}
    <Link href={billingPaymentHref(studentId, paymentId)} onClick={event => { event.stopPropagation(); onClick?.(); }} className={buttonClasses({ size: 'sm' })}><CreditCard className="h-4 w-4" aria-hidden="true" />{paymentId ? 'Open payment' : 'Review next enrollment'}</Link>
  </span>;
}
