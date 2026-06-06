"use client";

import { useState, type ReactNode } from "react";
import { Sun, PenTool, BookOpen, Loader2, Cable, Columns2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import { sessionsAPI } from "@/lib/api";
import { updateSessionInCache } from "@/lib/session-cache";
import {
  normalizeLangStream,
  pickDefaults,
  buildFullPath,
  resolveParallelPreview,
  type Chapter,
  type ParallelPreviewSource,
} from "@/lib/summer-courseware-defaults";
import {
  sessionSummerYear,
  useSummerCoursewareIndex,
  useCoursewareDrive,
  previewExercise,
} from "@/lib/summer-courseware-session";
import type { Session, SessionExercise, SummerCoursewareFile } from "@/types";

interface SummerCoursewarePanelProps {
  session: Session;
  isReadOnly?: boolean;
  /** Show a material in the lesson PDF pane (parallel versions). */
  onPreview?: (exercise: SessionExercise) => void;
}

/** Dashed assign button matching the app's CW (pen/rose) / HW (book/blue) language. */
export function summerAssignButtonClass(type: "CW" | "HW"): string {
  return cn(
    "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border border-dashed transition-colors disabled:opacity-50",
    type === "CW"
      ? "border-rose-300 dark:border-rose-700/50 text-rose-500 dark:text-rose-400 hover:bg-rose-50/50 dark:hover:bg-rose-900/10"
      : "border-blue-300 dark:border-blue-700/50 text-blue-500 dark:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10"
  );
}

export function SummerAssignIcon({ type, busy }: { type: "CW" | "HW"; busy?: boolean }) {
  if (busy) return <Loader2 className="h-3 w-3 animate-spin" />;
  return type === "CW" ? <PenTool className="h-3 w-3" /> : <BookOpen className="h-3 w-3" />;
}

/** Chip tooltip: composed previews name both sources, pre-made files one. */
export function parallelChipTitle(source: ParallelPreviewSource): string {
  return source.composed
    ? `View ${source.fileNames.join(" + ")} side by side in the lesson pane`
    : `View ${source.fileNames[0]} in the lesson pane`;
}

/** Parallel view chips follow the same colour convention (Extra in amber). */
export function parallelChipClass(kind: "CW" | "HW" | "Extra"): string {
  return cn(
    "px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors",
    kind === "CW"
      ? "text-rose-500 dark:text-rose-400 hover:bg-rose-50/60 dark:hover:bg-rose-900/20"
      : kind === "HW"
        ? "text-blue-500 dark:text-blue-400 hover:bg-blue-50/60 dark:hover:bg-blue-900/20"
        : "text-amber-600 dark:text-amber-400 hover:bg-amber-100/60 dark:hover:bg-amber-900/20"
  );
}

/**
 * One material row: label + assign control. No open/answer buttons here:
 * assigned files show in the lesson PDF pane, and the answer key is a
 * keystroke away ("a") since assignment links answer_pdf_name.
 */
function MaterialRow({
  label,
  fileName,
  assignControl,
  assigned,
}: {
  label: string;
  fileName: string;
  /** Right-aligned assign button (hidden once assigned). */
  assignControl?: ReactNode;
  assigned?: boolean;
}) {
  return (
    <div className="flex items-center gap-1 min-h-[28px]" title={fileName}>
      <span className="w-16 flex-shrink-0 text-[11px] font-medium text-[#8b7355] dark:text-[#a09080]">
        {label}
      </span>
      <span className="flex-1" />
      {assigned ? (
        <span className="text-[10px] text-green-600 dark:text-green-400 pr-1">Assigned</span>
      ) : (
        assignControl
      )}
    </div>
  );
}

/**
 * Summer materials for the session's lesson number, resolved live from the
 * scanned courseware index. Nothing is stored per session until the tutor
 * assigns a file, so mid-season PDF updates are always reflected.
 */
export function SummerCoursewarePanel({ session, isReadOnly, onPreview }: SummerCoursewarePanelProps) {
  const { showToast } = useToast();
  const year = sessionSummerYear(session);
  const grade = session.grade;
  const lang = normalizeLangStream(session.lang_stream);

  const { index, chapters } = useSummerCoursewareIndex(year, grade);

  // Default to the session's lesson chapter; tutors can switch (extra
  // chapters like SM809/810 included).
  const [chapterCode, setChapterCode] = useState<string | null>(null);
  const lessonChapter = chapters.find((c) => c.lessonNumber === session.lesson_number);
  const chapter: Chapter | undefined =
    (chapterCode ? chapters.find((c) => c.code === chapterCode) : undefined) ?? lessonChapter;

  const [assigning, setAssigning] = useState<string | null>(null);

  // The connected drive feeds the PDF pane's loader (the share isn't in
  // Paperless and the Settings folder alias may not exist on this machine).
  const { connected: driveConnected, connect: handleConnect } = useCoursewareDrive(year);

  if (!grade || session.lesson_number == null) return null;
  // No index for this year (or grade missing from scan): stay out of the way.
  if (!index || chapters.length === 0) return null;

  const defaults = chapter ? pickDefaults(chapter.files, lang) : {};
  const cDefaults = chapter ? pickDefaults(chapter.files, "c") : {};
  const eDefaults = chapter ? pickDefaults(chapter.files, "e") : {};
  const pathPrefix = index.scan?.path_prefix;
  const exercises = session.exercises ?? [];
  const hasPath = (f?: SummerCoursewareFile) =>
    !!f && exercises.some((e) => e.pdf_name === buildFullPath(pathPrefix, f.rel_path));

  const assign = async (
    type: "CW" | "HW",
    file: SummerCoursewareFile,
    answer?: SummerCoursewareFile
  ) => {
    setAssigning(file.rel_path);
    try {
      const updated = await sessionsAPI.saveExercises(
        session.id,
        type,
        [{
          exercise_type: type,
          pdf_name: buildFullPath(pathPrefix, file.rel_path),
          answer_pdf_name: answer ? buildFullPath(pathPrefix, answer.rel_path) : null,
        }],
        { append: true }
      );
      updateSessionInCache(updated);
      showToast(`Added to ${type === "CW" ? "classwork" : "homework"}`, "success");
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Failed to assign", "error");
    } finally {
      setAssigning(null);
    }
  };

  const assignButton = (
    type: "CW" | "HW",
    label: string,
    file: SummerCoursewareFile,
    answer?: SummerCoursewareFile
  ) => (
    <button
      key={`${type}-${label}`}
      onClick={() => assign(type, file, answer)}
      disabled={assigning !== null}
      title={`Add to this session's ${type === "CW" ? "classwork" : "homework"}`}
      className={summerAssignButtonClass(type)}
    >
      <SummerAssignIcon type={type} busy={assigning === file.rel_path} />
      {label}
    </button>
  );

  // Composed live from the C + E versions where both exist, falling back
  // to a pre-made parallel file (a manual merge can lag behind an edit).
  const parallelCw = resolveParallelPreview(cDefaults, eDefaults, "CW", pathPrefix);
  const parallelHw = resolveParallelPreview(cDefaults, eDefaults, "HW", pathPrefix);
  const parallelExtra = resolveParallelPreview(cDefaults, eDefaults, "Extra", pathPrefix);

  const handlePreview = (source: ParallelPreviewSource) =>
    onPreview?.(previewExercise(session.id, source));

  const isLessonChapter = chapter && chapter.lessonNumber === session.lesson_number;

  return (
    <div className="mx-1 mt-2 mb-1 rounded-lg border border-[#e8d4b8] dark:border-[#5a4d3a] bg-[#fdf6ec]/60 dark:bg-[#2a2318]/60 px-2.5 py-2">
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <Sun className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-xs font-semibold text-[#8b7355] dark:text-[#a09080] uppercase tracking-wider">
          Summer Materials
        </span>
        <span className="flex-1" />
        {driveConnected === false && (
          <button
            onClick={handleConnect}
            title="Pick the courseware Finalised folder once on this computer so files load straight from the drive"
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-800 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors"
          >
            <Cable className="h-3 w-3" />
            Connect drive
          </button>
        )}
      </div>

      {/* Chapter picker */}
      <select
        value={chapter?.code ?? ""}
        onChange={(e) => setChapterCode(e.target.value)}
        className="mt-1.5 w-full px-1.5 py-1 rounded border border-[#e8d4b8] dark:border-[#5a4d3a] bg-white/70 dark:bg-[#1a1a1a]/70 text-xs text-[#6b5a42] dark:text-[#c4a882] [&>option]:bg-white [&>option]:text-[#6b5a42] dark:[&>option]:bg-[#2a2318] dark:[&>option]:text-[#c4a882]"
      >
        {!chapter && <option value="">Choose chapter…</option>}
        {chapters.map((c) => (
          <option key={c.code} value={c.code}>
            {c.lessonNumber != null ? `L${c.lessonNumber} · ` : ""}SM{c.code} {c.topicZh}
          </option>
        ))}
      </select>

      {chapter && (
        <>
          {!isLessonChapter && (
            <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-400">
              Viewing a different chapter than this session&apos;s L{session.lesson_number}.
            </p>
          )}
          {chapter.topicEn && (
            <p className="mt-1 text-[10px] text-[#a0906e] dark:text-[#8a7a60] truncate">
              {chapter.topicEn}
            </p>
          )}

          <div className="mt-1.5 flex flex-col gap-0.5">
            {defaults.cw && (
              <MaterialRow
                label="Classwork"
                fileName={defaults.cw.file_name}
                assignControl={isReadOnly ? undefined : assignButton("CW", "Assign", defaults.cw, defaults.cwAnswer)}
                assigned={hasPath(defaults.cw)}
              />
            )}
            {defaults.hw && (
              <MaterialRow
                label="Homework"
                fileName={defaults.hw.file_name}
                assignControl={isReadOnly ? undefined : assignButton("HW", "Assign", defaults.hw, defaults.hwAnswer)}
                assigned={hasPath(defaults.hw)}
              />
            )}
            {defaults.extra && (
              <MaterialRow
                label="Extra"
                fileName={defaults.extra.file_name}
                assignControl={isReadOnly ? undefined : (
                  <>
                    {assignButton("CW", "CW", defaults.extra, defaults.extraAnswer)}
                    {assignButton("HW", "HW", defaults.extra, defaults.extraAnswer)}
                  </>
                )}
                assigned={hasPath(defaults.extra)}
              />
            )}
            {!lang && (
              <p className="text-[10px] text-amber-700 dark:text-amber-400">
                Set the student&apos;s language stream to see their version.
              </p>
            )}

            {/* Parallel versions: both languages side by side, for teaching
                a mixed class from one PDF. Click shows it in the PDF pane
                (never assigned), with the answer key on "a" as usual. */}
            {(parallelCw || parallelHw || parallelExtra) && (
              <div className="flex items-center gap-1.5 min-h-[28px]">
                <span
                  className="w-16 flex-shrink-0 text-[11px] font-medium text-[#8b7355] dark:text-[#a09080] inline-flex items-center gap-1"
                  title="Both languages side by side, for mixed classes"
                >
                  <Columns2 className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">Parallel</span>
                </span>
                {parallelCw && (
                  <button
                    onClick={() => handlePreview(parallelCw)}
                    title={parallelChipTitle(parallelCw)}
                    className={parallelChipClass("CW")}
                  >
                    CW
                  </button>
                )}
                {parallelHw && (
                  <button
                    onClick={() => handlePreview(parallelHw)}
                    title={parallelChipTitle(parallelHw)}
                    className={parallelChipClass("HW")}
                  >
                    HW
                  </button>
                )}
                {parallelExtra && (
                  <button
                    onClick={() => handlePreview(parallelExtra)}
                    title={parallelChipTitle(parallelExtra)}
                    className={parallelChipClass("Extra")}
                  >
                    Extra
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
