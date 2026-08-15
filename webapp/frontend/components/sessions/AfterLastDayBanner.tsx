"use client";

/**
 * The header for the view that lists lessons still booked past somebody's last
 * working day.
 *
 * It sits above whichever view is showing, the week grid or the list, so it
 * lives here rather than inside either of them. The names are the point of it:
 * a count tells you how much is outstanding, but the reassigning is done one
 * tutor at a time, so each leaver gets a button that narrows everything below
 * to their own lessons.
 */
import { UserMinus } from "lucide-react";
import { cn } from "@/lib/utils";
import { departureLabel } from "@/lib/employment";
import type { LeaverOverrun } from "@/types";

interface AfterLastDayBannerProps {
  /** How many lessons are showing, after every other filter has had its say. */
  total: number;
  leavers: LeaverOverrun[];
  /** The tutor filter's current value, as the toolbar holds it. */
  selectedTutorId: string;
  onSelectTutor: (tutorId: string) => void;
  onClear: () => void;
}

export function AfterLastDayBanner({
  total,
  leavers,
  selectedTutorId,
  onSelectTutor,
  onClear,
}: AfterLastDayBannerProps) {
  return (
    <div className="flex flex-col gap-2 px-3 py-2 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg flex-shrink-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-rose-800 dark:text-rose-200">
          <UserMinus className="h-4 w-4" />
          <span className="font-medium">Sessions After a Tutor&apos;s Last Day</span>
          <span className="text-rose-600 dark:text-rose-400">({total} total)</span>
        </div>
        <button
          onClick={onClear}
          className="text-xs font-medium px-2 py-1 rounded border border-rose-300 dark:border-rose-700 bg-white dark:bg-[#1a1a1a] text-rose-800 dark:text-rose-200 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors"
        >
          Clear
        </button>
      </div>
      <p className="text-xs text-rose-700 dark:text-rose-300">
        These lessons are still assigned to someone who will not be here to teach them.
        Changing the tutor on each one clears it from this list.
      </p>
      {leavers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {leavers.map((leaver) => (
            <button
              key={leaver.tutor_id}
              onClick={() => onSelectTutor(String(leaver.tutor_id))}
              className={cn(
                "text-xs px-2 py-1 rounded border transition-colors",
                selectedTutorId === String(leaver.tutor_id)
                  ? "bg-rose-200 dark:bg-rose-900/60 border-rose-400 dark:border-rose-600 text-rose-900 dark:text-rose-100 font-medium"
                  : "bg-white dark:bg-[#1a1a1a] border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200 hover:bg-rose-50 dark:hover:bg-rose-900/30"
              )}
            >
              {leaver.tutor_name}, {departureLabel(leaver)?.toLowerCase()}, {leaver.sessions} to move
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
