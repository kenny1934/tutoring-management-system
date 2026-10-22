'use client';

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { Button } from '@/components/controls';
import { Modal } from '@/components/ui/modal';

// Recalculation can move the trigger into the journey toolbar while open.
function restoreEditorFocus(original: HTMLButtonElement | null, trigger: RefObject<HTMLButtonElement | null>) {
  const target = original?.isConnected ? original : trigger.current;
  target?.focus({ preventScroll: true });
}

function EditorFocus({ children, trigger }: { children: ReactNode; trigger: RefObject<HTMLButtonElement | null> }) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dialog = body.current?.closest<HTMLElement>('[role="dialog"]');
    const returnTo = trigger.current;
    if (!dialog) return;
    const targets = () => [...dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
    )].filter(element => !element.closest('[hidden]'));
    targets()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const options = targets();
      const first = options[0], last = options[options.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog.addEventListener('keydown', trap);
    return () => {
      dialog.removeEventListener('keydown', trap);
      restoreEditorFocus(returnTo, trigger);
    };
  }, [trigger]);
  return <div ref={body} className="min-w-0">{children}</div>;
}

export function BillingEditorDialog({ open, onClose, trigger, children, status }: {
  open: boolean;
  onClose: () => void;
  trigger: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
  status?: ReactNode;
}) {
  return <Modal isOpen={open} onClose={onClose} title="Edit preview" size="xl" className="min-w-0"
    footer={<div className="flex items-center justify-end gap-3">{status && <div className="min-w-0 flex-1 text-xs">{status}</div>}<Button className="shrink-0" onClick={onClose}>Done</Button></div>}>
    <EditorFocus trigger={trigger}>{children}</EditorFocus>
  </Modal>;
}
