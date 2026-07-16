"use client";

import { useMemo, useState } from "react";
import { CalendarClock, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { hkTodayIso } from "@/lib/summer-utils";
import { useCurriculumExams } from "@/lib/hooks";
import { conceptNameForStream } from "@/lib/curriculum-labels";
import type { CurriculumExamEvent } from "@/types";
import { CurriculumRevisionPack } from "./CurriculumRevisionPack";

interface CurriculumExamStripProps {
  school: string;
  grade: string;
  langStream: string | null;
  isMobile: boolean;
}

const MAX_CHIPS = 2;

/**
 * The selected school-grade's tests and exams as a horizontal strip, each
 * with the topics parsed from its scope. Upcoming tests pin to the front;
 * clicking any card opens its revision pack.
 */
export function CurriculumExamStrip({
  school,
  grade,
  langStream,
  isMobile,
}: CurriculumExamStripProps) {
  const { data, error } = useCurriculumExams(school, grade);
  const [packEventId, setPackEventId] = useState<number | null>(null);

  // SWR keeps the previous school's response while the new one loads
  // (global keepPreviousData); nothing on the cards names the school, so a
  // stale strip reads as the current school's tests. Hide it until the
  // response echoes the picked scope.
  const isStale = data != null && (data.school !== school || data.grade !== grade);

  const events = useMemo(() => {
    if (isStale || !data?.events?.length) return [];
    // HK calendar date, not UTC: an exam must stop being "Upcoming" at local
    // midnight, not at 08:00.
    const today = hkTodayIso();
    const upcoming = data.events.filter((e) => e.start_date >= today);
    const past = data.events.filter((e) => e.start_date < today).reverse();
    return [...upcoming, ...past];
  }, [data, isStale]);

  if (error && !data) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400 px-1">
        The tests for this school could not load. Refresh the page to try
        again.
      </p>
    );
  }

  if (events.length === 0) return null;

  const today = hkTodayIso();

  const dateLabel = (e: CurriculumExamEvent) =>
    new Date(e.start_date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  return (
    <div
      className={cn(
        "bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg overflow-hidden",
        !isMobile && "paper-texture"
      )}
    >
      <div className="flex items-baseline gap-2 px-4 py-2.5 border-b border-[#d4a574]/40 dark:border-[#8b6f47]/60">
        <CalendarClock className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400 shrink-0 self-center" />
        <h2 className="text-xs font-semibold text-gray-800 dark:text-gray-200 shrink-0">
          Tests and exams
        </h2>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
          Recorded for this school year. Click one to open its revision pack.
        </span>
      </div>

      <div className="flex gap-2.5 overflow-x-auto px-4 py-3">
        {events.map((event) => {
          const upcoming = event.start_date >= today;
          return (
            <button
              key={event.id}
              type="button"
              onClick={() => setPackEventId(event.id)}
              className={cn(
                "flex-none w-[190px] flex flex-col items-start gap-1.5 rounded-lg border p-2.5 text-left transition-colors",
                upcoming
                  ? "border-amber-400/70 dark:border-amber-500/50 bg-amber-50/60 dark:bg-amber-900/10 hover:border-amber-500"
                  : "border-[#d4a574]/40 dark:border-[#8b6f47]/50 hover:border-teal-500 dark:hover:border-teal-500"
              )}
            >
              <span className="flex items-center gap-1.5 flex-wrap">
                <span
                  className="text-[11px] font-semibold text-gray-800 dark:text-gray-200"
                  title={event.start_date}
                >
                  {dateLabel(event)}
                </span>
                <span
                  className={cn(
                    "text-[9px] font-semibold uppercase tracking-wide px-1.5 py-px rounded-full",
                    (event.event_type || "").toLowerCase() === "exam"
                      ? "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800"
                      : "text-gray-500 dark:text-gray-400 bg-black/[0.04] dark:bg-white/[0.06]"
                  )}
                >
                  {event.event_type || "Test"}
                </span>
                {upcoming && (
                  <span className="text-[9px] font-semibold text-amber-700 dark:text-amber-400">
                    Upcoming
                  </span>
                )}
              </span>

              {event.concepts.length > 0 ? (
                <span className="flex flex-wrap gap-1">
                  {event.concepts.slice(0, MAX_CHIPS).map((c) => (
                    <span
                      key={c.concept_id}
                      className="text-[10px] px-1.5 py-px rounded-full border border-teal-600/40 dark:border-teal-400/40 text-teal-700 dark:text-teal-400 truncate max-w-[10rem]"
                      title={conceptNameForStream(c, langStream)}
                    >
                      {conceptNameForStream(c, langStream)}
                    </span>
                  ))}
                  {event.concepts.length > MAX_CHIPS && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      +{event.concepts.length - MAX_CHIPS}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-[10px] italic text-gray-400 dark:text-gray-500">
                  No topics recognised for this test
                </span>
              )}

              {event.unmatched_lines.length > 0 && (
                <span
                  className="text-[9px] text-gray-400 dark:text-gray-500"
                  title="Lines from the test scope that could not be matched to topics. Open the revision pack to see them."
                >
                  {event.unmatched_lines.length} scope line
                  {event.unmatched_lines.length === 1 ? "" : "s"} not yet
                  matched
                </span>
              )}

              <span className="mt-auto inline-flex items-center text-[10px] font-medium text-teal-700 dark:text-teal-400">
                Revision pack
                <ChevronRight className="h-3 w-3" />
              </span>
            </button>
          );
        })}
      </div>

      {packEventId != null && (
        <CurriculumRevisionPack
          eventId={packEventId}
          onClose={() => setPackEventId(null)}
        />
      )}
    </div>
  );
}
