"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect, memo } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { SuperAdminPageGuard } from "@/components/auth/SuperAdminPageGuard";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { debugAPI } from "@/lib/api";
import { usePageTitle, useDebouncedValue, useFocusTrap, useClickOutside, useModal } from "@/lib/hooks";
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
  Copy,
  Calendar,
  Hash,
  ToggleLeft,
  Type,
  Coins,
  Binary,
  Clock,
  Filter,
  ChevronDown,
  ChevronUp,
  Star,
  Bookmark,
  Save,
  Upload,
  FileUp,
  BarChart3,
  GitCompare,
  HelpCircle,
} from "lucide-react";

// Shared constants
const PAGE_SIZE = 50; // Should match backend default
const SEARCH_DEBOUNCE_MS = 500; // Debounce delay for search input
const FK_PREVIEW_TIMEOUT_MS = 5000; // Timeout for FK preview fetch
const MAX_PREVIEW_FIELDS = 10; // Max fields to show in FK preview
const TOP_VALUES_LIMIT = 5; // Max top values in column stats
const COLUMN_STATS_DECIMAL_PLACES = 2; // Decimal places for stats averages

// Table priority classifications for visual styling
const TABLE_CLASSIFICATIONS = {
  priority: ["session_log", "enrollments", "students"],
  reference: ["tutors", "discounts", "holidays"],
  supporting: ["calendar_events", "exam_revision_slots", "extension_requests", "parent_communications", "termination_records"],
} as const;

function getTablePriorityColor(tableName: string): string {
  if (TABLE_CLASSIFICATIONS.priority.includes(tableName as (typeof TABLE_CLASSIFICATIONS.priority)[number])) {
    return "bg-red-500";
  }
  if (TABLE_CLASSIFICATIONS.reference.includes(tableName as (typeof TABLE_CLASSIFICATIONS.reference)[number])) {
    return "bg-amber-500";
  }
  if (TABLE_CLASSIFICATIONS.supporting.includes(tableName as (typeof TABLE_CLASSIFICATIONS.supporting)[number])) {
    return "bg-blue-500";
  }
  return "bg-gray-400";
}

/**
 * Parse a CSV line properly, handling quoted fields with commas and escaped quotes.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote (double quote)
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i++;
        continue;
      }
      current += char;
      i++;
    } else {
      if (char === '"') {
        // Start of quoted field
        inQuotes = true;
        i++;
      } else if (char === ",") {
        // End of field
        result.push(current.trim());
        current = "";
        i++;
      } else {
        current += char;
        i++;
      }
    }
  }

  // Don't forget the last field
  result.push(current.trim());
  return result;
}
// ============================================================================
// TableDataRow - Memoized row component to prevent unnecessary re-renders
// ============================================================================

interface TableDataRowProps {
  row: DebugRow;
  rowIndex: number;
  rowId: number;
  visibleColumns: DebugColumn[];
  pkColumn: string;
  page: number;
  pageSize: number;
  isEditing: boolean;
  isDeleting: boolean;
  isSelected: boolean;
  isSoftDeleted: boolean;
  isFocused: boolean;
  editedData: Record<string, unknown>;
  editingRow: DebugRow | null;
  showEditDiff: boolean;
  hasSoftDelete: boolean;
  allowHardDelete: boolean;
  foreignKeys: Record<string, { table: string; column: string }>;
  isSubmitting: boolean;
  changedFields: Set<string>;
  // Callbacks
  onToggleSelect: (id: number) => void;
  onStartEdit: (row: DebugRow) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onSetDeleteConfirm: (id: number | null) => void;
  onDelete: (id: number) => void;
  onClone: (row: DebugRow) => void;
  onExpandCell: (value: unknown, column: string) => void;
  onFKPreview: (tableName: string, rowId: number, columnName: string, rect: DOMRect) => void;
  onEditDataChange: (col: string, value: unknown) => void;
  onToggleEditDiff: () => void;
  // Helper functions
  renderCellValue: (value: unknown, columnType: string) => string;
  formatValueForInput: (value: unknown, col: DebugColumn) => string | boolean;
  parseInputValue: (value: string | boolean, col: DebugColumn) => unknown;
  getInputType: (col: DebugColumn) => string;
  isLongValue: (value: unknown) => boolean;
}

const TableDataRow = memo(function TableDataRow({
  row,
  rowIndex,
  rowId,
  visibleColumns,
  pkColumn,
  page,
  pageSize,
  isEditing,
  isDeleting,
  isSelected,
  isSoftDeleted,
  isFocused,
  editedData,
  editingRow,
  showEditDiff,
  hasSoftDelete,
  allowHardDelete,
  foreignKeys,
  isSubmitting,
  changedFields,
  onToggleSelect,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onSetDeleteConfirm,
  onDelete,
  onClone,
  onExpandCell,
  onFKPreview,
  onEditDataChange,
  onToggleEditDiff,
  renderCellValue,
  formatValueForInput,
  parseInputValue,
  getInputType,
  isLongValue,
}: TableDataRowProps) {
  const isEven = rowIndex % 2 === 0;

  return (
    <tr
      aria-rowindex={page * pageSize + rowIndex + 2}
      aria-disabled={isSoftDeleted || undefined}
      tabIndex={isSoftDeleted ? -1 : undefined}
      className={cn(
        "debug-row-hover transition-colors",
        isEditing && "bg-blue-50 dark:bg-blue-900/20",
        isDeleting && "bg-red-50 dark:bg-red-900/20",
        isSelected && !isEditing && !isDeleting && "bg-blue-50/50 dark:bg-blue-900/10",
        isSoftDeleted && !isEditing && !isDeleting && "opacity-50 bg-gray-100 dark:bg-gray-800/50",
        !isEditing && !isDeleting && !isSelected && !isSoftDeleted && isEven && "debug-row-even",
        isFocused && !isEditing && !isDeleting && "debug-row-focused"
      )}
    >
      {/* Selection checkbox */}
      <td className="px-3 py-2">
        <button
          onClick={() => onToggleSelect(rowId)}
          className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          aria-label={isSelected ? "Deselect row" : "Select row"}
        >
          {isSelected ? (
            <CheckSquare className="h-4 w-4 text-[#a0704b]" aria-hidden="true" />
          ) : (
            <Square className="h-4 w-4 text-gray-400" aria-hidden="true" />
          )}
        </button>
      </td>
      {visibleColumns.map((col, colIndex) => (
        <td
          key={col.name}
          aria-colindex={colIndex + 2}
          className={cn(
            "px-3 py-2",
            col.primary_key && "sticky-pk-column bg-white dark:bg-[#1a1a1a]",
            foreignKeys[col.name] && "fk-column-cell",
            isEditing && changedFields.has(col.name) && "diff-cell-changed"
          )}
        >
          {isEditing && !col.readonly ? (
            <div className="relative">
              {col.type === "boolean" ? (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(editedData[col.name])}
                    onChange={(e) => onEditDataChange(col.name, e.target.checked)}
                    className={cn(
                      "h-4 w-4 rounded text-blue-600 focus:ring-blue-500",
                      changedFields.has(col.name)
                        ? "border-amber-500 ring-2 ring-amber-200 dark:ring-amber-800"
                        : "border-blue-300"
                    )}
                  />
                  {showEditDiff && changedFields.has(col.name) && editingRow && (
                    <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                      <GitCompare className="h-3 w-3" aria-hidden="true" />
                      was {editingRow[col.name] ? "true" : "false"}
                    </span>
                  )}
                </div>
              ) : (
                <>
                  <input
                    type={getInputType(col)}
                    value={String(formatValueForInput(editedData[col.name], col))}
                    step={col.type === "decimal" ? "0.01" : undefined}
                    onChange={(e) => onEditDataChange(col.name, parseInputValue(e.target.value, col))}
                    className={cn(
                      "w-full px-2 py-1 text-sm rounded bg-white dark:bg-[#1a1a1a]",
                      changedFields.has(col.name)
                        ? "border-2 border-amber-500 dark:border-amber-600 ring-2 ring-amber-200/50 dark:ring-amber-800/50"
                        : "border border-blue-300 dark:border-blue-700"
                    )}
                  />
                  {showEditDiff && changedFields.has(col.name) && editingRow && (
                    <div className="mt-1 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 truncate">
                      <GitCompare className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate" title={renderCellValue(editingRow[col.name], col.type)}>
                        was: {renderCellValue(editingRow[col.name], col.type) || <em className="text-gray-400">empty</em>}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1">
              {/* FK preview button */}
              {foreignKeys[col.name] && row[col.name] !== null ? (
                <button
                  onClick={(e) => {
                    const fkInfo = foreignKeys[col.name];
                    const rect = e.currentTarget.getBoundingClientRect();
                    onFKPreview(fkInfo.table, row[col.name] as number, fkInfo.column, rect);
                  }}
                  className="flex items-center gap-1 text-[#a0704b] hover:underline truncate max-w-[200px]"
                  title={`Preview ${foreignKeys[col.name].table} record`}
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
              {isLongValue(row[col.name]) && !foreignKeys[col.name] && (
                <button
                  onClick={() => onExpandCell(row[col.name], col.name)}
                  className="flex-shrink-0 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400"
                  aria-label="View full value"
                >
                  <Expand className="h-3 w-3" aria-hidden="true" />
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
              onClick={onToggleEditDiff}
              className={cn(
                "p-1 rounded btn-press",
                showEditDiff
                  ? "bg-amber-100 dark:bg-amber-900/40 text-amber-600"
                  : "hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400"
              )}
              title={showEditDiff ? "Hide diff" : "Show diff"}
              aria-label="Toggle diff view"
            >
              <GitCompare className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              onClick={onSaveEdit}
              disabled={isSubmitting}
              className="p-1 rounded hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-600"
              aria-label="Save changes"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
            <button
              onClick={onCancelEdit}
              disabled={isSubmitting}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500"
              aria-label="Cancel edit"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : isDeleting ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onDelete(rowId)}
              disabled={isSubmitting}
              className="p-1 rounded hover:bg-red-200 dark:hover:bg-red-800 text-red-600 text-xs"
              aria-label="Confirm delete"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                "Confirm"
              )}
            </button>
            <button
              onClick={() => onSetDeleteConfirm(null)}
              disabled={isSubmitting}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500"
              aria-label="Cancel delete"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onStartEdit(row)}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 btn-press"
              title="Edit"
              aria-label="Edit row"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              onClick={() => onClone(row)}
              className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-gray-500 hover:text-green-600 btn-press"
              title="Clone"
              aria-label="Clone row"
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
            </button>
            {(allowHardDelete || hasSoftDelete) && (
              <button
                onClick={() => onSetDeleteConfirm(rowId)}
                className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 btn-press"
                title={hasSoftDelete ? "Soft Delete" : "Delete"}
                aria-label={hasSoftDelete ? "Soft delete row" : "Delete row"}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
});

export default function TableBrowserPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const tableName = params.table as string;
  const urlFilter = searchParams.get("filter");

  usePageTitle(`Debug: ${tableName}`);

  // Initialize state from URL params
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("search") || "");
  const [page, setPage] = useState(() => {
    const urlPage = searchParams.get("page");
    return urlPage ? Math.max(0, parseInt(urlPage, 10) - 1) : 0;
  });
  const [sortBy, setSortBy] = useState<string | null>(() => searchParams.get("sort") || null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(() => {
    const urlOrder = searchParams.get("order");
    return urlOrder === "asc" ? "asc" : "desc";
  });
  const [editingRow, setEditingRow] = useState<DebugRow | null>(null);
  const [editedData, setEditedData] = useState<Record<string, unknown>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [newRowData, setNewRowData] = useState<Record<string, unknown>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Clone row
  const [cloneSource, setCloneSource] = useState<DebugRow | null>(null);

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
  const [columnSearchQuery, setColumnSearchQuery] = useState("");
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

  // Clear selected rows when switching tables
  useEffect(() => {
    setSelectedRows(new Set());
  }, [tableName]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkEditColumn, setBulkEditColumn] = useState<string>("");
  const [bulkEditValue, setBulkEditValue] = useState<unknown>(null);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // Export
  const [isExporting, setIsExporting] = useState(false);

  // Import
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState<string>("");
  const [importFormat, setImportFormat] = useState<"csv" | "json">("json");
  const [importPreview, setImportPreview] = useState<DebugRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  // Show diff when editing
  const [showEditDiff, setShowEditDiff] = useState(true);

  // Search all columns toggle
  const [searchAll, setSearchAll] = useState(false);

  // Show deleted rows toggle (for soft delete tables)
  const [showDeleted, setShowDeleted] = useState(false);

  // Cell detail modal
  const [detailCell, setDetailCell] = useState<{ value: unknown; column: string } | null>(null);

  // Keyboard navigation
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Modal refs for focus trapping
  const detailModalRef = useRef<HTMLDivElement>(null);
  const keyboardHelpModalRef = useRef<HTMLDivElement>(null);
  const statsModalRef = useRef<HTMLDivElement>(null);
  const importModalRef = useRef<HTMLDivElement>(null);
  const bulkEditModalRef = useRef<HTMLDivElement>(null);
  const bulkDeleteModalRef = useRef<HTMLDivElement>(null);
  const saveFilterModalRef = useRef<HTMLDivElement>(null);

  // Refs for keyboard handler to avoid excessive re-renders
  const keyboardStateRef = useRef({
    showKeyboardHelp: false,
    fkPreview: null as typeof fkPreview,
    showBulkDeleteConfirm: false,
    detailCell: null as typeof detailCell,
    showColumnMenu: false,
    isCreating: false,
    editingRow: null as typeof editingRow,
    deleteConfirm: null as typeof deleteConfirm,
    focusedRowIndex: null as number | null,
    rows: [] as typeof rows,
    pkColumn: "",
  });

  // Last refreshed timestamp
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // Quick filters
  const [showQuickFilters, setShowQuickFilters] = useState(false);
  const [activeQuickFilters, setActiveQuickFilters] = useState<Set<string>>(new Set());
  const [savedFilters, setSavedFilters] = useState<Array<{ name: string; filters: string[] }>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`debug_saved_filters_${tableName}`);
        if (saved) return JSON.parse(saved);
      } catch {
        // Ignore parse errors
      }
    }
    return [];
  });
  const [showSaveFilterModal, setShowSaveFilterModal] = useState(false);
  const [newFilterName, setNewFilterName] = useState("");

  // Column statistics
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [statsColumn, setStatsColumn] = useState<string | null>(null);

  // FK preview popover
  const [fkPreview, setFkPreview] = useState<{
    tableName: string;
    rowId: number;
    columnName: string;
    position: { x: number; y: number };
  } | null>(null);
  const [fkPreviewData, setFkPreviewData] = useState<DebugRow | null>(null);
  const [fkPreviewLoading, setFkPreviewLoading] = useState(false);

  // Focus trapping for modals (must be after all modal state declarations)
  useFocusTrap(!!detailCell, detailModalRef);
  useFocusTrap(showKeyboardHelp, keyboardHelpModalRef);
  useFocusTrap(showStatsModal, statsModalRef);
  useFocusTrap(showImportModal, importModalRef);
  useFocusTrap(showBulkEdit, bulkEditModalRef);
  useFocusTrap(showBulkDeleteConfirm, bulkDeleteModalRef);
  useFocusTrap(showSaveFilterModal, saveFilterModalRef);

  const debouncedSearch = useDebouncedValue(searchQuery, SEARCH_DEBOUNCE_MS);

  // Sync state to URL for bookmark/refresh persistence
  useEffect(() => {
    const params = new URLSearchParams();
    if (sortBy) params.set("sort", sortBy);
    if (sortOrder !== "desc") params.set("order", sortOrder);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (page > 0) params.set("page", String(page + 1));
    // Preserve existing filter param
    if (urlFilter) params.set("filter", urlFilter);

    const queryString = params.toString();
    const newUrl = queryString ? `?${queryString}` : window.location.pathname;

    // Only update if URL actually changed to avoid unnecessary history entries
    if (window.location.search !== (queryString ? `?${queryString}` : "")) {
      router.replace(newUrl, { scroll: false });
    }
  }, [sortBy, sortOrder, debouncedSearch, page, urlFilter, router]);

  // Handle click outside to close column menu
  useClickOutside(columnMenuRef, () => setShowColumnMenu(false), showColumnMenu);

  const { showToast } = useToast();

  // Fetch schema
  const { data: schema, isLoading: schemaLoading, error: schemaError, mutate: mutateSchema } = useSWR<DebugTableSchema>(
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

  // Update last refreshed timestamp when data changes
  useEffect(() => {
    if (rowsData && !rowsLoading) {
      setLastRefreshed(new Date());
    }
  }, [rowsData, rowsLoading]);

  // Get primary key column
  const pkColumn = schema?.primary_key || "id";

  // Safely get row ID with type validation
  const getRowId = useCallback((row: DebugRow): number | null => {
    const id = row[pkColumn];
    if (typeof id === "number") return id;
    if (typeof id === "string") {
      const parsed = parseInt(id, 10);
      if (!isNaN(parsed)) return parsed;
    }
    return null;
  }, [pkColumn]);

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
    setShowEditDiff(true); // Reset diff view for each new edit session
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

    const rowId = getRowId(editingRow);
    if (rowId === null) {
      showToast("Cannot update row: invalid primary key", "error");
      return;
    }

    // Validate required fields
    const validation = validateRequiredFields(editedData, false);
    if (!validation.valid) {
      showToast(validation.error || "Validation failed", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      await debugAPI.updateRow(tableName, rowId, editedData);
      showToast("Row updated successfully", "success");
      mutate();
      handleCancelEdit();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Update failed", "error");
    } finally {
      setIsSubmitting(false);
    }
  }, [editingRow, editedData, schema, tableName, getRowId, mutate, handleCancelEdit, showToast, validateRequiredFields]);

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
    setCloneSource(null);
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

  // Fetch FK preview data with timeout
  useEffect(() => {
    if (!fkPreview) {
      setFkPreviewData(null);
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) {
        setFkPreviewData(null);
        setFkPreviewLoading(false);
      }
    }, FK_PREVIEW_TIMEOUT_MS);

    setFkPreviewLoading(true);
    debugAPI.getRow(fkPreview.tableName, fkPreview.rowId)
      .then((data) => { if (!cancelled) setFkPreviewData(data); })
      .catch(() => { if (!cancelled) setFkPreviewData(null); })
      .finally(() => { if (!cancelled) { setFkPreviewLoading(false); clearTimeout(timeout); } });

    return () => { cancelled = true; clearTimeout(timeout); };
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
      // Pass current search/filter state to export
      const blob = await debugAPI.exportTable(tableName, format, 10000, {
        filter: debouncedSearch || undefined,
        includeDeleted: showDeleted,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Include "filtered" in filename if filters are active
      const suffix = debouncedSearch ? "_filtered" : "";
      a.download = `${tableName}${suffix}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      const filterNote = debouncedSearch ? " (filtered)" : "";
      showToast(`Exported ${tableName}.${format}${filterNote}`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Export failed", "error");
    } finally {
      setIsExporting(false);
    }
  }, [tableName, debouncedSearch, showDeleted]);

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
      const ids = rows.map(getRowId).filter((id): id is number => id !== null);
      setSelectedRows(new Set(ids));
    }
  }, [rows, getRowId, selectedRows.size]);

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
    // Explicit markers for base64 data
    if (value.startsWith("base64:") || value.startsWith("data:")) return true;
    // Heuristic: very long strings (>500 chars) with base64 alphabet, no spaces
    // Higher threshold to avoid false positives with API keys, tokens, etc.
    if (value.length > 500 && /^[A-Za-z0-9+/=]+$/.test(value) && !value.includes(" ")) return true;
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
      // Handle various datetime formats including timezone offsets
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          // Format as local datetime for input
          return date.toISOString().slice(0, 16);
        }
      } catch {
        // Fall through to regex fallback
      }
      // Fallback: remove timezone info
      return value.replace(/[Z+-]\d{2}:?\d{2}$/, "").replace("Z", "").split(".")[0];
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

  // Get icon for column type
  const getColumnTypeIcon = (type: string) => {
    switch (type) {
      case "integer":
        return <Hash className="h-3 w-3" aria-hidden="true" />;
      case "decimal":
        return <Coins className="h-3 w-3" aria-hidden="true" />;
      case "date":
        return <Calendar className="h-3 w-3" aria-hidden="true" />;
      case "datetime":
        return <Clock className="h-3 w-3" aria-hidden="true" />;
      case "boolean":
        return <ToggleLeft className="h-3 w-3" aria-hidden="true" />;
      case "binary":
        return <Binary className="h-3 w-3" aria-hidden="true" />;
      default:
        return <Type className="h-3 w-3" aria-hidden="true" />;
    }
  };

  // Handle clone row
  const handleCloneRow = useCallback((row: DebugRow) => {
    // Create a copy without the primary key
    const clonedData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (key !== pkColumn) {
        clonedData[key] = value;
      }
    }
    setCloneSource(row);
    setNewRowData(clonedData);
    setIsCreating(true);
    setEditingRow(null);
    setDeleteConfirm(null);
  }, [pkColumn]);

  // Stable callbacks for TableDataRow component (prevents re-renders)
  const handleSetDeleteConfirm = useCallback((id: number | null) => {
    setDeleteConfirm(id);
  }, []);

  const handleExpandCell = useCallback((value: unknown, column: string) => {
    setDetailCell({ value, column });
  }, []);

  const handleFKPreview = useCallback((tableName: string, rowId: number, columnName: string, rect: DOMRect) => {
    setFkPreview({
      tableName,
      rowId,
      columnName,
      position: { x: Math.min(rect.left, window.innerWidth - 420), y: rect.bottom + 8 },
    });
  }, []);

  const handleEditDataChange = useCallback((col: string, value: unknown) => {
    setEditedData((prev) => ({
      ...prev,
      [col]: value,
    }));
  }, []);

  const handleToggleEditDiff = useCallback(() => {
    setShowEditDiff((prev) => !prev);
  }, []);

  // Keep keyboard state ref in sync (avoids re-attaching event listener)
  useEffect(() => {
    keyboardStateRef.current = {
      showKeyboardHelp,
      fkPreview,
      showBulkDeleteConfirm,
      detailCell,
      showColumnMenu,
      isCreating,
      editingRow,
      deleteConfirm,
      focusedRowIndex,
      rows,
      pkColumn,
    };
  });

  // Store callbacks in refs to avoid re-attaching event listener
  const callbacksRef = useRef({
    handleCancelCreate,
    handleCancelEdit,
    handleStartEdit,
    handleCloneRow,
    handleStartCreate,
    toggleRowSelection,
  });
  useEffect(() => {
    callbacksRef.current = {
      handleCancelCreate,
      handleCancelEdit,
      handleStartEdit,
      handleCloneRow,
      handleStartCreate,
      toggleRowSelection,
    };
  });

  // Handle keyboard shortcuts (only set up once)
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const state = keyboardStateRef.current;
      const callbacks = callbacksRef.current;

      // Ignore if typing in an input
      const target = event.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";

      if (event.key === "Escape") {
        if (state.showKeyboardHelp) setShowKeyboardHelp(false);
        else if (state.fkPreview) setFkPreview(null);
        else if (state.showBulkDeleteConfirm) setShowBulkDeleteConfirm(false);
        else if (state.detailCell) setDetailCell(null);
        else if (state.showColumnMenu) setShowColumnMenu(false);
        else if (state.isCreating) callbacks.handleCancelCreate();
        else if (state.editingRow) callbacks.handleCancelEdit();
        else if (state.deleteConfirm) setDeleteConfirm(null);
        else setFocusedRowIndex(null);
        return;
      }

      // Skip other shortcuts if in input or modal is open
      if (isInput || state.showBulkDeleteConfirm || state.detailCell || state.showColumnMenu || state.isCreating || state.editingRow) return;

      switch (event.key) {
        case "?":
          event.preventDefault();
          setShowKeyboardHelp(true);
          break;
        case "j":
        case "ArrowDown":
          event.preventDefault();
          setFocusedRowIndex(prev => {
            if (prev === null) return 0;
            return Math.min(prev + 1, state.rows.length - 1);
          });
          break;
        case "k":
        case "ArrowUp":
          event.preventDefault();
          setFocusedRowIndex(prev => {
            if (prev === null) return state.rows.length - 1;
            return Math.max(prev - 1, 0);
          });
          break;
        case "e":
          event.preventDefault();
          if (state.focusedRowIndex !== null && state.rows[state.focusedRowIndex]) {
            callbacks.handleStartEdit(state.rows[state.focusedRowIndex]);
          }
          break;
        case "c":
          event.preventDefault();
          if (state.focusedRowIndex !== null && state.rows[state.focusedRowIndex]) {
            callbacks.handleCloneRow(state.rows[state.focusedRowIndex]);
          }
          break;
        case "d":
          event.preventDefault();
          if (state.focusedRowIndex !== null && state.rows[state.focusedRowIndex]) {
            const rowId = state.rows[state.focusedRowIndex][state.pkColumn];
            if (typeof rowId === "number") {
              setDeleteConfirm(rowId);
            }
          }
          break;
        case "n":
          event.preventDefault();
          callbacks.handleStartCreate();
          break;
        case "s":
        case "/":
          event.preventDefault();
          searchInputRef.current?.focus();
          break;
        case " ":
          event.preventDefault();
          if (state.focusedRowIndex !== null && state.rows[state.focusedRowIndex]) {
            const rowId = state.rows[state.focusedRowIndex][state.pkColumn];
            if (typeof rowId === "number") {
              callbacks.toggleRowSelection(rowId);
            }
          }
          break;
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []); // Empty deps - only set up once

  // Quick filter presets based on schema
  const quickFilterPresets = useMemo(() => {
    if (!schema) return [];
    const presets: Array<{ id: string; label: string; filter: string }> = [];

    // Find date/datetime columns for date-based filters
    const dateColumns = schema.columns.filter(c => c.type === "date" || c.type === "datetime");
    if (dateColumns.length > 0) {
      const dateCol = dateColumns.find(c => c.name.includes("date") || c.name === "created_at") || dateColumns[0];
      const today = new Date().toISOString().split("T")[0];
      const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      presets.push({ id: "today", label: "Today", filter: `${dateCol.name}__gte:${today}` });
      presets.push({ id: "last7", label: "Last 7 days", filter: `${dateCol.name}__gte:${last7Days}` });
      presets.push({ id: "last30", label: "Last 30 days", filter: `${dateCol.name}__gte:${last30Days}` });
    }

    // Find nullable columns for NULL filter
    const nullableColumns = schema.columns.filter(c => c.nullable && !c.primary_key);
    if (nullableColumns.length > 0) {
      presets.push({ id: "has_nulls", label: "Has NULLs", filter: "include_nulls:true" });
    }

    return presets;
  }, [schema]);

  // Toggle quick filter
  const toggleQuickFilter = useCallback((filterId: string) => {
    setActiveQuickFilters(prev => {
      const next = new Set(prev);
      if (next.has(filterId)) {
        next.delete(filterId);
      } else {
        next.add(filterId);
      }
      return next;
    });
    setPage(0);
  }, []);

  // Save current filter
  const handleSaveFilter = useCallback(() => {
    if (!newFilterName.trim()) return;
    const newFilter = {
      name: newFilterName.trim(),
      filters: Array.from(activeQuickFilters),
    };
    const updated = [...savedFilters, newFilter];
    setSavedFilters(updated);
    try {
      localStorage.setItem(`debug_saved_filters_${tableName}`, JSON.stringify(updated));
    } catch {
      // Ignore quota errors
    }
    setNewFilterName("");
    setShowSaveFilterModal(false);
  }, [newFilterName, activeQuickFilters, savedFilters, tableName]);

  // Delete saved filter
  const handleDeleteSavedFilter = useCallback((index: number) => {
    const updated = savedFilters.filter((_, i) => i !== index);
    setSavedFilters(updated);
    try {
      localStorage.setItem(`debug_saved_filters_${tableName}`, JSON.stringify(updated));
    } catch {
      // Ignore quota errors
    }
  }, [savedFilters, tableName]);

  // Apply saved filter
  const handleApplySavedFilter = useCallback((filters: string[]) => {
    setActiveQuickFilters(new Set(filters));
    setPage(0);
  }, []);

  // Get changed fields for diff view
  const getChangedFields = useMemo(() => {
    if (!editingRow) return new Set<string>();
    const changes = new Set<string>();
    for (const key of Object.keys(editedData)) {
      if (editingRow[key] !== editedData[key]) {
        // Handle null vs undefined
        if (editingRow[key] == null && editedData[key] == null) continue;
        changes.add(key);
      }
    }
    return changes;
  }, [editingRow, editedData]);

  // Compute column statistics from current page data
  const computeColumnStats = useCallback((columnName: string) => {
    if (!rows.length || !schema) return null;

    const col = schema.columns.find(c => c.name === columnName);
    if (!col) return null;

    const values = rows.map(r => r[columnName]).filter(v => v !== null && v !== undefined);
    const nullCount = rows.length - values.length;

    const stats: Record<string, unknown> = {
      total: rows.length,
      nonNull: values.length,
      nullCount,
      nullPercent: ((nullCount / rows.length) * 100).toFixed(1),
    };

    if (col.type === "integer" || col.type === "decimal") {
      const numbers = values.map(v => Number(v)).filter(n => !isNaN(n));
      if (numbers.length > 0) {
        stats.min = Math.min(...numbers);
        stats.max = Math.max(...numbers);
        stats.sum = numbers.reduce((a, b) => a + b, 0);
        stats.avg = (stats.sum as number / numbers.length).toFixed(COLUMN_STATS_DECIMAL_PLACES);
      }
    } else if (col.type === "date" || col.type === "datetime") {
      const dates = values.map(v => new Date(String(v))).filter(d => !isNaN(d.getTime()));
      if (dates.length > 0) {
        dates.sort((a, b) => a.getTime() - b.getTime());
        stats.earliest = dates[0].toISOString().split("T")[0];
        stats.latest = dates[dates.length - 1].toISOString().split("T")[0];
      }
    } else if (col.type === "boolean") {
      const trueCount = values.filter(v => v === true).length;
      const falseCount = values.filter(v => v === false).length;
      stats.trueCount = trueCount;
      stats.falseCount = falseCount;
      stats.truePercent = ((trueCount / values.length) * 100).toFixed(1);
    } else if (col.type === "string") {
      const uniqueValues = new Set(values.map(v => String(v)));
      stats.distinctCount = uniqueValues.size;
      // Get top 5 most common values
      const valueCounts = new Map<string, number>();
      values.forEach(v => {
        const str = String(v);
        valueCounts.set(str, (valueCounts.get(str) || 0) + 1);
      });
      const sortedValues = Array.from(valueCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP_VALUES_LIMIT);
      stats.topValues = sortedValues;
    }

    return stats;
  }, [rows, schema]);

  // Parse import data
  const parseImportData = useCallback((data: string, format: "csv" | "json"): DebugRow[] => {
    try {
      if (format === "json") {
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [parsed];
      } else {
        // CSV parsing with proper quote handling
        const lines = data.trim().split("\n");
        if (lines.length < 2) return [];

        const headers = parseCSVLine(lines[0]);
        return lines.slice(1).filter(line => line.trim()).map(line => {
          const values = parseCSVLine(line);
          const row: DebugRow = {};
          headers.forEach((header, i) => {
            let value: unknown = values[i] ?? "";
            // Try to parse numbers and booleans based on schema if available
            const col = schema?.columns.find(c => c.name === header);
            if (col) {
              if (col.type === "boolean") {
                value = value === "true" || value === "1" || value === true;
              } else if (col.type === "integer") {
                value = value === "" || value === "null" ? null : parseInt(String(value), 10);
              } else if (col.type === "decimal") {
                value = value === "" || value === "null" ? null : parseFloat(String(value));
              } else if (value === "null" || value === "") {
                value = null;
              }
            } else {
              // Fallback type inference when schema not available
              if (value === "true") value = true;
              else if (value === "false") value = false;
              else if (value === "null" || value === "") value = null;
              else if (!isNaN(Number(value)) && value !== "") value = Number(value);
            }
            row[header] = value;
          });
          return row;
        });
      }
    } catch {
      return [];
    }
  }, []);

  // Handle import preview
  const handleImportPreview = useCallback(() => {
    const parsed = parseImportData(importData, importFormat);
    setImportPreview(parsed);
  }, [importData, importFormat, parseImportData]);

  // Handle import submit (would need backend support)
  const handleImportSubmit = useCallback(async () => {
    if (importPreview.length === 0) return;
    setIsImporting(true);
    try {
      // Create rows one by one
      let successCount = 0;
      for (const row of importPreview) {
        try {
          await debugAPI.createRow(tableName, row);
          successCount++;
        } catch {
          // Continue on error
        }
      }
      showToast(`Imported ${successCount} of ${importPreview.length} rows`, successCount === importPreview.length ? "success" : "info");
      mutate();
      setShowImportModal(false);
      setImportData("");
      setImportPreview([]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Import failed", "error");
    } finally {
      setIsImporting(false);
    }
  }, [importPreview, tableName, mutate, showToast]);

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

  // Get priority accent color based on table name (memoized)
  const priorityAccentColor = useMemo(() => getTablePriorityColor(tableName), [tableName]);

  return (
    <SuperAdminPageGuard>
      <DeskSurface fullHeight>
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex-shrink-0 desk-background border-b border-[#6b5a4a]/30">
            {/* Priority accent bar */}
            <div className={cn("h-1", priorityAccentColor)} />

            <div className="p-4 sm:px-6 sm:py-4">
              <div className="flex items-center justify-between gap-4">
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
                      <Table2 className="h-6 w-6 text-[#a0704b]" aria-hidden="true" />
                    </div>
                    <div>
                      <h1 className="text-lg sm:text-2xl font-bold text-white">
                        {schema?.display_name || tableName}
                      </h1>
                      <p className="text-sm text-white/70 font-mono">{tableName}</p>
                    </div>
                  </div>
                </div>
                {/* Theme toggle */}
                <ThemeToggle compact />
              </div>
            </div>

            {/* Warning Banner */}
            <div className="mx-4 sm:mx-6 mb-4 p-2 rounded-lg bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-800">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-xs">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span>Changes affect production data. All operations are logged.</span>
              </div>
            </div>

            {/* Toolbar */}
            <div className="mx-4 sm:mx-6 mb-4 flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder={searchAll ? "Search all text columns..." : `Search ${schema?.search_columns.join(", ") || ""}...`}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(0);
                  }}
                  className="w-full pl-9 pr-8 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a] placeholder-gray-400"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 group">
                  <HelpCircle className="h-4 w-4 text-gray-400 hover:text-[#a0704b] cursor-help" aria-hidden="true" />
                  <div className="absolute right-0 top-6 hidden group-hover:block z-50 w-64 p-3 bg-white dark:bg-[#1a1a1a] rounded-lg shadow-xl border border-[#e8d4b8] dark:border-[#6b5a4a] text-xs">
                    <p className="font-semibold mb-2 text-gray-900 dark:text-gray-100">Search Syntax</p>
                    <div className="space-y-1 text-gray-600 dark:text-gray-400">
                      <p><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">text</code> - Contains text</p>
                      <p><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">col:value</code> - Exact match</p>
                      <p><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">col__gt:5</code> - Greater than</p>
                      <p><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">col__lt:10</code> - Less than</p>
                      <p><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">col__gte:5</code> - Greater or equal</p>
                      <p><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">col__lte:10</code> - Less or equal</p>
                      <p><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">col__null:</code> - Is NULL</p>
                      <p><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">col__notnull:</code> - Is not NULL</p>
                    </div>
                  </div>
                </div>
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
                  <Columns3 className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Columns</span>
                </button>
                {showColumnMenu && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-64 max-h-96 flex flex-col rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] shadow-lg">
                    <div className="p-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a] flex-shrink-0">
                      <input
                        type="text"
                        placeholder="Search columns..."
                        value={columnSearchQuery}
                        onChange={(e) => setColumnSearchQuery(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm rounded border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#a0704b]"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="p-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a] flex items-center justify-between flex-shrink-0">
                      <button
                        onClick={() => setHiddenColumns(new Set())}
                        className="text-xs text-[#a0704b] hover:underline"
                      >
                        Show all
                      </button>
                      <span className="text-xs text-gray-400">
                        {schema?.columns.filter(c => !columnSearchQuery || c.name.toLowerCase().includes(columnSearchQuery.toLowerCase())).length} columns
                      </span>
                    </div>
                    <div className="overflow-y-auto flex-1">
                      {schema?.columns
                        .filter(col => !columnSearchQuery || col.name.toLowerCase().includes(columnSearchQuery.toLowerCase()))
                        .map((col) => (
                        <button
                          key={col.name}
                          onClick={() => toggleColumnVisibility(col.name)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
                        >
                          {hiddenColumns.has(col.name) ? (
                            <EyeOff className="h-4 w-4 text-gray-400" aria-hidden="true" />
                          ) : (
                            <Eye className="h-4 w-4 text-[#a0704b]" aria-hidden="true" />
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
                      {schema?.columns.filter(col => !columnSearchQuery || col.name.toLowerCase().includes(columnSearchQuery.toLowerCase())).length === 0 && (
                        <div className="px-3 py-4 text-sm text-gray-400 text-center">
                          No columns match &quot;{columnSearchQuery}&quot;
                        </div>
                      )}
                    </div>
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
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Download className="h-4 w-4" aria-hidden="true" />
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

              {/* Import button */}
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors btn-press"
                title="Import data"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Import</span>
              </button>

              {/* Quick filters toggle */}
              {quickFilterPresets.length > 0 && (
                <button
                  onClick={() => setShowQuickFilters(!showQuickFilters)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors btn-press",
                    showQuickFilters || activeQuickFilters.size > 0
                      ? "border-[#a0704b] bg-[#a0704b]/10 text-[#a0704b]"
                      : "border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
                  )}
                >
                  <Filter className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Filters</span>
                  {activeQuickFilters.size > 0 && (
                    <span className="px-1.5 py-0.5 text-xs rounded-full bg-[#a0704b] text-white">
                      {activeQuickFilters.size}
                    </span>
                  )}
                  {showQuickFilters ? (
                    <ChevronUp className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-3 w-3" aria-hidden="true" />
                  )}
                </button>
              )}

              <button
                onClick={handleStartCreate}
                disabled={isCreating}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-[#a0704b] text-white hover:bg-[#8a5f3e] transition-colors disabled:opacity-50 btn-press"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create
              </button>
              <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                <span>{totalRows.toLocaleString()} rows</span>
                {lastRefreshed && (
                  <span className="text-xs text-gray-400 animate-refresh-in">
                    {lastRefreshed.toLocaleTimeString()}
                  </span>
                )}
                <button
                  onClick={() => setShowKeyboardHelp(true)}
                  className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  title="Keyboard shortcuts"
                >
                  <span className="kbd-key text-[10px]">?</span>
                </button>
              </div>
            </div>

            {/* Quick filters panel */}
            {showQuickFilters && (
              <div className="mx-4 sm:mx-6 mb-4 p-3 rounded-lg bg-[#f5ede3] dark:bg-[#2d2618] border border-[#e8d4b8] dark:border-[#6b5a4a]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mr-2">
                    Quick Filters:
                  </span>
                  {quickFilterPresets.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => toggleQuickFilter(preset.id)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-full transition-colors btn-press",
                        activeQuickFilters.has(preset.id)
                          ? "bg-[#a0704b] text-white"
                          : "bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] hover:bg-[#e8d4b8] dark:hover:bg-[#3d3628]"
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                  {activeQuickFilters.size > 0 && (
                    <>
                      <div className="w-px h-4 bg-[#e8d4b8] dark:bg-[#6b5a4a] mx-1" />
                      <button
                        onClick={() => setActiveQuickFilters(new Set())}
                        className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                      >
                        Clear all
                      </button>
                      <button
                        onClick={() => setShowSaveFilterModal(true)}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-[#a0704b] hover:underline"
                      >
                        <Save className="h-3 w-3" aria-hidden="true" />
                        Save
                      </button>
                    </>
                  )}
                </div>

                {/* Saved filters */}
                {savedFilters.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-[#e8d4b8] dark:border-[#6b5a4a]">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mr-2">
                      Saved:
                    </span>
                    {savedFilters.map((filter, index) => (
                      <div key={index} className="flex items-center gap-1">
                        <button
                          onClick={() => handleApplySavedFilter(filter.filters)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] hover:bg-[#e8d4b8] dark:hover:bg-[#3d3628] transition-colors"
                        >
                          <Bookmark className="h-3 w-3 text-[#a0704b]" aria-hidden="true" />
                          {filter.name}
                        </button>
                        <button
                          onClick={() => handleDeleteSavedFilter(index)}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                          title="Delete saved filter"
                          aria-label="Delete saved filter"
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

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
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Edit Selected
                </button>
                {(schema?.allow_hard_delete || schema?.has_soft_delete) && (
                  <button
                    onClick={() => setShowBulkDeleteConfirm(true)}
                    disabled={isBulkDeleting}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {isBulkDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
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
            {schemaError ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 max-w-md">
                  <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                    <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Failed to load table schema</p>
                      <p className="text-sm mt-1">
                        {schemaError instanceof Error ? schemaError.message : "An unexpected error occurred"}
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => mutateSchema()}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-[#a0704b] text-white hover:bg-[#8a5f3f] transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-[#a0704b]" aria-hidden="true" />
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
                <table className="w-full min-w-max text-sm font-mono-data" role="grid">
                  <caption className="sr-only">
                    {schema?.display_name || tableName} table with {totalRows} rows.
                    {totalPages > 1 && ` Showing page ${page + 1} of ${totalPages} (rows ${page * PAGE_SIZE + 1} to ${Math.min((page + 1) * PAGE_SIZE, totalRows)}).`}
                    {sortBy && ` Sorted by ${sortBy} ${sortOrder === "asc" ? "ascending" : "descending"}.`}
                    {debouncedSearch && ` Filtered by search: "${debouncedSearch}".`}
                    {schema?.search_columns.length ? ` Searchable by: ${schema.search_columns.join(", ")}.` : ""}
                  </caption>
                  <thead className="bg-[#f5ede3] dark:bg-[#2d2618] sticky top-0">
                    <tr>
                      {/* Bulk select checkbox */}
                      <th scope="col" className="px-3 py-2 w-10">
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
                      {visibleColumns.map((col, colIndex) => (
                        <th
                          key={col.name}
                          scope="col"
                          aria-colindex={colIndex + 2}
                          className={cn(
                            "px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300",
                            col.readonly && "text-gray-500",
                            col.primary_key && "sticky-pk-column bg-[#f5ede3] dark:bg-[#2d2618]",
                            schema?.foreign_keys[col.name] && "fk-column-header"
                          )}
                        >
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleSort(col.name)}
                              className="flex items-center gap-1 hover:bg-[#e8d4b8] dark:hover:bg-[#3d3628] transition-colors rounded px-1 -mx-1"
                              aria-label={`Sort by ${col.name}`}
                            >
                              <span className="truncate">{col.name}</span>
                              {schema?.foreign_keys[col.name] && (
                                <ExternalLink className="h-3 w-3 text-blue-500" aria-hidden="true" />
                              )}
                              {sortBy === col.name ? (
                                sortOrder === "asc" ? (
                                  <ArrowUp className="h-3 w-3" aria-hidden="true" />
                                ) : (
                                  <ArrowDown className="h-3 w-3" aria-hidden="true" />
                                )
                              ) : (
                                <ArrowUpDown className="h-3 w-3 opacity-30" aria-hidden="true" />
                              )}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setStatsColumn(col.name);
                                setShowStatsModal(true);
                              }}
                              className="p-0.5 rounded hover:bg-amber-100 dark:hover:bg-amber-900/30 text-gray-400 hover:text-amber-600"
                              title="View column statistics"
                              aria-label={`View statistics for ${col.name}`}
                            >
                              <BarChart3 className="h-3 w-3" aria-hidden="true" />
                            </button>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] font-normal text-gray-400">
                            {getColumnTypeIcon(col.type)}
                            <span>{col.type}</span>
                            {schema?.foreign_keys[col.name] && (
                              <span className="text-blue-400">→ {schema.foreign_keys[col.name].table}</span>
                            )}
                            {col.readonly && <span className="text-amber-500">(ro)</span>}
                          </div>
                        </th>
                      ))}
                      <th scope="col" className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 w-28">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-[#1a1a1a] divide-y divide-[#e8d4b8] dark:divide-[#6b5a4a]">
                    {/* Create row */}
                    {isCreating && (
                      <tr className="bg-green-50 dark:bg-green-900/20">
                        <td className="px-3 py-2">
                          {cloneSource && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-200 dark:bg-green-800 text-green-700 dark:text-green-300 font-medium">
                              Clone
                            </span>
                          )}
                        </td>
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
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                              ) : (
                                <Check className="h-4 w-4" aria-hidden="true" />
                              )}
                            </button>
                            <button
                              onClick={handleCancelCreate}
                              disabled={isSubmitting}
                              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500"
                              aria-label="Cancel create"
                            >
                              <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Data rows - using memoized component for performance */}
                    {rows.map((row, rowIndex) => {
                      const rowId = getRowId(row);
                      if (rowId === null) return null; // Skip rows without valid PK

                      return (
                        <TableDataRow
                          key={rowId}
                          row={row}
                          rowIndex={rowIndex}
                          rowId={rowId}
                          visibleColumns={visibleColumns}
                          pkColumn={pkColumn}
                          page={page}
                          pageSize={PAGE_SIZE}
                          isEditing={editingRow?.[pkColumn] === rowId}
                          isDeleting={deleteConfirm === rowId}
                          isSelected={selectedRows.has(rowId)}
                          isSoftDeleted={Boolean(schema?.has_soft_delete && row.deleted_at !== null)}
                          isFocused={focusedRowIndex === rowIndex}
                          editedData={editedData}
                          editingRow={editingRow}
                          showEditDiff={showEditDiff}
                          hasSoftDelete={schema?.has_soft_delete || false}
                          allowHardDelete={schema?.allow_hard_delete || false}
                          foreignKeys={schema?.foreign_keys || {}}
                          isSubmitting={isSubmitting}
                          changedFields={getChangedFields}
                          onToggleSelect={toggleRowSelection}
                          onStartEdit={handleStartEdit}
                          onSaveEdit={handleSaveEdit}
                          onCancelEdit={handleCancelEdit}
                          onSetDeleteConfirm={handleSetDeleteConfirm}
                          onDelete={handleDelete}
                          onClone={handleCloneRow}
                          onExpandCell={handleExpandCell}
                          onFKPreview={handleFKPreview}
                          onEditDataChange={handleEditDataChange}
                          onToggleEditDiff={handleToggleEditDiff}
                          renderCellValue={renderCellValue}
                          formatValueForInput={formatValueForInput}
                          parseInputValue={parseInputValue}
                          getInputType={getInputType}
                          isLongValue={isLongValue}
                        />
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
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Previous
              </button>
              <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                <span className="hidden sm:inline text-xs">
                  Rows {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, totalRows)} of {totalRows.toLocaleString()}
                </span>
                <div className="flex items-center gap-2">
                <span>Page</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={page + 1}
                  onChange={(e) => {
                    const newPage = parseInt(e.target.value, 10) - 1;
                    if (!isNaN(newPage) && newPage >= 0 && newPage < totalPages) {
                      setPage(newPage);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.currentTarget.blur();
                    }
                  }}
                  className="w-16 px-2 py-1 text-center text-sm rounded border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#a0704b]"
                />
                <span>of {totalPages}</span>
                </div>
              </div>
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

        {/* Detail cell modal */}
        {detailCell && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-backdrop-in"
            onClick={() => setDetailCell(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-cell-title"
          >
            <div
              ref={detailModalRef}
              className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-xl max-w-[42rem] w-[calc(100%-2rem)] min-w-[20rem] mx-4 max-h-[80vh] flex flex-col animate-modal-in"
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
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="p-4 overflow-auto flex-1">
                {isBinaryData(detailCell.value) ? (
                  <div className="flex flex-col items-center gap-4 py-8">
                    <div className="p-4 rounded-full bg-gray-100 dark:bg-gray-800">
                      <FileDown className="h-8 w-8 text-gray-500" aria-hidden="true" />
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
                      <Download className="h-4 w-4" aria-hidden="true" />
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-backdrop-in"
            onClick={() => setShowBulkEdit(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-edit-title"
          >
            <div
              ref={bulkEditModalRef}
              className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-xl max-w-md w-[calc(100%-2rem)] min-w-[20rem] mx-4 flex flex-col animate-modal-in"
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
                  <X className="h-5 w-5" aria-hidden="true" />
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
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="h-4 w-4" aria-hidden="true" />
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-backdrop-in"
            onClick={() => setShowBulkDeleteConfirm(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-delete-title"
          >
            <div
              ref={bulkDeleteModalRef}
              className="bg-white dark:bg-[#1a1a1a] rounded-xl w-[28rem] max-w-[calc(100%-2rem)] mx-4 flex flex-col animate-modal-in delete-modal-glow"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 p-4 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
                <AlertTriangle className="h-5 w-5 text-red-600" aria-hidden="true" />
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
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
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
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="p-3 overflow-y-auto flex-1">
                {fkPreviewLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-[#a0704b]" aria-hidden="true" />
                  </div>
                ) : fkPreviewData ? (
                  <div className="space-y-2 text-sm">
                    {Object.entries(fkPreviewData).slice(0, MAX_PREVIEW_FIELDS).map(([key, value]) => (
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
                    {Object.keys(fkPreviewData).length > MAX_PREVIEW_FIELDS && (
                      <p className="text-xs text-gray-400 pt-1">
                        ...and {Object.keys(fkPreviewData).length - MAX_PREVIEW_FIELDS} more fields
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
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Keyboard shortcuts help modal */}
        {showKeyboardHelp && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-backdrop-in"
            onClick={() => setShowKeyboardHelp(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="keyboard-help-title"
          >
            <div
              ref={keyboardHelpModalRef}
              className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-xl w-[24rem] max-w-[calc(100%-2rem)] mx-4 flex flex-col animate-modal-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
                <h3 id="keyboard-help-title" className="font-semibold text-gray-900 dark:text-gray-100">
                  Keyboard Shortcuts
                </h3>
                <button
                  onClick={() => setShowKeyboardHelp(false)}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <span className="kbd-key">j</span>
                  <span className="text-gray-600 dark:text-gray-400">Move down</span>

                  <span className="kbd-key">k</span>
                  <span className="text-gray-600 dark:text-gray-400">Move up</span>

                  <span className="kbd-key">e</span>
                  <span className="text-gray-600 dark:text-gray-400">Edit focused row</span>

                  <span className="kbd-key">c</span>
                  <span className="text-gray-600 dark:text-gray-400">Clone focused row</span>

                  <span className="kbd-key">d</span>
                  <span className="text-gray-600 dark:text-gray-400">Delete focused row</span>

                  <span className="kbd-key">n</span>
                  <span className="text-gray-600 dark:text-gray-400">Create new row</span>

                  <span className="kbd-key">s</span>
                  <span className="text-gray-600 dark:text-gray-400">Focus search</span>

                  <span className="kbd-key">Space</span>
                  <span className="text-gray-600 dark:text-gray-400">Toggle row selection</span>

                  <span className="kbd-key">Esc</span>
                  <span className="text-gray-600 dark:text-gray-400">Close / Cancel</span>

                  <span className="kbd-key">?</span>
                  <span className="text-gray-600 dark:text-gray-400">Show this help</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Save filter modal */}
        {showSaveFilterModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-backdrop-in"
            onClick={() => setShowSaveFilterModal(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-filter-title"
          >
            <div
              ref={saveFilterModalRef}
              className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-xl w-[20rem] max-w-[calc(100%-2rem)] mx-4 flex flex-col animate-modal-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
                <h3 id="save-filter-title" className="font-semibold text-gray-900 dark:text-gray-100">
                  Save Filter
                </h3>
                <button
                  onClick={() => setShowSaveFilterModal(false)}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="p-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Filter name
                </label>
                <input
                  type="text"
                  value={newFilterName}
                  onChange={(e) => setNewFilterName(e.target.value)}
                  placeholder="e.g., Recent sessions"
                  className="w-full px-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a]"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveFilter();
                  }}
                />
                <p className="text-xs text-gray-500 mt-2">
                  Saving {activeQuickFilters.size} active filter(s)
                </p>
              </div>
              <div className="flex justify-end gap-3 p-4 border-t border-[#e8d4b8] dark:border-[#6b5a4a]">
                <button
                  onClick={() => setShowSaveFilterModal(false)}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveFilter}
                  disabled={!newFilterName.trim()}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-[#a0704b] text-white hover:bg-[#8a5f3e] transition-colors disabled:opacity-50"
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Import modal */}
        {showImportModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-backdrop-in"
            onClick={() => setShowImportModal(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-title"
          >
            <div
              ref={importModalRef}
              className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-xl w-[36rem] max-w-[calc(100%-2rem)] max-h-[80vh] mx-4 flex flex-col animate-modal-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
                <h3 id="import-title" className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <FileUp className="h-5 w-5 text-[#a0704b]" aria-hidden="true" />
                  Import Data
                </h3>
                <button
                  onClick={() => setShowImportModal(false)}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="p-4 flex-1 overflow-auto">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Format
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setImportFormat("json")}
                        className={cn(
                          "px-4 py-2 text-sm rounded-lg border transition-colors",
                          importFormat === "json"
                            ? "bg-[#a0704b] text-white border-[#a0704b]"
                            : "border-[#e8d4b8] dark:border-[#6b5a4a] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
                        )}
                      >
                        JSON
                      </button>
                      <button
                        onClick={() => setImportFormat("csv")}
                        className={cn(
                          "px-4 py-2 text-sm rounded-lg border transition-colors",
                          importFormat === "csv"
                            ? "bg-[#a0704b] text-white border-[#a0704b]"
                            : "border-[#e8d4b8] dark:border-[#6b5a4a] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
                        )}
                      >
                        CSV
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Paste data
                    </label>
                    <textarea
                      value={importData}
                      onChange={(e) => setImportData(e.target.value)}
                      placeholder={importFormat === "json"
                        ? '[{"column1": "value1", "column2": 123}, ...]'
                        : 'column1,column2\nvalue1,123\n...'}
                      className="w-full h-32 px-3 py-2 text-sm font-mono border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a] resize-y"
                    />
                  </div>

                  <button
                    onClick={handleImportPreview}
                    disabled={!importData.trim()}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors disabled:opacity-50"
                  >
                    <Eye className="h-4 w-4" aria-hidden="true" />
                    Preview
                  </button>

                  {importPreview.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Preview ({importPreview.length} rows)
                      </p>
                      <div className="max-h-48 overflow-auto border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg">
                        <table className="w-full text-xs font-mono">
                          <thead className="bg-[#f5ede3] dark:bg-[#2d2618] sticky top-0">
                            <tr>
                              {Object.keys(importPreview[0]).map((key) => (
                                <th key={key} className="px-2 py-1 text-left font-medium">
                                  {key}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#e8d4b8] dark:divide-[#6b5a4a]">
                            {importPreview.slice(0, 5).map((row, i) => (
                              <tr key={i}>
                                {Object.values(row).map((val, j) => (
                                  <td key={j} className="px-2 py-1 truncate max-w-[150px]">
                                    {val === null ? <em className="text-gray-400">NULL</em> : String(val)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {importPreview.length > 5 && (
                          <p className="text-xs text-gray-500 p-2">
                            ...and {importPreview.length - 5} more rows
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-3 p-4 border-t border-[#e8d4b8] dark:border-[#6b5a4a]">
                <button
                  onClick={() => {
                    setShowImportModal(false);
                    setImportData("");
                    setImportPreview([]);
                  }}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportSubmit}
                  disabled={importPreview.length === 0 || isImporting}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-[#a0704b] text-white hover:bg-[#8a5f3e] transition-colors disabled:opacity-50"
                >
                  {isImporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Upload className="h-4 w-4" aria-hidden="true" />
                  )}
                  Import {importPreview.length} Rows
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Column Statistics Modal */}
        {showStatsModal && statsColumn && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-modal-backdrop"
            onClick={() => setShowStatsModal(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="stats-modal-title"
          >
            <div
              ref={statsModalRef}
              className="relative max-w-md w-[calc(100%-2rem)] min-w-[20rem] mx-4 bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-xl animate-modal-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-[#a0704b]" aria-hidden="true" />
                  <h3 id="stats-modal-title" className="text-lg font-semibold">
                    Column Statistics: <span className="font-mono text-[#a0704b]">{statsColumn}</span>
                  </h3>
                </div>
                <button
                  onClick={() => setShowStatsModal(false)}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="p-4">
                {(() => {
                  const stats = computeColumnStats(statsColumn);
                  if (!stats) {
                    return <p className="text-gray-500">No data available for statistics.</p>;
                  }
                  const col = schema?.columns.find(c => c.name === statsColumn);
                  return (
                    <div className="space-y-4">
                      {/* Basic stats */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-[#f5ede3] dark:bg-[#2d2618]">
                          <p className="text-xs text-gray-500 uppercase">Total Rows</p>
                          <p className="text-xl font-semibold font-mono">{Number(stats.total)}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-[#f5ede3] dark:bg-[#2d2618]">
                          <p className="text-xs text-gray-500 uppercase">Non-Null</p>
                          <p className="text-xl font-semibold font-mono">{Number(stats.nonNull)}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-[#f5ede3] dark:bg-[#2d2618]">
                          <p className="text-xs text-gray-500 uppercase">Null Values</p>
                          <p className="text-xl font-semibold font-mono">{Number(stats.nullCount)}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-[#f5ede3] dark:bg-[#2d2618]">
                          <p className="text-xs text-gray-500 uppercase">Null %</p>
                          <p className="text-xl font-semibold font-mono">{String(stats.nullPercent)}%</p>
                        </div>
                      </div>

                      {/* Type-specific stats */}
                      {(col?.type === "integer" || col?.type === "decimal") && stats.min !== undefined && (
                        <div className="border-t border-[#e8d4b8] dark:border-[#6b5a4a] pt-4">
                          <h4 className="text-sm font-medium mb-3">Numeric Statistics</h4>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                              <p className="text-xs text-blue-600 dark:text-blue-400 uppercase">Min</p>
                              <p className="text-lg font-semibold font-mono">{Number(stats.min)}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                              <p className="text-xs text-blue-600 dark:text-blue-400 uppercase">Max</p>
                              <p className="text-lg font-semibold font-mono">{Number(stats.max)}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                              <p className="text-xs text-green-600 dark:text-green-400 uppercase">Sum</p>
                              <p className="text-lg font-semibold font-mono">{Number(stats.sum)}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                              <p className="text-xs text-green-600 dark:text-green-400 uppercase">Average</p>
                              <p className="text-lg font-semibold font-mono">{String(stats.avg)}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {(col?.type === "date" || col?.type === "datetime") && stats.earliest && (
                        <div className="border-t border-[#e8d4b8] dark:border-[#6b5a4a] pt-4">
                          <h4 className="text-sm font-medium mb-3">Date Range</h4>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                              <p className="text-xs text-purple-600 dark:text-purple-400 uppercase">Earliest</p>
                              <p className="text-sm font-semibold font-mono">{String(stats.earliest)}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                              <p className="text-xs text-purple-600 dark:text-purple-400 uppercase">Latest</p>
                              <p className="text-sm font-semibold font-mono">{String(stats.latest)}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {col?.type === "boolean" && stats.trueCount !== undefined && (
                        <div className="border-t border-[#e8d4b8] dark:border-[#6b5a4a] pt-4">
                          <h4 className="text-sm font-medium mb-3">Boolean Distribution</h4>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                              <p className="text-xs text-green-600 dark:text-green-400 uppercase">True</p>
                              <p className="text-xl font-semibold font-mono">{Number(stats.trueCount)}</p>
                              <p className="text-xs text-gray-500">{String(stats.truePercent)}%</p>
                            </div>
                            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
                              <p className="text-xs text-red-600 dark:text-red-400 uppercase">False</p>
                              <p className="text-xl font-semibold font-mono">{Number(stats.falseCount)}</p>
                              <p className="text-xs text-gray-500">{(100 - parseFloat(String(stats.truePercent))).toFixed(1)}%</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {col?.type === "string" && stats.distinctCount !== undefined && (
                        <div className="border-t border-[#e8d4b8] dark:border-[#6b5a4a] pt-4">
                          <h4 className="text-sm font-medium mb-3">String Statistics</h4>
                          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 mb-3">
                            <p className="text-xs text-amber-600 dark:text-amber-400 uppercase">Distinct Values</p>
                            <p className="text-xl font-semibold font-mono">{Number(stats.distinctCount)}</p>
                          </div>
                          {(stats.topValues as [string, number][])?.length > 0 && (
                            <div>
                              <p className="text-xs text-gray-500 uppercase mb-2">Top Values</p>
                              <div className="space-y-1">
                                {(stats.topValues as [string, number][]).map(([value, count], i) => (
                                  <div key={i} className="flex items-center justify-between text-sm">
                                    <span className="truncate max-w-[200px] font-mono" title={value}>{value}</span>
                                    <span className="text-gray-500 font-mono">{count}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <p className="text-xs text-gray-400 text-center pt-2">
                        Statistics based on current page ({rows.length} rows)
                      </p>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </DeskSurface>
    </SuperAdminPageGuard>
  );
}
