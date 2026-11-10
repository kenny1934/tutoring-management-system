"use client";

import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "@/contexts/LocationContext";
import { useRole } from "@/contexts/RoleContext";
import { useDashboardStats, useAllStudents, usePageTitle } from "@/lib/hooks";
import { TestCalendar } from "@/components/dashboard/TestCalendar";
import { TutorSelector, ALL_TUTORS, type TutorValue } from "@/components/selectors/TutorSelector";

// Lazy load chart components - Recharts adds ~30kb to bundle
const GradeDistributionChart = dynamic(
  () => import("@/components/dashboard/GradeDistributionChart").then(mod => mod.GradeDistributionChart),
  { ssr: false, loading: () => <NativeChartLoading kind="grade" /> }
);
const SchoolDistributionChart = dynamic(
  () => import("@/components/dashboard/SchoolDistributionChart").then(mod => mod.SchoolDistributionChart),
  { ssr: false, loading: () => <NativeChartLoading kind="school" /> }
);
import { TodaySessionsCard } from "@/components/dashboard/TodaySessionsCard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { PageSurface } from "@/components/layout/PageSurface";
import { PageTransition } from "@/lib/design-system";
import { LazySection } from "@/components/ui/lazy-section";
import { CompactErrorBoundary } from "@/components/ui/error-boundary";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { NativeChartLoading } from "@/components/design-preview/NativeChartLoading";
import { NativeDashboardCharts } from "@/components/design-preview/NativeDashboardCharts";
import { NativeDashboardPreview } from "@/components/design-preview/NativeDashboardPreview";
import previewStyles from "@/components/design-preview/NativePreview.module.css";
import { NativeRequestError } from "@/components/design-preview/NativeRequestError";
import { useNativePresentation } from "@/components/design-preview/useNativePresentation";
import { useNativeViewState } from "@/components/design-preview/NativeNavigationMemory";

export default function DashboardPage() {
  const nativeMode = useNativePresentation();
  const { user, impersonatedTutor, isGuest, canViewAdminPages } = useAuth();
  const { selectedLocation } = useLocation();
  const { viewMode } = useRole();
  const [isMobile, setIsMobile] = useState(false);

  // Determine effective tutor ID based on view mode and impersonation
  // When impersonating a specific tutor, use their ID
  // Otherwise, "my-view" shows only the logged-in tutor's data
  const effectiveTutorId = viewMode === 'my-view'
    ? impersonatedTutor?.id ?? user?.id
    : undefined;

  // Admin-only chart filter: narrows the analytics charts to a single tutor.
  // Hidden for non-admins and in my-view (where effectiveTutorId already filters).
  const showAdminTutorFilter = canViewAdminPages && viewMode !== 'my-view';
  const [chartTutorId, setChartTutorId] = useNativeViewState<TutorValue>("dashboard:chart-tutor", () => ALL_TUTORS);

  const { data: stats, isLoading, error, isValidating, mutate: retryStats } = useDashboardStats(selectedLocation, effectiveTutorId, !isGuest);

  // Fetch ALL students once (single cache key, shared across view modes)
  // This enables instant view switching - no API call needed when toggling views
  const {
    data: allStudents = [],
    isLoading: studentsLoading,
    error: studentsError,
    mutate: mutateStudents
  } = useAllStudents(selectedLocation);  // No tutorId - fetch all, filter client-side

  // Filter client-side based on view mode (instant, no API call)
  const filteredStudents = useMemo(() => {
    if (!effectiveTutorId) return allStudents;  // Center View: show all
    return allStudents.filter(s => s.tutor_id === effectiveTutorId);  // My View: filter by tutor
  }, [allStudents, effectiveTutorId]);

  // Additional admin-only narrowing for the analytics charts only.
  // The selector is hidden for non-admins / my-view, so chartTutorId never
  // moves off ALL_TUTORS in those cases — no need to check the gate here.
  const chartStudents = useMemo(() => {
    if (chartTutorId === ALL_TUTORS || chartTutorId === null) {
      return filteredStudents;
    }
    return filteredStudents.filter(s => s.tutor_id === chartTutorId);
  }, [filteredStudents, chartTutorId]);

  // Tutor scope to propagate when a chart slice is clicked. Admin selector
  // wins; otherwise fall back to my-view's effective tutor (own id, or
  // impersonated tutor for Super Admin). Undefined means "All", no filter.
  const adminPickedTutorId =
    showAdminTutorFilter && chartTutorId !== ALL_TUTORS && chartTutorId !== null
      ? chartTutorId
      : undefined;
  const chartTutorIdNumeric = adminPickedTutorId ?? effectiveTutorId;

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

  if (error && !nativeMode) {
    return (
      <PageSurface>
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
            <p className="text-sm text-red-600 dark:text-red-400">{error instanceof Error ? error.message : String(error)}</p>
          </div>
        </PageTransition>
      </PageSurface>
    );
  }

  return (
    <PageSurface>
      <NativeDashboardPreview>
      <PageTransition data-native-stack className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-6 xl:p-8 overflow-x-hidden">
        {error && <NativeRequestError label="Couldn’t load dashboard totals" retry={() => { void retryStats(); }} loading={isValidating} />}
        {/* Dashboard Header with branding, welcome, and quick links */}
        <motion.div
          data-native-layer="welcome"
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
          />
        </motion.div>

        {/* Today's Sessions + Test Calendar */}
        <div className="grid gap-4 md:grid-cols-2" role="region" aria-label="Today's schedule" data-native-flow="schedule">
          <motion.div
            data-native-layer="schedule"
            className="min-w-0"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.3, ease: "easeOut" }}
          >
            <CompactErrorBoundary>
              <TodaySessionsCard isMobile={isMobile} tutorId={effectiveTutorId} />
            </CompactErrorBoundary>
          </motion.div>
          <motion.div
            className="min-w-0"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.3, ease: "easeOut" }}
            id="tests-calendar"
            data-native-layer="tests"
            data-native-flow-enter
          >
            <CompactErrorBoundary>
              <TestCalendar isMobile={isMobile} />
            </CompactErrorBoundary>
          </motion.div>
        </div>

        <div data-native-flow="analytics" data-native-flow-enter className={previewStyles.analyticsGroup}>
        {/* Distribution Charts */}
        <NativeDashboardCharts
          isMobile={isMobile}
          filter={showAdminTutorFilter && (
            <div className={previewStyles.chartScope} role="group" aria-label="Chart tutor filter">
              <span className="text-xs text-ink-subtle max-sm:sr-only">Tutor</span>
              <TutorSelector
                value={chartTutorId}
                onChange={setChartTutorId}
                location={selectedLocation}
                showAllTutors
              />
            </div>
          )}
          grade={
            <LazySection fallback={<NativeChartLoading kind="grade" />}>
              <CompactErrorBoundary>
                <GradeDistributionChart
                  students={chartStudents}
                  isLoading={studentsLoading}
                  error={studentsError}
                  onRetry={mutateStudents}
                  tutorFilterId={chartTutorIdNumeric}
                />
              </CompactErrorBoundary>
            </LazySection>
          }
          school={
            <LazySection fallback={<NativeChartLoading kind="school" />}>
              <CompactErrorBoundary>
                <SchoolDistributionChart
                  students={chartStudents}
                  isLoading={studentsLoading}
                  error={studentsError}
                  onRetry={mutateStudents}
                  tutorFilterId={chartTutorIdNumeric}
                />
              </CompactErrorBoundary>
            </LazySection>
          }
        />

        </div>

        {/* Activity Feed (hidden for guests — endpoint is guest-blocked) */}
        {!isGuest && (
          <motion.div
            data-native-layer="activity"
            data-native-flow="activity"
            data-native-flow-enter
            data-native-depth-section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.3, ease: "easeOut" }}
            role="complementary"
            aria-label="Recent activity"
          >
            <CompactErrorBoundary>
              <ActivityFeed isMobile={isMobile} tutorId={effectiveTutorId} />
            </CompactErrorBoundary>
          </motion.div>
        )}
      </PageTransition>
      </NativeDashboardPreview>
    </PageSurface>
  );
}
