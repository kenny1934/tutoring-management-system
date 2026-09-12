"use client";

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import type { PageAnnotations, Stroke } from "@/hooks/useAnnotations";
import type { AnnotationTools } from "@/hooks/useAnnotationTools";
import { DraftPane, DraftTrayLane } from "./DraftPane";
import { FoldingAnswerKey } from "./FoldingAnswerKey";

export type MobileTab = "exercise" | "answer";

interface LessonViewerAreaProps {
  isMobile: boolean;
  /** Shown above the viewers. The multi-student view puts its student strip here. */
  top?: ReactNode;
  /** The open exercise when it's a link, shown in the worksheet's place. */
  link?: ReactNode;
  /** The worksheet's viewer. If it crashes, a message with Try again takes its place. */
  worksheet: ReactNode;
  onRetry: () => void;
  answerKey: {
    shown: boolean;
    /** The answer key's file has loaded. Only then does a phone get the tabs to switch to it. */
    loaded: boolean;
    viewer: ReactNode;
    mobileTab: MobileTab;
    onMobileTabChange: (tab: MobileTab) => void;
  };
  draft: {
    open: boolean;
    /** The open exercise, whose Draft sheets these are. */
    exerciseId: number | undefined;
    annotations: PageAnnotations;
    onPageStrokesChange: (pageIndex: number, strokes: Stroke[]) => void;
    onClearPages: (pageIndices: number[]) => void;
    onUndo: () => void;
    tools: AnnotationTools;
    onClose: () => void;
    /** Receives the lane the Pen Tray floats in while the Draft is open. */
    onTrayArea: (area: HTMLElement | null) => void;
  };
}

const divider = <div className="w-px bg-[#d4c4a8] dark:bg-[#3a3228] flex-shrink-0" />;

const tabClass = (active: boolean) => cn(
  "flex-1 py-2.5 text-xs font-semibold text-center transition-colors",
  active
    ? "text-[#6b4c30] dark:text-[#d4a574] border-b-2 border-[#a0704b]"
    : "text-[#8b7355] dark:text-[#a09080]"
);

/**
 * Where the lesson views show the open exercise. On a big screen the
 * worksheet, the Draft and the answer key sit side by side, and the answer
 * key folds away when there isn't room for all three. On a phone the
 * worksheet and the answer key take turns on two tabs.
 */
export function LessonViewerArea({ isMobile, top, link, worksheet, onRetry, answerKey, draft }: LessonViewerAreaProps) {
  const { shown, loaded, viewer, mobileTab, onMobileTabChange } = answerKey;

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      {top}

      {isMobile && shown && loaded && (
        <div className="flex border-b border-[#d4c4a8] dark:border-[#3a3228] bg-[#f0e6d4] dark:bg-[#252018]">
          <button onClick={() => onMobileTabChange("exercise")} className={tabClass(mobileTab === "exercise")}>
            Exercise
          </button>
          <button onClick={() => onMobileTabChange("answer")} className={tabClass(mobileTab === "answer")}>
            Answer Key
          </button>
        </div>
      )}

      <div className={cn(
        "flex flex-1 min-h-0 min-w-0",
        draft.open && "group/viewers relative overflow-hidden @container/viewers",
      )}>
        {(!isMobile || !shown || mobileTab === "exercise") && (
          <div className={cn("relative flex flex-1 min-h-0 min-w-0", draft.open && "@[1100px]/viewers:flex-[2]")}>
            {link ?? (
              <ErrorBoundary
                onReset={onRetry}
                fallback={
                  <div className="flex-1 flex items-center justify-center bg-[#e8dcc8] dark:bg-[#1e1a14]">
                    <div className="flex flex-col items-center gap-3 max-w-sm text-center">
                      <AlertTriangle className="h-10 w-10 text-amber-500" />
                      <p className="text-sm text-[#8b7355] dark:text-[#a09080]">
                        Something went wrong rendering the PDF
                      </p>
                      <button
                        onClick={onRetry}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-[#a0704b] text-white hover:bg-[#8b6040] transition-colors"
                      >
                        Try again
                      </button>
                    </div>
                  </div>
                }
              >
                {worksheet}
              </ErrorBoundary>
            )}

            {/* The Draft, beside the worksheet */}
            {draft.open && draft.exerciseId !== undefined && (
              <>
                {divider}
                <DraftPane
                  exerciseId={draft.exerciseId}
                  annotations={draft.annotations}
                  onPageStrokesChange={draft.onPageStrokesChange}
                  onClearPages={draft.onClearPages}
                  onUndo={draft.onUndo}
                  tools={draft.tools}
                  onClose={draft.onClose}
                />
              </>
            )}

            {/* While the Draft is open, the Pen Tray floats in here, across the worksheet and the Draft */}
            {draft.open && <DraftTrayLane ref={draft.onTrayArea} />}
          </div>
        )}

        {/* The answer key is read-only. With the Draft open, it folds away when there isn't room for three columns. */}
        {shown && (!isMobile || mobileTab === "answer") && (
          draft.open ? <FoldingAnswerKey>{viewer}</FoldingAnswerKey> : (
            <>
              {!isMobile && divider}
              {viewer}
            </>
          )
        )}
      </div>
    </div>
  );
}
