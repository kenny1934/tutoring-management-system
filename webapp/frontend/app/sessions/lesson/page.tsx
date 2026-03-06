"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useSessions, usePageTitle } from "@/lib/hooks";
import { useAuth } from "@/contexts/AuthContext";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { AlertTriangle, ArrowLeft, Users } from "lucide-react";
import type { Session } from "@/types";

const LessonWideMode = dynamic(
  () => import("@/components/lesson/LessonWideMode").then(mod => ({ default: mod.LessonWideMode })),
  { ssr: false }
);

export default function LessonWidePage() {
  const searchParams = useSearchParams();
  const date = searchParams.get("date");
  const slot = searchParams.get("slot");
  const tutorId = searchParams.get("tutor_id");
  const { isReadOnly } = useAuth();

  usePageTitle(slot ? `Lesson ${slot}` : "Lesson Mode");

  // Fetch all sessions for this tutor + date
  const { data: allSessions, isLoading, mutate } = useSessions({
    date: date || undefined,
    tutor_id: tutorId ? parseInt(tutorId, 10) : undefined,
    limit: 50,
  });

  // Filter to only sessions in the specified time slot
  const sessions = useMemo(() => {
    if (!allSessions || !slot) return [];
    return allSessions.filter(
      (s) => s.time_slot === slot
        && s.session_status !== "Cancelled"
        && !s.session_status.includes("Pending Make-up")
        && !s.session_status.includes("Make-up Booked")
    );
  }, [allSessions, slot]);

  // Validation
  if (!date || !slot || !tutorId) {
    return (
      <DeskSurface fullHeight>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500" />
            <p className="text-sm text-[#8b7355]">
              Missing required parameters. Open lesson mode from the sessions page.
            </p>
          </div>
        </div>
      </DeskSurface>
    );
  }

  if (isLoading) {
    return (
      <DeskSurface fullHeight>
        <div className="flex-1 flex flex-col gap-2 p-2 overflow-hidden">
          {/* Header */}
          <div className="relative rounded-2xl bg-gradient-to-br from-[#b89968] via-[#a67c52] to-[#8b6f47] p-1 flex-shrink-0">
            <div className="flex items-center gap-3 px-3 py-2.5 bg-[#2d4739] dark:bg-[#1a2821] shadow-inner rounded-[12px]" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.4)' }}>
              <div className="p-1.5 rounded-lg">
                <ArrowLeft className="h-4 w-4 text-white/40" />
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-white/40" />
                <span className="text-sm font-bold text-white/60">{slot}</span>
                <span className="text-xs text-white/30">Loading...</span>
              </div>
            </div>
          </div>
          {/* Body skeleton: sidebar + viewer */}
          <div className="flex-1 flex gap-2 min-h-0">
            {/* Sidebar skeleton */}
            <div className="hidden md:flex flex-col gap-2 w-64 flex-shrink-0">
              <div className="h-8 shimmer-sepia rounded-lg" />
              <div className="h-6 shimmer-sepia rounded-lg w-20" />
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 shimmer-sepia rounded-lg" />
              ))}
              <div className="h-6 shimmer-sepia rounded-lg w-20 mt-2" />
              {[5, 6].map((i) => (
                <div key={i} className="h-10 shimmer-sepia rounded-lg" />
              ))}
            </div>
            {/* Viewer skeleton */}
            <div className="flex-1 shimmer-sepia rounded-xl" />
          </div>
        </div>
      </DeskSurface>
    );
  }

  if (sessions.length === 0) {
    return (
      <DeskSurface fullHeight>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500" />
            <p className="text-sm text-[#8b7355]">
              No sessions found for this time slot.
            </p>
          </div>
        </div>
      </DeskSurface>
    );
  }

  return (
    <DeskSurface fullHeight>
      <LessonWideMode
        sessions={sessions}
        date={date}
        slot={slot}
        tutorId={parseInt(tutorId, 10)}
        onSessionDataChange={() => mutate()}
        isReadOnly={isReadOnly}
      />
    </DeskSurface>
  );
}
