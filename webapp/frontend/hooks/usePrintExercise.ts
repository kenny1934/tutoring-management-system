"use client";

import { useCallback, useState } from "react";
import { useToast } from "@/contexts/ToastContext";
import { parseExerciseRemarks } from "@/lib/exercise-utils";
import { printFileFromPathWithFallback, printPdfBlob } from "@/lib/file-system";
import { loadExercisePdf } from "@/lib/lesson-pdf-loader";
import { bulkPrintAllStudents, groupExercisesByStudent, type StudentExerciseGroup } from "@/lib/bulk-exercise-download";
import { bulkPrintErrorMessage, printErrorMessage, type PrintingState } from "@/lib/lesson-utils";
import { searchPaperlessByPath } from "@/lib/paperless-utils";
import { isPreviewExercise } from "@/lib/summer-courseware-session";
import type { PrintStampInfo } from "@/lib/pdf-utils";
import type { Session, SessionExercise } from "@/types";

/** What `printing.id` holds while everything in the lesson prints from the header's menu. */
const PRINT_ALL_ID = -1;

/**
 * Printing in a lesson, for both views. `printing.id` says which print is
 * under way, and each print button compares it against its own id to show a
 * spinner. One exercise prints under its own id, and a print of several uses
 * a negative number. While a file is looked for in Paperless, how that's
 * going shows in `printing.progress`, which the buttons use as their title.
 */
export function usePrintExercise() {
  const { showToast } = useToast();
  const [printing, setPrinting] = useState<PrintingState>({ id: null, progress: null });
  const setProgress = useCallback((message: string) => {
    setPrinting((prev) => (prev.progress === message ? prev : { ...prev, progress: message }));
  }, []);
  const paperlessSearch = useCallback(
    (path: string) => searchPaperlessByPath(path, setProgress),
    [setProgress],
  );

  const printExercise = useCallback(async (exercise: SessionExercise, stamp: PrintStampInfo | undefined) => {
    if (!exercise.pdf_name) return;
    setPrinting({ id: exercise.id, progress: null });
    try {
      // A class-wide preview's path isn't a real file, so the file the lesson
      // loaded for it is printed as it is, with no stamp.
      if (isPreviewExercise(exercise)) {
        const result = await loadExercisePdf(exercise.pdf_name);
        if ("error" in result) {
          showToast(printErrorMessage(result.error), "error");
        } else if (!printPdfBlob(new Blob([result.data], { type: "application/pdf" }))) {
          showToast(printErrorMessage("popup_blocked"), "error");
        }
        return;
      }
      const { complexPages } = parseExerciseRemarks(exercise.remarks);
      const error = await printFileFromPathWithFallback(
        exercise.pdf_name,
        exercise.page_start,
        exercise.page_end,
        complexPages || undefined,
        stamp,
        paperlessSearch,
      );
      if (error) showToast(printErrorMessage(error), "error");
    } finally {
      setPrinting({ id: null, progress: null });
    }
  }, [paperlessSearch, showToast]);

  /**
   * Prints several students' exercises as one job, with `busyId` in
   * `printing.id` until it's done. Pass the exercise type when the print is
   * only classwork or only homework, so a failure can say which.
   */
  const printGroups = useCallback(async (groups: StudentExerciseGroup[], busyId: number, type?: "CW" | "HW") => {
    if (groups.length === 0) return;
    setPrinting({ id: busyId, progress: null });
    try {
      const error = await bulkPrintAllStudents(groups, paperlessSearch);
      if (error) showToast(bulkPrintErrorMessage(error, type), "error");
    } finally {
      setPrinting({ id: null, progress: null });
    }
  }, [paperlessSearch, showToast]);

  /**
   * Prints the classwork or the homework of every lesson given. When there's
   * none of that type it says so, so the button never seems to do nothing.
   */
  const printAll = useCallback(async (sessions: Session[], type: "CW" | "HW", busyId = PRINT_ALL_ID) => {
    const groups = groupExercisesByStudent(sessions, type);
    if (groups.length === 0) {
      showToast(`No ${type} exercises found`, "info");
      return;
    }
    await printGroups(groups, busyId, type);
  }, [printGroups, showToast]);

  return { printing, printExercise, printGroups, printAll };
}
