'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button, Field, Select } from '@/components/controls';
import { Modal } from '@/components/ui/modal';
import { StudentInfoBadges } from '@/components/ui/student-info-badges';
import { PaymentMethodBadge } from '@/components/payments/PaymentMethodBadge';
import { billingAPI } from '@/lib/billing-api';
import { BillingPreferenceUpdater, checkedPreferences } from '@/lib/billing-preferences';
import { plural } from '@/lib/formatters';
import type { BillingMethod, BillingPreferences, BillingRosterRow } from '@/types/billing';
import { BillingDraftFocus } from './BillingDraftReview';

interface Item { row: BillingRosterRow; done?: boolean; error?: string; attempted?: BillingMethod; }

export function BillingPreferenceBatchModal({ rows, tutorId, trigger, onSaved, onClose }: {
  rows: BillingRosterRow[]; tutorId?: number; trigger: RefObject<HTMLButtonElement | null>;
  onSaved: (value: BillingPreferences) => void; onClose: (completed: number[]) => void;
}) {
  const [items, setItems] = useState<Item[]>(() => [...new Map(rows.map(row => [row.student.id, row])).values()]
    .sort((a, b) => (a.student.school_student_id ?? '').localeCompare(b.student.school_student_id ?? '', undefined, { numeric: true }) || a.student.id - b.student.id).map(row => ({ row })));
  const [method, setMethod] = useState<BillingMethod | ''>('');
  const [checked, setChecked] = useState(false);
  const [working, setWorking] = useState<number | null>(null);
  const [updater] = useState(() => new BillingPreferenceUpdater());
  const active = useRef(true);
  const running = useRef(false);
  const operations = useRef(new Set<AbortController>());
  const resultHeading = useRef<HTMLParagraphElement>(null);
  const saved = useRef(onSaved); saved.current = onSaved;
  useEffect(() => { active.current = true; const pending = operations.current; return () => { active.current = false; for (const operation of pending) operation.abort(); pending.clear(); }; }, []);
  const completed = items.filter(item => item.done).map(item => item.row.student.id);
  const ready = items.filter(item => !item.done && !item.error);
  function replace(next: Item) { setItems(current => current.map(item => item.row.student.id === next.row.student.id ? next : item)); }

  async function run(retry?: Item) {
    if (running.current || (!retry && (!method || !checked || !ready.length))) return;
    running.current = true; setChecked(false);
    const abort = new AbortController(); operations.current.add(abort);
    try {
      for (const item of retry ? [retry] : ready) {
        if (!active.current || abort.signal.aborted) break;
        const id = item.row.student.id;
        setWorking(id);
        const attempted = retry ? item.attempted! : method as BillingMethod;
        try {
          const value = await updater.save(item.row, { payment_method: attempted }, tutorId, abort.signal);
          if (!active.current || abort.signal.aborted) break;
          replace({ row: { ...item.row, recorded_payment_method: value.payment_method, mandate_ready: value.mandate_ready, preference_version: value.version }, done: true });
          saved.current(value);
        } catch (error) {
          if (!active.current || abort.signal.aborted) break;
          replace({ ...item, attempted, error: error instanceof Error ? error.message : 'Could not save. Retry.' });
        }
      }
    } finally {
      operations.current.delete(abort); running.current = false;
      if (active.current) { setWorking(null); resultHeading.current?.focus(); }
    }
  }

  async function recheck(item: Item) {
    if (running.current) return;
    running.current = true; setChecked(false); setWorking(item.row.student.id);
    const abort = new AbortController(); operations.current.add(abort);
    try {
      const fresh = checkedPreferences(await billingAPI.preferences(item.row.student.id, tutorId, abort.signal), item.row.student.id);
      if (active.current && !abort.signal.aborted) replace({ row: { ...item.row, recorded_payment_method: fresh.payment_method, mandate_ready: fresh.mandate_ready, preference_version: fresh.version } });
    } catch (error) {
      if (active.current && !abort.signal.aborted) replace({ ...item, error: error instanceof Error ? error.message : 'Could not reload.' });
    } finally { operations.current.delete(abort); running.current = false; if (active.current) setWorking(null); }
  }

  return <Modal isOpen title="Set payment method" size="lg" persistent={working !== null} onClose={() => { if (!running.current) onClose(completed); }}
    footer={<div className="flex flex-wrap items-center justify-between gap-3"><p ref={resultHeading} tabIndex={-1} className="text-sm outline-none">{completed.length ? `${completed.length} saved` : plural(ready.length, 'student')}</p><div className="flex gap-2"><Button disabled={working !== null} onClick={() => onClose(completed)}>Close</Button><Button variant="primary" disabled={working !== null || !method || !checked || !ready.length} onClick={() => { void run(); }}>Save preferences</Button></div></div>}>
    <BillingDraftFocus trigger={trigger}><div className="space-y-4">
      <Field label="Payment method" id="batch-preference-method"><Select value={method} disabled={working !== null || !ready.length} onChange={event => { setMethod(event.target.value as BillingMethod); setChecked(false); }}><option value="">Choose method</option><option value="manual">Manual</option><option value="autopay">Autopay</option></Select></Field>
      <div className="space-y-2">{items.map(item => <article key={item.row.student.id} aria-label={`Preference for ${item.row.student.student_name}`} className="space-y-2 rounded-md border border-line p-3">
        <div className="flex items-center justify-between gap-2"><div className="min-w-0"><StudentInfoBadges student={{ ...item.row.student, school_student_id: item.row.student.school_student_id ?? undefined, grade: item.row.student.grade ?? undefined, home_location: item.row.student.home_location ?? undefined, lang_stream: item.row.student.lang_stream ?? undefined, school: item.row.student.school ?? undefined }} showLocationPrefix /></div>{working === item.row.student.id ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-label="Saving preference" /> : item.done && <Check className="h-4 w-4 shrink-0 text-green-700 dark:text-green-400" aria-label="Saved" />}</div>
        {item.error && updater.hasPending(item.row.student.id) ? <span className="inline-flex items-center gap-2 text-xs text-ink-subtle">Unconfirmed <PaymentMethodBadge method={item.attempted ?? null} /></span> : <PaymentMethodBadge method={item.row.recorded_payment_method ?? null} />}
        {item.error && <div role="alert" className="space-y-1 text-xs text-red-700 dark:text-red-300"><p>{item.error}</p><Button size="sm" disabled={working !== null} onClick={() => { void (updater.hasPending(item.row.student.id) ? run(item) : recheck(item)); }}>{updater.hasPending(item.row.student.id) ? 'Retry save' : 'Recheck'}</Button></div>}
      </article>)}</div>
      {ready.length > 0 && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={checked} disabled={working !== null} onChange={event => setChecked(event.target.checked)} />These preferences match the parents’ responses.</label>}
    </div></BillingDraftFocus>
  </Modal>;
}
