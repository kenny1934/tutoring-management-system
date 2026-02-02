"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import useSWR from "swr";
import { SuperAdminPageGuard } from "@/components/auth/SuperAdminPageGuard";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { debugAPI } from "@/lib/api";
import { usePageTitle } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import { cn } from "@/lib/utils";
import type { PaginatedAuditLogs, DebugAuditLog } from "@/types/debug";
import {
  History,
  ArrowLeft,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Undo2,
  X,
  AlertTriangle,
} from "lucide-react";

const PAGE_SIZE = 50;

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

function OperationBadge({ operation }: { operation: string }) {
  const styles = {
    CREATE: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    UPDATE: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    DELETE: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    SQL_QUERY: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  };
  const icons = {
    CREATE: Plus,
    UPDATE: Pencil,
    DELETE: Trash2,
    SQL_QUERY: History,
  };
  const Icon = icons[operation as keyof typeof icons] || Pencil;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full",
        styles[operation as keyof typeof styles] || "bg-gray-100 text-gray-700"
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {operation}
    </span>
  );
}

interface AuditLogRowProps {
  log: DebugAuditLog;
  onRevert: (log: DebugAuditLog) => void;
}

function AuditLogRow({ log, onRevert }: AuditLogRowProps) {
  const [expanded, setExpanded] = useState(false);

  const canRevert = log.operation !== "SQL_QUERY" && (log.before_state || log.after_state);

  return (
    <div className="border-b border-[#e8d4b8] dark:border-[#6b5a4a] last:border-b-0">
      <div className="flex items-center">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 px-4 py-3 flex items-center gap-4 text-left hover:bg-[#faf6f1] dark:hover:bg-[#2d2820] transition-colors"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <OperationBadge operation={log.operation} />
              <Link
                href={`/admin/debug/${log.table_name}`}
                onClick={(e) => e.stopPropagation()}
                className="font-medium text-[#a0704b] hover:underline"
              >
                {log.table_name}
              </Link>
              {log.row_id && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  #{log.row_id}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
              <span>{log.admin_email}</span>
              <span>•</span>
              <span>{formatDate(log.created_at)}</span>
              {log.ip_address && (
                <>
                  <span>•</span>
                  <span>{log.ip_address}</span>
                </>
              )}
            </div>
          </div>
          {(log.before_state || log.after_state) && (
            expanded ? (
              <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
            )
          )}
        </button>
        {canRevert && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRevert(log);
            }}
            className="mr-4 p-2 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 text-gray-500 hover:text-amber-600 transition-colors btn-press"
            title="Revert this change"
            aria-label="Revert change"
          >
            <Undo2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {expanded && (log.before_state || log.after_state) && (
        <div className="px-4 pb-4 space-y-3">
          {log.changed_fields && log.changed_fields.length > 0 && (
            <div>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Changed fields:
              </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {log.changed_fields.map((field) => (
                  <span
                    key={field}
                    className="px-1.5 py-0.5 text-xs rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                  >
                    {field}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {log.before_state && (
              <div>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Before:
                </span>
                <pre className="mt-1 p-2 text-xs rounded bg-red-50 dark:bg-red-900/20 overflow-x-auto max-h-48 font-mono-data">
                  {JSON.stringify(log.before_state, null, 2)}
                </pre>
              </div>
            )}
            {log.after_state && (
              <div>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  After:
                </span>
                <pre className="mt-1 p-2 text-xs rounded bg-green-50 dark:bg-green-900/20 overflow-x-auto max-h-48 font-mono-data">
                  {JSON.stringify(log.after_state, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AuditLogPage() {
  usePageTitle("Debug Audit Logs");
  const { showToast } = useToast();

  const [page, setPage] = useState(0);
  const [tableFilter, setTableFilter] = useState("");
  const [operationFilter, setOperationFilter] = useState("");
  const [revertLog, setRevertLog] = useState<DebugAuditLog | null>(null);
  const [isReverting, setIsReverting] = useState(false);

  const { data, isLoading, mutate } = useSWR<PaginatedAuditLogs>(
    ["debug-audit-logs", page, tableFilter, operationFilter],
    () =>
      debugAPI.getAuditLogs({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        table_name: tableFilter || undefined,
        operation: operationFilter || undefined,
      })
  );

  const logs = data?.logs || [];
  const totalLogs = data?.total || 0;
  const totalPages = Math.ceil(totalLogs / PAGE_SIZE);

  const handleRevert = useCallback(async () => {
    if (!revertLog) return;

    setIsReverting(true);
    try {
      const result = await debugAPI.revertAuditLog(revertLog.id);
      showToast(result.message, "success");
      setRevertLog(null);
      mutate(); // Refresh the list
    } catch (err) {
      const message = err instanceof Error ? err.message : "Revert failed";
      showToast(message, "error");
    } finally {
      setIsReverting(false);
    }
  }, [revertLog, mutate, showToast]);

  const getRevertDescription = (log: DebugAuditLog) => {
    switch (log.operation) {
      case "CREATE":
        return `This will delete the row that was created in ${log.table_name}.`;
      case "UPDATE":
        return `This will restore ${log.table_name} #${log.row_id} to its previous state.`;
      case "DELETE":
        return `This will restore the deleted row in ${log.table_name}.`;
      default:
        return "This will revert the change.";
    }
  };

  return (
    <SuperAdminPageGuard>
      <DeskSurface fullHeight>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 z-40 desk-background">
            <div className="p-4 sm:px-6 sm:py-4">
              <div className="flex items-center gap-4">
                <Link
                  href="/admin/debug"
                  className="p-2 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] rounded-lg transition-colors"
                  aria-label="Back to debug panel"
                >
                  <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" aria-hidden="true" />
                </Link>
                <div className="flex items-center gap-3">
                  <div className="hidden sm:block p-2 rounded-lg bg-[#f5ede3] dark:bg-[#3d3628]">
                    <History className="h-6 w-6 text-[#a0704b]" aria-hidden="true" />
                  </div>
                  <div>
                    <h1 className="text-lg sm:text-2xl font-bold text-white">
                      Audit Logs
                    </h1>
                    <p className="text-sm text-white/70">
                      History of debug panel operations
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="mx-4 sm:mx-6 mb-4 flex flex-wrap gap-3 items-center">
              <input
                type="text"
                placeholder="Filter by table..."
                value={tableFilter}
                onChange={(e) => {
                  setTableFilter(e.target.value);
                  setPage(0);
                }}
                className="px-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a] placeholder-gray-400"
              />
              <select
                value={operationFilter}
                onChange={(e) => {
                  setOperationFilter(e.target.value);
                  setPage(0);
                }}
                className="px-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300"
              >
                <option value="">All Operations</option>
                <option value="CREATE">CREATE</option>
                <option value="UPDATE">UPDATE</option>
                <option value="DELETE">DELETE</option>
                <option value="SQL_QUERY">SQL_QUERY</option>
              </select>
              <div className="text-sm text-gray-500 dark:text-gray-400 ml-auto">
                {totalLogs.toLocaleString()} logs
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-4 sm:px-6 pb-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-[#a0704b]" aria-hidden="true" />
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-16 text-gray-500 dark:text-gray-400">
                No audit logs found
              </div>
            ) : (
              <div className={cn(
                "rounded-xl border overflow-hidden",
                "bg-white dark:bg-[#1a1a1a] border-[#e8d4b8] dark:border-[#6b5a4a]",
                "paper-texture"
              )}>
                {logs.map((log) => (
                  <AuditLogRow key={log.id} log={log} onRevert={setRevertLog} />
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  Previous
                </button>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] disabled:opacity-50"
                >
                  Next
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Revert Confirmation Modal */}
        {revertLog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-modal-backdrop">
            <div className="relative max-w-lg w-[calc(100%-2rem)] min-w-[20rem] mx-4 bg-white dark:bg-[#1a1a1a] rounded-xl border border-amber-300 dark:border-amber-700 shadow-xl animate-modal-in">
              <div className="flex items-center justify-between p-4 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                    <Undo2 className="h-5 w-5 text-amber-600" aria-hidden="true" />
                  </div>
                  <h3 className="text-lg font-semibold">Revert Change</h3>
                </div>
                <button
                  onClick={() => setRevertLog(null)}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-300">
                      {getRevertDescription(revertLog)}
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                      This action will be logged as a new operation.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div className="text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Operation:</span>{" "}
                    <OperationBadge operation={revertLog.operation} />
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Table:</span>{" "}
                    <span className="font-mono text-[#a0704b]">{revertLog.table_name}</span>
                    {revertLog.row_id && <span className="text-gray-600"> #{revertLog.row_id}</span>}
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Original action by:</span>{" "}
                    <span>{revertLog.admin_email}</span>
                  </div>
                </div>

                {revertLog.before_state && (
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      Will restore to:
                    </span>
                    <pre className="mt-1 p-2 text-xs rounded bg-green-50 dark:bg-green-900/20 overflow-x-auto max-h-32 font-mono-data">
                      {JSON.stringify(revertLog.before_state, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 p-4 border-t border-[#e8d4b8] dark:border-[#6b5a4a]">
                <button
                  onClick={() => setRevertLog(null)}
                  disabled={isReverting}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRevert}
                  disabled={isReverting}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
                >
                  {isReverting ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Undo2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  Revert Change
                </button>
              </div>
            </div>
          </div>
        )}
      </DeskSurface>
    </SuperAdminPageGuard>
  );
}
