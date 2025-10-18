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

      {/* Single Tabbed Card */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        <SessionTabsCard session={session} />
      </motion.div>

      {/* Performance Rating with Star Icons */}
      {session.performance_rating && (
        <motion.div
          variants={refinedCardVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.3 }}
        >
          <GlassCard interactive={false} className="p-6 bg-warning/5 border-warning/20">
            <div className="flex items-center gap-3 mb-4">
              <Star className="h-5 w-5 text-warning fill-warning" />
              <h2 className="text-lg font-semibold">Performance Rating</h2>
            </div>
            <div className="flex items-center gap-2">
              {/* Star icons */}
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={cn(
                    "h-8 w-8 transition-all",
                    i < starCount
                      ? "text-warning fill-warning"
                      : "text-muted-foreground/30"
                  )}
                />
              ))}
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* Session Notes */}
      {session.notes && (
        <motion.div
          variants={refinedCardVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.4 }}
        >
          <GlassCard interactive={false} className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Session Notes</h2>
            </div>
            <p className="text-base whitespace-pre-wrap leading-relaxed">{session.notes}</p>
          </GlassCard>
        </motion.div>
      )}

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
