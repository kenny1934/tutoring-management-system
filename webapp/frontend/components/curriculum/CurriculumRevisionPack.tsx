"use client";

import { useState } from "react";
import { Check, ClipboardList, Copy, Eye, History, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import { useCurriculumRevisionPack } from "@/lib/hooks";
import { conceptNameForStream, stripExtension } from "@/lib/curriculum-labels";
import type { CurriculumPastPaper } from "@/types";
import { CurriculumFileRow } from "./CurriculumFileRow";
import {
  CurriculumModalShell,
  CurriculumShowMoreFiles,
} from "./CurriculumModalShell";
import { CurriculumPdfPreview } from "./CurriculumPdfPreview";

interface CurriculumRevisionPackProps {
  eventId: number;
  onClose: () => void;
}

type PreviewTarget = { file_path: string; file_basename: string };

const ANSWERS_RE = /(_ans|answer|答案)/i;

/** One archived paper: name, provenance (school, year, week), topics. */
function PastPaperRow({
  paper,
  stream,
  onPreview,
}: {
  paper: CurriculumPastPaper;
  stream: string | null;
  onPreview: (target: PreviewTarget) => void;
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

  const answers = paper.variant_paths.find(
    (p) => ANSWERS_RE.test(p) && /\.pdf$/i.test(p)
  );
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
        {paper.school && (
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
        )}
        {paper.exam_kind && (
          <span className="text-[9px] px-1 py-px rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 shrink-0">
            {paper.exam_kind}
          </span>
        )}
        {answers && (
          <button
            type="button"
            onClick={() =>
              onPreview({
                file_path: answers,
                file_basename: answers.split("\\").pop() || "Answers",
              })
            }
            title="Preview the answer key"
            className="text-[9px] px-1 py-px rounded shrink-0 text-gray-400 hover:text-teal-600 hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors"
          >
            Answers
          </button>
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

/**
 * One test's revision pack: every topic parsed from the test's scope with
 * revision-ordered worksheets, and any scope lines that stayed unmatched so
 * the tutor knows the pack may be incomplete.
 */
export function CurriculumRevisionPack({ eventId, onClose }: CurriculumRevisionPackProps) {
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading } = useCurriculumRevisionPack(
    eventId,
    // The pack is the "everything for this test" view — lift the cap on demand.
    showAll ? 200 : undefined
  );

  const event = data?.event;
  const stream = data?.lang_stream || null;
  const dateLabel = event?.start_date
    ? new Date(event.start_date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <>
      <CurriculumModalShell
        ariaLabel={event ? `Revision pack for ${event.title}` : "Revision pack"}
        closeLabel="Close revision pack"
        previewOpen={preview != null}
        onClose={onClose}
        header={
          <>
            <ClipboardList className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
              {event ? `${event.title}${dateLabel ? ` · ${dateLabel}` : ""}` : "Revision pack"}
            </span>
            {isLoading && (
              <Loader2 className="h-3 w-3 animate-spin text-gray-400 shrink-0" />
            )}
          </>
        }
        subtitle="Worksheets for each topic covered by this test."
      >
        {!isLoading && data && data.concepts.length === 0 && (
          <p className="px-4 py-5 text-xs text-gray-500 dark:text-gray-400">
            No topics recognised for this test.
          </p>
        )}
        {(data?.concepts || []).map((concept) => (
          <div
            key={concept.concept_id}
            className="px-4 py-2.5 border-b border-[#d4a574]/20 dark:border-[#8b6f47]/30 last:border-b-0"
          >
            <div className="text-xs font-medium text-gray-800 dark:text-gray-200">
              {conceptNameForStream(concept, stream)}
            </div>
            {concept.scope_lines.length > 0 && (
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">
                From the test scope: &ldquo;{concept.scope_lines.slice(0, 2).join(" · ")}&rdquo;
              </p>
            )}
            <div className="space-y-0.5">
              {concept.files.map((file) => (
                <CurriculumFileRow
                  key={file.file_path}
                  file={file}
                  onPreview={setPreview}
                  scopeSchool={event?.school}
                />
              ))}
            </div>
            {concept.files.length === 0 && (
              <p className="text-[10px] text-gray-400 mt-0.5">
                No worksheets mapped to this topic yet.
              </p>
            )}
            <CurriculumShowMoreFiles
              shown={concept.files.length}
              total={concept.file_count}
              showAll={showAll}
              onShowAll={() => setShowAll(true)}
            />
          </div>
        ))}

        {data && data.past_papers?.length > 0 && (
          <div className="px-4 py-2.5 border-t border-[#d4a574]/20 dark:border-[#8b6f47]/30">
            <div className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
              <span className="text-xs font-medium text-gray-800 dark:text-gray-200">
                Tailored papers from past tests
              </span>
            </div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">
              Papers tutors made for earlier tests on similar topics.
            </p>
            <div className="space-y-0.5">
              {data.past_papers.map((paper) => (
                <PastPaperRow
                  key={paper.id}
                  paper={paper}
                  stream={stream}
                  onPreview={setPreview}
                />
              ))}
            </div>
          </div>
        )}

        {data && data.unmatched_lines.length > 0 && (
          <div className="mx-4 my-3 px-3 py-2 rounded-lg bg-black/[0.04] dark:bg-white/[0.05]">
            <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">
              Not yet matched to a topic
            </p>
            {data.unmatched_lines.map((line) => (
              <p key={line} className="text-[10px] text-gray-400 dark:text-gray-500">
                {line}
              </p>
            ))}
          </div>
        )}
      </CurriculumModalShell>

      {preview && (
        <CurriculumPdfPreview
          filePath={preview.file_path}
          fileLabel={stripExtension(preview.file_basename)}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
