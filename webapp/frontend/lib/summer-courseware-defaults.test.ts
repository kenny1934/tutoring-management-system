import { describe, it, expect } from "vitest";
import {
  normalizeLangStream,
  groupChapters,
  pickDefaults,
  buildFullPath,
} from "./summer-courseware-defaults";
import type { SummerCoursewareFile } from "@/types";

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
    rel_path: "F1\\SM701 有理數 Directed Numbers\\file.pdf",
    file_name: "file.pdf",
    file_mtime: null,
    ...partial,
  };
}

// A realistic SM701 chapter: CW/HW × e/c with answers, Chinese-only Extra,
// parallel CW/HW.
const sm701 = [
  file({ doc_type: "CW", lang: "e" }),
  file({ doc_type: "CW", lang: "e", is_answer: true }),
  file({ doc_type: "CW", lang: "c" }),
  file({ doc_type: "CW", lang: "c", is_answer: true }),
  file({ doc_type: "HW", lang: "e" }),
  file({ doc_type: "HW", lang: "e", is_answer: true }),
  file({ doc_type: "HW", lang: "c" }),
  file({ doc_type: "HW", lang: "c", is_answer: true }),
  file({ doc_type: "Extra", lang: "c" }),
  file({ doc_type: "Extra", lang: "c", is_answer: true }),
  file({ doc_type: "CW", lang: null, is_parallel: true }),
  file({ doc_type: "CW", lang: null, is_parallel: true, is_answer: true }),
  file({ doc_type: "HW", lang: null, is_parallel: true }),
];

describe("normalizeLangStream", () => {
  it("maps real student record values (E/C)", () => {
    expect(normalizeLangStream("E")).toBe("e");
    expect(normalizeLangStream("C")).toBe("c");
  });

  it("tolerates full words and form variants", () => {
    expect(normalizeLangStream("English")).toBe("e");
    expect(normalizeLangStream("Chinese")).toBe("c");
    expect(normalizeLangStream("EMI")).toBe("e");
    expect(normalizeLangStream("cmi")).toBe("c");
  });

  it("returns null for unknown or missing values", () => {
    expect(normalizeLangStream(null)).toBeNull();
    expect(normalizeLangStream(undefined)).toBeNull();
    expect(normalizeLangStream("")).toBeNull();
    expect(normalizeLangStream("IS")).toBeNull();
  });
});

describe("pickDefaults", () => {
  it("resolves English defaults with answers", () => {
    const d = pickDefaults(sm701, "e");
    expect(d.cw?.lang).toBe("e");
    expect(d.cw?.is_answer).toBe(false);
    expect(d.cwAnswer?.is_answer).toBe(true);
    expect(d.hw?.lang).toBe("e");
    expect(d.hwAnswer?.lang).toBe("e");
  });

  it("Extra resolves per language (Chinese-only chapter)", () => {
    expect(pickDefaults(sm701, "c").extra).toBeDefined();
    expect(pickDefaults(sm701, "e").extra).toBeUndefined();
  });

  it("parallel versions resolve regardless of language, with answers", () => {
    const d = pickDefaults(sm701, null);
    expect(d.parallelCw?.is_parallel).toBe(true);
    expect(d.parallelCw?.is_answer).toBe(false);
    expect(d.parallelCwAnswer?.is_answer).toBe(true);
    expect(d.parallelHw?.is_parallel).toBe(true);
    expect(d.parallelHwAnswer).toBeUndefined();
    expect(d.parallelExtra).toBeUndefined();
  });

  it("unknown language resolves no single-language defaults", () => {
    const d = pickDefaults(sm701, null);
    expect(d.cw).toBeUndefined();
    expect(d.hw).toBeUndefined();
    expect(d.extra).toBeUndefined();
  });
});

describe("groupChapters", () => {
  it("groups files into sorted chapters per grade", () => {
    const files = [
      ...sm701,
      file({ course_code: "810", lesson_number: 10, grade: "F2", topic_zh: "分式" }),
      file({ course_code: "801", lesson_number: 1, grade: "F2", topic_zh: "代數的運算" }),
    ];
    const byGrade = groupChapters(files);
    expect(byGrade.get("F1")).toHaveLength(1);
    expect(byGrade.get("F2")!.map((c) => c.code)).toEqual(["801", "810"]);
    expect(byGrade.get("F1")![0].files).toHaveLength(sm701.length);
  });

  it("tracks the latest mtime per chapter", () => {
    const files = [
      file({ file_mtime: "2026-06-01T00:00:00" }),
      file({ file_mtime: "2026-06-05T00:00:00" }),
      file({ file_mtime: null }),
    ];
    expect(groupChapters(files).get("F1")![0].latestMtime).toBe("2026-06-05T00:00:00");
  });
});

describe("buildFullPath", () => {
  it("joins prefix and rel_path with a backslash", () => {
    expect(buildFullPath("[Courseware Developer 中學]\\Secondary", "F1\\a.pdf")).toBe(
      "[Courseware Developer 中學]\\Secondary\\F1\\a.pdf"
    );
  });

  it("falls back to rel_path without a prefix", () => {
    expect(buildFullPath(null, "F1\\a.pdf")).toBe("F1\\a.pdf");
  });
});
