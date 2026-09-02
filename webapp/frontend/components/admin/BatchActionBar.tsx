"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Send, X } from "lucide-react";

const selectClass = "px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card text-foreground";

interface BatchActionBarProps {
  /** How many rows are checked. The bar hides itself at zero. */
  count: number;
  statuses: readonly string[];
  status: string;
  onStatusChange: (next: string) => void;
  /** Confirmation card above the bar, so a bulk status change is deliberate. */
  confirmOpen: boolean;
  onConfirmOpenChange: (open: boolean) => void;
  onUpdate: () => void;
  updating: boolean;
  onPublish: () => void;
  publishing: boolean;
  publishTitle: string;
  onClear: () => void;
}

/**
 * Floating bar for bulk actions over checked applications: set a status, or
 * publish the selection. Shared by the summer and regular application lists.
 */
export function BatchActionBar({
  count,
  statuses,
  status,
  onStatusChange,
  confirmOpen,
  onConfirmOpenChange,
  onUpdate,
  updating,
  onPublish,
  publishing,
  publishTitle,
  onClear,
}: BatchActionBarProps) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-50"
        >
          <AnimatePresence>
            {confirmOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="mb-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg px-4 py-3 text-center"
              >
                <p className="text-sm text-foreground mb-2">
                  Update <span className="font-semibold">{count}</span> application{count !== 1 ? "s" : ""} to <span className="font-semibold">{status}</span>?
                </p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => onConfirmOpenChange(false)}
                    className="px-3 py-1 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { onConfirmOpenChange(false); onUpdate(); }}
                    disabled={updating}
                    className="px-3 py-1 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
                  >
                    {updating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Confirm
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg px-4 py-3 flex items-center gap-3">
            <span className="text-sm font-medium text-foreground">{count} selected</span>
            <select
              value={status}
              onChange={(e) => onStatusChange(e.target.value)}
              className={selectClass}
            >
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              onClick={() => onConfirmOpenChange(true)}
              disabled={updating}
              className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            >
              {updating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Update
            </button>
            <span className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
            <button
              onClick={onPublish}
              disabled={publishing || updating}
              title={publishTitle}
              className="px-3 py-1.5 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
            >
              {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Publish Selected
            </button>
            <button
              onClick={onClear}
              className="p-1.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
