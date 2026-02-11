"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ArrowLeft, Calendar, Clock, MapPin, Printer, Keyboard,
  CheckCircle2, HandCoins, Maximize2, Minimize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getGradeColor } from "@/lib/constants";
import { getDisplayName, parseExerciseRemarks } from "@/lib/exercise-utils";
import { getPageNumbers, type BulkPrintExercise } from "@/lib/bulk-pdf-helpers";
import { loadExercisePdf } from "@/lib/lesson-pdf-loader";
import { printFileFromPathWithFallback } from "@/lib/file-system";
import { searchPaperlessByPath } from "@/lib/paperless-utils";
import { formatShortDate } from "@/lib/formatters";
import { LessonExerciseSidebar } from "./LessonExerciseSidebar";
import { PdfPageViewer } from "./PdfPageViewer";
import { ExerciseModal } from "@/components/sessions/ExerciseModal";
import { motion, AnimatePresence } from "framer-motion";
import type { Session, SessionExercise } from "@/types";

interface LessonModeProps {
  session: Session;
  onExit: () => void;
  onSessionDataChange: () => void;
  isReadOnly?: boolean;
}

export function LessonMode({
  session,
  onExit,
  onSessionDataChange,
  isReadOnly,
}: LessonModeProps) {
  const currentSession = session;
  const previousSession = session.previous_session ?? null;

  // Exercise state
  const [selectedExercise, setSelectedExercise] = useState<SessionExercise | null>(null);

  // PDF state
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pageNumbers, setPageNumbers] = useState<number[]>([]);

  // Exercise modal
  const [exerciseModalSession, setExerciseModalSession] = useState<Session | null>(null);
  const [exerciseModalType, setExerciseModalType] = useState<"CW" | "HW" | null>(null);

  // Sidebar width (resizable)
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const isResizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  // Focus mode (hides sidebar + header, hover to reveal)
  const [focusMode, setFocusMode] = useState(false);
  const [hoverHeader, setHoverHeader] = useState(false);
  const [hoverSidebar, setHoverSidebar] = useState(false);

  // All exercises from both sessions (for keyboard navigation)
  const allExercises = useMemo(() => {
    const exercises: SessionExercise[] = [];
    if (currentSession?.exercises) exercises.push(...currentSession.exercises);
    if (previousSession?.exercises) exercises.push(...previousSession.exercises);
    return exercises;
  }, [currentSession, previousSession]);

  // Auto-select first exercise on mount / session change
  useEffect(() => {
    if (allExercises.length > 0 && !selectedExercise) {
      setSelectedExercise(allExercises[0]);
    }
  }, [allExercises, selectedExercise]);

  // Load PDF when exercise changes
  useEffect(() => {
    if (!selectedExercise || !selectedExercise.pdf_name) {
      setPdfData(null);
      setPageNumbers([]);
      setPdfError(selectedExercise ? "No file assigned to this exercise" : null);
      return;
    }

    let cancelled = false;

    async function load() {
      setPdfLoading(true);
      setPdfError(null);

      const result = await loadExercisePdf(selectedExercise!.pdf_name);

      if (cancelled) return;

      if ("data" in result) {
        setPdfData(result.data);
        // Compute page numbers
        const { complexPages } = parseExerciseRemarks(selectedExercise!.remarks);
        const exercise: BulkPrintExercise = {
          pdf_name: selectedExercise!.pdf_name,
          page_start: selectedExercise!.page_start,
          page_end: selectedExercise!.page_end,
          complex_pages: complexPages || undefined,
        };
        setPageNumbers(getPageNumbers(exercise, "[Lesson]"));
      } else {
        setPdfData(null);
        setPageNumbers([]);
        setPdfError(
          result.error === "no_file"
            ? "No file assigned"
            : result.error === "fetch_failed"
            ? "Failed to download PDF"
            : "File not found"
        );
      }

      setPdfLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [selectedExercise]);

  // Handle exercise selection
  const handleExerciseSelect = useCallback((exercise: SessionExercise) => {
    setSelectedExercise(exercise);
  }, []);

  // Handle edit exercises
  const handleEditExercises = useCallback((s: Session, type: "CW" | "HW") => {
    setExerciseModalSession(s);
    setExerciseModalType(type);
  }, []);

  // Handle exercise modal close
  const handleExerciseModalClose = useCallback(() => {
    setExerciseModalSession(null);
    setExerciseModalType(null);
    onSessionDataChange();
  }, [onSessionDataChange]);

  // Handle retry PDF load
  const handleRetry = useCallback(() => {
    if (selectedExercise) {
      // Force re-trigger by toggling
      const ex = selectedExercise;
      setSelectedExercise(null);
      setTimeout(() => setSelectedExercise(ex), 0);
    }
  }, [selectedExercise]);

  // Print current exercise
  const handlePrint = useCallback(async () => {
    if (!selectedExercise?.pdf_name) return;
    const { complexPages } = parseExerciseRemarks(selectedExercise.remarks);
    await printFileFromPathWithFallback(
      selectedExercise.pdf_name,
      selectedExercise.page_start,
      selectedExercise.page_end,
      complexPages || undefined,
      undefined,
      searchPaperlessByPath
    );
  }, [selectedExercise]);

  // Keyboard shortcuts
  useEffect(() => {
    if (exerciseModalType) return; // Don't capture when modal is open

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          if (focusMode) {
            setFocusMode(false);
            setHoverHeader(false);
            setHoverSidebar(false);
          } else {
            onExit();
          }
          break;
        case "f":
          e.preventDefault();
          setFocusMode(fm => {
            if (fm) { setHoverHeader(false); setHoverSidebar(false); }
            return !fm;
          });
          break;
        case "j":
        case "ArrowDown": {
          e.preventDefault();
          const currentIdx = allExercises.findIndex(ex => ex.id === selectedExercise?.id);
          if (currentIdx < allExercises.length - 1) {
            setSelectedExercise(allExercises[currentIdx + 1]);
          }
          break;
        }
        case "k":
        case "ArrowUp": {
          e.preventDefault();
          const currentIdx = allExercises.findIndex(ex => ex.id === selectedExercise?.id);
          if (currentIdx > 0) {
            setSelectedExercise(allExercises[currentIdx - 1]);
          }
          break;
        }
        case "=":
        case "+":
          // Zoom handled by PdfPageViewer via its own controls
          break;
        case "c":
          if (currentSession) {
            e.preventDefault();
            handleEditExercises(currentSession, "CW");
          }
          break;
        case "h":
          if (currentSession) {
            e.preventDefault();
            handleEditExercises(currentSession, "HW");
          }
          break;
        case "p":
          e.preventDefault();
          handlePrint();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [exerciseModalType, allExercises, selectedExercise, currentSession, onExit, handleEditExercises, handlePrint, focusMode]);

  // Resize handler
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarWidth;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = ev.clientX - startXRef.current;
      const newWidth = Math.max(220, Math.min(600, startWidthRef.current + delta));
      setSidebarWidth(newWidth);
    };

    const cleanup = () => {
      isResizingRef.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", cleanup);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      resizeCleanupRef.current = null;
    };

    resizeCleanupRef.current = cleanup;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", cleanup);
  }, []);

  // Clean up resize listeners on unmount
  useEffect(() => {
    return () => { resizeCleanupRef.current?.(); };
  }, []);

  const exerciseLabel = selectedExercise?.pdf_name
    ? getDisplayName(selectedExercise.pdf_name)
    : undefined;

  // Extracted header to avoid duplication between normal and overlay rendering
  const renderHeader = (isOverlay?: boolean) => (
    <div className={cn("relative", isOverlay && "shadow-lg")}>
      {/* Wood frame top border */}
      <div className="h-1.5 bg-gradient-to-r from-[#8b6f47] via-[#a0826d] to-[#8b6f47]" />

      {/* Chalkboard surface */}
      <div className={cn(
        "flex items-center gap-3 px-3 py-2.5",
        "bg-[#2d4739] dark:bg-[#1a2821]",
        "shadow-inner"
      )} style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.4)' }}>
        {/* Exit button */}
        <button
          onClick={focusMode ? () => { setFocusMode(false); setHoverHeader(false); setHoverSidebar(false); } : onExit}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          title={focusMode ? "Exit focus mode (Esc)" : "Exit Lesson Mode (Esc)"}
        >
          <ArrowLeft className="h-4 w-4 text-white/80" />
        </button>

        {/* Student info */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-bold text-white/90 truncate">
            {session.student_name}
          </span>
          {session.grade && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-medium text-gray-800"
              style={{ backgroundColor: getGradeColor(session.grade, session.lang_stream) }}
            >
              {session.grade}{session.lang_stream || ""}
            </span>
          )}
        </div>

        {/* Metadata badges */}
        <div className="hidden sm:flex items-center gap-2 text-xs text-white/70 font-medium">
          <span className="text-white/40">&bull;</span>
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3 text-white/80" />
            <span>{formatShortDate(session.session_date)}</span>
          </div>
          {session.time_slot && (
            <>
              <span className="text-white/40">&bull;</span>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-white/80" />
                <span>{session.time_slot}</span>
              </div>
            </>
          )}
          {session.location && (
            <>
              <span className="text-white/40">&bull;</span>
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3 text-white/80" />
                <span>{session.location}</span>
              </div>
            </>
          )}
          {session.tutor_name && (
            <>
              <span className="text-white/40">&bull;</span>
              <span className="text-white/60">{session.tutor_name}</span>
            </>
          )}
          {session.financial_status && (
            <>
              <span className="text-white/40">&bull;</span>
              <div className="flex items-center gap-1">
                {session.financial_status === "Paid" ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 text-green-400" />
                    <span className="text-green-300 font-semibold">Paid</span>
                  </>
                ) : (
                  <>
                    <HandCoins className="h-3 w-3 text-red-400" />
                    <span className="text-red-300 font-semibold">Unpaid</span>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex-1" />

        {/* Print button */}
        {selectedExercise?.pdf_name && (
          <button
            onClick={handlePrint}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title="Print current exercise (P)"
          >
            <Printer className="h-3.5 w-3.5 text-white/70" />
          </button>
        )}

        {/* Focus mode toggle */}
        <button
          onClick={() => {
            setFocusMode(fm => !fm);
            setHoverHeader(false);
            setHoverSidebar(false);
          }}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          title={focusMode ? "Exit focus mode (F)" : "Focus mode (F)"}
        >
          {focusMode ? (
            <Minimize2 className="h-3.5 w-3.5 text-white/70" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5 text-white/70" />
          )}
        </button>

        {/* Shortcut hints */}
        <div className="hidden md:flex items-center gap-1 text-[10px] text-white/30">
          <Keyboard className="h-3 w-3" />
          <span>j/k nav · c/h CW/HW · p print · f focus · Esc exit</span>
        </div>
      </div>

      {/* Wood frame bottom border */}
      <div className="h-1 bg-gradient-to-r from-[#6b5a3a] via-[#8b6f47] to-[#6b5a3a]" />
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col flex-1 min-h-0 relative"
    >
      {/* Header bar — hidden in focus mode */}
      {!focusMode && renderHeader()}

      {/* Split pane: sidebar + PDF viewer */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar + resize handle — hidden in focus mode */}
        {!focusMode && (
          <>
            <div
              className={cn(
                "flex flex-col border-r border-[#d4c4a8] dark:border-[#3a3228]",
                "bg-[#faf5ed] dark:bg-[#1e1a14]",
                "overflow-hidden"
              )}
              style={{ width: sidebarWidth, minWidth: 220, maxWidth: 600 }}
            >
              <LessonExerciseSidebar
                currentSession={currentSession}
                previousSession={previousSession}
                selectedExerciseId={selectedExercise?.id ?? null}
                onExerciseSelect={handleExerciseSelect}
                onEditExercises={handleEditExercises}
                isReadOnly={isReadOnly}
              />
            </div>

            {/* Resize handle */}
            <div
              onMouseDown={handleResizeStart}
              className={cn(
                "w-1.5 cursor-col-resize flex-shrink-0",
                "bg-[#d4c4a8] dark:bg-[#3a3228]",
                "hover:bg-[#c4a882] dark:hover:bg-[#5a4d3a]",
                "active:bg-[#a0704b] dark:active:bg-[#8b6f47]",
                "transition-colors"
              )}
            />
          </>
        )}

        {/* PDF Viewer */}
        <PdfPageViewer
          pdfData={pdfData}
          pageNumbers={pageNumbers}
          isLoading={pdfLoading}
          error={pdfError}
          exerciseLabel={exerciseLabel}
          onRetry={handleRetry}
        />
      </div>

      {/* Focus mode: hover overlays */}
      {focusMode && (
        <>
          {/* Top edge → header overlay */}
          <div
            className="absolute top-0 left-0 right-0 z-50"
            style={{ height: hoverHeader ? 'auto' : 8 }}
            onMouseEnter={() => setHoverHeader(true)}
            onMouseLeave={() => setHoverHeader(false)}
          >
            <AnimatePresence>
              {hoverHeader && (
                <motion.div
                  initial={{ y: "-100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "-100%" }}
                  transition={{ duration: 0.15 }}
                >
                  {renderHeader(true)}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Left edge → sidebar overlay */}
          <div
            className="absolute top-0 left-0 bottom-0 z-40"
            style={{ width: hoverSidebar ? sidebarWidth : 8 }}
            onMouseEnter={() => setHoverSidebar(true)}
            onMouseLeave={() => setHoverSidebar(false)}
          >
            <AnimatePresence>
              {hoverSidebar && (
                <motion.div
                  initial={{ x: "-100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "-100%" }}
                  transition={{ duration: 0.15 }}
                  className={cn(
                    "h-full flex flex-col border-r shadow-2xl",
                    "bg-[#faf5ed] dark:bg-[#1e1a14]",
                    "border-[#d4c4a8] dark:border-[#3a3228]"
                  )}
                  style={{ width: sidebarWidth }}
                >
                  <LessonExerciseSidebar
                    currentSession={currentSession}
                    previousSession={previousSession}
                    selectedExerciseId={selectedExercise?.id ?? null}
                    onExerciseSelect={handleExerciseSelect}
                    onEditExercises={handleEditExercises}
                    isReadOnly={isReadOnly}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* Exercise Modal */}
      {exerciseModalSession && exerciseModalType && (
        <ExerciseModal
          session={exerciseModalSession}
          exerciseType={exerciseModalType}
          isOpen={true}
          onClose={handleExerciseModalClose}
          readOnly={isReadOnly}
        />
      )}
    </motion.div>
  );
}
