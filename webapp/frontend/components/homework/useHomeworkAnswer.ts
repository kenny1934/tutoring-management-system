"use client";

import { useCallback, useEffect, useMemo, useReducer } from "react";
import { useExercisePdf } from "@/hooks/useExercisePdf";
import { searchAnswerFile, type AnswerSearchResult } from "@/lib/answer-file-utils";
import { getPageCount } from "@/lib/pdf-utils";
import { answerPageNumbers } from "@/lib/homework-check";
import type { HomeworkCompletion, SessionExercise } from "@/types";

export type HomeworkAnswer =
  | { kind: "searching" }
  /** No answer key was chosen for this homework, and the search didn't find one either. */
  | { kind: "none" }
  | { kind: "loading"; message: string | null }
  | { kind: "failed"; path: string }
  | { kind: "ready"; path: string; data: ArrayBuffer; pageNumbers: number[] };

// How many pages each loaded answer file has. It's kept with the file's own
// bytes, so each file is counted once and the count goes when the file does.
const pageCounts = new WeakMap<ArrayBuffer, number | null>();

/**
 * The answer key for one homework item in the Check Viewer, loaded as soon as
 * the item is on screen.
 *
 * It uses the answer key a tutor chose for the homework when there is one. For
 * the rest it searches by the worksheet's file name, the same way lesson mode
 * does. The file itself comes through the worksheet's own loader, so it's
 * looked for in the connected folders first and then Shelv.
 *
 * `searches` and `cache` belong to whoever opened the viewer. They outlive the
 * viewer itself, so stepping back to an item or opening the viewer again
 * doesn't repeat a search or a download. Everything returned is worked out
 * from the item on screen at each render, so it never shows the last item's
 * answers while the next one's are on their way.
 */
export function useHomeworkAnswer(
  homework: HomeworkCompletion,
  cache: Map<string, ArrayBuffer>,
  searches: Map<string, AnswerSearchResult | null>,
) {
  // The searches and the page counts live outside React, so each one that
  // lands asks for a render. Retrying a search does the same.
  const [version, rerender] = useReducer((n: number) => n + 1, 0);
  const pdfName = homework.pdf_name?.trim() || "";
  const chosenPath = homework.answer_pdf_name?.trim() || null;
  // Undefined while the search is still running, null when it found nothing.
  const path = chosenPath ?? (searches.has(pdfName) ? searches.get(pdfName)?.path ?? null : undefined);

  useEffect(() => {
    if (chosenPath || !pdfName || searches.has(pdfName)) return;
    let cancelled = false;
    // A search that fails counts as finding nothing. Search again runs it afresh.
    searchAnswerFile(pdfName)
      .catch(() => null)
      .then((found) => {
        searches.set(pdfName, found);
        if (!cancelled) rerender();
      });
    return () => {
      cancelled = true;
    };
  }, [chosenPath, pdfName, searches, version]);

  const answerFile = useMemo<SessionExercise | null>(
    () => (path ? { id: homework.session_exercise_id, session_id: 0, exercise_type: "ANS", created_by: "", pdf_name: path } : null),
    [path, homework.session_exercise_id],
  );
  const file = useExercisePdf(answerFile, cache);
  const data = file.pdfData;

  useEffect(() => {
    if (!data || pageCounts.has(data)) return;
    let cancelled = false;
    // pdf.js takes over the bytes it's given, so it counts a copy and the
    // cached file stays readable.
    getPageCount(data.slice(0))
      .catch(() => null)
      .then((count) => {
        pageCounts.set(data, count);
        if (!cancelled) rerender();
      });
    return () => {
      cancelled = true;
    };
  }, [data]);
  const pageCount = data ? pageCounts.get(data) : undefined;

  const pageNumbers = useMemo(
    () => (pageCount === undefined ? null : answerPageNumbers(homework, pageCount)),
    // A saved mark hands back a new record every time, so only the fields
    // that decide the pages are watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageCount, homework.page_start, homework.page_end, homework.assignment_remarks,
     homework.answer_pdf_name, homework.answer_page_start, homework.answer_page_end, homework.answer_remarks],
  );

  let answer: HomeworkAnswer;
  if (path === undefined) answer = { kind: "searching" };
  else if (path === null) answer = { kind: "none" };
  else if (file.pdfError) answer = { kind: "failed", path };
  else if (!data || !pageNumbers) answer = { kind: "loading", message: file.pdfLoadingMessage };
  else answer = { kind: "ready", path, data, pageNumbers };

  /** Looks for the answer key again when none was found, or loads its file again. */
  const { retry: reload } = file;
  const retry = useCallback(() => {
    if (path === null) {
      searches.delete(pdfName);
      rerender();
    } else {
      reload();
    }
  }, [path, pdfName, reload, searches]);

  return { answer, retry };
}
