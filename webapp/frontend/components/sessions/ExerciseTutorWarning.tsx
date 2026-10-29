"use client";

import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { hasExerciseTutorMismatch } from "@/lib/lesson-exercise-access";
import type { Session } from "@/types";

type ExerciseTutorSession = Pick<Session, "tutor_id" | "tutor_name">;

export function useExerciseTutorWarningMessage(sessions: ExerciseTutorSession[]): string | null {
  const { user, effectiveRole, impersonatedTutor } = useAuth();
  const viewerId = impersonatedTutor?.id ?? user?.id;
  const mismatches = sessions.filter(session => hasExerciseTutorMismatch({
    lessonTutorId: session.tutor_id,
    viewerId,
    effectiveRole,
  }));
  if (mismatches.length === 0) return null;

  return sessions.length === 1
    ? `This session is assigned to ${sessions[0].tutor_name || "another tutor"}. Please coordinate with the assigned tutor when changing its exercises.`
    : `${mismatches.length} of the selected sessions ${mismatches.length === 1 ? "is assigned to another tutor" : "are assigned to other tutors"}. Please coordinate with their assigned tutors when changing exercises.`;
}

export function ExerciseTutorWarning({ sessions }: { sessions: ExerciseTutorSession[] }) {
  const message = useExerciseTutorWarningMessage(sessions);
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}
