"use client";

import { useMemo, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useDismiss,
  useInteractions,
  FloatingPortal,
} from "@floating-ui/react";
import { ExternalLink, X, PenTool, Home, Copy, Check, XCircle, CheckCircle2, HandCoins, ArrowRight, Printer, Loader2, AlertTriangle, History, ChevronDown, ChevronRight, Star, Info, Download } from "lucide-react";
import useSWR from "swr";
import { useSession } from "@/lib/hooks";
import { SessionStatusTag } from "@/components/ui/session-status-tag";
import { getDisplayStatus } from "@/lib/session-status";
import { StarRating, parseStarRating } from "@/components/ui/star-rating";
import { buttonVariants } from "@/components/ui/button";
import { SessionActionButtons } from "@/components/ui/action-buttons";
import { cn } from "@/lib/utils";
import type { Session, UpcomingTestAlert } from "@/types";
import { parseTimeSlot } from "@/lib/calendar-utils";
import { sessionsAPI, api } from "@/lib/api";
import { updateSessionInCache } from "@/lib/session-cache";
import { useToast } from "@/contexts/ToastContext";
import { ExerciseModal } from "./ExerciseModal";
import { RateSessionModal } from "./RateSessionModal";
import { EditSessionModal } from "./EditSessionModal";
import {
  isFileSystemAccessSupported,
  openFileFromPathWithFallback,
  printFileFromPathWithFallback,
  printBulkFiles,
  downloadBulkFiles,
} from "@/lib/file-system";
import { searchPaperlessByPath } from "@/lib/paperless-utils";
import { getGradeColor } from "@/lib/constants";
import { getDisplayName } from "@/lib/exercise-utils";

// Exercise item with copy, open, and print functionality
function ExerciseItem({ exercise }: { exercise: { pdf_name: string; page_start?: number; page_end?: number } }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [openState, setOpenState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [printState, setPrintState] = useState<'idle' | 'loading' | 'error'>('idle');
  const canBrowseFiles = typeof window !== 'undefined' && isFileSystemAccessSupported();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exercise.pdf_name);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 1500);
    } catch (err) {
      // Clipboard API may not be available on some mobile browsers
      console.warn('Clipboard not available:', err);
      setCopyState('failed');
      setTimeout(() => setCopyState('idle'), 1500);
    }
  };

  const handleOpen = async () => {
    if (openState === 'loading') return;
    setOpenState('loading');
    const error = await openFileFromPathWithFallback(exercise.pdf_name, searchPaperlessByPath);
    if (error) {
      console.warn('Failed to open file:', error);
      setOpenState('error');
      setTimeout(() => setOpenState('idle'), 2000);
    } else {
      setOpenState('idle');
    }
  };

  const handlePrint = async () => {
    if (printState === 'loading') return;
    setPrintState('loading');
    const error = await printFileFromPathWithFallback(
      exercise.pdf_name,
      exercise.page_start,
      exercise.page_end,
      undefined,
      undefined,
      searchPaperlessByPath
    );
    if (error) {
      console.warn('Failed to print file:', error);
      setPrintState('error');
      setTimeout(() => setPrintState('idle'), 2000);
    } else {
      setPrintState('idle');
    }
  };

  const displayName = getDisplayName(exercise.pdf_name);
  const pageInfo = exercise.page_start
    ? exercise.page_end && exercise.page_end !== exercise.page_start
      ? ` (p${exercise.page_start}-${exercise.page_end})`
      : ` (p${exercise.page_start})`
    : '';

  return (
    <div className="flex items-center gap-1.5 text-xs min-w-0 overflow-hidden flex-1">
      <span className="truncate min-w-0 text-gray-700 dark:text-gray-300" title={exercise.pdf_name}>
        {displayName}
      </span>
      {pageInfo && (
        <span className="flex-shrink-0 text-gray-500 dark:text-gray-400">
          {pageInfo}
        </span>
      )}
      <button
        onClick={handleCopy}
        className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex-shrink-0"
        title="Copy full path"
      >
        {copyState === 'copied' ? (
          <Check className="h-3 w-3 text-green-500" />
        ) : copyState === 'failed' ? (
          <XCircle className="h-3 w-3 text-red-500" />
        ) : (
          <Copy className="h-3 w-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
        )}
      </button>
      {canBrowseFiles && (
        <>
          <button
            onClick={handleOpen}
            disabled={openState === 'loading'}
            className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex-shrink-0"
            title="Open PDF in new tab"
          >
            {openState === 'loading' ? (
              <Loader2 className="h-3 w-3 text-gray-400 animate-spin" />
            ) : openState === 'error' ? (
              <XCircle className="h-3 w-3 text-red-500" />
            ) : (
              <ExternalLink className="h-3 w-3 text-gray-400 hover:text-blue-500" />
            )}
          </button>
          <button
            onClick={handlePrint}
            disabled={printState === 'loading'}
            className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex-shrink-0"
            title="Print PDF"
          >
            {printState === 'loading' ? (
              <Loader2 className="h-3 w-3 text-gray-400 animate-spin" />
            ) : printState === 'error' ? (
              <XCircle className="h-3 w-3 text-red-500" />
            ) : (
              <Printer className="h-3 w-3 text-gray-400 hover:text-green-500" />
            )}
          </button>
        </>
      )}
    </div>
  );
}

// Exercises list component
function ExercisesList({ exercises, session }: {
  exercises: Array<{ exercise_type: string; pdf_name: string; page_start?: number; page_end?: number }>;
  session: Session;
}) {
  const [cwPrintState, setCwPrintState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [cwDownloadState, setCwDownloadState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [hwPrintState, setHwPrintState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [hwDownloadState, setHwDownloadState] = useState<'idle' | 'loading' | 'error'>('idle');
  const canBrowseFiles = typeof window !== 'undefined' && isFileSystemAccessSupported();

  const cwExercises = exercises.filter(
    (ex) => ex.exercise_type === "Classwork" || ex.exercise_type === "CW"
  );
  const hwExercises = exercises.filter(
    (ex) => ex.exercise_type === "Homework" || ex.exercise_type === "HW"
  );

  // Generate filename components
  const studentName = (session.student_name || 'Unknown').replace(/\s+/g, '_');
  const dateStr = session.session_date?.replace(/-/g, '') || '';

  const handlePrintAll = async (type: 'CW' | 'HW') => {
    const setLoading = type === 'CW' ? setCwPrintState : setHwPrintState;
    const exerciseList = type === 'CW' ? cwExercises : hwExercises;

    if (exerciseList.length === 0) return;
    setLoading('loading');

    const bulkExercises = exerciseList.map(ex => ({
      pdf_name: ex.pdf_name,
      page_start: ex.page_start,
      page_end: ex.page_end,
    }));

    const title = `${type}_${session.school_student_id}_${studentName}_${dateStr}.pdf`;
    const stamp = {
      location: session.location,
      schoolStudentId: session.school_student_id,
      studentName: session.student_name,
      sessionDate: session.session_date,
      sessionTime: session.time_slot,
    };

    const error = await printBulkFiles(bulkExercises, stamp, searchPaperlessByPath, title);
    if (error) {
      console.warn('Failed to print all:', error);
      setLoading('error');
      setTimeout(() => setLoading('idle'), 2000);
    } else {
      setLoading('idle');
    }
  };

  const handleDownloadAll = async (type: 'CW' | 'HW') => {
    const setLoading = type === 'CW' ? setCwDownloadState : setHwDownloadState;
    const exerciseList = type === 'CW' ? cwExercises : hwExercises;

    if (exerciseList.length === 0) return;
    setLoading('loading');

    const bulkExercises = exerciseList.map(ex => ({
      pdf_name: ex.pdf_name,
      page_start: ex.page_start,
      page_end: ex.page_end,
    }));

    const filename = `${type}_${session.school_student_id}_${studentName}_${dateStr}.pdf`;
    const stamp = {
      location: session.location,
      schoolStudentId: session.school_student_id,
      studentName: session.student_name,
      sessionDate: session.session_date,
      sessionTime: session.time_slot,
    };

    const error = await downloadBulkFiles(bulkExercises, filename, stamp, searchPaperlessByPath);
    if (error) {
      console.warn('Failed to download all:', error);
      setLoading('error');
      setTimeout(() => setLoading('idle'), 2000);
    } else {
      setLoading('idle');
    }
  };

  return (
    <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
      {cwExercises.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400 mb-1">
            <PenTool className="h-3 w-3 text-red-500" />
            <span className="text-xs font-medium">Classwork</span>
            {canBrowseFiles && cwExercises.length > 0 && (
              <div className="flex items-center gap-0.5 ml-auto">
                <button
                  onClick={() => handlePrintAll('CW')}
                  disabled={cwPrintState === 'loading'}
                  className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                  title="Print All CW"
                >
                  {cwPrintState === 'loading' ? (
                    <Loader2 className="h-3 w-3 text-gray-400 animate-spin" />
                  ) : cwPrintState === 'error' ? (
                    <XCircle className="h-3 w-3 text-red-500" />
                  ) : (
                    <Printer className="h-3 w-3 text-gray-400 hover:text-green-500" />
                  )}
                </button>
                <button
                  onClick={() => handleDownloadAll('CW')}
                  disabled={cwDownloadState === 'loading'}
                  className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                  title="Download All CW"
                >
                  {cwDownloadState === 'loading' ? (
                    <Loader2 className="h-3 w-3 text-gray-400 animate-spin" />
                  ) : cwDownloadState === 'error' ? (
                    <XCircle className="h-3 w-3 text-red-500" />
                  ) : (
                    <Download className="h-3 w-3 text-gray-400 hover:text-blue-500" />
                  )}
                </button>
              </div>
            )}
          </div>
          <div className="space-y-0.5 pl-4">
            {cwExercises.map((ex, i) => (
              <ExerciseItem key={i} exercise={ex} />
            ))}
          </div>
        </div>
      )}
      {hwExercises.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400 mb-1">
            <Home className="h-3 w-3 text-blue-500" />
            <span className="text-xs font-medium">Homework</span>
            {canBrowseFiles && hwExercises.length > 0 && (
              <div className="flex items-center gap-0.5 ml-auto">
                <button
                  onClick={() => handlePrintAll('HW')}
                  disabled={hwPrintState === 'loading'}
                  className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                  title="Print All HW"
                >
                  {hwPrintState === 'loading' ? (
                    <Loader2 className="h-3 w-3 text-gray-400 animate-spin" />
                  ) : hwPrintState === 'error' ? (
                    <XCircle className="h-3 w-3 text-red-500" />
                  ) : (
                    <Printer className="h-3 w-3 text-gray-400 hover:text-green-500" />
                  )}
                </button>
                <button
                  onClick={() => handleDownloadAll('HW')}
                  disabled={hwDownloadState === 'loading'}
                  className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                  title="Download All HW"
                >
                  {hwDownloadState === 'loading' ? (
                    <Loader2 className="h-3 w-3 text-gray-400 animate-spin" />
                  ) : hwDownloadState === 'error' ? (
                    <XCircle className="h-3 w-3 text-red-500" />
                  ) : (
                    <Download className="h-3 w-3 text-gray-400 hover:text-blue-500" />
                  )}
                </button>
              </div>
            )}
          </div>
          <div className="space-y-0.5 pl-4">
            {hwExercises.map((ex, i) => (
              <ExerciseItem key={i} exercise={ex} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface SessionDetailPopoverProps {
  session: Session | null;
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
  clickPosition: { x: number; y: number } | null;
  tutorFilter?: string;
  onNavigate?: () => void;
}

export function SessionDetailPopover({
  session,
  isOpen,
  isLoading = false,
  onClose,
  clickPosition,
  tutorFilter = "",
  onNavigate,
}: SessionDetailPopoverProps) {
  const { showToast } = useToast();

  // Modal state for keyboard shortcuts
  const [exerciseModalType, setExerciseModalType] = useState<"CW" | "HW" | null>(null);
  const [isRateModalOpen, setIsRateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);

  // Tests and Recap section state (using SWR for caching)
  const [testsExpanded, setTestsExpanded] = useState(false);
  const [recapExpanded, setRecapExpanded] = useState(false);
  const [expandedTest, setExpandedTest] = useState<string | null>(null);

  // Fetch upcoming tests with SWR caching
  const { data: upcomingTests = [], isLoading: isLoadingTests } = useSWR<UpcomingTestAlert[]>(
    isOpen && session?.id ? ['upcoming-tests', session.id] : null,
    () => api.sessions.getUpcomingTests(session!.id)
  );

  // Fetch detailed session with SWR caching (for previous_session and homework_completion)
  const { data: detailedSession, isLoading: isLoadingDetails } = useSession(isOpen ? session?.id : null);

  // Check if session can be marked (not already attended/completed)
  const canBeMarked = useCallback((s: Session | null) => {
    if (!s) return false;
    return ['Scheduled', 'Trial Class', 'Make-up Class'].includes(s.session_status);
  }, []);

  // Keyboard shortcuts handler
  useEffect(() => {
    if (!isOpen || !session) return;

    const handleKeyDown = async (e: KeyboardEvent) => {
      // Skip if typing in an input or if a modal is open
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (exerciseModalType || isRateModalOpen || isEditModalOpen) return;

      const key = e.key.toLowerCase();

      switch (key) {
        case 'a':
          // Mark Attended
          if (canBeMarked(session)) {
            e.preventDefault();
            setLoadingActionId('attended');
            try {
              const updatedSession = await sessionsAPI.markAttended(session.id);
              updateSessionInCache(updatedSession);
              showToast("Session marked as attended", "success");
            } catch (error) {
              console.error("Failed to mark as attended:", error);
              showToast("Failed to mark as attended", "error");
            } finally {
              setLoadingActionId(null);
            }
          }
          break;
        case 'n':
          // Mark No Show
          if (canBeMarked(session)) {
            e.preventDefault();
            setLoadingActionId('no-show');
            try {
              const updatedSession = await sessionsAPI.markNoShow(session.id);
              updateSessionInCache(updatedSession);
              showToast("Session marked as no show", "success");
            } catch (error) {
              console.error("Failed to mark as no show:", error);
              showToast("Failed to mark as no show", "error");
            } finally {
              setLoadingActionId(null);
            }
          }
          break;
        case 'c':
          // Open CW modal
          e.preventDefault();
          setExerciseModalType("CW");
          break;
        case 'h':
          // Open HW modal
          e.preventDefault();
          setExerciseModalType("HW");
          break;
        case 'r':
          // Open Rate modal
          e.preventDefault();
          setIsRateModalOpen(true);
          break;
        case 'e':
          // Open Edit modal
          e.preventDefault();
          setIsEditModalOpen(true);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, session, exerciseModalType, isRateModalOpen, isEditModalOpen, canBeMarked, showToast]);

  // Virtual reference based on click position
  const virtualReference = useMemo(() => {
    if (!clickPosition) return null;
    return {
      getBoundingClientRect: () => ({
        x: clickPosition.x,
        y: clickPosition.y,
        top: clickPosition.y,
        left: clickPosition.x,
        bottom: clickPosition.y,
        right: clickPosition.x,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      }),
    };
  }, [clickPosition]);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: (open) => {
      if (!open) onClose();
    },
    middleware: [
      offset(8),
      flip({
        fallbackAxisSideDirection: "end",
        padding: 16,
      }),
      shift({
        padding: 16,
      }),
    ],
    whileElementsMounted: autoUpdate,
    placement: "bottom-start",
  });

  // Use setPositionReference for virtual references (not elements.reference)
  useEffect(() => {
    if (virtualReference) {
      refs.setPositionReference(virtualReference);
    }
  }, [virtualReference, refs]);

  const dismiss = useDismiss(context);
  const { getFloatingProps } = useInteractions([dismiss]);

  if (!isOpen) return null;

  // Loading skeleton
  if (isLoading || !session) {
    return (
      <FloatingPortal>
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          {...getFloatingProps()}
          className={cn(
            "z-[9999]",
            "bg-[#fef9f3] dark:bg-[#2d2618]",
            "border-2 border-[#d4a574] dark:border-[#8b6f47]",
            "rounded-lg shadow-lg",
            "p-4 w-[280px]",
            "paper-texture"
          )}
        >
          <button
            onClick={onClose}
            className="absolute top-2 right-2 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            aria-label="Close"
          >
            <X className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          </button>
          <div className="animate-pulse space-y-3">
            <div className="h-3 w-16 bg-gray-300 dark:bg-gray-600 rounded" />
            <div className="h-5 w-32 bg-gray-300 dark:bg-gray-600 rounded" />
            <div className="space-y-2 pt-2">
              <div className="flex justify-between">
                <div className="h-3 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
              <div className="flex justify-between">
                <div className="h-3 w-10 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
              <div className="flex justify-between">
                <div className="h-3 w-8 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
              <div className="flex justify-between">
                <div className="h-3 w-10 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
              <div className="flex justify-between">
                <div className="h-3 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-5 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            </div>
            <div className="h-8 w-full bg-gray-200 dark:bg-gray-700 rounded mt-4" />
          </div>
        </div>
      </FloatingPortal>
    );
  }

  const parsed = parseTimeSlot(session.time_slot);

  // Computed values for Recap section (using detailedSession from API)
  const uncheckedHwCount = detailedSession?.homework_completion?.filter(
    hw => !hw.completion_status || hw.completion_status === "Not Checked"
  ).length || 0;

  const starCount = detailedSession?.previous_session?.performance_rating
    ? (detailedSession.previous_session.performance_rating.match(/⭐/g) || []).length
    : 0;

  const prevClasswork = detailedSession?.previous_session?.exercises?.filter(
    ex => ex.exercise_type === "Classwork" || ex.exercise_type === "CW"
  ) || [];

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        {...getFloatingProps()}
        className={cn(
          "z-[9999]",
          "bg-[#fef9f3] dark:bg-[#2d2618]",
          "border-2 border-[#d4a574] dark:border-[#8b6f47]",
          "rounded-lg shadow-lg",
          "p-4 w-[280px]",
          "max-h-[80vh] overflow-y-auto",
          "paper-texture"
        )}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          aria-label="Close"
        >
          <X className="h-4 w-4 text-gray-500 dark:text-gray-400" />
        </button>

        {/* Header */}
        <div className="mb-3 pr-6">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-gray-600 dark:text-gray-400">
              {session.school_student_id || "N/A"}
            </p>
            <span className="text-[10px] text-gray-400 font-mono">#{session.id}</span>
          </div>
          <Link
            href={`/students/${session.student_id}`}
            onClick={(e) => {
              e.stopPropagation();
              onNavigate?.();
              onClose();
            }}
            className="text-lg font-bold text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
          >
            {session.student_name || "Unknown Student"}
          </Link>
        </div>

        {/* Details */}
        <div className="space-y-2 text-sm mb-4">
          {session.grade && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Grade:</span>
              <span
                className="text-xs px-1.5 py-0.5 rounded text-gray-800"
                style={{ backgroundColor: getGradeColor(session.grade, session.lang_stream) }}
              >
                {session.grade}{session.lang_stream}
              </span>
            </div>
          )}

          {session.school && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">School:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {session.school}
              </span>
            </div>
          )}

          {!tutorFilter && session.tutor_name && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Tutor:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {session.tutor_name}
              </span>
            </div>
          )}

          {session.session_date && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Date:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {new Date(session.session_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
            </div>
          )}

          {parsed && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Time:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {parsed.start} - {parsed.end}
              </span>
            </div>
          )}

          {session.location && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Location:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {session.location}
              </span>
            </div>
          )}

          {session.financial_status && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Payment:</span>
              <div className="flex items-center gap-1">
                {session.financial_status === "Paid" ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-sm font-medium text-green-600">Paid</span>
                  </>
                ) : (
                  <>
                    <HandCoins className="h-3.5 w-3.5 text-red-500" />
                    <span className="text-sm font-medium text-red-600">Unpaid</span>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">Status:</span>
            {loadingActionId ? (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-gray-500">Updating...</span>
              </div>
            ) : (
              <SessionStatusTag status={getDisplayStatus(session)} size="sm" className="max-w-[140px] min-w-0" />
            )}
          </div>

          {/* Session Linking */}
          {session.rescheduled_to && (
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Make-up Session</span>
                <Link
                  href={`/sessions/${session.rescheduled_to.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigate?.();
                    onClose();
                  }}
                  className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <ArrowRight className="h-3 w-3" />
                  <span className="font-mono">#{session.rescheduled_to.id}</span>
                </Link>
              </div>
              <div className="text-xs text-gray-700 dark:text-gray-300 space-y-0.5 pl-2">
                <div className="flex items-center justify-between">
                  <span>
                    {new Date(session.rescheduled_to.session_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    {session.rescheduled_to.time_slot && ` · ${session.rescheduled_to.time_slot}`}
                  </span>
                  <SessionStatusTag status={session.rescheduled_to.session_status} size="sm" className="text-[10px] px-1 py-0 truncate max-w-[60px]" />
                </div>
                {session.rescheduled_to.tutor_name && <div>{session.rescheduled_to.tutor_name}</div>}
              </div>
            </div>
          )}

          {session.make_up_for && (
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Original Session</span>
                <Link
                  href={`/sessions/${session.make_up_for.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigate?.();
                    onClose();
                  }}
                  className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <ArrowRight className="h-3 w-3 rotate-180" />
                  <span className="font-mono">#{session.make_up_for.id}</span>
                </Link>
              </div>
              <div className="text-xs text-gray-700 dark:text-gray-300 space-y-0.5 pl-2">
                <div className="flex items-center justify-between">
                  <span>
                    {new Date(session.make_up_for.session_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    {session.make_up_for.time_slot && ` · ${session.make_up_for.time_slot}`}
                  </span>
                  <SessionStatusTag status={session.make_up_for.session_status} size="sm" className="text-[10px] px-1 py-0 truncate max-w-[60px]" />
                </div>
                {session.make_up_for.tutor_name && <div>{session.make_up_for.tutor_name}</div>}
              </div>
            </div>
          )}

          {session.performance_rating && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Rating:</span>
              <StarRating
                rating={parseStarRating(session.performance_rating)}
                showEmpty={true}
                size="sm"
              />
            </div>
          )}

          {/* Notes */}
          {session.notes && (
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Comments:</span>
              <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5 whitespace-pre-wrap">
                {session.notes}
              </p>
            </div>
          )}

          {/* Upcoming Tests Section */}
          {isLoadingTests ? (
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 animate-pulse bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-3 w-12 animate-pulse bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            </div>
          ) : upcomingTests.length > 0 && (
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setTestsExpanded(!testsExpanded)}
                className="flex items-center gap-1.5 w-full text-left"
              >
                {testsExpanded ? <ChevronDown className="h-3 w-3 text-gray-500" /> : <ChevronRight className="h-3 w-3 text-gray-500" />}
                <AlertTriangle className="h-3 w-3 text-amber-500" />
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Tests</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-amber-500 text-white rounded-full ml-auto">
                  {upcomingTests.length}
                </span>
              </button>
              {testsExpanded && (
                <div className="mt-1.5 space-y-1.5 pl-4">
                  {upcomingTests.map(test => (
                    <div key={test.event_id} className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className={cn(
                          "px-1 py-0.5 rounded text-[10px] font-medium text-white flex-shrink-0",
                          test.event_type.toLowerCase().includes('quiz') ? 'bg-green-500' :
                          test.event_type.toLowerCase().includes('exam') ? 'bg-purple-500' : 'bg-red-500'
                        )}>
                          {test.event_type}
                        </span>
                        <span className="truncate text-gray-700 dark:text-gray-300">{test.title}</span>
                        <span className="text-gray-500 ml-auto flex-shrink-0">{test.days_until}d</span>
                        {test.description && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedTest(expandedTest === test.event_id ? null : test.event_id);
                            }}
                            className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex-shrink-0"
                            title="Show syllabus"
                          >
                            <Info className={cn("h-3 w-3", expandedTest === test.event_id ? "text-amber-500" : "text-gray-400")} />
                          </button>
                        )}
                      </div>
                      {expandedTest === test.event_id && test.description && (
                        <div className="pl-5 text-[10px] text-gray-600 dark:text-gray-400 whitespace-pre-wrap bg-gray-50 dark:bg-gray-800/50 rounded p-1.5 max-h-24 overflow-y-auto">
                          {test.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Recap Section (Previous Session + Homework to Check) */}
          {isLoadingDetails ? (
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 animate-pulse bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-3 w-12 animate-pulse bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            </div>
          ) : (detailedSession?.previous_session || (detailedSession?.homework_completion && detailedSession.homework_completion.length > 0)) && (
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setRecapExpanded(!recapExpanded)}
                className="flex items-center gap-1.5 w-full text-left"
              >
                {recapExpanded ? <ChevronDown className="h-3 w-3 text-gray-500" /> : <ChevronRight className="h-3 w-3 text-gray-500" />}
                <History className="h-3 w-3 text-[#8b6f47]" />
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Recap</span>
                {uncheckedHwCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-orange-500 text-white rounded-full ml-auto">
                    {uncheckedHwCount}
                  </span>
                )}
              </button>
              {recapExpanded && (
                <div className="mt-1.5 space-y-2 pl-4">
                  {/* Previous Session Info */}
                  {detailedSession?.previous_session && (
                    <div className="text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/sessions/${detailedSession.previous_session.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigate?.();
                              onClose();
                            }}
                            className="text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {new Date(detailedSession.previous_session.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {detailedSession.previous_session.time_slot && (
                              <span className="text-gray-500 dark:text-gray-400 ml-1">· {detailedSession.previous_session.time_slot}</span>
                            )}
                          </Link>
                          <Link
                            href={`/sessions/${detailedSession.previous_session.id}`}
                            target="_blank"
                            onClick={(e) => e.stopPropagation()}
                            className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                            title="Open in new tab"
                          >
                            <ExternalLink className="h-3 w-3 text-gray-400" />
                          </Link>
                        </div>
                        {detailedSession.previous_session.performance_rating && (
                          <div className="flex">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} className={cn("h-2.5 w-2.5", i < starCount ? "fill-yellow-400 text-yellow-400" : "text-gray-300")} />
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Previous CW */}
                      {prevClasswork.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {prevClasswork.map((ex, i) => (
                            <ExerciseItem key={i} exercise={ex} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Homework to Check */}
                  {detailedSession?.homework_completion && detailedSession.homework_completion.length > 0 && (
                    <div className="text-xs space-y-0.5">
                      <span className="text-gray-500 text-[10px]">HW to check:</span>
                      {detailedSession.homework_completion.map((hw, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <span className={cn(
                            "text-[9px] px-1 rounded flex-shrink-0",
                            hw.completion_status === 'Completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                            hw.completion_status === 'Partially Completed' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                            'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                          )}>
                            {hw.completion_status === 'Completed' ? '✓' : hw.completion_status === 'Partially Completed' ? '~' : '○'}
                          </span>
                          {hw.pdf_name ? (
                            <ExerciseItem exercise={{ pdf_name: hw.pdf_name }} />
                          ) : (
                            <span className="text-gray-500 italic">No PDF</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Exercises (CW/HW) */}
          {session.exercises && session.exercises.length > 0 && (
            <ExercisesList exercises={session.exercises} session={session} />
          )}
        </div>

        {/* Action Buttons */}
        <SessionActionButtons
          session={session}
          size="md"
          showLabels
          loadingActionId={loadingActionId}
          className="mb-3 pt-3 border-t border-gray-200 dark:border-gray-700"
        />

        {/* Action link - using Link for Ctrl+click / middle-click support */}
        <Link
          href={`/sessions/${session.id}`}
          onClick={() => {
            onNavigate?.();
            onClose();
          }}
          className={buttonVariants({ size: "sm", className: "w-full flex items-center justify-center gap-2 whitespace-nowrap" })}
        >
          View Details
          <ExternalLink className="h-4 w-4" />
        </Link>

        {/* Keyboard shortcut hint */}
        <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-[10px] text-gray-400 dark:text-gray-500 text-center">
          <span className="font-mono">A</span>=Attended <span className="font-mono">N</span>=No Show <span className="font-mono">C</span>=CW <span className="font-mono">H</span>=HW <span className="font-mono">R</span>=Rate <span className="font-mono">E</span>=Edit
        </div>
      </div>

      {/* Modals triggered by keyboard shortcuts */}
      {exerciseModalType && session && (
        <ExerciseModal
          session={session}
          exerciseType={exerciseModalType}
          isOpen={true}
          onClose={() => setExerciseModalType(null)}
        />
      )}

      {isRateModalOpen && session && (
        <RateSessionModal
          session={session}
          isOpen={true}
          onClose={() => setIsRateModalOpen(false)}
        />
      )}

      {isEditModalOpen && session && (
        <EditSessionModal
          session={session}
          isOpen={true}
          onClose={() => setIsEditModalOpen(false)}
        />
      )}
    </FloatingPortal>
  );
}
