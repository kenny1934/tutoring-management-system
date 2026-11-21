'use client';

import { useId, useState } from 'react';
import { autoUpdate, flip, FloatingFocusManager, FloatingPortal, offset, shift, useClick, useDismiss, useFloating, useInteractions, useRole } from '@floating-ui/react';
import { CalendarRange, ChevronDown } from 'lucide-react';
import { Button, Field, Input, Label } from '@/components/controls';
import { formatShortDate } from '@/lib/formatters';

function dateAfter(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function RenewalExpiryFilter({ from, through, today, onChange }: {
  from: string; through: string; today?: string; onChange: (from: string, through: string) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(through);
  function changeOpen(next: boolean) {
    if (next) { setStart(from); setEnd(through); }
    setOpen(next);
  }
  const { refs, floatingStyles, context } = useFloating({
    open, onOpenChange: changeOpen, placement: 'bottom-start',
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })], whileElementsMounted: autoUpdate,
  });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'dialog' });
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role]);
  const label = from && through ? `${formatShortDate(from)} – ${formatShortDate(through)}`
    : from ? `From ${formatShortDate(from)}` : through ? `Through ${formatShortDate(through)}` : 'Any date';
  const invalid = !!(start && end && start > end);
  function apply(start: string, end: string) { onChange(start, end); setOpen(false); }
  const current = today || new Date().toLocaleDateString('en-CA');
  return <div>
    <Label htmlFor={`${id}-trigger`}>Expiry date</Label>
    <Button id={`${id}-trigger`} ref={refs.setReference} icon={CalendarRange} aria-label={`Expiry date: ${label}`} {...getReferenceProps()}>
      {label}<ChevronDown className="h-3.5 w-3.5 text-ink-subtle" aria-hidden="true" />
    </Button>
    {open && <FloatingPortal><FloatingFocusManager context={context} modal={false}>
      <div ref={refs.setFloating} style={{ ...floatingStyles, width: 'min(22rem, calc(100vw - 1rem))' }} {...getFloatingProps()} aria-labelledby={`${id}-title`} className="z-[60] space-y-4 rounded-lg border border-line bg-paper p-4 text-foreground shadow-lg">
        <div><h3 id={`${id}-title`} className="text-sm font-semibold">Expiry date range</h3><p className="mt-1 text-xs text-ink-subtle">Choose either date or both. Both dates are included.</p></div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => apply('', dateAfter(current, -1))}>Already expired</Button>
          <Button size="sm" onClick={() => apply(current, dateAfter(current, 6))}>Next 7 days</Button>
          <Button size="sm" onClick={() => {
            const monthStart = `${current.slice(0, 7)}-01`;
            const value = new Date(`${monthStart}T12:00:00Z`);
            value.setUTCMonth(value.getUTCMonth() + 1);
            apply(monthStart, dateAfter(value.toISOString().slice(0, 10), -1));
          }}>This month</Button>
        </div>
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (!invalid) apply(start, end); }}>
          <div className="flex gap-3">
            <Field label="Expires from" id={`${id}-from`} className="min-w-0 flex-1"><Input type="date" value={start} max={end || undefined} onChange={event => setStart(event.target.value)} /></Field>
            <Field label="Expires through" id={`${id}-through`} className="min-w-0 flex-1"><Input type="date" value={end} min={start || undefined} onChange={event => setEnd(event.target.value)} /></Field>
          </div>
          {invalid && <p role="alert" className="text-xs text-red-700 dark:text-red-300">Choose an end date on or after the start date.</p>}
          <div className="flex items-center justify-between gap-3 border-t border-line pt-3"><Button variant="quiet" size="sm" onClick={() => apply('', '')}>Clear dates</Button><Button type="submit" size="sm" variant="primary" disabled={invalid}>Apply range</Button></div>
        </form>
      </div>
    </FloatingFocusManager></FloatingPortal>}
  </div>;
}
