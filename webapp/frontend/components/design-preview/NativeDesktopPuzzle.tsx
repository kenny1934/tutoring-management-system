"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { autoUpdate, flip, FloatingFocusManager, FloatingPortal, offset, shift, useClick, useDismiss, useFloating, useInteractions, useRole } from "@floating-ui/react";
import { ChevronRight, Lightbulb, X } from "lucide-react";
import styles from "./NativePreview.module.css";

type Props = {
  question: string;
  answers: string[];
  correctAnswer: string;
  userAnswer: string | null;
  onAnswer: (answer: string) => void;
  children: ReactNode;
};

/** Measures the real inline puzzle so content and available width decide when it folds. */
export function NativeDesktopPuzzle({ question, answers, correctAnswer, userAnswer, onAnswer, children }: Props) {
  const [compact, setCompact] = useState(true);
  const [open, setOpen] = useState(false);
  const measure = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { refs, floatingStyles, context } = useFloating({
    open: compact && open, onOpenChange: setOpen, placement: "bottom-end",
    middleware: [offset(10), flip({ padding: 16 }), shift({ padding: 16 })],
    whileElementsMounted: autoUpdate,
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useClick(context), useDismiss(context), useRole(context, { role: "dialog" }),
  ]);

  useLayoutEffect(() => {
    const node = measure.current;
    if (!node) return;
    const update = () => setCompact(node.getBoundingClientRect().height > 80);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (!compact) setOpen(false); }, [compact]);

  const result = userAnswer === null ? null : userAnswer === correctAnswer ? "Correct!" : "Try again tomorrow";
  return (
    <div data-native-puzzle data-native-desktop-puzzle>
      <div ref={measure} className={styles.puzzleMeasure} data-native-puzzle-measure data-compact={compact} aria-hidden={compact || undefined} inert={compact || undefined}>
        {children}
      </div>
      {compact && <button ref={refs.setReference} {...getReferenceProps()} type="button" className={styles.puzzleTrigger} data-native-puzzle-trigger aria-label={`Daily puzzle: ${question}`}>
        <span className={styles.puzzleLabel}><Lightbulb size={14} />Daily puzzle{result && <span className={styles.puzzleResult}>{userAnswer === correctAnswer ? "Correct" : "Not today"}</span>}</span>
        <span className={styles.puzzleExcerpt}>{question}</span>
        <ChevronRight className={styles.puzzleChevron} size={16} />
      </button>}
      {compact && open && <FloatingPortal>
        <FloatingFocusManager context={context} modal={false} closeOnFocusOut={false}>
          <div ref={refs.setFloating} {...getFloatingProps()} style={floatingStyles} className={styles.puzzlePopover} data-native-puzzle-popover aria-labelledby={titleId}>
            <div className={styles.puzzlePopoverHeader}><h2 id={titleId}><Lightbulb size={16} />Daily puzzle</h2><button type="button" aria-label="Close daily puzzle" onClick={() => setOpen(false)}><X size={18} /></button></div>
            <p className={styles.puzzleQuestion}>{question}</p>
            <div className={styles.puzzleAnswers}>{answers.map(answer => <button key={answer} type="button" disabled={userAnswer !== null} onClick={() => onAnswer(answer)} data-answer-state={userAnswer === null ? undefined : answer === correctAnswer ? "correct" : answer === userAnswer ? "incorrect" : "other"}>{answer}</button>)}</div>
            {result && <p role="status" className={styles.puzzleResult}>{result}</p>}
          </div>
        </FloatingFocusManager>
      </FloatingPortal>}
    </div>
  );
}
