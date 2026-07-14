"use client";

import { useState } from "react";
import { ClipboardList, Loader2 } from "lucide-react";
import { useCurriculumRevisionPack } from "@/lib/hooks";
import { conceptNameForStream, stripExtension } from "@/lib/curriculum-labels";
import type { CurriculumFile } from "@/types";
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

/**
 * One test's revision pack: every topic parsed from the test's scope with
 * revision-ordered worksheets, and any scope lines that stayed unmatched so
 * the tutor knows the pack may be incomplete.
 */
export function CurriculumRevisionPack({ eventId, onClose }: CurriculumRevisionPackProps) {
  const [preview, setPreview] = useState<CurriculumFile | null>(null);
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
