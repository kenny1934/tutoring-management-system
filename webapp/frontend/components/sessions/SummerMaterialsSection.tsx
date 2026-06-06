"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Sun, ChevronDown, ChevronRight, FileText, FileCheck, Plus, Loader2, Cable, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import {
  normalizeLangStream,
  pickDefaults,
  buildFullPath,
  type Chapter,
  type ChapterDefaults,
} from "@/lib/summer-courseware-defaults";
import {
  sessionSummerYear,
  useSummerCoursewareIndex,
  useCoursewareDrive,
  buildAssignmentPlan,
  executeAssignmentPlan,
  describeAssignmentResult,
  type SummerDocType,
} from "@/lib/summer-courseware-session";
import type { Session, SummerCoursewareFile } from "@/types";

function rowDefaults(defaults: ChapterDefaults, docType: SummerDocType) {
  switch (docType) {
    case "CW": return { file: defaults.cw, answer: defaults.cwAnswer };
    case "HW": return { file: defaults.hw, answer: defaults.hwAnswer };
    case "Extra": return { file: defaults.extra, answer: defaults.extraAnswer };
  }
}

/** Collapsible amber section shell matching the Trending section style. */
function SummerSectionShell({
  summary,
  driveDisconnected,
  onConnectDrive,
  children,
}: {
  summary: ReactNode;
  driveDisconnected?: boolean;
  onConnectDrive?: () => void;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors",
          "bg-gradient-to-r from-amber-50 to-white dark:from-amber-900/20 dark:to-[#1a1a1a]",
          "hover:from-amber-100 hover:to-white dark:hover:from-amber-900/30 dark:hover:to-[#1a1a1a]"
        )}
      >
        <Sun className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-xs text-gray-600 dark:text-gray-300">Summer Materials</span>
        {summary}
        {driveDisconnected && onConnectDrive && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onConnectDrive(); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onConnectDrive(); } }}
            title="Pick the courseware Finalised folder once on this computer so files open directly"
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-800 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors cursor-pointer ml-1"
          >
            <Cable className="h-3 w-3" />
            Connect drive
          </span>
        )}
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-gray-400 ml-auto" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-gray-400 ml-auto" />
        )}
      </button>
      {expanded && (
        <div className="border-t border-[#e8d4b8] dark:border-[#6b5a4a] px-3 py-2 space-y-1.5">
          {children}
        </div>
      )}
    </div>
  );
}

function ChapterSelect({
  chapter,
  chapters,
  onChange,
}: {
  chapter?: Chapter;
  chapters: Chapter[];
  onChange: (code: string) => void;
}) {
  return (
    <select
      value={chapter?.code ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-1.5 py-1 rounded border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white/70 dark:bg-[#1a1a1a]/70 text-xs text-gray-700 dark:text-gray-300"
    >
      {!chapter && <option value="">Choose chapter…</option>}
      {chapters.map((c) => (
        <option key={c.code} value={c.code}>
          {c.lessonNumber != null ? `L${c.lessonNumber} · ` : ""}SM{c.code} {c.topicZh}
        </option>
      ))}
    </select>
  );
}

/**
 * Single-student summer section for ExerciseModal: one-click adds the
 * student's own language version (answers pre-linked) as a form row.
 * The tutor can still tweak pages before saving.
 */
export function SummerMaterialsSection({
  session,
  exerciseType,
  existingPaths,
  onAdd,
}: {
  session: Session;
  exerciseType: "CW" | "HW";
  /** Paths already present as form rows, to mark materials as added. */
  existingPaths: string[];
  onAdd: (pdfName: string, answerPdfName?: string) => void;
}) {
  const year = sessionSummerYear(session);
  const grade = session.grade;
  const lang = normalizeLangStream(session.lang_stream);
  const { index, chapters } = useSummerCoursewareIndex(
    session.lesson_number != null ? year : null,
    grade
  );
  const { connected, connect, open } = useCoursewareDrive(year);

  const [chapterCode, setChapterCode] = useState<string | null>(null);
  const lessonChapter = chapters.find((c) => c.lessonNumber === session.lesson_number);
  const chapter: Chapter | undefined =
    (chapterCode ? chapters.find((c) => c.code === chapterCode) : undefined) ?? lessonChapter;

  if (!grade || session.lesson_number == null) return null;
  if (!index || chapters.length === 0) return null;

  const pathPrefix = index.scan?.path_prefix;
  const defaults = chapter ? pickDefaults(chapter.files, lang) : {};

  const renderRow = (label: string, file?: SummerCoursewareFile, answer?: SummerCoursewareFile) => {
    if (!file) return null;
    const fullPath = buildFullPath(pathPrefix, file.rel_path);
    const added = existingPaths.includes(fullPath);
    return (
      <div className="flex items-center gap-1.5 flex-wrap text-xs">
        <span className="w-16 flex-shrink-0 text-[11px] font-medium text-gray-500 dark:text-gray-400">
          {label}
        </span>
        <button
          type="button"
          onClick={() => open(file.rel_path)}
          title={`Open ${file.file_name}`}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-gray-600 dark:text-gray-300 hover:bg-amber-100/60 dark:hover:bg-amber-900/30 transition-colors"
        >
          <FileText className="h-3 w-3" />
          Open
        </button>
        {answer && (
          <button
            type="button"
            onClick={() => open(answer.rel_path)}
            title={`Open ${answer.file_name}`}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-gray-600 dark:text-gray-300 hover:bg-amber-100/60 dark:hover:bg-amber-900/30 transition-colors"
          >
            <FileCheck className="h-3 w-3" />
            Ans
          </button>
        )}
        <span className="flex-1" />
        {added ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400 pr-1">
            <Check className="h-3 w-3" />
            Added
          </span>
        ) : (
          <button
            type="button"
            onClick={() =>
              onAdd(fullPath, answer ? buildFullPath(pathPrefix, answer.rel_path) : undefined)
            }
            title={`Add as a ${exerciseType === "CW" ? "classwork" : "homework"} row (answers pre-linked)`}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 hover:bg-amber-100/60 dark:hover:bg-amber-900/30 transition-colors"
          >
            <Plus className="h-2.5 w-2.5" />
            Add
          </button>
        )}
      </div>
    );
  };

  const typed = rowDefaults(defaults, exerciseType);
  const summary = (
    <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
      {lessonChapter
        ? `L${lessonChapter.lessonNumber} · SM${lessonChapter.code} ${lessonChapter.topicZh ?? ""}`
        : `L${session.lesson_number}`}
    </span>
  );

  return (
    <SummerSectionShell
      summary={summary}
      driveDisconnected={connected === false}
      onConnectDrive={connect}
    >
      <ChapterSelect chapter={chapter} chapters={chapters} onChange={setChapterCode} />
      {chapter && (
        <>
          {renderRow(exerciseType === "CW" ? "Classwork" : "Homework", typed.file, typed.answer)}
          {renderRow("Extra", defaults.extra, defaults.extraAnswer)}
          {!lang && (
            <p className="text-[10px] text-amber-700 dark:text-amber-400">
              Set the student&apos;s language stream to see their version.
            </p>
          )}
        </>
      )}
    </SummerSectionShell>
  );
}

/**
 * Multi-student summer helper for BulkExerciseModal. Appears only when
 * every selected session is the same grade's summer lesson; one click
 * assigns each student their own language version directly (the normal
 * bulk rows can't diverge per student).
 */
export function SummerBulkAssignSection({
  sessions,
  exerciseType,
}: {
  sessions: Session[];
  exerciseType: "CW" | "HW";
}) {
  const { showToast } = useToast();

  const grade = sessions[0]?.grade;
  const eligible =
    sessions.length > 0 &&
    sessions.every((s) => s.lesson_number != null && s.grade === grade);

  const year = eligible ? sessionSummerYear(sessions[0]) : null;
  const { index, chapters } = useSummerCoursewareIndex(year, eligible ? grade : null);

  // Default to the most common lesson number among the selection.
  const commonLesson = useMemo(() => {
    const counts = new Map<number, number>();
    for (const s of sessions) {
      if (s.lesson_number != null) {
        counts.set(s.lesson_number, (counts.get(s.lesson_number) ?? 0) + 1);
      }
    }
    let best: number | null = null;
    let bestCount = 0;
    for (const [lesson, count] of counts) {
      if (count > bestCount) { best = lesson; bestCount = count; }
    }
    return best;
  }, [sessions]);

  const [chapterCode, setChapterCode] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<SummerDocType | null>(null);
  const [done, setDone] = useState<Set<SummerDocType>>(new Set());

  if (!eligible || !index || chapters.length === 0) return null;

  const lessonChapter = chapters.find((c) => c.lessonNumber === commonLesson);
  const chapter: Chapter | undefined =
    (chapterCode ? chapters.find((c) => c.code === chapterCode) : undefined) ?? lessonChapter;
  const pathPrefix = index.scan?.path_prefix;

  const langCounts = sessions.reduce(
    (acc, s) => {
      const lang = normalizeLangStream(s.lang_stream);
      if (lang) acc[lang]++;
      else acc.none++;
      return acc;
    },
    { c: 0, e: 0, none: 0 }
  );

  const handleAssign = async (docType: SummerDocType) => {
    if (!chapter) return;
    setAssigning(docType);
    try {
      const plan = buildAssignmentPlan(sessions, docType, chapter, pathPrefix);
      const result = await executeAssignmentPlan(plan, exerciseType, pathPrefix);
      showToast(
        describeAssignmentResult(plan, result, exerciseType),
        result.failed > 0 ? "error" : "success"
      );
      if (result.failed === 0) setDone((prev) => new Set(prev).add(docType));
    } finally {
      setAssigning(null);
    }
  };

  const renderRow = (label: string, docType: SummerDocType) => {
    if (!chapter) return null;
    const hasAny =
      !!rowDefaults(pickDefaults(chapter.files, "c"), docType).file ||
      !!rowDefaults(pickDefaults(chapter.files, "e"), docType).file;
    if (!hasAny) return null;
    const isDone = done.has(docType);
    return (
      <div className="flex items-center gap-1.5 flex-wrap text-xs">
        <span className="w-16 flex-shrink-0 text-[11px] font-medium text-gray-500 dark:text-gray-400">
          {label}
        </span>
        <span className="flex-1" />
        {isDone ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400 pr-1">
            <Check className="h-3 w-3" />
            Assigned
          </span>
        ) : (
          <button
            type="button"
            onClick={() => handleAssign(docType)}
            disabled={assigning !== null}
            title={`Each student gets their own language version as ${exerciseType === "CW" ? "classwork" : "homework"}, answers linked`}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 hover:bg-amber-100/60 dark:hover:bg-amber-900/30 transition-colors disabled:opacity-50"
          >
            {assigning === docType ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <Plus className="h-2.5 w-2.5" />
            )}
            Assign to {sessions.length} student{sessions.length !== 1 ? "s" : ""}
          </button>
        )}
      </div>
    );
  };

  const summary = (
    <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
      {grade}
      {lessonChapter ? ` · L${lessonChapter.lessonNumber} SM${lessonChapter.code}` : ""}
      {" · "}
      {[
        langCounts.c > 0 ? `${langCounts.c} C` : null,
        langCounts.e > 0 ? `${langCounts.e} E` : null,
        langCounts.none > 0 ? `${langCounts.none} no stream` : null,
      ].filter(Boolean).join(" / ")}
    </span>
  );

  return (
    <SummerSectionShell summary={summary}>
      <p className="text-[10px] text-gray-400 dark:text-gray-500">
        Assigns straight away: each student gets their own language version with answers linked.
      </p>
      <ChapterSelect chapter={chapter} chapters={chapters} onChange={setChapterCode} />
      {chapter && (
        <>
          {renderRow(exerciseType === "CW" ? "Classwork" : "Homework", exerciseType)}
          {renderRow("Extra", "Extra")}
        </>
      )}
    </SummerSectionShell>
  );
}
