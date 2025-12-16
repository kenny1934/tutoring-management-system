"use client";

import { useState, useLayoutEffect } from "react";
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
import { X, HandCoins, AlertTriangle } from "lucide-react";
import { EnrollmentDetailPopover } from "@/components/enrollments/EnrollmentDetailPopover";
import { cn } from "@/lib/utils";
import { getDisplayPaymentStatus, getPaymentStatusConfig } from "@/lib/enrollment-utils";
import { getGradeColor } from "@/lib/constants";
import type { Enrollment } from "@/types";

interface MoreEnrollmentsPopoverProps {
  enrollments: Enrollment[];
  triggerRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  highlightStudentIds?: number[];
}

export function MoreEnrollmentsPopover({
  enrollments,
  triggerRef,
  onClose,
  highlightStudentIds = [],
}: MoreEnrollmentsPopoverProps) {
  const [enrollmentToShow, setEnrollmentToShow] = useState<Enrollment | null>(null);
  const [clickPosition, setClickPosition] = useState<{ x: number; y: number } | null>(null);

  const { refs, floatingStyles, context } = useFloating({
    open: true,
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
    placement: "bottom",
  });

  // Set reference in useLayoutEffect - runs synchronously after DOM mutations, before paint
  useLayoutEffect(() => {
    if (triggerRef.current) {
      refs.setReference(triggerRef.current);
    }
  }, [triggerRef.current, refs]);

  const dismiss = useDismiss(context, {
    outsidePress: enrollmentToShow === null, // Disable when child popover is open
  });
  const { getFloatingProps } = useInteractions([dismiss]);

  if (!triggerRef.current) return null;

  return (
    <>
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
            "p-4 w-[min(280px,90vw)] max-h-[400px]",
            "paper-texture overflow-y-auto"
          )}
        >
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-gray-900 dark:text-gray-100">
              {enrollments.length} Students
            </h3>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              aria-label="Close"
            >
              <X className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          <div className="space-y-1.5">
            {enrollments.map((enrollment) => {
              const displayStatus = getDisplayPaymentStatus(enrollment);
              const statusConfig = getPaymentStatusConfig(displayStatus);
              const isOverdue = displayStatus === 'Overdue';
              const isPending = displayStatus === 'Pending Payment';
              const isHighlighted = highlightStudentIds.includes(enrollment.student_id);
              return (
                <div
                  key={enrollment.id}
                  onClick={(e) => {
                    setClickPosition({ x: e.clientX, y: e.clientY });
                    setEnrollmentToShow(enrollment);
                  }}
                  className={cn(
                    "cursor-pointer rounded overflow-hidden flex",
                    "shadow-sm hover:shadow-md transition-all",
                    "hover:scale-[1.01] hover:-translate-y-0.5",
                    statusConfig.bgTint,
                    isHighlighted && "ring-2 ring-[#a0704b] dark:ring-[#cd853f]"
                  )}
                >
                  <div className="flex-1 min-w-0 px-2.5 py-2">
                    <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 flex justify-between items-center">
                      <span className="flex items-center gap-1">
                        {enrollment.school_student_id || "N/A"}
                        {isOverdue && (
                          <AlertTriangle className="h-3 w-3 text-red-500" />
                        )}
                        {isPending && !isOverdue && (
                          <HandCoins className="h-3 w-3 text-amber-500" />
                        )}
                      </span>
                      {enrollment.assigned_time && (
                        <span>{enrollment.assigned_time}</span>
                      )}
                    </p>
                    <p className={cn(
                      "text-sm font-semibold flex items-center gap-1 overflow-hidden",
                      isOverdue ? "text-red-600 dark:text-red-400" :
                      isPending ? "text-amber-700 dark:text-amber-400" :
                      "text-gray-900 dark:text-gray-100"
                    )}>
                      <span className="truncate">{enrollment.student_name || "Unknown"}</span>
                      {enrollment.grade && (
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded text-gray-800 whitespace-nowrap"
                          style={{ backgroundColor: getGradeColor(enrollment.grade, enrollment.lang_stream) }}
                        >{enrollment.grade}{enrollment.lang_stream || ''}</span>
                      )}
                      {enrollment.school && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 whitespace-nowrap">{enrollment.school}</span>
                      )}
                    </p>
                  </div>
                  <div className={cn("w-6 rounded-r flex items-center justify-center", statusConfig.bgClass)}>
                    {isOverdue && <AlertTriangle className="h-3.5 w-3.5 text-white" />}
                    {isPending && !isOverdue && <HandCoins className="h-3.5 w-3.5 text-white" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </FloatingPortal>

      {enrollmentToShow && (
        <EnrollmentDetailPopover
          enrollment={enrollmentToShow}
          isOpen={true}
          onClose={() => setEnrollmentToShow(null)}
          clickPosition={clickPosition}
        />
      )}
    </>
  );
}
