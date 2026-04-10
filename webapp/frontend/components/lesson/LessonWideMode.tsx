"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ArrowLeft, Calendar, MapPin, HelpCircle, Printer, ChevronDown,
  Maximize2, Minimize2, PencilLine, Users,
  AlertTriangle, LayoutList, PenTool, BookOpen, Loader2, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getGradeColor } from "@/lib/constants";
import { getDisplayName, getExerciseDisplayName, parseExerciseRemarks, toEmbedUrl } from "@/lib/exercise-utils";
import { getExercisePageNumbers, getAnswerPageNumbers, getStudentIdDisplay, getPrintButtonTitle, compareByStudentId, usePrintingState } from "@/lib/lesson-utils";
import { loadExercisePdf } from "@/lib/lesson-pdf-loader";
import { printFileFromPathWithFallback } from "@/lib/file-system";
import { formatShortDate } from "@/lib/formatters";
import { useLocation } from "@/contexts/LocationContext";
import { LessonWideSidebar } from "./LessonWideSidebar";
import { StudentSwitcher } from "./StudentSwitcher";
import { PdfPageViewer } from "./PdfPageViewer";
import { ExerciseModal } from "@/components/sessions/ExerciseModal";
import { BulkExerciseModal } from "@/components/sessions/BulkExerciseModal";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { motion, AnimatePresence } from "framer-motion";
import { useAnnotations } from "@/hooks/useAnnotations";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileBottomSheet } from "@/components/ui/mobile-bottom-sheet";
import { searchAnswerFile, type AnswerSearchResult } from "@/lib/answer-file-utils";
import { useStableKeyboardHandler } from "@/hooks/useStableKeyboardHandler";
import { saveAnnotatedPdf } from "@/lib/pdf-annotation-save";
import { downloadBlob } from "@/lib/geometry-utils";
import { ExitConfirmDialog } from "./ExitConfirmDialog";
import { groupExercisesByStudent, bulkPrintAllStudents, type StudentExerciseGroup } from "@/lib/bulk-exercise-download";
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

  // --- Bulk exercise assignment ---
  const [bulkAssignType, setBulkAssignType] = useState<"CW" | "HW" | null>(null);
  const [bulkSessionIds, setBulkSessionIds] = useState<Set<number>>(new Set());

  const handleBulkAssign = useCallback((type: "CW" | "HW", sessionIds?: number[]) => {
    if (sessionIds) {
      setBulkSessionIds(new Set(sessionIds));
      setBulkAssignType(type);
    }
  }, []);
  const handleBulkAssignClose = useCallback(() => {
    setBulkAssignType(null);
    setBulkSessionIds(new Set());
    onSessionDataChange();
  }, [onSessionDataChange]);

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
  const hoverSidebarTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

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
          displayName: getExerciseDisplayName(entry.exercise),
          exerciseType: type,
          entries: [],
        };
        map.set(key, group);
      }
      group.entries.push(entry);
    }
    // Sort entries within each group by student ID, then name (match "by student" tab order)
    for (const group of map.values()) {
      group.entries.sort((a, b) => compareByStudentId(a.studentId, a.studentName, b.studentId, b.studentName));
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
    return Array.from(seen.values()).sort((a, b) =>
      compareByStudentId(a.school_student_id, a.student_name, b.school_student_id, b.student_name)
    );
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
    : selectedEntry?.exercise?.url
      ? getExerciseDisplayName(selectedEntry.exercise)
      : undefined;

  // --- Browser tab title ---
  useEffect(() => {
    const parts = [slot, tutorName, "Lesson"].filter(Boolean);
    document.title = parts.join(" - ");
  }, [slot, tutorName]);

  // --- Focus mode helpers ---
  const exitFocusMode = useCallback(() => {
    clearTimeout(hoverHeaderTimerRef.current);
    hoverHeaderTimerRef.current = undefined;
    clearTimeout(hoverSidebarTimerRef.current);
    hoverSidebarTimerRef.current = undefined;
    setFocusMode(false);
    setHoverHeader(false);
    setHoverSidebar(false);
  }, []);

  const toggleFocusMode = useCallback(() => {
    setFocusMode(fm => !fm);
    setHoverHeader(false);
    setHoverSidebar(false);
  }, []);

  // Focus mode: document-level mousemove for hover detection
  // Two-threshold: 5px "arm zone" at edge starts timer, 48px "keep-alive zone" prevents cancellation
  const HEADER_ARM_PX = 5;
  const HEADER_ZONE_PX = 48;
  const SIDEBAR_ZONE_PX = 48;
  useEffect(() => {
    if (!focusMode || isMobile) return;

    const onMouseMove = (e: MouseEvent) => {
      // Header: two-threshold — arm at edge, keep alive in zone
      if (!hoverHeader) {
        if (e.clientY <= HEADER_ARM_PX && !hoverHeaderTimerRef.current) {
          hoverHeaderTimerRef.current = setTimeout(() => setHoverHeader(true), 200);
        } else if (e.clientY > HEADER_ZONE_PX) {
          clearTimeout(hoverHeaderTimerRef.current);
          hoverHeaderTimerRef.current = undefined;
        }
      }

      // Sidebar: simple 48px zone (no toolbar conflict on left edge)
      if (e.clientX <= SIDEBAR_ZONE_PX && !hoverSidebar) {
        if (!hoverSidebarTimerRef.current) {
          hoverSidebarTimerRef.current = setTimeout(() => setHoverSidebar(true), 100);
        }
      } else if (e.clientX > SIDEBAR_ZONE_PX && !hoverSidebar) {
        clearTimeout(hoverSidebarTimerRef.current);
        hoverSidebarTimerRef.current = undefined;
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      clearTimeout(hoverHeaderTimerRef.current);
      hoverHeaderTimerRef.current = undefined;
      clearTimeout(hoverSidebarTimerRef.current);
      hoverSidebarTimerRef.current = undefined;
    };
  }, [focusMode, isMobile, hoverHeader, hoverSidebar]);

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

    // URL-only exercises: skip PDF loading
    if (exercise?.url && !exercise?.pdf_name) {
      setPdfData(null);
      setPageNumbers([]);
      setPdfLoading(false);
      setPdfError(null);
      return;
    }

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
  const { printing, setPrinting, paperlessSearchWithProgress } = usePrintingState();

  const handlePrint = useCallback(async (entry?: StudentExerciseEntry) => {
    const target = entry || selectedEntry;
    if (!target?.exercise?.pdf_name) return;
    setPrinting({ id: target.exercise.id, progress: null });
    try {
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
        entryStamp,
        paperlessSearchWithProgress
      );
    } finally {
      setPrinting({ id: null, progress: null });
    }
  }, [selectedEntry, paperlessSearchWithProgress]);

  // --- Bulk print ---
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const handleBulkPrint = useCallback(async (type: 'CW' | 'HW') => {
    setShowPrintMenu(false);
    const groups = groupExercisesByStudent(sessions, type);
    if (groups.length === 0) {
      showToast(`No ${type} exercises found`, 'info');
      return;
    }
    setPrinting({ id: -1, progress: null });
    try {
      const error = await bulkPrintAllStudents(groups, paperlessSearchWithProgress);
      if (error === 'not_supported') showToast('File System Access not supported. Use Chrome/Edge.', 'error');
      else if (error === 'no_valid_files') showToast(`No valid ${type} PDF files found`, 'error');
      else if (error === 'print_failed') showToast('Print failed. Check popup blocker settings.', 'error');
    } finally {
      setPrinting({ id: null, progress: null });
    }
  }, [sessions, showToast, paperlessSearchWithProgress]);

  // --- Print file group (one file, all students) ---
  const handlePrintFileGroup = useCallback(async (group: FileGroup) => {
    if (group.entries.length === 1) {
      handlePrint(group.entries[0]);
      return;
    }
    setPrinting({ id: -2, progress: null });
    try {
      const groups: StudentExerciseGroup[] = group.entries
        .filter(e => e.exercise.pdf_name?.trim())
        .map(entry => {
          const { complexPages } = parseExerciseRemarks(entry.exercise.remarks);
          return {
          studentId: entry.session.student_id,
          studentName: entry.session.student_name ?? 'Unknown',
          schoolStudentId: entry.session.school_student_id ?? '',
          location: entry.session.location ?? '',
          sessionDate: entry.session.session_date,
          timeSlot: entry.session.time_slot,
          exercises: [{
            pdf_name: entry.exercise.pdf_name,
            page_start: entry.exercise.page_start,
            page_end: entry.exercise.page_end,
            complex_pages: complexPages || undefined,
          }],
          stamp: {
            location: entry.session.location,
            schoolStudentId: entry.session.school_student_id,
            studentName: entry.session.student_name,
            sessionDate: entry.session.session_date,
            sessionTime: entry.session.time_slot,
          },
          filename: `${group.exerciseType}_${entry.session.school_student_id || ''}_${entry.session.student_name}`,
        };
        });
      if (groups.length === 0) return;
      const error = await bulkPrintAllStudents(groups, paperlessSearchWithProgress);
      if (error === 'not_supported') showToast('File System Access not supported. Use Chrome/Edge.', 'error');
      else if (error === 'no_valid_files') showToast('No valid PDF files found', 'error');
      else if (error === 'print_failed') showToast('Print failed. Check popup blocker settings.', 'error');
    } finally {
      setPrinting({ id: null, progress: null });
    }
  }, [handlePrint, showToast, paperlessSearchWithProgress]);

  // --- Bulk print all CW or HW for a single student ---
  const handleBulkPrintStudent = useCallback(async (session: Session, type: 'CW' | 'HW') => {
    const groups = groupExercisesByStudent([session], type);
    if (groups.length === 0) {
      showToast(`No ${type} exercises found`, 'info');
      return;
    }
    setPrinting({ id: -session.id, progress: null });
    try {
      const error = await bulkPrintAllStudents(groups, paperlessSearchWithProgress);
      if (error === 'not_supported') showToast('File System Access not supported. Use Chrome/Edge.', 'error');
      else if (error === 'no_valid_files') showToast(`No valid ${type} PDF files found`, 'error');
      else if (error === 'print_failed') showToast('Print failed. Check popup blocker settings.', 'error');
    } finally {
      setPrinting({ id: null, progress: null });
    }
  }, [showToast, paperlessSearchWithProgress]);

  // --- Save annotated PDF ---
  const handleSaveAnnotated = useCallback(async () => {
    if (!selectedEntry?.exercise || !pdfData) return;
    const blob = await saveAnnotatedPdf(
      pdfData,
      getExercisePageNumbers(selectedEntry.exercise),
      stamp,
      currentAnnotations,
    );
    downloadBlob(blob, `${exerciseLabel || "exercise"}-annotated.pdf`);
  }, [selectedEntry, pdfData, currentAnnotations, stamp, exerciseLabel]);

  // --- Exit confirmation ---
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);

  const handleExitAttempt = useCallback(() => {
    if (hasAnyAnnotations()) {
      setShowExitConfirm(true);
    } else {
      window.close();
    }
  }, [hasAnyAnnotations]);

  const handleSaveAllAndExit = useCallback(async () => {
    setIsSavingAll(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const allAnnotationsMap = getAllAnnotations();

      for (const entry of allEntries) {
        const ann = allAnnotationsMap.get(entry.exercise.id);
        if (!ann || !Object.values(ann).some((s) => s.length > 0)) continue;
        if (!entry.exercise.pdf_name) continue;

        const cached = pdfCacheRef.current.get(entry.exercise.pdf_name);
        if (!cached) continue;

        const entryStamp: PrintStampInfo = {
          location: entry.session.location,
          schoolStudentId: entry.studentId || undefined,
          studentName: entry.studentName,
          sessionDate: entry.session.session_date,
          sessionTime: entry.session.time_slot,
        };

        const pages = getExercisePageNumbers(entry.exercise);
        const blob = await saveAnnotatedPdf(cached, pages, entryStamp, ann);
        const label = `${entry.studentName}-${entry.exercise.pdf_name ? getDisplayName(entry.exercise.pdf_name) : 'exercise'}`;
        zip.file(`annotated-${label}.pdf`, blob);
      }

      const parts = ["Annotations", date, slot].filter(Boolean);
      const zipName = parts.join("_").replace(/\s+/g, "-") + ".zip";

      const zipBlob = await zip.generateAsync({ type: "blob" });
      downloadBlob(zipBlob, zipName);
      clearStorage();
      setIsSavingAll(false);
      setShowExitConfirm(false);
      window.close();
    } catch (err) {
      console.error("Failed to save annotated PDFs:", err);
      setIsSavingAll(false);
    }
  }, [allEntries, getAllAnnotations, date, slot, clearStorage]);

  // --- beforeunload warning ---
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasAnyAnnotations()) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasAnyAnnotations]);

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
    if (exerciseModalSession || showExitConfirm) return;

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
      case "s":
        if (exerciseHasAnnotations) handleSaveAnnotated();
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
    exerciseModalSession, showExitConfirm, showShortcutHelp, drawingEnabled, focusMode,
    currentFileGroup, toggleAnnotationTool, handleRedo, handleUndo,
    handlePrint, handleAnswerKeyToggle, toggleFocusMode, exitFocusMode,
    exerciseHasAnnotations, handleSaveAnnotated,
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
        "flex items-center gap-1.5 sm:gap-3 px-2 py-2 sm:px-3 sm:py-2.5",
        "bg-[#2d4739] dark:bg-[#1a2821]",
        "shadow-inner rounded-[12px]",
        isOverlay && "rounded-[20px]"
      )} style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.4)' }}>
        {/* Exit button — closes tab (with annotation warning) */}
        <button
          onClick={focusMode ? exitFocusMode : handleExitAttempt}
          className="p-1 sm:p-1.5 rounded-lg hover:bg-white/10 transition-colors"
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
          <span className="hidden sm:inline text-xs text-white/50">
            ({sessions.length} student{sessions.length !== 1 ? "s" : ""})
          </span>
        </div>

        {/* Current student info */}
        {selectedEntry && (
          <div className="hidden sm:flex items-center gap-2 min-w-0">
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
              "p-1 sm:p-1.5 rounded-lg transition-colors",
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
            onClick={() => { if (printing.id === null) setShowPrintMenu(v => !v); }}
            disabled={printing.id !== null}
            className={cn(
              "p-1 sm:p-1.5 rounded-lg transition-colors flex items-center gap-0.5",
              printing.id !== null ? "bg-white/20 text-white" : showPrintMenu ? "bg-white/20 text-white" : "hover:bg-white/10 text-white/70"
            )}
            title={getPrintButtonTitle(printing.id !== null, printing.progress, "Print all exercises")}
          >
            {printing.id !== null ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Printer className="h-3.5 w-3.5" />
            )}
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
                  className="absolute right-0 top-full mt-1 z-[61] bg-[#2d4739] dark:bg-[#1a2821] border border-white/10 rounded-lg shadow-xl overflow-hidden min-w-[140px]"
                >
                  <button
                    onClick={() => handleBulkPrint('CW')}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/80 hover:bg-white/10 transition-colors"
                  >
                    <PenTool className="h-3 w-3 text-rose-400" /> Print all CW
                  </button>
                  <button
                    onClick={() => handleBulkPrint('HW')}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/80 hover:bg-white/10 transition-colors"
                  >
                    <BookOpen className="h-3 w-3 text-blue-400" /> Print all HW
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
    onPrintFileGroup: handlePrintFileGroup,
    onBulkPrintStudent: handleBulkPrintStudent,
    onBulkAssign: handleBulkAssign,
    printing,
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
                  ["s", "Save annotated PDF"],
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
              selectedEntry?.exercise?.url && !selectedEntry?.exercise?.pdf_name ? (
                /* URL exercise: iframe embed or open-in-new-tab */
                <div className={cn("flex-1 flex flex-col min-h-0 bg-[#e8dcc8] dark:bg-[#1e1a14]", isMobile && "pb-20")}>
                  {(() => {
                    const embedUrl = toEmbedUrl(selectedEntry.exercise.url!);
                    if (embedUrl) {
                      return (
                        <>
                          <iframe
                            src={embedUrl}
                            className="w-full border-0 rounded"
                            style={{ flex: 1, minHeight: 0 }}
                            allow="autoplay; fullscreen"
                            allowFullScreen
                            title={getExerciseDisplayName(selectedEntry.exercise)}
                          />
                          {isMobile && (
                            <a
                              href={selectedEntry.exercise.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center gap-1.5 py-2 text-xs text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Open in app for full controls
                            </a>
                          )}
                        </>
                      );
                    }
                    return (
                      <div className="flex-1 flex flex-col items-center justify-center gap-4">
                        <p className="text-sm text-[#8b7355] dark:text-[#a09080]">
                          This resource cannot be embedded directly.
                        </p>
                        <a
                          href={selectedEntry.exercise.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        >
                          Open in new tab
                        </a>
                      </div>
                    );
                  })()}
                </div>
              ) : (
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
              )
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

      {/* Focus mode hover overlays — detection via document mousemove, these are render-only */}
      {focusMode && !isMobile && (
        <>
          {/* Header overlay */}
          <div
            className="absolute top-0 left-0 right-0 z-50"
            style={{ height: hoverHeader ? 'auto' : 0 }}
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

          {/* Sidebar overlay */}
          <div
            className="absolute top-0 left-0 bottom-0 z-50"
            style={{ width: hoverSidebar ? sidebarWidth : 0 }}
            onMouseLeave={() => setHoverSidebar(false)}
          >
            <AnimatePresence>
              {hoverSidebar && (
                <motion.div
                  initial={{ x: "-100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "-100%" }}
                  transition={{ duration: 0.15 }}
                  className="h-full bg-[#faf5ed] dark:bg-[#1e1a14] border-r border-[#d4c4a8] dark:border-[#3a3228] shadow-lg"
                  style={{ width: sidebarWidth }}
                >
                  <LessonWideSidebar {...sidebarProps} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
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

      {/* Exercise modal (single student) */}
      {exerciseModalSession && exerciseModalType && (
        <ExerciseModal
          session={exerciseModalSession}
          exerciseType={exerciseModalType}
          isOpen
          onClose={handleExerciseModalClose}
        />
      )}

      {/* Bulk exercise modal (multiple students) */}
      {bulkAssignType && bulkSessionIds.size > 0 && (
        <BulkExerciseModal
          sessions={sessions.filter(s => bulkSessionIds.has(s.id))}
          exerciseType={bulkAssignType}
          isOpen
          onClose={handleBulkAssignClose}
        />
      )}

      {/* Exit confirmation dialog */}
      {showExitConfirm && (
        <ExitConfirmDialog
          isOpen={showExitConfirm}
          isSaving={isSavingAll}
          onCancel={() => setShowExitConfirm(false)}
          onSaveAndExit={handleSaveAllAndExit}
          onExit={() => {
            clearStorage();
            window.close();
          }}
        />
      )}
    </motion.div>
  );
}
