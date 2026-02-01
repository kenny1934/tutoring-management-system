"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { SuperAdminPageGuard } from "@/components/auth/SuperAdminPageGuard";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { debugAPI } from "@/lib/api";
import { usePageTitle } from "@/lib/hooks";
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
  };
  const icons = {
    CREATE: Plus,
    UPDATE: Pencil,
    DELETE: Trash2,
  };
  const Icon = icons[operation as keyof typeof icons] || Pencil;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full",
        styles[operation as keyof typeof styles] || "bg-gray-100 text-gray-700"
      )}
    >
      <Icon className="h-3 w-3" />
      {operation}
    </span>
  );
}

function AuditLogRow({ log }: { log: DebugAuditLog }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-[#e8d4b8] dark:border-[#6b5a4a] last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-4 text-left hover:bg-[#faf6f1] dark:hover:bg-[#2d2820] transition-colors"
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
            <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
          )
        )}
      </button>

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
                <pre className="mt-1 p-2 text-xs rounded bg-red-50 dark:bg-red-900/20 overflow-x-auto max-h-48">
                  {JSON.stringify(log.before_state, null, 2)}
                </pre>
              </div>
            )}
            {log.after_state && (
              <div>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  After:
                </span>
                <pre className="mt-1 p-2 text-xs rounded bg-green-50 dark:bg-green-900/20 overflow-x-auto max-h-48">
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

  const [page, setPage] = useState(0);
  const [tableFilter, setTableFilter] = useState("");
  const [operationFilter, setOperationFilter] = useState("");

  const { data, isLoading } = useSWR<PaginatedAuditLogs>(
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
                >
                  <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </Link>
                <div className="flex items-center gap-3">
                  <div className="hidden sm:block p-2 rounded-lg bg-[#f5ede3] dark:bg-[#3d3628]">
                    <History className="h-6 w-6 text-[#a0704b]" />
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
                <Loader2 className="h-8 w-8 animate-spin text-[#a0704b]" />
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
                  <AuditLogRow key={log.id} log={log} />
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
                  <ChevronLeft className="h-4 w-4" />
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
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </DeskSurface>
    </SuperAdminPageGuard>
  );
}
