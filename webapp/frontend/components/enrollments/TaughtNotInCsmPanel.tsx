"use client";

/**
 * The Renewals tab for students who were taught before their lessons were in
 * CSM. Each student is one card with every lesson a tutor recorded for them,
 * oldest first. An admin creates the enrolment from the card, which fills the
 * lessons in as soon as they exist, or sets a record aside when it shouldn't
 * become a lesson. Supervisors see the same cards without the actions.
 */
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Plus, X } from "lucide-react";
import { Button, IconButton } from "@/components/controls";
import { GradeBadge } from "@/components/ui/grade-label";
import { unlistedLessonsAPI } from "@/lib/api";
import { revalidateUnlistedLessons } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import { formatShortDate } from "@/lib/formatters";
import type { UnlistedLesson } from "@/types";

export interface TaughtStudent {
  studentId: number;
  lessons: UnlistedLesson[];
  /** The student's most recent enrollment, to renew from, if they have one. */
  latestEnrolmentId: number | null;
}

const DISMISS_REASONS = [
  { value: "mistake", label: "Recorded by mistake" },
  { value: "handled_elsewhere", label: "Handled another way" },
] as const;

function exerciseSummary(lesson: UnlistedLesson): string | null {
  const classwork = lesson.exercises.filter((ex) => ex.exercise_type === "CW").length;
  const homework = lesson.exercises.filter((ex) => ex.exercise_type === "HW").length;
  const parts = [classwork > 0 ? `${classwork} CW` : null, homework > 0 ? `${homework} HW` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function TaughtNotInCsmPanel({
  lessons,
  canAct,
  onCreateEnrolment,
}: {
  lessons: UnlistedLesson[];
  canAct: boolean;
  onCreateEnrolment: (student: TaughtStudent) => void;
}) {
  const { showToast } = useToast();
  const [dismissingId, setDismissingId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const studentIds = useMemo(
    () => [...new Set(lessons.map((l) => l.student_id))].sort((a, b) => a - b),
    [lessons],
  );
  const { data: latest } = useSWR(
    studentIds.length > 0 ? ["unlisted-lessons-latest-enrolments", studentIds.join(",")] : null,
    () => unlistedLessonsAPI.getLatestEnrolments(studentIds),
  );

  // One card per student, the student taught longest ago first.
  const students = useMemo(() => {
    const byStudent = new Map<number, UnlistedLesson[]>();
    for (const lesson of lessons) {
      const list = byStudent.get(lesson.student_id) ?? [];
      list.push(lesson);
      byStudent.set(lesson.student_id, list);
    }
    return [...byStudent.entries()]
      .map(([studentId, list]): TaughtStudent => ({
        studentId,
        lessons: [...list].sort((a, b) => a.lesson_date.localeCompare(b.lesson_date) || a.id - b.id),
        latestEnrolmentId: latest?.[String(studentId)] ?? null,
      }))
      .sort((a, b) => a.lessons[0].lesson_date.localeCompare(b.lessons[0].lesson_date));
  }, [lessons, latest]);

  const dismiss = async (lesson: UnlistedLesson, reason: "mistake" | "handled_elsewhere") => {
    setBusyId(lesson.id);
    try {
      await unlistedLessonsAPI.dismiss(lesson.id, reason);
      showToast("The record has been set aside.", "success");
      setDismissingId(null);
      revalidateUnlistedLessons();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "The record couldn't be set aside.", "error");
    } finally {
      setBusyId(null);
    }
  };

  if (students.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-foreground/60">
        Every lesson a tutor has taught is in CSM.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {students.map((student) => {
        const first = student.lessons[0];
        return (
          <div key={student.studentId} className="rounded-lg border border-line bg-paper p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-ink-subtle">{first.school_student_id || "No ID"}</span>
                  <span className="text-sm font-semibold text-ink">{first.student_name}</span>
                  <GradeBadge className="rounded px-1.5 py-0.5 text-[11px] font-medium text-gray-800" grade={first.grade} langStream={first.lang_stream} />
                  {first.school && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">{first.school}</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-ink-subtle">
                  {student.lessons.length === 1
                    ? "Taught once without a lesson in CSM."
                    : `Taught ${student.lessons.length} times without a lesson in CSM.`}
                </p>
              </div>
              {canAct && (
                <Button size="sm" variant="primary" icon={Plus} onClick={() => onCreateEnrolment(student)}>
                  {student.latestEnrolmentId ? "Renew enrollment" : "Create enrollment"}
                </Button>
              )}
            </div>

            <ul className="mt-3 flex flex-col divide-y divide-line border-t border-line">
              {student.lessons.map((lesson) => {
                const exercises = exerciseSummary(lesson);
                return (
                  <li key={lesson.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs">
                    <span className="font-medium tabular-nums text-ink">{formatShortDate(lesson.lesson_date)}</span>
                    {lesson.time_slot && <span className="tabular-nums text-ink-subtle">{lesson.time_slot}</span>}
                    {lesson.location && <span className="text-ink-subtle">{lesson.location}</span>}
                    <span className="text-ink-subtle">{lesson.tutor_name}</span>
                    {exercises && <span className="text-ink-subtle">{exercises}</span>}
                    {canAct && (
                      <span className="ml-auto flex items-center gap-1.5">
                        {dismissingId === lesson.id ? (
                          <>
                            {DISMISS_REASONS.map((reason) => (
                              <Button
                                key={reason.value}
                                size="sm"
                                variant="secondary"
                                disabled={busyId === lesson.id}
                                onClick={() => dismiss(lesson, reason.value)}
                              >
                                {reason.label}
                              </Button>
                            ))}
                            <IconButton size="sm" icon={X} label="Keep it" onClick={() => setDismissingId(null)} />
                          </>
                        ) : (
                          <Button size="sm" variant="quiet" onClick={() => setDismissingId(lesson.id)}>
                            Set aside
                          </Button>
                        )}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
