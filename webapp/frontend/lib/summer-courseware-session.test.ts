import { describe, it, expect } from "vitest";
import { buildAssignmentPlan, describeAssignmentResult } from "./summer-courseware-session";
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
});
