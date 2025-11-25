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
import type { Session } from "@/types";

interface MoreSessionsPopoverProps {
  sessions: Session[];
  triggerRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}

export function MoreSessionsPopover({
  sessions,
  triggerRef,
  onClose,
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
            {sessions.map((session) => (
              <div
                key={session.id}
                ref={(el) => {
                  if (el) sessionItemRefs.current.set(session.id, el);
                }}
                onClick={() => setSessionToShow(session)}
                className={cn(
                  "cursor-pointer rounded px-2 py-1.5",
                  "bg-white dark:bg-gray-800",
                  "border-l-3",
                  session.session_status === "Confirmed" && "border-green-500",
                  session.session_status === "Pending" && "border-yellow-500",
                  session.session_status === "Cancelled" && "border-red-500",
                  session.session_status === "Completed" && "border-blue-500",
                  !session.session_status && "border-[#d4a574]",
                  "hover:shadow-md transition-shadow"
                )}
              >
                <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                  {session.school_student_id || "N/A"}
                </p>
                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                  {session.student_name || "Unknown"}
                </p>
              </div>
            ))}
          </div>
        </div>
      </FloatingPortal>

      {sessionToShow && (
        <SessionDetailPopover
          session={sessionToShow}
          isOpen={true}
          onClose={() => setSessionToShow(null)}
          triggerRef={{ current: sessionItemRefs.current.get(sessionToShow.id) || null }}
        />
      )}
    </>
  );
}
