"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { parseTimeSlot } from "@/lib/calendar-utils";

const STORAGE_KEY = "lesson-nudge-state";

/**
 * Per-day record of which slots have shown the bubble and which Lesson
 * buttons were clicked. Scoping the whole record to a single date means a
 * new day simply overwrites it — no key pruning needed.
 */
interface NudgeState {
  date: string;
  seen: Record<string, true>;
  opened: Record<string, true>;
}

function readState(date: string): NudgeState {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "");
    if (stored && stored.date === date) {
      return { date, seen: stored.seen ?? {}, opened: stored.opened ?? {} };
    }
  } catch {
    // localStorage unavailable or unparseable; start fresh
  }
  return { date, seen: {}, opened: {} };
}

function writeState(state: NudgeState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage unavailable; component state still covers this page view
  }
}

interface LessonNudgeProps {
  /**
   * Time-and-content gate computed by the parent: now is inside this slot
   * and the slot has countable sessions belonging to the current tutor.
   */
  active: boolean;
  /** Today as YYYY-MM-DD; scopes the stored seen/opened record. */
  date: string;
  timeSlot: string;
  tutorId: string | number;
  /** The Lesson button this nudge decorates. */
  children: React.ReactNode;
}

/**
 * Wraps a Lesson button with a pulsing dot while the slot's lesson is in
 * progress and a one-time bubble hint pointing tutors at lesson mode.
 * Clicking the button quiets the nudge for that slot for the rest of the day.
 */
export function LessonNudge({ active, date, timeSlot, tutorId, children }: LessonNudgeProps) {
  const slotKey = `${timeSlot}-${tutorId}`;
  const [opened, setOpened] = useState(false);
  const [showBubble, setShowBubble] = useState(false);
  const bubbleRef = useRef<HTMLSpanElement>(null);

  // Read after mount so SSR and the first client render agree.
  useEffect(() => {
    setOpened(!!readState(date).opened[slotKey]);
  }, [date, slotKey]);

  const suppressed = !active || opened;

  // One bubble per slot per day: mark it seen the moment it appears.
  useEffect(() => {
    if (suppressed) {
      setShowBubble(false);
      return;
    }
    const state = readState(date);
    if (state.seen[slotKey]) return;
    state.seen[slotKey] = true;
    writeState(state);
    setShowBubble(true);
    const timer = setTimeout(() => setShowBubble(false), 15000);
    return () => clearTimeout(timer);
  }, [suppressed, date, slotKey]);

  // Capture phase, so the Lesson button's own stopPropagation cannot hide the click.
  const handleClickCapture = (e: React.MouseEvent) => {
    if (bubbleRef.current?.contains(e.target as Node)) return;
    setOpened(true);
    setShowBubble(false);
    const state = readState(date);
    state.opened[slotKey] = true;
    writeState(state);
  };

  const slotStart = parseTimeSlot(timeSlot)?.start ?? timeSlot;

  return (
    <span className="relative inline-flex" onClickCapture={handleClickCapture}>
      {children}
      {!suppressed && (
        <span className="pointer-events-none absolute -right-1 -top-1 flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
        </span>
      )}
      {showBubble && (
        <span
          ref={bubbleRef}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full z-40 mt-2 w-56 rounded-lg border border-[#d4a574] bg-[#fef9f3] px-3 py-2 shadow-lg dark:border-[#8b6f47] dark:bg-[#2d2618]"
        >
          <span className="absolute -top-1 right-4 h-2 w-2 rotate-45 border-l border-t border-[#d4a574] bg-[#fef9f3] dark:border-[#8b6f47] dark:bg-[#2d2618]" />
          <span className="block pr-4 text-left text-xs font-normal normal-case leading-snug text-gray-700 dark:text-gray-300">
            Your {slotStart} lesson has started. Try lesson mode for a full-class view.
          </span>
          <button
            onClick={() => setShowBubble(false)}
            className="absolute right-1 top-1 rounded p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Dismiss hint"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      )}
    </span>
  );
}
