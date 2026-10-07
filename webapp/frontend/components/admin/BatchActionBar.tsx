"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Send, X } from "lucide-react";
import { Button, IconButton, Select } from "@/components/controls";

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
                  <Button variant="quiet" size="sm" onClick={() => onConfirmOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => { onConfirmOpenChange(false); onUpdate(); }}
                    loading={updating}
                  >
                    Confirm
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg px-4 py-3 flex items-center gap-3">
            <span className="text-sm font-medium text-foreground">{count} selected</span>
            <Select
              size="sm"
              value={status}
              onChange={(e) => onStatusChange(e.target.value)}
              aria-label="New status"
              className="w-auto"
            >
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
            <Button variant="primary" size="sm" onClick={() => onConfirmOpenChange(true)} loading={updating}>
              Update
            </Button>
            <span className="w-px h-5 bg-line" />
            <Button
              size="sm"
              onClick={onPublish}
              disabled={publishing || updating}
              loading={publishing}
              title={publishTitle}
              icon={Send}
              iconClassName="text-emerald-600 dark:text-emerald-400"
            >
              Publish selected
            </Button>
            <IconButton size="sm" label="Clear selection" icon={X} onClick={onClear} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
