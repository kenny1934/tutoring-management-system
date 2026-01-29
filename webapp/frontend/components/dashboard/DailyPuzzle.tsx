"use client";

import { useDailyPuzzle } from "@/lib/useDailyPuzzle";
import { cn } from "@/lib/utils";
import { Lightbulb, Check, X, Loader2 } from "lucide-react";

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

  return (
    <div className={cn("py-1.5 px-4 sm:px-6", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
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
      </div>

      {/* Question */}
      <p className="text-xs text-gray-800 dark:text-gray-200 mb-2 leading-relaxed">
        {question.question}
      </p>

      {/* Answer Buttons */}
      <div className="flex flex-wrap gap-1.5">
        {question.allAnswers.map((answer) => {
          const isSelected = userAnswer === answer;
          const isCorrectAnswer = answer === question.correctAnswer;
          const showAsCorrect = userAnswer !== null && isCorrectAnswer;
          const showAsIncorrect = isSelected && !isCorrect;

          return (
            <button
              key={answer}
              onClick={() => submitAnswer(answer)}
              disabled={userAnswer !== null}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-full border transition-all",
                // Base state (unanswered)
                userAnswer === null && [
                  "bg-white dark:bg-[#1a1a1a]",
                  "border-[#d4a574] dark:border-[#8b6f47]",
                  "text-[#a0704b] dark:text-[#cd853f]",
                  "hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]",
                  "hover:scale-[1.02] active:scale-[0.98]",
                  "cursor-pointer",
                ],
                // Correct answer (after answering)
                showAsCorrect && [
                  "bg-green-100 dark:bg-green-900/40",
                  "border-green-500 dark:border-green-600",
                  "text-green-700 dark:text-green-300",
                  "ring-2 ring-green-500/30",
                ],
                // Wrong selection
                showAsIncorrect && [
                  "bg-red-100 dark:bg-red-900/40",
                  "border-red-500 dark:border-red-600",
                  "text-red-700 dark:text-red-300",
                  "ring-2 ring-red-500/30",
                ],
                // Disabled non-selected options
                userAnswer !== null &&
                  !showAsCorrect &&
                  !showAsIncorrect && [
                    "opacity-50 cursor-not-allowed",
                    "bg-gray-50 dark:bg-gray-800",
                    "border-gray-300 dark:border-gray-600",
                    "text-gray-500 dark:text-gray-400",
                  ]
              )}
              style={{
                transition: "all 200ms cubic-bezier(0.38, 1.21, 0.22, 1.00)",
              }}
            >
              {answer}
            </button>
          );
        })}
      </div>
    </div>
  );
}
