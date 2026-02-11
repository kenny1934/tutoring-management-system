"use client";

import { useState, useMemo } from "react";
import { mutate } from "swr";
import { Modal } from "@/components/ui/modal";
import { StarRating } from "@/components/ui/star-rating";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import { MemoModal } from "./MemoModal";
import { useMemos, useTutors } from "@/lib/hooks";
import { memosAPI } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { cn } from "@/lib/utils";
import { CURRENT_USER_TUTOR } from "@/lib/constants";
import type { TutorMemo } from "@/types";
import {
  StickyNote,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  FileText,
  Loader2,
} from "lucide-react";

type Filter = "pending" | "linked" | "all";

interface MemoListDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MemoListDrawer({ isOpen, onClose }: MemoListDrawerProps) {
  const { showToast } = useToast();
  const { effectiveRole } = useAuth();
  const { data: tutors } = useTutors();
  const isAdmin = effectiveRole === "Admin" || effectiveRole === "Super Admin";

  const currentTutorId = useMemo(() => {
    const tutor = tutors?.find((t) => t.tutor_name === CURRENT_USER_TUTOR);
    return tutor?.id ?? 0;
  }, [tutors]);

  const [filter, setFilter] = useState<Filter>("pending");
  const [editingMemo, setEditingMemo] = useState<TutorMemo | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const memoParams = useMemo(() => {
    const params: { status?: 'pending' | 'linked'; tutor_id?: number } = {};
    if (filter !== "all") params.status = filter;
    if (!isAdmin && currentTutorId) params.tutor_id = currentTutorId;
    return Object.keys(params).length > 0 ? params : undefined;
  }, [filter, isAdmin, currentTutorId]);

  const { data: memos = [], isLoading } = useMemos(memoParams);

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await memosAPI.delete(id);
      showToast("Memo deleted", "success");
      mutate((key: unknown) => Array.isArray(key) && (key[0] === "tutor-memos" || key[0] === "tutor-memos-pending-count"), undefined, { revalidate: true });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete memo", "error");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const filters: { value: Filter; label: string }[] = [
    { value: "pending", label: "Pending" },
    { value: "linked", label: "Linked" },
    { value: "all", label: "All" },
  ];

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded bg-amber-100 dark:bg-amber-900/30">
              <StickyNote className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </span>
            <span>Session Memos</span>
          </div>
        }
        size="lg"
      >
        <div className="space-y-4">
          {/* Header row: filter pills + new button */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {filters.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-full border transition-colors",
                    filter === f.value
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCreatingNew(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-amber-500 hover:bg-amber-600 text-white transition-colors"
            >
              <Plus className="h-3 w-3" />
              New Memo
            </button>
          </div>

          {/* Memo list */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : memos.length === 0 ? (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500">
              <StickyNote className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No {filter === "all" ? "" : filter} memos found</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {memos.map((memo) => (
                <MemoCard
                  key={memo.id}
                  memo={memo}
                  onEdit={() => setEditingMemo(memo)}
                  onDelete={() => {
                    if (confirmDeleteId === memo.id) {
                      handleDelete(memo.id);
                    } else {
                      setConfirmDeleteId(memo.id);
                    }
                  }}
                  isDeleting={deletingId === memo.id}
                  isConfirmingDelete={confirmDeleteId === memo.id}
                  onCancelDelete={() => setConfirmDeleteId(null)}
                />
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* New Memo modal */}
      {creatingNew && (
        <MemoModal
          isOpen={true}
          onClose={() => setCreatingNew(false)}
        />
      )}

      {/* Edit Memo modal */}
      {editingMemo && (
        <MemoModal
          isOpen={true}
          onClose={() => setEditingMemo(null)}
          memo={editingMemo}
        />
      )}
    </>
  );
}

interface MemoCardProps {
  memo: TutorMemo;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  isConfirmingDelete: boolean;
  onCancelDelete: () => void;
}

function MemoCard({ memo, onEdit, onDelete, isDeleting, isConfirmingDelete, onCancelDelete }: MemoCardProps) {
  const isPending = memo.status === "pending";
  const exerciseCount = memo.exercises?.length ?? 0;
  const ratingCount = memo.performance_rating ? (memo.performance_rating.match(/⭐/g) || []).length : 0;

  return (
    <div
      className={cn(
        "p-3 rounded-lg border transition-colors",
        isPending
          ? "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20"
          : "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20"
      )}
    >
      {/* Top row: student info + status */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <StudentInfoBadges
          student={{
            student_id: memo.student_id,
            student_name: memo.student_name,
            school_student_id: memo.school_student_id ?? undefined,
            grade: memo.grade ?? undefined,
            school: memo.school ?? undefined,
          }}
          showLocationPrefix
        />
        <span
          className={cn(
            "shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded uppercase",
            isPending
              ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
              : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
          )}
        >
          {memo.status}
        </span>
      </div>

      {/* Details row: date, time, location, exercises */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-400 mb-1.5">
        <span>{new Date(memo.memo_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        {memo.time_slot && <span>{memo.time_slot}</span>}
        {memo.location && <span>{memo.location}</span>}
        {exerciseCount > 0 && (
          <span className="flex items-center gap-0.5">
            <FileText className="h-3 w-3" />
            {exerciseCount} exercise{exerciseCount > 1 ? "s" : ""}
          </span>
        )}
        {ratingCount > 0 && <StarRating rating={ratingCount} size="sm" showEmpty={false} />}
      </div>

      {/* Notes preview */}
      {memo.notes && (
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2 italic">
          {memo.notes}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1.5">
        {isPending ? (
          <>
            <button
              onClick={onEdit}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
            {isConfirmingDelete ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={onDelete}
                  disabled={isDeleting}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50"
                >
                  {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  Confirm
                </button>
                <button
                  onClick={onCancelDelete}
                  className="px-2 py-1 text-xs font-medium rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={onDelete}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
            )}
          </>
        ) : (
          memo.linked_session_id && (
            <a
              href={`/sessions/${memo.linked_session_id}`}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              View Session
            </a>
          )
        )}
      </div>
    </div>
  );
}
