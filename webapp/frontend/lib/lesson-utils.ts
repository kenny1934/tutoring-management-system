import { parseExerciseRemarks } from "@/lib/exercise-utils";
import { getPageNumbers } from "@/lib/bulk-pdf-helpers";
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
