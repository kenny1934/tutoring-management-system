"use client";

import { useState } from "react";
import { useDailyPuzzle } from "@/lib/hooks/useDailyPuzzle";
import { useAsSheet } from "@/hooks/usePopoverSheet";
import { MobileBottomSheet } from "@/components/ui/mobile-bottom-sheet";
import { cn } from "@/lib/utils";
import { Lightbulb, Check, X, Loader2, ChevronRight, ChevronUp } from "lucide-react";

// An answer longer than this won't share a phone's line with three others.
const LONG_ANSWER = 12;

interface DailyPuzzleProps {
  className?: string;
}

export function DailyPuzzle({ className }: DailyPuzzleProps) {
  const {
    question,
    isLoading,
    error,
    userAnswer,
    isCorrect,
    submitAnswer,
  } = useDailyPuzzle();
  const onPhone = useAsSheet();
  const [sheetOpen, setSheetOpen] = useState(false);
  // On a phone the puzzle starts folded to one line, see below.
  const [unfolded, setUnfolded] = useState(false);

  // Loading state
  if (isLoading) {
    return (
      <div className={cn("py-1.5 px-4", className)}>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Loading puzzle...</span>
        </div>
      </div>
    );
  }

  // Error state - hide quietly
  if (error || !question) {
    return null;
  }

  // Four short answers sit on one line as pills. About a fifth of the puzzles
  // have answers a sentence long, though, and on a phone those wrapped into a
  // stack of rows that pushed today's lessons down. There the card shows a
  // button instead, and the answers open in a sheet, one full-width row each.
  const sheetAnswers = onPhone && question.allAnswers.some((answer) => answer.length > LONG_ANSWER);

  // On a phone the puzzle is folded to a single line until it's tapped. It's
  // a pleasure rather than a task, and open it took more of the first screen
  // than today's lessons got.
  if (onPhone && !unfolded) {
    return (
      <button
        type="button"
        onClick={() => setUnfolded(true)}
        className={cn("flex w-full items-center gap-2 py-2 px-4 text-left active:bg-tint", className)}
        aria-label={`Today's puzzle: ${question.question}`}
      >
        <Lightbulb className="h-3.5 w-3.5 shrink-0 text-amber-700" />
        <span className="min-w-0 flex-1 truncate text-xs text-gray-800 dark:text-gray-200">
          <span className="font-semibold text-gray-600 dark:text-gray-400">Today&apos;s puzzle: </span>
          {question.question}
        </span>
        {userAnswer !== null ? (
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
              isCorrect
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
            )}
          >
            {isCorrect ? "Correct" : "Not today"}
          </span>
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-ink-subtle" />
        )}
      </button>
    );
  }

  // The colours an answer takes before and after the day's guess.
  const answerTone = (answer: string) => {
    const showAsCorrect = userAnswer !== null && answer === question.correctAnswer;
    const showAsIncorrect = userAnswer === answer && !isCorrect;
    return cn(
      "transition-all",
      // Base state (unanswered)
      userAnswer === null && "bg-field-fill border-line-strong text-accent-ink hover:bg-tint cursor-pointer",
      // Correct answer (after answering)
      showAsCorrect && "bg-green-100 dark:bg-green-900/40 border-green-500 dark:border-green-600 text-green-700 dark:text-green-300 ring-2 ring-green-500/30",
      // Wrong selection
      showAsIncorrect && "bg-red-100 dark:bg-red-900/40 border-red-500 dark:border-red-600 text-red-700 dark:text-red-300 ring-2 ring-red-500/30",
      // Disabled non-selected options
      userAnswer !== null && !showAsCorrect && !showAsIncorrect &&
        "opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400",
    );
  };

  return (
    <div className={cn("py-1.5 px-4 sm:px-6", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Lightbulb className="h-3.5 w-3.5 text-amber-700" />
        <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
          Daily Puzzle
        </span>
        {userAnswer !== null && (
          <span
            className={cn(
              "ml-auto text-xs font-medium px-2 py-0.5 rounded-full",
              isCorrect
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            )}
          >
            {isCorrect ? (
              <span className="flex items-center gap-1">
                <Check className="h-3 w-3" /> Correct!
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <X className="h-3 w-3" /> Try again tomorrow
              </span>
            )}
          </span>
        )}
        {/* On a phone, folds the puzzle back to its one line. */}
        {onPhone && (
          <button
            type="button"
            onClick={() => setUnfolded(false)}
            aria-label="Fold the puzzle away"
            className={cn(
              "-my-1 -mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-subtle active:bg-tint",
              userAnswer === null && "ml-auto",
            )}
          >
            <ChevronUp className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Question */}
      <p className="text-xs text-gray-800 dark:text-gray-200 mb-2 leading-relaxed">
        {question.question}
      </p>

      {sheetAnswers ? (
        <>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="px-3 py-1 text-xs font-medium rounded-full border border-line-strong bg-field-fill text-accent-ink active:bg-tint"
          >
            {userAnswer === null ? "Choose an answer" : "See the answers"}
          </button>
          <MobileBottomSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} title="Daily puzzle">
            <div className="flex flex-col gap-2 px-4 pt-3 pb-4">
              <p className="text-sm text-foreground leading-relaxed mb-1">{question.question}</p>
              {question.allAnswers.map((answer) => (
                <button
                  key={answer}
                  onClick={() => submitAnswer(answer)}
                  disabled={userAnswer !== null}
                  className={cn("w-full px-4 py-3 text-sm text-left font-medium rounded-xl border", answerTone(answer))}
                >
                  {answer}
                </button>
              ))}
            </div>
          </MobileBottomSheet>
        </>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {question.allAnswers.map((answer) => (
            <button
              key={answer}
              onClick={() => submitAnswer(answer)}
              disabled={userAnswer !== null}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-full border",
                answerTone(answer),
                userAnswer === null && "hover:scale-[1.02] active:scale-[0.98]",
              )}
              style={{
                transition: "all 200ms cubic-bezier(0.38, 1.21, 0.22, 1.00)",
              }}
            >
              {answer}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
