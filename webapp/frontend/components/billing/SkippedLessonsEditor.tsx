'use client';

import { Plus } from 'lucide-react';
import { Button, Input, Textarea } from '@/components/controls';
import type { BillingSlot } from '@/types/billing';

export function SkippedLessonsEditor({ slots, onChange, disabled, from, through }: {
  slots: BillingSlot[];
  onChange: (index: number, change: Partial<BillingSlot>) => void;
  disabled: boolean;
  from: string;
  through?: string;
}) {
  return <details className="rounded-md border border-line p-3">
    <summary className="cursor-pointer text-sm font-medium">Skip lesson dates</summary>
    <p className="mt-2 text-xs text-ink-subtle">Skipped lessons are not charged and do not need make-ups. Normal calendar billing and payment grouping rules still apply.</p>
    {slots.map((slot, index) => <fieldset key={index} disabled={disabled} className="mt-3 space-y-2">
      <legend className="text-xs font-medium">{slot.weekday} {slot.time_slot}{slot.location && ` @ ${slot.location}`}</legend>
      {(slot.skipped_lessons || []).map((lesson, item) => <div key={item} className="space-y-2 rounded-md bg-wash p-2">
        <label className="block text-xs">Skipped lesson date
          <Input type="date" value={lesson.date} min={from} max={through} onChange={event => onChange(index, {
            skipped_lessons: slot.skipped_lessons!.map((value, i) => i === item ? { ...value, date: event.target.value } : value),
          })} />
        </label>
        <label className="block text-xs">Reason for skipping
          <Textarea rows={2} maxLength={500} required value={lesson.reason} placeholder="Christmas party" onChange={event => onChange(index, {
            skipped_lessons: slot.skipped_lessons!.map((value, i) => i === item ? { ...value, reason: event.target.value } : value),
          })} />
        </label>
        <Button size="sm" variant="quiet" onClick={() => onChange(index, { skipped_lessons: slot.skipped_lessons!.filter((_, i) => i !== item) })}>Remove skipped date</Button>
      </div>)}
      <Button size="sm" variant="secondary" icon={Plus} disabled={disabled || (slot.skipped_lessons?.length || 0) >= 30}
        onClick={() => onChange(index, { skipped_lessons: [...(slot.skipped_lessons || []), { date: '', reason: '' }] })}>Skip a lesson</Button>
    </fieldset>)}
  </details>;
}
