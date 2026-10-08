/**
 * A lesson taught but not in CSM yet has classwork and homework the tutor may
 * want on the board. Wide lesson mode shows them as entries of their own,
 * built here. They have no real lesson behind them, so their lesson id is 0
 * and nothing can save ink to them: lesson mode shows them without the Pen
 * Tray. Their exercise ids are made up, starting at a billion so they can't
 * meet a real exercise's id, and they stay positive because a negative id
 * means a class-wide preview.
 */
import type { Session, SessionExercise, UnlistedLesson } from "@/types";
import type { StudentExerciseEntry } from "@/components/lesson/LessonWideMode";

const RECORD_EXERCISE_BASE = 1_000_000_000;

/** Each of a record's exercises as an entry lesson mode can open, classwork first. */
export function unlistedLessonEntries(lesson: UnlistedLesson): StudentExerciseEntry[] {
  const standIn = {
    id: 0,
    student_id: lesson.student_id,
    student_name: lesson.student_name,
    school_student_id: lesson.school_student_id ?? undefined,
    school: lesson.school ?? undefined,
    grade: lesson.grade ?? undefined,
    lang_stream: lesson.lang_stream ?? undefined,
    location: lesson.location ?? undefined,
    session_date: lesson.lesson_date,
    time_slot: lesson.time_slot ?? undefined,
    tutor_id: lesson.tutor_id,
    tutor_name: lesson.tutor_name,
    session_status: "Scheduled",
    exercises: [],
  } as unknown as Session;

  const ordered = [
    ...lesson.exercises.filter((ex) => ex.exercise_type === "CW"),
    ...lesson.exercises.filter((ex) => ex.exercise_type !== "CW"),
  ];
  return ordered
    .filter((ex) => ex.pdf_name || ex.url)
    .map((ex, index): StudentExerciseEntry => {
      const exercise: SessionExercise = {
        id: RECORD_EXERCISE_BASE + lesson.id * 100 + index,
        session_id: 0,
        exercise_type: ex.exercise_type,
        pdf_name: ex.pdf_name ?? undefined,
        page_start: ex.page_start ?? undefined,
        page_end: ex.page_end ?? undefined,
        remarks: ex.remarks ?? undefined,
        url: ex.url ?? undefined,
        url_title: ex.url_title ?? undefined,
        answer_pdf_name: ex.answer_pdf_name ?? undefined,
        answer_page_start: ex.answer_page_start ?? undefined,
        answer_page_end: ex.answer_page_end ?? undefined,
        answer_remarks: ex.answer_remarks ?? undefined,
        created_by: lesson.created_by ?? "",
      };
      return {
        session: standIn,
        exercise,
        studentName: lesson.student_name,
        studentId: lesson.school_student_id,
        grade: lesson.grade,
        langStream: lesson.lang_stream,
      };
    });
}

/** Whether a record has anything lesson mode can show. */
export function hasSomethingToShow(lesson: UnlistedLesson): boolean {
  return lesson.exercises.some((ex) => ex.pdf_name || ex.url);
}
