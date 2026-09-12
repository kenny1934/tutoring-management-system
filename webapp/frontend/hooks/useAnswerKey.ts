"use client";

import { useCallback, useEffect, useState } from "react";
import { loadExercisePdf, rememberPdf, PDF_CACHE_SIZE } from "@/lib/lesson-pdf-loader";
import { searchAnswerFile, type AnswerSearchResult } from "@/lib/answer-file-utils";
import { getAnswerPageNumbers } from "@/lib/lesson-utils";
import type { SessionExercise } from "@/types";

const LOAD_FAILED = "Failed to load answer key";

/**
 * The open exercise's answer key for both lesson views. An exercise that
 * names its answer file uses it, and any other has one searched for by its
 * worksheet's file name, with each search's result remembered for that file.
 * The answer file is only loaded once the tutor opens the answer key, and it
 * goes into the view's shared cache.
 *
 * Each exercise remembers whether its answer key was open, so going back to
 * it finds it as the tutor left it. On a phone, the worksheet and its answer
 * key take turns on screen, and opening the answer key brings it to the front.
 *
 * Whether the answer key is open, and which file it shows, are worked out
 * from the open exercise on every render. Both views used to copy them into
 * state when the exercise changed, so for one render after each move they
 * still belonged to the last exercise. That opened the last worksheet's
 * answers over the new one, and started loading files nobody had asked for.
 */
export function useAnswerKey(exercise: SessionExercise | null, cache: Map<string, ArrayBuffer>) {
  // What each search found, by the worksheet's file. Null means it found nothing.
  const [searchResults, setSearchResults] = useState<ReadonlyMap<string, AnswerSearchResult | null>>(() => new Map());
  // The worksheet whose search failed. It's tried again once the tutor has moved away and come back.
  const [failedSearch, setFailedSearch] = useState<string | null>(null);
  // The exercises whose answer key the tutor left open.
  const [openFor, setOpenFor] = useState<ReadonlySet<number>>(() => new Set());
  const [answerPdfData, setAnswerPdfData] = useState<ArrayBuffer | null>(null);
  const [answerPageNumbers, setAnswerPageNumbers] = useState<number[]>([]);
  const [answerLoading, setAnswerLoading] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [mobileActiveTab, setMobileActiveTab] = useState<"exercise" | "answer">("exercise");

  const pdfName = exercise?.pdf_name || null;
  // Undefined while the search for this worksheet hasn't answered yet.
  const answerFile: AnswerSearchResult | null | undefined = !pdfName ? null
    : exercise?.answer_pdf_name ? { path: exercise.answer_pdf_name, source: "local" }
    : searchResults.get(pdfName);
  const searched = answerFile !== undefined || failedSearch === pdfName;
  const answerPath = answerFile?.path ?? null;
  const showAnswerKey = !!pdfName && !!exercise && openFor.has(exercise.id);

  // Search for the worksheet's answer file, once per file.
  useEffect(() => {
    if (!pdfName || searched) return;
    let cancelled = false;
    searchAnswerFile(pdfName).then(
      (found) => {
        if (!cancelled) setSearchResults((results) => new Map(results).set(pdfName, found));
      },
      (err) => {
        console.error("Answer file search failed:", err);
        // A failed search still has to end, or the button would keep saying it's looking.
        if (!cancelled) setFailedSearch(pdfName);
      },
    );
    return () => { cancelled = true; };
  }, [pdfName, searched]);

  useEffect(() => {
    if (failedSearch !== null && failedSearch !== pdfName) setFailedSearch(null);
  }, [failedSearch, pdfName]);

  // Load the answer file while the answer key is open.
  useEffect(() => {
    // Whatever was on show or on its way belonged to an answer key that's
    // closed or no longer on screen, and a load that was told to stop never
    // turns its spinner off. So it all goes, and only what's below brings an
    // answer key back.
    setAnswerLoading(false);
    setAnswerPdfData(null);
    setAnswerError(null);
    if (!showAnswerKey || !answerPath || !exercise) return;

    const cached = cache.get(answerPath);
    if (cached) {
      setAnswerPdfData(cached);
      setAnswerPageNumbers(getAnswerPageNumbers(exercise));
      return;
    }

    let cancelled = false;
    setAnswerLoading(true);
    (async () => {
      try {
        const result = await loadExercisePdf(answerPath);
        if (cancelled) return;
        if ("data" in result) {
          rememberPdf(cache, PDF_CACHE_SIZE, answerPath, result.data);
          setAnswerPdfData(result.data);
          setAnswerPageNumbers(getAnswerPageNumbers(exercise));
        } else {
          setAnswerError(LOAD_FAILED);
        }
      } catch {
        // A load that throws has failed all the same, and the spinner still ends.
        if (!cancelled) setAnswerError(LOAD_FAILED);
      } finally {
        if (!cancelled) setAnswerLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [showAnswerKey, answerPath, exercise, cache]);

  const toggleAnswerKey = useCallback(() => {
    if (!exercise) return;
    const opening = !openFor.has(exercise.id);
    setOpenFor((open) => {
      const next = new Set(open);
      if (opening) next.add(exercise.id);
      else next.delete(exercise.id);
      return next;
    });
    if (opening) setMobileActiveTab("answer");
  }, [exercise, openFor]);

  return {
    showAnswerKey,
    toggleAnswerKey,
    /** Whether the open exercise has an answer key to show. */
    answerKeyFound: !!answerFile,
    /** Whether its answer key is still being looked for. */
    answerKeySearching: !!pdfName && !searched,
    answerPdfData,
    answerPageNumbers,
    answerLoading,
    answerError,
    mobileActiveTab,
    setMobileActiveTab,
  };
}
