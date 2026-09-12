"use client";

import { useState, type ReactNode, type Ref } from "react";
import { AlertTriangle } from "lucide-react";
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
import { DraftPane, DraftTrayLane } from "./DraftPane";
import { FoldingAnswerKey } from "./FoldingAnswerKey";

/** The ink handlers the worksheet and the Draft draw through. */
type ViewerInk = Pick<
  ReturnType<typeof useLessonInk>,
  "tools" | "annotations" | "openHasInk" | "onPageStrokesChange" | "onUndo" | "onRedo" | "onClearAll" | "onClearPage" | "onClearPages"
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

const divider = <div className="w-px bg-[#d4c4a8] dark:bg-[#3a3228] flex-shrink-0" />;

const tabClass = (active: boolean) => cn(
  "flex-1 py-2.5 text-xs font-semibold text-center transition-colors",
  active
    ? "text-[#6b4c30] dark:text-[#d4a574] border-b-2 border-[#a0704b]"
    : "text-[#8b7355] dark:text-[#a09080]"
);

/**
 * Where the lesson views show the open exercise: its worksheet, its Draft and
 * its answer key. On a big screen the three sit side by side, and the answer
 * key folds away when there isn't room for all of them. On a phone the
 * worksheet and the answer key take turns on two tabs.
 *
 * Each view hands over its hooks' results and the few things that differ
 * between the views, such as the stamp and what printing does.
 */
export function LessonViewerArea({
  isMobile, top, link, exercise, exerciseLabel, pdf, answer, draft, ink,
  stamp, onSaveAnnotated, onPrint, printing, emptyMessage, toolbarStart, worksheetRef,
}: LessonViewerAreaProps) {
  // Each exercise's zoom, scroll position and "Hide ink", so switching between
  // exercises and back finds each one as the tutor left it.
  const [viewStates] = useState(() => new Map<number, PdfViewState>());
  const { showAnswerKey, answerPdfData, mobileActiveTab, setMobileActiveTab } = answer;
  const isPrinting = printing.id !== null;

  const answerViewer = (
    <PdfPageViewer
      pdfData={answerPdfData}
      pageNumbers={answer.answerPageNumbers}
      isLoading={answer.answerLoading}
      error={answer.answerError}
      exerciseLabel={exerciseLabel ? `ANS: ${exerciseLabel}` : "Answer Key"}
    />
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      {top}

      {/* A phone only gets the tabs once the answer key's file has loaded. */}
      {isMobile && showAnswerKey && answerPdfData && (
        <div className="flex border-b border-[#d4c4a8] dark:border-[#3a3228] bg-[#f0e6d4] dark:bg-[#252018]">
          <button onClick={() => setMobileActiveTab("exercise")} className={tabClass(mobileActiveTab === "exercise")}>
            Exercise
          </button>
          <button onClick={() => setMobileActiveTab("answer")} className={tabClass(mobileActiveTab === "answer")}>
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
            {link ?? (
              <ErrorBoundary
                onReset={pdf.retry}
                fallback={
                  <div className="flex-1 flex items-center justify-center bg-[#e8dcc8] dark:bg-[#1e1a14]">
                    <div className="flex flex-col items-center gap-3 max-w-sm text-center">
                      <AlertTriangle className="h-10 w-10 text-amber-500" />
                      <p className="text-sm text-[#8b7355] dark:text-[#a09080]">
                        Something went wrong rendering the PDF
                      </p>
                      <button
                        onClick={pdf.retry}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-[#a0704b] text-white hover:bg-[#8b6040] transition-colors"
                      >
                        Try again
                      </button>
                    </div>
                  </div>
                }
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
                  viewStates={viewStates}
                  trayArea={draft.trayArea}
                />
              </ErrorBoundary>
            )}

            {/* The Draft, beside the worksheet */}
            {draft.draftOpen && exercise && (
              <>
                {divider}
                <DraftPane
                  exerciseId={exercise.id}
                  annotations={ink.annotations}
                  onPageStrokesChange={ink.onPageStrokesChange}
                  onClearPages={ink.onClearPages}
                  onUndo={ink.onUndo}
                  tools={ink.tools}
                  onClose={draft.closeDraft}
                />
              </>
            )}

            {/* While the Draft is open, the Pen Tray floats in here, across the worksheet and the Draft */}
            {draft.draftOpen && <DraftTrayLane ref={draft.setTrayArea} />}
          </div>
        )}

        {/* The answer key is read-only. With the Draft open, it folds away when there isn't room for three columns. */}
        {showAnswerKey && (!isMobile || mobileActiveTab === "answer") && (
          draft.draftOpen ? <FoldingAnswerKey>{answerViewer}</FoldingAnswerKey> : (
            <>
              {!isMobile && divider}
              {answerViewer}
            </>
          )
        )}
      </div>
    </div>
  );
}
