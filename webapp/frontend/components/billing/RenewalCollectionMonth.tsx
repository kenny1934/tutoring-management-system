'use client';

import { CalendarRange } from 'lucide-react';
import { Input } from '@/components/controls';
import { cn } from '@/lib/utils';

export function RenewalCollectionMonth({ id, value, onChange, showLabel = false, grouped = false }: {
  id: string; value: string; onChange: (value: string) => void; showLabel?: boolean; grouped?: boolean;
}) {
  const label = /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
    ? new Date(`${value}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    : 'Month';
  return <div className="flex shrink-0 items-center gap-2">
    {showLabel && <label htmlFor={id} className="text-xs text-ink-subtle">Collection</label>}
    <div className={cn("relative inline-flex h-7 w-28 items-center justify-center gap-1.5 rounded border border-field bg-field-fill px-2 text-xs text-foreground focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25", grouped && "rounded-r-none border-transparent bg-transparent")}>
      <CalendarRange className="pointer-events-none h-3.5 w-3.5 shrink-0 text-ink-subtle" aria-hidden="true" />
      <span aria-hidden="true" className="pointer-events-none whitespace-nowrap">{label}</span>
      {/* Keep the native picker and keyboard behaviour, with a predictable
          abbreviated display that fits the mobile header. */}
      <Input id={id} aria-label="Collection month" type="month" size="sm" value={value} onChange={event => onChange(event.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0" onClick={event => {
          try { event.currentTarget.showPicker?.(); } catch { /* The input retains its native picker fallback. */ }
        }} />
    </div>
  </div>;
}
