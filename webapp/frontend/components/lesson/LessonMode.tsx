"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ArrowLeft, Calendar, Clock, MapPin, Printer, HelpCircle,
  Maximize2, Minimize2, PencilLine,
  AlertTriangle, Download, Loader2 as Loader2Icon, LayoutList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getGradeColor } from "@/lib/constants";
import { getDisplayName, parseExerciseRemarks } from "@/lib/exercise-utils";
import { getPageNumbers, type BulkPrintExercise } from "@/lib/bulk-pdf-helpers";
import { loadExercisePdf } from "@/lib/lesson-pdf-loader";
import { printFileFromPathWithFallback } from "@/lib/file-system";
import { searchPaperlessByPath } from "@/lib/paperless-utils";
import { formatShortDate } from "@/lib/formatters";
import { useLocation } from "@/contexts/LocationContext";
import { LessonExerciseSidebar } from "./LessonExerciseSidebar";
import { PdfPageViewer } from "./PdfPageViewer";
import { ExerciseModal } from "@/components/sessions/ExerciseModal";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { motion, AnimatePresence } from "framer-motion";
import {
  useFloating, useDismiss, useInteractions,
  FloatingOverlay, FloatingFocusManager, FloatingPortal,
} from "@floating-ui/react";
import { useAnnotations } from "@/hooks/useAnnotations";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileBottomSheet } from "@/components/ui/mobile-bottom-sheet";
import { searchAnswerFile, type AnswerSearchResult } from "@/lib/answer-file-utils";
import { useStableKeyboardHandler } from "@/hooks/useStableKeyboardHandler";
import { saveAnnotatedPdf } from "@/lib/pdf-annotation-save";
import type { PrintStampInfo } from "@/lib/pdf-utils";
import type { PageAnnotations } from "@/hooks/useAnnotations";
import type { Session, SessionExercise } from "@/types";

/** S5: Compute page numbers for an exercise. */
function getExercisePageNumbers(exercise: SessionExercise): number[] {
  const { complexPages } = parseExerciseRemarks(exercise.remarks);
  return getPageNumbers({
    pdf_name: exercise.pdf_name || "",
    page_start: exercise.page_start,
    page_end: exercise.page_end,
    complex_pages: complexPages || undefined,
  }, "[Lesson]");
}

/** Compute answer page numbers from exercise metadata. */
function getAnswerPageNumbers(exercise: SessionExercise): number[] {
  if (exercise.answer_page_start && exercise.answer_page_end) {
    const pages: number[] = [];
    for (let i = exercise.answer_page_start; i <= exercise.answer_page_end; i++) {
      pages.push(i);
    }
    return pages;
  }
  if (exercise.answer_page_start) return [exercise.answer_page_start];
  return []; // Empty = all pages
}

/** Inline exit confirmation dialog — warns about unsaved annotations. */
function ExitConfirmDialog({
  isOpen,
  isSaving,
  onCancel,
  onSaveAndExit,
  onExit,
}: {
  isOpen: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onSaveAndExit: () => void;
  onExit: () => void;
}) {
  const { refs, context } = useFloating({
    open: isOpen,
    onOpenChange: (open) => {
      if (!open && !isSaving) onCancel();
    },
  });
  const dismiss = useDismiss(context, { outsidePressEvent: "mousedown", enabled: !isSaving });
  const { getFloatingProps } = useInteractions([dismiss]);

  return (
    <FloatingPortal>
      <FloatingOverlay className="z-[10000] bg-black/50 flex items-center justify-center p-4" lockScroll>
        <FloatingFocusManager context={context}>
          <div
            ref={refs.setFloating}
            {...getFloatingProps()}
            className={cn(
              "w-full min-w-[280px] max-w-[95vw] sm:max-w-sm bg-[#fef9f3] dark:bg-[#2d2618] rounded-lg shadow-xl paper-texture",
              "border-2 border-[#d4a574] dark:border-[#8b6f47]"
            )}
          >
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <AlertTriangle className="h-6 w-6 text-orange-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    Unsaved Annotations
                  </h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    You have annotations that haven&apos;t been saved. What would you like to do?
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 px-4 py-3 border-t border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ebe0] dark:bg-[#251f15] rounded-b-lg">
              <button
                type="button"
                onClick={onSaveAndExit}
                disabled={isSaving}
                className="flex items-center justify-center gap-2 w-full px-4 py-2 text-sm font-medium rounded-md transition-colors bg-[#a0704b] text-white hover:bg-[#8b5d3b] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {isSaving ? "Downloading..." : "Download All & Exit"}
              </button>
              <button
                type="button"
                onClick={onExit}
                disabled={isSaving}
                className="w-full px-4 py-2 text-sm font-medium rounded-md transition-colors bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Exit Without Downloading
              </button>
              <button
                type="button"
                onClick={onCancel}
                disabled={isSaving}
                className="w-full px-4 py-2 text-sm font-medium rounded-md transition-colors text-gray-700 dark:text-gray-300 hover:bg-[#e8d4b8] dark:hover:bg-[#3d3018] disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </FloatingFocusManager>
      </FloatingOverlay>
    </FloatingPortal>
  );
}

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
  const { selectedLocation } = useLocation();

  // Location-prefixed student ID (same pattern as TodaySessionsCard)
  const studentIdDisplay = session.school_student_id
    ? (selectedLocation === "All Locations" && session.location
        ? `${session.location}-${session.school_student_id}`
        : session.school_student_id)
    : null;

  // Set browser tab title to student info for easy tab management
  useEffect(() => {
    const title = [studentIdDisplay, session.student_name].filter(Boolean).join(" ") + " - Lesson";
    document.title = title;
  }, [studentIdDisplay, session.student_name]);

  // Stamp for PDF pages (same info as printing)
  const stamp = useMemo<PrintStampInfo>(() => ({
    location: session.location,
    schoolStudentId: session.school_student_id,
    studentName: session.student_name,
    sessionDate: session.session_date,
    sessionTime: session.time_slot,
  }), [session.location, session.school_student_id, session.student_name, session.session_date, session.time_slot]);

  // Exercise state
  const [selectedExercise, setSelectedExercise] = useState<SessionExercise | null>(null);

  // PDF state
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfLoadingMessage, setPdfLoadingMessage] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pageNumbers, setPageNumbers] = useState<number[]>([]);

  // PDF cache: raw ArrayBuffer by pdf_name (avoids re-fetching on exercise switch)
  const pdfCacheRef = useRef<Map<string, ArrayBuffer>>(new Map());
  const MAX_PDF_CACHE_SIZE = 20;

  // Mobile responsive
  const isMobile = useIsMobile();
  const [mobileExerciseListOpen, setMobileExerciseListOpen] = useState(false);
  const [mobileActiveTab, setMobileActiveTab] = useState<"exercise" | "answer">("exercise");

  // Exercise modal
  const [exerciseModalSession, setExerciseModalSession] = useState<Session | null>(null);
  const [exerciseModalType, setExerciseModalType] = useState<"CW" | "HW" | null>(null);

  // F1: Sidebar width — persist to localStorage
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === "undefined") return 320;
    try {
      const saved = localStorage.getItem("lesson-sidebar-width");
      if (saved) {
        const n = parseInt(saved, 10);
        if (!isNaN(n) && n >= 220 && n <= 600) return n;
      }
    } catch {}
    return 320;
  });
  const isResizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const currentWidthRef = useRef(sidebarWidth);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  // Focus mode (hides sidebar + header, hover to reveal)
  const [focusMode, setFocusMode] = useState(false);
  const [hoverHeader, setHoverHeader] = useState(false);
  const [hoverSidebar, setHoverSidebar] = useState(false);
  const hoverHeaderTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Shortcut help panel
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);

  // S2: Focus mode helpers
  const exitFocusMode = useCallback(() => {
    clearTimeout(hoverHeaderTimerRef.current);
    setFocusMode(false);
    setHoverHeader(false);
    setHoverSidebar(false);
  }, []);

  const toggleFocusMode = useCallback(() => {
    setFocusMode(fm => !fm);
    setHoverHeader(false);
    setHoverSidebar(false);
  }, []);

  // F2: Annotation state with sessionStorage persistence
  const {
    getAnnotations, getAllAnnotations, setPageStrokes, undoLastStroke, redoLastStroke,
    clearAnnotations, clearStorage, hasAnnotations: checkHasAnnotations, hasAnyAnnotations,
  } = useAnnotations(`lesson-annotations-${session.id}`);
  const [drawingEnabled, setDrawingEnabled] = useState(false);
  const [annotationTool, setAnnotationTool] = useState<"pen" | "eraser">("pen");
  const [penColor, setPenColor] = useState("#dc2626");
  const [penSize, setPenSize] = useState(3);
  const [currentAnnotations, setCurrentAnnotations] = useState<PageAnnotations>({});

  // Answer key state
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [answerPdfData, setAnswerPdfData] = useState<ArrayBuffer | null>(null);
  const [answerPageNumbers, setAnswerPageNumbers] = useState<number[]>([]);
  const [answerLoading, setAnswerLoading] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [answerSearchResult, setAnswerSearchResult] = useState<AnswerSearchResult | null>(null);
  const [answerSearchDone, setAnswerSearchDone] = useState(false);
  const answerCacheRef = useRef<Map<string, AnswerSearchResult | null>>(new Map());
  const answerOpenSetRef = useRef<Set<number>>(new Set());

  // S4: Keyboard annotation tool toggle (d/e keys — exits draw mode when same tool pressed)
  const toggleAnnotationTool = useCallback((tool: "pen" | "eraser") => {
    if (!drawingEnabled) {
      setDrawingEnabled(true);
      setAnnotationTool(tool);
    } else if (annotationTool !== tool) {
      setAnnotationTool(tool);
    } else {
      setDrawingEnabled(false);
      if (tool === "eraser") setAnnotationTool("pen");
    }
  }, [drawingEnabled, annotationTool]);

  // S4: Button callbacks (different behavior from keyboard)
  const handleDrawingToggle = useCallback(() => {
    if (drawingEnabled && annotationTool !== "pen") {
      setAnnotationTool("pen");
    } else {
      setDrawingEnabled(d => !d);
      setAnnotationTool("pen");
    }
  }, [drawingEnabled, annotationTool]);

  const handleEraserToggle = useCallback(() => {
    if (!drawingEnabled) {
      setDrawingEnabled(true);
      setAnnotationTool("eraser");
    } else if (annotationTool === "eraser") {
      setAnnotationTool("pen");
    } else {
      setAnnotationTool("eraser");
    }
  }, [drawingEnabled, annotationTool]);

  // All exercises from both sessions (for auto-select, save-all ZIP)
  const allExercises = useMemo(() => {
    const exercises: SessionExercise[] = [];
    if (currentSession?.exercises) exercises.push(...currentSession.exercises);
    if (previousSession?.exercises) exercises.push(...previousSession.exercises);
    return exercises;
  }, [currentSession, previousSession]);

  // Navigable exercises for j/k: only include previous session if user is browsing it
  const selectedIsFromPrevious = previousSession?.exercises?.some(
    ex => ex.id === selectedExercise?.id
  ) ?? false;

  const navigableExercises = useMemo(() => {
    const exercises: SessionExercise[] = [];
    if (currentSession?.exercises) exercises.push(...currentSession.exercises);
    if (selectedIsFromPrevious && previousSession?.exercises) {
      exercises.push(...previousSession.exercises);
    }
    return exercises;
  }, [currentSession, previousSession, selectedIsFromPrevious]);

  // Auto-select first exercise on mount / session change
  useEffect(() => {
    if (allExercises.length > 0 && !selectedExercise) {
      setSelectedExercise(allExercises[0]);
    }
  }, [allExercises, selectedExercise]);

  // S5: Load PDF when exercise changes (with caching) — uses getExercisePageNumbers
  useEffect(() => {
    if (!selectedExercise || !selectedExercise.pdf_name) {
      setPdfData(null);
      setPageNumbers([]);
      setPdfError(selectedExercise ? "No file assigned to this exercise" : null);
      return;
    }

    const pdfName = selectedExercise.pdf_name;
    const pages = getExercisePageNumbers(selectedExercise);
    setPageNumbers(pages);

    // Check cache first
    const cached = pdfCacheRef.current.get(pdfName);
    if (cached) {
      setPdfData(cached);
      setPdfError(null);
      return;
    }

    // Not cached — clear stale data and fetch
    setPdfData(null);
    let cancelled = false;

    async function load() {
      setPdfLoading(true);
      setPdfLoadingMessage(null);
      setPdfError(null);

      const result = await loadExercisePdf(pdfName, (msg) => {
        if (!cancelled) setPdfLoadingMessage(msg);
      });

      if (cancelled) return;

      if ("data" in result) {
        pdfCacheRef.current.set(pdfName, result.data);
        // LRU eviction: drop oldest entry when cache exceeds limit
        if (pdfCacheRef.current.size > MAX_PDF_CACHE_SIZE) {
          const oldest = pdfCacheRef.current.keys().next().value;
          if (oldest !== undefined) pdfCacheRef.current.delete(oldest);
        }
        setPdfData(result.data);
      } else {
        setPdfData(null);
        setPdfError(
          result.error === "no_file"
            ? "No file assigned"
            : result.error === "fetch_failed"
            ? "Failed to download PDF"
            : "File not found"
        );
      }

      setPdfLoading(false);
      setPdfLoadingMessage(null);
    }

    load();
    return () => { cancelled = true; };
  }, [selectedExercise]);

  // Prefetch adjacent exercise PDFs into cache
  useEffect(() => {
    if (!selectedExercise || !pdfData) return;

    let cancelled = false;
    const currentIdx = allExercises.findIndex(ex => ex.id === selectedExercise.id);
    const adjacent = [allExercises[currentIdx - 1], allExercises[currentIdx + 1]].filter(
      (ex): ex is SessionExercise => !!ex?.pdf_name && !pdfCacheRef.current.has(ex.pdf_name)
    );

    (async () => {
      for (const ex of adjacent) {
        if (cancelled) break;
        const result = await loadExercisePdf(ex.pdf_name!);
        if (cancelled) break;
        if ("data" in result) {
          pdfCacheRef.current.set(ex.pdf_name!, result.data);
          if (pdfCacheRef.current.size > MAX_PDF_CACHE_SIZE) {
            const oldest = pdfCacheRef.current.keys().next().value;
            if (oldest !== undefined) pdfCacheRef.current.delete(oldest);
          }
        }
      }
    })();

    return () => { cancelled = true; };
  }, [selectedExercise, pdfData, allExercises]);

  // Sync annotations when exercise changes
  useEffect(() => {
    if (selectedExercise) {
      setCurrentAnnotations(getAnnotations(selectedExercise.id));
    } else {
      setCurrentAnnotations({});
    }
  }, [selectedExercise, getAnnotations]);

  // Auto-search for answer file when exercise changes
  useEffect(() => {
    if (!selectedExercise?.pdf_name) {
      setAnswerSearchResult(null);
      setAnswerSearchDone(false);
      setShowAnswerKey(false);
      return;
    }

    const pdfName = selectedExercise.pdf_name;
    const wasOpen = answerOpenSetRef.current.has(selectedExercise.id);
    setShowAnswerKey(wasOpen);
    setAnswerPdfData(null);

    // Check explicit answer path on the exercise first
    if (selectedExercise.answer_pdf_name) {
      const result: AnswerSearchResult = {
        path: selectedExercise.answer_pdf_name,
        source: 'local',
      };
      answerCacheRef.current.set(pdfName, result);
      setAnswerSearchResult(result);
      setAnswerSearchDone(true);
      return;
    }

    // Check cache
    if (answerCacheRef.current.has(pdfName)) {
      const cached = answerCacheRef.current.get(pdfName) ?? null;
      setAnswerSearchResult(cached);
      setAnswerSearchDone(true);
      return;
    }

    // Fall back to heuristic search
    let cancelled = false;
    setAnswerSearchDone(false);

    (async () => {
      const result = await searchAnswerFile(pdfName);
      if (cancelled) return;
      answerCacheRef.current.set(pdfName, result);
      setAnswerSearchResult(result);
      setAnswerSearchDone(true);
    })();

    return () => { cancelled = true; };
  }, [selectedExercise]);

  // Load answer PDF when showAnswerKey is toggled on
  useEffect(() => {
    if (!showAnswerKey || !answerSearchResult || !selectedExercise) return;

    const answerPath = answerSearchResult.path;

    // Check PDF cache
    const cached = pdfCacheRef.current.get(answerPath);
    if (cached) {
      setAnswerPdfData(cached);
      setAnswerError(null);
      // Compute answer page numbers from exercise metadata
      const pages = getAnswerPageNumbers(selectedExercise);
      setAnswerPageNumbers(pages);
      return;
    }

    let cancelled = false;
    setAnswerLoading(true);
    setAnswerError(null);

    (async () => {
      const result = await loadExercisePdf(answerPath);
      if (cancelled) return;

      if ("data" in result) {
        pdfCacheRef.current.set(answerPath, result.data);
        if (pdfCacheRef.current.size > MAX_PDF_CACHE_SIZE) {
          const oldest = pdfCacheRef.current.keys().next().value;
          if (oldest !== undefined) pdfCacheRef.current.delete(oldest);
        }
        setAnswerPdfData(result.data);
        const pages = getAnswerPageNumbers(selectedExercise);
        setAnswerPageNumbers(pages);
      } else {
        setAnswerPdfData(null);
        setAnswerError("Failed to load answer key");
      }
      setAnswerLoading(false);
    })();

    return () => { cancelled = true; };
  }, [showAnswerKey, answerSearchResult, selectedExercise]);

  // Handle exercise selection
  const handleExerciseSelect = useCallback((exercise: SessionExercise) => {
    setSelectedExercise(exercise);
    if (isMobile) setMobileExerciseListOpen(false);
  }, [isMobile]);

  // Handle edit exercises
  const handleEditExercises = useCallback((s: Session, type: "CW" | "HW") => {
    setExerciseModalSession(s);
    setExerciseModalType(type);
  }, []);

  // Toggle answer key view (persists per exercise via answerOpenSetRef)
  const handleAnswerKeyToggle = useCallback(() => {
    setShowAnswerKey(prev => {
      const next = !prev;
      if (selectedExercise?.id != null) {
        if (next) answerOpenSetRef.current.add(selectedExercise.id);
        else answerOpenSetRef.current.delete(selectedExercise.id);
      }
      if (next) setMobileActiveTab("answer");
      return next;
    });
  }, [selectedExercise]);

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
      stamp,
      searchPaperlessByPath
    );
  }, [selectedExercise, stamp]);

  // Annotation handlers
  const handleAnnotationsChange = useCallback((annotations: PageAnnotations) => {
    if (!selectedExercise) return;
    setCurrentAnnotations(annotations);
    // Sync each page to the ref store
    for (const [pageIdx, strokes] of Object.entries(annotations)) {
      setPageStrokes(selectedExercise.id, parseInt(pageIdx), strokes);
    }
  }, [selectedExercise, setPageStrokes]);

  const handleUndo = useCallback(() => {
    if (!selectedExercise) return;
    // Find the last page that has strokes
    const pageIndices = Object.keys(currentAnnotations)
      .map(Number)
      .filter((i) => (currentAnnotations[i]?.length || 0) > 0);
    if (pageIndices.length === 0) return;
    const lastPage = Math.max(...pageIndices);
    const updated = undoLastStroke(selectedExercise.id, lastPage);
    setCurrentAnnotations((prev) => ({ ...prev, [lastPage]: updated }));
  }, [selectedExercise, currentAnnotations, undoLastStroke]);

  const handleRedo = useCallback(() => {
    if (!selectedExercise) return;
    // Find the last page that was undone from (redo stack) — use same heuristic as undo
    const pageIndices = Object.keys(currentAnnotations)
      .map(Number)
      .sort((a, b) => b - a);
    // Try each page from highest to lowest; redoLastStroke returns null if no redo available
    for (const pageIdx of pageIndices) {
      const result = redoLastStroke(selectedExercise.id, pageIdx);
      if (result) {
        setCurrentAnnotations((prev) => ({ ...prev, [pageIdx]: result }));
        return;
      }
    }
    // Also try page 0 in case all strokes were undone (page might not be in currentAnnotations)
    const result = redoLastStroke(selectedExercise.id, 0);
    if (result) {
      setCurrentAnnotations((prev) => ({ ...prev, [0]: result }));
    }
  }, [selectedExercise, currentAnnotations, redoLastStroke]);

  const handleClearAllAnnotations = useCallback(() => {
    if (!selectedExercise) return;
    clearAnnotations(selectedExercise.id);
    setCurrentAnnotations({});
  }, [selectedExercise, clearAnnotations]);

  const handleSaveAnnotated = useCallback(async () => {
    if (!selectedExercise?.pdf_name || !pdfData) return;
    try {
      const blob = await saveAnnotatedPdf(
        pdfData,
        pageNumbers,
        stamp,
        currentAnnotations,
      );
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = `annotated-${getDisplayName(selectedExercise.pdf_name)}.pdf`;
        a.click();
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 100);
      }
    } catch (err) {
      console.error("Failed to save annotated PDF:", err);
    }
  }, [selectedExercise, pdfData, pageNumbers, stamp, currentAnnotations]);

  const exerciseHasAnnotations = selectedExercise
    ? checkHasAnnotations(selectedExercise.id)
    : false;

  // Exit confirmation state
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);

  const handleExitAttempt = useCallback(() => {
    if (hasAnyAnnotations()) {
      setShowExitConfirm(true);
    } else {
      onExit();
    }
  }, [hasAnyAnnotations, onExit]);

  // S5: handleSaveAllAndExit uses getExercisePageNumbers
  const handleSaveAllAndExit = useCallback(async () => {
    setIsSavingAll(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const allAnnotationsMap = getAllAnnotations();

      for (const exercise of allExercises) {
        const ann = allAnnotationsMap.get(exercise.id);
        if (!ann || !Object.values(ann).some((s) => s.length > 0)) continue;
        if (!exercise.pdf_name) continue;

        const cached = pdfCacheRef.current.get(exercise.pdf_name);
        if (!cached) continue;

        const pages = getExercisePageNumbers(exercise);
        const blob = await saveAnnotatedPdf(cached, pages, stamp, ann);
        zip.file(`annotated-${getDisplayName(exercise.pdf_name)}.pdf`, blob);
      }

      const studentId = [session.location, session.school_student_id].filter(Boolean).join("-");
      const parts = [
        "Annotations",
        studentId,
        session.student_name,
        session.session_date,
        session.time_slot,
      ].filter(Boolean);
      const zipName = parts.join("_").replace(/\s+/g, "-") + ".zip";

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = zipName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
      setIsSavingAll(false);
      setShowExitConfirm(false);
      // F2: Clear sessionStorage on save & exit
      clearStorage();
      onExit();
    } catch (err) {
      console.error("Failed to save annotated PDFs:", err);
      setIsSavingAll(false);
    }
  }, [allExercises, getAllAnnotations, stamp, session, onExit, clearStorage]);

  // Keyboard shortcuts — useStableKeyboardHandler reads latest closure on every keydown
  useStableKeyboardHandler((e: KeyboardEvent) => {
    if (exerciseModalType || showExitConfirm) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        if (showShortcutHelp) {
          setShowShortcutHelp(false);
        } else if (focusMode) {
          exitFocusMode();
        } else {
          handleExitAttempt();
        }
        break;
      case "?":
        e.preventDefault();
        setShowShortcutHelp(v => !v);
        break;
      case "f":
        e.preventDefault();
        if (!isMobile) toggleFocusMode();
        break;
      case "j":
      case "ArrowDown": {
        e.preventDefault();
        const currentIdx = navigableExercises.findIndex(ex => ex.id === selectedExercise?.id);
        if (currentIdx < navigableExercises.length - 1) {
          setSelectedExercise(navigableExercises[currentIdx + 1]);
        }
        break;
      }
      case "k":
      case "ArrowUp": {
        e.preventDefault();
        const currentIdx = navigableExercises.findIndex(ex => ex.id === selectedExercise?.id);
        if (currentIdx > 0) {
          setSelectedExercise(navigableExercises[currentIdx - 1]);
        }
        break;
      }
      case "d":
        e.preventDefault();
        toggleAnnotationTool("pen");
        break;
      case "e":
        e.preventDefault();
        toggleAnnotationTool("eraser");
        break;
      case "z":
        if (drawingEnabled) {
          e.preventDefault();
          handleUndo();
        }
        break;
      case "Z":
        if (drawingEnabled) {
          e.preventDefault();
          handleRedo();
        }
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
      case "a":
        if (answerSearchResult) {
          e.preventDefault();
          handleAnswerKeyToggle();
        }
        break;
    }
  });

  // P1: Resize handler with rAF throttle + F1: persist to localStorage on mouseup
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarWidth;
    currentWidthRef.current = sidebarWidth;

    let rafId: number | null = null;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isResizingRef.current || rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        const delta = ev.clientX - startXRef.current;
        const newWidth = Math.max(220, Math.min(600, startWidthRef.current + delta));
        currentWidthRef.current = newWidth;
        setSidebarWidth(newWidth);
        rafId = null;
      });
    };

    const cleanup = () => {
      isResizingRef.current = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", cleanup);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      resizeCleanupRef.current = null;
      // F1: Persist final width to localStorage
      try { localStorage.setItem("lesson-sidebar-width", String(currentWidthRef.current)); } catch {}
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

  // Header annotation toggle (different from toolbar — toggles entire annotation mode)
  const handleHeaderAnnotationToggle = useCallback(() => {
    if (drawingEnabled) {
      setDrawingEnabled(false);
      setAnnotationTool("pen");
    } else {
      setDrawingEnabled(true);
    }
  }, [drawingEnabled]);

  // Extracted header to avoid duplication between normal and overlay rendering
  const renderHeader = (isOverlay?: boolean) => (
    <div className={cn(
      "relative rounded-2xl bg-gradient-to-br from-[#b89968] via-[#a67c52] to-[#8b6f47] p-1",
      isOverlay && "shadow-lg rounded-3xl"
    )}>
      {/* Chalkboard surface */}
      <div className={cn(
        "flex items-center gap-3 px-3 py-2.5",
        "bg-[#2d4739] dark:bg-[#1a2821]",
        "shadow-inner rounded-[12px]",
        isOverlay && "rounded-[20px]"
      )} style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.4)' }}>
        {/* Exit button */}
        <button
          onClick={focusMode ? exitFocusMode : handleExitAttempt}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          title={focusMode ? "Exit focus mode (Esc)" : "Exit Lesson Mode (Esc)"}
        >
          <ArrowLeft className="h-4 w-4 text-white/80" />
        </button>

        {/* Student info */}
        <div className="flex items-center gap-2 min-w-0">
          {studentIdDisplay && (
            <span className="text-xs text-white/60 font-mono">{studentIdDisplay}</span>
          )}
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
        </div>

        <div className="flex-1" />

        {/* Annotation mode toggle */}
        {selectedExercise?.pdf_name && (
          <button
            onClick={handleHeaderAnnotationToggle}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              drawingEnabled
                ? "bg-white/20 text-white"
                : "hover:bg-white/10 text-white/70"
            )}
            title={drawingEnabled ? "Exit annotation mode (Esc)" : "Annotation mode (D)"}
          >
            <PencilLine className="h-3.5 w-3.5" />
          </button>
        )}

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

        {/* Focus mode toggle (desktop only — mobile header is already compact) */}
        <button
          onClick={toggleFocusMode}
          className="hidden md:inline-flex p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          title={focusMode ? "Exit focus mode (F)" : "Focus mode (F)"}
        >
          {focusMode ? (
            <Minimize2 className="h-3.5 w-3.5 text-white/70" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5 text-white/70" />
          )}
        </button>

        {/* Shortcut help toggle (desktop only) */}
        <button
          onClick={() => setShowShortcutHelp(v => !v)}
          className={cn(
            "hidden md:inline-flex p-1.5 rounded-lg transition-colors",
            showShortcutHelp
              ? "bg-white/20 text-white"
              : "hover:bg-white/10 text-white/40"
          )}
          title="Keyboard shortcuts (?)"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </div>

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

      {/* Shortcut help panel */}
      <AnimatePresence>
        {showShortcutHelp && (
          <>
            {/* Click-outside overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60]"
              onClick={() => setShowShortcutHelp(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className={cn(
                "absolute right-2 z-[61]",
                "bg-[#2d4739] text-white rounded-lg shadow-xl border border-white/10",
                "px-4 py-3 w-56"
              )}
              style={{ top: 52, textShadow: '1px 1px 3px rgba(0,0,0,0.4)' }}
            >
              <h4 className="text-xs font-bold text-white/80 mb-2 uppercase tracking-wider">Keyboard Shortcuts</h4>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                {[
                  ["j / k", "Navigate exercises"],
                  ["+  / -", "Zoom in / out"],
                  ["d", "Pen tool"],
                  ["e", "Eraser tool"],
                  ["z / Z", "Undo / Redo"],
                  ["c / h", "Edit CW / HW"],
                  ["p", "Print"],
                  ["a", "Answer key"],
                  ["f", "Focus mode"],
                  ["?", "This help"],
                  ["Esc", "Exit / Back"],
                ].map(([key, desc]) => (
                  <div key={key} className="contents">
                    <kbd className="text-white/90 font-mono bg-white/10 px-1.5 py-0.5 rounded text-[10px] text-center">{key}</kbd>
                    <span className="text-white/60 py-0.5">{desc}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Split pane: sidebar + PDF viewer */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar + resize handle — hidden in focus mode and on mobile */}
        {!focusMode && !isMobile && (
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
                hasAnnotations={checkHasAnnotations}
                homeworkCompletion={session.homework_completion}
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

        {/* PDF Viewer(s) */}
        <div className="flex flex-col flex-1 min-h-0 min-w-0">
          {/* Mobile: Tab bar when answer key is shown */}
          {isMobile && showAnswerKey && answerPdfData && (
            <div className="flex border-b border-[#d4c4a8] dark:border-[#3a3228] bg-[#f0e6d4] dark:bg-[#252018]">
              <button
                onClick={() => setMobileActiveTab("exercise")}
                className={cn(
                  "flex-1 py-2.5 text-xs font-semibold text-center transition-colors",
                  mobileActiveTab === "exercise"
                    ? "text-[#6b4c30] dark:text-[#d4a574] border-b-2 border-[#a0704b]"
                    : "text-[#8b7355] dark:text-[#a09080]"
                )}
              >
                Exercise
              </button>
              <button
                onClick={() => setMobileActiveTab("answer")}
                className={cn(
                  "flex-1 py-2.5 text-xs font-semibold text-center transition-colors",
                  mobileActiveTab === "answer"
                    ? "text-[#6b4c30] dark:text-[#d4a574] border-b-2 border-[#a0704b]"
                    : "text-[#8b7355] dark:text-[#a09080]"
                )}
              >
                Answer Key
              </button>
            </div>
          )}

          {/* PDF viewers — side-by-side on desktop, tabbed on mobile */}
          <div className={cn("flex flex-1 min-h-0 min-w-0", !isMobile && showAnswerKey && answerPdfData && "gap-0")}>
            {/* Main exercise PDF — hidden on mobile when answer tab is active */}
            {(!isMobile || !showAnswerKey || mobileActiveTab === "exercise") && (
              <ErrorBoundary
                onReset={handleRetry}
                fallback={
                  <div className="flex-1 flex items-center justify-center bg-[#e8dcc8] dark:bg-[#1e1a14]">
                    <div className="flex flex-col items-center gap-3 max-w-sm text-center">
                      <AlertTriangle className="h-10 w-10 text-amber-500" />
                      <p className="text-sm text-[#8b7355] dark:text-[#a09080]">
                        Something went wrong rendering the PDF
                      </p>
                      <button
                        onClick={handleRetry}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-[#a0704b] text-white hover:bg-[#8b6040] transition-colors"
                      >
                        Try again
                      </button>
                    </div>
                  </div>
                }
              >
                <PdfPageViewer
                  pdfData={pdfData}
                  pageNumbers={pageNumbers}
                  stamp={stamp}
                  exerciseId={selectedExercise?.id}
                  isLoading={pdfLoading}
                  loadingMessage={pdfLoadingMessage}
                  error={pdfError}
                  exerciseLabel={exerciseLabel}
                  onRetry={handleRetry}
                  annotations={currentAnnotations}
                  onAnnotationsChange={handleAnnotationsChange}
                  drawingEnabled={drawingEnabled}
                  onDrawingToggle={handleDrawingToggle}
                  penColor={penColor}
                  onPenColorChange={setPenColor}
                  penSize={penSize}
                  onPenSizeChange={setPenSize}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  onClearAll={handleClearAllAnnotations}
                  hasAnnotations={exerciseHasAnnotations}
                  onSaveAnnotated={handleSaveAnnotated}
                  eraserActive={drawingEnabled && annotationTool === "eraser"}
                  onEraserToggle={handleEraserToggle}
                  onAnswerKeyToggle={handleAnswerKeyToggle}
                  showAnswerKey={showAnswerKey}
                  answerKeyAvailable={answerSearchDone && answerSearchResult !== null}
                />
              </ErrorBoundary>
            )}

            {/* Answer key viewer (read-only) */}
            {showAnswerKey && (!isMobile || mobileActiveTab === "answer") && (
              <>
                {!isMobile && <div className="w-px bg-[#d4c4a8] dark:bg-[#3a3228] flex-shrink-0" />}
                <PdfPageViewer
                  pdfData={answerPdfData}
                  pageNumbers={answerPageNumbers}
                  isLoading={answerLoading}
                  error={answerError}
                  exerciseLabel={exerciseLabel ? `ANS: ${exerciseLabel}` : "Answer Key"}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Focus mode: hover overlays (desktop only) */}
      {focusMode && !isMobile && (
        <>
          {/* Top edge → header overlay (300ms debounce to avoid accidental triggers from toolbar) */}
          <div
            className="absolute top-0 left-0 right-0 z-50"
            style={{ height: hoverHeader ? 'auto' : 8 }}
            onMouseEnter={() => {
              hoverHeaderTimerRef.current = setTimeout(() => setHoverHeader(true), 300);
            }}
            onMouseLeave={() => {
              clearTimeout(hoverHeaderTimerRef.current);
              setHoverHeader(false);
            }}
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
                    hasAnnotations={checkHasAnnotations}
                    homeworkCompletion={session.homework_completion}
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

      {/* Exit Confirmation Dialog */}
      {showExitConfirm && (
        <ExitConfirmDialog
          isOpen={showExitConfirm}
          isSaving={isSavingAll}
          onCancel={() => setShowExitConfirm(false)}
          onSaveAndExit={handleSaveAllAndExit}
          onExit={() => {
            setShowExitConfirm(false);
            // F2: Clear sessionStorage on exit without saving
            clearStorage();
            onExit();
          }}
        />
      )}

      {/* Mobile: Floating exercise list button */}
      {isMobile && (
        <button
          onClick={() => setMobileExerciseListOpen(true)}
          className="fixed bottom-4 right-4 z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center bg-gradient-to-br from-[#a0704b] to-[#8b6040] border-2 border-[#6b4c30] active:scale-95 transition-transform"
          aria-label="Exercise list"
        >
          <LayoutList className="h-6 w-6 text-white" />
        </button>
      )}

      {/* Mobile: Exercise list bottom sheet */}
      <MobileBottomSheet
        isOpen={mobileExerciseListOpen}
        onClose={() => setMobileExerciseListOpen(false)}
        title="Exercises"
        className="bg-[#faf5ed] dark:bg-[#1e1a14]"
      >
        <LessonExerciseSidebar
          currentSession={currentSession}
          previousSession={previousSession}
          selectedExerciseId={selectedExercise?.id ?? null}
          onExerciseSelect={handleExerciseSelect}
          onEditExercises={handleEditExercises}
          isReadOnly={isReadOnly}
          hasAnnotations={checkHasAnnotations}
          homeworkCompletion={session.homework_completion}
        />
      </MobileBottomSheet>
    </motion.div>
  );
}
