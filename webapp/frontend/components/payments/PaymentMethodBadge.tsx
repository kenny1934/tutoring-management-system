import { CircleHelp, HandCoins, Landmark } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BillingMethod } from '@/types/billing';

/** Method identity stays separate from payment status and collection cadence. */
export function PaymentMethodBadge({ method, size = 'sm', className }: {
  method: BillingMethod | null;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const Icon = method === 'autopay' ? Landmark : method === 'manual' ? HandCoins : CircleHelp;
  return <span className={cn(
    'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded border font-semibold',
    size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1 text-xs',
    method === 'autopay'
      ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800/60 dark:bg-blue-900/30 dark:text-blue-300'
      : method === 'manual' ? 'border-line bg-tint text-accent-ink'
        : 'border-line bg-paper text-ink-subtle',
    className,
  )}><Icon className="h-3.5 w-3.5" aria-hidden="true" />{method === 'autopay' ? 'Autopay' : method === 'manual' ? 'Manual' : 'Not set'}</span>;
}
