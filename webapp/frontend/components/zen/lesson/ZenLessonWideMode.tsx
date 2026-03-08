"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { getDisplayName } from "@/lib/exercise-utils";
import { searchPaperlessByPath } from "@/lib/paperless-utils";
import type { PrintStampInfo } from "@/lib/pdf-utils";
import { ZenLessonStudentTabs } from "./ZenLessonStudentTabs";
import { ZenLessonSidebar } from "./ZenLessonSidebar";
import { ZenLessonPdfViewer } from "./ZenLessonPdfViewer";
import { useZenLessonState, handleLessonKeyDown, type ZenLessonState } from "./useZenLessonState";
import type { Session } from "@/types";

interface ZenLessonWideModeProps {
  timeSlot: string;
  sessions: Session[];
  onClose: () => void;
}

export function ZenLessonWideMode({ timeSlot, sessions, onClose }: ZenLessonWideModeProps) {
  const [studentIndex, setStudentIndex] = useState(0);
  const activeSession = sessions[studentIndex] || sessions[0];

  const state = useZenLessonState(activeSession?.exercises || [], studentIndex);
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
    location: activeSession?.location,
    schoolStudentId: activeSession?.school_student_id,
    studentName: activeSession?.student_name,
    sessionDate: activeSession?.session_date,
    sessionTime: activeSession?.time_slot,
  }), [activeSession?.location, activeSession?.school_student_id, activeSession?.student_name, activeSession?.session_date, activeSession?.time_slot]);

  // Use refs to avoid re-registering keyboard handler on every state change
  const stateRef = useRef<ZenLessonState>(state);
  stateRef.current = state;
  const stampRef = useRef(stamp);
  stampRef.current = stamp;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA") return;

      // Tab/Shift+Tab for student switching
      if (e.key === "Tab") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.shiftKey) {
          setStudentIndex((prev) => Math.max(prev - 1, 0));
        } else {
          setStudentIndex((prev) => Math.min(prev + 1, sessions.length - 1));
        }
        return;
      }

      // Number keys for direct student jump
      if (e.key >= "1" && e.key <= "9" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const idx = parseInt(e.key) - 1;
        if (idx < sessions.length) {
          e.preventDefault();
          e.stopImmediatePropagation();
          setStudentIndex(idx);
          return;
        }
      }

      handleLessonKeyDown(e, stateRef.current, {
        stamp: stampRef.current,
        onClose,
        paperlessSearch: searchPaperlessByPath,
      });
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [sessions, onClose]);

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
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          borderBottom: "1px solid var(--zen-border)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ color: "var(--zen-accent)", fontWeight: "bold", fontSize: "12px", textShadow: "var(--zen-glow)" }}>
            LESSON WIDE
          </span>
          <span style={{ color: "var(--zen-fg)", fontSize: "11px" }}>
            {timeSlot}
          </span>
          <span style={{ color: "var(--zen-dim)", fontSize: "11px" }}>
            {sessions.length} student{sessions.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "1px solid var(--zen-border)",
            color: "var(--zen-dim)",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "10px",
            padding: "2px 8px",
          }}
        >
          [Esc] Close
        </button>
      </div>

      {/* Student tabs */}
      <ZenLessonStudentTabs
        sessions={sessions}
        activeIndex={studentIndex}
        onSelect={setStudentIndex}
      />

      {/* Main content */}
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
          <div
            style={{
              padding: "4px 8px",
              borderBottom: "1px solid var(--zen-border)",
              fontSize: "11px",
              color: "var(--zen-fg)",
              fontWeight: "bold",
              flexShrink: 0,
            }}
          >
            {activeSession?.student_name || "Unknown"}
            {activeSession?.grade && (
              <span style={{ color: "var(--zen-dim)", fontWeight: "normal", marginLeft: "6px" }}>
                {activeSession.grade}{activeSession.lang_stream || ""}
              </span>
            )}
          </div>
          <ZenLessonSidebar
            exercises={exercises}
            selectedIndex={exerciseCursor}
            onSelect={state.setExerciseCursor}
            answerAvailable={answerAvailable}
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

      {/* Footer */}
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
          <span style={{ color: "var(--zen-fg)" }}>Tab</span> student{" "}
          <span style={{ color: "var(--zen-fg)" }}>j/k</span> exercises{" "}
          <span style={{ color: "var(--zen-fg)" }}>[/]</span> pages{" "}
          <span style={{ color: "var(--zen-fg)" }}>+/-</span> zoom{" "}
          <span style={{ color: "var(--zen-fg)" }}>a</span>=answer{" "}
          <span style={{ color: "var(--zen-fg)" }}>o</span>=open{" "}
          <span style={{ color: "var(--zen-fg)" }}>Esc</span>=close
        </span>
        {activeSession && (
          <span style={{ color: "var(--zen-fg)" }}>
            {activeSession.student_name}
            {selectedExercise ? ` — ${getDisplayName(selectedExercise.pdf_name)}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
