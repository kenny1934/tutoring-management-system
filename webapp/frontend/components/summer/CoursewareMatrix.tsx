"use client";

import { useMemo } from "react";
import { FileText, FileCheck } from "lucide-react";
import { Popover } from "@/components/ui/popover";
import { groupChapters, type Chapter } from "@/lib/summer-courseware-defaults";
import { formatShortDate } from "@/lib/formatters";
import type {
  SummerCoursewareFile,
  SummerCoursewareIndexResponse,
} from "@/types";

const INDEXED_GRADES = ["F1", "F2", "F3"];

const DOC_TYPE_LABELS: Record<"CW" | "HW" | "Extra", string> = {
  CW: "Classwork",
  HW: "Homework",
  Extra: "Extra",
};

type ChipVariant = "c" | "e" | "parallel";

/** One file row inside the chip popover (worksheet or answers). */
function ChipFileRow({
  file,
  label,
  icon,
  onOpenFile,
}: {
  file: SummerCoursewareFile;
  label: string;
  icon: React.ReactNode;
  onOpenFile: (file: SummerCoursewareFile) => void;
}) {
  return (
    <button
      onClick={() => onOpenFile(file)}
      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {file.file_mtime && (
        <span className="text-xs text-muted-foreground">
          {formatShortDate(file.file_mtime)}
        </span>
      )}
    </button>
  );
}

/**
 * Presence chip for one variant (Chinese, English, or parallel merged) of a
 * document type. Present chips open a worksheet/answers popover.
 */
function Chip({
  chapter,
  docType,
  variant,
  onOpenFile,
}: {
  chapter: Chapter;
  docType: "CW" | "HW" | "Extra";
  variant: ChipVariant;
  onOpenFile: (file: SummerCoursewareFile) => void;
}) {
  const isParallel = variant === "parallel";
  const matches = (f: SummerCoursewareFile) =>
    f.doc_type === docType &&
    (isParallel ? f.is_parallel : !f.is_parallel && f.lang === variant);
  const question = chapter.files.find((f) => matches(f) && !f.is_answer);
  const answer = chapter.files.find((f) => matches(f) && f.is_answer);

  const label = isParallel ? docType : variant === "e" ? "E" : "C";
  const variantName = isParallel ? "Parallel" : variant === "e" ? "English" : "Chinese";
  const sizing = isParallel ? "h-6 px-1.5" : "w-6 h-6";

  if (!question) {
    // Extra material legitimately exists in one language only, so an absent
    // chip is informational rather than an error.
    return (
      <span
        title={`No ${variantName} ${DOC_TYPE_LABELS[docType]} ${isParallel ? "version" : "file"}`}
        className={`inline-flex items-center justify-center ${sizing} rounded text-xs font-medium border border-dashed border-gray-300 dark:border-gray-600 text-gray-300 dark:text-gray-600`}
      >
        {label}
      </span>
    );
  }

  const colour = isParallel
    ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 hover:ring-sky-300"
    : answer
      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:ring-green-300"
      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:ring-amber-300";

  return (
    <Popover
      closeOnContentClick
      className="p-0 w-64 overflow-hidden"
      trigger={
        <button
          type="button"
          title={`${variantName} ${DOC_TYPE_LABELS[docType]}. Click for worksheet and answers.`}
          className={`inline-flex items-center justify-center ${sizing} rounded text-xs font-semibold cursor-pointer transition-shadow hover:ring-2 hover:ring-offset-1 dark:hover:ring-offset-gray-900 ${colour}`}
        >
          {label}
        </button>
      }
      content={
        <>
          <div className="px-3 py-2 border-b border-gray-200/60 dark:border-gray-700/60 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              SM{chapter.code} {chapter.topicZh}
            </span>
            {" · "}
            {DOC_TYPE_LABELS[docType]}
            {" · "}
            {isParallel ? "Parallel" : variant === "e" ? "English" : "中文"}
          </div>
          <ChipFileRow
            file={question}
            label="Worksheet"
            icon={<FileText className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />}
            onOpenFile={onOpenFile}
          />
          {answer ? (
            <ChipFileRow
              file={answer}
              label="Answers"
              icon={<FileCheck className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />}
              onOpenFile={onOpenFile}
            />
          ) : (
            <div className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <FileCheck className="h-4 w-4 shrink-0 opacity-40" />
              <span>Answers not on the drive</span>
            </div>
          )}
        </>
      }
    />
  );
}

/**
 * Per-grade chapter tables with C/E/Parallel chips that open worksheets and
 * answers from the mapped drive. Shared by the admin health view and the
 * tutor-facing summer browser on the courseware page.
 */
export function CoursewareMatrix({
  index,
  totalLessons,
  onOpenFile,
}: {
  index: SummerCoursewareIndexResponse;
  /** Course length for the extra-chapter badge; null skips the badge. */
  totalLessons: number | null;
  onOpenFile: (file: SummerCoursewareFile) => void;
}) {
  const chaptersByGrade = useMemo(
    () => groupChapters(index.files ?? []),
    [index.files]
  );
  // Derive grade sections from the data (with F1-F3 as the empty-state
  // floor) so grades added to the backend scope later show up unchanged.
  const grades = useMemo(
    () => Array.from(new Set([...INDEXED_GRADES, ...chaptersByGrade.keys()])).sort(),
    [chaptersByGrade]
  );

  return (
    <>
      {grades.map((grade) => {
        const chapters = chaptersByGrade.get(grade) ?? [];
        return (
          <div key={grade} className="rounded-lg border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
              <span className="font-semibold text-foreground">{grade}</span>
              <span className="text-xs text-muted-foreground">
                {chapters.length} chapter{chapters.length !== 1 ? "s" : ""}
              </span>
            </div>
            {chapters.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">
                No chapters found for {grade} in the last scan.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b border-gray-100 dark:border-gray-800">
                      <th className="text-left font-medium px-4 py-2">Lesson</th>
                      <th className="text-left font-medium px-2 py-2">Chapter</th>
                      <th className="text-left font-medium px-2 py-2">Classwork</th>
                      <th className="text-left font-medium px-2 py-2">Homework</th>
                      <th className="text-left font-medium px-2 py-2">Extra</th>
                      <th className="text-left font-medium px-2 py-2">Parallel</th>
                      <th className="text-left font-medium px-4 py-2">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chapters.map((ch) => {
                      const isExtraChapter =
                        ch.lessonNumber !== null &&
                        totalLessons !== null &&
                        ch.lessonNumber > totalLessons;
                      return (
                        <tr key={ch.code} className="border-b border-gray-50 dark:border-gray-800/50 last:border-0">
                          <td className="px-4 py-2 whitespace-nowrap">
                            {ch.lessonNumber === null ? (
                              <span className="text-muted-foreground">-</span>
                            ) : isExtraChapter ? (
                              <span
                                title="Beyond the scheduled lessons. Available for tutors to assign, never a default."
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                              >
                                Extra chapter
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                L{ch.lessonNumber}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2 min-w-[14rem]">
                            <div className="font-medium text-foreground whitespace-nowrap">
                              SM{ch.code} {ch.topicZh}
                            </div>
                            {ch.topicEn && (
                              <div className="text-xs text-muted-foreground whitespace-nowrap">
                                {ch.topicEn}
                              </div>
                            )}
                          </td>
                          {(["CW", "HW", "Extra"] as const).map((dt) => (
                            <td key={dt} className="px-2 py-2 whitespace-nowrap">
                              <div className="flex gap-1">
                                <Chip chapter={ch} docType={dt} variant="c" onOpenFile={onOpenFile} />
                                <Chip chapter={ch} docType={dt} variant="e" onOpenFile={onOpenFile} />
                              </div>
                            </td>
                          ))}
                          <td className="px-2 py-2 whitespace-nowrap">
                            <div className="flex gap-1">
                              <Chip chapter={ch} docType="CW" variant="parallel" onOpenFile={onOpenFile} />
                              <Chip chapter={ch} docType="HW" variant="parallel" onOpenFile={onOpenFile} />
                              <Chip chapter={ch} docType="Extra" variant="parallel" onOpenFile={onOpenFile} />
                            </div>
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground">
                            {ch.latestMtime ? formatShortDate(ch.latestMtime) : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {/* Legend */}
      <p className="text-xs text-muted-foreground">
        C / E = Chinese / English version. Green = worksheet and answers present,
        amber = answers missing, dashed = not on the drive.
        Parallel versions merge both languages side by side for mixed classes.
        Click any chip to open its worksheet or answers from the mapped drive.
      </p>
    </>
  );
}
