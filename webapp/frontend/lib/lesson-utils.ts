import { useState, useCallback } from "react";
import { parseExerciseRemarks } from "@/lib/exercise-utils";
import { getPageNumbers } from "@/lib/bulk-pdf-helpers";
import { searchPaperlessByPath } from "@/lib/paperless-utils";
import type { Session, SessionExercise } from "@/types";

/** Compute page numbers for an exercise (supports both simple and custom ranges). */
export function getExercisePageNumbers(exercise: SessionExercise): number[] {
  const { complexPages } = parseExerciseRemarks(exercise.remarks);
  return getPageNumbers({
    pdf_name: exercise.pdf_name || "",
    page_start: exercise.page_start,
    page_end: exercise.page_end,
    complex_pages: complexPages || undefined,
  }, "[Lesson]");
}

/** Compute answer page numbers from exercise metadata (supports both simple and custom ranges). */
export function getAnswerPageNumbers(exercise: SessionExercise): number[] {
  const { complexPages } = parseExerciseRemarks(exercise.answer_remarks);
  return getPageNumbers({
    pdf_name: exercise.answer_pdf_name || "",
    page_start: exercise.answer_page_start,
    page_end: exercise.answer_page_end,
    complex_pages: complexPages || undefined,
  }, "[Lesson ANS]");
}

/** Generate a compact page label for sidebar display (e.g. "p1-3", "p5,7,9"). */
export function getPageLabel(exercise: SessionExercise): string | null {
  const { complexPages } = parseExerciseRemarks(exercise.remarks);
  if (complexPages) return `p${complexPages}`;
  if (exercise.page_start && exercise.page_end && exercise.page_start !== exercise.page_end) {
    return `p${exercise.page_start}-${exercise.page_end}`;
  }
  if (exercise.page_start) return `p${exercise.page_start}`;
  return null;
}

/** Format student ID with optional location prefix for "All Locations" view. */
export function getStudentIdDisplay(session: Session, selectedLocation: string): string | null {
  if (!session.school_student_id) return null;
  return selectedLocation === "All Locations" && session.location
    ? `${session.location}-${session.school_student_id}`
    : session.school_student_id;
}

// --- Print state helpers ---

/** Bundled state for print operations: which exercise is printing + progress message. */
export interface PrintingState {
  /** ID of exercise currently being printed (negative for bulk: -1 = bulk all, -2 = file group, -sessionId = per-student). */
  id: number | null;
  /** Progress message from Paperless search (e.g. "Searching by filename…"). */
  progress: string | null;
}

/** Return the appropriate tooltip title for a print button. */
export function getPrintButtonTitle(isPrinting: boolean, progress: string | null | undefined, defaultTitle: string): string {
  if (!isPrinting) return defaultTitle;
  return progress || "Printing...";
}

/**
 * What to tell the tutor when printing one exercise fails, from the error
 * code the print helpers return. A blocked popup is the one case the tutor
 * can fix, so it gets its own advice. Everything else means the file itself
 * couldn't be reached.
 */
export function printErrorMessage(error: string): string {
  return error === "popup_blocked"
    ? "Print failed. Check popup blocker settings."
    : "Couldn't load the file for printing";
}

/**
 * What to tell the tutor when a bulk print in a lesson view fails, from the
 * error code bulkPrintAllStudents returns. Pass the exercise type when the
 * print was for classwork or homework only, so the message can say which.
 */
export function bulkPrintErrorMessage(
  error: "not_supported" | "no_valid_files" | "print_failed",
  type?: "CW" | "HW",
): string {
  if (error === "not_supported") return "Printing from the drive needs Chrome or Edge.";
  if (error === "no_valid_files") return type ? `No valid ${type} PDF files found` : "No valid PDF files found";
  return "Print failed. Check popup blocker settings.";
}

/**
 * The viewer's message for an exercise with no file. Retrying can't help
 * with it, so the lesson views leave out the "Try again" button when they see it.
 */
export const NO_FILE_ERROR = "No file assigned to this exercise";

/** The viewer's message when the lesson has no exercises to show at all. */
export const NO_EXERCISES_MESSAGE = "No exercises have been assigned to this lesson yet.";

/**
 * The undo and redo keys, shared by both lesson views so they can't drift
 * apart again. Z undoes and Shift+Z redoes. With Shift held the browser
 * reports the key as a capital "Z", which is the case the multi-student view
 * once missed.
 */
export function inkHistoryKey(e: Pick<KeyboardEvent, "key" | "shiftKey">): "undo" | "redo" | null {
  if (e.key === "Z" || (e.key === "z" && e.shiftKey)) return "redo";
  if (e.key === "z") return "undo";
  return null;
}

/**
 * Whether Ctrl, Cmd or Alt is held. Keys pressed with those belong to the
 * browser, so both lesson views ignore them. Ctrl+C used to open the
 * classwork editor as well as copying. The views check the undo and redo keys
 * before this, so Ctrl+Z still undoes ink.
 */
export function hasBrowserModifier(e: Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "altKey">): boolean {
  return e.ctrlKey || e.metaKey || e.altKey;
}

/**
 * One step either way through a list that goes round, as the lesson views'
 * student arrows do. From outside the list, at index -1, forwards goes to
 * the first and backwards to the last. It's null when there's nowhere else
 * to go.
 */
export function loopStep(index: number, count: number, direction: 1 | -1): number | null {
  if (index < 0) return count === 0 ? null : direction === 1 ? 0 : count - 1;
  if (count < 2) return null;
  return (index + direction + count) % count;
}

/** Compare two items by student ID (primary) then student name (secondary). */
export function compareByStudentId(
  idA: string | null | undefined, nameA: string | null | undefined,
  idB: string | null | undefined, nameB: string | null | undefined,
): number {
  const a = idA || "", b = idB || "";
  if (a !== b) return a.localeCompare(b);
  return (nameA || "").localeCompare(nameB || "");
}

/** Hook that bundles printing state with a progress-aware Paperless search callback. */
export function usePrintingState() {
  const [printing, setPrinting] = useState<PrintingState>({ id: null, progress: null });
  const setPrintProgress = useCallback((msg: string) => {
    setPrinting(prev => prev.progress === msg ? prev : { ...prev, progress: msg });
  }, []);
  const paperlessSearchWithProgress = useCallback(
    (p: string) => searchPaperlessByPath(p, setPrintProgress),
    [setPrintProgress]
  );
  return { printing, setPrinting, paperlessSearchWithProgress } as const;
}
