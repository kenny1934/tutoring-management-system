"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, ChevronDown, ChevronRight } from "lucide-react";
import type { Session, CurriculumTimelineConcept } from "@/types";
import { cn } from "@/lib/utils";
import { MobileBottomSheet } from "@/components/ui/mobile-bottom-sheet";
import { useCurriculumSuggestions, useCurriculumTimeline } from "@/lib/hooks";
import {
  conceptNameForStream,
  isCurriculumEligible,
  priorAcademicYear,
  sourcesText,
} from "@/lib/curriculum-labels";

interface WeekData {
  week_number: number;
  concepts: CurriculumTimelineConcept[];
}

interface CurriculumTabProps {
  session: Session;
}

// Module-level so its identity is stable across renders — defined inline it
// would remount (and replay its expand animation) on every hover of the tab.
function WeekSection({
  data,
  badge,
  badgeVariant,
  emphasized,
  expanded,
  onToggle,
  langStream,
}: {
  data: WeekData;
  badge: string;
  badgeVariant: "secondary" | "success";
  emphasized?: boolean;
  expanded: boolean;
  onToggle: () => void;
  langStream: string | null;
}) {
  return (
    <div className="mb-3">
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full flex items-center gap-2 mb-2 hover:bg-teal-700/10 dark:hover:bg-teal-600/20 p-2 -mx-2 rounded transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-teal-700 dark:text-teal-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-teal-700 dark:text-teal-400" />
        )}
        <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
          Week {data.week_number}
        </h4>
        <Badge variant={badgeVariant} className="text-xs ml-auto">
          {badge}
        </Badge>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div
              className={cn(
                "p-3 rounded space-y-2",
                emphasized
                  ? "bg-teal-200/50 dark:bg-teal-800/40 border border-teal-600/30 ring-2 ring-teal-500/30"
                  : "bg-teal-100/50 dark:bg-teal-900/30 border border-teal-600/20"
              )}
            >
              {data.concepts.map((c) => (
                <div key={c.concept_id}>
                  <p
                    className={cn(
                      "text-xs leading-relaxed",
                      c.rank === 1
                        ? "font-medium text-foreground/90"
                        : "text-foreground/70"
                    )}
                  >
                    {conceptNameForStream(c, langStream)}
                  </p>
                  <p className="text-[10px] text-foreground/50">
                    Seen in {sourcesText(c.sources)}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function CurriculumTab({ session }: CurriculumTabProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isWeekBeforeExpanded, setIsWeekBeforeExpanded] = useState(false);
  const [isSameWeekExpanded, setIsSameWeekExpanded] = useState(true);
  const [isWeekAfterExpanded, setIsWeekAfterExpanded] = useState(false);

  const eligible = isCurriculumEligible(session);

  // The suggestions endpoint resolves the session date to an academic week and
  // tells us whether this year's records exist or last year's are the best
  // available; the timeline call then supplies the week window around it.
  const { data: sugg } = useCurriculumSuggestions(
    eligible ? session.student_id : null,
    session.session_date
  );
  const tier = sugg?.tier;
  const hasWeekContext =
    eligible &&
    !!sugg &&
    !sugg.reason &&
    sugg.week_number != null &&
    sugg.academic_year != null &&
    (tier === "this_year" || tier === "last_year");
  const timelineYear = hasWeekContext
    ? tier === "last_year"
      ? priorAcademicYear(sugg!.academic_year!)
      : sugg!.academic_year
    : null;

  const { data: timeline } = useCurriculumTimeline(
    hasWeekContext ? session.school : null,
    hasWeekContext ? session.grade : null,
    session.lang_stream || null,
    timelineYear
  );

  if (!hasWeekContext || !timeline) return null;

  const week = sugg!.week_number!;
  const findWeek = (w: number): WeekData | null =>
    timeline.weeks.find((entry) => entry.week_number === w) || null;
  const weekBefore = findWeek(week - 1);
  const sameWeek = findWeek(week);
  const weekAfter = findWeek(week + 1);

  if (!weekBefore && !sameWeek && !weekAfter) return null;

  const isLastYear = tier === "last_year";
  const langStream = session.lang_stream || null;

  // A plain element (not an inline component) so the subtree keeps its
  // identity — and its scroll position — across re-renders.
  const tabContent = (
    <div className="relative p-4 max-h-full overflow-y-auto scrollbar-thin scrollbar-thumb-teal-600 scrollbar-track-transparent [scrollbar-gutter:stable]">
      {/* Header */}
      <div className="mb-4 pb-3 border-b-2 border-dashed border-teal-600/30">
        <div className="flex items-center gap-2 mb-2">
          <GraduationCap className="h-4 w-4 text-teal-700 dark:text-teal-400" />
          <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
            School Progress
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="text-xs">
            {session.school} {session.grade}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {isLastYear ? `Last year · ${timeline.academic_year}` : timeline.academic_year}
          </Badge>
          <Link
            href={`/curriculum?school=${encodeURIComponent(session.school || "")}&grade=${encodeURIComponent(session.grade || "")}&week=${week}${timelineYear ? `&year=${encodeURIComponent(timelineYear)}` : ""}`}
            className="text-[11px] text-teal-700 dark:text-teal-400 hover:underline ml-auto"
          >
            See the full year →
          </Link>
        </div>
      </div>

      {weekBefore && (
        <WeekSection
          data={weekBefore}
          badge="Previous"
          badgeVariant="secondary"
          expanded={isWeekBeforeExpanded}
          onToggle={() => setIsWeekBeforeExpanded(!isWeekBeforeExpanded)}
          langStream={langStream}
        />
      )}
      {sameWeek && (
        <WeekSection
          data={sameWeek}
          badge="Same Week"
          badgeVariant="success"
          emphasized
          expanded={isSameWeekExpanded}
          onToggle={() => setIsSameWeekExpanded(!isSameWeekExpanded)}
          langStream={langStream}
        />
      )}
      {weekAfter && (
        <WeekSection
          data={weekAfter}
          badge="Next"
          badgeVariant="secondary"
          expanded={isWeekAfterExpanded}
          onToggle={() => setIsWeekAfterExpanded(!isWeekAfterExpanded)}
          langStream={langStream}
        />
      )}
    </div>
  );

  return (
    <>
      {/* Mobile FAB Button */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className="md:hidden fixed bottom-4 right-4 z-40 w-12 h-12 bg-teal-600 dark:bg-teal-700 rounded-full shadow-lg flex items-center justify-center border-2 border-teal-700 dark:border-teal-800"
        style={{
          background: 'linear-gradient(135deg, #0d9488, #0f766e)',
        }}
      >
        <GraduationCap className="h-5 w-5 text-white" />
      </button>

      {/* Mobile Bottom Sheet */}
      <MobileBottomSheet
        isOpen={isMobileOpen}
        onClose={() => setIsMobileOpen(false)}
        title="School Progress"
        className="bg-teal-50 dark:bg-teal-950"
      >
        {tabContent}
      </MobileBottomSheet>

      {/* Desktop Sidebar Tab */}
      <div className="hidden md:block fixed right-0 top-[45%] z-40 pointer-events-none">
        <motion.div
          initial={{ x: 280 }}
          animate={{ x: isExpanded ? 0 : 280 }}
          transition={{ type: "spring", stiffness: 200, damping: 25 }}
          className="flex pointer-events-auto"
          onMouseEnter={() => setIsExpanded(true)}
          onMouseLeave={() => setIsExpanded(false)}
        >
          {/* Bookmark Tab (sticks out) */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="relative h-32 w-12 bg-teal-600 dark:bg-teal-700 rounded-l-lg shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center border-l-4 border-t-4 border-b-4 border-teal-700 dark:border-teal-800"
            style={{
              background: 'linear-gradient(to right, #0d9488, #0f766e)',
            }}
          >
            {/* Tab texture */}
            <div className="absolute inset-0 opacity-20 rounded-l-lg" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paper'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.04' numOctaves='5' /%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23paper)' opacity='0.5'/%3E%3C/svg%3E")`,
            }} />

            {/* Vertical text */}
            <div className="relative flex flex-col items-center gap-1">
              <GraduationCap className="h-5 w-5 text-white/90" />
              <div
                className="text-xs font-semibold text-white/90 tracking-wider"
                style={{
                  writingMode: 'vertical-rl',
                  textOrientation: 'mixed',
                  textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                }}
              >
                CURRICULUM
              </div>
            </div>
          </button>

          {/* Expanded Content Card */}
          <div className="relative w-72 max-h-[calc(65vh-6rem)] bg-teal-50/95 dark:bg-teal-950/95 shadow-2xl border-4 border-teal-600 dark:border-teal-700 rounded-r-lg overflow-hidden">
            {/* Paper texture background */}
            <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paper'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.04' numOctaves='5' /%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23paper)' opacity='0.5'/%3E%3C/svg%3E")`,
            }} />

            {tabContent}
          </div>
        </motion.div>
      </div>
    </>
  );
}
