"use client";

import { useStableKeyboardHandler } from "@/hooks/useStableKeyboardHandler";
import { hasBrowserModifier, inkHistoryKey, isTypingTarget } from "@/lib/lesson-utils";

/** Something a key can do in a lesson view. */
export type LessonKeyAction =
  | "undo" | "redo"
  | "closeWolfram" | "closePrintMenu" | "closeHelp" | "selectHand" | "exitFocus" | "exit"
  | "toggleHelp" | "toggleFocus" | "toggleWolfram"
  | "next" | "previous" | "nextStudent" | "previousStudent"
  | "pen" | "eraser"
  | "editClasswork" | "editHomework" | "homeworkBlock"
  | "print" | "answerKey" | "save";

/** The parts of a lesson view's state that change what a key means. */
export interface LessonKeyState {
  /** An exercise editor, the exit dialog or another dialog is open, so the lesson's keys wait until it closes. */
  blocked: boolean;
  wolframOpen: boolean;
  printMenuOpen: boolean;
  helpOpen: boolean;
  /** The pen or the eraser is picked. */
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
 * the help, then the pen or eraser, then focus mode. Only once all of those
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
