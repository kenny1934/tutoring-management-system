"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Calendar, Clock, MapPin,
  LayoutList, Home, MoreHorizontal, Sigma, Download, Printer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useHideBottomBar } from "@/lib/app-chrome";
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
import { useLessonMotion } from "@/components/design-preview/useLessonMotion";
import { useLessonPhoneSurface } from "@/components/design-preview/useLessonPhoneSurface";
import { useWorksheetHandoff } from "@/components/design-preview/useWorksheetHandoff";
import { useLessonResumeEntry, useLessonResumeScope } from "@/components/design-preview/LessonResumeMemory";
import { lessonSingleKey, lessonTarget } from "@/components/design-preview/lessonResume";
import { cancelLessonFrameNavigation, closeLessonFrame, connectLessonFrame, dismissLessonOverlay, lessonFrameToken } from "@/components/design-preview/lessonFrame";
import { SchoolBadge } from "./SchoolBadge";
import { useNativePresentation } from "@/components/design-preview/useNativePresentation";
import previewStyles from "@/components/design-preview/NativePreview.module.css";
import { ExitConfirmDialog } from "./ExitConfirmDialog";
import { WolframPanel } from "./WolframPanel";
import { useLessonInk } from "@/hooks/useLessonInk";
import { useLessonExit } from "@/hooks/useLessonExit";
import { usePrintExercise } from "@/hooks/usePrintExercise";
import { useCompassPencilKey } from "@/hooks/useCompassPencil";
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
import { lessonOfDraft } from "@/hooks/useAnnotations";
import { lessonDraftEntry } from "./LessonDraftRow";
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

export function LessonMode(props: LessonModeProps) {
  const { memory } = useLessonResumeScope();
  return <SingleLessonWorkspace key={`${props.session.id}:${memory?.scope ?? ""}`} {...props} />;
}

function SingleLessonWorkspace({
  session,
  onExit,
  onSessionDataChange,
  isReadOnly,
}: LessonModeProps) {
  // A lesson needs all of a phone's height, so the bottom bar steps aside.
  useHideBottomBar();
  const currentSession = session;
  const previousSession = session.previous_session ?? null;
  const preview = useNativePresentation();
  const nativeStage = useRef<HTMLDivElement>(null);
  const { prepare: prepareWorksheet, isPending: isWorksheetPending } = useWorksheetHandoff(nativeStage, true);
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

  // All exercises from both sessions (for auto-select, save-all ZIP, and saving ink)
  const allExercises = useMemo(() => {
    const exercises: SessionExercise[] = [];
    if (currentSession?.exercises) exercises.push(...currentSession.exercises);
    if (previousSession?.exercises) exercises.push(...previousSession.exercises);
    return exercises;
  }, [currentSession, previousSession]);

  const resumeTargets = useMemo(() => allExercises.map(exercise => lessonTarget(exercise.session_id, exercise)), [allExercises]);
  const { entry: resume, ready: resumeReady } = useLessonResumeEntry(lessonSingleKey(session.id), resumeTargets, true);
  const [selectedExercise, setSelectedExerciseState] = useState<SessionExercise | null>(() => {
    const restored = resume.initial(resumeTargets);
    return allExercises.find(exercise => exercise.id === restored?.exerciseId && exercise.session_id === restored.sessionId) ?? null;
  });
  const setSelectedExercise = useCallback((exercise: SessionExercise | null) => {
    if (selectedExercise?.id !== exercise?.id || selectedExercise?.pdf_name !== exercise?.pdf_name) {
      prepareWorksheet(exercise?.pdf_name ? exercise.id : null);
    }
    setSelectedExerciseState(exercise);
  }, [prepareWorksheet, selectedExercise?.id, selectedExercise?.pdf_name]);
  useEffect(() => {
    if (!resumeReady || !selectedExercise) return;
    const target = lessonTarget(selectedExercise.session_id, selectedExercise);
    if (resumeTargets.some(t => t.sessionId === target.sessionId && t.exerciseId === target.exerciseId && t.source === target.source)) resume.remember(target, "by-student");
  }, [resume, resumeReady, resumeTargets, selectedExercise]);

  // The open exercise's file, loaded through the one cache everything in this view shares
  const pdfCache = usePdfCache();
  const pdf = useExercisePdf(selectedExercise, pdfCache);
  const { pdfData, pageNumbers } = pdf;

  // Mobile responsive
  const isMobile = useIsMobile();
  const [mobileExerciseListOpen, setMobileExerciseListOpen] = useState(false);
  const [phoneToolsOpen, setPhoneToolsOpen] = useState(false);
  useEffect(() => {
    if (!isMobile) { setMobileExerciseListOpen(false); setPhoneToolsOpen(false); }
  }, [isMobile]);
  const phoneSheetOpen = isMobile && (mobileExerciseListOpen || phoneToolsOpen);
  useLessonPhoneSurface(nativeStage, isMobile, phoneSheetOpen);

  // The exercise editor, for this lesson's classwork or homework
  const { editing, openEditor: handleEditExercises, closeEditor: handleExerciseModalClose } = useExerciseEditor(onSessionDataChange);

  // The sidebar's width, which the tutor changes by dragging its edge
  const { width: sidebarWidth, startResize } = useSidebarWidth();

  // Focus mode hides the sidebar and the header, and brings each back while
  // the mouse rests at its edge. Phones don't get it.
  const focus = useFocusMode(!isMobile);
  const { focusMode, hoverSidebar, setHoverSidebar, exitFocusMode, toggleFocusMode } = focus;

  useLessonMotion(nativeStage, true, focusMode);

  // Wolfram, the print menu and the shortcut help
  const panels = useLessonPanels();
  const compassPencil = useCompassPencilKey();

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
  const draft = useDraft(selectedExercise, isMobile, session.id);
  const lessonDraftOpen = draft.lessonDraftOpen;

  // Ink is saved to the server for this lesson and the previous one, which
  // this view also shows. The tab keeps whatever hasn't been sent yet.
  const ink = useLessonInk<AnnotatedExercise>({
    storageKey: `lesson-annotations-${session.id}`,
    sessionIds: previousSession ? [session.id, previousSession.id] : [session.id],
    exercises: allExercises,
    openExercise: selectedExercise,
    openSource: openInkSource,
    lessonDraftId: lessonDraftOpen ? draft.lessonDraftId : null,
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

  // A fresh empty lesson stays empty. A saved explicit choice can resume the
  // previous lesson, and refreshed records replace stale exercise metadata.
  useEffect(() => {
    if (!resumeReady) return;
    // Parallel summer files are deliberate, temporary previews, not assignments.
    if (selectedExercise && isPreviewExercise(selectedExercise) && [session.id, previousSession?.id].includes(selectedExercise.session_id)) return;
    const live = allExercises.find(exercise => exercise.id === selectedExercise?.id && exercise.session_id === selectedExercise?.session_id);
    const restored = resume.initial(resumeTargets);
    const next = live ?? allExercises.find(exercise => exercise.id === restored?.exerciseId && exercise.session_id === restored.sessionId) ?? currentSession.exercises?.[0] ?? null;
    if (next !== selectedExercise) setSelectedExercise(next);
  }, [allExercises, currentSession.exercises, selectedExercise, setSelectedExercise, resume, resumeReady, resumeTargets, session.id, previousSession?.id]);

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
  const { closeLessonDraft } = draft;
  const handleExerciseSelect = useCallback((exercise: SessionExercise) => {
    setSelectedExercise(exercise);
    closeLessonDraft();
    if (isMobile) setMobileExerciseListOpen(false);
    if (focusMode) setHoverSidebar(false);
  }, [isMobile, focusMode, setHoverSidebar, closeLessonDraft, setSelectedExercise]);

  // The sidebar's "Lesson draft" row, which a phone doesn't get.
  const lessonDraftRow = lessonDraftEntry(draft, checkHasAnnotations, () => {
    if (focusMode) setHoverSidebar(false);
  });

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
    leave: () => {
      resume.flush();
      if (!closeLessonFrame()) onExit();
    },
  });

  const frameExit = useRef<() => void>(() => {});
  frameExit.current = () => {
    if (dismissLessonOverlay()) return;
    if (isMobile && mobileExerciseListOpen) { setMobileExerciseListOpen(false); return; }
    if (isMobile && phoneToolsOpen) { setPhoneToolsOpen(false); return; }
    void handleExitAttempt();
  };
  const frameNavigate = useRef<() => void>(() => {});
  frameNavigate.current = () => {
    if (dismissLessonOverlay()) { cancelLessonFrameNavigation(); return; }
    void handleExitAttempt();
  };
  useEffect(() => connectLessonFrame(() => frameExit.current(), nativeStage.current, () => frameNavigate.current()), []);

  // --- Keys ---
  // The key table is shared with the multi-student view, in useLessonKeys. An
  // action left out here is one this view can't do right now, so its key is
  // left to the browser. While the lesson's own Draft is on screen, the key
  // table itself holds back the keys that work on the worksheet.
  const stepExercise = (direction: 1 | -1) => {
    const index = navigableExercises.findIndex(ex => ex.id === selectedExercise?.id);
    const target = navigableExercises[index + direction];
    if (target) setSelectedExercise(target);
  };
  useLessonKeys(
    {
      blocked: !!editing || showExitConfirm || phoneSheetOpen || isWorksheetPending(),
      ...panels.keyState,
      drawing: tools.drawingEnabled,
      focusMode,
      worksheetHidden: lessonDraftOpen,
    },
    {
      ...panels.keyHandlers,
      // Undo and redo work on whichever ink is on screen, the lesson's Draft included.
      undo: ink.inkOpen ? handleUndo : undefined,
      redo: ink.inkOpen ? handleRedo : undefined,
      selectHand: tools.selectHand,
      exitFocus: exitFocusMode,
      exit: () => void handleExitAttempt(),
      toggleFocus: isMobile ? undefined : toggleFocusMode,
      next: () => stepExercise(1),
      previous: () => stepExercise(-1),
      pen: () => tools.toggleFromKey("pen"),
      eraser: () => tools.toggleFromKey("eraser"),
      lasso: () => tools.toggleFromKey("lasso"),
      text: () => tools.toggleFromKey("text"),
      // u lifts or puts down the pencil of the compasses that are out, on the worksheet or the Draft.
      liftPencil: compassPencil.out ? compassPencil.toggle : undefined,
      // + and - zoom the worksheet once its file is on screen.
      zoomIn: pdfData ? () => worksheetRef.current?.zoomIn() : undefined,
      zoomOut: pdfData ? () => worksheetRef.current?.zoomOut() : undefined,
      editClasswork: () => handleEditExercises(currentSession, "CW"),
      editHomework: () => handleEditExercises(currentSession, "HW"),
      homeworkBlock: homeworkProgress.total > 0 ? toggleHomeworkBlock : undefined,
      // Like the print buttons, p waits while another print is still being prepared.
      print: selectedExercise?.pdf_name && printing.id === null
        ? () => void handlePrintExercise(selectedExercise)
        : undefined,
      answerKey: answer.answerKeyFound ? answer.toggleAnswerKey : undefined,
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
        <div data-native-single-identity className="flex flex-1 flex-col gap-0.5 min-w-0">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
            <span className="text-sm font-bold text-white/90 truncate">
              {session.student_name}
            </span>
            {session.grade && (
              <GradeBadge className="text-[10px] px-1.5 py-0.5 rounded font-medium text-gray-800" grade={session.grade} langStream={session.lang_stream} />
            )}
            {session.school && <SchoolBadge school={session.school} className="text-[10px] py-0.5" />}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-white/70">
            {studentIdDisplay && <span>{studentIdDisplay}</span>}
            <LessonNumberBadge lessonNumber={session.lesson_number} size="sm" />
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
        </div>
      }
      phoneControls={isMobile ? <div className={previewStyles.phoneLessonControls}>
        <button type="button" onClick={event => { event.currentTarget.focus({ preventScroll: true }); setMobileExerciseListOpen(true); }} aria-label="Exercise list" aria-expanded={mobileExerciseListOpen} title="Exercises"><LayoutList size={20} /></button>
        <button type="button" onClick={event => { event.currentTarget.focus({ preventScroll: true }); setPhoneToolsOpen(true); }} aria-label="Lesson tools" aria-expanded={phoneToolsOpen} title="Lesson tools"><MoreHorizontal size={20} /></button>
      </div> : undefined}
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
      ref={nativeStage}
      data-native-single-lesson
      data-native-focus={focusMode}
      initial={lessonFrameToken() ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("flex flex-col flex-1 min-h-0 relative", previewStyles.lessonStage)}
      data-native-preview={preview ?? undefined}
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
          readingState={resume}
          isMobile={isMobile}
          contextRevealed={(focusMode && hoverSidebar) || mobileExerciseListOpen || phoneToolsOpen}
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
          onCancel={() => { stay(); cancelLessonFrameNavigation(); }}
          onSaveAndExit={saveAllAndExit}
          onExit={exitAnyway}
        />
      )}

      {/* Mobile: Exercise list bottom sheet */}
      {isMobile && <MobileBottomSheet
        isOpen={mobileExerciseListOpen}
        onClose={() => setMobileExerciseListOpen(false)}
        title="Exercises"
        modalLabel="Exercises"
        backManaged={!!lessonFrameToken()}
        onCloseStart={() => setMobileExerciseListOpen(false)}
        className={previewStyles.phoneMaterialsSheet}
      >
        {sidebar}
      </MobileBottomSheet>}
      {isMobile && <MobileBottomSheet isOpen={phoneToolsOpen} onClose={() => setPhoneToolsOpen(false)} onCloseStart={() => setPhoneToolsOpen(false)} title="Lesson tools" modalLabel="Lesson tools" backManaged={!!lessonFrameToken()} className={previewStyles.phoneToolsSheet}>
        <button type="button" onClick={() => { setPhoneToolsOpen(false); panels.toggleWolfram(); }}><Sigma size={20} />Wolfram Alpha</button>
        <button type="button" disabled={isSavingAll || !hasAnyAnnotations()} onClick={() => { setPhoneToolsOpen(false); void downloadAllInk(); }}><Download size={20} />Download all ink as PDFs</button>
        <button type="button" disabled={printing.id !== null} onClick={() => { setPhoneToolsOpen(false); handleBulkPrint("CW"); }}><Printer size={20} />Print CW</button>
        <button type="button" disabled={printing.id !== null} onClick={() => { setPhoneToolsOpen(false); handleBulkPrint("HW"); }}><Printer size={20} />Print HW</button>
      </MobileBottomSheet>}
    </motion.div>
  );
}
