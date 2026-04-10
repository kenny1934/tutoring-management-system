"use client";

import React, { useEffect, useState, memo } from "react";
import useSWR from "swr";
import { useParams, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { api, sessionsAPI } from "@/lib/api";
import { updateSessionInCache } from "@/lib/session-cache";
import { useSession, usePageTitle, useMemoForSession } from "@/lib/hooks";
import { useBackNavigation } from "@/lib/ui-hooks";
import { GlassCard, PageTransition, WorksheetCard, WorksheetProblem, IndexCard, GraphPaper, StickyNote } from "@/lib/design-system";
import { StarRating } from "@/components/ui/star-rating";
import { motion, AnimatePresence } from "framer-motion";
import type { Session, CurriculumSuggestion, UpcomingTestAlert } from "@/types";
import { getUrlDisplayName } from "@/lib/exercise-utils";
import {
  ArrowLeft,
  Star,
  FileText,
  BookOpen,
  NotebookPen,
  Home,
  Calendar,
  PenTool,
  X,
  ExternalLink,
  Loader2,
  Printer,
  XCircle,
  Download,
} from "lucide-react";
import { ChalkboardHeader } from "@/components/session/ChalkboardHeader";
import { BookmarkTab } from "@/components/session/BookmarkTab";
import { CurriculumTab } from "@/components/session/CurriculumTab";
import { CoursewareBanner } from "@/components/session/CoursewareBanner";
import { TestAlertBanner } from "@/components/session/TestAlertBanner";
import { MemoBanner } from "@/components/sessions/MemoBanner";
import { MemoModal } from "@/components/sessions/MemoModal";
import { MemoImportModal } from "@/components/sessions/MemoImportModal";
import { EditSessionModal } from "@/components/sessions/EditSessionModal";
import { ExerciseModal } from "@/components/sessions/ExerciseModal";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { isFileSystemAccessSupported, openFileFromPathWithFallback, printFileFromPathWithFallback, printBulkFiles, downloadBulkFiles, downloadAllAnswerFiles, type PrintStampInfo } from "@/lib/file-system";
import { searchPaperlessByPath } from "@/lib/paperless-utils";
import { useToast } from "@/contexts/ToastContext";
import { DeskSurface } from "@/components/layout/DeskSurface";

const LessonMode = dynamic(() =>
  import("@/components/lesson/LessonMode").then(mod => ({ default: mod.LessonMode })),
  { ssr: false }
);

// Open/Print action buttons for exercise cards
const SessionExerciseActions = memo(function SessionExerciseActions({
  pdfName,
  url,
  pageStart,
  pageEnd,
  stamp,
}: {
  pdfName?: string;
  url?: string;
  pageStart?: number;
  pageEnd?: number;
  stamp?: PrintStampInfo;
}) {
  const [openState, setOpenState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [printState, setPrintState] = useState<'idle' | 'loading' | 'error'>('idle');
  const canBrowseFiles = typeof window !== 'undefined' && isFileSystemAccessSupported();

  // URL exercise: just show open-in-new-tab button
  if (url && !pdfName) {
    return (
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button type="button" onClick={(e) => { e.stopPropagation(); window.open(url, '_blank'); }}
          className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded" title="Open URL" aria-label="Open URL">
          <ExternalLink className="h-4 w-4 text-blue-500 dark:text-blue-400" />
        </button>
      </div>
    );
  }

  if (!canBrowseFiles) return null;

  const handleOpen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (openState === 'loading') return;
    setOpenState('loading');
    const error = await openFileFromPathWithFallback(pdfName, (p) =>
      searchPaperlessByPath(p)
    );
    if (error) {
      setOpenState('error');
      setTimeout(() => setOpenState('idle'), 2000);
    } else {
      setOpenState('idle');
    }
  };

  const handlePrint = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (printState === 'loading') return;
    setPrintState('loading');
    const error = await printFileFromPathWithFallback(
      pdfName, pageStart, pageEnd, undefined, stamp,
      (p) => searchPaperlessByPath(p)
    );
    if (error) {
      setPrintState('error');
      setTimeout(() => setPrintState('idle'), 2000);
    } else {
      setPrintState('idle');
    }
  };

  return (
    <div className="flex items-center gap-0.5 flex-shrink-0">
      <button type="button" onClick={handleOpen} disabled={openState === 'loading'}
        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Open file" aria-label="Open file">
        {openState === 'loading' ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> :
         openState === 'error' ? <XCircle className="h-4 w-4 text-red-500" /> :
         <ExternalLink className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />}
      </button>
      <button type="button" onClick={handlePrint} disabled={printState === 'loading'}
        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Print file" aria-label="Print file">
        {printState === 'loading' ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> :
         printState === 'error' ? <XCircle className="h-4 w-4 text-red-500" /> :
         <Printer className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />}
      </button>
    </div>
  );
});

// Bulk action buttons (Print All, Download All, Download Answers) for exercise section headers
const BulkExerciseActions = memo(function BulkExerciseActions({
  exercises,
  stamp,
  sessionDate,
  schoolStudentId,
  studentName,
  exerciseType,
}: {
  exercises: { pdf_name: string; page_start?: number; page_end?: number; answer_pdf_name?: string; answer_page_start?: number; answer_page_end?: number }[];
  stamp: PrintStampInfo;
  sessionDate: string;
  schoolStudentId?: string;
  studentName?: string;
  exerciseType: "CW" | "HW";
}) {
  const [printState, setPrintState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [downloadState, setDownloadState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [answersState, setAnswersState] = useState<'idle' | 'loading' | 'error'>('idle');
  const { showToast } = useToast();
  const canBrowseFiles = typeof window !== 'undefined' && isFileSystemAccessSupported();

  if (!canBrowseFiles || exercises.length === 0) return null;

  const withPdfs = exercises.filter(ex => ex.pdf_name?.trim());
  if (withPdfs.length === 0) return null;

  const dateStr = sessionDate.replace(/-/g, '');
  const safeName = (studentName || '').replace(/\s+/g, '_');
  const baseFilename = `${exerciseType}_${schoolStudentId}_${safeName}_${dateStr}`;

  const handlePrintAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (printState === 'loading') return;
    setPrintState('loading');
    const error = await printBulkFiles(withPdfs, stamp, searchPaperlessByPath, baseFilename);
    setPrintState(error ? 'error' : 'idle');
    if (error) setTimeout(() => setPrintState('idle'), 2000);
  };

  const handleDownloadAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (downloadState === 'loading') return;
    setDownloadState('loading');
    const error = await downloadBulkFiles(withPdfs, `${baseFilename}.pdf`, stamp, searchPaperlessByPath);
    setDownloadState(error ? 'error' : 'idle');
    if (error) setTimeout(() => setDownloadState('idle'), 2000);
  };

  const handleDownloadAnswers = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (answersState === 'loading') return;
    setAnswersState('loading');
    const result = await downloadAllAnswerFiles(withPdfs, `Ans_${baseFilename}.pdf`, stamp, searchPaperlessByPath);
    if (result.status === 'success') {
      setAnswersState('idle');
      if (result.missing > 0) {
        showToast(`Downloaded ${result.found}/${result.found + result.missing} answers (${result.missing} not found)`, 'info');
      }
    } else {
      setAnswersState('error');
      setTimeout(() => setAnswersState('idle'), 2000);
    }
  };

  const btnClass = "p-1 rounded transition-colors flex flex-col items-center";

  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={handlePrintAll} disabled={printState === 'loading'}
        className={cn(btnClass, "text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30")}
        title="Print All">
        {printState === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> :
         printState === 'error' ? <XCircle className="h-4 w-4" /> :
         <Printer className="h-4 w-4" />}
      </button>
      <button type="button" onClick={handleDownloadAll} disabled={downloadState === 'loading'}
        className={cn(btnClass, "text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30")}
        title="Download All">
        {downloadState === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> :
         downloadState === 'error' ? <XCircle className="h-4 w-4" /> :
         <Download className="h-4 w-4" />}
        <span className="text-[9px] leading-none">All</span>
      </button>
      <button type="button" onClick={handleDownloadAnswers} disabled={answersState === 'loading'}
        className={cn(btnClass, "text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30")}
        title="Download Answers">
        {answersState === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> :
         answersState === 'error' ? <XCircle className="h-4 w-4" /> :
         <Download className="h-4 w-4" />}
        <span className="text-[9px] leading-none">Ans</span>
      </button>
    </div>
  );
});

// Refined card animation variant (less dramatic)
const refinedCardVariants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.95
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.5,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
};

export default function SessionDetailPage() {
  const params = useParams();
  const goBack = useBackNavigation('/sessions');
  const searchParams = useSearchParams();
  const sessionId = parseInt(params.id as string);

  // SWR hook for session data with caching
  const { data: session, error, isLoading: loading, mutate } = useSession(sessionId);
  const { isReadOnly } = useAuth();

  const [curriculumSuggestion, setCurriculumSuggestion] = useState<CurriculumSuggestion | null>(null);
  const { data: upcomingTests = [] } = useSWR<UpcomingTestAlert[]>(
    sessionId ? ['upcoming-tests', sessionId] : null,
    () => api.sessions.getUpcomingTests(sessionId)
  );
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);
  const [exerciseModalType, setExerciseModalType] = useState<"CW" | "HW" | null>(null);
  const [showShortcutHints, setShowShortcutHints] = useState(false);
  const [lessonMode, setLessonMode] = useState(() => searchParams.get('lesson') === 'true');

  // Dynamic page title (skip when in lesson mode — LessonMode sets its own)
  usePageTitle(
    lessonMode ? undefined : (session ? `Session #${session.id} - ${session.student_name}` : "Loading...")
  );
  const [memoViewOpen, setMemoViewOpen] = useState(false);
  const [memoImportOpen, setMemoImportOpen] = useState(false);

  // Check if a memo exists for this session
  const { data: sessionMemo } = useMemoForSession(sessionId);

  useEffect(() => {
    async function fetchCurriculumSuggestion() {
      try {
        const data = await api.sessions.getCurriculumSuggestions(sessionId);
        setCurriculumSuggestion(data);
      } catch (err) {
        // Silently fail if no curriculum suggestions available
        setCurriculumSuggestion(null);
      }
    }

    fetchCurriculumSuggestion();
  }, [sessionId]);


  // Helper to check if session can be marked
  const canBeMarked = (s: Session) =>
    ['Scheduled', 'Trial Class', 'Make-up Class'].includes(s.session_status);

  // Keyboard shortcuts for session actions
  useEffect(() => {
    if (!session) return;

    const handleKeyDown = async (e: KeyboardEvent) => {
      // Skip if typing in input, modal open, or lesson mode active
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (isEditModalOpen || exerciseModalType || lessonMode) return;

      // Escape - Navigate back
      if (e.key === 'Escape') {
        e.preventDefault();
        goBack();
        return;
      }

      // ? - Toggle shortcut hints
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShowShortcutHints(prev => !prev);
        return;
      }

      const key = e.key.toLowerCase();
      // For single-letter shortcuts, require no modifiers
      const hasModifier = e.shiftKey || e.altKey || e.metaKey || e.ctrlKey;
      if (hasModifier) return;

      // A - Mark as Attended (only for markable sessions)
      if (key === 'a' && canBeMarked(session)) {
        e.preventDefault();
        setLoadingActionId('attended');
        try {
          const updatedSession = await sessionsAPI.markAttended(session.id);
          updateSessionInCache(updatedSession);
        } catch (error) {
          // Failed to mark attended silently
        } finally {
          setLoadingActionId(null);
        }
        return;
      }

      // N - Mark as No Show (only for markable sessions)
      if (key === 'n' && canBeMarked(session)) {
        e.preventDefault();
        setLoadingActionId('no-show');
        try {
          const updatedSession = await sessionsAPI.markNoShow(session.id);
          updateSessionInCache(updatedSession);
        } catch (error) {
          // Failed to mark no show silently
        } finally {
          setLoadingActionId(null);
        }
        return;
      }

      // C - Open CW modal
      if (key === 'c') {
        e.preventDefault();
        setExerciseModalType('CW');
        return;
      }

      // H - Open HW modal
      if (key === 'h') {
        e.preventDefault();
        setExerciseModalType('HW');
        return;
      }

      // E - Open Edit modal
      if (key === 'e') {
        e.preventDefault();
        setIsEditModalOpen(true);
        return;
      }

      // L - Enter Lesson Mode
      if (key === 'l') {
        e.preventDefault();
        setLessonMode(true);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [session, isEditModalOpen, exerciseModalType, lessonMode]);

  if (loading) {
    return (
      <DeskSurface>
        <PageTransition className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-6 lg:p-8">
        {/* Chalkboard skeleton - matches ChalkboardHeader structure */}
        <div
          className="relative w-full rounded-[20px] sm:rounded-[28px]"
          style={{ boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)' }}
        >
          {/* Wood Frame */}
          <div className="absolute inset-0 rounded-[20px] sm:rounded-[28px] bg-gradient-to-br from-[#b89968] via-[#a67c52] to-[#8b6f47]" />

          {/* Chalkboard Surface (stops before ledge) */}
          <div className="absolute left-2 right-2 top-2 sm:left-3 sm:right-3 sm:top-3 bg-[#2d4739] dark:bg-[#1a2821] rounded-[14px] sm:rounded-[20px] bottom-[56px] sm:bottom-[64px]" />

          {/* Wooden Ledge */}
          <div
            className="absolute left-2 right-2 sm:left-3 sm:right-3 bottom-2 sm:bottom-3 h-11 sm:h-12 rounded-b-[12px]"
            style={{ background: 'linear-gradient(180deg, #9a7b5a 0%, #8b6f47 30%, #7a6040 70%, #6b5a3a 100%)' }}
          >
            {/* Shimmer chalk stubs */}
            <div className="flex items-center gap-2 px-3 pt-2">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="w-9 h-4 sm:w-11 sm:h-5 rounded-lg bg-white/20 animate-pulse" />
              ))}
            </div>
          </div>

          {/* Content placeholders */}
          <div className="relative flex items-center justify-between px-4 sm:px-6 pt-3 sm:pt-4 pb-16 sm:pb-18">
            <div className="space-y-2">
              <div className="h-6 sm:h-7 w-48 sm:w-64 bg-white/20 rounded animate-pulse" />
              <div className="h-4 w-40 sm:w-56 bg-white/15 rounded animate-pulse" />
            </div>
            <div className="hidden md:block h-10 w-24 bg-white/10 rounded animate-pulse" />
            <div className="h-9 w-9 md:h-10 md:w-28 bg-white/20 rounded-full animate-pulse" />
          </div>
        </div>

        {/* Courseware Section Skeleton */}
        <div className="relative pt-4 sm:pt-8 lg:pt-10 pl-0 sm:pl-8 lg:pl-14">
          {/* Wooden Tab (CoursewareBanner) skeleton */}
          <div
            className="absolute -top-2 sm:-top-1 lg:top-0 left-4 sm:left-12 lg:left-20 h-8 sm:h-10 w-40 sm:w-48 rounded-t-lg z-10"
            style={{ background: 'linear-gradient(135deg, #8b6f47 0%, #a0826d 50%, #8b6f47 100%)' }}
          >
            <div className="h-4 w-28 bg-white/20 rounded mx-auto mt-2 animate-pulse" />
          </div>

          {/* Two-column layout */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* GraphPaper skeleton (exercises) */}
            <div className="flex-1 lg:w-[70%] min-h-[300px] rounded-lg p-6 paper-cream graph-paper-1cm paper-texture paper-shadow-md">
              <div className="space-y-4">
                <div className="h-5 w-24 bg-gray-400/30 rounded animate-pulse" />
                <div className="space-y-3">
                  {[1,2,3].map(i => (
                    <div key={i} className="h-12 bg-gray-400/20 rounded-md border-l-4 border-red-400/50 animate-pulse" />
                  ))}
                </div>
              </div>
            </div>

            {/* StickyNote skeleton (comments) */}
            <div className="lg:w-[calc(30%-0.75rem)] w-64 min-h-[200px] paper-texture bg-[#ffe4e9] dark:bg-[#2b1f22] torn-edge-top p-6">
              <div className="space-y-3">
                <div className="h-4 w-20 bg-pink-400/40 rounded animate-pulse" />
                <div className="flex justify-end">
                  <div className="flex gap-1">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className="h-5 w-5 bg-pink-400/40 rounded-full animate-pulse" />
                    ))}
                  </div>
                </div>
                <div className="space-y-2 pt-2">
                  <div className="h-3 w-full bg-pink-400/30 rounded animate-pulse" />
                  <div className="h-3 w-3/4 bg-pink-400/30 rounded animate-pulse" />
                </div>
              </div>
            </div>
          </div>
        </div>
        </PageTransition>
      </DeskSurface>
    );
  }

  if (error || !session) {
    return (
      <PageTransition className="flex h-full items-center justify-center">
        <div className="text-destructive">Error: {error instanceof Error ? error.message : "Session not found"}</div>
      </PageTransition>
    );
  }

  // Count emoji stars in performance rating
  const starCount = (session.performance_rating || "").split("⭐").length - 1;

  if (lessonMode) {
    return (
      <DeskSurface fullHeight>
        <LessonMode
          session={session}
          onExit={() => setLessonMode(false)}
          onSessionDataChange={() => mutate()}
          isReadOnly={isReadOnly}
        />
      </DeskSurface>
    );
  }

  return (
    <DeskSurface>
      <PageTransition className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-6 lg:p-8">
        {/* Bookmark Tab for Previous Session (fixed position) */}
        <BookmarkTab
          previousSession={session.previous_session}
          homeworkToCheck={session.homework_completion}
        />

        {/* Curriculum Tab for Curriculum Suggestions (fixed position) */}
        <CurriculumTab suggestion={curriculumSuggestion} />

      {/* Header with Chalkboard */}
      <div>
        {/* Mobile: Navigation bar with back + context */}
        <div className="sm:hidden flex items-center gap-2 mb-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2" onClick={goBack} aria-label="Back to sessions">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">Session</span>
          <span className="text-sm text-muted-foreground font-mono">#{session.id}</span>
        </div>

        {/* Desktop: Side-by-side layout */}
        <div className="hidden sm:flex items-center gap-4">
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={goBack} aria-label="Back to sessions">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <ChalkboardHeader session={session} onEdit={() => setIsEditModalOpen(true)} onLesson={() => setLessonMode(true)} loadingActionId={loadingActionId} />
          </div>
        </div>

        {/* Mobile: Full-width chalkboard */}
        <div className="sm:hidden">
          <ChalkboardHeader session={session} onEdit={() => setIsEditModalOpen(true)} onLesson={() => setLessonMode(true)} loadingActionId={loadingActionId} />
        </div>
      </div>

      {/* Upcoming Tests Alert Banner */}
      <div className="pl-0 sm:pl-8 lg:pl-14">
        <TestAlertBanner tests={upcomingTests} />
      </div>

      {/* Memo Banner - shown when a tutor memo exists for this session */}
      {sessionMemo && (
        <div className="pl-0 sm:pl-8 lg:pl-14">
          <MemoBanner
            memo={sessionMemo}
            onView={() => setMemoViewOpen(true)}
            onImport={() => setMemoImportOpen(true)}
          />
        </div>
      )}

      {/* Dynamic Courseware and Notes Section */}
      {(() => {
        // Calculate what content exists
        const cwExercises = session.exercises?.filter(
          (ex) => ex.exercise_type === "Classwork" || ex.exercise_type === "CW"
        ) || [];
        const hwExercises = session.exercises?.filter(
          (ex) => ex.exercise_type === "Homework" || ex.exercise_type === "HW"
        ) || [];
        const hasNotes = !!(session.performance_rating || session.notes);
        const hasCW = cwExercises.length > 0;
        const hasHW = hwExercises.length > 0;
        const hasExercises = hasCW || hasHW;
        const printStamp: PrintStampInfo = {
          location: session.location,
          schoolStudentId: session.school_student_id,
          studentName: session.student_name,
          sessionDate: new Date(session.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          sessionTime: session.time_slot,
        };

        // If no content at all, return nothing
        if (!hasExercises && !hasNotes) return null;

        // If only notes (no courseware), show just sticky note
        if (!hasExercises && hasNotes) {
          return (
            <motion.div
              variants={refinedCardVariants}
              initial="hidden"
              animate="visible"
              transition={{ delay: 0.3 }}
              className="flex justify-center pl-0 sm:pl-8 lg:pl-14"
            >
              <StickyNote variant="pink" size="md" showTape={true} className="desk-shadow-medium">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-4 w-4 text-gray-700 dark:text-gray-300" />
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                    Comments
                  </h3>
                </div>
                {session.performance_rating && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, delay: 0.5 }}
                    className={cn(session.notes ? "float-right ml-3 mb-2" : "flex justify-center mb-3")}
                  >
                    <StarRating rating={starCount} size="md" showEmpty={true} />
                  </motion.div>
                )}
                {session.notes && (
                  <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">
                    {session.notes}
                  </p>
                )}
                {!session.notes && session.performance_rating && (
                  <p className="text-center text-sm text-gray-600 dark:text-gray-400 italic">
                    No Comments Provided
                  </p>
                )}
              </StickyNote>
            </motion.div>
          );
        }

        // Courseware exists - show unified vertical layout with wooden tab
        return (
          <div className="relative pt-4 sm:pt-8 lg:pt-10 pl-0 sm:pl-8 lg:pl-14">
            {/* Wooden Tab */}
            <CoursewareBanner title="Today's Courseware" />

            {/* Two-column layout: Unified Courseware (70%) on left, Notes (30%) on right */}
            <div className={cn(
              "flex flex-col lg:flex-row gap-6"
            )}>
              {/* Left column: Unified Courseware Section */}
              <motion.div
                variants={refinedCardVariants}
                initial="hidden"
                animate="visible"
                transition={{ delay: 0.4 }}
                className={cn(
                  "flex-1",
                  hasNotes && "lg:w-[70%]",
                  !hasNotes && "w-full"
                )}
                style={{ transform: 'rotate(-0.3deg)' }}
              >
                <GraphPaper gridSize="1cm" className="desk-shadow-low min-h-[300px]">
                  {/* Classwork Section */}
                  {hasCW && (
                    <>
                      <div className="flex items-center justify-between mb-4 pb-2 border-b-2 border-gray-400 dark:border-gray-600">
                        <button
                          onClick={() => setExerciseModalType("CW")}
                          className="flex items-center gap-2 cursor-pointer rounded-lg px-2 py-0.5 -mx-2 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                          title="Open Classwork editor"
                        >
                          <PenTool className="h-5 w-5 text-red-500 dark:text-red-400" />
                          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Classwork</h3>
                        </button>
                        <BulkExerciseActions exercises={cwExercises} stamp={printStamp} sessionDate={session.session_date} schoolStudentId={session.school_student_id} studentName={session.student_name} exerciseType="CW" />
                      </div>
                      <div className="space-y-3 mb-6">
                        {cwExercises.map((exercise, index) => {
                          const tooltip = `Created by ${exercise.created_by}${exercise.created_at ? ` at ${new Date(exercise.created_at).toLocaleString()}` : ''}`;
                          return (
                            <motion.div
                              key={exercise.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.5 + index * 0.1, duration: 0.3 }}
                              className="flex items-center gap-2 p-2 pl-4 rounded-md border-l-4 border-red-500 dark:border-red-400 transition-all duration-200 hover:bg-gray-100 dark:hover:bg-gray-800/30 hover:shadow-sm"
                              title={tooltip}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 dark:text-gray-100 break-all">{exercise.pdf_name || getUrlDisplayName(exercise.url || '', exercise.url_title)}</p>
                                {exercise.page_start && exercise.page_end ? (
                                  <p className="text-sm text-muted-foreground">Pages {exercise.page_start}-{exercise.page_end}</p>
                                ) : exercise.page_start ? (
                                  <p className="text-sm text-muted-foreground">Page {exercise.page_start}</p>
                                ) : !exercise.url ? (
                                  <p className="text-sm text-muted-foreground">Entire PDF</p>
                                ) : null}
                                {exercise.remarks && <p className="text-sm text-muted-foreground mt-1 italic">{exercise.remarks}</p>}
                              </div>
                              <SessionExerciseActions pdfName={exercise.pdf_name} url={exercise.url} pageStart={exercise.page_start} pageEnd={exercise.page_end} stamp={printStamp} />
                            </motion.div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {/* Homework Section */}
                  {hasHW && (
                    <>
                      <div className="flex items-center justify-between mb-4 pb-2 border-b-2 border-gray-400 dark:border-gray-600">
                        <button
                          onClick={() => setExerciseModalType("HW")}
                          className="flex items-center gap-2 cursor-pointer rounded-lg px-2 py-0.5 -mx-2 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors"
                          title="Open Homework editor"
                        >
                          <Home className="h-5 w-5 text-blue-500 dark:text-blue-400" />
                          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Homework</h3>
                        </button>
                        <BulkExerciseActions exercises={hwExercises} stamp={printStamp} sessionDate={session.session_date} schoolStudentId={session.school_student_id} studentName={session.student_name} exerciseType="HW" />
                      </div>
                      <div className="space-y-3">
                        {hwExercises.map((exercise, index) => {
                          const tooltip = `Created by ${exercise.created_by}${exercise.created_at ? ` at ${new Date(exercise.created_at).toLocaleString()}` : ''}`;
                          const baseDelay = hasCW ? 0.5 + cwExercises.length * 0.1 : 0.5;
                          return (
                            <motion.div
                              key={exercise.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: baseDelay + index * 0.1, duration: 0.3 }}
                              className="flex items-center gap-2 p-2 pl-4 rounded-md border-l-4 border-blue-500 dark:border-blue-400 transition-all duration-200 hover:bg-gray-100 dark:hover:bg-gray-800/30 hover:shadow-sm"
                              title={tooltip}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 dark:text-gray-100 break-all">{exercise.pdf_name || getUrlDisplayName(exercise.url || '', exercise.url_title)}</p>
                                {exercise.page_start && exercise.page_end ? (
                                  <p className="text-sm text-muted-foreground">Pages {exercise.page_start}-{exercise.page_end}</p>
                                ) : exercise.page_start ? (
                                  <p className="text-sm text-muted-foreground">Page {exercise.page_start}</p>
                                ) : !exercise.url ? (
                                  <p className="text-sm text-muted-foreground">Entire PDF</p>
                                ) : null}
                                {exercise.remarks && <p className="text-sm text-muted-foreground mt-1 italic">{exercise.remarks}</p>}
                              </div>
                              <SessionExerciseActions pdfName={exercise.pdf_name} url={exercise.url} pageStart={exercise.page_start} pageEnd={exercise.page_end} stamp={printStamp} />
                            </motion.div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </GraphPaper>
              </motion.div>

              {/* Right column: Session Notes */}
              {hasNotes && (
                <motion.div
                  variants={refinedCardVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{ delay: 0.6 }}
                  className="flex-shrink-0 lg:w-[calc(30%-0.75rem)] relative z-10"
                >
                  <StickyNote variant="pink" size="md" showTape={true} className="desk-shadow-medium h-full">
                    <div className="flex items-center gap-2 mb-3">
                      <FileText className="h-4 w-4 text-gray-700 dark:text-gray-300" />
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                        Comments
                      </h3>
                    </div>
                    {session.performance_rating && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 200, delay: 0.7 }}
                        className={cn(session.notes ? "float-right ml-3 mb-2" : "flex justify-center mb-3")}
                      >
                        <StarRating rating={starCount} size="md" showEmpty={true} />
                      </motion.div>
                    )}
                    {session.notes && (
                      <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">
                        {session.notes}
                      </p>
                    )}
                    {!session.notes && session.performance_rating && (
                      <p className="text-center text-sm text-gray-600 dark:text-gray-400 italic">
                        No Comments Provided
                      </p>
                    )}
                  </StickyNote>
                </motion.div>
              )}
            </div>
          </div>
        );
      })()}

    </PageTransition>

      {/* Edit Session Modal */}
      <EditSessionModal
        session={session}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSave={() => {
          setIsEditModalOpen(false);
        }}
      />

      {/* Exercise Modal for CW/HW */}
      {exerciseModalType && (
        <ExerciseModal
          session={session}
          exerciseType={exerciseModalType}
          isOpen={true}
          onClose={() => setExerciseModalType(null)}
        />
      )}

      {/* Memo View Modal */}
      {memoViewOpen && sessionMemo && (
        <MemoModal
          isOpen={true}
          onClose={() => setMemoViewOpen(false)}
          memo={sessionMemo}
        />
      )}

      {/* Memo Import Modal */}
      {memoImportOpen && sessionMemo && (
        <MemoImportModal
          isOpen={true}
          onClose={() => setMemoImportOpen(false)}
          memo={sessionMemo}
          sessionId={sessionId}
          onImported={() => mutate()}
        />
      )}

      {/* Keyboard shortcut hint button (shows when panel is hidden) */}
      {!showShortcutHints && (
        <button
          onClick={() => setShowShortcutHints(true)}
          className="hidden sm:flex fixed bottom-4 right-4 z-40 w-8 h-8 rounded-full
            bg-[#fef9f3] dark:bg-[#2d2618] border border-[#d4a574] dark:border-[#8b6f47]
            text-[#5c4033] dark:text-[#d4a574] font-mono text-sm
            items-center justify-center hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]
            shadow-md"
        >
          ?
        </button>
      )}

      {/* Keyboard Shortcut Hints Panel */}
      <AnimatePresence>
        {showShortcutHints && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-4 right-4 z-50 p-4 rounded-lg shadow-lg border
              bg-[#fef9f3] dark:bg-[#2d2618] border-[#d4a574] dark:border-[#8b6f47]
              text-sm w-56"
          >
            <div className="flex justify-between items-center mb-3">
              <span className="font-semibold text-[#5c4033] dark:text-[#d4a574]">
                Keyboard Shortcuts
              </span>
              <button
                onClick={() => setShowShortcutHints(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1.5 text-gray-600 dark:text-gray-300">
              <div className="flex justify-between gap-4">
                <kbd className="px-1.5 py-0.5 bg-white dark:bg-[#1a1a1a] rounded border text-xs font-mono">A/N</kbd>
                <span>Attended / No Show</span>
              </div>
              <div className="flex justify-between gap-4">
                <kbd className="px-1.5 py-0.5 bg-white dark:bg-[#1a1a1a] rounded border text-xs font-mono">C/H</kbd>
                <span>CW / HW</span>
              </div>
              <div className="flex justify-between gap-4">
                <kbd className="px-1.5 py-0.5 bg-white dark:bg-[#1a1a1a] rounded border text-xs font-mono">E</kbd>
                <span>Edit session</span>
              </div>
              <div className="flex justify-between gap-4">
                <kbd className="px-1.5 py-0.5 bg-white dark:bg-[#1a1a1a] rounded border text-xs font-mono">L</kbd>
                <span>Lesson Mode</span>
              </div>
              <div className="flex justify-between gap-4">
                <kbd className="px-1.5 py-0.5 bg-white dark:bg-[#1a1a1a] rounded border text-xs font-mono">Esc</kbd>
                <span>Go back</span>
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
              Press <kbd className="px-1 py-0.5 bg-white dark:bg-[#1a1a1a] rounded border font-mono">?</kbd> to toggle
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </DeskSurface>
  );
}
