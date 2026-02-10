"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Clipboard, ChevronUp, ChevronDown, X } from "lucide-react";
import { getExerciseClipboard, clearExerciseClipboard, getDisplayName, CLIPBOARD_EVENT } from "@/lib/exercise-utils";
import type { ExerciseClipboardData } from "@/lib/exercise-utils";

export function ExerciseClipboardWidget() {
  const [data, setData] = useState<ExerciseClipboardData | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);

  const refreshClipboard = useCallback(() => {
    setData(getExerciseClipboard());
  }, []);

  useEffect(() => {
    setMounted(true);
    refreshClipboard();

    const handler = () => refreshClipboard();
    window.addEventListener(CLIPBOARD_EVENT, handler);
    return () => window.removeEventListener(CLIPBOARD_EVENT, handler);
  }, [refreshClipboard]);

  const handleClear = useCallback(() => {
    clearExerciseClipboard();
    setIsExpanded(false);
  }, []);

  if (!mounted || !data) return null;

  const count = data.exercises.length;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="fixed bottom-4 right-4 z-[10000]"
      >
        <div className="bg-teal-50 dark:bg-teal-950/80 border border-teal-200 dark:border-teal-800 rounded-lg shadow-lg backdrop-blur-sm overflow-hidden w-fit min-w-[200px] max-w-xs">
          {/* Collapsed header - always visible */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setIsExpanded(!isExpanded)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsExpanded(!isExpanded); } }}
            className="flex items-center gap-2 px-3 py-2 w-full text-left cursor-pointer hover:bg-teal-100/50 dark:hover:bg-teal-900/30 transition-colors"
          >
            <Clipboard className="h-4 w-4 text-teal-600 dark:text-teal-400 flex-shrink-0" />
            <span className="text-sm font-medium text-teal-700 dark:text-teal-300">
              {count} exercise{count !== 1 ? "s" : ""} copied
            </span>
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleClear();
                }}
                className="p-0.5 rounded hover:bg-teal-200 dark:hover:bg-teal-800 transition-colors"
                title="Clear clipboard"
              >
                <X className="h-3.5 w-3.5 text-teal-500 dark:text-teal-400" />
              </button>
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-teal-500 dark:text-teal-400" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5 text-teal-500 dark:text-teal-400" />
              )}
            </div>
          </div>

          {/* Expanded content */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="px-3 pb-2 border-t border-teal-200 dark:border-teal-800">
                  {data.sourceStudentName && (
                    <p className="text-[11px] text-teal-600 dark:text-teal-400 mt-1.5 mb-1">
                      From: {data.sourceStudentName}
                    </p>
                  )}
                  <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                    {data.exercises.map((ex, i) => {
                      const name = getDisplayName(ex.pdf_name);
                      const pageInfo =
                        ex.page_mode === "custom" && ex.complex_pages
                          ? `(p${ex.complex_pages})`
                          : ex.page_start && ex.page_end && ex.page_start !== ex.page_end
                            ? `(p${ex.page_start}-${ex.page_end})`
                            : ex.page_start
                              ? `(p${ex.page_start})`
                              : null;
                      return (
                        <li
                          key={i}
                          className="flex items-center gap-1 text-xs text-teal-700 dark:text-teal-300 min-w-0"
                        >
                          <span className="truncate" title={ex.pdf_name}>
                            {name || "(empty)"}
                          </span>
                          {pageInfo && (
                            <span className="text-teal-500 dark:text-teal-400 flex-shrink-0">
                              {pageInfo}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
