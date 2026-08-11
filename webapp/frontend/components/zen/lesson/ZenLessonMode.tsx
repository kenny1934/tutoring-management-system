"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { getExerciseDisplayName, toEmbedUrl } from "@/lib/exercise-utils";
import { searchPaperlessByPath } from "@/lib/paperless-utils";
import type { PrintStampInfo } from "@/lib/pdf-utils";
import { ZenLessonHeader } from "./ZenLessonHeader";
import { ZenLessonSidebar } from "./ZenLessonSidebar";
import { ZenLessonPdfViewer } from "./ZenLessonPdfViewer";
import { useZenLessonState, handleLessonKeyDown, type ZenLessonState } from "./useZenLessonState";
import { ZenExerciseAssign } from "@/components/zen/ZenExerciseAssign";
import { ZenLessonHelp } from "./ZenLessonHelp";
import { ZenExitConfirmDialog } from "./ZenExitConfirmDialog";
import { ZenHomeworkCheck } from "./ZenHomeworkCheck";
import { statusForKey } from "./zen-homework";
import { setZenStatus } from "@/components/zen/ZenStatusBar";
import { useAnnotations } from "@/hooks/useAnnotations";
import { useZenAnnotationHandlers } from "./useZenAnnotationHandlers";
import { useHomeworkToCheck } from "@/lib/hooks";
import { useHomeworkMarked } from "@/components/homework/useHomeworkMarked";
import { homeworkAPI } from "@/lib/api";
import type { HomeworkCompletion, HomeworkStatus, Session } from "@/types";

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

  // --- Homework carried in from earlier lessons ---
  // Fetched rather than read off the session: this one arrives from a list,
  // which carries no homework of its own.
  const homeworkSessionIds = useMemo(() => [session.id], [session.id]);
  const { bySession: homeworkBySession } = useHomeworkToCheck(homeworkSessionIds);
  const applyHomeworkMark = useHomeworkMarked();

  const homework = useMemo(
    () => homeworkBySession.get(session.id) ?? [],
    [homeworkBySession, session.id]
  );

  const [homeworkOpen, setHomeworkOpen] = useState(false);
  const [homeworkCursor, setHomeworkCursor] = useState(0);
  const [homeworkSaving, setHomeworkSaving] = useState(false);

  const markHomework = useCallback(async (status: HomeworkStatus) => {
    const target = homework[homeworkCursor];
    if (!target) return;

    setHomeworkSaving(true);
    try {
      const saved = await homeworkAPI.mark(session.id, target.session_exercise_id, {
        completion_status: status,
      });
      applyHomeworkMark(saved);
      setZenStatus(`${getExerciseDisplayName(saved)}: ${status.toLowerCase()}`, "success");
      // Move on, so marking a stack is one key per item.
      setHomeworkCursor((prev) => Math.min(prev + 1, homework.length - 1));
    } catch {
      setZenStatus("Could not save homework check", "error");
    } finally {
      setHomeworkSaving(false);
    }
  }, [homework, homeworkCursor, session.id, applyHomeworkMark]);

  // Mirrored once, like every other handler here: the keyboard listener is
  // registered a single time and must not tear down as homework changes.
  const homeworkRef = useRef<HomeworkCompletion[]>(homework);
  homeworkRef.current = homework;
  const homeworkOpenRef = useRef(homeworkOpen);
  homeworkOpenRef.current = homeworkOpen;
  const markHomeworkRef = useRef(markHomework);
  markHomeworkRef.current = markHomework;

  // Annotations
  const annotations = useAnnotations(`zen-lesson-${session.id}`);
  const ann = useZenAnnotationHandlers({
    annotations, selectedExercise, exercises, pdfCacheRef: state.pdfCacheRef,
    currentPage, pdfData, pageNumbers, stamp, onClose,
  });

  // Warn on tab close with unsaved annotations
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (annotations.hasAnyAnnotations()) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [annotations]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA") return;
      // Skip when exercise assign modal is open — let it handle its own keys
      if (exerciseModalTypeRef.current) return;

      // Exit confirm dialog — keyboard driven
      if (ann.refs.showExitConfirmRef.current) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.key === "1") {
          ann.refs.handleSaveAllAnnotatedRef.current().then(() => {
            annotations.clearStorage();
            onClose();
          });
        } else if (e.key === "2") {
          ann.refs.handleSaveAnnotatedRef.current().then(() => {
            annotations.clearStorage();
            onClose();
          });
        } else if (e.key === "3") {
          annotations.clearAll();
          annotations.clearStorage();
          onClose();
        } else {
          ann.setShowExitConfirm(false);
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

      // Homework marking — cursor keys move, 0-4 mark, anything else closes
      if (homeworkOpenRef.current) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const items = homeworkRef.current;

        const status = statusForKey(e.key);
        if (e.key === "j" || e.key === "ArrowDown") {
          setHomeworkCursor((prev) => Math.min(prev + 1, items.length - 1));
        } else if (e.key === "k" || e.key === "ArrowUp") {
          setHomeworkCursor((prev) => Math.max(prev - 1, 0));
        } else if (status) {
          void markHomeworkRef.current(status);
        } else {
          setHomeworkOpen(false);
        }
        return;
      }

      // Mark homework (Shift+H), next to lowercase h for editing it
      if (e.key === "H" && e.shiftKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (homeworkRef.current.length === 0) {
          setZenStatus("No homework to check for this student", "info");
        } else {
          setHomeworkCursor(0);
          setHomeworkOpen(true);
        }
        return;
      }

      handleLessonKeyDown(e, stateRef.current, {
        stamp: stampRef.current,
        onClose,
        onExitAttempt: ann.refs.handleExitAttemptRef.current,
        paperlessSearch: searchPaperlessByPath,
        onEditExercises: handleEditExercisesRef.current,
        onUndo: ann.refs.handleUndoRef.current,
        onRedo: ann.refs.handleRedoRef.current,
        onSaveAnnotated: ann.refs.handleSaveAnnotatedRef.current,
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
            homework={homework}
            onCheckHomework={homework.length > 0 ? () => { setHomeworkCursor(0); setHomeworkOpen(true); } : undefined}
          />
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "row", overflow: "hidden" }}>
          {selectedExercise?.url && !selectedExercise?.pdf_name ? (
            /* URL exercise: iframe embed or open-in-new-tab */
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: "var(--zen-bg)" }}>
              {(() => {
                const embedUrl = toEmbedUrl(selectedExercise.url);
                if (embedUrl) {
                  return (
                    <iframe
                      src={embedUrl}
                      style={{ width: "100%", flex: 1, border: "none" }}
                      allowFullScreen
                      title={getExerciseDisplayName(selectedExercise)}
                    />
                  );
                }
                return (
                  <div style={{ textAlign: "center" }}>
                    <p style={{ color: "var(--zen-dim)", marginBottom: "12px" }}>
                      This resource cannot be embedded directly.
                    </p>
                    <a
                      href={selectedExercise.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--zen-accent)", textDecoration: "underline" }}
                    >
                      Open in new tab
                    </a>
                  </div>
                );
              })()}
            </div>
          ) : (
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
            pageStrokes={ann.pageStrokesFn}
            onStrokesChange={ann.onStrokesChange}
            onUndo={ann.handleUndo}
            onRedo={ann.handleRedo}
            onClearPage={ann.onClearPage}
            onPenColorChange={state.setPenColor}
            onPenSizeChange={state.setPenSize}
            hasAnnotationsForExercise={ann.hasAnnotationsForExercise}
            onSaveAnnotated={ann.handleSaveAnnotated}
          />
          )}

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
          <span style={{ color: "var(--zen-fg)" }}>H</span>=check{" "}
          <span style={{ color: "var(--zen-fg)" }}>o</span>=open{" "}
          <span style={{ color: "var(--zen-fg)" }}>p</span>=print{" "}
          <span style={{ color: "var(--zen-fg)" }}>d</span>=draw{" "}
          <span style={{ color: "var(--zen-fg)" }}>?</span>=help{" "}
          <span style={{ color: "var(--zen-fg)" }}>Esc</span>=close
        </span>
        {selectedExercise && (
          <span style={{ color: "var(--zen-fg)" }}>
            {getExerciseDisplayName(selectedExercise)}
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

      {homeworkOpen && (
        <ZenHomeworkCheck
          studentName={session.student_name || "Unknown"}
          items={homework}
          cursor={homeworkCursor}
          saving={homeworkSaving}
        />
      )}

      {ann.showExitConfirm && (
        <ZenExitConfirmDialog
          onSaveAllAndExit={() => { ann.handleSaveAllAnnotated().then(() => { annotations.clearStorage(); onClose(); }); }}
          onSaveAndExit={() => { ann.handleSaveAnnotated().then(() => { annotations.clearStorage(); onClose(); }); }}
          onDiscardAndExit={() => { annotations.clearAll(); annotations.clearStorage(); onClose(); }}
          onCancel={() => ann.setShowExitConfirm(false)}
        />
      )}
    </div>
  );
}
