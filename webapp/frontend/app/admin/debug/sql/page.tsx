"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { SuperAdminPageGuard } from "@/components/auth/SuperAdminPageGuard";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { debugAPI } from "@/lib/api";
import { usePageTitle } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import { cn } from "@/lib/utils";
import type { SqlQueryResponse } from "@/types/debug";
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

export default function SqlExecutorPage() {
  usePageTitle("SQL Executor");
  const { showToast } = useToast();

  // State
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SqlQueryResponse | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<QueryHistoryItem[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    textareaRef.current?.focus();
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
                  >
                    <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  </Link>
                  <div className="flex items-center gap-3">
                    <div className="hidden sm:block p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
                      <Terminal className="h-6 w-6 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                      <h1 className="text-lg sm:text-2xl font-bold text-white flex items-center gap-2">
                        SQL Executor
                        <Database className="h-5 w-5 text-violet-400" />
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
                <AlertTriangle className="h-5 w-5 flex-shrink-0" />
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
              <textarea
                ref={textareaRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="SELECT * FROM students LIMIT 10;"
                rows={6}
                className="w-full px-4 py-3 font-mono-data text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-xl bg-white dark:bg-[#1a1a1a] placeholder-gray-400 resize-y"
                spellCheck={false}
              />
              <div className="absolute bottom-3 right-3 text-xs text-gray-400">
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
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Execute
              </button>

              <button
                onClick={() => setShowHistory(!showHistory)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors btn-press",
                  showHistory
                    ? "bg-[#a0704b] text-white border-[#a0704b]"
                    : "border-[#e8d4b8] dark:border-[#6b5a4a] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
                )}
              >
                <History className="h-4 w-4" />
                History
                {history.length > 0 && (
                  <span className="px-1.5 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-gray-700">
                    {history.length}
                  </span>
                )}
                {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {result && result.rows.length > 0 && (
                <>
                  <button
                    onClick={handleExport}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors btn-press"
                  >
                    <Download className="h-4 w-4" />
                    Export CSV
                  </button>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors btn-press"
                  >
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
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
                      <Trash2 className="h-3 w-3" />
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
                        >
                          <X className="h-3 w-3" />
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
                  <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
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
                    <Clock className="h-3 w-3" />
                    {result.execution_time_ms}ms
                  </div>
                </div>

                {/* Results Table */}
                {result.rows.length > 0 ? (
                  <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-[#f5ede3] dark:bg-[#2d2618] sticky top-0">
                        <tr>
                          {result.columns.map((col) => (
                            <th
                              key={col}
                              className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e8d4b8] dark:divide-[#6b5a4a] font-mono-data text-xs">
                        {result.rows.map((row, i) => (
                          <tr key={i} className="debug-row-hover">
                            {result.columns.map((col) => (
                              <td
                                key={col}
                                className="px-3 py-2 whitespace-nowrap"
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
