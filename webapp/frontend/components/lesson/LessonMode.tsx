"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Calendar, Clock, MapPin,
  LayoutList, Home,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getDisplayName, getExerciseDisplayName } from "@/lib/exercise-utils";
import { useToast } from "@/contexts/ToastContext";
import { getExercisePageNumbers, getStudentIdDisplay, stampFor, NO_EXERCISES_MESSAGE } from "@/lib/lesson-utils";
import { prefetchPdfs, PDF_CACHE_SIZE } from "@/lib/lesson-pdf-loader";
import { usePdfCache, useExercisePdf } from "@/hooks/useExercisePdf";
import { useAnswerKey } from "@/hooks/useAnswerKey";
import { formatShortDate } from "@/lib/formatters";
import { useLocation } from "@/contexts/LocationContext";
import { LessonExerciseSidebar } from "./LessonExerciseSidebar";
import { isPreviewExercise } from "@/lib/summer-courseware-session";
import type { PdfViewerHandle } from "./PdfPageViewer";
import { FocusSidebarButton, LeaveFocusButton } from "./FocusModeButtons";
import { ExerciseModal } from "@/components/sessions/ExerciseModal";
import { LessonNumberBadge } from "@/components/sessions/LessonNumberBadge";
import { motion } from "framer-motion";
import { ExitConfirmDialog } from "./ExitConfirmDialog";
import { WolframPanel } from "./WolframPanel";
import { useLessonInk } from "@/hooks/useLessonInk";
import { useLessonExit } from "@/hooks/useLessonExit";
import { usePrintExercise } from "@/hooks/usePrintExercise";
import { lessonShortcuts, useLessonKeys } from "@/hooks/useLessonKeys";
import { useLessonPanels } from "@/hooks/useLessonPanels";
import { ShortcutHelpPanel } from "./ShortcutHelpPanel";
import { LessonHeader, type HeaderDetail } from "./LessonHeader";
import { UrlExerciseView } from "./UrlExerciseView";
import { LessonViewerArea } from "./LessonViewerArea";
import { useDraft } from "@/hooks/useDraft";
import { useExerciseEditor } from "@/hooks/useExerciseEditor";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileBottomSheet } from "@/components/ui/mobile-bottom-sheet";
import { useSidebarWidth } from "@/hooks/useSidebarWidth";
import { SidebarPane } from "./SidebarPane";
import { useFocusMode } from "@/hooks/useFocusMode";
import { FocusOverlays } from "./FocusOverlays";
import { saveAnnotatedPdf } from "@/lib/pdf-annotation-save";
import { lessonDraftForZip, SAVE_FAILED_MESSAGE, type AnnotatedExercise } from "@/lib/annotated-zip";
import { lessonDraftId, lessonOfDraft } from "@/hooks/useAnnotations";
import { downloadBlob } from "@/lib/geometry-utils";
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

const SHORTCUTS = lessonShortcuts("one-student");

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
  const studentIdDisplay = getStudentIdDisplay(session, selectedLocation);

  // Set browser tab title to student info for easy tab management
  useEffect(() => {
    const title = [studentIdDisplay, session.student_name].filter(Boolean).join(" ") + " - Lesson";
    document.title = title;
  }, [studentIdDisplay, session.student_name]);

  // Stamp for PDF pages (same info as printing)
  const stamp = useMemo(() => stampFor(session), [session]);

  // Exercise state
  const [selectedExercise, setSelectedExercise] = useState<SessionExercise | null>(null);

  // The open exercise's file, loaded through the one cache everything in this view shares
  const pdfCache = usePdfCache();
  const pdf = useExercisePdf(selectedExercise, pdfCache);
  const { pdfData, pageNumbers } = pdf;

  // Mobile responsive
  const isMobile = useIsMobile();
  const [mobileExerciseListOpen, setMobileExerciseListOpen] = useState(false);

  // The exercise editor, for this lesson's classwork or homework
  const { editing, openEditor: handleEditExercises, closeEditor: handleExerciseModalClose } = useExerciseEditor(onSessionDataChange);

  // The sidebar's width, which the tutor changes by dragging its edge
  const { width: sidebarWidth, startResize } = useSidebarWidth();

  // Focus mode hides the sidebar and the header, and brings each back while
  // the mouse rests at its edge. Phones don't get it.
  const focus = useFocusMode(!isMobile);
  const { focusMode, hoverSidebar, setHoverSidebar, exitFocusMode, toggleFocusMode } = focus;

  // Wolfram, the print menu and the shortcut help
  const panels = useLessonPanels();

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

  // The Draft beside the worksheet, and the lesson's own Draft in the worksheet's place
  const draft = useDraft(selectedExercise, isMobile);
  const lessonDraftOpen = draft.lessonDraftOpen;

  // Ink is saved to the server for this lesson and the previous one, which
  // this view also shows. The tab keeps whatever hasn't been sent yet.
  const ink = useLessonInk<AnnotatedExercise>({
    storageKey: `lesson-annotations-${session.id}`,
    sessionIds: previousSession ? [session.id, previousSession.id] : [session.id],
    exercises: allExercises,
    openExercise: selectedExercise,
    openSource: openInkSource,
    lessonDraftSession: lessonDraftOpen ? session.id : null,
  });
  const {
    tools, annotations: currentAnnotations, openHasInk: exerciseHasAnnotations, onUndo: handleUndo, onRedo: handleRedo,
    getAllAnnotations, getInkSource, clearStorage, hasAnnotations: checkHasAnnotations, hasAnyAnnotations,
    syncStatus, flushInk,
  } = ink;

  // The open exercise's answer key
  const answer = useAnswerKey(selectedExercise, pdfCache);

  // The worksheet's viewer, which + and - zoom
  const worksheetRef = useRef<PdfViewerHandle>(null);

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
  // it again, since a finger can't move off it the way a mouse does. Picking
  // one also puts the lesson's own Draft away, so the exercise is on screen.
  const { closeLessonDraft, openLessonDraft } = draft;
  const handleExerciseSelect = useCallback((exercise: SessionExercise) => {
    setSelectedExercise(exercise);
    closeLessonDraft();
    if (isMobile) setMobileExerciseListOpen(false);
    if (focusMode) setHoverSidebar(false);
  }, [isMobile, focusMode, setHoverSidebar, closeLessonDraft]);

  // The sidebar's "Lesson draft" row. Phones get no Draft, so they don't get the row either.
  const lessonDraftRow = isMobile ? undefined : {
    open: lessonDraftOpen,
    hasInk: checkHasAnnotations(lessonDraftId(session.id)),
    onOpen: () => {
      openLessonDraft();
      if (focusMode) setHoverSidebar(false);
    },
  };

  // --- Printing ---
  // Every exercise here is the one student's, so each prints with the lesson's stamp.
  const { printing, printExercise, printAll } = usePrintExercise();
  const handlePrintExercise = useCallback(
    (exercise: SessionExercise) => printExercise(exercise, stamp),
    [printExercise, stamp],
  );
  const handleBulkPrint = useCallback((type: 'CW' | 'HW') => printAll([session], type), [printAll, session]);

  // A preview is class-wide, so it has no student stamp, on screen or in the saved file.
  const viewerStamp = selectedExercise && isPreviewExercise(selectedExercise) ? undefined : stamp;

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
  // both save through here. A lesson's own Draft is saved as its sheets on
  // their own, and the previous lesson's can have some ink too.
  const describeListed = useCallback((exerciseId: number) => {
    const lesson = lessonOfDraft(exerciseId);
    if (lesson !== null) return lessonDraftForZip(lesson === session.id ? "Lesson draft" : "Previous lesson draft");
    const listed = allExercises.find((ex) => ex.id === exerciseId);
    return listed ? describeForZip(listed) : undefined;
  }, [allExercises, describeForZip, session.id]);
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
  // left to the browser. While the lesson's own Draft is on screen, the keys
  // that work on the worksheet wait, because the worksheet is out of sight.
  const worksheetShown = !lessonDraftOpen;
  const stepExercise = (direction: 1 | -1) => {
    const index = navigableExercises.findIndex(ex => ex.id === selectedExercise?.id);
    const target = navigableExercises[index + direction];
    if (target) setSelectedExercise(target);
  };
  useLessonKeys(
    {
      blocked: !!editing || showExitConfirm,
      ...panels.keyState,
      drawing: tools.drawingEnabled,
      focusMode,
    },
    {
      ...panels.keyHandlers,
      // Undo and redo work on whichever ink is on screen, the lesson's Draft included.
      undo: selectedExercise || lessonDraftOpen ? handleUndo : undefined,
      redo: selectedExercise || lessonDraftOpen ? handleRedo : undefined,
      selectHand: tools.selectHand,
      exitFocus: exitFocusMode,
      exit: () => void handleExitAttempt(),
      toggleFocus: isMobile ? undefined : toggleFocusMode,
      next: worksheetShown ? () => stepExercise(1) : undefined,
      previous: worksheetShown ? () => stepExercise(-1) : undefined,
      pen: () => tools.toggleFromKey("pen"),
      eraser: () => tools.toggleFromKey("eraser"),
      lasso: () => tools.toggleFromKey("lasso"),
      // + and - zoom the worksheet once its file is on screen.
      zoomIn: pdfData && worksheetShown ? () => worksheetRef.current?.zoomIn() : undefined,
      zoomOut: pdfData && worksheetShown ? () => worksheetRef.current?.zoomOut() : undefined,
      editClasswork: () => handleEditExercises(currentSession, "CW"),
      editHomework: () => handleEditExercises(currentSession, "HW"),
      homeworkBlock: homeworkProgress.total > 0 ? toggleHomeworkBlock : undefined,
      // Like the print buttons, p waits while another print is still being prepared.
      print: selectedExercise?.pdf_name && printing.id === null && worksheetShown
        ? () => void handlePrintExercise(selectedExercise)
        : undefined,
      answerKey: answer.answerKeyFound && worksheetShown ? answer.toggleAnswerKey : undefined,
      save: exerciseHasAnnotations && worksheetShown ? () => void handleSaveAnnotated() : undefined,
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

  const headerDetails: HeaderDetail[] = [
    { icon: Calendar, text: formatShortDate(session.session_date) },
    ...(session.time_slot ? [{ icon: Clock, text: session.time_slot }] : []),
    ...(session.location ? [{ icon: MapPin, text: session.location }] : []),
  ];

  // The header is drawn in place, and again as the one focus mode brings back.
  const renderHeader = (isOverlay?: boolean) => (
    <LessonHeader
      overlay={isOverlay}
      focus={focus}
      exitLabel="Exit lesson mode"
      exitTitle="Exit Lesson Mode (Esc)"
      onExit={handleExitAttempt}
      info={
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
      }
      details={headerDetails}
      syncStatus={syncStatus}
      wolframOpen={panels.wolframOpen}
      onWolframToggle={panels.toggleWolfram}
      canDownloadAll={hasAnyAnnotations()}
      savingAll={isSavingAll}
      onDownloadAll={() => void downloadAllInk()}
      print={{ label: "Print exercises", printing, open: panels.printMenuOpen, onOpenChange: panels.setPrintMenuOpen, onPrint: handleBulkPrint }}
      helpOpen={panels.helpOpen}
      onHelpToggle={panels.toggleHelp}
    />
  );

  // The sidebar shows in the split pane, the focus mode overlay or the phone's
  // sheet. It's built once here, so the three can't drift apart as props are added.
  const sidebar = (
    <LessonExerciseSidebar
      currentSession={currentSession}
      previousSession={previousSession}
      // While the lesson's own Draft is on screen, its row is the one picked out.
      selectedExerciseId={lessonDraftOpen ? null : selectedExercise?.id ?? null}
      onExerciseSelect={handleExerciseSelect}
      onEditExercises={handleEditExercises}
      isReadOnly={isReadOnly}
      hasAnnotations={checkHasAnnotations}
      homeworkToCheck={homeworkToCheck}
      homeworkStatusFor={homeworkStatusFor}
      sessionId={session.id}
      onHomeworkMarked={applyHomeworkMark}
      homeworkExpanded={homeworkOpen}
      onHomeworkExpandedChange={setHomeworkOpen}
      onPrint={handlePrintExercise}
      printing={printing}
      lessonDraft={lessonDraftRow}
    />
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
      <ShortcutHelpPanel open={panels.helpOpen} onClose={panels.closeHelp} rows={SHORTCUTS} />

      {/* Split pane: sidebar + PDF viewer */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar + resize handle — hidden in focus mode and on mobile */}
        {!focusMode && !isMobile && (
          <SidebarPane width={sidebarWidth} onResizeStart={startResize}>{sidebar}</SidebarPane>
        )}

        {/* The open exercise, with its Draft and its answer key */}
        <LessonViewerArea
          isMobile={isMobile}
          link={selectedExercise?.url && !selectedExercise?.pdf_name ? (
            <UrlExerciseView
              url={selectedExercise.url}
              title={getExerciseDisplayName(selectedExercise)}
              isMobile={isMobile}
              // A link has no viewer toolbar, so focus mode's buttons get a bar of their own.
              toolbarStart={focusButtons}
            />
          ) : undefined}
          exercise={selectedExercise}
          exerciseLabel={exerciseLabel}
          pdf={pdf}
          answer={answer}
          draft={draft}
          ink={ink}
          stamp={viewerStamp}
          onSaveAnnotated={handleSaveAnnotated}
          onPrint={selectedExercise?.pdf_name ? () => handlePrintExercise(selectedExercise) : undefined}
          printing={printing}
          emptyMessage={!currentSession?.exercises?.length ? NO_EXERCISES_MESSAGE : undefined}
          toolbarStart={focusButtons}
          worksheetRef={worksheetRef}
          lessonDraftId={lessonDraftId(session.id)}
        />
      </div>

      {/* Focus mode brings the header and the sidebar back over the worksheet */}
      {focusMode && (
        <FocusOverlays
          focus={focus}
          header={renderHeader(true)}
          sidebarWidth={sidebarWidth}
          sidebar={sidebar}
        />
      )}

      {/* Wolfram Alpha panel */}
      <WolframPanel isOpen={panels.wolframOpen} onClose={panels.closeWolfram} />

      {/* Exercise Modal */}
      {editing && (
        <ExerciseModal
          session={editing.session}
          exerciseType={editing.type}
          isOpen
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
        {sidebar}
      </MobileBottomSheet>
    </motion.div>
  );
}
