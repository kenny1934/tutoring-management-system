/**
 * The "Download All & Exit" ZIP that both lesson views build from a lesson's
 * ink. It loads any PDF the view no longer has in memory, which is the normal
 * case after a reload, and it counts every exercise it couldn't save. The
 * views only clear the ink and leave once that count is zero, so a failure
 * never loses a tutor's marks.
 */
import { saveAnnotatedPdf } from "./pdf-annotation-save";
import type { PrintStampInfo } from "./pdf-utils";
import type { PageAnnotations } from "@/hooks/useAnnotations";

/** One annotated exercise to put in the ZIP. */
export interface AnnotatedExercise {
  /** The exercise's file, which is what the loader is asked for. */
  pdfName: string;
  /** The pages the exercise uses, 1-indexed, or empty for every page. */
  pageNumbers: number[];
  stamp: PrintStampInfo | undefined;
  annotations: PageAnnotations;
  /**
   * The file's name inside the ZIP, without ".pdf". Two exercises can share a
   * name, such as classwork and homework from the same file, so a repeat gets
   * a number added rather than overwriting the first.
   */
  name: string;
}

export interface AnnotatedZipResult {
  /** The ZIP, or null when not one exercise could be saved. */
  zip: Blob | null;
  saved: number;
  failed: number;
}

/** Whether an exercise's annotations hold at least one stroke. */
export function hasInk(annotations: PageAnnotations | undefined): annotations is PageAnnotations {
  return !!annotations && Object.values(annotations).some((strokes) => strokes.length > 0);
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
 * Save every exercise into one ZIP. The loader returns the PDF's bytes, or
 * null when the file can't be found. An exercise whose PDF can't be loaded or
 * drawn on counts as failed, and the others are still saved.
 */
export async function buildAnnotatedZip(
  exercises: AnnotatedExercise[],
  loadPdf: (pdfName: string) => Promise<ArrayBuffer | null>,
): Promise<AnnotatedZipResult> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const names = uniqueNames(exercises.map((ex) => ex.name));
  let saved = 0;
  let failed = 0;

  for (const [i, exercise] of exercises.entries()) {
    try {
      const pdf = await loadPdf(exercise.pdfName);
      if (!pdf) { failed++; continue; }
      const blob = await saveAnnotatedPdf(pdf, exercise.pageNumbers, exercise.stamp, exercise.annotations);
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
