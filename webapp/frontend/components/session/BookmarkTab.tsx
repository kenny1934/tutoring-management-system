"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { History, Star, Home, ChevronDown, ChevronRight, BookOpen } from "lucide-react";
import type { Session, HomeworkCompletion } from "@/types";
import { cn } from "@/lib/utils";

interface BookmarkTabProps {
  previousSession: Session["previous_session"];
  homeworkToCheck?: HomeworkCompletion[];
}

export function BookmarkTab({ previousSession, homeworkToCheck = [] }: BookmarkTabProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isClassworkExpanded, setIsClassworkExpanded] = useState(false);
  const [isHomeworkExpanded, setIsHomeworkExpanded] = useState(false);

  if (!previousSession && homeworkToCheck.length === 0) return null;

  // Count star rating
  const starCount = previousSession ? (previousSession.performance_rating || "").split("⭐").length - 1 : 0;

  // Get classwork from previous session
  const classworkList = previousSession?.exercises?.filter(ex =>
    ex.exercise_type === "Classwork" || ex.exercise_type === "CW"
  ) || [];

  // Count unchecked homework
  const uncheckedCount = homeworkToCheck.filter(hw =>
    !hw.completion_status || hw.completion_status === "Not Checked"
  ).length;

  return (
    <div className={isExpanded ? "fixed right-0 top-1/4 z-50" : "fixed right-0 top-1/4 z-40"}>
      <motion.div
        initial={{ x: 280 }}
        animate={{ x: isExpanded ? 0 : 280 }}
        transition={{ type: "spring", stiffness: 200, damping: 25 }}
        className="flex"
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
      >
        {/* Bookmark Tab (sticks out) */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="relative h-32 w-12 bg-[#d4a574] dark:bg-[#8b6f47] rounded-l-lg shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center border-l-4 border-t-4 border-b-4 border-[#a67c52] dark:border-[#6b5537]"
          style={{
            background: 'linear-gradient(to right, #d4a574, #c9985f)',
          }}
        >
          {/* Tab texture */}
          <div className="absolute inset-0 opacity-20 rounded-l-lg" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paper'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.04' numOctaves='5' /%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23paper)' opacity='0.5'/%3E%3C/svg%3E")`,
          }} />

          {/* Vertical text */}
          <div className="relative flex flex-col items-center gap-1">
            <History className="h-5 w-5 text-white/90" />
            <div
              className="text-xs font-semibold text-white/90 tracking-wider"
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                textShadow: '0 1px 2px rgba(0,0,0,0.3)',
              }}
            >
              RECAP
            </div>
          </div>

          {/* Notification badge */}
          {uncheckedCount > 0 && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-destructive rounded-full flex items-center justify-center border-2 border-white dark:border-gray-800">
              <span className="text-[10px] font-bold text-white">{uncheckedCount}</span>
            </div>
          )}
        </button>

        {/* Expanded Content Card */}
        <div className="relative w-72 max-h-[calc(100vh-16rem)] bg-[#fef9f3] dark:bg-[#2d2618] shadow-2xl border-4 border-[#d4a574] dark:border-[#8b6f47] rounded-r-lg overflow-hidden">
          {/* Paper texture background */}
          <div className="absolute inset-0 opacity-30 pointer-events-none" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paper'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.04' numOctaves='5' /%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23paper)' opacity='0.5'/%3E%3C/svg%3E")`,
          }} />

          <div className="relative p-4 max-h-full overflow-y-auto scrollbar-thin scrollbar-thumb-[#d4a574] scrollbar-track-transparent [scrollbar-gutter:stable]">
            {/* Header */}
            <div className="flex items-center gap-2 mb-4 pb-3 border-b-2 border-dashed border-[#d4a574]/30">
              <History className="h-4 w-4 text-[#8b6f47]" />
              <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">Previous Session</h3>
            </div>

            {/* Date and Status */}
            <div className="space-y-3 mb-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Date</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {new Date(previousSession.session_date).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {previousSession.time_slot || "N/A"}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Status</span>
                <Badge variant="success" className="text-xs">
                  {previousSession.session_status}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Tutor</span>
                <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
                  {previousSession.tutor_name || "N/A"}
                </p>
              </div>
            </div>

            {/* Performance Rating */}
            {previousSession.performance_rating && (
              <div className="mb-3 p-3 bg-warning/10 rounded-lg border border-warning/20">
                <p className="text-xs text-muted-foreground mb-2">Performance</p>
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={cn(
                          "h-3.5 w-3.5",
                          i < starCount
                            ? "text-warning fill-warning"
                            : "text-muted-foreground/30 fill-muted-foreground/30"
                        )}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-semibold text-warning">
                    {starCount}/5
                  </span>
                </div>
              </div>
            )}

            {/* Notes Preview */}
            {previousSession.notes && (
              <div className="mb-3">
                <p className="text-xs text-muted-foreground mb-2">Session Notes</p>
                <div className="p-3 bg-background/50 rounded border border-border/50">
                  <p className="text-xs leading-relaxed line-clamp-4 text-foreground/80 italic">
                    {previousSession.notes}
                  </p>
                </div>
              </div>
            )}

            {/* Classwork - Collapsible */}
            {classworkList.length > 0 && (
              <div className="mb-3">
                {/* Collapsible Header */}
                <button
                  onClick={() => setIsClassworkExpanded(!isClassworkExpanded)}
                  className="w-full flex items-center gap-2 mb-3 hover:bg-[#8b6f47]/10 dark:hover:bg-[#8b6f47]/20 p-2 -mx-2 rounded transition-colors"
                >
                  {isClassworkExpanded ? (
                    <ChevronDown className="h-4 w-4 text-[#8b6f47]" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-[#8b6f47]" />
                  )}
                  <BookOpen className="h-4 w-4 text-[#8b6f47]" />
                  <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                    Classwork
                  </h4>
                  <Badge variant="secondary" className="text-xs ml-auto">
                    {classworkList.length}
                  </Badge>
                </button>

                {/* Collapsible Content */}
                <AnimatePresence>
                  {isClassworkExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-1.5 pb-2">
                        {classworkList.map((cw, index) => (
                          <div
                            key={cw.id}
                            className={cn(
                              "py-2 px-2.5 bg-[#f5ede3]/50 dark:bg-[#3a3020]/30 rounded border border-[#d4a574]/20",
                              index > 0 && "mt-1.5"
                            )}
                          >
                            {/* Main row: PDF name */}
                            <div className="mb-1">
                              <p className="font-semibold text-xs text-gray-900 dark:text-gray-100 leading-tight">
                                {cw.pdf_name}
                              </p>
                            </div>

                            {/* Metadata row */}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                              {(cw.page_start || cw.page_end) && (
                                <span>
                                  p.{cw.page_start}
                                  {cw.page_end && cw.page_end !== cw.page_start && `-${cw.page_end}`}
                                </span>
                              )}
                              {cw.created_by && (
                                <span className="flex items-center gap-1">
                                  <span className="text-muted-foreground/50">•</span>
                                  {cw.created_by}
                                </span>
                              )}
                            </div>

                            {/* Remarks if any */}
                            {cw.remarks && (
                              <p className="text-[10px] italic text-foreground/70 mt-1 leading-tight">
                                "{cw.remarks}"
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Homework to Check - Collapsible */}
            {homeworkToCheck.length > 0 && (
              <div>
                {/* Collapsible Header */}
                <button
                  onClick={() => setIsHomeworkExpanded(!isHomeworkExpanded)}
                  className="w-full flex items-center gap-2 mb-3 hover:bg-[#8b6f47]/10 dark:hover:bg-[#8b6f47]/20 p-2 -mx-2 rounded transition-colors"
                >
                  {isHomeworkExpanded ? (
                    <ChevronDown className="h-4 w-4 text-[#8b6f47]" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-[#8b6f47]" />
                  )}
                  <Home className="h-4 w-4 text-[#8b6f47]" />
                  <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                    Homework
                  </h4>
                  {uncheckedCount > 0 && (
                    <Badge variant="destructive" className="text-xs ml-auto">
                      {uncheckedCount}
                    </Badge>
                  )}
                </button>

                {/* Collapsible Content */}
                <AnimatePresence>
                  {isHomeworkExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-1.5 pb-2">
                        {homeworkToCheck.map((hw, index) => (
                          <div
                            key={hw.id}
                            className={cn(
                              "py-2 px-2.5 bg-[#f5ede3]/50 dark:bg-[#3a3020]/30 rounded border border-[#d4a574]/20",
                              index > 0 && "mt-1.5"
                            )}
                          >
                            {/* Main row: PDF name and status */}
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p className="font-semibold text-xs text-gray-900 dark:text-gray-100 leading-tight">
                                {hw.pdf_name}
                              </p>
                              <Badge
                                variant={
                                  hw.completion_status === "Completed" ? "success" :
                                  hw.completion_status === "Partially Completed" ? "warning" :
                                  hw.completion_status === "Not Completed" ? "destructive" :
                                  "default"
                                }
                                className="text-[9px] h-4 px-1.5 shrink-0"
                              >
                                {hw.completion_status || "Not Checked"}
                              </Badge>
                            </div>

                            {/* Metadata row */}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                              {(hw.page_start || hw.page_end) && (
                                <span>
                                  p.{hw.page_start}
                                  {hw.page_end && hw.page_end !== hw.page_start && `-${hw.page_end}`}
                                </span>
                              )}
                              {hw.homework_assigned_date && (
                                <span className="flex items-center gap-1">
                                  <span className="text-muted-foreground/50">•</span>
                                  {new Date(hw.homework_assigned_date).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </span>
                              )}
                              {hw.assigned_by_tutor && (
                                <span className="flex items-center gap-1">
                                  <span className="text-muted-foreground/50">•</span>
                                  {hw.assigned_by_tutor}
                                </span>
                              )}
                            </div>

                            {/* Comments if any */}
                            {hw.tutor_comments && (
                              <p className="text-[10px] italic text-foreground/70 mt-1 leading-tight">
                                "{hw.tutor_comments}"
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
