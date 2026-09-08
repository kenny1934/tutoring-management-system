"use client";

import { Check, Loader2, RotateCcw, BookPlus, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The look and the wording shared by everything that records a school's topic.
 *
 * Two kinds of small control live in the School Progress surfaces, and they
 * must never share a look. Anything that RECORDS something (an answer to the
 * question, the two answers below it) is a rounded rectangle with the green
 * tint and leading icon that quick attend and the homework marks use, so it
 * reads as "this writes a fact". Anything that OPENS something (the builds-on
 * chips, the header links) stays a teal outline pill with a trailing arrow. An
 * earlier version gave both the same teal outline, and tutors could not tell
 * whether "Revising this" would open a list or record an answer.
 */
export const RECORD_BTN =
  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border transition-colors shrink-0 disabled:opacity-50 " +
  "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800 " +
  "hover:bg-green-200 dark:hover:bg-green-900/50";

export const RECORDED_TEXT =
  "inline-flex items-center gap-1 text-[10px] text-green-700 dark:text-green-400 shrink-0";

export const KIND_QUESTION = "Revision or New Topic?";

/**
 * A topic somebody has recorded while this modal has been open.
 *
 * Every School Progress surface reads one map of these, keyed by topic, rather
 * than remembering its own answers. The question on the collapsed strip, the
 * buttons in the list below it and the search box are three ways of saying the
 * same thing about the same school week, so an answer given on any one of them
 * has to show on the others: answering on the strip and then opening the list
 * used to leave an unpressed button beside a topic that had just been
 * confirmed, which invited a second answer for the same lesson.
 */
export interface RecordedTopic {
  observationId: number;
  isRevision: boolean;
  /** For the surfaces whose own row no longer names the topic by the time the
   *  answer is shown. */
  name: string;
}

export type RecordedTopics = Record<number, RecordedTopic>;

/** What every surface shows once a topic is recorded, Undo included. */
export function RecordedNote({
  isRevision,
  onUndo,
  busy = false,
  className,
}: {
  isRevision: boolean;
  onUndo: () => void;
  /** An undo already in flight. The note stays put while it runs, so the row
   *  does not flip back to a button and then away again. */
  busy?: boolean;
  className?: string;
}) {
  return (
    <span className={cn(RECORDED_TEXT, className)}>
      <Check className="h-3 w-3" />
      {isRevision ? "Noted as revision, thanks!" : "Noted, thanks!"}
      <button
        type="button"
        onClick={onUndo}
        disabled={busy}
        className="inline-flex items-center gap-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50 ml-1"
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Undo2 className="h-3 w-3" />
        )}
        Undo
      </button>
    </span>
  );
}

/** The header gradient, ending on the exercise modal's own panel colours.
 *  White or near-black endpoints leave a visible seam on the desk palette.
 *  Shared by the header, the loading placeholder and the question row beneath
 *  them, so the strip reads as one block rather than stacked boxes. */
export const SECTION_HEADER_BG =
  "bg-gradient-to-r from-teal-50 to-[#fef9f3] dark:from-teal-900/20 dark:to-[#2d2618]";

export const REVISION_TITLE =
  "Record that the school is revising this topic for the test. Revision does not move the topic timeline.";
export const NEW_TOPIC_TITLE =
  "Record that the school is teaching this as a new topic. New teaching builds the topic timeline.";

/**
 * The question a tap raises during a test window. Nothing has been written
 * when this shows, so the X simply puts the previous control back. `saving`
 * names the answer in flight so its own button carries the spinner.
 */
export function KindQuestion({
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
