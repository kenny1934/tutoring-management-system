'use client';

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { History, MoreHorizontal, Ticket, Upload, UserPlus } from 'lucide-react';
import { Badge, Button } from '@/components/controls';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { BillingCouponImportDialog } from './BillingCouponImport';
import { BillingKmsCouponDialog } from './BillingKmsCouponPreview';

export const renewalMenuItemClass = "w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-foreground hover:bg-tint focus-visible:bg-tint focus-visible:outline-none transition-colors";

export function RenewalMenuItems({ close, children, trigger }: { close: () => void; children: React.ReactNode; trigger: React.RefObject<HTMLButtonElement | null> }) {
  const list = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { list.current?.querySelector<HTMLElement>('button:not(:disabled), a[href]')?.focus(); }, []);
  function keyDown(event: KeyboardEvent) {
    const items = [...(list.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); trigger.current?.focus(); }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }
  return <div ref={list} onKeyDown={keyDown}>{children}</div>;
}

export function RenewalTools({ canManage, scope, couponStorage, couponWrites, waitingCount, onShowLegacy, onShowTaught, grouped = false }: {
  grouped?: boolean; canManage: boolean; scope: string; couponStorage: boolean; couponWrites: boolean; waitingCount?: number;
  onShowLegacy: () => void; onShowTaught: () => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [dialog, setDialog] = useState<{ scope: string; kind: 'kms' | 'import' } | null>(null);
  useEffect(() => { setDialog(null); }, [scope]);
  return <>
    <DropdownMenu align="right" menuClassName="bg-paper dark:bg-paper border-line dark:border-line rounded-lg" trigger={({ triggerProps }) => <Button {...triggerProps} ref={trigger} size="sm" variant={grouped ? 'quiet' : 'secondary'} className={grouped ? 'rounded-l-none pointer-coarse:after:inset-x-0' : undefined} icon={MoreHorizontal}>Tools</Button>}>
      {close => <RenewalMenuItems close={close} trigger={trigger}>
        <button type="button" role="menuitem" className={renewalMenuItemClass} onClick={() => { close(); onShowLegacy(); }}><History className="h-4 w-4" aria-hidden="true" />Earlier enrollments</button>
        <button type="button" role="menuitem" className={renewalMenuItemClass} onClick={() => { close(); onShowTaught(); }}><UserPlus className="h-4 w-4" aria-hidden="true" />Taught but not in CSM yet{' '}{waitingCount !== undefined && <Badge>{waitingCount}</Badge>}</button>
        {canManage && <>
          <button type="button" role="menuitem" disabled={!couponStorage} className={`${renewalMenuItemClass} disabled:opacity-50`} onClick={() => { close(); setDialog({ scope, kind: 'kms' }); }}><Ticket className="h-4 w-4" aria-hidden="true" />Check KMS coupons</button>
          <button type="button" role="menuitem" disabled={!couponStorage || !couponWrites} className={`${renewalMenuItemClass} disabled:opacity-50`} onClick={() => { close(); setDialog({ scope, kind: 'import' }); }}><Upload className="h-4 w-4" aria-hidden="true" />Import KMS list</button>
        </>}
      </RenewalMenuItems>}
    </DropdownMenu>
    {canManage && couponStorage && dialog?.scope === scope && (dialog.kind === 'kms'
      ? <BillingKmsCouponDialog trigger={trigger} onClose={() => setDialog(null)} />
      : couponWrites && <BillingCouponImportDialog trigger={trigger} onClose={() => setDialog(null)} />)}
  </>;
}
