"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { BookCheck, ChevronLeft, ChevronRight, Files, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { PdfPageViewer, tbBtn, tbBtnIdle, tbBtnOn, type PdfViewState } from "@/components/lesson/PdfPageViewer";
import { PdfRenderFailure, viewerDivider, viewerTabClass } from "@/components/lesson/ViewerParts";
import { useExercisePdf } from "@/hooks/useExercisePdf";
import { useIsMobile } from "@/hooks/useIsMobile";
import { keyIsForOverlayAbove, useOverlayLayer } from "@/hooks/useOverlayLayer";
import type { AnswerSearchResult } from "@/lib/answer-file-utils";
import { getDisplayName, getExerciseDisplayName } from "@/lib/exercise-utils";
import { canOpenInCheckViewer, homeworkAsExercise, type CheckItem } from "@/lib/homework-check";
import { assignedLabel } from "@/lib/homework-utils";
import { getPageLabel, hasBrowserModifier, isTypingTarget, NO_FILE_ERROR } from "@/lib/lesson-utils";
import { HomeworkCheckRow } from "./HomeworkCheckRow";
import { useHomeworkAnswer } from "./useHomeworkAnswer";
import type { HomeworkCompletion, SessionExercise } from "@/types";

/** Tells items apart even when a list covers several lessons. */
const checkItemKey = (item: CheckItem) => `${item.sessionId}:${item.homework.session_exercise_id}`;

// Every page of the answer key. One list for good, since the viewer draws the
// whole book again whenever it's handed a new one.
const ALL_PAGES: number[] = [];

interface CheckViewerProps {
  items: CheckItem[];
  current: CheckItem;
  /** Moves to another item. Also handed a function, to refresh the open item's record after a save. */
  onNavigate: Dispatch<SetStateAction<CheckItem | null>>;
  onClose: () => void;
  readOnly?: boolean;
  onMarked?: (updated: HomeworkCompletion) => void;
  cache: Map<string, ArrayBuffer>;
  searches: Map<string, AnswerSearchResult | null>;
}

/**
 * The Check Viewer: one homework item's worksheet and its answer key side by
 * side, with the marking row underneath, so a tutor can mark a student's
 * paper homework without leaving the panel it's listed in. Both files are cut
 * to the pages that were set. On a phone they're two tabs, with the answers
 * first, because the answers are what a tutor marking paper needs.
 *
 * Next and previous step through the list it was opened from, skipping any
 * homework that's only a web link. The arrow keys do the same, and Escape
 * closes it. While it's open it keeps every key to itself, so a shortcut on
 * the lesson or the page underneath can't fire. Escape in the comment box
 * finishes the comment first, so a half-typed comment is saved rather than
 * lost when the viewer closes.
 */
export function CheckViewer({
  items,
  current,
  onNavigate,
  onClose,
  readOnly,
  onMarked,
  cache,
  searches,
}: CheckViewerProps) {
  const { isTopmost, zIndex } = useOverlayLayer(true, { lockScroll: true });
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<"answer" | "worksheet">("answer");
  const panelRef = useRef<HTMLDivElement>(null);

  // --- Where we are in the list ---
  const openable = useMemo(() => items.filter((item) => canOpenInCheckViewer(item.homework)), [items]);
  const key = checkItemKey(current);
  const index = openable.findIndex((item) => checkItemKey(item) === key);
  // The list's copy is the freshest, since a save anywhere folds into it. The
  // viewer's own copy stands in once the list has dropped the item, which a
  // filtered list does when a mark takes the item out of the filter.
  const live = index >= 0 ? openable[index] : current;
  // Where the item was, so next and previous still work after it drops out.
  const [lastIndex, setLastIndex] = useState(Math.max(index, 0));
  if (index >= 0 && index !== lastIndex) setLastIndex(index);
  const previous = index >= 0 ? openable[index - 1] : openable[lastIndex - 1];
  const next = index >= 0 ? openable[index + 1] : openable[lastIndex];

  // --- The two files ---
  const hw = live.homework;
  const id = hw.session_exercise_id;
  // Rebuilt only when the file or its pages change, since the worksheet
  // reloads whenever it gets a new exercise, and a saved mark hands back a
  // new record every time.
  const exercise: SessionExercise = useMemo(
    () => homeworkAsExercise(hw),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, hw.pdf_name, hw.page_start, hw.page_end, hw.assignment_remarks],
  );
  const pdf = useExercisePdf(exercise, cache);
  const { answer, retry: retryAnswer } = useHomeworkAnswer(hw, cache, searches);
  // The item whose answer key shows every page. Any other starts on the pages that were set.
  const [allPagesFor, setAllPagesFor] = useState<string | null>(null);
  const allAnswerPages = allPagesFor === key;
  // Zoom and scroll per item, kept apart for the worksheet and the answers.
  const [worksheetViews] = useState(() => new Map<number, PdfViewState>());
  const [answerViews] = useState(() => new Map<number, PdfViewState>());

  // --- Saving from the marking row ---
  const handleMarked = useCallback(
    (saved: HomeworkCompletion) => {
      // Refreshes the viewer's own copy, but only if the tutor hasn't moved on
      // while the save was on its way.
      onNavigate((open) =>
        open && open.homework.session_exercise_id === saved.session_exercise_id
          ? { ...open, homework: saved }
          : open,
      );
      onMarked?.(saved);
    },
    [onMarked, onNavigate],
  );

  // --- Keys ---
  useEffect(() => {
    // On the window, before anything else hears the key. While a photo is
    // open over the viewer, the photo answers the keys instead.
    const onKey = (e: KeyboardEvent) => {
      if (keyIsForOverlayAbove(e, isTopmost)) return;
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        if (isTypingTarget(e.target)) (e.target as HTMLElement).blur();
        else onClose();
        return;
      }
      if (isTypingTarget(e.target) || hasBrowserModifier(e)) return;
      if (e.key === "ArrowLeft" && previous) {
        e.preventDefault();
        onNavigate(previous);
      } else if (e.key === "ArrowRight" && next) {
        e.preventDefault();
        onNavigate(next);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [isTopmost, onClose, onNavigate, previous, next]);

  // Focus moves into the viewer, and goes back to whatever opened it afterwards.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  if (typeof document === "undefined") return null;

  const name = getExerciseDisplayName(hw);
  const pageLabel = getPageLabel(exercise);
  const source = assignedLabel(hw);
  const showNav = openable.length > 1 || index < 0;

  const header = (
    <div className="flex items-center gap-1 pl-3 pr-1 border-b border-[#d4c4a8] dark:border-[#3a3228] bg-[#f0e6d4] dark:bg-[#252018]">
      <BookCheck className="h-4 w-4 flex-none text-[#a0704b]" />
      <div className="min-w-0 flex-1 py-1.5 pl-1">
        <div className="flex items-baseline gap-1.5 min-w-0">
          {live.studentName && (
            <span className="flex-none text-sm font-semibold text-[#6b4c30] dark:text-[#d4a574]">
              {live.studentName}
            </span>
          )}
          <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-200" title={hw.pdf_name}>
            {name}
          </span>
          {pageLabel && (
            <span className="flex-none text-xs tabular-nums text-gray-500 dark:text-gray-400">{pageLabel}</span>
          )}
        </div>
        {source && (
          <p className="truncate text-[11px] text-[#8b7355] dark:text-[#a09080]">
            from {source}
            {(hw.sessions_ago || 0) > 1 && (
              <span className="ml-1 text-amber-600 dark:text-amber-400">· {hw.sessions_ago} sessions ago</span>
            )}
          </p>
        )}
      </div>
      {showNav && (
        <div className="flex flex-none items-center">
          <button
            type="button"
            onClick={() => previous && onNavigate(previous)}
            disabled={!previous}
            aria-label="Previous homework"
            title="Previous homework (←)"
            className={cn(tbBtn, tbBtnIdle, "transition-colors disabled:opacity-40 disabled:pointer-events-none")}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          {index >= 0 && (
            <span className="px-1 text-xs tabular-nums text-[#8b7355] dark:text-[#a09080]">
              {index + 1} of {openable.length}
            </span>
          )}
          <button
            type="button"
            onClick={() => next && onNavigate(next)}
            disabled={!next}
            aria-label="Next homework"
            title="Next homework (→)"
            className={cn(tbBtn, tbBtnIdle, "transition-colors disabled:opacity-40 disabled:pointer-events-none")}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        title="Close (Esc)"
        className={cn(tbBtn, tbBtnIdle, "transition-colors")}
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );

  const worksheetPane = (
    <div className="relative flex flex-1 min-h-0 min-w-0">
      <ErrorBoundary resetKey={key} onReset={pdf.retry} fallback={<PdfRenderFailure onRetry={pdf.retry} />}>
        <PdfPageViewer
          pdfData={pdf.pdfData}
          pageNumbers={pdf.pageNumbers}
          exerciseId={id}
          isLoading={pdf.pdfLoading}
          loadingMessage={pdf.pdfLoadingMessage}
          error={pdf.pdfError}
          exerciseLabel={name}
          // Trying again can't find a file the homework doesn't have.
          onRetry={pdf.pdfError === NO_FILE_ERROR ? undefined : pdf.retry}
          viewStates={worksheetViews}
          viewKey={id}
        />
      </ErrorBoundary>
    </div>
  );

  // Only offered when the answer key is cut to some of its pages.
  const narrowed = answer.kind === "ready" && answer.pageNumbers.length > 0;
  const showingAll = narrowed && allAnswerPages;
  const allPagesButton = narrowed ? (
    <button
      type="button"
      onClick={() => setAllPagesFor(allAnswerPages ? null : key)}
      aria-pressed={allAnswerPages}
      title={allAnswerPages ? "Show only the pages for this homework" : "Show every page of the answer key"}
      className={cn(tbBtn, allAnswerPages ? tbBtnOn : tbBtnIdle, "transition-colors")}
    >
      <Files className="h-4 w-4" />
      <span className="hidden @[560px]/toolbar:inline">All pages</span>
    </button>
  ) : undefined;

  const answerPane = (
    <div className="relative flex flex-1 min-h-0 min-w-0">
      <ErrorBoundary resetKey={key} onReset={retryAnswer} fallback={<PdfRenderFailure onRetry={retryAnswer} />}>
        <PdfPageViewer
          pdfData={answer.kind === "ready" ? answer.data : null}
          pageNumbers={answer.kind === "ready" && !showingAll ? answer.pageNumbers : ALL_PAGES}
          // The renders are remembered per item, so every page gets a key of its own.
          exerciseId={showingAll ? undefined : id}
          isLoading={answer.kind === "searching" || answer.kind === "loading"}
          loadingMessage={
            answer.kind === "searching" ? "Looking for the answer key…"
              : answer.kind === "loading" ? answer.message
              : null
          }
          error={answer.kind === "failed" ? "We couldn't open the answer key" : null}
          onRetry={answer.kind === "failed" ? retryAnswer : undefined}
          exerciseLabel={
            answer.kind === "ready" || answer.kind === "failed" ? `ANS: ${getDisplayName(answer.path)}` : "Answer key"
          }
          emptyMessage="We couldn't find an answer key for this worksheet."
          emptyAction={
            <>
              <p className="max-w-sm px-6 text-xs text-[#8b7355] dark:text-[#a09080]">
                Nobody chose one when the homework was set, and there isn&apos;t one under the usual name in your
                connected folders or in Shelv.
              </p>
              <button
                type="button"
                onClick={retryAnswer}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-[#a0704b] text-white hover:bg-[#8b6040] transition-colors"
              >
                <Search className="h-3.5 w-3.5" />
                Search again
              </button>
            </>
          }
          viewStates={answerViews}
          viewKey={showingAll ? undefined : id}
          // A tutor going through the answers with a student can cover what's still to come.
          coverButton
          toolbarStart={allPagesButton}
        />
      </ErrorBoundary>
    </div>
  );

  return createPortal(
    <div
      className="fixed inset-0 flex items-stretch justify-center bg-black/50 sm:items-center sm:p-4"
      style={{ zIndex }}
      onClick={(e) => {
        if (e.target === e.currentTarget && isTopmost) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Check homework: ${name}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full flex-col overflow-hidden bg-[#e8dcc8] shadow-2xl focus:outline-none dark:bg-[#1e1a14] sm:h-[92vh] sm:max-w-[1500px] sm:rounded-lg sm:border sm:border-[#d4c4a8] dark:sm:border-[#3a3228]"
      >
        {header}

        {isMobile && (
          <div className="flex border-b border-[#d4c4a8] dark:border-[#3a3228] bg-[#f0e6d4] dark:bg-[#252018]">
            <button type="button" onClick={() => setTab("answer")} className={viewerTabClass(tab === "answer")}>
              Answers
            </button>
            <button type="button" onClick={() => setTab("worksheet")} className={viewerTabClass(tab === "worksheet")}>
              Worksheet
            </button>
          </div>
        )}

        <div className="flex flex-1 min-h-0 min-w-0">
          {(!isMobile || tab === "worksheet") && worksheetPane}
          {!isMobile && viewerDivider}
          {(!isMobile || tab === "answer") && answerPane}
        </div>

        <div className="flex-none max-h-[40vh] overflow-y-auto border-t border-[#d4c4a8] bg-[#faf3e8] px-3 dark:border-[#3a3228] dark:bg-[#221c14] sm:px-4">
          <HomeworkCheckRow
            key={key}
            homework={hw}
            sessionId={live.sessionId}
            readOnly={readOnly}
            onMarked={handleMarked}
            inCheckViewer
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
