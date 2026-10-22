'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export const BankRunFooterContext = createContext<{
  target: HTMLDivElement | null;
  onActiveChange: (active: boolean) => void;
} | null>(null);

/** Keep the review action in the existing dialog footer while its rows scroll. */
export function BankRunFooter({ children }: { children: ReactNode }) {
  const context = useContext(BankRunFooterContext);
  const onActiveChange = context?.onActiveChange;
  useEffect(() => { onActiveChange?.(true); return () => onActiveChange?.(false); }, [onActiveChange]);
  if (!context) return <div>{children}</div>;
  return context.target ? createPortal(children, context.target) : null;
}
