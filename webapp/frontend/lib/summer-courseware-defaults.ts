/**
 * Pure helpers for resolving summer courseware defaults from the scanned
 * index. Summer materials are determined by (grade, lesson_number,
 * lang_stream); these helpers turn the flat index into per-chapter file
 * bundles for the admin health matrix and lesson mode.
 */

import type { SummerCoursewareFile } from "@/types";

export type CoursewareLang = "e" | "c";

/**
 * Map a student's lang_stream to a courseware language suffix.
 * Real student records store "E" / "C"; tolerate full words and the
 * EMI/CMI variants used on summer application forms.
 */
export function normalizeLangStream(
  langStream?: string | null
): CoursewareLang | null {
  const v = (langStream ?? "").trim().toLowerCase();
  if (v === "e" || v === "emi" || v.startsWith("eng")) return "e";
  if (v === "c" || v === "cmi" || v.startsWith("chi")) return "c";
  return null;
}

export interface Chapter {
  grade: string;
  code: string;
  lessonNumber: number | null;
  topicZh: string | null;
  topicEn: string | null;
  files: SummerCoursewareFile[];
  latestMtime: string | null;
}

/** Group classified index files into chapters, keyed by grade. */
export function groupChapters(
  files: SummerCoursewareFile[]
): Map<string, Chapter[]> {
  const byChapter = new Map<string, Chapter>();
  for (const f of files) {
    if (!f.grade || !f.course_code) continue;
    const key = `${f.grade}|${f.course_code}`;
    let ch = byChapter.get(key);
    if (!ch) {
      ch = {
        grade: f.grade,
        code: f.course_code,
        lessonNumber: f.lesson_number,
        topicZh: f.topic_zh,
        topicEn: f.topic_en,
        files: [],
        latestMtime: null,
      };
      byChapter.set(key, ch);
    }
    ch.files.push(f);
    if (f.file_mtime && (!ch.latestMtime || f.file_mtime > ch.latestMtime)) {
      ch.latestMtime = f.file_mtime;
    }
  }
  const byGrade = new Map<string, Chapter[]>();
  for (const ch of byChapter.values()) {
    if (!byGrade.has(ch.grade)) byGrade.set(ch.grade, []);
    byGrade.get(ch.grade)!.push(ch);
  }
  for (const chapters of byGrade.values()) {
    chapters.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }
  return byGrade;
}

export interface ChapterDefaults {
  cw?: SummerCoursewareFile;
  cwAnswer?: SummerCoursewareFile;
  hw?: SummerCoursewareFile;
  hwAnswer?: SummerCoursewareFile;
  extra?: SummerCoursewareFile;
  extraAnswer?: SummerCoursewareFile;
  parallelCw?: SummerCoursewareFile;
  parallelHw?: SummerCoursewareFile;
  parallelExtra?: SummerCoursewareFile;
}

function findFile(
  files: SummerCoursewareFile[],
  docType: "CW" | "HW" | "Extra",
  isParallel: boolean,
  isAnswer: boolean,
  lang?: CoursewareLang
): SummerCoursewareFile | undefined {
  return files.find(
    (f) =>
      f.doc_type === docType &&
      f.is_parallel === isParallel &&
      f.is_answer === isAnswer &&
      (isParallel || f.lang === lang)
  );
}

/**
 * Resolve a chapter's default files for a student. Without a known
 * language only the parallel (merged-language) versions resolve.
 */
export function pickDefaults(
  files: SummerCoursewareFile[],
  lang: CoursewareLang | null
): ChapterDefaults {
  const defaults: ChapterDefaults = {
    parallelCw: findFile(files, "CW", true, false),
    parallelHw: findFile(files, "HW", true, false),
    parallelExtra: findFile(files, "Extra", true, false),
  };
  if (lang) {
    defaults.cw = findFile(files, "CW", false, false, lang);
    defaults.cwAnswer = findFile(files, "CW", false, true, lang);
    defaults.hw = findFile(files, "HW", false, false, lang);
    defaults.hwAnswer = findFile(files, "HW", false, true, lang);
    defaults.extra = findFile(files, "Extra", false, false, lang);
    defaults.extraAnswer = findFile(files, "Extra", false, true, lang);
  }
  return defaults;
}

/**
 * Full path for materialising a SessionExercise from an index entry,
 * e.g. "[Courseware Developer 中學]\\Secondary\\...\\Finalised" + rel_path.
 */
export function buildFullPath(
  pathPrefix: string | null | undefined,
  relPath: string
): string {
  return pathPrefix ? `${pathPrefix}\\${relPath}` : relPath;
}
