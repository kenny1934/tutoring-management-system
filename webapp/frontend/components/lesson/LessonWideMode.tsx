"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ArrowLeft, Calendar, MapPin, HelpCircle, Printer, ChevronDown, Sigma,
  Maximize2, Minimize2, Users,
  AlertTriangle, LayoutList, PenTool, BookOpen, Loader2, ExternalLink, Home, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getDisplayName, getExerciseDisplayName, parseExerciseRemarks, toEmbedUrl } from "@/lib/exercise-utils";
import { getExercisePageNumbers, getAnswerPageNumbers, getPrintButtonTitle, compareByStudentId, inkHistoryKey, hasBrowserModifier, inkLocation, replacedInkMessage, loopStep, printErrorMessage, bulkPrintErrorMessage, NO_FILE_ERROR, NO_EXERCISES_MESSAGE, usePrintingState } from "@/lib/lesson-utils";
import { cachedPdf, loadExercisePdf, prefetchPdfs, rememberPdf, PDF_CACHE_SIZE } from "@/lib/lesson-pdf-loader";
import { usePdfCache, useExercisePdf } from "@/hooks/useExercisePdf";
import { printFileFromPathWithFallback, printPdfBlob } from "@/lib/file-system";
import { formatShortDate } from "@/lib/formatters";
import { useLocation } from "@/contexts/LocationContext";
import { LessonWideSidebar } from "./LessonWideSidebar";
import { useHomeworkToCheck } from "@/lib/hooks";
import { useHomeworkMarked } from "@/components/homework/useHomeworkMarked";
import { checkedCount, homeworkCountLabel } from "@/lib/homework-utils";
import { StudentStrip, stripLabel } from "./StudentStrip";
import { PdfPageViewer, type PdfViewState } from "./PdfPageViewer";
import { DraftPane, DraftTrayLane } from "./DraftPane";
import { FoldingAnswerKey } from "./FoldingAnswerKey";
import { FocusSidebarButton, LeaveFocusButton } from "./FocusModeButtons";
import { ExerciseModal } from "@/components/sessions/ExerciseModal";
import { BulkExerciseModal } from "@/components/sessions/BulkExerciseModal";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { motion, AnimatePresence } from "framer-motion";
import { useAnnotations, type ReplacedInk } from "@/hooks/useAnnotations";
import { useAuth } from "@/contexts/AuthContext";
import { InkSaveStatus } from "./InkSaveStatus";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileBottomSheet } from "@/components/ui/mobile-bottom-sheet";
import { searchAnswerFile, type AnswerSearchResult } from "@/lib/answer-file-utils";
import { useStableKeyboardHandler } from "@/hooks/useStableKeyboardHandler";
import { useSidebarWidth } from "@/hooks/useSidebarWidth";
import { SidebarResizeHandle } from "./SidebarResizeHandle";
import { useFocusMode } from "@/hooks/useFocusMode";
import { FocusOverlays } from "./FocusOverlays";
import { saveAnnotatedPdf } from "@/lib/pdf-annotation-save";
import { buildAnnotatedZip, saveAllFailedMessage, SAVE_FAILED_MESSAGE, type AnnotatedExercise } from "@/lib/annotated-zip";
import { downloadBlob } from "@/lib/geometry-utils";
import { ExitConfirmDialog } from "./ExitConfirmDialog";
import { WolframPanel } from "./WolframPanel";
import { groupExercisesByStudent, bulkPrintAllStudents, type StudentExerciseGroup } from "@/lib/bulk-exercise-download";
import { isPreviewExercise } from "@/lib/summer-courseware-session";
import { useToast } from "@/contexts/ToastContext";
import type { PrintStampInfo } from "@/lib/pdf-utils";
import type { PageAnnotations, Stroke } from "@/hooks/useAnnotations";
import { useAnnotationTools } from "@/hooks/useAnnotationTools";
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

/** Classwork or homework, whichever way the exercise's type is spelt. */
const exerciseKind = (exercise: SessionExercise): "CW" | "HW" =>
  exercise.exercise_type === "Classwork" || exercise.exercise_type === "CW" ? "CW" : "HW";

/**
 * The student stamp on a worksheet's pages. Every stamp this view builds for
 * itself comes from here, so the board, a printed worksheet and "Download All"
 * all show the same student.
 */
function stampFor(session: Session): PrintStampInfo {
  return {
    location: session.location,
    schoolStudentId: session.school_student_id,
    studentName: session.student_name,
    sessionDate: session.session_date,
    sessionTime: session.time_slot,
  };
}

/** How "Download All" saves a worksheet's ink. A preview is class-wide, so it has no student stamp. */
function describeForZip(entry: StudentExerciseEntry): AnnotatedExercise | null {
  if (!entry.exercise.pdf_name) return null;
  return {
    pdfName: entry.exercise.pdf_name,
    pageNumbers: getExercisePageNumbers(entry.exercise),
    stamp: isPreviewExercise(entry.exercise) ? undefined : stampFor(entry.session),
    name: `annotated-${entry.studentName}-${getDisplayName(entry.exercise.pdf_name)}`,
  };
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

  // --- The open worksheet's file, loaded through the one cache everything in this view shares ---
  const pdfCache = usePdfCache();
  const { pdfData, pageNumbers, pdfLoading, pdfLoadingMessage, pdfError, retry: handleRetry } =
    useExercisePdf(selectedEntry?.exercise ?? null, pdfCache);

  // Each worksheet's zoom, scroll position and "Hide ink", so switching
  // between students and back finds each one as the tutor left it.
  const viewStatesRef = useRef(new Map<number, PdfViewState>());

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

  // --- Sidebar width, shared with the one-student view ---
  const { width: sidebarWidth, startResize } = useSidebarWidth();

  // --- Focus mode, which phones don't get ---
  const focus = useFocusMode(!isMobile);
  const { focusMode, hoverSidebar, setHoverSidebar, exitFocusMode, toggleFocusMode } = focus;

  // --- Shortcut help ---
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);

  // --- Wolfram Alpha ---
  const [showWolfram, setShowWolfram] = useState(false);

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

  // --- Drawing / Annotations ---
  // Use a combined key for all sessions in this lesson
  const annotationKey = `lesson-wide-annotations-${date}-${slot}-${tutorId}`;
  // Ink is saved to the server for every lesson in the slot. The tab keeps
  // whatever hasn't been sent yet.
  const { user } = useAuth();
  const locateInk = useCallback((exerciseId: number) => {
    const exercise = allEntries.find((entry) => entry.exercise.id === exerciseId)?.exercise
      ?? (selectedEntry?.exercise.id === exerciseId ? selectedEntry.exercise : null);
    return exercise ? inkLocation(exercise) : null;
  }, [allEntries, selectedEntry]);
  // Only the worksheet on screen gets a message. Any other worksheet shows
  // the new ink the next time it's opened.
  const handleInkReplaced = useCallback((pages: ReplacedInk[]) => {
    const onScreen = pages.filter((page) => page.exerciseId === selectedEntry?.exercise.id);
    if (onScreen.length === 0) return;
    const fromOwnTab = !!user?.email && onScreen[0].byEmail === user.email;
    showToast(replacedInkMessage(onScreen.map((page) => page.pageIndex), onScreen[0].byName, fromOwnTab), "info");
  }, [selectedEntry, user, showToast]);
  const {
    getAnnotations, getAllAnnotations, setPageStrokes, undo, redo, setInkSource, getInkSource,
    clearPage, clearAnnotations, clearStorage, hasAnnotations: checkHasAnnotations, hasAnyAnnotations,
    syncStatus, inkReady, inkRevision, hasUnsentInk, flushInk,
  } = useAnnotations<AnnotatedExercise>(annotationKey, {
    sessionIds: sessions.map((s) => s.id),
    locate: locateInk,
    onReplaced: handleInkReplaced,
  });
  // The Pen Tray's tool, colours and sizes. Lessons start on the Hand.
  const tools = useAnnotationTools();
  const drawingEnabled = tools.drawingEnabled;
  // Until the slot's ink has loaded, drawing waits on the Hand. A stroke
  // drawn before then could replace a page's saved ink with only that stroke.
  const { selectHand } = tools;
  useEffect(() => {
    if (!inkReady && drawingEnabled) selectHand();
  }, [inkReady, drawingEnabled, selectHand]);
  const [currentAnnotations, setCurrentAnnotations] = useState<PageAnnotations>({});

  // Whether the Draft is open beside the worksheet
  const [showDraft, setShowDraft] = useState(false);
  // While the Draft is open, the Pen Tray floats in a lane over the worksheet
  // and the Draft together.
  const [trayArea, setTrayArea] = useState<HTMLElement | null>(null);

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

  // File groups: exercises grouped by pdf_name + exercise_type
  const fileGroups = useMemo<FileGroup[]>(() => {
    const map = new Map<string, FileGroup>();
    for (const entry of allEntries) {
      const type = exerciseKind(entry.exercise);
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

  // --- Homework carried in from earlier lessons ---
  // One request covers the whole slot, so the sidebar can offer marking per
  // student without a fetch each.
  const homeworkSessionIds = useMemo(() => sessions.map(s => s.id), [sessions]);
  const { bySession: homeworkBySession } = useHomeworkToCheck(homeworkSessionIds);
  const handleHomeworkMarked = useHomeworkMarked();

  // Slot-wide progress, so a tutor can see at a glance what is left to check.
  const homeworkProgress = useMemo(() => {
    let total = 0;
    let checked = 0;
    for (const items of homeworkBySession.values()) {
      total += items.length;
      checked += checkedCount(items);
    }
    return { total, checked };
  }, [homeworkBySession]);

  // --- Stamp for current selection ---
  // Ephemeral previews (parallel versions) are class-wide, so no
  // per-student stamp.
  const stamp = useMemo<PrintStampInfo | undefined>(() => {
    if (!selectedEntry || isPreviewExercise(selectedEntry.exercise)) return undefined;
    return stampFor(selectedEntry.session);
  }, [selectedEntry]);

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

  // --- Auto-select first entry ---
  useEffect(() => {
    if (allEntries.length > 0 && !selectedEntry) {
      setSelectedEntry(allEntries[0]);
    }
  }, [allEntries, selectedEntry]);

  // --- Sync annotations when selection changes ---
  useEffect(() => {
    if (selectedEntry?.exercise) {
      setCurrentAnnotations(getAnnotations(selectedEntry.exercise.id));
    } else {
      setCurrentAnnotations({});
    }
    // inkRevision goes up when ink arrives from the server, so it's copied again.
  }, [selectedEntry, getAnnotations, inkRevision]);

  // Each worksheet that's opened has how to save it stored next to the ink,
  // so "Download All" can still save the ink once the worksheet has left the
  // students' lists, as a preview has after a reload.
  useEffect(() => {
    if (!selectedEntry) return;
    const source = describeForZip(selectedEntry);
    if (source) setInkSource(selectedEntry.exercise.id, source);
  }, [selectedEntry, setInkSource]);

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
    const cached = pdfCache.get(answerPath);
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
          rememberPdf(pdfCache, PDF_CACHE_SIZE, answerPath, result.data);
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
  }, [showAnswerKey, answerSearchResult, selectedEntry, pdfCache]);

  // --- Annotation callbacks ---
  const handlePageStrokesChange = useCallback((pageIndex: number, strokes: Stroke[]) => {
    if (!selectedEntry?.exercise) return;
    setCurrentAnnotations((prev) => ({ ...prev, [pageIndex]: strokes }));
    setPageStrokes(selectedEntry.exercise.id, pageIndex, strokes);
  }, [selectedEntry, setPageStrokes]);

  // Undo and redo follow the order you drew in, across every page of the exercise.
  const handleUndo = useCallback(() => {
    if (!selectedEntry?.exercise) return;
    const updated = undo(selectedEntry.exercise.id);
    if (updated) setCurrentAnnotations(updated);
  }, [selectedEntry, undo]);

  const handleRedo = useCallback(() => {
    if (!selectedEntry?.exercise) return;
    const updated = redo(selectedEntry.exercise.id);
    if (updated) setCurrentAnnotations(updated);
  }, [selectedEntry, redo]);

  // Both clears can be undone, and the tray offers an Undo straight after each one.
  const handleClearAllAnnotations = useCallback(() => {
    if (!selectedEntry?.exercise) return;
    clearAnnotations(selectedEntry.exercise.id);
    setCurrentAnnotations({});
  }, [selectedEntry, clearAnnotations]);

  const handleClearPage = useCallback((pageIndex: number) => {
    if (!selectedEntry?.exercise) return;
    clearPage(selectedEntry.exercise.id, pageIndex);
    setCurrentAnnotations((prev) => ({ ...prev, [pageIndex]: [] }));
  }, [selectedEntry, clearPage]);

  // The Draft clears one sheet or all of them, either way as one change that one undo brings back.
  const handleClearPages = useCallback((pages: number[]) => {
    if (!selectedEntry?.exercise) return;
    clearAnnotations(selectedEntry.exercise.id, pages);
    setCurrentAnnotations(getAnnotations(selectedEntry.exercise.id));
  }, [selectedEntry, clearAnnotations, getAnnotations]);

  const exerciseHasAnnotations = selectedEntry?.exercise
    ? checkHasAnnotations(selectedEntry.exercise.id)
    : false;

  // The Draft sits beside the worksheet viewer. It isn't offered on phones,
  // and an exercise that's a web link has no viewer for it to sit beside.
  const openExercise = selectedEntry?.exercise ?? null;
  const isLinkExercise = !!openExercise?.url && !openExercise?.pdf_name;
  const draftOpen = showDraft && !isMobile && !!openExercise && !isLinkExercise;

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
      // Class-wide previews (parallel versions): their paths aren't real
      // files, so print the loaded/composed bytes directly — no stamp.
      if (isPreviewExercise(target.exercise)) {
        const result = await loadExercisePdf(target.exercise.pdf_name);
        if ('error' in result) {
          showToast(printErrorMessage(result.error), 'error');
        } else if (!printPdfBlob(new Blob([result.data], { type: 'application/pdf' }))) {
          showToast(printErrorMessage('popup_blocked'), 'error');
        }
        return;
      }
      const { complexPages } = parseExerciseRemarks(target.exercise.remarks);
      const error = await printFileFromPathWithFallback(
        target.exercise.pdf_name,
        target.exercise.page_start,
        target.exercise.page_end,
        complexPages || undefined,
        stampFor(target.session),
        paperlessSearchWithProgress
      );
      if (error) showToast(printErrorMessage(error), 'error');
    } finally {
      setPrinting({ id: null, progress: null });
    }
  }, [selectedEntry, paperlessSearchWithProgress, showToast]);

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
      if (error) showToast(bulkPrintErrorMessage(error, type), 'error');
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
          stamp: stampFor(entry.session),
          filename: `${group.exerciseType}_${entry.session.school_student_id || ''}_${entry.session.student_name}`,
        };
        });
      if (groups.length === 0) return;
      const error = await bulkPrintAllStudents(groups, paperlessSearchWithProgress);
      if (error) showToast(bulkPrintErrorMessage(error), 'error');
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
      if (error) showToast(bulkPrintErrorMessage(error, type), 'error');
    } finally {
      setPrinting({ id: null, progress: null });
    }
  }, [showToast, paperlessSearchWithProgress]);

  // --- Save annotated PDF ---
  // The file is named after the student as well, so several students' copies
  // of one worksheet don't download as "(1)", "(2)" and so on.
  const handleSaveAnnotated = useCallback(async () => {
    if (!selectedEntry?.exercise || !pdfData) return;
    try {
      const blob = await saveAnnotatedPdf(
        pdfData,
        getExercisePageNumbers(selectedEntry.exercise),
        stamp,
        currentAnnotations,
      );
      downloadBlob(blob, `annotated-${selectedEntry.studentName}-${exerciseLabel || "exercise"}.pdf`);
    } catch (err) {
      console.error("Failed to save annotated PDF:", err);
      showToast(SAVE_FAILED_MESSAGE, 'error');
    }
  }, [selectedEntry, pdfData, currentAnnotations, stamp, exerciseLabel, showToast]);

  // --- Exit confirmation ---
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);

  const handleExitAttempt = useCallback(async () => {
    // Anything still waiting is sent first, so the dialog only appears when
    // some pages can't reach the server.
    if (await flushInk()) {
      clearStorage();
      window.close();
    } else {
      setShowExitConfirm(true);
    }
  }, [flushInk, clearStorage]);

  // Saves every exercise with ink into one ZIP, loading any PDF that isn't in
  // memory, which after a reload is most of them. It resolves to true when
  // every one of them was saved. The header's button and the exit dialog both
  // use it.
  const downloadAllInk = useCallback(async (): Promise<boolean> => {
    setIsSavingAll(true);
    try {
      const describe = (exerciseId: number) => {
        const listed = allEntries.find((e) => e.exercise.id === exerciseId);
        return listed ? describeForZip(listed) : getInkSource(exerciseId) ?? null;
      };
      const { zip, saved, failed } = await buildAnnotatedZip(
        getAllAnnotations(),
        describe,
        (pdfName) => cachedPdf(pdfCache, pdfName),
      );

      if (zip) {
        const parts = ["Annotations", date, slot].filter(Boolean);
        downloadBlob(zip, parts.join("_").replace(/\s+/g, "-") + ".zip");
      }

      if (failed > 0) {
        showToast(saveAllFailedMessage({ saved, failed }), 'error');
        return false;
      }
      return true;
    } catch (err) {
      console.error("Failed to save annotated PDFs:", err);
      showToast(saveAllFailedMessage({ saved: 0, failed: 1 }), 'error');
      return false;
    } finally {
      setIsSavingAll(false);
    }
  }, [allEntries, getAllAnnotations, getInkSource, date, slot, showToast, pdfCache]);

  // The exit dialog's download. The tab closes after it, and any page that
  // never reached the server is in the download.
  const handleSaveAllAndExit = useCallback(async () => {
    const saved = await downloadAllInk();
    setShowExitConfirm(false);
    if (saved) window.close();
  }, [downloadAllInk]);

  // --- beforeunload warning, while some ink hasn't reached the server ---
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsentInk()) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsentInk]);

  // --- Moving between students ---
  // Each student remembers the worksheet they were last on, so going back to
  // them takes one tap and lands where the tutor left off.
  const lastEntryBySessionRef = useRef<Map<number, StudentExerciseEntry>>(new Map());
  useEffect(() => {
    if (selectedEntry && !isPreviewExercise(selectedEntry.exercise)) {
      lastEntryBySessionRef.current.set(selectedEntry.session.id, selectedEntry);
    }
  }, [selectedEntry]);

  // The students with something to show, in the order the sidebar lists them.
  // These are the ones the student strip steps through.
  const studentsWithWork = useMemo(
    () => students.filter(s => allEntries.some(e => e.session.id === s.id)),
    [students, allEntries]
  );

  /**
   * The worksheet to open for a student. It's the file the tutor is on now if
   * that student has it too, so a class working on one sheet can be gone
   * round in turn. Otherwise it's the worksheet they were last on, and
   * failing that, their first.
   */
  const entryForStudent = (session: Session): StudentExerciseEntry | null => {
    const theirs = allEntries.filter(e => e.session.id === session.id);
    if (theirs.length === 0) return null;
    const current = selectedEntry?.exercise;
    const sameFile = current?.pdf_name
      ? theirs.find(e => e.exercise.pdf_name === current.pdf_name && exerciseKind(e.exercise) === exerciseKind(current))
      : undefined;
    if (sameFile) return sameFile;
    const last = lastEntryBySessionRef.current.get(session.id);
    return (last && theirs.find(e => e.exercise.id === last.exercise.id)) || theirs[0];
  };

  const openStudent = (session: Session) => {
    const entry = entryForStudent(session);
    if (entry) setSelectedEntry(entry);
  };

  // The strip's arrows and Tab step through the students in the order the
  // pane lists them, going round from the last back to the first. With the
  // pane grouped by file, that's the students under the worksheet on screen,
  // so the whole class can be gone round on one sheet. Grouped by student,
  // it's every student with work, each on the worksheet entryForStudent picks.
  const fileGroupOnScreen = sidebarMode === "by-file" && selectedEntry
    ? fileGroups.find(g => g.entries.some(e => e.exercise.id === selectedEntry.exercise.id))
    : undefined;
  const stepCount = fileGroupOnScreen ? fileGroupOnScreen.entries.length : studentsWithWork.length;
  // A preview isn't anyone's, so it has no place in the list, and from a
  // preview the next arrow goes to the first student.
  const stepIndex = !selectedEntry || isPreviewExercise(selectedEntry.exercise) ? -1
    : fileGroupOnScreen ? fileGroupOnScreen.entries.findIndex(e => e.exercise.id === selectedEntry.exercise.id)
    : studentsWithWork.findIndex(s => s.id === selectedEntry.session.id);
  const canStep = loopStep(stepIndex, stepCount, 1) !== null;

  const stepEntry = (direction: 1 | -1): StudentExerciseEntry | null => {
    const i = loopStep(stepIndex, stepCount, direction);
    if (i === null) return null;
    return fileGroupOnScreen ? fileGroupOnScreen.entries[i] : entryForStudent(studentsWithWork[i]);
  };

  const navigateStudent = (direction: 1 | -1) => {
    const target = stepEntry(direction);
    if (target) setSelectedEntry(target);
  };

  // Once a worksheet has loaded, fetch the two a tutor is most likely to open
  // next: the next one in the list, and the next student's. Switching is what
  // this view is for, so the first switch shouldn't sit on a loading screen.
  const nextStudentEntry = stepEntry(1);
  useEffect(() => {
    if (!selectedEntry || !pdfData) return;
    const index = allEntries.findIndex(
      e => e.exercise.id === selectedEntry.exercise.id && e.session.id === selectedEntry.session.id
    );
    const names = [allEntries[index + 1]?.exercise.pdf_name, nextStudentEntry?.exercise.pdf_name]
      .filter((name): name is string => !!name);
    return prefetchPdfs(pdfCache, PDF_CACHE_SIZE, names);
  }, [selectedEntry, pdfData, allEntries, nextStudentEntry, pdfCache]);

  // --- Keyboard shortcuts ---
  // The handler is a plain function on purpose. useStableKeyboardHandler picks
  // up the newest one on every render, so it always sees the current state. It
  // used to be memoised, and because the Wolfram panel was missing from its
  // dependencies, keys kept switching exercises behind the open panel.
  useStableKeyboardHandler((e: KeyboardEvent) => {
    // Skip when modals are open or input is focused
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (exerciseModalSession || bulkAssignType || showExitConfirm) return;
    if (showWolfram && e.key !== "Escape") return;

    // Undo and redo work on any tool, the same as the tray's buttons.
    const historyKey = inkHistoryKey(e);
    if (historyKey) {
      if (selectedEntry) {
        e.preventDefault();
        if (historyKey === "undo") handleUndo();
        else handleRedo();
      }
      return;
    }
    if (hasBrowserModifier(e)) return;

    switch (e.key) {
      case "Escape":
        if (showWolfram) { setShowWolfram(false); break; }
        if (showShortcutHelp) { setShowShortcutHelp(false); break; }
        if (drawingEnabled) { tools.selectHand(); break; }
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
        // Tab and Shift+Tab step through the students, like the strip's arrows.
        if (canStep) {
          e.preventDefault();
          navigateStudent(e.shiftKey ? -1 : 1);
        }
        break;
      case "d":
        tools.toggleFromKey("pen");
        break;
      case "e":
        tools.toggleFromKey("eraser");
        break;
      case "p":
        // Like the print buttons, it waits while another print is still being prepared.
        if (printing.id === null) handlePrint();
        break;
      case "a":
        // Only when there's an answer key to show, or it would open an empty pane.
        if (answerSearchResult) handleAnswerKeyToggle();
        break;
      case "s":
        if (exerciseHasAnnotations) handleSaveAnnotated();
        break;
      case "f":
        toggleFocusMode();
        break;
      case "w":
        setShowWolfram(v => !v);
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
  });

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

  // --- Render header ---
  // Header buttons are 40px, big enough to hit with a finger at the board.
  const hdrBtn = "min-w-10 h-10 px-2 inline-flex items-center justify-center rounded-lg transition-colors";

  const renderHeader = (isOverlay?: boolean) => (
    <div className={cn(
      "relative rounded-2xl bg-gradient-to-br from-[#b89968] via-[#a67c52] to-[#8b6f47] p-1",
      isOverlay && "shadow-lg rounded-3xl"
    )}>
      <div className={cn(
        "flex items-center gap-1.5 sm:gap-3 px-2 py-1 sm:px-3 sm:py-1.5",
        "bg-[#2d4739] dark:bg-[#1a2821]",
        "shadow-inner rounded-[12px]",
        isOverlay && "rounded-[20px]"
      )} style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.4)' }}>
        {/* Exit button — closes tab (with annotation warning) */}
        <button
          onClick={focusMode ? exitFocusMode : handleExitAttempt}
          className={cn(hdrBtn, "hover:bg-white/10")}
          title={focusMode ? "Exit focus mode (Esc)" : "Close lesson tab"}
          aria-label={focusMode ? "Exit focus mode" : "Close lesson tab"}
        >
          <ArrowLeft className="h-5 w-5 text-white/80" />
        </button>

        {/* Lesson info */}
        <div className="flex items-center gap-2 min-w-0">
          <Users className="h-4 w-4 text-white/70 flex-shrink-0" />
          <span className="text-sm font-bold text-white/90 truncate">
            {tutorName ? `${tutorName} · ${slot}` : slot}
          </span>
          <span className="hidden sm:inline text-xs text-white/50">
            ({sessions.length} student{sessions.length !== 1 ? "s" : ""})
          </span>
          {homeworkProgress.total > 0 && (
            <span
              className={cn(
                "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums flex-shrink-0",
                homeworkProgress.checked >= homeworkProgress.total
                  ? "bg-white/15 text-white/80"
                  : "bg-amber-400/20 text-amber-200"
              )}
              title={homeworkCountLabel(homeworkProgress.checked, homeworkProgress.total)}
            >
              <Home className="h-2.5 w-2.5" />
              HW {homeworkProgress.checked}/{homeworkProgress.total}
            </span>
          )}
        </div>

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

        <InkSaveStatus status={syncStatus} className="hidden md:inline px-1" />

        {/* Wolfram Alpha toggle */}
        <button
          onClick={() => setShowWolfram(v => !v)}
          className={cn(
            hdrBtn,
            showWolfram ? "bg-white/20 text-white" : "hover:bg-white/10 text-white/70"
          )}
          title="Wolfram Alpha (W)"
          aria-label="Wolfram Alpha"
          aria-pressed={showWolfram}
        >
          <Sigma className="h-5 w-5" />
        </button>

        {/* Download All, at any time. Exit only offers it while some ink hasn't reached the server. */}
        <button
          onClick={() => void downloadAllInk()}
          disabled={isSavingAll || !hasAnyAnnotations()}
          className={cn(hdrBtn, "text-white/70 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent")}
          title="Download all ink as PDFs"
          aria-label="Download all ink as PDFs"
        >
          {isSavingAll ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
        </button>

        {/* Bulk print dropdown */}
        <div className="relative">
          <button
            onClick={() => { if (printing.id === null) setShowPrintMenu(v => !v); }}
            disabled={printing.id !== null}
            className={cn(
              hdrBtn, "gap-0.5",
              printing.id !== null ? "bg-white/20 text-white" : showPrintMenu ? "bg-white/20 text-white" : "hover:bg-white/10 text-white/70"
            )}
            title={getPrintButtonTitle(printing.id !== null, printing.progress, "Print all exercises")}
            aria-label="Print all exercises"
            aria-haspopup="menu"
            aria-expanded={showPrintMenu}
          >
            {printing.id !== null ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Printer className="h-5 w-5" />
            )}
            <ChevronDown className="h-3.5 w-3.5" />
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
          className={cn(hdrBtn, "hidden md:inline-flex hover:bg-white/10")}
          title={focusMode ? "Exit focus mode (F)" : "Focus mode (F)"}
          aria-label="Focus mode"
          aria-pressed={focusMode}
        >
          {focusMode ? (
            <Minimize2 className="h-5 w-5 text-white/70" />
          ) : (
            <Maximize2 className="h-5 w-5 text-white/70" />
          )}
        </button>

        {/* Shortcut help */}
        <button
          onClick={() => setShowShortcutHelp(v => !v)}
          className={cn(
            hdrBtn, "hidden md:inline-flex",
            showShortcutHelp ? "bg-white/20 text-white" : "hover:bg-white/10 text-white/40"
          )}
          title="Keyboard shortcuts (?)"
          aria-label="Keyboard shortcuts"
          aria-pressed={showShortcutHelp}
        >
          <HelpCircle className="h-5 w-5" />
        </button>
      </div>
    </div>
  );

  // In focus mode, the Students button and the way out sit at the two ends of
  // the student strip. With no worksheet picked there's no strip, so they go at
  // the start of the worksheet's toolbar.
  const focusButtons = focusMode && !selectedEntry ? (
    <>
      <FocusSidebarButton icon={Users} label="Students" open={hoverSidebar} onOpen={() => setHoverSidebar(true)} />
      <LeaveFocusButton onLeave={exitFocusMode} />
    </>
  ) : null;

  const answerViewer = (
    <PdfPageViewer
      pdfData={answerPdfData}
      pageNumbers={answerPageNumbers}
      isLoading={answerLoading}
      error={answerError}
      exerciseLabel={exerciseLabel ? `ANS: ${exerciseLabel}` : "Answer Key"}
    />
  );

  // Picking something from the focus-mode sidebar closes it again, since a
  // finger can't move off it the way a mouse does.
  const selectEntry = (entry: StudentExerciseEntry) => {
    setSelectedEntry(entry);
    if (focusMode) setHoverSidebar(false);
  };

  // Shared sidebar props (rendered in 3 locations: main, focus overlay, mobile sheet)
  const sidebarProps = {
    sessions,
    students,
    fileGroups,
    allEntries,
    sidebarMode,
    onSidebarModeChange: setSidebarMode,
    selectedEntry,
    onEntrySelect: selectEntry,
    onStudentOpen: (session: Session) => {
      openStudent(session);
      if (focusMode) setHoverSidebar(false);
    },
    onEditExercises: handleEditExercises,
    isReadOnly,
    hasAnnotations: checkHasAnnotations,
    selectedLocation,
    onPrint: handlePrint,
    onPrintFileGroup: handlePrintFileGroup,
    onBulkPrintStudent: handleBulkPrintStudent,
    onBulkAssign: handleBulkAssign,
    printing,
    homeworkBySession,
    onHomeworkMarked: handleHomeworkMarked,
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
                  ["d", "Pen, or back to the Hand"],
                  ["e", "Eraser, or back to the Hand"],
                  ["z / Z", "Undo / Redo"],
                  ["s", "Save annotated PDF"],
                  ["p", "Print"],
                  ["a", "Answer key"],
                  ["w", "Wolfram Alpha"],
                  ["f", "Focus mode"],
                  ["?", "This help"],
                  ["Esc", "Back"],
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

            <SidebarResizeHandle onResizeStart={startResize} />
          </>
        )}

        {/* PDF Viewer area */}
        <div className="flex flex-col flex-1 min-h-0 min-w-0">
          {/* Whose worksheet this is, in large letters, with arrows to the next student */}
          {selectedEntry && (
            <StudentStrip
              entry={selectedEntry}
              position={stepIndex >= 0 ? { index: stepIndex + 1, total: stepCount } : null}
              onPrevious={canStep ? () => navigateStudent(-1) : undefined}
              onNext={canStep ? () => navigateStudent(1) : undefined}
              selectedLocation={selectedLocation}
              start={focusMode ? (
                <FocusSidebarButton icon={Users} label="Students" open={hoverSidebar} onOpen={() => setHoverSidebar(true)} labelClass={stripLabel} />
              ) : undefined}
              end={focusMode ? <LeaveFocusButton onLeave={exitFocusMode} labelClass={stripLabel} /> : undefined}
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
          <div className={cn(
            "flex flex-1 min-h-0 min-w-0",
            !isMobile && showAnswerKey && answerPdfData && "gap-0",
            draftOpen && "group/viewers relative overflow-hidden @container/viewers",
          )}>
            {(!isMobile || !showAnswerKey || mobileActiveTab === "exercise") && (
              <div className={cn("relative flex flex-1 min-h-0 min-w-0", draftOpen && "@[1100px]/viewers:flex-[2]")}>
                {selectedEntry?.exercise?.url && !selectedEntry?.exercise?.pdf_name ? (
                  /* URL exercise: iframe embed or open-in-new-tab */
                  <div className={cn("flex-1 flex flex-col min-h-0 bg-[#e8dcc8] dark:bg-[#1e1a14]", isMobile && "pb-20")}>
                    {(() => {
                      const embedUrl = toEmbedUrl(selectedEntry.exercise.url!);
                      if (embedUrl) {
                        const isGoogleDoc = selectedEntry.exercise.url?.includes("docs.google.com");
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
                            {(isMobile || isGoogleDoc) && (
                              <div className="flex items-center justify-center gap-3 py-1.5 text-xs flex-shrink-0">
                                {isMobile && (
                                  <a
                                    href={selectedEntry.exercise.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    Open in app
                                  </a>
                                )}
                                {isGoogleDoc && (
                                  <span className="text-[#8b7355] dark:text-[#a09080]">
                                    Can't see the file? Ask the owner to share it with you.
                                  </span>
                                )}
                              </div>
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
                    // Trying again can't find a file the exercise doesn't have.
                    onRetry={pdfError === NO_FILE_ERROR ? undefined : handleRetry}
                    annotations={currentAnnotations}
                    onPageStrokesChange={handlePageStrokesChange}
                    tools={tools}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    onClearAll={handleClearAllAnnotations}
                    onClearPage={handleClearPage}
                    hasAnnotations={exerciseHasAnnotations}
                    onSaveAnnotated={handleSaveAnnotated}
                    onAnswerKeyToggle={handleAnswerKeyToggle}
                    showAnswerKey={showAnswerKey}
                    answerKeyAvailable={answerSearchDone && answerSearchResult !== null}
                    answerKeySearching={!!selectedEntry?.exercise?.pdf_name && !answerSearchDone}
                    onDraftToggle={isMobile || !openExercise ? undefined : () => setShowDraft((open) => !open)}
                    showDraft={draftOpen}
                    toolbarStart={focusButtons}
                    onPrint={selectedEntry?.exercise?.pdf_name ? () => handlePrint() : undefined}
                    isPrinting={printing.id !== null}
                    printTitle={getPrintButtonTitle(printing.id !== null, printing.progress, "Print this exercise (P)")}
                    emptyMessage={allEntries.length === 0 ? NO_EXERCISES_MESSAGE : undefined}
                    viewStates={viewStatesRef.current}
                    trayArea={draftOpen ? trayArea : undefined}
                  />
                </ErrorBoundary>
                )}

                {/* The Draft, beside the worksheet */}
                {draftOpen && openExercise && (
                  <>
                    <div className="w-px bg-[#d4c4a8] dark:bg-[#3a3228] flex-shrink-0" />
                    <DraftPane
                      exerciseId={openExercise.id}
                      annotations={currentAnnotations}
                      onPageStrokesChange={handlePageStrokesChange}
                      onClearPages={handleClearPages}
                      onUndo={handleUndo}
                      tools={tools}
                      onClose={() => setShowDraft(false)}
                    />
                  </>
                )}

                {/* While the Draft is open, the Pen Tray floats in here, across the worksheet and the Draft */}
                {draftOpen && <DraftTrayLane ref={setTrayArea} />}
              </div>
            )}

            {/* Answer key viewer. With the Draft open, it folds away when there isn't room for three columns. */}
            {showAnswerKey && (!isMobile || mobileActiveTab === "answer") && (
              draftOpen ? <FoldingAnswerKey>{answerViewer}</FoldingAnswerKey> : (
                <>
                  {!isMobile && <div className="w-px bg-[#d4c4a8] dark:bg-[#3a3228] flex-shrink-0" />}
                  {answerViewer}
                </>
              )
            )}
          </div>
        </div>
      </div>

      {/* Focus mode brings the header and the sidebar back over the worksheet */}
      {focusMode && (
        <FocusOverlays
          focus={focus}
          header={renderHeader(true)}
          sidebarWidth={sidebarWidth}
          sidebar={<LessonWideSidebar {...sidebarProps} />}
        />
      )}

      {/* Mobile: Floating exercise list button */}
      {isMobile && (
        <button
          onClick={() => setMobileExerciseListOpen(true)}
          className={cn(
            "fixed right-4 z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center bg-gradient-to-br from-[#a0704b] to-[#8b6040] border-2 border-[#6b4c30] active:scale-95 transition-transform",
            // Above the page bar and the Pen Tray's collapsed button, which sits in the same corner.
            selectedEntry?.exercise?.pdf_name ? "bottom-36" : "bottom-4",
          )}
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
            onStudentOpen={(session) => {
              openStudent(session);
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
          readOnly={isReadOnly}
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

      {/* Wolfram Alpha panel */}
      <WolframPanel isOpen={showWolfram} onClose={() => setShowWolfram(false)} />

      {/* Exit confirmation dialog */}
      {showExitConfirm && (
        <ExitConfirmDialog
          isOpen={showExitConfirm}
          isSaving={isSavingAll}
          unsentInk
          onCancel={() => setShowExitConfirm(false)}
          onSaveAndExit={handleSaveAllAndExit}
          onExit={() => window.close()}
        />
      )}
    </motion.div>
  );
}
