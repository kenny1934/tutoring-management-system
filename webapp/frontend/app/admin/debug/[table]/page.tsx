"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { SuperAdminPageGuard } from "@/components/auth/SuperAdminPageGuard";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { debugAPI } from "@/lib/api";
import { usePageTitle, useDebouncedValue } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import { cn } from "@/lib/utils";
import type { DebugTableSchema, DebugColumn, DebugRow, PaginatedRows } from "@/types/debug";
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
  Download,
  Columns3,
  Eye,
  EyeOff,
  CheckSquare,
  Square,
  Expand,
  FileDown,
  ExternalLink,
} from "lucide-react";

// Shared constant for pagination (should match backend default)
const PAGE_SIZE = 50;
// Debounce delay for search input (ms)
const SEARCH_DEBOUNCE_MS = 500;

export default function TableBrowserPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const tableName = params.table as string;
  const urlFilter = searchParams.get("filter");

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

  // Column visibility - persisted to localStorage
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`debug_hidden_cols_${tableName}`);
        if (saved) return new Set(JSON.parse(saved));
      } catch {
        // Ignore parse errors
      }
    }
    return new Set();
  });
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const columnMenuRef = useRef<HTMLDivElement>(null);

  // Persist column visibility changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(
          `debug_hidden_cols_${tableName}`,
          JSON.stringify([...hiddenColumns])
        );
      } catch {
        // Ignore quota errors
      }
    }
  }, [hiddenColumns, tableName]);

  // Bulk operations
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkEditColumn, setBulkEditColumn] = useState<string>("");
  const [bulkEditValue, setBulkEditValue] = useState<unknown>(null);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // Export
  const [isExporting, setIsExporting] = useState(false);

  // Search all columns toggle
  const [searchAll, setSearchAll] = useState(false);

  // Show deleted rows toggle (for soft delete tables)
  const [showDeleted, setShowDeleted] = useState(false);

  // Cell detail modal
  const [detailCell, setDetailCell] = useState<{ value: unknown; column: string } | null>(null);

  // FK preview popover
  const [fkPreview, setFkPreview] = useState<{
    tableName: string;
    rowId: number;
    columnName: string;
    position: { x: number; y: number };
  } | null>(null);
  const [fkPreviewData, setFkPreviewData] = useState<DebugRow | null>(null);
  const [fkPreviewLoading, setFkPreviewLoading] = useState(false);

  const debouncedSearch = useDebouncedValue(searchQuery, SEARCH_DEBOUNCE_MS);

  // Handle click outside to close column menu
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        columnMenuRef.current &&
        !columnMenuRef.current.contains(event.target as Node)
      ) {
        setShowColumnMenu(false);
      }
    }
    if (showColumnMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showColumnMenu]);

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
          searchAll,
          showDeleted,
          sortBy,
          sortOrder,
          urlFilter,
        ]
      : null,
    () =>
      debugAPI.getRows(tableName, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        search: debouncedSearch || undefined,
        search_all: searchAll || undefined,
        include_deleted: showDeleted || undefined,
        sort_by: sortBy || undefined,
        sort_order: sortOrder,
        filter: urlFilter || undefined,
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

  // Validate required fields before submission
  const validateRequiredFields = useCallback((
    data: Record<string, unknown>,
    isCreate: boolean
  ): { valid: boolean; error?: string } => {
    if (!schema) return { valid: false, error: "Schema not loaded" };

    for (const col of schema.columns) {
      // Skip primary key for create (auto-generated)
      if (col.primary_key && isCreate) continue;
      // Skip readonly columns
      if (col.readonly) continue;
      // Check if required field is missing or null
      if (!col.nullable) {
        const value = data[col.name];
        if (value === null || value === undefined || value === "") {
          return {
            valid: false,
            error: `Required field "${col.name}" is missing`,
          };
        }
      }
    }
    return { valid: true };
  }, [schema]);

  const handleSaveEdit = useCallback(async () => {
    if (!editingRow || !schema) return;

    // Validate required fields
    const validation = validateRequiredFields(editedData, false);
    if (!validation.valid) {
      showToast(validation.error || "Validation failed", "error");
      return;
    }

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
  }, [editingRow, editedData, schema, tableName, pkColumn, mutate, handleCancelEdit, showToast, validateRequiredFields]);

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

    // Validate required fields
    const validation = validateRequiredFields(newRowData, true);
    if (!validation.valid) {
      showToast(validation.error || "Validation failed", "error");
      return;
    }

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

  // Handle Escape key to close menus and modals
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (fkPreview) setFkPreview(null);
        else if (showBulkDeleteConfirm) setShowBulkDeleteConfirm(false);
        else if (detailCell) setDetailCell(null);
        else if (showColumnMenu) setShowColumnMenu(false);
        else if (isCreating) handleCancelCreate();
        else if (editingRow) handleCancelEdit();
        else if (deleteConfirm) setDeleteConfirm(null);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [fkPreview, showBulkDeleteConfirm, detailCell, showColumnMenu, isCreating, editingRow, deleteConfirm, handleCancelCreate, handleCancelEdit]);

  // Fetch FK preview data
  useEffect(() => {
    if (!fkPreview) {
      setFkPreviewData(null);
      return;
    }

    let cancelled = false;
    setFkPreviewLoading(true);
    debugAPI.getRow(fkPreview.tableName, fkPreview.rowId)
      .then((data) => { if (!cancelled) setFkPreviewData(data); })
      .catch(() => { if (!cancelled) setFkPreviewData(null); })
      .finally(() => { if (!cancelled) setFkPreviewLoading(false); });

    return () => { cancelled = true; };
  }, [fkPreview]);

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

  // Handle bulk delete
  const handleBulkDelete = useCallback(async () => {
    if (selectedRows.size === 0) return;

    setIsBulkDeleting(true);
    try {
      const result = await debugAPI.bulkDeleteRows(tableName, Array.from(selectedRows));
      showToast(`${result.deleted_count} rows deleted`, "success");
      mutate();
      setSelectedRows(new Set());
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Bulk delete failed", "error");
    } finally {
      setIsBulkDeleting(false);
    }
  }, [tableName, selectedRows, mutate]);

  // Handle bulk update
  const handleBulkUpdate = useCallback(async () => {
    if (selectedRows.size === 0 || !bulkEditColumn) return;

    setIsBulkUpdating(true);
    try {
      const result = await debugAPI.bulkUpdateRows(
        tableName,
        Array.from(selectedRows),
        bulkEditColumn,
        bulkEditValue
      );
      showToast(`${result.updated_count} rows updated`, "success");
      mutate();
      setSelectedRows(new Set());
      setShowBulkEdit(false);
      setBulkEditColumn("");
      setBulkEditValue(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Bulk update failed", "error");
    } finally {
      setIsBulkUpdating(false);
    }
  }, [tableName, selectedRows, bulkEditColumn, bulkEditValue, mutate]);

  // Handle export
  const handleExport = useCallback(async (format: "csv" | "json") => {
    setIsExporting(true);
    try {
      const blob = await debugAPI.exportTable(tableName, format, 10000);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${tableName}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Exported ${tableName}.${format}`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Export failed", "error");
    } finally {
      setIsExporting(false);
    }
  }, [tableName]);

  // Toggle row selection
  const toggleRowSelection = useCallback((rowId: number) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }, []);

  // Toggle all visible rows
  const toggleSelectAll = useCallback(() => {
    if (selectedRows.size === rows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(rows.map(r => r[pkColumn] as number)));
    }
  }, [rows, pkColumn, selectedRows.size]);

  // Toggle column visibility
  const toggleColumnVisibility = useCallback((colName: string) => {
    setHiddenColumns(prev => {
      const next = new Set(prev);
      if (next.has(colName)) {
        next.delete(colName);
      } else {
        next.add(colName);
      }
      return next;
    });
  }, []);

  // Check if value looks like binary/base64 data
  const isBinaryData = (value: unknown): boolean => {
    if (typeof value !== "string") return false;
    // Detect base64-encoded binary data (common patterns)
    if (value.startsWith("base64:") || value.startsWith("data:")) return true;
    // Heuristic: long strings with base64 alphabet and no spaces
    if (value.length > 100 && /^[A-Za-z0-9+/=]+$/.test(value)) return true;
    return false;
  };

  // Get byte size from base64 string
  const getBase64ByteSize = (value: string): number => {
    const base64 = value.replace(/^(base64:|data:[^,]+,)/, "");
    // Base64 encodes 3 bytes into 4 characters
    const padding = (base64.match(/=/g) || []).length;
    return Math.floor((base64.length * 3) / 4) - padding;
  };

  // Render cell value
  const renderCellValue = (value: unknown, columnType: string): string => {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (columnType === "binary" || isBinaryData(value)) {
      const byteSize = typeof value === "string" ? getBase64ByteSize(value) : 0;
      const sizeStr = byteSize >= 1024
        ? `${(byteSize / 1024).toFixed(1)} KB`
        : `${byteSize} bytes`;
      return `[Binary: ${sizeStr}]`;
    }
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  // Find column info
  const getColumnInfo = (colName: string) =>
    schema?.columns.find((c) => c.name === colName);

  // Get input type based on column type
  const getInputType = (col: DebugColumn): string => {
    switch (col.type) {
      case "integer":
      case "decimal":
        return "number";
      case "date":
        return "date";
      case "datetime":
        return "datetime-local";
      case "boolean":
        return "checkbox";
      default:
        return "text";
    }
  };

  // Convert value for the correct input type
  const formatValueForInput = (value: unknown, col: DebugColumn): string | boolean => {
    if (value === null || value === undefined) {
      if (col.type === "boolean") return false;
      return "";
    }
    if (col.type === "boolean") return Boolean(value);
    if (col.type === "datetime" && typeof value === "string") {
      // Convert ISO string to datetime-local format (remove Z and seconds)
      return value.replace("Z", "").split(".")[0];
    }
    if (col.type === "date" && typeof value === "string") {
      // Ensure YYYY-MM-DD format
      return value.split("T")[0];
    }
    return String(value);
  };

  // Parse input value to proper type
  const parseInputValue = (value: string | boolean, col: DebugColumn): unknown => {
    if (col.type === "boolean") return Boolean(value);
    if (value === "" || value === null) return null;
    if (col.type === "integer") {
      const parsed = parseInt(String(value), 10);
      return isNaN(parsed) ? null : parsed;
    }
    if (col.type === "decimal") {
      const parsed = parseFloat(String(value));
      return isNaN(parsed) ? null : parsed;
    }
    return value;
  };


  // Check if cell value is long (for showing expand button)
  const isLongValue = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    const str = typeof value === "object" ? JSON.stringify(value) : String(value);
    return str.length > 50;
  };

  // Visible columns (respecting hiddenColumns)
  const visibleColumns = useMemo(() => {
    if (!schema) return [];
    // Filter out hidden columns, but always show primary key first
    const pk = schema.columns.find((c) => c.primary_key);
    const others = schema.columns.filter(
      (c) => !c.primary_key && !hiddenColumns.has(c.name)
    );
    if (pk && !hiddenColumns.has(pk.name)) {
      return [pk, ...others];
    }
    return others;
  }, [schema, hiddenColumns]);

  return (
    <SuperAdminPageGuard>
      <DeskSurface fullHeight>
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex-shrink-0 desk-background border-b border-[#6b5a4a]/30">
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
                  placeholder={searchAll ? "Search all text columns..." : `Search ${schema?.search_columns.join(", ") || ""}...`}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(0);
                  }}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a] placeholder-gray-400"
                />
              </div>

              {/* Search all toggle */}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={searchAll}
                  onChange={(e) => {
                    setSearchAll(e.target.checked);
                    setPage(0);
                  }}
                  className="h-4 w-4 rounded border-[#e8d4b8] text-[#a0704b] focus:ring-[#a0704b]"
                />
                <span className="text-gray-600 dark:text-gray-400 hidden sm:inline">All columns</span>
              </label>

              {/* Show deleted toggle (only for soft delete tables) */}
              {schema?.has_soft_delete && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showDeleted}
                    onChange={(e) => {
                      setShowDeleted(e.target.checked);
                      setPage(0);
                    }}
                    className="h-4 w-4 rounded border-[#e8d4b8] text-amber-500 focus:ring-amber-500"
                  />
                  <span className="text-gray-600 dark:text-gray-400 hidden sm:inline">Show deleted</span>
                </label>
              )}

              {/* Column visibility dropdown */}
              <div className="relative" ref={columnMenuRef}>
                <button
                  onClick={() => setShowColumnMenu(!showColumnMenu)}
                  className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors"
                  title="Toggle columns"
                >
                  <Columns3 className="h-4 w-4" />
                  <span className="hidden sm:inline">Columns</span>
                </button>
                {showColumnMenu && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-56 max-h-80 overflow-y-auto rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] shadow-lg">
                    <div className="p-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
                      <button
                        onClick={() => setHiddenColumns(new Set())}
                        className="text-xs text-[#a0704b] hover:underline"
                      >
                        Show all
                      </button>
                    </div>
                    {schema?.columns.map((col) => (
                      <button
                        key={col.name}
                        onClick={() => toggleColumnVisibility(col.name)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
                      >
                        {hiddenColumns.has(col.name) ? (
                          <EyeOff className="h-4 w-4 text-gray-400" />
                        ) : (
                          <Eye className="h-4 w-4 text-[#a0704b]" />
                        )}
                        <span className={cn(
                          "truncate",
                          hiddenColumns.has(col.name) && "text-gray-400"
                        )}>
                          {col.name}
                        </span>
                        {col.primary_key && (
                          <span className="ml-auto text-[10px] text-gray-400">PK</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Export dropdown */}
              <div className="relative group">
                <button
                  disabled={isExporting}
                  className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors disabled:opacity-50"
                  title="Export table"
                >
                  {isExporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">Export</span>
                </button>
                <div className="absolute right-0 top-full mt-1 z-50 hidden group-hover:block w-32 rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] shadow-lg">
                  <button
                    onClick={() => handleExport("csv")}
                    disabled={isExporting}
                    className="w-full px-3 py-2 text-sm text-left hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
                  >
                    CSV
                  </button>
                  <button
                    onClick={() => handleExport("json")}
                    disabled={isExporting}
                    className="w-full px-3 py-2 text-sm text-left hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
                  >
                    JSON
                  </button>
                </div>
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

            {/* Bulk selection bar */}
            {selectedRows.size > 0 && (
              <div className="mx-4 sm:mx-6 mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 flex flex-wrap items-center gap-4">
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  {selectedRows.size} row{selectedRows.size !== 1 ? "s" : ""} selected
                </span>
                <button
                  onClick={() => setShowBulkEdit(true)}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-[#a0704b] text-white hover:bg-[#8a5f3e] transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                  Edit Selected
                </button>
                {(schema?.allow_hard_delete || schema?.has_soft_delete) && (
                  <button
                    onClick={() => setShowBulkDeleteConfirm(true)}
                    disabled={isBulkDeleting}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {isBulkDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    {schema?.has_soft_delete ? "Soft Delete" : "Delete"} Selected
                  </button>
                )}
                {!schema?.allow_hard_delete && !schema?.has_soft_delete && (
                  <span className="text-sm text-amber-600 dark:text-amber-400">
                    Delete not allowed for this table
                  </span>
                )}
                <button
                  onClick={() => setSelectedRows(new Set())}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Clear selection
                </button>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="flex-1 min-h-0 overflow-auto mx-4 sm:mx-6 mb-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-[#a0704b]" />
              </div>
            ) : (
              <>
              {/* Schema error state */}
              {schema && !schema.primary_key && (
                <div className="mb-4 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Schema Warning</p>
                      <p className="text-sm">No primary key defined for this table. Edit and delete operations may not work correctly.</p>
                    </div>
                  </div>
                </div>
              )}
              <div className="rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] overflow-x-auto">
                <table className="w-full min-w-max text-sm" role="grid">
                  <caption className="sr-only">
                    {schema?.display_name || tableName} table with {totalRows} rows.
                    {schema?.search_columns.length ? ` Searchable by: ${schema.search_columns.join(", ")}.` : ""}
                  </caption>
                  <thead className="bg-[#f5ede3] dark:bg-[#2d2618] sticky top-0">
                    <tr>
                      {/* Bulk select checkbox */}
                      <th className="px-3 py-2 w-10">
                        <button
                          onClick={toggleSelectAll}
                          className="p-0.5 rounded hover:bg-[#e8d4b8] dark:hover:bg-[#3d3628]"
                          aria-label={selectedRows.size === rows.length ? "Deselect all" : "Select all"}
                        >
                          {selectedRows.size === rows.length && rows.length > 0 ? (
                            <CheckSquare className="h-4 w-4 text-[#a0704b]" />
                          ) : (
                            <Square className="h-4 w-4 text-gray-400" />
                          )}
                        </button>
                      </th>
                      {visibleColumns.map((col) => (
                        <th
                          key={col.name}
                          onClick={() => handleSort(col.name)}
                          className={cn(
                            "px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-[#e8d4b8] dark:hover:bg-[#3d3628] transition-colors",
                            col.readonly && "text-gray-500"
                          )}
                          aria-label={`Sort by ${col.name}`}
                          aria-sort={sortBy === col.name ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                          role="columnheader"
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
                        <td className="px-3 py-2" /> {/* Empty checkbox cell */}
                        {visibleColumns.map((col) => (
                          <td key={col.name} className="px-3 py-2">
                            {col.readonly || col.primary_key ? (
                              <span className="text-gray-400 italic">auto</span>
                            ) : col.type === "boolean" ? (
                              <input
                                type="checkbox"
                                checked={Boolean(newRowData[col.name])}
                                onChange={(e) =>
                                  setNewRowData((prev) => ({
                                    ...prev,
                                    [col.name]: e.target.checked,
                                  }))
                                }
                                className="h-4 w-4 rounded border-green-300 text-green-600 focus:ring-green-500"
                              />
                            ) : (
                              <input
                                type={getInputType(col)}
                                value={String(formatValueForInput(newRowData[col.name], col))}
                                step={col.type === "decimal" ? "0.01" : undefined}
                                onChange={(e) =>
                                  setNewRowData((prev) => ({
                                    ...prev,
                                    [col.name]: parseInputValue(e.target.value, col),
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
                              aria-label="Save new row"
                            >
                              {isSubmitting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              onClick={handleCancelCreate}
                              disabled={isSubmitting}
                              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500"
                              aria-label="Cancel create"
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
                      const isSelected = selectedRows.has(rowId);
                      const isSoftDeleted = schema?.has_soft_delete && row.deleted_at !== null;

                      return (
                        <tr
                          key={rowId}
                          className={cn(
                            isEditing && "bg-blue-50 dark:bg-blue-900/20",
                            isDeleting && "bg-red-50 dark:bg-red-900/20",
                            isSelected && !isEditing && !isDeleting && "bg-blue-50/50 dark:bg-blue-900/10",
                            isSoftDeleted && !isEditing && !isDeleting && "opacity-50 bg-gray-100 dark:bg-gray-800/50"
                          )}
                        >
                          {/* Selection checkbox */}
                          <td className="px-3 py-2">
                            <button
                              onClick={() => toggleRowSelection(rowId)}
                              className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                              aria-label={isSelected ? "Deselect row" : "Select row"}
                            >
                              {isSelected ? (
                                <CheckSquare className="h-4 w-4 text-[#a0704b]" />
                              ) : (
                                <Square className="h-4 w-4 text-gray-400" />
                              )}
                            </button>
                          </td>
                          {visibleColumns.map((col) => (
                            <td key={col.name} className="px-3 py-2">
                              {isEditing && !col.readonly ? (
                                col.type === "boolean" ? (
                                  <input
                                    type="checkbox"
                                    checked={Boolean(editedData[col.name])}
                                    onChange={(e) =>
                                      setEditedData((prev) => ({
                                        ...prev,
                                        [col.name]: e.target.checked,
                                      }))
                                    }
                                    className="h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                                  />
                                ) : (
                                  <input
                                    type={getInputType(col)}
                                    value={String(formatValueForInput(editedData[col.name], col))}
                                    step={col.type === "decimal" ? "0.01" : undefined}
                                    onChange={(e) =>
                                      setEditedData((prev) => ({
                                        ...prev,
                                        [col.name]: parseInputValue(e.target.value, col),
                                      }))
                                    }
                                    className="w-full px-2 py-1 text-sm border border-blue-300 dark:border-blue-700 rounded bg-white dark:bg-[#1a1a1a]"
                                  />
                                )
                              ) : (
                                <div className="flex items-center gap-1">
                                  {/* FK preview button */}
                                  {schema?.foreign_keys[col.name] && row[col.name] !== null ? (
                                    <button
                                      onClick={(e) => {
                                        const fkInfo = schema.foreign_keys[col.name];
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setFkPreview({
                                          tableName: fkInfo.table,
                                          rowId: row[col.name] as number,
                                          columnName: fkInfo.column,
                                          position: { x: Math.min(rect.left, window.innerWidth - 420), y: rect.bottom + 8 },
                                        });
                                      }}
                                      className="flex items-center gap-1 text-[#a0704b] hover:underline truncate max-w-[200px]"
                                      title={`Preview ${schema.foreign_keys[col.name].table} record`}
                                    >
                                      {renderCellValue(row[col.name], col.type)}
                                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                    </button>
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
                                  {isLongValue(row[col.name]) && !schema?.foreign_keys[col.name] && (
                                    <button
                                      onClick={() => setDetailCell({ value: row[col.name], column: col.name })}
                                      className="flex-shrink-0 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400"
                                      aria-label="View full value"
                                    >
                                      <Expand className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
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
                                  aria-label="Save changes"
                                >
                                  {isSubmitting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Check className="h-4 w-4" />
                                  )}
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  disabled={isSubmitting}
                                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500"
                                  aria-label="Cancel edit"
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
                                  aria-label="Confirm delete"
                                >
                                  {isSubmitting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    "Confirm"
                                  )}
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(null)}
                                  disabled={isSubmitting}
                                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500"
                                  aria-label="Cancel delete"
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
                                  aria-label="Edit row"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                {(schema?.allow_hard_delete || schema?.has_soft_delete) && (
                                  <button
                                    onClick={() => setDeleteConfirm(rowId)}
                                    className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600"
                                    title={schema?.has_soft_delete ? "Soft Delete" : "Delete"}
                                    aria-label={schema?.has_soft_delete ? "Soft delete row" : "Delete row"}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {rows.length === 0 && !isCreating && (
                      <tr>
                        <td
                          colSpan={visibleColumns.length + 2}
                          className="px-3 py-8 text-center text-gray-500"
                        >
                          No rows found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              </>
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

        {/* Detail cell modal */}
        {detailCell && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setDetailCell(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-cell-title"
          >
            <div
              className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-xl max-w-[42rem] w-full mx-4 max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
                <h3 id="detail-cell-title" className="font-semibold text-gray-900 dark:text-gray-100">
                  {detailCell.column}
                </h3>
                <button
                  onClick={() => setDetailCell(null)}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4 overflow-auto flex-1">
                {isBinaryData(detailCell.value) ? (
                  <div className="flex flex-col items-center gap-4 py-8">
                    <div className="p-4 rounded-full bg-gray-100 dark:bg-gray-800">
                      <FileDown className="h-8 w-8 text-gray-500" />
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-gray-900 dark:text-gray-100">Binary Data</p>
                      <p className="text-sm text-gray-500">
                        {typeof detailCell.value === "string"
                          ? (() => {
                              const bytes = getBase64ByteSize(detailCell.value);
                              return bytes >= 1024
                                ? `${(bytes / 1024).toFixed(1)} KB`
                                : `${bytes} bytes`;
                            })()
                          : "Unknown size"}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (typeof detailCell.value === "string") {
                          const base64 = detailCell.value.replace(/^(base64:|data:[^,]+,)/, "");
                          const binary = atob(base64);
                          const bytes = new Uint8Array(binary.length);
                          for (let i = 0; i < binary.length; i++) {
                            bytes[i] = binary.charCodeAt(i);
                          }
                          const blob = new Blob([bytes]);
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `${tableName}_${detailCell.column}.bin`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#a0704b] text-white hover:bg-[#8a5f3e] transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </button>
                  </div>
                ) : (
                  <pre className="text-sm whitespace-pre-wrap break-words font-mono bg-gray-50 dark:bg-[#2d2618] p-4 rounded-lg">
                    {typeof detailCell.value === "object"
                      ? JSON.stringify(detailCell.value, null, 2)
                      : String(detailCell.value)}
                  </pre>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Bulk edit modal */}
        {showBulkEdit && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setShowBulkEdit(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-edit-title"
          >
            <div
              className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-xl max-w-md w-full mx-4 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
                <h3 id="bulk-edit-title" className="font-semibold text-gray-900 dark:text-gray-100">
                  Bulk Edit {selectedRows.size} Row{selectedRows.size !== 1 ? "s" : ""}
                </h3>
                <button
                  onClick={() => setShowBulkEdit(false)}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Column to update
                  </label>
                  <select
                    value={bulkEditColumn}
                    onChange={(e) => {
                      setBulkEditColumn(e.target.value);
                      setBulkEditValue(null);
                    }}
                    className="w-full px-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a]"
                  >
                    <option value="">Select column...</option>
                    {schema?.columns
                      .filter((col) => !col.readonly && !col.primary_key && !schema?.foreign_keys[col.name])
                      .map((col) => (
                        <option key={col.name} value={col.name}>
                          {col.name} ({col.type})
                        </option>
                      ))}
                  </select>
                </div>

                {bulkEditColumn && (() => {
                  const col = schema?.columns.find((c) => c.name === bulkEditColumn);
                  if (!col) return null;

                  return (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        New value
                      </label>
                      {col.type === "boolean" ? (
                        <select
                          value={bulkEditValue === true ? "true" : bulkEditValue === false ? "false" : ""}
                          onChange={(e) => setBulkEditValue(e.target.value === "true")}
                          className="w-full px-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a]"
                        >
                          <option value="">Select...</option>
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      ) : (
                        <input
                          type={col.type === "integer" || col.type === "decimal" ? "number" : col.type === "date" ? "date" : col.type === "datetime" ? "datetime-local" : "text"}
                          value={bulkEditValue === null ? "" : String(bulkEditValue)}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "") {
                              setBulkEditValue(null);
                            } else if (col.type === "integer") {
                              setBulkEditValue(parseInt(v, 10) || null);
                            } else if (col.type === "decimal") {
                              setBulkEditValue(parseFloat(v) || null);
                            } else {
                              setBulkEditValue(v);
                            }
                          }}
                          step={col.type === "decimal" ? "0.01" : undefined}
                          className="w-full px-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a]"
                          placeholder={col.nullable ? "Leave empty for NULL" : "Enter value"}
                        />
                      )}
                      {col.nullable && (
                        <p className="text-xs text-gray-500 mt-1">Leave empty to set NULL</p>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div className="flex items-center justify-end gap-3 p-4 border-t border-[#e8d4b8] dark:border-[#6b5a4a]">
                <button
                  onClick={() => setShowBulkEdit(false)}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkUpdate}
                  disabled={!bulkEditColumn || isBulkUpdating}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-[#a0704b] text-white hover:bg-[#8a5f3e] transition-colors disabled:opacity-50"
                >
                  {isBulkUpdating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Update {selectedRows.size} Rows
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk delete confirmation modal */}
        {showBulkDeleteConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setShowBulkDeleteConfirm(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-delete-title"
          >
            <div
              className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-xl w-[28rem] max-w-[calc(100%-2rem)] mx-4 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 p-4 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <h3 id="bulk-delete-title" className="font-semibold text-red-600">
                  Confirm Bulk Delete
                </h3>
              </div>
              <div className="p-4">
                <p className="text-gray-700 dark:text-gray-300">
                  Are you sure you want to delete{" "}
                  <strong className="text-gray-900 dark:text-gray-100">{selectedRows.size}</strong> row(s)
                  from <strong className="text-gray-900 dark:text-gray-100">{schema?.display_name || tableName}</strong>?
                </p>
                <p className="text-sm text-red-500 mt-2">
                  {schema?.has_soft_delete
                    ? "Rows will be soft-deleted (marked as deleted but preserved in database)."
                    : "This action cannot be undone."}
                </p>
              </div>
              <div className="flex justify-end gap-3 p-4 border-t border-[#e8d4b8] dark:border-[#6b5a4a]">
                <button
                  onClick={() => setShowBulkDeleteConfirm(false)}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowBulkDeleteConfirm(false);
                    handleBulkDelete();
                  }}
                  disabled={isBulkDeleting}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {isBulkDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Delete {selectedRows.size} Rows
                </button>
              </div>
            </div>
          </div>
        )}

        {/* FK preview popover */}
        {fkPreview && (
          <div
            className="fixed inset-0 z-50"
            onClick={() => setFkPreview(null)}
          >
            <div
              className="absolute bg-white dark:bg-[#1a1a1a] rounded-xl shadow-xl border border-[#e8d4b8] dark:border-[#6b5a4a] w-96 max-h-96 overflow-hidden flex flex-col"
              style={{
                left: Math.max(8, Math.min(fkPreview.position.x, window.innerWidth - 400)),
                top: Math.min(fkPreview.position.y, window.innerHeight - 400),
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a] flex-shrink-0">
                <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                  {fkPreview.tableName} #{fkPreview.rowId}
                </span>
                <button
                  onClick={() => setFkPreview(null)}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                  aria-label="Close preview"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-3 overflow-y-auto flex-1">
                {fkPreviewLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-[#a0704b]" />
                  </div>
                ) : fkPreviewData ? (
                  <div className="space-y-2 text-sm">
                    {Object.entries(fkPreviewData).slice(0, 10).map(([key, value]) => (
                      <div key={key} className="flex gap-2">
                        <span className="font-medium text-gray-500 dark:text-gray-400 min-w-[100px] flex-shrink-0 truncate">
                          {key}:
                        </span>
                        <span className="truncate text-gray-900 dark:text-gray-100">
                          {value === null ? (
                            <em className="text-gray-400">NULL</em>
                          ) : typeof value === "boolean" ? (
                            value ? "true" : "false"
                          ) : typeof value === "object" ? (
                            JSON.stringify(value)
                          ) : (
                            String(value)
                          )}
                        </span>
                      </div>
                    ))}
                    {Object.keys(fkPreviewData).length > 10 && (
                      <p className="text-xs text-gray-400 pt-1">
                        ...and {Object.keys(fkPreviewData).length - 10} more fields
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">Failed to load record</p>
                )}
              </div>
              <div className="p-3 border-t border-[#e8d4b8] dark:border-[#6b5a4a] flex-shrink-0">
                <Link
                  href={`/admin/debug/${fkPreview.tableName}?filter=${fkPreview.columnName}__eq:${fkPreview.rowId}`}
                  className="flex items-center justify-center gap-2 w-full px-3 py-2 text-sm font-medium rounded-lg bg-[#a0704b] text-white hover:bg-[#8a5f3e] transition-colors"
                >
                  Go to {fkPreview.tableName}
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </DeskSurface>
    </SuperAdminPageGuard>
  );
}
