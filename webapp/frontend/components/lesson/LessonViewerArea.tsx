"use client";

import { useState, type ReactNode, type Ref } from "react";
import { NotebookPen } from "lucide-react";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { getPrintButtonTitle, NO_FILE_ERROR, type PrintingState } from "@/lib/lesson-utils";
import type { PrintStampInfo } from "@/lib/pdf-utils";
import type { useExercisePdf } from "@/hooks/useExercisePdf";
import type { useAnswerKey } from "@/hooks/useAnswerKey";
import type { useDraft } from "@/hooks/useDraft";
import type { useLessonInk } from "@/hooks/useLessonInk";
import type { SessionExercise } from "@/types";
import { PdfPageViewer, type PdfViewerHandle, type PdfViewState } from "./PdfPageViewer";
import { PdfRenderFailure, viewerDivider, viewerTabClass } from "./ViewerParts";
import { DraftPane, DraftTrayLane } from "./DraftPane";
import { DraftSplit } from "./DraftSplit";
import { FoldingAnswerKey } from "./FoldingAnswerKey";
import { LESSON_DRAFT_DESCRIPTION } from "./LessonDraftRow";

/** The ink handlers the worksheet and the Draft draw through. */
type ViewerInk = Pick<
  ReturnType<typeof useLessonInk>,
  "tools" | "annotations" | "openHasInk" | "onPageStrokesChange" | "onPagesStrokesChange" | "onUndo" | "onRedo" | "onClearAll"
  | "onClearPage" | "onClearPages"
>;

interface LessonViewerAreaProps {
  isMobile: boolean;
  /** Shown above the viewers. The multi-student view puts its student strip here. */
  top?: ReactNode;
  /** The open exercise when it's a link, shown in the worksheet's place. */
  link?: ReactNode;
  /** The exercise on screen, or null before one is picked. */
  exercise: SessionExercise | null;
  /** The name the worksheet's viewer shows. The answer key's has "ANS:" in front. */
  exerciseLabel: string | undefined;
  pdf: ReturnType<typeof useExercisePdf>;
  answer: ReturnType<typeof useAnswerKey>;
  draft: ReturnType<typeof useDraft>;
  ink: ViewerInk;
  /** The student stamp on the worksheet's pages. A preview is class-wide, so it has none. */
  stamp: PrintStampInfo | undefined;
  onSaveAnnotated: () => void;
  /** Prints the worksheet on screen. Leave it out when there's no file to print. */
  onPrint: (() => void) | undefined;
  printing: PrintingState;
  /** What the worksheet's viewer says when the lesson has no exercises at all. */
  emptyMessage: string | undefined;
  /** The view's own buttons, at the start of the worksheet's toolbar. */
  toolbarStart: ReactNode;
  /** How the view zooms the worksheet from the keyboard. Only the worksheet gets it, so the answer key keeps its own zoom. */
  worksheetRef: Ref<PdfViewerHandle>;
}

/**
 * Where the lesson views show the open exercise: its worksheet, its Draft and
 * its answer key. On a big screen the three sit side by side, and the answer
 * key folds away when there isn't room for all of them. On a phone the
 * worksheet and the answer key take turns on two tabs.
 *
 * The lesson's own Draft can take the worksheet's place, with the answer key
 * put away while it's there. When there's no worksheet to show, as in a
 * lesson with no courseware yet, the empty viewer offers it.
 *
 * Each view hands over its hooks' results and the few things that differ
 * between the views, such as the stamp and what printing does.
 */
export function LessonViewerArea({
  isMobile, top, link, exercise, exerciseLabel, pdf, answer, draft, ink,
  stamp, onSaveAnnotated, onPrint, printing, emptyMessage, toolbarStart, worksheetRef,
}: LessonViewerAreaProps) {
  // Each exercise's zoom, scroll position, "Hide ink" and covers, so switching
  // between exercises and back finds each one as the tutor left it. The answer
  // key keeps its own, so its zoom and covers stay apart from the worksheet's.
  const [viewStates] = useState(() => new Map<number, PdfViewState>());
  const [answerViewStates] = useState(() => new Map<number, PdfViewState>());
  const { showAnswerKey, answerPdfData, mobileActiveTab, setMobileActiveTab } = answer;
  const isPrinting = printing.id !== null;

  // The lesson's own Draft, while it's on screen in the worksheet's place.
  const lessonDraftShown = draft.lessonDraftOpen ? draft.lessonDraftId : null;
  // With no worksheet to show, the viewer offers the lesson's own Draft, wherever the view has one to open.
  const lessonDraftButton = draft.lessonDraftId !== null ? (
    <button
      type="button"
      onClick={draft.openLessonDraft}
      title={LESSON_DRAFT_DESCRIPTION}
      className="flex items-center gap-1.5 min-h-10 px-4 rounded-lg text-sm bg-[#a0704b] text-white hover:bg-[#8b6040] transition-colors"
    >
      <NotebookPen className="h-4 w-4" />
      Open the lesson draft
    </button>
  ) : undefined;

  const answerViewer = (
    <PdfPageViewer
      pdfData={answerPdfData}
      pageNumbers={answer.answerPageNumbers}
      isLoading={answer.answerLoading}
      error={answer.answerError}
      exerciseLabel={exerciseLabel ? `ANS: ${exerciseLabel}` : "Answer Key"}
      viewStates={answerViewStates}
      viewKey={exercise?.id}
      // The answer key has no Pen Tray, so it covers its pages from a toolbar button.
      coverButton
    />
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      {top}

      {/* A phone only gets the tabs once the answer key's file has loaded. */}
      {isMobile && showAnswerKey && answerPdfData && (
        <div className="flex border-b border-[#d4c4a8] dark:border-[#3a3228] bg-[#f0e6d4] dark:bg-[#252018]">
          <button onClick={() => setMobileActiveTab("exercise")} className={viewerTabClass(mobileActiveTab === "exercise")}>
            Exercise
          </button>
          <button onClick={() => setMobileActiveTab("answer")} className={viewerTabClass(mobileActiveTab === "answer")}>
            Answer Key
          </button>
        </div>
      )}

      <div className={cn(
        "flex flex-1 min-h-0 min-w-0",
        draft.draftOpen && "group/viewers relative overflow-hidden @container/viewers",
      )}>
        {(!isMobile || !showAnswerKey || mobileActiveTab === "exercise") && (
          <div className={cn("relative flex flex-1 min-h-0 min-w-0", draft.draftOpen && "@[1100px]/viewers:flex-[2]")}>
            {/* The lesson's own Draft takes the worksheet's place, with a Pen Tray of its own */}
            {lessonDraftShown !== null ? (
              <DraftPane
                exerciseId={lessonDraftShown}
                title="Lesson draft"
                // Focus mode's way out sits on the worksheet's toolbar, so it moves onto the Draft's bar.
                barStart={toolbarStart}
                annotations={ink.annotations}
                onPageStrokesChange={ink.onPageStrokesChange}
                onPagesStrokesChange={ink.onPagesStrokesChange}
                onClearPages={ink.onClearPages}
                onUndo={ink.onUndo}
                tools={ink.tools}
                onClose={draft.closeLessonDraft}
                ownTray={{ onRedo: ink.onRedo, onClearAll: ink.onClearAll }}
              />
            ) : link ?? (
              <ErrorBoundary
                onReset={pdf.retry}
                fallback={<PdfRenderFailure onRetry={pdf.retry} />}
              >
                <PdfPageViewer
                  ref={worksheetRef}
                  pdfData={pdf.pdfData}
                  pageNumbers={pdf.pageNumbers}
                  stamp={stamp}
                  exerciseId={exercise?.id}
                  isLoading={pdf.pdfLoading}
                  loadingMessage={pdf.pdfLoadingMessage}
                  error={pdf.pdfError}
                  exerciseLabel={exerciseLabel}
                  // Trying again can't find a file the exercise doesn't have.
                  onRetry={pdf.pdfError === NO_FILE_ERROR ? undefined : pdf.retry}
                  annotations={ink.annotations}
                  onPageStrokesChange={ink.onPageStrokesChange}
                  onPagesStrokesChange={ink.onPagesStrokesChange}
                  tools={ink.tools}
                  onUndo={ink.onUndo}
                  onRedo={ink.onRedo}
                  onClearAll={ink.onClearAll}
                  onClearPage={ink.onClearPage}
                  hasAnnotations={ink.openHasInk}
                  onSaveAnnotated={onSaveAnnotated}
                  onAnswerKeyToggle={answer.toggleAnswerKey}
                  showAnswerKey={showAnswerKey}
                  answerKeyAvailable={answer.answerKeyFound}
                  answerKeySearching={answer.answerKeySearching}
                  onDraftToggle={isMobile || !exercise ? undefined : draft.toggleDraft}
                  showDraft={draft.draftOpen}
                  toolbarStart={toolbarStart}
                  onPrint={onPrint}
                  isPrinting={isPrinting}
                  printTitle={getPrintButtonTitle(isPrinting, printing.progress, "Print this exercise (P)")}
                  emptyMessage={emptyMessage}
                  emptyAction={lessonDraftButton}
                  viewStates={viewStates}
                  trayArea={draft.trayArea}
                />
              </ErrorBoundary>
            )}

            {/* The Draft, beside the worksheet, behind a border that drags to share the space */}
            {draft.draftOpen && exercise && (
              <DraftSplit>
                <DraftPane
                  exerciseId={exercise.id}
                  annotations={ink.annotations}
                  onPageStrokesChange={ink.onPageStrokesChange}
                  // The worksheet gets the same one, so the lasso moves ink between the two panes
                  onPagesStrokesChange={ink.onPagesStrokesChange}
                  onClearPages={ink.onClearPages}
                  onUndo={ink.onUndo}
                  tools={ink.tools}
                  onClose={draft.closeDraft}
                />
              </DraftSplit>
            )}

            {/* While the Draft is open, the Pen Tray floats in here, across the worksheet and the Draft */}
            {draft.draftOpen && <DraftTrayLane ref={draft.setTrayArea} />}
          </div>
        )}

        {/* The answer key is read-only. With the Draft open, it folds away when there isn't room for three columns. */}
        {showAnswerKey && lessonDraftShown === null && (!isMobile || mobileActiveTab === "answer") && (
          draft.draftOpen ? <FoldingAnswerKey>{answerViewer}</FoldingAnswerKey> : (
            <>
              {!isMobile && viewerDivider}
              {answerViewer}
            </>
          )
        )}
      </div>
    </div>
  );
}
