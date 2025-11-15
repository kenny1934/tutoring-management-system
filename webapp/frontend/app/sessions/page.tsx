"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useLocation } from "@/contexts/LocationContext";
import { formatSessionDisplay } from "@/lib/formatters";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Session } from "@/types";
import { Calendar, Clock, MapPin, Filter, ChevronRight, ArrowRight } from "lucide-react";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition, IndexCard, StickyNote } from "@/lib/design-system";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ViewSwitcher, type ViewMode } from "@/components/sessions/ViewSwitcher";
import { WeeklyGridView } from "@/components/sessions/WeeklyGridView";
import { toDateString, getWeekBounds } from "@/lib/calendar-utils";

export default function SessionsPage() {
  const router = useRouter();
  const { selectedLocation } = useLocation();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [statusFilter, setStatusFilter] = useState("");
  const [flippingCardId, setFlippingCardId] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // Detect mobile device for performance optimization
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Handle card click with flip animation
  const handleCardClick = (sessionId: number) => {
    setFlippingCardId(sessionId);
    // Delay navigation to show flip animation
    setTimeout(() => {
      router.push(`/sessions/${sessionId}`);
    }, 400);
  };

  useEffect(() => {
    async function fetchSessions() {
      try {
        setLoading(true);

        // Prepare date filters based on view mode
        let filters: any = {
          location: selectedLocation !== "All Locations" ? selectedLocation : undefined,
          status: statusFilter || undefined,
          limit: 500,
        };

        if (viewMode === "list") {
          // For list view, fetch just the selected date
          filters.date = toDateString(selectedDate);
        } else if (viewMode === "weekly") {
          // For weekly view, fetch the entire week
          const { start, end } = getWeekBounds(selectedDate);
          filters.from_date = toDateString(start);
          filters.to_date = toDateString(end);
        }
        // For daily and monthly views (future implementation)

        const data = await api.sessions.getAll(filters);
        setSessions(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load sessions");
      } finally {
        setLoading(false);
      }
    }

    fetchSessions();
  }, [selectedDate, statusFilter, selectedLocation, viewMode]);

  // Group sessions by time slot
  const groupedSessions = useMemo(() => {
    const groups: Record<string, Session[]> = {};

    sessions.forEach((session) => {
      const timeSlot = session.time_slot || "Unscheduled";
      if (!groups[timeSlot]) {
        groups[timeSlot] = [];
      }
      groups[timeSlot].push(session);
    });

    // Sort time slots chronologically
    return Object.entries(groups).sort(([timeA], [timeB]) => {
      // Handle "Unscheduled" to appear last
      if (timeA === "Unscheduled") return 1;
      if (timeB === "Unscheduled") return -1;

      const startA = timeA.split("-")[0];
      const startB = timeB.split("-")[0];
      return startA.localeCompare(startB);
    });
  }, [sessions]);

  if (loading) {
    return (
      <DeskSurface>
        <PageTransition className="flex flex-col gap-6 p-4 sm:p-8">
          {/* Header Skeleton - Index card style */}
          <div className={cn(
            "h-32 bg-[#fef9f3] dark:bg-[#2d2618] rounded-lg animate-pulse border-4 border-[#d4a574] dark:border-[#8b6f47]",
            !isMobile && "paper-texture"
          )} />

          {/* Filters Skeleton */}
          <div className={cn(
            "h-24 bg-[#fef9f3] dark:bg-[#2d2618] rounded-lg animate-pulse border-2 border-[#e8d4b8] dark:border-[#6b5a4a]",
            !isMobile && "paper-texture"
          )} />

          {/* Sessions Skeleton - Index cards with paper shuffle animation */}
          <AnimatePresence mode="wait">
            {[1, 2, 3].map((i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -50, rotateY: -15 }}
                animate={{ opacity: 1, x: 0, rotateY: 0 }}
                transition={{
                  delay: i * 0.15,
                  duration: 0.5,
                  ease: [0.38, 1.21, 0.22, 1.00]
                }}
                className="space-y-3"
              >
                <div className={cn(
                  "h-16 bg-[#fef9f3] dark:bg-[#2d2618] rounded-lg animate-pulse border-2 border-[#d4a574] dark:border-[#8b6f47]",
                  !isMobile && "paper-texture"
                )} />
                {[1, 2, 3].map((j) => (
                  <div key={j} className={cn(
                    "h-24 bg-white dark:bg-[#1a1a1a] rounded animate-pulse border border-[#e8d4b8] dark:border-[#6b5a4a] ml-4",
                    !isMobile && "paper-texture"
                  )} />
                ))}
              </motion.div>
            ))}
          </AnimatePresence>
        </PageTransition>
      </DeskSurface>
    );
  }

  if (error) {
    return (
      <DeskSurface>
        <PageTransition className="flex h-full items-center justify-center p-8">
          <StickyNote variant="pink" size="lg" showTape={true}>
            <div className="text-center">
              <p className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">Oops!</p>
              <p className="text-sm text-gray-900 dark:text-gray-100">Error: {error}</p>
            </div>
          </StickyNote>
        </PageTransition>
      </DeskSurface>
    );
  }

  return (
    <DeskSurface>
      <PageTransition className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-8">
        {/* Cork Board Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: isMobile ? 0.3 : 0.5, ease: [0.38, 1.21, 0.22, 1.00] }}
          className="relative rounded-lg overflow-hidden desk-shadow-medium"
          style={{
            background: 'linear-gradient(135deg, #c19a6b 0%, #b8956a 50%, #a0826d 100%)',
            boxShadow: '0 8px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
          }}
        >
          {/* Cork texture - hidden on mobile for performance */}
          {!isMobile && (
            <div
              className="absolute inset-0 opacity-60"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='cork'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23cork)' opacity='0.4'/%3E%3C/svg%3E")`,
              }}
            />
          )}

          {/* Content */}
          <div className="relative p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
            <div className="flex items-center gap-4">
              {/* Pinned sticky note with title */}
              <motion.div
                initial={{ scale: 0, rotate: -5 }}
                animate={{ scale: 1, rotate: -2 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="relative"
              >
                <StickyNote variant="yellow" size="sm" showTape={false}>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    Class Schedule
                  </h1>
                </StickyNote>
                {/* Pushpin */}
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-red-500 shadow-md"
                  style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.3), inset 0 -1px 2px rgba(0,0,0,0.2)' }}
                />
              </motion.div>

              {/* Pinned info card */}
              <motion.div
                initial={{ scale: 0, rotate: 3 }}
                animate={{ scale: 1, rotate: 1 }}
                transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
                className="relative hidden sm:block"
              >
                <div className="bg-white dark:bg-gray-800 px-4 py-2 rounded shadow-md border border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-muted-foreground">
                    View and manage all tutoring sessions
                  </p>
                </div>
                {/* Pushpin */}
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-blue-500 shadow-md"
                  style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.3), inset 0 -1px 2px rgba(0,0,0,0.2)' }}
                />
              </motion.div>
            </div>

            {/* Session count badge */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.4, type: "spring", stiffness: 200 }}
              className="relative"
            >
              <div className="bg-amber-100 dark:bg-amber-900 text-amber-900 dark:text-amber-100 px-4 py-2 rounded-full border-2 border-amber-600 dark:border-amber-700 font-bold shadow-md">
                {sessions.length} sessions
              </div>
              {/* Pushpin */}
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-green-500 shadow-md"
                style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.3), inset 0 -1px 2px rgba(0,0,0,0.2)' }}
              />
            </motion.div>
          </div>
        </motion.div>

      {/* View Switcher */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: isMobile ? 0.3 : 0.5, duration: 0.4, ease: [0.38, 1.21, 0.22, 1.00] }}
        className="flex justify-center"
      >
        <ViewSwitcher currentView={viewMode} onViewChange={setViewMode} />
      </motion.div>

      {/* Filters - Desk Organizer Style (only show in list view) */}
      {viewMode === "list" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: isMobile ? 0.3 : 0.5, duration: 0.4, ease: [0.38, 1.21, 0.22, 1.00] }}
          className={cn(
            "relative bg-[#fef9f3] dark:bg-[#2d2618] border-4 border-[#d4a574] dark:border-[#8b6f47] rounded-lg p-4 sm:p-6 desk-shadow-low",
            !isMobile && "paper-texture"
          )}
          style={{ transform: isMobile ? 'none' : 'rotate(-0.2deg)' }}
        >
          <div className="flex flex-col sm:flex-row gap-6">
            {/* Date Picker - Calendar Pad Style */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="h-5 w-5 text-[#a0704b] dark:text-[#cd853f]" />
                <label className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                  Session Date
                </label>
              </div>
              <div className="relative">
                <input
                  type="date"
                  value={toDateString(selectedDate)}
                  onChange={(e) => setSelectedDate(new Date(e.target.value))}
                  className="w-full px-4 py-3 bg-white dark:bg-[#1a1a1a] border-2 border-[#e8d4b8] dark:border-[#6b5a4a] rounded-md focus:outline-none focus:ring-2 focus:ring-[#a0704b] dark:focus:ring-[#cd853f] text-gray-900 dark:text-gray-100 font-medium transition-all duration-200 hover:border-[#a0704b] dark:hover:border-[#cd853f]"
                  style={{
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                  }}
                />
              </div>
            </div>

            {/* Status Filter - Index Tab Style */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <Filter className="h-5 w-5 text-[#a0704b] dark:text-[#cd853f]" />
                <label className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                  Status Filter
                </label>
              </div>
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-4 py-3 bg-white dark:bg-[#1a1a1a] border-2 border-[#e8d4b8] dark:border-[#6b5a4a] rounded-md focus:outline-none focus:ring-2 focus:ring-[#a0704b] dark:focus:ring-[#cd853f] text-gray-900 dark:text-gray-100 font-medium appearance-none cursor-pointer transition-all duration-200 hover:border-[#a0704b] dark:hover:border-[#cd853f]"
                  style={{
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23a0704b' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 1rem center',
                  }}
                >
                  <option value="">All Statuses</option>
                  <option value="Scheduled">Scheduled</option>
                  <option value="Make-up Class">Make-up Class</option>
                  <option value="Cancelled">Cancelled</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
            </div>
          </div>

          {/* Paper clip decoration */}
          <div className="absolute -top-3 left-8 w-16 h-8 border-2 border-gray-400 dark:border-gray-500 rounded-full opacity-40"
            style={{ transform: 'rotate(-15deg)' }}
          />
        </motion.div>
      )}

      {/* Weekly Calendar View */}
      {viewMode === "weekly" && (
        <WeeklyGridView
          sessions={sessions}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          isMobile={isMobile}
        />
      )}

      {/* Daily View Placeholder */}
      {viewMode === "daily" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6, duration: 0.4, ease: [0.38, 1.21, 0.22, 1.00] }}
          className="flex justify-center py-12"
        >
          <StickyNote variant="yellow" size="lg" showTape={true} className="desk-shadow-medium">
            <div className="text-center">
              <Clock className="h-12 w-12 mx-auto mb-4 text-gray-700 dark:text-gray-300" />
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Daily View</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Coming soon...
              </p>
            </div>
          </StickyNote>
        </motion.div>
      )}

      {/* Monthly View Placeholder */}
      {viewMode === "monthly" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6, duration: 0.4, ease: [0.38, 1.21, 0.22, 1.00] }}
          className="flex justify-center py-12"
        >
          <StickyNote variant="blue" size="lg" showTape={true} className="desk-shadow-medium">
            <div className="text-center">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-700 dark:text-gray-300" />
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Monthly View</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Coming soon...
              </p>
            </div>
          </StickyNote>
        </motion.div>
      )}

      {/* List View: Grouped Sessions */}
      {viewMode === "list" && groupedSessions.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6, duration: 0.4, ease: [0.38, 1.21, 0.22, 1.00] }}
          className="flex justify-center py-12"
        >
          <StickyNote variant="blue" size="lg" showTape={true} className="desk-shadow-medium">
            <div className="text-center">
              <Clock className="h-12 w-12 mx-auto mb-4 text-gray-700 dark:text-gray-300" />
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">No sessions found</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Try selecting a different date or adjusting your filters
              </p>
            </div>
          </StickyNote>
        </motion.div>
      ) : viewMode === "list" ? (
        groupedSessions.map(([timeSlot, sessionsInSlot], groupIndex) => (
          <motion.div
            key={timeSlot}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.6 + groupIndex * 0.1,
              duration: 0.5,
              ease: [0.38, 1.21, 0.22, 1.00]
            }}
          >
            {/* Time Slot Header - Index Card Style */}
            <div
              className={cn(
                "relative bg-[#fef9f3] dark:bg-[#2d2618] border-l-4 border-[#a0704b] dark:border-[#cd853f] rounded-lg p-4 mb-4 desk-shadow-low",
                !isMobile && "paper-texture"
              )}
              style={{ transform: isMobile ? 'none' : 'rotate(-0.1deg)' }}
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                <div className="flex items-center gap-3">
                  <div className="bg-[#a0704b] dark:bg-[#cd853f] p-2 rounded-full">
                    <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">
                    {timeSlot}
                  </h3>
                </div>
                <div className="bg-amber-100 dark:bg-amber-900 text-amber-900 dark:text-amber-100 px-3 py-1 rounded-full border-2 border-amber-600 dark:border-amber-700 font-bold text-xs sm:text-sm">
                  {sessionsInSlot.length} session{sessionsInSlot.length !== 1 ? "s" : ""}
                </div>
              </div>
            </div>

            {/* Session Cards */}
            <div className="space-y-3 ml-0 sm:ml-4">
              {sessionsInSlot.map((session, sessionIndex) => {
                const isFlipping = flippingCardId === session.id;
                return (
                  <motion.div
                    key={session.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{
                      opacity: 1,
                      x: 0,
                      rotateY: isFlipping ? 90 : 0,
                      scale: isFlipping ? 0.95 : 1
                    }}
                    transition={{
                      delay: isMobile ? 0 : 0.7 + groupIndex * 0.1 + sessionIndex * 0.05,
                      duration: isFlipping ? 0.4 : 0.35,
                      ease: [0.38, 1.21, 0.22, 1.00]
                    }}
                    whileHover={!isMobile ? {
                      scale: 1.02,
                      y: -4,
                      transition: { duration: 0.2 }
                    } : {}}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleCardClick(session.id)}
                    className={cn(
                      "relative bg-white dark:bg-[#1a1a1a] border-2 border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg p-3 sm:p-4 cursor-pointer transition-all duration-200 hover:border-[#a0704b] dark:hover:border-[#cd853f]",
                      !isMobile && "paper-texture"
                    )}
                    style={{
                      transform: isMobile ? 'none' : `rotate(${sessionIndex % 2 === 0 ? -0.3 : 0.3}deg)`,
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                    }}
                  >
                  <div className="flex items-start justify-between gap-4">
                    {/* Left side - Session info */}
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-gray-900 dark:text-gray-100">
                          {formatSessionDisplay(session)}
                        </p>
                        <ArrowRight className="h-4 w-4 text-[#a0704b] dark:text-[#cd853f] flex-shrink-0" />
                      </div>

                      {session.attendance_status && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">Attendance:</span>
                          <StatusBadge status={session.attendance_status} />
                        </div>
                      )}

                      {session.notes && (
                        <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                          {session.notes}
                        </p>
                      )}
                    </div>

                    {/* Right side - Status badges */}
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <StatusBadge status={session.session_status} />

                      {session.financial_status && (
                        <StatusBadge status={session.financial_status} />
                      )}
                    </div>
                  </div>

                  {/* Paper corner fold effect - hidden on mobile for cleaner look */}
                  {!isMobile && (
                    <div className="absolute bottom-0 right-0 w-0 h-0 border-b-[20px] border-b-gray-200 dark:border-b-gray-700 border-l-[20px] border-l-transparent opacity-50" />
                  )}
                </motion.div>
                );
              })}
            </div>
          </motion.div>
        ))
      ) : null}

      {/* Quick Stats - Report Card Style (only show in list view) */}
      {viewMode === "list" && groupedSessions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: isMobile ? 0.4 : 0.8 + groupedSessions.length * 0.1,
            duration: isMobile ? 0.3 : 0.5,
            ease: [0.38, 1.21, 0.22, 1.00]
          }}
          className={cn(
            "relative bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/40 dark:to-yellow-950/40 border-4 border-amber-400 dark:border-amber-600 rounded-lg p-4 sm:p-6 desk-shadow-medium",
            !isMobile && "paper-texture"
          )}
          style={{ transform: isMobile ? 'none' : 'rotate(0.3deg)' }}
        >
          {/* Paper texture overlay - hidden on mobile */}
          {!isMobile && (
            <div
              className="absolute inset-0 opacity-10 pointer-events-none rounded-lg"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paper'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.04' numOctaves='5' /%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23paper)' opacity='0.5'/%3E%3C/svg%3E")`,
              }}
            />
          )}

          {/* Header */}
          <div className="relative mb-4 sm:mb-6">
            <h3 className="text-lg sm:text-xl font-bold text-amber-900 dark:text-amber-100 uppercase tracking-wide text-center">
              Session Summary
            </h3>
            <p className="text-center text-xs sm:text-sm text-amber-700 dark:text-amber-300 mt-1">
              {selectedDate.toLocaleDateString('en-US', {
                weekday: isMobile ? 'short' : 'long',
                year: 'numeric',
                month: isMobile ? 'short' : 'long',
                day: 'numeric'
              })}
            </p>
          </div>

          {/* Stats Grid */}
          <div className="relative grid gap-3 sm:gap-6 grid-cols-3">
            {/* Total Sessions */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: isMobile ? 0.5 : 0.9 + groupedSessions.length * 0.1, duration: 0.3 }}
              className="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 border-2 border-amber-300 dark:border-amber-700 text-center"
            >
              <p className="text-xs sm:text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1 sm:mb-2">
                Total
              </p>
              <p className="text-2xl sm:text-4xl font-bold text-[#a0704b] dark:text-[#cd853f]">
                {sessions.length}
              </p>
            </motion.div>

            {/* Time Slots */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: isMobile ? 0.55 : 0.95 + groupedSessions.length * 0.1, duration: 0.3 }}
              className="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 border-2 border-amber-300 dark:border-amber-700 text-center"
            >
              <p className="text-xs sm:text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1 sm:mb-2">
                Slots
              </p>
              <p className="text-2xl sm:text-4xl font-bold text-[#a0704b] dark:text-[#cd853f]">
                {groupedSessions.length}
              </p>
            </motion.div>

            {/* Average per Slot */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: isMobile ? 0.6 : 1.0 + groupedSessions.length * 0.1, duration: 0.3 }}
              className="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 border-2 border-amber-300 dark:border-amber-700 text-center"
            >
              <p className="text-xs sm:text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1 sm:mb-2">
                Average
              </p>
              <p className="text-2xl sm:text-4xl font-bold text-[#a0704b] dark:text-[#cd853f]">
                {(sessions.length / groupedSessions.length).toFixed(1)}
              </p>
            </motion.div>
          </div>

          {/* Corner fold */}
          <div className="absolute top-0 right-0 w-0 h-0 border-t-[30px] border-t-amber-600 dark:border-t-amber-700 border-l-[30px] border-l-transparent" />
        </motion.div>
      )}
      </PageTransition>
    </DeskSurface>
  );
}
