"use client";

import { useState } from "react";
import { ClipboardList, History, Loader2 } from "lucide-react";
import { useCurriculumRevisionPack } from "@/lib/hooks";
import { conceptNameForStream, stripExtension } from "@/lib/curriculum-labels";
import { CurriculumFileRow } from "./CurriculumFileRow";
import {
  CurriculumModalShell,
  CurriculumShowMoreFiles,
} from "./CurriculumModalShell";
import {
  CurriculumPastPaperRow,
  type CurriculumPreviewTarget,
} from "./CurriculumPastPaperRow";
import { CurriculumPdfPreview } from "./CurriculumPdfPreview";

interface CurriculumRevisionPackProps {
  eventId: number;
  /** When set (the exercise modal case), every row and the preview offer
   *  "add to the session"; papers pass their answer file along too. */
  onAdd?: (path: string, answerPath?: string) => void;
  onClose: () => void;
}

const PAPERS_SHOWN = 8;
// Mirrors the server's default files-per-topic cap, so the first chunk is
// exactly what the initial fetch already returned.
const FILES_SHOWN = 8;

/**
 * One test's revision pack: every topic parsed from the test's scope with
 * revision-ordered worksheets, and any scope lines that stayed unmatched so
 * the tutor knows the pack may be incomplete.
 */
export function CurriculumRevisionPack({ eventId, onAdd, onClose }: CurriculumRevisionPackProps) {
  const [preview, setPreview] = useState<CurriculumPreviewTarget | null>(null);
  // Files shown per topic, keyed by concept id; absent = default chunk.
  const [fileCounts, setFileCounts] = useState<Record<number, number>>({});
  const [paperCount, setPaperCount] = useState(PAPERS_SHOWN);

  const anyExpanded = Object.values(fileCounts).some((n) => n > FILES_SHOWN);
  const { data, isLoading, error } = useCurriculumRevisionPack(
    eventId,
    // The pack is the "everything for this test" view — lift the cap once
    // any topic expands, then slice per topic client-side.
    anyExpanded ? 200 : undefined
  );

  const event = data?.event;
  const stream = data?.lang_stream || null;
  const papers = data?.past_papers || [];
  const shownPapers = papers.slice(0, paperCount);
  const papersForThis = shownPapers.filter((p) => p.for_this_event);
  const papersSimilar = shownPapers.filter((p) => !p.for_this_event);
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
        {papers.length > 0 && (
          <div className="mx-4 mt-3 mb-1 px-3 py-2.5 rounded-lg bg-teal-50/50 dark:bg-teal-900/15 border border-teal-200/60 dark:border-teal-800/40">
            <div className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
              <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                Tailored revision papers
              </span>
            </div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">
              Papers tutors made for this test or for earlier similar tests.
            </p>
            {papersForThis.length > 0 && (
              <>
                <p className="text-[10px] font-medium text-teal-700 dark:text-teal-300 mt-1.5 mb-0.5">
                  Made for this test
                </p>
                <div className="space-y-0.5">
                  {papersForThis.map((paper) => (
                    <CurriculumPastPaperRow
                      key={paper.id}
                      paper={paper}
                      stream={stream}
                      onPreview={setPreview}
                      onAdd={
                        onAdd
                          ? () => onAdd(paper.file_path, paper.answer_path ?? undefined)
                          : undefined
                      }
                    />
                  ))}
                </div>
                {papersSimilar.length > 0 && (
                  <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mt-1.5 mb-0.5">
                    From similar tests
                  </p>
                )}
              </>
            )}
            <div className="space-y-0.5">
              {papersSimilar.map((paper) => (
                <CurriculumPastPaperRow
                  key={paper.id}
                  paper={paper}
                  stream={stream}
                  onPreview={setPreview}
                  onAdd={
                    onAdd
                      ? () => onAdd(paper.file_path, paper.answer_path ?? undefined)
                      : undefined
                  }
                />
              ))}
            </div>
            <CurriculumShowMoreFiles
              shown={shownPapers.length}
              total={papers.length}
              chunk={PAPERS_SHOWN}
              expanded={paperCount > PAPERS_SHOWN}
              onShowMore={() => setPaperCount((n) => n + PAPERS_SHOWN)}
              onShowFewer={() => setPaperCount(PAPERS_SHOWN)}
            />
          </div>
        )}

        {error && !data && (
          <p className="px-4 py-5 text-xs text-gray-500 dark:text-gray-400">
            The revision pack could not load. Refresh the page to try again.
          </p>
        )}
        {!isLoading && data && data.concepts.length === 0 && (
          <p className="px-4 py-5 text-xs text-gray-500 dark:text-gray-400">
            No topics recognised for this test.
          </p>
        )}
        {(data?.concepts || []).map((concept) => {
          const count = fileCounts[concept.concept_id] ?? FILES_SHOWN;
          const files = concept.files.slice(0, count);
          return (
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
                {files.map((file) => (
                  <CurriculumFileRow
                    key={file.file_path}
                    file={file}
                    onPreview={setPreview}
                    onAdd={onAdd ? () => onAdd(file.file_path) : undefined}
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
                shown={files.length}
                total={concept.file_count}
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
          onAdd={
            onAdd
              ? () => onAdd(preview.file_path, preview.answer_path ?? undefined)
              : undefined
          }
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
