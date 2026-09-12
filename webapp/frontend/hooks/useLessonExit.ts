"use client";

import { useCallback, useState } from "react";
import { useToast } from "@/contexts/ToastContext";
import { cachedPdf } from "@/lib/lesson-pdf-loader";
import { buildAnnotatedZip, saveAllFailedMessage, type AnnotatedExercise } from "@/lib/annotated-zip";
import { downloadBlob } from "@/lib/geometry-utils";
import type { PageAnnotations } from "@/hooks/useAnnotations";

interface LessonExitOptions {
  /** Sends whatever ink is still waiting, and says whether all of it arrived. */
  flushInk: () => Promise<boolean>;
  /** Forgets the ink this tab kept, once all of it has reached the server. */
  clearStorage: () => void;
  getAllAnnotations: () => Map<number, PageAnnotations>;
  /** How Download All saves an exercise that has left the view's lists, as a preview has after a reload. */
  getInkSource: (exerciseId: number) => AnnotatedExercise | undefined;
  /**
   * How Download All saves an exercise the view lists. It's undefined for an
   * exercise the view doesn't list, and null for one with no file to save.
   */
  describeListed: (exerciseId: number) => AnnotatedExercise | null | undefined;
  cache: Map<string, ArrayBuffer>;
  /** The Download All file's name, before ".zip". Each run of spaces becomes a hyphen. */
  zipName: string;
  /** Leaves the lesson, however the view does that. */
  leave: () => void;
}

/**
 * Leaving a lesson, for both views. Leaving sends any ink still waiting
 * first, and only asks the tutor when some pages can't reach the server. The
 * dialog then offers to download all the ink, to leave anyway, or to stay
 * while the pages keep trying. Pages that never arrived stay in this tab, so
 * they're sent the next time the lesson opens here.
 *
 * The header offers Download All at any time too, through downloadAllInk.
 * It saves every exercise with ink into one ZIP, loading any file that isn't
 * in memory, which after a reload is most of them.
 */
export function useLessonExit({
  flushInk, clearStorage, getAllAnnotations, getInkSource, describeListed, cache, zipName, leave,
}: LessonExitOptions) {
  const { showToast } = useToast();
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);

  const attemptExit = useCallback(async () => {
    if (await flushInk()) {
      clearStorage();
      leave();
    } else {
      setShowExitConfirm(true);
    }
  }, [flushInk, clearStorage, leave]);

  /** Resolves to true when every exercise with ink was saved. */
  const downloadAllInk = useCallback(async (): Promise<boolean> => {
    setIsSavingAll(true);
    try {
      const describe = (exerciseId: number) => {
        const listed = describeListed(exerciseId);
        return listed !== undefined ? listed : getInkSource(exerciseId) ?? null;
      };
      const { zip, saved, failed } = await buildAnnotatedZip(
        getAllAnnotations(),
        describe,
        (pdfName) => cachedPdf(cache, pdfName),
      );
      if (zip) downloadBlob(zip, `${zipName.replace(/\s+/g, "-")}.zip`);
      if (failed > 0) {
        showToast(saveAllFailedMessage({ saved, failed }), "error");
        return false;
      }
      return true;
    } catch (err) {
      console.error("Failed to save annotated PDFs:", err);
      showToast(saveAllFailedMessage({ saved: 0, failed: 1 }), "error");
      return false;
    } finally {
      setIsSavingAll(false);
    }
  }, [describeListed, getInkSource, getAllAnnotations, cache, zipName, showToast]);

  const saveAllAndExit = useCallback(async () => {
    const saved = await downloadAllInk();
    setShowExitConfirm(false);
    if (saved) leave();
  }, [downloadAllInk, leave]);

  // The dialog closes first, so it can't be left on screen if leaving doesn't take the view with it.
  const exitAnyway = useCallback(() => {
    setShowExitConfirm(false);
    leave();
  }, [leave]);

  const stay = useCallback(() => setShowExitConfirm(false), []);

  return { attemptExit, downloadAllInk, isSavingAll, showExitConfirm, saveAllAndExit, exitAnyway, stay };
}
