'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Settings2 } from 'lucide-react';
import { Button, Field, Select } from '@/components/controls';
import { Modal } from '@/components/ui/modal';
import { PaymentMethodBadge } from '@/components/payments/PaymentMethodBadge';
import { useAuth } from '@/contexts/AuthContext';
import { billingAPI } from '@/lib/billing-api';
import { invalidateRenewalQueueCache } from '@/lib/renewal-queue';
import type { BillingMethod, BillingPreferences } from '@/types/billing';
import { BillingDraftFocus, billingDraftAuthScope, billingDraftTutorId } from './BillingDraftReview';

interface BillingPaymentSettingsProps {
  studentId: number;
  onSaved: () => void;
  storageAvailable?: boolean;
  canWrite?: boolean;
  presentation?: 'compact' | 'inline' | 'badge';
  recordedMethod?: BillingMethod | null;
  mandateReady?: boolean | null;
  previewMethod?: BillingMethod | null;
  onPreviewMethod?: (method: BillingMethod | null) => void;
  onBusyChange?: (busy: boolean) => void;
}

export function BillingPaymentSettings(props: BillingPaymentSettingsProps) {
  const auth = useAuth();
  const scope = `${props.studentId}:${billingDraftAuthScope(auth)}`;
  // Changing students or effective roles discards any unsaved form and retry token.
  return <PaymentSettingsContent key={`${scope}:${!!props.storageAvailable}`} {...props} auth={auth} scope={scope} />;
}

function PaymentSettingsContent({ studentId, onSaved, storageAvailable = false, canWrite = false, presentation = 'compact', recordedMethod, mandateReady, previewMethod, onPreviewMethod, onBusyChange, auth, scope }: BillingPaymentSettingsProps & { auth: ReturnType<typeof useAuth>; scope: string }) {
  const [open, setOpen] = useState(false);
  const inline = presentation === 'inline';
  // A card needs no individual request until staff open its editor.
  const preferences = useSWR(storageAvailable && (open || inline) ? ['billing-preferences', scope] : null,
    () => billingAPI.preferences(studentId, billingDraftTutorId(auth)), { keepPreviousData: false });
  const loaded = preferences.data?.student_id === studentId ? preferences.data : null;
  const [editor, setEditor] = useState<BillingPreferences | null>(null);
  const [saved, setSaved] = useState<BillingPreferences | null>(null);
  const stored = storageAvailable ? loaded ?? saved : null;
  const value = editor ?? stored ?? { student_id: studentId, payment_method: recordedMethod ?? null, mandate_ready: mandateReady ?? false, version: 0, updated_at: null };
  const savedMethod = stored ? stored.payment_method : recordedMethod ?? null;
  const savedMandate = stored ? stored.mandate_ready : mandateReady;
  const actionScope = JSON.stringify([scope, storageAvailable, canWrite]);
  const [error, setError] = useState<{ scope: string; text: string; reload?: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyScope, setBusyScope] = useState<string | null>(null);
  const busy = busyScope === actionScope;
  const operation = useRef<AbortController | null>(null);
  const retry = useRef<{ content: string; token: string } | null>(null);
  const current = useRef(actionScope); current.current = actionScope;
  const trigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const fieldId = useId();
  const previewBeforeEdit = useRef<{ method: BillingMethod | null } | null>(null);
  const immediatePreview = inline && !!onPreviewMethod;
  const loading = storageAvailable && !loaded && !preferences.error;
  const editable = auth.isAdmin || !!onPreviewMethod;
  const writable = auth.isAdmin && storageAvailable && canWrite && !!loaded && !preferences.error;
  const unavailable = !auth.isAdmin ? 'An admin can save the parent’s payment method.'
    : !storageAvailable || !canWrite ? 'Saving payment methods is not enabled yet.' : null;
  useEffect(() => () => operation.current?.abort(), [actionScope]);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  const activePlan = inline && onPreviewMethod && previewMethod !== undefined ? previewMethod : savedMethod;
  const expanded = !inline || open || (!savedMethod && !activePlan);
  const previewDiffers = !!onPreviewMethod && previewMethod !== undefined && previewMethod !== savedMethod;
  useLayoutEffect(() => {
    if (inline && !open && returnFocus.current) {
      if (expanded) document.getElementById(fieldId)?.focus(); else trigger.current?.focus();
      returnFocus.current = false;
    }
  }, [expanded, inline, open, fieldId]);
  const hint = notice ?? ((expanded || !storageAvailable) ? unavailable : null)
    ?? (previewDiffers ? previewMethod ? `${previewMethod === 'manual' ? 'Manual' : 'Autopay'} is used for this preview only.` : 'No payment plan is selected for this preview.' : null);

  function beginEditing() {
    previewBeforeEdit.current = { method: activePlan };
    setEditor(immediatePreview ? { ...value, payment_method: activePlan } : null);
    setError(null); setNotice(null); setOpen(true);
  }

  function change(next: BillingPreferences, methodChanged = false) {
    if (immediatePreview && methodChanged) {
      if (!previewBeforeEdit.current) previewBeforeEdit.current = { method: activePlan };
      setOpen(true);
      onPreviewMethod?.(next.payment_method);
    }
    setEditor(next); setError(null); setNotice(null);
  }

  function closeEditor(keepPreview = false) {
    if (busy) return;
    if (immediatePreview && !keepPreview && previewBeforeEdit.current) onPreviewMethod?.(previewBeforeEdit.current.method);
    previewBeforeEdit.current = null;
    returnFocus.current = true; setOpen(false); setEditor(null); setError(null); setNotice(null);
  }

  async function save() {
    if (!writable || busy) return;
    const body = { payment_method: value.payment_method, mandate_ready: value.mandate_ready, expected_version: value.version };
    const content = JSON.stringify([scope, body]);
    if (retry.current?.content !== content) retry.current = { content, token: crypto.randomUUID() };
    const abort = new AbortController(); operation.current = abort; setBusyScope(actionScope); setError(null); setNotice(null);
    try {
      const result = await billingAPI.savePreferences(studentId, { ...body, idempotency_key: retry.current.token }, abort.signal);
      if (abort.signal.aborted || current.current !== actionScope) return;
      await preferences.mutate(result, false);
      if (abort.signal.aborted || current.current !== actionScope) return;
      retry.current = null; previewBeforeEdit.current = null; setSaved(result); setEditor(null); returnFocus.current = true; setOpen(false); setNotice('Payment method saved.');
      if (result.payment_method) onPreviewMethod?.(result.payment_method);
      onSaved();
      void invalidateRenewalQueueCache();
    } catch (failure) {
      if (!abort.signal.aborted && current.current === actionScope) setError({ scope: actionScope, text: failure instanceof Error ? failure.message : 'Could not save the payment method.', reload: (failure as { status?: number }).status === 409 });
    } finally { if (current.current === actionScope) setBusyScope(null); }
  }

  const form = <form className="space-y-3" onSubmit={event => { event.preventDefault(); void save(); }}>
    {loading && <p role="status" className="text-xs text-ink-subtle">Loading the saved payment method…</p>}
    {preferences.error && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm"><span>Could not load the saved payment method.</span><Button size="sm" onClick={() => { setEditor(null); void preferences.mutate(); }}>Retry</Button></div>}
    <Field label={inline ? "Payment plan" : "Parent’s payment preference"} id={fieldId}><Select id={fieldId} value={value.payment_method ?? ''} disabled={busy || loading || !editable} onChange={event => change({ ...value, payment_method: event.target.value as BillingMethod || null }, true)}><option value="">Not recorded</option><option value="autopay">Autopay</option><option value="manual">Manual</option></Select></Field>
    {value.payment_method === 'autopay' && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={value.mandate_ready} disabled={busy || !writable} onChange={event => change({ ...value, mandate_ready: event.target.checked })} />Bank authorisation is ready.</label>}
    {error?.scope === actionScope && <div role="alert" className="space-y-2 text-sm text-red-700 dark:text-red-300"><p>{error.text}</p>{error.reload && <Button size="sm" disabled={busy || preferences.isValidating} onClick={async () => {
      try {
        const fresh = await preferences.mutate();
        if (current.current === actionScope && fresh) {
          setEditor(null); setSaved(fresh); setError(null); retry.current = null;
          if (immediatePreview) { previewBeforeEdit.current = { method: fresh.payment_method }; onPreviewMethod?.(fresh.payment_method); }
        }
      } catch { /* The preference read error shows its Retry action above. */ }
    }}>Reload saved choice</Button>}</div>}
    {hint && <p role="status" className="text-xs text-ink-subtle">{hint}</p>}
    <div className="flex flex-wrap justify-end gap-2">
      {(!inline || savedMethod || previewMethod || previewBeforeEdit.current) && <Button size="sm" disabled={busy} onClick={() => closeEditor()}>{inline ? 'Cancel' : 'Close'}</Button>}
      {immediatePreview && <Button size="sm" disabled={busy || loading || (!value.payment_method && !previewBeforeEdit.current)} onClick={() => closeEditor(true)}>Done</Button>}
      {onPreviewMethod && !inline && <Button size="sm" disabled={busy || loading || !value.payment_method} onClick={() => { if (value.payment_method) { onPreviewMethod(value.payment_method); setNotice(`${value.payment_method === 'manual' ? 'Manual' : 'Autopay'} is used for this preview only.`); if (inline) { returnFocus.current = true; setOpen(false); } } }}>Use for this preview</Button>}
      <Button size="sm" type="submit" variant="primary" disabled={!writable} loading={busy}>Save payment method</Button>
    </div>
  </form>;

  const settingsModal = <Modal isOpen={open} onClose={() => { if (!busy) setOpen(false); }} title="Payment method" size="sm"><BillingDraftFocus trigger={trigger}>{form}</BillingDraftFocus></Modal>;
  if (presentation === 'badge') return <>
    <Button ref={trigger} size="sm" variant="quiet" className="h-auto gap-1 px-0 py-0" aria-label={`Payment method: ${savedMethod === 'manual' ? 'Manual' : savedMethod === 'autopay' ? 'Autopay' : 'Not set'}`} title="Payment method" onClick={beginEditing}><PaymentMethodBadge method={savedMethod} /><Settings2 className="h-3 w-3 text-ink-subtle" aria-hidden="true" /></Button>
    {settingsModal}
  </>;
  const summary = <><span className="inline-flex items-center gap-1.5"><span>{inline ? 'Saved choice' : 'Payment preference'}</span><PaymentMethodBadge method={savedMethod} /></span>{savedMethod === 'autopay' && <span>Autopay setup: {savedMandate == null ? 'Not recorded' : savedMandate ? 'Ready' : 'Not ready'}</span>}</>;
  return inline ? <section className="space-y-3" aria-label="Payment plan settings">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">Payment plan</h3><PaymentMethodBadge method={activePlan} />{previewDiffers && <span className="text-xs text-ink-subtle">Not saved</span>}</div>
      {!expanded && <Button ref={trigger} size="sm" variant="quiet" onClick={beginEditing}>Change</Button>}
    </div>
    {expanded ? form : hint && <p role="status" className="text-xs text-ink-subtle">{hint}</p>}
  </section> : <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-subtle">{summary}<Button ref={trigger} size="sm" variant="quiet" icon={Settings2} onClick={beginEditing}>Payment method</Button></div>
    {settingsModal}
  </div>;
}
