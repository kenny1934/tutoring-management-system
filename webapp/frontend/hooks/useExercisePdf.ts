"use client";

import { useCallback, useEffect, useState } from "react";
import { loadExercisePdf, rememberPdf, PDF_CACHE_SIZE } from "@/lib/lesson-pdf-loader";
import { getExercisePageNumbers, NO_FILE_ERROR } from "@/lib/lesson-utils";
import type { SessionExercise } from "@/types";

/**
 * A lesson view's cache of PDF bytes, made once when the view opens. The
 * worksheet, the answer key, Download All and the files fetched ahead of
 * time all read and fill this one cache, so no file is loaded twice.
 */
export function usePdfCache(): Map<string, ArrayBuffer> {
  const [cache] = useState(() => new Map<string, ArrayBuffer>());
  return cache;
}

/**
 * The open exercise's file, and which of its pages to show. A file already in
 * the cache shows straight away, and any other is loaded and kept there. An
 * exercise that's a web link has no file to load.
 *
 * `retry` forgets the file and loads it again, for when a load failed or the
 * file's bytes wouldn't draw.
 *
 * The bytes are kept with the name of the file they came from, and only
 * handed out while that's still the open exercise's file. Otherwise, for the
 * one render between a new exercise opening and the load catching up, the
 * viewer would get the last exercise's file and start drawing it for nothing.
 */
export function useExercisePdf(exercise: SessionExercise | null, cache: Map<string, ArrayBuffer>) {
  const [loaded, setLoaded] = useState<{ pdfName: string; data: ArrayBuffer } | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfLoadingMessage, setPdfLoadingMessage] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pageNumbers, setPageNumbers] = useState<number[]>([]);
  // Goes up with each retry, so the same exercise's file is loaded again.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Anything still loading is for an exercise that's no longer open, and its
    // load has been told to stop, so nothing else would turn the spinner off.
    // Only a new load below turns it back on.
    setPdfLoading(false);
    setPdfLoadingMessage(null);

    // Nothing to load. A web link has no file and that's fine, but any other
    // exercise without one is missing it.
    if (!exercise?.pdf_name) {
      setLoaded(null);
      setPageNumbers([]);
      setPdfError(exercise && !exercise.url ? NO_FILE_ERROR : null);
      return;
    }

    const pdfName = exercise.pdf_name;
    setPageNumbers(getExercisePageNumbers(exercise));

    const cached = cache.get(pdfName);
    if (cached) {
      setLoaded({ pdfName, data: cached });
      setPdfError(null);
      return;
    }

    setLoaded(null);
    let cancelled = false;

    (async () => {
      setPdfLoading(true);
      setPdfError(null);

      // A load that throws is a download that failed, so the spinner still ends.
      let result: Awaited<ReturnType<typeof loadExercisePdf>>;
      try {
        result = await loadExercisePdf(pdfName, (message) => {
          if (!cancelled) setPdfLoadingMessage(message);
        });
      } catch {
        result = { error: "fetch_failed" };
      }
      // Kept even when the tutor has moved on, since they may well come back.
      if ("data" in result) rememberPdf(cache, PDF_CACHE_SIZE, pdfName, result.data);
      if (cancelled) return;

      if ("data" in result) {
        setLoaded({ pdfName, data: result.data });
      } else {
        setLoaded(null);
        setPdfError(
          result.error === "no_file" ? NO_FILE_ERROR
            : result.error === "fetch_failed" ? "Failed to download PDF"
            : "File not found"
        );
      }
      setPdfLoading(false);
      setPdfLoadingMessage(null);
    })();

    return () => { cancelled = true; };
  }, [exercise, cache, attempt]);

  const retry = useCallback(() => {
    if (exercise?.pdf_name) cache.delete(exercise.pdf_name);
    setAttempt((count) => count + 1);
  }, [exercise, cache]);

  const pdfData = loaded && loaded.pdfName === exercise?.pdf_name ? loaded.data : null;
  return { pdfData, pageNumbers, pdfLoading, pdfLoadingMessage, pdfError, retry };
}
