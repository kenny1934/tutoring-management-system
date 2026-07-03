"use client";

import { useState } from "react";
import {
  GraduationCap,
  ChevronDown,
  ChevronRight,
  Plus,
  Check,
  Loader2,
  CalendarClock,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import { useCurriculumSuggestions } from "@/lib/hooks";
import { curriculumAPI } from "@/lib/api";
import type { Session, CurriculumConceptSuggestion, CurriculumFile } from "@/types";

const SUGGESTED_GRADES = ["F1", "F2", "F3"];

const ROLE_LABELS: Record<string, string> = {
  exercise: "Exercise",
  quiz: "Quiz",
  mc: "MC",
  master: "Handout",
  revision: "Revision",
  question_bank: "Question Bank",
  past_paper: "Past Paper",
  mock: "Mock",
};

const SOURCE_LABELS: Record<string, string> = {
  assignment: "assignments",
  prep_folder: "prep folders",
  sheet: "curriculum sheets",
  exam_scope: "exam scopes",
  tutor_confirm: "tutor confirmations",
};

function conceptDisplayName(c: CurriculumConceptSuggestion): string {
  if (c.name_zh && c.name_en) return `${c.name_en} · ${c.name_zh}`;
  return c.name_en || c.name_zh || "Unknown topic";
}

function weeksLabel(weeks: number[]): string {
  if (weeks.length === 0) return "";
  if (weeks.length === 1) return `week ${weeks[0]}`;
  return `weeks ${Math.min(...weeks)} to ${Math.max(...weeks)}`;
}

function evidenceLine(c: CurriculumConceptSuggestion): string {
  const why = c.why;
  if (why.tier === "pacing") {
    return `Typically around week ${why.mean_week ?? weeksLabel(why.weeks_observed)}`;
  }
  const sources = why.sources.map((s) => SOURCE_LABELS[s] || s);
  const sourceText =
    sources.length > 1
      ? `${sources.slice(0, -1).join(", ")} and ${sources[sources.length - 1]}`
      : sources[0] || "past records";
  const prefix = why.tier === "last_year" ? "Last year, seen in" : "Seen in";
  return `${prefix} ${sourceText} · ${weeksLabel(why.weeks_observed)}`;
}

function stripExtension(name: string): string {
  return name.replace(/\.(pdf|docx?|xlsx|pptx|jpg)$/i, "");
}

type ConfirmState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "confirmed"; observationId: number };

interface CurriculumSuggestionSectionProps {
  session: Session;
  onAdd: (path: string) => void;
}

export function CurriculumSuggestionSection({ session, onAdd }: CurriculumSuggestionSectionProps) {
  const { showToast } = useToast();
  const eligible =
    SUGGESTED_GRADES.includes(session.grade || "") && !!session.school && !!session.student_id;

  const { data, isLoading } = useCurriculumSuggestions(
    eligible ? session.student_id : null,
    session.session_date
  );

  // Auto-expanded so it's hard to miss; the section only renders when there
  // is something to show.
  const [expanded, setExpanded] = useState(true);
  const [testPrep, setTestPrep] = useState<boolean | null>(null);
  const [confirmStates, setConfirmStates] = useState<Record<number, ConfirmState>>({});

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
    } catch {
      setConfirmStates((prev) => ({ ...prev, [concept.concept_id]: state }));
      showToast("Could not undo the confirmation. Please try again.", "error");
    }
  };

  const examDate = data.upcoming_exam?.start_date
    ? new Date(data.upcoming_exam.start_date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      })
    : null;

  const subtitle =
    data.tier === "this_year"
      ? `What ${data.school} ${data.grade} classes are likely covering now`
      : data.tier === "last_year"
        ? `Based on ${data.school}'s pace last year`
        : `Based on ${data.school}'s typical pace`;

  return (
    <div className="border border-teal-200 dark:border-teal-900 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors",
          "bg-gradient-to-r from-teal-50 to-white dark:from-teal-900/20 dark:to-[#1a1a1a]",
          "hover:from-teal-100 hover:to-white dark:hover:from-teal-900/30 dark:hover:to-[#1a1a1a]"
        )}
      >
        <GraduationCap className="h-3.5 w-3.5 text-teal-600" />
        <span className="text-xs text-gray-600 dark:text-gray-300">School Progress</span>
        <span className="text-[10px] text-gray-400 hidden sm:inline">
          {data.school} · {data.grade}
        </span>
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
            <p className="text-[10px] text-gray-500 dark:text-gray-400 flex-1">{subtitle}</p>
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
            {data.suggestions.map((concept) => {
              const state = confirmStates[concept.concept_id] || { status: "idle" };
              return (
                <div key={concept.concept_id}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-800 dark:text-gray-200">
                        {conceptDisplayName(concept)}
                      </div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400">
                        {evidenceLine(concept)}
                      </div>
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
                          <span
                            className="text-[11px] text-gray-700 dark:text-gray-300 truncate flex-1 cursor-pointer"
                            title={file.file_path}
                            onClick={() => onAdd(file.file_path)}
                          >
                            {stripExtension(file.file_basename)}
                          </span>
                          <span className="text-[9px] px-1 py-px rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 shrink-0">
                            {file.role ? ROLE_LABELS[file.role] || file.role : "Worksheet"}
                          </span>
                          {file.assignment_count > 0 && (
                            <span
                              className="text-[9px] text-gray-400 shrink-0"
                              title={`Assigned ${file.assignment_count} times to ${file.unique_student_count} students`}
                            >
                              {file.assignment_count}×
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
