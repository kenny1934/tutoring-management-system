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
import { X, HandCoins } from "lucide-react";
import { SessionDetailPopover } from "@/components/sessions/SessionDetailPopover";
import { cn } from "@/lib/utils";
import { getSessionStatusConfig } from "@/lib/session-status";
import type { Session } from "@/types";

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

interface MoreSessionsPopoverProps {
  sessions: Session[];
  triggerRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  tutorFilter?: string;
}

export function MoreSessionsPopover({
  sessions,
  triggerRef,
  onClose,
  tutorFilter = "",
}: MoreSessionsPopoverProps) {
  const [sessionToShow, setSessionToShow] = useState<Session | null>(null);
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
    outsidePress: sessionToShow === null, // Disable when child popover is open
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
            "p-4 w-[280px] max-h-[400px]",
            "paper-texture overflow-y-auto"
          )}
        >
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-gray-900 dark:text-gray-100">
              {sessions.length} Sessions
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
            {sessions.map((session) => {
              const statusConfig = getSessionStatusConfig(session.session_status);
              const StatusIcon = statusConfig.Icon;
              return (
                <div
                  key={session.id}
                  onClick={(e) => {
                    setClickPosition({ x: e.clientX, y: e.clientY });
                    setSessionToShow(session);
                  }}
                  className={cn(
                    "cursor-pointer rounded overflow-hidden flex",
                    "shadow-sm hover:shadow-md transition-all",
                    "hover:scale-[1.01] hover:-translate-y-0.5",
                    statusConfig.bgTint
                  )}
                >
                  <div className="flex-1 min-w-0 px-2.5 py-2">
                    <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 flex justify-between items-center">
                      <span className="flex items-center gap-1">
                        {session.school_student_id || "N/A"}
                        {session.financial_status !== "Paid" && (
                          <HandCoins className="h-3 w-3 text-red-500" />
                        )}
                      </span>
                      {!tutorFilter && session.tutor_name && (
                        <span>{session.tutor_name.split(' ')[1] || session.tutor_name.split(' ')[0]}</span>
                      )}
                    </p>
                    <p className={cn(
                      "text-sm font-semibold flex items-center gap-1 overflow-hidden",
                      session.financial_status !== "Paid"
                        ? "text-red-600 dark:text-red-400"
                        : "text-gray-900 dark:text-gray-100",
                      statusConfig.strikethrough && "line-through text-gray-400 dark:text-gray-500"
                    )}>
                      <span className="truncate">{session.student_name || "Unknown"}</span>
                      {session.grade && (
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded text-gray-800 whitespace-nowrap"
                          style={{ backgroundColor: getGradeColor(session.grade, session.lang_stream) }}
                        >{session.grade}{session.lang_stream || ''}</span>
                      )}
                      {session.school && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 whitespace-nowrap">{session.school}</span>
                      )}
                    </p>
                  </div>
                  <div className={cn("w-6 rounded-r flex items-center justify-center", statusConfig.bgClass)}>
                    <StatusIcon className={cn("h-3.5 w-3.5 text-white", statusConfig.iconClass)} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </FloatingPortal>

      {sessionToShow && (
        <SessionDetailPopover
          session={sessionToShow}
          isOpen={true}
          onClose={() => setSessionToShow(null)}
          clickPosition={clickPosition}
          tutorFilter={tutorFilter}
        />
      )}
    </>
  );
}
