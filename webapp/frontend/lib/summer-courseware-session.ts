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
      showToast("That folder doesn't look like the Finalised folder (no F1-F3 inside)", "error");
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
  const plan: AssignmentPlan = { items: [], noLang: [], noFile: [], already: [] };

  for (const session of sessions) {
    const lang = normalizeLangStream(session.lang_stream);
    if (!lang) {
      plan.noLang.push(session);
      continue;
    }
    const { file, answer } = pickDocDefaults(byLang[lang], docType);
    if (!file) {
      plan.noFile.push(session);
      continue;
    }
    const fullPath = buildFullPath(pathPrefix, file.rel_path);
    if (session.exercises?.some((e) => e.pdf_name === fullPath)) {
      plan.already.push(session);
      continue;
    }
    plan.items.push({ session, file, answer, fullPath });
  }
  return plan;
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
  if (result.failed) parts.push(`${result.failed} failed`);
  return parts.join(" · ");
}
