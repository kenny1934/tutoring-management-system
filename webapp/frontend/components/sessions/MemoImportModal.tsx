"use client";

import { useState } from "react";
import { mutate } from "swr";
import { Modal } from "@/components/ui/modal";
import { StarRating, parseStarRating } from "@/components/ui/star-rating";
import { memosAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import { cn } from "@/lib/utils";
import type { TutorMemo } from "@/types";
import { ArrowDownToLine, FileText, StickyNote, Star, Loader2, Check } from "lucide-react";

interface MemoImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  memo: TutorMemo;
  sessionId: number;
  onImported?: () => void;
}

export function MemoImportModal({ isOpen, onClose, memo, sessionId, onImported }: MemoImportModalProps) {
  const { showToast } = useToast();
  const [importNotes, setImportNotes] = useState(!!memo.notes);
  const [importExercises, setImportExercises] = useState((memo.exercises?.length ?? 0) > 0);
  const [importRating, setImportRating] = useState(!!memo.performance_rating);
  const [importing, setImporting] = useState(false);

  const nothingToImport = !importNotes && !importExercises && !importRating;
  const ratingNum = memo.performance_rating ? parseStarRating(memo.performance_rating) : 0;

  const handleImport = async () => {
    if (nothingToImport) return;
    setImporting(true);

    try {
      await memosAPI.importToSession(memo.id, sessionId, {
        import_notes: importNotes,
        import_exercises: importExercises,
        import_rating: importRating,
      });

      // Invalidate session + memo caches
      mutate((key: unknown) => {
        if (!Array.isArray(key)) return false;
        return key[0] === "session" || key[0] === "sessions" || key[0] === "session-memo" || key[0] === "tutor-memos" || key[0] === "tutor-memos-pending-count";
      }, undefined, { revalidate: true });

      showToast("Memo data imported into session", "success");
      onImported?.();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to import memo", "error");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded bg-amber-100 dark:bg-amber-900/30">
            <ArrowDownToLine className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </span>
          <span>Import Memo Data</span>
        </div>
      }
      size="md"
      footer={
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={nothingToImport || importing}
            className={cn(
              "px-4 py-2 text-sm rounded-md font-medium",
              "bg-amber-500 hover:bg-amber-600 text-white",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {importing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1.5" />
                Importing...
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5 inline mr-1.5" />
                Import Selected
              </>
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-1">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Select which data to import from the memo into this session.
          Existing session data will be preserved.
        </p>

        {/* Notes */}
        {memo.notes && (
          <label className={cn(
            "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
            importNotes
              ? "border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20"
              : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
          )}>
            <input
              type="checkbox"
              checked={importNotes}
              onChange={(e) => setImportNotes(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-amber-500 focus:ring-amber-400"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <StickyNote className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Notes</span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-3">{memo.notes}</p>
            </div>
          </label>
        )}

        {/* Exercises */}
        {memo.exercises && memo.exercises.length > 0 && (
          <label className={cn(
            "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
            importExercises
              ? "border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20"
              : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
          )}>
            <input
              type="checkbox"
              checked={importExercises}
              onChange={(e) => setImportExercises(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-amber-500 focus:ring-amber-400"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <FileText className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Exercises ({memo.exercises.length})
                </span>
              </div>
              <div className="space-y-1">
                {memo.exercises.map((ex, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                    <span className={cn(
                      "px-1 py-0.5 rounded text-[10px] font-bold",
                      ex.exercise_type === "CW"
                        ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                        : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                    )}>
                      {ex.exercise_type}
                    </span>
                    <span className="truncate">{ex.pdf_name}</span>
                    {ex.page_start && (
                      <span className="text-gray-400 shrink-0">
                        p.{ex.page_start}{ex.page_end ? `-${ex.page_end}` : ""}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </label>
        )}

        {/* Rating */}
        {memo.performance_rating && ratingNum > 0 && (
          <label className={cn(
            "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
            importRating
              ? "border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20"
              : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
          )}>
            <input
              type="checkbox"
              checked={importRating}
              onChange={(e) => setImportRating(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-amber-500 focus:ring-amber-400"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1.5 mb-1">
                <Star className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Performance Rating</span>
              </div>
              <div className="flex items-center gap-1.5">
                <StarRating rating={ratingNum} size="sm" />
                <span className="text-xs text-gray-500">({ratingNum}/5)</span>
              </div>
            </div>
          </label>
        )}

        {!memo.notes && (!memo.exercises || memo.exercises.length === 0) && !memo.performance_rating && (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic text-center py-4">
            This memo has no data to import.
          </p>
        )}
      </div>
    </Modal>
  );
}
