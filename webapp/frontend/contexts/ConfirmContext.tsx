"use client";

import { createContext, useContext, useState, useCallback, useMemo, useRef, ReactNode } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  /** Optional list of consequences to display as bullet points */
  consequences?: string[];
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "default";
}

interface ConfirmContextType {
  /** Opens the app-styled ConfirmDialog and resolves true on confirm,
   *  false on cancel or dismiss (Esc / overlay click). */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** True while the dialog is showing. Dismissable parents (popovers) should
   *  disable their outside-press dismissal while this is set, or the click
   *  answering the dialog also closes them. */
  isOpen: boolean;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      // Only one dialog can show at a time; a second request cancels the first.
      resolveRef.current?.(false);
      resolveRef.current = resolve;
      setOptions(opts);
    });
  }, []);

  const settle = useCallback((confirmed: boolean) => {
    resolveRef.current?.(confirmed);
    resolveRef.current = null;
    setOptions(null);
  }, []);

  const value = useMemo(
    () => ({ confirm, isOpen: options !== null }),
    [confirm, options],
  );

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmDialog
        isOpen={options !== null}
        title={options?.title ?? ""}
        message={options?.message}
        consequences={options?.consequences}
        confirmText={options?.confirmText}
        cancelText={options?.cancelText}
        variant={options?.variant}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return context.confirm;
}

export function useConfirmOpen() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirmOpen must be used within a ConfirmProvider");
  }
  return context.isOpen;
}
