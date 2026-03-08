"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { loadExercisePdf } from "@/lib/lesson-pdf-loader";
import { searchAnswerFile, type AnswerSearchResult } from "@/lib/answer-file-utils";
import { getPageNumbers, type BulkPrintExercise } from "@/lib/bulk-pdf-helpers";
import { parseExerciseRemarks } from "@/lib/exercise-utils";
import { openFileFromPathWithFallback, printFileFromPathWithFallback } from "@/lib/file-system";
import type { PrintStampInfo } from "@/lib/pdf-utils";
import { setZenStatus } from "@/components/zen/ZenStatusBar";
import type { SessionExercise } from "@/types";

function exerciseToPageNumbers(exercise: SessionExercise): number[] {
  const { complexPages } = parseExerciseRemarks(exercise.remarks || null);
  const bulk: BulkPrintExercise = {
    pdf_name: exercise.pdf_name,
    page_start: exercise.page_start,
    page_end: exercise.page_end,
    complex_pages: complexPages || undefined,
  };
  return getPageNumbers(bulk);
}

function getAnswerPageNumbers(exercise: SessionExercise): number[] {
  const { complexPages } = parseExerciseRemarks(exercise.answer_remarks);
  return getPageNumbers({
    pdf_name: exercise.answer_pdf_name || "",
    page_start: exercise.answer_page_start,
    page_end: exercise.answer_page_end,
    complex_pages: complexPages || undefined,
  });
}

function sortExercisesCwFirst(all: SessionExercise[]): SessionExercise[] {
  const cw = all.filter((e) => e.exercise_type === "CW" || e.exercise_type === "Classwork");
  const hw = all.filter((e) => e.exercise_type === "HW" || e.exercise_type === "Homework");
  return [...cw, ...hw];
}

export type ZenLessonState = ReturnType<typeof useZenLessonState>;

/**
 * Shared hook for zen lesson mode state: exercise list, PDF loading,
 * answer key search/loading, and caching. Used by both ZenLessonMode
 * and ZenLessonWideMode to eliminate duplication.
 *
 * @param allExercises - Raw exercises from the session
 * @param resetKey - When this changes, exercise cursor resets to 0 (used for student switching)
 */
export function useZenLessonState(allExercises: SessionExercise[], resetKey?: unknown) {
  const exercises = useMemo(() => sortExercisesCwFirst(allExercises), [allExercises]);

  const [exerciseCursor, setExerciseCursor] = useState(0);
  const selectedExercise = exercises[exerciseCursor] || null;

  // PDF state
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfLoadingMessage, setPdfLoadingMessage] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pageNumbers, setPageNumbers] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(100);

  // PDF cache
  const pdfCacheRef = useRef<Map<string, ArrayBuffer>>(new Map());

  // Annotation state
  const [drawingEnabled, setDrawingEnabled] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isErasing, setIsErasing] = useState(false);
  const [penColor, setPenColor] = useState("#e53e3e");
  const [penSize, setPenSize] = useState(3);
  const [annotationHidden, setAnnotationHidden] = useState(false);

  // Answer key state
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [answerPdfData, setAnswerPdfData] = useState<ArrayBuffer | null>(null);
  const [answerPageNumbers, setAnswerPageNumbers] = useState<number[]>([]);
  const [answerLoading, setAnswerLoading] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [answerCurrentPage, setAnswerCurrentPage] = useState(1);
  const [answerTotalPages, setAnswerTotalPages] = useState(0);
  const [answerZoom, setAnswerZoom] = useState(100);

  const answerCacheRef = useRef<Map<string, AnswerSearchResult | null>>(new Map());
  const answerOpenSetRef = useRef<Set<number>>(new Set());
  const [answerAvailable, setAnswerAvailable] = useState<Map<number, boolean | null>>(new Map());

  // Reset cursor when resetKey changes (e.g., student switching)
  useEffect(() => {
    setExerciseCursor(0);
  }, [resetKey]);

  // Load PDF when exercise changes
  useEffect(() => {
    if (!selectedExercise) {
      setPdfData(null);
      setPdfError(null);
      setPageNumbers([]);
      return;
    }

    const pdfName = selectedExercise.pdf_name;
    const pages = exerciseToPageNumbers(selectedExercise);
    setPageNumbers(pages);
    setCurrentPage(1);
    setShowAnswerKey(answerOpenSetRef.current.has(selectedExercise.id));

    const cached = pdfCacheRef.current.get(pdfName);
    if (cached) {
      setPdfData(cached);
      setPdfLoading(false);
      setPdfError(null);
      return;
    }

    let cancelled = false;
    setPdfLoading(true);
    setPdfError(null);
    setPdfLoadingMessage("Loading...");

    (async () => {
      const result = await loadExercisePdf(pdfName, (msg) => {
        if (!cancelled) setPdfLoadingMessage(msg);
      });

      if (cancelled) return;

      if ("error" in result) {
        setPdfError(
          result.error === "no_file"
            ? "No file path"
            : result.error === "file_not_found"
            ? "File not found"
            : "Failed to load PDF"
        );
        setPdfData(null);
      } else {
        pdfCacheRef.current.set(pdfName, result.data);
        if (pdfCacheRef.current.size > 20) {
          const oldest = pdfCacheRef.current.keys().next().value;
          if (oldest !== undefined) pdfCacheRef.current.delete(oldest);
        }
        setPdfData(result.data);
        setPdfError(null);
      }
      setPdfLoading(false);
      setPdfLoadingMessage(null);
    })();

    return () => { cancelled = true; };
  }, [selectedExercise]);

  // Prefetch adjacent exercise PDFs into cache
  useEffect(() => {
    if (!selectedExercise || !pdfData) return;

    let cancelled = false;
    const currentIdx = exercises.findIndex(ex => ex.id === selectedExercise.id);
    const adjacent = [exercises[currentIdx - 1], exercises[currentIdx + 1]].filter(
      (ex): ex is SessionExercise => !!ex?.pdf_name && !pdfCacheRef.current.has(ex.pdf_name)
    );

    (async () => {
      for (const ex of adjacent) {
        if (cancelled) break;
        const result = await loadExercisePdf(ex.pdf_name);
        if (cancelled) break;
        if ("data" in result) {
          pdfCacheRef.current.set(ex.pdf_name, result.data);
          if (pdfCacheRef.current.size > 20) {
            const oldest = pdfCacheRef.current.keys().next().value;
            if (oldest !== undefined) pdfCacheRef.current.delete(oldest);
          }
        }
      }
    })();

    return () => { cancelled = true; };
  }, [selectedExercise, pdfData, exercises]);

  // Search for answer key when exercise changes
  useEffect(() => {
    if (!selectedExercise) return;

    const pdfName = selectedExercise.pdf_name;

    if (selectedExercise.answer_pdf_name) {
      const result: AnswerSearchResult = {
        path: selectedExercise.answer_pdf_name,
        source: "local",
      };
      answerCacheRef.current.set(pdfName, result);
      setAnswerAvailable((prev) => new Map(prev).set(selectedExercise.id, true));
      return;
    }

    if (answerCacheRef.current.has(pdfName)) {
      const cached = answerCacheRef.current.get(pdfName);
      setAnswerAvailable((prev) => new Map(prev).set(selectedExercise.id, cached != null));
      return;
    }

    setAnswerAvailable((prev) => new Map(prev).set(selectedExercise.id, null));

    let cancelled = false;
    (async () => {
      const result = await searchAnswerFile(pdfName);
      if (cancelled) return;
      answerCacheRef.current.set(pdfName, result);
      setAnswerAvailable((prev) => new Map(prev).set(selectedExercise.id, result != null));
    })();

    return () => { cancelled = true; };
  }, [selectedExercise]);

  // Load answer PDF when toggled on
  useEffect(() => {
    if (!showAnswerKey || !selectedExercise) {
      setAnswerPdfData(null);
      setAnswerError(null);
      return;
    }

    const pdfName = selectedExercise.pdf_name;
    const answerResult = answerCacheRef.current.get(pdfName);
    if (!answerResult) {
      setAnswerError("No answer file found");
      return;
    }

    setAnswerPageNumbers(getAnswerPageNumbers(selectedExercise));
    setAnswerCurrentPage(1);

    const cached = pdfCacheRef.current.get(answerResult.path);
    if (cached) {
      setAnswerPdfData(cached);
      setAnswerLoading(false);
      setAnswerError(null);
      return;
    }

    let cancelled = false;
    setAnswerLoading(true);
    setAnswerError(null);

    (async () => {
      const result = await loadExercisePdf(answerResult.path);
      if (cancelled) return;

      if ("error" in result) {
        setAnswerError("Failed to load answer PDF");
        setAnswerPdfData(null);
      } else {
        pdfCacheRef.current.set(answerResult.path, result.data);
        setAnswerPdfData(result.data);
        setAnswerError(null);
      }
      setAnswerLoading(false);
    })();

    return () => { cancelled = true; };
  }, [showAnswerKey, selectedExercise]);

  return {
    exercises,
    exerciseCursor,
    setExerciseCursor,
    selectedExercise,
    pdfData,
    pdfLoading,
    pdfLoadingMessage,
    pdfError,
    pageNumbers,
    currentPage,
    setCurrentPage,
    totalPages,
    setTotalPages,
    zoom,
    setZoom,
    showAnswerKey,
    setShowAnswerKey,
    answerPdfData,
    answerPageNumbers,
    answerLoading,
    answerError,
    answerCurrentPage,
    setAnswerCurrentPage,
    answerTotalPages,
    setAnswerTotalPages,
    answerZoom,
    setAnswerZoom,
    answerAvailable,
    answerCacheRef,
    answerOpenSetRef,
    drawingEnabled,
    setDrawingEnabled,
    isDrawing,
    setIsDrawing,
    isErasing,
    setIsErasing,
    penColor,
    setPenColor,
    penSize,
    setPenSize,
    annotationHidden,
    setAnnotationHidden,
  };
}

/**
 * Handle shared keyboard shortcuts for lesson mode.
 * Returns true if the key was handled.
 */
export function handleLessonKeyDown(
  e: KeyboardEvent,
  state: ZenLessonState,
  opts: {
    stamp: PrintStampInfo;
    onClose: () => void;
    onExitAttempt?: () => void;
    paperlessSearch?: (path: string) => Promise<number | null>;
    onEditExercises?: (type: "CW" | "HW") => void;
    onUndo?: () => void;
    onRedo?: () => void;
    onSaveAnnotated?: () => void;
  },
): boolean {
  const {
    exercises, selectedExercise, showAnswerKey, totalPages, answerAvailable, answerOpenSetRef,
    drawingEnabled, isDrawing, isErasing, annotationHidden,
    setExerciseCursor, setCurrentPage, setZoom, setShowAnswerKey,
    setDrawingEnabled, setIsDrawing, setIsErasing, setAnnotationHidden,
  } = state;

  switch (e.key) {
    case "j":
    case "ArrowDown":
      e.preventDefault();
      e.stopImmediatePropagation();
      setExerciseCursor((prev) => Math.min(prev + 1, exercises.length - 1));
      return true;
    case "k":
    case "ArrowUp":
      e.preventDefault();
      e.stopImmediatePropagation();
      setExerciseCursor((prev) => Math.max(prev - 1, 0));
      return true;
    case "]":
    case "ArrowRight":
      e.preventDefault();
      e.stopImmediatePropagation();
      setCurrentPage((p) => Math.min(p + 1, totalPages));
      return true;
    case "[":
    case "ArrowLeft":
      e.preventDefault();
      e.stopImmediatePropagation();
      setCurrentPage((p) => Math.max(p - 1, 1));
      return true;
    case "+":
    case "=":
      e.preventDefault();
      e.stopImmediatePropagation();
      setZoom((z) => Math.min(z + 25, 200));
      return true;
    case "-":
      e.preventDefault();
      e.stopImmediatePropagation();
      setZoom((z) => Math.max(z - 25, 25));
      return true;
    case "f":
      e.preventDefault();
      e.stopImmediatePropagation();
      setZoom(100);
      return true;
    case "a":
      e.preventDefault();
      e.stopImmediatePropagation();
      if (selectedExercise && answerAvailable.get(selectedExercise.id) === true) {
        const next = !showAnswerKey;
        if (next) answerOpenSetRef.current.add(selectedExercise.id);
        else answerOpenSetRef.current.delete(selectedExercise.id);
        setShowAnswerKey(next);
        setZenStatus(next ? "Answer key shown" : "Answer key hidden", "info");
      } else if (selectedExercise && answerAvailable.get(selectedExercise.id) === false) {
        setZenStatus("No answer file found", "warning");
      }
      return true;
    case "o":
      e.preventDefault();
      e.stopImmediatePropagation();
      if (selectedExercise) {
        openFileFromPathWithFallback(selectedExercise.pdf_name);
      }
      return true;
    case "p":
      e.preventDefault();
      e.stopImmediatePropagation();
      if (selectedExercise) {
        const { complexPages } = parseExerciseRemarks(selectedExercise.remarks || null);
        printFileFromPathWithFallback(
          selectedExercise.pdf_name,
          selectedExercise.page_start,
          selectedExercise.page_end,
          complexPages || undefined,
          opts.stamp,
          opts.paperlessSearch
        );
      }
      return true;
    case "d":
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!drawingEnabled) {
        // Enable drawing with pen
        setDrawingEnabled(true);
        setIsDrawing(true);
        setIsErasing(false);
        setZenStatus("Drawing mode", "info");
      } else if (isErasing) {
        // Switch from eraser to pen
        setIsDrawing(true);
        setIsErasing(false);
        setZenStatus("Pen mode", "info");
      } else {
        // Turn off drawing
        setDrawingEnabled(false);
        setIsDrawing(false);
        setIsErasing(false);
        setZenStatus("Drawing off", "info");
      }
      return true;
    case "e":
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!drawingEnabled) {
        // Enable drawing with eraser
        setDrawingEnabled(true);
        setIsDrawing(false);
        setIsErasing(true);
        setZenStatus("Eraser mode", "info");
      } else if (isDrawing && !isErasing) {
        // Switch from pen to eraser
        setIsDrawing(false);
        setIsErasing(true);
        setZenStatus("Eraser mode", "info");
      } else {
        // Turn off drawing
        setDrawingEnabled(false);
        setIsDrawing(false);
        setIsErasing(false);
        setZenStatus("Drawing off", "info");
      }
      return true;
    case "z":
      if (drawingEnabled && !e.shiftKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        opts.onUndo?.();
        return true;
      }
      return false;
    case "Z":
      if (drawingEnabled && e.shiftKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        opts.onRedo?.();
        return true;
      }
      return false;
    case "v":
      if (drawingEnabled) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setAnnotationHidden(!annotationHidden);
        setZenStatus(annotationHidden ? "Annotations visible" : "Annotations hidden", "info");
        return true;
      }
      return false;
    case "s":
      if (drawingEnabled) {
        e.preventDefault();
        e.stopImmediatePropagation();
        opts.onSaveAnnotated?.();
        return true;
      }
      return false;
    case "c":
      e.preventDefault();
      e.stopImmediatePropagation();
      opts.onEditExercises?.("CW");
      return true;
    case "h":
      e.preventDefault();
      e.stopImmediatePropagation();
      opts.onEditExercises?.("HW");
      return true;
    case "Escape":
      e.preventDefault();
      e.stopImmediatePropagation();
      if (drawingEnabled) {
        // First Escape exits drawing mode
        setDrawingEnabled(false);
        setIsDrawing(false);
        setIsErasing(false);
        setZenStatus("Drawing off", "info");
      } else if (opts.onExitAttempt) {
        opts.onExitAttempt();
      } else {
        opts.onClose();
      }
      return true;
    default:
      return false;
  }
}
