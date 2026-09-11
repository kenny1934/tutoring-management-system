"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  GraduationCap,
  ChevronDown,
  ChevronRight,
  Check,
  History,
  Loader2,
  CalendarClock,
} from "lucide-react";
import { CurriculumPdfPreview } from "@/components/curriculum/CurriculumPdfPreview";
import { CurriculumFileRow } from "@/components/curriculum/CurriculumFileRow";
import { CurriculumPastPaperRow } from "@/components/curriculum/CurriculumPastPaperRow";
import { CurriculumRevisionPack } from "@/components/curriculum/CurriculumRevisionPack";
import { CurriculumTopicFiles } from "@/components/curriculum/CurriculumTopicFiles";
import { SchoolProgressAsk } from "@/components/curriculum/SchoolProgressAsk";
import { TopicCorrectionPicker } from "@/components/curriculum/TopicCorrectionPicker";
import {
  KindQuestion,
  RECORD_BTN,
  RecordedNote,
  SECTION_HEADER_BG,
  UNDO_FAILED_MESSAGE,
  undoRecordedTopic,
} from "@/components/curriculum/ConfirmControls";
import type {
  RecordedTopic,
  RecordedTopics,
} from "@/components/curriculum/ConfirmControls";
import { cn } from "@/lib/utils";
import { getTypeColors } from "@/lib/exam-type-colors";
import { useToast } from "@/contexts/ToastContext";
import { useCurriculumConcepts, useCurriculumSuggestions } from "@/lib/hooks";
import { curriculumAPI, recordFeatureEvents } from "@/lib/api";
import { iconHitArea, useCoarsePointer } from "@/hooks/useCoarsePointer";
import {
  SOURCE_LABELS,
  conceptNameForStream,
  curriculumExplorerHref,
  isCurriculumEligible,
  priorAcademicYear,
  stripExtension,
  weeksSpanText,
} from "@/lib/curriculum-labels";
import type {
  Session,
  CurriculumConceptSuggestion,
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
  // One student's worksheets are too little to call it the school's topic,
  // so the line says that is all there is.
  const sourceText = why.thin
    ? "one student's assignments"
    : sources.length > 1
      ? `${sources.slice(0, -1).join(", ")} and ${sources[sources.length - 1]}`
      : sources[0] || "past records";
  const prefix = why.tier === "last_year" ? "Last year, seen in" : "Seen in";
  return `${prefix} ${sourceText} · ${weeksSpanText(why.weeks_observed || [])}`;
}

// What a single row is doing right now. Whether its topic has been recorded
// is not in here: that is a fact about the school week rather than about one
// row, so it lives in `recorded` and every surface reads it. "asking" only
// happens near a test: the tap has been made but nothing is written until the
// tutor says whether the school is revising the topic or teaching it for the
// first time.
type ConfirmState =
  | { status: "idle" }
  | { status: "asking" }
  | { status: "saving"; isRevision: boolean };

interface CurriculumSuggestionSectionProps {
  session: Session;
  /** Archived papers carry a recognised answer key when one exists —
   *  adding one fills the exercise's answer file too. */
  onAdd: (path: string, answerPath?: string) => void;
  /** Set by the bulk modal when `session` is standing in for several
   *  students from the same class on the same day. The topics and the
   *  question are the same for all of them, so the strip reads them from this
   *  one session. What it leaves off is each file's Done badge, because that
   *  is this one student's history and would mislead about the rest. */
  forGroup?: boolean;
}

/** The file without its student history. The row only draws a Done badge
 *  when the file has been assigned to the student before, so a zero count is
 *  enough to leave the badge off. */
function withoutStudentHistory(file: CurriculumFile): CurriculumFile {
  return {
    ...file,
    student_assigned_count: 0,
    student_last_assigned: null,
    student_pages_done: null,
  };
}

export function CurriculumSuggestionSection({ session, onAdd, forGroup = false }: CurriculumSuggestionSectionProps) {
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
  // Every topic recorded while this modal has been open, whichever surface
  // recorded it. The question on the strip, the buttons below it and the
  // search box all answer the same question about the same school week, so
  // they share this rather than each remembering their own answers.
  const [recorded, setRecorded] = useState<RecordedTopics>({});
  // The picker owns its own state. All this section decides is whether it is
  // open, because answering "No, it's..." on the collapsed question opens it.
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [preview, setPreview] = useState<{
    path: string;
    label: string;
    answerPath?: string | null;
    // Set when the file came from a suggested topic, so adding it from the
    // preview counts as the same quiet vote as adding it from the row.
    conceptId?: number;
  } | null>(null);

  // Worksheet browser for one topic, portalled above the exercise modal. It
  // opens from a suggested topic's name, which only lists its top few files
  // here, and from the builds-on chips under it. `fromSuggestion` marks the
  // first case, where adding a file is the same quiet vote as adding it from
  // the row.
  const [topicFiles, setTopicFiles] = useState<{
    conceptId: number;
    name: string;
    fromSuggestion?: boolean;
  } | null>(null);
  // The upcoming test's full revision pack (same portal layer).
  const [packOpen, setPackOpen] = useState(false);

  // Vocabulary for the correction picker and the builds-on chips; only
  // fetched once the section is opened.
  const { data: vocab } = useCurriculumConcepts(expanded || correctionOpen);
  const vocabById = useMemo(
    () => new Map((vocab || []).map((c) => [c.id, c])),
    [vocab]
  );
  // Record that the strip was in front of somebody, as opposed to fetched on
  // a hover that went nowhere. Deduped per tutor, session and day on the
  // server, and the ref keeps a re-render from posting it twice over.
  const shownFor = useRef<number | null>(null);
  useEffect(() => {
    if (!eligible || !data || shownFor.current === session.id) return;
    shownFor.current = session.id;
    recordFeatureEvents([{
      event_key: "school_progress.shown",
      entity_type: "session",
      entity_id: session.id,
      context: { school: session.school, grade: session.grade },
      dedupe_key: `sp-shown:${session.id}`,
    }]);
  }, [eligible, data, session.id, session.school, session.grade]);

  const noteRecorded = (conceptId: number, topic: RecordedTopic) =>
    setRecorded((prev) => ({ ...prev, [conceptId]: topic }));

  const clearRecorded = (conceptId: number) =>
    setRecorded((prev) => {
      const next = { ...prev };
      delete next[conceptId];
      return next;
    });

  const toggleExpanded = () => {
    if (!expanded) {
      recordFeatureEvents([{
        event_key: "school_progress.expanded",
        entity_type: "session",
        entity_id: session.id,
        dedupe_key: `sp-expanded:${session.id}`,
      }]);
    }
    setExpanded(!expanded);
  };

  /** Adding a suggested worksheet is a quieter vote for the topic than saying
   *  so outright, so it is recorded at the lower confidence the backend keeps
   *  for it. During a test window the panel is showing revision material, and
   *  revision does not move the school's timeline. */
  const noteFileAdded = (conceptId: number) => {
    curriculumAPI.confirmTopic({
      student_id: session.student_id,
      concept_id: conceptId,
      session_date: session.session_date,
      is_revision: data?.revision_mode ?? false,
      action: "accept_suggestion",
      session_id: session.id,
      origin: "file_add",
    }).catch(() => {
      // The tutor asked for a worksheet, not for a survey. A lost vote costs
      // a little evidence and nothing they can see.
    });
  };

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
    // A school week we know nothing about is the one worth asking about
    // most, so the note carries the way to answer rather than only
    // apologising. Nothing else on this line changes.
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1">
        <p className="text-[10px] text-gray-400 dark:text-gray-500">
          No School Progress suggestions for this week yet.
        </p>
        {data.ask?.state === "ask" && (
          <TopicCorrectionPicker
            session={session}
            suggestedIds={[]}
            stream={data.lang_stream || session.lang_stream || null}
            inTestWindow={data.revision_mode}
            open={correctionOpen}
            onOpenChange={setCorrectionOpen}
            onRecorded={noteRecorded}
            onCleared={clearRecorded}
            triggerLabel="Tell us what they are on"
            origin="strip"
          />
        )}
      </div>
    );
  }

  // A test window is when "revising or newly teaching?" becomes a live
  // question. The confirm button asks it after the tap, in place, and only
  // then writes. Outside a test window the tap records new teaching at once.
  const inTestWindow = data.revision_mode;

  const stream = data.lang_stream || session.lang_stream || null;

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
        session_id: session.id,
        origin: "suggested",
      });
      noteRecorded(concept.concept_id, {
        observationId: result.id,
        isRevision,
        name: conceptNameForStream(concept, stream),
      });
      setConfirmStates((prev) => ({
        ...prev,
        [concept.concept_id]: { status: "idle" },
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

  const handleUndo = async (conceptId: number) => {
    const topic = recorded[conceptId];
    if (!topic) return;
    setConfirmStates((prev) => ({
      ...prev,
      [conceptId]: { status: "saving", isRevision: topic.isRevision },
    }));
    const outcome = await undoRecordedTopic(topic.observationId);
    if (outcome === "failed") showToast(UNDO_FAILED_MESSAGE, "error");
    else clearRecorded(conceptId);
    setConfirmStates((prev) => ({ ...prev, [conceptId]: { status: "idle" } }));
  };

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
        onClick={toggleExpanded}
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

      {/* The question, on its own line under the header. A sibling of the
          toggle rather than a child of it, because answer buttons nested
          inside a button are invalid markup and unreachable from the
          keyboard. It steps aside while the section is open, where the
          per-topic buttons ask the same thing with more room, but it stays
          mounted while it does so: unmounting it threw the answer away and
          asked again the moment the section was closed. */}
      {data.ask && (
        <SchoolProgressAsk
          hidden={expanded}
          ask={data.ask}
          session={session}
          suggestions={data.suggestions.map((c) => ({
            id: c.concept_id,
            name: conceptNameForStream(c, stream),
          }))}
          stream={stream}
          inTestWindow={inTestWindow}
          recorded={recorded}
          onRecorded={noteRecorded}
          onCleared={clearRecorded}
        />
      )}

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
              const topicRecorded = recorded[concept.concept_id];
              const topicName = conceptNameForStream(concept, stream);
              const openTopic = () =>
                setTopicFiles({
                  conceptId: concept.concept_id,
                  name: topicName,
                  fromSuggestion: true,
                });
              return (
                <div key={concept.concept_id}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      {/* The name opens every worksheet for the topic, the way
                          the builds-on chips below it do. It carries the same
                          trailing chevron, because there is no hover on a
                          tablet to tell the tutor the name can be tapped. */}
                      <button
                        type="button"
                        onClick={openTopic}
                        title="Tap for every worksheet on this topic."
                        className="group inline-flex items-start gap-0.5 max-w-full text-left text-xs font-medium text-gray-800 dark:text-gray-200 hover:text-teal-700 dark:hover:text-teal-400 transition-colors"
                      >
                        <span className="min-w-0">{topicName}</span>
                        <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-teal-600/70 dark:text-teal-400/70 group-hover:text-teal-600 dark:group-hover:text-teal-400" />
                      </button>
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
                    {topicRecorded ? (
                      // Recorded here, or on the question above, or in the
                      // search box: one answer, shown the same way wherever
                      // it was given.
                      <RecordedNote
                        isRevision={topicRecorded.isRevision}
                        busy={state.status === "saving"}
                        onUndo={() => handleUndo(concept.concept_id)}
                      />
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
                        title="Records that this is the topic the school is on. It improves the suggestions everyone sees."
                        className={RECORD_BTN}
                      >
                        {state.status === "saving" ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        Yes, this one
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
                          file={forGroup ? withoutStudentHistory(file) : file}
                          onAdd={() => {
                            onAdd(file.file_path);
                            noteFileAdded(concept.concept_id);
                          }}
                          onPreview={(f) =>
                            setPreview({
                              path: f.file_path,
                              label: stripExtension(f.file_basename),
                              conceptId: concept.concept_id,
                            })
                          }
                          scopeSchool={data.school}
                        />
                      ))}
                    </div>
                  )}
                  {/* Same wording as the search box, so the two lists say
                      the same thing about how much more there is. */}
                  {(concept.file_count ?? 0) > concept.files.length && (
                    <button
                      type="button"
                      onClick={openTopic}
                      className="mt-1 text-[10px] text-teal-700 dark:text-teal-400 hover:underline"
                    >
                      See all {concept.file_count} files
                    </button>
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
              <TopicCorrectionPicker
                session={session}
                suggestedIds={data.suggestions.map((c) => c.concept_id)}
                stream={stream}
                inTestWindow={inTestWindow}
                open={correctionOpen}
                onOpenChange={setCorrectionOpen}
                onRecorded={noteRecorded}
                onCleared={clearRecorded}
                triggerLabel="School is on something else?"
              />
            </div>
          </div>
        </div>
      )}

      {preview && (
        <CurriculumPdfPreview
          filePath={preview.path}
          fileLabel={preview.label}
          onAdd={() => {
            onAdd(preview.path, preview.answerPath ?? undefined);
            if (preview.conceptId) noteFileAdded(preview.conceptId);
          }}
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
          onAdd={(path, conceptId) => {
            onAdd(path);
            // A vote only for the suggested topic itself. Once the chips
            // have walked the list to a prerequisite, the tutor is choosing
            // revision for the student, which says nothing about where the
            // school is.
            if (topicFiles.fromSuggestion && conceptId === topicFiles.conceptId) {
              noteFileAdded(conceptId);
            }
          }}
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
