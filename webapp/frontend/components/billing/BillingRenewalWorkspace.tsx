'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Route, X } from 'lucide-react';
import { Button, Field, Select, buttonClasses } from '@/components/controls';
import { EnrollmentDetailModal } from '@/components/enrollments/EnrollmentDetailModal';
import { Modal } from '@/components/ui/modal';
import { useOverlayLayer } from '@/hooks/useOverlayLayer';
import { cn } from '@/lib/utils';
import type { BillingQueueRow } from '@/types/billing';
import { BillingDraftFocus } from './BillingDraftReview';
import { BillingRenewalPanel, type BillingRenewalAction } from './BillingRenewalPanel';

export function BillingRenewalWorkspace({ row, initialAction, trigger, onClose, onChanged }: {
  row: BillingQueueRow;
  initialAction?: BillingRenewalAction;
  trigger: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const enrollments = row.current_enrollments ?? [];
  const intakeOnly = row.origin === 'draft' && !!row.draft_id && !row.enrollment_ids.length && !enrollments.length;
  const firstAction = initialAction ?? (intakeOnly ? { kind: 'draft' as const, id: row.draft_id! } : null);
  const [enrollmentId, setEnrollmentId] = useState<number | null>(enrollments[0]?.enrollment_id ?? row.enrollment_ids[0] ?? null);
  const [action, setAction] = useState<BillingRenewalAction | null>(firstAction);
  const [panelAction, setPanelAction] = useState<BillingRenewalAction | null>(firstAction);
  const [tab, setTab] = useState<'details' | 'renewal'>(firstAction ? 'renewal' : 'details');
  const [wide, setWide] = useState(false);
  const id = useId();
  const layer = useOverlayLayer(true, { lockScroll: true });
  const heading = useRef<HTMLHeadingElement>(null);
  const details = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const previousStage = useRef(panelAction?.kind);
  useLayoutEffect(() => {
    if (panelAction?.kind !== previousStage.current && action) heading.current?.focus();
    previousStage.current = panelAction?.kind;
  }, [panelAction?.kind, action]);
  useEffect(() => {
    const resize = () => setWide(window.innerWidth >= 1024);
    resize(); window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  function open(next: BillingRenewalAction) { if (busy) return; setAction(next); setPanelAction(next); setTab('renewal'); }
  function renew() {
    if (busy) return;
    if (action) { setTab('renewal'); return; }
    open(panelAction ?? (row.origin === 'draft' && row.draft_id ? { kind: 'draft', id: row.draft_id } : { kind: 'renew' }));
  }
  function closePanel() {
    if (busy) return;
    setAction(null); setTab('details');
    requestAnimationFrame(() => {
      const controls = [...(details.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
      (controls.find(button => button.textContent?.trim() === 'Renew') ?? controls.find(button => button.textContent?.includes('Open payment')) ?? details.current)?.focus();
    });
  }
  function openEnrollment(next: number) { if (busy) return; setEnrollmentId(next); setTab('details'); }
  function changeTab(event: KeyboardEvent<HTMLButtonElement>) {
    if (busy || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'details' : event.key === 'End' ? 'renewal' : tab === 'details' ? 'renewal' : 'details';
    setTab(next); document.getElementById(`${id}-${next}-tab`)?.focus();
  }
  const panelTitle = panelAction?.kind === 'payment' ? 'Payment' : panelAction?.kind === 'draft' ? 'Saved draft' : 'Create renewal';
  const canRenew = row.origin !== 'payment' && row.origin !== 'legacy' && panelAction?.kind !== 'payment' && !(row.stage === 'no_payment' && row.first_lesson_date === null);
  const knownIds = enrollments.map(item => item.enrollment_id);
  const ids = [...new Set([...knownIds, ...row.enrollment_ids, ...(enrollmentId ? [enrollmentId] : [])])];

  return <Modal isOpen persistent={busy} onClose={() => { if (!busy) onClose(); }} layer={layer} title={intakeOnly ? 'New enrollment' : 'Enrollment renewal'} size={action && !intakeOnly ? '2xl' : 'lg'} className={cn('transition-[max-width] duration-200', action && !intakeOnly ? 'lg:!max-w-[60rem]' : '!max-w-[36rem]')}>
    <BillingDraftFocus trigger={trigger} suspended={!layer.isTopmost}>
      {action && !wide && !intakeOnly && <div role="tablist" aria-label="Renewal workspace" className="mb-3 flex gap-4 border-b border-line">
        {([{ value: 'details', label: 'Details' }, { value: 'renewal', label: panelTitle }] as const).map(item => <button type="button" role="tab" id={`${id}-${item.value}-tab`} aria-controls={`${id}-${item.value}-panel`} aria-selected={tab === item.value} disabled={busy} tabIndex={tab === item.value ? 0 : -1} key={item.value} onKeyDown={changeTab} onClick={() => setTab(item.value)} className={cn('border-b-2 pb-2 text-sm font-medium', tab === item.value ? 'border-primary text-accent-ink' : 'border-transparent text-ink-subtle')}>{item.label}</button>)}
      </div>}
      <div className="flex h-[min(70dvh,52rem)] min-h-0 gap-4">
        {!intakeOnly && <div ref={details} tabIndex={-1} id={`${id}-details-panel`} role={!wide && action ? 'tabpanel' : undefined} aria-labelledby={!wide && action ? `${id}-details-tab` : undefined} hidden={!!action && !wide && tab !== 'details'} className={cn('min-w-0 flex-1 flex-col outline-none', wide && action && 'lg:w-[22rem] lg:flex-none', (!action || wide || tab === 'details') && 'flex')}>
          {ids.length > 1 && <Field label="Enrollment details" id={`${id}-enrollment`} className="mb-2"><Select value={enrollmentId ?? ''} disabled={busy} onChange={event => setEnrollmentId(Number(event.target.value))}>{ids.map(value => {
            const item = enrollments.find(enrollment => enrollment.enrollment_id === value);
            return <option key={value} value={value}>{item ? `${item.weekday ?? 'Day to confirm'} ${item.time_slot ?? ''} @ ${item.location ?? ''}` : `Enrollment #${value}`}</option>;
          })}</Select></Field>}
          <div className="min-h-0 flex-1">
            {enrollmentId ? <EnrollmentDetailModal isOpen standalone={false} hideCloseButton enrollmentId={enrollmentId} compact={wide && !!action} onClose={onClose}
              showRenewalActions={row.origin === 'legacy'} onStatusChange={onChanged}
              onCreateBillingRenewal={canRenew ? renew : undefined} onOpenBillingPayment={paymentId => open({ kind: 'payment', id: paymentId })} />
              : <div className="space-y-3 rounded border border-line p-4"><p className="text-sm">No enrollment is available to open.</p>{canRenew && <Button onClick={renew}>Review renewal</Button>}</div>}
          </div>
        </div>}
        <AnimatePresence initial={false}>
          {action && <motion.section key="renewal-panel" initial={{ opacity: 0, x: wide ? 24 : 0 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: wide ? 24 : 0 }} transition={{ duration: 0.18 }} id={`${id}-renewal-panel`} role={!wide && !intakeOnly ? 'tabpanel' : undefined} aria-labelledby={!wide && !intakeOnly ? `${id}-renewal-tab` : `${id}-renewal-heading`} hidden={!wide && !intakeOnly && tab !== 'renewal'} className={cn('min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-line bg-paper lg:max-w-[34rem]', (intakeOnly || wide || tab === 'renewal') && 'flex')}>
            <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2"><h3 ref={heading} tabIndex={-1} id={`${id}-renewal-heading`} className="font-semibold">{panelTitle}</h3><Button variant="quiet" size="sm" aria-label="Close renewal panel" disabled={busy} onClick={intakeOnly ? onClose : closePanel}><X className="h-4 w-4" aria-hidden="true" /></Button></div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4"><BillingRenewalPanel key={action.kind === 'renew' ? 'renew' : `${action.kind}:${action.id}`} row={row} initialAction={action} onChanged={onChanged} onOpenEnrollment={openEnrollment} onActionChange={setPanelAction} onBusyChange={setBusy} /></div>
          </motion.section>}
        </AnimatePresence>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {action && !wide && !intakeOnly ? <Button size="sm" variant="quiet" icon={ArrowLeft} disabled={busy} onClick={() => setTab(tab === 'details' ? 'renewal' : 'details')}>{tab === 'details' ? panelTitle : 'Enrollment details'}</Button> : <span />}
        <Link aria-disabled={busy} tabIndex={busy ? -1 : undefined} onClick={event => { if (busy) event.preventDefault(); }} href={intakeOnly ? row.action_url : `/billing/students/${row.student.id}`} className={buttonClasses({ size: 'sm', variant: 'quiet' })}><Route className="h-4 w-4" aria-hidden="true" />Payment journey</Link>
      </div>
    </BillingDraftFocus>
  </Modal>;
}
