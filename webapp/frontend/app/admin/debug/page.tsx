"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { SuperAdminPageGuard } from "@/components/auth/SuperAdminPageGuard";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { debugAPI } from "@/lib/api";
import { usePageTitle } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import type { DebugTable } from "@/types/debug";
import {
  Database,
  Table2,
  ArrowLeft,
  Search,
  AlertTriangle,
  Loader2,
  Shield,
  History,
} from "lucide-react";

export default function DebugPanelPage() {
  usePageTitle("Debug Panel");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: tables, isLoading, error } = useSWR<DebugTable[]>(
    "debug-tables",
    () => debugAPI.getTables()
  );

  // Filter tables by search query
  const filteredTables = tables?.filter(
    (t) =>
      t.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group tables by priority ranges
  const priorityGroups = [
    { label: "Priority Tables", min: 0, max: 9, color: "bg-red-500" },
    { label: "Reference Tables", min: 10, max: 19, color: "bg-amber-500" },
    { label: "Supporting Tables", min: 20, max: 29, color: "bg-blue-500" },
    { label: "Other Tables", min: 30, max: 999, color: "bg-gray-400" },
  ];

  return (
    <SuperAdminPageGuard>
      <DeskSurface fullHeight>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 z-40 desk-background">
            <div className="p-4 sm:px-6 sm:py-4">
              <div className="flex items-center gap-4">
                <Link
                  href="/"
                  className="p-2 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] rounded-lg transition-colors"
                >
                  <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </Link>
                <div className="flex items-center gap-3">
                  <div className="hidden sm:block p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                    <Database className="h-6 w-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h1 className="text-lg sm:text-2xl font-bold text-white flex items-center gap-2">
                      Debug Panel
                      <Shield className="h-5 w-5 text-red-400" />
                    </h1>
                    <p className="hidden sm:block text-sm text-white/70">
                      Super Admin database access
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Warning Banner */}
            <div className="mx-4 sm:mx-6 mb-4 p-3 rounded-lg bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-800">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm font-medium">
                  DEBUG MODE - Changes affect production data. All operations are logged.
                </span>
              </div>
            </div>

            {/* Search and Actions */}
            <div className="mx-4 sm:mx-6 mb-4 flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search tables..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a] placeholder-gray-400"
                />
              </div>
              <Link
                href="/admin/debug/audit"
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors"
              >
                <History className="h-4 w-4" />
                Audit Logs
              </Link>
            </div>
          </div>

          {/* Content */}
          <div className="px-4 sm:px-6 pb-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-[#a0704b]" />
              </div>
            ) : error ? (
              <div className="text-center py-16">
                <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">
                  Failed to load tables. Are you a Super Admin?
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {priorityGroups.map((group) => {
                  const groupTables = filteredTables?.filter(
                    (t) => t.priority >= group.min && t.priority <= group.max
                  );
                  if (!groupTables?.length) return null;

                  return (
                    <div key={group.label}>
                      <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <span className={cn("w-2 h-2 rounded-full", group.color)} />
                        {group.label}
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {groupTables.map((table) => (
                          <Link
                            key={table.name}
                            href={`/admin/debug/${table.name}`}
                            className={cn(
                              "p-4 rounded-xl border transition-all",
                              "bg-white dark:bg-[#1a1a1a] border-[#e8d4b8] dark:border-[#6b5a4a]",
                              "hover:shadow-md hover:border-[#a0704b] dark:hover:border-[#a0704b]",
                              "paper-texture"
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Table2 className="h-5 w-5 text-[#a0704b]" />
                                <span className="font-semibold text-gray-900 dark:text-gray-100">
                                  {table.display_name}
                                </span>
                              </div>
                              {!table.allow_hard_delete && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                                  No Delete
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-mono">
                              {table.name}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                              {table.row_count.toLocaleString()} rows
                            </p>
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DeskSurface>
    </SuperAdminPageGuard>
  );
}
