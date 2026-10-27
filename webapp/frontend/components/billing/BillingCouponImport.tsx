'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import Link from 'next/link';
import { Upload } from 'lucide-react';
import { Button, Field, Input, Select, Segmented } from '@/components/controls';
import { Modal } from '@/components/ui/modal';
import { StudentInfoBadges } from '@/components/ui/student-info-badges';
import { useAuth } from '@/contexts/AuthContext';
import { billingAPI } from '@/lib/billing-api';
import { formatShortDate, plural } from '@/lib/formatters';
import type { BillingBankBranch, BillingCouponImport } from '@/types/billing';
import { BillingDraftFocus, billingDraftAuthScope } from './BillingDraftReview';

export function BillingCouponImportButton({ defaultBranch, storageAvailable, writesAvailable, onChanged }: { defaultBranch?: string; storageAvailable: boolean; writesAvailable: boolean; onChanged?: () => void }) {
  const auth = useAuth();
  const scope = billingDraftAuthScope(auth);
  const [open, setOpen] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  if (!auth.isAdmin || auth.isReadOnly) return null;
  return <><Button ref={trigger} size="sm" icon={Upload} disabled={!storageAvailable || !writesAvailable} onClick={() => setOpen(scope)}>{defaultBranch === 'MSA' || defaultBranch === 'MSB' ? `Import ${defaultBranch} KMS list` : 'Import KMS list'}</Button>{open === scope && storageAvailable && writesAvailable && <ImportDialog key={scope} defaultBranch={defaultBranch} trigger={trigger} onClose={() => setOpen(null)} onChanged={onChanged} />}</>;
}

function ImportDialog({ defaultBranch, trigger, onClose, onChanged }: { defaultBranch?: string; trigger: React.RefObject<HTMLButtonElement | null>; onClose: () => void; onChanged?: () => void }) {
  const [branch, setBranch] = useState<BillingBankBranch | ''>(defaultBranch === 'MSA' || defaultBranch === 'MSB' ? defaultBranch : '');
  const [date, setDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [review, setReview] = useState<BillingCouponImport | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [group, setGroup] = useState<'changed' | 'unchanged' | 'unmatched' | 'invalid'>('changed');
  const [acknowledged, setAcknowledged] = useState(false);
  const [sameDay, setSameDay] = useState(false);
  const requiresSameDay = !!review && [...review.issues, ...review.rows.flatMap(row => row.issues)].some(issue => issue.code === 'SAME_DAY_SOURCE_REVIEW');
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const running = useRef(false);
  const active = useRef(true);
  const operation = useRef<AbortController | null>(null);
  const retry = useRef<{ content: string; key: string } | null>(null);
  const resultFocus = useRef<HTMLParagraphElement | null>(null);
  const { mutate } = useSWRConfig();
  useEffect(() => { active.current = true; return () => { active.current = false; operation.current?.abort(); }; }, []);
  useLayoutEffect(() => { if (review?.applied) resultFocus.current?.focus(); }, [review?.applied]);
  function edit() { setReview(null); setChecked(false); setAcknowledged(false); setSameDay(false); setFailure(null); setStale(false); }
  async function perform(kind: 'preview' | 'refresh' | 'apply') {
    if (running.current || (kind === 'preview' && (!branch || !file || !date)) || (kind === 'apply' && (!review?.can_confirm || review.applied || stale || !checked || (review.unmatched_count > 0 && !acknowledged) || (requiresSameDay && !sameDay)))) return;
    running.current = true; setBusy(true); setFailure(null);
    const abort = new AbortController(); operation.current = abort;
    try {
      let next: BillingCouponImport;
      if (kind === 'preview') next = await billingAPI.previewCouponImport(file!, branch as BillingBankBranch, date, abort.signal);
      else if (kind === 'refresh') next = await billingAPI.couponImport(review!.id, abort.signal);
      else {
        const content = JSON.stringify([review!.id, review!.review_hash, acknowledged, sameDay]);
        if (retry.current?.content !== content) retry.current = { content, key: crypto.randomUUID() };
        next = await billingAPI.confirmCouponImport(review!.id, { expected_review_hash: review!.review_hash, idempotency_key: retry.current.key, acknowledge_unmatched: acknowledged, ...(requiresSameDay ? { acknowledge_same_day: sameDay } : {}) }, abort.signal);
      }
      if (!active.current || abort.signal.aborted) return;
      if (next.branch !== branch || next.observed_on !== date || !/^[a-f0-9]{64}$/.test(next.review_hash) || (kind !== 'preview' && (next.id !== review!.id || next.source_sha256 !== review!.source_sha256 || next.filename !== review!.filename))) throw new Error('This import changed. Refresh the review.');
      setReview(next); setChecked(false); setAcknowledged(false); setSameDay(false); setStale(false);
      if (kind === 'preview' || !next.rows.some(row => row.status === group)) setGroup((['invalid', 'changed', 'unmatched', 'unchanged'] as const).find(value => next.rows.some(row => row.status === value)) ?? 'changed');
      if (next.applied) { void mutate(key => Array.isArray(key) && ['billing-coupons', 'billing-student-context', 'student-coupon', 'billing-renewal-queue'].includes(key[0])); onChanged?.(); }
    } catch (error) { if (active.current && !abort.signal.aborted) { setFailure(error instanceof Error ? error.message : 'Could not review the KMS list.'); if ((error as { status?: number }).status === 409) setStale(true); } }
    finally { running.current = false; if (active.current) setBusy(false); }
  }
  const included = review ? review.changed_count + review.unchanged_count : 0;
  const matchedRows = review?.rows.filter(row => row.student && ['changed', 'unchanged'].includes(row.status)) ?? [];
  const checksNeeded = matchedRows.filter(row => row.coupon_check_required === true);
  const footer = review && !review.applied ? <div className="space-y-3" data-coupon-import-footer>
    <dl className="grid grid-cols-3 gap-3 text-xs">{[{ label: 'Included', count: included }, { label: 'Changed', count: review.changed_count }, { label: 'Unchanged', count: review.unchanged_count }].map(item => <div key={item.label}><dt className="text-ink-subtle">{item.label}</dt><dd className="mt-1 font-semibold">{item.count}</dd></div>)}</dl>
    {review.unmatched_count > 0 && <label className="flex items-start gap-2 text-xs"><input type="checkbox" disabled={busy} checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />Skip the {plural(review.unmatched_count, 'unmatched student')}.</label>}
    {requiresSameDay && <label className="flex items-start gap-2 text-xs"><input type="checkbox" disabled={busy} checked={sameDay} onChange={event => setSameDay(event.target.checked)} />I confirm this is the latest KMS export for this date.</label>}
    <label className="flex items-start gap-2 text-xs"><input type="checkbox" disabled={busy || stale || !review.can_confirm} checked={checked} onChange={event => setChecked(event.target.checked)} />I checked this KMS export and date.</label>
    <div className="flex flex-wrap justify-end gap-2"><Button size="sm" disabled={busy} onClick={() => { void perform('refresh'); }}>Refresh review</Button><Button size="sm" variant="primary" disabled={busy || stale || !review.can_confirm || !checked || (review.unmatched_count > 0 && !acknowledged) || (requiresSameDay && !sameDay)} onClick={() => { void perform('apply'); }}>Import coupon counts</Button></div>
    {stale && <p className="text-xs text-amber-800 dark:text-amber-300">Refresh the review before applying.</p>}
  </div> : review?.applied ? <div className="flex justify-end" data-coupon-import-footer><Button size="sm" onClick={onClose}>Done</Button></div> : undefined;
  return <Modal isOpen title="Import KMS coupons" size="lg" className="[&>div:has([data-coupon-import-footer])]:shrink-0" footer={footer} persistent={busy} onClose={() => { if (!running.current) onClose(); }}><BillingDraftFocus trigger={trigger}><div className="space-y-4">
    {!review ? <>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="KMS branch" id="coupon-import-branch"><Select disabled={busy} value={branch} onChange={event => { edit(); setBranch(event.target.value as BillingBankBranch); }}><option value="">Choose branch</option><option>MSA</option><option>MSB</option></Select></Field><Field label="KMS export date" id="coupon-import-date" hint="Use the date you downloaded this list from KMS."><Input type="date" disabled={busy} required value={date} onChange={event => { edit(); setDate(event.target.value); }} /></Field></div>
      <Field label="KMS spreadsheet" id="coupon-import-file"><Input ref={fileInput} type="file" accept=".xls,.xlsx" disabled={busy} onChange={event => { edit(); setFile(event.target.files?.[0] ?? null); }} /></Field>
      <Button size="sm" disabled={busy || !branch || !date || !file} onClick={() => { void perform('preview'); }}>Review import</Button>
    </> : <>
      <div className="flex flex-wrap items-start justify-between gap-2 rounded border border-line bg-wash p-3"><div className="min-w-0 space-y-1 text-xs"><p className="font-medium">{review.branch} · {formatShortDate(review.observed_on)}</p><p className="break-all text-ink-subtle">{review.filename}</p></div>{!review.applied && <Button size="sm" disabled={busy} onClick={() => { edit(); setFile(null); requestAnimationFrame(() => fileInput.current?.focus()); }}>Choose another file</Button>}</div>
      {review.applied ? <>
        <p ref={resultFocus} tabIndex={-1} role="status" className="text-sm font-medium">KMS list imported.</p>
        <p className="text-sm">Coupon counts updated for {plural(included, 'student')}.</p>
        <dl className="grid grid-cols-2 gap-3 text-xs"><div><dt className="text-ink-subtle">Counts changed</dt><dd className="mt-1 font-semibold">{review.changed_count}</dd></div><div><dt className="text-ink-subtle">Counts unchanged</dt><dd className="mt-1 font-semibold">{review.unchanged_count}</dd></div></dl>
        {checksNeeded.length > 0 && <p className="text-sm text-amber-800 dark:text-amber-300">{plural(checksNeeded.length, 'student')} {checksNeeded.length === 1 ? 'needs' : 'need'} a coupon check.</p>}
        <div className="divide-y divide-line rounded border border-line">{matchedRows.map(row => <div key={row.row_number} className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs"><span>{row.student!.student_name}</span><Link className="font-medium text-accent-ink hover:underline" href={`/students/${row.student!.id}#student-coupons`}>{row.coupon_check_required ? 'Check coupons' : 'View coupons'}</Link></div>)}</div>
      </> : <>
        <Segmented label="KMS import rows" className="max-w-full flex-wrap" value={group} onChange={setGroup} options={[{ value: 'changed', label: `Changed (${review.changed_count})` }, ...(review.invalid_count ? [{ value: 'invalid' as const, label: `Invalid (${review.invalid_count})` }] : []), ...(review.unmatched_count ? [{ value: 'unmatched' as const, label: `Unmatched (${review.unmatched_count})` }] : []), { value: 'unchanged', label: `Unchanged (${review.unchanged_count})` }]} />
        {!!review.issues.length && <ul className="space-y-1 text-xs text-amber-800 dark:text-amber-300">{review.issues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>}
        <div className="max-h-64 divide-y divide-line overflow-y-auto rounded border border-line">{review.rows.filter(row => row.status === group).map(row => <div key={row.row_number} className="space-y-1 p-3 text-xs">{row.student ? <StudentInfoBadges compact student={{ ...row.student, school_student_id: row.student.school_student_id ?? undefined, home_location: row.student.home_location ?? undefined, grade: row.student.grade ?? undefined, lang_stream: row.student.lang_stream ?? undefined, school: row.student.school ?? undefined }} /> : <p className="break-all font-mono">{row.company_id || `Row ${row.row_number}`}</p>}<p>{row.previous_count == null ? 'Unknown' : row.previous_count} → {row.remaining_count == null ? 'Check count' : row.remaining_count}</p>{row.issues.map((issue, index) => <p key={index} className="text-amber-800 dark:text-amber-300">{issue.message}</p>)}</div>)}</div>
      </>}
    </>}
    {failure && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{failure}</p>}
  </div></BillingDraftFocus></Modal>;
}
