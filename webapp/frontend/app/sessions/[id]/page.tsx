"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { GlassCard, PageTransition, WorksheetCard, WorksheetProblem, IndexCard, GradeStamp, FileFolder, Certificate } from "@/lib/design-system";
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
  Calendar,
  Clock,
  MapPin,
  User,
  GraduationCap,
} from "lucide-react";
import { ChalkboardHeader } from "@/components/session/ChalkboardHeader";
import { BookmarkTab } from "@/components/session/BookmarkTab";
import { Badge } from "@/components/ui/badge";
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

  // Convert star count to letter grade
  const getLetterGrade = (stars: number): string => {
    if (stars >= 5) return "A+";
    if (stars >= 4) return "A";
    if (stars >= 3) return "B";
    if (stars >= 2) return "C";
    if (stars >= 1) return "D";
    return "F";
  };

  const letterGrade = getLetterGrade(starCount);

  return (
    <DeskSurface>
      <PageTransition className="flex flex-col gap-6 p-8">
        {/* Bookmark Tab for Previous Session (fixed position) */}
        <BookmarkTab
          previousSession={session.previous_session}
          homeworkToCheck={session.homework_completion}
        />

      {/* Header with Chalkboard */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <ChalkboardHeader session={session} statusColor={statusColor} />
        </div>
      </div>

      {/* Two-column layout: Session Info + Notebook */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.8fr_1fr] gap-6">
        {/* File Folder with Session Info and People tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          style={{ transform: 'rotate(-1.5deg)' }}
        >
          <FileFolder
            className="desk-shadow-high"
            tabs={[
              {
                label: "Session",
                color: "blue",
                content: (
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Time Slot</p>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <p className="font-medium">{session.time_slot || "N/A"}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Location</p>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <p className="font-medium">{session.location || "N/A"}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Financial Status</p>
                      {session.financial_status === "Paid" ? (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                          className="flex items-center gap-2 p-2 bg-success/10 border border-success/30 rounded-lg w-fit"
                        >
                          <CheckCircle2 className="h-4 w-4 text-success" />
                          <Badge variant="success">{session.financial_status}</Badge>
                        </motion.div>
                      ) : (
                        <Badge variant="warning">{session.financial_status || "Unpaid"}</Badge>
                      )}
                    </div>
                  </div>
                ),
              },
              {
                label: "People",
                color: "green",
                content: (
                  <div className="space-y-5">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Student</p>
                      <p className="font-semibold text-xl">{session.student_name || "Unknown"}</p>
                      {session.school_student_id && (
                        <p className="text-sm text-muted-foreground mt-0.5">
                          ID: {session.school_student_id}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1.5">Grade</p>
                        <Badge variant="outline" className="w-fit">
                          {session.grade || "N/A"}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-1.5">Stream</p>
                        <Badge variant="outline" className="w-fit">
                          {session.lang_stream || "N/A"}
                        </Badge>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground mb-1">School</p>
                      <div className="flex items-center gap-2">
                        <GraduationCap className="h-4 w-4 text-muted-foreground" />
                        <p className="font-medium">{session.school || "N/A"}</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Tutor</p>
                      <p className="font-medium text-lg">{session.tutor_name || "Not Assigned"}</p>
                    </div>
                  </div>
                ),
              },
            ]}
            defaultTab={0}
          />
        </motion.div>

        {/* Spiral Notebook - Performance & Notes */}
        {(session.performance_rating || session.notes) && (
          <motion.div
            variants={refinedCardVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.3 }}
            className="relative"
            style={{ transform: 'rotate(0.8deg)' }}
          >
            {/* Spiral Notebook Container */}
            <div className="bg-[#fef9f3] dark:bg-[#2d2618] paper-texture paper-wrinkled torn-edge-right page-curl desk-shadow-medium relative overflow-visible text-gray-900 dark:text-gray-100">
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
                        animate={{ scale: 1, rotate: -12 }}
                        transition={{ type: "spring", stiffness: 200, delay: 0.5 }}
                        className="float-right ml-4 mb-2 mr-2"
                      >
                        <GradeStamp grade={letterGrade} size="lg" />
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
                      animate={{ scale: 1, rotate: -8 }}
                      transition={{ type: "spring", stiffness: 200, delay: 0.5 }}
                      className="flex justify-center"
                    >
                      <GradeStamp grade={letterGrade} size="lg" />
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Classwork Worksheet */}
          {session.exercises.filter((ex) => ex.exercise_type === "Classwork" || ex.exercise_type === "CW").length > 0 && (
            <motion.div
              variants={refinedCardVariants}
              initial="hidden"
              animate="visible"
              transition={{ delay: 0.5 }}
              style={{ transform: 'rotate(-0.5deg)' }}
            >
              <WorksheetCard title="Classwork" numbering="none" className="desk-shadow-low">
                <div className="space-y-3">
                  {session.exercises
                    .filter((ex) => ex.exercise_type === "Classwork" || ex.exercise_type === "CW")
                    .map((exercise, index) => (
                      <WorksheetProblem key={exercise.id} number={index + 1}>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">{exercise.pdf_name}</p>
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
                            <p className="text-sm text-muted-foreground mt-1 italic">{exercise.remarks}</p>
                          )}
                        </div>
                      </WorksheetProblem>
                    ))}
                </div>
              </WorksheetCard>
            </motion.div>
          )}

          {/* Homework Worksheet */}
          {session.exercises.filter((ex) => ex.exercise_type === "Homework" || ex.exercise_type === "HW").length > 0 && (
            <motion.div
              variants={refinedCardVariants}
              initial="hidden"
              animate="visible"
              transition={{ delay: 0.6 }}
              style={{ transform: 'rotate(0.8deg)' }}
            >
              <WorksheetCard title="Homework" numbering="none" className="desk-shadow-low">
                <div className="space-y-3">
                  {session.exercises
                    .filter((ex) => ex.exercise_type === "Homework" || ex.exercise_type === "HW")
                    .map((exercise, index) => (
                      <WorksheetProblem key={exercise.id} number={index + 1}>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">{exercise.pdf_name}</p>
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
                            <p className="text-sm text-muted-foreground mt-1 italic">{exercise.remarks}</p>
                          )}
                        </div>
                      </WorksheetProblem>
                    ))}
                </div>
              </WorksheetCard>
            </motion.div>
          )}
        </div>
      )}

      {/* Future Features Certificate */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.8, ease: [0.16, 1, 0.3, 1] }}
        style={{ transform: 'rotate(-0.3deg)' }}
      >
        <Certificate
          title="Future Enhancements"
          recipientName="CSM Pro Students & Tutors"
          achievement="Advanced Session Features"
          date="Coming Q1 2026"
          signedBy="Development Team"
          variant="silver"
          showSeal={true}
          className="desk-shadow-flat"
        >
          <div className="mt-6 space-y-2">
            <p className="text-base text-muted-foreground">
              Upcoming features to enhance your learning experience:
            </p>
            <div className="flex flex-wrap justify-center gap-3 mt-4">
              <Badge variant="outline" className="text-sm">
                Test Scores
              </Badge>
              <Badge variant="outline" className="text-sm">
                Attendance Analytics
              </Badge>
              <Badge variant="outline" className="text-sm">
                Google Calendar Integration
              </Badge>
            </div>
          </div>
        </Certificate>
      </motion.div>
    </PageTransition>
    </DeskSurface>
  );
}
