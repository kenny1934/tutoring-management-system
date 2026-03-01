"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "@/contexts/LocationContext";
import { useRole } from "@/contexts/RoleContext";
import { useDashboardStats, useAllStudents, usePageTitle } from "@/lib/hooks";
import { TestCalendar } from "@/components/dashboard/TestCalendar";

// Lazy load chart components - Recharts adds ~30kb to bundle
const GradeDistributionChart = dynamic(
  () => import("@/components/dashboard/GradeDistributionChart").then(mod => mod.GradeDistributionChart),
  { ssr: false, loading: () => <div className="h-64 shimmer-sepia rounded-lg" /> }
);
const SchoolDistributionChart = dynamic(
  () => import("@/components/dashboard/SchoolDistributionChart").then(mod => mod.SchoolDistributionChart),
  { ssr: false, loading: () => <div className="h-64 shimmer-sepia rounded-lg" /> }
);
import { TodaySessionsCard } from "@/components/dashboard/TodaySessionsCard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { LazySection } from "@/components/ui/lazy-section";
import { BinderClip, PaperClip, Pushpin } from "@/components/ui/stationery-accents";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const { user, impersonatedTutor } = useAuth();
  const { selectedLocation } = useLocation();
  const { viewMode } = useRole();
  const [isMobile, setIsMobile] = useState(false);

  // Determine effective tutor ID based on view mode and impersonation
  // When impersonating a specific tutor, use their ID
  // Otherwise, "my-view" shows only the logged-in tutor's data
  const effectiveTutorId = viewMode === 'my-view'
    ? impersonatedTutor?.id ?? user?.id
    : undefined;

  const { data: stats, isLoading, error } = useDashboardStats(selectedLocation, effectiveTutorId);

  // Fetch ALL students once (single cache key, shared across view modes)
  // This enables instant view switching - no API call needed when toggling views
  const {
    data: allStudents = [],
    isLoading: studentsLoading,
    error: studentsError,
    mutate: mutateStudents
  } = useAllStudents(selectedLocation);  // No tutorId - fetch all, filter client-side

  // Refresh state tracking
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Handle manual refresh - refresh all dashboard data
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await mutateStudents();
      setLastUpdated(new Date());
    } finally {
      setIsRefreshing(false);
    }
  }, [mutateStudents]);

  // Filter client-side based on view mode (instant, no API call)
  const filteredStudents = useMemo(() => {
    if (!effectiveTutorId) return allStudents;  // Center View: show all
    return allStudents.filter(s => s.tutor_id === effectiveTutorId);  // My View: filter by tutor
  }, [allStudents, effectiveTutorId]);

  usePageTitle("Dashboard");

  // Detect mobile device for performance optimization
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Note: We don't block on isLoading - let child components render and fetch data in parallel
  // This eliminates the waterfall pattern where stats had to complete before other fetches started

  if (error) {
    return (
      <DeskSurface>
        <PageTransition className="flex h-full items-center justify-center p-8">
          <div className={cn(
            "bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 p-8 text-center max-w-md",
            !isMobile && "paper-texture"
          )}>
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center">
              <span className="text-2xl">⚠️</span>
            </div>
            <p className="text-lg font-semibold text-red-700 dark:text-red-300 mb-2">
              Something went wrong
            </p>
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        </PageTransition>
      </DeskSurface>
    );
  }

  return (
    <DeskSurface>
      <PageTransition className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-8 overflow-x-hidden">
        {/* Dashboard Header with branding, welcome, and quick links */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <DashboardHeader
            userName={user?.name ?? "Guest"}
            location={selectedLocation}
            isMobile={isMobile}
            pendingPayments={stats?.pending_payment_enrollments ?? 0}
            stats={stats}
            isStatsLoading={isLoading}
            tutorId={effectiveTutorId}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            lastUpdated={lastUpdated}
          />
        </motion.div>

        {/* Today's Sessions + Test Calendar */}
        <div className="grid gap-4 md:grid-cols-2" role="region" aria-label="Today's schedule">
          <motion.div
            className="min-w-0"
            initial={{ opacity: 0, y: 16, rotate: isMobile ? 0 : -0.5 }}
            animate={{ opacity: 1, y: 0, rotate: isMobile ? 0 : -0.5 }}
            transition={{ delay: 0.15, duration: 0.3, ease: "easeOut" }}
          >
            <TodaySessionsCard isMobile={isMobile} tutorId={effectiveTutorId} />
          </motion.div>
          <motion.div
            className="min-w-0"
            initial={{ opacity: 0, y: 16, rotate: isMobile ? 0 : 0.7 }}
            animate={{ opacity: 1, y: 0, rotate: isMobile ? 0 : 0.7 }}
            transition={{ delay: 0.2, duration: 0.3, ease: "easeOut" }}
            id="tests-calendar"
          >
            <TestCalendar isMobile={isMobile} />
          </motion.div>
        </div>

        {/* Distribution Charts */}
        <div className="grid gap-4 md:grid-cols-2" role="region" aria-label="Student analytics">
          <motion.div
            initial={{ opacity: 0, y: 16, rotate: -0.3 }}
            animate={{ opacity: 1, y: 0, rotate: -0.3 }}
            whileHover={{ y: -2, rotate: -0.3, boxShadow: "0 8px 16px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.08)" }}
            transition={{ delay: 0.25, duration: 0.3, ease: "easeOut" }}
            className={cn(
              "relative min-w-0 bg-[#fef9f3] dark:bg-[#2d2618] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] p-4 sm:p-6",
              !isMobile && "paper-texture"
            )}
          >
            {/* Stationery accent */}
            <BinderClip size="sm" className="absolute -top-2 left-1/2 -translate-x-1/2 z-10" />
            <LazySection fallback={<div className="h-64 shimmer-sepia rounded-lg" />}>
              <GradeDistributionChart
                students={filteredStudents}
                isLoading={studentsLoading}
                error={studentsError}
                onRetry={mutateStudents}
              />
            </LazySection>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 16, rotate: 0.5 }}
            animate={{ opacity: 1, y: 0, rotate: 0.5 }}
            whileHover={{ y: -2, rotate: 0.5, boxShadow: "0 8px 16px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.08)" }}
            transition={{ delay: 0.3, duration: 0.3, ease: "easeOut" }}
            className={cn(
              "relative min-w-0 bg-[#fef9f3] dark:bg-[#2d2618] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] p-4 sm:p-6",
              !isMobile && "paper-texture"
            )}
          >
            {/* Stationery accent */}
            <PaperClip variant="gold" size="sm" className="absolute -top-1 right-4 z-10 rotate-12" />
            <LazySection fallback={<div className="h-64 shimmer-sepia rounded-lg" />}>
              <SchoolDistributionChart
                students={filteredStudents}
                isLoading={studentsLoading}
                error={studentsError}
                onRetry={mutateStudents}
              />
            </LazySection>
          </motion.div>
        </div>

        {/* Activity Feed */}
        <motion.div
          initial={{ opacity: 0, y: 16, rotate: -0.4 }}
          animate={{ opacity: 1, y: 0, rotate: -0.4 }}
          whileHover={{ y: -2, rotate: -0.4, boxShadow: "0 8px 16px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.08)" }}
          transition={{ delay: 0.35, duration: 0.3, ease: "easeOut" }}
          role="complementary"
          aria-label="Recent activity"
        >
          <ActivityFeed isMobile={isMobile} tutorId={effectiveTutorId} />
        </motion.div>
      </PageTransition>
    </DeskSurface>
  );
}
