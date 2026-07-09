"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, FileText, Loader2, X } from "lucide-react";
import { useCurriculumConcepts, useCurriculumSearch } from "@/lib/hooks";
import {
  conceptNameForStream,
  evidenceSummary,
  stripExtension,
} from "@/lib/curriculum-labels";
import type { CurriculumFile } from "@/types";
import { CurriculumFileRow } from "./CurriculumFileRow";
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // With a preview stacked on top, Escape closes only the preview
      // (its own handler does that); this panel stays put.
      if (e.key === "Escape" && !preview) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, preview]);

  if (typeof document === "undefined") return null;

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

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9990] flex items-center justify-center p-3 sm:p-6 bg-black/50"
        onClick={onClose}
      >
        <div
          className="bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg shadow-xl w-full max-w-lg max-h-[75vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#d4a574]/40 dark:border-[#8b6f47]/60 bg-gradient-to-r from-teal-50 to-[#fef9f3] dark:from-teal-900/20 dark:to-[#2d2618]">
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
            <button
              type="button"
              aria-label="Close worksheet list"
              onClick={onClose}
              className="ml-auto p-1 rounded text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="px-4 py-1.5 text-[10px] text-gray-400 dark:text-gray-500 border-b border-[#d4a574]/20 dark:border-[#8b6f47]/30">
            {scope
              ? `Showing the whole library for this topic, most relevant to ${scope.school} ${scope.grade} first.`
              : "Showing the whole library for this topic."}
          </p>

          {(buildsOn.length > 0 || leadsTo.length > 0) && (
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
          )}

          <div className="flex-1 min-h-0 overflow-y-auto">
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
                    {(concept.file_count || 0) > concept.files.length &&
                      (showAll ? (
                        <p className="text-[10px] text-gray-400 mt-1.5">
                          Showing the first {concept.files.length} of{" "}
                          {concept.file_count} files.
                        </p>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowAll(true)}
                          className="mt-1.5 text-[10px] text-teal-700 dark:text-teal-400 hover:underline"
                        >
                          Show {(concept.file_count || 0) - concept.files.length} more
                        </button>
                      ))}
                  </div>
                )
            )}
          </div>
        </div>
      </div>

      {preview && (
        <CurriculumPdfPreview
          filePath={preview.file_path}
          fileLabel={stripExtension(preview.file_basename)}
          onClose={() => setPreview(null)}
        />
      )}
    </>,
    document.body
  );
}
