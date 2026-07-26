import { describe, it, expect } from "vitest";
import {
  buildAssignmentPlan,
  buildPerLessonAssignmentPlan,
  lessonBreakdown,
  mostCommonLessonNumber,
  formatLessonBreakdown,
  describeAssignmentGroups,
  describeAssignmentResult,
  planSpansMultipleLessons,
  planActionableSessionIds,
} from "./summer-courseware-session";
import { groupChapters } from "./summer-courseware-defaults";
import type { Session, SummerCoursewareFile } from "@/types";

let nextId = 1;
function file(partial: Partial<SummerCoursewareFile>): SummerCoursewareFile {
  return {
    id: nextId++,
    grade: "F1",
    course_code: "701",
    lesson_number: 1,
    topic_zh: "有理數",
    topic_en: "Directed Numbers",
    doc_type: "CW",
    lang: "e",
    is_parallel: false,
    is_answer: false,
    is_classified: true,
    unclassified_reason: null,
    rel_path: `F1\\SM701\\file-${nextId}.pdf`,
    file_name: `file-${nextId}.pdf`,
    file_mtime: null,
    ...partial,
  };
}

function session(partial: Partial<Session>): Session {
  return {
    id: nextId++,
    student_id: 1,
    session_date: "2026-07-15",
    grade: "F1",
    lang_stream: "E",
    lesson_number: 1,
    exercises: [],
    ...partial,
  } as Session;
}

// CW e/c with answers; Chinese-only Extra (real SM701 shape).
const cwE = file({ doc_type: "CW", lang: "e", rel_path: "F1\\SM701\\cw_e.pdf" });
const cwEAns = file({ doc_type: "CW", lang: "e", is_answer: true, rel_path: "F1\\SM701\\cw_e_ans.pdf" });
const cwC = file({ doc_type: "CW", lang: "c", rel_path: "F1\\SM701\\cw_c.pdf" });
const extraC = file({ doc_type: "Extra", lang: "c", rel_path: "F1\\SM701\\extra_c.pdf" });
const chapter = groupChapters([cwE, cwEAns, cwC, extraC]).get("F1")![0];
// A second lesson's chapter, for mixed-lesson slots.
const cwE2 = file({ doc_type: "CW", lang: "e", course_code: "702", lesson_number: 2, topic_zh: "指數", rel_path: "F1\\SM702\\cw_e.pdf" });
const cwC2 = file({ doc_type: "CW", lang: "c", course_code: "702", lesson_number: 2, topic_zh: "指數", rel_path: "F1\\SM702\\cw_c.pdf" });
const chapters = groupChapters([cwE, cwEAns, cwC, extraC, cwE2, cwC2]).get("F1")!;
const PREFIX = "[Courseware Developer 中學]\\Secondary\\Summer Course\\2026 Summer\\Finalised";

describe("buildAssignmentPlan", () => {
  it("gives each student their own language version with answers linked", () => {
    const e = session({ lang_stream: "E" });
    const c = session({ lang_stream: "C" });
    const plan = buildAssignmentPlan([e, c], "CW", chapter, PREFIX);

    expect(plan.items).toHaveLength(2);
    const eItem = plan.items.find((i) => i.session === e)!;
    const cItem = plan.items.find((i) => i.session === c)!;
    expect(eItem.file).toBe(cwE);
    expect(eItem.answer).toBe(cwEAns);
    expect(eItem.fullPath).toBe(`${PREFIX}\\${cwE.rel_path}`);
    expect(cItem.file).toBe(cwC);
    expect(cItem.answer).toBeUndefined();
  });

  it("skips students with no language stream", () => {
    const s = session({ lang_stream: undefined });
    const plan = buildAssignmentPlan([s], "CW", chapter, PREFIX);
    expect(plan.items).toHaveLength(0);
    expect(plan.noLang).toEqual([s]);
  });

  it("skips students whose language has no matching file", () => {
    // Extra exists only in Chinese.
    const e = session({ lang_stream: "E" });
    const c = session({ lang_stream: "C" });
    const plan = buildAssignmentPlan([e, c], "Extra", chapter, PREFIX);
    expect(plan.items.map((i) => i.session)).toEqual([c]);
    expect(plan.noFile).toEqual([e]);
  });

  it("skips students who already have the file assigned", () => {
    const s = session({
      lang_stream: "E",
      exercises: [{ id: 1, session_id: 1, exercise_type: "CW", pdf_name: `${PREFIX}\\${cwE.rel_path}` }],
    } as Partial<Session>);
    const plan = buildAssignmentPlan([s], "CW", chapter, PREFIX);
    expect(plan.items).toHaveLength(0);
    expect(plan.already).toEqual([s]);
  });
});

describe("buildPerLessonAssignmentPlan", () => {
  it("gives each student their own lesson's file in their language", () => {
    const l1 = session({ lang_stream: "E", lesson_number: 1 });
    const l2 = session({ lang_stream: "C", lesson_number: 2 });
    const plan = buildPerLessonAssignmentPlan([l1, l2], "CW", chapters, PREFIX);

    expect(plan.items).toHaveLength(2);
    const l1Item = plan.items.find((i) => i.session === l1)!;
    const l2Item = plan.items.find((i) => i.session === l2)!;
    expect(l1Item.file).toBe(cwE);
    expect(l1Item.answer).toBe(cwEAns);
    expect(l2Item.file).toBe(cwC2);
    expect(l1Item.chapter.code).toBe("701");
    expect(l2Item.chapter.code).toBe("702");
  });

  it("skips students with no lesson number", () => {
    const s = session({ lesson_number: null });
    const plan = buildPerLessonAssignmentPlan([s], "CW", chapters, PREFIX);
    expect(plan.items).toHaveLength(0);
    expect(plan.noLesson).toEqual([s]);
  });

  it("skips students whose lesson has no chapter in the index", () => {
    const s = session({ lesson_number: 9 });
    const plan = buildPerLessonAssignmentPlan([s], "CW", chapters, PREFIX);
    expect(plan.items).toHaveLength(0);
    expect(plan.noChapter).toEqual([s]);
  });

  it("still applies language and already-assigned skips per student", () => {
    const noLang = session({ lang_stream: undefined, lesson_number: 2 });
    const already = session({
      lang_stream: "E",
      lesson_number: 1,
      exercises: [{ id: 1, session_id: 1, exercise_type: "CW", pdf_name: `${PREFIX}\\${cwE.rel_path}` }],
    } as Partial<Session>);
    const plan = buildPerLessonAssignmentPlan([noLang, already], "CW", chapters, PREFIX);
    expect(plan.items).toHaveLength(0);
    expect(plan.noLang).toEqual([noLang]);
    expect(plan.already).toEqual([already]);
  });
});

describe("lesson breakdown helpers", () => {
  const sessions = [
    session({ lesson_number: 2 }),
    session({ lesson_number: 6 }),
    session({ lesson_number: 2 }),
    session({ lesson_number: null }),
  ];

  it("counts distinct lesson numbers, lowest first, ignoring unset", () => {
    expect(lessonBreakdown(sessions)).toEqual([
      { lesson: 2, count: 2 },
      { lesson: 6, count: 1 },
    ]);
  });

  it("picks the most common lesson as the slot default", () => {
    expect(mostCommonLessonNumber(lessonBreakdown(sessions))).toBe(2);
    expect(mostCommonLessonNumber([])).toBeNull();
  });

  it("formats the breakdown for display", () => {
    expect(formatLessonBreakdown(lessonBreakdown(sessions))).toBe("L2 ×2 · L6 ×1");
  });
});

describe("describeAssignmentGroups", () => {
  it("lists one line per chapter plus named lesson skips", () => {
    const l1a = session({ lang_stream: "E", lesson_number: 1 });
    const l1b = session({ lang_stream: "C", lesson_number: 1 });
    const l2 = session({ lang_stream: "E", lesson_number: 2 });
    const missing = session({ lesson_number: 9, student_name: "Alice Chan" } as Partial<Session>);
    const plan = buildPerLessonAssignmentPlan([l1a, l1b, l2, missing], "CW", chapters, PREFIX);

    expect(describeAssignmentGroups(plan)).toEqual([
      "L1 · SM701 有理數: 2 students",
      "L2 · SM702 指數: 1 student",
      "No materials for L9: Alice Chan",
    ]);
  });
});

describe("planSpansMultipleLessons", () => {
  it("is true when items cover more than one lesson, or lesson skips exist alongside items", () => {
    const l1 = session({ lang_stream: "E", lesson_number: 1 });
    const l2 = session({ lang_stream: "C", lesson_number: 2 });
    const missing = session({ lesson_number: 9 });
    const plan = (ss: Session[]) => buildPerLessonAssignmentPlan(ss, "CW", chapters, PREFIX);

    expect(planSpansMultipleLessons(plan([l1, l2]))).toBe(true);
    expect(planSpansMultipleLessons(plan([l1, missing]))).toBe(true);
    expect(planSpansMultipleLessons(plan([l1]))).toBe(false);
  });
});

describe("planActionableSessionIds", () => {
  it("keeps every session except those who already have the file", () => {
    const ok = session({ lang_stream: "E", lesson_number: 1 });
    const already = session({
      lang_stream: "E",
      lesson_number: 1,
      exercises: [{ id: 1, session_id: 1, exercise_type: "CW", pdf_name: `${PREFIX}\\${cwE.rel_path}` }],
    } as Partial<Session>);
    const missing = session({ lesson_number: 9 });
    const plan = buildPerLessonAssignmentPlan([ok, already, missing], "CW", chapters, PREFIX);

    expect(planActionableSessionIds(plan).sort()).toEqual([ok.id, missing.id].sort());
  });
});

describe("describeAssignmentResult", () => {
  it("summarises saves and every skip reason", () => {
    const e = session({ lang_stream: "E" });
    const noLang = session({ lang_stream: undefined });
    const plan = buildAssignmentPlan([e, noLang], "CW", chapter, PREFIX);
    const text = describeAssignmentResult(plan, { saved: 1, failed: 0 }, "CW");
    expect(text).toContain("classwork for 1 student");
    expect(text).toContain("1 missing language stream");
    expect(text).not.toContain("failed");
  });

  it("summarises lesson-related skips from per-lesson plans", () => {
    const noLesson = session({ lesson_number: null });
    const noChapter = session({ lesson_number: 9 });
    const plan = buildPerLessonAssignmentPlan([noLesson, noChapter], "CW", chapters, PREFIX);
    const text = describeAssignmentResult(plan, { saved: 0, failed: 0 }, "CW");
    expect(text).toContain("1 no lesson number");
    expect(text).toContain("1 no materials for their lesson");
  });
});
