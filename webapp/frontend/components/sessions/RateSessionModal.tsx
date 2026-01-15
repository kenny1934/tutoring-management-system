"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { StarRating, parseStarRating } from "@/components/ui/star-rating";
import { MessageSquarePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { sessionsAPI } from "@/lib/api";
import { updateSessionInCache } from "@/lib/session-cache";
import type { Session } from "@/types";
import { getGradeColor } from "@/lib/constants";
import { ratingToEmoji } from "@/lib/formatters";

interface RateSessionModalProps {
  session: Session;
  isOpen: boolean;
  onClose: () => void;
  onSave?: (sessionId: number, rating: number, notes: string) => void;
}

export function RateSessionModal({
  session,
  isOpen,
  onClose,
  onSave,
}: RateSessionModalProps) {
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState("");

  // Track if form has been initialized for this modal open
  const initializedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset form only when modal first opens, not on session changes
  useEffect(() => {
    if (isOpen && !initializedRef.current) {
      initializedRef.current = true;
      setRating(parseStarRating(session.performance_rating));
      setNotes(session.notes || "");
    }
    if (!isOpen) {
      initializedRef.current = false;
    }
  }, [isOpen, session]);

  const handleSave = useCallback(async () => {
    const sessionId = session.id;
    const currentRating = rating;
    const currentNotes = notes;
    const ratingEmoji = currentRating > 0 ? ratingToEmoji(currentRating) : null;

    // Build optimistic session state
    const optimisticSession = {
      ...session,
      performance_rating: ratingEmoji || undefined,
      notes: currentNotes || undefined,
    };

    // Update cache IMMEDIATELY (optimistic)
    updateSessionInCache(optimisticSession);

    // Close modal
    onClose();

    // Save in background - will update cache again with server state
    try {
      const updatedSession = await sessionsAPI.rateSession(
        sessionId,
        ratingEmoji,
        currentNotes || null
      );
      updateSessionInCache(updatedSession);

      // Notify parent
      if (onSave) {
        onSave(sessionId, currentRating, currentNotes);
      }
    } catch (error) {
      console.error("Failed to save rating:", error);
      // Could rollback cache or show toast here
    }
  }, [session, rating, notes, onClose, onSave]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if focused on textarea (allow normal typing)
      const isTextarea = (e.target as HTMLElement)?.tagName === 'TEXTAREA';

      // Cmd/Ctrl+Enter - Save (works even in textarea)
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handleSave();
        return;
      }

      // Skip remaining shortcuts if in textarea
      if (isTextarea) return;

      // Number keys 1-5 - Set rating
      if (e.key >= '1' && e.key <= '5') {
        e.preventDefault();
        setRating(parseInt(e.key, 10));
        return;
      }

      // 0 or Backspace - Clear rating
      if (e.key === '0' || e.key === 'Backspace') {
        e.preventDefault();
        setRating(0);
        return;
      }

      // Tab - Focus comment textarea
      if (e.key === 'Tab') {
        e.preventDefault();
        textareaRef.current?.focus();
        return;
      }
    };

    // Use capture phase to intercept before modal's handlers
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, handleSave]);

  const inputClass = cn(
    "w-full px-3 py-2 rounded-md border",
    "bg-white dark:bg-gray-900",
    "border-gray-300 dark:border-gray-600",
    "text-gray-900 dark:text-gray-100",
    "focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent",
    "text-sm"
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded bg-amber-100 dark:bg-amber-900/30">
            <MessageSquarePlus className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </span>
          <span>Rate & Comment</span>
        </div>
      }
      size="md"
      footer={
        <div className="space-y-2">
          {/* Keyboard shortcuts hint */}
          <div className="flex items-center justify-center gap-4 text-xs text-gray-400 dark:text-gray-500">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 font-mono text-[10px]">1-5</kbd>
              <span>rate</span>
            </span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 font-mono text-[10px]">0</kbd>
              <span>clear</span>
            </span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 font-mono text-[10px]">Tab</kbd>
              <span>comment</span>
            </span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 font-mono text-[10px]">Ctrl+Enter</kbd>
              <span>save</span>
            </span>
          </div>
          {/* Buttons */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save Changes
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Session Info Header */}
        <div className="flex items-center gap-2 flex-wrap bg-[#f5ebe0] dark:bg-[#3d3628] rounded-lg p-3">
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {session.school_student_id}
          </span>
          <span className="text-base font-bold text-gray-900 dark:text-gray-100">
            {session.student_name}
          </span>
          {session.grade && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded text-gray-800"
              style={{ backgroundColor: getGradeColor(session.grade, session.lang_stream) }}
            >
              {session.grade}{session.lang_stream}
            </span>
          )}
          {session.school && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
              {session.school}
            </span>
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
            {new Date(session.session_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} | {session.time_slot}
          </span>
        </div>

        {/* Performance Rating */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Performance Rating
          </label>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
            <StarRating
              rating={rating}
              onChange={setRating}
              size="lg"
            />
            {rating > 0 && (
              <span className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                ({rating}/5)
              </span>
            )}
            {rating === 0 && (
              <span className="text-sm text-gray-400 dark:text-gray-500">
                Click to rate
              </span>
            )}
          </div>
        </div>

        {/* Comments */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Comments
          </label>
          <textarea
            ref={textareaRef}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add comments..."
            rows={4}
            className={cn(inputClass, "resize-none")}
          />
        </div>
      </div>
    </Modal>
  );
}
