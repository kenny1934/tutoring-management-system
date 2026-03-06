"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ArrowLeft, Calendar, MapPin, HelpCircle, Printer, ChevronDown,
  Maximize2, Minimize2, PencilLine, Users,
  AlertTriangle, Loader2 as Loader2Icon, LayoutList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getGradeColor } from "@/lib/constants";
import { getDisplayName, parseExerciseRemarks } from "@/lib/exercise-utils";
import { getExercisePageNumbers, getAnswerPageNumbers, getStudentIdDisplay } from "@/lib/lesson-utils";
import { loadExercisePdf } from "@/lib/lesson-pdf-loader";
import { printFileFromPathWithFallback } from "@/lib/file-system";
import { formatShortDate } from "@/lib/formatters";
import { useLocation } from "@/contexts/LocationContext";
import { LessonWideSidebar } from "./LessonWideSidebar";
import { StudentSwitcher } from "./StudentSwitcher";
import { PdfPageViewer } from "./PdfPageViewer";
import { ExerciseModal } from "@/components/sessions/ExerciseModal";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { motion, AnimatePresence } from "framer-motion";
import { useAnnotations } from "@/hooks/useAnnotations";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileBottomSheet } from "@/components/ui/mobile-bottom-sheet";
import { searchAnswerFile, type AnswerSearchResult } from "@/lib/answer-file-utils";
import { useStableKeyboardHandler } from "@/hooks/useStableKeyboardHandler";
import { saveAnnotatedPdf } from "@/lib/pdf-annotation-save";
import { groupExercisesByStudent, bulkPrintAllStudents } from "@/lib/bulk-exercise-download";
import { useToast } from "@/contexts/ToastContext";
import type { PrintStampInfo } from "@/lib/pdf-utils";
import type { PageAnnotations } from "@/hooks/useAnnotations";
import type { Session, SessionExercise } from "@/types";

// --- Data types for grouping ---

/** A student's exercise entry within a file group */
export interface StudentExerciseEntry {
  session: Session;
  exercise: SessionExercise;
  studentName: string;
  studentId: string | null; // school_student_id
  grade: string | null;
  langStream: string | null;
}

/** A file group: one PDF shared by one or more students */
export interface FileGroup {
  pdfName: string;
  displayName: string;
  exerciseType: "CW" | "HW";
  entries: StudentExerciseEntry[];
}

// --- Props ---

interface LessonWideModeProps {
  sessions: Session[];
  date: string;
  slot: string;
  tutorId: number;
  onSessionDataChange: () => void;
  isReadOnly?: boolean;
}

export function LessonWideMode({
  sessions,
  date,
  slot,
  tutorId,
  onSessionDataChange,
  isReadOnly,
}: LessonWideModeProps) {
  const { selectedLocation } = useLocation();
  const { showToast } = useToast();

  // --- Sidebar mode ---
  const [sidebarMode, setSidebarMode] = useState<"by-student" | "by-file">("by-student");

  // --- Selection state ---
  // selectedEntry tracks both which exercise AND which student
  const [selectedEntry, setSelectedEntry] = useState<StudentExerciseEntry | null>(null);

  // --- PDF state ---
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfLoadingMessage, setPdfLoadingMessage] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pageNumbers, setPageNumbers] = useState<number[]>([]);
  const pdfCacheRef = useRef<Map<string, ArrayBuffer>>(new Map());
  const MAX_PDF_CACHE_SIZE = 30;

  // --- Mobile ---
  const isMobile = useIsMobile();
  const [mobileExerciseListOpen, setMobileExerciseListOpen] = useState(false);
  const [mobileActiveTab, setMobileActiveTab] = useState<"exercise" | "answer">("exercise");

  // --- Exercise modal ---
  const [exerciseModalSession, setExerciseModalSession] = useState<Session | null>(null);
  const [exerciseModalType, setExerciseModalType] = useState<"CW" | "HW" | null>(null);

  // --- Sidebar width (shared with single lesson mode) ---
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

  // --- Focus mode ---
  const [focusMode, setFocusMode] = useState(false);
  const [hoverHeader, setHoverHeader] = useState(false);
  const [hoverSidebar, setHoverSidebar] = useState(false);
  const hoverHeaderTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // --- Shortcut help ---
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);

  // --- Drawing / Annotations ---
  // Use a combined key for all sessions in this lesson
  const annotationKey = `lesson-wide-annotations-${date}-${slot}-${tutorId}`;
  const {
    getAnnotations, getAllAnnotations, setPageStrokes, undoLastStroke, redoLastStroke,
    clearAnnotations, clearStorage, hasAnnotations: checkHasAnnotations, hasAnyAnnotations,
  } = useAnnotations(annotationKey);
  const [drawingEnabled, setDrawingEnabled] = useState(false);
  const [annotationTool, setAnnotationTool] = useState<"pen" | "eraser">("pen");
  const [penColor, setPenColor] = useState("#dc2626");
  const [penSize, setPenSize] = useState(3);
  const [currentAnnotations, setCurrentAnnotations] = useState<PageAnnotations>({});

  // --- Answer key state ---
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [answerPdfData, setAnswerPdfData] = useState<ArrayBuffer | null>(null);
  const [answerPageNumbers, setAnswerPageNumbers] = useState<number[]>([]);
  const [answerLoading, setAnswerLoading] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [answerSearchResult, setAnswerSearchResult] = useState<AnswerSearchResult | null>(null);
  const [answerSearchDone, setAnswerSearchDone] = useState(false);
  const answerCacheRef = useRef<Map<string, AnswerSearchResult | null>>(new Map());
  const answerOpenSetRef = useRef<Set<number>>(new Set());

  // --- Computed data structures ---

  // All student exercise entries (flat list)
  const allEntries = useMemo<StudentExerciseEntry[]>(() => {
    const entries: StudentExerciseEntry[] = [];
    for (const session of sessions) {
      if (!session.exercises?.length) continue;
      for (const exercise of session.exercises) {
        entries.push({
          session,
          exercise,
          studentName: session.student_name || `Student #${session.student_id}`,
          studentId: session.school_student_id || null,
          grade: session.grade || null,
          langStream: session.lang_stream || null,
        });
      }
    }
    return entries;
  }, [sessions]);

  // File groups: exercises grouped by pdf_name + exercise_type
  const fileGroups = useMemo<FileGroup[]>(() => {
    const map = new Map<string, FileGroup>();
    for (const entry of allEntries) {
      const type = entry.exercise.exercise_type === "Classwork" || entry.exercise.exercise_type === "CW" ? "CW" : "HW";
      const key = `${type}:${entry.exercise.pdf_name}`;
      let group = map.get(key);
      if (!group) {
        group = {
          pdfName: entry.exercise.pdf_name,
          displayName: getDisplayName(entry.exercise.pdf_name),
          exerciseType: type,
          entries: [],
        };
        map.set(key, group);
      }
      group.entries.push(entry);
    }
    // Sort: CW first, then HW; within each type, alphabetical by displayName
    return Array.from(map.values()).sort((a, b) => {
      if (a.exerciseType !== b.exerciseType) return a.exerciseType === "CW" ? -1 : 1;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [allEntries]);

  // Students list (sorted by school_student_id, then name)
  const students = useMemo(() => {
    const seen = new Map<number, Session>();
    for (const session of sessions) {
      seen.set(session.id, session);
    }
    return Array.from(seen.values()).sort((a, b) => {
      const idA = a.school_student_id || "";
      const idB = b.school_student_id || "";
      if (idA !== idB) return idA.localeCompare(idB);
      return (a.student_name || "").localeCompare(b.student_name || "");
    });
  }, [sessions]);

  // Tutor name from first session
  const tutorName = sessions[0]?.tutor_name || "";

  // --- Stamp for current selection ---
  const stamp = useMemo<PrintStampInfo | undefined>(() => {
    if (!selectedEntry) return undefined;
    return {
      location: selectedEntry.session.location,
      schoolStudentId: selectedEntry.session.school_student_id,
      studentName: selectedEntry.session.student_name,
      sessionDate: selectedEntry.session.session_date,
      sessionTime: selectedEntry.session.time_slot,
    };
  }, [selectedEntry]);

  // Student ID display for header
  const studentIdDisplay = selectedEntry
    ? getStudentIdDisplay(selectedEntry.session, selectedLocation)
    : null;

  // Exercise label for PDF viewer
  const exerciseLabel = selectedEntry?.exercise?.pdf_name
    ? getDisplayName(selectedEntry.exercise.pdf_name)
    : undefined;

  // --- Browser tab title ---
  useEffect(() => {
    const parts = [slot, tutorName, "Lesson"].filter(Boolean);
    document.title = parts.join(" - ");
  }, [slot, tutorName]);

  // --- Focus mode helpers ---
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

  // --- Annotation tool toggles ---
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

  // --- Auto-select first entry ---
  useEffect(() => {
    if (allEntries.length > 0 && !selectedEntry) {
      setSelectedEntry(allEntries[0]);
    }
  }, [allEntries, selectedEntry]);

  // --- Load PDF when selection changes ---
  useEffect(() => {
    const exercise = selectedEntry?.exercise;
    if (!exercise?.pdf_name) {
      setPdfData(null);
      setPageNumbers([]);
      setPdfError(exercise ? "No file assigned to this exercise" : null);
      return;
    }

    const pdfName = exercise.pdf_name;
    const pages = getExercisePageNumbers(exercise);
    setPageNumbers(pages);

    const cached = pdfCacheRef.current.get(pdfName);
    if (cached) {
      setPdfData(cached);
      setPdfError(null);
      return;
    }

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
        if (pdfCacheRef.current.size > MAX_PDF_CACHE_SIZE) {
          const oldest = pdfCacheRef.current.keys().next().value;
          if (oldest !== undefined) pdfCacheRef.current.delete(oldest);
        }
        setPdfData(result.data);
      } else {
        setPdfData(null);
        setPdfError(
          result.error === "no_file" ? "No file assigned"
            : result.error === "fetch_failed" ? "Failed to download PDF"
            : "File not found"
        );
      }

      setPdfLoading(false);
      setPdfLoadingMessage(null);
    }

    load();
    return () => { cancelled = true; };
  }, [selectedEntry]);

  // --- Sync annotations when selection changes ---
  useEffect(() => {
    if (selectedEntry?.exercise) {
      setCurrentAnnotations(getAnnotations(selectedEntry.exercise.id));
    } else {
      setCurrentAnnotations({});
    }
  }, [selectedEntry, getAnnotations]);

  // --- Answer file search ---
  useEffect(() => {
    const exercise = selectedEntry?.exercise;
    if (!exercise?.pdf_name) {
      setAnswerSearchResult(null);
      setAnswerSearchDone(false);
      setShowAnswerKey(false);
      return;
    }

    const pdfName = exercise.pdf_name;
    const wasOpen = answerOpenSetRef.current.has(exercise.id);
    setShowAnswerKey(wasOpen);
    setAnswerPdfData(null);

    if (exercise.answer_pdf_name) {
      const result: AnswerSearchResult = { path: exercise.answer_pdf_name, source: 'local' };
      answerCacheRef.current.set(pdfName, result);
      setAnswerSearchResult(result);
      setAnswerSearchDone(true);
      return;
    }

    if (answerCacheRef.current.has(pdfName)) {
      setAnswerSearchResult(answerCacheRef.current.get(pdfName) ?? null);
      setAnswerSearchDone(true);
      return;
    }

    let cancelled = false;
    setAnswerSearchDone(false);
    (async () => {
      try {
        const result = await searchAnswerFile(pdfName);
        if (cancelled) return;
        answerCacheRef.current.set(pdfName, result);
        setAnswerSearchResult(result);
      } catch (err) {
        console.error("Answer file search failed:", err);
      } finally {
        if (!cancelled) setAnswerSearchDone(true);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedEntry]);

  // --- Load answer PDF ---
  useEffect(() => {
    if (!showAnswerKey || !answerSearchResult || !selectedEntry?.exercise) return;

    const answerPath = answerSearchResult.path;
    const cached = pdfCacheRef.current.get(answerPath);
    if (cached) {
      setAnswerPdfData(cached);
      setAnswerError(null);
      setAnswerPageNumbers(getAnswerPageNumbers(selectedEntry.exercise));
      return;
    }

    let cancelled = false;
    setAnswerLoading(true);
    setAnswerError(null);

    (async () => {
      try {
        const result = await loadExercisePdf(answerPath);
        if (cancelled) return;

        if ("data" in result) {
          pdfCacheRef.current.set(answerPath, result.data);
          if (pdfCacheRef.current.size > MAX_PDF_CACHE_SIZE) {
            const oldest = pdfCacheRef.current.keys().next().value;
            if (oldest !== undefined) pdfCacheRef.current.delete(oldest);
          }
          setAnswerPdfData(result.data);
          setAnswerPageNumbers(getAnswerPageNumbers(selectedEntry.exercise));
        } else {
          setAnswerPdfData(null);
          setAnswerError("Failed to load answer key");
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Answer PDF load failed:", err);
          setAnswerPdfData(null);
          setAnswerError("Failed to load answer key");
        }
      } finally {
        if (!cancelled) setAnswerLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [showAnswerKey, answerSearchResult, selectedEntry]);

  // --- Annotation callbacks ---
  const handleAnnotationsChange = useCallback((newAnnotations: PageAnnotations) => {
    if (!selectedEntry?.exercise) return;
    setCurrentAnnotations(newAnnotations);
    for (const [pageIdx, strokes] of Object.entries(newAnnotations)) {
      setPageStrokes(selectedEntry.exercise.id, Number(pageIdx), strokes);
    }
  }, [selectedEntry, setPageStrokes]);

  const handleUndo = useCallback(() => {
    if (!selectedEntry?.exercise) return;
    const updated = undoLastStroke(selectedEntry.exercise.id);
    if (updated) setCurrentAnnotations(updated);
  }, [selectedEntry, undoLastStroke]);

  const handleRedo = useCallback(() => {
    if (!selectedEntry?.exercise) return;
    const updated = redoLastStroke(selectedEntry.exercise.id);
    if (updated) setCurrentAnnotations(updated);
  }, [selectedEntry, redoLastStroke]);

  const handleClearAllAnnotations = useCallback(() => {
    if (!selectedEntry?.exercise) return;
    clearAnnotations(selectedEntry.exercise.id);
    setCurrentAnnotations({});
  }, [selectedEntry, clearAnnotations]);

  const exerciseHasAnnotations = selectedEntry?.exercise
    ? checkHasAnnotations(selectedEntry.exercise.id)
    : false;

  // --- Answer key toggle ---
  const handleAnswerKeyToggle = useCallback(() => {
    setShowAnswerKey(prev => {
      const next = !prev;
      if (selectedEntry?.exercise?.id != null) {
        if (next) answerOpenSetRef.current.add(selectedEntry.exercise.id);
        else answerOpenSetRef.current.delete(selectedEntry.exercise.id);
      }
      if (next) setMobileActiveTab("answer");
      return next;
    });
  }, [selectedEntry]);

  // --- Exercise modal ---
  const handleEditExercises = useCallback((session: Session, type: "CW" | "HW") => {
    setExerciseModalSession(session);
    setExerciseModalType(type);
  }, []);

  const handleExerciseModalClose = useCallback(() => {
    setExerciseModalSession(null);
    setExerciseModalType(null);
    onSessionDataChange();
  }, [onSessionDataChange]);

  // --- Print ---
  const handlePrint = useCallback(async (entry?: StudentExerciseEntry) => {
    const target = entry || selectedEntry;
    if (!target?.exercise?.pdf_name) return;
    const { complexPages } = parseExerciseRemarks(target.exercise.remarks);
    const entryStamp: PrintStampInfo = {
      location: target.session.location,
      schoolStudentId: target.session.school_student_id,
      studentName: target.session.student_name,
      sessionDate: target.session.session_date,
      sessionTime: target.session.time_slot,
    };
    await printFileFromPathWithFallback(
      target.exercise.pdf_name,
      target.exercise.page_start,
      target.exercise.page_end,
      complexPages || undefined,
      entryStamp
    );
  }, [selectedEntry]);

  // --- Bulk print ---
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const handleBulkPrint = useCallback(async (type: 'CW' | 'HW') => {
    setShowPrintMenu(false);
    const groups = groupExercisesByStudent(sessions, type);
    if (groups.length === 0) {
      showToast(`No ${type} exercises found`, 'info');
      return;
    }
    const error = await bulkPrintAllStudents(groups);
    if (error === 'not_supported') showToast('File System Access not supported. Use Chrome/Edge.', 'error');
    else if (error === 'no_valid_files') showToast(`No valid ${type} PDF files found`, 'error');
    else if (error === 'print_failed') showToast('Print failed. Check popup blocker settings.', 'error');
  }, [sessions, showToast]);

  // --- Save annotated PDF ---
  const handleSaveAnnotated = useCallback(async () => {
    if (!selectedEntry?.exercise || !pdfData) return;
    await saveAnnotatedPdf(
      pdfData,
      getExercisePageNumbers(selectedEntry.exercise),
      currentAnnotations,
      stamp,
      `${exerciseLabel || "exercise"}-annotated.pdf`
    );
  }, [selectedEntry, pdfData, currentAnnotations, stamp, exerciseLabel]);

  // --- Retry ---
  const handleRetry = useCallback(() => {
    if (!selectedEntry?.exercise?.pdf_name) return;
    pdfCacheRef.current.delete(selectedEntry.exercise.pdf_name);
    setSelectedEntry({ ...selectedEntry });
  }, [selectedEntry]);

  // --- Header annotation toggle ---
  const handleHeaderAnnotationToggle = useCallback(() => {
    if (drawingEnabled) {
      setDrawingEnabled(false);
      setAnnotationTool("pen");
    } else {
      setDrawingEnabled(true);
    }
  }, [drawingEnabled]);

  // --- Student switcher for by-file mode ---
  const currentFileGroup = useMemo(() => {
    if (!selectedEntry) return null;
    return fileGroups.find(g =>
      g.pdfName === selectedEntry.exercise.pdf_name &&
      g.entries.some(e => e.exercise.id === selectedEntry.exercise.id)
    ) ?? null;
  }, [selectedEntry, fileGroups]);

  const handleStudentSwitch = useCallback((entry: StudentExerciseEntry) => {
    setSelectedEntry(entry);
  }, []);

  // --- Keyboard shortcuts ---
  useStableKeyboardHandler(useCallback((e: KeyboardEvent) => {
    // Skip when modals are open or input is focused
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (exerciseModalSession) return;

    switch (e.key) {
      case "Escape":
        if (showShortcutHelp) { setShowShortcutHelp(false); break; }
        if (drawingEnabled) { setDrawingEnabled(false); setAnnotationTool("pen"); break; }
        if (focusMode) { exitFocusMode(); break; }
        break;
      case "j":
      case "ArrowDown":
        e.preventDefault();
        navigateExercise(1);
        break;
      case "k":
      case "ArrowUp":
        e.preventDefault();
        navigateExercise(-1);
        break;
      case "Tab":
        if (currentFileGroup && currentFileGroup.entries.length > 1) {
          e.preventDefault();
          navigateStudent(e.shiftKey ? -1 : 1);
        }
        break;
      case "d":
        toggleAnnotationTool("pen");
        break;
      case "e":
        toggleAnnotationTool("eraser");
        break;
      case "z":
        if (drawingEnabled) {
          e.shiftKey ? handleRedo() : handleUndo();
        }
        break;
      case "p":
        handlePrint();
        break;
      case "a":
        handleAnswerKeyToggle();
        break;
      case "f":
        toggleFocusMode();
        break;
      case "?":
        setShowShortcutHelp(v => !v);
        break;
      case "+":
      case "=":
      case "-":
        // Let PdfPageViewer handle zoom
        break;
    }
  }, [
    exerciseModalSession, showShortcutHelp, drawingEnabled, focusMode,
    currentFileGroup, toggleAnnotationTool, handleRedo, handleUndo,
    handlePrint, handleAnswerKeyToggle, toggleFocusMode, exitFocusMode,
  ]));

  // Navigate between exercises (j/k)
  const navigateExercise = useCallback((direction: 1 | -1) => {
    if (!selectedEntry || allEntries.length === 0) return;

    if (sidebarMode === "by-file") {
      // Navigate between file groups
      const groupIdx = fileGroups.findIndex(g =>
        g.pdfName === selectedEntry.exercise.pdf_name &&
        g.entries.some(e => e.exercise.id === selectedEntry.exercise.id)
      );
      const nextGroupIdx = groupIdx + direction;
      if (nextGroupIdx >= 0 && nextGroupIdx < fileGroups.length) {
        const nextGroup = fileGroups[nextGroupIdx];
        setSelectedEntry(nextGroup.entries[0]);
      }
    } else {
      // Navigate linearly through all entries
      const currentIdx = allEntries.findIndex(
        e => e.exercise.id === selectedEntry.exercise.id && e.session.id === selectedEntry.session.id
      );
      const nextIdx = currentIdx + direction;
      if (nextIdx >= 0 && nextIdx < allEntries.length) {
        setSelectedEntry(allEntries[nextIdx]);
      }
    }
  }, [selectedEntry, allEntries, fileGroups, sidebarMode]);

  // Navigate between students within a file group (Tab)
  const navigateStudent = useCallback((direction: 1 | -1) => {
    if (!selectedEntry || !currentFileGroup) return;
    const entries = currentFileGroup.entries;
    const currentIdx = entries.findIndex(
      e => e.exercise.id === selectedEntry.exercise.id && e.session.id === selectedEntry.session.id
    );
    const nextIdx = (currentIdx + direction + entries.length) % entries.length;
    setSelectedEntry(entries[nextIdx]);
  }, [selectedEntry, currentFileGroup]);

  // --- Sidebar resize ---
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = currentWidthRef.current;

    const handleMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const dx = e.clientX - startXRef.current;
      const newWidth = Math.min(600, Math.max(220, startWidthRef.current + dx));
      currentWidthRef.current = newWidth;
      setSidebarWidth(newWidth);
    };

    const handleUp = () => {
      isResizingRef.current = false;
      try {
        localStorage.setItem("lesson-sidebar-width", String(currentWidthRef.current));
      } catch {}
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    resizeCleanupRef.current = handleUp;
  }, []);

  useEffect(() => {
    return () => { resizeCleanupRef.current?.(); };
  }, []);

  // --- Render header ---
  const renderHeader = (isOverlay?: boolean) => (
    <div className={cn(
      "relative rounded-2xl bg-gradient-to-br from-[#b89968] via-[#a67c52] to-[#8b6f47] p-1",
      isOverlay && "shadow-lg rounded-3xl"
    )}>
      <div className={cn(
        "flex items-center gap-3 px-3 py-2.5",
        "bg-[#2d4739] dark:bg-[#1a2821]",
        "shadow-inner rounded-[12px]",
        isOverlay && "rounded-[20px]"
      )} style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.4)' }}>
        {/* Exit button — closes tab */}
        <button
          onClick={focusMode ? exitFocusMode : () => window.close()}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          title={focusMode ? "Exit focus mode (Esc)" : "Close lesson tab"}
        >
          <ArrowLeft className="h-4 w-4 text-white/80" />
        </button>

        {/* Lesson info */}
        <div className="flex items-center gap-2 min-w-0">
          <Users className="h-4 w-4 text-white/70 flex-shrink-0" />
          <span className="text-sm font-bold text-white/90 truncate">
            {tutorName ? `${tutorName} — ${slot}` : slot}
          </span>
          <span className="text-xs text-white/50">
            ({sessions.length} student{sessions.length !== 1 ? "s" : ""})
          </span>
        </div>

        {/* Current student info */}
        {selectedEntry && (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-white/40">&bull;</span>
            {studentIdDisplay && (
              <span className="text-xs text-white/60 font-mono">{studentIdDisplay}</span>
            )}
            <span className="text-xs font-medium text-white/80 truncate">
              {selectedEntry.studentName}
            </span>
            {selectedEntry.grade && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-medium text-gray-800"
                style={{ backgroundColor: getGradeColor(selectedEntry.grade, selectedEntry.langStream) }}
              >
                {selectedEntry.grade}{selectedEntry.langStream || ""}
              </span>
            )}
          </div>
        )}

        {/* Metadata badges */}
        <div className="hidden sm:flex items-center gap-2 text-xs text-white/70 font-medium">
          <span className="text-white/40">&bull;</span>
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3 text-white/80" />
            <span>{formatShortDate(date)}</span>
          </div>
          {sessions[0]?.location && (
            <>
              <span className="text-white/40">&bull;</span>
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3 text-white/80" />
                <span>{sessions[0].location}</span>
              </div>
            </>
          )}
        </div>

        <div className="flex-1" />

        {/* Annotation mode toggle */}
        {selectedEntry?.exercise?.pdf_name && (
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

        {/* Bulk print dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowPrintMenu(v => !v)}
            className={cn(
              "p-1.5 rounded-lg transition-colors flex items-center gap-0.5",
              showPrintMenu ? "bg-white/20 text-white" : "hover:bg-white/10 text-white/70"
            )}
            title="Print all exercises"
          >
            <Printer className="h-3.5 w-3.5" />
            <ChevronDown className="h-2.5 w-2.5" />
          </button>
          <AnimatePresence>
            {showPrintMenu && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[60]"
                  onClick={() => setShowPrintMenu(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.1 }}
                  className="absolute right-0 top-full mt-1 z-[61] bg-[#2d4739] text-white rounded-lg shadow-xl border border-white/10 py-1 w-40"
                  style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.4)' }}
                >
                  <button
                    onClick={() => handleBulkPrint('CW')}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 transition-colors"
                  >
                    Print all CW
                  </button>
                  <button
                    onClick={() => handleBulkPrint('HW')}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 transition-colors"
                  >
                    Print all HW
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Focus mode toggle */}
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

        {/* Shortcut help */}
        <button
          onClick={() => setShowShortcutHelp(v => !v)}
          className={cn(
            "hidden md:inline-flex p-1.5 rounded-lg transition-colors",
            showShortcutHelp ? "bg-white/20 text-white" : "hover:bg-white/10 text-white/40"
          )}
          title="Keyboard shortcuts (?)"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );

  // Shared sidebar props (rendered in 3 locations: main, focus overlay, mobile sheet)
  const sidebarProps = {
    sessions,
    students,
    fileGroups,
    allEntries,
    sidebarMode,
    onSidebarModeChange: setSidebarMode,
    selectedEntry,
    onEntrySelect: setSelectedEntry,
    onEditExercises: handleEditExercises,
    isReadOnly,
    hasAnnotations: checkHasAnnotations,
    selectedLocation,
    onPrint: handlePrint,
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col flex-1 min-h-0 relative"
    >
      {/* Header */}
      {!focusMode && renderHeader()}

      {/* Shortcut help panel */}
      <AnimatePresence>
        {showShortcutHelp && (
          <>
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
                  ["Tab", "Switch student"],
                  ["+  / -", "Zoom in / out"],
                  ["d", "Pen tool"],
                  ["e", "Eraser tool"],
                  ["z / Z", "Undo / Redo"],
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
        {/* Sidebar */}
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
              <LessonWideSidebar {...sidebarProps} />
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

        {/* PDF Viewer area */}
        <div className="flex flex-col flex-1 min-h-0 min-w-0">
          {/* Student switcher bar (by-file mode, shared exercises) */}
          {currentFileGroup && currentFileGroup.entries.length > 1 && (
            <StudentSwitcher
              entries={currentFileGroup.entries}
              selectedEntry={selectedEntry}
              onSelect={handleStudentSwitch}
              selectedLocation={selectedLocation}
            />
          )}

          {/* Mobile tab bar when answer key is shown */}
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

          {/* PDF viewers */}
          <div className={cn("flex flex-1 min-h-0 min-w-0", !isMobile && showAnswerKey && answerPdfData && "gap-0")}>
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
                      <button onClick={handleRetry} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-[#a0704b] text-white hover:bg-[#8b6040] transition-colors">
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
                  exerciseId={selectedEntry?.exercise?.id}
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

            {/* Answer key viewer */}
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

      {/* Focus mode hover overlays */}
      {focusMode && !isMobile && (
        <>
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
            {hoverHeader && renderHeader(true)}
          </div>

          <div
            className="absolute top-0 left-0 bottom-0 z-50"
            style={{ width: hoverSidebar ? sidebarWidth : 8 }}
            onMouseEnter={() => setHoverSidebar(true)}
            onMouseLeave={() => setHoverSidebar(false)}
          >
            {hoverSidebar && (
              <div className="h-full bg-[#faf5ed] dark:bg-[#1e1a14] border-r border-[#d4c4a8] dark:border-[#3a3228] shadow-lg">
                <LessonWideSidebar {...sidebarProps} />
              </div>
            )}
          </div>
        </>
      )}

      {/* Mobile exercise list bottom sheet */}
      {isMobile && (
        <MobileBottomSheet
          isOpen={mobileExerciseListOpen}
          onClose={() => setMobileExerciseListOpen(false)}
          title="Exercises"
        >
          <LessonWideSidebar
            {...sidebarProps}
            onEntrySelect={(entry) => {
              setSelectedEntry(entry);
              setMobileExerciseListOpen(false);
            }}
          />
        </MobileBottomSheet>
      )}

      {/* Exercise modal */}
      {exerciseModalSession && exerciseModalType && (
        <ExerciseModal
          session={exerciseModalSession}
          exerciseType={exerciseModalType}
          isOpen
          onClose={handleExerciseModalClose}
        />
      )}
    </motion.div>
  );
}
