"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  GraduationCap,
  ChevronDown,
  ChevronRight,
  Plus,
  Check,
  History,
  Loader2,
  CalendarClock,
  Undo2,
  MessageSquarePlus,
  Eye,
  X,
} from "lucide-react";
import { CurriculumPdfPreview } from "@/components/curriculum/CurriculumPdfPreview";
import { CurriculumFileBadges } from "@/components/curriculum/CurriculumFileRow";
import { CurriculumPastPaperRow } from "@/components/curriculum/CurriculumPastPaperRow";
import { CurriculumRevisionPack } from "@/components/curriculum/CurriculumRevisionPack";
import { CurriculumTopicFiles } from "@/components/curriculum/CurriculumTopicFiles";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import { useCurriculumConcepts, useCurriculumSuggestions } from "@/lib/hooks";
import { ApiError, curriculumAPI } from "@/lib/api";
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

type ConfirmState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "confirmed"; observationId: number };

// The correction picker: disagreement is worth more to the timeline than
// agreement, so when none of the suggestions is what the school is actually
// doing, the tutor can name the real topic instead of walking away.
type CorrectionState =
  | { status: "closed" }
  | { status: "picking" }
  | { status: "saving"; concept: CurriculumConceptVocab }
  | { status: "confirmed"; concept: CurriculumConceptVocab; observationId: number };

interface CurriculumSuggestionSectionProps {
  session: Session;
  /** Archived papers carry a recognised answer key when one exists —
   *  adding one fills the exercise's answer file too. */
  onAdd: (path: string, answerPath?: string) => void;
}

export function CurriculumSuggestionSection({ session, onAdd }: CurriculumSuggestionSectionProps) {
  const { showToast } = useToast();
  const eligible = isCurriculumEligible(session);

  const { data, isLoading } = useCurriculumSuggestions(
    eligible ? session.student_id : null,
    session.session_date
  );

  // Collapsed by default (the modal is dense); the header still names the
  // top topic so the information is visible at a glance.
  const [expanded, setExpanded] = useState(false);
  const [testPrep, setTestPrep] = useState<boolean | null>(null);
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

  if (!eligible) return null;

  if (isLoading) {
    return (
      <div className="border border-teal-200 dark:border-teal-900 rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-teal-50 to-white dark:from-teal-900/20 dark:to-[#1a1a1a]">
          <GraduationCap className="h-3.5 w-3.5 text-teal-600" />
          <span className="text-xs text-gray-600 dark:text-gray-300">School Progress</span>
          <Loader2 className="h-3 w-3 animate-spin text-gray-400 ml-auto" />
        </div>
      </div>
    );
  }

  if (!data || data.reason || data.suggestions.length === 0) return null;

  // Confirmations default to revision when a test is coming up; the tutor
  // can override either way.
  const effectiveTestPrep = testPrep ?? data.revision_mode;

  const handleConfirm = async (concept: CurriculumConceptSuggestion) => {
    setConfirmStates((prev) => ({ ...prev, [concept.concept_id]: { status: "saving" } }));
    try {
      const result = await curriculumAPI.confirmTopic({
        student_id: session.student_id,
        concept_id: concept.concept_id,
        session_date: session.session_date,
        is_revision: effectiveTestPrep,
      });
      setConfirmStates((prev) => ({
        ...prev,
        [concept.concept_id]: { status: "confirmed", observationId: result.id },
      }));
    } catch {
      setConfirmStates((prev) => ({ ...prev, [concept.concept_id]: { status: "idle" } }));
      showToast("Could not save the confirmation. Please try again.", "error");
    }
  };

  const handleUndo = async (concept: CurriculumConceptSuggestion) => {
    const state = confirmStates[concept.concept_id];
    if (state?.status !== "confirmed") return;
    setConfirmStates((prev) => ({ ...prev, [concept.concept_id]: { status: "saving" } }));
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

  const handleCorrection = async (concept: CurriculumConceptVocab) => {
    setCorrection({ status: "saving", concept });
    try {
      const result = await curriculumAPI.confirmTopic({
        student_id: session.student_id,
        concept_id: concept.id,
        session_date: session.session_date,
        is_revision: effectiveTestPrep,
      });
      setCorrection({ status: "confirmed", concept, observationId: result.id });
      setCorrectionQuery("");
    } catch {
      setCorrection({ status: "picking" });
      showToast("Could not save the topic. Please try again.", "error");
    }
  };

  const handleCorrectionUndo = async () => {
    if (correction.status !== "confirmed") return;
    const prev = correction;
    setCorrection({ status: "saving", concept: prev.concept });
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
          "bg-gradient-to-r from-teal-50 to-white dark:from-teal-900/20 dark:to-[#1a1a1a]",
          "hover:from-teal-100 hover:to-white dark:hover:from-teal-900/30 dark:hover:to-[#1a1a1a]"
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
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20">
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
          <div className="flex items-center gap-2 px-3 pt-2">
            <p className="text-[10px] text-gray-500 dark:text-gray-400 flex-1">
              {subtitle}
              {data.tier === "exam_scope" &&
                data.upcoming_exam?.id != null &&
                // The section already lists the top topics with the same
                // ranked files; only offer the pack when the scope holds
                // more topics than fit here.
                (data.upcoming_exam.scope_concept_count ?? 0) >
                  data.suggestions.length && (
                  <>
                    {" · "}
                    <button
                      type="button"
                      onClick={() => setPackOpen(true)}
                      className="text-teal-700 dark:text-teal-400 hover:underline"
                    >
                      All {data.upcoming_exam.scope_concept_count} topics →
                    </button>
                  </>
                )}
              {data.week_number != null && (
                <>
                  {" · "}
                  {/* New tab: an in-place navigation would unmount the
                      exercise modal and silently drop unsaved exercises. */}
                  <Link
                    href={curriculumExplorerHref(data.school, data.grade, data.week_number, linkYear)}
                    target="_blank"
                    className="text-teal-700 dark:text-teal-400 hover:underline"
                  >
                    See the full year →
                  </Link>
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => setTestPrep(!effectiveTestPrep)}
              title="When on, topic confirmations are recorded as test revision rather than new teaching"
              className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border transition-colors shrink-0",
                effectiveTestPrep
                  ? "text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20"
                  : "text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
              )}
            >
              Test prep {effectiveTestPrep ? "on" : "off"}
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto px-3 pb-3 pt-2 space-y-3">
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
                                  className="text-[10px] px-1.5 py-0.5 rounded-full border border-teal-600/30 dark:border-teal-400/30 text-teal-700/90 dark:text-teal-400/90 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors truncate max-w-[10rem]"
                                >
                                  {name}
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </div>
                    {state.status === "confirmed" ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-teal-700 dark:text-teal-400 shrink-0">
                        <Check className="h-3 w-3" />
                        Noted, thanks!
                        <button
                          type="button"
                          onClick={() => handleUndo(concept)}
                          className="inline-flex items-center gap-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-1"
                        >
                          <Undo2 className="h-3 w-3" />
                          Undo
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleConfirm(concept)}
                        disabled={state.status === "saving"}
                        title="Tell the system the school really is on this topic. This improves future suggestions for everyone."
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-teal-700 dark:text-teal-400 border border-teal-300 dark:border-teal-700 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors shrink-0 disabled:opacity-50"
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
                      {concept.files.map((file: CurriculumFile) => (
                        <div
                          key={file.file_path}
                          className="flex items-center gap-1.5 group rounded px-1 py-0.5 hover:bg-teal-50/60 dark:hover:bg-teal-900/10"
                        >
                          <button
                            type="button"
                            onClick={() => onAdd(file.file_path)}
                            title={`Add to ${stripExtension(file.file_basename)}`}
                            className="p-0.5 rounded text-teal-600 hover:bg-teal-100 dark:hover:bg-teal-900/30 shrink-0"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setPreview({
                                path: file.file_path,
                                label: stripExtension(file.file_basename),
                              })
                            }
                            title="Preview"
                            className="p-0.5 rounded text-gray-400 hover:text-teal-600 hover:bg-teal-100 dark:hover:bg-teal-900/30 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                          >
                            <Eye className="h-3 w-3" />
                          </button>
                          <span
                            className="text-[11px] text-gray-700 dark:text-gray-300 truncate flex-1 cursor-pointer"
                            title={file.file_path}
                            onClick={() => onAdd(file.file_path)}
                          >
                            {stripExtension(file.file_basename)}
                          </span>
                          {(file.student_assigned_count ?? 0) > 0 && (
                            <span
                              className="text-[9px] px-1 py-px rounded bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 shrink-0"
                              title={`Already assigned to this student ${file.student_assigned_count} time${file.student_assigned_count === 1 ? "" : "s"}${
                                file.student_last_assigned
                                  ? `, last on ${new Date(file.student_last_assigned).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
                                  : ""
                              }`}
                            >
                              Done
                              {file.student_last_assigned
                                ? ` · ${new Date(file.student_last_assigned).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                                : ""}
                            </span>
                          )}
                          <CurriculumFileBadges
                            file={file}
                            scopeSchool={data.school}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Correction: record the topic the school is actually on */}
            <div className="pt-2 border-t border-teal-100/60 dark:border-teal-900/40">
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
                      className="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
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
                          onClick={() => handleCorrection(c)}
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

              {(correction.status === "saving" || correction.status === "confirmed") && (
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
                    <span className="inline-flex items-center gap-1 text-[10px] text-teal-700 dark:text-teal-400 shrink-0">
                      <Check className="h-3 w-3" />
                      Noted, thanks!
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
          onClose={() => setTopicFiles(null)}
        />
      )}

      {packOpen && data.upcoming_exam?.id != null && (
        <CurriculumRevisionPack
          eventId={data.upcoming_exam.id}
          onClose={() => setPackOpen(false)}
        />
      )}
    </div>
  );
}
