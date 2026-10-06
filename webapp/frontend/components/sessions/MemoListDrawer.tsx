"use client";

import { useState, useMemo } from "react";
import { mutate } from "swr";
import { Modal } from "@/components/ui/modal";
import { StarRating } from "@/components/ui/star-rating";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import { MemoModal } from "./MemoModal";
import { useMemos } from "@/lib/hooks";
import { memosAPI } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { cn } from "@/lib/utils";
import { Button, Segmented } from "@/components/controls";
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
  const { user, effectiveRole, isImpersonating, impersonatedTutor } = useAuth();
  const isAdmin = effectiveRole === "Admin" || effectiveRole === "Super Admin";

  // Current user's tutor ID (respects impersonation)
  const currentTutorId = useMemo(() => {
    if (isImpersonating && effectiveRole === "Tutor" && impersonatedTutor?.id) {
      return impersonatedTutor.id;
    }
    return user?.id ?? 0;
  }, [user?.id, isImpersonating, effectiveRole, impersonatedTutor?.id]);

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
              <StickyNote className="h-4 w-4 text-amber-700 dark:text-amber-400" />
            </span>
            <span>Session Memos</span>
          </div>
        }
        size="lg"
      >
        <div className="space-y-4">
          {/* Header row: filter pills + new button */}
          <div className="flex items-center justify-between">
            <Segmented label="Show memos" value={filter} onChange={setFilter} options={filters} />
            <Button variant="primary" size="sm" icon={Plus} onClick={() => setCreatingNew(true)}>
              New memo
            </Button>
          </div>

          {/* Memo list */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
            </div>
          ) : memos.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
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
            "shrink-0 px-1.5 py-0.5 text-[11px] font-semibold rounded uppercase",
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
            <Button size="sm" icon={Pencil} onClick={onEdit}>
              Edit
            </Button>
            {isConfirmingDelete ? (
              <div className="flex items-center gap-1">
                <Button variant="danger" size="sm" icon={Trash2} loading={isDeleting} onClick={onDelete}>
                  Confirm
                </Button>
                <Button size="sm" onClick={onCancelDelete}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button size="sm" icon={Trash2} iconClassName="text-red-600 dark:text-red-400" onClick={onDelete}>
                Delete
              </Button>
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
