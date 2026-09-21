"use client";

import { useCallback, useEffect, useState } from "react";
import { loadExercisePdf, rememberPdf, PDF_CACHE_SIZE } from "@/lib/lesson-pdf-loader";
import { searchAnswerFile, type AnswerSearchResult } from "@/lib/answer-file-utils";
import { getPageCount } from "@/lib/pdf-utils";
import { answerPageNumbers } from "@/lib/homework-check";
import type { HomeworkCompletion } from "@/types";

export type HomeworkAnswer =
  | { kind: "idle" }
  | { kind: "searching" }
  /** No answer key was chosen for this homework, and the search didn't find one either. */
  | { kind: "none" }
  | { kind: "loading"; message: string | null }
  | { kind: "failed"; path: string }
  | { kind: "ready"; path: string; data: ArrayBuffer; pageNumbers: number[] };

/**
 * The answer key for one homework item in the Check Viewer, loaded as soon as
 * the item is on screen.
 *
 * It uses the answer key a tutor chose for the homework when there is one. For
 * the rest it searches by the worksheet's file name, the same way lesson mode
 * does, looking in the connected folders first and then Shelv. The file comes
 * through the same loader as the worksheet.
 *
 * `searches` and `cache` belong to whoever opened the viewer. They outlive the
 * viewer itself, so stepping back to an item or opening the viewer again
 * doesn't repeat a search or a download. A search that fails isn't remembered,
 * so the next try runs it again.
 */
export function useHomeworkAnswer(
  homework: HomeworkCompletion | null,
  cache: Map<string, ArrayBuffer>,
  searches: Map<string, AnswerSearchResult | null>,
) {
  const [answer, setAnswer] = useState<HomeworkAnswer>({ kind: "idle" });
  // Goes up with each retry, so the same item is looked up again.
  const [attempt, setAttempt] = useState(0);

  // The fields that decide which file and which pages, so a mark saved in the
  // viewer (which hands back a new record) doesn't start the whole load again.
  const id = homework?.session_exercise_id;
  const pdfName = homework?.pdf_name?.trim() || null;
  const chosenPath = homework?.answer_pdf_name?.trim() || null;
  const pagesKey = homework
    ? [homework.page_start, homework.page_end, homework.assignment_remarks,
       homework.answer_page_start, homework.answer_page_end, homework.answer_remarks].join("|")
    : "";

  useEffect(() => {
    if (!homework || !pdfName) {
      setAnswer({ kind: "idle" });
      return;
    }
    let cancelled = false;

    (async () => {
      let path = chosenPath;
      if (!path) {
        let found = searches.get(pdfName);
        if (found === undefined) {
          setAnswer({ kind: "searching" });
          try {
            found = await searchAnswerFile(pdfName);
            searches.set(pdfName, found);
          } catch {
            found = null;
          }
          if (cancelled) return;
        }
        path = found?.path ?? null;
      }
      if (!path) {
        setAnswer({ kind: "none" });
        return;
      }

      let data = cache.get(path);
      if (!data) {
        setAnswer({ kind: "loading", message: null });
        let result: Awaited<ReturnType<typeof loadExercisePdf>>;
        try {
          result = await loadExercisePdf(path, (message) => {
            if (!cancelled) setAnswer({ kind: "loading", message });
          });
        } catch {
          result = { error: "fetch_failed" };
        }
        if (cancelled) return;
        if (!("data" in result)) {
          setAnswer({ kind: "failed", path });
          return;
        }
        data = result.data;
        rememberPdf(cache, PDF_CACHE_SIZE, path, data);
      }

      // pdf.js takes over the bytes it's given, so it counts a copy and the
      // cached file stays readable.
      const pageCount = await getPageCount(data.slice(0)).catch(() => null);
      if (cancelled) return;
      setAnswer({ kind: "ready", path, data, pageNumbers: answerPageNumbers(homework, pageCount) });
    })();

    return () => {
      cancelled = true;
    };
    // `homework` is read for its pages, which pagesKey already stands for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, pdfName, chosenPath, pagesKey, cache, searches, attempt]);

  /** Forget this item's search and file, and look again. */
  const retry = useCallback(() => {
    if (pdfName && !chosenPath) searches.delete(pdfName);
    if (answer.kind === "failed" || answer.kind === "ready") cache.delete(answer.path);
    setAttempt((count) => count + 1);
  }, [answer, cache, chosenPath, pdfName, searches]);

  return { answer, retry };
}
