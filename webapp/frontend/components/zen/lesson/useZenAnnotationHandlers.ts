"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { getDisplayName } from "@/lib/exercise-utils";
import { downloadBlob } from "@/lib/geometry-utils";
import { saveAnnotatedPdf } from "@/lib/pdf-annotation-save";
import { exerciseToPageNumbers } from "./useZenLessonState";
import type { PrintStampInfo } from "@/lib/pdf-utils";
import type { Stroke } from "@/hooks/useAnnotations";
import type { SessionExercise } from "@/types";

interface UseZenAnnotationHandlersParams {
  annotations: {
    getAnnotations: (exerciseId: number) => Record<number, Stroke[]>;
    setPageStrokes: (exerciseId: number, pageIndex: number, strokes: Stroke[]) => void;
    undoLastStroke: (exerciseId: number, pageIndex: number) => Stroke[];
    redoLastStroke: (exerciseId: number, pageIndex: number) => Stroke[] | null;
    clearPage: (exerciseId: number, pageIndex: number) => void;
    clearAll: () => void;
    clearStorage: () => void;
    hasAnnotations: (exerciseId: number) => boolean;
    hasAnyAnnotations: () => boolean;
  };
  selectedExercise: { id: number; pdf_name: string } | undefined;
  exercises: SessionExercise[];
  pdfCacheRef: React.RefObject<Map<string, ArrayBuffer>>;
  currentPage: number;
  pdfData: ArrayBuffer | null;
  pageNumbers: number[];
  stamp: PrintStampInfo;
  onClose: () => void;
}

export function useZenAnnotationHandlers({
  annotations,
  selectedExercise,
  exercises,
  pdfCacheRef,
  currentPage,
  pdfData,
  pageNumbers,
  stamp,
  onClose,
}: UseZenAnnotationHandlersParams) {
  const [strokeVersion, setStrokeVersion] = useState(0);
  const bumpStrokes = useCallback(() => setStrokeVersion(v => v + 1), []);

  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const showExitConfirmRef = useRef(showExitConfirm);
  showExitConfirmRef.current = showExitConfirm;

  const handleUndo = useCallback(() => {
    if (!selectedExercise) return;
    annotations.undoLastStroke(selectedExercise.id, currentPage - 1);
    bumpStrokes();
  }, [selectedExercise, currentPage, annotations, bumpStrokes]);

  const handleRedo = useCallback(() => {
    if (!selectedExercise) return;
    annotations.redoLastStroke(selectedExercise.id, currentPage - 1);
    bumpStrokes();
  }, [selectedExercise, currentPage, annotations, bumpStrokes]);

  const handleSaveAnnotated = useCallback(async () => {
    if (!selectedExercise || !pdfData) return;
    try {
      const ann = annotations.getAnnotations(selectedExercise.id);
      const blob = await saveAnnotatedPdf(pdfData, pageNumbers, stamp, ann);
      downloadBlob(blob, `annotated-${getDisplayName(selectedExercise.pdf_name)}.pdf`);
    } catch (err) {
      console.error("Failed to save annotated PDF:", err);
    }
  }, [selectedExercise, pdfData, pageNumbers, stamp, annotations]);

  const handleSaveAllAnnotated = useCallback(async () => {
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      for (const exercise of exercises) {
        if (!annotations.hasAnnotations(exercise.id)) continue;
        if (!exercise.pdf_name) continue;

        const cached = pdfCacheRef.current?.get(exercise.pdf_name);
        if (!cached) continue;

        const ann = annotations.getAnnotations(exercise.id);
        const pages = exerciseToPageNumbers(exercise);
        const blob = await saveAnnotatedPdf(cached, pages, stamp, ann);
        zip.file(`annotated-${getDisplayName(exercise.pdf_name)}.pdf`, blob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      downloadBlob(zipBlob, "annotated-exercises.zip");
    } catch (err) {
      console.error("Failed to save all annotated PDFs:", err);
    }
  }, [exercises, pdfCacheRef, annotations, stamp]);

  const handleExitAttempt = useCallback(() => {
    if (annotations.hasAnyAnnotations()) {
      setShowExitConfirm(true);
    } else {
      onClose();
    }
  }, [annotations, onClose]);

  // Refs for keyboard handler (stable effect, fresh callbacks)
  const handleUndoRef = useRef(handleUndo);
  handleUndoRef.current = handleUndo;
  const handleRedoRef = useRef(handleRedo);
  handleRedoRef.current = handleRedo;
  const handleSaveAnnotatedRef = useRef(handleSaveAnnotated);
  handleSaveAnnotatedRef.current = handleSaveAnnotated;
  const handleSaveAllAnnotatedRef = useRef(handleSaveAllAnnotated);
  handleSaveAllAnnotatedRef.current = handleSaveAllAnnotated;
  const handleExitAttemptRef = useRef(handleExitAttempt);
  handleExitAttemptRef.current = handleExitAttempt;

  // Memoized callbacks for ZenLessonPdfViewer props (stable references)
  const pageStrokesFn = useCallback(
    (pageIdx: number): Stroke[] =>
      selectedExercise ? annotations.getAnnotations(selectedExercise.id)[pageIdx] || [] : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedExercise, annotations, strokeVersion],
  );

  const onStrokesChange = useCallback(
    (pageIdx: number, strokes: Stroke[]) => {
      if (!selectedExercise) return;
      annotations.setPageStrokes(selectedExercise.id, pageIdx, strokes);
      bumpStrokes();
    },
    [selectedExercise, annotations, bumpStrokes],
  );

  const onClearPage = useCallback(
    (pageIdx: number) => {
      if (!selectedExercise) return;
      annotations.clearPage(selectedExercise.id, pageIdx);
      bumpStrokes();
    },
    [selectedExercise, annotations, bumpStrokes],
  );

  const hasAnnotationsForExercise = useMemo(
    () => selectedExercise ? annotations.hasAnnotations(selectedExercise.id) : false,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedExercise, annotations, strokeVersion],
  );

  return {
    handleUndo,
    handleRedo,
    handleSaveAnnotated,
    handleSaveAllAnnotated,
    handleExitAttempt,
    showExitConfirm,
    setShowExitConfirm,
    refs: {
      handleUndoRef,
      handleRedoRef,
      handleSaveAnnotatedRef,
      handleSaveAllAnnotatedRef,
      handleExitAttemptRef,
      showExitConfirmRef,
    },
    // Memoized props for ZenLessonPdfViewer
    pageStrokesFn: selectedExercise ? pageStrokesFn : undefined,
    onStrokesChange: selectedExercise ? onStrokesChange : undefined,
    onClearPage: selectedExercise ? onClearPage : undefined,
    hasAnnotationsForExercise,
  };
}
