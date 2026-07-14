"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";
import { useCurriculumConcepts, useCurriculumSearch } from "@/lib/hooks";
import {
  conceptNameForStream,
  evidenceSummary,
  stripExtension,
} from "@/lib/curriculum-labels";
import type { CurriculumFile } from "@/types";
import { CurriculumFileRow } from "./CurriculumFileRow";
import {
  CurriculumModalShell,
  CurriculumShowMoreFiles,
} from "./CurriculumModalShell";
import { CurriculumPdfPreview } from "./CurriculumPdfPreview";

interface Scope {
  school: string;
  grade: string;
  lang_stream?: string | null;
}

interface CurriculumTopicFilesProps {
  conceptId: number;
  conceptName: string;
  scope: Scope | null;
  onClose: () => void;
}

/**
 * The worksheets behind a topic on the charts: every file mapped to the
 * concept, with the same preview/copy actions as the search results. The
 * related-topics strip swaps the concept in place (with a back arrow) so a
 * tutor can walk the prerequisite chain without leaving the modal.
 */
export function CurriculumTopicFiles({
  conceptId,
  conceptName,
  scope,
  onClose,
}: CurriculumTopicFilesProps) {
  const [preview, setPreview] = useState<CurriculumFile | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [current, setCurrent] = useState({ conceptId, name: conceptName });
  const [trail, setTrail] = useState<{ conceptId: number; name: string }[]>([]);

  const { data: vocab } = useCurriculumConcepts();
  const vocabById = useMemo(
    () => new Map((vocab || []).map((c) => [c.id, c])),
    [vocab]
  );
  const currentVocab = vocabById.get(current.conceptId);
  const relatedChips = (ids: number[] | undefined) =>
    (ids || [])
      .map((id) => vocabById.get(id))
      .filter(Boolean)
      .map((c) => ({
        conceptId: c!.id,
        name: conceptNameForStream(c!, scope?.lang_stream),
      }));
  const buildsOn = relatedChips(currentVocab?.builds_on_ids);
  const leadsTo = relatedChips(currentVocab?.leads_to_ids);

  const goTo = (target: { conceptId: number; name: string }) => {
    setTrail((prev) => [...prev, current]);
    setCurrent(target);
    setShowAll(false);
  };
  const goBack = () => {
    const prev = trail[trail.length - 1];
    if (!prev) return;
    setTrail((t) => t.slice(0, -1));
    setCurrent(prev);
    setShowAll(false);
  };

  const { data, isLoading } = useCurriculumSearch({
    concept_id: current.conceptId,
    // The chart modal is the "everything we have" view — lift the default cap.
    limit: showAll ? 200 : 30,
    ...(scope
      ? {
          school: scope.school,
          grade: scope.grade,
          lang_stream: scope.lang_stream || undefined,
        }
      : {}),
  });

  const concepts = data?.concepts || [];
  const totalFiles = concepts.reduce((n, c) => n + c.files.length, 0);

  const chip = (t: { conceptId: number; name: string }) => (
    <button
      key={t.conceptId}
      type="button"
      onClick={() => goTo(t)}
      className="text-[10px] px-1.5 py-0.5 rounded-full border border-teal-600/40 dark:border-teal-400/40 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors truncate max-w-[11rem]"
      title={t.name}
    >
      {t.name}
    </button>
  );

  return (
    <>
      <CurriculumModalShell
        ariaLabel={`Worksheets for ${current.name}`}
        closeLabel="Close worksheet list"
        previewOpen={preview != null}
        onClose={onClose}
        header={
          <>
            {trail.length > 0 && (
              <button
                type="button"
                aria-label="Back to the previous topic"
                onClick={goBack}
                className="p-0.5 rounded text-gray-500 hover:text-teal-600 dark:hover:text-teal-400 shrink-0"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
            )}
            <FileText className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
              {current.name}
            </span>
            {isLoading && (
              <Loader2 className="h-3 w-3 animate-spin text-gray-400 shrink-0" />
            )}
          </>
        }
        subtitle={
          scope
            ? `Showing the whole library for this topic, most relevant to ${scope.school} ${scope.grade} first.`
            : "Showing the whole library for this topic."
        }
        beforeBody={
          (buildsOn.length > 0 || leadsTo.length > 0) && (
            <div className="px-4 py-1.5 border-b border-[#d4a574]/20 dark:border-[#8b6f47]/30 flex flex-col gap-1">
              {buildsOn.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-gray-400 shrink-0">
                    Builds on
                  </span>
                  {buildsOn.map(chip)}
                </div>
              )}
              {leadsTo.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-gray-400 shrink-0">
                    Leads to
                  </span>
                  {leadsTo.map(chip)}
                </div>
              )}
            </div>
          )
        }
      >
        {!isLoading && totalFiles === 0 && (
          <p className="px-4 py-5 text-xs text-gray-500 dark:text-gray-400">
            No files mapped to this topic yet.
          </p>
        )}
        {concepts.map(
          (concept) =>
            concept.files.length > 0 && (
              <div
                key={concept.concept_id}
                className="px-4 py-2.5 border-b border-[#d4a574]/20 dark:border-[#8b6f47]/30 last:border-b-0"
              >
                {concept.evidence && concept.evidence.weeks_observed.length > 0 && (
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">
                    {evidenceSummary(
                      concept.evidence.weeks_observed,
                      concept.evidence.sources
                    )}
                  </p>
                )}
                <div className="space-y-0.5">
                  {concept.files.map((file) => (
                    <CurriculumFileRow
                      key={file.file_path}
                      file={file}
                      onPreview={setPreview}
                      scopeSchool={scope?.school}
                    />
                  ))}
                </div>
                <CurriculumShowMoreFiles
                  shown={concept.files.length}
                  total={concept.file_count || 0}
                  showAll={showAll}
                  onShowAll={() => setShowAll(true)}
                />
              </div>
            )
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
