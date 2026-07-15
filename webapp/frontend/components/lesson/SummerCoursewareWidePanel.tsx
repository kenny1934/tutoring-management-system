"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConnectDriveButton } from "@/components/summer/ConnectDriveButton";
import { ChapterSelect } from "@/components/summer/ChapterSelect";
import { useToast } from "@/contexts/ToastContext";
import { useConfirm } from "@/contexts/ConfirmContext";
import {
  pickDefaults,
  pickDocDefaults,
  resolveParallelPreview,
  type ParallelPreviewSource,
} from "@/lib/summer-courseware-defaults";
import {
  sessionSummerYear,
  useSummerCoursewareIndex,
  useCoursewareDrive,
  useChapterSelection,
  buildSelectionPlan,
  confirmPerLessonAssign,
  planActionableSessionIds,
  formatLessonBreakdown,
  executeAssignmentPlan,
  describeAssignmentResult,
  previewExercise,
  type SummerDocType,
} from "@/lib/summer-courseware-session";
import { coursewareGrade } from "@/lib/grade-utils";
import { StudentPickerPopover } from "./StudentPickerPopover";
import { summerAssignButtonClass, SummerAssignIcon, ParallelChipsRow } from "./SummerCoursewarePanel";
import type { Session } from "@/types";
import type { StudentExerciseEntry } from "./LessonWideMode";

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
  onPreviewEntry,
}: {
  grade: string;
  sessions: Session[];
  showGrade: boolean;
  selectedLocation: string;
  isReadOnly?: boolean;
  onPreviewEntry: (entry: StudentExerciseEntry) => void;
}) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const year = sessionSummerYear(sessions[0]);
  // Sessions are grouped by stored grade, but materials are indexed by the
  // entering grade (F1/F2/F3) — promote the pre-grade for lookup and display.
  const cwGrade = coursewareGrade(grade, year);
  const { index, chapters } = useSummerCoursewareIndex(year, cwGrade);
  // The connected drive feeds the PDF pane's loader (the share isn't in
  // Paperless and the Settings folder alias may not exist on this machine).
  const { connected: driveConnected, connect: handleConnect } = useCoursewareDrive(year);

  // In follow mode (mixed slot, no explicit pick) `chapter` is the majority
  // lesson's chapter, used only for the material-row previews; assignment
  // resolves per student.
  const { breakdown, isMixed, commonLesson, followMode, chapter, setChapterCode } =
    useChapterSelection(sessions, chapters);

  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [assigning, setAssigning] = useState(false);

  if (!index || chapters.length === 0) return null;

  const pathPrefix = index.scan?.path_prefix;
  const cDefaults = chapter ? pickDefaults(chapter.files, "c") : {};
  const eDefaults = chapter ? pickDefaults(chapter.files, "e") : {};
  // Composed live from the C + E versions where both exist, falling back
  // to a pre-made parallel file (a manual merge can lag behind an edit).
  const parallelCw = resolveParallelPreview(cDefaults, eDefaults, "CW", pathPrefix);
  const parallelHw = resolveParallelPreview(cDefaults, eDefaults, "HW", pathPrefix);
  const parallelExtra = resolveParallelPreview(cDefaults, eDefaults, "Extra", pathPrefix);

  const handleAssign = async (target: PickerTarget, sessionIds: number[]) => {
    setPicker(null);
    const chosen = sessions.filter((s) => sessionIds.includes(s.id));
    const plan = buildSelectionPlan(chosen, target.docType, { followMode, chapter, chapters }, pathPrefix);
    if (!plan) return;
    // Only a genuinely mixed pick needs a confirm; a uniform pick (even in
    // a mixed slot) assigns straight away like before.
    if (followMode && !(await confirmPerLessonAssign(confirm, plan))) return;
    setAssigning(true);
    try {
      const result = await executeAssignmentPlan(plan, target.type, pathPrefix);
      showToast(
        describeAssignmentResult(plan, result, target.type),
        result.failed > 0 ? "error" : "success"
      );
    } finally {
      setAssigning(false);
    }
  };

  const isPickerFor = (t: PickerTarget) =>
    picker?.docType === t.docType && picker?.type === t.type;

  const assignButton = (docType: SummerDocType, type: "CW" | "HW", label: string) => {
    const target: PickerTarget = { docType, type };
    const typeLabel = type === "CW" ? "classwork" : "homework";
    return (
      <button
        key={`${docType}-${type}`}
        onClick={() => setPicker(isPickerFor(target) ? null : target)}
        disabled={assigning}
        title={
          followMode
            ? `Assign each student their own lesson and language version as ${typeLabel}`
            : `Assign each student their own language version as ${typeLabel}`
        }
        className={summerAssignButtonClass(type)}
      >
        <SummerAssignIcon type={type} busy={assigning} />
        {label}
      </button>
    );
  };

  // No open/answer buttons here: assigned files show in the lesson PDF
  // pane, and the answer key is a keystroke away ("a") since assignment
  // links answer_pdf_name. Only languages present in the index resolve.
  const materialRow = (label: string, docType: SummerDocType, actions: ReactNode) => {
    const c = pickDocDefaults(cDefaults, docType);
    const e = pickDocDefaults(eDefaults, docType);
    if (!c.file && !e.file) return null;
    return (
      <div
        className="flex items-center gap-1 min-h-[28px]"
        title={[c.file?.file_name, e.file?.file_name].filter(Boolean).join("\n")}
      >
        <span className="w-16 flex-shrink-0 text-[11px] font-medium text-[#8b7355] dark:text-[#a09080]">
          {label}
        </span>
        <span className="flex-1" />
        {!isReadOnly && actions}
      </div>
    );
  };

  // Show a parallel version in the PDF pane via an ephemeral entry (never
  // assigned); "a" toggles its answer key like any exercise.
  const handlePreview = (label: string, source: ParallelPreviewSource) => {
    const session = sessions[0];
    onPreviewEntry({
      session,
      exercise: previewExercise(session.id, source),
      studentName: `Parallel ${label}`,
      studentId: null,
      grade,
      langStream: null,
    });
  };

  // Preselect students who would actually receive the file (skip those
  // who already have it), so the picker reflects the real outcome.
  const pickerPreselected = picker
    ? buildSelectionPlan(sessions, picker.docType, { followMode, chapter, chapters }, pathPrefix)
    : null;
  const preselectedIds = pickerPreselected
    ? planActionableSessionIds(pickerPreselected)
    : undefined;

  const lessonNote = (() => {
    if (followMode) {
      return {
        warn: false,
        text: `Mixed lessons in this slot: ${formatLessonBreakdown(breakdown)}. Each student gets their own lesson's materials.`,
      };
    }
    if (isMixed) {
      return {
        warn: true,
        text: `Assigns this chapter to all picked students (${formatLessonBreakdown(breakdown)}).`,
      };
    }
    if (chapter && chapter.lessonNumber !== commonLesson) {
      return { warn: true, text: `Viewing a different chapter than this slot's L${commonLesson}.` };
    }
    return null;
  })();

  return (
    <div className="mx-1 mb-2 rounded-lg border border-[#e8d4b8] dark:border-[#5a4d3a] bg-[#fdf6ec]/60 dark:bg-[#2a2318]/60 px-2.5 py-2">
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <Sun className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-xs font-semibold text-[#8b7355] dark:text-[#a09080] uppercase tracking-wider">
          Summer Materials{showGrade ? ` · ${cwGrade}` : ""}
        </span>
        <span className="flex-1" />
        {driveConnected === false && (
          <ConnectDriveButton
            onClick={handleConnect}
            title="Pick the courseware Finalised folder once on this computer so files load straight from the drive"
          />
        )}
      </div>

      {/* Chapter picker */}
      <ChapterSelect
        chapter={chapter}
        chapters={chapters}
        onChange={setChapterCode}
        followMode={followMode}
        showFollowOption={isMixed}
        variant="amber"
        className="mt-1.5"
      />

      {chapter && (
        <div className="relative mt-1.5 flex flex-col gap-0.5">
          {lessonNote && (
            <p
              className={cn(
                "text-[10px]",
                lessonNote.warn
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-[#8b7355] dark:text-[#a09080]"
              )}
            >
              {lessonNote.text}
            </p>
          )}

          {materialRow("Classwork", "CW", assignButton("CW", "CW", "Assign"))}
          {materialRow("Homework", "HW", assignButton("HW", "HW", "Assign"))}
          {materialRow("Extra", "Extra", (
            <>
              {assignButton("Extra", "CW", "CW")}
              {assignButton("Extra", "HW", "HW")}
            </>
          ))}

          <ParallelChipsRow
            cw={parallelCw}
            hw={parallelHw}
            extra={parallelExtra}
            onPreview={handlePreview}
          />

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
  onPreviewEntry,
}: {
  sessions: Session[];
  selectedLocation: string;
  isReadOnly?: boolean;
  /** Show a material in the lesson PDF pane (parallel versions). */
  onPreviewEntry: (entry: StudentExerciseEntry) => void;
}) {
  // Partition once so each section's `sessions` prop is referentially
  // stable across renders (the sections memoise on it).
  const sessionsByGrade = useMemo(() => {
    const byGrade = new Map<string, Session[]>();
    for (const s of sessions) {
      if (s.lesson_number == null || !s.grade) continue;
      const group = byGrade.get(s.grade) ?? [];
      group.push(s);
      byGrade.set(s.grade, group);
    }
    return byGrade;
  }, [sessions]);
  const grades = useMemo(
    () => Array.from(sessionsByGrade.keys()).sort(),
    [sessionsByGrade]
  );
  if (grades.length === 0) return null;

  return (
    <>
      {grades.map((grade) => (
        <WideGradeSection
          key={grade}
          grade={grade}
          sessions={sessionsByGrade.get(grade)!}
          showGrade={grades.length > 1}
          selectedLocation={selectedLocation}
          isReadOnly={isReadOnly}
          onPreviewEntry={onPreviewEntry}
        />
      ))}
    </>
  );
}
