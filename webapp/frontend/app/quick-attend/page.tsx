"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useLocation } from "@/contexts/LocationContext";
import { useRole } from "@/contexts/RoleContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle, useSessions, useUncheckedAttendance } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { StarRating } from "@/components/ui/star-rating";
import { TutorSelector, type TutorValue, ALL_TUTORS } from "@/components/selectors/TutorSelector";
import { SessionDetailPopover } from "@/components/sessions/SessionDetailPopover";
import { SessionStatusTag } from "@/components/ui/session-status-tag";
import { sessionsAPI } from "@/lib/api";
import { updateSessionInCache } from "@/lib/session-cache";
import { getGradeColor } from "@/lib/constants";
import { ratingToEmoji } from "@/lib/formatters";
import {
  Check, X, Loader2, PartyPopper, AlertTriangle,
  ChevronDown, ChevronUp, CalendarClock, ExternalLink, Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import type { Session, UncheckedAttendanceReminder } from "@/types";

type CardState = "pending" | "rating" | "done";

interface CardStatus {
  state: CardState;
  action?: "attended" | "no-show" | "rescheduled";
}

// Urgency config
const URGENCY_CONFIG: Record<string, { label: string; color: string; border: string; text: string }> = {
  Critical: { label: "7+ days overdue", color: "bg-red-50 dark:bg-red-900/20", border: "border-red-200 dark:border-red-800", text: "text-red-600 dark:text-red-400" },
  High: { label: "4-7 days overdue", color: "bg-orange-50 dark:bg-orange-900/20", border: "border-orange-200 dark:border-orange-800", text: "text-orange-600 dark:text-orange-400" },
  Medium: { label: "2-3 days overdue", color: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-200 dark:border-amber-800", text: "text-amber-600 dark:text-amber-400" },
  Low: { label: "0-1 days overdue", color: "bg-yellow-50 dark:bg-yellow-900/20", border: "border-yellow-200 dark:border-yellow-800", text: "text-yellow-600 dark:text-yellow-400" },
};

const URGENCY_ORDER = ["Critical", "High", "Medium", "Low"];

// Strip honorific prefixes for tutor name sorting
const getTutorSortName = (name: string): string =>
  name.replace(/^(Mr\.?|Ms\.?|Mrs\.?)\s*/i, '');

// Sort sessions within a time group using DailyGridView priority logic
// When groupByTutor is true, groups by tutor first (like TodaySessionsCard)
function sortSessionsInGroup(sessions: SessionCardData[], groupByTutor = false): SessionCardData[] {
  if (!groupByTutor) {
    return sortByPriority(sessions);
  }

  // Group by tutor first, then sort within each tutor
  const byTutor = new Map<string, SessionCardData[]>();
  for (const s of sessions) {
    const tutor = s.tutorName || "";
    if (!byTutor.has(tutor)) byTutor.set(tutor, []);
    byTutor.get(tutor)!.push(s);
  }

  const tutorNames = [...byTutor.keys()].sort((a, b) =>
    getTutorSortName(a).localeCompare(getTutorSortName(b))
  );

  const sorted: SessionCardData[] = [];
  for (const tutor of tutorNames) {
    sorted.push(...sortByPriority(byTutor.get(tutor)!));
  }
  return sorted;
}

function sortByPriority(sessions: SessionCardData[]): SessionCardData[] {
  const scheduledSessions = sessions.filter(s => s.sessionStatus === "Scheduled");
  const gradeCounts = new Map<string, number>();
  scheduledSessions.forEach(s => {
    const key = `${s.grade || ""}${s.langStream || ""}`;
    gradeCounts.set(key, (gradeCounts.get(key) || 0) + 1);
  });
  const mainGroup = [...gradeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";

  return [...sessions].sort((a, b) => {
    const getPriority = (s: SessionCardData) => {
      const gradeKey = `${s.grade || ""}${s.langStream || ""}`;
      const isMainGroup = gradeKey === mainGroup && mainGroup !== "";
      const status = s.sessionStatus || "";
      if (status === "Trial Class") return 0;
      if (isMainGroup && status === "Scheduled") return 1;
      if (status === "Scheduled") return 3;
      if (status === "Make-up Class") return 5;
      return 10;
    };
    const priorityA = getPriority(a);
    const priorityB = getPriority(b);
    if (priorityA !== priorityB) return priorityA - priorityB;
    if (priorityA <= 2) {
      const schoolCompare = (a.school || "").localeCompare(b.school || "");
      if (schoolCompare !== 0) return schoolCompare;
    }
    return (a.schoolStudentId || "").localeCompare(b.schoolStudentId || "");
  });
}

// Unified card data interface
interface SessionCardData {
  sessionId: number;
  studentName: string;
  schoolStudentId?: string;
  grade?: string;
  langStream?: string;
  school?: string;
  timeSlot?: string;
  location?: string;
  sessionStatus: string;
  sessionDate?: string;
  tutorName?: string;
}

function sessionToCardData(s: Session): SessionCardData {
  return {
    sessionId: s.id,
    studentName: s.student_name || "Unknown",
    schoolStudentId: s.school_student_id,
    grade: s.grade,
    langStream: s.lang_stream,
    school: s.school,
    timeSlot: s.time_slot,
    location: s.location,
    sessionStatus: s.session_status,
    tutorName: s.tutor_name,
  };
}

function overdueToCardData(s: UncheckedAttendanceReminder): SessionCardData {
  return {
    sessionId: s.session_id,
    studentName: s.student_name,
    schoolStudentId: s.school_student_id,
    grade: s.grade,
    langStream: s.lang_stream,
    school: s.school,
    timeSlot: s.time_slot,
    location: s.location,
    sessionStatus: s.session_status,
    sessionDate: s.session_date,
    tutorName: s.tutor_name,
  };
}

// Haptic feedback helper
function haptic() {
  try { navigator?.vibrate?.(10); } catch { /* no-op */ }
}

export default function QuickAttendPage() {
  usePageTitle("Quick Attend");

  const { selectedLocation } = useLocation();
  const { viewMode } = useRole();
  const { user, isImpersonating, impersonatedTutor, effectiveRole } = useAuth();
  const { showToast } = useToast();

  const [cardStates, setCardStates] = useState<Record<number, CardStatus>>({});
  const [markingIds, setMarkingIds] = useState<Set<number>>(new Set());
  const [overdueExpanded, setOverdueExpanded] = useState(true);
  const [selectedTutorId, setSelectedTutorId] = useState<TutorValue>(ALL_TUTORS);

  // Session detail popover
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverLoading, setPopoverLoading] = useState(false);
  const [popoverSession, setPopoverSession] = useState<Session | null>(null);
  const [popoverClickPosition, setPopoverClickPosition] = useState<{ x: number; y: number } | null>(null);

  // Peek animation guard — only fire once per page load
  const peekDone = useRef(false);

  const effectiveLocation = useMemo(() => {
    return selectedLocation && selectedLocation !== "All Locations" ? selectedLocation : undefined;
  }, [selectedLocation]);

  const effectiveUserId = useMemo(() => {
    if (isImpersonating && effectiveRole === "Tutor" && impersonatedTutor?.id) return impersonatedTutor.id;
    return user?.id;
  }, [isImpersonating, effectiveRole, impersonatedTutor, user?.id]);

  const effectiveTutorId = useMemo(() => {
    if (isImpersonating && effectiveRole === "Tutor" && impersonatedTutor?.id) return impersonatedTutor.id;
    if (viewMode === "my-view" && effectiveUserId) return effectiveUserId;
    if (selectedTutorId === ALL_TUTORS) return undefined;
    if (typeof selectedTutorId === "number") return selectedTutorId;
    return undefined;
  }, [viewMode, effectiveUserId, isImpersonating, effectiveRole, impersonatedTutor?.id, selectedTutorId]);

  useEffect(() => {
    if (isImpersonating && effectiveRole === "Tutor" && impersonatedTutor?.id) {
      setSelectedTutorId(impersonatedTutor.id);
    } else if (viewMode === "my-view" && effectiveUserId) {
      setSelectedTutorId(effectiveUserId);
    } else if (viewMode === "center-view") {
      setSelectedTutorId(ALL_TUTORS);
    }
  }, [viewMode, effectiveUserId, isImpersonating, effectiveRole, impersonatedTutor?.id]);

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const { data: todaySessions = [], isLoading: loadingToday } = useSessions({
    date: today,
    status: "Scheduled,Make-up Class,Trial Class",
    ...(effectiveTutorId ? { tutor_id: effectiveTutorId } : {}),
    ...(effectiveLocation ? { location: effectiveLocation } : {}),
    limit: 200,
  });

  const { data: overdueSessions = [], isLoading: loadingOverdue, mutate: mutateOverdue } = useUncheckedAttendance(
    effectiveLocation,
    effectiveTutorId
  );

  const isLoading = loadingToday || loadingOverdue;

  // Snapshot: capture initial session data once so SWR refetches don't remove cards mid-session
  const [todaySnapshot, setTodaySnapshot] = useState<Session[]>([]);
  const [overdueSnapshot, setOverdueSnapshot] = useState<UncheckedAttendanceReminder[]>([]);
  const snapshotTaken = useRef(false);
  const hasRevalidated = useRef(false);

  // Reset snapshot when filters change so new sessions load
  useEffect(() => {
    snapshotTaken.current = false;
    hasRevalidated.current = false;
    peekDone.current = false;
    setCardStates({});
    setTodaySnapshot([]);
    setOverdueSnapshot([]);
  }, [effectiveLocation, effectiveTutorId]);

  useEffect(() => {
    if (!isLoading && !snapshotTaken.current && (todaySessions.length > 0 || overdueSessions.length > 0)) {
      setTodaySnapshot(todaySessions);
      setOverdueSnapshot(overdueSessions.filter((s) => s.session_date < today));
      snapshotTaken.current = true;
    }
  }, [isLoading, todaySessions, overdueSessions, today]);

  const isCenterView = viewMode === "center-view" && !(isImpersonating && effectiveRole === "Tutor");
  const isAllTutors = isCenterView && selectedTutorId === ALL_TUTORS;

  const todayGrouped = useMemo(() => {
    const visible = todaySnapshot.filter((s) => cardStates[s.id]?.state !== "done");
    const cardDataList = visible.map(sessionToCardData);
    const groups = new Map<string, SessionCardData[]>();
    for (const card of cardDataList) {
      const slot = card.timeSlot || "No time";
      if (!groups.has(slot)) groups.set(slot, []);
      groups.get(slot)!.push(card);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([slot, sessions]) => ({ timeSlot: slot, sessions: sortSessionsInGroup(sessions, isAllTutors) }));
  }, [todaySnapshot, cardStates, isAllTutors]);

  const visibleTodayCount = useMemo(() => {
    return todayGrouped.reduce((sum, g) => sum + g.sessions.length, 0);
  }, [todayGrouped]);

  const overdueByUrgency = useMemo(() => {
    const grouped: Record<string, UncheckedAttendanceReminder[]> = {};
    for (const level of URGENCY_ORDER) grouped[level] = [];
    for (const s of overdueSnapshot) {
      if (grouped[s.urgency_level]) grouped[s.urgency_level].push(s);
    }
    return grouped;
  }, [overdueSnapshot]);

  const visibleOverdueCount = useMemo(() => {
    return overdueSnapshot.filter((s) => cardStates[s.session_id]?.state !== "done").length;
  }, [overdueSnapshot, cardStates]);
  const totalPending = visibleTodayCount + visibleOverdueCount;
  const allDone = !isLoading && snapshotTaken.current && totalPending === 0;

  // Pending count for "X left" display — excludes "rating" sessions (already acted on)
  const pendingCount = useMemo(() => {
    const todayPending = todaySnapshot.filter(s => !cardStates[s.id]).length;
    const overduePending = overdueSnapshot.filter(s => !cardStates[s.session_id]).length;
    return todayPending + overduePending;
  }, [todaySnapshot, overdueSnapshot, cardStates]);

  // Revalidate SWR caches once when all sessions are processed
  useEffect(() => {
    if (allDone && Object.keys(cardStates).length > 0 && !hasRevalidated.current) {
      hasRevalidated.current = true;
      mutateOverdue();
    }
  }, [allDone, cardStates, mutateOverdue]);

  // Progress bar values — computed from snapshot totals
  const rawTotal = todaySnapshot.length + overdueSnapshot.length;
  const progressTotal = rawTotal || 1;

  // Count completed (done state)
  const completedCount = useMemo(() => {
    return Object.keys(cardStates).length;
  }, [cardStates]);

  // Completion summary counts
  const completionSummary = useMemo(() => {
    const states = Object.values(cardStates);
    return {
      attended: states.filter(s => s.state === "done" && s.action === "attended").length,
      noShow: states.filter(s => s.state === "done" && s.action === "no-show").length,
      rescheduled: states.filter(s => s.state === "done" && s.action === "rescheduled").length,
    };
  }, [cardStates]);

  const progressFraction = Math.min(completedCount / progressTotal, 1);

  // --- Action Handlers ---

  const handleUndo = useCallback(async (sessionId: number) => {
    try {
      const updatedSession = await sessionsAPI.undoStatus(sessionId);
      updateSessionInCache(updatedSession, { quiet: true });
      setCardStates((prev) => {
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
      if (updatedSession.undone_from_status) {
        const undoneFromStatus = updatedSession.undone_from_status;
        showToast(`Reverted to ${updatedSession.session_status}`, "success", {
          label: "Redo",
          onClick: async () => {
            try {
              const redone = await sessionsAPI.redoStatus(sessionId, undoneFromStatus);
              updateSessionInCache(redone, { quiet: true });
              setCardStates((prev) => ({ ...prev, [sessionId]: { state: "done", action: "attended" } }));
              showToast("Status restored", "success");
            } catch { showToast("Failed to restore status", "error"); }
          },
        });
      }
    } catch { showToast("Failed to undo", "error"); }
  }, [showToast]);

  const handleAttended = useCallback(async (sessionId: number) => {
    if (markingIds.has(sessionId)) return;
    haptic();
    setMarkingIds((prev) => new Set(prev).add(sessionId));
    try {
      const updated = await sessionsAPI.markAttended(sessionId);
      updateSessionInCache(updated, { quiet: true });
      setCardStates((prev) => ({ ...prev, [sessionId]: { state: "rating", action: "attended" } }));
      showToast("Marked as attended", "success", { label: "Undo", onClick: () => handleUndo(sessionId) });
    } catch { showToast("Failed to mark attendance", "error"); }
    finally { setMarkingIds((prev) => { const next = new Set(prev); next.delete(sessionId); return next; }); }
  }, [markingIds, showToast, handleUndo]);

  const handleNoShow = useCallback(async (sessionId: number) => {
    if (markingIds.has(sessionId)) return;
    haptic();
    setMarkingIds((prev) => new Set(prev).add(sessionId));
    try {
      const updated = await sessionsAPI.markNoShow(sessionId);
      updateSessionInCache(updated, { quiet: true });
      setCardStates((prev) => ({ ...prev, [sessionId]: { state: "done", action: "no-show" } }));
      showToast("Marked as no-show", "success", { label: "Undo", onClick: () => handleUndo(sessionId) });
    } catch { showToast("Failed to mark no-show", "error"); }
    finally { setMarkingIds((prev) => { const next = new Set(prev); next.delete(sessionId); return next; }); }
  }, [markingIds, showToast, handleUndo]);

  const handleReschedule = useCallback(async (sessionId: number) => {
    if (markingIds.has(sessionId)) return;
    haptic();
    setMarkingIds((prev) => new Set(prev).add(sessionId));
    try {
      const updated = await sessionsAPI.markRescheduled(sessionId);
      updateSessionInCache(updated, { quiet: true });
      setCardStates((prev) => ({ ...prev, [sessionId]: { state: "done", action: "rescheduled" } }));
      showToast("Session rescheduled", "success", { label: "Undo", onClick: () => handleUndo(sessionId) });
    } catch { showToast("Failed to reschedule", "error"); }
    finally { setMarkingIds((prev) => { const next = new Set(prev); next.delete(sessionId); return next; }); }
  }, [markingIds, showToast, handleUndo]);

  const handleRate = useCallback(async (sessionId: number, rating: number) => {
    const emoji = rating > 0 ? ratingToEmoji(rating) : null;
    try {
      const updated = await sessionsAPI.rateSession(sessionId, emoji, null);
      updateSessionInCache(updated, { quiet: true });
    } catch { /* Non-critical */ }
    setCardStates((prev) => ({ ...prev, [sessionId]: { state: "done", action: "attended" } }));
  }, []);

  const handleSkipRating = useCallback((sessionId: number) => {
    setCardStates((prev) => ({ ...prev, [sessionId]: { state: "done", action: "attended" } }));
  }, []);

  const handleCardClick = useCallback(async (sessionId: number, event: React.MouseEvent) => {
    event.preventDefault();
    setPopoverClickPosition({ x: event.clientX, y: event.clientY });
    setPopoverOpen(true);
    setPopoverLoading(true);
    setPopoverSession(null);
    try {
      const fullSession = await sessionsAPI.getById(sessionId);
      setPopoverSession(fullSession);
    } catch { setPopoverOpen(false); }
    finally { setPopoverLoading(false); }
  }, []);

  const closePopover = useCallback(() => {
    setPopoverOpen(false);
    setPopoverSession(null);
  }, []);

  return (
    <DeskSurface>
      <PageTransition>
        <div className="min-h-screen flex flex-col gap-4" style={{ width: '100%', maxWidth: '32rem', margin: '0 auto', padding: '1rem 0.75rem' }}>
          {/* Header card — paper surface for readability on desk */}
          <div className="bg-[#fef9f3] dark:bg-[#2d2618] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] overflow-hidden paper-texture">
            <div className="px-4 py-3 bg-[#f5ede3] dark:bg-[#3d3628] border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-bold text-[#5c3d2e] dark:text-[#e8d4b8]">Quick Attend</h1>
                  <p className="text-xs text-[#8b6f47] dark:text-[#a89070]">
                    {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                  </p>
                </div>
                <span className="text-2xl font-bold text-[#a0704b] dark:text-[#cd853f] tabular-nums">
                  {isLoading ? "—" : pendingCount}
                  <span className="text-xs font-medium ml-1 text-[#8b6f47] dark:text-[#a89070]">left</span>
                </span>
              </div>
            </div>

            {/* Progress bar — always rendered to prevent layout shift */}
            <div className="px-4 py-2.5">
              <div className="flex justify-between text-[10px] font-medium text-[#8b6f47] dark:text-[#a89070] mb-1">
                <span>{completedCount}/{progressTotal} done</span>
                <span>{Math.round(progressFraction * 100)}%</span>
              </div>
              <div className="h-1.5 bg-[#e8d4b8]/50 dark:bg-[#6b5a4a]/50 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{
                    width: `${progressFraction * 100}%`,
                    backgroundColor: progressFraction >= 1 ? "#22c55e" : progressFraction > 0.5 ? "#84cc16" : "#d97706",
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              </div>
            </div>

            {/* Tutor selector — inside header card */}
            {isCenterView && (
              <div className="px-4 py-2 border-t border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50">
                <TutorSelector value={selectedTutorId} onChange={setSelectedTutorId} location={effectiveLocation} showAllTutors />
              </div>
            )}
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[#a0704b]" />
            </div>
          )}

          {/* All caught up — celebration on paper card */}
          {allDone && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="bg-[#fef9f3] dark:bg-[#2d2618] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] paper-texture text-center py-10 px-4 space-y-4 relative overflow-hidden"
            >
              {completedCount > 0 && <Confetti />}
              <PartyPopper className="h-14 w-14 mx-auto text-amber-400" />
              <p className="text-lg font-semibold text-[#5c3d2e] dark:text-[#e8d4b8]">All caught up!</p>
              {completedCount > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-[#8b6f47] dark:text-[#a89070]">
                    You marked {completedCount} session{completedCount !== 1 ? "s" : ""} this visit
                  </p>
                  <div className="flex justify-center gap-4 text-xs text-[#8b6f47] dark:text-[#a89070]">
                    {completionSummary.attended > 0 && (
                      <span className="flex items-center gap-1">
                        <Check className="h-3 w-3 text-green-500" />
                        {completionSummary.attended} attended
                      </span>
                    )}
                    {completionSummary.noShow > 0 && (
                      <span className="flex items-center gap-1">
                        <X className="h-3 w-3 text-red-500" />
                        {completionSummary.noShow} no-show
                      </span>
                    )}
                    {completionSummary.rescheduled > 0 && (
                      <span className="flex items-center gap-1">
                        <CalendarClock className="h-3 w-3 text-orange-500" />
                        {completionSummary.rescheduled} rescheduled
                      </span>
                    )}
                  </div>
                  <Link
                    href="/sessions"
                    className="inline-flex items-center gap-1 mt-2 text-sm text-[#a0704b] dark:text-[#cd853f] hover:underline font-medium"
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    View Sessions
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-[#8b6f47] dark:text-[#a89070]">No sessions need attendance marking.</p>
              )}
            </motion.div>
          )}

          {/* Today's Sessions — grouped by time slot */}
          {!isLoading && visibleTodayCount > 0 && (
            <section className="space-y-3">
              <div className="inline-flex items-center px-2.5 py-1 rounded-lg bg-[#fef9f3]/90 dark:bg-[#2d2618]/90">
                <h2 className="text-xs font-semibold text-[#5c3d2e] dark:text-[#e8d4b8] uppercase tracking-wider">
                  Today ({visibleTodayCount})
                </h2>
              </div>
              {todayGrouped.map(({ timeSlot, sessions }, groupIdx) => (
                <div key={timeSlot} className="space-y-2">
                  <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded bg-[#f5ede3]/80 dark:bg-[#3d3628]/80 text-[#5c3d2e] dark:text-[#e8d4b8] ml-0.5">
                    {timeSlot}
                  </span>
                  <AnimatePresence mode="popLayout">
                    {sessions.map((card, cardIdx) => {
                      const status = cardStates[card.sessionId];
                      const prevCard = cardIdx > 0 ? sessions[cardIdx - 1] : null;
                      const isNewTutor = isAllTutors && prevCard && prevCard.tutorName !== card.tutorName;
                      if (status?.state === "rating") {
                        return (
                          <RatingStrip
                            key={`rating-${card.sessionId}`}
                            sessionId={card.sessionId}
                            studentName={card.studentName}
                            onRate={handleRate}
                            onSkipRating={handleSkipRating}
                          />
                        );
                      }
                      return (
                        <React.Fragment key={card.sessionId}>
                          {isNewTutor && (
                            <div className="border-t-2 border-dashed border-[#d4a574] dark:border-[#8b6f47] my-1" />
                          )}
                          <SessionCard
                            data={card}
                            showTutor={isCenterView}
                            showLocation={!effectiveLocation}
                            cardStatus={status}
                            isMarking={markingIds.has(card.sessionId)}
                            isFirst={groupIdx === 0 && cardIdx === 0 && !peekDone.current}
                            onAttended={handleAttended}
                            onNoShow={handleNoShow}
                            onReschedule={handleReschedule}
                            onCardClick={handleCardClick}
                            onPeek={() => { peekDone.current = true; }}
                          />
                        </React.Fragment>
                      );
                    })}
                  </AnimatePresence>
                </div>
              ))}
            </section>
          )}

          {/* Overdue Sessions */}
          {!isLoading && visibleOverdueCount > 0 && (
            <section className="space-y-3">
              <button onClick={() => setOverdueExpanded((v) => !v)} className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#fef9f3]/90 dark:bg-[#2d2618]/90">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                <h2 className="text-xs font-semibold text-[#5c3d2e] dark:text-[#e8d4b8] uppercase tracking-wider">
                  Overdue ({visibleOverdueCount})
                </h2>
                {overdueExpanded ? <ChevronUp className="h-3.5 w-3.5 text-[#5c3d2e] dark:text-[#e8d4b8]" /> : <ChevronDown className="h-3.5 w-3.5 text-[#5c3d2e] dark:text-[#e8d4b8]" />}
              </button>
              {overdueExpanded && (
                <div className="space-y-3">
                  {URGENCY_ORDER.map((level) => {
                    const sessions = overdueByUrgency[level];
                    const visible = sessions?.filter((s) => cardStates[s.session_id]?.state !== "done") || [];
                    if (visible.length === 0) return null;
                    const config = URGENCY_CONFIG[level];
                    return (
                      <div key={level} className="space-y-2">
                        <div className={cn("text-[11px] font-medium px-2 py-0.5 rounded inline-block", config.color, config.text)}>
                          {config.label} ({visible.length})
                        </div>
                        <AnimatePresence mode="popLayout">
                          {visible.map((s) => {
                            const status = cardStates[s.session_id];
                            if (status?.state === "rating") {
                              return (
                                <RatingStrip
                                  key={`rating-${s.session_id}`}
                                  sessionId={s.session_id}
                                  studentName={s.student_name}
                                  onRate={handleRate}
                                  onSkipRating={handleSkipRating}
                                />
                              );
                            }
                            return (
                              <SessionCard
                                key={s.session_id}
                                data={overdueToCardData(s)}
                                showTutor={isCenterView}
                                showLocation={!effectiveLocation}
                                cardStatus={status}
                                isMarking={markingIds.has(s.session_id)}
                                onAttended={handleAttended}
                                onNoShow={handleNoShow}
                                onReschedule={handleReschedule}
                                onCardClick={handleCardClick}
                              />
                            );
                          })}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>

        <SessionDetailPopover
          session={popoverSession}
          isOpen={popoverOpen}
          isLoading={popoverLoading}
          onClose={closePopover}
          clickPosition={popoverClickPosition}
        />
      </PageTransition>
    </DeskSurface>
  );
}

// --- Confetti celebration component ---
function Confetti() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
      {Array.from({ length: 12 }).map((_, i) => (
        <span
          key={i}
          className="absolute block rounded-sm animate-confetti"
          style={{
            width: `${6 + Math.random() * 6}px`,
            height: `${6 + Math.random() * 6}px`,
            left: `${10 + Math.random() * 80}%`,
            top: "-10%",
            backgroundColor: ["#f59e0b", "#22c55e", "#3b82f6", "#ef4444", "#a855f7", "#ec4899"][i % 6],
            animationDelay: `${Math.random() * 0.6}s`,
            animationDuration: `${1 + Math.random() * 0.8}s`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(300px) rotate(${360 + Math.random() * 360}deg); opacity: 0; }
        }
        .animate-confetti {
          animation: confetti-fall 1.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
}

// --- Rating Strip — slim inline row shown after attended swipe ---

function RatingStrip({ sessionId, studentName, onRate, onSkipRating }: {
  sessionId: number;
  studentName: string;
  onRate: (id: number, rating: number) => void;
  onSkipRating: (id: number) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ height: 0, marginBottom: 0, transition: { duration: 0.15 } }}
      transition={{ duration: 0.2 }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-green-200 dark:border-green-800 bg-green-50/80 dark:bg-green-900/10"
        onClick={(e) => e.stopPropagation()}
      >
        <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
        <span className="text-xs font-medium text-[#3d2b1f] dark:text-[#e8d4b8] truncate">
          {studentName}
        </span>
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          <StarRating rating={0} onChange={(r) => onRate(sessionId, r)} size="sm" />
          <button
            onClick={() => onSkipRating(sessionId)}
            className="text-[10px] text-[#a0704b]/60 hover:text-[#a0704b] dark:text-[#cd853f]/60 dark:hover:text-[#cd853f] transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// --- Session Card Component with Framer Motion drag ---

const SWIPE_THRESHOLD = 80; // px distance to trigger action
const SWIPE_VELOCITY = 400; // px/s velocity to trigger action (fast flick)

interface SessionCardProps {
  data: SessionCardData;
  showTutor: boolean;
  showLocation: boolean;
  cardStatus?: CardStatus;
  isMarking: boolean;
  isFirst?: boolean;
  onAttended: (id: number) => void;
  onNoShow: (id: number) => void;
  onReschedule: (id: number) => void;
  onCardClick: (id: number, event: React.MouseEvent) => void;
  onPeek?: () => void;
}

const SessionCard = React.memo(function SessionCard({
  data, showTutor, showLocation, cardStatus, isMarking, isFirst,
  onAttended, onNoShow, onReschedule, onCardClick, onPeek,
}: SessionCardProps) {
  const {
    sessionId, studentName, schoolStudentId, grade, langStream,
    school, timeSlot, location, sessionStatus, sessionDate, tutorName,
  } = data;
  const state = cardStatus?.state || "pending";
  const [dismissed, setDismissed] = useState(false);

  // Framer Motion drag values
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-150, 0, 150], [-6, 0, 6]);
  // Green tint (swipe right) and red tint (swipe left)
  const greenOverlay = useTransform(x, [0, 100], [0, 0.18]);
  const redOverlay = useTransform(x, [-100, 0], [0.18, 0]);
  // Ghost label opacity
  const rightLabelOpacity = useTransform(x, [20, 80], [0, 1]);
  const leftLabelOpacity = useTransform(x, [-80, -20], [1, 0]);

  const handleDragEnd = useCallback((_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    if (state !== "pending" || isMarking) return;
    const dist = info.offset.x;
    const vel = info.velocity.x;
    const shouldDismissRight = dist > SWIPE_THRESHOLD || vel > SWIPE_VELOCITY;
    const shouldDismissLeft = dist < -SWIPE_THRESHOLD || vel < -SWIPE_VELOCITY;

    if (shouldDismissRight) {
      setDismissed(true);
      animate(x, 500, { type: "spring", stiffness: 200, damping: 30 });
      haptic();
      onAttended(sessionId);
    } else if (shouldDismissLeft) {
      setDismissed(true);
      animate(x, -500, { type: "spring", stiffness: 200, damping: 30 });
      haptic();
      onNoShow(sessionId);
    } else {
      // Spring back
      animate(x, 0, { type: "spring", stiffness: 500, damping: 35 });
    }
  }, [state, isMarking, sessionId, onAttended, onNoShow, x]);

  // Peek animation on first card to hint at swipeability (fires once via page-level guard)
  useEffect(() => {
    if (!isFirst || state !== "pending") return;
    const timer = setTimeout(() => {
      onPeek?.();
      animate(x, 15, { type: "spring", stiffness: 600, damping: 15 });
      setTimeout(() => animate(x, 0, { type: "spring", stiffness: 400, damping: 20 }), 300);
    }, 600);
    return () => clearTimeout(timer);
  }, [isFirst, state, x, onPeek]);

  const canDrag = state === "pending" && !isMarking && !dismissed;

  return (
    <motion.div
      initial={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0, transition: { duration: 0.15 } }}
    >
      {/* Swipe action labels behind the card */}
      <div className="relative">
        {canDrag && (
          <div className="absolute inset-0 flex items-center justify-between px-6 pointer-events-none">
            <motion.span className="flex items-center gap-1.5 font-semibold text-green-600 dark:text-green-400 bg-green-100/90 dark:bg-green-900/60 px-2.5 py-1 rounded-lg" style={{ opacity: rightLabelOpacity }}>
              <Check className="h-5 w-5" /> Attended
            </motion.span>
            <motion.span className="flex items-center gap-1.5 font-semibold text-red-600 dark:text-red-400 bg-red-100/90 dark:bg-red-900/60 px-2.5 py-1 rounded-lg" style={{ opacity: leftLabelOpacity }}>
              No Show <X className="h-5 w-5" />
            </motion.span>
          </div>
        )}

        <motion.div
          drag={canDrag ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.5}
          onDragEnd={handleDragEnd}
          style={{
            x,
            rotate,
          }}
          whileTap={canDrag ? { scale: 0.98, cursor: "grabbing" } : undefined}
          className={cn(
            "relative rounded-xl border shadow-sm overflow-hidden",
            "bg-[#fef9f3] dark:bg-[#2d2618] border-[#e8d4b8] dark:border-[#6b5a4a]",
            canDrag && "cursor-grab touch-pan-y",
            !canDrag && state === "pending" && "cursor-pointer"
          )}
          onClick={(e) => { if (state === "pending" && !dismissed) onCardClick(sessionId, e); }}
        >
          {/* Green/red swipe overlay */}
          {canDrag && (
            <>
              <motion.div className="absolute inset-0 bg-green-400 rounded-xl pointer-events-none" style={{ opacity: greenOverlay }} />
              <motion.div className="absolute inset-0 bg-red-400 rounded-xl pointer-events-none" style={{ opacity: redOverlay }} />
            </>
          )}

          <div className="relative p-4 space-y-2">
            {/* Student info row */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {schoolStudentId && (
                <span className="text-xs font-mono text-[#8b6f47] dark:text-[#a89070]">
                  {showLocation && location ? `${location} ` : ""}{schoolStudentId}
                </span>
              )}
              <span className="font-semibold text-[#3d2b1f] dark:text-[#e8d4b8]">{studentName}</span>
              {grade && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium text-gray-800" style={{ backgroundColor: getGradeColor(grade, langStream) }}>
                  {grade}{langStream}
                </span>
              )}
              {school && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                  {school}
                </span>
              )}
              {sessionStatus !== "Scheduled" && (
                <SessionStatusTag status={sessionStatus} iconOnly size="sm" />
              )}
              <Link href={`/sessions/${sessionId}`} onClick={(e) => e.stopPropagation()} className="ml-auto text-[10px] text-[#a0704b]/60 hover:text-[#a0704b] dark:text-[#cd853f]/60 dark:hover:text-[#cd853f] transition-colors flex items-center gap-0.5">
                #{sessionId}
                <ExternalLink className="h-2.5 w-2.5" />
              </Link>
            </div>

            {/* Metadata row — only for overdue dates or tutor names */}
            {(sessionDate || (showTutor && tutorName)) && (
              <div className="flex items-center gap-3 text-xs text-[#8b6f47] dark:text-[#a89070]">
                {sessionDate && (
                  <span>
                    {new Date(sessionDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                )}
                {showTutor && tutorName && (
                  <span className="px-1.5 py-0.5 rounded bg-[#f5ede3] dark:bg-[#3d3628]">
                    {tutorName}
                  </span>
                )}
              </div>
            )}

            {/* Actions */}
            <AnimatePresence mode="wait">
              {state === "pending" && !dismissed && (
                <motion.div key="buttons" initial={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.15 }} className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => { haptic(); onAttended(sessionId); }}
                    disabled={isMarking}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg font-medium text-sm transition-colors",
                      "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
                      "hover:bg-green-200 dark:hover:bg-green-900/50 active:bg-green-300 dark:active:bg-green-800/50 disabled:opacity-50"
                    )}
                  >
                    {isMarking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Attended
                  </button>
                  <button
                    onClick={() => { haptic(); onNoShow(sessionId); }}
                    disabled={isMarking}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg font-medium text-sm transition-colors",
                      "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
                      "hover:bg-red-200 dark:hover:bg-red-900/50 active:bg-red-300 dark:active:bg-red-800/50 disabled:opacity-50"
                    )}
                  >
                    {isMarking ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                    No Show
                  </button>
                  <button
                    onClick={() => { haptic(); onReschedule(sessionId); }}
                    disabled={isMarking}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg font-medium text-sm transition-colors",
                      "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
                      "hover:bg-orange-200 dark:hover:bg-orange-900/50 active:bg-orange-300 dark:active:bg-orange-800/50 disabled:opacity-50"
                    )}
                  >
                    {isMarking ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                    Resched
                  </button>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
});
