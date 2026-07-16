"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { iconHitArea, useCoarsePointer } from "@/hooks/useCoarsePointer";
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
  /** When set (the exercise modal case), every row and the preview offer
   *  "add to the session". */
  onAdd?: (path: string) => void;
  onClose: () => void;
}

const FILES_SHOWN = 30;

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
  onAdd,
  onClose,
}: CurriculumTopicFilesProps) {
  const hitArea = iconHitArea(useCoarsePointer());
  const [preview, setPreview] = useState<CurriculumFile | null>(null);
  // Files shown per concept, keyed by concept id; absent = default chunk.
  const [fileCounts, setFileCounts] = useState<Record<number, number>>({});
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
    setFileCounts({});
  };
  const goBack = () => {
    const prev = trail[trail.length - 1];
    if (!prev) return;
    setTrail((t) => t.slice(0, -1));
    setCurrent(prev);
    setFileCounts({});
  };

  const anyExpanded = Object.values(fileCounts).some((n) => n > FILES_SHOWN);
  const { data, isLoading, error } = useCurriculumSearch(
    {
      concept_id: current.conceptId,
      // Lift the cap once any section expands, then slice client-side.
      limit: anyExpanded ? 200 : FILES_SHOWN,
      ...(scope
        ? {
            school: scope.school,
            grade: scope.grade,
            lang_stream: scope.lang_stream || undefined,
          }
        : {}),
    },
    // Keep the capped list on screen while the lifted-cap fetch loads.
    { keepPreviousData: true }
  );

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
                className={cn(
                  hitArea,
                  "rounded text-gray-500 hover:text-teal-600 dark:hover:text-teal-400 shrink-0"
                )}
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
        {error && !data && (
          <p className="px-4 py-5 text-xs text-gray-500 dark:text-gray-400">
            The file list could not load. Refresh the page to try again.
          </p>
        )}
        {/* Gate on `data`: after a failed fetch it is undefined, and "no
            files yet" would be a false claim that the material doesn't
            exist. */}
        {!isLoading && !error && data && totalFiles === 0 && (
          <p className="px-4 py-5 text-xs text-gray-500 dark:text-gray-400">
            No files mapped to this topic yet.
          </p>
        )}
        {concepts.map((concept) => {
          if (concept.files.length === 0) return null;
          const count = fileCounts[concept.concept_id] ?? FILES_SHOWN;
          const files = concept.files.slice(0, count);
          return (
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
                {files.map((file) => (
                  <CurriculumFileRow
                    key={file.file_path}
                    file={file}
                    onPreview={setPreview}
                    onAdd={onAdd ? () => onAdd(file.file_path) : undefined}
                    scopeSchool={scope?.school}
                  />
                ))}
              </div>
              <CurriculumShowMoreFiles
                shown={files.length}
                total={concept.file_count || 0}
                chunk={FILES_SHOWN}
                expanded={count > FILES_SHOWN}
                loading={isLoading && count > concept.files.length}
                onShowMore={() =>
                  setFileCounts((c) => ({
                    ...c,
                    [concept.concept_id]: count + FILES_SHOWN,
                  }))
                }
                onShowFewer={() =>
                  setFileCounts((c) => {
                    const next = { ...c };
                    delete next[concept.concept_id];
                    return next;
                  })
                }
              />
            </div>
          );
        })}
      </CurriculumModalShell>

      {preview && (
        <CurriculumPdfPreview
          filePath={preview.file_path}
          fileLabel={stripExtension(preview.file_basename)}
          onAdd={onAdd ? () => onAdd(preview.file_path) : undefined}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
