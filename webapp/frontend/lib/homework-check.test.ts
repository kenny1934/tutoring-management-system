import { describe, it, expect } from "vitest";
import { answerPageNumbers, canOpenInCheckViewer, checkItems, homeworkAsExercise } from "./homework-check";
import type { HomeworkCompletion } from "@/types";

const homework = (fields: Partial<HomeworkCompletion> = {}): HomeworkCompletion => ({
  session_exercise_id: 10,
  current_session_id: 200,
  student_id: 1,
  assigned_session_id: 100,
  pdf_name: "[Center]\\Courseware (Eng)\\Ch5.pdf",
  attachment_count: 0,
  files: [],
  ...fields,
});

describe("answerPageNumbers", () => {
  it("uses the pages chosen for the answer key", () => {
    const hw = homework({
      page_start: 4, page_end: 5,
      answer_pdf_name: "[Center]\\ANS\\Ch5_ANS.pdf", answer_page_start: 2, answer_page_end: 3,
    });
    expect(answerPageNumbers(hw, 10)).toEqual([2, 3]);
  });

  it("reads a custom answer range from the answer's remarks", () => {
    const hw = homework({
      answer_pdf_name: "[Center]\\ANS\\Ch5_ANS.pdf",
      answer_remarks: "Pages: 1,3",
    });
    expect(answerPageNumbers(hw, 10)).toEqual([1, 3]);
  });

  it("follows the worksheet's pages when the answer key has none of its own", () => {
    const hw = homework({ page_start: 4, page_end: 5, answer_pdf_name: "[Center]\\ANS\\Ch5_ANS.pdf" });
    expect(answerPageNumbers(hw, 10)).toEqual([4, 5]);
  });

  it("follows the worksheet's pages for an answer key that was searched for", () => {
    // Pages chosen for an answer key only count when that key was chosen too.
    const hw = homework({ page_start: 4, page_end: 5, answer_page_start: 9 });
    expect(answerPageNumbers(hw, 10)).toEqual([4, 5]);
  });

  it("follows a worksheet's custom range", () => {
    const hw = homework({ assignment_remarks: "Pages: 2,6-7" });
    expect(answerPageNumbers(hw, 10)).toEqual([2, 6, 7]);
  });

  it("drops pages the answer file doesn't have", () => {
    const hw = homework({ page_start: 3, page_end: 5 });
    expect(answerPageNumbers(hw, 4)).toEqual([3, 4]);
  });

  it("shows every page when none of the wanted pages are in the file", () => {
    const hw = homework({ page_start: 7, page_end: 8 });
    expect(answerPageNumbers(hw, 2)).toEqual([]);
  });

  it("shows every page of a whole-file worksheet's answers", () => {
    expect(answerPageNumbers(homework(), 6)).toEqual([]);
  });

  it("keeps the wanted pages while the file's length is unknown", () => {
    expect(answerPageNumbers(homework({ page_start: 7, page_end: 8 }), null)).toEqual([7, 8]);
  });
});

describe("homeworkAsExercise", () => {
  it("carries the worksheet and its answer key across", () => {
    const exercise = homeworkAsExercise(homework({
      page_start: 1, assignment_remarks: "Pages: 1,3",
      answer_pdf_name: "a.pdf", answer_page_start: 2,
    }));
    expect(exercise).toMatchObject({
      id: 10, session_id: 100, exercise_type: "HW",
      pdf_name: "[Center]\\Courseware (Eng)\\Ch5.pdf", page_start: 1, remarks: "Pages: 1,3",
      answer_pdf_name: "a.pdf", answer_page_start: 2,
    });
  });
});

describe("canOpenInCheckViewer", () => {
  it("needs a worksheet file", () => {
    expect(canOpenInCheckViewer(homework())).toBe(true);
    expect(canOpenInCheckViewer(homework({ pdf_name: "  " }))).toBe(false);
    expect(canOpenInCheckViewer(homework({ pdf_name: undefined, url: "https://x" }))).toBe(false);
  });
});

describe("checkItems", () => {
  it("marks every item against the one lesson", () => {
    const items = checkItems([homework(), homework({ session_exercise_id: 11 })], 200, "Amy");
    expect(items.map((item) => [item.homework.session_exercise_id, item.sessionId, item.studentName]))
      .toEqual([[10, 200, "Amy"], [11, 200, "Amy"]]);
  });
});
