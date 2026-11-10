"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { useNativePresentation } from "@/components/design-preview/useNativePresentation";
import { useLessonCheckSurface } from "@/components/design-preview/useLessonCheckSurface";
import previewStyles from "@/components/design-preview/NativePreview.module.css";
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
import { Button } from "@/components/controls";

/** Tells items apart even when a list covers several lessons. */
const checkItemKey = (item: CheckItem) => `${item.sessionId}:${item.homework.session_exercise_id}`;

// Every page of the answer key. One list for good, since the viewer draws the
// whole book again whenever it's handed a new one.
const ALL_PAGES: number[] = [];

interface CheckViewerProps {
  items: CheckItem[];
  lessonPreview?: boolean;
  retainedViews?: { worksheet: Map<number, PdfViewState>; answer: Map<number, PdfViewState> };
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
  lessonPreview,
  retainedViews,
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
  const preview = useNativePresentation();
  const enhanced = !!lessonPreview && preview === "motion";
  const surface = useLessonCheckSurface(enhanced, isMobile, isTopmost, panelRef, onClose);
  const closeViewer = surface.close;

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
  const [ownWorksheetViews] = useState(() => new Map<number, PdfViewState>());
  const [ownAnswerViews] = useState(() => new Map<number, PdfViewState>());
  const worksheetViews = enhanced && retainedViews ? retainedViews.worksheet : ownWorksheetViews;
  const answerViews = enhanced && retainedViews ? retainedViews.answer : ownAnswerViews;

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
        else closeViewer();
        return;
      }
      if (enhanced && e.key === "Tab") {
        const panel = panelRef.current;
        const targets = panel ? [...panel.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex="0"]')].filter(el => el.getClientRects().length > 0) : [];
        const first = targets[0], last = targets[targets.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
      if (enhanced && isMobile && e.target instanceof HTMLElement && e.target.closest('[role="tablist"]') && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        const target = e.key === "Home" ? "answer" : e.key === "End" ? "worksheet" : tab === "answer" ? "worksheet" : "answer";
        setTab(target);
        const tabs = panelRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        tabs?.[target === "answer" ? 0 : 1]?.focus();
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
  }, [isTopmost, onNavigate, previous, next, enhanced, closeViewer, isMobile, tab]);

  // Focus moves into the viewer, and goes back to whatever opened it afterwards.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    if (enhanced) return;
    panelRef.current?.focus();
    return () => opener?.focus?.();
  }, [enhanced]);

  if (typeof document === "undefined") return null;

  const name = getExerciseDisplayName(hw);
  const pageLabel = getPageLabel(exercise);
  const source = assignedLabel(hw);
  const showNav = openable.length > 1 || index < 0;

  const originalHeader = (
    <div className="flex items-center gap-1 pl-3 pr-1 border-b border-[#d4c4a8] dark:border-[#3a3228] bg-wash">
      <BookCheck className="h-4 w-4 flex-none text-accent-ink" />
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
          <p className="truncate text-[11px] text-ink-subtle">
            from {source}
            {(hw.sessions_ago || 0) > 1 && (
              <span className="ml-1 text-amber-700 dark:text-amber-400">· {hw.sessions_ago} sessions ago</span>
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
            <span className="px-1 text-xs tabular-nums text-ink-subtle">
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
        onClick={closeViewer}
        aria-label="Close"
        title="Close (Esc)"
        className={cn(tbBtn, tbBtnIdle, "transition-colors")}
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );

  const header = enhanced ? (
    <header className={previewStyles.checkHeader}>
      <div className={previewStyles.checkIdentity}>
        <BookCheck size={18} aria-hidden />
        <strong>{live.studentName || "Homework"}</strong>
        <div className={previewStyles.checkNavigation}>
          {showNav && <>
            <button type="button" onClick={() => previous && onNavigate(previous)} disabled={!previous} aria-label="Previous homework" title="Previous homework (←)"><ChevronLeft size={20} /></button>
            {index >= 0 && <span>{index + 1} of {openable.length}</span>}
            <button type="button" onClick={() => next && onNavigate(next)} disabled={!next} aria-label="Next homework" title="Next homework (→)"><ChevronRight size={20} /></button>
          </>}
          <button type="button" onClick={closeViewer} aria-label="Close" title="Return to lesson (Esc)"><X size={20} /></button>
        </div>
      </div>
      <div className={previewStyles.checkAssignment}><span title={hw.pdf_name}>{name}</span>{pageLabel && <small>{pageLabel}</small>}</div>
      {source && <p>from {source}{(hw.sessions_ago || 0) > 1 && <span> · {hw.sessions_ago} sessions ago</span>}</p>}
    </header>
  ) : originalHeader;

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
              <p className="max-w-sm px-6 text-xs text-ink-subtle">
                Nobody chose one when the homework was set, and there isn&apos;t one under the usual name in your
                connected folders or in Shelv.
              </p>
              <Button variant="primary" icon={Search} onClick={retryAnswer}>
                Search again
              </Button>
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
      ref={surface.backdrop}
      data-native-check-overlay={enhanced || undefined}
      className={enhanced ? previewStyles.checkBackdrop : "fixed inset-0 flex items-stretch justify-center bg-black/50 sm:items-center sm:p-4"}
      style={{ ...surface.bounds, zIndex }}
      onClick={(e) => {
        if (e.target === e.currentTarget && isTopmost) closeViewer();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Check homework: ${name}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={enhanced ? previewStyles.checkSurface : "flex h-full w-full flex-col overflow-hidden bg-[#e8dcc8] shadow-2xl focus:outline-none dark:bg-[#1e1a14] sm:h-[92vh] sm:max-w-[1500px] sm:rounded-lg sm:border sm:border-[#d4c4a8] dark:sm:border-[#3a3228]"}
      >
        {header}

        {isMobile && (
          <div role={enhanced ? "tablist" : undefined} aria-label={enhanced ? "Homework files" : undefined} className={cn("flex border-b border-[#d4c4a8] dark:border-[#3a3228] bg-wash", enhanced && previewStyles.checkTabs)}>
            <button type="button" role={enhanced ? "tab" : undefined} aria-selected={enhanced ? tab === "answer" : undefined} onClick={() => setTab("answer")} className={viewerTabClass(tab === "answer")}>
              Answers
            </button>
            <button type="button" role={enhanced ? "tab" : undefined} aria-selected={enhanced ? tab === "worksheet" : undefined} onClick={() => setTab("worksheet")} className={viewerTabClass(tab === "worksheet")}>
              Worksheet
            </button>
          </div>
        )}

        <div className="flex flex-1 min-h-0 min-w-0">
          {(!isMobile || tab === "worksheet") && <div className={enhanced ? previewStyles.checkPane : "contents"} data-native-check-pane="worksheet">{enhanced && !isMobile && <div className={previewStyles.checkPaneLabel}>Worksheet</div>}{worksheetPane}</div>}
          {!isMobile && viewerDivider}
          {(!isMobile || tab === "answer") && <div className={enhanced ? previewStyles.checkPane : "contents"} data-native-check-pane="answer">{enhanced && !isMobile && <div className={previewStyles.checkPaneLabel}>Answers</div>}{answerPane}</div>}
        </div>

        <div className={enhanced ? previewStyles.checkFooter : "flex-none max-h-[40vh] overflow-y-auto border-t border-[#d4c4a8] bg-[#faf3e8] px-3 dark:border-[#3a3228] dark:bg-[#221c14] sm:px-4"}>
          <HomeworkCheckRow
            key={key}
            homework={hw}
            sessionId={live.sessionId}
            readOnly={readOnly}
            onMarked={handleMarked}
            enhanced={enhanced}
            inCheckViewer
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
