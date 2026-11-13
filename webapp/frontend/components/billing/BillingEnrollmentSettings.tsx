'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import { Settings2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button, Field, Input } from '@/components/controls';
import { Modal } from '@/components/ui/modal';
import { billingAPI } from '@/lib/billing-api';
import type { BillingSettings } from '@/types/billing';
import { BillingDraftFocus, billingDraftAuthScope } from './BillingDraftReview';

export function BillingEnrollmentSettings() {
  const auth = useAuth();
  if (!auth.user || auth.isLoading || auth.isGuest || !auth.isAdmin || auth.isReadOnly) return null;
  return <EnrollmentSettings key={billingDraftAuthScope(auth)} />;
}

function EnrollmentSettings() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <>
    <Button ref={trigger} size="sm" variant="secondary" icon={Settings2} onClick={() => { setSaved(false); setOpen(true); }}>Enrollment settings</Button>
    {saved && <span role="status" className="text-xs text-ink-subtle">Settings saved.</span>}
    <Modal persistent={busy} isOpen={open} onClose={() => { if (!busy) setOpen(false); }} title="Enrollment settings" size="sm">
      {open && <BillingDraftFocus trigger={trigger}><SettingsEditor busy={busy} onBusyChange={setBusy} onClose={() => setOpen(false)} onSaved={() => { setSaved(true); setOpen(false); }} /></BillingDraftFocus>}
    </Modal>
  </>;
}

function SettingsEditor({ onClose, onSaved, busy, onBusyChange }: { onClose: () => void; onSaved: () => void; busy: boolean; onBusyChange: (busy: boolean) => void }) {
  const { mutate } = useSWRConfig();
  const id = useId();
  const [settings, setSettings] = useState<BillingSettings | null>(null);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [readVersion, setReadVersion] = useState(0);
  const active = useRef(true);
  const operation = useRef<AbortController | null>(null);
  const attempt = useRef<{ content: string; token: string } | null>(null);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; operation.current?.abort(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    billingAPI.settings(controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setSettings(value); setAmount(String(value.materials_fee)); setReloadRequired(false); attempt.current = null;
    }).catch(failure => {
      if (!controller.signal.aborted) { setSettings(null); setError(failure instanceof Error ? failure.message : 'Could not load settings.'); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [readVersion]);
  const value = Number(amount);
  const valid = amount.trim() !== '' && Number.isSafeInteger(value) && value >= 0 && value <= 10000;
  const writable = !!settings?.storage_available && !!settings.writes_available;
  async function save() {
    if (!settings || !writable || loading || busy || !valid || reloadRequired || value === settings.materials_fee) return;
    const body = { materials_fee: value, expected_version: settings.version };
    const content = JSON.stringify(body);
    if (attempt.current?.content !== content) attempt.current = { content, token: crypto.randomUUID() };
    const controller = new AbortController(); operation.current = controller;
    onBusyChange(true); setError(null);
    try {
      await billingAPI.saveSettings({ ...body, idempotency_key: attempt.current.token }, controller.signal);
      if (!active.current || controller.signal.aborted) return;
      void mutate(key => key === 'billing-preview-options' || (Array.isArray(key) && ['billing-settings', 'billing-plan-options', 'billing-students', 'billing-student-context', 'billing-intake-context'].includes(key[0]))).catch(() => {});
      window.dispatchEvent(new Event('billing-settings-updated'));
      onBusyChange(false); onSaved();
    } catch (failure) {
      if (!active.current || controller.signal.aborted) return;
      const status = (failure as { status?: number }).status;
      if (status === 409) { setReloadRequired(true); setError('Settings changed. Reload before saving.'); }
      else if (status === 503) { setReloadRequired(true); setError('Saving settings is unavailable. Reload to check again.'); }
      else setError(failure instanceof Error ? failure.message : 'Could not save settings.');
    } finally { if (active.current && !controller.signal.aborted) onBusyChange(false); }
  }
  return <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
    {loading && <p role="status" className="text-sm text-ink-subtle">Loading settings…</p>}
    {settings && <Field id={id} label="Materials fee (MOP)"><Input id={id} type="number" min={0} max={10000} step={1} value={amount} disabled={loading || busy || !writable || reloadRequired} onChange={event => setAmount(event.target.value)} /></Field>}
    {!loading && settings && !writable && <p role="status" className="text-sm text-ink-subtle">Saving settings is not enabled yet.</p>}
    {error && <div role="alert" className="space-y-2 text-sm"><p>{error}</p>{(!settings || reloadRequired) && <Button size="sm" disabled={loading || busy} onClick={() => setReadVersion(previous => previous + 1)}>Reload settings</Button>}</div>}
    <div className="flex justify-end gap-2"><Button size="sm" disabled={busy} onClick={onClose}>Cancel</Button><Button size="sm" variant="primary" type="submit" loading={busy} disabled={loading || busy || !writable || !valid || reloadRequired || value === settings?.materials_fee}>Save</Button></div>
  </form>;
}
