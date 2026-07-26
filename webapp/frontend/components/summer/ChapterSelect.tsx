"use client";

import { cn } from "@/lib/utils";
import { chapterLabel, type Chapter } from "@/lib/summer-courseware-defaults";

/** Select value for the mixed-slot default: resolve per student's lesson. */
const FOLLOW_OWN_LESSON = "__follow_own_lesson__";

const PALETTES = {
  gray: "border-[#e8d4b8] dark:border-[#6b5a4a] bg-white/70 dark:bg-[#1a1a1a]/70 text-gray-700 dark:text-gray-300 [&>option]:bg-white [&>option]:text-gray-700 dark:[&>option]:bg-[#2a2318] dark:[&>option]:text-gray-300",
  amber: "border-[#e8d4b8] dark:border-[#5a4d3a] bg-white/70 dark:bg-[#1a1a1a]/70 text-[#6b5a42] dark:text-[#c4a882] [&>option]:bg-white [&>option]:text-[#6b5a42] dark:[&>option]:bg-[#2a2318] dark:[&>option]:text-[#c4a882]",
};

/**
 * Chapter dropdown shared by the summer materials panels. Bulk surfaces
 * with a mixed-lesson group show the follow option ("each student's own
 * lesson", reported as a null code); picking a chapter is then the
 * same-chapter-for-everyone override.
 */
export function ChapterSelect({
  chapter,
  chapters,
  onChange,
  followMode,
  showFollowOption,
  variant = "gray",
  className,
}: {
  chapter?: Chapter;
  chapters: Chapter[];
  /** Receives the picked chapter code, or null for the follow option. */
  onChange: (code: string | null) => void;
  /** True while the follow option is active. */
  followMode?: boolean;
  showFollowOption?: boolean;
  variant?: keyof typeof PALETTES;
  className?: string;
}) {
  return (
    <select
      value={followMode ? FOLLOW_OWN_LESSON : chapter?.code ?? ""}
      onChange={(e) => onChange(e.target.value === FOLLOW_OWN_LESSON ? null : e.target.value)}
      className={cn("w-full px-1.5 py-1 rounded border text-xs", PALETTES[variant], className)}
    >
      {showFollowOption && (
        <option value={FOLLOW_OWN_LESSON}>Each student&apos;s own lesson</option>
      )}
      {!chapter && !followMode && <option value="">Choose chapter…</option>}
      {chapters.map((c) => (
        <option key={c.code} value={c.code}>
          {chapterLabel(c)}
        </option>
      ))}
    </select>
  );
}
