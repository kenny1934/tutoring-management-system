"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { getDisplayName } from "@/lib/exercise-utils";
import { searchPaperlessByPath } from "@/lib/paperless-utils";
import type { PrintStampInfo } from "@/lib/pdf-utils";
import { ZenLessonHeader } from "./ZenLessonHeader";
import { ZenLessonSidebar } from "./ZenLessonSidebar";
import { ZenLessonPdfViewer } from "./ZenLessonPdfViewer";
import { useZenLessonState, handleLessonKeyDown, type ZenLessonState } from "./useZenLessonState";
import { ZenExerciseAssign } from "@/components/zen/ZenExerciseAssign";
import { ZenLessonHelp } from "./ZenLessonHelp";
import { useAnnotations } from "@/hooks/useAnnotations";
import { saveAnnotatedPdf } from "@/lib/pdf-annotation-save";
import type { Session } from "@/types";

interface ZenLessonModeProps {
  session: Session;
  onClose: () => void;
}

export function ZenLessonMode({ session, onClose }: ZenLessonModeProps) {
  const state = useZenLessonState(session.exercises || []);
  const {
    exercises, exerciseCursor, selectedExercise,
    pdfData, pdfLoading, pdfLoadingMessage, pdfError, pageNumbers,
    currentPage, setCurrentPage, totalPages, setTotalPages,
    zoom, setZoom,
    showAnswerKey,
    answerPdfData, answerPageNumbers, answerLoading, answerError,
    answerCurrentPage, setAnswerCurrentPage, answerTotalPages, setAnswerTotalPages,
    answerZoom, setAnswerZoom,
    answerAvailable, answerCacheRef,
  } = state;

  const stamp = useMemo<PrintStampInfo>(() => ({
    location: session.location,
    schoolStudentId: session.school_student_id,
    studentName: session.student_name,
    sessionDate: session.session_date,
    sessionTime: session.time_slot,
  }), [session.location, session.school_student_id, session.student_name, session.session_date, session.time_slot]);

  // Use ref to avoid re-registering keyboard handler on every state change
  const stateRef = useRef<ZenLessonState>(state);
  stateRef.current = state;
  const stampRef = useRef(stamp);
  stampRef.current = stamp;

  const [exerciseModalType, setExerciseModalType] = useState<"CW" | "HW" | null>(null);
  const handleEditExercises = useCallback((type: "CW" | "HW") => {
    setExerciseModalType(type);
  }, []);
  const handleEditExercisesRef = useRef(handleEditExercises);
  handleEditExercisesRef.current = handleEditExercises;
  const exerciseModalTypeRef = useRef(exerciseModalType);
  exerciseModalTypeRef.current = exerciseModalType;

  const [showHelp, setShowHelp] = useState(false);
  const showHelpRef = useRef(showHelp);
  showHelpRef.current = showHelp;

  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const showExitConfirmRef = useRef(showExitConfirm);
  showExitConfirmRef.current = showExitConfirm;

  // Annotations
  const annotations = useAnnotations(`zen-lesson-${session.id}`);
  const [, setStrokeVersion] = useState(0);
  const bumpStrokes = useCallback(() => setStrokeVersion(v => v + 1), []);

  const handleUndo = useCallback(() => {
    if (!selectedExercise) return;
    const pageIdx = currentPage - 1;
    annotations.undoLastStroke(selectedExercise.id, pageIdx);
    bumpStrokes();
  }, [selectedExercise, currentPage, annotations, bumpStrokes]);

  const handleRedo = useCallback(() => {
    if (!selectedExercise) return;
    const pageIdx = currentPage - 1;
    annotations.redoLastStroke(selectedExercise.id, pageIdx);
    bumpStrokes();
  }, [selectedExercise, currentPage, annotations, bumpStrokes]);

  const handleSaveAnnotated = useCallback(async () => {
    if (!selectedExercise || !pdfData) return;
    try {
      const ann = annotations.getAnnotations(selectedExercise.id);
      const blob = await saveAnnotatedPdf(pdfData, pageNumbers, stamp, ann);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `annotated-${getDisplayName(selectedExercise.pdf_name)}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (err) {
      console.error("Failed to save annotated PDF:", err);
    }
  }, [selectedExercise, pdfData, pageNumbers, stamp, annotations]);

  const handleExitAttempt = useCallback(() => {
    if (annotations.hasAnyAnnotations()) {
      setShowExitConfirm(true);
    } else {
      onClose();
    }
  }, [annotations, onClose]);

  const handleUndoRef = useRef(handleUndo);
  handleUndoRef.current = handleUndo;
  const handleRedoRef = useRef(handleRedo);
  handleRedoRef.current = handleRedo;
  const handleSaveAnnotatedRef = useRef(handleSaveAnnotated);
  handleSaveAnnotatedRef.current = handleSaveAnnotated;
  const handleExitAttemptRef = useRef(handleExitAttempt);
  handleExitAttemptRef.current = handleExitAttempt;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA") return;
      // Skip when exercise assign modal is open — let it handle its own keys
      if (exerciseModalTypeRef.current) return;

      // Exit confirm dialog — keyboard driven
      if (showExitConfirmRef.current) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.key === "1") {
          handleSaveAnnotatedRef.current().then(() => {
            annotations.clearStorage();
            onClose();
          });
        } else if (e.key === "2") {
          annotations.clearAll();
          annotations.clearStorage();
          onClose();
        } else {
          setShowExitConfirm(false);
        }
        return;
      }

      // Help overlay — any key dismisses
      if (showHelpRef.current) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setShowHelp(false);
        return;
      }

      // Help menu
      if (e.key === "?") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setShowHelp(true);
        return;
      }

      handleLessonKeyDown(e, stateRef.current, {
        stamp: stampRef.current,
        onClose,
        onExitAttempt: handleExitAttemptRef.current,
        paperlessSearch: searchPaperlessByPath,
        onEditExercises: handleEditExercisesRef.current,
        onUndo: handleUndoRef.current,
        onRedo: handleRedoRef.current,
        onSaveAnnotated: handleSaveAnnotatedRef.current,
      });
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [session, onClose]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "var(--zen-bg)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <ZenLessonHeader session={session} mode="single" onClose={onClose} />

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div
          style={{
            width: "240px",
            minWidth: "200px",
            borderRight: "1px solid var(--zen-border)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <ZenLessonSidebar
            exercises={exercises}
            selectedIndex={exerciseCursor}
            onSelect={state.setExerciseCursor}
            answerAvailable={answerAvailable}
            onEditExercises={handleEditExercises}
          />
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "row", overflow: "hidden" }}>
          <ZenLessonPdfViewer
            pdfData={pdfData}
            pageNumbers={pageNumbers}
            isLoading={pdfLoading}
            loadingMessage={pdfLoadingMessage}
            error={pdfError}
            exerciseId={selectedExercise?.id}
            stamp={stamp}
            currentPage={currentPage}
            onCurrentPageChange={setCurrentPage}
            totalPages={totalPages}
            onTotalPagesChange={setTotalPages}
            zoom={zoom}
            onZoomChange={setZoom}
            drawingEnabled={state.drawingEnabled}
            isDrawing={state.isDrawing}
            isErasing={state.isErasing}
            penColor={state.penColor}
            penSize={state.penSize}
            annotationHidden={state.annotationHidden}
            pageStrokes={selectedExercise ? (pageIdx) => annotations.getAnnotations(selectedExercise.id)[pageIdx] || [] : undefined}
            onStrokesChange={selectedExercise ? (pageIdx, strokes) => { annotations.setPageStrokes(selectedExercise.id, pageIdx, strokes); bumpStrokes(); } : undefined}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onClearPage={selectedExercise ? (pageIdx) => { annotations.clearPage(selectedExercise.id, pageIdx); bumpStrokes(); } : undefined}
            onPenColorChange={state.setPenColor}
            onPenSizeChange={state.setPenSize}
            hasAnnotationsForExercise={selectedExercise ? annotations.hasAnnotations(selectedExercise.id) : false}
            onSaveAnnotated={handleSaveAnnotated}
          />

          {showAnswerKey && (
            <>
              <div style={{ width: "1px", backgroundColor: "var(--zen-accent)", flexShrink: 0 }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div
                  style={{
                    padding: "4px 8px",
                    borderBottom: "1px solid var(--zen-border)",
                    fontSize: "10px",
                    color: "var(--zen-accent)",
                    fontWeight: "bold",
                    textShadow: "var(--zen-glow)",
                    flexShrink: 0,
                  }}
                >
                  ANSWER KEY
                  {selectedExercise && answerCacheRef.current.get(selectedExercise.pdf_name) && (
                    <span style={{ color: "var(--zen-dim)", fontWeight: "normal", marginLeft: "8px" }}>
                      {getDisplayName(answerCacheRef.current.get(selectedExercise.pdf_name)!.path)}
                    </span>
                  )}
                </div>
                <ZenLessonPdfViewer
                  pdfData={answerPdfData}
                  pageNumbers={answerPageNumbers}
                  isLoading={answerLoading}
                  loadingMessage="Loading answer..."
                  error={answerError}
                  currentPage={answerCurrentPage}
                  onCurrentPageChange={setAnswerCurrentPage}
                  totalPages={answerTotalPages}
                  onTotalPagesChange={setAnswerTotalPages}
                  zoom={answerZoom}
                  onZoomChange={setAnswerZoom}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <div
        style={{
          padding: "4px 12px",
          borderTop: "1px solid var(--zen-border)",
          fontSize: "10px",
          color: "var(--zen-dim)",
          display: "flex",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span>
          <span style={{ color: "var(--zen-fg)" }}>j/k</span> exercises{" "}
          <span style={{ color: "var(--zen-fg)" }}>[/]</span> pages{" "}
          <span style={{ color: "var(--zen-fg)" }}>+/-</span> zoom{" "}
          <span style={{ color: "var(--zen-fg)" }}>f</span>=fit{" "}
          <span style={{ color: "var(--zen-fg)" }}>a</span>=answer{" "}
          <span style={{ color: "var(--zen-fg)" }}>c</span>=classwork{" "}
          <span style={{ color: "var(--zen-fg)" }}>h</span>=homework{" "}
          <span style={{ color: "var(--zen-fg)" }}>o</span>=open{" "}
          <span style={{ color: "var(--zen-fg)" }}>p</span>=print{" "}
          <span style={{ color: "var(--zen-fg)" }}>d</span>=draw{" "}
          <span style={{ color: "var(--zen-fg)" }}>?</span>=help{" "}
          <span style={{ color: "var(--zen-fg)" }}>Esc</span>=close
        </span>
        {selectedExercise && (
          <span style={{ color: "var(--zen-fg)" }}>
            {getDisplayName(selectedExercise.pdf_name)}
          </span>
        )}
      </div>

      {exerciseModalType && (
        <ZenExerciseAssign
          key={exerciseModalType}
          session={session}
          exerciseType={exerciseModalType}
          onClose={() => setExerciseModalType(null)}
        />
      )}

      {showHelp && (
        <ZenLessonHelp mode="single" onClose={() => setShowHelp(false)} />
      )}

      {showExitConfirm && (
        <div
          onClick={() => setShowExitConfirm(false)}
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div onClick={(ev) => ev.stopPropagation()} style={{ backgroundColor: "var(--zen-bg)", border: "1px solid var(--zen-accent)", padding: "16px 24px" }}>
            <div style={{ color: "var(--zen-accent)", fontWeight: "bold", fontSize: "12px", marginBottom: "12px", textShadow: "var(--zen-glow)" }}>
              UNSAVED ANNOTATIONS
            </div>
            <div style={{ color: "var(--zen-dim)", fontSize: "11px", marginBottom: "12px" }}>
              You have unsaved annotations. What would you like to do?
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <button onClick={() => { handleSaveAnnotated().then(() => { annotations.clearStorage(); onClose(); }); }} style={{ background: "none", border: "1px solid var(--zen-border)", color: "var(--zen-fg)", cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "6px 16px" }}>
                <span style={{ color: "var(--zen-accent)" }}>1</span> Download &amp; Exit
              </button>
              <button onClick={() => { annotations.clearAll(); annotations.clearStorage(); onClose(); }} style={{ background: "none", border: "1px solid var(--zen-border)", color: "var(--zen-fg)", cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "6px 16px" }}>
                <span style={{ color: "var(--zen-accent)" }}>2</span> Exit
              </button>
            </div>
            <div style={{ color: "var(--zen-dim)", fontSize: "10px", marginTop: "8px" }}>
              Press 1, 2, or Esc to cancel
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
