"use client";

/**
 * Shown on a lesson's page when a tutor recorded this student on this day
 * before the lesson was in CSM, and the record is still waiting. Usually the
 * record fills the lesson in by itself as soon as the lesson arrives. It waits
 * here only when that couldn't decide, for example because the student has
 * two lessons that day, so a person picks this one with one click.
 */
import { useState } from "react";
import { ArrowDownToLine, UserPlus } from "lucide-react";
import { Button } from "@/components/controls";
import { unlistedLessonsAPI } from "@/lib/api";
import { revalidateUnlistedLessons } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import type { Session, UnlistedLesson } from "@/types";

const FILLABLE = ["Scheduled", "Make-up Class", "Trial Class", "Attended", "Attended (Make-up)"];

function describe(lesson: UnlistedLesson): string {
  const classwork = lesson.exercises.filter((ex) => ex.exercise_type === "CW").length;
  const homework = lesson.exercises.filter((ex) => ex.exercise_type === "HW").length;
  const parts = [
    classwork > 0 ? `${classwork} classwork` : null,
    homework > 0 ? `${homework} homework` : null,
    lesson.notes ? "notes" : null,
    lesson.performance_rating ? "a rating" : null,
  ].filter(Boolean) as string[];
  const what = parts.length > 1
    ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
    : parts[0];
  const slot = lesson.time_slot ? ` at ${lesson.time_slot}` : "";
  return what
    ? `${lesson.tutor_name} recorded this student${slot} before the lesson was in CSM, with ${what}.`
    : `${lesson.tutor_name} recorded this student${slot} before the lesson was in CSM.`;
}

export function UnlistedLessonBanner({
  session,
  lessons,
  readOnly,
  onFilled,
}: {
  session: Session;
  lessons: UnlistedLesson[];
  readOnly?: boolean;
  onFilled: () => void;
}) {
  const { showToast } = useToast();
  const [fillingId, setFillingId] = useState<number | null>(null);
  const canFill = !readOnly && FILLABLE.includes(session.session_status);

  const fill = async (lesson: UnlistedLesson) => {
    setFillingId(lesson.id);
    try {
      await unlistedLessonsAPI.fillInto(lesson.id, session.id);
      showToast("This lesson has been filled in and marked attended.", "success");
      onFilled();
      revalidateUnlistedLessons();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "The lesson couldn't be filled in.", "error");
    } finally {
      setFillingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {lessons.map((lesson) => (
        <div key={lesson.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-line-strong bg-paper px-4 py-2.5">
          <UserPlus className="h-4 w-4 flex-shrink-0 text-ink-subtle" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm text-ink">{describe(lesson)}</p>
          {canFill && (
            <Button
              size="sm"
              variant="primary"
              icon={ArrowDownToLine}
              loading={fillingId === lesson.id}
              disabled={fillingId !== null}
              onClick={() => fill(lesson)}
            >
              Fill in this lesson
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
