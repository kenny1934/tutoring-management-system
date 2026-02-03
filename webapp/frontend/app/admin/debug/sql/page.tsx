"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { SuperAdminPageGuard } from "@/components/auth/SuperAdminPageGuard";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { debugAPI } from "@/lib/api";
import { usePageTitle } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import { cn } from "@/lib/utils";
import type { SqlQueryResponse } from "@/types/debug";

// CodeMirror imports
import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { sql, MySQL } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { defaultKeymap, history as cmHistory, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";

import {
  ArrowLeft,
  Play,
  Loader2,
  AlertTriangle,
  Database,
  Clock,
  Download,
  Trash2,
  History,
  Terminal,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  X,
  FileCode,
} from "lucide-react";

// Query history stored in localStorage
const HISTORY_KEY = "debug_sql_history";
const MAX_HISTORY_ITEMS = 50;

interface QueryHistoryItem {
  query: string;
  timestamp: number;
  rowCount?: number;
  executionTime?: number;
}

// SQL query templates for common operations
const SQL_TEMPLATES = [
  { label: "Select all", query: "SELECT * FROM {table} LIMIT 50" },
  { label: "Count rows", query: "SELECT COUNT(*) as total FROM {table}" },
  { label: "Recent rows", query: "SELECT * FROM {table} ORDER BY id DESC LIMIT 20" },
  { label: "Search by ID", query: "SELECT * FROM {table} WHERE id = {id}" },
  { label: "Group by column", query: "SELECT {column}, COUNT(*) as count FROM {table} GROUP BY {column}" },
  { label: "Join tables", query: "SELECT t1.*, t2.* FROM {table1} t1\nJOIN {table2} t2 ON t1.{fk_column} = t2.id\nLIMIT 50" },
  { label: "Date range", query: "SELECT * FROM {table}\nWHERE created_at >= '{start_date}'\n  AND created_at < '{end_date}'\nORDER BY created_at DESC" },
  { label: "Text search", query: "SELECT * FROM {table}\nWHERE {column} LIKE '%{search}%'\nLIMIT 50" },
];

// Light theme for CodeMirror
const lightTheme = EditorView.theme({
  "&": {
    backgroundColor: "#ffffff",
    color: "#1a1a1a",
  },
  ".cm-content": {
    caretColor: "#1a1a1a",
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Monaco, 'Cascadia Mono', monospace",
    fontSize: "14px",
  },
  ".cm-cursor": {
    borderLeftColor: "#1a1a1a",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "#d7d4f0",
  },
  ".cm-gutters": {
    backgroundColor: "#f5ede3",
    color: "#999",
    border: "none",
  },
});

// SQL Editor component
interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute: () => void;
  isDark: boolean;
}

function SqlEditor({ value, onChange, onExecute, isDark }: SqlEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onExecuteRef = useRef(onExecute);

  // Keep refs up to date
  onChangeRef.current = onChange;
  onExecuteRef.current = onExecute;

  // Create/update editor
  useEffect(() => {
    if (!containerRef.current) return;

    // If editor exists, update theme
    if (viewRef.current) {
      viewRef.current.destroy();
    }

    const executeKeymap = keymap.of([
      {
        key: "Mod-Enter",
        run: () => {
          onExecuteRef.current();
          return true;
        },
      },
    ]);

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        cmHistory(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        executeKeymap,
        sql({ dialect: MySQL }),
        isDark ? oneDark : [lightTheme, syntaxHighlighting(defaultHighlightStyle)],
        cmPlaceholder("SELECT * FROM students LIMIT 10;"),
        updateListener,
        EditorView.lineWrapping,
      ],
    });

    viewRef.current = new EditorView({
      state,
      parent: containerRef.current,
    });

    return () => {
      viewRef.current?.destroy();
    };
  }, [isDark]); // Recreate on theme change

  // Update doc if value changes externally (e.g., from templates)
  useEffect(() => {
    if (viewRef.current) {
      const currentDoc = viewRef.current.state.doc.toString();
      if (currentDoc !== value) {
        viewRef.current.dispatch({
          changes: {
            from: 0,
            to: currentDoc.length,
            insert: value,
          },
        });
      }
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="w-full min-h-[168px] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-xl overflow-hidden [&_.cm-editor]:min-h-[168px] [&_.cm-scroller]:min-h-[168px]"
    />
  );
}

export default function SqlExecutorPage() {
  usePageTitle("SQL Executor");
  const { showToast } = useToast();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // State
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SqlQueryResponse | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<QueryHistoryItem[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Track mount state for SSR
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Save history to localStorage
  const saveHistory = useCallback((newHistory: QueryHistoryItem[]) => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory.slice(0, MAX_HISTORY_ITEMS)));
    } catch {
      // Ignore quota errors
    }
  }, []);

  // Execute query
  const handleExecute = useCallback(async () => {
    if (!query.trim()) {
      showToast("Please enter a SQL query", "info");
      return;
    }

    setIsExecuting(true);
    setError(null);
    setResult(null);

    try {
      const response = await debugAPI.executeSql(query.trim());
      setResult(response);

      // Add to history
      const newItem: QueryHistoryItem = {
        query: query.trim(),
        timestamp: Date.now(),
        rowCount: response.row_count,
        executionTime: response.execution_time_ms,
      };
      const newHistory = [newItem, ...history.filter((h) => h.query !== query.trim())];
      setHistory(newHistory);
      saveHistory(newHistory);

      showToast(`Query executed: ${response.row_count} rows in ${response.execution_time_ms}ms`, "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Query execution failed";
      setError(message);
      showToast(message, "error");
    } finally {
      setIsExecuting(false);
    }
  }, [query, history, saveHistory, showToast]);

  // Clear history
  const handleClearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
    showToast("Query history cleared", "success");
  }, [showToast]);

  // Load query from history
  const handleLoadFromHistory = useCallback((historyQuery: string) => {
    setQuery(historyQuery);
    setShowHistory(false);
  }, []);

  // Delete history item
  const handleDeleteHistoryItem = useCallback(
    (timestamp: number) => {
      const newHistory = history.filter((h) => h.timestamp !== timestamp);
      setHistory(newHistory);
      saveHistory(newHistory);
    },
    [history, saveHistory]
  );

  // Insert template
  const handleInsertTemplate = useCallback((templateQuery: string) => {
    // If current query is empty, replace entirely; otherwise append
    setQuery((prev) => (prev.trim() ? prev + "\n\n" + templateQuery : templateQuery));
    setShowTemplates(false);
  }, []);

  // Export results as CSV
  const handleExport = useCallback(() => {
    if (!result || result.rows.length === 0) return;

    const headers = result.columns.join(",");
    const rows = result.rows.map((row) =>
      result.columns
        .map((col) => {
          const val = row[col];
          if (val === null || val === undefined) return "";
          const str = String(val);
          // Escape quotes and wrap in quotes if contains comma
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(",")
    );
    const csv = [headers, ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `query_results_${new Date().toISOString().slice(0, 19).replace(/[:-]/g, "")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast("Results exported to CSV", "success");
  }, [result, showToast]);

  // Copy results to clipboard
  const handleCopy = useCallback(async () => {
    if (!result || result.rows.length === 0) return;

    const text = JSON.stringify(result.rows, null, 2);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showToast("Results copied to clipboard", "success");
  }, [result, showToast]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Ctrl/Cmd + Enter to execute
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        handleExecute();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleExecute]);

  return (
    <SuperAdminPageGuard>
      <DeskSurface fullHeight>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 z-40 desk-background border-b border-[#6b5a4a]/30">
            <div className="p-4 sm:px-6 sm:py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Link
                    href="/admin/debug"
                    className="p-2 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] rounded-lg transition-colors"
                    aria-label="Back to debug panel"
                  >
                    <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" aria-hidden="true" />
                  </Link>
                  <div className="flex items-center gap-3">
                    <div className="hidden sm:block p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
                      <Terminal className="h-6 w-6 text-violet-600 dark:text-violet-400" aria-hidden="true" />
                    </div>
                    <div>
                      <h1 className="text-lg sm:text-2xl font-bold text-white flex items-center gap-2">
                        SQL Executor
                        <Database className="h-5 w-5 text-violet-400" aria-hidden="true" />
                      </h1>
                      <p className="hidden sm:block text-sm text-white/70">
                        Execute read-only SQL queries
                      </p>
                    </div>
                  </div>
                </div>
                <ThemeToggle />
              </div>
            </div>

            {/* Warning Banner */}
            <div className="mx-4 sm:mx-6 mb-4 p-3 rounded-lg bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-800">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                <span className="text-sm font-medium">
                  Only SELECT queries are allowed. Results limited to 1000 rows. All queries are logged.
                </span>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="p-4 sm:px-6 sm:py-4 space-y-4">
            {/* Query Input */}
            <div className="relative">
              {mounted ? (
                <SqlEditor
                  value={query}
                  onChange={setQuery}
                  onExecute={handleExecute}
                  isDark={isDark}
                />
              ) : (
                <div className="w-full min-h-[168px] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-xl bg-white dark:bg-[#1a1a1a]" />
              )}
              <div className="mt-2 text-xs text-gray-400 text-right">
                Press <span className="kbd-key">Ctrl</span> + <span className="kbd-key">Enter</span> to execute
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleExecute}
                disabled={isExecuting || !query.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-50 btn-press"
              >
                {isExecuting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Play className="h-4 w-4" aria-hidden="true" />
                )}
                Execute
              </button>

              {/* Templates Dropdown */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowTemplates(!showTemplates);
                    setShowHistory(false);
                  }}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors btn-press",
                    showTemplates
                      ? "bg-[#a0704b] text-white border-[#a0704b]"
                      : "border-[#e8d4b8] dark:border-[#6b5a4a] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
                  )}
                >
                  <FileCode className="h-4 w-4" aria-hidden="true" />
                  Templates
                  {showTemplates ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
                </button>
                {showTemplates && (
                  <div className="absolute top-full left-0 mt-1 w-72 rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] shadow-lg z-50 overflow-hidden">
                    <div className="px-3 py-2 bg-[#f5ede3] dark:bg-[#2d2618] border-b border-[#e8d4b8] dark:border-[#6b5a4a] text-xs text-gray-500 dark:text-gray-400">
                      Click to insert • Replace {"{placeholders}"} with values
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {SQL_TEMPLATES.map((template) => (
                        <button
                          key={template.label}
                          onClick={() => handleInsertTemplate(template.query)}
                          className="w-full text-left px-3 py-2 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors"
                        >
                          <div className="font-medium text-sm">{template.label}</div>
                          <pre className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate mt-0.5">
                            {template.query.split('\n')[0]}
                          </pre>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  setShowHistory(!showHistory);
                  setShowTemplates(false);
                }}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors btn-press",
                  showHistory
                    ? "bg-[#a0704b] text-white border-[#a0704b]"
                    : "border-[#e8d4b8] dark:border-[#6b5a4a] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
                )}
              >
                <History className="h-4 w-4" aria-hidden="true" />
                History
                {history.length > 0 && (
                  <span className="px-1.5 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-gray-700">
                    {history.length}
                  </span>
                )}
                {showHistory ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
              </button>

              {result && result.rows.length > 0 && (
                <>
                  <button
                    onClick={handleExport}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors btn-press"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Export CSV
                  </button>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors btn-press"
                  >
                    {copied ? <Check className="h-4 w-4 text-green-500" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                    {copied ? "Copied!" : "Copy JSON"}
                  </button>
                </>
              )}
            </div>

            {/* Query History */}
            {showHistory && (
              <div className="rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 bg-[#f5ede3] dark:bg-[#2d2618] border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
                  <span className="text-sm font-medium">Query History</span>
                  {history.length > 0 && (
                    <button
                      onClick={handleClearHistory}
                      className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                      Clear All
                    </button>
                  )}
                </div>
                {history.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 text-sm">No query history yet</div>
                ) : (
                  <div className="max-h-60 overflow-y-auto divide-y divide-[#e8d4b8] dark:divide-[#6b5a4a]">
                    {history.map((item) => (
                      <div
                        key={item.timestamp}
                        className="p-3 hover:bg-[#f5ede3]/50 dark:hover:bg-[#2d2618]/50 cursor-pointer flex items-start justify-between gap-2"
                        onClick={() => handleLoadFromHistory(item.query)}
                      >
                        <div className="flex-1 min-w-0">
                          <pre className="text-xs font-mono truncate text-gray-700 dark:text-gray-300">
                            {item.query}
                          </pre>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                            <span>{new Date(item.timestamp).toLocaleString()}</span>
                            {item.rowCount !== undefined && <span>{item.rowCount} rows</span>}
                            {item.executionTime !== undefined && <span>{item.executionTime}ms</span>}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteHistoryItem(item.timestamp);
                          }}
                          className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-gray-400 hover:text-red-500"
                          aria-label="Delete history item"
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="font-medium text-red-700 dark:text-red-400">Query Error</p>
                    <pre className="mt-1 text-sm text-red-600 dark:text-red-300 font-mono whitespace-pre-wrap">
                      {error}
                    </pre>
                  </div>
                </div>
              </div>
            )}

            {/* Results */}
            {result && (
              <div className="rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] overflow-hidden">
                {/* Results Header */}
                <div className="flex items-center justify-between px-4 py-2 bg-[#f5ede3] dark:bg-[#2d2618] border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">
                      {result.row_count} {result.row_count === 1 ? "row" : "rows"}
                    </span>
                    <span className="text-xs text-gray-400">
                      {result.columns.length} {result.columns.length === 1 ? "column" : "columns"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {result.execution_time_ms}ms
                  </div>
                </div>

                {/* Results Table */}
                {result.rows.length > 0 ? (
                  <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                    <table className="w-full border-collapse min-w-max">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-[#f5ede3] dark:bg-[#2d2618] border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
                          {result.columns.map((col) => (
                            <th
                              key={col}
                              className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap text-sm"
                              style={{ minWidth: 120 }}
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.rows.map((row, index) => (
                          <tr
                            key={index}
                            className={cn(
                              "border-b border-[#e8d4b8] dark:border-[#6b5a4a] debug-row-hover",
                              index % 2 === 0 && "bg-gray-50/50 dark:bg-[#252118]/50"
                            )}
                          >
                            {result.columns.map((col) => (
                              <td
                                key={col}
                                className="px-3 py-1.5 whitespace-nowrap font-mono-data text-xs"
                                style={{ minWidth: 120 }}
                                title={row[col] !== null ? String(row[col]) : "NULL"}
                              >
                                {row[col] === null ? (
                                  <em className="text-gray-400">NULL</em>
                                ) : (
                                  <span className="truncate block max-w-[300px]">
                                    {String(row[col])}
                                  </span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center text-gray-500">
                    Query executed successfully but returned no rows.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DeskSurface>
    </SuperAdminPageGuard>
  );
}
