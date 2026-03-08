"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { loadExercisePdf } from "@/lib/lesson-pdf-loader";
import { searchAnswerFile, type AnswerSearchResult } from "@/lib/answer-file-utils";
import { getPageNumbers, type BulkPrintExercise } from "@/lib/bulk-pdf-helpers";
import { parseExerciseRemarks, getDisplayName } from "@/lib/exercise-utils";
import { openFileFromPathWithFallback, printFileFromPathWithFallback } from "@/lib/file-system";
import type { PrintStampInfo } from "@/lib/pdf-utils";
import { setZenStatus } from "@/components/zen/ZenStatusBar";
import { ZenLessonHeader } from "./ZenLessonHeader";
import { ZenLessonSidebar } from "./ZenLessonSidebar";
import { ZenLessonPdfViewer } from "./ZenLessonPdfViewer";
import type { Session, SessionExercise } from "@/types";

interface ZenLessonModeProps {
  session: Session;
  onClose: () => void;
}

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

export function ZenLessonMode({ session, onClose }: ZenLessonModeProps) {
  // Exercise list: CW first, then HW
  const exercises = useMemo(() => {
    const all = session.exercises || [];
    const cw = all.filter((e) => e.exercise_type === "CW" || e.exercise_type === "Classwork");
    const hw = all.filter((e) => e.exercise_type === "HW" || e.exercise_type === "Homework");
    return [...cw, ...hw];
  }, [session.exercises]);

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

  // Answer key state (Phase 2)
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [answerPdfData, setAnswerPdfData] = useState<ArrayBuffer | null>(null);
  const [answerPageNumbers, setAnswerPageNumbers] = useState<number[]>([]);
  const [answerLoading, setAnswerLoading] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [answerCurrentPage, setAnswerCurrentPage] = useState(1);
  const [answerTotalPages, setAnswerTotalPages] = useState(0);
  const [answerZoom, setAnswerZoom] = useState(100);

  // Answer search cache: pdf_name → result or null
  const answerCacheRef = useRef<Map<string, AnswerSearchResult | null>>(new Map());
  const [answerAvailable, setAnswerAvailable] = useState<Map<number, boolean | null>>(new Map());

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

    // Check cache
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
        // LRU eviction
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

  // Search for answer key when exercise changes
  useEffect(() => {
    if (!selectedExercise) return;

    const pdfName = selectedExercise.pdf_name;

    // Check explicit answer assignment first
    if (selectedExercise.answer_pdf_name) {
      const result: AnswerSearchResult = {
        path: selectedExercise.answer_pdf_name,
        source: "local",
      };
      answerCacheRef.current.set(pdfName, result);
      setAnswerAvailable((prev) => new Map(prev).set(selectedExercise.id, true));
      return;
    }

    // Check cache
    if (answerCacheRef.current.has(pdfName)) {
      const cached = answerCacheRef.current.get(pdfName);
      setAnswerAvailable((prev) => new Map(prev).set(selectedExercise.id, cached != null));
      return;
    }

    // Mark as searching
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

    // Determine answer page numbers
    let ansPages: number[] = [];
    if (selectedExercise.answer_page_start) {
      const start = selectedExercise.answer_page_start;
      const end = selectedExercise.answer_page_end || start;
      ansPages = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }
    setAnswerPageNumbers(ansPages);
    setAnswerCurrentPage(1);

    // Check cache
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

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA") return;

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          e.stopImmediatePropagation();
          setExerciseCursor((prev) => Math.min(prev + 1, exercises.length - 1));
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          e.stopImmediatePropagation();
          setExerciseCursor((prev) => Math.max(prev - 1, 0));
          break;
        case "]":
        case "ArrowRight":
          e.preventDefault();
          e.stopImmediatePropagation();
          setCurrentPage((p) => Math.min(p + 1, totalPages));
          break;
        case "[":
        case "ArrowLeft":
          e.preventDefault();
          e.stopImmediatePropagation();
          setCurrentPage((p) => Math.max(p - 1, 1));
          break;
        case "+":
        case "=":
          e.preventDefault();
          e.stopImmediatePropagation();
          setZoom((z) => Math.min(z + 25, 200));
          break;
        case "-":
          e.preventDefault();
          e.stopImmediatePropagation();
          setZoom((z) => Math.max(z - 25, 25));
          break;
        case "f":
          e.preventDefault();
          e.stopImmediatePropagation();
          // Fit-to-width handled by viewer's internal auto-fit
          setZoom(100); // Reset zoom triggers auto-fit
          break;
        case "a":
          e.preventDefault();
          e.stopImmediatePropagation();
          if (selectedExercise && answerAvailable.get(selectedExercise.id) === true) {
            setShowAnswerKey((prev) => !prev);
            setZenStatus(showAnswerKey ? "Answer key hidden" : "Answer key shown", "info");
          } else if (selectedExercise && answerAvailable.get(selectedExercise.id) === false) {
            setZenStatus("No answer file found", "warning");
          }
          break;
        case "o":
          e.preventDefault();
          e.stopImmediatePropagation();
          if (selectedExercise) {
            openFileFromPathWithFallback(selectedExercise.pdf_name);
          }
          break;
        case "p":
          e.preventDefault();
          e.stopImmediatePropagation();
          if (selectedExercise) {
            const { complexPages } = parseExerciseRemarks(selectedExercise.remarks || null);
            const stamp: PrintStampInfo = {
              studentName: session.student_name,
              sessionDate: session.session_date,
            };
            printFileFromPathWithFallback(
              selectedExercise.pdf_name,
              selectedExercise.page_start,
              selectedExercise.page_end,
              complexPages || undefined,
              stamp
            );
          }
          break;
        case "Escape":
          e.preventDefault();
          e.stopImmediatePropagation();
          onClose();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [exercises, currentPage, totalPages, selectedExercise, showAnswerKey, answerAvailable, session, onClose]);

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
      <ZenLessonHeader session={session} mode="single" onClose={onClose} />

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Sidebar */}
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
            onSelect={setExerciseCursor}
            answerAvailable={answerAvailable}
          />
        </div>

        {/* PDF viewer area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <ZenLessonPdfViewer
            pdfData={pdfData}
            pageNumbers={pageNumbers}
            isLoading={pdfLoading}
            loadingMessage={pdfLoadingMessage}
            error={pdfError}
            exerciseId={selectedExercise?.id}
            currentPage={currentPage}
            onCurrentPageChange={setCurrentPage}
            totalPages={totalPages}
            onTotalPagesChange={setTotalPages}
            zoom={zoom}
            onZoomChange={setZoom}
          />

          {/* Answer key viewer (Phase 2) */}
          {showAnswerKey && (
            <>
              <div
                style={{
                  padding: "4px 8px",
                  borderTop: "1px solid var(--zen-accent)",
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
          <span style={{ color: "var(--zen-fg)" }}>j/k</span> exercises{" "}
          <span style={{ color: "var(--zen-fg)" }}>[/]</span> pages{" "}
          <span style={{ color: "var(--zen-fg)" }}>+/-</span> zoom{" "}
          <span style={{ color: "var(--zen-fg)" }}>f</span>=fit{" "}
          <span style={{ color: "var(--zen-fg)" }}>a</span>=answer{" "}
          <span style={{ color: "var(--zen-fg)" }}>o</span>=open{" "}
          <span style={{ color: "var(--zen-fg)" }}>p</span>=print{" "}
          <span style={{ color: "var(--zen-fg)" }}>Esc</span>=close
        </span>
        {selectedExercise && (
          <span style={{ color: "var(--zen-fg)" }}>
            {getDisplayName(selectedExercise.pdf_name)}
          </span>
        )}
      </div>
    </div>
  );
}
