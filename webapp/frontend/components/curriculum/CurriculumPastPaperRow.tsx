"use client";

import { useState } from "react";
import { Check, Copy, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import { conceptNameForStream, stripExtension } from "@/lib/curriculum-labels";
import type { CurriculumPastPaper } from "@/types";

export type CurriculumPreviewTarget = {
  file_path: string;
  file_basename: string;
  /** Answer-key variant filed beside the paper, when one was recognised. */
  answer_path?: string | null;
};

/**
 * One archived tailor-made paper: name, provenance (school, year, week —
 * filenames carry no trustworthy date, the folder position does), topics.
 */
export function CurriculumPastPaperRow({
  paper,
  stream,
  onPreview,
}: {
  paper: CurriculumPastPaper;
  stream: string | null;
  onPreview: (target: CurriculumPreviewTarget) => void;
}) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

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

  return (
    <div className="rounded px-1 py-0.5 group hover:bg-teal-50/60 dark:hover:bg-teal-900/10">
      <div className="flex items-center gap-1.5">
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
          <span className="text-[9px] px-1 py-px rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 shrink-0">
            {paper.exam_kind}
          </span>
        )}
        <button
          type="button"
          onClick={() => onPreview(paper)}
          title="Preview this paper"
          className="p-0.5 rounded shrink-0 text-gray-400 hover:text-teal-600 hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors"
        >
          <Eye className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={copyPath}
          title="Copy the file path to paste into an exercise"
          className={cn(
            "p-0.5 rounded shrink-0 transition-colors",
            copied
              ? "text-teal-600"
              : "text-gray-400 hover:text-teal-600 hover:bg-teal-100 dark:hover:bg-teal-900/30"
          )}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
      <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
        {paper.academic_year} · week {paper.week_number}
        {topics &&
          ` · ${paper.scope_source === "proxy" ? "Likely covers" : "Covers"}: ${topics}`}
      </p>
    </div>
  );
}
