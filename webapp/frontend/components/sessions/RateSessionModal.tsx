"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { StarRating, parseStarRating } from "@/components/ui/star-rating";
import { MessageSquarePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { sessionsAPI } from "@/lib/api";
import { updateSessionInCache } from "@/lib/session-cache";
import type { Session } from "@/types";

// Grade tag colors (matches EditSessionModal)
const GRADE_COLORS: Record<string, string> = {
  "F1C": "#c2dfce",
  "F1E": "#cedaf5",
  "F2C": "#fbf2d0",
  "F2E": "#f0a19e",
  "F3C": "#e2b1cc",
  "F3E": "#ebb26e",
  "F4C": "#7dc347",
  "F4E": "#a590e6",
};

const getGradeColor = (grade: string | undefined, langStream: string | undefined): string => {
  const key = `${grade || ""}${langStream || ""}`;
  return GRADE_COLORS[key] || "#e5e7eb";
};

// Convert rating number to emoji stars
function ratingToEmoji(rating: number): string {
  return "⭐".repeat(rating);
}

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
  const [isSaving, setIsSaving] = useState(false);
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState("");

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setRating(parseStarRating(session.performance_rating));
      setNotes(session.notes || "");
    }
  }, [isOpen, session]);

  const handleSave = async () => {
    setIsSaving(true);

    try {
      // Convert rating to emoji stars
      const ratingEmoji = rating > 0 ? ratingToEmoji(rating) : null;

      // Call API
      const updatedSession = await sessionsAPI.rateSession(
        session.id,
        ratingEmoji,
        notes || null
      );

      // Update cache
      updateSessionInCache(updatedSession);

      // Notify parent
      if (onSave) {
        onSave(session.id, rating, notes);
      }

      onClose();
    } catch (error) {
      console.error("Failed to save rating:", error);
    } finally {
      setIsSaving(false);
    }
  };

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
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
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
