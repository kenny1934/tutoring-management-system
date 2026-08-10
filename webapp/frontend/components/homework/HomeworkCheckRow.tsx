"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Circle, Check, Minus, X, MessageSquare, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { homeworkAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import { StarRating, parseStarRating } from "@/components/ui/star-rating";
import { ratingToEmoji } from "@/lib/formatters";
import { getExerciseDisplayName } from "@/lib/exercise-utils";
import { getPageLabel } from "@/lib/lesson-utils";
import { assignedLabel } from "@/lib/homework-utils";
import { useHomeworkAttachments } from "./useHomeworkAttachments";
import type { HomeworkCompletion, HomeworkStatus, SessionExercise } from "@/types";

const STATES: Array<{
  status: HomeworkStatus;
  icon: typeof Check;
  label: string;
  activeClass: string;
}> = [
  {
    status: "Not Checked",
    icon: Circle,
    label: "Not checked",
    activeClass: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
  },
  {
    status: "Completed",
    icon: Check,
    label: "Done",
    activeClass: "bg-green-500 text-white",
  },
  {
    status: "Partially Completed",
    icon: Minus,
    label: "Partly done",
    activeClass: "bg-amber-500 text-white",
  },
  {
    status: "Not Completed",
    icon: X,
    label: "Not done",
    activeClass: "bg-red-500 text-white",
  },
];

interface HomeworkCheckRowProps {
  homework: HomeworkCompletion;
  /** Session the tutor is marking from. */
  sessionId: number;
  readOnly?: boolean;
  /** Fired with the saved record so the parent can update its cache. */
  onMarked?: (updated: HomeworkCompletion) => void;
}

export function HomeworkCheckRow({
  homework,
  sessionId,
  readOnly,
  onMarked,
}: HomeworkCheckRowProps) {
  const { showToast } = useToast();
  const [state, setState] = useState(homework);
  const [saving, setSaving] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState(homework.tutor_comments || "");
  const commentRef = useRef<HTMLTextAreaElement>(null);

  // Keep in step when the parent refetches.
  useEffect(() => {
    setState(homework);
    setComment(homework.tutor_comments || "");
  }, [homework]);

  useEffect(() => {
    if (commentOpen) commentRef.current?.focus();
  }, [commentOpen]);

  const save = useCallback(
    async (
      updates: Partial<Pick<HomeworkCompletion, "completion_status" | "homework_rating" | "tutor_comments">>,
      previous: HomeworkCompletion
    ) => {
      setSaving(true);
      try {
        const saved = await homeworkAPI.mark(sessionId, homework.session_exercise_id, {
          completion_status: updates.completion_status,
          homework_rating: updates.homework_rating,
          tutor_comments: updates.tutor_comments,
        });
        setState(saved);
        setComment(saved.tutor_comments || "");
        onMarked?.(saved);
      } catch {
        setState(previous);
        setComment(previous.tutor_comments || "");
        showToast("Could not save homework check", "error");
      } finally {
        setSaving(false);
      }
    },
    [homework.session_exercise_id, onMarked, sessionId, showToast]
  );

  const handleStatus = (status: HomeworkStatus) => {
    if (readOnly || state.completion_status === status) return;
    const previous = state;
    setState({ ...state, completion_status: status });
    void save({ completion_status: status }, previous);
  };

  const handleRating = (rating: number) => {
    if (readOnly) return;
    const previous = state;
    const emoji = rating > 0 ? ratingToEmoji(rating) : "";
    setState({ ...state, homework_rating: emoji || undefined });
    void save({ homework_rating: emoji }, previous);
  };

  const handleCommentBlur = () => {
    const trimmed = comment.trim();
    if (trimmed === (state.tutor_comments || "")) {
      setCommentOpen(false);
      return;
    }
    const previous = state;
    setState({ ...state, tutor_comments: trimmed || undefined });
    setCommentOpen(false);
    void save({ tutor_comments: trimmed }, previous);
  };

  const currentStatus: HomeworkStatus = state.completion_status || "Not Checked";
  const source = assignedLabel(state);
  const hasComment = !!state.tutor_comments;

  const attachments = useHomeworkAttachments({
    sessionId,
    sessionExerciseId: homework.session_exercise_id,
    files: state.files || [],
    readOnly,
    onChanged: (saved) => {
      setState(saved);
      onMarked?.(saved);
    },
  });
  const files = state.files || [];
  // Same page rule as every other exercise surface, remarks included.
  const pageLabel = getPageLabel({
    page_start: state.page_start,
    page_end: state.page_end,
    remarks: state.assignment_remarks,
  } as SessionExercise);

  return (
    <div className={cn("py-1.5", saving && "opacity-70")}>
      {/* What was assigned */}
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span className="text-xs text-gray-800 dark:text-gray-200 truncate">
          {getExerciseDisplayName(state)}
        </span>
        {pageLabel && (
          <span className="text-[10px] text-gray-500 dark:text-gray-400 flex-shrink-0 tabular-nums">
            {pageLabel}
          </span>
        )}
        {/* Thumbnails sit below, so the count only earns its place when the
            files themselves are not rendered. */}
        {state.attachment_count > 0 && files.length === 0 && (
          <span
            className="flex items-center gap-0.5 text-[10px] text-gray-500 flex-shrink-0"
            title={`${state.attachment_count} file${state.attachment_count === 1 ? "" : "s"} handed in`}
          >
            <Paperclip className="h-2.5 w-2.5" />
            {state.attachment_count}
          </span>
        )}
      </div>

      {/* Where it came from */}
      {source && (
        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
          from {source}
          {(state.sessions_ago || 0) > 1 && (
            <span className="ml-1 text-amber-600 dark:text-amber-400">
              · {state.sessions_ago} sessions ago
            </span>
          )}
        </p>
      )}

      {/* The four states, plus rating and comment */}
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        <div className="flex items-center gap-0.5" role="group" aria-label="Homework status">
          {STATES.map(({ status, icon: Icon, label, activeClass }) => {
            const active = currentStatus === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => handleStatus(status)}
                disabled={readOnly || saving}
                aria-pressed={active}
                title={label}
                className={cn(
                  "flex items-center justify-center h-6 w-6 rounded transition-colors",
                  active
                    ? activeClass
                    : "bg-gray-100 text-gray-400 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:hover:bg-gray-700",
                  (readOnly || saving) && "cursor-not-allowed opacity-60"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>

        <StarRating
          rating={parseStarRating(state.homework_rating)}
          size="sm"
          onChange={readOnly ? undefined : handleRating}
        />
        <button
          type="button"
          onClick={() => setCommentOpen((open) => !open)}
          disabled={readOnly}
          title={state.tutor_comments || "Add a comment"}
          className={cn(
            "p-1 rounded transition-colors",
            hasComment
              ? "text-blue-600 dark:text-blue-400"
              : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300",
            readOnly && "cursor-not-allowed opacity-60"
          )}
        >
          <MessageSquare className="h-3.5 w-3.5" />
        </button>

        {attachments.control}
      </div>

      {attachments.previews}

      {/* Comment, shown once asked for or once one exists */}
      {(commentOpen || hasComment) && (
        <div className="mt-1">
          {commentOpen ? (
            <textarea
              ref={commentRef}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onBlur={handleCommentBlur}
              rows={2}
              maxLength={1000}
              placeholder="How was it? Anything to follow up"
              className="w-full text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          ) : (
            <button
              type="button"
              onClick={() => setCommentOpen(true)}
              disabled={readOnly}
              className="text-[11px] text-left text-gray-600 dark:text-gray-300 italic hover:text-gray-900 dark:hover:text-gray-100"
            >
              {state.tutor_comments}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
