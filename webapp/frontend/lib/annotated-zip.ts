/**
 * The "Download All & Exit" ZIP that both lesson views build from a lesson's
 * ink. It loads any PDF the view no longer has in memory, which is the normal
 * case after a reload, and it counts every exercise it couldn't save. The
 * views only clear the ink and leave once that count is zero, so a failure
 * never loses a tutor's marks.
 */
import { saveAnnotatedPdf, saveDraftSheetsPdf } from "./pdf-annotation-save";
import type { PrintStampInfo } from "./pdf-utils";
import { hasInk, type PageAnnotations } from "@/hooks/useAnnotations";

/** How to save one exercise's ink: which file it goes on, and what the copy in the ZIP is called. */
export interface AnnotatedExercise {
  /**
   * The exercise's file, which is what the loader is asked for. It's null for
   * a lesson's own Draft, which has no file, so its sheets are saved on their own.
   */
  pdfName: string | null;
  /** The pages the exercise uses, 1-indexed, or empty for every page. */
  pageNumbers: number[];
  stamp: PrintStampInfo | undefined;
  /**
   * The file's name inside the ZIP, without ".pdf". Two exercises can share a
   * name, such as classwork and homework from the same file, so a repeat gets
   * a number added rather than overwriting the first.
   */
  name: string;
}

/** How Download All saves a lesson's own Draft: its sheets on their own, under this name in the ZIP. */
export function lessonDraftForZip(name: string): AnnotatedExercise {
  return { pdfName: null, pageNumbers: [], stamp: undefined, name };
}

export interface AnnotatedZipResult {
  /** The ZIP, or null when not one exercise could be saved. */
  zip: Blob | null;
  saved: number;
  failed: number;
}

/** Give each name a number after its first use, so no file in the ZIP replaces another. */
function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    return count === 1 ? name : `${name} (${count})`;
  });
}

/**
 * Save every exercise that has ink into one ZIP.
 *
 * It works through the ink itself, not through the lesson's list of
 * exercises, because ink can outlive its exercise's place on that list. A
 * preview's ink comes back after a reload although the preview doesn't, and
 * saving "Edit exercises" gives every exercise a new id. `describe` says how
 * to save an exercise's ink, and returns null when it can't find the exercise
 * or the exercise has no file. That ink counts as failed, so the views keep it.
 *
 * The loader returns the PDF's bytes, or null when the file can't be found.
 * An exercise whose PDF can't be loaded or drawn on counts as failed too, and
 * the others are still saved.
 *
 * Every file starts loading at once, so the wait is about as long as the
 * slowest one, and a file two exercises share is only loaded once. The
 * drawing stays one exercise at a time, because each page it draws takes a
 * lot of memory.
 */
export async function buildAnnotatedZip(
  ink: Map<number, PageAnnotations>,
  describe: (exerciseId: number) => AnnotatedExercise | null,
  loadPdf: (pdfName: string) => Promise<ArrayBuffer | null>,
): Promise<AnnotatedZipResult> {
  let saved = 0;
  let failed = 0;

  const exercises: (AnnotatedExercise & { annotations: PageAnnotations })[] = [];
  for (const [exerciseId, annotations] of ink) {
    if (!hasInk(annotations)) continue;
    const exercise = describe(exerciseId);
    if (exercise) exercises.push({ ...exercise, annotations });
    else failed++;
  }

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const names = uniqueNames(exercises.map((ex) => ex.name));

  const loads = new Map<string, Promise<ArrayBuffer | null>>();
  for (const { pdfName } of exercises) {
    if (pdfName === null || loads.has(pdfName)) continue;
    loads.set(pdfName, loadPdf(pdfName).catch((err) => {
      console.error(`Failed to load ${pdfName}:`, err);
      return null;
    }));
  }

  for (const [i, exercise] of exercises.entries()) {
    try {
      let blob: Blob;
      if (exercise.pdfName === null) {
        // A lesson's own Draft has no file, so its sheets are saved on their own.
        blob = await saveDraftSheetsPdf(exercise.annotations);
      } else {
        const pdf = await loads.get(exercise.pdfName);
        if (!pdf) { failed++; continue; }
        blob = await saveAnnotatedPdf(pdf, exercise.pageNumbers, exercise.stamp, exercise.annotations);
      }
      zip.file(`${names[i]}.pdf`, blob);
      saved++;
    } catch (err) {
      console.error(`Failed to save annotated PDF for ${exercise.pdfName}:`, err);
      failed++;
    }
  }

  return { zip: saved > 0 ? await zip.generateAsync({ type: "blob" }) : null, saved, failed };
}

/** The message shown when saving one annotated PDF fails. */
export const SAVE_FAILED_MESSAGE = "The annotated PDF couldn't be saved. Please try again.";

/**
 * The message shown when some exercises couldn't be saved. The views keep the
 * ink and stay in the lesson whenever this is needed.
 */
export function saveAllFailedMessage({ saved, failed }: Pick<AnnotatedZipResult, "saved" | "failed">): string {
  return saved === 0
    ? "None of the annotated exercises could be downloaded, so your ink has been kept and the lesson is still open."
    : `${failed} of ${saved + failed} exercises couldn't be downloaded, so your ink has been kept and the lesson is still open.`;
}
