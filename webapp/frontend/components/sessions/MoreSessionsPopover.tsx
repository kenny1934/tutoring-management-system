"use client";

import { useState, useRef, useLayoutEffect } from "react";
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
import { X } from "lucide-react";
import { SessionDetailPopover } from "@/components/sessions/SessionDetailPopover";
import { cn } from "@/lib/utils";
import { getSessionStatusConfig } from "@/lib/session-status";
import type { Session } from "@/types";

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
  const sessionItemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

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

  const dismiss = useDismiss(context);
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

          <div className="space-y-1">
            {sessions.map((session) => {
              const statusConfig = getSessionStatusConfig(session.session_status);
              const StatusIcon = statusConfig.Icon;
              return (
                <div
                  key={session.id}
                  ref={(el) => {
                    if (el) sessionItemRefs.current.set(session.id, el);
                  }}
                  onClick={() => setSessionToShow(session)}
                  className={cn(
                    "cursor-pointer rounded-l overflow-hidden flex",
                    "bg-white dark:bg-gray-800",
                    "hover:shadow-md transition-shadow"
                  )}
                >
                  <div className="flex-1 min-w-0 px-2 py-1.5">
                    <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 flex justify-between">
                      <span>{session.school_student_id || "N/A"}</span>
                      {!tutorFilter && session.tutor_name && (
                        <span>{session.tutor_name.split(' ')[1] || session.tutor_name.split(' ')[0]}</span>
                      )}
                    </p>
                    <p className={cn(
                      "text-xs font-semibold text-gray-900 dark:text-gray-100",
                      statusConfig.strikethrough && "line-through text-gray-400 dark:text-gray-500"
                    )}>
                      {session.student_name || "Unknown"}
                    </p>
                  </div>
                  <div className={cn("w-5 rounded-r flex items-center justify-center", statusConfig.bgClass)}>
                    <StatusIcon className="h-3 w-3 text-white" />
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
          triggerRef={{ current: sessionItemRefs.current.get(sessionToShow.id) || null }}
          tutorFilter={tutorFilter}
        />
      )}
    </>
  );
}
