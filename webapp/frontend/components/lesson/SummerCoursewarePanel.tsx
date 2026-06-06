"use client";

import { useState, useEffect, useMemo } from "react";
import useSWR from "swr";
import { Sun, FileText, FileCheck, Plus, Loader2, Cable, Columns2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import { summerCoursewareAPI, sessionsAPI } from "@/lib/api";
import { updateSessionInCache } from "@/lib/session-cache";
import {
  normalizeLangStream,
  groupChapters,
  pickDefaults,
  buildFullPath,
  type Chapter,
} from "@/lib/summer-courseware-defaults";
import {
  openCoursewareFile,
  getRootHandle,
  connectRootHandle,
} from "@/lib/summer-courseware-scan";
import type { Session, SummerCoursewareFile } from "@/types";

interface SummerCoursewarePanelProps {
  session: Session;
  isReadOnly?: boolean;
}

/** One material row: name, open worksheet/answers, optional assign action. */
function MaterialRow({
  label,
  file,
  answer,
  onOpen,
  assignLabel,
  onAssign,
  assigned,
  assigning,
}: {
  label: string;
  file: SummerCoursewareFile;
  answer?: SummerCoursewareFile;
  onOpen: (relPath: string) => void;
  assignLabel?: string;
  onAssign?: () => void;
  assigned?: boolean;
  assigning?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 min-h-[28px]">
      <span className="w-16 flex-shrink-0 text-[11px] font-medium text-[#8b7355] dark:text-[#a09080]">
        {label}
      </span>
      <button
        onClick={() => onOpen(file.rel_path)}
        title={`Open ${file.file_name}`}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-[#6b5a42] dark:text-[#c4a882] hover:bg-[#e8d4b8]/50 dark:hover:bg-[#3a3228] transition-colors"
      >
        <FileText className="h-3 w-3" />
        Open
      </button>
      {answer && (
        <button
          onClick={() => onOpen(answer.rel_path)}
          title={`Open ${answer.file_name}`}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-[#6b5a42] dark:text-[#c4a882] hover:bg-[#e8d4b8]/50 dark:hover:bg-[#3a3228] transition-colors"
        >
          <FileCheck className="h-3 w-3" />
          Ans
        </button>
      )}
      <span className="flex-1" />
      {onAssign && (
        assigned ? (
          <span className="text-[10px] text-green-600 dark:text-green-400 pr-1">Assigned</span>
        ) : (
          <button
            onClick={onAssign}
            disabled={assigning}
            title={`Add to this session's ${assignLabel}`}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-[#8b6040] dark:text-[#c4a882] border border-[#d4c4a8] dark:border-[#5a4d3a] hover:bg-[#e8d4b8]/40 dark:hover:bg-[#3a3228] transition-colors disabled:opacity-50"
          >
            {assigning ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Plus className="h-2.5 w-2.5" />}
            {assignLabel}
          </button>
        )
      )}
    </div>
  );
}

/**
 * Summer materials for the session's lesson number, resolved live from the
 * scanned courseware index. Nothing is stored per session until the tutor
 * assigns a file, so mid-season PDF updates are always reflected.
 */
export function SummerCoursewarePanel({ session, isReadOnly }: SummerCoursewarePanelProps) {
  const { showToast } = useToast();
  const year = parseInt(String(session.session_date).slice(0, 4), 10);
  const grade = session.grade;
  const lang = normalizeLangStream(session.lang_stream);

  const { data: index } = useSWR(
    grade ? ["summer-courseware-index", year, grade] : null,
    () => summerCoursewareAPI.getIndex(year, grade!),
    { revalidateOnFocus: false }
  );

  const chapters = useMemo(
    () => (grade && index ? groupChapters(index.files).get(grade) ?? [] : []),
    [index, grade]
  );

  // Default to the session's lesson chapter; tutors can switch (extra
  // chapters like SM809/810 included).
  const [chapterCode, setChapterCode] = useState<string | null>(null);
  const lessonChapter = chapters.find((c) => c.lessonNumber === session.lesson_number);
  const chapter: Chapter | undefined =
    (chapterCode ? chapters.find((c) => c.code === chapterCode) : undefined) ?? lessonChapter;

  const [assigning, setAssigning] = useState<string | null>(null);

  // Opening uses the per-machine stored handle to the courseware root.
  const [driveConnected, setDriveConnected] = useState<boolean | null>(null);
  useEffect(() => {
    getRootHandle(year).then((h) => setDriveConnected(!!h));
  }, [year]);

  if (!grade || session.lesson_number == null) return null;
  // No index for this year (or grade missing from scan): stay out of the way.
  if (!index || chapters.length === 0) return null;

  const defaults = chapter ? pickDefaults(chapter.files, lang) : {};
  const pathPrefix = index.scan?.path_prefix;
  const exercises = session.exercises ?? [];
  const hasPath = (f?: SummerCoursewareFile) =>
    !!f && exercises.some((e) => e.pdf_name === buildFullPath(pathPrefix, f.rel_path));

  const handleOpen = async (relPath: string) => {
    const error = await openCoursewareFile(year, relPath);
    if (!error) return;
    if (error === "no_handle" || error === "folder_not_found") {
      setDriveConnected(false);
      showToast("Connect the courseware drive on this computer first (plug icon above)", "error");
    } else if (error === "permission_denied") {
      showToast("Drive access was declined. Try again to re-grant.", "error");
    } else {
      showToast("File not found on the drive. It may have moved since the last scan.", "error");
    }
  };

  const handleConnect = async () => {
    const result = await connectRootHandle(year);
    if (result === "connected") {
      setDriveConnected(true);
      showToast("Drive connected", "success");
    } else if (result === "wrong_folder") {
      showToast("That folder doesn't look like the Finalised folder (no F1-F3 inside)", "error");
    }
  };

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
            title="Pick the courseware Finalised folder once on this computer so files open directly"
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
        className="mt-1.5 w-full px-1.5 py-1 rounded border border-[#e8d4b8] dark:border-[#5a4d3a] bg-white/70 dark:bg-[#1a1a1a]/70 text-xs text-[#6b5a42] dark:text-[#c4a882]"
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
                file={defaults.cw}
                answer={defaults.cwAnswer}
                onOpen={handleOpen}
                assignLabel="CW"
                onAssign={isReadOnly ? undefined : () => assign("CW", defaults.cw!, defaults.cwAnswer)}
                assigned={hasPath(defaults.cw)}
                assigning={assigning === defaults.cw.rel_path}
              />
            )}
            {defaults.hw && (
              <MaterialRow
                label="Homework"
                file={defaults.hw}
                answer={defaults.hwAnswer}
                onOpen={handleOpen}
                assignLabel="HW"
                onAssign={isReadOnly ? undefined : () => assign("HW", defaults.hw!, defaults.hwAnswer)}
                assigned={hasPath(defaults.hw)}
                assigning={assigning === defaults.hw.rel_path}
              />
            )}
            {defaults.extra && (
              <MaterialRow
                label="Extra"
                file={defaults.extra}
                answer={defaults.extraAnswer}
                onOpen={handleOpen}
                assignLabel="CW"
                onAssign={isReadOnly ? undefined : () => assign("CW", defaults.extra!, defaults.extraAnswer)}
                assigned={hasPath(defaults.extra)}
                assigning={assigning === defaults.extra.rel_path}
              />
            )}
            {!lang && (
              <p className="text-[10px] text-amber-700 dark:text-amber-400">
                Set the student&apos;s language stream to see their version.
              </p>
            )}

            {/* Parallel versions: both languages side by side, for teaching
                a mixed class from one PDF. */}
            {(defaults.parallelCw || defaults.parallelHw || defaults.parallelExtra) && (
              <div className="flex items-center gap-1.5 min-h-[28px]">
                <span
                  className="w-16 flex-shrink-0 text-[11px] font-medium text-[#8b7355] dark:text-[#a09080] inline-flex items-center gap-1"
                  title="Both languages merged side by side, for mixed classes"
                >
                  <Columns2 className="h-3 w-3" />
                  Parallel
                </span>
                {defaults.parallelCw && (
                  <button
                    onClick={() => handleOpen(defaults.parallelCw!.rel_path)}
                    className="px-1.5 py-0.5 rounded text-[11px] font-medium text-sky-700 dark:text-sky-400 hover:bg-sky-100/60 dark:hover:bg-sky-900/30 transition-colors"
                  >
                    CW
                  </button>
                )}
                {defaults.parallelHw && (
                  <button
                    onClick={() => handleOpen(defaults.parallelHw!.rel_path)}
                    className="px-1.5 py-0.5 rounded text-[11px] font-medium text-sky-700 dark:text-sky-400 hover:bg-sky-100/60 dark:hover:bg-sky-900/30 transition-colors"
                  >
                    HW
                  </button>
                )}
                {defaults.parallelExtra && (
                  <button
                    onClick={() => handleOpen(defaults.parallelExtra!.rel_path)}
                    className="px-1.5 py-0.5 rounded text-[11px] font-medium text-sky-700 dark:text-sky-400 hover:bg-sky-100/60 dark:hover:bg-sky-900/30 transition-colors"
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
