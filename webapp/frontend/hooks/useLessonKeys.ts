"use client";

import { useStableKeyboardHandler } from "@/hooks/useStableKeyboardHandler";
import { hasBrowserModifier, inkHistoryKey, isTypingTarget } from "@/lib/lesson-utils";
import type { ShortcutRow } from "@/components/lesson/ShortcutHelpPanel";

/** Something a key can do in a lesson view. */
export type LessonKeyAction =
  | "undo" | "redo"
  | "closeWolfram" | "closePrintMenu" | "closeHelp" | "selectHand" | "exitFocus" | "exit"
  | "toggleHelp" | "toggleFocus" | "toggleWolfram"
  | "next" | "previous" | "nextStudent" | "previousStudent"
  | "pen" | "eraser" | "lasso" | "zoomIn" | "zoomOut"
  | "editClasswork" | "editHomework" | "homeworkBlock"
  | "print" | "answerKey" | "save";

/** The parts of a lesson view's state that change what a key means. */
export interface LessonKeyState {
  /** An exercise editor, the exit dialog or another dialog is open, so the lesson's keys wait until it closes. */
  blocked: boolean;
  wolframOpen: boolean;
  printMenuOpen: boolean;
  helpOpen: boolean;
  /** A tool other than the Hand is picked, such as a pen, the eraser or the lasso. */
  drawing: boolean;
  focusMode: boolean;
}

export type LessonKeyEvent = Pick<KeyboardEvent, "key" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey" | "target">;

/**
 * The key table both lesson views share. It says which action a key means,
 * given what's open, but not whether the view can do that action right now.
 * useLessonKeys checks that, by whether the view passed a handler for it.
 *
 * Escape closes the nearest thing first: Wolfram, then the print menu, then
 * the help, then whichever tool is picked, then focus mode. Only once all of those
 * are closed does it mean leaving the lesson.
 */
export function lessonKeyAction(e: LessonKeyEvent, state: LessonKeyState): LessonKeyAction | null {
  if (state.blocked || isTypingTarget(e.target)) return null;
  // Wolfram takes the keyboard while it's open, apart from Escape to close it.
  if (state.wolframOpen && e.key !== "Escape") return null;
  // Undo and redo come before the modifier check, so Ctrl+Z still undoes ink.
  const history = inkHistoryKey(e);
  if (history) return history;
  if (hasBrowserModifier(e)) return null;

  switch (e.key) {
    case "Escape":
      if (state.wolframOpen) return "closeWolfram";
      if (state.printMenuOpen) return "closePrintMenu";
      if (state.helpOpen) return "closeHelp";
      if (state.drawing) return "selectHand";
      if (state.focusMode) return "exitFocus";
      return "exit";
    case "j":
    case "ArrowDown":
      return "next";
    case "k":
    case "ArrowUp":
      return "previous";
    case "Tab":
      return e.shiftKey ? "previousStudent" : "nextStudent";
    case "d": return "pen";
    case "e": return "eraser";
    case "l": return "lasso";
    case "+":
    case "=":
      return "zoomIn";
    case "-": return "zoomOut";
    case "c": return "editClasswork";
    case "h": return "editHomework";
    case "H": return "homeworkBlock";
    case "p": return "print";
    case "a": return "answerKey";
    case "s": return "save";
    case "f": return "toggleFocus";
    case "w": return "toggleWolfram";
    case "?": return "toggleHelp";
    default: return null;
  }
}

/**
 * The help panel's rows for each view, in one place beside the key table, so
 * a new key only has to be added here. Tab is only in the multi-student view,
 * because only it has several students, and H is only in the one-student
 * view, because only it has the homework block. The multi-student view is its
 * own tab and Escape never closes it, so there Escape only goes back.
 */
export function lessonShortcuts(view: "one-student" | "multi-student"): readonly ShortcutRow[] {
  const oneStudent = view === "one-student";
  const rows: (ShortcutRow | false)[] = [
    ["j / k", "Navigate exercises"],
    !oneStudent && ["Tab", "Switch student"],
    ["+  / -", "Zoom in / out"],
    ["d", "Pen, or back to the Hand"],
    ["e", "Eraser, or back to the Hand"],
    ["l", "Lasso, or back to the Hand"],
    ["z / Z", "Undo / Redo"],
    ["s", "Save annotated PDF"],
    ["c / h", "Edit CW / HW"],
    oneStudent && ["H", "Check homework"],
    ["p", "Print"],
    ["a", "Answer key"],
    ["w", "Wolfram Alpha"],
    ["f", "Focus mode"],
    ["?", "This help"],
    ["Esc", oneStudent ? "Exit / Back" : "Back"],
  ];
  return rows.filter((row): row is ShortcutRow => row !== false);
}

/** What each action does in this view. Leave an action out while the view can't do it. */
export type LessonKeyHandlers = Partial<Record<LessonKeyAction, () => void>>;

/**
 * Both lesson views' keyboard shortcuts. The view passes what's open and what
 * each action does, fresh on every render, and the newest ones are read on
 * every key. A key with no handler right now is left to the browser, so a key
 * is only claimed with preventDefault when it does something.
 */
export function useLessonKeys(state: LessonKeyState, handlers: LessonKeyHandlers) {
  useStableKeyboardHandler((e) => {
    const action = lessonKeyAction(e, state);
    const run = action ? handlers[action] : undefined;
    if (!run) return;
    e.preventDefault();
    run();
  });
}
