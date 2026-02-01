"use client";

import { useState, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { SuperAdminPageGuard } from "@/components/auth/SuperAdminPageGuard";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { debugAPI } from "@/lib/api";
import { usePageTitle, useDebouncedValue } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import { cn } from "@/lib/utils";
import type { DebugTableSchema, DebugRow, PaginatedRows } from "@/types/debug";
import {
  Table2,
  ArrowLeft,
  Search,
  AlertTriangle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

const PAGE_SIZE = 50;

export default function TableBrowserPage() {
  const params = useParams();
  const tableName = params.table as string;

  usePageTitle(`Debug: ${tableName}`);

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [editingRow, setEditingRow] = useState<DebugRow | null>(null);
  const [editedData, setEditedData] = useState<Record<string, unknown>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [newRowData, setNewRowData] = useState<Record<string, unknown>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const { showToast } = useToast();

  // Fetch schema
  const { data: schema, isLoading: schemaLoading } = useSWR<DebugTableSchema>(
    `debug-schema-${tableName}`,
    () => debugAPI.getTableSchema(tableName)
  );

  // Fetch rows
  const {
    data: rowsData,
    isLoading: rowsLoading,
    mutate,
  } = useSWR<PaginatedRows>(
    schema
      ? [
          "debug-rows",
          tableName,
          page,
          debouncedSearch,
          sortBy,
          sortOrder,
        ]
      : null,
    () =>
      debugAPI.getRows(tableName, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        search: debouncedSearch || undefined,
        sort_by: sortBy || undefined,
        sort_order: sortOrder,
      })
  );

  const isLoading = schemaLoading || rowsLoading;
  const rows = rowsData?.rows || [];
  const totalRows = rowsData?.total || 0;
  const totalPages = Math.ceil(totalRows / PAGE_SIZE);

  // Get primary key column
  const pkColumn = schema?.primary_key || "id";

  // Handle sort click
  const handleSort = useCallback(
    (column: string) => {
      if (sortBy === column) {
        setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(column);
        setSortOrder("desc");
      }
      setPage(0);
    },
    [sortBy]
  );

  // Handle edit
  const handleStartEdit = useCallback((row: DebugRow) => {
    setEditingRow(row);
    setEditedData({ ...row });
    setIsCreating(false);
    setDeleteConfirm(null);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingRow(null);
    setEditedData({});
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingRow || !schema) return;

    setIsSubmitting(true);
    try {
      const rowId = editingRow[pkColumn] as number;
      await debugAPI.updateRow(tableName, rowId, editedData);
      showToast("Row updated successfully", "success");
      mutate();
      handleCancelEdit();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Update failed", "error");
    } finally {
      setIsSubmitting(false);
    }
  }, [editingRow, editedData, schema, tableName, pkColumn, mutate, handleCancelEdit]);

  // Handle create
  const handleStartCreate = useCallback(() => {
    setIsCreating(true);
    setNewRowData({});
    setEditingRow(null);
    setDeleteConfirm(null);
  }, []);

  const handleCancelCreate = useCallback(() => {
    setIsCreating(false);
    setNewRowData({});
  }, []);

  const handleSaveCreate = useCallback(async () => {
    if (!schema) return;

    setIsSubmitting(true);
    try {
      await debugAPI.createRow(tableName, newRowData);
      showToast("Row created successfully", "success");
      mutate();
      handleCancelCreate();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Create failed", "error");
    } finally {
      setIsSubmitting(false);
    }
  }, [newRowData, schema, tableName, mutate, handleCancelCreate]);

  // Handle delete
  const handleDelete = useCallback(async (rowId: number) => {
    setIsSubmitting(true);
    try {
      await debugAPI.deleteRow(tableName, rowId);
      showToast("Row deleted successfully", "success");
      mutate();
      setDeleteConfirm(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed", "error");
    } finally {
      setIsSubmitting(false);
    }
  }, [tableName, mutate]);

  // Render cell value
  const renderCellValue = (value: unknown, columnType: string): string => {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  // Find column info
  const getColumnInfo = (colName: string) =>
    schema?.columns.find((c) => c.name === colName);

  // Visible columns (limit for display)
  const visibleColumns = useMemo(() => {
    if (!schema) return [];
    // Show primary key first, then other columns
    const pk = schema.columns.find((c) => c.primary_key);
    const others = schema.columns.filter((c) => !c.primary_key).slice(0, 8);
    return pk ? [pk, ...others] : others;
  }, [schema]);

  return (
    <SuperAdminPageGuard>
      <DeskSurface fullHeight>
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex-shrink-0 desk-background">
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
                    <Table2 className="h-6 w-6 text-[#a0704b]" />
                  </div>
                  <div>
                    <h1 className="text-lg sm:text-2xl font-bold text-white">
                      {schema?.display_name || tableName}
                    </h1>
                    <p className="text-sm text-white/70 font-mono">{tableName}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Warning Banner */}
            <div className="mx-4 sm:mx-6 mb-4 p-2 rounded-lg bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-800">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-xs">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>Changes affect production data. All operations are logged.</span>
              </div>
            </div>

            {/* Toolbar */}
            <div className="mx-4 sm:mx-6 mb-4 flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={`Search ${schema?.search_columns.join(", ") || ""}...`}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(0);
                  }}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a] placeholder-gray-400"
                />
              </div>
              <button
                onClick={handleStartCreate}
                disabled={isCreating}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-[#a0704b] text-white hover:bg-[#8a5f3e] transition-colors disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Create
              </button>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {totalRows.toLocaleString()} rows
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 min-h-0 overflow-auto mx-4 sm:mx-6 mb-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-[#a0704b]" />
              </div>
            ) : (
              <div className="rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[#f5ede3] dark:bg-[#2d2618] sticky top-0">
                    <tr>
                      {visibleColumns.map((col) => (
                        <th
                          key={col.name}
                          onClick={() => handleSort(col.name)}
                          className={cn(
                            "px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-[#e8d4b8] dark:hover:bg-[#3d3628] transition-colors",
                            col.readonly && "text-gray-500"
                          )}
                        >
                          <div className="flex items-center gap-1">
                            <span className="truncate">{col.name}</span>
                            {sortBy === col.name ? (
                              sortOrder === "asc" ? (
                                <ArrowUp className="h-3 w-3" />
                              ) : (
                                <ArrowDown className="h-3 w-3" />
                              )
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-30" />
                            )}
                          </div>
                          <div className="text-[10px] font-normal text-gray-400">
                            {col.type}
                            {col.readonly && " (ro)"}
                          </div>
                        </th>
                      ))}
                      <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 w-24">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-[#1a1a1a] divide-y divide-[#e8d4b8] dark:divide-[#6b5a4a]">
                    {/* Create row */}
                    {isCreating && (
                      <tr className="bg-green-50 dark:bg-green-900/20">
                        {visibleColumns.map((col) => (
                          <td key={col.name} className="px-3 py-2">
                            {col.readonly || col.primary_key ? (
                              <span className="text-gray-400 italic">auto</span>
                            ) : (
                              <input
                                type={col.type === "integer" || col.type === "decimal" ? "number" : "text"}
                                value={String(newRowData[col.name] ?? "")}
                                onChange={(e) =>
                                  setNewRowData((prev) => ({
                                    ...prev,
                                    [col.name]: e.target.value || null,
                                  }))
                                }
                                className="w-full px-2 py-1 text-sm border border-green-300 dark:border-green-700 rounded bg-white dark:bg-[#1a1a1a]"
                              />
                            )}
                          </td>
                        ))}
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={handleSaveCreate}
                              disabled={isSubmitting}
                              className="p-1 rounded hover:bg-green-200 dark:hover:bg-green-800 text-green-600"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={handleCancelCreate}
                              disabled={isSubmitting}
                              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Data rows */}
                    {rows.map((row) => {
                      const rowId = row[pkColumn] as number;
                      const isEditing = editingRow?.[pkColumn] === rowId;
                      const isDeleting = deleteConfirm === rowId;

                      return (
                        <tr
                          key={rowId}
                          className={cn(
                            isEditing && "bg-blue-50 dark:bg-blue-900/20",
                            isDeleting && "bg-red-50 dark:bg-red-900/20"
                          )}
                        >
                          {visibleColumns.map((col) => (
                            <td key={col.name} className="px-3 py-2">
                              {isEditing && !col.readonly ? (
                                <input
                                  type={col.type === "integer" || col.type === "decimal" ? "number" : "text"}
                                  value={String(editedData[col.name] ?? "")}
                                  onChange={(e) =>
                                    setEditedData((prev) => ({
                                      ...prev,
                                      [col.name]: e.target.value || null,
                                    }))
                                  }
                                  className="w-full px-2 py-1 text-sm border border-blue-300 dark:border-blue-700 rounded bg-white dark:bg-[#1a1a1a]"
                                />
                              ) : (
                                <span
                                  className={cn(
                                    "truncate block max-w-[200px]",
                                    row[col.name] === null && "text-gray-400 italic"
                                  )}
                                  title={renderCellValue(row[col.name], col.type)}
                                >
                                  {renderCellValue(row[col.name], col.type)}
                                </span>
                              )}
                            </td>
                          ))}
                          <td className="px-3 py-2">
                            {isEditing ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={handleSaveEdit}
                                  disabled={isSubmitting}
                                  className="p-1 rounded hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-600"
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  disabled={isSubmitting}
                                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ) : isDeleting ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleDelete(rowId)}
                                  disabled={isSubmitting}
                                  className="p-1 rounded hover:bg-red-200 dark:hover:bg-red-800 text-red-600 text-xs"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(null)}
                                  disabled={isSubmitting}
                                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleStartEdit(row)}
                                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500"
                                  title="Edit"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(rowId)}
                                  className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600"
                                  title="Delete"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {rows.length === 0 && !isCreating && (
                      <tr>
                        <td
                          colSpan={visibleColumns.length + 1}
                          className="px-3 py-8 text-center text-gray-500"
                        >
                          No rows found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex-shrink-0 px-4 sm:px-6 pb-4 flex items-center justify-between">
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
      </DeskSurface>
    </SuperAdminPageGuard>
  );
}
