"use client";

import { cn } from "@/lib/utils";
import {
  useFloating,
  useDismiss,
  useInteractions,
  FloatingOverlay,
  FloatingFocusManager,
} from "@floating-ui/react";
import { AlertTriangle, Loader2 } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'default';
  loading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  loading = false,
}: ConfirmDialogProps) {
  const { refs, context } = useFloating({
    open: isOpen,
    onOpenChange: (open) => {
      if (!open && !loading) onCancel();
    },
  });

  const dismiss = useDismiss(context, {
    outsidePressEvent: "mousedown",
    enabled: !loading,
  });
  const { getFloatingProps } = useInteractions([dismiss]);

  if (!isOpen) return null;

  const confirmButtonClasses = cn(
    "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    variant === 'danger' && "bg-red-600 text-white hover:bg-red-700",
    variant === 'warning' && "bg-orange-500 text-white hover:bg-orange-600",
    variant === 'default' && "bg-[#a0704b] text-white hover:bg-[#8b5d3b]"
  );

  const iconClasses = cn(
    "h-6 w-6",
    variant === 'danger' && "text-red-500",
    variant === 'warning' && "text-orange-500",
    variant === 'default' && "text-[#a0704b]"
  );

  return (
    <FloatingOverlay
      className="z-[100] bg-black/50 flex items-center justify-center p-4"
      lockScroll
    >
      <FloatingFocusManager context={context}>
        <div
          ref={refs.setFloating}
          {...getFloatingProps()}
          className={cn(
            "w-full max-w-sm bg-white dark:bg-[#1a1a1a] rounded-lg shadow-xl",
            "border border-gray-200 dark:border-gray-700"
          )}
        >
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <AlertTriangle className={iconClasses} />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {title}
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {message}
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-lg">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                "text-gray-700 dark:text-gray-300",
                "hover:bg-gray-100 dark:hover:bg-gray-700",
                "disabled:opacity-50"
              )}
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={confirmButtonClasses}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {confirmText}
            </button>
          </div>
        </div>
      </FloatingFocusManager>
    </FloatingOverlay>
  );
}
