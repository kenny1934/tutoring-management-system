"use client";

import { useLayoutEffect } from "react";
import { useRouter } from "next/navigation";
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
import { ArrowRight, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Session } from "@/types";
import { parseTimeSlot } from "@/lib/calendar-utils";

interface SessionDetailPopoverProps {
  session: Session;
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  tutorFilter?: string;
}

export function SessionDetailPopover({
  session,
  isOpen,
  onClose,
  triggerRef,
  tutorFilter = "",
}: SessionDetailPopoverProps) {
  const router = useRouter();

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
    placement: "bottom",
  });

  // Set reference in useLayoutEffect - runs synchronously after DOM mutations, before paint
  useLayoutEffect(() => {
    if (triggerRef.current) {
      refs.setReference(triggerRef.current);
    }
  }, [triggerRef.current, refs]);

  const dismiss = useDismiss(context);
  const { getFloatingProps } = useInteractions([dismiss]);

  if (!isOpen) return null;

  const parsed = parseTimeSlot(session.time_slot);

  const handleViewDetails = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/sessions/${session.id}`);
  };

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
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Grade:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {session.grade}
                {session.lang_stream && ` (${session.lang_stream})`}
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
            <StatusBadge status={session.session_status} />
          </div>
        </div>

        {/* Action button */}
        <Button
          onClick={handleViewDetails}
          className="w-full flex items-center justify-center gap-2"
          size="sm"
        >
          View Details
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </FloatingPortal>
  );
}
