"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useSessions, usePageTitle } from "@/lib/hooks";
import { useAuth } from "@/contexts/AuthContext";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { Loader2, AlertTriangle } from "lucide-react";
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
      (s) => s.time_slot === slot && s.session_status !== "Cancelled"
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
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-[#a0704b]" />
            <p className="text-sm text-[#8b7355]">Loading sessions...</p>
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
