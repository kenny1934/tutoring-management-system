"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import { ApiError, curriculumAPI, recordFeatureEvents } from "@/lib/api";
import { iconHitArea, useCoarsePointer } from "@/hooks/useCoarsePointer";
import { formatWeekdayShort } from "@/lib/formatters";
import {
  KindQuestion,
  RECORD_BTN,
  RECORDED_TEXT,
  SECTION_HEADER_BG,
} from "@/components/curriculum/ConfirmControls";
import type { CurriculumAsk, Session } from "@/types";

/**
 * The one line under the School Progress header that asks what the school is
 * on, or says what somebody else already answered.
 *
 * This exists because of what the first version taught us. The panel was
 * opened around 166 times in its first six days and produced three answers,
 * so the topics were being read and the button was being skipped. Two things
 * were wrong with that button. It was worded as a statement in the tutor's own
 * voice, "School is on this", with the actual request hidden in a tooltip that
 * nobody sees on a tablet. And it lived inside the expanded list, so it only
 * reached the people who wanted the worksheets, when a tutor who has no
 * interest in the worksheets can still answer a question in a second.
 *
 * The rules that keep it from crowding the modal are worth stating, because
 * they are easy to break by accident:
 *
 *   - one line, never two, and only when there is a question worth asking or
 *     an answer worth reporting. Otherwise the strip looks as it always did.
 *   - at most three answers, and never two topics on this row. A week where
 *     classes are out of step says so inside the expanded section, where
 *     there is room, not here.
 *   - the question truncates before the answers do, so the buttons keep their
 *     hit area on a narrow screen.
 *   - no new colours. Answers reuse the green that every other control which
 *     records a fact already uses.
 *
 * The server decides when to ask, how often, and why (see _ask_block in
 * routers/curriculum.py). This component only renders the answer it gets and
 * reports back that the question was seen.
 */
type AnswerState =
  | { status: "idle" }
  | { status: "asking" }
  | { status: "saving"; isRevision: boolean }
  | { status: "confirmed"; observationId: number; isRevision: boolean }
  | { status: "unsure" };

const ROW =
  "flex items-center gap-2 px-3 py-1.5 border-t border-teal-100/60 dark:border-teal-900/40";
const QUESTION_TEXT =
  "text-[10px] text-gray-500 dark:text-gray-400 truncate flex-1 min-w-0";

export function SchoolProgressAsk({
  ask,
  session,
  topConcept,
  inTestWindow,
  onCorrect,
}: {
  ask: CurriculumAsk;
  session: Session;
  /** The topic being asked about when nobody has answered yet: the strongest
   *  suggestion for this school week. */
  topConcept: { id: number; name: string } | null;
  inTestWindow: boolean;
  /** "No, it's..." and "Moved on..." both hand over to the topic picker. */
  onCorrect: () => void;
}) {
  const { showToast } = useToast();
  const hitArea = iconHitArea(useCoarsePointer());
  const [answer, setAnswer] = useState<AnswerState>({ status: "idle" });
  const seen = useRef<string | null>(null);

  const isQuestion = ask.state === "ask" || ask.state === "stale";
  const askedKey = `${ask.combo_key}:${ask.reason_class}`;

  // Report that the question reached somebody. Deduped per tutor, school week
  // and day on the server, so it can be sent on every render and land once,
  // and it is what the daily limit on asking is counted from.
  useEffect(() => {
    if (!isQuestion || !ask.reason_class || seen.current === askedKey) return;
    seen.current = askedKey;
    recordFeatureEvents([{
      event_key: `school_progress.asked.${ask.reason_class}`,
      entity_type: "session",
      entity_id: session.id,
      context: { school: session.school, grade: session.grade },
      dedupe_key: `sp-ask:${ask.combo_key}`,
    }]);
  }, [isQuestion, ask.reason_class, ask.combo_key, askedKey, session.id,
      session.school, session.grade]);

  // "Yes" on a stale question means the school is still on the topic somebody
  // confirmed earlier in the week, so that is what gets recorded again.
  const conceptId = ask.state === "stale" ? ask.concept_id : topConcept?.id ?? null;

  const confirm = async (isRevision: boolean) => {
    if (!conceptId) return;
    setAnswer({ status: "saving", isRevision });
    try {
      const result = await curriculumAPI.confirmTopic({
        student_id: session.student_id,
        concept_id: conceptId,
        session_date: session.session_date,
        is_revision: isRevision,
        session_id: session.id,
        origin: "strip",
      });
      setAnswer({ status: "confirmed", observationId: result.id, isRevision });
    } catch {
      setAnswer({ status: inTestWindow ? "asking" : "idle" });
      showToast("Could not save the topic. Please try again.", "error");
    }
  };

  const undo = async () => {
    if (answer.status !== "confirmed") return;
    const previous = answer;
    setAnswer({ status: "saving", isRevision: previous.isRevision });
    try {
      await curriculumAPI.undoConfirm(previous.observationId);
      setAnswer({ status: "idle" });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setAnswer({ status: "idle" });
        return;
      }
      setAnswer(previous);
      showToast("Could not undo the confirmation. Please try again.", "error");
    }
  };

  const notSure = () => {
    setAnswer({ status: "unsure" });
    recordFeatureEvents([{
      event_key: "school_progress.answered_unsure",
      entity_type: "session",
      entity_id: session.id,
      context: { school: session.school, grade: session.grade },
    }]);
  };

  if (ask.state === "none") return null;
  if (ask.state !== "answered" && !conceptId) return null;

  if (answer.status === "confirmed" || answer.status === "unsure") {
    return (
      <div className={cn(ROW, SECTION_HEADER_BG)}>
        {answer.status === "unsure" ? (
          <span className={QUESTION_TEXT}>Thanks, we will ask someone else.</span>
        ) : (
          <span className={cn(RECORDED_TEXT, "flex-1 min-w-0")}>
            <Check className="h-3 w-3" />
            {answer.isRevision ? "Noted as revision, thanks!" : "Noted, thanks!"}
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

  // Somebody else has answered and the answer is current. A statement, plus
  // the one thing worth keeping open: this student's class may differ.
  if (ask.state === "answered") {
    const when = ask.answered_on ? formatWeekdayShort(ask.answered_on) : null;
    const who = ask.answered_by ? ` by ${ask.answered_by}` : "";
    return (
      <div className={cn(ROW, SECTION_HEADER_BG)}>
        <span className={QUESTION_TEXT}>
          {when ? `Confirmed ${when}${who}` : `Confirmed${who}`}
        </span>
        <button
          type="button"
          onClick={onCorrect}
          className="shrink-0 text-[10px] text-gray-500 dark:text-gray-400 hover:text-teal-700 dark:hover:text-teal-400 transition-colors"
        >
          Not this class?
        </button>
      </div>
    );
  }

  if (answer.status === "asking" || answer.status === "saving") {
    return (
      <div className={cn(ROW, SECTION_HEADER_BG)}>
        <KindQuestion
          saving={
            answer.status === "saving"
              ? answer.isRevision
                ? "revision"
                : "new"
              : null
          }
          onPick={confirm}
          onDismiss={() => setAnswer({ status: "idle" })}
          dismissLabel="Cancel"
          hitArea={hitArea}
          className="w-full"
        />
      </div>
    );
  }

  const stale = ask.state === "stale";
  const since = ask.answered_on ? formatWeekdayShort(ask.answered_on) : null;
  const topic = stale
    ? ask.name_en || ask.name_zh || "this topic"
    : topConcept?.name ?? "";
  const question = stale
    ? since
      ? `Still on ${topic} since ${since}?`
      : `Still on ${topic}?`
    : ask.split
      ? `Is this student's class on ${topic}?`
      : `${session.school} ${session.grade} on ${topic} this week?`;

  return (
    <div className={cn(ROW, SECTION_HEADER_BG)}>
      <span className={QUESTION_TEXT} title={question}>
        {question}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => (inTestWindow ? setAnswer({ status: "asking" }) : confirm(false))}
          className={RECORD_BTN}
        >
          <Check className="h-3 w-3" />
          {stale ? "Yes, still" : "Yes"}
        </button>
        <button
          type="button"
          onClick={onCorrect}
          className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium border border-teal-600/40 dark:border-teal-400/40 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors shrink-0"
        >
          {stale ? "Moved on…" : "No, it's…"}
        </button>
        {!stale && (
          <button
            type="button"
            onClick={notSure}
            className="shrink-0 text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors px-1"
          >
            Not sure
          </button>
        )}
      </div>
    </div>
  );
}
