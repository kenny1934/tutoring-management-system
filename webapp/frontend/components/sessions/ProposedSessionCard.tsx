"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { proposedSessionStyles } from "@/lib/session-status";
import { getGradeColor } from "@/lib/constants";
import type { ProposedSession } from "@/lib/proposal-utils";
import { CalendarClock, User } from "lucide-react";

interface ProposedSessionCardProps {
  proposedSession: ProposedSession;
  onClick: () => void;
  size?: "compact" | "normal";
  showTutor?: boolean;
  widthPercent?: number;
  isMobile?: boolean;
  style?: React.CSSProperties;
}

/**
 * Renders a proposed session slot as a "ghost" card with visual distinction
 * from regular sessions. Used in session views to show pending proposal slots.
 */
export function ProposedSessionCard({
  proposedSession,
  onClick,
  size = "normal",
  showTutor = true,
  widthPercent = 100,
  isMobile = false,
  style,
}: ProposedSessionCardProps) {
  const isCompact = size === "compact";

  return (
    <motion.div
      whileHover={{
        scale: 1.02,
        y: -1,
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        zIndex: 50,
      }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "cursor-pointer rounded overflow-hidden",
        "shadow-sm transition-all",
        "flex-shrink-0 flex",
        proposedSessionStyles.border,
        proposedSessionStyles.background,
        proposedSessionStyles.opacity
      )}
      style={{
        minHeight: isCompact ? "22px" : "32px",
        backgroundImage:
          "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(156, 163, 175, 0.05) 10px, rgba(156, 163, 175, 0.05) 20px)",
        ...style,
      }}
    >
      <div className="flex-1 flex flex-col min-w-0 px-1.5 py-0.5">
        {/* Header row: student ID + tutor name */}
        <p className="font-bold text-[9px] text-gray-500 dark:text-gray-400 leading-tight flex justify-between items-center">
          <span className="flex items-center gap-0.5">
            {proposedSession.school_student_id || "N/A"}
          </span>
          {showTutor && proposedSession.tutor_name && (
            <span className="flex items-center gap-0.5">
              <User className="h-2 w-2" />
              {proposedSession.tutor_name.split(" ")[1] ||
                proposedSession.tutor_name.split(" ")[0]}
            </span>
          )}
        </p>

        {/* Student name + grade badge */}
        <p
          className={cn(
            "font-semibold text-[10px] leading-tight flex items-center gap-0.5 overflow-hidden",
            "text-gray-700 dark:text-gray-300"
          )}
        >
          <span className="truncate">
            {proposedSession.student_name || "Unknown"}
          </span>
          {!isMobile && widthPercent >= 50 && proposedSession.grade && (
            <span
              className="text-[7px] px-1 py-px rounded text-gray-800 whitespace-nowrap"
              style={{
                backgroundColor: getGradeColor(
                  proposedSession.grade,
                  proposedSession.lang_stream
                ),
              }}
            >
              {proposedSession.grade}
              {proposedSession.lang_stream || ""}
            </span>
          )}
          {!isMobile && widthPercent > 50 && proposedSession.school && (
            <span className="text-[7px] px-1 py-px rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 whitespace-nowrap">
              {proposedSession.school}
            </span>
          )}
        </p>

        {/* PROPOSED badge - only in normal size */}
        {!isCompact && (
          <div className="flex items-center gap-1 mt-0.5">
            <span
              className={cn(
                "text-[7px] px-1 py-px rounded font-semibold uppercase",
                proposedSessionStyles.badge
              )}
            >
              Proposed
            </span>
          </div>
        )}
      </div>

      {/* Status strip - amber for proposed */}
      <div
        className={cn(
          "w-4 rounded-r flex items-center justify-center",
          "bg-amber-400 dark:bg-amber-500"
        )}
      >
        <CalendarClock
          className={cn(
            "text-white",
            isCompact ? "h-2.5 w-2.5" : "h-3 w-3"
          )}
        />
      </div>
    </motion.div>
  );
}

/**
 * List view variant of ProposedSessionCard with more details
 */
export function ProposedSessionRow({
  proposedSession,
  onClick,
}: {
  proposedSession: ProposedSession;
  onClick: () => void;
}) {
  const gradeColor = proposedSession.grade
    ? getGradeColor(proposedSession.grade, proposedSession.lang_stream)
    : undefined;

  return (
    <motion.div
      whileHover={{ scale: 1.005 }}
      whileTap={{ scale: 0.995 }}
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-lg p-3",
        "transition-all",
        proposedSessionStyles.border,
        proposedSessionStyles.background,
        proposedSessionStyles.opacity,
        "hover:shadow-md"
      )}
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(156, 163, 175, 0.05) 10px, rgba(156, 163, 175, 0.05) 20px)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Left: Student info */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Time slot */}
          <div className="text-center flex-shrink-0 w-16">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
              {proposedSession.time_slot}
            </p>
          </div>

          {/* Student details */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                {proposedSession.school_student_id || "N/A"}
              </span>
              <span className="font-semibold text-sm text-gray-800 dark:text-gray-200 truncate">
                {proposedSession.student_name}
              </span>
              {gradeColor && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded text-gray-800 font-medium"
                  style={{ backgroundColor: gradeColor }}
                >
                  {proposedSession.grade}
                  {proposedSession.lang_stream || ""}
                </span>
              )}
              {proposedSession.school && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                  {proposedSession.school}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <User className="h-3 w-3 text-gray-400" />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {proposedSession.tutor_name}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                @ {proposedSession.location}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Status badge */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold",
              proposedSessionStyles.badge
            )}
          >
            <CalendarClock className="h-3.5 w-3.5" />
            PROPOSED
          </span>
        </div>
      </div>
    </motion.div>
  );
}
