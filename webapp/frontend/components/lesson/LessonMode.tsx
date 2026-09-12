"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ArrowLeft, Calendar, Clock, MapPin, HelpCircle, Sigma,
  Maximize2, Minimize2,
  AlertTriangle, LayoutList, Loader2, ExternalLink, Home, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getDisplayName, getExerciseDisplayName, toEmbedUrl } from "@/lib/exercise-utils";
import { type BulkPrintExercise } from "@/lib/bulk-pdf-helpers";
import { useToast } from "@/contexts/ToastContext";
import { getExercisePageNumbers, getPrintButtonTitle, NO_FILE_ERROR, NO_EXERCISES_MESSAGE } from "@/lib/lesson-utils";
import { prefetchPdfs, PDF_CACHE_SIZE } from "@/lib/lesson-pdf-loader";
import { usePdfCache, useExercisePdf } from "@/hooks/useExercisePdf";
import { useAnswerKey } from "@/hooks/useAnswerKey";
import { formatShortDate } from "@/lib/formatters";
import { useLocation } from "@/contexts/LocationContext";
import { LessonExerciseSidebar } from "./LessonExerciseSidebar";
import { isPreviewExercise } from "@/lib/summer-courseware-session";
import { PdfPageViewer, type PdfViewState } from "./PdfPageViewer";
import { DraftPane, DraftTrayLane } from "./DraftPane";
import { FoldingAnswerKey } from "./FoldingAnswerKey";
import { FocusSidebarButton, LeaveFocusButton } from "./FocusModeButtons";
import { ExerciseModal } from "@/components/sessions/ExerciseModal";
import { LessonNumberBadge } from "@/components/sessions/LessonNumberBadge";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { motion, AnimatePresence } from "framer-motion";
import { ExitConfirmDialog } from "./ExitConfirmDialog";
import { WolframPanel } from "./WolframPanel";
import { useLessonInk } from "@/hooks/useLessonInk";
import { useLessonExit } from "@/hooks/useLessonExit";
import { usePrintExercise } from "@/hooks/usePrintExercise";
import { useLessonKeys } from "@/hooks/useLessonKeys";
import { PrintAllMenu } from "./PrintAllMenu";
import { InkSaveStatus } from "./InkSaveStatus";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileBottomSheet } from "@/components/ui/mobile-bottom-sheet";
import { useSidebarWidth } from "@/hooks/useSidebarWidth";
import { SidebarResizeHandle } from "./SidebarResizeHandle";
import { useFocusMode } from "@/hooks/useFocusMode";
import { FocusOverlays } from "./FocusOverlays";
import { saveAnnotatedPdf } from "@/lib/pdf-annotation-save";
import { SAVE_FAILED_MESSAGE, type AnnotatedExercise } from "@/lib/annotated-zip";
import { downloadBlob } from "@/lib/geometry-utils";
import type { PrintStampInfo } from "@/lib/pdf-utils";
import type { HomeworkStatus, Session, SessionExercise } from "@/types";
import { GradeBadge } from "@/components/ui/grade-label";
import { useStudentHomework } from "@/lib/hooks";
import { useHomeworkMarked } from "@/components/homework/useHomeworkMarked";
import { checkedCount, homeworkCountLabel } from "@/lib/homework-utils";

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
  const { showToast } = useToast();

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

  // The open exercise's file, loaded through the one cache everything in this view shares
  const pdfCache = usePdfCache();
  const { pdfData, pageNumbers, pdfLoading, pdfLoadingMessage, pdfError, retry: handleRetry } =
    useExercisePdf(selectedExercise, pdfCache);

  // Each exercise's zoom, scroll position and "Hide ink", so switching between
  // exercises and back finds each one as the tutor left it.
  const viewStatesRef = useRef(new Map<number, PdfViewState>());

  // Mobile responsive
  const isMobile = useIsMobile();
  const [mobileExerciseListOpen, setMobileExerciseListOpen] = useState(false);

  // Exercise modal
  const [exerciseModalSession, setExerciseModalSession] = useState<Session | null>(null);
  const [exerciseModalType, setExerciseModalType] = useState<"CW" | "HW" | null>(null);

  // The sidebar's width, which the tutor changes by dragging its edge
  const { width: sidebarWidth, startResize } = useSidebarWidth();

  // Focus mode hides the sidebar and the header, and brings each back while
  // the mouse rests at its edge. Phones don't get it.
  const focus = useFocusMode(!isMobile);
  const { focusMode, hoverSidebar, setHoverSidebar, exitFocusMode, toggleFocusMode } = focus;

  // Shortcut help panel
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);

  // Wolfram Alpha panel
  const [showWolfram, setShowWolfram] = useState(false);

  // --- Homework carried in from earlier lessons ---
  // Already on the session detail response: the same open backlog every other
  // marking surface reads, so the sidebar needs no request of its own.
  const homeworkToCheck = useMemo(
    () => session.homework_completion ?? [],
    [session.homework_completion]
  );
  const applyHomeworkMark = useHomeworkMarked();
  const [homeworkOpen, setHomeworkOpen] = useState(false);

  // The student's whole record, for the tick on exercise rows. The backlog on
  // its own cannot answer for work checked in an earlier lesson: the view
  // hands an assessed item to the session that assessed it and to no other, so
  // homework marked last week would read here as homework nobody has seen.
  const { byExercise: studentHomework } = useStudentHomework(session.student_id);

  const openByExercise = useMemo(
    () => new Map(homeworkToCheck.map(hw => [hw.session_exercise_id, hw])),
    [homeworkToCheck]
  );

  const homeworkStatusFor = useCallback(
    (exerciseId: number): HomeworkStatus | undefined =>
      (openByExercise.get(exerciseId) ?? studentHomework.get(exerciseId))?.completion_status,
    [openByExercise, studentHomework]
  );

  const homeworkProgress = useMemo(
    () => ({ checked: checkedCount(homeworkToCheck), total: homeworkToCheck.length }),
    [homeworkToCheck]
  );

  // Focus mode hides the sidebar and mobile keeps it in a sheet, so opening
  // the block has to bring its container with it. Shared by the shortcut and
  // the header counter, which otherwise silently expanded something behind a
  // closed sheet.
  const toggleHomeworkBlock = useCallback(() => {
    const opening = !homeworkOpen;
    setHomeworkOpen(opening);
    if (opening && focusMode) setHoverSidebar(true);
    if (opening && isMobile) setMobileExerciseListOpen(true);
  }, [homeworkOpen, focusMode, isMobile, setHoverSidebar]);

  // The sidebar is mounted three times over, in the split pane, the focus mode
  // overlay and the mobile sheet. Spreading one object is what stops the three
  // from drifting apart as props are added.
  const homeworkSidebarProps = {
    homeworkToCheck,
    homeworkStatusFor,
    sessionId: session.id,
    onHomeworkMarked: applyHomeworkMark,
    homeworkExpanded: homeworkOpen,
    onHomeworkExpandedChange: setHomeworkOpen,
  };

  // All exercises from both sessions (for auto-select, save-all ZIP, and saving ink)
  const allExercises = useMemo(() => {
    const exercises: SessionExercise[] = [];
    if (currentSession?.exercises) exercises.push(...currentSession.exercises);
    if (previousSession?.exercises) exercises.push(...previousSession.exercises);
    return exercises;
  }, [currentSession, previousSession]);

  // How "Download All" saves an exercise's ink. A preview is class-wide, so it has no student stamp.
  const describeForZip = useCallback((exercise: SessionExercise): AnnotatedExercise | null => {
    if (!exercise.pdf_name) return null;
    return {
      pdfName: exercise.pdf_name,
      pageNumbers: getExercisePageNumbers(exercise),
      stamp: isPreviewExercise(exercise) ? undefined : stamp,
      name: `annotated-${getDisplayName(exercise.pdf_name)}`,
    };
  }, [stamp]);
  const openInkSource = useMemo(
    () => (selectedExercise ? describeForZip(selectedExercise) : null),
    [selectedExercise, describeForZip]
  );

  // Ink is saved to the server for this lesson and the previous one, which
  // this view also shows. The tab keeps whatever hasn't been sent yet.
  const {
    tools, annotations: currentAnnotations, openHasInk: exerciseHasAnnotations,
    onPageStrokesChange: handlePageStrokesChange, onUndo: handleUndo, onRedo: handleRedo,
    onClearAll: handleClearAllAnnotations, onClearPage: handleClearPage, onClearPages: handleClearPages,
    getAllAnnotations, getInkSource, clearStorage, hasAnnotations: checkHasAnnotations, hasAnyAnnotations,
    syncStatus, flushInk,
  } = useLessonInk<AnnotatedExercise>({
    storageKey: `lesson-annotations-${session.id}`,
    sessionIds: previousSession ? [session.id, previousSession.id] : [session.id],
    exercises: allExercises,
    openExercise: selectedExercise,
    openSource: openInkSource,
  });
  const drawingEnabled = tools.drawingEnabled;

  // Whether the Draft is open beside the worksheet
  const [showDraft, setShowDraft] = useState(false);
  // While the Draft is open, the Pen Tray floats in a lane over the worksheet
  // and the Draft together.
  const [trayArea, setTrayArea] = useState<HTMLElement | null>(null);

  // The open exercise's answer key
  const {
    showAnswerKey, toggleAnswerKey: handleAnswerKeyToggle, answerKeyFound, answerKeySearching,
    answerPdfData, answerPageNumbers, answerLoading, answerError, mobileActiveTab, setMobileActiveTab,
  } = useAnswerKey(selectedExercise, pdfCache);

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

  // Auto-select first exercise on mount / session change. Current session
  // only: with nothing assigned yet (fresh summer sessions especially), the
  // viewer should stay empty rather than silently loading the previous
  // session's file.
  useEffect(() => {
    const exercises = currentSession?.exercises;
    if (exercises && exercises.length > 0 && !selectedExercise) {
      setSelectedExercise(exercises[0]);
    }
  }, [currentSession, selectedExercise]);

  // Prefetch adjacent exercise PDFs into cache
  useEffect(() => {
    if (!selectedExercise || !pdfData) return;
    const currentIdx = allExercises.findIndex(ex => ex.id === selectedExercise.id);
    const adjacent = [allExercises[currentIdx - 1]?.pdf_name, allExercises[currentIdx + 1]?.pdf_name]
      .filter((name): name is string => !!name);
    return prefetchPdfs(pdfCache, PDF_CACHE_SIZE, adjacent);
  }, [selectedExercise, pdfData, allExercises, pdfCache]);

  // Handle exercise selection
  // Picking an exercise from the mobile sheet or the focus-mode sidebar closes
  // it again, since a finger can't move off it the way a mouse does.
  const handleExerciseSelect = useCallback((exercise: SessionExercise) => {
    setSelectedExercise(exercise);
    if (isMobile) setMobileExerciseListOpen(false);
    if (focusMode) setHoverSidebar(false);
  }, [isMobile, focusMode, setHoverSidebar]);

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

  // --- Printing ---
  // Every exercise here is the one student's, so each prints with the lesson's stamp.
  const { printing, printExercise, printAll } = usePrintExercise();
  const handlePrintExercise = useCallback(
    (exercise: SessionExercise) => printExercise(exercise, stamp),
    [printExercise, stamp],
  );
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const handleBulkPrint = useCallback((type: 'CW' | 'HW') => printAll([session], type), [printAll, session]);

  // A preview is class-wide, so it has no student stamp, on screen or in the saved file.
  const viewerStamp = selectedExercise && isPreviewExercise(selectedExercise) ? undefined : stamp;

  // The Draft sits beside the worksheet viewer. It isn't offered on phones,
  // and an exercise that's a web link has no viewer for it to sit beside.
  const isLinkExercise = !!selectedExercise?.url && !selectedExercise?.pdf_name;
  const draftOpen = showDraft && !isMobile && !!selectedExercise && !isLinkExercise;

  const handleSaveAnnotated = useCallback(async () => {
    if (!selectedExercise?.pdf_name || !pdfData) return;
    try {
      const blob = await saveAnnotatedPdf(
        pdfData,
        pageNumbers,
        viewerStamp,
        currentAnnotations,
      );
      downloadBlob(blob, `annotated-${getDisplayName(selectedExercise.pdf_name)}.pdf`);
    } catch (err) {
      console.error("Failed to save annotated PDF:", err);
      showToast(SAVE_FAILED_MESSAGE, 'error');
    }
  }, [selectedExercise, pdfData, pageNumbers, viewerStamp, currentAnnotations, showToast]);

  // Leaving sends any ink still waiting first, and only asks when some pages
  // can't reach the server. The header's Download All and the exit dialog
  // both save through here.
  const describeListed = useCallback((exerciseId: number) => {
    const listed = allExercises.find((ex) => ex.id === exerciseId);
    return listed ? describeForZip(listed) : undefined;
  }, [allExercises, describeForZip]);
  const {
    attemptExit: handleExitAttempt, downloadAllInk, isSavingAll,
    showExitConfirm, saveAllAndExit, exitAnyway, stay,
  } = useLessonExit({
    flushInk, clearStorage, getAllAnnotations, getInkSource, describeListed,
    cache: pdfCache,
    zipName: [
      "Annotations",
      [session.location, session.school_student_id].filter(Boolean).join("-"),
      session.student_name,
      session.session_date,
      session.time_slot,
    ].filter(Boolean).join("_"),
    leave: onExit,
  });

  // --- Keys ---
  // The key table is shared with the multi-student view, in useLessonKeys. An
  // action left out here is one this view can't do right now, so its key is
  // left to the browser.
  const stepExercise = (direction: 1 | -1) => {
    const index = navigableExercises.findIndex(ex => ex.id === selectedExercise?.id);
    const target = navigableExercises[index + direction];
    if (target) setSelectedExercise(target);
  };
  useLessonKeys(
    {
      blocked: !!exerciseModalType || showExitConfirm,
      wolframOpen: showWolfram,
      printMenuOpen: showPrintMenu,
      helpOpen: showShortcutHelp,
      drawing: drawingEnabled,
      focusMode,
    },
    {
      undo: selectedExercise ? handleUndo : undefined,
      redo: selectedExercise ? handleRedo : undefined,
      closeWolfram: () => setShowWolfram(false),
      closePrintMenu: () => setShowPrintMenu(false),
      closeHelp: () => setShowShortcutHelp(false),
      selectHand: tools.selectHand,
      exitFocus: exitFocusMode,
      exit: () => void handleExitAttempt(),
      toggleHelp: () => setShowShortcutHelp(v => !v),
      toggleFocus: isMobile ? undefined : toggleFocusMode,
      toggleWolfram: () => setShowWolfram(v => !v),
      next: () => stepExercise(1),
      previous: () => stepExercise(-1),
      pen: () => tools.toggleFromKey("pen"),
      eraser: () => tools.toggleFromKey("eraser"),
      editClasswork: () => handleEditExercises(currentSession, "CW"),
      editHomework: () => handleEditExercises(currentSession, "HW"),
      homeworkBlock: homeworkProgress.total > 0 ? toggleHomeworkBlock : undefined,
      // Like the print buttons, p waits while another print is still being prepared.
      print: selectedExercise?.pdf_name && printing.id === null
        ? () => void handlePrintExercise(selectedExercise)
        : undefined,
      answerKey: answerKeyFound ? handleAnswerKeyToggle : undefined,
      save: exerciseHasAnnotations ? () => void handleSaveAnnotated() : undefined,
    },
  );

  // This view has no student strip, so in focus mode these buttons share the
  // worksheet's toolbar, and show only their icons to leave it room.
  const focusButtons = focusMode ? (
    <>
      <FocusSidebarButton icon={LayoutList} label="Exercises" open={hoverSidebar} onOpen={() => setHoverSidebar(true)} labelClass="sr-only" />
      <LeaveFocusButton onLeave={exitFocusMode} labelClass="sr-only" />
    </>
  ) : null;

  const exerciseLabel = selectedExercise?.pdf_name
    ? getDisplayName(selectedExercise.pdf_name)
    : undefined;

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

  // Extracted header to avoid duplication between normal and overlay rendering
  // Header buttons are 40px, big enough to hit with a finger at the board.
  const hdrBtn = "min-w-10 h-10 px-2 inline-flex items-center justify-center rounded-lg transition-colors";

  const renderHeader = (isOverlay?: boolean) => (
    <div className={cn(
      "relative rounded-2xl bg-gradient-to-br from-[#b89968] via-[#a67c52] to-[#8b6f47] p-1",
      isOverlay && "shadow-lg rounded-3xl"
    )}>
      {/* Chalkboard surface */}
      <div className={cn(
        "flex items-center gap-1.5 sm:gap-3 px-2 py-1 sm:px-3 sm:py-1.5",
        "bg-[#2d4739] dark:bg-[#1a2821]",
        "shadow-inner rounded-[12px]",
        isOverlay && "rounded-[20px]"
      )} style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.4)' }}>
        {/* Exit button */}
        <button
          onClick={focusMode ? exitFocusMode : handleExitAttempt}
          className={cn(hdrBtn, "hover:bg-white/10")}
          title={focusMode ? "Exit focus mode (Esc)" : "Exit Lesson Mode (Esc)"}
          aria-label={focusMode ? "Exit focus mode" : "Exit lesson mode"}
        >
          <ArrowLeft className="h-5 w-5 text-white/80" />
        </button>

        {/* Student info */}
        <div className="flex items-center gap-2 min-w-0">
          {studentIdDisplay && (
            <span className="text-xs text-white/60 font-mono">{studentIdDisplay}</span>
          )}
          <span className="text-sm font-bold text-white/90 truncate">
            {session.student_name}
          </span>
          <LessonNumberBadge lessonNumber={session.lesson_number} size="sm" />
          {session.grade && (
            <GradeBadge className="text-[10px] px-1.5 py-0.5 rounded font-medium text-gray-800" grade={session.grade} langStream={session.lang_stream} />
          )}
          {homeworkProgress.total > 0 && (
            <button
              onClick={toggleHomeworkBlock}
              className={cn(
                "flex items-center gap-1 px-2 min-h-8 rounded-md text-xs font-medium tabular-nums flex-shrink-0 transition-colors",
                homeworkProgress.checked >= homeworkProgress.total
                  ? "bg-white/15 text-white/80 hover:bg-white/25"
                  : "bg-amber-400/20 text-amber-200 hover:bg-amber-400/30"
              )}
              title={`${homeworkCountLabel(homeworkProgress.checked, homeworkProgress.total)} (H)`}
            >
              <Home className="h-3.5 w-3.5" />
              HW {homeworkProgress.checked}/{homeworkProgress.total}
            </button>
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

        <PrintAllMenu
          label="Print exercises"
          printing={printing}
          open={showPrintMenu}
          onOpenChange={setShowPrintMenu}
          onPrint={handleBulkPrint}
          buttonClassName={hdrBtn}
        />

        {/* Focus mode toggle (desktop only — mobile header is already compact) */}
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

        {/* Shortcut help toggle (desktop only) */}
        <button
          onClick={() => setShowShortcutHelp(v => !v)}
          className={cn(
            hdrBtn, "hidden md:inline-flex",
            showShortcutHelp
              ? "bg-white/20 text-white"
              : "hover:bg-white/10 text-white/40"
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
                  ["d", "Pen, or back to the Hand"],
                  ["e", "Eraser, or back to the Hand"],
                  ["z / Z", "Undo / Redo"],
                  ["s", "Save annotated PDF"],
                  ["c / h", "Edit CW / HW"],
                  ["H", "Check homework"],
                  ["p", "Print"],
                  ["a", "Answer key"],
                  ["w", "Wolfram Alpha"],
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
                {...homeworkSidebarProps}
                onPrint={handlePrintExercise}
                printing={printing}
              />
            </div>

            <SidebarResizeHandle onResizeStart={startResize} />
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

          {/* PDF/URL viewers — side-by-side on desktop, tabbed on mobile */}
          <div className={cn(
            "flex flex-1 min-h-0 min-w-0",
            !isMobile && showAnswerKey && answerPdfData && "gap-0",
            draftOpen && "group/viewers relative overflow-hidden @container/viewers",
          )}>
            {/* Main exercise viewer — hidden on mobile when answer tab is active */}
            {(!isMobile || !showAnswerKey || mobileActiveTab === "exercise") && (
              <div className={cn("relative flex flex-1 min-h-0 min-w-0", draftOpen && "@[1100px]/viewers:flex-[2]")}>
                {selectedExercise?.url && !selectedExercise?.pdf_name ? (
                  /* URL exercise: iframe embed or open-in-new-tab */
                  <div className={cn("flex-1 flex flex-col min-h-0 bg-[#e8dcc8] dark:bg-[#1e1a14]", isMobile && "pb-20")}>
                    {/* A URL exercise has no viewer toolbar, so focus mode's buttons get a bar of their own */}
                    {focusButtons && (
                      <div className="flex items-center gap-1 px-2 py-0.5 border-b border-[#d4c4a8] dark:border-[#3a3228] bg-[#f0e6d4] dark:bg-[#252018]">
                        {focusButtons}
                      </div>
                    )}
                    {(() => {
                      const embedUrl = toEmbedUrl(selectedExercise.url);
                      if (embedUrl) {
                        const isGoogleDoc = selectedExercise.url?.includes("docs.google.com");
                        return (
                          <>
                            <iframe
                              src={embedUrl}
                              className="w-full border-0 rounded"
                              style={{ flex: 1, minHeight: 0 }}
                              allow="autoplay; fullscreen"
                              allowFullScreen
                              title={getExerciseDisplayName(selectedExercise)}
                            />
                            {(isMobile || isGoogleDoc) && (
                              <div className="flex items-center justify-center gap-3 py-1.5 text-xs flex-shrink-0">
                                {isMobile && (
                                  <a
                                    href={selectedExercise.url}
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
                            href={selectedExercise.url}
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
                    stamp={viewerStamp}
                    exerciseId={selectedExercise?.id}
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
                    onDraftToggle={isMobile || !selectedExercise ? undefined : () => setShowDraft((open) => !open)}
                    showDraft={draftOpen}
                    toolbarStart={focusButtons}
                    onPrint={selectedExercise?.pdf_name ? () => handlePrintExercise(selectedExercise) : undefined}
                    isPrinting={printing.id !== null}
                    printTitle={getPrintButtonTitle(printing.id !== null, printing.progress, "Print this exercise (P)")}
                    emptyMessage={!currentSession?.exercises?.length ? NO_EXERCISES_MESSAGE : undefined}
                    viewStates={viewStatesRef.current}
                    trayArea={draftOpen ? trayArea : undefined}
                  />
                </ErrorBoundary>
                )}

                {/* The Draft, beside the worksheet */}
                {draftOpen && selectedExercise && (
                  <>
                    <div className="w-px bg-[#d4c4a8] dark:bg-[#3a3228] flex-shrink-0" />
                    <DraftPane
                      exerciseId={selectedExercise.id}
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

            {/* Answer key viewer (read-only). With the Draft open, it folds away when there isn't room for three columns. */}
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
          sidebar={
            <LessonExerciseSidebar
              currentSession={currentSession}
              previousSession={previousSession}
              selectedExerciseId={selectedExercise?.id ?? null}
              onExerciseSelect={handleExerciseSelect}
              onEditExercises={handleEditExercises}
              isReadOnly={isReadOnly}
              hasAnnotations={checkHasAnnotations}
              {...homeworkSidebarProps}
              onPrint={handlePrintExercise}
              printing={printing}
            />
          }
        />
      )}

      {/* Wolfram Alpha panel */}
      <WolframPanel isOpen={showWolfram} onClose={() => setShowWolfram(false)} />

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
          isOpen
          isSaving={isSavingAll}
          unsentInk
          onCancel={stay}
          onSaveAndExit={saveAllAndExit}
          onExit={exitAnyway}
        />
      )}

      {/* Mobile: Floating exercise list button */}
      {isMobile && (
        <button
          onClick={() => setMobileExerciseListOpen(true)}
          className={cn(
            "fixed right-4 z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center bg-gradient-to-br from-[#a0704b] to-[#8b6040] border-2 border-[#6b4c30] active:scale-95 transition-transform",
            // Above the page bar and the Pen Tray's collapsed button, which sits in the same corner.
            selectedExercise?.pdf_name ? "bottom-36" : "bottom-4",
          )}
          aria-label="Exercise list"
        >
          <LayoutList className="h-6 w-6 text-white" />
          {/* Everything is behind the sheet on mobile, so without this the
              homework waiting to be checked has nothing to announce it. */}
          {homeworkProgress.total > homeworkProgress.checked && (
            <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-amber-500 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-800">
              <span className="text-[10px] font-bold text-white tabular-nums">
                {homeworkProgress.total - homeworkProgress.checked}
              </span>
            </span>
          )}
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
          {...homeworkSidebarProps}
          onPrint={handlePrintExercise}
          printing={printing}
        />
      </MobileBottomSheet>
    </motion.div>
  );
}
