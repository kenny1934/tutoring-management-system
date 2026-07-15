/**
 * Session-facing summer courseware helpers shared by the lesson sidebar
 * panels and the exercise modals: fetching the scanned index, resolving
 * each student's language version, and assigning defaults to sessions.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import useSWR from "swr";
import { summerCoursewareAPI, sessionsAPI } from "./api";
import { updateSessionInCache } from "./session-cache";
import {
  normalizeLangStream,
  groupChapters,
  pickDefaults,
  pickDocDefaults,
  buildFullPath,
  type Chapter,
  type ChapterDefaults,
  type ParallelPreviewSource,
} from "./summer-courseware-defaults";
import {
  openCoursewareFile,
  getRootHandle,
  connectRootHandle,
} from "./summer-courseware-scan";
import { isFileSystemAccessSupported } from "./file-system";
import { useToast } from "@/contexts/ToastContext";
import type { Session, SessionExercise, SummerCoursewareFile, SummerCoursewareIndexResponse } from "@/types";

export type SummerDocType = "CW" | "HW" | "Extra";

/** Summer year a session's materials belong to (from its date). */
export function sessionSummerYear(session: Session): number {
  return parseInt(String(session.session_date).slice(0, 4), 10);
}

/** Scanned courseware index + chapters for one year/grade (shared SWR key). */
export function useSummerCoursewareIndex(
  year: number | null,
  grade: string | null | undefined
): { index: SummerCoursewareIndexResponse | undefined; chapters: Chapter[] } {
  const { data: index } = useSWR(
    year && grade ? ["summer-courseware-index", year, grade] : null,
    () => summerCoursewareAPI.getIndex(year!, grade!),
    { revalidateOnFocus: false }
  );
  const chapters = useMemo(
    () => (grade && index ? groupChapters(index.files).get(grade) ?? [] : []),
    [index, grade]
  );
  return { index, chapters };
}

/**
 * Per-machine courseware drive handle: connection state, the one-time
 * folder pick, and opening files with user-facing error toasts.
 */
export function useCoursewareDrive(year: number) {
  const { showToast } = useToast();
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    // Browsers without the File System Access API (Firefox, all mobile)
    // can never connect; leaving `connected` null keeps the connect
    // button hidden instead of offering a picker that cannot open.
    if (!isFileSystemAccessSupported()) return;
    getRootHandle(year).then((h) => setConnected(!!h));
  }, [year]);

  const open = useCallback(
    async (relPath: string) => {
      if (!isFileSystemAccessSupported()) {
        showToast("Courseware PDFs open from the drive on a centre PC using Chrome or Edge", "error");
        return;
      }
      const error = await openCoursewareFile(year, relPath);
      if (!error) return;
      if (error === "no_handle" || error === "folder_not_found") {
        setConnected(false);
        showToast("Connect the courseware drive on this computer first", "error");
      } else if (error === "permission_denied") {
        showToast("Drive access was declined. Try again to re-grant.", "error");
      } else {
        showToast("File not found on the drive. It may have moved since the last scan.", "error");
      }
    },
    [year, showToast]
  );

  const connect = useCallback(async () => {
    if (!isFileSystemAccessSupported()) {
      showToast("Connecting the drive needs Chrome or Edge", "error");
      return;
    }
    const result = await connectRootHandle(year);
    if (result === "connected") {
      setConnected(true);
      showToast("Drive connected", "success");
    } else if (result === "wrong_folder") {
      showToast("That folder doesn't look like the Finalised folder (no grade folders inside)", "error");
    }
  }, [year, showToast]);

  return { connected, connect, open };
}

/**
 * Ephemeral exercise for viewing un-assigned materials (parallel versions)
 * in the lesson PDF pane. The negative id keeps it clear of real exercises
 * (annotations, selection) and it is never persisted; the answer key
 * shortcut works because answer_pdf_name is linked like a real assignment.
 */
export function previewExercise(
  sessionId: number,
  source: ParallelPreviewSource
): SessionExercise {
  return {
    id: source.previewId,
    session_id: sessionId,
    exercise_type: "CW",
    pdf_name: source.pdfName,
    answer_pdf_name: source.answerPdfName,
    created_by: "preview",
  };
}

/** True for ephemeral preview exercises created by previewExercise(). */
export function isPreviewExercise(exercise: { id: number }): boolean {
  return exercise.id < 0;
}

export interface AssignmentPlanItem {
  session: Session;
  chapter: Chapter;
  file: SummerCoursewareFile;
  answer?: SummerCoursewareFile;
  fullPath: string;
}

export interface AssignmentPlan {
  items: AssignmentPlanItem[];
  /** Sessions skipped: no language stream on the student record. */
  noLang: Session[];
  /** Sessions skipped: no matching file in the index for their language. */
  noFile: Session[];
  /** Sessions skipped: this file is already assigned to them. */
  already: Session[];
  /** Sessions skipped: no lesson number set (per-lesson plans only). */
  noLesson: Session[];
  /** Sessions skipped: no chapter in the index matches their lesson number. */
  noChapter: Session[];
}

interface LangDefaults {
  e: ChapterDefaults;
  c: ChapterDefaults;
}

function emptyPlan(): AssignmentPlan {
  return { items: [], noLang: [], noFile: [], already: [], noLesson: [], noChapter: [] };
}

function planSession(
  plan: AssignmentPlan,
  session: Session,
  docType: SummerDocType,
  chapter: Chapter,
  byLang: LangDefaults,
  pathPrefix: string | null | undefined
): void {
  const lang = normalizeLangStream(session.lang_stream);
  if (!lang) {
    plan.noLang.push(session);
    return;
  }
  const { file, answer } = pickDocDefaults(byLang[lang], docType);
  if (!file) {
    plan.noFile.push(session);
    return;
  }
  const fullPath = buildFullPath(pathPrefix, file.rel_path);
  if (session.exercises?.some((e) => e.pdf_name === fullPath)) {
    plan.already.push(session);
    return;
  }
  plan.items.push({ session, chapter, file, answer, fullPath });
}

/**
 * Work out, per session, which file each student should get based on
 * their language stream. Pure; the caller decides what to do with skips.
 */
export function buildAssignmentPlan(
  sessions: Session[],
  docType: SummerDocType,
  chapter: Chapter,
  pathPrefix: string | null | undefined
): AssignmentPlan {
  const byLang = {
    e: pickDefaults(chapter.files, "e"),
    c: pickDefaults(chapter.files, "c"),
  };
  const plan = emptyPlan();
  for (const session of sessions) {
    planSession(plan, session, docType, chapter, byLang, pathPrefix);
  }
  return plan;
}

/**
 * Like buildAssignmentPlan, but resolves the chapter per session from the
 * student's own lesson_number, so a mixed-lesson slot (some at L2, some at
 * L6) assigns each student their own lesson's materials in one pass.
 */
export function buildPerLessonAssignmentPlan(
  sessions: Session[],
  docType: SummerDocType,
  chapters: Chapter[],
  pathPrefix: string | null | undefined
): AssignmentPlan {
  const plan = emptyPlan();
  const defaultsByCode = new Map<string, LangDefaults>();
  for (const session of sessions) {
    if (session.lesson_number == null) {
      plan.noLesson.push(session);
      continue;
    }
    const chapter = chapters.find((c) => c.lessonNumber === session.lesson_number);
    if (!chapter) {
      plan.noChapter.push(session);
      continue;
    }
    let byLang = defaultsByCode.get(chapter.code);
    if (!byLang) {
      byLang = { e: pickDefaults(chapter.files, "e"), c: pickDefaults(chapter.files, "c") };
      defaultsByCode.set(chapter.code, byLang);
    }
    planSession(plan, session, docType, chapter, byLang, pathPrefix);
  }
  return plan;
}

export interface LessonCount {
  lesson: number;
  count: number;
}

/** Distinct lesson numbers among sessions with counts, lowest lesson first. */
export function lessonBreakdown(sessions: Session[]): LessonCount[] {
  const counts = new Map<number, number>();
  for (const s of sessions) {
    if (s.lesson_number != null) {
      counts.set(s.lesson_number, (counts.get(s.lesson_number) ?? 0) + 1);
    }
  }
  return Array.from(counts, ([lesson, count]) => ({ lesson, count })).sort(
    (a, b) => a.lesson - b.lesson
  );
}

/** The slot's default lesson: the most common one (lowest wins a tie). */
export function mostCommonLessonNumber(breakdown: LessonCount[]): number | null {
  let best: LessonCount | null = null;
  for (const entry of breakdown) {
    if (!best || entry.count > best.count) best = entry;
  }
  return best?.lesson ?? null;
}

/** e.g. "L2 ×5 · L6 ×2" */
export function formatLessonBreakdown(breakdown: LessonCount[]): string {
  return breakdown.map(({ lesson, count }) => `L${lesson} ×${count}`).join(" · ");
}

function chapterLabel(chapter: Chapter): string {
  const lesson = chapter.lessonNumber != null ? `L${chapter.lessonNumber} · ` : "";
  const topic = chapter.topicZh ? ` ${chapter.topicZh}` : "";
  return `${lesson}SM${chapter.code}${topic}`;
}

/**
 * Confirm-dialog bullet lines for a per-lesson plan: one line per chapter
 * being assigned, then named lines for lesson-related skips (the tutor can
 * fix those before confirming; language/file skips surface in the toast).
 */
export function describeAssignmentGroups(plan: AssignmentPlan): string[] {
  const groups = new Map<string, { chapter: Chapter; count: number }>();
  for (const item of plan.items) {
    const group = groups.get(item.chapter.code) ?? { chapter: item.chapter, count: 0 };
    group.count++;
    groups.set(item.chapter.code, group);
  }
  const lines = Array.from(groups.values())
    .sort((a, b) => (a.chapter.lessonNumber ?? 0) - (b.chapter.lessonNumber ?? 0))
    .map(
      ({ chapter, count }) =>
        `${chapterLabel(chapter)}: ${count} student${count !== 1 ? "s" : ""}`
    );
  const missingByLesson = new Map<number, string[]>();
  for (const s of plan.noChapter) {
    const names = missingByLesson.get(s.lesson_number!) ?? [];
    names.push(s.student_name ?? "Unknown");
    missingByLesson.set(s.lesson_number!, names);
  }
  for (const [lesson, names] of Array.from(missingByLesson).sort((a, b) => a[0] - b[0])) {
    lines.push(`No materials for L${lesson}: ${names.join(", ")}`);
  }
  if (plan.noLesson.length) {
    lines.push(
      `No lesson number set: ${plan.noLesson.map((s) => s.student_name ?? "Unknown").join(", ")}`
    );
  }
  return lines;
}

/**
 * Append each planned file to its session as `type`, batched to avoid
 * overwhelming the server (mirrors BulkExerciseModal's save loop).
 */
export async function executeAssignmentPlan(
  plan: AssignmentPlan,
  type: "CW" | "HW",
  pathPrefix: string | null | undefined
): Promise<{ saved: number; failed: number }> {
  const CONCURRENCY = 5;
  let saved = 0;
  let failed = 0;
  for (let i = 0; i < plan.items.length; i += CONCURRENCY) {
    const batch = plan.items.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(({ session, fullPath, answer }) =>
        sessionsAPI
          .saveExercises(
            session.id,
            type,
            [{
              exercise_type: type,
              pdf_name: fullPath,
              answer_pdf_name: answer ? buildFullPath(pathPrefix, answer.rel_path) : null,
            }],
            { append: true }
          )
          .then((updated) => updateSessionInCache(updated))
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled") saved++;
      else failed++;
    }
  }
  return { saved, failed };
}

/** One-line toast summary for an executed plan. */
export function describeAssignmentResult(
  plan: AssignmentPlan,
  result: { saved: number; failed: number },
  type: "CW" | "HW"
): string {
  const label = type === "CW" ? "classwork" : "homework";
  const parts = [`Added to ${label} for ${result.saved} student${result.saved !== 1 ? "s" : ""}`];
  if (plan.already.length) parts.push(`${plan.already.length} already had it`);
  if (plan.noLang.length) parts.push(`${plan.noLang.length} missing language stream`);
  if (plan.noFile.length) parts.push(`${plan.noFile.length} no matching file`);
  if (plan.noLesson.length) parts.push(`${plan.noLesson.length} no lesson number`);
  if (plan.noChapter.length) parts.push(`${plan.noChapter.length} no materials for their lesson`);
  if (result.failed) parts.push(`${result.failed} failed`);
  return parts.join(" · ");
}
