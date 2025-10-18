"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { GlassCard, PageTransition } from "@/lib/design-system";
import { motion } from "framer-motion";
import type { Session } from "@/types";
import {
  ArrowLeft,
  Star,
  FileText,
  CheckCircle2,
  BookOpen,
  NotebookPen,
  Home,
} from "lucide-react";
import { LEDMarqueeHeader } from "@/components/session/LEDMarqueeHeader";
import { SessionTabsCard } from "@/components/session/SessionTabsCard";
import { PreviousSessionPopover } from "@/components/session/PreviousSessionPopover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = parseInt(params.id as string);

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSession() {
      try {
        setLoading(true);
        const data = await api.sessions.getById(sessionId);
        setSession(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load session");
      } finally {
        setLoading(false);
      }
    }

    fetchSession();
  }, [sessionId]);

  if (loading) {
    return (
      <PageTransition className="flex flex-col gap-6 p-8">
        <div className="h-20 w-full bg-muted rounded animate-pulse" />
        <GlassCard interactive={false} className="p-6">
          <div className="h-64 bg-muted/30 rounded animate-pulse" />
        </GlassCard>
      </PageTransition>
    );
  }

  if (error || !session) {
    return (
      <PageTransition className="flex h-full items-center justify-center">
        <div className="text-destructive">Error: {error || "Session not found"}</div>
      </PageTransition>
    );
  }

  const statusColor =
    session.session_status === "Completed" || session.session_status === "Attended"
      ? "success"
      : session.session_status === "Scheduled"
      ? "default"
      : session.session_status === "Cancelled"
      ? "destructive"
      : "secondary";

  // Count emoji stars in performance rating
  const starCount = (session.performance_rating || "").split("⭐").length - 1;

  return (
    <PageTransition className="flex flex-col gap-6 p-8">
      {/* Header with LED Marquee */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center gap-4"
      >
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <LEDMarqueeHeader session={session} statusColor={statusColor} />
        </div>
        {/* Previous Session Popover */}
        <PreviousSessionPopover previousSession={session.previous_session} />
      </motion.div>

      {/* Two-column layout: Session Info + Notebook */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.8fr_1fr] gap-6">
        {/* Single Tabbed Card */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <SessionTabsCard session={session} />
        </motion.div>

        {/* Spiral Notebook - Performance & Notes */}
        {(session.performance_rating || session.notes) && (
          <motion.div
            variants={refinedCardVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.3 }}
            className="relative"
          >
            {/* Spiral Notebook Container */}
            <div className="bg-[#fef9f3] dark:bg-[#2d2618] paper-texture paper-wrinkled torn-edge-right paper-shadow-lg page-curl relative overflow-visible text-gray-900 dark:text-gray-100" style={{ transform: 'rotate(-0.5deg)' }}>
              {/* Perforated left edge with binding holes */}
              <div className="absolute left-0 top-0 bottom-0 w-12 z-10 pointer-events-none">
                {/* Perforation holes */}
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute left-6 w-3 h-3 rounded-full bg-background/40 border border-border/50"
                    style={{ top: `${32 + i * 64}px` }}
                  />
                ))}
              </div>

              {/* Notebook paper background with ruled lines */}
              <div className="absolute inset-0 bg-gradient-to-br from-amber-50/60 via-yellow-50/40 to-orange-50/50 dark:from-amber-900/30 dark:via-yellow-900/20 dark:to-orange-900/30 rounded-lg" />

              <div className="relative p-6 pl-14">
                {/* Left margin line (red vertical line) */}
                <div className="absolute left-16 top-0 bottom-0 w-0.5 bg-red-400/50 dark:bg-red-400/25" />

                {/* Ruled lines background pattern */}
                <div className="absolute left-0 right-0 top-0 bottom-0 pointer-events-none ruled-lines rounded-lg" />

              {/* Content with margin spacing */}
              <div className="relative pl-12">
                {session.notes ? (
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <FileText className="h-5 w-5 text-primary" />
                      <h2 className="text-lg font-semibold">Session Notes</h2>
                    </div>

                    {/* Performance Rating as Grade Stamp - floated */}
                    {session.performance_rating && (
                      <motion.div
                        initial={{ scale: 0, rotate: 0 }}
                        animate={{ scale: 1, rotate: -6 }}
                        transition={{ type: "spring", stiffness: 200, delay: 0.5 }}
                        className="float-right ml-4 mb-2 mr-2"
                        style={{ shapeOutside: 'circle(50%)' }}
                      >
                        <div
                          className="w-20 h-20 rounded-full bg-warning/90 border-4 border-warning/40 shadow-xl shadow-warning/20 flex flex-col items-center justify-center backdrop-blur-sm"
                          style={{ shapeOutside: 'circle(50%)' }}
                        >
                          <div className="flex gap-0.5 mb-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={cn(
                                  "h-2.5 w-2.5",
                                  i < starCount
                                    ? "text-white fill-white"
                                    : "text-white/30 fill-white/30"
                                )}
                              />
                            ))}
                          </div>
                          <div className="text-white font-bold text-xs">
                            {starCount}/5
                          </div>
                          <div className="text-white/80 text-[10px] font-medium">RATING</div>
                        </div>
                      </motion.div>
                    )}

                    <p
                      className="text-base whitespace-pre-wrap text-foreground/90"
                      style={{ lineHeight: '36px' }}
                    >
                      {session.notes}
                    </p>
                  </div>
                ) : session.performance_rating ? (
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <Star className="h-5 w-5 text-warning fill-warning" />
                      <h2 className="text-lg font-semibold">Performance Rating</h2>
                    </div>
                    {/* Performance Rating as Grade Stamp - centered when no notes */}
                    <motion.div
                      initial={{ scale: 0, rotate: 0 }}
                      animate={{ scale: 1, rotate: -6 }}
                      transition={{ type: "spring", stiffness: 200, delay: 0.5 }}
                      className="flex justify-center"
                    >
                      <div className="w-20 h-20 rounded-full bg-warning/90 border-4 border-warning/40 shadow-xl shadow-warning/20 flex flex-col items-center justify-center backdrop-blur-sm">
                        <div className="flex gap-0.5 mb-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={cn(
                                "h-2.5 w-2.5",
                                i < starCount
                                  ? "text-white fill-white"
                                  : "text-white/30 fill-white/30"
                              )}
                            />
                          ))}
                        </div>
                        <div className="text-white font-bold text-xs">
                          {starCount}/5
                        </div>
                        <div className="text-white/80 text-[10px] font-medium">RATING</div>
                      </div>
                    </motion.div>
                  </div>
                ) : null}
              </div>
            </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Courseware Section */}
      {session.exercises && session.exercises.length > 0 && (
        <motion.div
          variants={refinedCardVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.5 }}
        >
          <GlassCard interactive={false} className="p-6 border-success/20">
          <div className="flex items-center gap-3 mb-4">
            <BookOpen className="h-5 w-5 text-success" />
            <h2 className="text-lg font-semibold">Courseware</h2>
          </div>
          <div className="space-y-6">
            {/* Classwork */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <NotebookPen className="h-4 w-4" />
                Classwork
              </h3>
              <div className="space-y-2">
                {session.exercises
                  .filter((ex) => ex.exercise_type === "Classwork" || ex.exercise_type === "CW")
                  .map((exercise) => (
                    <div
                      key={exercise.id}
                      className="p-3 bg-background/50 rounded-lg border border-border"
                    >
                      <p className="font-medium">{exercise.pdf_name}</p>
                      {exercise.page_start && exercise.page_end ? (
                        <p className="text-sm text-muted-foreground">
                          Pages {exercise.page_start}-{exercise.page_end}
                        </p>
                      ) : exercise.page_start ? (
                        <p className="text-sm text-muted-foreground">Page {exercise.page_start}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground">Entire PDF</p>
                      )}
                      {exercise.remarks && (
                        <p className="text-sm text-muted-foreground mt-1">{exercise.remarks}</p>
                      )}
                    </div>
                  ))}
                {session.exercises.filter((ex) => ex.exercise_type === "Classwork" || ex.exercise_type === "CW").length === 0 && (
                  <p className="text-sm text-muted-foreground">No classwork assigned</p>
                )}
              </div>
            </div>

            {/* Visual separator */}
            <div className="border-t border-border my-4"></div>

            {/* Homework */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Home className="h-4 w-4" />
                Homework
              </h3>
              <div className="space-y-2">
                {session.exercises
                  .filter((ex) => ex.exercise_type === "Homework" || ex.exercise_type === "HW")
                  .map((exercise) => (
                    <div
                      key={exercise.id}
                      className="p-3 bg-background/50 rounded-lg border border-border"
                    >
                      <p className="font-medium">{exercise.pdf_name}</p>
                      {exercise.page_start && exercise.page_end ? (
                        <p className="text-sm text-muted-foreground">
                          Pages {exercise.page_start}-{exercise.page_end}
                        </p>
                      ) : exercise.page_start ? (
                        <p className="text-sm text-muted-foreground">Page {exercise.page_start}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground">Entire PDF</p>
                      )}
                      {exercise.remarks && (
                        <p className="text-sm text-muted-foreground mt-1">{exercise.remarks}</p>
                      )}
                    </div>
                  ))}
                {session.exercises.filter((ex) => ex.exercise_type === "Homework" || ex.exercise_type === "HW").length === 0 && (
                  <p className="text-sm text-muted-foreground">No homework assigned</p>
                )}
              </div>
            </div>
          </div>
        </GlassCard>
        </motion.div>
      )}

      {/* Homework Completion Section */}
      {session.homework_completion && session.homework_completion.length > 0 && (
        <motion.div
          variants={refinedCardVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.6 }}
        >
          <GlassCard interactive={false} className="p-6 border-info/20">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle2 className="h-5 w-5 text-info" />
            <h2 className="text-lg font-semibold">Homework Completion</h2>
          </div>
          <div className="space-y-3">
            {session.homework_completion.map((hw) => (
              <div key={hw.id} className="p-4 bg-background/50 rounded-lg border border-border">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <p className="font-medium">{hw.pdf_name}</p>
                    {hw.page_start && hw.page_end ? (
                      <p className="text-sm text-muted-foreground">
                        Pages {hw.page_start}-{hw.page_end}
                      </p>
                    ) : hw.page_start ? (
                      <p className="text-sm text-muted-foreground">Page {hw.page_start}</p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    {hw.submitted && (
                      <Badge variant="outline" className="text-xs">
                        Submitted
                      </Badge>
                    )}
                    {hw.completion_status && (
                      <Badge
                        variant={
                          hw.completion_status === "Completed"
                            ? "success"
                            : hw.completion_status === "Partially Completed"
                            ? "warning"
                            : hw.completion_status === "Not Completed"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {hw.completion_status}
                      </Badge>
                    )}
                  </div>
                </div>
                {hw.tutor_comments && (
                  <div className="mt-2 pt-2 border-t border-border">
                    <p className="text-sm text-muted-foreground">Tutor Comments:</p>
                    <p className="text-sm">{hw.tutor_comments}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </GlassCard>
        </motion.div>
      )}

      {/* Coming Soon Sections (Toned Down) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.div
          animate={{
            boxShadow: [
              "0 0 15px rgba(200, 16, 46, 0.2)",
              "0 0 25px rgba(200, 16, 46, 0.35)",
              "0 0 15px rgba(200, 16, 46, 0.2)"
            ]
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          <GlassCard interactive={false} className="p-6 border-2 border-dashed border-primary/30">
            <div className="text-center py-8">
              <h3 className="text-lg font-semibold mb-2 text-gradient">Coming Soon</h3>
              <p className="text-sm text-muted-foreground">
                Test scores, attendance analytics, and Google Calendar integration
              </p>
            </div>
          </GlassCard>
        </motion.div>
      </motion.div>
    </PageTransition>
  );
}
