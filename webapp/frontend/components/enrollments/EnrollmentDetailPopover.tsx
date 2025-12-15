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
import { X, Calendar, Clock, MapPin, HandCoins, ExternalLink, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Enrollment } from "@/types";

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

interface EnrollmentDetailPopoverProps {
  enrollment: Enrollment | null;
  isOpen: boolean;
  onClose: () => void;
  clickPosition: { x: number; y: number } | null;
  onNavigate?: () => void;
}

export function EnrollmentDetailPopover({
  enrollment,
  isOpen,
  onClose,
  clickPosition,
  onNavigate,
}: EnrollmentDetailPopoverProps) {
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

  // Use setPositionReference for virtual references
  useEffect(() => {
    if (virtualReference) {
      refs.setPositionReference(virtualReference);
    }
  }, [virtualReference, refs]);

  const dismiss = useDismiss(context);
  const { getFloatingProps } = useInteractions([dismiss]);

  if (!isOpen || !enrollment) return null;

  const isPending = enrollment.payment_status === 'Pending Payment';

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
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">{enrollment.school_student_id || "N/A"}</span>
            <span className="text-[10px] text-gray-400 font-mono">#{enrollment.id}</span>
          </div>
          <Link
            href={`/students/${enrollment.student_id}`}
            onClick={(e) => {
              e.stopPropagation();
              onNavigate?.();
              onClose();
            }}
            className="text-lg font-bold text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
          >
            {enrollment.student_name || "Unknown Student"}
          </Link>
        </div>

        {/* Details */}
        <div className="space-y-2 text-sm mb-4">
          {/* Grade */}
          {enrollment.grade && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Grade:</span>
              <span
                className="text-xs px-1.5 py-0.5 rounded text-gray-800"
                style={{ backgroundColor: getGradeColor(enrollment.grade, enrollment.lang_stream) }}
              >
                {enrollment.grade}{enrollment.lang_stream || ''}
              </span>
            </div>
          )}

          {/* School */}
          {enrollment.school && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">School:</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                {enrollment.school}
              </span>
            </div>
          )}

          {/* Schedule */}
          {enrollment.assigned_day && enrollment.assigned_time && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Schedule:
              </span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">
                {enrollment.assigned_day} {enrollment.assigned_time}
              </span>
            </div>
          )}

          {/* Location */}
          {enrollment.location && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                Location:
              </span>
              <span className="text-gray-900 dark:text-gray-100">
                {enrollment.location}
              </span>
            </div>
          )}

          {/* Payment Status */}
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
              <HandCoins className="h-3.5 w-3.5" />
              Payment:
            </span>
            <span className={cn(
              "px-2 py-0.5 rounded text-xs font-medium",
              isPending
                ? "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300"
                : "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300"
            )}>
              {enrollment.payment_status}
            </span>
          </div>

          {/* Lessons Paid */}
          {enrollment.lessons_paid !== undefined && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Lessons Paid:</span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">
                {enrollment.lessons_paid}
              </span>
            </div>
          )}

          {/* First Lesson Date */}
          {enrollment.first_lesson_date && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Started:
              </span>
              <span className="text-gray-900 dark:text-gray-100">
                {new Date(enrollment.first_lesson_date).toLocaleDateString()}
              </span>
            </div>
          )}

          {/* Tutor */}
          {enrollment.tutor_name && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                Tutor:
              </span>
              <span className="text-gray-900 dark:text-gray-100">
                {enrollment.tutor_name}
              </span>
            </div>
          )}
        </div>

        {/* Action link */}
        <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
          <Link
            href={`/enrollments/${enrollment.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onNavigate?.();
              onClose();
            }}
            className={cn(
              "w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md",
              "bg-[#a0704b] hover:bg-[#8a6040] text-white transition-colors"
            )}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View Enrollment Details
          </Link>
        </div>
      </div>
    </FloatingPortal>
  );
}
