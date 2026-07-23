"use client";

import { useMemo } from "react";
import { X, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/** One application's outcome from a batch publish. Both intakes return this
 *  same per-application shape. */
export interface BatchPublishResultRow {
  application_id: number;
  success: boolean;
  enrollment_id?: number | null;
  sessions_created?: number | null;
  error_code?: string | null;
  error?: string | null;
}

interface BatchPublishResultsModalProps {
  results: BatchPublishResultRow[] | null;
  /** Applications currently loaded, used to name each row. */
  applications?: { id: number; student_name: string; reference_code: string }[];
  onClose: () => void;
}

/**
 * Outcome of a batch publish, one row per application, so a failure names
 * itself and its reason instead of hiding inside a count. Shared by the
 * summer and regular application lists.
 */
export function BatchPublishResultsModal({
  results,
  applications,
  onClose,
}: BatchPublishResultsModalProps) {
  // Named once per application rather than scanned per result row, so a large
  // batch doesn't re-scan the whole list for every outcome.
  const labelById = useMemo(() => {
    const map = new Map<number, string>();
    (applications ?? []).forEach((a) =>
      map.set(a.id, `${a.student_name} (${a.reference_code})`)
    );
    return map;
  }, [applications]);

  if (!results) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">Publish results</h3>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2 text-sm">
          {results.map((r) => (
            <div
              key={r.application_id}
              className={cn(
                "flex items-start gap-2 px-3 py-2 rounded-lg border",
                r.success
                  ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                  : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
              )}
            >
              {r.success
                ? <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                : <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="font-medium text-foreground truncate">
                  {labelById.get(r.application_id) ?? `App #${r.application_id}`}
                </div>
                {r.success ? (
                  <div className="text-xs text-muted-foreground">
                    Created enrollment #{r.enrollment_id} with {r.sessions_created} session(s).
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-mono">{r.error_code}</span> — {r.error}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
