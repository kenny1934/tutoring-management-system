"use client";

import { useMemo, useEffect } from "react";
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
import { ExternalLink, X } from "lucide-react";
import { SessionStatusTag } from "@/components/ui/session-status-tag";
import { StarRating, parseStarRating } from "@/components/ui/star-rating";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Session } from "@/types";
import { parseTimeSlot } from "@/lib/calendar-utils";

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

interface SessionDetailPopoverProps {
  session: Session;
  isOpen: boolean;
  onClose: () => void;
  clickPosition: { x: number; y: number } | null;
  tutorFilter?: string;
}

export function SessionDetailPopover({
  session,
  isOpen,
  onClose,
  clickPosition,
  tutorFilter = "",
}: SessionDetailPopoverProps) {
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
          <p className="text-sm font-bold text-gray-600 dark:text-gray-400">
            {session.school_student_id || "N/A"}
          </p>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {session.student_name || "Unknown Student"}
          </h3>
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

          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">Status:</span>
            <SessionStatusTag status={session.session_status} size="sm" />
          </div>

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
        </div>

        {/* Action link - using Link for Ctrl+click / middle-click support */}
        <Link
          href={`/sessions/${session.id}`}
          onClick={onClose}
          className={buttonVariants({ size: "sm", className: "w-full flex items-center justify-center gap-2 whitespace-nowrap" })}
        >
          View Details
          <ExternalLink className="h-4 w-4" />
        </Link>
      </div>
    </FloatingPortal>
  );
}
