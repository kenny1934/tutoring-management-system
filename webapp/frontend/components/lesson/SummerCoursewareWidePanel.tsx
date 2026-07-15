"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Sun } from "lucide-react";
import { ConnectDriveButton } from "@/components/summer/ConnectDriveButton";
import { useToast } from "@/contexts/ToastContext";
import { useConfirm } from "@/contexts/ConfirmContext";
import {
  pickDefaults,
  pickDocDefaults,
  resolveParallelPreview,
  type Chapter,
  type ParallelPreviewSource,
} from "@/lib/summer-courseware-defaults";
import {
  sessionSummerYear,
  useSummerCoursewareIndex,
  useCoursewareDrive,
  buildAssignmentPlan,
  buildPerLessonAssignmentPlan,
  lessonBreakdown,
  mostCommonLessonNumber,
  formatLessonBreakdown,
  describeAssignmentGroups,
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

/** Select value for the mixed-slot default: resolve per student's lesson. */
const FOLLOW_OWN_LESSON = "__follow_own_lesson__";

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

  const breakdown = useMemo(() => lessonBreakdown(sessions), [sessions]);
  const commonLesson = mostCommonLessonNumber(breakdown);
  const isMixed = breakdown.length > 1;

  const [chapterCode, setChapterCode] = useState<string | null>(null);
  // Mixed slots default to assigning each student their own lesson's
  // materials; picking a chapter from the select is the explicit
  // same-chapter-for-everyone override. Uniform slots behave as before.
  const followMode = isMixed && chapterCode === null;
  const lessonChapter = chapters.find((c) => c.lessonNumber === commonLesson);
  // In follow mode this is the majority lesson's chapter, used only for the
  // material-row previews; assignment resolves per student.
  const chapter: Chapter | undefined =
    (chapterCode ? chapters.find((c) => c.code === chapterCode) : undefined) ?? lessonChapter;

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
    if (!followMode && !chapter) return;
    setPicker(null);
    const chosen = sessions.filter((s) => sessionIds.includes(s.id));
    const plan = followMode
      ? buildPerLessonAssignmentPlan(chosen, target.docType, chapters, pathPrefix)
      : buildAssignmentPlan(chosen, target.docType, chapter!, pathPrefix);
    // Only a genuinely mixed pick needs a confirm; a uniform pick (even in
    // a mixed slot) assigns straight away like before.
    if (followMode && new Set(chosen.map((s) => s.lesson_number)).size > 1) {
      const ok = await confirm({
        title: "Assign by each student's lesson?",
        message:
          "Students in this class are on different lessons. Each student will get the materials for their own lesson.",
        consequences: describeAssignmentGroups(plan),
        confirmText: "Assign",
      });
      if (!ok) return;
    }
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
    ? followMode
      ? buildPerLessonAssignmentPlan(sessions, picker.docType, chapters, pathPrefix)
      : chapter
        ? buildAssignmentPlan(sessions, picker.docType, chapter, pathPrefix)
        : null
    : null;
  const preselectedIds = pickerPreselected
    ? [
        ...pickerPreselected.items.map((i) => i.session.id),
        // Keep skipped students ticked (except already-assigned) so skips
        // surface in the toast instead of silently dropping from the action.
        ...pickerPreselected.noLang.map((s) => s.id),
        ...pickerPreselected.noFile.map((s) => s.id),
        ...pickerPreselected.noLesson.map((s) => s.id),
        ...pickerPreselected.noChapter.map((s) => s.id),
      ]
    : undefined;

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
      <select
        value={followMode ? FOLLOW_OWN_LESSON : chapter?.code ?? ""}
        onChange={(e) =>
          setChapterCode(e.target.value === FOLLOW_OWN_LESSON ? null : e.target.value)
        }
        className="mt-1.5 w-full px-1.5 py-1 rounded border border-[#e8d4b8] dark:border-[#5a4d3a] bg-white/70 dark:bg-[#1a1a1a]/70 text-xs text-[#6b5a42] dark:text-[#c4a882] [&>option]:bg-white [&>option]:text-[#6b5a42] dark:[&>option]:bg-[#2a2318] dark:[&>option]:text-[#c4a882]"
      >
        {isMixed && <option value={FOLLOW_OWN_LESSON}>Each student&apos;s own lesson</option>}
        {!chapter && !followMode && <option value="">Choose chapter…</option>}
        {chapters.map((c) => (
          <option key={c.code} value={c.code}>
            {c.lessonNumber != null ? `L${c.lessonNumber} · ` : ""}SM{c.code} {c.topicZh}
          </option>
        ))}
      </select>

      {chapter && (
        <div className="relative mt-1.5 flex flex-col gap-0.5">
          {followMode ? (
            <p className="text-[10px] text-[#8b7355] dark:text-[#a09080]">
              Mixed lessons in this slot: {formatLessonBreakdown(breakdown)}. Each student
              gets their own lesson&apos;s materials.
            </p>
          ) : isMixed ? (
            <p className="text-[10px] text-amber-700 dark:text-amber-400">
              Assigns this chapter to all picked students ({formatLessonBreakdown(breakdown)}).
            </p>
          ) : (
            chapter.lessonNumber !== commonLesson && (
              <p className="text-[10px] text-amber-700 dark:text-amber-400">
                Viewing a different chapter than this slot&apos;s L{commonLesson}.
              </p>
            )
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
          onPreviewEntry={onPreviewEntry}
        />
      ))}
    </>
  );
}
