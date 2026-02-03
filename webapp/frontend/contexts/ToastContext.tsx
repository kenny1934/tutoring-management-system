"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { cn, formatError } from "@/lib/utils";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
  action?: ToastAction;
}

interface ToastOptions {
  persistent?: boolean;  // If true, toast won't auto-dismiss
}

interface ToastContextType {
  showToast: (message: string, type?: "success" | "error" | "info", action?: ToastAction, options?: ToastOptions) => string;
  /** Show an error toast with automatic formatting of the error message */
  showError: (error: unknown, fallback?: string) => string;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const TOAST_DURATION = 3000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  // Use useEffect to set mounted state to avoid hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const showToast = useCallback((
    message: string,
    type: "success" | "error" | "info" = "success",
    action?: ToastAction,
    options?: ToastOptions
  ) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    setToasts((prev) => [...prev, { id, message, type, action }]);

    // Only auto-dismiss if not persistent
    if (!options?.persistent) {
      const duration = action ? 10000 : TOAST_DURATION;
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }

    return id;  // Return ID for manual dismissal
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showError = useCallback((error: unknown, fallback?: string) => {
    const message = formatError(error, fallback);
    return showToast(message, "error");
  }, [showToast]);

  const getIcon = (type: Toast["type"]) => {
    switch (type) {
      case "success":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "error":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "info":
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const getStyles = (type: Toast["type"]) => {
    switch (type) {
      case "success":
        return "bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800";
      case "error":
        return "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800";
      case "info":
        return "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800";
    }
  };

  return (
    <ToastContext.Provider value={{ showToast, showError, dismissToast }}>
      {children}
      {isMounted &&
        createPortal(
          <div className="fixed bottom-4 right-4 z-[10000] flex flex-col gap-2 pointer-events-none">
            <AnimatePresence mode="popLayout">
              {toasts.map((toast) => (
                <motion.div
                  key={toast.id}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  className={cn(
                    "pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg min-w-[280px] max-w-[400px]",
                    getStyles(toast.type)
                  )}
                >
                  {getIcon(toast.type)}
                  <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                    {toast.message}
                  </span>
                  {toast.action && (
                    <button
                      onClick={() => {
                        toast.action?.onClick();
                        dismissToast(toast.id);
                      }}
                      className="px-2 py-1 text-xs font-medium rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-gray-700 dark:text-gray-200"
                    >
                      {toast.action.label}
                    </button>
                  )}
                  <button
                    onClick={() => dismissToast(toast.id)}
                    className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                  >
                    <X className="h-4 w-4 text-gray-500" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
