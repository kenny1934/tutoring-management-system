"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, ChevronDown, ChevronRight } from "lucide-react";
import type { CurriculumSuggestion } from "@/types";
import { cn } from "@/lib/utils";
import { MobileBottomSheet } from "@/components/ui/mobile-bottom-sheet";

interface CurriculumTabProps {
  suggestion?: CurriculumSuggestion | null;
}

export function CurriculumTab({ suggestion }: CurriculumTabProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isWeekBeforeExpanded, setIsWeekBeforeExpanded] = useState(false);
  const [isSameWeekExpanded, setIsSameWeekExpanded] = useState(true);
  const [isWeekAfterExpanded, setIsWeekAfterExpanded] = useState(false);

  if (!suggestion) return null;

  const hasWeekBefore = suggestion.week_before_topic && suggestion.week_before_topic.trim() !== '';
  const hasSameWeek = suggestion.same_week_topic && suggestion.same_week_topic.trim() !== '';
  const hasWeekAfter = suggestion.week_after_topic && suggestion.week_after_topic.trim() !== '';

  if (!hasWeekBefore && !hasSameWeek && !hasWeekAfter) return null;

  // Calculate last year from current academic year (e.g., "2025-2026" → "2024-2025")
  const calculateLastYear = (currentYear?: string): string => {
    if (!currentYear) return 'N/A';
    const years = currentYear.split('-');
    if (years.length !== 2) return 'N/A';
    const startYear = parseInt(years[0]) - 1;
    const endYear = parseInt(years[1]) - 1;
    return `${startYear}-${endYear}`;
  };

  const lastYear = calculateLastYear(suggestion.current_academic_year);

  // Shared content component
  const TabContent = () => (
    <div className="relative p-4 max-h-full overflow-y-auto scrollbar-thin scrollbar-thumb-teal-600 scrollbar-track-transparent [scrollbar-gutter:stable]">
      {/* Header */}
      <div className="mb-4 pb-3 border-b-2 border-dashed border-teal-600/30">
        <div className="flex items-center gap-2 mb-2">
          <Lightbulb className="h-4 w-4 text-teal-700 dark:text-teal-400" />
          <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">Last Year&apos;s Curriculum</h3>
        </div>
        <Badge variant="secondary" className="text-xs">
          {lastYear}
        </Badge>
      </div>

      {/* Week Before (N-1) - Collapsible */}
      {hasWeekBefore && (
        <div className="mb-3">
          <button
            onClick={() => setIsWeekBeforeExpanded(!isWeekBeforeExpanded)}
            className="w-full flex items-center gap-2 mb-2 hover:bg-teal-700/10 dark:hover:bg-teal-600/20 p-2 -mx-2 rounded transition-colors"
          >
            {isWeekBeforeExpanded ? (
              <ChevronDown className="h-4 w-4 text-teal-700 dark:text-teal-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-teal-700 dark:text-teal-400" />
            )}
            <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
              Week {suggestion.week_before_number}
            </h4>
            <Badge variant="secondary" className="text-xs ml-auto">
              Previous
            </Badge>
          </button>

          <AnimatePresence>
            {isWeekBeforeExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="p-3 bg-teal-100/50 dark:bg-teal-900/30 rounded border border-teal-600/20">
                  <p className="text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap">
                    {suggestion.week_before_topic}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Same Week (N) - Collapsible (default expanded) */}
      {hasSameWeek && (
        <div className="mb-3">
          <button
            onClick={() => setIsSameWeekExpanded(!isSameWeekExpanded)}
            className="w-full flex items-center gap-2 mb-2 hover:bg-teal-700/10 dark:hover:bg-teal-600/20 p-2 -mx-2 rounded transition-colors"
          >
            {isSameWeekExpanded ? (
              <ChevronDown className="h-4 w-4 text-teal-700 dark:text-teal-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-teal-700 dark:text-teal-400" />
            )}
            <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
              Week {suggestion.same_week_number}
            </h4>
            <Badge variant="success" className="text-xs ml-auto">
              Same Week
            </Badge>
          </button>

          <AnimatePresence>
            {isSameWeekExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="p-3 bg-teal-200/50 dark:bg-teal-800/40 rounded border border-teal-600/30 ring-2 ring-teal-500/30">
                  <p className="text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap font-medium">
                    {suggestion.same_week_topic}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Week After (N+1) - Collapsible */}
      {hasWeekAfter && (
        <div className="mb-3">
          <button
            onClick={() => setIsWeekAfterExpanded(!isWeekAfterExpanded)}
            className="w-full flex items-center gap-2 mb-2 hover:bg-teal-700/10 dark:hover:bg-teal-600/20 p-2 -mx-2 rounded transition-colors"
          >
            {isWeekAfterExpanded ? (
              <ChevronDown className="h-4 w-4 text-teal-700 dark:text-teal-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-teal-700 dark:text-teal-400" />
            )}
            <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
              Week {suggestion.week_after_number}
            </h4>
            <Badge variant="secondary" className="text-xs ml-auto">
              Next
            </Badge>
          </button>

          <AnimatePresence>
            {isWeekAfterExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="p-3 bg-teal-100/50 dark:bg-teal-900/30 rounded border border-teal-600/20">
                  <p className="text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap">
                    {suggestion.week_after_topic}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
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
        <Lightbulb className="h-5 w-5 text-white" />
      </button>

      {/* Mobile Bottom Sheet */}
      <MobileBottomSheet
        isOpen={isMobileOpen}
        onClose={() => setIsMobileOpen(false)}
        title="Curriculum Suggestions"
        className="bg-teal-50 dark:bg-teal-950"
      >
        <TabContent />
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
              <Lightbulb className="h-5 w-5 text-white/90" />
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

            <TabContent />
          </div>
        </motion.div>
      </div>
    </>
  );
}
