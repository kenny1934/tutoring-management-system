'use client';

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { MAIN_CONTENT_ID } from '@/lib/scroll';
import { cn } from '@/lib/utils';

/** Follow the main layout's live width while the sidebar moves. */
export function TrialWorkspaceOverlay({ children, onClose, kind, busy = false }: {
  children: (wide: boolean) => ReactNode;
  onClose: () => void;
  kind: 'conversion' | 'comparison';
  busy?: boolean;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [wide, setWide] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    setHost(document.getElementById(MAIN_CONTENT_ID)?.parentElement ?? document.body);
  }, []);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => setWide(element.getBoundingClientRect().width >= 960);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [host]);
  if (!host) return null;
  return createPortal(<motion.div ref={root} data-trial-workspace={kind} data-workspace-layout={wide ? 'side-by-side' : 'tabs'}
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
    className={cn(host === document.body ? 'fixed' : 'absolute', 'inset-0 z-50 flex min-w-0 items-center justify-center overflow-hidden p-4')}>
    <motion.div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { if (!busy) onClose(); }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
    {children(wide)}
  </motion.div>, host);
}

/** Preserve both familiar panes and their form state when the sidebar changes the available width. */
export function TrialConversionWorkspace({ converting, tab, onTabChange, onClose, detail, create, busy = false }: {
  converting: boolean;
  tab: 'detail' | 'create';
  onTabChange: (tab: 'detail' | 'create') => void;
  onClose: () => void;
  detail: (wide: boolean) => ReactNode;
  create?: ReactNode;
  busy?: boolean;
}) {
  const id = useId();
  return <TrialWorkspaceOverlay kind="conversion" onClose={onClose} busy={busy}>{wide => <div data-workspace-frame
    className={cn('relative flex h-[85dvh] min-h-0 w-full min-w-0 flex-col', wide && converting ? 'max-w-[60rem]' : 'max-w-[32rem]')}>
    {!wide && converting && <div role="tablist" aria-label="Trial conversion" className="flex shrink-0 rounded-t-lg border-b border-line bg-paper">
      {([{ value: 'detail', label: 'Trial details' }, { value: 'create', label: 'Convert to Regular' }] as const).map(value => <button
        key={value.value} type="button" role="tab" id={`${id}-${value.value}-tab`} aria-controls={`${id}-${value.value}-panel`}
        aria-selected={tab === value.value} disabled={busy} onClick={() => { if (!busy) onTabChange(value.value); }}
        className={cn('min-w-0 flex-1 px-4 py-2.5 text-sm font-medium transition-colors', tab === value.value ? 'border-b-2 border-primary bg-primary/5 text-accent-ink' : 'text-foreground/60 hover:text-foreground/80')}>
        {value.label}
      </button>)}
    </div>}
    <div className={cn('relative flex min-h-0 w-full min-w-0 flex-1', wide && converting ? 'items-stretch gap-4' : 'flex-col')}>
      <div data-workspace-pane="detail" id={`${id}-detail-panel`} role={!wide && converting ? 'tabpanel' : undefined}
        aria-labelledby={!wide && converting ? `${id}-detail-tab` : undefined} hidden={!wide && converting && tab !== 'detail'}
        className={cn('min-h-0 min-w-0', !wide && converting && tab !== 'detail' ? 'hidden' : 'flex flex-col', wide && converting ? 'w-[18rem] shrink-0' : 'w-full flex-1')}>
        {detail(wide)}
      </div>
      <AnimatePresence initial={false}>
        {converting && <motion.div key="create-form" data-workspace-pane="create" id={`${id}-create-panel`}
          role={!wide ? 'tabpanel' : undefined} aria-labelledby={!wide ? `${id}-create-tab` : undefined}
          hidden={!wide && tab !== 'create'} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.2 }}
          className={cn('min-h-0 min-w-0 flex-1 overflow-hidden', !wide && tab !== 'create' ? 'hidden' : 'flex flex-col')}>
          {create}
        </motion.div>}
      </AnimatePresence>
    </div>
  </div>}</TrialWorkspaceOverlay>;
}
