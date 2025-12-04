"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useSession } from "@/lib/hooks";
import { GlassCard, PageTransition, WorksheetCard, WorksheetProblem, IndexCard, GraphPaper, StickyNote } from "@/lib/design-system";
import { StarRating } from "@/components/ui/star-rating";
import { motion } from "framer-motion";
import type { Session, CurriculumSuggestion, UpcomingTestAlert } from "@/types";
import {
  ArrowLeft,
  Star,
  FileText,
  BookOpen,
  NotebookPen,
  Home,
  Calendar,
  PenTool,
} from "lucide-react";
import { ChalkboardHeader } from "@/components/session/ChalkboardHeader";
import { BookmarkTab } from "@/components/session/BookmarkTab";
import { CurriculumTab } from "@/components/session/CurriculumTab";
import { CoursewareBanner } from "@/components/session/CoursewareBanner";
import { TestAlertBanner } from "@/components/session/TestAlertBanner";
import { cn } from "@/lib/utils";
import { DeskSurface } from "@/components/layout/DeskSurface";

// Refined card animation variant (less dramatic)
const refinedCardVariants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.95
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.5,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
};

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = parseInt(params.id as string);

  // SWR hook for session data with caching
  const { data: session, error, isLoading: loading } = useSession(sessionId);

  const [curriculumSuggestion, setCurriculumSuggestion] = useState<CurriculumSuggestion | null>(null);
  const [upcomingTests, setUpcomingTests] = useState<UpcomingTestAlert[]>([]);

  useEffect(() => {
    async function fetchCurriculumSuggestion() {
      try {
        const data = await api.sessions.getCurriculumSuggestions(sessionId);
        setCurriculumSuggestion(data);
      } catch (err) {
        // Silently fail if no curriculum suggestions available
        console.log("No curriculum suggestions found for this session");
        setCurriculumSuggestion(null);
      }
    }

    fetchCurriculumSuggestion();
  }, [sessionId]);

  useEffect(() => {
    async function fetchUpcomingTests() {
      try {
        const data = await api.sessions.getUpcomingTests(sessionId);
        setUpcomingTests(data);
      } catch (err) {
        // Silently fail if no upcoming tests available
        console.log("No upcoming tests found for this session");
        setUpcomingTests([]);
      }
    }

    fetchUpcomingTests();
  }, [sessionId]);

  if (loading) {
    return (
      <PageTransition className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-6 lg:p-8">
        {/* Chalkboard skeleton */}
        <div className="h-[100px] w-full bg-[#2d4739] dark:bg-[#1a2821] rounded-lg animate-pulse border-8 border-[#4a3728] dark:border-[#3a2818]" />

        {/* FileFolder skeleton */}
        <div className="h-64 bg-[#fef9f3] dark:bg-[#2d2618] rounded-lg animate-pulse border-4 border-[#d4a574] dark:border-[#8b6f47] paper-texture" />

        {/* Notebook skeleton */}
        <div className="h-48 bg-[#fef9f3] dark:bg-[#2d2618] rounded-lg animate-pulse paper-texture paper-wrinkled" />
      </PageTransition>
    );
  }

  if (error || !session) {
    return (
      <PageTransition className="flex h-full items-center justify-center">
        <div className="text-destructive">Error: {error instanceof Error ? error.message : "Session not found"}</div>
      </PageTransition>
    );
  }

  // Count emoji stars in performance rating
  const starCount = (session.performance_rating || "").split("⭐").length - 1;

  return (
    <DeskSurface>
      <PageTransition className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-6 lg:p-8">
        {/* Bookmark Tab for Previous Session (fixed position) */}
        <BookmarkTab
          previousSession={session.previous_session}
          homeworkToCheck={session.homework_completion}
        />

        {/* Curriculum Tab for Curriculum Suggestions (fixed position) */}
        <CurriculumTab suggestion={curriculumSuggestion} />

      {/* Header with Chalkboard */}
      <div>
        {/* Mobile: Navigation bar with back + context */}
        <div className="sm:hidden flex items-center gap-2 mb-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">Sessions</span>
        </div>

        {/* Desktop: Side-by-side layout */}
        <div className="hidden sm:flex items-center gap-4">
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <ChalkboardHeader session={session} />
          </div>
        </div>

        {/* Mobile: Full-width chalkboard */}
        <div className="sm:hidden">
          <ChalkboardHeader session={session} />
        </div>
      </div>

      {/* Upcoming Tests Alert Banner */}
      <div className="pl-0 sm:pl-8 lg:pl-14">
        <TestAlertBanner tests={upcomingTests} />
      </div>

      {/* Dynamic Courseware and Notes Section */}
      {(() => {
        // Calculate what content exists
        const cwExercises = session.exercises?.filter(
          (ex) => ex.exercise_type === "Classwork" || ex.exercise_type === "CW"
        ) || [];
        const hwExercises = session.exercises?.filter(
          (ex) => ex.exercise_type === "Homework" || ex.exercise_type === "HW"
        ) || [];
        const hasNotes = !!(session.performance_rating || session.notes);
        const hasCW = cwExercises.length > 0;
        const hasHW = hwExercises.length > 0;
        const hasExercises = hasCW || hasHW;

        // If no content at all, return nothing
        if (!hasExercises && !hasNotes) return null;

        // If only notes (no courseware), show just sticky note
        if (!hasExercises && hasNotes) {
          return (
            <motion.div
              variants={refinedCardVariants}
              initial="hidden"
              animate="visible"
              transition={{ delay: 0.3 }}
              className="flex justify-center pl-0 sm:pl-8 lg:pl-14"
            >
              <StickyNote variant="pink" size="md" showTape={true} className="desk-shadow-medium">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-4 w-4 text-gray-700 dark:text-gray-300" />
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                    Comments
                  </h3>
                </div>
                {session.performance_rating && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, delay: 0.5 }}
                    className={cn(session.notes ? "float-right ml-3 mb-2" : "flex justify-center mb-3")}
                  >
                    <StarRating rating={starCount} size="md" showEmpty={true} />
                  </motion.div>
                )}
                {session.notes && (
                  <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">
                    {session.notes}
                  </p>
                )}
                {!session.notes && session.performance_rating && (
                  <p className="text-center text-sm text-gray-600 dark:text-gray-400 italic">
                    Performance grade recorded
                  </p>
                )}
              </StickyNote>
            </motion.div>
          );
        }

        // Courseware exists - show unified vertical layout with wooden tab
        return (
          <div className="relative pt-8 sm:pt-12 lg:pt-16 pl-0 sm:pl-8 lg:pl-14">
            {/* Wooden Tab */}
            <CoursewareBanner title="Today's Courseware" />

            {/* Two-column layout: Unified Courseware (70%) on left, Notes (30%) on right */}
            <div className={cn(
              "flex flex-col lg:flex-row gap-6"
            )}>
              {/* Left column: Unified Courseware Section */}
              <motion.div
                variants={refinedCardVariants}
                initial="hidden"
                animate="visible"
                transition={{ delay: 0.4 }}
                className={cn(
                  "flex-1",
                  hasNotes && "lg:w-[70%]",
                  !hasNotes && "w-full"
                )}
                style={{ transform: 'rotate(-0.3deg)' }}
              >
                <GraphPaper gridSize="1cm" className="desk-shadow-low min-h-[300px]">
                  {/* Classwork Section */}
                  {hasCW && (
                    <>
                      <div className="mb-4 pb-2 border-b-2 border-gray-400 dark:border-gray-600">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                          <PenTool className="h-5 w-5 text-red-500 dark:text-red-400" />
                          Classwork
                        </h3>
                      </div>
                      <div className="space-y-3 mb-6">
                        {cwExercises.map((exercise, index) => {
                          const tooltip = `Created by ${exercise.created_by}${exercise.created_at ? ` at ${new Date(exercise.created_at).toLocaleString()}` : ''}`;
                          return (
                            <motion.div
                              key={exercise.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.5 + index * 0.1, duration: 0.3 }}
                              className="flex gap-2 p-2 pl-4 rounded-md border-l-4 border-red-500 dark:border-red-400 cursor-pointer transition-all duration-200 hover:bg-gray-100 dark:hover:bg-gray-800/30 hover:scale-[1.01] hover:shadow-sm"
                              title={tooltip}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 dark:text-gray-100 break-all">{exercise.pdf_name}</p>
                                {exercise.page_start && exercise.page_end ? (
                                  <p className="text-sm text-muted-foreground">Pages {exercise.page_start}-{exercise.page_end}</p>
                                ) : exercise.page_start ? (
                                  <p className="text-sm text-muted-foreground">Page {exercise.page_start}</p>
                                ) : (
                                  <p className="text-sm text-muted-foreground">Entire PDF</p>
                                )}
                                {exercise.remarks && <p className="text-sm text-muted-foreground mt-1 italic">{exercise.remarks}</p>}
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {/* Homework Section */}
                  {hasHW && (
                    <>
                      <div className="mb-4 pb-2 border-b-2 border-gray-400 dark:border-gray-600">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                          <Home className="h-5 w-5 text-blue-500 dark:text-blue-400" />
                          Homework
                        </h3>
                      </div>
                      <div className="space-y-3">
                        {hwExercises.map((exercise, index) => {
                          const tooltip = `Created by ${exercise.created_by}${exercise.created_at ? ` at ${new Date(exercise.created_at).toLocaleString()}` : ''}`;
                          const baseDelay = hasCW ? 0.5 + cwExercises.length * 0.1 : 0.5;
                          return (
                            <motion.div
                              key={exercise.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: baseDelay + index * 0.1, duration: 0.3 }}
                              className="flex gap-2 p-2 pl-4 rounded-md border-l-4 border-blue-500 dark:border-blue-400 cursor-pointer transition-all duration-200 hover:bg-gray-100 dark:hover:bg-gray-800/30 hover:scale-[1.01] hover:shadow-sm"
                              title={tooltip}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 dark:text-gray-100 break-all">{exercise.pdf_name}</p>
                                {exercise.page_start && exercise.page_end ? (
                                  <p className="text-sm text-muted-foreground">Pages {exercise.page_start}-{exercise.page_end}</p>
                                ) : exercise.page_start ? (
                                  <p className="text-sm text-muted-foreground">Page {exercise.page_start}</p>
                                ) : (
                                  <p className="text-sm text-muted-foreground">Entire PDF</p>
                                )}
                                {exercise.remarks && <p className="text-sm text-muted-foreground mt-1 italic">{exercise.remarks}</p>}
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </GraphPaper>
              </motion.div>

              {/* Right column: Session Notes */}
              {hasNotes && (
                <motion.div
                  variants={refinedCardVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{ delay: 0.6 }}
                  className="flex-shrink-0 lg:w-[calc(30%-0.75rem)] relative z-10"
                >
                  <StickyNote variant="pink" size="md" showTape={true} className="desk-shadow-medium h-full">
                    <div className="flex items-center gap-2 mb-3">
                      <FileText className="h-4 w-4 text-gray-700 dark:text-gray-300" />
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                        Comments
                      </h3>
                    </div>
                    {session.performance_rating && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 200, delay: 0.7 }}
                        className={cn(session.notes ? "float-right ml-3 mb-2" : "flex justify-center mb-3")}
                      >
                        <StarRating rating={starCount} size="md" showEmpty={true} />
                      </motion.div>
                    )}
                    {session.notes && (
                      <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">
                        {session.notes}
                      </p>
                    )}
                    {!session.notes && session.performance_rating && (
                      <p className="text-center text-sm text-gray-600 dark:text-gray-400 italic">
                        Performance grade recorded
                      </p>
                    )}
                  </StickyNote>
                </motion.div>
              )}
            </div>
          </div>
        );
      })()}

    </PageTransition>
    </DeskSurface>
  );
}
