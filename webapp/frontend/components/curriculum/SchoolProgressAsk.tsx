"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Undo2, X } from "lucide-react";
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
import { TopicCorrectionPicker } from "@/components/curriculum/TopicCorrectionPicker";
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
 * Disagreeing is answered here too, on the same line, and it offers an answer
 * before it offers the keyboard. Saying "No, it's..." used to open the section
 * below and drop the cursor into an empty search box, which on a tablet threw
 * the keyboard over half the modal and asked the tutor to do the work. The
 * panel has already ranked up to three topics for this school week, so the two
 * the question is not about become one-tap answers, and typing is only needed
 * when the school is on none of them.
 *
 * The rules that keep it from crowding the modal are worth stating, because
 * they are easy to break by accident:
 *
 *   - one line at rest, and only when there is a question worth asking or an
 *     answer worth reporting. Otherwise the strip looks as it always did. It
 *     may take a second line while an answer is being given, and it gives that
 *     line back as soon as one is.
 *   - nothing below the strip ever moves. Answering, correcting and searching
 *     all happen on this row, so the modal never jumps under a tapping thumb.
 *   - the question truncates before the answers do, so the buttons keep their
 *     hit area on a narrow screen.
 *   - no new colours. Answers reuse the green that every other control which
 *     records a fact already uses, and the teal outline stays on the controls
 *     that only open something.
 *
 * The server decides when to ask, how often, and why (see _ask_block in
 * routers/curriculum.py). This component only renders the answer it gets and
 * reports back that the question was seen.
 */
type Topic = { id: number; name: string };

type AnswerState =
  | { status: "idle" }
  /** Disagreement, before any typing: the other topics ranked for this school
   *  week, one tap each. */
  | { status: "correcting" }
  /** The search box, for a school on a topic none of those offered. */
  | { status: "picking" }
  | { status: "asking"; concept: Topic; corrected: boolean }
  | { status: "saving"; isRevision: boolean; concept: Topic; corrected: boolean }
  | {
      status: "confirmed";
      observationId: number;
      isRevision: boolean;
      concept: Topic;
      corrected: boolean;
    }
  | { status: "unsure" };

const ROW_FRAME =
  "px-3 py-1.5 border-t border-teal-100/60 dark:border-teal-900/40";
const ROW = `flex items-center gap-2 ${ROW_FRAME}`;
const QUESTION_TEXT =
  "text-[10px] text-gray-500 dark:text-gray-400 truncate flex-1 min-w-0";
// Opens something rather than recording it, so it keeps the teal outline the
// rest of the panel gives to controls that lead somewhere.
const OUTLINE_BTN =
  "inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium border border-teal-600/40 dark:border-teal-400/40 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors shrink-0";
const CORRECTION_PROMPT = "Then what are they on?";

export function SchoolProgressAsk({
  ask,
  session,
  suggestions,
  stream,
  inTestWindow,
  hidden = false,
}: {
  ask: CurriculumAsk;
  session: Session;
  /** The topics ranked for this school week, strongest first. The question is
   *  about the first one, and the others are what "No, it's..." offers. */
  suggestions: Topic[];
  /** Chinese or English topic names in the search box, following the class. */
  stream: string | null;
  inTestWindow: boolean;
  /** True while the section below is open, where the per-topic buttons ask the
   *  same thing with more room. The row renders nothing but stays mounted, so
   *  an answer survives the tutor opening the section and closing it again.
   *  Unmounting it here is what used to put the question back on screen after
   *  it had already been answered. */
  hidden?: boolean;
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

  // The topic this row is about: the one already on record when the question
  // is whether the school has moved on or when somebody else has answered,
  // and the strongest suggestion otherwise.
  const asked: Topic | null =
    (ask.state === "stale" || ask.state === "answered") && ask.concept_id
      ? {
          id: ask.concept_id,
          name: ask.name_en || ask.name_zh || "this topic",
        }
      : suggestions[0] ?? null;

  // What disagreeing offers before it offers the keyboard.
  const alternatives = suggestions.filter((s) => s.id !== asked?.id);

  const confirm = async (
    concept: Topic,
    isRevision: boolean,
    corrected: boolean
  ) => {
    setAnswer({ status: "saving", isRevision, concept, corrected });
    try {
      const result = await curriculumAPI.confirmTopic({
        student_id: session.student_id,
        concept_id: concept.id,
        session_date: session.session_date,
        is_revision: isRevision,
        session_id: session.id,
        origin: "strip",
      });
      setAnswer({
        status: "confirmed",
        observationId: result.id,
        isRevision,
        concept,
        corrected,
      });
    } catch {
      // Back to where the choice was made, so a retry is one tap away.
      setAnswer(
        inTestWindow
          ? { status: "asking", concept, corrected }
          : corrected
            ? { status: "correcting" }
            : { status: "idle" }
      );
      showToast("Could not save the topic. Please try again.", "error");
    }
  };

  const undo = async () => {
    if (answer.status !== "confirmed") return;
    const previous = answer;
    setAnswer({
      status: "saving",
      isRevision: previous.isRevision,
      concept: previous.concept,
      corrected: previous.corrected,
    });
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

  // Nothing else on the strip is offering these topics, so a week with only
  // the one being asked about goes straight to the search box.
  const startCorrection = () =>
    setAnswer({ status: alternatives.length > 0 ? "correcting" : "picking" });

  const pickAlternative = (concept: Topic) =>
    inTestWindow
      ? setAnswer({ status: "asking", concept, corrected: true })
      : confirm(concept, false, true);

  if (hidden) return null;
  if (ask.state === "none") return null;
  if (ask.state !== "answered" && !asked) return null;

  if (answer.status === "confirmed" || answer.status === "unsure") {
    return (
      <div className={cn(ROW, SECTION_HEADER_BG)}>
        {answer.status === "unsure" ? (
          <>
            <span className={QUESTION_TEXT}>Thanks, we will ask someone else.</span>
            {/* A mis-tap on a small button should not cost the answer. The
                event recording that somebody did not know has already been
                sent and stays sent: they did tap it, and a real answer given
                afterwards is recorded too, so both are visible in a report. */}
            <button
              type="button"
              onClick={() => setAnswer({ status: "idle" })}
              className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors px-1"
            >
              <Undo2 className="h-3 w-3" />
              Undo
            </button>
          </>
        ) : (
          <>
            {/* A corrected topic is named back, because the row that offered
                it has gone and the tutor should see what was recorded. */}
            {answer.corrected && (
              <span className="text-[11px] text-gray-700 dark:text-gray-300 truncate flex-1 min-w-0">
                {answer.concept.name}
              </span>
            )}
            <span className={cn(RECORDED_TEXT, !answer.corrected && "flex-1 min-w-0")}>
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
          </>
        )}
      </div>
    );
  }

  // Naming a topic nothing suggested. It opens here rather than in the section
  // below, so the strip stays where the tutor is looking.
  if (answer.status === "picking") {
    return (
      <div className={cn(ROW_FRAME, SECTION_HEADER_BG)}>
        <TopicCorrectionPicker
          session={session}
          // Only the topic just rejected is held back. Everything the chips
          // offered stays findable by name, since the chips have gone.
          suggestedIds={asked ? [asked.id] : []}
          stream={stream}
          inTestWindow={inTestWindow}
          open
          onOpenChange={(open) => {
            if (!open) setAnswer({ status: "idle" });
          }}
          origin="strip"
        />
      </div>
    );
  }

  if (answer.status === "correcting") {
    return (
      <div
        className={cn(
          ROW_FRAME,
          SECTION_HEADER_BG,
          "flex flex-wrap items-center gap-x-2 gap-y-1"
        )}
      >
        <span className="text-[10px] text-gray-500 dark:text-gray-400 shrink-0">
          {CORRECTION_PROMPT}
        </span>
        {alternatives.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => pickAlternative(c)}
            className={cn(RECORD_BTN, "max-w-[60%]")}
          >
            {/* min-w-0 or a long topic name pushes the chip past its cap
                instead of ellipsing inside it. */}
            <span className="truncate min-w-0">{c.name}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setAnswer({ status: "picking" })}
          className={OUTLINE_BTN}
        >
          Other topic…
        </button>
        <button
          type="button"
          aria-label="Cancel"
          onClick={() => setAnswer({ status: "idle" })}
          className={cn(
            hitArea,
            "ml-auto rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          )}
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  if (answer.status === "asking" || answer.status === "saving") {
    const { concept, corrected } = answer;
    return (
      <div className={cn(ROW, SECTION_HEADER_BG)}>
        {corrected && (
          <span className="text-[11px] text-gray-700 dark:text-gray-300 truncate flex-1 min-w-0">
            {concept.name}
          </span>
        )}
        <KindQuestion
          saving={
            answer.status === "saving"
              ? answer.isRevision
                ? "revision"
                : "new"
              : null
          }
          onPick={(isRevision) => confirm(concept, isRevision, corrected)}
          onDismiss={() =>
            setAnswer(corrected ? { status: "correcting" } : { status: "idle" })
          }
          dismissLabel={corrected ? "Back to the topics" : "Cancel"}
          hitArea={hitArea}
          className={corrected ? undefined : "w-full"}
        />
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
          onClick={startCorrection}
          className="shrink-0 text-[10px] text-gray-500 dark:text-gray-400 hover:text-teal-700 dark:hover:text-teal-400 transition-colors"
        >
          Not this class?
        </button>
      </div>
    );
  }

  const stale = ask.state === "stale";
  const since = ask.answered_on ? formatWeekdayShort(ask.answered_on) : null;
  const topic = asked?.name ?? "";
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
          onClick={() =>
            asked &&
            (inTestWindow
              ? setAnswer({ status: "asking", concept: asked, corrected: false })
              : confirm(asked, false, false))
          }
          className={RECORD_BTN}
        >
          <Check className="h-3 w-3" />
          {stale ? "Yes, still" : "Yes"}
        </button>
        <button
          type="button"
          onClick={startCorrection}
          className={OUTLINE_BTN}
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
