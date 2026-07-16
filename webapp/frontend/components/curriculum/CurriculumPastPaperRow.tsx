"use client";

import { useState } from "react";
import { Check, Copy, Eye, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import { conceptNameForStream, stripExtension } from "@/lib/curriculum-labels";
import { getTypeColors } from "@/lib/exam-type-colors";
import { iconHitArea, useCoarsePointer } from "@/hooks/useCoarsePointer";
import type { CurriculumPastPaper } from "@/types";

export type CurriculumPreviewTarget = {
  file_path: string;
  file_basename: string;
  /** Answer-key variant filed beside the paper, when one was recognised. */
  answer_path?: string | null;
};

/** "(around March 2025)" for a folder week: school years run from September,
 *  so week 1 starts around 1 Sep of the year opening the academic year. */
function approxMonthText(academicYear: string, week: number): string {
  const startYear = parseInt(academicYear.split("-")[0], 10);
  if (!Number.isFinite(startYear)) return "";
  const mid = new Date(startYear, 8, 1 + (week - 1) * 7 + 3);
  return ` (around ${mid.toLocaleDateString("en-GB", { month: "long", year: "numeric" })})`;
}

/**
 * One archived tailor-made paper: name, provenance (school, year, week —
 * filenames carry no trustworthy date, the folder position does), topics.
 */
export function CurriculumPastPaperRow({
  paper,
  stream,
  onPreview,
  onAdd,
}: {
  paper: CurriculumPastPaper;
  stream: string | null;
  onPreview: (target: CurriculumPreviewTarget) => void;
  /** When set (the exercise modal case), the row leads with an add button
   *  like the worksheet rows beside it. */
  onAdd?: () => void;
}) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const hitArea = iconHitArea(useCoarsePointer());

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(paper.file_path);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("Could not copy the path.", "error");
    }
  };

  const topics = paper.matched_concepts
    .map((c) => conceptNameForStream(c, stream))
    .join(" · ");
  // variant_paths holds the files filed beside the shown one (other
  // versions, answer keys); versions counts the paper's files minus any
  // recognised answer key.
  const versionCount =
    1 + paper.variant_paths.filter((v) => v !== paper.answer_path).length;
  // Only a test's own recorded scope earns the plain "Covers"; topics read
  // from the filename or borrowed from a similar test stay hedged.
  const fromOwnScope =
    paper.scope_source === "event" || paper.scope_source === "manual";

  return (
    <div className="rounded px-1 py-0.5 group hover:bg-teal-50/60 dark:hover:bg-teal-900/10">
      <div className="flex items-center gap-1.5">
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            title={
              paper.answer_path
                ? "Add to the session with its answer file"
                : "Add to the session"
            }
            className={cn(
              hitArea,
              "rounded text-teal-600 hover:bg-teal-100 dark:hover:bg-teal-900/30 shrink-0"
            )}
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
        <span
          className="text-[11px] text-gray-700 dark:text-gray-300 truncate flex-1"
          title={paper.file_path}
        >
          {stripExtension(paper.file_basename)}
        </span>
        {paper.for_this_event ? (
          <span
            className="text-[9px] px-1 py-px rounded shrink-0 bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 font-medium"
            title="Made for this exact test"
          >
            This test
          </span>
        ) : (
          paper.school && (
            <span
              className={cn(
                "text-[9px] px-1 py-px rounded shrink-0",
                paper.same_school
                  ? "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 font-medium"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
              )}
              title={
                paper.same_school
                  ? "Made for this school's own test"
                  : `Made for a ${paper.school} test`
              }
            >
              {paper.school}
            </span>
          )
        )}
        {paper.exam_kind && (
          <span
            className={cn(
              "text-[9px] px-1 py-px rounded shrink-0",
              // Canonical kind colours from the exam revisions page (Test
              // red, Exam purple, Quiz green; Mock falls to the muted
              // default, as that page has no Mock type).
              getTypeColors(paper.exam_kind).bg,
              getTypeColors(paper.exam_kind).text
            )}
          >
            {paper.exam_kind}
          </span>
        )}
        {versionCount > 1 && (
          <span
            className="text-[9px] px-1 py-px rounded shrink-0 text-gray-500 dark:text-gray-400 bg-black/[0.04] dark:bg-white/[0.06]"
            title={`Filed in ${versionCount} versions. The preview and add use this one.`}
          >
            {versionCount} versions
          </span>
        )}
        {paper.answer_path && (
          <span
            className="text-[9px] px-1 py-px rounded shrink-0 bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400"
            title="An answer file is filed with this paper."
          >
            Answers
          </span>
        )}
        <button
          type="button"
          onClick={() => onPreview(paper)}
          title="Preview this paper"
          className={cn(
            hitArea,
            "rounded shrink-0 text-gray-400 hover:text-teal-600 hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors"
          )}
        >
          <Eye className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={copyPath}
          title="Copy the file path to paste into an exercise"
          className={cn(
            hitArea,
            "rounded shrink-0 transition-colors",
            copied
              ? "text-teal-600"
              : "text-gray-400 hover:text-teal-600 hover:bg-teal-100 dark:hover:bg-teal-900/30"
          )}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
      <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
        <span
          title={`Week ${paper.week_number} of the ${paper.academic_year} school year${approxMonthText(paper.academic_year, paper.week_number)}.`}
        >
          {paper.academic_year} · week {paper.week_number}
        </span>
        {topics && (
          <span
            title={
              fromOwnScope
                ? "Topics from this test's recorded scope."
                : "Topics estimated from the paper's filename or a similar test."
            }
          >
            {` · ${fromOwnScope ? "Covers" : "Likely covers"}: ${topics}`}
          </span>
        )}
      </p>
    </div>
  );
}
