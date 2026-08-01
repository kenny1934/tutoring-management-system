"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Session } from "@/types";

/**
 * Statuses lesson mode itself filters out; a slot with none of these left
 * has nothing to teach, so it should not nudge.
 */
export function isLessonTeachable(session: Session): boolean {
  const status = session.session_status;
  return (
    status !== "Cancelled" &&
    !status.includes("Pending Make-up") &&
    !status.includes("Make-up Booked")
  );
}

const OPENED_PREFIX = "lesson-opened-";
const SEEN_PREFIX = "lesson-nudge-seen-";

/** Keys embed the date, so anything from an earlier day is stale. */
function pruneStaleKeys(prefix: string, date: string) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix) && !key.startsWith(prefix + date)) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // localStorage unavailable; nothing to prune
  }
}

interface LessonNudgeProps {
  /**
   * Time-and-content gate computed by the parent: now is inside this slot
   * and the slot has teachable sessions belonging to the current tutor.
   */
  active: boolean;
  /** Normalised slot start (e.g. "16:45"), used in the bubble copy. */
  slotStart: string;
  /** Today as YYYY-MM-DD; scopes the storage keys and prunes older days. */
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
export function LessonNudge({ active, slotStart, date, timeSlot, tutorId, children }: LessonNudgeProps) {
  const keyCore = `${date}-${timeSlot}-${tutorId}`;
  const [opened, setOpened] = useState(false);
  const [showBubble, setShowBubble] = useState(false);
  const bubbleRef = useRef<HTMLSpanElement>(null);

  // Read after mount so SSR and the first client render agree.
  useEffect(() => {
    try {
      setOpened(localStorage.getItem(OPENED_PREFIX + keyCore) === "1");
    } catch {
      // localStorage unavailable; keep false
    }
  }, [keyCore]);

  const suppressed = !active || opened;

  // One bubble per slot per day: mark it seen the moment it appears.
  useEffect(() => {
    if (suppressed) {
      setShowBubble(false);
      return;
    }
    try {
      if (localStorage.getItem(SEEN_PREFIX + keyCore) === "1") return;
      localStorage.setItem(SEEN_PREFIX + keyCore, "1");
      pruneStaleKeys(SEEN_PREFIX, date);
    } catch {
      // localStorage unavailable; the bubble may repeat, which is harmless
    }
    setShowBubble(true);
    const timer = setTimeout(() => setShowBubble(false), 15000);
    return () => clearTimeout(timer);
  }, [suppressed, keyCore, date]);

  // Capture phase, so the Lesson button's own stopPropagation cannot hide the click.
  const handleClickCapture = (e: React.MouseEvent) => {
    if (bubbleRef.current?.contains(e.target as Node)) return;
    setOpened(true);
    setShowBubble(false);
    try {
      localStorage.setItem(OPENED_PREFIX + keyCore, "1");
      pruneStaleKeys(OPENED_PREFIX, date);
    } catch {
      // localStorage unavailable; state alone quiets this page view
    }
  };

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
