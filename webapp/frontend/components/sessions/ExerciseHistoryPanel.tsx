"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, ChevronDown, PenTool, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { sessionsAPI } from "@/lib/api";
import { RecapExerciseItem } from "./RecapExerciseItem";
import type { ExerciseHistorySession } from "@/types";
import type { PrintStampInfo } from "@/lib/file-system";

interface ExerciseHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: number;
  studentName: string;
  currentSessionId: number;
  stamp?: PrintStampInfo;
}

const PAGE_SIZE = 10;

export function ExerciseHistoryPanel({
  isOpen,
  onClose,
  studentId,
  studentName,
  currentSessionId,
  stamp,
}: ExerciseHistoryPanelProps) {
  const [sessions, setSessions] = useState<ExerciseHistorySession[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchHistory = useCallback(async (beforeDate?: string) => {
    setLoading(true);
    try {
      const result = await sessionsAPI.getExerciseHistory(studentId, {
        beforeDate,
        limit: PAGE_SIZE,
        excludeSessionId: currentSessionId,
      });
      setSessions(prev => beforeDate ? [...prev, ...result.sessions] : result.sessions);
      setHasMore(result.has_more);
    } catch {
      // silently fail — panel is supplementary
    } finally {
      setLoading(false);
      setInitialLoaded(true);
    }
  }, [studentId, currentSessionId]);

  // Load on open
  useEffect(() => {
    if (isOpen && !initialLoaded) {
      fetchHistory();
    }
  }, [isOpen, initialLoaded, fetchHistory]);

  // Reset when closed
  useEffect(() => {
    if (!isOpen) {
      setSessions([]);
      setHasMore(false);
      setInitialLoaded(false);
    }
  }, [isOpen]);

  // Escape key handler — stop propagation to prevent modal from closing
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }
    };
    // Use capture phase to intercept before modal's handler
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [isOpen, onClose]);

  const handleLoadMore = () => {
    if (loading || !hasMore || sessions.length === 0) return;
    const lastSession = sessions[sessions.length - 1];
    fetchHistory(lastSession.session_date);
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[10001] bg-black/30"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={cn(
              "fixed z-[10002] bg-[#fef9f3] dark:bg-[#1a1611] border-l border-[#d4a574] dark:border-[#6b5a4a] shadow-xl flex flex-col",
              // Mobile: full screen, Desktop: right panel
              "inset-0 md:inset-y-0 md:left-auto md:right-0 md:w-96"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-gradient-to-r from-purple-50 to-[#fef9f3] dark:from-purple-900/20 dark:to-[#1a1611]">
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                  Exercise History
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {studentName}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {!initialLoaded && loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-purple-500" />
                </div>
              ) : sessions.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">
                  No exercise history found
                </p>
              ) : (
                <>
                  {sessions.map((session) => {
                    const cw = session.exercises.filter(
                      (ex) => ex.exercise_type === "CW" || ex.exercise_type === "Classwork"
                    );
                    const hw = session.exercises.filter(
                      (ex) => ex.exercise_type === "HW" || ex.exercise_type === "Homework"
                    );

                    return (
                      <div
                        key={session.session_id}
                        className="border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden"
                      >
                        {/* Session date header */}
                        <div className="px-3 py-1.5 bg-gray-50 dark:bg-[#252015] border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                            {new Date(session.session_date + "T00:00:00").toLocaleDateString(
                              "en-US",
                              { weekday: "short", month: "short", day: "numeric" }
                            )}
                            {session.time_slot && (
                              <span className="text-gray-500 dark:text-gray-400 ml-1">
                                · {session.time_slot}
                              </span>
                            )}
                          </span>
                        </div>

                        <div className="px-3 py-2 space-y-1.5">
                          {/* Classwork */}
                          {cw.length > 0 && (
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1">
                                <PenTool className="h-2.5 w-2.5 text-red-500" />
                                <span className="text-[10px] text-gray-500 dark:text-gray-400">CW</span>
                              </div>
                              {cw.map((ex) => (
                                <RecapExerciseItem
                                  key={ex.id}
                                  pdfName={ex.pdf_name}
                                  pageStart={ex.page_start}
                                  pageEnd={ex.page_end}
                                  stamp={stamp}
                                />
                              ))}
                            </div>
                          )}

                          {/* Homework */}
                          {hw.length > 0 && (
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1">
                                <Home className="h-2.5 w-2.5 text-blue-500" />
                                <span className="text-[10px] text-gray-500 dark:text-gray-400">HW</span>
                              </div>
                              {hw.map((ex) => (
                                <RecapExerciseItem
                                  key={ex.id}
                                  pdfName={ex.pdf_name}
                                  pageStart={ex.page_start}
                                  pageEnd={ex.page_end}
                                  stamp={stamp}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Load More */}
                  {hasMore && (
                    <button
                      type="button"
                      onClick={handleLoadMore}
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 transition-colors disabled:opacity-50"
                    >
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <ChevronDown className="h-3.5 w-3.5" />
                          Load More
                        </>
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
