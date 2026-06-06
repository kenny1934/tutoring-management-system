"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Sun, FileCheck, Plus, Loader2, Cable, Columns2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import {
  pickDefaults,
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
import { StudentPickerPopover } from "./StudentPickerPopover";
import type { Session, SummerCoursewareFile } from "@/types";

const langChipClass =
  "px-1.5 py-0.5 rounded text-[11px] font-medium text-[#6b5a42] dark:text-[#c4a882] hover:bg-[#e8d4b8]/50 dark:hover:bg-[#3a3228] transition-colors";

/** Open chips for one language: worksheet + answers (C before E). */
function LangChips({
  lang,
  file,
  answer,
  onOpen,
}: {
  lang: "C" | "E";
  file?: SummerCoursewareFile;
  answer?: SummerCoursewareFile;
  onOpen: (relPath: string) => void;
}) {
  if (!file) return null;
  return (
    <span className="inline-flex items-center">
      <button onClick={() => onOpen(file.rel_path)} title={`Open ${file.file_name}`} className={langChipClass}>
        {lang}
      </button>
      {answer && (
        <button
          onClick={() => onOpen(answer.rel_path)}
          title={`Open ${lang} answers: ${answer.file_name}`}
          className={cn(langChipClass, "px-1")}
        >
          <FileCheck className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

function rowDefaults(defaults: ChapterDefaults, docType: SummerDocType) {
  switch (docType) {
    case "CW": return { file: defaults.cw, answer: defaults.cwAnswer };
    case "HW": return { file: defaults.hw, answer: defaults.hwAnswer };
    case "Extra": return { file: defaults.extra, answer: defaults.extraAnswer };
  }
}

interface PickerTarget {
  docType: SummerDocType;
  type: "CW" | "HW";
}

/** Panel body for one grade's sessions (hooks need a fixed grade). */
function WideGradeSection({
  grade,
  sessions,
  showGrade,
  selectedLocation,
  isReadOnly,
}: {
  grade: string;
  sessions: Session[];
  showGrade: boolean;
  selectedLocation: string;
  isReadOnly?: boolean;
}) {
  const { showToast } = useToast();
  const year = sessionSummerYear(sessions[0]);
  const { index, chapters } = useSummerCoursewareIndex(year, grade);
  const { connected: driveConnected, connect: handleConnect, open: handleOpen } = useCoursewareDrive(year);

  // Default to the most common lesson number in this slot.
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
  const lessonChapter = chapters.find((c) => c.lessonNumber === commonLesson);
  const chapter: Chapter | undefined =
    (chapterCode ? chapters.find((c) => c.code === chapterCode) : undefined) ?? lessonChapter;

  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [assigning, setAssigning] = useState(false);

  if (!index || chapters.length === 0) return null;

  const pathPrefix = index.scan?.path_prefix;
  const cDefaults = chapter ? pickDefaults(chapter.files, "c") : {};
  const eDefaults = chapter ? pickDefaults(chapter.files, "e") : {};
  // Parallel files are language-independent; either pick resolves them.
  const parallel = cDefaults;

  const handleAssign = async (target: PickerTarget, sessionIds: number[]) => {
    if (!chapter) return;
    setPicker(null);
    setAssigning(true);
    try {
      const chosen = sessions.filter((s) => sessionIds.includes(s.id));
      const plan = buildAssignmentPlan(chosen, target.docType, chapter, pathPrefix);
      const result = await executeAssignmentPlan(plan, target.type, pathPrefix);
      showToast(
        describeAssignmentResult(plan, result, target.type),
        result.failed > 0 ? "error" : "success"
      );
    } finally {
      setAssigning(false);
    }
  };

  const assignButton = (docType: SummerDocType, type: "CW" | "HW", label: string) => (
    <button
      key={`${docType}-${type}`}
      onClick={() => setPicker(picker?.docType === docType && picker?.type === type ? null : { docType, type })}
      disabled={assigning}
      title={`Add each student's own language version to their ${type === "CW" ? "classwork" : "homework"}`}
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-[#8b6040] dark:text-[#c4a882] border border-[#d4c4a8] dark:border-[#5a4d3a] hover:bg-[#e8d4b8]/40 dark:hover:bg-[#3a3228] transition-colors disabled:opacity-50"
    >
      {assigning ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Plus className="h-2.5 w-2.5" />}
      {label}
    </button>
  );

  const materialRow = (label: string, docType: SummerDocType, actions: ReactNode) => {
    const c = rowDefaults(cDefaults, docType);
    const e = rowDefaults(eDefaults, docType);
    if (!c.file && !e.file) return null;
    return (
      <div className="flex items-center gap-1 flex-wrap min-h-[28px]">
        <span className="w-16 flex-shrink-0 text-[11px] font-medium text-[#8b7355] dark:text-[#a09080]">
          {label}
        </span>
        <LangChips lang="C" file={c.file} answer={c.answer} onOpen={handleOpen} />
        <LangChips lang="E" file={e.file} answer={e.answer} onOpen={handleOpen} />
        <span className="flex-1" />
        {!isReadOnly && actions}
      </div>
    );
  };

  // Preselect students who would actually receive the file (skip those
  // who already have it), so the picker reflects the real outcome.
  const pickerPreselected =
    picker && chapter
      ? buildAssignmentPlan(sessions, picker.docType, chapter, pathPrefix)
      : null;
  const preselectedIds = pickerPreselected
    ? [
        ...pickerPreselected.items.map((i) => i.session.id),
        // Keep no-lang/no-file students ticked so skips surface in the toast
        // instead of silently dropping them from the action.
        ...pickerPreselected.noLang.map((s) => s.id),
        ...pickerPreselected.noFile.map((s) => s.id),
      ]
    : undefined;

  return (
    <div className="mx-1 mb-2 rounded-lg border border-[#e8d4b8] dark:border-[#5a4d3a] bg-[#fdf6ec]/60 dark:bg-[#2a2318]/60 px-2.5 py-2">
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <Sun className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-xs font-semibold text-[#8b7355] dark:text-[#a09080] uppercase tracking-wider">
          Summer Materials{showGrade ? ` · ${grade}` : ""}
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
        <div className="relative mt-1.5 flex flex-col gap-0.5">
          {chapter.lessonNumber !== commonLesson && (
            <p className="text-[10px] text-amber-700 dark:text-amber-400">
              Viewing a different chapter than this slot&apos;s L{commonLesson}.
            </p>
          )}

          {materialRow("Classwork", "CW", assignButton("CW", "CW", "Assign…"))}
          {materialRow("Homework", "HW", assignButton("HW", "HW", "Assign…"))}
          {materialRow("Extra", "Extra", (
            <>
              {assignButton("Extra", "CW", "CW")}
              {assignButton("Extra", "HW", "HW")}
            </>
          ))}

          {/* Parallel versions: both languages merged, for mixed classes. */}
          {(parallel.parallelCw || parallel.parallelHw || parallel.parallelExtra) && (
            <div className="flex items-center gap-1.5 min-h-[28px]">
              <span
                className="w-16 flex-shrink-0 text-[11px] font-medium text-[#8b7355] dark:text-[#a09080] inline-flex items-center gap-1"
                title="Both languages merged side by side, for mixed classes"
              >
                <Columns2 className="h-3 w-3" />
                Parallel
              </span>
              {parallel.parallelCw && (
                <button onClick={() => handleOpen(parallel.parallelCw!.rel_path)} className={cn(langChipClass, "text-sky-700 dark:text-sky-400")}>
                  CW
                </button>
              )}
              {parallel.parallelHw && (
                <button onClick={() => handleOpen(parallel.parallelHw!.rel_path)} className={cn(langChipClass, "text-sky-700 dark:text-sky-400")}>
                  HW
                </button>
              )}
              {parallel.parallelExtra && (
                <button onClick={() => handleOpen(parallel.parallelExtra!.rel_path)} className={cn(langChipClass, "text-sky-700 dark:text-sky-400")}>
                  Extra
                </button>
              )}
            </div>
          )}

          {picker && (
            <StudentPickerPopover
              key={`${picker.docType}-${picker.type}`}
              students={sessions}
              selectedLocation={selectedLocation}
              initialSelectedIds={preselectedIds}
              onAssign={(ids) => handleAssign(picker, ids)}
              onClose={() => setPicker(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Class-level summer materials for Lesson Wide Mode. Unlike the bulk
 * exercise modal (one identical file for everyone), assignment here is
 * language-aware: each picked student gets their own C/E version with
 * answers auto-linked.
 */
export function SummerCoursewareWidePanel({
  sessions,
  selectedLocation,
  isReadOnly,
}: {
  sessions: Session[];
  selectedLocation: string;
  isReadOnly?: boolean;
}) {
  const summerSessions = useMemo(
    () => sessions.filter((s) => s.lesson_number != null && s.grade),
    [sessions]
  );
  const grades = useMemo(
    () => Array.from(new Set(summerSessions.map((s) => s.grade!))).sort(),
    [summerSessions]
  );
  if (summerSessions.length === 0) return null;

  return (
    <>
      {grades.map((grade) => (
        <WideGradeSection
          key={grade}
          grade={grade}
          sessions={summerSessions.filter((s) => s.grade === grade)}
          showGrade={grades.length > 1}
          selectedLocation={selectedLocation}
          isReadOnly={isReadOnly}
        />
      ))}
    </>
  );
}
