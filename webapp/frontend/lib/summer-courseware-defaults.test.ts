import { describe, it, expect } from "vitest";
import {
  normalizeLangStream,
  groupChapters,
  pickDefaults,
  buildFullPath,
  buildParallelPath,
  parseParallelPath,
  resolveParallelPreview,
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

describe("parallel paths", () => {
  it("round-trips two real paths", () => {
    const built = buildParallelPath("X\\F1\\cw_c.pdf", "X\\F1\\cw_e.pdf");
    expect(parseParallelPath(built)).toEqual({
      left: "X\\F1\\cw_c.pdf",
      right: "X\\F1\\cw_e.pdf",
    });
  });

  it("real paths are not parallel paths", () => {
    expect(parseParallelPath("X\\F1\\cw_c.pdf")).toBeNull();
  });
});

describe("resolveParallelPreview", () => {
  const PREFIX = "X";
  const defaultsFor = (files: SummerCoursewareFile[]) => ({
    c: pickDefaults(files, "c"),
    e: pickDefaults(files, "e"),
  });

  it("composes from C + E when both exist, even with a pre-made parallel", () => {
    const { c, e } = defaultsFor(sm701);
    const source = resolveParallelPreview(c, e, "CW", PREFIX)!;
    expect(source.composed).toBe(true);
    expect(parseParallelPath(source.pdfName)).toEqual({
      left: `${PREFIX}\\${c.cw!.rel_path}`,
      right: `${PREFIX}\\${e.cw!.rel_path}`,
    });
    // Both languages have answers → the answer view is composed too.
    expect(parseParallelPath(source.answerPdfName!)).toEqual({
      left: `${PREFIX}\\${c.cwAnswer!.rel_path}`,
      right: `${PREFIX}\\${e.cwAnswer!.rel_path}`,
    });
    expect(source.fileNames).toHaveLength(2);
  });

  it("uses a lone answer as-is when only one language has one", () => {
    const files = [
      file({ doc_type: "CW", lang: "c", rel_path: "F1\\cw_c.pdf" }),
      file({ doc_type: "CW", lang: "c", is_answer: true, rel_path: "F1\\cw_c_ans.pdf" }),
      file({ doc_type: "CW", lang: "e", rel_path: "F1\\cw_e.pdf" }),
    ];
    const { c, e } = defaultsFor(files);
    const source = resolveParallelPreview(c, e, "CW", PREFIX)!;
    expect(source.composed).toBe(true);
    expect(source.answerPdfName).toBe(`${PREFIX}\\F1\\cw_c_ans.pdf`);
  });

  it("falls back to the pre-made parallel when a language version is missing", () => {
    const files = [
      file({ doc_type: "HW", lang: "c", rel_path: "F1\\hw_c.pdf" }),
      file({ doc_type: "HW", lang: null, is_parallel: true, rel_path: "F1\\hw_p.pdf" }),
      file({ doc_type: "HW", lang: null, is_parallel: true, is_answer: true, rel_path: "F1\\hw_p_ans.pdf" }),
    ];
    const { c, e } = defaultsFor(files);
    const source = resolveParallelPreview(c, e, "HW", PREFIX)!;
    expect(source.composed).toBe(false);
    expect(source.pdfName).toBe(`${PREFIX}\\F1\\hw_p.pdf`);
    expect(source.answerPdfName).toBe(`${PREFIX}\\F1\\hw_p_ans.pdf`);
    expect(source.fileNames).toHaveLength(1);
  });

  it("resolves nothing without both languages or a pre-made file", () => {
    const { c, e } = defaultsFor(sm701);
    // Extra exists only in Chinese and has no pre-made parallel.
    expect(resolveParallelPreview(c, e, "Extra", PREFIX)).toBeNull();
  });
});
