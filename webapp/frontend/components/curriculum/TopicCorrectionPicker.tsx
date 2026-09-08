"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, MessageSquarePlus, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import { useCurriculumConcepts } from "@/lib/hooks";
import { ApiError, curriculumAPI } from "@/lib/api";
import { iconHitArea, useCoarsePointer } from "@/hooks/useCoarsePointer";
import { conceptNameForStream, matchesConcept } from "@/lib/curriculum-labels";
import { KindQuestion, RECORDED_TEXT } from "@/components/curriculum/ConfirmControls";
import type { CurriculumConceptVocab, Session } from "@/types";

/**
 * Naming the topic the school is really on, when none of the suggestions is.
 *
 * Disagreement is worth more to the timeline than agreement, so this is the
 * escape hatch that has to stay reachable everywhere the question is asked:
 * under the suggested list, from the one-line question on the collapsed
 * header, and on a school week so blank that there is nothing to suggest at
 * all. It owns its own state so all three get the same behaviour.
 *
 * During a test window a picked topic passes through the Revision or New Topic
 * question, because revision does not move the school's timeline and new
 * teaching does.
 */
type PickerState =
  | { status: "closed" }
  | { status: "picking" }
  | { status: "kind"; concept: CurriculumConceptVocab }
  | { status: "saving"; concept: CurriculumConceptVocab; isRevision: boolean }
  | {
      status: "confirmed";
      concept: CurriculumConceptVocab;
      observationId: number;
      isRevision: boolean;
    };

const MAX_MATCHES = 6;

export function TopicCorrectionPicker({
  session,
  suggestedIds,
  stream,
  inTestWindow,
  open,
  onOpenChange,
  triggerLabel,
  origin = "correction",
}: {
  session: Session;
  /** Topics already on screen with their own answer buttons: offering them
   *  here too would give one observation two competing Undo spots. */
  suggestedIds: number[];
  stream: string | null;
  inTestWindow: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerLabel: string;
  origin?: "correction" | "strip";
}) {
  const { showToast } = useToast();
  const hitArea = iconHitArea(useCoarsePointer());
  const [state, setState] = useState<PickerState>({ status: "closed" });
  const [query, setQuery] = useState("");

  // Only fetched once somebody opens the picker.
  const { data: vocab } = useCurriculumConcepts(open);
  const grade = session.grade || "";

  const matches = useMemo(() => {
    const needle = query.trim();
    if (!open || !needle || !vocab) return [];
    const suggested = new Set(suggestedIds);
    // Same-grade concepts first: schools drift, but rarely across two grades.
    return vocab
      .filter((c) => !suggested.has(c.id) && matchesConcept(c, needle))
      .sort((a, b) => Number(b.grade === grade) - Number(a.grade === grade))
      .slice(0, MAX_MATCHES);
  }, [open, query, vocab, grade, suggestedIds]);

  // Opened from outside, which is what the "No, it's..." answer on the
  // collapsed header does. The picker starts on its topic list either way.
  useEffect(() => {
    if (open && state.status === "closed") setState({ status: "picking" });
  }, [open, state.status]);

  const close = () => {
    setState({ status: "closed" });
    setQuery("");
    onOpenChange(false);
  };

  const save = async (concept: CurriculumConceptVocab, isRevision: boolean) => {
    setState({ status: "saving", concept, isRevision });
    try {
      const result = await curriculumAPI.confirmTopic({
        student_id: session.student_id,
        concept_id: concept.id,
        session_date: session.session_date,
        is_revision: isRevision,
        session_id: session.id,
        origin,
      });
      setState({
        status: "confirmed",
        concept,
        observationId: result.id,
        isRevision,
      });
      setQuery("");
    } catch {
      // Back to where the choice was being made: the kind chooser during a
      // test window, the topic list otherwise.
      setState(inTestWindow ? { status: "kind", concept } : { status: "picking" });
      showToast("Could not save the topic. Please try again.", "error");
    }
  };

  const undo = async () => {
    if (state.status !== "confirmed") return;
    const previous = state;
    setState({
      status: "saving",
      concept: previous.concept,
      isRevision: previous.isRevision,
    });
    try {
      await curriculumAPI.undoConfirm(previous.observationId);
      close();
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        close();
        return;
      }
      setState(previous);
      showToast("Could not undo the confirmation. Please try again.", "error");
    }
  };

  if (!open && state.status === "closed") {
    return (
      <button
        type="button"
        onClick={() => {
          onOpenChange(true);
          setState({ status: "picking" });
        }}
        className="inline-flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 hover:text-teal-700 dark:hover:text-teal-400 transition-colors"
      >
        <MessageSquarePlus className="h-3 w-3" />
        {triggerLabel}
      </button>
    );
  }

  if (state.status === "closed") return null;

  if (state.status === "picking") {
    return (
      <div>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Factorization, 因式分解 or 803"
            className="flex-1 min-w-0 text-[11px] px-2 py-1 rounded border border-teal-200 dark:border-teal-800 bg-white dark:bg-[#1a1a1a] text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
          <button
            type="button"
            aria-label="Close topic picker"
            onClick={close}
            className={cn(
              hitArea,
              "rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            )}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        {matches.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {matches.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() =>
                  inTestWindow
                    ? setState({ status: "kind", concept: c })
                    : save(c, false)
                }
                className="w-full flex items-center gap-1.5 text-left rounded px-1.5 py-1 hover:bg-teal-50 dark:hover:bg-teal-900/20"
              >
                <span className="text-[11px] text-gray-700 dark:text-gray-300 truncate flex-1">
                  {conceptNameForStream(c, stream)}
                </span>
                {c.grade && (
                  <span className="text-[9px] px-1 py-px rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 shrink-0">
                    {c.grade}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {query.trim() && matches.length === 0 && (
          <p className="mt-1 text-[10px] text-gray-400">
            No matching topic. Try another name or a chapter code.
          </p>
        )}
      </div>
    );
  }

  if (state.status === "kind" || (state.status === "saving" && inTestWindow)) {
    // Same question as on a suggestion row, so the picker and the rows teach
    // one habit. The X goes back to the topic list.
    return (
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] text-gray-700 dark:text-gray-300 truncate">
          {conceptNameForStream(state.concept, stream)}
        </span>
        <KindQuestion
          saving={
            state.status === "saving"
              ? state.isRevision
                ? "revision"
                : "new"
              : null
          }
          onPick={(isRevision) => save(state.concept, isRevision)}
          onDismiss={() => setState({ status: "picking" })}
          dismissLabel="Back to the topic list"
          hitArea={hitArea}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-gray-700 dark:text-gray-300 truncate">
        {conceptNameForStream(state.concept, stream)}
      </span>
      {state.status === "saving" ? (
        <Loader2 className="h-3 w-3 animate-spin text-gray-400 shrink-0" />
      ) : (
        <span className={RECORDED_TEXT}>
          <Check className="h-3 w-3" />
          {state.isRevision ? "Noted as revision, thanks!" : "Noted, thanks!"}
          <button
            type="button"
            onClick={undo}
            className="inline-flex items-center gap-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-1"
          >
            <Undo2 className="h-3 w-3" />
            Undo
          </button>
        </span>
      )}
    </div>
  );
}
