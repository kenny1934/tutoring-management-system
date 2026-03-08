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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA") return;
      // Skip when exercise assign modal is open — let it handle its own keys
      if (exerciseModalTypeRef.current) return;

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

      handleLessonKeyDown(e, stateRef.current, { stamp: stampRef.current, onClose, paperlessSearch: searchPaperlessByPath, onEditExercises: handleEditExercisesRef.current });
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
          session={session}
          exerciseType={exerciseModalType}
          onClose={() => setExerciseModalType(null)}
        />
      )}

      {showHelp && (
        <ZenLessonHelp mode="single" onClose={() => setShowHelp(false)} />
      )}
    </div>
  );
}
