"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { StarRating, parseStarRating } from "@/components/ui/star-rating";
import { MessageSquarePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import { sessionsAPI } from "@/lib/api";
import { updateSessionInCache } from "@/lib/session-cache";
import { useFormDirtyTracking } from "@/lib/ui-hooks";
import type { Session } from "@/types";
import { getGradeColor } from "@/lib/constants";
import { ratingToEmoji } from "@/lib/formatters";

interface BulkRateModalProps {
  sessions: Session[];
  isOpen: boolean;
  onClose: () => void;
  readOnly?: boolean;
}

export function BulkRateModal({
  sessions,
  isOpen,
  onClose,
  readOnly = false,
}: BulkRateModalProps) {
  const { showToast } = useToast();
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [ratings, setRatings] = useState<Map<number, { rating: number; notes: string }>>(new Map());
  const [saving, setSaving] = useState(false);
  const initialRatingsRef = useRef<Map<number, { rating: number; notes: string }>>(new Map());
  const textareaRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());
  const focusedRowRef = useRef<HTMLDivElement>(null);

  // Dirty tracking for discard warning
  const {
    setIsDirty,
    showCloseConfirm,
    handleCloseAttempt,
    confirmDiscard,
    cancelClose,
  } = useFormDirtyTracking(isOpen, onClose);

  // Initialize ratings from existing session data when modal opens
  useEffect(() => {
    if (isOpen && sessions.length > 0) {
      const initial = new Map<number, { rating: number; notes: string }>();
      sessions.forEach(s => {
        initial.set(s.id, {
          rating: parseStarRating(s.performance_rating),
          notes: s.notes || "",
        });
      });
      setRatings(initial);
      initialRatingsRef.current = new Map(initial.entries());
      setSaving(false);
      setFocusedIndex(0);
    }
  }, [isOpen, sessions]);

  // Scroll focused row into view
  useEffect(() => {
    focusedRowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focusedIndex]);

  const focusedSession = sessions[focusedIndex];

  // Compute which sessions have changes
  const changedSessionIds = useMemo(() => {
    const changed: number[] = [];
    for (const [id, data] of ratings) {
      const initial = initialRatingsRef.current.get(id);
      if (!initial || data.rating !== initial.rating || data.notes !== initial.notes) {
        changed.push(id);
      }
    }
    return changed;
  }, [ratings]);

  const isDirty = changedSessionIds.length > 0;

  // Keep useFormDirtyTracking in sync
  useEffect(() => {
    setIsDirty(isDirty);
  }, [isDirty, setIsDirty]);

  const setRatingFor = useCallback((sessionId: number, rating: number) => {
    setRatings(prev => {
      const next = new Map(prev);
      const current = next.get(sessionId) || { rating: 0, notes: "" };
      next.set(sessionId, { ...current, rating });
      return next;
    });
  }, []);

  const setNotesFor = useCallback((sessionId: number, notes: string) => {
    setRatings(prev => {
      const next = new Map(prev);
      const current = next.get(sessionId) || { rating: 0, notes: "" };
      next.set(sessionId, { ...current, notes });
      return next;
    });
  }, []);

  const handleSaveAll = useCallback(async () => {
    if (readOnly || changedSessionIds.length === 0) return;

    setSaving(true);

    // Optimistic updates for all changed sessions
    for (const id of changedSessionIds) {
      const data = ratings.get(id);
      if (!data) continue;
      const session = sessions.find(s => s.id === id);
      if (!session) continue;
      const ratingEmoji = data.rating > 0 ? ratingToEmoji(data.rating) : null;
      updateSessionInCache({
        ...session,
        performance_rating: ratingEmoji || undefined,
        notes: data.notes || undefined,
      });
    }

    // Fire API calls
    try {
      await Promise.all(
        changedSessionIds.map(id => {
          const data = ratings.get(id)!;
          const ratingEmoji = data.rating > 0 ? ratingToEmoji(data.rating) : null;
          return sessionsAPI.rateSession(id, ratingEmoji, data.notes || null)
            .then(updated => updateSessionInCache(updated));
        })
      );
    } catch {
      showToast('Some ratings failed to save', 'error');
    } finally {
      setSaving(false);
    }

    // Reset dirty state and close
    setIsDirty(false);
    onClose();
  }, [readOnly, changedSessionIds, ratings, sessions, setIsDirty, onClose, showToast]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle Escape when discard confirmation is showing
      if (e.key === "Escape" && showCloseConfirm) {
        e.preventDefault();
        e.stopPropagation();
        cancelClose();
        return;
      }

      const isTextarea = (e.target as HTMLElement)?.tagName === "TEXTAREA";

      // Ctrl+Enter — Save All (works even in textarea)
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        handleSaveAll();
        return;
      }

      // Skip remaining shortcuts if in textarea
      if (isTextarea) return;

      // 1-5 — Set rating for focused session
      if (e.key >= "1" && e.key <= "5" && focusedSession) {
        e.preventDefault();
        setRatingFor(focusedSession.id, parseInt(e.key, 10));
        return;
      }

      // 0 or Backspace — Clear rating for focused session
      if ((e.key === "0" || e.key === "Backspace") && focusedSession) {
        e.preventDefault();
        setRatingFor(focusedSession.id, 0);
        return;
      }

      // Tab — Focus comment textarea of focused session
      if (e.key === "Tab" && focusedSession) {
        e.preventDefault();
        textareaRefs.current.get(focusedSession.id)?.focus();
        return;
      }

      // Arrow up/down — Navigate focus between sessions
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex(prev => Math.max(0, prev - 1));
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex(prev => Math.min(sessions.length - 1, prev + 1));
        return;
      }

      // Block keyboard events from reaching parent handlers
      e.stopPropagation();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, handleSaveAll, focusedSession, setRatingFor, sessions.length, showCloseConfirm, cancelClose]);

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleCloseAttempt}
        title={
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded bg-amber-100 dark:bg-amber-900/30">
              <MessageSquarePlus className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </span>
            <span>Rate & Comment</span>
            <span className="text-xs font-normal text-gray-400 dark:text-gray-500 ml-1">
              ({sessions.length} session{sessions.length !== 1 ? "s" : ""})
            </span>
          </div>
        }
        size="lg"
        footer={
          <div className="space-y-2">
            {/* Keyboard shortcuts hint */}
            <div className="hidden sm:flex items-center justify-center gap-4 text-xs text-gray-400 dark:text-gray-500">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 font-mono text-[10px]">1-5</kbd>
                <span>rate</span>
              </span>
              <span className="text-gray-300 dark:text-gray-600">&middot;</span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 font-mono text-[10px]">&uarr;&darr;</kbd>
                <span>navigate</span>
              </span>
              <span className="text-gray-300 dark:text-gray-600">&middot;</span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 font-mono text-[10px]">Tab</kbd>
                <span>comment</span>
              </span>
              <span className="text-gray-300 dark:text-gray-600">&middot;</span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 font-mono text-[10px]">Ctrl+Enter</kbd>
                <span>save all</span>
              </span>
            </div>
            {/* Footer bar */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {isDirty ? `${changedSessionIds.length} changed` : ""}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleCloseAttempt}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveAll}
                  disabled={!isDirty || saving || readOnly}
                >
                  {saving ? "Saving..." : "Save All"}
                </Button>
              </div>
            </div>
          </div>
        }
      >
        <div className="space-y-0 divide-y divide-gray-200 dark:divide-gray-700 max-h-[60vh] overflow-y-auto">
          {sessions.map((session, idx) => {
            const isFocused = idx === focusedIndex;
            const data = ratings.get(session.id);

            return (
              <div
                key={session.id}
                ref={isFocused ? focusedRowRef : undefined}
                className={cn(
                  "transition-colors",
                  isFocused
                    ? "bg-amber-50/50 dark:bg-amber-900/10 border-l-2 border-l-amber-400"
                    : "border-l-2 border-l-transparent"
                )}
                onClick={() => setFocusedIndex(idx)}
              >
                {/* Session header row */}
                <div className="flex items-center gap-2 px-3 py-2">
                  {/* Student info */}
                  <span className="text-xs font-mono text-gray-400 dark:text-gray-500 shrink-0">
                    {session.school_student_id}
                  </span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {session.student_name}
                  </span>

                  {/* Grade badge */}
                  {session.grade && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded text-gray-800 shrink-0"
                      style={{ backgroundColor: getGradeColor(session.grade, session.lang_stream) }}
                    >
                      {session.grade}{session.lang_stream}
                    </span>
                  )}
                </div>

                {/* Rating controls — always visible */}
                <div className="px-3 pb-3 pt-1 space-y-3">
                  {/* Star rating */}
                  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
                    <StarRating
                      rating={data?.rating || 0}
                      onChange={readOnly ? undefined : (r) => setRatingFor(session.id, r)}
                      size="lg"
                    />
                    {data && data.rating > 0 && (
                      <span className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                        ({data.rating}/5)
                      </span>
                    )}
                    {(!data || data.rating === 0) && (
                      <span className="text-sm text-gray-400 dark:text-gray-500">
                        Click to rate
                      </span>
                    )}
                  </div>

                  {/* Comment textarea */}
                  <textarea
                    ref={(el) => {
                      if (el) textareaRefs.current.set(session.id, el);
                      else textareaRefs.current.delete(session.id);
                    }}
                    value={data?.notes || ""}
                    onChange={(e) => setNotesFor(session.id, e.target.value)}
                    onFocus={() => setFocusedIndex(idx)}
                    placeholder="Add comments..."
                    rows={2}
                    readOnly={readOnly}
                    className={cn(
                      "w-full px-3 py-2 rounded-md border text-sm resize-none",
                      "bg-white dark:bg-gray-900",
                      "border-gray-300 dark:border-gray-600",
                      "text-gray-900 dark:text-gray-100",
                      "focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent",
                      "placeholder:text-gray-400 dark:placeholder:text-gray-500"
                    )}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Modal>

      {/* Close Confirmation Dialog - uses createPortal to render above modal */}
      {showCloseConfirm && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg shadow-xl p-6 w-full max-w-[400px]">
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
              You have unsaved changes. Discard them?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={cancelClose}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDiscard}>
                Discard
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
