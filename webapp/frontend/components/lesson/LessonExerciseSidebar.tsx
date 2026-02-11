"use client";

import { useState, useMemo } from "react";
import {
  PenTool, BookOpen, ChevronDown, ChevronRight, Plus, Pencil, FileX, Calendar,
  Check, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getDisplayName, parseExerciseRemarks } from "@/lib/exercise-utils";
import { formatShortDate } from "@/lib/formatters";
import type { Session, SessionExercise, HomeworkCompletion } from "@/types";
import { motion, AnimatePresence } from "framer-motion";

interface LessonExerciseSidebarProps {
  currentSession: Session | null;
  previousSession: Session | null;
  selectedExerciseId: number | null;
  onExerciseSelect: (exercise: SessionExercise) => void;
  onEditExercises: (session: Session, type: "CW" | "HW") => void;
  isReadOnly?: boolean;
  /** Check if an exercise has annotation strokes. */
  hasAnnotations?: (exerciseId: number) => boolean;
  /** Homework completion data for previous session's HW exercises. */
  homeworkCompletion?: HomeworkCompletion[];
}

function getPageLabel(exercise: SessionExercise): string | null {
  const { complexPages } = parseExerciseRemarks(exercise.remarks);
  if (complexPages) return `p${complexPages}`;
  if (exercise.page_start && exercise.page_end && exercise.page_start !== exercise.page_end) {
    return `p${exercise.page_start}-${exercise.page_end}`;
  }
  if (exercise.page_start) return `p${exercise.page_start}`;
  return null;
}

function ExerciseItem({
  exercise,
  isSelected,
  onClick,
  hasAnnotations,
  completionStatus,
}: {
  exercise: SessionExercise;
  isSelected: boolean;
  onClick: () => void;
  hasAnnotations?: boolean;
  completionStatus?: "submitted" | "not_submitted";
}) {
  const displayName = getDisplayName(exercise.pdf_name);
  const pageLabel = getPageLabel(exercise);

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-2.5 py-2 rounded-md transition-all text-sm group",
        "border border-transparent",
        isSelected
          ? "bg-[#f5e6d0] dark:bg-[#3d3020] border-[#d4a574] dark:border-[#8b6f47] shadow-sm"
          : "hover:bg-[#faf3e8] dark:hover:bg-[#2a2318] hover:border-[#e8d4b8]/50 dark:hover:border-[#5a4d3a]/50"
      )}
    >
      <div className="flex items-start gap-1.5 min-w-0">
        <div className="flex-1 min-w-0">
          {/* File name */}
          <div className={cn(
            "truncate font-medium",
            isSelected
              ? "text-[#6b4c30] dark:text-[#d4a574]"
              : "text-gray-700 dark:text-gray-300"
          )}>
            {exercise.pdf_name ? displayName : "(no file)"}
          </div>

          {/* Page range */}
          {pageLabel && (
            <span className="text-[10px] text-[#a0906e] dark:text-[#8a7a60]">
              {pageLabel}
            </span>
          )}
        </div>

        {/* Status indicators */}
        <div className="flex items-center gap-1 flex-shrink-0 mt-1">
          {completionStatus === "submitted" && (
            <span title="Submitted"><Check className="h-3 w-3 text-green-500" /></span>
          )}
          {completionStatus === "not_submitted" && (
            <span title="Not submitted"><X className="h-3 w-3 text-red-400" /></span>
          )}
          {hasAnnotations && (
            <span className="w-2 h-2 rounded-full bg-[#a0704b]" title="Has annotations" />
          )}
        </div>
      </div>
    </button>
  );
}

function ExerciseSection({
  label,
  icon: Icon,
  iconColor,
  exercises,
  selectedExerciseId,
  onExerciseSelect,
  onEdit,
  isReadOnly,
  session,
  hasAnnotations,
  homeworkCompletion,
}: {
  label: string;
  icon: typeof PenTool;
  iconColor: string;
  exercises: SessionExercise[];
  selectedExerciseId: number | null;
  onExerciseSelect: (exercise: SessionExercise) => void;
  onEdit: () => void;
  isReadOnly?: boolean;
  session: Session;
  hasAnnotations?: (exerciseId: number) => boolean;
  homeworkCompletion?: HomeworkCompletion[];
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <Icon className={cn("h-3.5 w-3.5", iconColor)} />
          <span className="text-xs font-semibold text-[#8b7355] dark:text-[#a09080] uppercase tracking-wider">
            {label}
          </span>
          <span className="text-[10px] text-[#b0a090] dark:text-[#706050]">
            ({exercises.length})
          </span>
        </div>
        {!isReadOnly && (
          <button
            onClick={onEdit}
            className="p-1 rounded hover:bg-[#e8d4b8]/50 dark:hover:bg-[#3a3228] transition-colors"
            title={`Edit ${label}`}
          >
            <Pencil className="h-3 w-3 text-[#a0906e] dark:text-[#8a7a60]" />
          </button>
        )}
      </div>

      {exercises.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          {exercises.map((ex) => {
            const hwc = homeworkCompletion?.find(c => c.session_exercise_id === ex.id);
            return (
              <ExerciseItem
                key={ex.id}
                exercise={ex}
                isSelected={ex.id === selectedExerciseId}
                onClick={() => onExerciseSelect(ex)}
                hasAnnotations={hasAnnotations?.(ex.id)}
                completionStatus={hwc ? (hwc.submitted ? "submitted" : "not_submitted") : undefined}
              />
            );
          })}
        </div>
      ) : (
        <div className="py-3 text-center">
          <span className="text-xs text-[#b0a090] dark:text-[#706050] italic">
            No {label.toLowerCase()} yet
          </span>
          {!isReadOnly && (
            <button
              onClick={onEdit}
              className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-[#a0704b] hover:text-[#8b6040] transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SessionBlock({
  session,
  label,
  selectedExerciseId,
  onExerciseSelect,
  onEditExercises,
  isReadOnly,
  defaultExpanded,
  hasAnnotations,
  homeworkCompletion,
}: {
  session: Session;
  label: string;
  selectedExerciseId: number | null;
  onExerciseSelect: (exercise: SessionExercise) => void;
  onEditExercises: (session: Session, type: "CW" | "HW") => void;
  isReadOnly?: boolean;
  defaultExpanded: boolean;
  hasAnnotations?: (exerciseId: number) => boolean;
  homeworkCompletion?: HomeworkCompletion[];
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const exercises = session.exercises || [];
  const cwExercises = useMemo(
    () => exercises.filter(e => e.exercise_type === "CW" || e.exercise_type === "Classwork"),
    [exercises]
  );
  const hwExercises = useMemo(
    () => exercises.filter(e => e.exercise_type === "HW" || e.exercise_type === "Homework"),
    [exercises]
  );

  const totalCount = exercises.length;
  const sessionDate = formatShortDate(session.session_date);

  return (
    <div>
      {/* Session header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className={cn(
          "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors",
          "hover:bg-[#f0e6d4]/60 dark:hover:bg-[#252018]/60"
        )}
      >
        <div className={cn(
          "transition-transform",
          expanded ? "rotate-0" : "-rotate-90"
        )}>
          <ChevronDown className="h-3.5 w-3.5 text-[#a0906e] dark:text-[#8a7a60]" />
        </div>
        <Calendar className="h-3.5 w-3.5 text-[#a0906e] dark:text-[#8a7a60]" />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold text-[#6b5a42] dark:text-[#c4a882]">
            {label}
          </span>
          <span className="ml-1.5 text-[10px] text-[#a0906e] dark:text-[#8a7a60]">
            {sessionDate} · {session.time_slot}
          </span>
        </div>
        <span className="text-[10px] text-[#b0a090] dark:text-[#706050] tabular-nums">
          {totalCount}
        </span>
      </button>

      {/* Exercises */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pl-3 pr-1 pt-1 pb-2 flex flex-col gap-3 border-l-2 border-[#e8d4b8] dark:border-[#3a3228] ml-4">
              <ExerciseSection
                label="Classwork"
                icon={PenTool}
                iconColor="text-rose-500 dark:text-rose-400"
                exercises={cwExercises}
                selectedExerciseId={selectedExerciseId}
                onExerciseSelect={onExerciseSelect}
                onEdit={() => onEditExercises(session, "CW")}
                isReadOnly={isReadOnly}
                session={session}
                hasAnnotations={hasAnnotations}
              />
              <ExerciseSection
                label="Homework"
                icon={BookOpen}
                iconColor="text-blue-500 dark:text-blue-400"
                exercises={hwExercises}
                selectedExerciseId={selectedExerciseId}
                onExerciseSelect={onExerciseSelect}
                onEdit={() => onEditExercises(session, "HW")}
                isReadOnly={isReadOnly}
                session={session}
                hasAnnotations={hasAnnotations}
                homeworkCompletion={homeworkCompletion}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function LessonExerciseSidebar({
  currentSession,
  previousSession,
  selectedExerciseId,
  onExerciseSelect,
  onEditExercises,
  isReadOnly,
  hasAnnotations,
  homeworkCompletion,
}: LessonExerciseSidebarProps) {
  const hasAnySessions = currentSession || previousSession;

  if (!hasAnySessions) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center">
        <FileX className="h-8 w-8 text-[#c4a882]" />
        <p className="text-sm text-[#8b7355] dark:text-[#a09080]">
          No sessions found
        </p>
        <p className="text-xs text-[#b0a090] dark:text-[#706050]">
          Create an enrollment and schedule sessions first.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 py-2 px-1 overflow-y-auto">
      {currentSession && (
        <SessionBlock
          key={currentSession.id}
          session={currentSession}
          label="This Session"
          selectedExerciseId={selectedExerciseId}
          onExerciseSelect={onExerciseSelect}
          onEditExercises={onEditExercises}
          isReadOnly={isReadOnly}
          defaultExpanded
          hasAnnotations={hasAnnotations}
        />
      )}

      {previousSession && (
        <>
          <div className="mx-2 my-1 border-t border-dashed border-[#d4c4a8] dark:border-[#3a3228]" />
          <SessionBlock
            key={previousSession.id}
            session={previousSession}
            label="Previous Session"
            selectedExerciseId={selectedExerciseId}
            onExerciseSelect={onExerciseSelect}
            onEditExercises={onEditExercises}
            isReadOnly={isReadOnly}
            defaultExpanded={false}
            hasAnnotations={hasAnnotations}
            homeworkCompletion={homeworkCompletion}
          />
        </>
      )}
    </div>
  );
}
