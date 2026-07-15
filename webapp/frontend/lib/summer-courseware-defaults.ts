/**
 * Pure helpers for resolving summer courseware defaults from the scanned
 * index. Summer materials are determined by (grade, lesson_number,
 * lang_stream); these helpers turn the flat index into per-chapter file
 * bundles for the admin health matrix and lesson mode.
 */

import { buildParallelPath } from "./parallel-path";
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

/** Display label for a chapter, e.g. "L2 · SM702 指數". */
export function chapterLabel(chapter: Chapter): string {
  const lesson = chapter.lessonNumber != null ? `L${chapter.lessonNumber} · ` : "";
  const topic = chapter.topicZh ? ` ${chapter.topicZh}` : "";
  return `${lesson}SM${chapter.code}${topic}`;
}

export interface ChapterDefaults {
  cw?: SummerCoursewareFile;
  cwAnswer?: SummerCoursewareFile;
  hw?: SummerCoursewareFile;
  hwAnswer?: SummerCoursewareFile;
  extra?: SummerCoursewareFile;
  extraAnswer?: SummerCoursewareFile;
  parallelCw?: SummerCoursewareFile;
  parallelCwAnswer?: SummerCoursewareFile;
  parallelHw?: SummerCoursewareFile;
  parallelHwAnswer?: SummerCoursewareFile;
  parallelExtra?: SummerCoursewareFile;
  parallelExtraAnswer?: SummerCoursewareFile;
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
    parallelCwAnswer: findFile(files, "CW", true, true),
    parallelHw: findFile(files, "HW", true, false),
    parallelHwAnswer: findFile(files, "HW", true, true),
    parallelExtra: findFile(files, "Extra", true, false),
    parallelExtraAnswer: findFile(files, "Extra", true, true),
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

// ============================================================================
// Composed parallel previews
// ============================================================================

export interface ParallelPreviewSource {
  pdfName: string;
  answerPdfName?: string;
  /** Negative id for the ephemeral preview exercise. */
  previewId: number;
  /** Composed live from the two language versions (vs a pre-made file). */
  composed: boolean;
  /** Source file names, for tooltips. */
  fileNames: string[];
}

function parallelFor(defaults: ChapterDefaults, docType: "CW" | "HW" | "Extra") {
  switch (docType) {
    case "CW": return { file: defaults.parallelCw, answer: defaults.parallelCwAnswer };
    case "HW": return { file: defaults.parallelHw, answer: defaults.parallelHwAnswer };
    case "Extra": return { file: defaults.parallelExtra, answer: defaults.parallelExtraAnswer };
  }
}

/** A doc type's default file + answer from resolved ChapterDefaults. */
export function pickDocDefaults(defaults: ChapterDefaults, docType: "CW" | "HW" | "Extra") {
  switch (docType) {
    case "CW": return { file: defaults.cw, answer: defaults.cwAnswer };
    case "HW": return { file: defaults.hw, answer: defaults.hwAnswer };
    case "Extra": return { file: defaults.extra, answer: defaults.extraAnswer };
  }
}

/**
 * Resolve what the Parallel chip shows for a doc type. Composing live from
 * the C + E versions is preferred — it always reflects the current files,
 * whereas a pre-made merge can lag behind an edit. The pre-made parallel
 * file is the fallback when a language version is missing.
 */
export function resolveParallelPreview(
  cDefaults: ChapterDefaults,
  eDefaults: ChapterDefaults,
  docType: "CW" | "HW" | "Extra",
  pathPrefix: string | null | undefined
): ParallelPreviewSource | null {
  const c = pickDocDefaults(cDefaults, docType);
  const e = pickDocDefaults(eDefaults, docType);
  if (c.file && e.file) {
    const cAns = c.answer && buildFullPath(pathPrefix, c.answer.rel_path);
    const eAns = e.answer && buildFullPath(pathPrefix, e.answer.rel_path);
    return {
      pdfName: buildParallelPath(
        buildFullPath(pathPrefix, c.file.rel_path),
        buildFullPath(pathPrefix, e.file.rel_path)
      ),
      // Compose answers too when both exist; a lone answer shows as-is.
      answerPdfName: cAns && eAns ? buildParallelPath(cAns, eAns) : cAns || eAns || undefined,
      previewId: -c.file.id,
      composed: true,
      fileNames: [c.file.file_name, e.file.file_name],
    };
  }
  // Parallel files are language-independent; either pick resolves them.
  const premade = parallelFor(cDefaults, docType);
  if (premade.file) {
    return {
      pdfName: buildFullPath(pathPrefix, premade.file.rel_path),
      answerPdfName: premade.answer
        ? buildFullPath(pathPrefix, premade.answer.rel_path)
        : undefined,
      previewId: -premade.file.id,
      composed: false,
      fileNames: [premade.file.file_name],
    };
  }
  return null;
}
