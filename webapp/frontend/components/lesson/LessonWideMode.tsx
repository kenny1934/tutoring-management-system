"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Calendar, MapPin, Users,
  LayoutList, Home,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getDisplayName, getExerciseDisplayName, parseExerciseRemarks } from "@/lib/exercise-utils";
import { getExercisePageNumbers, getPrintButtonTitle, compareByStudentId, loopStep, NO_FILE_ERROR, NO_EXERCISES_MESSAGE } from "@/lib/lesson-utils";
import { prefetchPdfs, PDF_CACHE_SIZE } from "@/lib/lesson-pdf-loader";
import { usePdfCache, useExercisePdf } from "@/hooks/useExercisePdf";
import { useAnswerKey } from "@/hooks/useAnswerKey";
import { formatShortDate } from "@/lib/formatters";
import { useLocation } from "@/contexts/LocationContext";
import { LessonWideSidebar } from "./LessonWideSidebar";
import { useHomeworkToCheck } from "@/lib/hooks";
import { useHomeworkMarked } from "@/components/homework/useHomeworkMarked";
import { checkedCount, homeworkCountLabel } from "@/lib/homework-utils";
import { StudentStrip, stripLabel } from "./StudentStrip";
import { PdfPageViewer, type PdfViewState } from "./PdfPageViewer";
import { FocusSidebarButton, LeaveFocusButton } from "./FocusModeButtons";
import { ExerciseModal } from "@/components/sessions/ExerciseModal";
import { BulkExerciseModal } from "@/components/sessions/BulkExerciseModal";
import { motion } from "framer-motion";
import { useLessonInk } from "@/hooks/useLessonInk";
import { useLessonExit } from "@/hooks/useLessonExit";
import { usePrintExercise } from "@/hooks/usePrintExercise";
import { useLessonKeys } from "@/hooks/useLessonKeys";
import { ShortcutHelpPanel, type ShortcutRow } from "./ShortcutHelpPanel";
import { LessonHeader, type HeaderDetail } from "./LessonHeader";
import { UrlExerciseView } from "./UrlExerciseView";
import { LessonViewerArea } from "./LessonViewerArea";
import { useDraft } from "@/hooks/useDraft";
import { useRouter } from "next/navigation";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileBottomSheet } from "@/components/ui/mobile-bottom-sheet";
import { useSidebarWidth } from "@/hooks/useSidebarWidth";
import { SidebarResizeHandle } from "./SidebarResizeHandle";
import { useFocusMode } from "@/hooks/useFocusMode";
import { FocusOverlays } from "./FocusOverlays";
import { saveAnnotatedPdf } from "@/lib/pdf-annotation-save";
import { SAVE_FAILED_MESSAGE, type AnnotatedExercise } from "@/lib/annotated-zip";
import { downloadBlob } from "@/lib/geometry-utils";
import { ExitConfirmDialog } from "./ExitConfirmDialog";
import { WolframPanel } from "./WolframPanel";
import { type StudentExerciseGroup } from "@/lib/bulk-exercise-download";
import { isPreviewExercise } from "@/lib/summer-courseware-session";
import { useToast } from "@/contexts/ToastContext";
import type { PrintStampInfo } from "@/lib/pdf-utils";
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

/** The help panel's rows. Tab is this view's alone, because only it has several students. */
const SHORTCUTS: readonly ShortcutRow[] = [
  ["j / k", "Navigate exercises"],
  ["Tab", "Switch student"],
  ["+  / -", "Zoom in / out"],
  ["d", "Pen, or back to the Hand"],
  ["e", "Eraser, or back to the Hand"],
  ["z / Z", "Undo / Redo"],
  ["s", "Save annotated PDF"],
  ["c / h", "Edit CW / HW"],
  ["p", "Print"],
  ["a", "Answer key"],
  ["w", "Wolfram Alpha"],
  ["f", "Focus mode"],
  ["?", "This help"],
  ["Esc", "Back"],
];

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
  const openExercise = selectedEntry?.exercise ?? null;

  // --- The open worksheet's file, loaded through the one cache everything in this view shares ---
  const pdfCache = usePdfCache();
  const { pdfData, pageNumbers, pdfLoading, pdfLoadingMessage, pdfError, retry: handleRetry } =
    useExercisePdf(openExercise, pdfCache);

  // Each worksheet's zoom, scroll position and "Hide ink", so switching
  // between students and back finds each one as the tutor left it.
  const viewStatesRef = useRef(new Map<number, PdfViewState>());

  // --- Mobile ---
  const isMobile = useIsMobile();
  const [mobileExerciseListOpen, setMobileExerciseListOpen] = useState(false);

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
  // Ink is saved to the server for every lesson in the slot. The tab keeps
  // whatever hasn't been sent yet, under one key for the whole slot.
  const listedExercises = useMemo(() => allEntries.map((entry) => entry.exercise), [allEntries]);
  const openInkSource = useMemo(() => (selectedEntry ? describeForZip(selectedEntry) : null), [selectedEntry]);
  const {
    tools, annotations: currentAnnotations, openHasInk: exerciseHasAnnotations,
    onPageStrokesChange: handlePageStrokesChange, onUndo: handleUndo, onRedo: handleRedo,
    onClearAll: handleClearAllAnnotations, onClearPage: handleClearPage, onClearPages: handleClearPages,
    getAllAnnotations, getInkSource, clearStorage, hasAnnotations: checkHasAnnotations, hasAnyAnnotations,
    syncStatus, flushInk,
  } = useLessonInk<AnnotatedExercise>({
    storageKey: `lesson-wide-annotations-${date}-${slot}-${tutorId}`,
    sessionIds: sessions.map((s) => s.id),
    exercises: listedExercises,
    openExercise,
    openSource: openInkSource,
  });
  const drawingEnabled = tools.drawingEnabled;

  // The Draft beside the worksheet
  const { draftOpen, toggleDraft, closeDraft, trayArea, setTrayArea } = useDraft(openExercise, isMobile);

  // --- The open worksheet's answer key ---
  const {
    showAnswerKey, toggleAnswerKey: handleAnswerKeyToggle, answerKeyFound, answerKeySearching,
    answerPdfData, answerPageNumbers, answerLoading, answerError, mobileActiveTab, setMobileActiveTab,
  } = useAnswerKey(openExercise, pdfCache);

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

  // --- Printing ---
  // Each exercise prints with its own student's stamp.
  const { printing, printExercise, printGroups, printAll } = usePrintExercise();

  const handlePrint = useCallback((entry?: StudentExerciseEntry) => {
    const target = entry ?? selectedEntry;
    if (target) void printExercise(target.exercise, stampFor(target.session));
  }, [selectedEntry, printExercise]);

  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const handleBulkPrint = useCallback((type: 'CW' | 'HW') => printAll(sessions, type), [printAll, sessions]);

  // One file for every student who has it, each copy with its own student's
  // stamp. The file's button in the sidebar spins while printing.id is -2.
  const handlePrintFileGroup = useCallback((group: FileGroup) => {
    if (group.entries.length === 1) {
      handlePrint(group.entries[0]);
      return;
    }
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
    void printGroups(groups, -2);
  }, [handlePrint, printGroups]);

  // One student's classwork or homework. That student's own button spins
  // while printing.id is minus the lesson's id.
  const handleBulkPrintStudent = useCallback(
    (session: Session, type: 'CW' | 'HW') => printAll([session], type, -session.id),
    [printAll],
  );

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

  // --- Leaving ---
  // The tab was opened from the sessions page, so leaving closes it. A browser
  // only lets a page close a tab that a page opened, though, and a tab that
  // came back from a bookmark or a restored session wasn't. That tab goes to
  // the sessions page, so the button never does nothing.
  const router = useRouter();
  const closeTab = useCallback(() => {
    window.close();
    if (!window.closed) router.push("/sessions");
  }, [router]);
  const describeListed = useCallback((exerciseId: number) => {
    const listed = allEntries.find((entry) => entry.exercise.id === exerciseId);
    return listed ? describeForZip(listed) : undefined;
  }, [allEntries]);
  // Leaving sends any ink still waiting first, and only asks when some pages
  // can't reach the server. The header's Download All and the exit dialog
  // both save through here.
  const {
    attemptExit: handleExitAttempt, downloadAllInk, isSavingAll,
    showExitConfirm, saveAllAndExit, exitAnyway, stay,
  } = useLessonExit({
    flushInk, clearStorage, getAllAnnotations, getInkSource, describeListed,
    cache: pdfCache,
    zipName: ["Annotations", date, slot].filter(Boolean).join("_"),
    leave: closeTab,
  });

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

  // --- Keys ---
  // The key table is shared with the one-student view, in useLessonKeys. An
  // action left out here is one this view can't do right now, so its key is
  // left to the browser. There's no exit, because this view is its own tab
  // and Escape never closes it.
  useLessonKeys(
    {
      blocked: !!exerciseModalSession || !!bulkAssignType || showExitConfirm,
      wolframOpen: showWolfram,
      printMenuOpen: showPrintMenu,
      helpOpen: showShortcutHelp,
      drawing: drawingEnabled,
      focusMode,
    },
    {
      undo: selectedEntry ? handleUndo : undefined,
      redo: selectedEntry ? handleRedo : undefined,
      closeWolfram: () => setShowWolfram(false),
      closePrintMenu: () => setShowPrintMenu(false),
      closeHelp: () => setShowShortcutHelp(false),
      selectHand: tools.selectHand,
      exitFocus: exitFocusMode,
      toggleHelp: () => setShowShortcutHelp(v => !v),
      toggleFocus: isMobile ? undefined : toggleFocusMode,
      toggleWolfram: () => setShowWolfram(v => !v),
      next: () => navigateExercise(1),
      previous: () => navigateExercise(-1),
      // Tab and Shift+Tab step through the students, like the strip's arrows.
      nextStudent: canStep ? () => navigateStudent(1) : undefined,
      previousStudent: canStep ? () => navigateStudent(-1) : undefined,
      pen: () => tools.toggleFromKey("pen"),
      eraser: () => tools.toggleFromKey("eraser"),
      // c and h edit the exercises of the student on screen.
      editClasswork: selectedEntry ? () => handleEditExercises(selectedEntry.session, "CW") : undefined,
      editHomework: selectedEntry ? () => handleEditExercises(selectedEntry.session, "HW") : undefined,
      // Like the print buttons, p waits while another print is still being prepared.
      print: selectedEntry?.exercise.pdf_name && printing.id === null ? () => handlePrint() : undefined,
      answerKey: answerKeyFound ? handleAnswerKeyToggle : undefined,
      save: exerciseHasAnnotations ? () => void handleSaveAnnotated() : undefined,
    },
  );

  // --- Header ---
  const slotLocation = sessions[0]?.location;
  const headerDetails: HeaderDetail[] = [
    { icon: Calendar, text: formatShortDate(date) },
    ...(slotLocation ? [{ icon: MapPin, text: slotLocation }] : []),
  ];

  // The header is drawn in place, and again as the one focus mode brings back.
  // This view is its own tab, so leaving closes it.
  const renderHeader = (isOverlay?: boolean) => (
    <LessonHeader
      overlay={isOverlay}
      focus={focus}
      exitLabel="Close lesson tab"
      exitTitle="Close lesson tab"
      onExit={handleExitAttempt}
      info={
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
      }
      details={headerDetails}
      syncStatus={syncStatus}
      wolframOpen={showWolfram}
      onWolframToggle={() => setShowWolfram(v => !v)}
      canDownloadAll={hasAnyAnnotations()}
      savingAll={isSavingAll}
      onDownloadAll={() => void downloadAllInk()}
      print={{ label: "Print all exercises", printing, open: showPrintMenu, onOpenChange: setShowPrintMenu, onPrint: handleBulkPrint }}
      helpOpen={showShortcutHelp}
      onHelpToggle={() => setShowShortcutHelp(v => !v)}
    />
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
      // + and - zoom the worksheet, and the answer key keeps its own zoom.
      zoomKeys={false}
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
      <ShortcutHelpPanel open={showShortcutHelp} onClose={() => setShowShortcutHelp(false)} rows={SHORTCUTS} />

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

        {/* The open exercise, with its Draft and its answer key */}
        <LessonViewerArea
          isMobile={isMobile}
          // Whose worksheet this is, in large letters, with arrows to the next student
          top={selectedEntry && (
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
          link={selectedEntry?.exercise?.url && !selectedEntry?.exercise?.pdf_name ? (
            // Focus mode's way back is in the student strip above, so the link needs no bar of its own.
            <UrlExerciseView
              url={selectedEntry.exercise.url}
              title={getExerciseDisplayName(selectedEntry.exercise)}
              isMobile={isMobile}
            />
          ) : undefined}
          worksheet={
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
              answerKeyAvailable={answerKeyFound}
              answerKeySearching={answerKeySearching}
              onDraftToggle={isMobile || !openExercise ? undefined : toggleDraft}
              showDraft={draftOpen}
              toolbarStart={focusButtons}
              onPrint={selectedEntry?.exercise?.pdf_name ? () => handlePrint() : undefined}
              isPrinting={printing.id !== null}
              printTitle={getPrintButtonTitle(printing.id !== null, printing.progress, "Print this exercise (P)")}
              emptyMessage={allEntries.length === 0 ? NO_EXERCISES_MESSAGE : undefined}
              viewStates={viewStatesRef.current}
              trayArea={draftOpen ? trayArea : undefined}
            />
          }
          onRetry={handleRetry}
          answerKey={{
            shown: showAnswerKey,
            loaded: !!answerPdfData,
            viewer: answerViewer,
            mobileTab: mobileActiveTab,
            onMobileTabChange: setMobileActiveTab,
          }}
          draft={{
            open: draftOpen,
            exerciseId: openExercise?.id,
            annotations: currentAnnotations,
            onPageStrokesChange: handlePageStrokesChange,
            onClearPages: handleClearPages,
            onUndo: handleUndo,
            tools,
            onClose: closeDraft,
            onTrayArea: setTrayArea,
          }}
        />
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
          isOpen
          isSaving={isSavingAll}
          unsentInk
          onCancel={stay}
          onSaveAndExit={saveAllAndExit}
          onExit={exitAnyway}
        />
      )}
    </motion.div>
  );
}
