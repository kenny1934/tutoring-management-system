import { cn } from '@/lib/utils';

export function SkeletonBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={cn('rounded bg-tint animate-pulse motion-reduce:animate-none', className)} />;
}

export function SkeletonFieldRows({ count = 4 }: { count?: number }) {
  return <div aria-hidden="true" className="space-y-3">{Array.from({ length: count }, (_, index) =>
    <div key={index} className="flex min-w-0 items-center justify-between gap-3">
      <SkeletonBlock className="h-3 w-20 shrink-0" />
      <SkeletonBlock className="h-4 w-2/5" />
    </div>
  )}</div>;
}
