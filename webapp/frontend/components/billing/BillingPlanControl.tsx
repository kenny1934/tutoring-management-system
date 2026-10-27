'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button, Select } from '@/components/controls';
import { PaymentMethodBadge } from '@/components/payments/PaymentMethodBadge';
import { BillingPreferenceUpdater, type PreferenceChange } from '@/lib/billing-preferences';
import type { BillingPreferences, BillingRosterRow } from '@/types/billing';

interface Props {
  row: BillingRosterRow; canWrite: boolean; tutorId?: number;
  onSaved: (value: BillingPreferences) => void; onReload: () => void | Promise<unknown>;
}

export function BillingPlanControl(props: Props) {
  return <PlanControlContent key={JSON.stringify([props.row.student.id, props.canWrite, props.tutorId])} {...props} />;
}

function PlanControlContent({ row, canWrite, tutorId, onSaved, onReload }: Props) {
  const [updater] = useState(() => new BillingPreferenceUpdater());
  const [pending, setPending] = useState<PreferenceChange | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const active = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const running = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort(); }; }, [canWrite, row.student.id, tutorId]);
  const method = pending && 'payment_method' in pending ? pending.payment_method : row.recorded_payment_method ?? null;
  const ready = pending && 'mandate_ready' in pending ? pending.mandate_ready : row.mandate_ready ?? false;

  async function save(change: PreferenceChange) {
    if (!canWrite || running.current) return;
    running.current = true; setBusy(true); setPending(change); setError(null); setSaved(false);
    const abort = new AbortController(); controller.current = abort;
    try {
      const result = await updater.save(row, change, tutorId, abort.signal);
      if (!active.current || abort.signal.aborted) return;
      setPending(null); setSaved(true); onSaved(result);
    } catch (failure) {
      if (active.current && !abort.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not save. Retry.');
    } finally { running.current = false; if (active.current) setBusy(false); }
  }

  async function reload() {
    if (busy) return;
    setBusy(true);
    try {
      await onReload();
      if (active.current) { setError(null); setPending(null); setSaved(false); }
    } catch { if (active.current) setError('Could not reload. Retry.'); }
    finally { if (active.current) setBusy(false); }
  }

  if (!canWrite) return <div className="space-y-1"><PaymentMethodBadge method={row.recorded_payment_method ?? null} />{row.recorded_payment_method === 'autopay' && <p className="text-xs text-ink-subtle">{row.mandate_ready ? 'Bank authorisation ready' : 'Setup pending'}</p>}</div>;
  return <div className="min-w-0 space-y-2" aria-label={`Payment preference for ${row.student.student_name}`}>
    <div className="flex items-center gap-2"><Select size="sm" aria-label={`Payment method for ${row.student.student_name}`} value={method ?? ''} disabled={busy || !!error} onChange={event => { void save({ payment_method: event.target.value as 'manual' | 'autopay' || null }); }}>
      <option value="">Not recorded</option><option value="manual">Manual</option><option value="autopay">Autopay</option>
    </Select>{busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink-subtle" aria-label="Saving preference" /> : saved && <Check className="h-4 w-4 shrink-0 text-green-700 dark:text-green-400" aria-label="Preference saved" />}</div>
    {method === 'autopay' && <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={!!ready} disabled={busy || !!error} onChange={event => { void save({ mandate_ready: event.target.checked }); }} />Bank authorisation ready</label>}
    {error && <div role="alert" className="space-y-1 text-xs text-red-700 dark:text-red-300"><p>{error}</p>{updater.hasPending(row.student.id) ? <Button size="sm" disabled={busy} onClick={() => { if (pending) void save(pending); }}>Retry save</Button> : <Button size="sm" disabled={busy} onClick={() => { void reload(); }}>Reload</Button>}</div>}
  </div>;
}
