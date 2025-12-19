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
import { ExternalLink, X, PenTool, Home, Copy, Check, XCircle, CheckCircle2, HandCoins, ArrowRight, Printer, Loader2 } from "lucide-react";
import { SessionStatusTag } from "@/components/ui/session-status-tag";
import { getDisplayStatus } from "@/lib/session-status";
import { StarRating, parseStarRating } from "@/components/ui/star-rating";
import { buttonVariants } from "@/components/ui/button";
import { SessionActionButtons } from "@/components/ui/action-buttons";
import { cn } from "@/lib/utils";
import type { Session } from "@/types";
import { parseTimeSlot } from "@/lib/calendar-utils";
import { sessionsAPI } from "@/lib/api";
import { updateSessionInCache } from "@/lib/session-cache";
import { useToast } from "@/contexts/ToastContext";
import { ExerciseModal } from "./ExerciseModal";
import { RateSessionModal } from "./RateSessionModal";
import { EditSessionModal } from "./EditSessionModal";
import {
  isFileSystemAccessSupported,
  openFileFromPath,
  printFileFromPath,
} from "@/lib/file-system";

// Grade tag colors
const GRADE_COLORS: Record<string, string> = {
  "F1C": "#c2dfce",
  "F1E": "#cedaf5",
  "F2C": "#fbf2d0",
  "F2E": "#f0a19e",
  "F3C": "#e2b1cc",
  "F3E": "#ebb26e",
  "F4C": "#7dc347",
  "F4E": "#a590e6",
};

const getGradeColor = (grade: string | undefined, langStream: string | undefined): string => {
  const key = `${grade || ""}${langStream || ""}`;
  return GRADE_COLORS[key] || "#e5e7eb";
};

// Parse full path to display name (filename without extension)
// V:\abc\def\ghi.pdf → ghi
// jkl.docx → jkl
// mno → mno
const getDisplayName = (pdfName: string): string => {
  const filename = pdfName.split(/[/\\]/).pop() || pdfName;
  return filename.replace(/\.[^.]+$/, '');
};

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
    const error = await openFileFromPath(exercise.pdf_name);
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
    const error = await printFileFromPath(exercise.pdf_name);
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
    <div className="flex items-center gap-1.5 text-xs">
      <span className="truncate min-w-0 text-gray-700 dark:text-gray-300" title={exercise.pdf_name}>
        {displayName}{pageInfo}
      </span>
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
function ExercisesList({ exercises }: { exercises: Array<{ exercise_type: string; pdf_name: string; page_start?: number; page_end?: number }> }) {
  const cwExercises = exercises.filter(
    (ex) => ex.exercise_type === "Classwork" || ex.exercise_type === "CW"
  );
  const hwExercises = exercises.filter(
    (ex) => ex.exercise_type === "Homework" || ex.exercise_type === "HW"
  );

  return (
    <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
      {cwExercises.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400 mb-1">
            <PenTool className="h-3 w-3 text-red-500" />
            <span className="text-xs font-medium">Classwork</span>
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
                <div>{new Date(session.rescheduled_to.session_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                <div className="flex items-center gap-2">
                  {session.rescheduled_to.tutor_name && <span>{session.rescheduled_to.tutor_name}</span>}
                  <SessionStatusTag status={session.rescheduled_to.session_status} size="sm" className="text-[10px] px-1 py-0" />
                </div>
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
                <div>{new Date(session.make_up_for.session_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                <div className="flex items-center gap-2">
                  {session.make_up_for.tutor_name && <span>{session.make_up_for.tutor_name}</span>}
                  <SessionStatusTag status={session.make_up_for.session_status} size="sm" className="text-[10px] px-1 py-0" />
                </div>
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

          {/* Exercises (CW/HW) */}
          {session.exercises && session.exercises.length > 0 && (
            <ExercisesList exercises={session.exercises} />
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
