import { describe, it, expect } from "vitest";
import { unlistedLessonEntries, hasSomethingToShow } from "./unlisted-lesson-entries";
import { isPreviewExercise } from "./summer-courseware-session";
import type { UnlistedLesson, UnlistedLessonExercise } from "@/types";

const exercise = (over: Partial<UnlistedLessonExercise>): UnlistedLessonExercise => ({
  exercise_type: "CW", pdf_name: null, url: null, url_title: null, page_start: null, page_end: null, remarks: null,
  answer_pdf_name: null, answer_page_start: null, answer_page_end: null, answer_remarks: null, ...over,
});

const lesson = (exercises: UnlistedLessonExercise[]) => ({
  id: 3, student_id: 10, student_name: "Lee Ka Yan", school_student_id: "1300", grade: "F2", lang_stream: "E",
  school: "SRL-E", tutor_id: 5, tutor_name: "Tutor B", lesson_date: "2026-10-08", time_slot: "16:45 - 18:15",
  location: "MSA", created_by: "tutor@example.com", exercises,
}) as unknown as UnlistedLesson;

describe("worksheets of a student not in CSM yet", () => {
  const record = lesson([
    exercise({ exercise_type: "HW", pdf_name: "Homework.pdf" }),
    exercise({ pdf_name: "Classwork.pdf", page_start: 2, page_end: 3 }),
    exercise({ remarks: "Talked through the test" }),
  ]);

  it("puts classwork first and leaves out anything without a file or link", () => {
    const entries = unlistedLessonEntries(record);
    expect(entries.map((e) => e.exercise.pdf_name)).toEqual(["Classwork.pdf", "Homework.pdf"]);
    expect(entries[0].exercise.page_start).toBe(2);
    expect(entries[0].studentName).toBe("Lee Ka Yan");
  });

  it("has no lesson to keep ink with, and isn't taken for a class-wide preview", () => {
    const ids = unlistedLessonEntries(record).map((e) => e.exercise.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of unlistedLessonEntries(record)) {
      expect(entry.session.id).toBe(0);
      expect(entry.exercise.session_id).toBe(0);
      expect(isPreviewExercise(entry.exercise)).toBe(false);
    }
  });

  it("says whether there's anything to show", () => {
    expect(hasSomethingToShow(record)).toBe(true);
    expect(hasSomethingToShow(lesson([exercise({ remarks: "No sheet" })]))).toBe(false);
  });
});
