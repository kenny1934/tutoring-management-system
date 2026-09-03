"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  GraduationCap,
  ChevronDown,
  ChevronRight,
  Check,
  History,
  Loader2,
  CalendarClock,
  Undo2,
  MessageSquarePlus,
  X,
  RotateCcw,
  BookPlus,
} from "lucide-react";
import { CurriculumPdfPreview } from "@/components/curriculum/CurriculumPdfPreview";
import { CurriculumFileRow } from "@/components/curriculum/CurriculumFileRow";
import { CurriculumPastPaperRow } from "@/components/curriculum/CurriculumPastPaperRow";
import { CurriculumRevisionPack } from "@/components/curriculum/CurriculumRevisionPack";
import { CurriculumTopicFiles } from "@/components/curriculum/CurriculumTopicFiles";
import { cn } from "@/lib/utils";
import { getTypeColors } from "@/lib/exam-type-colors";
import { useToast } from "@/contexts/ToastContext";
import { useCurriculumConcepts, useCurriculumSuggestions } from "@/lib/hooks";
import { ApiError, curriculumAPI } from "@/lib/api";
import { iconHitArea, useCoarsePointer } from "@/hooks/useCoarsePointer";
import {
  SOURCE_LABELS,
  conceptNameForStream,
  curriculumExplorerHref,
  isCurriculumEligible,
  matchesConcept,
  priorAcademicYear,
  stripExtension,
  weeksSpanText,
} from "@/lib/curriculum-labels";
import type {
  Session,
  CurriculumConceptSuggestion,
  CurriculumConceptVocab,
  CurriculumFile,
} from "@/types";

function evidenceLine(
  c: CurriculumConceptSuggestion,
  examLabel: string | null
): string {
  const why = c.why;
  if (why.tier === "exam_scope") {
    const line = why.scope_lines?.[0];
    const label = examLabel || "On the test scope";
    return line ? `${label} · “${line}”` : label;
  }
  if (why.tier === "pacing") {
    // weeksSpanText already says "week N" / "weeks A to B" — no literal
    // "week" prefix here or the fallback reads "week weeks 9 to 14".
    const span =
      why.mean_week != null
        ? `week ${Math.round(why.mean_week)}`
        : weeksSpanText(why.weeks_observed || []);
    return span ? `Typically around ${span}` : "Typical pace for this school";
  }
  const sources = (why.sources || []).map((s) => SOURCE_LABELS[s] || s);
  const sourceText =
    sources.length > 1
      ? `${sources.slice(0, -1).join(", ")} and ${sources[sources.length - 1]}`
      : sources[0] || "past records";
  const prefix = why.tier === "last_year" ? "Last year, seen in" : "Seen in";
  return `${prefix} ${sourceText} · ${weeksSpanText(why.weeks_observed || [])}`;
}

// "asking" only happens near a test: the tap has been made but nothing is
// written until the tutor says whether the school is revising the topic or
// teaching it for the first time.
type ConfirmState =
  | { status: "idle" }
  | { status: "asking" }
  | { status: "saving"; isRevision: boolean }
  | { status: "confirmed"; observationId: number; isRevision: boolean };

// The correction picker: disagreement is worth more to the timeline than
// agreement, so when none of the suggestions is what the school is actually
// doing, the tutor can name the real topic instead of walking away. During a
// test window a picked topic passes through "kind" so the tutor says whether
// the school is revising it or newly teaching it.
type CorrectionState =
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

// Two kinds of small control live in this section, and they must never share
// a look. Anything that RECORDS something (the confirm button and the two
// answers below it) is a rounded rectangle with the green tint and leading
// icon that quick attend and the homework marks use, so it reads as "this
// writes a fact". Anything that OPENS something (the builds-on chips and the
// header links) stays a teal outline pill with a trailing arrow. An earlier
// version gave both the same teal outline, and tutors could not tell whether
// "Revising this" would open a list or record an answer.
const RECORD_BTN =
  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border transition-colors shrink-0 disabled:opacity-50 " +
  "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800 " +
  "hover:bg-green-200 dark:hover:bg-green-900/50";
const RECORDED_TEXT =
  "inline-flex items-center gap-1 text-[10px] text-green-700 dark:text-green-400 shrink-0";
const KIND_QUESTION = "Revision or New Topic?";
// The header gradient ends on the exercise modal's own panel colours. White
// or near-black endpoints leave a visible seam on the desk palette. Shared by
// the loaded header and the loading placeholder so the two look the same.
const SECTION_HEADER_BG =
  "bg-gradient-to-r from-teal-50 to-[#fef9f3] dark:from-teal-900/20 dark:to-[#2d2618]";
const REVISION_TITLE =
  "Record that the school is revising this topic for the test. Revision does not move the topic timeline.";
const NEW_TOPIC_TITLE =
  "Record that the school is teaching this as a new topic. New teaching builds the topic timeline.";

// The question a tap raises during a test window. Nothing has been written
// when this shows, so the X simply puts the confirm button back. `saving`
// names the answer in flight so its own button carries the spinner.
function KindQuestion({
  saving,
  onPick,
  onDismiss,
  dismissLabel,
  hitArea,
  className,
}: {
  saving: "revision" | "new" | null;
  onPick: (isRevision: boolean) => void;
  onDismiss: () => void;
  dismissLabel: string;
  hitArea: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={KIND_QUESTION}
      className={cn(
        "flex flex-wrap items-center justify-end gap-x-1.5 gap-y-1",
        className
      )}
    >
      <span className="text-[10px] text-gray-500 dark:text-gray-400">
        {KIND_QUESTION}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPick(true)}
          disabled={saving != null}
          title={REVISION_TITLE}
          className={RECORD_BTN}
        >
          {saving === "revision" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RotateCcw className="h-3 w-3" />
          )}
          Revision
        </button>
        <button
          type="button"
          onClick={() => onPick(false)}
          disabled={saving != null}
          title={NEW_TOPIC_TITLE}
          className={RECORD_BTN}
        >
          {saving === "new" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <BookPlus className="h-3 w-3" />
          )}
          New Topic
        </button>
        <button
          type="button"
          aria-label={dismissLabel}
          onClick={onDismiss}
          disabled={saving != null}
          className={cn(
            hitArea,
            "rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
          )}
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

interface CurriculumSuggestionSectionProps {
  session: Session;
  /** Archived papers carry a recognised answer key when one exists —
   *  adding one fills the exercise's answer file too. */
  onAdd: (path: string, answerPath?: string) => void;
}

export function CurriculumSuggestionSection({ session, onAdd }: CurriculumSuggestionSectionProps) {
  const { showToast } = useToast();
  const hitArea = iconHitArea(useCoarsePointer());
  const eligible = isCurriculumEligible(session);

  const { data, isLoading } = useCurriculumSuggestions(
    eligible ? session.student_id : null,
    session.session_date
  );

  // Collapsed by default (the modal is dense); the header still names the
  // top topic so the information is visible at a glance.
  const [expanded, setExpanded] = useState(false);
  const [confirmStates, setConfirmStates] = useState<Record<number, ConfirmState>>({});
  const [correction, setCorrection] = useState<CorrectionState>({ status: "closed" });
  const [correctionQuery, setCorrectionQuery] = useState("");
  const [preview, setPreview] = useState<{
    path: string;
    label: string;
    answerPath?: string | null;
  } | null>(null);

  // Worksheet browser for a prerequisite topic (opened from the builds-on
  // chips; portals above the exercise modal).
  const [topicFiles, setTopicFiles] = useState<{ conceptId: number; name: string } | null>(null);
  // The upcoming test's full revision pack (same portal layer).
  const [packOpen, setPackOpen] = useState(false);

  // Vocabulary for the correction picker and the builds-on chips; only
  // fetched once the section is opened.
  const { data: vocab } = useCurriculumConcepts(
    expanded || correction.status !== "closed"
  );
  const vocabById = useMemo(
    () => new Map((vocab || []).map((c) => [c.id, c])),
    [vocab]
  );
  const grade = session.grade || "";
  const correctionMatches = useMemo(() => {
    const needle = correctionQuery.trim();
    if (correction.status !== "picking" || !needle || !vocab) return [];
    // Suggested topics already have their own confirm buttons; offering them
    // here again would give one observation two competing Undo spots.
    const suggested = new Set((data?.suggestions || []).map((s) => s.concept_id));
    // Same-grade concepts first: schools drift, but rarely across two grades.
    return vocab
      .filter((c) => !suggested.has(c.id) && matchesConcept(c, needle))
      .sort((a, b) => Number(b.grade === grade) - Number(a.grade === grade))
      .slice(0, 6);
  }, [correction.status, correctionQuery, vocab, grade, data]);

  if (!eligible) {
    // F1-F3 tutors see this section daily; on an F4-F6 session its silent
    // absence read as a bug, so name the coverage once instead.
    const isSummer =
      session.summer_slot_id != null || session.lesson_number != null;
    if (
      !isSummer &&
      ["F4", "F5", "F6"].includes(session.grade || "") &&
      session.school &&
      session.student_id
    ) {
      return (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 px-1">
          School Progress suggestions cover F1 to F3 for now.
        </p>
      );
    }
    return null;
  }

  // The section's slot is on screen from the first paint, so a tutor sees it
  // exists before the data lands. On a cold backend the suggestions used to
  // arrive a beat after Trending, and a section that appears late, below
  // where the eye already is, was easy to click past. Only about one eligible
  // session in twenty ends with nothing to suggest, and for those the slot
  // settles into a one-line note rather than vanishing, so nothing appears
  // and then retracts.
  if (isLoading) {
    return (
      <div
        className="border border-teal-200 dark:border-teal-900 rounded-lg overflow-hidden"
        aria-busy="true"
        aria-label="School Progress is loading"
      >
        <div className={cn("flex items-center gap-2 px-3 py-2", SECTION_HEADER_BG)}>
          <GraduationCap className="h-3.5 w-3.5 text-teal-600" />
          <span className="text-xs text-gray-600 dark:text-gray-300 shrink-0">School Progress</span>
          <span className="text-[10px] text-gray-400 hidden sm:inline shrink-0">
            {session.school} · {session.grade}
          </span>
          <span className="h-2.5 w-28 rounded bg-teal-100 dark:bg-teal-900/40 animate-pulse" />
          <ChevronRight className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600 ml-auto" />
        </div>
      </div>
    );
  }

  // A failed request stays silent. The tutor can still set exercises, and
  // the next open fetches again.
  if (!data) return null;

  if (data.reason || data.suggestions.length === 0) {
    return (
      <p className="text-[10px] text-gray-400 dark:text-gray-500 px-1">
        No School Progress suggestions for this week yet.
      </p>
    );
  }

  // A test window is when "revising or newly teaching?" becomes a live
  // question. The confirm button asks it after the tap, in place, and only
  // then writes. Outside a test window the tap records new teaching at once.
  const inTestWindow = data.revision_mode;

  const handleConfirm = async (
    concept: CurriculumConceptSuggestion,
    isRevision: boolean
  ) => {
    setConfirmStates((prev) => ({
      ...prev,
      [concept.concept_id]: { status: "saving", isRevision },
    }));
    try {
      const result = await curriculumAPI.confirmTopic({
        student_id: session.student_id,
        concept_id: concept.concept_id,
        session_date: session.session_date,
        is_revision: isRevision,
      });
      setConfirmStates((prev) => ({
        ...prev,
        [concept.concept_id]: { status: "confirmed", observationId: result.id, isRevision },
      }));
    } catch {
      // Back to where the choice was made: the question during a test
      // window, the plain button otherwise, so a retry is one tap away.
      setConfirmStates((prev) => ({
        ...prev,
        [concept.concept_id]: { status: inTestWindow ? "asking" : "idle" },
      }));
      showToast("Could not save the confirmation. Please try again.", "error");
    }
  };

  const handleUndo = async (concept: CurriculumConceptSuggestion) => {
    const state = confirmStates[concept.concept_id];
    if (state?.status !== "confirmed") return;
    setConfirmStates((prev) => ({
      ...prev,
      [concept.concept_id]: { status: "saving", isRevision: state.isRevision },
    }));
    try {
      await curriculumAPI.undoConfirm(state.observationId);
      setConfirmStates((prev) => ({ ...prev, [concept.concept_id]: { status: "idle" } }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        // The observation is already gone (idempotent confirms can share one
        // row that another Undo removed) — this undo has nothing left to do.
        setConfirmStates((prev) => ({ ...prev, [concept.concept_id]: { status: "idle" } }));
        return;
      }
      setConfirmStates((prev) => ({ ...prev, [concept.concept_id]: state }));
      showToast("Could not undo the confirmation. Please try again.", "error");
    }
  };

  const handleCorrection = async (
    concept: CurriculumConceptVocab,
    isRevision: boolean
  ) => {
    setCorrection({ status: "saving", concept, isRevision });
    try {
      const result = await curriculumAPI.confirmTopic({
        student_id: session.student_id,
        concept_id: concept.id,
        session_date: session.session_date,
        is_revision: isRevision,
      });
      setCorrection({ status: "confirmed", concept, observationId: result.id, isRevision });
      setCorrectionQuery("");
    } catch {
      // Back to where the choice was being made: the kind chooser during a
      // test window, the topic list otherwise.
      setCorrection(inTestWindow ? { status: "kind", concept } : { status: "picking" });
      showToast("Could not save the topic. Please try again.", "error");
    }
  };

  const handleCorrectionUndo = async () => {
    if (correction.status !== "confirmed") return;
    const prev = correction;
    setCorrection({ status: "saving", concept: prev.concept, isRevision: prev.isRevision });
    try {
      await curriculumAPI.undoConfirm(prev.observationId);
      setCorrection({ status: "closed" });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setCorrection({ status: "closed" });
        return;
      }
      setCorrection(prev);
      showToast("Could not undo the confirmation. Please try again.", "error");
    }
  };

  const stream = data.lang_stream || session.lang_stream || null;

  const examDate = data.upcoming_exam?.start_date
    ? new Date(data.upcoming_exam.start_date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      })
    : null;
  // Canonical kind colours from the exam revisions page (Test red, Exam
  // purple, Quiz green).
  const kindColors = getTypeColors(data.upcoming_exam?.event_type);

  const examLabel = examDate
    ? `On the scope of the ${data.upcoming_exam?.event_type || "Test"} on ${examDate}`
    : null;

  const subtitle =
    data.tier === "exam_scope"
      ? `What the ${data.upcoming_exam?.event_type || "Test"} on ${examDate} covers`
      : data.tier === "this_year"
        ? `What ${data.school} ${data.grade} classes are likely covering now`
        : data.tier === "last_year"
          ? `Based on ${data.school}'s pace last year`
          : `Based on ${data.school}'s typical pace`;

  // Last-year-tier evidence means the current year is empty near this week —
  // point the explorer at the year that actually has the data. The timeline
  // tier is what matters here: during an exam window `tier` pivots to
  // exam_scope while the timeline may still be running on last year.
  const timelineTier = data.timeline_tier ?? data.tier;
  const linkYear =
    timelineTier === "last_year" && data.academic_year
      ? priorAcademicYear(data.academic_year)
      : data.academic_year;

  return (
    <div className="border border-teal-200 dark:border-teal-900 rounded-lg overflow-hidden">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors",
          SECTION_HEADER_BG,
          "hover:from-teal-100 hover:to-[#fef9f3] dark:hover:from-teal-900/30 dark:hover:to-[#2d2618]"
        )}
      >
        <GraduationCap className="h-3.5 w-3.5 text-teal-600" />
        <span className="text-xs text-gray-600 dark:text-gray-300 shrink-0">School Progress</span>
        <span className="text-[10px] text-gray-400 hidden sm:inline shrink-0">
          {data.school} · {data.grade}
        </span>
        {!expanded && data.suggestions.length > 0 && (
          <span className="text-[10px] text-teal-700 dark:text-teal-400 truncate">
            {conceptNameForStream(data.suggestions[0], stream)}
          </span>
        )}
        {examDate && (
          <span
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]",
              kindColors.bg,
              kindColors.text
            )}
          >
            <CalendarClock className="h-3 w-3" />
            {data.upcoming_exam?.event_type || "Test"} on {examDate}
          </span>
        )}
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-gray-400 ml-auto" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-gray-400 ml-auto" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-teal-100 dark:border-teal-900/50">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-2">
            <p className="text-[10px] text-gray-500 dark:text-gray-400 flex-1 min-w-0">
              {subtitle}
            </p>
            {/* Chips, not inline links: buried in the grey subtitle these
                were easy to skim past. */}
            {data.tier === "exam_scope" &&
              data.upcoming_exam?.id != null &&
              // The section already lists the top topics with the same
              // ranked files; only offer the pack when the scope holds
              // more topics than fit here.
              (data.upcoming_exam.scope_concept_count ?? 0) >
                data.suggestions.length && (
                <button
                  type="button"
                  onClick={() => setPackOpen(true)}
                  className="text-[10px] px-1.5 py-0.5 rounded-full border border-teal-600/40 dark:border-teal-400/40 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors shrink-0"
                >
                  All {data.upcoming_exam.scope_concept_count} topics →
                </button>
              )}
            {data.week_number != null && (
              /* New tab: an in-place navigation would unmount the exercise
                 modal and silently drop unsaved exercises. */
              <Link
                href={curriculumExplorerHref(data.school, data.grade, data.week_number, linkYear)}
                target="_blank"
                className="text-[10px] px-1.5 py-0.5 rounded-full border border-teal-600/40 dark:border-teal-400/40 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors shrink-0"
              >
                See the full year →
              </Link>
            )}
          </div>

          {/* No bottom padding here: a sticky child cannot enter its parent's
              padding, so any pb would hold the correction row above the edge
              with rows scrolling visibly through the gap. The row carries its
              own pb instead. */}
          <div className="max-h-[min(24rem,45vh)] overflow-y-auto px-3 pt-2 space-y-3">
            {(data.past_papers?.length ?? 0) > 0 && (
              <div className="px-2 py-1.5 rounded-lg bg-teal-50/60 dark:bg-teal-900/15 border border-teal-100 dark:border-teal-900/40">
                <div className="flex items-center gap-1 mb-0.5">
                  <History className="h-3 w-3 text-teal-600 dark:text-teal-400 shrink-0" />
                  <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300">
                    Tailored revision papers
                  </span>
                </div>
                <div className="space-y-0.5">
                  {data.past_papers!.map((paper) => (
                    <CurriculumPastPaperRow
                      key={paper.id}
                      paper={paper}
                      stream={stream}
                      onPreview={(t) =>
                        setPreview({
                          path: t.file_path,
                          label: stripExtension(t.file_basename),
                          answerPath: t.answer_path,
                        })
                      }
                      onAdd={() =>
                        onAdd(paper.file_path, paper.answer_path ?? undefined)
                      }
                    />
                  ))}
                </div>
              </div>
            )}
            {data.suggestions.map((concept) => {
              const state = confirmStates[concept.concept_id] || { status: "idle" };
              return (
                <div key={concept.concept_id}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-800 dark:text-gray-200">
                        {conceptNameForStream(concept, stream)}
                      </div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400">
                        {evidenceLine(concept, examLabel)}
                      </div>
                      {(vocabById.get(concept.concept_id)?.builds_on_ids?.length ??
                        0) > 0 && (
                        <div className="flex items-center gap-1 flex-wrap mt-0.5">
                          <span className="text-[10px] text-gray-400 shrink-0">
                            Builds on
                          </span>
                          {vocabById
                            .get(concept.concept_id)!
                            .builds_on_ids.slice(0, 3)
                            .map((id) => {
                              const prereq = vocabById.get(id);
                              if (!prereq) return null;
                              const name = conceptNameForStream(
                                prereq,
                                stream
                              );
                              return (
                                <button
                                  key={id}
                                  type="button"
                                  onClick={() => setTopicFiles({ conceptId: id, name })}
                                  title={`Worth checking the student is solid on this first. Tap for its worksheets.`}
                                  // Trailing chevron: the app's sign that a pill opens
                                  // a bigger surface, so this cannot be mistaken for
                                  // one of the record buttons on the row above.
                                  className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border border-teal-600/30 dark:border-teal-400/30 text-teal-700/90 dark:text-teal-400/90 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors max-w-[10rem]"
                                >
                                  <span className="truncate">{name}</span>
                                  <ChevronRight className="h-3 w-3 shrink-0" />
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </div>
                    {state.status === "confirmed" ? (
                      <span className={RECORDED_TEXT}>
                        <Check className="h-3 w-3" />
                        {state.isRevision ? "Noted as revision, thanks!" : "Noted, thanks!"}
                        <button
                          type="button"
                          onClick={() => handleUndo(concept)}
                          className="inline-flex items-center gap-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-1"
                        >
                          <Undo2 className="h-3 w-3" />
                          Undo
                        </button>
                      </span>
                    ) : state.status === "asking" ||
                      (state.status === "saving" && inTestWindow) ? (
                      // The question stays on screen while its answer saves,
                      // so the row does not jump between two layouts.
                      <KindQuestion
                        saving={
                          state.status === "saving"
                            ? state.isRevision
                              ? "revision"
                              : "new"
                            : null
                        }
                        onPick={(isRevision) => handleConfirm(concept, isRevision)}
                        onDismiss={() =>
                          setConfirmStates((prev) => ({
                            ...prev,
                            [concept.concept_id]: { status: "idle" },
                          }))
                        }
                        dismissLabel="Cancel"
                        hitArea={hitArea}
                        className="shrink min-w-0 max-w-[70%]"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          inTestWindow
                            ? setConfirmStates((prev) => ({
                                ...prev,
                                [concept.concept_id]: { status: "asking" },
                              }))
                            : handleConfirm(concept, false)
                        }
                        disabled={state.status === "saving"}
                        title="Tell the system the school really is on this topic. This improves future suggestions for everyone."
                        className={RECORD_BTN}
                      >
                        {state.status === "saving" ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        School is on this
                      </button>
                    )}
                  </div>

                  {concept.files.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {/* The shared row: plus adds, the name and eye preview,
                          badges include the student's Done history. Keeps
                          this list's behaviour identical to the past-paper
                          rows above it. */}
                      {concept.files.map((file: CurriculumFile) => (
                        <CurriculumFileRow
                          key={file.file_path}
                          file={file}
                          onAdd={() => onAdd(file.file_path)}
                          onPreview={(f) =>
                            setPreview({
                              path: f.file_path,
                              label: stripExtension(f.file_basename),
                            })
                          }
                          scopeSchool={data.school}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Correction: record the topic the school is actually on.
                Sticky at the scrollport's bottom edge so the escape hatch is
                visible without scrolling to the end of the list. Full-bleed
                (-mx) and the modal panel's own desk colours, so it reads as
                the card's footer rather than a box floating over the list. */}
            <div className="sticky bottom-0 -mx-3 px-3 pt-2 pb-3 bg-[#fef9f3] dark:bg-[#2d2618] border-t border-teal-100/60 dark:border-teal-900/40">
              {correction.status === "closed" && (
                <button
                  type="button"
                  onClick={() => setCorrection({ status: "picking" })}
                  className="inline-flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 hover:text-teal-700 dark:hover:text-teal-400 transition-colors"
                >
                  <MessageSquarePlus className="h-3 w-3" />
                  School is on something else?
                </button>
              )}

              {correction.status === "picking" && (
                <div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      autoFocus
                      value={correctionQuery}
                      onChange={(e) => setCorrectionQuery(e.target.value)}
                      placeholder="e.g. Factorization, 因式分解 or 803"
                      className="flex-1 min-w-0 text-[11px] px-2 py-1 rounded border border-teal-200 dark:border-teal-800 bg-white dark:bg-[#1a1a1a] text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                    <button
                      type="button"
                      aria-label="Close topic picker"
                      onClick={() => {
                        setCorrection({ status: "closed" });
                        setCorrectionQuery("");
                      }}
                      className={cn(
                        hitArea,
                        "rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      )}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  {correctionMatches.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {correctionMatches.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() =>
                            inTestWindow
                              ? setCorrection({ status: "kind", concept: c })
                              : handleCorrection(c, false)
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
                  {correctionQuery.trim() && correctionMatches.length === 0 && (
                    <p className="mt-1 text-[10px] text-gray-400">
                      No matching topic. Try another name or a chapter code.
                    </p>
                  )}
                </div>
              )}

              {(correction.status === "kind" ||
                (correction.status === "saving" && inTestWindow)) && (
                // Same question as on a suggestion row, so the picker and the
                // rows teach one habit. The X goes back to the topic list.
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[11px] text-gray-700 dark:text-gray-300 truncate">
                    {conceptNameForStream(correction.concept, stream)}
                  </span>
                  <KindQuestion
                    saving={
                      correction.status === "saving"
                        ? correction.isRevision
                          ? "revision"
                          : "new"
                        : null
                    }
                    onPick={(isRevision) => handleCorrection(correction.concept, isRevision)}
                    onDismiss={() => setCorrection({ status: "picking" })}
                    dismissLabel="Back to the topic list"
                    hitArea={hitArea}
                  />
                </div>
              )}

              {((correction.status === "saving" && !inTestWindow) ||
                correction.status === "confirmed") && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-gray-700 dark:text-gray-300 truncate">
                    {conceptNameForStream(
                      correction.concept,
                      stream
                    )}
                  </span>
                  {correction.status === "saving" ? (
                    <Loader2 className="h-3 w-3 animate-spin text-gray-400 shrink-0" />
                  ) : (
                    <span className={RECORDED_TEXT}>
                      <Check className="h-3 w-3" />
                      {correction.isRevision ? "Noted as revision, thanks!" : "Noted, thanks!"}
                      <button
                        type="button"
                        onClick={handleCorrectionUndo}
                        className="inline-flex items-center gap-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-1"
                      >
                        <Undo2 className="h-3 w-3" />
                        Undo
                      </button>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {preview && (
        <CurriculumPdfPreview
          filePath={preview.path}
          fileLabel={preview.label}
          onAdd={() => onAdd(preview.path, preview.answerPath ?? undefined)}
          onClose={() => setPreview(null)}
        />
      )}

      {topicFiles && (
        <CurriculumTopicFiles
          conceptId={topicFiles.conceptId}
          conceptName={topicFiles.name}
          scope={
            session.school && session.grade
              ? {
                  school: session.school,
                  grade: session.grade,
                  lang_stream: session.lang_stream || null,
                }
              : null
          }
          onAdd={onAdd}
          onClose={() => setTopicFiles(null)}
        />
      )}

      {packOpen && data.upcoming_exam?.id != null && (
        <CurriculumRevisionPack
          eventId={data.upcoming_exam.id}
          onAdd={onAdd}
          onClose={() => setPackOpen(false)}
        />
      )}
    </div>
  );
}
